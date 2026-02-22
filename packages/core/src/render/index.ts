import Handlebars from "handlebars";
import { createTwoFilesPatch } from "diff";
import { evaluateDecisionTree } from "../dtree/index.js";
import { writeFileSafe } from "../fs/safe.js";
import { getPack, listPacks } from "../packs/index.js";
import type { ProjectProfile } from "../profile/schema.js";
import { buildRulebook } from "./rulebook.js";
import { scanRepo } from "../scanner/index.js";

export type RenderTargets = {
  codex: boolean;
  copilot: boolean;
  claude: boolean;
  junie: boolean;
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
};

export type GeneratedFile = {
  path: string;
  content: string;
};

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
    junieStrict: options.policy.junieProfile === "strict"
  };
}

export async function renderRules(args: {
  repoPath: string;
  pack?: string;
  overrides?: string;
  targets: RenderTargets;
  policy?: RenderPolicy;
}): Promise<GeneratedFile[]> {
  const profile = await scanRepo(args.repoPath);
  const pack = await getPack({ pack: args.pack, overrides: args.overrides });
  const decision = evaluateDecisionTree(pack.decisionTree, profile);
  const policy: Required<RenderPolicy> = {
    strictness: args.policy?.strictness ?? "strict",
    standards: args.policy?.standards ?? "auto",
    copilotProfile: args.policy?.copilotProfile ?? "strict",
    claudeProfile: args.policy?.claudeProfile ?? "strict",
    junieProfile: args.policy?.junieProfile ?? "strict"
  };

  const effectiveTargets: RenderTargets = {
    codex: args.targets.codex && decision.enabledTargets.has("codex"),
    copilot: args.targets.copilot && decision.enabledTargets.has("copilot"),
    claude: args.targets.claude && decision.enabledTargets.has("claude"),
    junie: args.targets.junie && decision.enabledTargets.has("junie")
  };

  const unknowns: string[] = [];
  if (!profile.build.commands.test) unknowns.push("Test command is not confidently detected.");
  if (!profile.build.commands.lint) unknowns.push("Lint command is not confidently detected.");
  if (!profile.build.commands.format) unknowns.push("Format command is not confidently detected.");
  if (!profile.build.commands.build) unknowns.push("Build command is not confidently detected.");

  const rulebook = await buildRulebook(profile, policy);

  const context = toTemplateContext(profile, {
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

  return files;
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

export { getPack, listPacks };
