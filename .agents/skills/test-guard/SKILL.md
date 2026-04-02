---
description: Evaluate test coverage for recent code changes, identify missing tests, and flag regression risks. Triggers after any code modification that changes application logic or public interfaces.
---

# Test Guard

> Evaluates test coverage for recent changes, identifies missing tests, and flags regression risks.

## When to Activate

- After ANY code modification that changes application logic, adds features, or modifies public interfaces.
- Skip for documentation-only, style-only, or config-only changes that do not affect runtime behavior.

## Evaluation Methodology

Follow these steps in order:

- Identify all changed files and the nature of each change (new feature, bug fix, refactor, API change).
- For each changed module, check if corresponding test files exist in `packages/core/test/`. (evidence: packages/core/test/)
- Evaluate whether existing tests cover the changed code paths.
- Flag missing test coverage: new public functions without tests, changed branches without assertions.
- Assess regression risk: changes to safe.ts, render pipeline, or scanner are high-risk.
- Test command: `pnpm -r test` (vitest). (evidence: package.json)
- Test naming: `<module>.test.ts` matching source module. (evidence: packages/core/test/dtree.test.ts)
- Snapshot tests for render output — flag if render changes may break snapshots. (evidence: packages/core/test/__snapshots__/)
- Classify findings as: missing (no test exists), incomplete (test exists but doesn't cover change), regression-risk (existing test may break).
- Report ONLY when gaps are found — produce no output if coverage is adequate.

## Stack-Specific Test Rules

- Check for vitest test files matching changed modules. (evidence: packages/core/test/)
- Exported function signature changes require corresponding test updates.
- Render changes should check snapshot impacts. (evidence: packages/core/test/__snapshots__/)
- `safe.ts` changes are high-risk security boundary. (evidence: packages/core/test/fs.safe.test.ts)

## Test Command

```
pnpm -r test
```

## Boundaries

- Do NOT write tests — only identify gaps and recommend what should be tested.
- Do NOT flag missing tests for trivial getters, configuration, or generated code.
- Do NOT require 100% coverage — focus on behavioral contracts and high-risk paths.
- Focus on the changed code, not pre-existing coverage gaps.

## Output Format

When test gaps are found, report using this structure:

```
## Test Guard — [scope summary]

### Missing Tests (no test exists)
- [file:function] — what should be tested and why

### Incomplete Coverage (test exists but gaps found)
- [file:function] — what code path is not covered

### Regression Risk (existing tests may break)
- [file:function] — why this change is high-risk and what to verify
```

If test coverage is adequate, produce **no output**.
