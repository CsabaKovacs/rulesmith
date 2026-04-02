import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";

export const WRITE_ALLOWLIST = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".junie/guidelines.md",
  ".agent/rules/rulesmith.instructions.md",
  ".github/copilot-instructions.md",
  ".github/instructions",
  ".claude/agents",
  ".agents/skills",
  ".junie/skills",
  "<scope>/AGENTS.md",
  "<scope>/CLAUDE.md",
  "<scope>/GEMINI.md",
  "<scope>/.junie/guidelines.md",
  "<scope>/.agent/rules/rulesmith.instructions.md",
  "<scope>/.github/copilot-instructions.md",
  "<scope>/.github/instructions/*.instructions.md",
  "<scope>/.claude/agents/*.md",
  "<scope>/.agents/skills/*/SKILL.md",
  "<scope>/.junie/skills/*/SKILL.md"
] as const;

function normalizeSlashes(input: string): string {
  return input.replace(/\\/g, "/");
}

export async function ensureRepoRoot(repoPath: string): Promise<string> {
  const resolved = path.resolve(repoPath);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`repoPath is not a directory: ${repoPath}`);
  }
  return resolved;
}

export function resolveRepoRelative(repoRoot: string, relativePath: string): string {
  if (!relativePath) {
    throw new Error("Path cannot be empty");
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Absolute paths are not allowed: ${relativePath}`);
  }
  const normalized = normalizeSlashes(path.posix.normalize(relativePath));
  if (normalized.startsWith("../") || normalized === "..") {
    throw new Error(`Path traversal is not allowed: ${relativePath}`);
  }
  const fullPath = path.resolve(repoRoot, normalized);
  const rel = path.relative(repoRoot, fullPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes repo root: ${relativePath}`);
  }
  return fullPath;
}

export async function assertPathInsideRepo(repoRoot: string, fullPath: string): Promise<void> {
  const realRepo = await fs.realpath(repoRoot);
  const realPath = await fs.realpath(fullPath).catch(async (err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      let probe = path.dirname(fullPath);
      while (true) {
        try {
          const existingParent = await fs.realpath(probe);
          const unresolvedTail = path.relative(probe, fullPath);
          return path.join(existingParent, unresolvedTail);
        } catch (parentErr) {
          const typedParentErr = parentErr as NodeJS.ErrnoException;
          if (typedParentErr.code !== "ENOENT") throw parentErr;
          const next = path.dirname(probe);
          if (next === probe) throw err;
          probe = next;
        }
      }
    }
    throw err;
  });
  const rel = path.relative(realRepo, realPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Resolved path escapes repo root: ${fullPath}`);
  }
}

export function isAllowedWritePath(relativePath: string): boolean {
  const normalized = normalizeSlashes(path.posix.normalize(relativePath));
  const firstSlash = normalized.indexOf("/");
  const scopeRemainder =
    firstSlash > 0 && !normalized.startsWith(".") ? normalized.slice(firstSlash + 1) : undefined;

  const isAllowedBasePath = (candidate: string): boolean => {
    if (candidate === "AGENTS.md" || candidate === "CLAUDE.md" || candidate === "GEMINI.md") {
      return true;
    }
    if (candidate === ".junie/guidelines.md") {
      return true;
    }
    if (candidate === ".agent/rules/rulesmith.instructions.md") {
      return true;
    }
    if (candidate === ".github/copilot-instructions.md") {
      return true;
    }
    if (candidate.startsWith(".github/instructions/") && candidate.endsWith(".instructions.md")) {
      return true;
    }
    if (candidate.startsWith(".claude/agents/") && candidate.endsWith(".md")) {
      return true;
    }
    if (/^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(candidate)) {
      return true;
    }
    if (/^\.junie\/skills\/[^/]+\/SKILL\.md$/.test(candidate)) {
      return true;
    }
    return false;
  };

  if (isAllowedBasePath(normalized)) {
    return true;
  }
  if (scopeRemainder && isAllowedBasePath(scopeRemainder)) {
    return true;
  }
  return false;
}

export async function assertAllowedWritePath(repoRoot: string, relativePath: string): Promise<string> {
  if (!isAllowedWritePath(relativePath)) {
    throw new Error(`Write path is outside allowlist: ${relativePath}`);
  }
  const fullPath = resolveRepoRelative(repoRoot, relativePath);
  await assertPathInsideRepo(repoRoot, fullPath);
  return fullPath;
}

export async function readFileSafe(
  repoRoot: string,
  relativePath: string,
  maxBytesPerFile?: number
): Promise<string> {
  const fullPath = resolveRepoRelative(repoRoot, relativePath);
  await assertPathInsideRepo(repoRoot, fullPath);
  const stat = await fs.lstat(fullPath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to read symbolic link: ${relativePath}`);
  }
  const content = await fs.readFile(fullPath);
  if (maxBytesPerFile && content.length > maxBytesPerFile) {
    return `${content.subarray(0, maxBytesPerFile).toString("utf8")}\n\n...[truncated]`;
  }
  return content.toString("utf8");
}

export async function listFilesSafe(args: {
  repoRoot: string;
  glob?: string;
  max?: number;
}): Promise<string[]> {
  const { repoRoot, glob = "**/*", max = 500 } = args;
  const entries = await fg(glob, {
    cwd: repoRoot,
    onlyFiles: true,
    dot: true,
    followSymbolicLinks: false,
    unique: true,
    ignore: [".git/**"]
  });
  return entries.slice(0, max).map((p) => normalizeSlashes(p));
}

export async function writeFileSafe(args: {
  repoRoot: string;
  relativePath: string;
  content: string;
  mode?: "safe" | "force";
}): Promise<void> {
  const { repoRoot, relativePath, content, mode = "safe" } = args;
  const fullPath = await assertAllowedWritePath(repoRoot, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });

  if (mode === "safe") {
    const existing = await fs.readFile(fullPath, "utf8").catch(() => undefined);
    if (typeof existing === "string" && existing !== content) {
      throw new Error(`Refusing to overwrite existing file in safe mode: ${relativePath}`);
    }
  }

  await fs.writeFile(fullPath, content, "utf8");
}
