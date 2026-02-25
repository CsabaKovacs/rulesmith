# MCP Workflow

This doc covers the recommended MCP flow, evidence budget, and tool reference.

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

## Recommended workflow (host AI)

Run the following sequence in your host AI chat:

1) `scan_repo`
2) `build_evidence_bundle` with `focus="generic"`, `maxFiles=1200`, `includeContent=false`
3) expand evidence with `list_files` / `search` / `read_files`
4) generate in small target batches (`strictness=very-strict` by default)
5) `render_rules` -> `diff_rules` -> `apply_rules` (only when valid)

## Example prompt (copy/paste)

```text
Use rulesmith MCP end-to-end on the currently opened repository.

Required inputs:
- TARGETS_CSV = <comma-separated targets from codex,copilot,claude,junie,gemini,antigravity>
- TARGET_BATCH_SIZE = <recommended 1-2, default 2>
- POLICY = { strictness: "very-strict", standards: "project-plus-standard" }

Run:
1) scan_repo
2) build_evidence_bundle with focus="generic", maxFiles=1200, includeContent=false
3) expand evidence with list_files/search/read_files on key areas
4) split TARGETS_CSV into batches of TARGET_BATCH_SIZE (max 2 recommended)
5) for each batch: render_rules -> diff_rules -> apply_rules(mode="safe")
6) if render payload is too large, retry with smaller batch size (down to 1)
7) never run apply_rules with empty files array

Then summarize:
- detected stack/frameworks with confidence
- key build/test/lint/format commands with evidence
- guardrails/forbidden paths
- batch-by-batch diff summary and written files
- warnings/retries (if any)

Do not print full generated file contents; keep response concise to avoid token overload.
If required inputs are missing, ask follow-up questions first and do not run tools until inputs are complete.
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
- codex -> AGENTS.md
- claude -> CLAUDE.md
- gemini -> GEMINI.md
- copilot -> .github/copilot-instructions.md (and optional .github/instructions/*.instructions.md)
- junie -> .junie/guidelines.md
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
- instructs incremental stabilization with project-local conventions first for mixed/salad repositories
- enforces DRY/no-premature-abstraction, file cohesion (avoid mega files), language-specific API documentation standards (PHPDoc/JSDoc/docstrings/etc.)
- adds a dedicated documentation-maintenance section for developer + user docs
- adds enforceable DO/DON'T gates, testing/security/performance checklists, dependency & breaking-change policies, API/CLI contract safety rules, and a Definition of Done section
