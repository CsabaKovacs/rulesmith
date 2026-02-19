import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildEvidenceBundle } from "../src/scanner/sampling.js";

const fixturesRoot = path.resolve(process.cwd(), "../../examples/fixtures");

describe("evidence bundle", () => {
  it("returns paths-only bundle by default", async () => {
    const bundle = await buildEvidenceBundle({
      repoPath: path.join(fixturesRoot, "laravel_messy_min"),
      focus: "laravel",
      maxFiles: 8
    });

    expect(bundle.files.length).toBeGreaterThan(0);
    expect(bundle.files.every((file) => typeof file.path === "string" && file.path.length > 0)).toBe(true);
    expect(bundle.files.every((file) => !("content" in file))).toBe(true);
    expect(bundle.notes.join(" ")).toContain("paths-only");
  });

  it("includes file contents when includeContent=true", async () => {
    const bundle = await buildEvidenceBundle({
      repoPath: path.join(fixturesRoot, "node_ts_min"),
      focus: "generic",
      maxFiles: 6,
      includeContent: true
    });

    expect(bundle.files.length).toBeGreaterThan(0);
    expect(bundle.files.some((file) => typeof file.content === "string")).toBe(true);
    expect(bundle.notes.join(" ")).toContain("with-content");
  });
});
