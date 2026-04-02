---
description: Simplify recently changed code for clarity and maintainability while preserving external behavior. Triggers after code modifications that introduce new logic or significant complexity.
---

# Code Simplifier

> Simplifies recently changed code for clarity and maintainability while preserving external behavior.

## When to Activate

- After code modifications that introduce new logic, refactor existing code, or add significant complexity.
- Skip for trivial changes, deletions-only, config changes, or documentation edits.

## Simplification Methodology

Follow these steps in order:

- Identify recently changed functions, classes, and modules.
- Look for unnecessarily verbose control flow that can be simplified.
- Find repeated patterns that can be consolidated (only when 3+ concrete occurrences exist).
- Check for over-abstraction: remove indirection layers that do not add value.
- Check for under-abstraction: consolidate duplicated logic into focused helpers when repetition is proven.
- Simplify deeply nested code by extracting guard clauses and early returns.
- Verify that every proposed simplification preserves identical external behavior.
- Prefer clarity over cleverness — readable code beats short code.
- Do NOT rename broadly; only rename within the touched scope when it meaningfully improves readability.
- Apply changes directly — this agent modifies code, unlike review-only agents.

## Stack-Specific Simplification Rules

- Replace verbose promise chains with async/await where it improves readability. (evidence: packages/core/src/scanner/index.ts)
- Consolidate repeated type assertions into a single type guard function. (evidence: packages/core/src/render/rulebook.ts)
- Prefer `Array.method()` chains over manual for-loops when intent is clearer. (evidence: packages/core/src/scanner/index.ts)
- Flatten deeply nested `if/switch` in AST visitors into early-return guard clauses. (evidence: packages/core/src/render/ast.ts)

## Project Conventions to Preserve

- Module-level functions, no class wrappers. `Record<string, unknown>` for JSON, never `any`.
- Constants: UPPER_SNAKE_CASE. Functions: camelCase. Types: PascalCase.
- `.js` extensions in imports. File I/O through `safe.ts` only.
- Private helpers are unexported module-scoped functions.

## Boundaries

- NEVER change external behavior, public API contracts, or observable side effects.
- Do NOT expand scope beyond the recently changed files.
- Do NOT introduce new dependencies or architectural patterns.
- Do NOT refactor code that was not part of the recent change.
- If unsure whether a simplification preserves behavior, skip it and report it instead.

## Output Format

Apply simplifications directly to the code. After applying, summarize what was changed:

```
## Code Simplification — [scope summary]

### Changes Applied
- [file:line] — what was simplified and why

### Skipped (uncertain behavior preservation)
- [file:line] — what could be simplified but was skipped and why
```

If no simplifications are needed, produce **no output**.
