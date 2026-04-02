# Project Conventions (Evidence-Backed)

## Execution Contract
- **BINDING**: This rulebook is mandatory. Every rule, convention, and workflow defined here MUST be followed without exception. Skipping, ignoring, or partially applying rules is a violation. If a rule conflicts with your default behavior, the rulebook takes precedence.
- Use evidence-first behavior: every non-trivial claim or new convention must stay tied to concrete repository evidence.
- Enforce repository conventions first; do not replace a strong local pattern with generic best-practice text.
- Keep changes reviewable and scoped: prefer the smallest behavior-safe diff that fits the touched boundary.
- strictness: `very-strict`
- standards: `project-plus-standard`

## Project Snapshot
- **What**: rulesmith — local-first CLI + MCP server for evidence-backed AI coding instruction generation. (evidence: package.json)
- **Stack**: TypeScript monorepo managed by pnpm with 3 workspace packages. (evidence: pnpm-workspace.yaml, tsconfig.base.json)
- **Packages**:
  - `packages/core` — scanner, evidence bundler, rulebook builder, AST analysis, template renderer, decision tree engine, pack system, safe FS utilities. (evidence: packages/core/src/index.ts)
  - `packages/cli` — Commander-based CLI wrapping core functions. (evidence: packages/cli/src/index.ts)
  - `packages/mcp` — MCP server wrapping core functions via `@modelcontextprotocol/sdk`. (evidence: packages/mcp/src/server.ts)
- **Key directories**:
  - `packs/default/` — Handlebars templates + decision tree YAML + orchestrator prompts. (evidence: packs/default/pack.json)
  - `examples/fixtures/` — Test fixture repos. **Test data, NOT production code.** (evidence: examples/fixtures/)
- Build command coverage: install=yes, build=yes, test=yes, lint=yes. (evidence: package.json)

## Setup Commands (with evidence)
- install: `pnpm install`
- build: `pnpm -r build`
- test: `pnpm -r test`
- lint: `pnpm -r lint`
- format: `UNKNOWN`
- dev: `UNKNOWN`

Evidence: package.json, pnpm-workspace.yaml

## Detailed Conventions

### TypeScript Configuration
- Target: ES2022, module: NodeNext, strict mode, `noUncheckedIndexedAccess: true`. (evidence: tsconfig.base.json)
- Use `.js` extensions in import paths. (evidence: packages/core/src/index.ts)
- All packages extend `tsconfig.base.json`. (evidence: tsconfig.base.json)

### Module and Export Patterns
- Barrel `src/index.ts` re-exports public API per package. (evidence: packages/core/src/index.ts)
- Module-level functions, no class-based pattern. (evidence: packages/core/src/scanner/index.ts)
- Types via `type` aliases and Zod-inferred types. (evidence: packages/core/src/profile/schema.ts)
- Inter-package imports use `@rulesmith/core`. (evidence: packages/mcp/src/server.ts)

### Schema and Validation
- Zod for schemas and runtime validation at boundaries. (evidence: packages/core/src/profile/schema.ts)
- Pattern: Zod schema first, then `z.infer<>` for TypeScript type. (evidence: packages/core/src/profile/schema.ts)

### File System Safety
- All I/O through `packages/core/src/fs/safe.ts`. (evidence: packages/core/src/fs/safe.ts)
- Path traversal prevention, `WRITE_ALLOWLIST` for writes, symlink rejection. (evidence: packages/core/src/fs/safe.ts)

### Rendering Pipeline
- Handlebars templates in `packs/default/templates/`. (evidence: packs/default/templates/)
- `buildRulebook()` + `buildAgentWorkflowSpec()` produce structured output. (evidence: packages/core/src/render/rulebook.ts, packages/core/src/render/workflow.ts)
- Artifact store (Map, 30-min TTL, max 100). (evidence: packages/core/src/render/index.ts)
- Decision tree (YAML) for conditional inclusion. (evidence: packages/core/src/dtree/index.ts)

### Testing
- Vitest. Tests in `packages/core/test/`. Naming: `<module>.test.ts`. (evidence: packages/core/test/)
- Snapshot tests for render output. Fixtures in `examples/fixtures/`. (evidence: packages/core/test/__snapshots__/)

### Code Style
- Async/await. `Record<string, unknown>` for JSON. No `any`. (evidence: packages/core/src/scanner/index.ts)
- Constants: UPPER_SNAKE_CASE. Functions: camelCase. Types: PascalCase. (evidence: all source files)
- Private helpers unexported, public API through barrel. (evidence: packages/core/src/render/rulebook.ts)

### Execution Guardrails
- Forbidden paths: `.git`, `node_modules`, `dist/`, `vendor/`. (evidence: .gitignore)
- `examples/fixtures/` is test data only.

### Implementation Playbook
- New features: core → barrel → CLI + MCP. (evidence: packages/core/src/index.ts)
- New templates: `packs/default/templates/`. New schemas near usage.
- Match local conventions. Apply DRY only when repetition is real.

### Mandatory System-Conventions (Strict Enforcement)
- Preserve architecture, naming, dependency patterns. Prefer existing patterns in touched boundary.
- New frameworks/linters forbidden without approval. UNKNOWN/TODO when uncertain.
- TypeScript: strict typing, NodeNext, `.js` imports, Zod schemas. (evidence: tsconfig.base.json)
- File safety: all I/O through `safe.ts`. (evidence: packages/core/src/fs/safe.ts)

### Documentation Maintenance
- Update docs with behavior/contract changes. (evidence: README.md, CONTRIBUTING.md)
- TSDoc/JSDoc for exported APIs.

### Strict Quality Gates (DO / DON'T)
- DO keep claims tied to evidence. DO keep changes scoped.
- DON'T introduce speculative abstractions. DON'T mix functional + style changes.

### Testing Minimum Bar
- Behavior changes need tests. Contract changes need compat checks. (evidence: packages/core/test/)

### Security and Performance Checklist
- Paths through `resolveRepoRelative` + `assertPathInsideRepo`. (evidence: packages/core/src/fs/safe.ts)
- Writes in `WRITE_ALLOWLIST`. MCP inputs via Zod. (evidence: packages/mcp/src/server.ts)
- `includeContent=false` when not needed. Cap listings with `max`. (evidence: packages/core/src/scanner/sampling.ts)

### Dependency and Change Safety Policy
- Dependency changes need rationale. Breaking changes need migration. (evidence: package.json)
- CLA required for contributions. (evidence: CONTRIBUTING.md, CLA.md)

### Definition of Done
- Standards and conventions aligned. Tests updated. Docs updated. UNKNOWN/TODO explicit.

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
- `examples/fixtures/` is test data — not production code.

## UNKNOWN/TODO
- No CI/CD pipeline detected.
- No format command configured.
- No ESLint/Prettier config files at repo root.
