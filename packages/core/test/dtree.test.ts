import { describe, expect, it } from "vitest";
import { evaluateDecisionTree, type DecisionTree } from "../src/dtree/index.js";
import type { ProjectProfile } from "../src/profile/schema.js";

const profile: ProjectProfile = {
  repoRoot: "/tmp/repo",
  signals: { configFiles: ["composer.json"], ciFiles: [], entrypoints: ["artisan"] },
  languages: [{ name: "php", confidence: 0.9, evidence: ["composer.json"] }],
  frameworks: [{ name: "laravel", confidence: 0.9, evidence: ["artisan", "routes"] }],
  build: { commands: {}, evidence: [] },
  structure: { monorepo: false, generatedDirs: ["dist"], vendorDirs: ["vendor"] },
  guardrails: { forbiddenPaths: ["vendor"], notes: [] },
  meta: { scannedAt: new Date().toISOString() }
};

describe("decision tree", () => {
  it("evaluates nodes and emits actions", () => {
    const tree: DecisionTree = {
      version: 1,
      nodes: [
        {
          name: "laravel",
          all: [{ framework_min_confidence: { name: "laravel", min: 0.8 } }],
          actions: [
            { include_snippets: ["laravel-conventions"] },
            { generate_area_instructions: [{ name: "routes", applyTo: "routes/**/*.php" }] }
          ]
        }
      ]
    };

    const result = evaluateDecisionTree(tree, profile);
    expect(result.matchedNodes).toContain("laravel");
    expect(result.snippets).toContain("laravel-conventions");
    expect(result.areaInstructions[0]).toEqual({ name: "routes", applyTo: "routes/**/*.php" });
  });
});
