import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertAllowedWritePath, isAllowedWritePath, readFileSafe, writeFileSafe } from "../src/fs/safe.js";

const tmpRoots: string[] = [];

async function mkTmp(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rulesmith-safe-"));
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tmpRoots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("safe fs", () => {
  it("enforces write allowlist", async () => {
    const repo = await mkTmp();
    await expect(assertAllowedWritePath(repo, "README.md")).rejects.toThrow(/allowlist/i);
    await expect(assertAllowedWritePath(repo, "AGENTS.md")).resolves.toContain("AGENTS.md");
    await expect(assertAllowedWritePath(repo, "GEMINI.md")).resolves.toContain("GEMINI.md");
    await expect(assertAllowedWritePath(repo, ".junie/guidelines.md")).resolves.toContain(".junie/guidelines.md");
    await expect(assertAllowedWritePath(repo, ".agent/rules/rulesmith.instructions.md")).resolves.toContain(
      ".agent/rules/rulesmith.instructions.md"
    );
    await expect(assertAllowedWritePath(repo, "backend/AGENTS.md")).resolves.toContain("backend/AGENTS.md");
    expect(isAllowedWritePath(".github/instructions/api.instructions.md")).toBe(true);
    expect(isAllowedWritePath(".junie/guidelines.md")).toBe(true);
    expect(isAllowedWritePath(".agent/rules/rulesmith.instructions.md")).toBe(true);
    expect(isAllowedWritePath("backend/.github/copilot-instructions.md")).toBe(true);
    expect(isAllowedWritePath("backend/.github/instructions/api.instructions.md")).toBe(true);
    expect(isAllowedWritePath(".claude/agents/code-reviewer.md")).toBe(true);
    expect(isAllowedWritePath(".claude/agents/security-reviewer.md")).toBe(true);
    expect(isAllowedWritePath("backend/.claude/agents/code-reviewer.md")).toBe(true);
    expect(isAllowedWritePath(".claude/agents/not-md-file.txt")).toBe(false);
    expect(isAllowedWritePath(".agents/skills/code-reviewer/SKILL.md")).toBe(true);
    expect(isAllowedWritePath(".agents/skills/security-reviewer/SKILL.md")).toBe(true);
    expect(isAllowedWritePath(".junie/skills/code-reviewer/SKILL.md")).toBe(true);
    expect(isAllowedWritePath("backend/.agents/skills/code-reviewer/SKILL.md")).toBe(true);
    expect(isAllowedWritePath("backend/.junie/skills/code-reviewer/SKILL.md")).toBe(true);
    expect(isAllowedWritePath(".agents/skills/code-reviewer/evil.txt")).toBe(false);
    expect(isAllowedWritePath(".agents/skills/SKILL.md")).toBe(false);
  });

  it("rejects traversal and absolute reads", async () => {
    const repo = await mkTmp();
    await fs.writeFile(path.join(repo, "foo.txt"), "ok", "utf8");

    await expect(readFileSafe(repo, "../foo.txt")).rejects.toThrow(/traversal/i);
    await expect(readFileSafe(repo, path.resolve(repo, "foo.txt"))).rejects.toThrow(/absolute/i);
  });

  it("blocks safe overwrite for changed content", async () => {
    const repo = await mkTmp();
    await writeFileSafe({ repoRoot: repo, relativePath: "AGENTS.md", content: "A" });
    await expect(writeFileSafe({ repoRoot: repo, relativePath: "AGENTS.md", content: "B", mode: "safe" })).rejects.toThrow(
      /safe mode/i
    );
  });

  it("allows writing .github instructions when parent dirs do not exist", async () => {
    const repo = await mkTmp();
    await expect(
      writeFileSafe({
        repoRoot: repo,
        relativePath: ".github/instructions/routes.instructions.md",
        content: "ok",
        mode: "safe"
      })
    ).resolves.toBeUndefined();
  });

  it("rejects symlink that escapes repo root", async () => {
    const repo = await mkTmp();
    const outside = await mkTmp();
    const outsideFile = path.join(outside, "outside.txt");
    await fs.writeFile(outsideFile, "outside", "utf8");

    const link = path.join(repo, "link.txt");
    await fs.symlink(outsideFile, link);

    await expect(readFileSafe(repo, "link.txt")).rejects.toThrow(/escapes repo root|symbolic link/i);
  });
});
