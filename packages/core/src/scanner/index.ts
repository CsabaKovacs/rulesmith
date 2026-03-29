import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { ensureRepoRoot, listFilesSafe, readFileSafe } from "../fs/safe.js";
import type { ProjectProfile, WeightedEvidence } from "../profile/schema.js";

const GENERATED_DIR_CANDIDATES = [
  "dist",
  "build",
  "coverage",
  ".dart_tool",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".pytest_cache",
  "__pycache__",
  "target",
  "bin",
  "obj",
  ".gradle",
  "storage/framework/cache",
  "bootstrap/cache"
];

const VENDOR_DIR_CANDIDATES = ["vendor", "node_modules", ".venv", "venv", "Pods"];

const CONFIG_CANDIDATES = [
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
  "nuxt.config.ts",
  "nuxt.config.js",
  "vue.config.js",
  "composer.json",
  "pubspec.yaml",
  "analysis_options.yaml",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "mix.exs",
  "Package.swift",
  ".eslintrc",
  ".eslintrc.json",
  "eslint.config.js",
  "prettier.config.js",
  ".prettierrc",
  "ruff.toml",
  "mypy.ini",
  ".flake8",
  "pytest.ini"
];

const ENTRYPOINT_CANDIDATES = [
  "artisan",
  "index.php",
  "src/index.ts",
  "src/main.ts",
  "src/main.js",
  "src/App.vue",
  "app.vue",
  "main.py",
  "app.py",
  "manage.py",
  "cmd/main.go",
  "src/main.rs",
  "src/lib.rs",
  "Program.cs",
  "lib/main.dart",
  "bin/www",
  "android/app/src/main/AndroidManifest.xml",
  "ios/Runner/AppDelegate.swift"
];

const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  php: [".php", ".phtml"],
  python: [".py"],
  ruby: [".rb", ".rake"],
  go: [".go"],
  rust: [".rs"],
  java: [".java"],
  kotlin: [".kt", ".kts"],
  csharp: [".cs"],
  dart: [".dart"],
  swift: [".swift"],
  scala: [".scala"],
  elixir: [".ex", ".exs"],
  shell: [".sh", ".bash", ".zsh"],
  c: [".c", ".h"],
  cpp: [".cc", ".cpp", ".cxx", ".hpp", ".hh", ".hxx"],
  sql: [".sql"]
};

const EXT_TO_LANGUAGE = new Map<string, string>(
  Object.entries(LANGUAGE_EXTENSIONS).flatMap(([lang, extensions]) => extensions.map((ext) => [ext, lang] as const))
);

async function exists(repoRoot: string, relPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(repoRoot, relPath));
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(repoRoot: string, relPath: string): Promise<Record<string, unknown> | undefined> {
  if (!(await exists(repoRoot, relPath))) return undefined;
  const raw = await readFileSafe(repoRoot, relPath, 2_000_000);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function readTextSafe(repoRoot: string, relPath: string): Promise<string | undefined> {
  if (!(await exists(repoRoot, relPath))) return undefined;
  return readFileSafe(repoRoot, relPath, 1_000_000);
}

function confidenceFromSignals(matched: number, total: number): number {
  if (total === 0) return 0;
  return Number((matched / total).toFixed(2));
}

function clampConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function mergeWeighted(items: WeightedEvidence[]): WeightedEvidence[] {
  const merged = new Map<string, WeightedEvidence>();
  for (const item of items) {
    const prior = merged.get(item.name);
    if (!prior) {
      merged.set(item.name, {
        name: item.name,
        confidence: item.confidence,
        evidence: [...item.evidence]
      });
      continue;
    }
    prior.confidence = Math.max(prior.confidence, item.confidence);
    prior.evidence = [...new Set([...prior.evidence, ...item.evidence])];
  }
  return [...merged.values()].sort((a, b) => b.confidence - a.confidence);
}

function pickCommandFromScripts(scripts: Record<string, unknown> | undefined, candidates: string[]): string | undefined {
  if (!scripts || typeof scripts !== "object") return undefined;
  for (const key of candidates) {
    const value = scripts[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function depVersions(manifest: Record<string, unknown> | undefined): Record<string, string> {
  const deps = {
    ...(((manifest?.dependencies as Record<string, unknown> | undefined) ?? {})),
    ...(((manifest?.devDependencies as Record<string, unknown> | undefined) ?? {})),
    ...(((manifest?.require as Record<string, unknown> | undefined) ?? {}))
  };

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(deps)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

async function detectLaravel(repoRoot: string): Promise<{ framework?: WeightedEvidence; language?: WeightedEvidence }> {
  const checks = ["composer.json", "artisan", "routes", "app"];
  const evidence: string[] = [];

  for (const item of checks) {
    if (await exists(repoRoot, item)) evidence.push(item);
  }

  if (evidence.length === 0) return {};

  const confidence = confidenceFromSignals(evidence.length, checks.length);
  return {
    framework: { name: "laravel", confidence, evidence: [...evidence] },
    language: { name: "php", confidence: Math.max(confidence, 0.7), evidence: [...evidence] }
  };
}

async function detectNodeTs(repoRoot: string): Promise<{ framework?: WeightedEvidence; languages: WeightedEvidence[] }> {
  const checks = ["package.json", "tsconfig.json", "eslint.config.js", ".eslintrc", ".prettierrc", "prettier.config.js"];
  const evidence: string[] = [];
  for (const item of checks) {
    if (await exists(repoRoot, item)) evidence.push(item);
  }

  if (evidence.length === 0) return { languages: [] };

  const tsEvidence = evidence.filter((e) => e.includes("tsconfig") || e.includes("eslint") || e.includes("prettier"));
  const nodeConfidence = confidenceFromSignals(evidence.length, checks.length);
  const languages: WeightedEvidence[] = [
    { name: "javascript", confidence: Math.max(0.45, nodeConfidence), evidence: ["package.json"] }
  ];

  if (tsEvidence.length > 0) {
    languages.push({
      name: "typescript",
      confidence: confidenceFromSignals(tsEvidence.length, 4),
      evidence: tsEvidence
    });
  }

  return {
    framework: { name: "node", confidence: nodeConfidence, evidence },
    languages
  };
}

async function detectFlutter(repoRoot: string): Promise<{ framework?: WeightedEvidence; language?: WeightedEvidence }> {
  const checks = ["pubspec.yaml", "analysis_options.yaml", "lib", ".dart_tool"];
  const evidence: string[] = [];
  for (const item of checks) {
    if (await exists(repoRoot, item)) evidence.push(item);
  }

  if (evidence.length === 0) return {};

  const confidence = confidenceFromSignals(evidence.length, checks.length);
  return {
    framework: { name: "flutter", confidence, evidence: [...evidence] },
    language: { name: "dart", confidence: Math.max(confidence, 0.7), evidence: [...evidence] }
  };
}

async function detectNativeMobile(repoRoot: string): Promise<{ frameworks: WeightedEvidence[]; languages: WeightedEvidence[] }> {
  const frameworks: WeightedEvidence[] = [];
  const languages: WeightedEvidence[] = [];

  const androidEvidence = (
    await Promise.all(
      [
        "android/app/src/main/AndroidManifest.xml",
        "android/app/build.gradle",
        "android/app/build.gradle.kts",
        "android/build.gradle",
        "android/build.gradle.kts",
        "app/src/main/AndroidManifest.xml"
      ].map(async (item) => ((await exists(repoRoot, item)) ? item : undefined))
    )
  ).filter((item): item is string => Boolean(item));
  const androidKotlinFiles = await listFilesSafe({ repoRoot, glob: "{android,app}/**/*.{kt,kts}", max: 12 });
  const androidJavaFiles = await listFilesSafe({ repoRoot, glob: "{android,app}/**/*.java", max: 12 });

  if (androidEvidence.length > 0 || androidKotlinFiles.length > 0 || androidJavaFiles.length > 0) {
    const evidence = [...new Set([...androidEvidence, ...androidKotlinFiles.slice(0, 4), ...androidJavaFiles.slice(0, 4)])];
    frameworks.push({
      name: "android",
      confidence: Number(
        Math.max(
          0.65,
          Math.min(1, confidenceFromSignals(androidEvidence.length + Math.min(androidKotlinFiles.length + androidJavaFiles.length, 3), 6))
        ).toFixed(2)
      ),
      evidence
    });

    if (androidKotlinFiles.length > 0) {
      languages.push({
        name: "kotlin",
        confidence: clampConfidence(Math.max(0.7, confidenceFromSignals(androidKotlinFiles.length, Math.max(androidKotlinFiles.length, 4)))),
        evidence: androidKotlinFiles.slice(0, 6)
      });
    } else if (androidJavaFiles.length > 0) {
      languages.push({
        name: "java",
        confidence: clampConfidence(Math.max(0.65, confidenceFromSignals(androidJavaFiles.length, Math.max(androidJavaFiles.length, 4)))),
        evidence: androidJavaFiles.slice(0, 6)
      });
    }
  }

  const iosEvidence = (
    await Promise.all(
      [
        "ios/Runner.xcodeproj/project.pbxproj",
        "ios/Runner/Info.plist",
        "ios/Runner/AppDelegate.swift",
        "ios/Runner/SceneDelegate.swift",
        "Package.swift"
      ].map(async (item) => ((await exists(repoRoot, item)) ? item : undefined))
    )
  ).filter((item): item is string => Boolean(item));
  const swiftFiles = await listFilesSafe({ repoRoot, glob: "{ios,macos,Sources}/**/*.swift", max: 16 });

  if (iosEvidence.length > 0 || swiftFiles.length > 0) {
    const evidence = [...new Set([...iosEvidence, ...swiftFiles.slice(0, 6)])];
    frameworks.push({
      name: "ios",
      confidence: Number(
        Math.max(0.65, Math.min(1, confidenceFromSignals(iosEvidence.length + Math.min(swiftFiles.length, 3), 6))).toFixed(2)
      ),
      evidence
    });
    languages.push({
      name: "swift",
      confidence: clampConfidence(Math.max(0.7, confidenceFromSignals(swiftFiles.length || iosEvidence.length, 4))),
      evidence: evidence.slice(0, 6)
    });
  }

  return { frameworks, languages };
}

async function detectVue(repoRoot: string): Promise<{ framework?: WeightedEvidence }> {
  const evidence = new Set<string>();
  const fileChecks = [
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.cjs",
    "nuxt.config.ts",
    "nuxt.config.js",
    "vue.config.js",
    "src/main.ts",
    "src/main.js",
    "src/App.vue",
    "app.vue"
  ];

  for (const item of fileChecks) {
    if (await exists(repoRoot, item)) evidence.add(item);
  }

  const vueFiles = await listFilesSafe({ repoRoot, glob: "{src,components,pages,app}/**/*.vue", max: 8 });
  for (const file of vueFiles) evidence.add(file);

  const pkg = await readJsonSafe(repoRoot, "package.json");
  const deps = depVersions(pkg);
  const depChecks = ["vue", "nuxt", "@vue/cli-service", "@vitejs/plugin-vue", "vue-router", "pinia"];
  for (const depName of depChecks) {
    if (deps[depName]) evidence.add(`package.json#dependencies.${depName}`);
  }

  if (evidence.size === 0) return {};

  const depEvidence = [...evidence].filter((item) => item.startsWith("package.json#dependencies.")).length;
  const vueFileEvidence = [...evidence].filter((item) => item.endsWith(".vue")).length;
  const configEvidence = [...evidence].length - depEvidence - vueFileEvidence;

  const confidence = Math.min(
    1,
    Number((Math.min(depEvidence, 2) * 0.35 + Math.min(vueFileEvidence, 2) * 0.25 + Math.min(configEvidence, 3) * 0.1).toFixed(2))
  );

  return {
    framework: {
      name: "vue",
      confidence: Math.max(0.5, confidence),
      evidence: [...evidence].sort()
    }
  };
}

async function detectEcosystemSignals(repoRoot: string): Promise<{ frameworks: WeightedEvidence[]; languages: WeightedEvidence[] }> {
  const frameworks: WeightedEvidence[] = [];
  const languages: WeightedEvidence[] = [];

  const addFramework = (name: string, confidence: number, evidence: string[]) => {
    if (evidence.length === 0) return;
    frameworks.push({ name, confidence: Number(Math.max(0.2, Math.min(1, confidence)).toFixed(2)), evidence: [...new Set(evidence)] });
  };

  const addLanguage = (name: string, confidence: number, evidence: string[]) => {
    if (evidence.length === 0) return;
    languages.push({ name, confidence: Number(Math.max(0.2, Math.min(1, confidence)).toFixed(2)), evidence: [...new Set(evidence)] });
  };

  const packageJson = await readJsonSafe(repoRoot, "package.json");
  const packageDeps = depVersions(packageJson);
  if (packageJson) {
    addLanguage("javascript", 0.55, ["package.json"]);

    const jsFrameworkDeps: Array<[string, string, number]> = [
      ["react", "react", 0.8],
      ["next", "nextjs", 0.9],
      ["nuxt", "nuxt", 0.9],
      ["@angular/core", "angular", 0.85],
      ["svelte", "svelte", 0.8],
      ["express", "express", 0.75],
      ["react-native", "react-native", 0.8],
      ["nestjs", "nest", 0.75],
      ["@nestjs/core", "nest", 0.85],
      ["fastify", "fastify", 0.75],
      ["koa", "koa", 0.7],
      ["hono", "hono", 0.7]
    ];

    for (const [depName, frameworkName, confidence] of jsFrameworkDeps) {
      if (packageDeps[depName]) {
        addFramework(frameworkName, confidence, [`package.json#dependencies.${depName}`]);
      }
    }

    const hasTsconfig = await exists(repoRoot, "tsconfig.json");
    if (packageDeps.typescript || hasTsconfig) {
      addLanguage("typescript", 0.65, ["package.json", ...(hasTsconfig ? ["tsconfig.json"] : [])]);
    }
  }

  const pyproject = await readTextSafe(repoRoot, "pyproject.toml");
  const requirements = await readTextSafe(repoRoot, "requirements.txt");
  const requirementsDev = await readTextSafe(repoRoot, "requirements-dev.txt");
  if (pyproject || requirements || requirementsDev) {
    addLanguage("python", 0.7, [
      ...(pyproject ? ["pyproject.toml"] : []),
      ...(requirements ? ["requirements.txt"] : []),
      ...(requirementsDev ? ["requirements-dev.txt"] : [])
    ]);

    const pyText = [pyproject, requirements, requirementsDev].filter((v): v is string => Boolean(v)).join("\n").toLowerCase();
    if (/django/.test(pyText)) addFramework("django", 0.85, ["pyproject.toml", "requirements.txt"]);
    if (/flask/.test(pyText)) addFramework("flask", 0.8, ["pyproject.toml", "requirements.txt"]);
    if (/fastapi/.test(pyText)) addFramework("fastapi", 0.85, ["pyproject.toml", "requirements.txt"]);
    if (/starlette/.test(pyText)) addFramework("starlette", 0.75, ["pyproject.toml", "requirements.txt"]);
  }

  const goMod = await readTextSafe(repoRoot, "go.mod");
  if (goMod) {
    addLanguage("go", 0.8, ["go.mod"]);
    if (/gin-gonic\/gin/.test(goMod)) addFramework("gin", 0.8, ["go.mod"]);
    if (/labstack\/echo/.test(goMod)) addFramework("echo", 0.8, ["go.mod"]);
    if (/gofiber\/fiber/.test(goMod)) addFramework("fiber", 0.8, ["go.mod"]);
  }

  const cargoToml = await readTextSafe(repoRoot, "Cargo.toml");
  if (cargoToml) {
    addLanguage("rust", 0.8, ["Cargo.toml"]);
    if (/actix-web/.test(cargoToml)) addFramework("actix", 0.8, ["Cargo.toml"]);
    if (/axum/.test(cargoToml)) addFramework("axum", 0.8, ["Cargo.toml"]);
    if (/rocket/.test(cargoToml)) addFramework("rocket", 0.8, ["Cargo.toml"]);
  }

  const pomXml = await readTextSafe(repoRoot, "pom.xml");
  const gradle = await readTextSafe(repoRoot, "build.gradle");
  const gradleKts = await readTextSafe(repoRoot, "build.gradle.kts");
  const javaBuildText = [pomXml, gradle, gradleKts].filter((v): v is string => Boolean(v)).join("\n");
  if (javaBuildText.length > 0) {
    addLanguage("java", 0.7, [
      ...(pomXml ? ["pom.xml"] : []),
      ...(gradle ? ["build.gradle"] : []),
      ...(gradleKts ? ["build.gradle.kts"] : [])
    ]);

    if (/spring-boot|org\.springframework\.boot/.test(javaBuildText)) addFramework("spring-boot", 0.85, ["pom.xml", "build.gradle", "build.gradle.kts"]);
    if (/quarkus/.test(javaBuildText)) addFramework("quarkus", 0.8, ["pom.xml", "build.gradle", "build.gradle.kts"]);
    if (/micronaut/.test(javaBuildText)) addFramework("micronaut", 0.8, ["pom.xml", "build.gradle", "build.gradle.kts"]);
  }

  const gemfile = await readTextSafe(repoRoot, "Gemfile");
  if (gemfile) {
    addLanguage("ruby", 0.75, ["Gemfile"]);
    if (/gem ['\"]rails['\"]/.test(gemfile)) addFramework("rails", 0.9, ["Gemfile"]);
    if (/gem ['\"]sinatra['\"]/.test(gemfile)) addFramework("sinatra", 0.8, ["Gemfile"]);
  }

  const csprojFiles = await listFilesSafe({ repoRoot, glob: "**/*.csproj", max: 30 });
  if (csprojFiles.length > 0) {
    addLanguage("csharp", 0.75, csprojFiles.slice(0, 3));
    for (const csproj of csprojFiles.slice(0, 10)) {
      const content = await readTextSafe(repoRoot, csproj);
      if (!content) continue;
      if (/Microsoft\.AspNetCore|<Project Sdk=\"Microsoft\.NET\.Sdk\.Web\"/.test(content)) {
        addFramework("aspnet", 0.85, [csproj]);
        break;
      }
    }
  }

  const mixExs = await readTextSafe(repoRoot, "mix.exs");
  if (mixExs) {
    addLanguage("elixir", 0.75, ["mix.exs"]);
    if (/\{:phoenix,/.test(mixExs)) addFramework("phoenix", 0.85, ["mix.exs"]);
  }

  const packageSwift = await readTextSafe(repoRoot, "Package.swift");
  if (packageSwift) {
    addLanguage("swift", 0.75, ["Package.swift"]);
    if (/vapor/.test(packageSwift)) addFramework("vapor", 0.8, ["Package.swift"]);
  }

  const androidManifestExists = (await exists(repoRoot, "android/app/src/main/AndroidManifest.xml")) || (await exists(repoRoot, "app/src/main/AndroidManifest.xml"));
  if (androidManifestExists) {
    addFramework("android", 0.75, [
      ...(await exists(repoRoot, "android/app/src/main/AndroidManifest.xml") ? ["android/app/src/main/AndroidManifest.xml"] : []),
      ...(await exists(repoRoot, "android/app/build.gradle.kts") ? ["android/app/build.gradle.kts"] : []),
      ...(await exists(repoRoot, "android/app/build.gradle") ? ["android/app/build.gradle"] : [])
    ]);
  }

  const xcodeprojExists = await exists(repoRoot, "ios/Runner.xcodeproj/project.pbxproj");
  const appDelegateExists = await exists(repoRoot, "ios/Runner/AppDelegate.swift");
  if (xcodeprojExists || appDelegateExists) {
    addFramework("ios", 0.75, [
      ...(xcodeprojExists ? ["ios/Runner.xcodeproj/project.pbxproj"] : []),
      ...(appDelegateExists ? ["ios/Runner/AppDelegate.swift"] : []),
      ...(await exists(repoRoot, "ios/Runner/Info.plist") ? ["ios/Runner/Info.plist"] : [])
    ]);
  }

  return { frameworks, languages };
}

function shouldIgnoreForLanguageDetection(file: string, blockedPrefixes: string[]): boolean {
  const ignoredExt = /\.(png|jpe?g|gif|webp|bmp|pdf|zip|tar|gz|phar|woff2?|ttf|eot|ico|mp4|mov|avi|mkv|exe|dylib|so|dll|min\.js)$/i;
  if (ignoredExt.test(file)) return true;
  if (/\.tmp-browserify-/i.test(file)) return true;
  return blockedPrefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
}

function detectLanguagesByExtensions(allFiles: string[], blockedPrefixes: string[]): WeightedEvidence[] {
  const langCounts = new Map<string, { count: number; evidence: string[] }>();

  let totalClassified = 0;
  for (const file of allFiles) {
    if (shouldIgnoreForLanguageDetection(file, blockedPrefixes)) continue;

    const basename = path.posix.basename(file);
    let language = EXT_TO_LANGUAGE.get(path.posix.extname(file).toLowerCase());
    if (!language && basename === "Makefile") language = "make";
    if (!language && basename === "Dockerfile") language = "dockerfile";
    if (!language) continue;

    totalClassified += 1;
    const state = langCounts.get(language) ?? { count: 0, evidence: [] };
    state.count += 1;
    if (state.evidence.length < 6) state.evidence.push(file);
    langCounts.set(language, state);
  }

  if (totalClassified === 0) return [];

  const weighted: WeightedEvidence[] = [];
  for (const [language, state] of langCounts.entries()) {
    const share = state.count / totalClassified;
    let confidence = Number(Math.min(1, Math.max(0.15, share * 2.2)).toFixed(2));
    if (state.count === 1) confidence = Math.min(confidence, 0.25);
    if (state.count >= 20 && share >= 0.4) confidence = Math.max(confidence, 0.8);

    weighted.push({
      name: language,
      confidence,
      evidence: state.evidence
    });
  }

  return weighted;
}

async function extractBuildCommands(repoRoot: string): Promise<{ commands: ProjectProfile["build"]["commands"]; evidence: string[] }> {
  const commands: ProjectProfile["build"]["commands"] = {};
  const evidence: string[] = [];

  const packageJson = await readJsonSafe(repoRoot, "package.json");
  const composerJson = await readJsonSafe(repoRoot, "composer.json");
  const pyproject = await readTextSafe(repoRoot, "pyproject.toml");
  const requirements = await readTextSafe(repoRoot, "requirements.txt");
  const goMod = await readTextSafe(repoRoot, "go.mod");
  const cargoToml = await readTextSafe(repoRoot, "Cargo.toml");
  const pomXml = await readTextSafe(repoRoot, "pom.xml");
  const gradle = await readTextSafe(repoRoot, "build.gradle");
  const gradleKts = await readTextSafe(repoRoot, "build.gradle.kts");
  const gemfile = await readTextSafe(repoRoot, "Gemfile");
  const mixExs = await readTextSafe(repoRoot, "mix.exs");
  const csprojFiles = await listFilesSafe({ repoRoot, glob: "**/*.csproj", max: 20 });

  if (packageJson) {
    const scripts = ((packageJson.scripts as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;

    commands.install ??= "pnpm install";
    commands.build ??= pickCommandFromScripts(scripts, ["build"]);
    commands.test ??= pickCommandFromScripts(scripts, ["test", "test:unit"]);
    commands.lint ??= pickCommandFromScripts(scripts, ["lint", "check"]);
    commands.format ??= pickCommandFromScripts(scripts, ["format", "fmt"]);
    commands.dev ??= pickCommandFromScripts(scripts, ["dev", "start", "development"]);

    evidence.push("package.json#scripts");
  }

  if (composerJson) {
    const scripts = ((composerJson.scripts as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;

    commands.install = packageJson ? "composer install && pnpm install" : (commands.install ?? "composer install");
    commands.test ??= pickCommandFromScripts(scripts, ["test"]);
    commands.lint ??= pickCommandFromScripts(scripts, ["lint", "phpstan", "pint"]);
    commands.format ??= pickCommandFromScripts(scripts, ["format", "pint"]);

    evidence.push("composer.json#scripts");
  }

  const pubspec = await readTextSafe(repoRoot, "pubspec.yaml");
  const analysisOptions = await readTextSafe(repoRoot, "analysis_options.yaml");
  if (pubspec) {
    commands.install ??= "flutter pub get";
    commands.build ??= "flutter build apk";
    commands.test ??= "flutter test";
    commands.lint ??= analysisOptions ? "flutter analyze" : (commands.lint ?? "dart analyze");
    commands.format ??= "dart format .";
    commands.dev ??= "flutter run";
    evidence.push("pubspec.yaml");
    if (analysisOptions) evidence.push("analysis_options.yaml");
  }

  if (pyproject || requirements) {
    if (pyproject && /\[tool\.poetry\]/.test(pyproject)) {
      commands.install ??= "poetry install";
      commands.test ??= "poetry run pytest";
      commands.lint ??= "poetry run ruff check .";
      commands.format ??= "poetry run ruff format .";
      evidence.push("pyproject.toml");
    } else {
      commands.install ??= requirements ? "pip install -r requirements.txt" : "pip install .";
      commands.test ??= "pytest";
      commands.lint ??= "ruff check .";
      commands.format ??= "ruff format .";
      evidence.push(requirements ? "requirements.txt" : "pyproject.toml");
    }
  }

  if (goMod) {
    commands.install ??= "go mod download";
    commands.build ??= "go build ./...";
    commands.test ??= "go test ./...";
    commands.lint ??= "golangci-lint run";
    commands.format ??= "gofmt -w .";
    evidence.push("go.mod");
  }

  if (cargoToml) {
    commands.install ??= "cargo fetch";
    commands.build ??= "cargo build";
    commands.test ??= "cargo test";
    commands.lint ??= "cargo clippy --all-targets --all-features -- -D warnings";
    commands.format ??= "cargo fmt";
    evidence.push("Cargo.toml");
  }

  if (pomXml) {
    commands.install ??= "mvn -q -DskipTests dependency:resolve";
    commands.build ??= "mvn -q -DskipTests package";
    commands.test ??= "mvn test";
    evidence.push("pom.xml");
  }

  if (gradle || gradleKts) {
    commands.install ??= "./gradlew dependencies";
    commands.build ??= "./gradlew build -x test";
    commands.test ??= "./gradlew test";
    commands.lint ??= "./gradlew check";
    evidence.push(gradle ? "build.gradle" : "build.gradle.kts");
  }

  const androidManifestExists = (await exists(repoRoot, "android/app/src/main/AndroidManifest.xml")) || (await exists(repoRoot, "app/src/main/AndroidManifest.xml"));
  if (androidManifestExists && !pubspec) {
    commands.build ??= "./gradlew assembleDebug";
    commands.test ??= "./gradlew test";
    commands.lint ??= "./gradlew lint";
    evidence.push(
      (await exists(repoRoot, "android/app/src/main/AndroidManifest.xml")) ? "android/app/src/main/AndroidManifest.xml" : "app/src/main/AndroidManifest.xml"
    );
  }

  if (gemfile) {
    commands.install ??= "bundle install";
    commands.test ??= "bundle exec rspec";
    commands.lint ??= "bundle exec rubocop";
    evidence.push("Gemfile");
  }

  if (mixExs) {
    commands.install ??= "mix deps.get";
    commands.build ??= "mix compile";
    commands.test ??= "mix test";
    commands.format ??= "mix format";
    evidence.push("mix.exs");
  }

  if (csprojFiles.length > 0) {
    commands.install ??= "dotnet restore";
    commands.build ??= "dotnet build";
    commands.test ??= "dotnet test";
    commands.format ??= "dotnet format";
    evidence.push(csprojFiles[0] ?? "*.csproj");
  }

  const xcodeprojFiles = await listFilesSafe({ repoRoot, glob: "{ios,macos}/**/*.xcodeproj/project.pbxproj", max: 20 });
  if (xcodeprojFiles.length > 0) {
    commands.build ??= "xcodebuild build";
    commands.test ??= "xcodebuild test";
    evidence.push(xcodeprojFiles[0] ?? "*.xcodeproj/project.pbxproj");
  }

  const makefile = await readTextSafe(repoRoot, "Makefile");
  if (makefile) {
    const hasTarget = (name: string) => new RegExp(`^${name}\\s*:`, "m").test(makefile);
    commands.build ??= hasTarget("build") ? "make build" : commands.build;
    commands.test ??= hasTarget("test") ? "make test" : commands.test;
    commands.lint ??= hasTarget("lint") ? "make lint" : commands.lint;
    commands.format ??= hasTarget("format") || hasTarget("fmt") ? "make format" : commands.format;
    commands.dev ??= hasTarget("dev") ? "make dev" : commands.dev;
    evidence.push("Makefile");
  }

  const workflowFiles = await listFilesSafe({ repoRoot, glob: ".github/workflows/*.{yml,yaml}", max: 120 });
  for (const workflowFile of workflowFiles) {
    const content = await readFileSafe(repoRoot, workflowFile);
    let parsed: unknown;
    try {
      parsed = yaml.load(content);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || !parsed) continue;
    const jobs = (parsed as { jobs?: Record<string, { steps?: Array<{ run?: string }> }> }).jobs ?? {};

    for (const job of Object.values(jobs)) {
      for (const step of job.steps ?? []) {
        if (!step.run) continue;
        const run = step.run;

        if (!commands.test && /(pnpm|npm|yarn|composer|flutter|pytest|go\s+test|cargo\s+test|mvn\s+test|gradle\s+test|dotnet\s+test|mix\s+test|bundle\s+exec\s+rspec)/i.test(run)) {
          commands.test = run;
        }
        if (!commands.lint && /(pnpm|npm|yarn|composer|flutter|ruff|flake8|eslint|golangci-lint|clippy|rubocop|pylint|checkstyle|detekt|dotnet\s+format)/i.test(run)) {
          commands.lint = run;
        }
        if (!commands.build && /(pnpm|npm|yarn|composer|flutter|go\s+build|cargo\s+build|mvn\s+.*package|gradle\s+build|dotnet\s+build|mix\s+compile)/i.test(run)) {
          commands.build = run;
        }
        if (!commands.format && /(pnpm|npm|yarn|composer|flutter|prettier|black|ruff\s+format|gofmt|cargo\s+fmt|mix\s+format|dotnet\s+format)/i.test(run)) {
          commands.format = run;
        }
      }
    }
    evidence.push(`${workflowFile}#jobs.steps.run`);
  }

  return { commands, evidence: [...new Set(evidence)] };
}

async function detectMonorepo(repoRoot: string): Promise<{ monorepo: boolean; workspaces?: string[] }> {
  const workspaces: string[] = [];
  let monorepo = false;

  if (await exists(repoRoot, "pnpm-workspace.yaml")) {
    const raw = await readFileSafe(repoRoot, "pnpm-workspace.yaml");
    const parsed = yaml.load(raw) as { packages?: string[] } | null;
    if (parsed?.packages?.length) {
      workspaces.push(...parsed.packages);
      monorepo = true;
    }
  }

  const packageJson = await readJsonSafe(repoRoot, "package.json");
  if (packageJson) {
    const parsed = packageJson as { workspaces?: string[] | { packages?: string[] } };
    if (Array.isArray(parsed.workspaces)) {
      workspaces.push(...parsed.workspaces);
      monorepo = true;
    } else if (parsed.workspaces && Array.isArray(parsed.workspaces.packages)) {
      workspaces.push(...parsed.workspaces.packages);
      monorepo = true;
    }
  }

  const monorepoFiles = ["turbo.json", "nx.json", "lerna.json", "rush.json", "go.work"];
  for (const monofile of monorepoFiles) {
    if (await exists(repoRoot, monofile)) {
      monorepo = true;
      workspaces.push(monofile);
    }
  }

  if ((await exists(repoRoot, "Cargo.toml")) && (await exists(repoRoot, "crates"))) {
    monorepo = true;
    workspaces.push("crates/*");
  }

  if (workspaces.length > 0) {
    return { monorepo, workspaces: [...new Set(workspaces)] };
  }

  return { monorepo };
}

async function collectDirMatches(repoRoot: string, candidates: string[]): Promise<string[]> {
  const matches: string[] = [];
  for (const candidate of candidates) {
    if (await exists(repoRoot, candidate)) matches.push(candidate);
  }
  return matches;
}

export async function scanRepo(repoPath: string): Promise<ProjectProfile> {
  const repoRoot = await ensureRepoRoot(repoPath);

  const [laravel, nodeTs, flutter, vue, nativeMobile, ecosystem, build, mono, generatedDirs, vendorDirs, allFiles] = await Promise.all([
    detectLaravel(repoRoot),
    detectNodeTs(repoRoot),
    detectFlutter(repoRoot),
    detectVue(repoRoot),
    detectNativeMobile(repoRoot),
    detectEcosystemSignals(repoRoot),
    extractBuildCommands(repoRoot),
    detectMonorepo(repoRoot),
    collectDirMatches(repoRoot, GENERATED_DIR_CANDIDATES),
    collectDirMatches(repoRoot, VENDOR_DIR_CANDIDATES),
    listFilesSafe({ repoRoot, glob: "**/*", max: 70000 })
  ]);

  const blockedPrefixes = [...new Set([".git", ...generatedDirs, ...vendorDirs])];
  const extensionLanguages = detectLanguagesByExtensions(allFiles, blockedPrefixes);

  const fileStats = await Promise.all(
    allFiles.slice(0, 5000).map(async (relPath) => {
      const stat = await fs.stat(path.join(repoRoot, relPath));
      return stat.size;
    })
  );

  const configFiles = (await Promise.all(CONFIG_CANDIDATES.map(async (f) => ((await exists(repoRoot, f)) ? f : undefined)))).filter(
    (x): x is string => Boolean(x)
  );

  const ciFiles = await listFilesSafe({ repoRoot, glob: ".github/workflows/*.{yml,yaml}", max: 100 });
  const entrypoints = (
    await Promise.all(ENTRYPOINT_CANDIDATES.map(async (f) => ((await exists(repoRoot, f)) ? f : undefined)))
  ).filter((x): x is string => Boolean(x));

  const languages = mergeWeighted(
    [laravel.language, ...nodeTs.languages, flutter.language, ...nativeMobile.languages, ...ecosystem.languages, ...extensionLanguages].filter(
      (x): x is WeightedEvidence => Boolean(x)
    )
  );

  const frameworks = mergeWeighted(
    [laravel.framework, nodeTs.framework, flutter.framework, vue.framework, ...nativeMobile.frameworks, ...ecosystem.frameworks].filter(
      (x): x is WeightedEvidence => Boolean(x)
    )
  );

  const forbiddenPaths = [...new Set([".git", ...generatedDirs, ...vendorDirs])];
  const notes = [
    "Do not edit generated or dependency directories.",
    "Prefer scoped edits and evidence-backed claims in generated instructions."
  ];

  return {
    repoRoot,
    signals: {
      configFiles,
      ciFiles,
      entrypoints
    },
    languages,
    frameworks,
    build,
    structure: {
      monorepo: mono.monorepo,
      workspaces: mono.workspaces,
      generatedDirs,
      vendorDirs
    },
    guardrails: {
      forbiddenPaths,
      notes
    },
    meta: {
      repoSize: {
        files: allFiles.length,
        bytes: fileStats.reduce((acc, size) => acc + size, 0)
      },
      scannedAt: new Date().toISOString()
    }
  };
}
