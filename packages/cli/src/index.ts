#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import type { Interface as ReadlineInterface } from "node:readline/promises";
import { Command } from "commander";
import {
  applyRules,
  buildEvidenceBundle,
  diffRules,
  getPack,
  isAllowedWritePath,
  listPacks,
  renderRules,
  sampleRepo,
  scanRepo
} from "@rulesmith/core";
import type { OutputProfile, RenderPolicy, StandardsMode, StrictnessLevel } from "@rulesmith/core";

type RenderTargets = { codex: boolean; copilot: boolean; claude: boolean; junie: boolean };
type BundleFocus = "laravel" | "generic";
type ApplyMode = "none" | "safe" | "force";

function resolveRepoPath(repoPath?: string): string {
  return path.resolve(repoPath ?? process.cwd());
}

function parseTargets(value: string): RenderTargets {
  const set = new Set(value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
  const targets: RenderTargets = {
    codex: set.has("codex"),
    copilot: set.has("copilot"),
    claude: set.has("claude"),
    junie: set.has("junie")
  };
  if (!targets.codex && !targets.copilot && !targets.claude && !targets.junie) {
    throw new Error("At least one target is required (codex,copilot,claude,junie).");
  }
  return targets;
}

function parseStrictness(value: string | undefined): StrictnessLevel | undefined {
  if (!value) return undefined;
  if (value === "baseline" || value === "strict" || value === "very-strict") return value;
  throw new Error("Invalid strictness. Use baseline|strict|very-strict.");
}

function parseStandards(value: string | undefined): StandardsMode | undefined {
  if (!value) return undefined;
  if (value === "auto" || value === "project-only" || value === "project-plus-standard") return value;
  throw new Error("Invalid standards mode. Use auto|project-only|project-plus-standard.");
}

function parseOutputProfile(value: string | undefined, label: "copilot" | "claude" | "junie"): OutputProfile | undefined {
  if (!value) return undefined;
  if (value === "short" || value === "strict") return value;
  throw new Error(`Invalid ${label} profile. Use short|strict.`);
}

function parseFocus(value: string | undefined): BundleFocus | "auto" | undefined {
  if (!value) return undefined;
  if (value === "auto" || value === "laravel" || value === "generic") return value;
  throw new Error("Invalid focus. Use auto|laravel|generic.");
}

function parseApplyMode(value: string | undefined): ApplyMode | undefined {
  if (!value) return undefined;
  if (value === "none" || value === "safe" || value === "force") return value;
  throw new Error("Invalid apply mode. Use none|safe|force.");
}

function parseMaxFiles(value: string | undefined): number {
  const parsed = Number(value ?? "0");
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("maxFiles must be a non-negative number.");
  }
  return Math.floor(parsed);
}

function policyFromFlags(args: {
  strictness?: string;
  standards?: string;
  copilotProfile?: string;
  claudeProfile?: string;
  junieProfile?: string;
}): RenderPolicy {
  return {
    strictness: parseStrictness(args.strictness) ?? "strict",
    standards: parseStandards(args.standards) ?? "auto",
    copilotProfile: parseOutputProfile(args.copilotProfile, "copilot") ?? "strict",
    claudeProfile: parseOutputProfile(args.claudeProfile, "claude") ?? "strict",
    junieProfile: parseOutputProfile(args.junieProfile, "junie") ?? "strict"
  };
}

function buildAiAuthorPrompt(args: {
  repoPath: string;
  focus: BundleFocus;
  maxFiles: number;
  includeContent: boolean;
  bundleOut: string;
  targets: RenderTargets;
  policy: RenderPolicy;
}): string {
  const targets = [
    args.targets.codex ? "codex" : "",
    args.targets.copilot ? "copilot" : "",
    args.targets.claude ? "claude" : "",
    args.targets.junie ? "junie" : ""
  ]
    .filter(Boolean)
    .join(", ");

  return [
    "Use rulesmith MCP as evidence provider and generate project-specific instruction files with AI reasoning.",
    "The rulesmith tool must only provide evidence; final rules must be authored by the host AI from repository files.",
    "",
    `Repository: ${args.repoPath}`,
    `Focus: ${args.focus}`,
    `Evidence bundle path: ${args.bundleOut}`,
    `Bundle maxFiles used: ${args.maxFiles}`,
    `Bundle mode: ${args.includeContent ? "with-content" : "paths-only"}`,
    `Targets: ${targets}`,
    `Policy: strictness=${args.policy.strictness ?? "strict"}, standards=${args.policy.standards ?? "auto"}, copilotProfile=${args.policy.copilotProfile ?? "strict"}, claudeProfile=${args.policy.claudeProfile ?? "strict"}, junieProfile=${args.policy.junieProfile ?? "strict"}`,
    "",
    "Workflow:",
    "1) Load the bundle JSON and use it as starting evidence only.",
    "2) Run additional MCP calls (list_files/search/read_files) to verify and deepen evidence for every claimed rule; if the bundle is paths-only, read files on demand.",
    "3) For Laravel/module-style codebases, inspect routes, controllers, requests, entities, migrations, config/auth, kernel middleware, layouts, asset build scripts, and permissions wiring.",
    "4) Produce a highly specific rulebook with concrete conventions already present in this repository.",
    "5) Every important claim must cite 1+ evidence files; uncertain claims must stay in UNKNOWN/TODO.",
    "6) Generate AGENTS.md, CLAUDE.md, .junie/guidelines.md, and Copilot files with consistent strictness.",
    "7) Show diff first, then apply in safe mode if valid.",
    "",
    "Output requirements:",
    "- No generic boilerplate wording if repository evidence does not support it.",
    "- Preserve existing architecture and naming patterns unless explicitly asked to refactor.",
    "- Include actionable implementation rules for future contributors.",
    "- If the codebase is NOT a mixed/salad legacy system by evidence, include language-standard and best-practice sections in generated rule files (for detected languages/frameworks).",
    "- Examples of expected language standards when applicable: PHP/Laravel (PSR-12, Pint/PHPCS + framework conventions), JS/TS (ESLint, Prettier, strict TS where used), Python (Black/Ruff), Go (gofmt/goimports), Dart/Flutter (dart format + flutter analyze).",
    "- Include language-appropriate documentation standards (PHPDoc, TSDoc/JSDoc, docstrings, Go exported comments, etc.) for public interfaces and non-obvious logic.",
    "- Enforce DRY while avoiding premature abstraction: remove duplication when repetition is proven, do not introduce speculative generic layers.",
    "- Enforce file-size and cohesion discipline: avoid mega files/classes; keep responsibilities bounded and code human-readable.",
    "- Include explicit DO/DON'T quality gates so generated rule files are enforceable, not just descriptive.",
    "- Include dedicated testing, security, and performance checklists.",
    "- Include dependency-change policy (rationale + compatibility impact) and breaking-change policy (migration + rollback notes).",
    "- Include API/CLI contract safety rules that preserve response/exit/status semantics by default.",
    "- Include a Definition-of-Done section that requires tests, documentation updates, and explicit UNKNOWN/TODO handling.",
    "- Add a dedicated 'Documentation Maintenance' section in generated rule files that requires automatic updates to both developer docs and user-facing docs whenever behavior/contracts change.",
    "- If the codebase IS mixed/salad legacy, prefer incremental stabilization and project-local conventions over forcing broad external standards."
  ].join("\n");
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function inferFocusFromProfile(profile: Awaited<ReturnType<typeof scanRepo>>): BundleFocus {
  const isLaravel = profile.frameworks.some((framework) => framework.name === "laravel" && framework.confidence >= 0.5);
  return isLaravel ? "laravel" : "generic";
}

type StartConfig = {
  focus: BundleFocus;
  policy: RenderPolicy;
  targets: RenderTargets;
  maxFiles: number;
  applyMode: ApplyMode;
};

async function promptChoice<T extends string>(
  rl: ReadlineInterface,
  message: string,
  choices: Array<{ value: T; label: string }>,
  defaultValue: T
): Promise<T> {
  process.stdout.write(`\n${message}\n`);
  choices.forEach((choice, index) => {
    const marker = choice.value === defaultValue ? " (default)" : "";
    process.stdout.write(`  ${index + 1}) ${choice.label}${marker}\n`);
  });

  while (true) {
    const answer = (await rl.question("Select: ")).trim().toLowerCase();
    if (!answer) return defaultValue;

    const numeric = Number(answer);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= choices.length) {
      const picked = choices[numeric - 1];
      if (picked) return picked.value;
    }

    const byValue = choices.find((choice) => choice.value.toLowerCase() === answer);
    if (byValue) return byValue.value;

    process.stdout.write("Invalid choice, please try again.\n");
  }
}

async function promptText(rl: ReadlineInterface, message: string, defaultValue: string): Promise<string> {
  const answer = (await rl.question(`${message} [${defaultValue}]: `)).trim();
  return answer || defaultValue;
}

async function collectStartConfigInteractive(args: {
  defaultFocus: BundleFocus;
  defaultPolicy: RenderPolicy;
  defaultTargets: RenderTargets;
  defaultMaxFiles: number;
  defaultApplyMode: ApplyMode;
}): Promise<StartConfig> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const strictness = await promptChoice(
      rl,
      "How strict should the generated rule system be?",
      [
        { value: "baseline", label: "baseline - lighter enforcement" },
        { value: "strict", label: "strict - balanced and consistent" },
        { value: "very-strict", label: "very-strict - hard guardrails" }
      ],
      (args.defaultPolicy.strictness ?? "strict") as StrictnessLevel
    );

    const standards = await promptChoice(
      rl,
      "How should coding standards be applied?",
      [
        { value: "auto", label: "auto - decide from codebase signals" },
        { value: "project-only", label: "project-only - follow local style only" },
        { value: "project-plus-standard", label: "project-plus-standard - add language baselines" }
      ],
      (args.defaultPolicy.standards ?? "auto") as StandardsMode
    );

    const focus = await promptChoice(
      rl,
      "Evidence bundle focus?",
      [
        { value: "laravel", label: "laravel" },
        { value: "generic", label: "generic" }
      ],
      args.defaultFocus
    );

    const targetsInput = await promptText(
      rl,
      "Targets (comma separated: codex,copilot,claude,junie)",
      [
        args.defaultTargets.codex ? "codex" : "",
        args.defaultTargets.copilot ? "copilot" : "",
        args.defaultTargets.claude ? "claude" : "",
        args.defaultTargets.junie ? "junie" : ""
      ]
        .filter(Boolean)
        .join(",")
    );
    const parsedTargets = parseTargets(targetsInput);

    const copilotProfile = parsedTargets.copilot
      ? await promptChoice(
          rl,
          "Copilot output profile?",
          [
            { value: "strict", label: "strict - full detailed rulebook" },
            { value: "short", label: "short - concise instructions" }
          ],
          (args.defaultPolicy.copilotProfile ?? "strict") as OutputProfile
        )
      : (args.defaultPolicy.copilotProfile ?? "strict");

    const claudeProfile = parsedTargets.claude
      ? await promptChoice(
          rl,
          "Claude output profile?",
          [
            { value: "strict", label: "strict - full detailed rulebook" },
            { value: "short", label: "short - concise instructions" }
          ],
          (args.defaultPolicy.claudeProfile ?? "strict") as OutputProfile
        )
      : (args.defaultPolicy.claudeProfile ?? "strict");

    const junieProfile = parsedTargets.junie
      ? await promptChoice(
          rl,
          "Junie output profile?",
          [
            { value: "strict", label: "strict - full detailed rulebook" },
            { value: "short", label: "short - concise instructions" }
          ],
          (args.defaultPolicy.junieProfile ?? "strict") as OutputProfile
        )
      : (args.defaultPolicy.junieProfile ?? "strict");

    const maxFilesInput = await promptText(
      rl,
      "Max files in evidence bundle (0 = full scan)",
      String(args.defaultMaxFiles)
    );

    const applyMode = await promptChoice(
      rl,
      "Apply generated files now?",
      [
        { value: "none", label: "none - preview only" },
        { value: "safe", label: "safe - write only if no overwrite conflict" },
        { value: "force", label: "force - overwrite existing generated files" }
      ],
      args.defaultApplyMode
    );

    return {
      focus,
      policy: { strictness, standards, copilotProfile, claudeProfile, junieProfile },
      targets: parsedTargets,
      maxFiles: parseMaxFiles(maxFilesInput),
      applyMode
    };
  } finally {
    rl.close();
  }
}

async function main() {
  const program = new Command();
  program.name("rulesmith").description("Local-first repo mapper and instruction generator");

  program
    .command("start")
    .alias("/start")
    .argument("[repoPath]")
    .option("--pack <pack>", "pack name", "default")
    .option("--overrides <overrides>", "override directory")
    .option("--targets <targets>", "codex,copilot,claude,junie", "codex,copilot,claude,junie")
    .option("--strictness <strictness>", "baseline|strict|very-strict")
    .option("--standards <standards>", "auto|project-only|project-plus-standard")
    .option("--copilot-profile <copilotProfile>", "short|strict")
    .option("--claude-profile <claudeProfile>", "short|strict")
    .option("--junie-profile <junieProfile>", "short|strict")
    .option("--focus <focus>", "auto|laravel|generic", "auto")
    .option("--maxFiles <maxFiles>", "max files in evidence bundle (0 = full scan)", "0")
    .option("--include-content", "store file contents in bundle (default: paths only)")
    .option("--bundleOut <bundleOut>", "bundle output file", ".rulesmith/bundle.json")
    .option("--diffOut <diffOut>", "diff output file", ".rulesmith/rules.diff")
    .option("--apply <apply>", "none|safe|force")
    .option("--interactive", "force interactive prompts")
    .option("--non-interactive", "disable interactive prompts")
    .action(async (repoPathArg, options) => {
      if (options.interactive && options["nonInteractive"]) {
        throw new Error("Use either --interactive or --non-interactive, not both.");
      }

      const repoPath = resolveRepoPath(repoPathArg);
      const profile = await scanRepo(repoPath);
      const inferredFocus = inferFocusFromProfile(profile);

      const defaultFocusRaw = parseFocus(options.focus);
      const defaultFocus: BundleFocus = defaultFocusRaw === "auto" || !defaultFocusRaw ? inferredFocus : defaultFocusRaw;
      const defaultPolicy = policyFromFlags({
        strictness: options.strictness,
        standards: options.standards,
        copilotProfile: options.copilotProfile,
        claudeProfile: options.claudeProfile,
        junieProfile: options.junieProfile
      });
      const defaultTargets = parseTargets(options.targets);
      const defaultMaxFiles = parseMaxFiles(options.maxFiles);
      const defaultApplyMode = parseApplyMode(options.apply) ?? "none";

      const shouldPrompt =
        options.interactive ||
        (!options["nonInteractive"] && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY));

      const config = shouldPrompt
        ? await collectStartConfigInteractive({
            defaultFocus,
            defaultPolicy,
            defaultTargets,
            defaultMaxFiles,
            defaultApplyMode
          })
        : {
            focus: defaultFocus,
            policy: defaultPolicy,
            targets: defaultTargets,
            maxFiles: defaultMaxFiles,
            applyMode: defaultApplyMode
          };

      const effectiveMaxFiles =
        config.maxFiles === 0
          ? Math.max(profile.meta.repoSize?.files ?? 100_000, 100_000)
          : config.maxFiles;

      const bundle = await buildEvidenceBundle({
        repoPath,
        focus: config.focus,
        maxFiles: effectiveMaxFiles,
        includeContent: Boolean(options.includeContent)
      });

      const bundleOut = path.resolve(options.bundleOut);
      await writeJson(bundleOut, bundle);

      const files = await renderRules({
        repoPath,
        pack: options.pack,
        overrides: options.overrides,
        targets: config.targets,
        policy: config.policy
      });

      const patch = await diffRules({ repoPath, files });
      const diffOut = path.resolve(options.diffOut);
      await fs.mkdir(path.dirname(diffOut), { recursive: true });
      await fs.writeFile(diffOut, patch, "utf8");

      const applyResult =
        config.applyMode === "none"
          ? { written: [] }
          : await applyRules({
              repoPath,
              files,
              mode: config.applyMode
            });

      process.stdout.write(
        `${JSON.stringify(
          {
            repoPath,
            scannedAt: profile.meta.scannedAt,
            focus: config.focus,
            bundleMode: options.includeContent ? "with-content" : "paths-only",
            policy: config.policy,
            targets: config.targets,
            bundleOut,
            diffOut,
            generated: files.map((file) => file.path),
            written: applyResult.written,
            repoSize: profile.meta.repoSize
          },
          null,
          2
        )}\n`
      );
    });

  program
    .command("scan")
    .argument("[repoPath]")
    .action(async (repoPathArg) => {
      const profile = await scanRepo(resolveRepoPath(repoPathArg));
      process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
    });

  program
    .command("sample")
    .argument("[repoPath]")
    .option("--strategy <strategy>", "by-folder|by-extension|laravel-focused", "by-extension")
    .option("--maxFiles <maxFiles>", "max files", "40")
    .action(async (repoPathArg, options) => {
      const result = await sampleRepo({
        repoPath: resolveRepoPath(repoPathArg),
        strategy: options.strategy,
        maxFiles: Number(options.maxFiles)
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    });

  program
    .command("bundle")
    .argument("[repoPath]")
    .option("--focus <focus>", "laravel|generic", "laravel")
    .option("--maxFiles <maxFiles>", "max files", "60")
    .option("--include-content", "store file contents in bundle (default: paths only)")
    .option("--out <out>", "output file", ".rulesmith/bundle.json")
    .action(async (repoPathArg, options) => {
      const bundle = await buildEvidenceBundle({
        repoPath: resolveRepoPath(repoPathArg),
        focus: options.focus,
        maxFiles: Number(options.maxFiles),
        includeContent: Boolean(options.includeContent)
      });
      const outPath = path.resolve(options.out);
      await writeJson(outPath, bundle);
      process.stdout.write(`${outPath}\n`);
    });

  program
    .command("compose")
    .argument("[repoPath]")
    .option("--focus <focus>", "auto|laravel|generic", "auto")
    .option("--maxFiles <maxFiles>", "max files in evidence bundle (0 = full scan)", "0")
    .option("--include-content", "store file contents in bundle (default: paths only)")
    .option("--targets <targets>", "codex,copilot,claude,junie", "codex,copilot,claude,junie")
    .option("--strictness <strictness>", "baseline|strict|very-strict", "strict")
    .option("--standards <standards>", "auto|project-only|project-plus-standard", "auto")
    .option("--copilot-profile <copilotProfile>", "short|strict", "strict")
    .option("--claude-profile <claudeProfile>", "short|strict", "strict")
    .option("--junie-profile <junieProfile>", "short|strict", "strict")
    .option("--bundleOut <bundleOut>", "bundle output file", ".rulesmith/bundle.json")
    .option("--promptOut <promptOut>", "generated prompt file", ".rulesmith/compose-prompt.md")
    .action(async (repoPathArg, options) => {
      const repoPath = resolveRepoPath(repoPathArg);
      const profile = await scanRepo(repoPath);
      const focusRaw = parseFocus(options.focus);
      const focus: BundleFocus = focusRaw === "auto" || !focusRaw ? inferFocusFromProfile(profile) : focusRaw;
      const policy = policyFromFlags({
        strictness: options.strictness,
        standards: options.standards,
        copilotProfile: options.copilotProfile,
        claudeProfile: options.claudeProfile,
        junieProfile: options.junieProfile
      });
      const targets = parseTargets(options.targets);
      const requestedMaxFiles = parseMaxFiles(options.maxFiles);
      const effectiveMaxFiles =
        requestedMaxFiles === 0
          ? Math.max(profile.meta.repoSize?.files ?? 100_000, 100_000)
          : requestedMaxFiles;

      const bundle = await buildEvidenceBundle({
        repoPath,
        focus,
        maxFiles: effectiveMaxFiles,
        includeContent: Boolean(options.includeContent)
      });
      const bundleOut = path.resolve(options.bundleOut);
      await writeJson(bundleOut, bundle);

      const prompt = buildAiAuthorPrompt({
        repoPath,
        focus,
        maxFiles: effectiveMaxFiles,
        includeContent: Boolean(options.includeContent),
        bundleOut,
        targets,
        policy
      });
      const promptOut = path.resolve(options.promptOut);
      await fs.mkdir(path.dirname(promptOut), { recursive: true });
      await fs.writeFile(promptOut, `${prompt}\n`, "utf8");

      process.stdout.write(
        `${JSON.stringify(
          {
            repoPath,
            focus,
            bundleMode: options.includeContent ? "with-content" : "paths-only",
            bundleOut,
            promptOut,
            targets,
            policy,
            nextStep: "Paste the prompt file content into Codex chat for AI-authored project-specific rules."
          },
          null,
          2
        )}\n`
      );
    });

  program
    .command("render")
    .argument("[repoPath]")
    .option("--pack <pack>", "pack name", "default")
    .option("--overrides <overrides>", "override directory")
    .option("--targets <targets>", "codex,copilot,claude,junie", "codex,copilot,claude,junie")
    .option("--strictness <strictness>", "baseline|strict|very-strict", "strict")
    .option("--standards <standards>", "auto|project-only|project-plus-standard", "auto")
    .option("--copilot-profile <copilotProfile>", "short|strict", "strict")
    .option("--claude-profile <claudeProfile>", "short|strict", "strict")
    .option("--junie-profile <junieProfile>", "short|strict", "strict")
    .option("--outdir <outdir>", "output directory", ".rulesmith/out")
    .action(async (repoPathArg, options) => {
      const files = await renderRules({
        repoPath: resolveRepoPath(repoPathArg),
        pack: options.pack,
        overrides: options.overrides,
        targets: parseTargets(options.targets),
        policy: policyFromFlags({
          strictness: options.strictness,
          standards: options.standards,
          copilotProfile: options.copilotProfile,
          claudeProfile: options.claudeProfile,
          junieProfile: options.junieProfile
        })
      });
      const outDir = path.resolve(options.outdir);
      for (const file of files) {
        const target = path.join(outDir, file.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.content, "utf8");
      }
      process.stdout.write(`${JSON.stringify({ outDir, files: files.map((f) => f.path) }, null, 2)}\n`);
    });

  program
    .command("diff")
    .argument("[repoPath]")
    .option("--pack <pack>", "pack name", "default")
    .option("--overrides <overrides>", "override directory")
    .option("--targets <targets>", "codex,copilot,claude,junie", "codex,copilot,claude,junie")
    .option("--strictness <strictness>", "baseline|strict|very-strict", "strict")
    .option("--standards <standards>", "auto|project-only|project-plus-standard", "auto")
    .option("--copilot-profile <copilotProfile>", "short|strict", "strict")
    .option("--claude-profile <claudeProfile>", "short|strict", "strict")
    .option("--junie-profile <junieProfile>", "short|strict", "strict")
    .action(async (repoPathArg, options) => {
      const files = await renderRules({
        repoPath: resolveRepoPath(repoPathArg),
        pack: options.pack,
        overrides: options.overrides,
        targets: parseTargets(options.targets),
        policy: policyFromFlags({
          strictness: options.strictness,
          standards: options.standards,
          copilotProfile: options.copilotProfile,
          claudeProfile: options.claudeProfile,
          junieProfile: options.junieProfile
        })
      });
      const patch = await diffRules({ repoPath: resolveRepoPath(repoPathArg), files });
      process.stdout.write(patch);
    });

  program
    .command("apply")
    .argument("[repoPath]")
    .option("--pack <pack>", "pack name", "default")
    .option("--overrides <overrides>", "override directory")
    .option("--targets <targets>", "codex,copilot,claude,junie", "codex,copilot,claude,junie")
    .option("--strictness <strictness>", "baseline|strict|very-strict", "strict")
    .option("--standards <standards>", "auto|project-only|project-plus-standard", "auto")
    .option("--copilot-profile <copilotProfile>", "short|strict", "strict")
    .option("--claude-profile <claudeProfile>", "short|strict", "strict")
    .option("--junie-profile <junieProfile>", "short|strict", "strict")
    .option("--mode <mode>", "safe|force", "safe")
    .action(async (repoPathArg, options) => {
      const repoPath = resolveRepoPath(repoPathArg);
      const files = await renderRules({
        repoPath,
        pack: options.pack,
        overrides: options.overrides,
        targets: parseTargets(options.targets),
        policy: policyFromFlags({
          strictness: options.strictness,
          standards: options.standards,
          copilotProfile: options.copilotProfile,
          claudeProfile: options.claudeProfile,
          junieProfile: options.junieProfile
        })
      });
      const result = await applyRules({
        repoPath,
        files,
        mode: options.mode
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    });

  program
    .command("doctor")
    .argument("[repoPath]")
    .option("--pack <pack>", "pack name", "default")
    .option("--overrides <overrides>", "override directory")
    .action(async (_repoPath, options) => {
      const pack = await getPack({ pack: options.pack, overrides: options.overrides });
      const required = [
        "agents.md.hbs",
        "claude.md.hbs",
        "junie-guidelines.md.hbs",
        "copilot-instructions.md.hbs",
        "copilot-area.instructions.md.hbs"
      ];
      const missingTemplates = required.filter((name) => !pack.templates[name]);

      const candidateOutputs = [
        "AGENTS.md",
        "CLAUDE.md",
        ".junie/guidelines.md",
        ".github/copilot-instructions.md",
        ".github/instructions/area.instructions.md"
      ];
      const disallowed = candidateOutputs.filter((target) => !isAllowedWritePath(target));

      process.stdout.write(
        `${JSON.stringify(
          {
            pack: pack.name,
            missingTemplates,
            allowlistOk: disallowed.length === 0,
            disallowed
          },
          null,
          2
        )}\n`
      );
    });

  program
    .command("list-packs")
    .action(async () => {
      process.stdout.write(`${JSON.stringify({ packs: await listPacks() }, null, 2)}\n`);
    });

  program
    .command("get-pack")
    .option("--pack <pack>", "pack name", "default")
    .option("--overrides <overrides>", "override directory")
    .action(async (options) => {
      const pack = await getPack({ pack: options.pack, overrides: options.overrides });
      process.stdout.write(
        `${JSON.stringify(
          {
            name: pack.name,
            rootDir: pack.rootDir,
            templates: Object.keys(pack.templates),
            prompts: Object.keys(pack.orchestratorPrompts)
          },
          null,
          2
        )}\n`
      );
    });

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[rulesmith] ${message}\n`);
  process.exitCode = 1;
});
