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
- **What**: rulesmith — local-first CLI + MCP server for evidence-backed AI coding instruction generation. (evidence: package.json)
- **Stack**: TypeScript monorepo managed by pnpm with 3 workspace packages. (evidence: pnpm-workspace.yaml, tsconfig.base.json)
- **Packages**:
  - `packages/core` — scanner, evidence bundler, rulebook builder, AST analysis, template renderer, decision tree engine, pack system, safe FS utilities. (evidence: packages/core/src/index.ts)
  - `packages/cli` — Commander-based CLI wrapping core functions. (evidence: packages/cli/src/index.ts)
  - `packages/mcp` — MCP server wrapping core functions via `@modelcontextprotocol/sdk`. (evidence: packages/mcp/src/server.ts)
- **Key directories**:
  - `packs/default/` — Handlebars templates + decision tree YAML + orchestrator prompts. (evidence: packs/default/pack.json)
  - `examples/fixtures/` — Test fixture repositories for various frameworks. **These are test data, NOT production code.** (evidence: examples/fixtures/)
  - `docs/` — Documentation and integration guides. (evidence: docs/)
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
- Strict mode with `noUncheckedIndexedAccess: true`. (evidence: tsconfig.base.json)
- All packages extend `tsconfig.base.json`. (evidence: tsconfig.base.json)
- Use `.js` extensions in import paths (NodeNext resolution requires explicit extensions). (evidence: packages/core/src/index.ts)

### Module and Export Patterns
- Barrel `src/index.ts` re-exports public API per package. (evidence: packages/core/src/index.ts)
- Module-level functions — no class-based service pattern in core logic. (evidence: packages/core/src/scanner/index.ts, packages/core/src/render/index.ts)
- Types via `type` aliases and Zod-inferred types, not classes. (evidence: packages/core/src/profile/schema.ts, packages/core/src/render/workflow.ts)
- Inter-package imports use the package name (`@rulesmith/core`). (evidence: packages/mcp/src/server.ts, packages/cli/src/index.ts)

### Schema and Validation
- Zod for schema definitions and runtime validation at boundaries. (evidence: packages/core/src/profile/schema.ts — `projectProfileSchema`, `weightedEvidenceSchema`)
- MCP server uses Zod schemas for tool parameter validation. (evidence: packages/mcp/src/server.ts)
- Pattern: define Zod schema first, infer TypeScript type with `z.infer<>`. (evidence: packages/core/src/profile/schema.ts)

### AST Analysis Pipeline
- Multi-parser: TypeScript compiler API, `@lezer/*` for Java/PHP/Python/Rust, `bash-parser`, `node-sql-parser`. (evidence: packages/core/src/render/ast.ts)
- Facts collected into typed structures (`TsAstFacts`, `LezerAstFacts`, etc.), converted to `AstConventionCandidate`. (evidence: packages/core/src/render/ast.ts)

### File System Safety
- All file I/O through `packages/core/src/fs/safe.ts`. (evidence: packages/core/src/fs/safe.ts)
- `resolveRepoRelative()` blocks `../` and absolute paths. (evidence: packages/core/src/fs/safe.ts)
- `assertPathInsideRepo()` validates resolved paths stay within repo root. (evidence: packages/core/src/fs/safe.ts)
- Write operations restricted to `WRITE_ALLOWLIST`. (evidence: packages/core/src/fs/safe.ts)
- `fast-glob` for file listing, `.git/**` always ignored. (evidence: packages/core/src/fs/safe.ts — `listFilesSafe`)

### Rendering Pipeline
- Handlebars templates in `packs/default/templates/`. (evidence: packs/default/templates/)
- `buildRulebook()` produces structured rulebook from `ProjectProfile` + policy. (evidence: packages/core/src/render/rulebook.ts)
- `buildAgentWorkflowSpec()` generates agent role definitions and workflow steps. (evidence: packages/core/src/render/workflow.ts)
- In-memory artifact store (Map, 30-min TTL, max 100 entries). (evidence: packages/core/src/render/index.ts)
- Decision tree (YAML) for conditional template inclusion. (evidence: packages/core/src/dtree/index.ts, packs/default/decision-tree.yaml)

### Pack System
- Packs under `packs/`, resolved by walking up from cwd or `RULESMITH_HOME`. (evidence: packages/core/src/packs/index.ts)
- Each pack: `pack.json`, `templates/`, `decision-tree.yaml`, optional `orchestrator/`. (evidence: packages/core/src/packs/index.ts)

### Testing
- Vitest test runner. Tests in `packages/core/test/`. (evidence: packages/core/test/)
- File naming: `<module>.test.ts`. (evidence: packages/core/test/dtree.test.ts, packages/core/test/fs.safe.test.ts)
- Snapshot tests for render output. (evidence: packages/core/test/__snapshots__/)
- Fixtures in `examples/fixtures/` for framework-specific testing. (evidence: examples/fixtures/)

### Error Handling
- Standard `Error` with descriptive messages. No custom error classes. (evidence: packages/core/src/fs/safe.ts)
- `.catch(() => undefined)` for optional existence checks. (evidence: packages/core/src/scanner/scopes.ts)

### Code Style
- Async/await throughout — no callback patterns. (evidence: all source files)
- `Record<string, unknown>` for untyped JSON, never `any`. (evidence: packages/core/src/scanner/index.ts)
- Private helpers are unexported module-scoped functions. (evidence: packages/core/src/render/rulebook.ts)
- Constants: UPPER_SNAKE_CASE. Functions: camelCase. Types: PascalCase. (evidence: all source files)

### Execution Guardrails
- Forbidden paths: `.git`, `node_modules`, `dist/` (generated output), `vendor/`.
- Do not edit files in `examples/fixtures/` unless adding or modifying test fixture data.
- Do not edit generated or dependency directories.

### Implementation Playbook
- Match local naming/layout conventions; do not introduce a second style within one module.
- Keep diffs scoped to smallest boundary.
- New features: add to core → export from barrel → wrap in both CLI and MCP. (evidence: packages/core/src/index.ts, packages/mcp/src/server.ts)
- New templates go in `packs/default/templates/`. (evidence: packs/default/templates/)
- New Zod schemas in `packages/core/src/profile/schema.ts` or near usage.
- Apply DRY only when repetition is real and stable.

### Mandatory System-Conventions (Strict Enforcement)
- Preserve system-found architecture, naming, and dependency patterns.
- Prefer the pattern already in use in the touched boundary.
- New frameworks/linters/formatters forbidden without explicit approval.
- Record UNKNOWN/TODO when confidence is insufficient.
- TypeScript: strict typing, NodeNext modules, `.js` import extensions, Zod schemas. (evidence: tsconfig.base.json)
- File safety: all I/O through `safe.ts`, `WRITE_ALLOWLIST` for writes. (evidence: packages/core/src/fs/safe.ts)

### Documentation Maintenance
- Update docs with behavior/contract changes. (evidence: README.md, CONTRIBUTING.md)
- Require TSDoc/JSDoc for exported APIs.

### Strict Quality Gates (DO / DON'T)
- DO keep claims tied to evidence files.
- DO keep changes scoped and behavior-safe.
- DON'T introduce speculative abstractions.
- DON'T mix functional changes with style-only rewrites.

### Testing Minimum Bar
- Every behavior change needs a test or verification note. (evidence: packages/core/test/)
- Contract changes need backward-compatibility checks.
- New features need fixture-based tests. (evidence: examples/fixtures/)

### Security and Performance Checklist
- File paths through `resolveRepoRelative` + `assertPathInsideRepo`. (evidence: packages/core/src/fs/safe.ts)
- Writes restricted to `WRITE_ALLOWLIST`. (evidence: packages/core/src/fs/safe.ts)
- MCP inputs validated via Zod. (evidence: packages/mcp/src/server.ts)
- Use `includeContent=false` when content not needed. (evidence: packages/core/src/scanner/sampling.ts)
- Cap file listing with `max`. (evidence: packages/core/src/fs/safe.ts)
- Artifact store TTL (30 min) and max size (100). (evidence: packages/core/src/render/index.ts)

### Dependency and Change Safety Policy
- Dependency changes need rationale. (evidence: package.json)
- Breaking changes need migration path and rollback notes.
- CLA required for external contributions. (evidence: CONTRIBUTING.md, CLA.md)

### Definition of Done
- Code aligns with standards and local conventions.
- Tests updated for touched behavior.
- Docs updated when contracts changed.
- UNKNOWN/TODO items explicit and actionable.

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
- dist/
- vendor/

Notes:
- Do not edit generated or dependency directories.
- `examples/fixtures/` is test data — do not confuse with production code.

## UNKNOWN/TODO
- No CI/CD pipeline detected — workflow and deployment conventions are unknown.
- No format command configured in package.json — formatting conventions are unresolved.
- No ESLint/Prettier config files detected at repo root — linting tool configuration is unclear despite `pnpm -r lint` being available.
