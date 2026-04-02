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

- Enforce strict TypeScript: flag `any` types, missing return types on exported functions.
- Verify `.js` extensions in import paths (NodeNext). (evidence: packages/core/src/index.ts)
- Check Zod schemas at boundaries. (evidence: packages/core/src/profile/schema.ts)
- Verify barrel exports. (evidence: packages/core/src/index.ts)
- Check file I/O through `safe.ts`. (evidence: packages/core/src/fs/safe.ts)
- Module-level functions, no class wrappers. (evidence: packages/core/src/scanner/index.ts)

## Project Conventions to Enforce

### Architecture
- 3-package monorepo: core, cli, mcp. New features: core → barrel → CLI + MCP. (evidence: pnpm-workspace.yaml)
- Templates in `packs/default/templates/`. `examples/fixtures/` is test data. (evidence: packs/default/)

### Code Style
- Constants: UPPER_SNAKE_CASE. Functions: camelCase. Types: PascalCase.
- `Record<string, unknown>` for JSON, never `any`. Private helpers unexported.

### Execution Guardrails
- Forbidden paths: `.git`, `node_modules`, `dist/`, `vendor/`.

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
