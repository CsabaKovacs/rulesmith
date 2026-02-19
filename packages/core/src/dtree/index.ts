import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import type { ProjectProfile } from "../profile/schema.js";

export type DecisionCondition =
  | { has_file: string }
  | { has_dir: string }
  | { language_min_confidence: { name: string; min: number } }
  | { framework_min_confidence: { name: string; min: number } };

export type DecisionAction =
  | { include_snippets: string[] }
  | { enable_targets: Array<"codex" | "copilot" | "claude"> }
  | { generate_area_instructions: { name: string; applyTo: string }[] };

export type DecisionNode = {
  name: string;
  all?: DecisionCondition[];
  any?: DecisionCondition[];
  actions: DecisionAction[];
};

export type DecisionTree = {
  version: number;
  nodes: DecisionNode[];
};

export type DecisionResult = {
  snippets: string[];
  enabledTargets: Set<"codex" | "copilot" | "claude">;
  areaInstructions: { name: string; applyTo: string }[];
  matchedNodes: string[];
};

export async function loadDecisionTree(filePath: string): Promise<DecisionTree> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = yaml.load(raw) as DecisionTree;
  if (!parsed || !Array.isArray(parsed.nodes)) {
    throw new Error(`Invalid decision tree: ${filePath}`);
  }
  return parsed;
}

function evaluateCondition(condition: DecisionCondition, profile: ProjectProfile): boolean {
  const knownFiles = new Set<string>([
    ...profile.signals.configFiles,
    ...profile.signals.ciFiles,
    ...profile.signals.entrypoints,
    ...profile.build.evidence.map((item) => item.split("#")[0] ?? item)
  ]);
  const knownDirs = new Set<string>([
    ...profile.structure.generatedDirs,
    ...profile.structure.vendorDirs,
    ...[...knownFiles].map((file) => path.posix.dirname(file)).filter((dir) => dir && dir !== ".")
  ]);

  if ("has_file" in condition) {
    return knownFiles.has(condition.has_file);
  }
  if ("has_dir" in condition) {
    return knownDirs.has(condition.has_dir);
  }
  if ("language_min_confidence" in condition) {
    const item = profile.languages.find((lang) => lang.name === condition.language_min_confidence.name);
    return Boolean(item && item.confidence >= condition.language_min_confidence.min);
  }
  if ("framework_min_confidence" in condition) {
    const item = profile.frameworks.find((fw) => fw.name === condition.framework_min_confidence.name);
    return Boolean(item && item.confidence >= condition.framework_min_confidence.min);
  }
  return false;
}

function evaluateNode(node: DecisionNode, profile: ProjectProfile): boolean {
  const allPass = !node.all || node.all.every((condition) => evaluateCondition(condition, profile));
  const anyPass = !node.any || node.any.some((condition) => evaluateCondition(condition, profile));
  return allPass && anyPass;
}

export function evaluateDecisionTree(tree: DecisionTree, profile: ProjectProfile): DecisionResult {
  const result: DecisionResult = {
    snippets: [],
    enabledTargets: new Set(["codex", "copilot", "claude"]),
    areaInstructions: [],
    matchedNodes: []
  };

  for (const node of tree.nodes) {
    if (!evaluateNode(node, profile)) continue;
    result.matchedNodes.push(node.name);

    for (const action of node.actions) {
      if ("include_snippets" in action) {
        for (const snippet of action.include_snippets) {
          if (!result.snippets.includes(snippet)) result.snippets.push(snippet);
        }
      }
      if ("enable_targets" in action) {
        result.enabledTargets = new Set(action.enable_targets);
      }
      if ("generate_area_instructions" in action) {
        for (const area of action.generate_area_instructions) {
          const already = result.areaInstructions.some(
            (item) => item.name === area.name && item.applyTo === area.applyTo
          );
          if (!already) result.areaInstructions.push(area);
        }
      }
    }
  }

  return result;
}
