import fs from "node:fs/promises";
import path from "node:path";
import { listFilesSafe, readFileSafe } from "../fs/safe.js";
import type { ProjectProfile } from "../profile/schema.js";
import { extractAstBoundaryConventionCandidates } from "./ast.js";

export type RulebookSection = {
  title: string;
  bullets: string[];
};

export type Rulebook = {
  title: string;
  snapshot: string[];
  sections: RulebookSection[];
  unknowns: string[];
};

type RulebookPolicy = {
  strictness: "baseline" | "strict" | "very-strict";
  standards: "auto" | "project-only" | "project-plus-standard";
};

type JsonMap = Record<string, unknown>;

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function withTrailingPeriod(text: string): string {
  return /[.!?`]$/.test(text) ? text : `${text}.`;
}

const FLUTTER_PLATFORM_FRAMEWORKS = new Set(["android", "ios"]);
const FLUTTER_PLATFORM_LANGUAGES = new Set(["swift", "kotlin", "java", "c", "cpp"]);

function withEvidence(text: string, evidence: string[]): string {
  const cleaned = dedupe(evidence.filter(Boolean));
  if (cleaned.length === 0) return text;
  return `${text} (evidence: ${cleaned.slice(0, 6).join(", ")})`;
}

function hasStrongFlutterSignal(profile: ProjectProfile): boolean {
  return profile.frameworks.some((framework) => framework.name === "flutter" && framework.confidence >= 0.6);
}

function visibleLanguagesForRulebook(profile: ProjectProfile): ProjectProfile["languages"] {
  if (!hasStrongFlutterSignal(profile)) return profile.languages;
  const filtered = profile.languages.filter((language) => !FLUTTER_PLATFORM_LANGUAGES.has(language.name));
  return filtered.length > 0 ? filtered : profile.languages;
}

function visibleFrameworksForRulebook(profile: ProjectProfile): ProjectProfile["frameworks"] {
  if (!hasStrongFlutterSignal(profile)) return profile.frameworks;
  const filtered = profile.frameworks.filter((framework) => !FLUTTER_PLATFORM_FRAMEWORKS.has(framework.name));
  return filtered.length > 0 ? filtered : profile.frameworks;
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
    visibleLanguagesForRulebook(args.profile)
      .filter((language) => language.confidence >= 0.25)
      .map((language) => standardForLanguage(language.name, args.hasLaravel))
      .filter((line): line is string => Boolean(line))
  );
  const languageDocStandards = dedupe(
    visibleLanguagesForRulebook(args.profile)
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

type StackPatternDescriptor = {
  label: string;
  pattern: RegExp;
  pathPattern?: RegExp;
  guidance: string;
  topic?: string;
};

type StackConventionDescriptor = {
  text: string;
  topic?: string;
};

type StackSpecializerConfig = {
  key: string;
  title: string;
  frameworkNames?: string[];
  languageNames?: string[];
  intro: string;
  standards: Array<string | StackConventionDescriptor>;
  antiPatterns: Array<string | StackConventionDescriptor>;
  patterns: StackPatternDescriptor[];
};

type ConventionCandidate = {
  topic: string;
  source: "repo" | "standard" | "anti-pattern";
  text: string;
  evidence: string[];
};

type BoundaryDescriptor = {
  topic: string;
  pattern: RegExp;
  text: string;
};

type SemanticBoundaryDescriptor = {
  topic: string;
  pathPattern?: RegExp;
  contentPattern: RegExp;
  text: string;
};

type RetentionDescriptor = {
  topic: string;
  pathPattern?: RegExp;
  contentPattern: RegExp;
  text: string;
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

function displayFrameworkName(framework: string): string {
  const map: Record<string, string> = {
    react: "React",
    nextjs: "Next.js",
    express: "Node/Express",
    nest: "NestJS",
    fastapi: "FastAPI",
    django: "Django",
    "spring-boot": "Spring Boot",
    aspnet: "ASP.NET Core",
    flutter: "Flutter",
    android: "Android",
    ios: "iOS"
  };
  return map[framework] ?? framework;
}

function patternFilesForDescriptor(files: string[], descriptor: StackPatternDescriptor): string[] {
  if (!descriptor.pathPattern) return files;
  return files.filter((file) => descriptor.pathPattern?.test(file));
}

function profileEvidenceForNames(profile: ProjectProfile, frameworkNames: string[] = [], languageNames: string[] = []): string[] {
  const evidence = [
    ...profile.frameworks.filter((framework) => frameworkNames.includes(framework.name)).flatMap((framework) => framework.evidence),
    ...profile.languages.filter((language) => languageNames.includes(language.name)).flatMap((language) => language.evidence)
  ];
  return dedupe(evidence).slice(0, 8);
}

function inferConventionTopic(text: string): string {
  const normalized = text.toLowerCase();
  if (/\b(route|router|routing|page|screen navigation|route handler)\b/.test(normalized)) return "routing";
  if (/\b(state|store|context|reducer|viewmodel|changeNotifier|bloc|riverpod|pinia|composable)\b/.test(normalized)) return "state";
  if (/\b(test|spec|xctest|widget test|testing)\b/.test(normalized)) return "testing";
  if (/\b(validation|schema|dto|serializer|formrequest|request validation)\b/.test(normalized)) return "validation";
  if (/\b(async|await|future|coroutine|task|lifecycle|side-effect)\b/.test(normalized)) return "async";
  if (/\b(service|repository|persistence|data|transport|rpc|query|database|orm)\b/.test(normalized)) return "data";
  if (/\b(component|widget|template|ui|view|compose|swiftui|uikit)\b/.test(normalized)) return "ui";
  if (/\b(module|dependency injection|di|provider|configuration|host|bootstrap)\b/.test(normalized)) return "architecture";
  if (/\b(permission|auth|authorization|middleware|guard)\b/.test(normalized)) return "security";
  return "general";
}

function renderCandidate(candidate: ConventionCandidate): string {
  switch (candidate.source) {
    case "repo":
      return `Repository-specific convention (${candidate.topic}): ${candidate.text}`;
    case "standard":
      return `Compatible standards overlay (${candidate.topic}): ${candidate.text}`;
    case "anti-pattern":
      return `Avoid (${candidate.topic}): ${candidate.text}`;
  }
}

function mergeConventionCandidates(candidates: ConventionCandidate[]): ConventionCandidate[] {
  const orderedTopics: string[] = [];
  const seenTopicOrder = new Set<string>();
  for (const candidate of candidates) {
    if (seenTopicOrder.has(candidate.topic)) continue;
    seenTopicOrder.add(candidate.topic);
    orderedTopics.push(candidate.topic);
  }

  const sourceOrder: ConventionCandidate["source"][] = ["repo", "standard", "anti-pattern"];
  const merged: ConventionCandidate[] = [];
  const repoTopics = new Set(candidates.filter((candidate) => candidate.source === "repo").map((candidate) => candidate.topic));

  for (const topic of orderedTopics) {
    for (const source of sourceOrder) {
      const seenTexts = new Set<string>();
      let keptForTopic = 0;
      for (const candidate of candidates) {
        if (candidate.topic !== topic || candidate.source !== source) continue;
        if (seenTexts.has(candidate.text)) continue;
        if (source === "standard" && repoTopics.has(topic) && keptForTopic >= 1) continue;
        if (source === "anti-pattern" && keptForTopic >= 1) continue;
        seenTexts.add(candidate.text);
        merged.push(candidate);
        keptForTopic += 1;
      }
    }
  }

  return merged;
}

const GENERIC_BOUNDARY_DESCRIPTORS: BoundaryDescriptor[] = [
  {
    topic: "routing",
    pattern: /(^|\/)(routes?|router|navigation)\//i,
    text: "Routing and flow-entry files already live in dedicated route/navigation boundaries; extend those files or nearby modules instead of scattering flow control into unrelated layers."
  },
  {
    topic: "data",
    pattern: /(^|\/)(services?|data|repositories?|api|clients?|auth)\//i,
    text: "Data, transport, or service code is already isolated in dedicated service/data boundaries; preserve that split before adding new infrastructure calls to UI or handler files."
  },
  {
    topic: "state",
    pattern: /(^|\/)(state|store|stores|viewmodels?|reducers?|bloc|blocs)\//i,
    text: "Shared mutable state already has an explicit boundary; extend that existing state layer before introducing a parallel state mechanism."
  },
  {
    topic: "ui",
    pattern: /(^|\/)(screens?|pages|views|components|widgets|ui)\//i,
    text: "Route-level UI and reusable presentation pieces already have dedicated boundaries; keep feature work aligned with those files instead of mixing presentation with service logic."
  },
  {
    topic: "validation",
    pattern: /(^|\/)(dto|dtos|schemas?|serializers?|forms?|requests?|validation|validators?)\//i,
    text: "Validation and contract objects already live in dedicated request/schema boundaries; preserve those contracts rather than inlining validation everywhere."
  },
  {
    topic: "testing",
    pattern: /(^|\/)(tests?|__tests__|specs?)\//i,
    text: "The repository already separates automated verification into dedicated test boundaries; extend the nearest existing test style for touched behavior."
  },
  {
    topic: "localization",
    pattern: /(^|\/)(localization|i18n|l10n|lang|translations)\//i,
    text: "Localized copy/resources already have a dedicated boundary; route new user-facing text through that localization layer instead of hardcoding it inline."
  },
  {
    topic: "theme",
    pattern: /(^|\/)(theme|styles?)\//i,
    text: "Theme or shared styling is already centralized; preserve that styling boundary instead of duplicating tokens or visual constants across feature files."
  },
  {
    topic: "database",
    pattern: /(^|\/)(migrations?|schema|entities|models)\//i,
    text: "Persistence structure is already expressed through dedicated model or migration boundaries; keep schema and model changes aligned with those files."
  }
];

const FRAMEWORK_BOUNDARY_DESCRIPTORS: Record<string, BoundaryDescriptor[]> = {
  flutter: [
    {
      topic: "ui",
      pattern: /(^|\/)(screens|widgets)\//i,
      text: "Flutter route-level screens and reusable widgets already live in distinct folders; preserve that UI split when extending features."
    },
    {
      topic: "state",
      pattern: /(^|\/)(state)\//i,
      text: "Flutter app state already has a dedicated state boundary; extend that controller/notifier layer before introducing a parallel state stack."
    },
    {
      topic: "data",
      pattern: /(^|\/)(auth|data|services?)\//i,
      text: "Flutter backend/auth/data access is already pushed into dedicated service layers; keep RPC, auth, and persistence access there."
    }
  ],
  react: [
    {
      topic: "ui",
      pattern: /(^|\/)(components|pages|app)\//i,
      text: "React view composition already follows dedicated component/page boundaries; keep rendering concerns there and avoid pushing cross-cutting logic into presentational files."
    }
  ],
  nextjs: [
    {
      topic: "routing",
      pattern: /(^|\/)(app|pages)\//i,
      text: "Next.js routing boundaries are already expressed through app/pages directories; preserve that route ownership rather than mixing route logic into shared utilities."
    }
  ],
  express: [
    {
      topic: "routing",
      pattern: /(^|\/)(routes?|controllers?)\//i,
      text: "Request routing and handler boundaries are already explicit; keep new endpoints aligned with the existing route/controller split."
    },
    {
      topic: "data",
      pattern: /(^|\/)(services?|repositories?|models)\//i,
      text: "Business logic and persistence already have dedicated backend boundaries; keep handlers thin and reuse those services or models."
    }
  ],
  nest: [
    {
      topic: "architecture",
      pattern: /(^|\/)(modules?|controllers?|services?|dto)\//i,
      text: "Nest module/controller/service/DTO boundaries are already explicit; preserve that DI-driven layering rather than collapsing responsibilities together."
    }
  ],
  fastapi: [
    {
      topic: "routing",
      pattern: /(^|\/)(routers?|api)\//i,
      text: "FastAPI route registration already has an API/router boundary; keep endpoint wiring there and avoid mixing it into persistence modules."
    },
    {
      topic: "validation",
      pattern: /(^|\/)(schemas?|models)\//i,
      text: "FastAPI request/response schema boundaries are already explicit; preserve those typed contracts for touched endpoints."
    }
  ],
  django: [
    {
      topic: "architecture",
      pattern: /(^|\/)(views?|models|serializers|forms|migrations)\//i,
      text: "Django app boundaries are already expressed through conventional view/model/serializer or form layers; extend those instead of inventing alternate feature structure."
    }
  ],
  "spring-boot": [
    {
      topic: "architecture",
      pattern: /(^|\/)(controller|controllers|service|services|repository|repositories|config)\//i,
      text: "Spring layering is already explicit through controller/service/repository or config packages; preserve those boundaries when adding new behavior."
    }
  ],
  aspnet: [
    {
      topic: "architecture",
      pattern: /(^|\/)(controllers?|services?|repositories?|models)\//i,
      text: "ASP.NET application structure already separates endpoint, service, and domain boundaries; preserve that layering in touched areas."
    }
  ],
  android: [
    {
      topic: "ui",
      pattern: /(^|\/)(ui|presentation)\//i,
      text: "Android UI code already has a dedicated presentation boundary; keep screens and rendering concerns there rather than mixing in data access."
    },
    {
      topic: "state",
      pattern: /(^|\/)(viewmodel|viewmodels|state)\//i,
      text: "Android state ownership is already separated into explicit state or ViewModel boundaries; extend that layer before introducing a competing flow."
    }
  ],
  ios: [
    {
      topic: "ui",
      pattern: /(^|\/)(views?|screens?|coordinators?)\//i,
      text: "iOS UI and navigation ownership already has dedicated boundaries; keep screen/coordinator responsibilities aligned with those files."
    },
    {
      topic: "testing",
      pattern: /(^|\/)(tests?)\//i,
      text: "iOS verification already has an XCTest boundary; extend those tests for touched user flows and module behavior."
    }
  ]
};

function extractBoundaryConventionCandidates(frameworkKey: string, files: string[]): ConventionCandidate[] {
  const descriptors = [
    ...(FRAMEWORK_BOUNDARY_DESCRIPTORS[frameworkKey] ?? []),
    ...GENERIC_BOUNDARY_DESCRIPTORS
  ];
  const candidates: ConventionCandidate[] = [];
  const seen = new Set<string>();

  for (const descriptor of descriptors) {
    const evidence = files.filter((file) => descriptor.pattern.test(file)).slice(0, 4);
    if (evidence.length === 0) continue;
    const key = `${descriptor.topic}:${descriptor.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      topic: descriptor.topic,
      source: "repo",
      text: descriptor.text,
      evidence
    });
  }

  return candidates;
}

const GENERIC_SEMANTIC_BOUNDARY_DESCRIPTORS: SemanticBoundaryDescriptor[] = [
  {
    topic: "data",
    contentPattern: /\bclass\s+[A-Za-z0-9_]*(Service|Repository|Client|Gateway)\b|\binterface\s+[A-Za-z0-9_]*(Service|Repository|Client|Gateway)\b/,
    text: "Repository code already defines explicit service/repository/client boundaries in code symbols; preserve those named boundaries instead of bypassing them from unrelated layers."
  },
  {
    topic: "routing",
    contentPattern: /\bRouter\(|\bAPIRouter\b|urlpatterns|Map(Get|Post|Put|Patch|Delete)\(|MaterialPageRoute|Navigator\.|createRouter\(/,
    text: "Routing and navigation behavior is already explicit in code-level router/navigation APIs; preserve the same flow entrypoints and avoid inventing alternate routing styles in the same repo."
  },
  {
    topic: "state",
    contentPattern: /\b(ChangeNotifier|ViewModel|StateFlow|LiveData|useReducer|defineStore|Bloc|Riverpod|Reducer<)\b/,
    text: "State ownership is already encoded through explicit state-holder abstractions in code; extend those abstractions before introducing a parallel state mechanism."
  },
  {
    topic: "validation",
    contentPattern: /\b(BaseModel|Serializer|FormRequest|ValidationPipe|class-validator|zod|joi|yup|Field\()|\brequest->validate\b/,
    text: "Validation/contracts are already represented through explicit schema or validator constructs; reuse those typed/request-boundary patterns instead of ad-hoc inline validation."
  },
  {
    topic: "testing",
    contentPattern: /(@Test\b|XCTestCase|testWidgets\(|describe\(|RSpec\.describe|pytest|Test\.createTestingModule|\[(Fact|Theory|Test)\])/,
    text: "Automated verification style is already visible in code-level test constructs; extend that existing test harness instead of inventing a second one."
  }
];

const FRAMEWORK_SEMANTIC_BOUNDARY_DESCRIPTORS: Record<string, SemanticBoundaryDescriptor[]> = {
  react: [
    {
      topic: "state",
      pathPattern: /\.(tsx|jsx|ts|js)$/,
      contentPattern: /\buse(State|Reducer|Context|Transition|DeferredValue|SyncExternalStore)\b|\bcreateContext\b/,
      text: "React state and lifecycle ownership is already visible through hooks and context constructs in code; preserve that composition model within the touched feature."
    },
    {
      topic: "testing",
      pathPattern: /\.(test|spec)\.(tsx|jsx|ts|js)$/,
      contentPattern: /@testing-library\/react|render\(|screen\./,
      text: "React UI verification already follows a component-test harness; extend the same rendering and assertion style for touched flows."
    }
  ],
  nextjs: [
    {
      topic: "routing",
      pathPattern: /(^|\/)(app|pages|middleware|src\/app|src\/pages)\/.*\.(tsx|jsx|ts|js)$|middleware\.(ts|js)$/,
      contentPattern: /generateMetadata|getServerSideProps|getStaticProps|export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)|NextResponse/,
      text: "Next.js routing, metadata, middleware, and route-handler behavior is already explicit in framework entrypoints; keep route ownership in those boundaries."
    },
    {
      topic: "data",
      pathPattern: /\.(tsx|jsx|ts|js)$/,
      contentPattern: /['"]use server['"]|revalidate(Path|Tag)|unstable_cache|cookies\(|headers\(/,
      text: "Next.js data and server-only behavior is already separated through server entrypoints or server-only APIs; preserve that split instead of leaking it into client UI files."
    }
  ],
  express: [
    {
      topic: "routing",
      pathPattern: /\.(ts|js)$/,
      contentPattern: /\bexpress\(\)|\bRouter\(\)|\.(get|post|put|patch|delete)\s*\(/,
      text: "Express request flow is already anchored in router and handler registration calls; keep endpoint ownership there and leave business logic to downstream layers."
    },
    {
      topic: "validation",
      pathPattern: /\.(ts|js)$/,
      contentPattern: /\bzod\b|\bjoi\b|\bexpress-validator\b|\bvalidate\(/,
      text: "Express input validation is already explicit in validator/schema constructs; preserve those request-boundary checks instead of scattering ad-hoc validation."
    }
  ],
  nest: [
    {
      topic: "architecture",
      pathPattern: /\.(ts|js)$/,
      contentPattern: /@Module\b|@Controller\b|@Injectable\b|NestFactory\.create/,
      text: "NestJS module/controller/provider boundaries are already explicit through decorators and bootstrap wiring; preserve that DI-first layering."
    },
    {
      topic: "validation",
      pathPattern: /\.(ts|js)$/,
      contentPattern: /ValidationPipe|class-validator|class-transformer|@Body\(/,
      text: "NestJS validation and request binding already use decorator or pipe-based contracts; extend that same DTO/pipe style for touched endpoints."
    }
  ],
  fastapi: [
    {
      topic: "routing",
      pathPattern: /\.py$/,
      contentPattern: /\bAPIRouter\b|@app\.(get|post|put|patch|delete)|@router\.(get|post|put|patch|delete)/,
      text: "FastAPI endpoint boundaries are already explicit in APIRouter or app route declarations; preserve that endpoint registration style."
    },
    {
      topic: "validation",
      pathPattern: /\.py$/,
      contentPattern: /\bBaseModel\b|\bDepends\(|\bField\(/,
      text: "FastAPI request, dependency, and schema contracts are already encoded in Pydantic or dependency-injection constructs; keep those boundaries explicit."
    }
  ],
  django: [
    {
      topic: "architecture",
      pathPattern: /\.py$/,
      contentPattern: /\bmodels\.Model\b|\bModelForm\b|\bSerializer\b|\bViewSet\b|urlpatterns/,
      text: "Django domain boundaries are already visible through model, serializer/form, and view or route constructs; extend the nearest conventional layer instead of inventing alternate structure."
    }
  ],
  "spring-boot": [
    {
      topic: "architecture",
      pathPattern: /\.(java|kt)$/,
      contentPattern: /@(RestController|Controller|Service|Repository|Configuration)\b/,
      text: "Spring Boot layering is already encoded through stereotype annotations; preserve controller/service/repository boundaries in touched modules."
    },
    {
      topic: "validation",
      pathPattern: /\.(java|kt)$/,
      contentPattern: /@Valid\b|jakarta\.validation|javax\.validation/,
      text: "Spring request validation is already tied to bean-validation annotations or typed request models; keep validation at those boundaries."
    }
  ],
  aspnet: [
    {
      topic: "architecture",
      pathPattern: /\.cs$/,
      contentPattern: /ControllerBase|WebApplication\.CreateBuilder|Map(Get|Post|Put|Patch|Delete)\(|IServiceCollection|builder\.Services\./,
      text: "ASP.NET Core endpoint, DI, and host setup boundaries are already explicit in code; preserve those service and endpoint ownership lines."
    }
  ],
  flutter: [
    {
      topic: "routing",
      pathPattern: /\.dart$/,
      contentPattern: /\b(MaterialApp|CupertinoApp|GoRouter|MaterialPageRoute|Navigator\.)\b/,
      text: "Flutter navigation and app-shell ownership is already explicit in app/router code; keep route flow changes inside those navigation boundaries."
    },
    {
      topic: "data",
      pathPattern: /\.dart$/,
      contentPattern: /\b(SupabaseClient|Supabase|FirebaseAuth|FirebaseFirestore|Dio|http\.)\b/,
      text: "Flutter remote/data access is already centralized through explicit SDK or client usage in code; keep those integrations behind the established service boundary."
    }
  ],
  android: [
    {
      topic: "ui",
      pathPattern: /\.(kt|java)$/,
      contentPattern: /@Composable|setContent\s*\{|Fragment\b|Activity\b/,
      text: "Android presentation structure is already explicit in Compose or Activity/Fragment entrypoints; preserve the touched feature's existing UI paradigm."
    },
    {
      topic: "state",
      pathPattern: /\.(kt|java)$/,
      contentPattern: /\bViewModel\b|\bStateFlow\b|\bLiveData\b|\bNavController\b/,
      text: "Android state and navigation ownership already flows through ViewModel/state or navigation APIs; extend those boundaries rather than introducing a second coordination model."
    }
  ],
  ios: [
    {
      topic: "ui",
      pathPattern: /\.swift$/,
      contentPattern: /\bSwiftUI\b|struct\s+[A-Za-z0-9_]+\s*:\s*View|UIViewController|NavigationStack|UINavigationController/,
      text: "iOS presentation and navigation boundaries are already explicit in SwiftUI or UIKit entrypoints; preserve the touched flow's existing UI paradigm."
    },
    {
      topic: "state",
      pathPattern: /\.swift$/,
      contentPattern: /\bObservableObject\b|@Published|@StateObject|@ObservedObject|Task\s*\{/,
      text: "iOS state and async lifecycle ownership already appears through observable models or async task patterns; keep changes within those existing boundaries."
    }
  ]
};

const GENERIC_RETENTION_DESCRIPTORS: RetentionDescriptor[] = [
  {
    topic: "errors",
    pathPattern: /\.(dart|ts|tsx|js|jsx|py|php|java|kt|cs|swift)$/,
    contentPattern:
      /\bon\s+[A-Z][A-Za-z0-9_]*(Exception|Error)(\s+catch\b|\s*\{)|\binstanceof\s+[A-Z][A-Za-z0-9_]*(Exception|Error)\b|catch\s*\([^)]*:\s*[A-Z][A-Za-z0-9_<>]*(Exception|Error)\b[^)]*\)/,
    text: "Typed exception handling is already explicit in code; preserve the current exception-first handling order before falling back to generic error paths."
  },
  {
    topic: "security",
    pathPattern: /\.sql$/,
    contentPattern: /\bsecurity\s+definer\b|\bcreate\s+policy\b|\benable\s+row\s+level\s+security\b|\bset\s+search_path\s*=\s*''/i,
    text: "Authorization or privileged data access is already centralized in database-side policy or RPC helpers; preserve that backend ownership instead of duplicating critical authorization in clients."
  }
];

const FRAMEWORK_RETENTION_DESCRIPTORS: Record<string, RetentionDescriptor[]> = {
  flutter: [
    {
      topic: "flow",
      pathPattern: /\.dart$/,
      contentPattern: /\bpopUntil\s*\(\s*\(\s*route\s*\)\s*=>\s*route\.isFirst\s*\)|\bpushNamedAndRemoveUntil\b|\bpushAndRemoveUntil\b/,
      text: "Completion flows already reset navigation back to the shell or root after setup/auth success; preserve that reset behavior unless the task is an explicit UX migration."
    }
  ],
  vue: [
    {
      topic: "flow",
      pathPattern: /\.(vue|ts|js)$/,
      contentPattern: /\brouter\.(push|replace)\s*\(|\buseRouter\s*\(|\bcreateRouter\s*\(|\bbeforeEach\s*\(/,
      text: "The repository already encodes important route or redirect behavior through Vue router boundaries; preserve those guarded flow transitions instead of scattering alternate navigation control."
    }
  ],
  react: [
    {
      topic: "flow",
      pathPattern: /\.(tsx|jsx|ts|js)$/,
      contentPattern: /\bnavigate\s*\(|\brouter\.(push|replace)\s*\(|\bhistory\.(push|replace)\s*\(|\bredirect\s*\(/,
      text: "The repository already encodes important redirect or navigation-flow rules in code; preserve those entry or completion transitions instead of scattering alternate flow control."
    }
  ],
  nextjs: [
    {
      topic: "flow",
      pathPattern: /(^|\/)(app|pages|middleware|src\/app|src\/pages)\/.*\.(tsx|jsx|ts|js)$|middleware\.(ts|js)$/,
      contentPattern: /\bNextResponse\.redirect\b|\bredirect\s*\(/,
      text: "The repository already has explicit middleware or redirect flow control for guarded entrypoints; preserve that route-gating behavior instead of re-implementing it ad hoc in pages."
    }
  ],
  express: [
    {
      topic: "flow",
      pathPattern: /\.(ts|js)$/,
      contentPattern: /\bres\.redirect\s*\(|\breturn\s+redirect\s*\(/,
      text: "Request flows already use explicit redirect or handoff boundaries in handlers or middleware; preserve those completion paths instead of inventing parallel routing behavior."
    }
  ],
  nest: [
    {
      topic: "security",
      pathPattern: /\.(ts|js)$/,
      contentPattern: /@UseGuards\b|\bCanActivate\b|\bAuthGuard\b/,
      text: "Authorization is already centralized through Nest guards or guard contracts; preserve that boundary instead of scattering access checks through controllers or services."
    }
  ],
  fastapi: [
    {
      topic: "security",
      pathPattern: /\.py$/,
      contentPattern: /\bDepends\([^)]*(current_user|current_admin|require_|permission|role)|Security\(/,
      text: "Access-control decisions are already expressed through FastAPI dependency boundaries; preserve those guard-style dependencies instead of duplicating auth checks inside handlers."
    }
  ],
  django: [
    {
      topic: "security",
      pathPattern: /\.py$/,
      contentPattern: /\bpermission_classes\b|\bIsAuthenticated\b|\blogin_required\b|\buser_passes_test\b/,
      text: "Access-control checks are already centralized through Django or DRF permission boundaries; preserve those guards instead of scattering authorization logic into views and helpers."
    }
  ],
  "spring-boot": [
    {
      topic: "security",
      pathPattern: /\.(java|kt)$/,
      contentPattern: /@PreAuthorize\b|@Secured\b|HttpSecurity|SecurityFilterChain/,
      text: "Security ownership is already centralized in Spring security annotations or filter-chain configuration; preserve that boundary instead of duplicating authorization inside controllers."
    }
  ],
  aspnet: [
    {
      topic: "security",
      pathPattern: /\.cs$/,
      contentPattern: /\[Authorize\b|RequireAuthorization\(|IAuthorizationService/,
      text: "Authorization is already explicit in ASP.NET attributes or endpoint policies; preserve that policy boundary instead of scattering authorization checks through handlers."
    }
  ],
  android: [
    {
      topic: "flow",
      pathPattern: /\.(kt|java)$/,
      contentPattern: /\bpopBackStack\s*\(|\bnavigate\s*\(|\bfinish\s*\(/,
      text: "Android flow transitions are already explicit in navigation or activity lifecycle calls; preserve those completion/reset behaviors instead of layering a second flow model."
    }
  ],
  ios: [
    {
      topic: "flow",
      pathPattern: /\.swift$/,
      contentPattern: /\bdismiss\s*\(|\bpopToRootViewController\s*\(|\bNavigationStack\b|\bnavigationDestination\b/,
      text: "iOS flow completion is already encoded in coordinator or navigation APIs; preserve those existing reset or handoff paths when changing user journeys."
    }
  ]
};

async function extractSemanticBoundaryConventionCandidates(
  repoRoot: string,
  files: string[],
  frameworkKey?: string
): Promise<ConventionCandidate[]> {
  const candidates: ConventionCandidate[] = [];
  const seen = new Set<string>();
  const descriptors = [...(frameworkKey ? FRAMEWORK_SEMANTIC_BOUNDARY_DESCRIPTORS[frameworkKey] ?? [] : []), ...GENERIC_SEMANTIC_BOUNDARY_DESCRIPTORS];

  for (const descriptor of descriptors) {
    const candidateFiles = descriptor.pathPattern ? files.filter((file) => descriptor.pathPattern?.test(file)) : files;
    const hit = await collectPatternEvidence({
      repoRoot,
      files: candidateFiles,
      pattern: descriptor.contentPattern,
      maxEvidence: 4
    });
    if (hit.count === 0) continue;
    const key = `${descriptor.topic}:${descriptor.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      topic: descriptor.topic,
      source: "repo",
      text: descriptor.text,
      evidence: hit.evidence
    });
  }

  return candidates;
}

function contractEvidenceFiles(files: string[], frameworkKey?: string): string[] {
  const generic = files.filter((file) =>
    /(^|\/)(migrations?|schema|openapi|swagger|routes?|router|api|controllers?|services?|auth)\//i.test(file)
  );
  if (frameworkKey === "flutter") {
    return files.filter((file) => /(^|\/)(supabase\/migrations|lib\/src\/(auth|data|state)|README\.md$)/i.test(file));
  }
  if (frameworkKey === "nextjs") {
    return files.filter((file) => /(^|\/)(app\/api|middleware\.|lib\/validation|lib\/server|README\.md$)/i.test(file));
  }
  if (frameworkKey === "react") {
    return files.filter((file) => /(^|\/)(src\/(services?|api|router)|README\.md$)/i.test(file));
  }
  if (frameworkKey === "express") {
    return files.filter((file) => /(^|\/)(src\/(server|routes?|controllers?|services?|auth)|README\.md$)/i.test(file));
  }
  if (frameworkKey === "vue") {
    return files.filter((file) => /(^|\/)(src\/(router|services?|api|stores?)|README\.md$)/i.test(file));
  }
  return generic;
}

async function extractRetentionConventionCandidates(
  repoRoot: string,
  files: string[],
  frameworkKey?: string
): Promise<ConventionCandidate[]> {
  const candidates: ConventionCandidate[] = [];
  const seen = new Set<string>();
  const descriptors = [...(frameworkKey ? FRAMEWORK_RETENTION_DESCRIPTORS[frameworkKey] ?? [] : []), ...GENERIC_RETENTION_DESCRIPTORS];

  for (const descriptor of descriptors) {
    const candidateFiles = descriptor.pathPattern ? files.filter((file) => descriptor.pathPattern?.test(file)) : files;
    const hit = await collectPatternEvidence({
      repoRoot,
      files: candidateFiles,
      pattern: descriptor.contentPattern,
      maxEvidence: 4
    });
    if (hit.count === 0) continue;
    const key = `${descriptor.topic}:${descriptor.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      topic: descriptor.topic,
      source: "repo",
      text: descriptor.text,
      evidence: hit.evidence
    });
  }

  const readmeEvidence = files.find((file) => /(^|\/)README\.md$/i.test(file));
  const contractEvidence = contractEvidenceFiles(files, frameworkKey).filter((file) => file !== readmeEvidence);
  if (readmeEvidence && contractEvidence.length > 0) {
    candidates.push({
      topic: "delivery",
      source: "repo",
      text: "Repository docs or integration notes already coexist with contract-bearing code; keep README or nearby docs synchronized when auth, API, schema, or join-flow contracts change.",
      evidence: [readmeEvidence, ...contractEvidence.slice(0, 3)]
    });
  }

  if (frameworkKey === "flutter") {
    const authEvidence = files.filter((file) => /(^|\/)(auth)\//i.test(file)).slice(0, 2);
    const dataEvidence = files.filter((file) => /(^|\/)(data|services?)\//i.test(file)).slice(0, 2);
    if (authEvidence.length > 0 && dataEvidence.length > 0) {
      candidates.push({
        topic: "data",
        source: "repo",
        text: "Auth/session bootstrap and family data access already live in distinct service boundaries; preserve that separation instead of folding them into screens or one catch-all service.",
        evidence: [...authEvidence, ...dataEvidence].slice(0, 4)
      });
    }
  }

  return candidates;
}

async function extractAstConventionCandidates(
  repoRoot: string,
  files: string[],
  frameworkKey?: string
): Promise<ConventionCandidate[]> {
  const candidateFiles = files.filter((file) => /\.(tsx|ts|jsx|js|py|php|java|rs|dart|swift|sh|bash|zsh|sql)$/.test(file)).slice(0, 80);
  if (candidateFiles.length === 0) return [];

  const loaded = (
    await Promise.all(
      candidateFiles.map(async (file) => {
        const content = await readText(repoRoot, file, 128_000);
        return content ? { path: file, content } : undefined;
      })
    )
  ).filter((item): item is { path: string; content: string } => Boolean(item));

  return (await extractAstBoundaryConventionCandidates({ files: loaded, frameworkKey })).map((candidate) => ({
    topic: candidate.topic,
    source: "repo",
    text: candidate.text,
    evidence: candidate.evidence
  }));
}

const STACK_SPECIALIZERS: StackSpecializerConfig[] = [
  {
    key: "vue",
    title: "Vue Hybrid Conventions",
    frameworkNames: ["vue"],
    languageNames: ["typescript", "javascript"],
    intro:
      "Vue hybrid mode: preserve the repo's component, composable, and routing/state boundaries first, then apply compatible Vue standards.",
    standards: [
      "Keep template, script, and shared state concerns separated in the same style the repository already uses.",
      "Preserve the current routing and store/composable strategy rather than mixing in a second state pattern."
    ],
    antiPatterns: [
      "Do not scatter business logic across templates, component setup blocks, stores, and ad-hoc utilities without following the repository's current boundary style."
    ],
    patterns: [
      {
        label: "single-file component structure",
        pattern: /<template>|<script\s+setup|defineComponent\(/,
        pathPattern: /\.vue$/,
        guidance: "Preserve the repository's current single-file component structure and script style."
      },
      {
        label: "router or app bootstrap wiring",
        pattern: /createApp\(|createRouter\(|vue-router/,
        pathPattern: /\.(vue|ts|js)$/,
        guidance: "Keep app bootstrap and router wiring aligned with the current entrypoint style."
      },
      {
        label: "store or composable patterns",
        pattern: /defineStore\(|ref\(|reactive\(|computed\(/,
        pathPattern: /\.(vue|ts|js)$/,
        guidance: "Reuse the current composable or store-based state pattern in touched features."
      }
    ]
  },
  {
    key: "react",
    title: "React Hybrid Conventions",
    frameworkNames: ["react"],
    languageNames: ["typescript", "javascript"],
    intro:
      "React hybrid mode: preserve the repo's component, state, and data-fetching boundaries first, then apply compatible React/TypeScript standards on top.",
    standards: [
      "Prefer typed component contracts, hook-side-effect discipline, and small presentational components over implicit shared state.",
      "Keep data loading, mutation, and UI rendering responsibilities separated unless the touched boundary already uses a colocated pattern."
    ],
    antiPatterns: [
      "Do not introduce a second state-management style inside one feature boundary when the repo already converged on hooks, context, Redux, Zustand, or another pattern."
    ],
    patterns: [
      {
        label: "function-component composition",
        pattern: /\bfunction\s+[A-Z][A-Za-z0-9_]*\s*\(|\bconst\s+[A-Z][A-Za-z0-9_]*\s*=\s*\([^)]*\)\s*=>/,
        pathPattern: /\.(tsx|jsx)$/,
        guidance: "Preserve the existing component composition style for touched UI flows."
      },
      {
        label: "hook-driven state/effects",
        pattern: /\buse(State|Effect|Reducer|Context|Transition|DeferredValue|SyncExternalStore)\b/,
        pathPattern: /\.(tsx|jsx|ts|js)$/,
        guidance: "Keep hook usage explicit and side effects localized to the same lifecycle style already present in the repository."
      },
      {
        label: "component test tooling",
        pattern: /@testing-library\/react|render\(|screen\./,
        pathPattern: /\.(test|spec)\.(tsx|jsx|ts|js)$/,
        guidance: "Extend existing component test patterns instead of inventing a second test style."
      }
    ]
  },
  {
    key: "nextjs",
    title: "Next.js Hybrid Conventions",
    frameworkNames: ["nextjs"],
    languageNames: ["typescript", "javascript"],
    intro:
      "Next.js hybrid mode: preserve the repo's routing and server/client split first, then apply compatible Next.js and React standards.",
    standards: [
      "Respect the current app-router or pages-router structure; do not mix paradigms within the same feature without an explicit migration.",
      "Keep server-only and client-only concerns explicit so React rendering rules and framework data boundaries stay aligned."
    ],
    antiPatterns: [
      "Do not move data fetching indiscriminately between server components, client components, and route handlers."
    ],
    patterns: [
      {
        label: "app router conventions",
        pattern: /export\s+default\s+function|\bgenerateMetadata\b|['\"]use client['\"]/,
        pathPattern: /(^|\/)app\/.*\.(tsx|ts|jsx|js)$/,
        guidance: "Preserve the existing app-router component split and client-component declarations."
      },
      {
        label: "pages router conventions",
        pattern: /getServerSideProps|getStaticProps|getStaticPaths/,
        pathPattern: /(^|\/)pages\/.*\.(tsx|ts|jsx|js)$/,
        guidance: "Keep the pages-router data loading pattern consistent where it is already in use."
      },
      {
        label: "route handler boundaries",
        pattern: /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/,
        pathPattern: /route\.(ts|js)$/,
        guidance: "Preserve explicit route-handler contracts and avoid leaking page/component concerns into handlers."
      }
    ]
  },
  {
    key: "express",
    title: "Node/Express Hybrid Conventions",
    frameworkNames: ["express", "node"],
    languageNames: ["typescript", "javascript"],
    intro:
      "Node/Express hybrid mode: preserve the repo's request -> middleware -> service/data flow first, then apply compatible Node standards.",
    standards: [
      "Keep transport concerns at the route or controller boundary and push business logic into reusable services when that boundary already exists.",
      "Preserve explicit async error propagation and input validation patterns rather than introducing ad-hoc shortcuts."
    ],
    antiPatterns: [
      "Do not mix unrelated handler, validation, and persistence styles inside the same API slice."
    ],
    patterns: [
      {
        label: "express routing",
        pattern: /\bexpress\(\)|\bRouter\(\)|\.(get|post|put|patch|delete)\s*\(/,
        pathPattern: /\.(ts|js)$/,
        guidance: "Match the repository's existing route declaration and router composition style."
      },
      {
        label: "middleware/error handling",
        pattern: /\bnext\s*\(|\berr(or)?\b|status\(\d{3}\)/,
        pathPattern: /\.(ts|js)$/,
        guidance: "Preserve middleware-driven error mapping and avoid bypassing the existing error pipeline."
      },
      {
        label: "schema validation",
        pattern: /\bzod\b|\bjoi\b|\byup\b|class-validator/,
        pathPattern: /\.(ts|js)$/,
        guidance: "Use the same validation library and boundary pattern that the repository already uses."
      }
    ]
  },
  {
    key: "nest",
    title: "NestJS Hybrid Conventions",
    frameworkNames: ["nest"],
    languageNames: ["typescript"],
    intro:
      "NestJS hybrid mode: preserve module/controller/service layering first, then apply compatible NestJS and TypeScript standards.",
    standards: [
      "Keep DI-driven boundaries explicit and preserve DTO validation and provider wiring conventions already in the codebase.",
      "Match the existing testing split between unit tests, module tests, and e2e tests."
    ],
    antiPatterns: [
      "Do not bypass Nest dependency injection or decorator-driven module structure with ad-hoc singleton patterns."
    ],
    patterns: [
      {
        label: "controller and service decorators",
        pattern: /@Controller|@Injectable|@Module/,
        pathPattern: /\.(ts|js)$/,
        guidance: "Preserve Nest's controller/service/module layering and keep responsibilities aligned with surrounding modules."
      },
      {
        label: "DTO or validator usage",
        pattern: /class-validator|ValidationPipe|@Body\(|@Param\(/,
        pathPattern: /\.(ts|js)$/,
        guidance: "Keep request validation explicit at the Nest boundary and reuse the established DTO style."
      },
      {
        label: "test wiring",
        pattern: /Test\.createTestingModule|@nestjs\/testing/,
        pathPattern: /\.(test|spec)\.(ts|js)$/,
        guidance: "Follow the repository's existing Nest testing harness instead of inventing a second pattern."
      }
    ]
  },
  {
    key: "fastapi",
    title: "FastAPI Hybrid Conventions",
    frameworkNames: ["fastapi"],
    languageNames: ["python"],
    intro:
      "FastAPI hybrid mode: preserve the repo's router, schema, and dependency boundaries first, then apply compatible FastAPI/Python standards.",
    standards: [
      "Keep Pydantic schema boundaries explicit and preserve request/response typing where the repository already uses it.",
      "Keep dependency injection and async path operation style consistent per module."
    ],
    antiPatterns: [
      "Do not move validation, routing, and persistence logic into a single handler when the repository already separates them."
    ],
    patterns: [
      {
        label: "router declarations",
        pattern: /APIRouter|FastAPI\(/,
        pathPattern: /\.py$/,
        guidance: "Preserve the repository's existing router composition and endpoint registration style."
      },
      {
        label: "Pydantic schemas",
        pattern: /\bBaseModel\b|model_config|Field\(/,
        pathPattern: /\.py$/,
        guidance: "Keep schema validation and serialization explicit at the same boundaries already used."
      },
      {
        label: "dependency injection",
        pattern: /\bDepends\(/,
        pathPattern: /\.py$/,
        guidance: "Reuse FastAPI dependency injection patterns instead of wiring dependencies ad hoc."
      }
    ]
  },
  {
    key: "django",
    title: "Django Hybrid Conventions",
    frameworkNames: ["django"],
    languageNames: ["python"],
    intro:
      "Django hybrid mode: preserve the repo's app boundaries and request/model layering first, then apply compatible Django standards.",
    standards: [
      "Keep settings, models, views, serializers/forms, and migrations aligned with the existing Django or DRF structure.",
      "Preserve explicit validation and permission/auth integration at the same layer already used in the repo."
    ],
    antiPatterns: [
      "Do not mix classic Django views, DRF viewsets, and custom service layers arbitrarily inside one feature."
    ],
    patterns: [
      {
        label: "django app wiring",
        pattern: /INSTALLED_APPS|urlpatterns|manage\.py|models\.Model/,
        pathPattern: /\.py$/,
        guidance: "Preserve the repository's existing app and URL layout."
      },
      {
        label: "DRF conventions",
        pattern: /APIView|ViewSet|ModelSerializer|Serializer/,
        pathPattern: /\.py$/,
        guidance: "Keep API boundaries aligned with the repository's existing DRF patterns where present."
      },
      {
        label: "pytest or Django tests",
        pattern: /\bpytest\b|TestCase|APITestCase/,
        pathPattern: /(^|\/)tests?\/.*\.py$|_test\.py$|test_.*\.py$/,
        guidance: "Follow the existing Django testing style for touched flows."
      }
    ]
  },
  {
    key: "spring-boot",
    title: "Spring Boot Hybrid Conventions",
    frameworkNames: ["spring-boot"],
    languageNames: ["java", "kotlin"],
    intro:
      "Spring Boot hybrid mode: preserve the repo's controller/service/repository layering first, then apply compatible Spring standards.",
    standards: [
      "Keep bean wiring, configuration properties, and transaction boundaries explicit at the same architectural layer already used.",
      "Preserve the existing split between unit tests, slice tests, and integration tests."
    ],
    antiPatterns: [
      "Do not bypass the established service layer by pushing business logic directly into controllers or repositories."
    ],
    patterns: [
      {
        label: "Spring stereotype annotations",
        pattern: /@RestController|@Controller|@Service|@Repository|@Component/,
        pathPattern: /\.(java|kt)$/,
        guidance: "Preserve Spring stereotype boundaries and reuse the same layering in touched modules."
      },
      {
        label: "configuration and transaction usage",
        pattern: /@ConfigurationProperties|@Transactional|application\.(ya?ml|properties)/,
        pathPattern: /\.(java|kt|ya?ml|properties)$/,
        guidance: "Keep configuration and transaction semantics explicit and aligned with existing patterns."
      },
      {
        label: "Spring testing style",
        pattern: /@SpringBootTest|MockMvc|WebMvcTest|DataJpaTest/,
        pathPattern: /\.(java|kt)$/,
        guidance: "Extend the test slice strategy already present in the repository."
      }
    ]
  },
  {
    key: "aspnet",
    title: "ASP.NET Core Hybrid Conventions",
    frameworkNames: ["aspnet"],
    languageNames: ["csharp"],
    intro:
      "ASP.NET Core hybrid mode: preserve the repo's host, DI, and endpoint layering first, then apply compatible .NET standards.",
    standards: [
      "Keep service registration, options binding, and endpoint mapping aligned with the current startup pattern.",
      "Preserve typed contracts, explicit validation, and test boundaries used by the repository."
    ],
    antiPatterns: [
      "Do not mix minimal APIs, MVC controllers, and custom pipeline behavior arbitrarily inside one bounded area."
    ],
    patterns: [
      {
        label: "host and DI wiring",
        pattern: /builder\.Services|WebApplication\.CreateBuilder|IServiceCollection/,
        pathPattern: /\.cs$/,
        guidance: "Preserve the repository's existing dependency registration and application bootstrap style."
      },
      {
        label: "controller or minimal API endpoints",
        pattern: /\[ApiController\]|\[Route\(|Map(Get|Post|Put|Patch|Delete)\(/,
        pathPattern: /\.cs$/,
        guidance: "Match the endpoint style already used in the touched boundary."
      },
      {
        label: "test framework usage",
        pattern: /\[(Fact|Theory|Test|TestMethod)\]/,
        pathPattern: /\.cs$/,
        guidance: "Reuse the existing .NET test stack instead of introducing a second one."
      }
    ]
  },
  {
    key: "flutter",
    title: "Flutter Hybrid Conventions",
    frameworkNames: ["flutter"],
    languageNames: ["dart"],
    intro:
      "Flutter hybrid mode: preserve the repo's widget/state/data boundaries first, then apply compatible Dart and Flutter standards.",
    standards: [
      "Keep build methods side-effect free, preserve mounted/lifecycle-safe async UI handling, and prefer the repository's existing state boundary over introducing a new state stack.",
      "Use widget tests for UI flows and keep localization, theming, and navigation aligned with the current app structure."
    ],
    antiPatterns: [
      "Do not mix unrelated state-management libraries or move transport/persistence logic into leaf widgets when a service/controller boundary already exists."
    ],
    patterns: [
      {
        label: "widget composition",
        pattern: /extends\s+(StatelessWidget|StatefulWidget)|MaterialApp|CupertinoApp/,
        pathPattern: /\.dart$/,
        guidance: "Preserve the repository's current widget composition and app-shell structure."
      },
      {
        label: "state and async UI flow",
        pattern: /\bChangeNotifier\b|\bsetState\s*\(|\bFuture<|\bmounted\b/,
        pathPattern: /\.dart$/,
        guidance: "Keep state transitions and async UI handling consistent with the existing lifecycle pattern."
      },
      {
        label: "localization, theme, or navigation wiring",
        pattern: /supportedLocales|localizationsDelegates|ThemeData|Navigator|go_router/,
        pathPattern: /\.dart$/,
        guidance: "Preserve the repository's current app-wide localization, theming, and navigation wiring."
      }
    ]
  },
  {
    key: "android",
    title: "Android Hybrid Conventions",
    frameworkNames: ["android"],
    languageNames: ["kotlin", "java"],
    intro:
      "Android hybrid mode: preserve the repo's module, UI, and state boundaries first, then apply compatible Android/Kotlin standards.",
    standards: [
      "Keep Activity/Fragment or Compose boundaries explicit, preserve ViewModel/coroutine state flow where present, and keep manifest/resource changes scoped.",
      "Respect existing Gradle module structure, test layering, and permission/resource conventions."
    ],
    antiPatterns: [
      "Do not mix Compose, legacy XML views, and navigation/state approaches arbitrarily inside one feature without an explicit migration."
    ],
    patterns: [
      {
        label: "Compose UI conventions",
        pattern: /@Composable|setContent\s*\{/,
        pathPattern: /\.(kt|java)$/,
        guidance: "Keep Compose usage aligned with the repository's existing UI and state patterns."
      },
      {
        label: "ViewModel or coroutine state",
        pattern: /\bViewModel\b|\bviewModelScope\b|\bStateFlow\b|\bLiveData\b|\bsuspend\b/,
        pathPattern: /\.(kt|java)$/,
        guidance: "Preserve the current Android state and async model instead of introducing a competing one."
      },
      {
        label: "manifest and navigation wiring",
        pattern: /<activity|<service|NavHost|navigation/i,
        pathPattern: /AndroidManifest\.xml$|\.(kt|xml)$/,
        guidance: "Keep manifest, navigation, and permission wiring consistent with the module's existing setup."
      }
    ]
  },
  {
    key: "ios",
    title: "iOS Hybrid Conventions",
    frameworkNames: ["ios"],
    languageNames: ["swift"],
    intro:
      "iOS hybrid mode: preserve the repo's app/module and UI-flow boundaries first, then apply compatible Swift/iOS standards.",
    standards: [
      "Keep SwiftUI or UIKit usage consistent within a touched feature, preserve async lifecycle safety, and keep target/config changes explicit.",
      "Match the repository's testing, navigation, and service-boundary patterns rather than introducing parallel architectures."
    ],
    antiPatterns: [
      "Do not mix SwiftUI, UIKit, coordinator, and ad-hoc navigation patterns arbitrarily inside one flow without a deliberate migration."
    ],
    patterns: [
      {
        label: "SwiftUI or UIKit UI layer",
        pattern: /\bSwiftUI\b|struct\s+[A-Za-z0-9_]+\s*:\s*View|UIViewController/,
        pathPattern: /\.swift$/,
        guidance: "Preserve the repository's current iOS UI paradigm in the touched boundary."
      },
      {
        label: "async lifecycle and service flow",
        pattern: /\basync\b|\bawait\b|URLSession|Task\s*\{/,
        pathPattern: /\.swift$/,
        guidance: "Keep async work and service access aligned with the existing lifecycle-safe pattern."
      },
      {
        label: "XCTest conventions",
        pattern: /XCTestCase|func\s+test[A-Za-z0-9_]*\s*\(/,
        pathPattern: /\.swift$/,
        guidance: "Extend the existing XCTest style for verification instead of adding a second test harness."
      }
    ]
  }
];

async function buildHybridStackSections(args: {
  repoRoot: string;
  files: string[];
  profile: ProjectProfile;
}): Promise<RulebookSection[]> {
  const flutterRepo = hasStrongFlutterSignal(args.profile);
  const ranked = STACK_SPECIALIZERS.map((config) => {
    const frameworkScore = (config.frameworkNames ?? [])
      .map((name) => args.profile.frameworks.find((framework) => framework.name === name)?.confidence ?? 0)
      .reduce((max, value) => Math.max(max, value), 0);
    const languageScore = (config.languageNames ?? [])
      .map((name) => args.profile.languages.find((language) => language.name === name)?.confidence ?? 0)
      .reduce((max, value) => Math.max(max, value), 0);
    const requiresFrameworkMatch = (config.frameworkNames?.length ?? 0) > 0;
    const eligible = requiresFrameworkMatch
      ? frameworkScore >= 0.5 && (!flutterRepo || (config.key !== "android" && config.key !== "ios"))
      : Math.max(frameworkScore, languageScore) >= 0.5;

    return {
      config,
      score: frameworkScore > 0 ? frameworkScore + languageScore * 0.1 : languageScore,
      eligible
    };
  })
    .filter((item) => item.eligible && item.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const sections: RulebookSection[] = [];

  for (const item of ranked) {
    const { config } = item;
    const evidence = profileEvidenceForNames(args.profile, config.frameworkNames, config.languageNames);
    const bullets: string[] = [withEvidence(config.intro, evidence)];
    const candidates: ConventionCandidate[] = [
      ...(await extractRetentionConventionCandidates(args.repoRoot, args.files, config.key)),
      ...(await extractAstConventionCandidates(args.repoRoot, args.files, config.key)),
      ...extractBoundaryConventionCandidates(config.key, args.files),
      ...(await extractSemanticBoundaryConventionCandidates(args.repoRoot, args.files, config.key))
    ];

    let patternMatches = 0;
    for (const descriptor of config.patterns) {
      const candidateFiles = patternFilesForDescriptor(args.files, descriptor);
      if (candidateFiles.length === 0) continue;
      const hit = await collectPatternEvidence({
        repoRoot: args.repoRoot,
        files: candidateFiles,
        pattern: descriptor.pattern,
        maxEvidence: 4
      });
      if (hit.count === 0) continue;
      patternMatches += 1;
      candidates.push({
        topic: descriptor.topic ?? inferConventionTopic(`${descriptor.label} ${descriptor.guidance}`),
        source: "repo",
        text: `${descriptor.label}. ${descriptor.guidance}`,
        evidence: hit.evidence
      });
    }

    if (patternMatches === 0) {
      candidates.push({
        topic: "general",
        source: "repo",
        text: `No high-signal ${displayFrameworkName(config.key)} sub-pattern was auto-detected beyond stack signals; preserve the touched files' local structure and apply only compatible standards.`,
        evidence
      });
    }

    for (const standard of config.standards) {
      const descriptor = typeof standard === "string" ? { text: standard } : standard;
      candidates.push({
        topic: descriptor.topic ?? inferConventionTopic(descriptor.text),
        source: "standard",
        text: descriptor.text,
        evidence
      });
    }
    for (const antiPattern of config.antiPatterns) {
      const descriptor = typeof antiPattern === "string" ? { text: antiPattern } : antiPattern;
      candidates.push({
        topic: descriptor.topic ?? inferConventionTopic(descriptor.text),
        source: "anti-pattern",
        text: descriptor.text,
        evidence
      });
    }

    for (const candidate of mergeConventionCandidates(candidates)) {
      bullets.push(withEvidence(renderCandidate(candidate), candidate.evidence));
    }

    sections.push({
      title: config.title,
      bullets
    });
  }

  return sections;
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
  const strictLanguages = visibleLanguagesForRulebook(args.profile).filter((language) => language.confidence >= 0.25);
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

async function buildRulebookUnknowns(args: {
  repoRoot: string;
  files: string[];
  profile: ProjectProfile;
}): Promise<string[]> {
  const unknowns: string[] = [];
  const strongFrameworks = args.profile.frameworks.filter((framework) => framework.confidence >= 0.6);
  const flutterDominant = hasStrongFlutterSignal(args.profile);
  const materiallyDistinctStrongFrameworks = flutterDominant
    ? strongFrameworks.filter((framework) => !FLUTTER_PLATFORM_FRAMEWORKS.has(framework.name))
    : strongFrameworks;

  if (materiallyDistinctStrongFrameworks.length > 1) {
    unknowns.push(
      `Multiple strong framework signals remain active (${materiallyDistinctStrongFrameworks.map((framework) => framework.name).join(", ")}); prefer touched-boundary local conventions and avoid cross-framework migrations unless the task explicitly requires them.`
    );
  }

  const nextAppRouter = await collectPatternEvidence({
    repoRoot: args.repoRoot,
    files: args.files.filter((file) => /(^|\/)app\/.*\.(tsx|ts|jsx|js)$/.test(file)),
    pattern: /export\s+default\s+function|\bgenerateMetadata\b|['"]use client['"]/,
    maxEvidence: 3
  });
  const nextPagesRouter = await collectPatternEvidence({
    repoRoot: args.repoRoot,
    files: args.files.filter((file) => /(^|\/)pages\/.*\.(tsx|ts|jsx|js)$/.test(file)),
    pattern: /getServerSideProps|getStaticProps|getStaticPaths/,
    maxEvidence: 3
  });
  if (nextAppRouter.count > 0 && nextPagesRouter.count > 0) {
    unknowns.push("Both Next.js app-router and pages-router patterns are present; do not mix routing paradigms in the same feature without an explicit migration decision.");
  }

  const flutterStateSignals = await Promise.all([
    collectPatternEvidence({ repoRoot: args.repoRoot, files: filterFilesForLanguage(args.files, "dart"), pattern: /\bChangeNotifier\b/, maxEvidence: 2 }),
    collectPatternEvidence({ repoRoot: args.repoRoot, files: filterFilesForLanguage(args.files, "dart"), pattern: /\bBloc\b/, maxEvidence: 2 }),
    collectPatternEvidence({ repoRoot: args.repoRoot, files: filterFilesForLanguage(args.files, "dart"), pattern: /\bRiverpod\b/, maxEvidence: 2 })
  ]);
  const activeFlutterStateModels = [
    flutterStateSignals[0]?.count ? "ChangeNotifier" : undefined,
    flutterStateSignals[1]?.count ? "Bloc" : undefined,
    flutterStateSignals[2]?.count ? "Riverpod" : undefined
  ].filter((value): value is string => Boolean(value));
  if (activeFlutterStateModels.length > 1) {
    unknowns.push(`Multiple Flutter state-management paradigms are present (${activeFlutterStateModels.join(", ")}); keep changes inside the touched boundary's existing state style and avoid spreading one pattern across the other without migration scope.`);
  }

  const flutterNavigationSignals = await Promise.all([
    collectPatternEvidence({ repoRoot: args.repoRoot, files: filterFilesForLanguage(args.files, "dart"), pattern: /\bGoRouter\b/, maxEvidence: 2 }),
    collectPatternEvidence({ repoRoot: args.repoRoot, files: filterFilesForLanguage(args.files, "dart"), pattern: /\b(MaterialPageRoute|Navigator\.)\b/, maxEvidence: 2 })
  ]);
  const activeFlutterNavigationModels = [
    flutterNavigationSignals[0]?.count ? "go_router" : undefined,
    flutterNavigationSignals[1]?.count ? "Navigator" : undefined
  ].filter((value): value is string => Boolean(value));
  if (activeFlutterNavigationModels.length > 1) {
    unknowns.push(`Multiple Flutter navigation paradigms are present (${activeFlutterNavigationModels.join(", ")}); keep changes within the touched flow's existing navigation style unless the task is an explicit routing migration.`);
  }

  const frontendStateSignals = await Promise.all([
    collectPatternEvidence({ repoRoot: args.repoRoot, files: args.files.filter((file) => /\.(tsx|jsx|ts|js|vue)$/.test(file)), pattern: /\buseReducer\b|\bcreateContext\b/, maxEvidence: 2 }),
    collectPatternEvidence({ repoRoot: args.repoRoot, files: args.files.filter((file) => /\.(tsx|jsx|ts|js|vue)$/.test(file)), pattern: /\bRedux\b|\bconfigureStore\b|\bcreateSlice\b/, maxEvidence: 2 }),
    collectPatternEvidence({ repoRoot: args.repoRoot, files: args.files.filter((file) => /\.(tsx|jsx|ts|js|vue)$/.test(file)), pattern: /\bZustand\b|\bcreate\s*\(\s*\(|\bdefineStore\b/, maxEvidence: 2 })
  ]);
  const activeFrontendStateModels = [
    frontendStateSignals[0]?.count ? "hooks/context" : undefined,
    frontendStateSignals[1]?.count ? "redux" : undefined,
    frontendStateSignals[2]?.count ? "store/composable" : undefined
  ].filter((value): value is string => Boolean(value));
  if (activeFrontendStateModels.length > 1) {
    unknowns.push(`Multiple frontend state paradigms are present (${activeFrontendStateModels.join(", ")}); keep changes within the touched feature's existing state model unless an explicit consolidation plan exists.`);
  }

  const androidUiSignals = await Promise.all([
    collectPatternEvidence({ repoRoot: args.repoRoot, files: args.files.filter((file) => /\.(kt|java)$/.test(file)), pattern: /@Composable|setContent\s*\{/, maxEvidence: 2 }),
    collectPatternEvidence({ repoRoot: args.repoRoot, files: args.files.filter((file) => /\.(kt|java)$/.test(file)), pattern: /\b(Fragment|AppCompatActivity|ComponentActivity)\b/, maxEvidence: 2 })
  ]);
  const activeAndroidUiModels = [
    androidUiSignals[0]?.count ? "compose" : undefined,
    androidUiSignals[1]?.count ? "activity/fragment" : undefined
  ].filter((value): value is string => Boolean(value));
  if (activeAndroidUiModels.length > 1) {
    unknowns.push(`Multiple Android UI paradigms are present (${activeAndroidUiModels.join(", ")}); keep touched code within the existing screen model unless the task is an explicit migration.`);
  }

  const iosUiSignals = await Promise.all([
    collectPatternEvidence({ repoRoot: args.repoRoot, files: args.files.filter((file) => /\.swift$/.test(file)), pattern: /\bSwiftUI\b|struct\s+[A-Za-z0-9_]+\s*:\s*View|NavigationStack/, maxEvidence: 2 }),
    collectPatternEvidence({ repoRoot: args.repoRoot, files: args.files.filter((file) => /\.swift$/.test(file)), pattern: /\bUIViewController\b|\bUINavigationController\b/, maxEvidence: 2 })
  ]);
  const activeIosUiModels = [
    iosUiSignals[0]?.count ? "swiftui" : undefined,
    iosUiSignals[1]?.count ? "uikit" : undefined
  ].filter((value): value is string => Boolean(value));
  if (activeIosUiModels.length > 1) {
    unknowns.push(`Multiple iOS UI paradigms are present (${activeIosUiModels.join(", ")}); keep changes within the touched module's current UI style unless a migration is explicitly in scope.`);
  }

  return dedupe(unknowns);
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
    sections,
    unknowns: []
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
  const visibleLanguages = visibleLanguagesForRulebook(profile);
  const visibleFrameworks = visibleFrameworksForRulebook(profile);

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

  const languageConventions = visibleLanguages.slice(0, 8).map((language) => {
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

  const frameworkConventions = visibleFrameworks.slice(0, 10).map((framework) => {
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

  const strongFrameworks = visibleFrameworks.filter((framework) => framework.confidence >= 0.6);
  const mixedLanguage = visibleLanguages.filter((language) => language.confidence >= 0.25).length >= 3;
  const weakSignals = strongFrameworks.length === 0;
  const isBootstrapProfile = profile.guardrails.notes.some((note) => /bootstrapp?ed/i.test(note));
  const hasLaravel = profile.frameworks.some((framework) => framework.name === "laravel" && framework.confidence >= 0.5);
  const rulebookUnknowns = await buildRulebookUnknowns({
    repoRoot,
    files: sourceFiles,
    profile
  });

  const snapshot: string[] = [
    withEvidence(
      `Detected frameworks: ${visibleFrameworks.map((framework) => `${framework.name} (${framework.confidence})`).join(", ") || "none"}.`,
      visibleFrameworks.flatMap((framework) => framework.evidence)
    ),
    withEvidence(
      `Detected languages: ${visibleLanguages.map((language) => `${language.name} (${language.confidence})`).join(", ") || "none"}.`,
      visibleLanguages.flatMap((language) => language.evidence)
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
    withTrailingPeriod(`Install command: ${profile.build.commands.install ?? "UNKNOWN"}`),
    withTrailingPeriod(`Build command: ${profile.build.commands.build ?? "UNKNOWN"}`),
    withTrailingPeriod(`Test command: ${profile.build.commands.test ?? "UNKNOWN"}`),
    withTrailingPeriod(`Lint command: ${profile.build.commands.lint ?? "UNKNOWN"}`),
    withTrailingPeriod(`Format command: ${profile.build.commands.format ?? "UNKNOWN"}`)
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

  const hybridStackSections = await buildHybridStackSections({
    repoRoot,
    files: sourceFiles,
    profile
  });
  sections.push(...hybridStackSections);

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
          visibleFrameworks.flatMap((framework) => framework.evidence)
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
    sections,
    unknowns: rulebookUnknowns
  };
}
