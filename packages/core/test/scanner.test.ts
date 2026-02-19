import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../src/scanner/index.js";

const root = path.resolve(process.cwd(), "../../examples/fixtures");

describe("scanner", () => {
  it("detects laravel with evidence and confidence", async () => {
    const repo = path.join(root, "laravel_messy_min");
    const profile = await scanRepo(repo);

    const fw = profile.frameworks.find((x) => x.name === "laravel");
    expect(fw).toBeDefined();
    expect(fw?.confidence).toBeGreaterThanOrEqual(0.5);
    expect(fw?.evidence).toContain("composer.json");
    expect(profile.build.evidence.join(" ")).toMatch(/composer\.json/);
  });

  it("detects node/typescript evidence", async () => {
    const repo = path.join(root, "node_ts_min");
    const profile = await scanRepo(repo);

    const ts = profile.languages.find((x) => x.name === "typescript");
    expect(ts).toBeDefined();
    expect(ts?.evidence.join(" ")).toMatch(/tsconfig/);

    expect(profile.build.commands.lint).toContain("eslint");
    expect(profile.build.commands.format).toContain("prettier");
  });

  it("detects vue framework evidence", async () => {
    const repo = path.join(root, "vue_min");
    const profile = await scanRepo(repo);

    const vue = profile.frameworks.find((x) => x.name === "vue");
    expect(vue).toBeDefined();
    expect(vue?.confidence).toBeGreaterThanOrEqual(0.5);
    expect(vue?.evidence.join(" ")).toMatch(/vite\.config|App\.vue|package\.json#dependencies\.vue/);
    expect(profile.signals.configFiles).toContain("vite.config.ts");
  });

  it("detects mixed-language repos without framework manifests", async () => {
    const repo = path.join(root, "salad_min");
    const profile = await scanRepo(repo);

    const langs = new Set(profile.languages.map((x) => x.name));
    expect(langs.has("python")).toBe(true);
    expect(langs.has("javascript")).toBe(true);
    expect(langs.has("go")).toBe(true);
  });
});
