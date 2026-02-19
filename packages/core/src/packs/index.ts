import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDecisionTree, type DecisionTree } from "../dtree/index.js";

export type PackTemplateMap = Record<string, string>;

export type Pack = {
  name: string;
  rootDir: string;
  manifest: Record<string, unknown>;
  templates: PackTemplateMap;
  decisionTree: DecisionTree;
  orchestratorPrompts: Record<string, string>;
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

async function resolvePackRoot(startDir = process.cwd()): Promise<string> {
  const tryFindFrom = async (baseDir: string): Promise<string | undefined> => {
    let current = path.resolve(baseDir);
    const root = path.parse(current).root;

    while (true) {
      const candidate = path.join(current, "packs");
      if (await exists(candidate)) {
        return candidate;
      }
      if (current === root) {
        break;
      }
      current = path.dirname(current);
    }
    return undefined;
  };

  const fromStart = await tryFindFrom(startDir);
  if (fromStart) return fromStart;

  const fromEnv = process.env.RULESMITH_HOME ? await tryFindFrom(process.env.RULESMITH_HOME) : undefined;
  if (fromEnv) return fromEnv;

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const fromModule = await tryFindFrom(moduleDir);
  if (fromModule) return fromModule;

  return path.resolve(startDir, "packs");
}

export async function listPacks(startDir = process.cwd()): Promise<string[]> {
  const packsRoot = await resolvePackRoot(startDir);
  const entries = await fs.readdir(packsRoot, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function loadTemplates(packDir: string, overridesDir?: string): Promise<PackTemplateMap> {
  const templateDir = path.join(packDir, "templates");
  const files = await fs.readdir(templateDir, { withFileTypes: true });
  const out: PackTemplateMap = {};

  for (const file of files) {
    if (!file.isFile()) continue;
    const rel = path.join("templates", file.name);
    const overridePath = overridesDir ? path.join(overridesDir, rel) : undefined;
    const sourcePath = overridePath && (await exists(overridePath)) ? overridePath : path.join(templateDir, file.name);
    out[file.name] = await readText(sourcePath);
  }

  return out;
}

async function loadOrchestratorPrompts(packDir: string, overridesDir?: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const orchDir = path.join(packDir, "orchestrator");
  const files = await fs.readdir(orchDir, { withFileTypes: true }).catch(() => []);

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".md")) continue;
    const rel = path.join("orchestrator", file.name);
    const overridePath = overridesDir ? path.join(overridesDir, rel) : undefined;
    const sourcePath = overridePath && (await exists(overridePath)) ? overridePath : path.join(orchDir, file.name);
    const key = file.name.replace(/\.md$/, "");
    out[key] = await readText(sourcePath);
  }

  return out;
}

export async function getPack(args?: {
  pack?: string;
  startDir?: string;
  overrides?: string;
}): Promise<Pack> {
  const packName = args?.pack ?? "default";
  const packsRoot = await resolvePackRoot(args?.startDir);
  const packDir = path.join(packsRoot, packName);
  const overridesDir = args?.overrides ? path.resolve(args.overrides) : undefined;

  if (!(await exists(packDir))) {
    throw new Error(`Pack not found: ${packName}`);
  }

  const manifestPath = path.join(packDir, "pack.json");
  const manifest = JSON.parse(await readText(manifestPath));

  const decisionTreePath = overridesDir && (await exists(path.join(overridesDir, "decision-tree.yaml")))
    ? path.join(overridesDir, "decision-tree.yaml")
    : path.join(packDir, "decision-tree.yaml");

  const [templates, decisionTree, orchestratorPrompts] = await Promise.all([
    loadTemplates(packDir, overridesDir),
    loadDecisionTree(decisionTreePath),
    loadOrchestratorPrompts(packDir, overridesDir)
  ]);

  return {
    name: packName,
    rootDir: packDir,
    manifest,
    templates,
    decisionTree,
    orchestratorPrompts
  };
}
