# Project Conventions (Evidence-Backed)

## Project Snapshot
- Detected frameworks: node (0.17). (evidence: package.json)
- Detected languages: typescript (1), javascript (0.61), dart (0.15), php (0.15), go (0.15), python (0.15). (evidence: package.json, examples/fixtures/vue_min/vite.config.ts, packages/cli/src/index.ts, packages/cli/dist/index.d.ts, packages/core/src/index.ts, packages/core/dist/index.d.ts)
- Build command coverage: install=yes, build=yes, test=yes, lint=yes, format=no. (evidence: package.json#scripts)
- Monorepo signal detected (packages/*). (evidence: packages/*)
- Repository size estimate: 5120 files scanned.

## Setup Commands (with evidence)
- install: `pnpm install`
- build: `pnpm -r build`
- test: `pnpm -r test`
- lint: `pnpm -r lint`
- format: `UNKNOWN`
- dev: `UNKNOWN`

Evidence:
- package.json#scripts

## Detailed Conventions
### Rule System Mode
- Very-strict: require explicit evidence for every architectural claim, block style drift, and treat unknowns as stop points until clarified.
- Project+standard mode: combine repository conventions with language-standard style baselines.
- Standard profiles applied: TypeScript standards: strict TS config, ESLint, and Prettier. JavaScript standards: ESLint + Prettier with explicit module boundaries and side-effect discipline.
- Enforcement: require explicit evidence links for non-trivial rules; unresolved assumptions must remain UNKNOWN/TODO.
### Repository Layout
- Top directories by source-file volume: packages (47), examples (20), [root] (8), packs (8). (evidence: packages, examples, [root], packs)
- Entrypoints detected: none detected.
- Manifest/config files detected: package.json, pnpm-workspace.yaml. (evidence: package.json, pnpm-workspace.yaml)
### Build, Test, and Tooling
- Install command: pnpm install. (evidence: package.json#scripts)
- Build command: pnpm -r build. (evidence: package.json#scripts)
- Test command: pnpm -r test. (evidence: package.json#scripts)
- Lint command: pnpm -r lint. (evidence: package.json#scripts)
- Format command: UNKNOWN. (evidence: package.json#scripts)
- Quality tooling configs detected: none detected.
### Language and Framework Practices
- TypeScript is present; keep strict typing, avoid implicit any, and prefer typed module boundaries. (evidence: package.json, examples/fixtures/vue_min/vite.config.ts, packages/cli/src/index.ts, packages/cli/dist/index.d.ts, packages/core/src/index.ts, packages/core/dist/index.d.ts)
- JavaScript is present; keep module boundaries explicit and avoid hidden side effects in shared utilities. (evidence: package.json, examples/fixtures/node_ts_min/eslint.config.js, packages/cli/dist/index.js, packages/core/dist/index.js, packages/mcp/dist/server.js, examples/fixtures/salad_min/api/server.js)
- Dart is present; keep widget/app layer boundaries explicit and avoid coupling UI code to transport/storage details. (evidence: examples/fixtures/flutter_min/lib/main.dart)
- PHP is present; preserve existing framework conventions and avoid mixing framework and scripting styles in the same layer. (evidence: examples/fixtures/laravel_messy_min/routes/web.php, examples/fixtures/laravel_messy_min/app/Http/Controllers/HomeController.php)
- Go is present; keep package layout predictable (cmd/internal/pkg style) and preserve explicit error handling. (evidence: examples/fixtures/salad_min/scripts/job.go)
- Python is present; keep package/module boundaries explicit and prefer small, testable functions over script-style global flows. (evidence: examples/fixtures/salad_min/legacy/main.py)
- node detected; follow existing framework conventions and keep new code consistent with current architecture. (evidence: package.json)
### Code Health Signals
- Sampled code files for structural metrics: 48.
- Files with import/use-style module wiring: 38.
- Files containing class declarations: 3.
- Files containing function/procedure declarations: 29.
- Test files detected: 5.
- Documentation files detected: 2.
- TODO/FIXME markers observed in sampled files: 30.
- Potentially large files (>500 lines) found: 5. (evidence: packages/cli/src/index.ts, packages/core/dist/render/rulebook.js, packages/core/dist/scanner/index.js, packages/core/src/render/rulebook.ts, packages/core/src/scanner/index.ts)
### Messy/Legacy Code Stabilization
- No single dominant framework signal found or the repository is strongly polyglot; treat it as a mixed/legacy codebase and enforce incremental standardization. (evidence: package.json)
- Before broad refactors, codify target boundaries per top-level directory and migrate one boundary at a time.
- Require evidence-backed architecture decisions: every new pattern should cite existing files that justify it.
- Introduce tests around touched flows first, then refactor internals behind those tests.
- Avoid large style-only rewrites; prioritize behavior-safe, scoped cleanups with explicit rollback points.
### Execution Guardrails
- Forbidden paths: .git, node_modules. (evidence: .git, node_modules)
- Do not edit generated or dependency directories.
- Prefer scoped edits and evidence-backed claims in generated instructions.
### Implementation Playbook
- Match local naming/layout conventions in the files you touch; do not introduce a second style within one module/package.
- Keep diffs scoped to the smallest boundary that can satisfy the change request.
- When command/tooling confidence is low, run discovery first and write UNKNOWN/TODO explicitly in generated guidance.
- Preserve compatibility with existing CI/tooling before adopting new build systems or framework patterns.
- Every non-trivial change proposal should point to concrete evidence files in this repository.

## Detected Frameworks
- node (confidence: 0.17) evidence: package.json

## Guardrails
Forbidden paths:
- .git
- node_modules

Notes:
- Do not edit generated or dependency directories.
- Prefer scoped edits and evidence-backed claims in generated instructions.

## UNKNOWN/TODO
- Format command is not confidently detected.
