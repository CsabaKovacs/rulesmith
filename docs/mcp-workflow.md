# MCP Workflow

This doc covers the recommended MCP flow, evidence budget, and tool reference.

## Hybrid baseline behavior

With `strictness="very-strict"` and `standards="project-plus-standard"`, the recommended expectation is:
- baseline generation is already hybrid and repo-first
- repository-specific conventions should override generic standards text
- language/framework standards should be added only when compatible with observed repository patterns
- high-signal repository-specific rules should be retained when evidence is strong, not flattened into generic advice
- `UNKNOWN/TODO` should remain only for real uncertainty

The second AI enrichment pass is still recommended for higher-fidelity, project-specific outputs, but it should refine an already-useful baseline rather than replace a generic one.

## MCP server

Build first, then run the server:

```bash
node packages/mcp/dist/server.js
```

This is a **stdio MCP server**. Logs go to `stderr` only.

### Exposed MCP tools

- `scan_repo`
- `detect_scopes`
- `list_files`
- `search`
- `read_files`
- `sample_repo`
- `build_evidence_bundle`
- `render_rules`
- `bootstrap_rules`
- `bootstrap_specialization_prompt`
- `diff_rules`
- `apply_rules`
- `list_packs`
- `get_pack`

Prompt/resource exposure (SDK support dependent):
- `laravel_map`
- `rubric`

## Recommended workflow (host AI)

Run the following sequence in your host AI chat:

1) `detect_scopes` (before deep analysis)
2) if 2+ scopes are detected, ask user once for mode:
   - `scope` (preferred/default): run per scope and generate root routing `AGENTS.md`
   - `mono`: run once at repo root
3) `scan_repo`
4) `build_evidence_bundle` with `focus="generic"`, `maxFiles=1200`, `includeContent=false`
5) expand evidence with `list_files` / `search` / `read_files`
6) generate in small target batches (`strictness=very-strict` by default)
7) `render_rules` -> `diff_rules` -> `apply_rules` (only when valid)

Baseline expectation in step 6:
- repo-specific conventions first
- compatible standards second
- retain high-signal repo-specific rules such as flow/reset/redirect behavior, typed exception order, security ownership, docs/contract sync, and local oddities when evidence is strong
- avoid baseline outputs that merely restate generic language advice when stronger repository evidence exists

For greenfield repositories (no meaningful code yet), use:
- `bootstrap_rules` with a seed object (`languages`, `frameworks`, optional commands/guardrails)
- `bootstrap_specialization_prompt` to generate the second-pass AI prompt that enriches baseline files with strict standards/best practices
- then `diff_rules` -> `apply_rules`

Greenfield copy/paste prompt:

```text
Use rulesmith MCP to bootstrap a NEW project (no repository scan).

Target repository:
<ABSOLUTE_PATH_TO_NEW_REPO>

Targets:
<TARGETS_CSV> (allowed: codex,copilot,claude,junie,gemini,antigravity)

1) Ask short questions for language(s), framework(s), and core commands (install/build/test/lint/format/dev).
1) Install rulesmith (only if not already installed):
- reuse existing local install when available
- otherwise clone and run: pnpm install, pnpm -r build, pnpm -r test
2) Register MCP server in this environment:
- set RULESMITH_HOME to the rulesmith path
- register server using: node "$RULESMITH_HOME/packages/mcp/dist/server.js"
- verify MCP registration is active
3) Ask short questions for language(s), framework(s), and core commands (install/build/test/lint/format/dev).
4) Build a seed object from the answers.
5) Run bootstrap_rules with strictness="very-strict" and standards="project-plus-standard".
6) Run diff_rules; if valid run apply_rules in safe mode.
7) Run bootstrap_specialization_prompt with the same seed/targets/policy.
8) Use the returned prompt to AI-specialize the generated rule files (standards, best practices, strict quality gates).
9) Show specialization diff; if valid run apply_rules in safe mode.
10) Validate outputs in target repo for selected targets only:
- codex -> AGENTS.md + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- claude -> CLAUDE.md + .claude/agents/{code-reviewer,security-reviewer,code-simplifier,test-guard}.md
- gemini -> GEMINI.md + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- copilot -> .github/copilot-instructions.md (and optional .github/instructions/*.instructions.md) + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- junie -> .junie/guidelines.md + .junie/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- antigravity -> .agent/rules/rulesmith.instructions.md
11) Return a short final report with:
- rulesmith install path
- MCP registration status
- seed summary (languages/frameworks/commands)
- MCP tools executed
- generated files
- written files
- UNKNOWN/TODO items
```

## Example prompt (copy/paste)

```text
Execute this task end-to-end, not as advice.

Repository to install:
https://github.com/CsabaKovacs/rulesmith

Target repository:
<ABSOLUTE_PATH_TO_TARGET_REPO>

Selected instruction targets (comma-separated, choose from: codex,copilot,claude,junie,gemini,antigravity):
<TARGETS_CSV>

Maximum targets per batch (recommended 1-2, default 2):
<TARGET_BATCH_SIZE>

Strict execution requirements:
- Actually run commands and MCP tools. Do not only describe steps.
- If a command fails, fix it and continue.
- Use absolute paths, except in generated instruction/routing files where paths must be repository-relative (never machine-specific absolute paths).
- Do not stop until scan + generation + apply are complete.
- Use rulesmith MCP tools for repository analysis and rule generation workflow.
- Default generation policy unless explicitly overridden: `strictness="very-strict"` and `standards="project-plus-standard"`.
- Treat that default as hybrid generation: repo-first with standards overlay only where compatible.
- Expect the baseline to retain high-signal repository-specific rules when evidence is strong, especially flow/reset/redirect patterns, typed exception handling order, security ownership boundaries, docs or contract sync expectations, and notable local oddities.
- Do not call `apply_rules` with an empty `files` array.
- If `render_rules` response is too large/truncated, reduce batch size and retry (down to 1 target if needed).
- Do not print full generated file contents to chat; show concise diff summaries and written paths only.
- Keep token usage controlled: prefer `includeContent=false`, scoped evidence reads, and batched target generation.
- If any required input is missing/invalid, ask follow-up questions first and STOP. Do not run commands until inputs are complete.

What to do:

0) Validate required inputs before running anything
- Confirm `<ABSOLUTE_PATH_TO_TARGET_REPO>` is an absolute path and exists.
- Confirm `<TARGETS_CSV>` is non-empty and only contains valid values from:
  codex,copilot,claude,junie,gemini,antigravity
- If `<TARGET_BATCH_SIZE>` is missing, use 2. Do not exceed 2 unless explicitly requested.
- If any validation fails, ask exactly what is missing, wait for user answer, then continue from step 1.

1) Install rulesmith (only if not already installed)
- If rulesmith is already installed locally, reuse the existing absolute path and skip reinstall unless you intentionally update dependencies.
- If rulesmith is not installed yet, clone the repo to a local absolute path.
- Run (first install, or when dependencies/tooling changed):
  - pnpm install
  - pnpm -r build
  - pnpm -r test

2) Register MCP server in this environment
- Set RULESMITH_HOME to the cloned rulesmith path.
- Register rulesmith MCP server using:
  node "$RULESMITH_HOME/packages/mcp/dist/server.js"
- Verify MCP registration is active before continuing.

3) Detect layout mode before deep analysis
- run detect_scopes
- if 2+ scopes are detected, ask once whether to use mono or scope mode
- prefer scope mode by default
- in scope mode, run analysis+generation per scope and generate assistant-aware root routing files:
  - codex -> root `AGENTS.md` routing to scoped `*/AGENTS.md`
  - copilot -> root `.github/instructions/*.instructions.md` path-based routing (plus scoped copilot files)
  - claude -> root `CLAUDE.md` routing/imports to scoped `*/CLAUDE.md` (or equivalent scoped rules)
  - gemini -> root `GEMINI.md` routing to scoped `*/GEMINI.md`
  - junie -> root `.junie/guidelines.md` that routes to scope-specific conventions
  - antigravity -> root `.agent/rules/rulesmith.instructions.md` routing to scoped rules
- generated routing/instruction files must use repository-relative paths only (no machine-specific absolute paths)

4) Run full analysis on target repo using MCP
- scan_repo
- build_evidence_bundle with:
  focus="generic", maxFiles=1200, includeContent=false
- Expand evidence with list_files/search/read_files for key areas before finalizing rules.

5) Generate and apply rule files with target batching
- Build batches from `<TARGETS_CSV>` using `<TARGET_BATCH_SIZE>` (recommended 1-2 targets per batch).
- For each batch, run:
  - render_rules with batch targets and policy:
    { strictness: "very-strict", standards: "project-plus-standard" }
  - diff_rules for the returned files and show only concise diff summary.
  - if diff is valid and `files` is non-empty, apply_rules with mode="safe".
- Expect the rendered baseline to be hybrid:
  - preserve repository-specific architecture, naming, and file-boundary patterns first
  - add compatible language/framework standards second
  - retain high-signal repository-specific rules instead of flattening them into generic guidance
  - preserve concrete flow, error-handling, security-boundary, and docs/contract-sync conventions when repository evidence is strong
  - leave unresolved conflicts as `UNKNOWN/TODO`
- If batch render still overloads/truncates:
  - retry with smaller batch size (down to 1 target),
  - continue until every selected target is processed.
- If MCP generation repeatedly truncates, switch render/diff/apply to rulesmith CLI with the same policy and target batches.

6) Validate outputs in target repo for selected targets only
Use this mapping:
- codex -> AGENTS.md + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- claude -> CLAUDE.md + .claude/agents/{code-reviewer,security-reviewer,code-simplifier,test-guard}.md
- gemini -> GEMINI.md + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- copilot -> .github/copilot-instructions.md (and optional .github/instructions/*.instructions.md) + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- junie -> .junie/guidelines.md + .junie/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- antigravity -> .agent/rules/rulesmith.instructions.md

7) Final report (required)
Return a concise report with:
- Installed path of rulesmith
- MCP registration status
- Commands executed
- MCP tools executed
- Batch plan used (targets and batch size)
- Files generated/written
- Any warnings or skipped steps
```

If you prefer manual terminal commands, use this block:

```bash
# If rulesmith is already installed locally, reuse that absolute path and skip clone/install.
git clone git@github.com:CsabaKovacs/rulesmith.git rulesmith
cd rulesmith
pnpm install && pnpm -r build

# Register rulesmith MCP in Codex
codex mcp add rulesmith --env RULESMITH_HOME="$PWD" -- node "$PWD/packages/mcp/dist/server.js"

# Open your target project with Codex
codex -C /absolute/path/to/target-repo
```

## Recommended Evidence Budget (speed vs quality)

Use this to avoid long runs and token burn:
- Fast pass: `maxFiles=400-600` (good for first draft / small repos)
- Balanced pass (recommended): `maxFiles=800-1200` (best default for most repos)
- Deep pass: `maxFiles=1500-2000` (only if conventions are unclear after balanced pass)

Escalation rule:
- Start with balanced.
- Increase only if key sections remain `UNKNOWN/TODO` after evidence expansion.
- Do not jump to deep pass by default.

## Output mapping

Validate outputs in the target repo for selected targets only:
- codex -> AGENTS.md + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- claude -> CLAUDE.md + .claude/agents/{code-reviewer,security-reviewer,code-simplifier,test-guard}.md
- gemini -> GEMINI.md + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- copilot -> .github/copilot-instructions.md (and optional .github/instructions/*.instructions.md) + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- junie -> .junie/guidelines.md + .junie/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- antigravity -> .agent/rules/rulesmith.instructions.md

## MCP bundle cleanup behavior

`build_evidence_bundle` supports:
- `includeContent?: boolean` (default `false`)
- `cleanup?: boolean` (default `true`)

With default MCP behavior, after `build_evidence_bundle`, the target repo's:
- `.rulesmith/bundle.json`
- `.rulesmith/`

are automatically removed.

If you want to keep artifacts:

```json
{
  "repoPath": "/absolute/path/to/repo",
  "focus": "generic",
  "maxFiles": 2000,
  "includeContent": false,
  "cleanup": false
}
```

## Compose prompt defaults

In generated compose prompts, `rulesmith`:
- includes language standards and best practices (for example PSR-12 for PHP) when the repository is not a mixed/salad legacy codebase
- prefers repository-specific conventions over generic standards when both are available and compatible
- instructs incremental stabilization with project-local conventions first for mixed/salad repositories
- enforces DRY/no-premature-abstraction, file cohesion (avoid mega files), language-specific API documentation standards (PHPDoc/JSDoc/docstrings/etc.)
- adds a dedicated documentation-maintenance section for developer + user docs
- adds enforceable DO/DON'T gates, testing/security/performance checklists, dependency & breaking-change policies, API/CLI contract safety rules, and a Definition of Done section
