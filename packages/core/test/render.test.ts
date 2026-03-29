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
