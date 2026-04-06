# rulesmith

[![Repo](https://img.shields.io/badge/repo-GitHub-black?logo=github)](https://github.com/CsabaKovacs/rulesmith)
[![Build](https://img.shields.io/badge/build-pnpm__r_build-blue?logo=pnpm)](#requirements)
[![Test](https://img.shields.io/badge/test-pnpm__r_test-1f883d?logo=vitest)](#requirements)
[![License](https://img.shields.io/github/license/CsabaKovacs/rulesmith)](LICENSE)

## Why rulesmith?

AI coding assistants are powerful — until you point them at a real
production codebase. Then they hallucinate folder structures, ignore
your conventions, and generate code that looks right but doesn't
belong in your project.

rulesmith exists because I got tired of babysitting AI on serious
codebases.

It works in two phases: first, it scans your repository and collects
deterministic evidence — architecture, naming patterns, dependencies,
error handling — without calling any AI model. Then it hands that
evidence to your own AI assistant (Codex, Claude, Junie, Gemini,
Copilot, Antigravity), which reads your actual source files,
interprets the patterns, and produces strict, project-specific
instruction files that it and other AI agents will follow on
future runs.

No cloud dependency on rulesmith's side. No third-party AI calls
you don't control. Your AI, your subscription, your data.

The result: AI that behaves like a developer who actually read
the codebase — because it did.

If you're working on anything beyond a todo app, this is the
missing layer between "AI can write code" and "AI can write code
that fits our project."

---

**Map messy codebases safely. Generate evidence-backed agent instructions. Stay local-first.**

`rulesmith` is an open-source **CLI + MCP server** for teams that want high-quality AI coding behavior on real-world repositories.

Licensed under **Apache-2.0**. Contributions require a signed **CLA** before merge.

It does three things really well:
- collects deterministic repository evidence (without hallucinating)
- guides a repeatable mapping workflow for hosts like Codex / Claude / Junie / Gemini CLI / Antigravity
- generates (or helps you author) strict instruction files for future AI runs

## Hybrid generation model

`rulesmith` now aims to generate **hybrid rulebooks** by default when you use:
- `strictness="very-strict"`
- `standards="project-plus-standard"`

Hybrid means:
- repository-specific conventions come first
- compatible language/framework standards are layered on top only when they do not contradict the repository's observed patterns
- high-signal repository-specific rules should be retained instead of collapsed into generic guidance when evidence is strong
- unresolved conflicts or weak signals should remain `UNKNOWN/TODO`, not be guessed

For the default renderer, first-wave stack-aware hybrid specialization now exists for:
- React
- Next.js
- Node/Express
- NestJS
- FastAPI
- Django
- Spring Boot
- ASP.NET Core
- Laravel
- Flutter
- Android
- iOS

This does **not** eliminate the value of a second AI enrichment pass. It means the baseline is now more repo-aware and less template-generic before that enrichment happens.

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
- Use absolute paths, except in generated instruction/routing files where paths must be repository-relative (never machine-specific absolute paths).
- Do not stop until scan + generation + apply are complete.
- Use rulesmith MCP tools for repository analysis and rule generation workflow.
- Default generation policy unless explicitly overridden: `strictness="very-strict"` and `standards="project-plus-standard"`.
- Expect the baseline render to be hybrid: repo-first, then compatible standards overlay, then `UNKNOWN/TODO` only for real uncertainty.
- Expect the baseline to retain high-signal repository-specific rules when evidence is strong, especially:
  - flow/reset/redirect patterns
  - typed exception-handling order
  - security ownership boundaries
  - docs or contract sync expectations
  - unusual local risks or legacy oddities
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

1) Install or update rulesmith
- If rulesmith is not installed yet, clone the repo to a local absolute path:
  git clone https://github.com/CsabaKovacs/rulesmith.git
- If rulesmith is already installed locally:
  - Check the GitHub repo for a newer version: run `git -C "$RULESMITH_HOME" fetch origin` then compare local HEAD with origin/main.
  - If a newer version is available: `git -C "$RULESMITH_HOME" pull origin main`
  - If no update is needed, skip to step 2.
- Run (first install, or after update):
  - pnpm install
  - pnpm -r build
  - pnpm -r test

2) Register MCP server in this environment
- Set RULESMITH_HOME to the cloned rulesmith path.
- Register rulesmith MCP server using:
  node "$RULESMITH_HOME/packages/mcp/dist/server.js"
- If rulesmith was updated in step 1, restart the MCP server to use the new version.
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

5) Generate baseline rule files
- Build batches from `<TARGETS_CSV>` using `<TARGET_BATCH_SIZE>` (recommended 1-2 targets per batch).
- For each batch, run render_and_apply with batch targets and policy:
  { strictness: "very-strict", standards: "project-plus-standard" }
  mode: "force"
- This creates template-based baseline rule files with evidence from the scanner.
- The baseline should already reflect hybrid generation behavior:
  - repository-specific architectural and organizational patterns first
  - compatible language/framework standards second
  - preserve high-signal repository-specific rules instead of flattening them into generic advice
  - keep concrete flow, error-handling, security-boundary, and contract-sync conventions when repository evidence is strong
  - avoid generic standards text that contradicts strong repository evidence
- If render_and_apply is not available, fall back to: render_rules → apply_rendered_rules (using artifactId).
- If neither artifact tool is available, fall back to: render_rules(includeContent=true) → apply_rules.

6) AI enrichment pass (MANDATORY — this is where the real value is)
- For EACH scope and EACH generated rule file:
  a) Read the baseline rule file that was just written (e.g., admin/CLAUDE.md).
  b) Read 5-10 key project files to understand actual patterns:
     - 2-3 representative controllers (look for validation, error handling, transaction patterns)
     - 1-2 route files (look for middleware, permission guards, naming conventions)
     - 1-2 model files (look for relationships, scopes, casts)
     - config files relevant to the scope (auth, api, services)
     - package.json / composer.json for dependency context
  c) Based on what you found, REWRITE the rule file to include:
     - Project-specific architectural patterns you observed (not generic template text)
     - Concrete file references as evidence for each convention
     - Specific naming patterns, error handling styles, and code organization rules
     - Any anti-patterns or legacy code that should be explicitly flagged
     - Middleware and permission patterns unique to this scope
  d) PRESERVE these sections exactly as they are in the baseline (do not modify or remove):
     - "Post-Change Review Workflow (MANDATORY)" section — keep every bullet point
     - "Execution Contract" with the BINDING clause
     - "Guardrails" with forbidden paths
     - "UNKNOWN/TODO" section
  e) Write the enriched file using the Edit tool (not apply_rules — you are the author now).
  f) Keep the enriched file under ~15KB to avoid context window issues for future AI sessions.

7) Validate outputs in target repo for selected targets only
Use this mapping:
- codex -> AGENTS.md + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- claude -> CLAUDE.md + .claude/agents/{code-reviewer,security-reviewer,code-simplifier,test-guard}.md
- gemini -> GEMINI.md + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- copilot -> .github/copilot-instructions.md (and optional .github/instructions/*.instructions.md) + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- junie -> .junie/guidelines.md + .junie/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- antigravity -> .agent/rules/rulesmith.instructions.md

8) Final report (required)
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
# If rulesmith is already installed locally, check for updates first:
# git -C /path/to/rulesmith fetch origin && git -C /path/to/rulesmith pull origin main
# If not installed yet, clone it:
git clone https://github.com/CsabaKovacs/rulesmith.git rulesmith
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

Repository to install:
https://github.com/CsabaKovacs/rulesmith

Target repository:
<ABSOLUTE_PATH_TO_NEW_REPO>

Targets:
<TARGETS_CSV> (allowed: codex,copilot,claude,junie,gemini,antigravity)

What to do:
1) Install or update rulesmith
- If rulesmith is not installed yet, clone the repo to a local absolute path:
  git clone https://github.com/CsabaKovacs/rulesmith.git
- If rulesmith is already installed locally:
  - Check the GitHub repo for a newer version: run `git -C "$RULESMITH_HOME" fetch origin` then compare local HEAD with origin/main.
  - If a newer version is available: `git -C "$RULESMITH_HOME" pull origin main`
  - If no update is needed, skip to step 2.
- Run (first install, or after update):
  - pnpm install
  - pnpm -r build
  - pnpm -r test
2) Register MCP server in this environment
- Set RULESMITH_HOME to the cloned rulesmith path.
- Register rulesmith MCP server using:
  node "$RULESMITH_HOME/packages/mcp/dist/server.js"
- If rulesmith was updated in step 1, restart the MCP server to use the new version.
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
- codex -> AGENTS.md + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- claude -> CLAUDE.md + .claude/agents/{code-reviewer,security-reviewer,code-simplifier,test-guard}.md
- gemini -> GEMINI.md + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- copilot -> .github/copilot-instructions.md (and optional .github/instructions/*.instructions.md) + .agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
- junie -> .junie/guidelines.md + .junie/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md
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

Paste that prompt into your host AI chat to enrich the baseline rule files with strict language/framework standards and best practices, while preserving the repo-first hybrid behavior.
The specialization pass should also preserve high-signal repository specifics such as flow-reset behavior, typed error handling order, security ownership boundaries, docs/contract sync requirements, and notable local risks when the repository evidence supports them.

## Post-Change Review Workflow

Generated rule files include a **Post-Change Review Workflow** section that instructs the host AI to run automated reviews and refinement after completing code changes. This provides built-in quality, security, simplification, and test coverage checks for every generated rulebook.

The workflow triggers four specialized agents after code modifications:
- **Code Quality Review** — checks adherence to rule file conventions, readability, complexity, and duplication
- **Security Review** — checks for OWASP Top 10 vulnerabilities, input validation, auth issues, and sensitive data exposure (only when security-sensitive areas are touched)
- **Code Simplifier** — behavior-preserving cleanup of recently changed code: reduces verbosity, consolidates patterns, improves clarity
- **Test Guard** — evaluates test coverage for changed code, identifies missing tests, and flags regression risks

The workflow order is optimized: lint → review → security → fix critical → simplify → test → test-guard → report. Reviews evaluate the developer's original code, the simplifier cleans it, and tests validate the final state.

### Capability-adaptive generation

The review agents are generated in the best available format for each platform:

| Platform | Format | How it works |
|----------|--------|-------------|
| **Claude Code** | `.claude/agents/*.md` (native subagents) | Dedicated context, parallel execution via `context: fork` |
| **Codex / Gemini / Copilot** | `.agents/skills/*/SKILL.md` (Agent Skills standard) | Auto-triggered by task description matching |
| **Junie** | `.junie/skills/*/SKILL.md` | Junie-specific skill path |
| **All platforms** | Inline "Post-Change Review Workflow" section in rulebook | Fallback for platforms without skill support |

All formats are generated from the same internal `AgentWorkflowSpec` — stack-specific rules (language + framework conventions) are injected based on the detected profile.

Key design principles:
- **Trigger-based**: agents only run when actual code changes are made, not on trivial edits
- **Scoped**: security review only activates for security-relevant changes; simplifier only when complexity is introduced
- **Behavior-safe**: the code simplifier NEVER changes external behavior, public APIs, or observable side effects
- **Non-destructive**: review agents and test guard report findings but do not automatically apply fixes
- **Quiet**: findings are only reported when issues are found (no noise on clean code)
- **Stack-aware**: all agent rules are tailored to the detected languages and frameworks

## What can be generated

For a target repository:
- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.junie/guidelines.md`
- `.agent/rules/rulesmith.instructions.md`
- `.github/copilot-instructions.md`
- optional `.github/instructions/*.instructions.md`

Agent workflow files (generated automatically alongside the targets above):
- `.claude/agents/{code-reviewer,security-reviewer,code-simplifier,test-guard}.md` — native Claude Code subagents (when claude target is selected)
- `.agents/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md` — cross-platform Agent Skills (when codex, gemini, or copilot target is selected)
- `.junie/skills/{code-reviewer,security-reviewer,code-simplifier,test-guard}/SKILL.md` — Junie-specific skills (when junie target is selected)

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
