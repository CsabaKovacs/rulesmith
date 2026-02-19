import path from "node:path";
import { listFilesSafe, readFileSafe } from "../fs/safe.js";
import { scanRepo } from "./index.js";

export type SampleStrategy = "by-folder" | "by-extension" | "laravel-focused";

export async function sampleRepo(args: {
  repoPath: string;
  strategy: SampleStrategy;
  maxFiles?: number;
  forbiddenPaths?: string[];
}): Promise<{ paths: string[]; rationale: string }> {
  const { repoPath, strategy, maxFiles = 40, forbiddenPaths = [] } = args;
  const allFiles = await listFilesSafe({ repoRoot: repoPath, glob: "**/*", max: 15000 });
  const forbiddenPrefixes = forbiddenPaths
    .filter((item) => item !== ".git")
    .map((item) => item.replace(/\/+$/, ""))
    .filter(Boolean);
  const ignoredExtensions = /\.(png|jpe?g|gif|webp|bmp|pdf|zip|tar|gz|phar|woff2?|ttf|eot|ico|mp4|mov|avi|mkv|exe|dylib|so|dll)$/i;

  const filteredFiles = allFiles.filter((file) => {
    if (ignoredExtensions.test(file)) return false;
    if (/\.tmp-browserify-/i.test(file)) return false;
    return !forbiddenPrefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
  });

  if (strategy === "laravel-focused") {
    const preferred = filteredFiles.filter((file) =>
      ["routes/", "app/Http/Controllers/", "app/Services/", "database/migrations/", "composer.json", "artisan"].some((prefix) =>
        file.startsWith(prefix) || file === prefix
      )
    );
    return {
      paths: preferred.slice(0, maxFiles),
      rationale: "Prioritized typical Laravel architecture files and runtime entrypoints."
    };
  }

  if (strategy === "by-folder") {
    const byFolder = new Map<string, string[]>();
    for (const file of filteredFiles) {
      const folder = path.posix.dirname(file);
      const list = byFolder.get(folder) ?? [];
      list.push(file);
      byFolder.set(folder, list);
    }

    const selected: string[] = [];
    for (const files of [...byFolder.values()].sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""))) {
      const first = files[0];
      if (!first) continue;
      selected.push(first);
      if (selected.length >= maxFiles) break;
    }

    return {
      paths: selected,
      rationale: "Sampled one representative file per folder to maximize structure coverage."
    };
  }

  const byExt = new Map<string, string[]>();
  for (const file of filteredFiles) {
    const ext = path.posix.extname(file) || "[no-ext]";
    const list = byExt.get(ext) ?? [];
    list.push(file);
    byExt.set(ext, list);
  }

  const selected: string[] = [];
  for (const [ext, files] of [...byExt.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    const first = files[0];
    if (!first) continue;
    selected.push(first);
    for (const file of files.slice(1, 4)) {
      selected.push(file);
      if (selected.length >= maxFiles) break;
    }
    if (selected.length >= maxFiles) break;
    if (ext === "[no-ext]" && files.length > 0 && selected.length < maxFiles) {
      selected.push(first);
    }
  }

  return {
    paths: selected.slice(0, maxFiles),
    rationale: "Balanced sample by extension frequency to cover dominant file types."
  };
}

export async function buildEvidenceBundle(args: {
  repoPath: string;
  focus: "laravel" | "generic";
  maxFiles?: number;
  includeContent?: boolean;
}): Promise<{
  profile: Awaited<ReturnType<typeof scanRepo>>;
  files: Array<{ path: string; content?: string }>;
  notes: string[];
}> {
  const { repoPath, focus, maxFiles = 60, includeContent = false } = args;
  const profile = await scanRepo(repoPath);
  const strategy: SampleStrategy = focus === "laravel" ? "laravel-focused" : "by-extension";
  const sample = await sampleRepo({
    repoPath,
    strategy,
    maxFiles,
    forbiddenPaths: profile.guardrails.forbiddenPaths
  });

  const files = includeContent
    ? await Promise.all(
        sample.paths.map(async (rel) => ({
          path: rel,
          content: await readFileSafe(repoPath, rel, 64_000)
        }))
      )
    : sample.paths.map((rel) => ({ path: rel }));

  const notes = [
    `Focus: ${focus}`,
    `Bundle mode: ${includeContent ? "with-content" : "paths-only"}`,
    sample.rationale,
    includeContent
      ? "Every claim in generated instructions should reference sampled files or profile evidence."
      : "Bundle contains only file paths. Use list_files/search/read_files MCP tools to load evidence on demand."
  ];

  return { profile, files, notes };
}
