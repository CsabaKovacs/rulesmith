import fs from "node:fs/promises";
import path from "node:path";
import { ensureRepoRoot } from "../fs/safe.js";

export type RepoLayoutMode = "mono" | "scope";

export type ScopeCandidate = {
  name: string;
  path: string;
  relPath: string;
  markers: string[];
};

export type ScopeDetectionResult = {
  repoPath: string;
  recommendedMode: RepoLayoutMode;
  rootMarkers: string[];
  scopes: ScopeCandidate[];
};

const PROJECT_MARKERS = [
  "composer.json",
  "package.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "requirements.txt",
  "Gemfile"
] as const;

const IGNORE_DIRS = new Set([
  ".git",
  ".idea",
  ".vscode",
  ".rulesmith",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  "tmp",
  "temp"
]);

async function detectMarkersInDir(dirPath: string): Promise<string[]> {
  const found = await Promise.all(
    PROJECT_MARKERS.map(async (marker) => {
      const full = path.join(dirPath, marker);
      const stat = await fs.stat(full).catch(() => undefined);
      return stat?.isFile() ? marker : "";
    })
  );

  return found.filter(Boolean);
}

export async function detectRepoScopes(repoPath: string): Promise<ScopeDetectionResult> {
  const repoRoot = await ensureRepoRoot(repoPath);
  const rootMarkers = await detectMarkersInDir(repoRoot);

  const entries = await fs.readdir(repoRoot, { withFileTypes: true });
  const scopes: ScopeCandidate[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".")) continue;

    const candidatePath = path.join(repoRoot, entry.name);
    const markers = await detectMarkersInDir(candidatePath);
    if (markers.length === 0) continue;

    scopes.push({
      name: entry.name,
      path: candidatePath,
      relPath: entry.name,
      markers
    });
  }

  const recommendedMode: RepoLayoutMode = scopes.length >= 2 ? "scope" : "mono";

  return {
    repoPath: repoRoot,
    recommendedMode,
    rootMarkers,
    scopes: scopes.sort((a, b) => a.relPath.localeCompare(b.relPath))
  };
}
