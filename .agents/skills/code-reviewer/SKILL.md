---
description: Run a code quality review on changed files after code modifications. Triggers when application logic, architecture, data flow, or reusable components are affected.
---

# Code Quality Review

> Reviews changed files for code quality, convention adherence, and maintainability.

## When to Activate

- After ANY code modification that affects application logic, architecture, data flow, or reusable components.
- Skip ONLY for documentation-only, config-only, or trivial text changes.

## Review Methodology

Follow these steps in order:

- Identify all changed files and understand the scope of the modification.
- Check adherence to project conventions defined in the rulebook.
- Evaluate naming consistency, readability, and pattern conformance.
- Flag unnecessary complexity, duplication, or DRY violations.
- Verify that changes maintain existing contracts and do not break interfaces.
- Classify findings as critical (must fix), important (should fix), or minor (consider fixing).
- Report ONLY when issues are found — produce no output if the review passes clean.

## Stack-Specific Rules

- Enforce strict TypeScript: flag `any` types, missing return types on exported functions, and implicit type coercion.
- Verify `.js` extensions in import paths (NodeNext module resolution). (evidence: packages/core/src/index.ts)
- Check that Zod schemas are used for validation at boundaries. (evidence: packages/core/src/profile/schema.ts)
- Verify new exports are added to barrel `src/index.ts`. (evidence: packages/core/src/index.ts)
- Check that file I/O goes through `safe.ts` helpers. (evidence: packages/core/src/fs/safe.ts)
- Verify module-level function pattern — no unnecessary class wrappers. (evidence: packages/core/src/scanner/index.ts)

## Project Conventions to Enforce

### Build, Test, and Tooling
- Install: `pnpm install`. Build: `pnpm -r build`. Test: `pnpm -r test`. Lint: `pnpm -r lint`. (evidence: package.json)

### Architecture
- 3-package monorepo: core, cli, mcp. New features: core → barrel → CLI + MCP. (evidence: pnpm-workspace.yaml)
- Templates in `packs/default/templates/`. `examples/fixtures/` is test data only. (evidence: packs/default/)

### Execution Guardrails
- Forbidden paths: `.git`, `node_modules`, `dist/`, `vendor/`. (evidence: .gitignore)

### Implementation Playbook
- Constants: UPPER_SNAKE_CASE. Functions: camelCase. Types: PascalCase.
- Private helpers are unexported module-scoped functions.
- `Record<string, unknown>` for untyped JSON, never `any`.

## Boundaries

- Do NOT automatically apply fixes — report findings for the orchestrator to handle.
- Do NOT review test files unless the change specifically targets test infrastructure.
- Ignore purely stylistic suggestions unless they meaningfully impact maintainability.

## Output Format

When issues are found, report using this structure:

```
## Code Quality Review — [scope summary]

### Critical (must fix)
- [file:line] — description

### Important (should fix)
- [file:line] — description

### Minor (consider)
- [file:line] — description
```

If no issues are found, produce **no output**.
