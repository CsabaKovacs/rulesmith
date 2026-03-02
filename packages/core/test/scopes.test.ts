import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectRepoScopes } from "../src/scanner/scopes.js";

const root = path.resolve(process.cwd(), "../../examples/fixtures");

describe("scope detection", () => {
  it("recommends scope mode when multiple project scopes exist", async () => {
    const repo = path.join(root, "monorepo_scope_min");
    const result = await detectRepoScopes(repo);

    expect(result.recommendedMode).toBe("scope");
    expect(result.scopes.map((scope) => scope.relPath)).toEqual(["backend", "frontend"]);
  });

  it("recommends mono mode for single-project repos", async () => {
    const repo = path.join(root, "node_ts_min");
    const result = await detectRepoScopes(repo);

    expect(result.recommendedMode).toBe("mono");
    expect(result.scopes.length).toBe(0);
  });
});
