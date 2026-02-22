# rulesmith

[![Repo](https://img.shields.io/badge/repo-GitHub-black?logo=github)](https://github.com/CsabaKovacs/rulesmith)
[![Build](https://img.shields.io/badge/build-pnpm__r_build-blue?logo=pnpm)](#installation)
[![Test](https://img.shields.io/badge/test-pnpm__r_test-1f883d?logo=vitest)](#installation)
[![License](https://img.shields.io/github/license/CsabaKovacs/rulesmith)](LICENSE)

**Map messy codebases safely. Generate evidence-backed agent instructions. Stay local-first.**

`rulesmith` is an open-source **CLI + MCP server** for teams that want high-quality AI coding behavior on real-world repositories.

Licensed under **Apache-2.0**. Contributions require a signed **CLA** before merge.

It does three things really well:
- collects deterministic repository evidence (without hallucinating)
- guides a repeatable mapping workflow for hosts like Codex / Claude / Junie
- generates (or helps you author) strict instruction files for future AI runs

## Read this first: choose mode

- **MCP + host AI mode (recommended):** run `rulesmith` as MCP inside Codex/Claude/Junie. The host AI reads evidence and writes project-specific rule files with reasoning.
- **CLI template mode (secondary/fallback):** run `rulesmith` from terminal (`start`/`render`/`apply`). This mode does **not** call any AI model; it renders deterministic output from scanner + templates.

If your goal is stricter, project-specific, high-quality rules, start with MCP + host AI.

## 1-Minute Quickstart (MCP-first, recommended)

![rulesmith quickstart GIF](https://dummyimage.com/1200x630/0f172a/e2e8f0.gif&text=rulesmith+1-minute+quickstart)

```bash
git clone git@github.com:CsabaKovacs/rulesmith.git rulesmith
cd rulesmith
pnpm install && pnpm -r build

# Register rulesmith MCP in Codex
codex mcp add rulesmith --env RULESMITH_HOME="$PWD" -- node "$PWD/packages/mcp/dist/server.js"

# Open your target project with Codex
codex -C /absolute/path/to/target-repo
```

If you want this block to show a real terminal demo, replace the image with your recorded GIF file (recommended path: `docs/assets/rulesmith-quickstart.gif`).

Then ask Codex/Claude/Junie to run this sequence:
- `scan_repo`
- `build_evidence_bundle` (usually `includeContent=false`)
- expand with `list_files` / `search` / `read_files`
- generate and review diffs
- apply when valid

## Why this is useful

Most AI workflows fail in larger codebases for one reason: weak context.

`rulesmith` gives your host AI a structured, reproducible context layer:
- stack/framework signals with confidence + file evidence
- safe file sampling and targeted retrieval
- security guardrails for writes
- diff-first, apply-second workflow

Result: better instructions, fewer regressions, less prompt babysitting.

## Core principles

- **Local-first**: no cloud requirement to run scanner / mapper / renderer.
- **No embedded LLM calls**: `rulesmith` does not call any model. Your host AI does reasoning.
- **Deterministic evidence**: scanner outputs confidence and concrete file paths.
- **Safe writes**: output is restricted to approved instruction paths.
- **MCP-native**: works as a stdio MCP server with host tools.

## Disclaimer

- `rulesmith` is a repository evidence and workflow assistant for AI-assisted development. It is **not** a correctness, security, or compliance guarantee.
- `rulesmith` works from repository signals (files, configs, scripts, and structure), which may be incomplete, outdated, inconsistent, or misleading.
- As a result, generated instruction files, prompts, or workflow artifacts may not fully match your real project conventions.
- Host AI systems (for example Codex, Claude, Copilot, or Junie) may produce incorrect, incomplete, insecure, or unsafe outputs even when using `rulesmith`.
- You are solely responsible for reviewing, testing, and validating all generated rules, prompts, diffs, and code before applying them in development, staging, or production environments.
- You should adapt generated outputs to your project’s actual architecture, constraints, coding standards, and risk tolerance.
- Do not rely on generated outputs for security-critical, safety-critical, legal, financial, or compliance-sensitive decisions without qualified human review.
- To the maximum extent permitted by applicable law, the project maintainers and contributors disclaim liability for any direct, indirect, incidental, special, exemplary, or consequential damages arising from the use of `rulesmith`, host AI systems, or generated outputs.

## Project policies

- Contributing process: `CONTRIBUTING.md`
- Contributor license agreement template: `CLA.md`
- Security policy: `SECURITY.md`
- Project governance: `GOVERNANCE.md`
- Trademark policy: `TRADEMARKS.md`

## What can be generated

For a target repository:
- `AGENTS.md`
- `CLAUDE.md`
- `.junie/guidelines.md`
- `.github/copilot-instructions.md`
- optional `.github/instructions/*.instructions.md`

## Monorepo layout

- `packages/core` - schemas, scanner, safe FS, packs, decision-tree, renderer
- `packages/cli` - `rulesmith` commands
- `packages/mcp` - MCP server (stdio)
- `packs/default` - templates, orchestration prompts, decision-tree
- `examples/fixtures` - minimal repos for tests

## Requirements

- Node.js `20+`
- `pnpm` `10+`

Optional host clients:
- Codex CLI / Codex IDE extension
- Claude Code / Claude Desktop
- JetBrains Junie

## Installation

```bash
git clone git@github.com:CsabaKovacs/rulesmith.git rulesmith
cd rulesmith
pnpm install
pnpm -r build
pnpm -r test
```

## MCP server

Build first, then run the server:

```bash
node packages/mcp/dist/server.js
```

This is a **stdio MCP server**. Logs go to `stderr` only.

### Exposed MCP tools

- `scan_repo`
- `list_files`
- `search`
- `read_files`
- `sample_repo`
- `build_evidence_bundle`
- `render_rules`
- `diff_rules`
- `apply_rules`
- `list_packs`
- `get_pack`

Prompt/resource exposure (SDK support dependent):
- `laravel_map`
- `rubric`

### MCP bundle cleanup behavior

`build_evidence_bundle` supports:
- `includeContent?: boolean` (default `false`)
- `cleanup?: boolean` (default `true`)

With default MCP behavior, after `build_evidence_bundle`, the target repo's:
- `.rulesmith/bundle.json`
- `.rulesmith/`

are automatically removed.

AI-authored flow note:
- In generated compose prompts, `rulesmith` now explicitly instructs the host AI to include language standards and best practices (for example PSR-12 for PHP) when the repository is not a mixed/salad legacy codebase.
- For mixed/salad repositories, it instructs incremental stabilization with project-local conventions first.
- Compose prompts also enforce DRY/no-premature-abstraction, file cohesion (avoid mega files), language-specific API documentation standards (PHPDoc/JSDoc/docstrings/etc.), and a dedicated documentation-maintenance section for developer + user docs.
- Compose prompts and generated rulebooks now also include enforceable DO/DON'T gates, testing/security/performance checklists, dependency & breaking-change policies, API/CLI contract safety rules, and a Definition of Done section.

If you want to keep artifacts:

```json
{
  "repoPath": "/absolute/path/to/repo",
  "focus": "generic",
  "maxFiles": 200,
  "includeContent": false,
  "cleanup": false
}
```

## Host integrations

For full host-specific setup guides, see:
- `docs/integrations/README.md`
- `docs/integrations/codex.md`
- `docs/integrations/claude.md`
- `docs/integrations/junie.md`

## 1) Codex CLI

Register once:

```bash
export RULESMITH_HOME="/absolute/path/to/rulesmith"

codex mcp add rulesmith \
  --env RULESMITH_HOME="$RULESMITH_HOME" \
  -- node "$RULESMITH_HOME/packages/mcp/dist/server.js"
```

Verify:

```bash
codex mcp list
codex mcp get rulesmith --json
```

Use in a repo:

```bash
codex -C /absolute/path/to/target-repo
```

Example prompt:

```text
Use rulesmith MCP on this repository.
1) scan_repo
2) build_evidence_bundle with focus="generic", maxFiles=200, includeContent=false
3) expand evidence with list_files/search/read_files
4) generate AGENTS.md, CLAUDE.md, .junie/guidelines.md, and Copilot instruction files
5) show diff first, then apply
```

## 2) Codex IDE extension (VS Code)

The Codex extension uses the same Codex MCP configuration.

After `codex mcp add ...`:
- restart VS Code (or reload extension)
- open your target repo
- ask Codex chat to use `rulesmith` MCP tools

## 3) Claude Code

Add local stdio MCP server:

```bash
export RULESMITH_HOME="/absolute/path/to/rulesmith"

claude mcp add rulesmith \
  --env RULESMITH_HOME="$RULESMITH_HOME" \
  -- node "$RULESMITH_HOME/packages/mcp/dist/server.js"
```

Verify:

```bash
claude mcp list
claude mcp get rulesmith
```

Then in Claude Code, use `/mcp` to inspect server status/tools if needed.

## 4) Claude Desktop

Edit Claude Desktop MCP config (`claude_desktop_config.json`) and add:

```json
{
  "mcpServers": {
    "rulesmith": {
      "command": "node",
      "args": ["/absolute/path/to/rulesmith/packages/mcp/dist/server.js"],
      "env": {
        "RULESMITH_HOME": "/absolute/path/to/rulesmith"
      }
    }
  }
}
```

Restart Claude Desktop after saving config.

## 5) Junie (JetBrains chat plugin)

Junie supports MCP server configs via `mcp.json`.

Recommended project-scope config:
- `.junie/mcp/mcp.json`

User-scope config:
- `~/.junie/mcp/mcp.json`

Add:

```json
{
  "mcpServers": {
    "rulesmith": {
      "type": "command",
      "command": "node",
      "args": ["/absolute/path/to/rulesmith/packages/mcp/dist/server.js"],
      "env": {
        "RULESMITH_HOME": "/absolute/path/to/rulesmith"
      },
      "enabled": true
    }
  }
}
```

In Junie:
- open MCP settings (or use `/mcp` in Junie CLI)
- confirm server status is Active
- start chat in target repo and call rulesmith tools

## CLI usage (secondary fallback mode, no host AI)

This mode is deterministic and **does not use an AI model**.

After build, run directly:

```bash
node packages/cli/dist/index.js --help
```

### One-command interactive flow

```bash
node packages/cli/dist/index.js start /absolute/path/to/target-repo
```

Alias:

```bash
node packages/cli/dist/index.js /start /absolute/path/to/target-repo
```

`start` can run fully interactive (strictness, standards mode, targets, apply mode).

### Common commands

Scan:

```bash
node packages/cli/dist/index.js scan /absolute/path/to/target-repo
```

Sample paths:

```bash
node packages/cli/dist/index.js sample /absolute/path/to/target-repo \
  --strategy by-extension \
  --maxFiles 80
```

Build evidence bundle:

```bash
node packages/cli/dist/index.js bundle /absolute/path/to/target-repo \
  --focus generic \
  --maxFiles 200 \
  --out .rulesmith/bundle.json
```

Render files:

```bash
node packages/cli/dist/index.js render /absolute/path/to/target-repo \
  --pack default \
  --targets codex,copilot,claude,junie \
  --outdir .rulesmith/out
```

Diff:

```bash
node packages/cli/dist/index.js diff /absolute/path/to/target-repo \
  --pack default \
  --targets codex,copilot,claude,junie
```

Apply:

```bash
node packages/cli/dist/index.js apply /absolute/path/to/target-repo \
  --pack default \
  --targets codex,copilot,claude,junie \
  --mode safe
```

Doctor:

```bash
node packages/cli/dist/index.js doctor /absolute/path/to/target-repo
```

### Bundle size behavior (important)

By default, bundle mode is **paths-only**:
- bundle stores file paths, not file content
- keeps context footprint small for large projects

If you explicitly want file content in bundle:

```bash
node packages/cli/dist/index.js bundle /absolute/path/to/target-repo \
  --focus generic \
  --maxFiles 100 \
  --include-content
```


## Security model

Read operations are repo-root bounded and normalized.

Write allowlist is strict:
- `AGENTS.md`
- `CLAUDE.md`
- `.junie/guidelines.md`
- `.github/copilot-instructions.md`
- `.github/instructions/*.instructions.md`

Blocked by design:
- path traversal
- absolute path escapes
- symlink escapes outside repo root

Also avoid editing generated/dependency directories in mapped repos:
- `.git`
- `node_modules`
- `storage/framework/cache`
- `bootstrap/cache`

## Packs and overrides

Default pack: `packs/default`

Override matching relative files using `--overrides`.

Example:

```bash
node packages/cli/dist/index.js render /absolute/path/to/target-repo \
  --pack default \
  --overrides /absolute/path/to/my-pack-overrides \
  --targets codex,copilot,claude,junie \
  --outdir .rulesmith/out
```

Override-able files include:
- `templates/*.hbs`
- `orchestrator/*.md`
- `decision-tree.yaml`

## Troubleshooting

`rulesmith` missing from host MCP list:
- rebuild (`pnpm -r build`)
- re-add MCP server with absolute paths
- verify server path exists: `packages/mcp/dist/server.js`

MCP server starts but tools fail:
- run `node packages/mcp/dist/server.js` directly to inspect stderr
- confirm host restarts after MCP config changes

Bundle gets too large:
- keep `includeContent=false`
- lower `maxFiles`
- use targeted `list_files/search/read_files` in host workflow

Template/render issues:

```bash
node packages/cli/dist/index.js doctor /absolute/path/to/target-repo
```

## Verification on fixture repos

```bash
node packages/cli/dist/index.js scan examples/fixtures/laravel_messy_min
node packages/cli/dist/index.js diff examples/fixtures/laravel_messy_min --pack default --targets codex,copilot,claude,junie
```

## References

- Model Context Protocol: https://modelcontextprotocol.io/
- Codex MCP docs: https://developers.openai.com/codex/mcp
- Claude Code MCP docs: https://docs.anthropic.com/en/docs/claude-code/mcp
- Junie MCP docs: https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html
