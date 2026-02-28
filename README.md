# rulesmith

[![Repo](https://img.shields.io/badge/repo-GitHub-black?logo=github)](https://github.com/CsabaKovacs/rulesmith)
[![Build](https://img.shields.io/badge/build-pnpm__r_build-blue?logo=pnpm)](#requirements)
[![Test](https://img.shields.io/badge/test-pnpm__r_test-1f883d?logo=vitest)](#requirements)
[![License](https://img.shields.io/github/license/CsabaKovacs/rulesmith)](LICENSE)

**Map messy codebases safely. Generate evidence-backed agent instructions. Stay local-first.**

`rulesmith` is an open-source **CLI + MCP server** for teams that want high-quality AI coding behavior on real-world repositories.

Licensed under **Apache-2.0**. Contributions require a signed **CLA** before merge.

It does three things really well:
- collects deterministic repository evidence (without hallucinating)
- guides a repeatable mapping workflow for hosts like Codex / Claude / Junie / Gemini CLI / Antigravity
- generates (or helps you author) strict instruction files for future AI runs

## Choose a mode

- **MCP + host AI mode (recommended):** run `rulesmith` as MCP inside Codex/Claude/Junie/Gemini/Antigravity. The host AI reads evidence and writes project-specific rule files with reasoning.
- **CLI template mode (secondary/fallback):** run `rulesmith` from terminal (`start`/`render`/`apply`). This mode does **not** call any AI model; it renders deterministic output from scanner + templates.
- **Bootstrap mode (new project):** generate rule files from user-provided seed data (languages/frameworks/commands) when there is no codebase to scan yet.

If your goal is stricter, project-specific, high-quality rules, start with MCP + host AI.

## Existing Projects (Scan + Evidence)

Use this flow when the repository already has code and you want evidence-backed rules from real files.

If you are not technical, copy this hard-mode prompt into your AI coding chat. Replace every required placeholder first.

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
- Use absolute paths everywhere.
- Do not stop until scan + generation + apply are complete.
- Use rulesmith MCP tools for repository analysis and rule generation workflow.
- Default generation policy unless explicitly overridden: `strictness="very-strict"` and `standards="project-plus-standard"`.
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

3) Run full analysis on target repo using MCP
- scan_repo
- build_evidence_bundle with:
  focus="generic", maxFiles=1200, includeContent=false
- Expand evidence with list_files/search/read_files for key areas before finalizing rules.

4) Generate and apply rule files with target batching
- Build batches from `<TARGETS_CSV>` using `<TARGET_BATCH_SIZE>` (recommended 1-2 targets per batch).
- For each batch, run:
  - render_rules with batch targets and policy:
    { strictness: "very-strict", standards: "project-plus-standard" }
  - diff_rules for the returned files and show only concise diff summary.
  - if diff is valid and `files` is non-empty, apply_rules with mode="safe".
- If batch render still overloads/truncates:
  - retry with smaller batch size (down to 1 target),
  - continue until every selected target is processed.
- If MCP generation repeatedly truncates, switch render/diff/apply to rulesmith CLI with the same policy and target batches.

5) Validate outputs in target repo for selected targets only
Use this mapping:
- codex -> AGENTS.md
- claude -> CLAUDE.md
- gemini -> GEMINI.md
- copilot -> .github/copilot-instructions.md (and optional .github/instructions/*.instructions.md)
- junie -> .junie/guidelines.md
- antigravity -> .agent/rules/rulesmith.instructions.md

6) Final report (required)
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

Full workflow details, evidence budget, and tool reference:
- [docs/mcp-workflow.md](docs/mcp-workflow.md)

Host-specific setup guides:
- [docs/integrations/README.md](docs/integrations/README.md)

## New Projects (Bootstrap)

Use this flow when the repository is new/empty and you want initial rules from your chosen stack.

Simple MCP prompt (copy/paste):

```text
Use rulesmith MCP to bootstrap a new project (no repository scan).

Target repository:
<ABSOLUTE_PATH_TO_NEW_REPO>

Targets:
<TARGETS_CSV> (allowed: codex,copilot,claude,junie,gemini,antigravity)

What to do:
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
3) Ask me short questions for language(s), framework(s), package manager/tooling, and install/build/test/lint/format/dev commands.
4) Build a seed object from my answers.
5) Run bootstrap_rules with strictness="very-strict" and standards="project-plus-standard" (baseline generation).
6) Run diff_rules for baseline and summarize shortly.
7) If baseline diff is valid, run apply_rules in safe mode.
8) Run bootstrap_specialization_prompt using the same seed/targets/policy.
9) Use the returned prompt to perform AI specialization pass on the just-generated rule files:
   - enrich with language/framework standards and best practices,
   - add strict quality gates (testing/security/performance/DoD),
   - keep DRY/no-premature-abstraction and file cohesion rules.
10) Show diff for the specialization pass, then apply in safe mode if valid.
11) Validate outputs in target repo for selected targets only:
- codex -> AGENTS.md
- claude -> CLAUDE.md
- gemini -> GEMINI.md
- copilot -> .github/copilot-instructions.md (and optional .github/instructions/*.instructions.md)
- junie -> .junie/guidelines.md
- antigravity -> .agent/rules/rulesmith.instructions.md
12) Return a short final report with:
- rulesmith install path
- MCP registration status
- seed summary (languages/frameworks/commands)
- MCP tools executed
- generated files
- written files
- UNKNOWN/TODO items
```

Recommended two-step quality flow for new projects:
1) `bootstrap_rules` (baseline files from declared stack)
2) `bootstrap_specialization_prompt` (AI second-pass prompt)
3) run `diff_rules` and `apply_rules` after AI specialization

When you do not have an existing codebase yet, create initial rules from a seed:

```bash
node packages/cli/dist/index.js bootstrap /absolute/path/to/new-repo \
  --languages typescript \
  --frameworks node \
  --targets codex,claude,gemini \
  --install "pnpm install" \
  --test "pnpm -r test" \
  --lint "pnpm -r lint" \
  --mode safe
```

The command above also writes an AI specialization prompt by default:
- `.rulesmith/bootstrap-specialize-prompt.md`

Paste that prompt into your host AI chat to enrich the baseline rule files with strict language/framework standards and best practices.

## What can be generated

For a target repository:
- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.junie/guidelines.md`
- `.agent/rules/rulesmith.instructions.md`
- `.github/copilot-instructions.md`
- optional `.github/instructions/*.instructions.md`

## Requirements

- Node.js `20+`
- `pnpm` `10+`

## Core principles

- **Local-first**: no cloud requirement to run scanner / mapper / renderer.
- **No embedded LLM calls**: `rulesmith` does not call any model. Your host AI does reasoning.
- **Deterministic evidence**: scanner outputs confidence and concrete file paths.
- **Safe writes**: output is restricted to approved instruction paths.
- **MCP-native**: works as a stdio MCP server with host tools.

## Docs

- [docs/mcp-workflow.md](docs/mcp-workflow.md) - MCP workflow, evidence budget, and tool details
- [docs/cli.md](docs/cli.md) - CLI mode reference
- [docs/security-model.md](docs/security-model.md) - read/write guardrails
- [docs/disclaimer.md](docs/disclaimer.md) - full disclaimer
- [docs/integrations/README.md](docs/integrations/README.md) - host setup guides
- [docs/references.md](docs/references.md) - external references
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [GOVERNANCE.md](GOVERNANCE.md), [TRADEMARKS.md](TRADEMARKS.md), [CLA.md](CLA.md)

## Disclaimer (short)

- `rulesmith` is not a correctness, security, or compliance guarantee.
- You are responsible for reviewing and validating all generated outputs.
- MCP + host AI usage may transmit repository data to third-party services depending on your host configuration.

Full text: [docs/disclaimer.md](docs/disclaimer.md)
