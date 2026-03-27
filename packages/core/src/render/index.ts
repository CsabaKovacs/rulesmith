import Handlebars from "handlebars";
import { createTwoFilesPatch } from "diff";
import crypto from "node:crypto";
import { evaluateDecisionTree } from "../dtree/index.js";
import { writeFileSafe } from "../fs/safe.js";
import { getPack, listPacks } from "../packs/index.js";
import type { ProjectProfile } from "../profile/schema.js";
import { buildRulebook, MANDATORY_CONVENTIONS_TITLE } from "./rulebook.js";
import { scanRepo } from "../scanner/index.js";

/**
 * In-memory artifact store for rendered rule files.
 * Keeps rendered outputs server-side so the AI host does not need to
 * relay large payloads back through apply_rules.
 */
const artifactStore = new Map<string, { files: GeneratedFile[]; createdAt: number }>();
const ARTIFACT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ARTIFACTS = 100;

function pruneExpiredArtifacts(): void {
  const now = Date.now();
  for (const [id, entry] of artifactStore) {
    if (now - entry.createdAt > ARTIFACT_TTL_MS) {
      artifactStore.delete(id);
    }
  }
}

export function storeArtifact(files: GeneratedFile[]): string {
  pruneExpiredArtifacts();
  if (artifactStore.size >= MAX_ARTIFACTS) {
    const oldestKey = artifactStore.keys().next().value;
    if (oldestKey) artifactStore.delete(oldestKey);
  }
  const id = crypto.randomUUID();
  artifactStore.set(id, { files, createdAt: Date.now() });
  return id;
}

export function getArtifact(id: string): GeneratedFile[] | null {
  pruneExpiredArtifacts();
  const entry = artifactStore.get(id);
  return entry ? entry.files : null;
}

export function consumeArtifact(id: string): GeneratedFile[] | null {
  pruneExpiredArtifacts();
  const entry = artifactStore.get(id);
  if (entry) {
    artifactStore.delete(id);
    return entry.files;
  }
  return null;
}

export type RenderTargets = {
  codex: boolean;
  copilot: boolean;
  claude: boolean;
  junie: boolean;
  gemini: boolean;
  antigravity: boolean;
};

export type StrictnessLevel = "baseline" | "strict" | "very-strict";
export type StandardsMode = "auto" | "project-only" | "project-plus-standard";
export type OutputProfile = "short" | "strict";

export type RenderPolicy = {
  strictness?: StrictnessLevel;
  standards?: StandardsMode;
  copilotProfile?: OutputProfile;
  claudeProfile?: OutputProfile;
  junieProfile?: OutputProfile;
  geminiProfile?: OutputProfile;
  antigravityProfile?: OutputProfile;
};

export type GeneratedFile = {
  path: string;
  content: string;
};

export type BootstrapWeightedInput = {
  name: string;
  confidence?: number;
  evidence?: string[];
};

export type BootstrapSeed = {
  signals?: {
    configFiles?: string[];
    ciFiles?: string[];
    entrypoints?: string[];
  };
  languages?: BootstrapWeightedInput[];
  frameworks?: BootstrapWeightedInput[];
  build?: {
    commands?: {
      install?: string;
      build?: string;
      test?: string;
      lint?: string;
      format?: string;
      dev?: string;
    };
    evidence?: string[];
  };
  structure?: {
    monorepo?: boolean;
    workspaces?: string[];
    generatedDirs?: string[];
    vendorDirs?: string[];
  };
  guardrails?: {
    forbiddenPaths?: string[];
    notes?: string[];
  };
};

function validateStrictMandatoryConventions(files: GeneratedFile[], policy: Required<RenderPolicy>): void {
  if (policy.strictness === "baseline") return;

  const requiredTargets = new Set([
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".junie/guidelines.md",
    ".agent/rules/rulesmith.instructions.md",
    ".github/copilot-instructions.md"
  ]);

  for (const file of files) {
    if (!requiredTargets.has(file.path)) continue;
    if (!file.content.includes(MANDATORY_CONVENTIONS_TITLE)) {
      throw new Error(
        `Strict rule generation requires "${MANDATORY_CONVENTIONS_TITLE}" section in ${file.path}, but it was not found.`
      );
    }
  }
}

function pickAreaSections(
  rulebook: Awaited<ReturnType<typeof buildRulebook>>,
  area: { name: string; applyTo: string }
): Array<{ title: string; bullets: string[] }> {
  const needle = `${area.name} ${area.applyTo}`.toLowerCase();
  const wanted = new Set<string>();

  if (needle.includes("route")) {
    wanted.add("Routing Conventions");
    wanted.add("Auth, Permissions, and Middleware");
    wanted.add("Execution Guardrails");
  }
  if (needle.includes("controller")) {
    wanted.add("Controller Conventions");
    wanted.add("Validation, Models, and Database");
    wanted.add("Auth, Permissions, and Middleware");
    wanted.add("Execution Guardrails");
  }

  let picked = rulebook.sections.filter((section) => wanted.has(section.title));
  if (picked.length === 0) {
    const genericTitles = new Set(["Repository Layout", "Build, Test, and Tooling", "Execution Guardrails", "Implementation Playbook"]);
    picked = rulebook.sections.filter((section) => genericTitles.has(section.title));
  }
  if (picked.length === 0) {
    picked = rulebook.sections.slice(0, 3);
  }

  return picked.map((section) => ({
    title: section.title,
    bullets: section.bullets.slice(0, 8)
  }));
}

function renderTemplate(source: string, context: Record<string, unknown>): string {
  const template = Handlebars.compile(source, { noEscape: true });
  return template(context).trimEnd() + "\n";
}

function pickTemplate(templates: Record<string, string>, name: string): string {
  const template = templates[name];
  if (!template) {
    throw new Error(`Template missing: ${name}`);
  }
  return template;
}

function toTemplateContext(
  profile: ProjectProfile,
  options: {
    unknowns: string[];
    snippets: string[];
    areas: { name: string; applyTo: string }[];
    rulebook: Awaited<ReturnType<typeof buildRulebook>>;
    policy: Required<RenderPolicy>;
  }
): Record<string, unknown> {
  return {
    profile,
    buildCommands: profile.build.commands,
    hasLaravel: profile.frameworks.some((f) => f.name === "laravel" && f.confidence >= 0.5),
    unknowns: options.unknowns,
    snippets: options.snippets,
    areaInstructions: options.areas,
    rulebook: options.rulebook,
    policy: options.policy,
    copilotStrict: options.policy.copilotProfile === "strict",
    claudeStrict: options.policy.claudeProfile === "strict",
    junieStrict: options.policy.junieProfile === "strict",
    geminiStrict: options.policy.geminiProfile === "strict",
    antigravityStrict: options.policy.antigravityProfile === "strict"
  };
}

function normalizeWeightedInput(items: BootstrapWeightedInput[] | undefined): Array<{ name: string; confidence: number; evidence: string[] }> {
  if (!items || items.length === 0) return [];
  return items
    .map((item) => {
      const confidence = typeof item.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : 0.9;
      const evidence = item.evidence && item.evidence.length > 0 ? item.evidence : ["bootstrap:seed"];
      return {
        name: item.name.trim().toLowerCase(),
        confidence: Number(confidence.toFixed(2)),
        evidence
      };
    })
    .filter((item) => item.name.length > 0);
}

export function profileFromBootstrapSeed(args: { repoPath: string; seed: BootstrapSeed }): ProjectProfile {
  const now = new Date().toISOString();
  const configFiles = [
    ...new Set([
      ...(args.seed.signals?.configFiles ?? []),
      ...((args.seed.build?.evidence ?? []).map((item) => item.split("#")[0] ?? item))
    ])
  ];
  const ciFiles = [...new Set(args.seed.signals?.ciFiles ?? [])];
  const entrypoints = [...new Set(args.seed.signals?.entrypoints ?? [])];

  const generatedDirs = [...new Set(args.seed.structure?.generatedDirs ?? ["dist", "build", "coverage", ".dart_tool"])];
  const vendorDirs = [...new Set(args.seed.structure?.vendorDirs ?? ["node_modules", "vendor"])];
  const forbiddenPaths = [...new Set(args.seed.guardrails?.forbiddenPaths ?? [".git", ...vendorDirs])];

  return {
    repoRoot: args.repoPath,
    signals: {
      configFiles,
      ciFiles,
      entrypoints
    },
    languages: normalizeWeightedInput(args.seed.languages),
    frameworks: normalizeWeightedInput(args.seed.frameworks),
    build: {
      commands: args.seed.build?.commands ?? {},
      evidence: args.seed.build?.evidence ?? ["bootstrap:seed"]
    },
    structure: {
      monorepo: args.seed.structure?.monorepo ?? false,
      workspaces: args.seed.structure?.workspaces,
      generatedDirs,
      vendorDirs
    },
    guardrails: {
      forbiddenPaths,
      notes: [
        "Profile bootstrapped from user-provided seed (no repository scan).",
        ...(args.seed.guardrails?.notes ?? [])
      ]
    },
    meta: {
      scannedAt: now
    }
  };
}

async function renderRulesForProfile(args: {
  profile: ProjectProfile;
  pack?: string;
  overrides?: string;
  targets: RenderTargets;
  policy?: RenderPolicy;
}): Promise<GeneratedFile[]> {
  const pack = await getPack({ pack: args.pack, overrides: args.overrides });
  const decision = evaluateDecisionTree(pack.decisionTree, args.profile);
  const policy: Required<RenderPolicy> = {
    strictness: args.policy?.strictness ?? "strict",
    standards: args.policy?.standards ?? "auto",
    copilotProfile: args.policy?.copilotProfile ?? "strict",
    claudeProfile: args.policy?.claudeProfile ?? "strict",
    junieProfile: args.policy?.junieProfile ?? "strict",
    geminiProfile: args.policy?.geminiProfile ?? "strict",
    antigravityProfile: args.policy?.antigravityProfile ?? "strict"
  };

  const effectiveTargets: RenderTargets = {
    codex: args.targets.codex && decision.enabledTargets.has("codex"),
    copilot: args.targets.copilot && decision.enabledTargets.has("copilot"),
    claude: args.targets.claude && decision.enabledTargets.has("claude"),
    junie: args.targets.junie && decision.enabledTargets.has("junie"),
    gemini: args.targets.gemini && decision.enabledTargets.has("gemini"),
    antigravity: args.targets.antigravity && decision.enabledTargets.has("antigravity")
  };

  const unknowns: string[] = [];
  if (!args.profile.build.commands.test) unknowns.push("Test command is not confidently detected.");
  if (!args.profile.build.commands.lint) unknowns.push("Lint command is not confidently detected.");
  if (!args.profile.build.commands.format) unknowns.push("Format command is not confidently detected.");
  if (!args.profile.build.commands.build) unknowns.push("Build command is not confidently detected.");

  const rulebook = await buildRulebook(args.profile, policy);

  const context = toTemplateContext(args.profile, {
    unknowns,
    snippets: decision.snippets,
    areas: decision.areaInstructions,
    rulebook,
    policy
  });

  const files: GeneratedFile[] = [];

  if (effectiveTargets.codex) {
    files.push({
      path: "AGENTS.md",
      content: renderTemplate(pickTemplate(pack.templates, "agents.md.hbs"), context)
    });
  }

  if (effectiveTargets.claude) {
    files.push({
      path: "CLAUDE.md",
      content: renderTemplate(pickTemplate(pack.templates, "claude.md.hbs"), context)
    });
  }

  if (effectiveTargets.copilot) {
    files.push({
      path: ".github/copilot-instructions.md",
      content: renderTemplate(pickTemplate(pack.templates, "copilot-instructions.md.hbs"), context)
    });

    const areaTemplate = pack.templates["copilot-area.instructions.md.hbs"];
    if (areaTemplate) {
      for (const area of decision.areaInstructions) {
        const safeName = area.name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
        const areaSections = pickAreaSections(rulebook, area);
        files.push({
          path: `.github/instructions/${safeName}.instructions.md`,
          content: renderTemplate(areaTemplate, {
            ...context,
            area,
            areaSections
          })
        });
      }
    }
  }

  if (effectiveTargets.junie) {
    files.push({
      path: ".junie/guidelines.md",
      content: renderTemplate(pickTemplate(pack.templates, "junie-guidelines.md.hbs"), context)
    });
  }

  if (effectiveTargets.gemini) {
    files.push({
      path: "GEMINI.md",
      content: renderTemplate(pickTemplate(pack.templates, "gemini.md.hbs"), context)
    });
  }

  if (effectiveTargets.antigravity) {
    files.push({
      path: ".agent/rules/rulesmith.instructions.md",
      content: renderTemplate(pickTemplate(pack.templates, "antigravity-rules.md.hbs"), context)
    });
  }

  validateStrictMandatoryConventions(files, policy);

  return files;
}

export async function renderRules(args: {
  repoPath: string;
  pack?: string;
  overrides?: string;
  targets: RenderTargets;
  policy?: RenderPolicy;
}): Promise<GeneratedFile[]> {
  const profile = await scanRepo(args.repoPath);
  return renderRulesForProfile({
    profile,
    pack: args.pack,
    overrides: args.overrides,
    targets: args.targets,
    policy: args.policy
  });
}

export async function bootstrapRules(args: {
  repoPath: string;
  seed: BootstrapSeed;
  pack?: string;
  overrides?: string;
  targets: RenderTargets;
  policy?: RenderPolicy;
}): Promise<GeneratedFile[]> {
  const profile = profileFromBootstrapSeed({ repoPath: args.repoPath, seed: args.seed });
  return renderRulesForProfile({
    profile,
    pack: args.pack,
    overrides: args.overrides,
    targets: args.targets,
    policy: args.policy
  });
}

export async function diffRules(args: {
  repoPath: string;
  files: GeneratedFile[];
}): Promise<string> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const chunks: string[] = [];
  for (const file of args.files) {
    const fullPath = path.resolve(args.repoPath, file.path);
    const previous = await fs.readFile(fullPath, "utf8").catch(() => "");
    const patch = createTwoFilesPatch(file.path, file.path, previous, file.content, "before", "after", {
      context: 3
    });
    chunks.push(patch);
  }

  return chunks.join("\n");
}

export async function applyRules(args: {
  repoPath: string;
  files: GeneratedFile[];
  mode?: "safe" | "force";
}): Promise<{ written: string[] }> {
  const written: string[] = [];
  for (const file of args.files) {
    await writeFileSafe({
      repoRoot: args.repoPath,
      relativePath: file.path,
      content: file.content,
      mode: args.mode ?? "safe"
    });
    written.push(file.path);
  }
  return { written };
}

/**
 * Render rules and apply them in a single operation.
 * The content never passes through the AI host, preventing truncation.
 */
export async function renderAndApplyRules(args: {
  repoPath: string;
  pack?: string;
  overrides?: string;
  targets: RenderTargets;
  policy?: RenderPolicy;
  mode?: "safe" | "force";
}): Promise<{ rendered: GeneratedFile[]; written: string[]; diff: string }> {
  const files = await renderRules({
    repoPath: args.repoPath,
    pack: args.pack,
    overrides: args.overrides,
    targets: args.targets,
    policy: args.policy
  });

  const diffResult = await diffRules({ repoPath: args.repoPath, files });

  const { written } = await applyRules({
    repoPath: args.repoPath,
    files,
    mode: args.mode ?? "force"
  });

  return {
    rendered: files.map(f => ({ path: f.path, content: `[${f.content.length} chars]` })),
    written,
    diff: diffResult
  };
}

/**
 * Apply previously rendered rules using an artifact ID.
 * The artifact was stored server-side during render_rules.
 */
export async function applyRenderedRules(args: {
  repoPath: string;
  artifactId: string;
  mode?: "safe" | "force";
}): Promise<{ written: string[] }> {
  const files = consumeArtifact(args.artifactId);
  if (!files) {
    throw new Error(`Artifact not found or expired: ${args.artifactId}. Re-run render_rules to generate a new artifact.`);
  }
  return applyRules({
    repoPath: args.repoPath,
    files,
    mode: args.mode ?? "force"
  });
}

export { getPack, listPacks };
