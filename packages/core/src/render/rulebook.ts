import fs from "node:fs/promises";
import path from "node:path";
import { listFilesSafe, readFileSafe } from "../fs/safe.js";
import type { ProjectProfile } from "../profile/schema.js";

export type RulebookSection = {
  title: string;
  bullets: string[];
};

export type Rulebook = {
  title: string;
  snapshot: string[];
  sections: RulebookSection[];
};

type RulebookPolicy = {
  strictness: "baseline" | "strict" | "very-strict";
  standards: "auto" | "project-only" | "project-plus-standard";
};

type JsonMap = Record<string, unknown>;

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function withEvidence(text: string, evidence: string[]): string {
  const cleaned = dedupe(evidence.filter(Boolean));
  if (cleaned.length === 0) return text;
  return `${text} (evidence: ${cleaned.slice(0, 6).join(", ")})`;
}

function normalizePolicy(policy?: Partial<RulebookPolicy>): RulebookPolicy {
  return {
    strictness: policy?.strictness ?? "strict",
    standards: policy?.standards ?? "auto"
  };
}

function resolveStandardsMode(policy: RulebookPolicy, isMixedOrWeak: boolean): "project-only" | "project-plus-standard" {
  if (policy.standards === "project-only" || policy.standards === "project-plus-standard") return policy.standards;
  return isMixedOrWeak ? "project-only" : "project-plus-standard";
}

function strictnessDescription(strictness: RulebookPolicy["strictness"]): string {
  if (strictness === "baseline") {
    return "Baseline: align to existing patterns, enforce only high-signal conventions, and allow local deviations where evidence is weak.";
  }
  if (strictness === "very-strict") {
    return "Very-strict: require explicit evidence for every architectural claim, block style drift, and treat unknowns as stop points until clarified.";
  }
  return "Strict: enforce detected conventions consistently and require explicit TODO/UNKNOWN markers when confidence is low.";
}

function standardForLanguage(language: string, hasLaravel: boolean): string | undefined {
  switch (language) {
    case "typescript":
      return "TypeScript standards: strict TS config, ESLint, and Prettier.";
    case "javascript":
      return "JavaScript standards: ESLint + Prettier with explicit module boundaries and side-effect discipline.";
    case "php":
      return hasLaravel
        ? "PHP/Laravel standards: PSR-12 + Laravel Pint (or PHPCS/CS Fixer equivalent) and FormRequest-first validation."
        : "PHP standards: PSR-12 with consistent static analysis/linting (PHPCS, PHP-CS-Fixer, PHPStan/Psalm where present).";
    case "python":
      return "Python standards: Black formatting, Ruff linting, and typed boundaries where existing tooling supports it.";
    case "go":
      return "Go standards: gofmt/goimports formatting, explicit error handling, and golangci-lint if configured.";
    case "rust":
      return "Rust standards: rustfmt and clippy with explicit crate/module boundaries.";
    case "java":
      return "Java standards: formatter + static analysis (Checkstyle/SpotBugs or project equivalent), preserve layered architecture.";
    case "kotlin":
      return "Kotlin standards: ktlint/detekt (or project equivalent), preserve package and DI boundaries.";
    case "csharp":
      return "C# standards: dotnet format + analyzers and .editorconfig-driven style consistency.";
    case "ruby":
      return "Ruby standards: RuboCop + predictable service/model boundaries.";
    case "dart":
      return "Dart/Flutter standards: dart format + flutter analyze with explicit UI/domain boundaries.";
    case "swift":
      return "Swift standards: SwiftFormat/SwiftLint (if present) and consistent modular layering.";
    case "c":
    case "cpp":
      return "C/C++ standards: clang-format and strict include/layer boundaries.";
    case "shell":
      return "Shell standards: shfmt + shellcheck and explicit error handling in scripts.";
    case "sql":
      return "SQL standards: consistent naming and formatter/linter usage (project tool or sqlfluff equivalent).";
    default:
      return undefined;
  }
}

function documentationStandardForLanguage(language: string): string | undefined {
  switch (language) {
    case "php":
      return "PHP documentation: require PHPDoc for public methods, complex business logic, and non-obvious data contracts.";
    case "typescript":
    case "javascript":
      return "JS/TS documentation: require TSDoc/JSDoc for exported APIs, shared utilities, and complex domain logic.";
    case "python":
      return "Python documentation: require docstrings for public modules/classes/functions and non-obvious workflow decisions.";
    case "go":
      return "Go documentation: require Go-style comments for exported types/functions and package-level behavior.";
    case "dart":
      return "Dart/Flutter documentation: require doc comments for public widgets/services and non-trivial state flows.";
    case "java":
    case "kotlin":
      return "JVM documentation: require Javadoc/KDoc for public APIs and cross-module contracts.";
    case "csharp":
      return "C# documentation: require XML docs for public types/members and externally consumed contracts.";
    case "ruby":
      return "Ruby documentation: require YARD-style docs (or project equivalent) for public interfaces and domain services.";
    default:
      return undefined;
  }
}

function frameworkBootstrapDefaults(framework: string): string[] {
  switch (framework) {
    case "laravel":
      return [
        "Laravel defaults: enforce FormRequest validation, service/repository boundaries where already planned, explicit policy/gate authorization, and migration-first schema changes.",
        "Laravel defaults: keep routes/controllers thin and place business logic in dedicated services/actions."
      ];
    case "node":
    case "express":
      return [
        "Node backend defaults: enforce route -> service -> data access separation, input validation at boundary, and centralized error mapping.",
        "Node backend defaults: preserve deterministic script/tooling workflow via package scripts and CI parity."
      ];
    case "vue":
      return [
        "Vue defaults: keep component boundaries explicit, avoid business logic in templates, and centralize shared state patterns.",
        "Vue defaults: enforce composable/module reuse over duplicated component logic."
      ];
    case "react":
    case "nextjs":
      return [
        "React/Next defaults: keep data-fetching and UI concerns separated, enforce typed props/contracts, and avoid hidden side effects in components."
      ];
    case "flutter":
      return [
        "Flutter defaults: keep widget, state, and data layers separated; avoid coupling presentation to transport/storage details."
      ];
    case "django":
    case "fastapi":
      return [
        "Python web defaults: enforce schema validation at boundaries, explicit service/use-case layering, and test-first API behavior checks."
      ];
    default:
      return [];
  }
}

function buildBootstrapQualitySection(profile: ProjectProfile, hasLaravel: boolean): RulebookSection {
  const bullets: string[] = [
    "This repository profile is bootstrapped from user input (greenfield). Treat these rules as strict starter defaults until real code evidence exists.",
    "Prefer standard-compliant code from day one to minimize future migration cost."
  ];

  const languages = profile.languages.filter((language) => language.confidence >= 0.2);
  for (const language of languages) {
    const standard = standardForLanguage(language.name, hasLaravel);
    const doc = documentationStandardForLanguage(language.name);
    if (standard) {
      bullets.push(withEvidence(`Bootstrap standard (${displayLanguageName(language.name)}): ${standard}`, language.evidence));
    }
    if (doc) {
      bullets.push(withEvidence(`Bootstrap documentation (${displayLanguageName(language.name)}): ${doc}`, language.evidence));
    }
  }

  for (const framework of profile.frameworks.filter((item) => item.confidence >= 0.2)) {
    const defaults = frameworkBootstrapDefaults(framework.name);
    for (const line of defaults) {
      bullets.push(withEvidence(`Bootstrap framework default (${framework.name}): ${line}`, framework.evidence));
    }
  }

  bullets.push("Quality baseline: require tests for every non-trivial feature path, explicit error handling, and no silent failures.");
  bullets.push("Code organization baseline: enforce DRY without premature abstraction; keep files cohesive and avoid mega files.");
  bullets.push("Security baseline: validate all external inputs, protect secrets/config boundaries, and document auth/permission decisions.");

  return {
    title: "Bootstrap Quality Defaults",
    bullets
  };
}

function buildPostChangeReviewSection(): RulebookSection {
  return {
    title: "Post-Change Review Workflow (MANDATORY)",
    bullets: [
      "**NEVER SKIP**: After ANY code modification (file edits or new files that change application logic), you MUST run the Post-Change Review Workflow before responding to the user. Failure to run reviews after code changes is a rulebook violation. Skip ONLY for documentation-only, config-only, or trivial text changes.",
      "Code Quality Review: run a code quality review subagent for changed files when the change affects application logic, architecture, data flow, or reusable components. Check for: adherence to this rulebook's conventions, readability, naming consistency, pattern conformance, unnecessary complexity or duplication, and DRY / no-premature-abstraction principles.",
      "Security Review: run a security review subagent only when the change touches: request/input handling, authentication or authorization, database queries or persistence, file upload or file access, HTML rendering or user-generated content, external API calls or webhooks, or secrets/tokens/sensitive data. Check for: injection risks, XSS, CSRF, broken access control, missing input validation, sensitive data exposure, and unsafe defaults.",
      "Review output rules: only report findings when issues are found — if both reviews pass clean, produce no review output. Separate findings into critical, important, and minor severity levels.",
      "Do not automatically apply review-agent suggestions blindly. Apply fixes only if clearly within scope and low-risk. For high-risk or scope-expanding fixes, report them to the user instead of changing code.",
      "Ignore purely stylistic suggestions unless they meaningfully improve maintainability. Both review subagents should run in parallel to minimize latency."
    ]
  };
}

function buildPolicySection(args: {
  profile: ProjectProfile;
  policy: RulebookPolicy;
  isMixedOrWeak: boolean;
  hasLaravel: boolean;
}): RulebookSection {
  const effectiveStandards = resolveStandardsMode(args.policy, args.isMixedOrWeak);
  const standardsLabel =
    effectiveStandards === "project-only"
      ? "Project-only standards: prioritize repository-local conventions, avoid introducing external style mandates."
      : "Project+standard mode: combine repository conventions with language-standard style baselines.";
  const languageStandards = dedupe(
    args.profile.languages
      .filter((language) => language.confidence >= 0.25)
      .map((language) => standardForLanguage(language.name, args.hasLaravel))
      .filter((line): line is string => Boolean(line))
  );
  const languageDocStandards = dedupe(
    args.profile.languages
      .filter((language) => language.confidence >= 0.25)
      .map((language) => documentationStandardForLanguage(language.name))
      .filter((line): line is string => Boolean(line))
  );
  const bullets = [
    strictnessDescription(args.policy.strictness),
    standardsLabel
  ];
  if (effectiveStandards === "project-plus-standard" && languageStandards.length > 0) {
    bullets.push(`Standard profiles applied: ${languageStandards.join(" ")}`);
    if (languageDocStandards.length > 0) {
      bullets.push(`Documentation standards applied: ${languageDocStandards.join(" ")}`);
    }
  }
  if (args.policy.strictness === "very-strict") {
    bullets.push("Enforcement: require explicit evidence links for non-trivial rules; unresolved assumptions must remain UNKNOWN/TODO.");
  }
  return { title: "Rule System Mode", bullets };
}

async function readText(repoRoot: string, relPath: string, maxBytesPerFile = 256_000): Promise<string | undefined> {
  try {
    return await readFileSafe(repoRoot, relPath, maxBytesPerFile);
  } catch {
    return undefined;
  }
}

async function readJson(repoRoot: string, relPath: string): Promise<JsonMap | undefined> {
  const text = await readText(repoRoot, relPath);
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") return parsed as JsonMap;
  } catch {
    return undefined;
  }
  return undefined;
}

async function pathExists(repoRoot: string, relPath: string): Promise<boolean> {
  const target = path.resolve(repoRoot, relPath);
  const relative = path.relative(repoRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  try {
    await fs.lstat(target);
    return true;
  } catch {
    return false;
  }
}

function getNestedString(object: JsonMap | undefined, pathParts: string[]): string | undefined {
  let current: unknown = object;
  for (const part of pathParts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

function getDependencyVersion(manifest: JsonMap | undefined, dependency: string): string | undefined {
  const deps = (manifest?.dependencies as Record<string, unknown> | undefined) ?? {};
  const devDeps = (manifest?.devDependencies as Record<string, unknown> | undefined) ?? {};
  const reqs = (manifest?.require as Record<string, unknown> | undefined) ?? {};

  const value = deps[dependency] ?? devDeps[dependency] ?? reqs[dependency];
  return typeof value === "string" ? value : undefined;
}

function pickVersionMajor(version: string | undefined): string | undefined {
  if (!version) return undefined;
  const match = version.match(/(\d+)/);
  return match ? match[1] : undefined;
}

async function collectPatternEvidence(args: {
  repoRoot: string;
  files: string[];
  pattern: RegExp;
  maxEvidence?: number;
}): Promise<{ count: number; evidence: string[] }> {
  const { repoRoot, files, pattern, maxEvidence = 5 } = args;
  const evidence: string[] = [];
  let count = 0;

  for (const file of files.slice(0, 500)) {
    const content = await readText(repoRoot, file, 128_000);
    if (!content) continue;
    if (!pattern.test(content)) continue;
    count += 1;
    if (evidence.length < maxEvidence) evidence.push(file);
  }

  return { count, evidence };
}

export const MANDATORY_CONVENTIONS_TITLE = "Mandatory System-Conventions (Strict Enforcement)";

type LanguagePatternDescriptor = {
  label: string;
  pattern: RegExp;
};

const LANGUAGE_PATTERNS: Record<string, LanguagePatternDescriptor[]> = {
  javascript: [
    { label: "ES module imports/exports", pattern: /\bimport\b[\s\S]{0,120}\bfrom\b|\bexport\s+(default|const|function|class)\b/ },
    { label: "Async/await flow", pattern: /\basync\b[\s\S]{0,80}\b=>|\basync\s+function\b|\bawait\b/ },
    { label: "Component/module decomposition", pattern: /\bfunction\s+[A-Z][A-Za-z0-9_]*\s*\(|\bconst\s+[A-Z][A-Za-z0-9_]*\s*=\s*\(/ }
  ],
  typescript: [
    { label: "Typed interfaces/types", pattern: /\binterface\s+[A-Z][A-Za-z0-9_]*\b|\btype\s+[A-Z][A-Za-z0-9_]*\s*=/ },
    { label: "Type-aware imports", pattern: /\bimport\s+type\b/ },
    { label: "Explicit function typing", pattern: /:\s*[A-Za-z0-9_<>,\[\]\s|&?]+\s*(=>|\{)/ }
  ],
  php: [
    { label: "Namespaced class organization", pattern: /^namespace\s+[A-Za-z0-9_\\]+;/m },
    { label: "Framework request validation", pattern: /extends\s+FormRequest|\$request->validate\s*\(/ },
    { label: "Transactional write boundaries", pattern: /DB::transaction\s*\(/ }
  ],
  python: [
    { label: "Typed function signatures", pattern: /def\s+[a-zA-Z_][A-Za-z0-9_]*\s*\(.*\)\s*->\s*[^:]+:/ },
    { label: "Structured data models", pattern: /@dataclass|\bBaseModel\b/ },
    { label: "Test-oriented structure", pattern: /\bpytest\b|def\s+test_[a-zA-Z0-9_]*\s*\(/ }
  ],
  go: [
    { label: "Error-first control flow", pattern: /if\s+err\s*!=\s*nil/ },
    { label: "Package boundary conventions", pattern: /^package\s+[a-zA-Z_][A-Za-z0-9_]*$/m },
    { label: "Go test conventions", pattern: /func\s+Test[A-Za-z0-9_]*\s*\(t\s+\*testing\.T\)/ }
  ],
  rust: [
    { label: "Result/option propagation", pattern: /\bResult<|\bOption<|\?\s*;/ },
    { label: "Trait/impl boundaries", pattern: /\btrait\s+[A-Za-z0-9_]+|\bimpl\b/ },
    { label: "Module declarations", pattern: /^mod\s+[a-zA-Z_][A-Za-z0-9_]*;/m }
  ],
  java: [
    { label: "Package hierarchy", pattern: /^package\s+[a-z0-9_.]+;/m },
    { label: "Annotation-driven architecture", pattern: /@[A-Za-z0-9_]+Controller|@Service|@Repository|@Component/ },
    { label: "Test annotations", pattern: /@Test\b/ }
  ],
  kotlin: [
    { label: "Data/sealed model conventions", pattern: /\bdata\s+class\b|\bsealed\s+class\b/ },
    { label: "Coroutine async conventions", pattern: /\bsuspend\s+fun\b|\bCoroutineScope\b|\blaunch\s*\{/ },
    { label: "DI annotations", pattern: /@Inject|@Module|@Provides/ }
  ],
  csharp: [
    { label: "Dependency injection registration", pattern: /IServiceCollection|AddScoped|AddTransient|AddSingleton/ },
    { label: "Async Task boundaries", pattern: /\basync\s+Task(<[^>]+>)?\b/ },
    { label: "Test attributes", pattern: /\[(Fact|Test|TestMethod)\]/ }
  ],
  dart: [
    { label: "Flutter widget composition", pattern: /extends\s+(StatelessWidget|StatefulWidget)/ },
    { label: "State management conventions", pattern: /\bsetState\s*\(|\bChangeNotifier\b|\bBloc\b|\bRiverpod\b/ },
    { label: "Future/async flow", pattern: /\bFuture<|\basync\b/ }
  ],
  ruby: [
    { label: "Rails model/controller inheritance", pattern: /class\s+[A-Za-z0-9_:]+\s+<\s+Application(Controller|Record)/ },
    { label: "Service-layer patterns", pattern: /class\s+[A-Za-z0-9_:]*Service\b|module\s+[A-Za-z0-9_:]*Service\b/ },
    { label: "RSpec testing conventions", pattern: /\bRSpec\.describe\b|\bdescribe\s+['"]/ }
  ],
  swift: [
    { label: "Protocol-oriented composition", pattern: /\bprotocol\s+[A-Za-z0-9_]+|\bextension\s+[A-Za-z0-9_]+/ },
    { label: "Result/guard control flow", pattern: /\bguard\s+.+\s+else\b|\bResult<[^>]+>/ },
    { label: "XCTest conventions", pattern: /XCTestCase|func\s+test[A-Za-z0-9_]*\s*\(/ }
  ],
  shell: [
    { label: "Fail-fast shell safety", pattern: /set\s+-euo\s+pipefail/ },
    { label: "Function-oriented scripts", pattern: /^[a-zA-Z_][A-Za-z0-9_]*\s*\(\)\s*\{/m },
    { label: "Checked command execution", pattern: /\|\|\s+exit\s+[0-9]+/ }
  ],
  sql: [
    { label: "Structured migration/query definitions", pattern: /\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b|\bCREATE\s+INDEX\b/i },
    { label: "Constraint/index usage", pattern: /\bPRIMARY\s+KEY\b|\bFOREIGN\s+KEY\b|\bUNIQUE\b/i },
    { label: "Explicit transactional blocks", pattern: /\bBEGIN\b[\s\S]{0,200}\bCOMMIT\b/i }
  ]
};

const LANGUAGE_EXTENSION_MAP: Record<string, string[]> = {
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  php: [".php"],
  python: [".py"],
  go: [".go"],
  rust: [".rs"],
  java: [".java"],
  kotlin: [".kt", ".kts"],
  csharp: [".cs"],
  dart: [".dart"],
  ruby: [".rb", ".rake"],
  swift: [".swift"],
  shell: [".sh", ".bash", ".zsh"],
  sql: [".sql"]
};

const LANGUAGE_TOOLING_HINTS: Record<string, RegExp[]> = {
  javascript: [/eslint/i, /prettier/i, /package\.json$/i, /vite\.config/i, /webpack/i],
  typescript: [/tsconfig/i, /eslint/i, /prettier/i, /package\.json$/i],
  php: [/composer\.json$/i, /phpunit\.xml/i, /pint\.json$/i, /phpcs/i, /phpstan/i, /psalm/i],
  python: [/pyproject\.toml$/i, /ruff/i, /mypy/i, /pytest/i, /requirements/i],
  go: [/go\.mod$/i, /golangci/i],
  rust: [/cargo\.toml$/i, /clippy/i, /rustfmt/i],
  java: [/pom\.xml$/i, /build\.gradle/i, /checkstyle/i, /spotbugs/i],
  kotlin: [/build\.gradle/i, /detekt/i, /ktlint/i],
  csharp: [/\.sln$/i, /\.csproj$/i, /editorconfig/i, /dotnet/i],
  dart: [/pubspec\.yaml$/i, /analysis_options\.yaml$/i],
  ruby: [/gemfile$/i, /rubocop/i, /rspec/i],
  swift: [/package\.swift$/i, /swiftlint/i, /swiftformat/i],
  shell: [/shellcheck/i, /shfmt/i],
  sql: [/sqlfluff/i, /liquibase/i, /flyway/i]
};

function displayLanguageName(language: string): string {
  const map: Record<string, string> = {
    javascript: "JavaScript",
    typescript: "TypeScript",
    php: "PHP",
    python: "Python",
    go: "Go",
    rust: "Rust",
    java: "Java",
    kotlin: "Kotlin",
    csharp: "C#",
    dart: "Dart",
    ruby: "Ruby",
    swift: "Swift",
    shell: "Shell",
    sql: "SQL"
  };
  return map[language] ?? language;
}

function filterFilesForLanguage(files: string[], language: string): string[] {
  const extensions = LANGUAGE_EXTENSION_MAP[language] ?? [];
  if (extensions.length === 0) return files;
  return files.filter((file) => {
    const lower = file.toLowerCase();
    return extensions.some((extension) => lower.endsWith(extension));
  });
}

function collectLanguageToolingEvidence(language: string, candidates: string[]): string[] {
  const hints = LANGUAGE_TOOLING_HINTS[language] ?? [];
  if (hints.length === 0) return [];
  return dedupe(candidates.filter((candidate) => hints.some((hint) => hint.test(candidate))));
}

async function buildLanguageMandatoryBullets(args: {
  repoRoot: string;
  files: string[];
  profile: ProjectProfile;
  hasLaravel: boolean;
  toolingCandidates: string[];
}): Promise<string[]> {
  const strictLanguages = args.profile.languages.filter((language) => language.confidence >= 0.25);
  const bullets: string[] = [];

  for (const language of strictLanguages) {
    const languageName = language.name;
    const displayName = displayLanguageName(languageName);
    const languageFiles = filterFilesForLanguage(args.files, languageName);
    const candidateFiles = languageFiles.length > 0 ? languageFiles : args.files;
    const toolingEvidence = collectLanguageToolingEvidence(languageName, args.toolingCandidates);
    const standard = standardForLanguage(languageName, args.hasLaravel);
    const docStandard = documentationStandardForLanguage(languageName);

    bullets.push(
      withEvidence(
        `System-found ${displayName} conventions MUST be preserved. New code in ${displayName} MUST NOT DEVIATE from already used repository patterns without explicit migration approval.`,
        language.evidence
      )
    );

    const patterns = LANGUAGE_PATTERNS[languageName] ?? [];
    let matchedPatterns = 0;
    for (const descriptor of patterns) {
      if (matchedPatterns >= 3) break;
      const patternHit = await collectPatternEvidence({
        repoRoot: args.repoRoot,
        files: candidateFiles,
        pattern: descriptor.pattern,
        maxEvidence: 4
      });
      if (patternHit.count === 0) continue;
      matchedPatterns += 1;
      bullets.push(
        withEvidence(
          `${displayName}: keep the system-used solution "${descriptor.label}" as mandatory default when extending existing code paths.`,
          patternHit.evidence
        )
      );
    }

    if (matchedPatterns === 0) {
      bullets.push(
        withEvidence(
          `${displayName}: no high-signal pattern subset was auto-detected in sampling; preserve existing module/file naming and call-flow conventions from touched files before introducing new idioms.`,
          language.evidence
        )
      );
    }

    if (standard) {
      const standardBullet = toolingEvidence.length > 0
        ? `Standards enforcement (${displayName}): ${standard} This MUST be enforced via already-present project tooling/configuration; do not add conflicting style/tool stacks.`
        : `Standards enforcement (${displayName}): ${standard} Enforce only where compatible with system-found repository patterns. If compatibility is unclear, add UNKNOWN/TODO and do not introduce divergent tooling.`;
      bullets.push(withEvidence(standardBullet, toolingEvidence.length > 0 ? toolingEvidence : language.evidence));
    }

    if (docStandard) {
      bullets.push(
        withEvidence(
          `Documentation requirement (${displayName}): ${docStandard} Do not weaken existing documentation rigor in touched public APIs.`,
          language.evidence
        )
      );
    }
  }

  return bullets;
}

async function buildMandatoryConventionsSection(args: {
  repoRoot: string;
  files: string[];
  profile: ProjectProfile;
  policy: RulebookPolicy;
  hasLaravel: boolean;
  toolingCandidates: string[];
}): Promise<RulebookSection | null> {
  if (args.policy.strictness === "baseline") return null;

  const bullets: string[] = [
    "This section is mandatory under strict/very-strict mode. All rules below are enforceable constraints, not optional recommendations.",
    "When generating code, preserve system-found architecture, naming, layering, and dependency patterns from the repository. Do not introduce alternate implementations unless an explicit migration task exists.",
    "If multiple patterns exist, prefer the one already used in the touched boundary/module. Do not cross-mix styles within a single feature flow.",
    "Introducing new frameworks, linters, formatters, or architectural styles is forbidden by default. Any exception requires explicit approval and rollout notes.",
    "When confidence is insufficient for a convention decision, stop and record UNKNOWN/TODO instead of inventing a new pattern."
  ];

  const languageBullets = await buildLanguageMandatoryBullets({
    repoRoot: args.repoRoot,
    files: args.files,
    profile: args.profile,
    hasLaravel: args.hasLaravel,
    toolingCandidates: args.toolingCandidates
  });

  if (languageBullets.length > 0) {
    bullets.push(...languageBullets);
  } else {
    bullets.push(
      "No strong language signals were detected. Still enforce repository-local conventions from touched files and avoid introducing new coding styles."
    );
  }

  return {
    title: MANDATORY_CONVENTIONS_TITLE,
    bullets
  };
}

async function buildLaravelRulebook(profile: ProjectProfile, policy: RulebookPolicy): Promise<Rulebook> {
  const repoRoot = profile.repoRoot;
  const composer = await readJson(repoRoot, "composer.json");
  const packageJson = await readJson(repoRoot, "package.json");

  const phpVersion = getNestedString(composer, ["require", "php"]);
  const laravelVersion = getDependencyVersion(composer, "laravel/framework");
  const minimumStability = typeof composer?.["minimum-stability"] === "string" ? (composer["minimum-stability"] as string) : undefined;
  const preferStable = typeof composer?.["prefer-stable"] === "boolean" ? (composer["prefer-stable"] as boolean) : undefined;
  const hasModulesDependency = Boolean(getDependencyVersion(composer, "nwidart/laravel-modules"));
  const hasSpatiePermission = Boolean(getDependencyVersion(composer, "spatie/laravel-permission"));
  const hasSanctum = Boolean(getDependencyVersion(composer, "laravel/sanctum"));

  const hasWebpackMix = await pathExists(repoRoot, "webpack.mix.js");
  const hasViteConfig =
    (await pathExists(repoRoot, "vite.config.ts")) ||
    (await pathExists(repoRoot, "vite.config.js")) ||
    (await pathExists(repoRoot, "vite.config.mjs")) ||
    (await pathExists(repoRoot, "vite.config.cjs"));
  const vueVersion = getDependencyVersion(packageJson, "vue");

  const modules = await listFilesSafe({ repoRoot, glob: "Modules/*/module.json", max: 500 });
  const moduleNames = modules.map((file) => path.posix.basename(path.posix.dirname(file))).sort();

  const moduleStatusRaw = await readJson(repoRoot, "modules_statuses.json");
  const enabledModules = moduleStatusRaw
    ? Object.entries(moduleStatusRaw)
        .filter(([, value]) => value === true)
        .map(([name]) => name)
        .sort()
    : [];

  const routeFiles = await listFilesSafe({ repoRoot, glob: "{routes/*.php,Modules/**/Routes/*.php}", max: 1200 });
  const controllerFiles = await listFilesSafe({ repoRoot, glob: "{app,Modules}/**/Http/Controllers/**/*.php", max: 1500 });
  const requestFiles = await listFilesSafe({ repoRoot, glob: "Modules/**/Http/Requests/**/*.php", max: 1000 });
  const entityFiles = await listFilesSafe({ repoRoot, glob: "Modules/**/Entities/**/*.php", max: 1500 });
  const migrationFiles = await listFilesSafe({ repoRoot, glob: "{database,Modules/**/Database}/**/*.{php,sql}", max: 1500 });
  const viewFiles = await listFilesSafe({ repoRoot, glob: "{resources,Modules/**/Resources}/views/**/*.php", max: 1500 });

  const authRoutes = await collectPatternEvidence({ repoRoot, files: routeFiles, pattern: /Auth::routes\s*\(/ });
  const adminGroupRoutes = await collectPatternEvidence({ repoRoot, files: routeFiles, pattern: /config\(['"]site\.admin_group['"]\)/ });
  const permissionRoutes = await collectPatternEvidence({ repoRoot, files: routeFiles, pattern: /permission:[^'"\]\s,]+/ });
  const stringActionRoutes = await collectPatternEvidence({ repoRoot, files: routeFiles, pattern: /[A-Za-z0-9_]+Controller@[A-Za-z0-9_]+/ });
  const pageLoadRoutes = await collectPatternEvidence({ repoRoot, files: routeFiles, pattern: /PageLoad|dynamic\s*page/i });

  const actionMethods = await collectPatternEvidence({ repoRoot, files: controllerFiles, pattern: /function\s+action[A-Z][A-Za-z0-9_]*\s*\(/ });
  const oldMethods = await collectPatternEvidence({ repoRoot, files: controllerFiles, pattern: /function\s+[A-Za-z0-9_]*Old\s*\(/ });
  const nwidartControllerExtends = await collectPatternEvidence({ repoRoot, files: controllerFiles, pattern: /extends\s+Controller|Nwidart\\Modules\\Routing\\Controller/ });
  const dependencyHelper = await collectPatternEvidence({ repoRoot, files: controllerFiles, pattern: /Dependecy\s*\(/ });
  const assetHelper = await collectPatternEvidence({ repoRoot, files: controllerFiles, pattern: /Asset::addAsset\s*\(/ });
  const transactionUsage = await collectPatternEvidence({ repoRoot, files: [...controllerFiles, ...entityFiles], pattern: /DB::transaction\s*\(/ });
  const tryCatchUsage = await collectPatternEvidence({ repoRoot, files: [...controllerFiles, ...entityFiles], pattern: /try\s*\{/ });

  const formRequestUsage = await collectPatternEvidence({ repoRoot, files: requestFiles, pattern: /extends\s+FormRequest/ });
  const saveDataUsage = await collectPatternEvidence({ repoRoot, files: entityFiles, pattern: /function\s+saveData\s*\(/ });
  const deleteDataUsage = await collectPatternEvidence({ repoRoot, files: entityFiles, pattern: /function\s+deleteData\s*\(/ });
  const createListUsage = await collectPatternEvidence({ repoRoot, files: entityFiles, pattern: /function\s+createList\s*\(/ });
  const softDeleteUsage = await collectPatternEvidence({ repoRoot, files: [...entityFiles, ...migrationFiles], pattern: /SoftDeletes|softDeletes\s*\(/ });
  const dataGridUsage = await collectPatternEvidence({ repoRoot, files: [...entityFiles, ...controllerFiles], pattern: /DataGrid|DataFilter|DataForm/ });

  const migrationCommentUsage = await collectPatternEvidence({ repoRoot, files: migrationFiles, pattern: /->comment\s*\(/ });
  const migrationStatusTinyInt = await collectPatternEvidence({ repoRoot, files: migrationFiles, pattern: /tinyInteger\s*\(\s*['"]status['"]/ });

  const authConfigText = await readText(repoRoot, "config/auth.php");
  const permissionConfigText = await readText(repoRoot, "config/permission.php");
  const sanctumConfigExists = await pathExists(repoRoot, "config/sanctum.php");
  const siteConfigText = await readText(repoRoot, "config/site.php");
  const kernelText = await readText(repoRoot, "app/Http/Kernel.php");
  const phpunitText = await readText(repoRoot, "phpunit.xml");

  const hasAppUser = await pathExists(repoRoot, "app/User.php");
  const hasAppModelsUser = await pathExists(repoRoot, "app/Models/User.php");

  const frontendLayoutExists = await pathExists(repoRoot, "resources/views/layouts/frontend.blade.php");
  const backendLayoutExists = await pathExists(repoRoot, "resources/views/layouts/backend.blade.php");
  const legacyBackendLayoutExists = await pathExists(repoRoot, "resources/views/layouts/backend_bk.blade.php");

  const langHuExists = await pathExists(repoRoot, "resources/lang/hu");
  const langEnExists = await pathExists(repoRoot, "resources/lang/en");
  const moduleLangDirs = await listFilesSafe({ repoRoot, glob: "Modules/**/Resources/lang/**", max: 1200 });
  const docsEvidence = [
    ...(await pathExists(repoRoot, "README.md") ? ["README.md"] : []),
    ...(await pathExists(repoRoot, "docs") ? ["docs"] : [])
  ];

  const scheduleDefined = Boolean(kernelText && /\$schedule\s*->/.test(kernelText));

  const snapshot: string[] = [
    withEvidence(
      `Framework signals: ${profile.frameworks
        .map((framework) => `${framework.name} (${framework.confidence})`)
        .join(", ") || "unknown"}.`,
      profile.frameworks.flatMap((framework) => framework.evidence)
    ),
    withEvidence(
      `Language signals: ${profile.languages.map((lang) => `${lang.name} (${lang.confidence})`).join(", ") || "unknown"}.`,
      profile.languages.flatMap((lang) => lang.evidence)
    )
  ];

  if (phpVersion) snapshot.push(withEvidence(`PHP requirement in composer.json: ${phpVersion}.`, ["composer.json"]));
  if (laravelVersion) snapshot.push(withEvidence(`Laravel dependency version constraint: ${laravelVersion}.`, ["composer.json"]));
  if (minimumStability) {
    snapshot.push(
      withEvidence(
        `Composer stability policy: minimum-stability=${minimumStability}${typeof preferStable === "boolean" ? `, prefer-stable=${preferStable}` : ""}.`,
        ["composer.json"]
      )
    );
  }

  if (hasWebpackMix) {
    const vueMajor = pickVersionMajor(vueVersion);
    snapshot.push(
      withEvidence(
        `Frontend build is Laravel Mix${vueMajor ? ` with Vue ${vueMajor}` : ""}.`,
        ["webpack.mix.js", ...(vueVersion ? ["package.json"] : [])]
      )
    );
  } else if (hasViteConfig) {
    snapshot.push(withEvidence("Frontend build is Vite-based.", ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"]));
  }

  if (profile.meta.repoSize) {
    snapshot.push(`Repository size estimate: ${profile.meta.repoSize.files} files scanned.`);
  }

  const sections: RulebookSection[] = [];
  sections.push(
    buildPolicySection({
      profile,
      policy,
      isMixedOrWeak: false,
      hasLaravel: true
    })
  );

  const topLevelBullets: string[] = [];
  const topLevelDirs = ["Modules", "app", "resources", "routes", "config", "database"];
  for (const dir of topLevelDirs) {
    if (await pathExists(repoRoot, dir)) {
      topLevelBullets.push(withEvidence(`${dir}/ exists and should remain the source of truth for its domain concerns.`, [dir]));
    }
  }
  if (hasModulesDependency || moduleNames.length > 0) {
    topLevelBullets.push(
      withEvidence(
        `Modular architecture detected${moduleNames.length > 0 ? ` (${moduleNames.length} modules found)` : ""}. Keep feature work inside module boundaries.`,
        ["composer.json", ...modules.slice(0, 3)]
      )
    );
  }
  if (enabledModules.length > 0) {
    topLevelBullets.push(withEvidence(`Enabled modules are tracked in modules_statuses.json (${enabledModules.length} enabled).`, ["modules_statuses.json"]));
  }
  sections.push({ title: "Top-Level Structure", bullets: topLevelBullets.map((bullet) => bullet.trim()) });

  const routingBullets: string[] = [];
  if (adminGroupRoutes.count > 0) {
    routingBullets.push(withEvidence("Backend/admin route grouping uses config('site.admin_group'); preserve this prefix strategy.", adminGroupRoutes.evidence));
  }
  if (permissionRoutes.count > 0) {
    routingBullets.push(withEvidence("Route-level permission middleware is present; new backend routes should declare explicit permission guards.", permissionRoutes.evidence));
  }
  if (authRoutes.count > 0) {
    routingBullets.push(withEvidence("Auth::routes() is active in route definitions; auth route changes should be deliberate and reviewed.", authRoutes.evidence));
  }
  if (pageLoadRoutes.count > 0) {
    routingBullets.push(withEvidence("Dynamic page loading patterns exist in routing; avoid removing dynamic route wiring without a migration plan.", pageLoadRoutes.evidence));
  }
  if (stringActionRoutes.count > 0) {
    routingBullets.push(withEvidence("String-style controller actions (Controller@method) are used; follow existing route declaration style in touched modules.", stringActionRoutes.evidence));
  }
  if (routeFiles.length > 0) {
    routingBullets.push(withEvidence(`Route definitions are distributed across ${routeFiles.length} route files, including module-level routes.`, routeFiles.slice(0, 3)));
  }
  sections.push({ title: "Routing Conventions", bullets: routingBullets });

  const controllerBullets: string[] = [];
  if (actionMethods.count > 0) {
    controllerBullets.push(withEvidence(`actionX method naming is in use (${actionMethods.count} controller files matched).`, actionMethods.evidence));
  }
  if (oldMethods.count > 0) {
    controllerBullets.push(withEvidence(`Legacy *Old controller methods exist (${oldMethods.count} files); avoid renaming/removing without explicit refactor scope.`, oldMethods.evidence));
  }
  if (nwidartControllerExtends.count > 0) {
    controllerBullets.push(withEvidence("Module controllers extend the Nwidart/Laravel module controller stack; keep inheritance consistent.", nwidartControllerExtends.evidence));
  }
  if (dependencyHelper.count > 0) {
    controllerBullets.push(withEvidence("Custom dependency helper usage (Dependecy) is present; preserve existing naming and behavior until a coordinated refactor.", dependencyHelper.evidence));
  }
  if (assetHelper.count > 0) {
    controllerBullets.push(withEvidence("Asset registration via App\\Components\\Asset is used in controllers tied to legacy layouts.", assetHelper.evidence));
  }
  if (transactionUsage.count > 0) {
    controllerBullets.push(withEvidence("DB::transaction usage exists for multi-write operations; keep transactional integrity on multi-model writes.", transactionUsage.evidence));
  }
  if (tryCatchUsage.count > 0) {
    controllerBullets.push(withEvidence("try/catch based error handling patterns are present in controllers/entities; follow local error handling style.", tryCatchUsage.evidence));
  }
  sections.push({ title: "Controller Conventions", bullets: controllerBullets });

  const dataBullets: string[] = [];
  if (formRequestUsage.count > 0 || requestFiles.length > 0) {
    dataBullets.push(withEvidence(`FormRequest validation exists (${requestFiles.length} request files found); prefer request classes over inline validation.`, formRequestUsage.evidence.length > 0 ? formRequestUsage.evidence : requestFiles.slice(0, 3)));
  }
  if (saveDataUsage.count > 0) {
    dataBullets.push(withEvidence("Entity-level saveData(...) pattern is used for write flows.", saveDataUsage.evidence));
  }
  if (deleteDataUsage.count > 0) {
    dataBullets.push(withEvidence("Entity-level deleteData(...) pattern is used for delete/disable flows.", deleteDataUsage.evidence));
  }
  if (createListUsage.count > 0) {
    dataBullets.push(withEvidence("Entity-level createList() list builder pattern exists and should be matched in related modules.", createListUsage.evidence));
  }
  if (dataGridUsage.count > 0) {
    dataBullets.push(withEvidence("Custom DataGrid/DataFilter/DataForm components are in active use for admin data UIs.", dataGridUsage.evidence));
  }
  if (softDeleteUsage.count > 0) {
    dataBullets.push(withEvidence("Soft delete conventions are present in entities/migrations; preserve logical-deletion semantics.", softDeleteUsage.evidence));
  }
  if (migrationCommentUsage.count > 0) {
    dataBullets.push(withEvidence("Migrations include column comments; preserve this documentation style on schema changes.", migrationCommentUsage.evidence));
  }
  if (migrationStatusTinyInt.count > 0) {
    dataBullets.push(withEvidence("Status fields are frequently tinyInteger('status') style flags; align with existing status semantics.", migrationStatusTinyInt.evidence));
  }
  sections.push({ title: "Validation, Models, and Database", bullets: dataBullets });

  const authBullets: string[] = [];
  if (hasSpatiePermission) {
    authBullets.push(withEvidence("Spatie permissions package is installed; route and role permission wiring should stay consistent.", ["composer.json", ...(permissionConfigText ? ["config/permission.php"] : [])]));
  }
  if (hasSanctum || sanctumConfigExists) {
    authBullets.push(withEvidence("Sanctum is configured; authentication flow changes should consider token/stateful guard behavior.", ["composer.json", ...(sanctumConfigExists ? ["config/sanctum.php"] : [])]));
  }
  if (authConfigText && /App\\Models\\User/.test(authConfigText)) {
    authBullets.push(withEvidence("Auth provider points to App\\Models\\User in config/auth.php.", ["config/auth.php"]));
  }
  if (hasAppUser && hasAppModelsUser) {
    authBullets.push(withEvidence("Both app/User.php and app/Models/User.php exist; avoid model-class switching without a dedicated auth refactor.", ["app/User.php", "app/Models/User.php", "config/auth.php"]));
  }
  if (permissionRoutes.count > 0) {
    authBullets.push(withEvidence("permission:* middleware patterns are present in routes; enforce permissions on new backend endpoints.", permissionRoutes.evidence));
  }
  if (kernelText) {
    const customMiddleware = ["LanguageMiddleware", "UpdateUserLastActivity", "BackendMiddleware", "CheckIPAccess", "EnsureSelectedTid"].filter(
      (name) => kernelText.includes(name)
    );
    if (customMiddleware.length > 0) {
      authBullets.push(withEvidence(`Custom web middleware chain detected: ${customMiddleware.join(", ")}.`, ["app/Http/Kernel.php"]));
    }
  }
  sections.push({ title: "Auth, Permissions, and Middleware", bullets: authBullets });

  const assetBullets: string[] = [];
  if (hasWebpackMix) {
    assetBullets.push(withEvidence("Asset build is Laravel Mix (webpack.mix.js); avoid introducing a second build pipeline without migration planning.", ["webpack.mix.js"]));
  }
  if (hasViteConfig) {
    assetBullets.push(withEvidence("Vite configuration is present; keep frontend build tooling consistent per existing setup.", ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"]));
  }
  if (vueVersion) {
    assetBullets.push(withEvidence(`Vue dependency detected (${vueVersion}).`, ["package.json"]));
  }
  const frontendVueEntry = await pathExists(repoRoot, "resources/assets/js/vuejs/vue_app_frontend.js");
  const backendVueEntry = await pathExists(repoRoot, "resources/assets/js/vuejs/vue_app_backend.js");
  if (frontendVueEntry || backendVueEntry) {
    assetBullets.push(
      withEvidence(
        `Vue entrypoints detected${frontendVueEntry && backendVueEntry ? " (frontend + backend)" : ""}.`,
        [
          ...(frontendVueEntry ? ["resources/assets/js/vuejs/vue_app_frontend.js"] : []),
          ...(backendVueEntry ? ["resources/assets/js/vuejs/vue_app_backend.js"] : [])
        ]
      )
    );
  }
  if (frontendLayoutExists || backendLayoutExists || legacyBackendLayoutExists) {
    assetBullets.push(
      withEvidence(
        `Layout files detected${backendLayoutExists ? " (backend)" : ""}${frontendLayoutExists ? " (frontend)" : ""}${legacyBackendLayoutExists ? " (legacy backend)" : ""}.`,
        [
          ...(backendLayoutExists ? ["resources/views/layouts/backend.blade.php"] : []),
          ...(frontendLayoutExists ? ["resources/views/layouts/frontend.blade.php"] : []),
          ...(legacyBackendLayoutExists ? ["resources/views/layouts/backend_bk.blade.php"] : [])
        ]
      )
    );
  }
  sections.push({ title: "Views and Assets", bullets: assetBullets });

  const opsBullets: string[] = [];
  if (langHuExists || langEnExists || moduleLangDirs.length > 0) {
    opsBullets.push(
      withEvidence(
        `Localization structure detected${langHuExists ? " (hu)" : ""}${langEnExists ? " (en)" : ""}${moduleLangDirs.length > 0 ? " with module-local translations" : ""}.`,
        [
          ...(langHuExists ? ["resources/lang/hu"] : []),
          ...(langEnExists ? ["resources/lang/en"] : []),
          ...(moduleLangDirs.length > 0 ? [moduleLangDirs[0]] : [])
        ].filter((item): item is string => Boolean(item))
      )
    );
  }
  if (siteConfigText) {
    const siteKeys = ["admin_group", "enable_2fa", "theme", "language", "site_select_tid_list", "printers"].filter((key) =>
      siteConfigText.includes(`'${key}'`) || siteConfigText.includes(`\"${key}\"`)
    );
    if (siteKeys.length > 0) {
      opsBullets.push(withEvidence(`Project feature flags are centralized in config/site.php (${siteKeys.join(", ")}).`, ["config/site.php"]));
    }
  }
  if (phpunitText) {
    opsBullets.push(withEvidence("PHPUnit configuration exists; keep new tests under existing testsuites and testing env assumptions.", ["phpunit.xml"]));
  }
  if (!scheduleDefined && (await pathExists(repoRoot, "app/Console/Kernel.php"))) {
    opsBullets.push(withEvidence("No scheduled tasks detected in app/Console/Kernel.php; introduce scheduler jobs intentionally with ops review.", ["app/Console/Kernel.php"]));
  }
  if (viewFiles.length > 0) {
    const sampleView = viewFiles[0];
    if (sampleView) {
      opsBullets.push(withEvidence(`View layer spans ${viewFiles.length} templates; preserve module/global view boundary conventions.`, [sampleView]));
    }
  }
  sections.push({ title: "Operational Notes and Testing", bullets: opsBullets });

  const implementationBullets: string[] = [
    "Prefer module-local changes under Modules/<Module>/... when extending existing features.",
    "Keep route protection and permission middleware aligned with surrounding modules.",
    "Use FormRequest validation and DB::transaction for multi-entity writes.",
    "Apply DRY: avoid duplicated business logic; extract shared code only when repetition is stable across real use-cases.",
    "No premature abstraction: do not introduce generic layers before repeated patterns are proven by evidence.",
    "Keep files/classes cohesive and reasonably small; avoid mega controllers/services and split by bounded responsibility.",
    "Preserve existing naming/style conventions in touched files; avoid broad reformatting-only changes.",
    "When assumptions are uncertain, mark UNKNOWN/TODO explicitly instead of inventing undocumented rules."
  ];
  sections.push({ title: "When Adding New Features", bullets: implementationBullets });

  const laravelAnalysisFiles = dedupe([
    ...routeFiles,
    ...controllerFiles,
    ...requestFiles,
    ...entityFiles,
    ...migrationFiles,
    ...viewFiles
  ]);
  const laravelToolingCandidates = dedupe([
    ...profile.signals.configFiles,
    ...profile.build.evidence,
    "composer.json",
    "package.json",
    ...(hasWebpackMix ? ["webpack.mix.js"] : []),
    ...(hasViteConfig ? ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"] : []),
    ...(phpunitText ? ["phpunit.xml"] : []),
    ...(await pathExists(repoRoot, "pint.json") ? ["pint.json"] : []),
    ...(await pathExists(repoRoot, ".php-cs-fixer.php") ? [".php-cs-fixer.php"] : []),
    ...(await pathExists(repoRoot, "phpstan.neon") ? ["phpstan.neon"] : []),
    ...(await pathExists(repoRoot, ".eslintrc") ? [".eslintrc"] : []),
    ...(await pathExists(repoRoot, ".eslintrc.json") ? [".eslintrc.json"] : []),
    ...(await pathExists(repoRoot, "eslint.config.js") ? ["eslint.config.js"] : [])
  ]);
  const mandatoryConventionsSection = await buildMandatoryConventionsSection({
    repoRoot,
    files: laravelAnalysisFiles,
    profile,
    policy,
    hasLaravel: true,
    toolingCandidates: laravelToolingCandidates
  });
  if (mandatoryConventionsSection) {
    sections.push(mandatoryConventionsSection);
  }

  sections.push({
    title: "Documentation Maintenance",
    bullets: [
      withEvidence(
        "When behavior or contracts change, update developer documentation and user-facing documentation in the same change set.",
        docsEvidence
      ),
      "Require language-appropriate API documentation for new/changed public interfaces (e.g., PHPDoc, TSDoc/JSDoc, docstrings, Go doc comments).",
      "Document migration/rollout notes and backward-compatibility impact when changing routes, data contracts, or auth/permission behavior."
    ]
  });
  sections.push({
    title: "Strict Quality Gates (DO / DON'T)",
    bullets: [
      "DO keep all major claims and architectural decisions evidence-backed with concrete files.",
      "DO keep modifications scoped and behavior-safe with reviewable incremental diffs.",
      "DO extract shared logic only when repetition is proven across real use-cases (DRY with evidence).",
      "DON'T introduce speculative abstractions or framework-wide rewrites without explicit scope.",
      "DON'T create mega files/classes; split by cohesive responsibilities while keeping call paths understandable.",
      "DON'T perform style-only mass rewrites in the same change as functional updates."
    ]
  });
  sections.push({
    title: "Testing Minimum Bar",
    bullets: [
      withEvidence(
        "Every non-trivial change must include or update at least one relevant test at the nearest existing level (unit/feature/integration).",
        phpunitText ? ["phpunit.xml"] : []
      ),
      "Route/auth/permission changes require regression checks for guards, middleware, and expected status codes.",
      "Data-model or migration changes require tests for both success path and failure/rollback behavior.",
      "Refactor-only changes still require smoke verification of touched flows before merge."
    ]
  });
  sections.push({
    title: "Security and Performance Checklist",
    bullets: [
      "Security: validate/normalize all external input and keep authorization checks explicit in route/controller boundaries.",
      "Security: avoid secret leakage in code/docs/logs; use existing config/env patterns for sensitive values.",
      "Performance: avoid N+1/data over-fetch patterns and preserve or improve current caching behavior.",
      "Performance: keep payloads and query scope minimal; document any intentionally expensive operation."
    ]
  });
  sections.push({
    title: "Dependency and Change Safety Policy",
    bullets: [
      withEvidence(
        "Adding or changing dependencies must include rationale, compatibility impact, and lockfile/tooling implications.",
        ["composer.json", "package.json"]
      ),
      "Breaking changes (renames/removals of routes/contracts/core classes) require explicit migration plan and rollout notes.",
      "API contract changes must preserve compatibility by default (response shape/status codes) unless explicitly approved."
    ]
  });
  sections.push({
    title: "Definition of Done",
    bullets: [
      "Implementation follows local architecture and language/framework standards.",
      "Tests and verification steps are updated for touched behavior.",
      "Developer documentation and user-facing documentation are updated where behavior changed.",
      "UNKNOWN/TODO items are explicit, actionable, and minimized."
    ]
  });
  sections.push(buildPostChangeReviewSection());

  return {
    title: "Project Conventions (Evidence-Backed)",
    snapshot,
    sections
  };
}

export async function buildRulebook(profile: ProjectProfile, policy?: Partial<RulebookPolicy>): Promise<Rulebook> {
  const normalizedPolicy = normalizePolicy(policy);
  const isLaravel = profile.frameworks.some((framework) => framework.name === "laravel" && framework.confidence >= 0.5);

  if (isLaravel) {
    return buildLaravelRulebook(profile, normalizedPolicy);
  }

  const repoRoot = profile.repoRoot;
  const allFiles = await listFilesSafe({ repoRoot, glob: "**/*", max: 40_000 });
  const ignoredPrefixes = profile.guardrails.forbiddenPaths.filter((item) => item !== ".git");
  const binaryExt = /\.(png|jpe?g|gif|webp|bmp|pdf|zip|tar|gz|phar|woff2?|ttf|eot|ico|mp4|mov|avi|mkv|exe|dylib|so|dll)$/i;
  const sourceFiles = allFiles.filter((file) => {
    if (binaryExt.test(file)) return false;
    if (ignoredPrefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`))) return false;
    return true;
  });

  const manifestEvidence = dedupe([
    ...profile.signals.configFiles,
    ...(await pathExists(repoRoot, "requirements-dev.txt") ? ["requirements-dev.txt"] : []),
    ...(await pathExists(repoRoot, "Cargo.toml") ? ["Cargo.toml"] : []),
    ...(await pathExists(repoRoot, "go.mod") ? ["go.mod"] : []),
    ...(await pathExists(repoRoot, "Gemfile") ? ["Gemfile"] : []),
    ...(await pathExists(repoRoot, "pom.xml") ? ["pom.xml"] : []),
    ...(await pathExists(repoRoot, "build.gradle") ? ["build.gradle"] : []),
    ...(await pathExists(repoRoot, "build.gradle.kts") ? ["build.gradle.kts"] : [])
  ]);

  const topDirCounts = new Map<string, number>();
  for (const file of sourceFiles) {
    const folder = path.posix.dirname(file);
    const top = folder === "." ? "[root]" : folder.split("/")[0];
    if (!top || top.startsWith(".")) continue;
    topDirCounts.set(top, (topDirCounts.get(top) ?? 0) + 1);
  }
  const topDirs = [...topDirCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const testFiles = sourceFiles.filter((file) => /(^|\/)(tests?|__tests__|spec)\//i.test(file) || /\.(test|spec)\./i.test(file));
  const docsFiles = sourceFiles.filter((file) => /(^|\/)(docs?|documentation)\//i.test(file) || /README/i.test(file));

  const toolingConfigCandidates = [
    ".editorconfig",
    ".prettierrc",
    "prettier.config.js",
    ".eslintrc",
    ".eslintrc.json",
    "eslint.config.js",
    "ruff.toml",
    "mypy.ini",
    ".flake8",
    "pytest.ini",
    ".golangci.yml",
    "phpunit.xml",
    "vitest.config.ts",
    "jest.config.js",
    "Cargo.toml",
    "go.mod"
  ];
  const toolingConfigs = (
    await Promise.all(toolingConfigCandidates.map(async (candidate) => ((await pathExists(repoRoot, candidate)) ? candidate : undefined)))
  ).filter((item): item is string => Boolean(item));
  const docsEvidence = [
    ...(await pathExists(repoRoot, "README.md") ? ["README.md"] : []),
    ...(await pathExists(repoRoot, "docs") ? ["docs"] : [])
  ];

  const sampleForMetrics = sourceFiles
    .filter((file) => /\.(ts|tsx|js|jsx|php|py|rb|go|rs|java|kt|cs|dart|swift|scala|ex|exs|sh|sql|vue)$/.test(file))
    .slice(0, 900);
  let todoCount = 0;
  let importHits = 0;
  let classHits = 0;
  let functionHits = 0;
  let longFileCount = 0;
  const longFileEvidence: string[] = [];

  for (const file of sampleForMetrics) {
    const content = await readText(repoRoot, file, 128_000);
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    if (lines.length > 500) {
      longFileCount += 1;
      if (longFileEvidence.length < 5) longFileEvidence.push(file);
    }
    const todoMatches = content.match(/TODO|FIXME/gi);
    if (todoMatches) todoCount += todoMatches.length;
    if (/\b(import|require|use|from)\b/.test(content)) importHits += 1;
    if (/\bclass\b/.test(content)) classHits += 1;
    if (/\b(function|def|fn)\b/.test(content)) functionHits += 1;
  }

  const languageConventions = profile.languages.slice(0, 8).map((language) => {
    const base = (() => {
      switch (language.name) {
        case "typescript":
          return "TypeScript is present; keep strict typing, avoid implicit any, and prefer typed module boundaries.";
        case "javascript":
          return "JavaScript is present; keep module boundaries explicit and avoid hidden side effects in shared utilities.";
        case "python":
          return "Python is present; keep package/module boundaries explicit and prefer small, testable functions over script-style global flows.";
        case "go":
          return "Go is present; keep package layout predictable (cmd/internal/pkg style) and preserve explicit error handling.";
        case "rust":
          return "Rust is present; keep crate/module boundaries explicit and preserve ownership-safe patterns rather than introducing unsafe shortcuts.";
        case "java":
        case "kotlin":
          return "JVM code is present; keep package layering coherent and avoid bypassing dependency injection or service boundaries.";
        case "php":
          return "PHP is present; preserve existing framework conventions and avoid mixing framework and scripting styles in the same layer.";
        case "ruby":
          return "Ruby is present; keep framework/service boundaries clear and avoid callback-heavy implicit behavior where explicit services exist.";
        case "csharp":
          return "C# is present; keep solution/project layering explicit and align with existing dependency injection patterns.";
        case "dart":
          return "Dart is present; keep widget/app layer boundaries explicit and avoid coupling UI code to transport/storage details.";
        default:
          return `${language.name} is present; preserve existing idioms and keep changes aligned with local style.`;
      }
    })();
    return withEvidence(base, language.evidence);
  });

  const frameworkConventions = profile.frameworks.slice(0, 10).map((framework) => {
    const base = (() => {
      switch (framework.name) {
        case "react":
          return "React detected; keep component boundaries explicit and avoid business logic leaks into view components.";
        case "nextjs":
          return "Next.js detected; maintain route/page conventions and keep server/client boundary explicit.";
        case "vue":
          return "Vue detected; preserve current component/entrypoint structure and avoid ad-hoc state patterns.";
        case "angular":
          return "Angular detected; keep module/service/component separation and follow existing DI architecture.";
        case "express":
          return "Express detected; keep route-handler/service boundaries explicit and centralize middleware policies.";
        case "nest":
          return "Nest detected; preserve controller/service/module layering and decorator-based patterns.";
        case "django":
          return "Django detected; keep app boundaries clear and preserve model/view/serializer responsibilities.";
        case "fastapi":
          return "FastAPI detected; preserve pydantic schema boundaries and explicit dependency wiring.";
        case "rails":
          return "Rails detected; preserve model/controller/service boundaries and avoid callback-heavy hidden behavior.";
        case "spring-boot":
          return "Spring Boot detected; preserve layered architecture and dependency-injection-driven wiring.";
        case "aspnet":
          return "ASP.NET detected; preserve startup/middleware composition and service registration boundaries.";
        case "flutter":
          return "Flutter detected; preserve widget hierarchy and avoid mixing UI state and infrastructure logic.";
        default:
          return `${framework.name} detected; follow existing framework conventions and keep new code consistent with current architecture.`;
      }
    })();
    return withEvidence(base, framework.evidence);
  });

  const strongFrameworks = profile.frameworks.filter((framework) => framework.confidence >= 0.6);
  const mixedLanguage = profile.languages.filter((language) => language.confidence >= 0.25).length >= 3;
  const weakSignals = strongFrameworks.length === 0;
  const isBootstrapProfile = profile.guardrails.notes.some((note) => /bootstrapp?ed/i.test(note));
  const hasLaravel = profile.frameworks.some((framework) => framework.name === "laravel" && framework.confidence >= 0.5);

  const snapshot: string[] = [
    withEvidence(
      `Detected frameworks: ${profile.frameworks.map((framework) => `${framework.name} (${framework.confidence})`).join(", ") || "none"}.`,
      profile.frameworks.flatMap((framework) => framework.evidence)
    ),
    withEvidence(
      `Detected languages: ${profile.languages.map((language) => `${language.name} (${language.confidence})`).join(", ") || "none"}.`,
      profile.languages.flatMap((language) => language.evidence)
    ),
    withEvidence(
      `Build command coverage: install=${profile.build.commands.install ? "yes" : "no"}, build=${profile.build.commands.build ? "yes" : "no"}, test=${profile.build.commands.test ? "yes" : "no"}, lint=${profile.build.commands.lint ? "yes" : "no"}, format=${profile.build.commands.format ? "yes" : "no"}.`,
      profile.build.evidence
    )
  ];
  if (profile.structure.monorepo) {
    snapshot.push(withEvidence(`Monorepo signal detected${profile.structure.workspaces?.length ? ` (${profile.structure.workspaces.join(", ")})` : ""}.`, profile.structure.workspaces ?? []));
  }
  if (profile.meta.repoSize) {
    snapshot.push(`Repository size estimate: ${profile.meta.repoSize.files} files scanned.`);
  }

  const sections: RulebookSection[] = [];
  sections.push(
    buildPolicySection({
      profile,
      policy: normalizedPolicy,
      isMixedOrWeak: mixedLanguage || weakSignals,
      hasLaravel
    })
  );

  if (isBootstrapProfile) {
    sections.push(buildBootstrapQualitySection(profile, hasLaravel));
  }

  sections.push({
    title: "Repository Layout",
    bullets: [
      withEvidence(
        `Top directories by source-file volume: ${topDirs.map(([dir, count]) => `${dir} (${count})`).join(", ") || "n/a"}.`,
        topDirs.map(([dir]) => dir)
      ),
      withEvidence(
        `Entrypoints detected: ${profile.signals.entrypoints.length > 0 ? profile.signals.entrypoints.join(", ") : "none detected"}.`,
        profile.signals.entrypoints
      ),
      withEvidence(
        `Manifest/config files detected: ${manifestEvidence.length > 0 ? manifestEvidence.join(", ") : "none detected"}.`,
        manifestEvidence
      )
    ]
  });

  const buildBullets = [
    `Install command: ${profile.build.commands.install ?? "UNKNOWN"}.`,
    `Build command: ${profile.build.commands.build ?? "UNKNOWN"}.`,
    `Test command: ${profile.build.commands.test ?? "UNKNOWN"}.`,
    `Lint command: ${profile.build.commands.lint ?? "UNKNOWN"}.`,
    `Format command: ${profile.build.commands.format ?? "UNKNOWN"}.`
  ].map((line) => withEvidence(line, profile.build.evidence));
  buildBullets.push(
    withEvidence(
      `Quality tooling configs detected: ${toolingConfigs.length > 0 ? toolingConfigs.join(", ") : "none detected"}.`,
      toolingConfigs
    )
  );
  if (profile.signals.ciFiles.length > 0) {
    buildBullets.push(withEvidence(`CI workflow files detected (${profile.signals.ciFiles.length}).`, profile.signals.ciFiles));
  }
  sections.push({ title: "Build, Test, and Tooling", bullets: buildBullets });

  const langFrameworkBullets = [...languageConventions, ...frameworkConventions];
  if (langFrameworkBullets.length === 0) {
    langFrameworkBullets.push("No dominant framework/language convention could be inferred; keep changes minimal and evidence-driven.");
  }
  sections.push({ title: "Language and Framework Practices", bullets: langFrameworkBullets });

  const healthBullets: string[] = [
    `Sampled code files for structural metrics: ${sampleForMetrics.length}.`,
    `Files with import/use-style module wiring: ${importHits}.`,
    `Files containing class declarations: ${classHits}.`,
    `Files containing function/procedure declarations: ${functionHits}.`,
    `Test files detected: ${testFiles.length}.`,
    `Documentation files detected: ${docsFiles.length}.`,
    `TODO/FIXME markers observed in sampled files: ${todoCount}.`
  ];
  if (longFileCount > 0) {
    healthBullets.push(withEvidence(`Potentially large files (>500 lines) found: ${longFileCount}.`, longFileEvidence));
  }
  sections.push({
    title: "Code Health Signals",
    bullets: healthBullets.map((line) => withEvidence(line, line.startsWith("Potentially") ? [] : []))
  });

  if (!isBootstrapProfile && (mixedLanguage || weakSignals)) {
    sections.push({
      title: "Messy/Legacy Code Stabilization",
      bullets: [
        withEvidence(
          "No single dominant framework signal found or the repository is strongly polyglot; treat it as a mixed/legacy codebase and enforce incremental standardization.",
          profile.frameworks.flatMap((framework) => framework.evidence)
        ),
        "Before broad refactors, codify target boundaries per top-level directory and migrate one boundary at a time.",
        "Require evidence-backed architecture decisions: every new pattern should cite existing files that justify it.",
        "Introduce tests around touched flows first, then refactor internals behind those tests.",
        "Avoid large style-only rewrites; prioritize behavior-safe, scoped cleanups with explicit rollback points."
      ]
    });
  }

  sections.push({
    title: "Execution Guardrails",
    bullets: [
      withEvidence(`Forbidden paths: ${profile.guardrails.forbiddenPaths.join(", ")}.`, profile.guardrails.forbiddenPaths),
      ...profile.guardrails.notes
    ]
  });

  sections.push({
    title: "Implementation Playbook",
    bullets: [
      "Match local naming/layout conventions in the files you touch; do not introduce a second style within one module/package.",
      "Keep diffs scoped to the smallest boundary that can satisfy the change request.",
      "Apply DRY: avoid copy-pasted business logic and converge repeated patterns through focused, evidence-backed abstractions.",
      "No premature abstraction: only extract shared frameworks/utilities when repetition is real and stable.",
      "Prefer cohesive, smaller files/modules over mega files; split by responsibility while avoiding over-fragmentation.",
      "When command/tooling confidence is low, run discovery first and write UNKNOWN/TODO explicitly in generated guidance.",
      "Preserve compatibility with existing CI/tooling before adopting new build systems or framework patterns.",
      "Every non-trivial change proposal should point to concrete evidence files in this repository."
    ]
  });

  const genericToolingCandidates = dedupe([
    ...profile.signals.configFiles,
    ...profile.build.evidence,
    ...toolingConfigs
  ]);
  const genericMandatoryConventionsSection = await buildMandatoryConventionsSection({
    repoRoot,
    files: sourceFiles,
    profile,
    policy: normalizedPolicy,
    hasLaravel: false,
    toolingCandidates: genericToolingCandidates
  });
  if (genericMandatoryConventionsSection) {
    sections.push(genericMandatoryConventionsSection);
  }

  sections.push({
    title: "Documentation Maintenance",
    bullets: [
      withEvidence(
        "When behavior or public contracts change, update both developer docs and user-facing docs in the same delivery.",
        docsEvidence
      ),
      "Require language-appropriate API documentation for changed public interfaces (for example PHPDoc, JSDoc/TSDoc, Python docstrings, Go exported comments).",
      "Keep onboarding/usage docs aligned with actual commands, config, and integration flow after each meaningful change."
    ]
  });
  sections.push({
    title: "Strict Quality Gates (DO / DON'T)",
    bullets: [
      "DO keep claims and conventions tied to explicit evidence files.",
      "DO keep changes scoped, reviewable, and behavior-safe.",
      "DO apply DRY only when repeated logic is proven by multiple concrete call sites.",
      "DON'T introduce speculative abstractions before stable repetition exists.",
      "DON'T grow monolithic files/classes; keep responsibilities cohesive and human-readable.",
      "DON'T mix functional changes with large style-only rewrites."
    ]
  });
  sections.push({
    title: "Testing Minimum Bar",
    bullets: [
      withEvidence(
        "Every meaningful behavior change must include/update at least one fitting test or explicit manual verification note.",
        testFiles.slice(0, 3)
      ),
      "Contract changes (API/CLI/config) require backward-compatibility checks and explicit expected output verification.",
      "Refactors require smoke checks that prove unchanged runtime behavior on touched paths."
    ]
  });
  sections.push({
    title: "Security and Performance Checklist",
    bullets: [
      "Security: validate inputs at boundaries, preserve explicit authorization checks, and avoid secret exposure.",
      "Security: prefer existing safe file/process/network patterns over ad-hoc shortcuts.",
      "Performance: avoid N+1, oversized payloads, and expensive broad scans when targeted reads are possible.",
      "Performance: preserve existing caching and incremental processing behavior unless optimization scope is explicit."
    ]
  });
  sections.push({
    title: "Dependency and Change Safety Policy",
    bullets: [
      withEvidence("Dependency changes must include rationale and compatibility/tooling impact.", manifestEvidence),
      "Breaking contract changes require explicit migration path and rollback notes.",
      "API/CLI response shape and status/exit semantics must remain stable unless change is explicitly approved."
    ]
  });
  sections.push({
    title: "Definition of Done",
    bullets: [
      "Code aligns with detected standards and local conventions.",
      "Tests/verification are updated and documented for touched behavior.",
      "Developer and user-facing docs are updated when behavior/contracts changed.",
      "Outstanding UNKNOWN/TODO items are explicit and actionable."
    ]
  });
  sections.push(buildPostChangeReviewSection());

  return {
    title: "Project Conventions (Evidence-Backed)",
    snapshot,
    sections
  };
}
