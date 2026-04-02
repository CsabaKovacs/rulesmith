# Codex Integration

This guide covers:
- Codex CLI
- Codex IDE extension (VS Code)

## 1) Build rulesmith

```bash
cd /absolute/path/to/rulesmith
pnpm install
pnpm -r build
```

## 2) Register MCP server in Codex

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

## 3) Use from Codex CLI

Open target repository:

```bash
codex -C /absolute/path/to/target-repo
```

Prompt template:

```text
Use rulesmith MCP only as evidence provider.
Run:
1) scan_repo
2) build_evidence_bundle with focus="generic", maxFiles=2000, includeContent=false
3) expand evidence with list_files/search/read_files
4) generate/update AGENTS.md, CLAUDE.md, GEMINI.md, .junie/guidelines.md, .agent/rules/rulesmith.instructions.md, Copilot instruction files, and agent workflow files (.agents/skills/, .claude/agents/, .junie/skills/)
5) show diff first, then apply
```

## 4) Use from Codex IDE extension (VS Code)

The extension uses the same Codex MCP config.

After `codex mcp add ...`:
- restart VS Code (or reload the Codex extension)
- open your target repo
- ask Codex chat to call `rulesmith` tools

## 5) Update workflow after changes in rulesmith

If you changed MCP server code:

```bash
cd /absolute/path/to/rulesmith
pnpm -r build
```

Then restart the host chat session (or IDE extension) so a fresh MCP process starts.

## Troubleshooting

- `command not found: codex`:
  install Codex CLI first and ensure it is on `$PATH`.
- MCP listed but tools fail:
  verify server path and rebuild `rulesmith`.
- Old MCP behavior still appears:
  open a new Codex chat session after rebuilding/restarting.
