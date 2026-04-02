# Claude Code Operating Rulebook (Evidence-Backed)

## Execution Contract
- **BINDING**: This rulebook is mandatory. Every rule, convention, and workflow defined here MUST be followed without exception. Skipping, ignoring, or partially applying rules is a violation. If a rule conflicts with your default behavior, the rulebook takes precedence.
- Use strict evidence-first behavior: every non-trivial claim must cite concrete files from this repository.
- Enforce repository conventions before introducing new patterns.
- Keep changes reviewable and scoped: prefer the smallest behavior-safe diff that fits the touched boundary.
- strictness: `very-strict`
- standards: `project-plus-standard`
- profile: `strict`

## Project Snapshot
- **What**: rulesmith — local-first CLI + MCP server for evidence-backed AI coding instruction generation. (evidence: package.json, README.md)
- **Stack**: TypeScript monorepo managed by pnpm with 3 workspace packages. (evidence: pnpm-workspace.yaml, tsconfig.base.json)
- **Packages**:
  - `packages/core` — scanner, evidence bundler, rulebook builder, AST analysis, template renderer, decision tree engine, pack system, safe FS utilities. (evidence: packages/core/src/index.ts)
  - `packages/cli` — Commander-based CLI that wraps core functions. (evidence: packages/cli/src/index.ts)
  - `packages/mcp` — MCP server (Model Context Protocol) that wraps core functions via `@modelcontextprotocol/sdk`. (evidence: packages/mcp/src/server.ts)
- **Key directories**:
  - `packs/default/` — Handlebars templates + decision tree YAML + orchestrator prompts for rule generation. (evidence: packs/default/pack.json)
  - `examples/fixtures/` — Test fixture repositories for various frameworks (Flutter, ASP.NET, Django, Next.js, etc.). **These are test data, NOT production code.** (evidence: examples/fixtures/)
  - `docs/` — Documentation and integration guides. (evidence: docs/)
  - `scripts/` — Helper scripts. (evidence: scripts/run_rulesmith_mcp.mjs)
- Build command coverage: install=yes, build=yes, test=yes, lint=yes. (evidence: package.json)

## Setup Commands (with evidence)
- install: `pnpm install`
- build: `pnpm -r build`
- test: `pnpm -r test`
- lint: `pnpm -r lint`
- format: `UNKNOWN` (no format script in package.json)
- dev: `UNKNOWN`

Evidence: package.json, pnpm-workspace.yaml

## Detailed Conventions

### TypeScript Configuration
- Target: ES2022, module: NodeNext, moduleResolution: NodeNext. (evidence: tsconfig.base.json)
- Strict mode enabled with `noUncheckedIndexedAccess: true`. (evidence: tsconfig.base.json)
- All packages extend `tsconfig.base.json` at the repo root. (evidence: tsconfig.base.json)
- Use `.js` extensions in import paths (NodeNext resolution requires explicit extensions). (evidence: packages/core/src/index.ts — all re-exports use `.js` suffix)

### Module and Export Patterns
- Each package has a barrel `src/index.ts` that re-exports public API. (evidence: packages/core/src/index.ts)
- Functions are module-level — no class-based service pattern in core logic. Use plain exported functions with typed parameters. (evidence: packages/core/src/scanner/index.ts, packages/core/src/render/index.ts)
- Types are defined via `type` aliases and Zod-inferred types, not classes or interfaces. (evidence: packages/core/src/profile/schema.ts, packages/core/src/render/workflow.ts)
- Inter-package imports use the package name (e.g., `import { scanRepo } from "@rulesmith/core"`). (evidence: packages/mcp/src/server.ts, packages/cli/src/index.ts)

### Schema and Validation
- Zod is used for schema definitions and runtime validation at package boundaries. (evidence: packages/core/src/profile/schema.ts — `projectProfileSchema`, `weightedEvidenceSchema`)
- The MCP server uses Zod schemas for tool parameter validation. (evidence: packages/mcp/src/server.ts)
- Define Zod schema first, then infer TypeScript type with `z.infer<>`. (evidence: packages/core/src/profile/schema.ts)

### AST Analysis Pipeline
- Multi-parser system supporting: TypeScript (via `typescript` compiler API), Java/PHP/Python/Rust (via `@lezer/*` parsers), Shell (via `bash-parser`), SQL (via `node-sql-parser`). (evidence: packages/core/src/render/ast.ts)
- AST facts are collected into typed structures (`TsAstFacts`, `LezerAstFacts`, `ShellAstFacts`, `SqlAstFacts`) then converted to `AstConventionCandidate` items. (evidence: packages/core/src/render/ast.ts)
- Extension-to-language mapping drives parser selection. (evidence: packages/core/src/render/ast.ts — `EXTENSION_LANGUAGE_MAP`)

### File System Safety
- All file reads/writes go through `packages/core/src/fs/safe.ts` helpers. (evidence: packages/core/src/fs/safe.ts)
- `resolveRepoRelative()` blocks path traversal (`../`) and absolute paths. (evidence: packages/core/src/fs/safe.ts)
- `assertPathInsideRepo()` validates resolved real paths stay within repo root. (evidence: packages/core/src/fs/safe.ts)
- Write operations are restricted to a `WRITE_ALLOWLIST` of known instruction file paths. (evidence: packages/core/src/fs/safe.ts — `WRITE_ALLOWLIST`)
- `writeFileSafe()` has `safe` mode (skip if exists) and `force` mode (overwrite). (evidence: packages/core/src/fs/safe.ts)
- `fast-glob` is used for file listing with `.git/**` always ignored. (evidence: packages/core/src/fs/safe.ts — `listFilesSafe`)

### Rendering Pipeline
- Handlebars templates in `packs/default/templates/` generate target-specific instruction files. (evidence: packs/default/templates/claude.md.hbs, packs/default/templates/agents.md.hbs)
- `buildRulebook()` produces a structured rulebook from `ProjectProfile` + policy settings. (evidence: packages/core/src/render/rulebook.ts)
- `buildAgentWorkflowSpec()` generates agent role definitions and post-change workflow steps from profile. (evidence: packages/core/src/render/workflow.ts)
- In-memory `artifactStore` (Map with 30-min TTL, max 100 entries) holds rendered files between render and apply calls. (evidence: packages/core/src/render/index.ts)
- Decision tree (YAML) drives conditional template inclusion and target selection. (evidence: packages/core/src/dtree/index.ts, packs/default/decision-tree.yaml)

### Pack System
- Packs are located under `packs/` directory, resolved by walking up from cwd or `RULESMITH_HOME`. (evidence: packages/core/src/packs/index.ts — `resolvePackRoot`)
- Each pack contains: `pack.json` manifest, `templates/` directory, `decision-tree.yaml`, optional `orchestrator/` prompts. (evidence: packages/core/src/packs/index.ts — `getPack`)
- Template overrides are supported via an `overrides` directory parameter. (evidence: packages/core/src/packs/index.ts — `loadTemplates`)

### Testing
- Vitest is the test runner. Tests live in `packages/core/test/`. (evidence: packages/core/test/render.test.ts, packages/core/test/scanner.test.ts)
- Test file naming: `<module>.test.ts` matching source module names. (evidence: packages/core/test/dtree.test.ts, packages/core/test/fs.safe.test.ts)
- Snapshot tests are used for render output verification. (evidence: packages/core/test/__snapshots__/render.test.ts.snap)
- Fixture-based testing: `examples/fixtures/` contains minimal project structures for each supported framework. (evidence: examples/fixtures/laravel_messy_min/, examples/fixtures/flutter_noisy_realish_min/)

### Error Handling
- Functions throw `Error` with descriptive messages for validation failures. (evidence: packages/core/src/fs/safe.ts — path validation errors)
- Async operations use try/catch with `.catch(() => undefined)` for optional file existence checks. (evidence: packages/core/src/scanner/scopes.ts, packages/core/src/packs/index.ts)
- No custom error classes — standard `Error` is used throughout. (evidence: packages/core/src/fs/safe.ts, packages/core/src/render/index.ts)

### MCP Server Pattern
- Single `start()` function creates `McpServer`, registers all tools via `registerTool` helper, connects to `StdioServerTransport`. (evidence: packages/mcp/src/server.ts)
- Each MCP tool maps directly to a core function. `asToolResult()` wraps responses as JSON text content. (evidence: packages/mcp/src/server.ts)
- Tool parameters validated by Zod schemas inline. (evidence: packages/mcp/src/server.ts)

### CLI Pattern
- Commander-based with subcommands (`scan`, `bootstrap`, `render`, `sample`, etc.). (evidence: packages/cli/src/index.ts)
- Flag parsing uses dedicated `parse*` helper functions with explicit error messages. (evidence: packages/cli/src/index.ts — `parseTargets`, `parseStrictness`, `parseStandards`)
- Interactive prompts via `readline/promises`. (evidence: packages/cli/src/index.ts)

### Code Style
- Async/await throughout — no callback patterns. (evidence: all source files)
- `Record<string, unknown>` for untyped JSON objects instead of `any`. (evidence: packages/core/src/scanner/index.ts — `readJsonSafe`)
- Private helpers are module-scoped functions (not exported), public API exported from barrel. (evidence: packages/core/src/render/rulebook.ts — `dedupe`, `withTrailingPeriod` are unexported)
- Constants use UPPER_SNAKE_CASE for configuration arrays/maps. (evidence: packages/core/src/scanner/index.ts — `GENERATED_DIR_CANDIDATES`, `VENDOR_DIR_CANDIDATES`)
- Utility functions use camelCase. Type names use PascalCase. (evidence: all source files)

### Build, Test, and Tooling
- Install command: `pnpm install`. (evidence: package.json)
- Build command: `pnpm -r build` (recursive across all packages). (evidence: package.json)
- Test command: `pnpm -r test` (runs vitest in each package). (evidence: package.json)
- Lint command: `pnpm -r lint`. (evidence: package.json)
- `dist/` directories contain compiled JavaScript output — do not edit directly. (evidence: packages/core/dist/, packages/cli/dist/, packages/mcp/dist/)

### Execution Guardrails
- Forbidden paths: `.git`, `node_modules`, `dist/` (generated output), `vendor/`. (evidence: .gitignore, packages/core/src/scanner/index.ts — `VENDOR_DIR_CANDIDATES`)
- Do not edit files in `examples/fixtures/` unless adding or modifying test fixture data.
- Do not edit generated or dependency directories.
- Prefer scoped edits and evidence-backed claims in generated instructions.

### Implementation Playbook
- Match local naming/layout conventions in the files you touch; do not introduce a second style within one module/package.
- Keep diffs scoped to the smallest boundary that can satisfy the change request.
- Apply DRY: avoid copy-pasted business logic and converge repeated patterns through focused, evidence-backed abstractions.
- No premature abstraction: only extract shared frameworks/utilities when repetition is real and stable.
- Prefer cohesive, smaller files/modules over mega files; split by responsibility while avoiding over-fragmentation.
- When adding a new scanner/renderer feature, follow the existing pattern: add to core, export from barrel, wrap in both CLI and MCP.
- New Handlebars templates go in `packs/default/templates/` and must be registered in the render pipeline. (evidence: packages/core/src/render/index.ts)
- New Zod schemas should live in `packages/core/src/profile/schema.ts` or a dedicated schema file near usage.

### Mandatory System-Conventions (Strict Enforcement)
- This section is mandatory under strict/very-strict mode. All rules below are enforceable constraints, not optional recommendations.
- When generating code, preserve system-found architecture, naming, layering, and dependency patterns from the repository. Do not introduce alternate implementations unless an explicit migration task exists.
- If multiple patterns exist, prefer the one already used in the touched boundary/module. Do not cross-mix styles within a single feature flow.
- Introducing new frameworks, linters, formatters, or architectural styles is forbidden by default. Any exception requires explicit approval and rollout notes.
- When confidence is insufficient for a convention decision, stop and record UNKNOWN/TODO instead of inventing a new pattern.
- TypeScript conventions MUST be preserved: strict typing, NodeNext modules, `.js` import extensions, Zod for schemas, typed function parameters. (evidence: tsconfig.base.json, packages/core/src/profile/schema.ts)
- File safety boundaries MUST be preserved: all file I/O through `safe.ts` helpers, `WRITE_ALLOWLIST` for writes, path traversal prevention. (evidence: packages/core/src/fs/safe.ts)

### Documentation Maintenance
- When behavior or public contracts change, update both developer docs and user-facing docs in the same delivery. (evidence: README.md, CONTRIBUTING.md, docs/)
- Require TSDoc/JSDoc for exported APIs, shared utilities, and complex domain logic.
- Keep onboarding/usage docs aligned with actual commands, config, and integration flow after each meaningful change.

### Strict Quality Gates (DO / DON'T)
- DO keep claims and conventions tied to explicit evidence files.
- DO keep changes scoped, reviewable, and behavior-safe.
- DO apply DRY only when repeated logic is proven by multiple concrete call sites.
- DON'T introduce speculative abstractions before stable repetition exists.
- DON'T grow monolithic files/classes; keep responsibilities cohesive and human-readable.
- DON'T mix functional changes with large style-only rewrites.

### Testing Minimum Bar
- Every meaningful behavior change must include/update at least one fitting test or explicit manual verification note. (evidence: packages/core/test/)
- Contract changes (API/CLI/config) require backward-compatibility checks and explicit expected output verification.
- Refactors require smoke checks that prove unchanged runtime behavior on touched paths.
- New scanner/render features should include fixture-based tests using `examples/fixtures/`. (evidence: packages/core/test/scanner.test.ts)

### Security and Performance Checklist
- Security: all file paths must go through `resolveRepoRelative` + `assertPathInsideRepo` before reading/writing. (evidence: packages/core/src/fs/safe.ts)
- Security: write paths must be in `WRITE_ALLOWLIST` — never write to arbitrary paths. (evidence: packages/core/src/fs/safe.ts)
- Security: validate all MCP tool inputs via Zod schemas at the server boundary. (evidence: packages/mcp/src/server.ts)
- Performance: use `includeContent=false` in evidence bundles when file content is not needed. (evidence: packages/core/src/scanner/sampling.ts)
- Performance: cap file listing with `max` parameter to avoid scanning entire large repos. (evidence: packages/core/src/fs/safe.ts — `listFilesSafe`)
- Performance: artifact store has TTL (30 min) and max size (100) to prevent memory leaks. (evidence: packages/core/src/render/index.ts)

### Dependency and Change Safety Policy
- Dependency changes must include rationale and compatibility/tooling impact. (evidence: package.json, pnpm-workspace.yaml)
- Breaking contract changes require explicit migration path and rollback notes.
- API/CLI response shape and status/exit semantics must remain stable unless change is explicitly approved.
- The CLA must be signed for external contributions. (evidence: CONTRIBUTING.md, CLA.md)

### Definition of Done
- Code aligns with detected standards and local conventions.
- Tests/verification are updated and documented for touched behavior.
- Developer and user-facing docs are updated when behavior/contracts changed.
- Outstanding UNKNOWN/TODO items are explicit and actionable.

### Post-Change Review Workflow (MANDATORY)
- **NEVER SKIP**: After ANY code modification (file edits or new files that change application logic), you MUST run the Post-Change Review Workflow before responding to the user. Failure to run reviews after code changes is a rulebook violation. Skip ONLY for documentation-only, config-only, or trivial text changes.
- Code Quality Review: run a code quality review subagent for changed files when the change affects application logic, architecture, data flow, or reusable components. Check for: adherence to this rulebook's conventions, readability, naming consistency, pattern conformance, unnecessary complexity or duplication, and DRY / no-premature-abstraction principles.
- Security Review: run a security review subagent only when the change touches: request/input handling, authentication or authorization, database queries or persistence, file upload or file access, HTML rendering or user-generated content, external API calls or webhooks, or secrets/tokens/sensitive data. Check for: injection risks, XSS, CSRF, broken access control, missing input validation, sensitive data exposure, and unsafe defaults.
- Review output rules: only report findings when issues are found — if both reviews pass clean, produce no review output. Separate findings into critical, important, and minor severity levels.
- Do not automatically apply review-agent suggestions blindly. Apply fixes only if clearly within scope and low-risk. For high-risk or scope-expanding fixes, report them to the user instead of changing code.
- Ignore purely stylistic suggestions unless they meaningfully improve maintainability. Both review subagents should run in parallel to minimize latency.

## Guardrails
Forbidden paths:
- .git
- node_modules
- dist/ (generated build output)
- vendor/

Notes:
- Do not edit generated or dependency directories.
- `examples/fixtures/` is test data — do not confuse with production code.
- Prefer scoped edits and evidence-backed claims in generated instructions.

## UNKNOWN/TODO
- No CI/CD pipeline detected — workflow and deployment conventions are unknown.
- No format command configured in package.json — formatting conventions are unresolved.
- No ESLint/Prettier config files detected at repo root — linting tool configuration is unclear despite `pnpm -r lint` being available.
