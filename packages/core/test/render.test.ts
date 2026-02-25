import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderRules } from "../src/render/index.js";
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
});
