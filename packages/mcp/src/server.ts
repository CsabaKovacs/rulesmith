import { readFileSafe, listFilesSafe } from "@rulesmith/core";
import {
  applyRules,
  applyRenderedRules,
  bootstrapRules,
  buildEvidenceBundle,
  detectRepoScopes,
  diffRules,
  getPack,
  listPacks,
  renderRules,
  renderAndApplyRules,
  sampleRepo,
  scanRepo,
  storeArtifact
} from "@rulesmith/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";

type SearchMatch = {
  path: string;
  line: number;
  excerpt: string;
};

async function cleanupBundleArtifacts(repoPath: string): Promise<void> {
  const bundleDir = path.join(repoPath, ".rulesmith");
  const bundleFile = path.join(bundleDir, "bundle.json");

  await fs.rm(bundleFile, { force: true }).catch(() => undefined);
  await fs.rm(bundleDir, { recursive: true, force: true }).catch(() => undefined);
}


async function searchRepo(args: {
  repoPath?: string;
  pattern: string;
  maxMatches?: number;
  fileGlob?: string;
}): Promise<SearchMatch[]> {
  const repoPath = path.resolve(args.repoPath ?? process.cwd());
  const files = await listFilesSafe({
    repoRoot: repoPath,
    glob: args.fileGlob || "**/*",
    max: 5000
  });

  const out: SearchMatch[] = [];
  const re = new RegExp(args.pattern, "i");

  for (const file of files) {
    const content = await readFileSafe(repoPath, file, 128_000).catch(() => "");
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const lineText = lines[i] ?? "";
      if (re.test(lineText)) {
        out.push({ path: file, line: i + 1, excerpt: lineText.trim() });
        if (out.length >= (args.maxMatches ?? 100)) return out;
      }
    }
  }

  return out;
}

function asToolResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }]
  };
}

function buildBootstrapSpecializationPrompt(args: {
  repoPath: string;
  targets: { codex: boolean; copilot: boolean; claude: boolean; junie: boolean; gemini: boolean; antigravity: boolean };
  policy?: {
    strictness?: "baseline" | "strict" | "very-strict";
    standards?: "auto" | "project-only" | "project-plus-standard";
  };
  languages: string[];
  frameworks: string[];
}): string {
  const targets = [
    args.targets.codex ? "codex" : "",
    args.targets.copilot ? "copilot" : "",
    args.targets.claude ? "claude" : "",
    args.targets.junie ? "junie" : "",
    args.targets.gemini ? "gemini" : "",
    args.targets.antigravity ? "antigravity" : ""
  ]
    .filter(Boolean)
    .join(", ");

  return [
    "Use rulesmith MCP as evidence provider only.",
    "This is a NEW project bootstrap specialization pass (no repository scan required).",
    "",
    `Repository: ${args.repoPath}`,
    `Selected targets: ${targets}`,
    `Declared languages: ${args.languages.join(", ") || "UNKNOWN"}`,
    `Declared frameworks: ${args.frameworks.join(", ") || "UNKNOWN"}`,
    `Policy: strictness=${args.policy?.strictness ?? "very-strict"}, standards=${args.policy?.standards ?? "project-plus-standard"}`,
    "",
    "1) Read currently generated rule files for selected targets.",
    "2) Enrich them with language/framework standards, best practices, and strict quality gates.",
    "3) Add architecture defaults, testing/security/performance checklists, and Definition of Done.",
    "4) Keep UNKNOWN/TODO only where undecidable from declared stack.",
    "5) Show diff first, then apply in safe mode.",
    "",
    "Must include standards where applicable:",
    "- PHP/Laravel: PSR-12, Pint/PHPCS, FormRequest-first validation, service/action boundaries.",
    "- JS/TS: ESLint+Prettier, strict TS where used, explicit module boundaries.",
    "- Python: Black/Ruff, typed boundaries where applicable.",
    "- Go: gofmt/goimports + explicit error handling.",
    "- Dart/Flutter: dart format + flutter analyze.",
    "",
    "Must enforce DRY without premature abstraction, avoid mega files, and require documentation updates for behavior/contract changes."
  ].join("\n");
}

async function start() {
  const server = new McpServer({ name: "rulesmith", version: "0.1.0" });
  const serverAny = server as any;

  const registerTool = (name: string, schema: unknown, handler: (args: any) => Promise<unknown>) => {
    serverAny.tool(name, schema, async (args: any) => asToolResult(await handler(args)));
  };

  registerTool("scan_repo", { repoPath: z.string().optional() }, async ({ repoPath }) => scanRepo(path.resolve(repoPath ?? process.cwd())));

  registerTool("detect_scopes", { repoPath: z.string().optional() }, async ({ repoPath }) =>
    detectRepoScopes(path.resolve(repoPath ?? process.cwd()))
  );

  registerTool(
    "list_files",
    {
      repoPath: z.string().optional(),
      glob: z.string().optional(),
      max: z.number().optional()
    },
    async ({ repoPath, glob, max }) => ({ paths: await listFilesSafe({ repoRoot: path.resolve(repoPath ?? process.cwd()), glob, max }) })
  );

  registerTool(
    "search",
    {
      repoPath: z.string().optional(),
      pattern: z.string(),
      maxMatches: z.number().optional(),
      fileGlob: z.string().optional()
    },
    async ({ repoPath, pattern, maxMatches, fileGlob }) => ({
      matches: await searchRepo({ repoPath, pattern, maxMatches, fileGlob })
    })
  );

  registerTool(
    "read_files",
    {
      repoPath: z.string().optional(),
      paths: z.array(z.string()),
      maxBytesPerFile: z.number().optional()
    },
    async ({ repoPath, paths, maxBytesPerFile }) => {
      const resolvedRepoPath = path.resolve(repoPath ?? process.cwd());
      const files = await Promise.all(
        paths.map(async (p: string) => ({
          path: p,
          content: await readFileSafe(resolvedRepoPath, p, maxBytesPerFile)
        }))
      );
      return { files };
    }
  );

  registerTool(
    "sample_repo",
    {
      repoPath: z.string().optional(),
      strategy: z.enum(["by-folder", "by-extension", "laravel-focused"]),
      maxFiles: z.number().optional()
    },
    async ({ repoPath, strategy, maxFiles }) => sampleRepo({ repoPath: path.resolve(repoPath ?? process.cwd()), strategy, maxFiles })
  );

  registerTool(
    "build_evidence_bundle",
    {
      repoPath: z.string().optional(),
      focus: z.enum(["laravel", "generic"]),
      maxFiles: z.number().optional(),
      includeContent: z.boolean().optional(),
      cleanup: z.boolean().optional()
    },
    async ({ repoPath, focus, maxFiles, includeContent, cleanup }) => {
      const resolvedRepoPath = path.resolve(repoPath ?? process.cwd());
      const bundle = await buildEvidenceBundle({
        repoPath: resolvedRepoPath,
        focus,
        maxFiles,
        includeContent
      });

      if (cleanup !== false) {
        await cleanupBundleArtifacts(resolvedRepoPath);
      }

      return bundle;
    }
  );

  registerTool(
    "bootstrap_rules",
    {
      repoPath: z.string().optional(),
      pack: z.string().optional(),
      overrides: z.string().optional(),
      seed: z.object({
        signals: z
          .object({
            configFiles: z.array(z.string()).optional(),
            ciFiles: z.array(z.string()).optional(),
            entrypoints: z.array(z.string()).optional()
          })
          .optional(),
        languages: z
          .array(
            z.object({
              name: z.string(),
              confidence: z.number().min(0).max(1).optional(),
              evidence: z.array(z.string()).optional()
            })
          )
          .optional(),
        frameworks: z
          .array(
            z.object({
              name: z.string(),
              confidence: z.number().min(0).max(1).optional(),
              evidence: z.array(z.string()).optional()
            })
          )
          .optional(),
        build: z
          .object({
            commands: z
              .object({
                install: z.string().optional(),
                build: z.string().optional(),
                test: z.string().optional(),
                lint: z.string().optional(),
                format: z.string().optional(),
                dev: z.string().optional()
              })
              .optional(),
            evidence: z.array(z.string()).optional()
          })
          .optional(),
        structure: z
          .object({
            monorepo: z.boolean().optional(),
            workspaces: z.array(z.string()).optional(),
            generatedDirs: z.array(z.string()).optional(),
            vendorDirs: z.array(z.string()).optional()
          })
          .optional(),
        guardrails: z
          .object({
            forbiddenPaths: z.array(z.string()).optional(),
            notes: z.array(z.string()).optional()
          })
          .optional()
      }),
      targets: z.object({
        codex: z.boolean().optional(),
        copilot: z.boolean().optional(),
        claude: z.boolean().optional(),
        junie: z.boolean().optional(),
        gemini: z.boolean().optional(),
        antigravity: z.boolean().optional()
      }),
      policy: z
        .object({
          strictness: z.enum(["baseline", "strict", "very-strict"]).optional(),
          standards: z.enum(["auto", "project-only", "project-plus-standard"]).optional(),
          copilotProfile: z.enum(["short", "strict"]).optional(),
          claudeProfile: z.enum(["short", "strict"]).optional(),
          junieProfile: z.enum(["short", "strict"]).optional(),
          geminiProfile: z.enum(["short", "strict"]).optional(),
          antigravityProfile: z.enum(["short", "strict"]).optional()
        })
        .optional()
    },
    async ({ repoPath, pack, overrides, seed, targets, policy }) =>
      bootstrapRules({
        repoPath: path.resolve(repoPath ?? process.cwd()),
        pack,
        overrides,
        seed,
        targets: {
          codex: targets.codex ?? false,
          copilot: targets.copilot ?? false,
          claude: targets.claude ?? false,
          junie: targets.junie ?? false,
          gemini: targets.gemini ?? false,
          antigravity: targets.antigravity ?? false
        },
        policy
      })
  );

  registerTool(
    "bootstrap_specialization_prompt",
    {
      repoPath: z.string().optional(),
      seed: z.object({
        languages: z
          .array(
            z.object({
              name: z.string()
            })
          )
          .optional(),
        frameworks: z
          .array(
            z.object({
              name: z.string()
            })
          )
          .optional()
      }),
      targets: z.object({
        codex: z.boolean().optional(),
        copilot: z.boolean().optional(),
        claude: z.boolean().optional(),
        junie: z.boolean().optional(),
        gemini: z.boolean().optional(),
        antigravity: z.boolean().optional()
      }),
      policy: z
        .object({
          strictness: z.enum(["baseline", "strict", "very-strict"]).optional(),
          standards: z.enum(["auto", "project-only", "project-plus-standard"]).optional()
        })
        .optional()
    },
    async ({ repoPath, seed, targets, policy }) => {
      const resolvedRepoPath = path.resolve(repoPath ?? process.cwd());
      const normalizedTargets = {
        codex: targets.codex ?? false,
        copilot: targets.copilot ?? false,
        claude: targets.claude ?? false,
        junie: targets.junie ?? false,
        gemini: targets.gemini ?? false,
        antigravity: targets.antigravity ?? false
      };

      return {
        prompt: buildBootstrapSpecializationPrompt({
          repoPath: resolvedRepoPath,
          targets: normalizedTargets,
          policy,
          languages: (seed.languages ?? []).map((item: { name: string }) => item.name),
          frameworks: (seed.frameworks ?? []).map((item: { name: string }) => item.name)
        })
      };
    }
  );

  const renderTargetsSchema = z.object({
    codex: z.boolean().optional(),
    copilot: z.boolean().optional(),
    claude: z.boolean().optional(),
    junie: z.boolean().optional(),
    gemini: z.boolean().optional(),
    antigravity: z.boolean().optional()
  });

  const renderPolicySchema = z
    .object({
      strictness: z.enum(["baseline", "strict", "very-strict"]).optional(),
      standards: z.enum(["auto", "project-only", "project-plus-standard"]).optional(),
      copilotProfile: z.enum(["short", "strict"]).optional(),
      claudeProfile: z.enum(["short", "strict"]).optional(),
      junieProfile: z.enum(["short", "strict"]).optional(),
      geminiProfile: z.enum(["short", "strict"]).optional(),
      antigravityProfile: z.enum(["short", "strict"]).optional()
    })
    .optional();

  const normalizeTargets = (targets: Record<string, boolean | undefined>) => ({
    codex: targets.codex ?? false,
    copilot: targets.copilot ?? false,
    claude: targets.claude ?? false,
    junie: targets.junie ?? false,
    gemini: targets.gemini ?? false,
    antigravity: targets.antigravity ?? false
  });

  registerTool(
    "render_rules",
    {
      repoPath: z.string().optional(),
      pack: z.string().optional(),
      overrides: z.string().optional(),
      targets: renderTargetsSchema,
      policy: renderPolicySchema,
      includeContent: z.boolean().optional()
    },
    async ({ repoPath, pack, overrides, targets, policy, includeContent }) => {
      const files = await renderRules({
        repoPath: path.resolve(repoPath ?? process.cwd()),
        pack,
        overrides,
        targets: normalizeTargets(targets),
        policy
      });
      const artifactId = storeArtifact(files);
      // When includeContent is false (default), return summaries to avoid large payload relay.
      // Use artifactId with apply_rendered_rules for truncation-safe apply.
      if (includeContent) {
        return { files, artifactId };
      }
      const summaries = files.map(f => ({ path: f.path, chars: f.content.length }));
      return { files: summaries, artifactId };
    }
  );

  registerTool(
    "apply_rendered_rules",
    {
      repoPath: z.string().optional(),
      artifactId: z.string(),
      mode: z.enum(["safe", "force"]).optional()
    },
    async ({ repoPath, artifactId, mode }) =>
      applyRenderedRules({
        repoPath: path.resolve(repoPath ?? process.cwd()),
        artifactId,
        mode
      })
  );

  registerTool(
    "render_and_apply",
    {
      repoPath: z.string().optional(),
      pack: z.string().optional(),
      overrides: z.string().optional(),
      targets: renderTargetsSchema,
      policy: renderPolicySchema,
      mode: z.enum(["safe", "force"]).optional()
    },
    async ({ repoPath, pack, overrides, targets, policy, mode }) =>
      renderAndApplyRules({
        repoPath: path.resolve(repoPath ?? process.cwd()),
        pack,
        overrides,
        targets: normalizeTargets(targets),
        policy,
        mode
      })
  );

  registerTool(
    "diff_rules",
    {
      repoPath: z.string().optional(),
      files: z.array(
        z.object({
          path: z.string(),
          content: z.string()
        })
      )
    },
    async ({ repoPath, files }) => ({ diff: await diffRules({ repoPath: path.resolve(repoPath ?? process.cwd()), files }) })
  );

  registerTool(
    "apply_rules",
    {
      repoPath: z.string().optional(),
      files: z.array(
        z.object({
          path: z.string(),
          content: z.string()
        })
      ),
      mode: z.enum(["safe", "force"]).optional()
    },
    async ({ repoPath, files, mode }) => applyRules({ repoPath: path.resolve(repoPath ?? process.cwd()), files, mode })
  );

  registerTool("list_packs", {}, async () => ({ packs: await listPacks() }));

  registerTool(
    "get_pack",
    {
      pack: z.string().optional(),
      overrides: z.string().optional()
    },
    async ({ pack, overrides }) => {
      const result = await getPack({ pack, overrides });
      return {
        name: result.name,
        rootDir: result.rootDir,
        templates: Object.keys(result.templates),
        prompts: Object.keys(result.orchestratorPrompts)
      };
    }
  );

  if (typeof serverAny.prompt === "function") {
    serverAny.prompt("laravel_map", {}, async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: (await getPack({ pack: "default" })).orchestratorPrompts.laravel_map ?? ""
          }
        }
      ]
    }));

    serverAny.prompt("rubric", {}, async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: (await getPack({ pack: "default" })).orchestratorPrompts.rubric ?? ""
          }
        }
      ]
    }));
  }

  if (typeof serverAny.resource === "function") {
    serverAny.resource("laravel_map", "rulesmith://prompt/laravel_map", async () => ({
      contents: [
        {
          uri: "rulesmith://prompt/laravel_map",
          mimeType: "text/markdown",
          text: (await getPack({ pack: "default" })).orchestratorPrompts.laravel_map ?? ""
        }
      ]
    }));

    serverAny.resource("rubric", "rulesmith://prompt/rubric", async () => ({
      contents: [
        {
          uri: "rulesmith://prompt/rubric",
          mimeType: "text/markdown",
          text: (await getPack({ pack: "default" })).orchestratorPrompts.rubric ?? ""
        }
      ]
    }));
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write("[rulesmith-mcp] server started\n");
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[rulesmith-mcp] fatal: ${message}\n`);
  process.exit(1);
});
