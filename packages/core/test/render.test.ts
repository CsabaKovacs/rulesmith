import path from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapRules, renderRules } from "../src/render/index.js";
import { MANDATORY_CONVENTIONS_TITLE } from "../src/render/rulebook.js";

const fixturesRoot = path.resolve(process.cwd(), "../../examples/fixtures");

describe("renderer", () => {
  it("renders all targets for laravel fixture", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "laravel_messy_min"),
      pack: "default",
      targets: { codex: true, copilot: true, claude: true, junie: true, gemini: true, antigravity: true }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    const claude = files.find((f) => f.path === "CLAUDE.md");
    const gemini = files.find((f) => f.path === "GEMINI.md");
    const junie = files.find((f) => f.path === ".junie/guidelines.md");
    const antigravity = files.find((f) => f.path === ".agent/rules/rulesmith.instructions.md");
    const copilot = files.find((f) => f.path === ".github/copilot-instructions.md");
    const area = files.find((f) => f.path.startsWith(".github/instructions/"));

    expect(agents?.content).toContain("Setup Commands");
    expect(agents?.content).toContain("Detailed Conventions");
    expect(agents?.content).toContain("Routing Conventions");
    expect(claude?.content).toContain("Execution Contract");
    expect(claude?.content).toContain("Detailed Conventions");
    expect(gemini?.content).toContain("Execution Contract");
    expect(gemini?.content).toContain("Detailed Conventions");
    expect(junie?.content).toContain("Junie Guidelines");
    expect(junie?.content).toContain("Detailed Conventions");
    expect(antigravity?.content).toContain("Antigravity Rules");
    expect(antigravity?.content).toContain("Detailed Conventions");
    expect(copilot?.content).toContain("GitHub Copilot Instructions");
    expect(copilot?.content).toContain("Detailed Conventions");
    expect(area?.content).toContain("applyTo");
    expect(area?.content).toContain("Area-Specific Conventions");

    expect(files.map((f) => f.path).sort()).toMatchSnapshot();

    // Verify Claude subagent files are generated
    const codeReviewer = files.find((f) => f.path === ".claude/agents/code-reviewer.md");
    const securityReviewer = files.find((f) => f.path === ".claude/agents/security-reviewer.md");
    expect(codeReviewer).toBeDefined();
    expect(securityReviewer).toBeDefined();
    expect(codeReviewer?.content).toContain("name: code-reviewer");
    expect(codeReviewer?.content).toContain("Code Quality Reviewer");
    expect(codeReviewer?.content).toContain("Stack-Specific Rules");
    expect(securityReviewer?.content).toContain("name: security-reviewer");
    expect(securityReviewer?.content).toContain("Security Reviewer");
    expect(securityReviewer?.content).toContain("Stack-Specific Security Rules");

    // Verify code-simplifier and test-guard subagent files
    const codeSimplifier = files.find((f) => f.path === ".claude/agents/code-simplifier.md");
    const testGuard = files.find((f) => f.path === ".claude/agents/test-guard.md");
    expect(codeSimplifier).toBeDefined();
    expect(testGuard).toBeDefined();
    expect(codeSimplifier?.content).toContain("name: code-simplifier");
    expect(codeSimplifier?.content).toContain("Code Simplifier");
    expect(codeSimplifier?.content).toContain("Stack-Specific Simplification Rules");
    expect(testGuard?.content).toContain("name: test-guard");
    expect(testGuard?.content).toContain("Test Guard");
    expect(testGuard?.content).toContain("Stack-Specific Test Rules");
  });

  it("does not generate subagent files when claude target is disabled", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "laravel_messy_min"),
      pack: "default",
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false }
    });

    const agentFiles = files.filter((f) => f.path.startsWith(".claude/agents/"));
    expect(agentFiles).toHaveLength(0);
  });

  it("generates cross-platform skill files for codex target", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "node_ts_min"),
      pack: "default",
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false }
    });

    const codeSkill = files.find((f) => f.path === ".agents/skills/code-reviewer/SKILL.md");
    const securitySkill = files.find((f) => f.path === ".agents/skills/security-reviewer/SKILL.md");
    const simplifierSkill = files.find((f) => f.path === ".agents/skills/code-simplifier/SKILL.md");
    const testGuardSkill = files.find((f) => f.path === ".agents/skills/test-guard/SKILL.md");
    expect(codeSkill).toBeDefined();
    expect(securitySkill).toBeDefined();
    expect(simplifierSkill).toBeDefined();
    expect(testGuardSkill).toBeDefined();
    expect(codeSkill?.content).toContain("Code Quality Review");
    expect(codeSkill?.content).toContain("description:");
    expect(securitySkill?.content).toContain("Security Review");
    expect(simplifierSkill?.content).toContain("Code Simplifier");
    expect(testGuardSkill?.content).toContain("Test Guard");
  });

  it("generates junie-specific skill files for junie target", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "node_ts_min"),
      pack: "default",
      targets: { codex: false, copilot: false, claude: false, junie: true, gemini: false, antigravity: false }
    });

    const junieSkill = files.find((f) => f.path === ".junie/skills/code-reviewer/SKILL.md");
    expect(junieSkill).toBeDefined();
    expect(junieSkill?.content).toContain("Code Quality Review");

    // Should NOT generate cross-platform .agents/skills/ when only junie is selected
    const crossPlatformSkills = files.filter((f) => f.path.startsWith(".agents/skills/"));
    expect(crossPlatformSkills).toHaveLength(0);
  });

  it("does not generate skill files when no skill-eligible target is selected", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "node_ts_min"),
      pack: "default",
      targets: { codex: false, copilot: false, claude: true, junie: false, gemini: false, antigravity: false }
    });

    const crossPlatformSkills = files.filter((f) => f.path.startsWith(".agents/skills/"));
    const junieSkills = files.filter((f) => f.path.startsWith(".junie/skills/"));
    expect(crossPlatformSkills).toHaveLength(0);
    expect(junieSkills).toHaveLength(0);
  });

  it("renders detailed generic rulebook for mixed-language fixture", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "salad_min"),
      pack: "default",
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
      policy: { strictness: "very-strict", standards: "project-plus-standard" }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    expect(agents?.content).toContain("Rule System Mode");
    expect(agents?.content).toContain("Very-strict");
    expect(agents?.content).toContain("Language and Framework Practices");
    expect(agents?.content).toContain("Messy/Legacy Code Stabilization");
    expect(agents?.content).toContain("Execution Guardrails");
    expect(agents?.content).toContain(MANDATORY_CONVENTIONS_TITLE);
  });

  it("supports short profiles for copilot and claude outputs", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "node_ts_min"),
      pack: "default",
      targets: { codex: false, copilot: true, claude: true, junie: true, gemini: true, antigravity: true },
      policy: {
        strictness: "strict",
        standards: "auto",
        copilotProfile: "short",
        claudeProfile: "short",
        junieProfile: "short",
        geminiProfile: "short",
        antigravityProfile: "short"
      }
    });

    const claude = files.find((f) => f.path === "CLAUDE.md");
    const gemini = files.find((f) => f.path === "GEMINI.md");
    const junie = files.find((f) => f.path === ".junie/guidelines.md");
    const antigravity = files.find((f) => f.path === ".agent/rules/rulesmith.instructions.md");
    const copilot = files.find((f) => f.path === ".github/copilot-instructions.md");

    expect(claude?.content).toContain("profile: `short`");
    expect(copilot?.content).toContain("profile: `short`");
    expect(junie?.content).toContain("profile: `short`");
    expect(gemini?.content).toContain("profile: `short`");
    expect(antigravity?.content).toContain("profile: `short`");
    expect(claude?.content).not.toContain("Detailed Conventions");
    expect(copilot?.content).not.toContain("Detailed Conventions");
    expect(junie?.content).not.toContain("Detailed Conventions");
    expect(gemini?.content).not.toContain("Detailed Conventions");
    expect(antigravity?.content).not.toContain("Detailed Conventions");
    expect(claude?.content).toContain(MANDATORY_CONVENTIONS_TITLE);
    expect(copilot?.content).toContain(MANDATORY_CONVENTIONS_TITLE);
    expect(junie?.content).toContain(MANDATORY_CONVENTIONS_TITLE);
    expect(gemini?.content).toContain(MANDATORY_CONVENTIONS_TITLE);
    expect(antigravity?.content).toContain(MANDATORY_CONVENTIONS_TITLE);
  });

  it("renders hybrid Flutter conventions for Flutter repositories", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "flutter_min"),
      pack: "default",
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
      policy: {
        strictness: "very-strict",
        standards: "project-plus-standard"
      }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    expect(agents?.content).toContain("Flutter Hybrid Conventions");
    expect(agents?.content).toContain("Repository-specific convention");
    expect(agents?.content).toContain("Compatible standards overlay");
    expect(agents?.content).toContain("dart format .");
    expect(agents?.content).toContain("flutter analyze");
  });

  it("keeps Flutter repos with native host wrappers in Flutter-first hybrid mode", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "flutter_hosted_min"),
      pack: "default",
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
      policy: {
        strictness: "very-strict",
        standards: "project-plus-standard"
      }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    expect(agents?.content).toContain("Flutter Hybrid Conventions");
    expect(agents?.content).toContain("flutter pub get");
    expect(agents?.content).toContain("flutter analyze");
    expect(agents?.content).not.toContain("Spring Boot Hybrid Conventions");
    expect(agents?.content).not.toContain("Messy/Legacy Code Stabilization");
    expect(agents?.content).toContain("Detected frameworks: flutter (0.75).");
  });

  it("extracts deeper repo boundaries for structured Flutter repositories", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "flutter_structured_min"),
      pack: "default",
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
      policy: {
        strictness: "very-strict",
        standards: "project-plus-standard"
      }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    expect(agents?.content).toContain("Repository-specific convention (ui): Flutter route-level screens and reusable widgets already live in distinct folders");
    expect(agents?.content).toContain("Repository-specific convention (state): Flutter app state already has a dedicated state boundary");
    expect(agents?.content).toContain("Repository-specific convention (data): Flutter backend/auth/data access is already pushed into dedicated service layers");
    expect(agents?.content).toContain("Repository-specific convention (localization): Localized copy/resources already have a dedicated boundary");
    expect(agents?.content).toContain("Compatible standards overlay");
  });

  it("extracts semantic repo boundaries even without folder-named layers", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "semantic_backend_min"),
      pack: "default",
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
      policy: {
        strictness: "very-strict",
        standards: "project-plus-standard"
      }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    expect(agents?.content).toContain("Repository-specific convention (data): Repository code already defines explicit service/repository/client boundaries in code symbols");
    expect(agents?.content).toContain("Repository-specific convention (routing): Routing and navigation behavior is already explicit in code-level router/navigation APIs");
  });

  it("emits UNKNOWN/TODO guidance for conflicting routing paradigms", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "next_conflict_min"),
      pack: "default",
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
      policy: {
        strictness: "very-strict",
        standards: "project-plus-standard"
      }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    expect(agents?.content).toContain("Both Next.js app-router and pages-router patterns are present");
  });

  it("stays Flutter-first on a noisier production-like Flutter fixture", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "flutter_noisy_realish_min"),
      pack: "default",
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
      policy: {
        strictness: "very-strict",
        standards: "project-plus-standard"
      }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    expect(agents?.content).toContain("Flutter Hybrid Conventions");
    expect(agents?.content).toContain("Detected frameworks: flutter (1).");
    expect(agents?.content).toContain("Format command: dart format .");
    expect(agents?.content).toContain("Repository-specific convention (flow): Completion flows already reset navigation back to the shell or root after setup/auth success");
    expect(agents?.content).toContain("Repository-specific convention (errors): Typed exception handling is already explicit in code");
    expect(agents?.content).toContain("Repository-specific convention (delivery): Repository docs or integration notes already coexist with contract-bearing code");
    expect(agents?.content).toContain("Repository-specific convention (routing): Flutter navigation and app-shell ownership is already explicit in app/router code");
    expect(agents?.content).toContain("Repository-specific convention (database): Parser-confirmed SQL schema/query boundaries already exist through explicit statements");
    expect(agents?.content).toContain("Repository-specific convention (security): Parser-confirmed shell safety guards are already present");
    expect(agents?.content).toContain("Repository-specific convention (ui): Flutter route-level screens and reusable widgets already live in distinct folders");
    expect(agents?.content).toContain("Repository-specific convention (database): Persistence structure is already expressed through dedicated model or migration boundaries");
    expect(agents?.content).not.toContain("Messy/Legacy Code Stabilization");
  });

  it("keeps repo-specific output on a noisier production-like Next fixture", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "next_noisy_realish_min"),
      pack: "default",
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
      policy: {
        strictness: "very-strict",
        standards: "project-plus-standard"
      }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    expect(agents?.content).toContain("Next.js Hybrid Conventions");
    expect(agents?.content).toContain("Repository-specific convention (flow): The repository already has explicit middleware or redirect flow control for guarded entrypoints");
    expect(agents?.content).toContain("Repository-specific convention (delivery): Repository docs or integration notes already coexist with contract-bearing code");
    expect(agents?.content).toContain("Repository-specific convention (routing): Next.js routing boundaries are already expressed through app/pages directories");
    expect(agents?.content).toContain("Repository-specific convention (routing): Next.js route ownership is AST-visible through exported HTTP handlers, metadata exports, middleware, or pages data-loader functions");
    expect(agents?.content).toContain("Repository-specific convention (data): AST-confirmed service/repository/client boundaries already exist through named code symbols");
    expect(agents?.content).toContain("Repository-specific convention (validation): Validation and contract objects already live in dedicated request/schema boundaries");
    expect(agents?.content).toContain("Repository-specific convention (testing): The repository already separates automated verification into dedicated test boundaries");
  });

  it("retains high-signal repo specifics for React, Express, and Vue fixtures", async () => {
    const [reactFiles, expressFiles, vueFiles] = await Promise.all([
      renderRules({
        repoPath: path.join(fixturesRoot, "react_min"),
        pack: "default",
        targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
        policy: {
          strictness: "very-strict",
          standards: "project-plus-standard"
        }
      }),
      renderRules({
        repoPath: path.join(fixturesRoot, "express_min"),
        pack: "default",
        targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
        policy: {
          strictness: "very-strict",
          standards: "project-plus-standard"
        }
      }),
      renderRules({
        repoPath: path.join(fixturesRoot, "vue_min"),
        pack: "default",
        targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
        policy: {
          strictness: "very-strict",
          standards: "project-plus-standard"
        }
      })
    ]);

    const reactAgents = reactFiles.find((f) => f.path === "AGENTS.md");
    const expressAgents = expressFiles.find((f) => f.path === "AGENTS.md");
    const vueAgents = vueFiles.find((f) => f.path === "AGENTS.md");

    expect(reactAgents?.content).toContain("Repository-specific convention (flow): The repository already encodes important redirect or navigation-flow rules in code");
    expect(reactAgents?.content).toContain("Repository-specific convention (errors): Typed exception handling is already explicit in code");
    expect(reactAgents?.content).toContain("Repository-specific convention (delivery): Repository docs or integration notes already coexist with contract-bearing code");

    expect(expressAgents?.content).toContain("Repository-specific convention (flow): Request flows already use explicit redirect or handoff boundaries in handlers or middleware");
    expect(expressAgents?.content).toContain("Repository-specific convention (errors): Typed exception handling is already explicit in code");
    expect(expressAgents?.content).toContain("Repository-specific convention (delivery): Repository docs or integration notes already coexist with contract-bearing code");

    expect(vueAgents?.content).toContain("Repository-specific convention (flow): The repository already encodes important route or redirect behavior through Vue router boundaries");
    expect(vueAgents?.content).toContain("Repository-specific convention (delivery): Repository docs or integration notes already coexist with contract-bearing code");
  });

  it("surfaces stack-specific semantic conventions for NestJS and FastAPI", async () => {
    const [nestFiles, fastapiFiles] = await Promise.all([
      renderRules({
        repoPath: path.join(fixturesRoot, "nest_min"),
        pack: "default",
        targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
        policy: {
          strictness: "very-strict",
          standards: "project-plus-standard"
        }
      }),
      renderRules({
        repoPath: path.join(fixturesRoot, "fastapi_min"),
        pack: "default",
        targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
        policy: {
          strictness: "very-strict",
          standards: "project-plus-standard"
        }
      })
    ]);

    const nestAgents = nestFiles.find((f) => f.path === "AGENTS.md");
    const fastapiAgents = fastapiFiles.find((f) => f.path === "AGENTS.md");
    expect(nestAgents?.content).toContain("Repository-specific convention (architecture): NestJS module/controller/provider boundaries are already explicit through decorators and bootstrap wiring");
    expect(nestAgents?.content).toContain("Repository-specific convention (architecture): NestJS module/controller/provider layering is AST-visible through decorators and bootstrap symbols");
    expect(fastapiAgents?.content).toContain("Repository-specific convention (routing): FastAPI endpoint boundaries are already explicit in APIRouter or app route declarations");
    expect(fastapiAgents?.content).toContain("Repository-specific convention (validation): FastAPI request, dependency, and schema contracts are already encoded in Pydantic or dependency-injection constructs");
  });

  it("surfaces stack-specific semantic conventions for Android and iOS", async () => {
    const [androidFiles, iosFiles] = await Promise.all([
      renderRules({
        repoPath: path.join(fixturesRoot, "android_min"),
        pack: "default",
        targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
        policy: {
          strictness: "very-strict",
          standards: "project-plus-standard"
        }
      }),
      renderRules({
        repoPath: path.join(fixturesRoot, "ios_min"),
        pack: "default",
        targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
        policy: {
          strictness: "very-strict",
          standards: "project-plus-standard"
        }
      })
    ]);

    const androidAgents = androidFiles.find((f) => f.path === "AGENTS.md");
    const iosAgents = iosFiles.find((f) => f.path === "AGENTS.md");
    expect(androidAgents?.content).toContain("Repository-specific convention (ui): Android presentation structure is already explicit in Compose or Activity/Fragment entrypoints");
    expect(androidAgents?.content).toContain("Repository-specific convention (state): Android state and navigation ownership already flows through ViewModel/state or navigation APIs");
    expect(iosAgents?.content).toContain("Repository-specific convention (ui): iOS presentation and navigation boundaries are already explicit in SwiftUI or UIKit entrypoints");
    expect(iosAgents?.content).toContain("Repository-specific convention (state): iOS state and async lifecycle ownership already appears through observable models or async task patterns");
    expect(iosAgents?.content).toContain("Repository-specific convention (ui): Toolchain-confirmed Swift presentation ownership is already explicit in validated Swift source files");
    expect(iosAgents?.content).toContain("Repository-specific convention (state): Toolchain-confirmed Swift async/state ownership is already explicit in validated Swift source files");
  });

  it("renders Android and iOS hybrid conventions from bootstrap seeds", async () => {
    const files = await bootstrapRules({
      repoPath: path.join(fixturesRoot, "node_ts_min"),
      pack: "default",
      seed: {
        languages: [{ name: "kotlin" }, { name: "swift" }],
        frameworks: [{ name: "android" }, { name: "ios" }],
        build: {
          commands: {
            build: "./gradlew assembleDebug",
            test: "xcodebuild test"
          },
          evidence: ["bootstrap:seed"]
        }
      },
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    expect(agents?.content).toContain("Android Hybrid Conventions");
    expect(agents?.content).toContain("iOS Hybrid Conventions");
    expect(agents?.content).toContain("Compatible standards overlay");
  });

  it.each([
    ["vue_min", "Vue Hybrid Conventions"],
    ["react_min", "React Hybrid Conventions"],
    ["next_min", "Next.js Hybrid Conventions"],
    ["express_min", "Node/Express Hybrid Conventions"],
    ["nest_min", "NestJS Hybrid Conventions"],
    ["fastapi_min", "FastAPI Hybrid Conventions"],
    ["django_min", "Django Hybrid Conventions"],
    ["spring_min", "Spring Boot Hybrid Conventions"],
    ["aspnet_min", "ASP.NET Core Hybrid Conventions"],
    ["android_min", "Android Hybrid Conventions"],
    ["ios_min", "iOS Hybrid Conventions"]
  ])("renders %s in hybrid mode", async (fixtureName, expectedSection) => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, fixtureName),
      pack: "default",
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
      policy: {
        strictness: "very-strict",
        standards: "project-plus-standard"
      }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    expect(agents?.content).toContain(expectedSection);
    expect(agents?.content).toContain("Compatible standards overlay");
  });

  it("does not include mandatory strict section in baseline mode", async () => {
    const files = await renderRules({
      repoPath: path.join(fixturesRoot, "node_ts_min"),
      pack: "default",
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: false, antigravity: false },
      policy: {
        strictness: "baseline",
        standards: "auto"
      }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    expect(agents?.content).not.toContain(MANDATORY_CONVENTIONS_TITLE);
  });

  it("renders from bootstrap seed without repository scan", async () => {
    const files = await bootstrapRules({
      repoPath: path.join(fixturesRoot, "node_ts_min"),
      pack: "default",
      seed: {
        languages: [{ name: "typescript" }],
        frameworks: [{ name: "node" }],
        build: {
          commands: {
            install: "pnpm install",
            test: "pnpm test"
          },
          evidence: ["bootstrap:seed"]
        },
        guardrails: {
          forbiddenPaths: [".git", "node_modules"]
        }
      },
      targets: { codex: true, copilot: false, claude: false, junie: false, gemini: true, antigravity: false }
    });

    const agents = files.find((f) => f.path === "AGENTS.md");
    const gemini = files.find((f) => f.path === "GEMINI.md");
    expect(agents?.content).toContain("bootstrap");
    expect(gemini?.content).toContain("Gemini CLI Rulebook");
  });
});
