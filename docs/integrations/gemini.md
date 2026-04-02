# Gemini CLI Integration

Gemini CLI can run `rulesmith` as a local stdio MCP server.

## 1) Build rulesmith

```bash
cd /absolute/path/to/rulesmith
pnpm install
pnpm -r build
```

## 2) Register rulesmith MCP server

```bash
export RULESMITH_HOME="/absolute/path/to/rulesmith"

gemini mcp add \
  --scope project \
  --transport stdio \
  --env RULESMITH_HOME="$RULESMITH_HOME" \
  rulesmith \
  node "$RULESMITH_HOME/packages/mcp/dist/server.js"
```

Verify:

```bash
gemini mcp list
```

## 3) Use in a target repository

Open your target repo in Gemini CLI, then run a prompt like:

```text
Use rulesmith MCP as evidence provider only.
Run:
1) scan_repo
2) build_evidence_bundle with focus="generic", maxFiles=2000, includeContent=false
3) expand evidence with list_files/search/read_files
4) generate/update AGENTS.md, CLAUDE.md, GEMINI.md, .junie/guidelines.md, .agent/rules/rulesmith.instructions.md, Copilot instruction files, and agent workflow files (.agents/skills/)
5) show diff first, then apply in safe mode
```

## Troubleshooting

- `gemini: command not found`:
  install Gemini CLI and ensure it is on `$PATH`.
- MCP server missing:
  rerun `pnpm -r build`, then re-add the server.
- stale behavior:
  restart Gemini CLI session after MCP config changes.
