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

  it("does not emit false laravel or flutter signals for a noisy Next repository", async () => {
    const repo = path.join(root, "next_noisy_realish_min");
    const profile = await scanRepo(repo);

    const frameworks = new Set(profile.frameworks.map((x) => x.name));
    const languages = new Set(profile.languages.map((x) => x.name));

    expect(frameworks.has("nextjs")).toBe(true);
    expect(frameworks.has("laravel")).toBe(false);
    expect(frameworks.has("flutter")).toBe(false);
    expect(languages.has("typescript")).toBe(true);
    expect(languages.has("php")).toBe(false);
    expect(languages.has("dart")).toBe(false);
  });

  it("requires real Dart and pubspec evidence before claiming Flutter", async () => {
    const repo = path.join(root, "flutter_noisy_realish_min");
    const profile = await scanRepo(repo);

    const flutter = profile.frameworks.find((x) => x.name === "flutter");
    const dart = profile.languages.find((x) => x.name === "dart");
    expect(flutter?.confidence).toBeGreaterThanOrEqual(0.75);
    expect(flutter?.evidence.join(" ")).toMatch(/pubspec\.yaml/);
    expect(dart?.evidence.join(" ")).toMatch(/main\.dart|pubspec\.yaml/);
  });
});
