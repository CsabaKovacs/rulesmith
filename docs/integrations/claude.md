# Claude Integration

This guide covers:
- Claude Code (CLI)
- Claude Desktop

## 1) Build rulesmith

```bash
cd /absolute/path/to/rulesmith
pnpm install
pnpm -r build
```

## 2) Claude Code (CLI) MCP setup

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

Inside Claude Code, open target repo and run MCP workflow prompts the same way as in Codex.

## 3) Claude Desktop MCP setup

Edit Claude Desktop config (`claude_desktop_config.json`) and add:

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

Then restart Claude Desktop.

## 4) Recommended prompt

```text
Use rulesmith MCP as evidence provider only.
Run scan_repo, build_evidence_bundle (includeContent=false), then deepen with list_files/search/read_files.
Generate strict project-specific AGENTS.md, CLAUDE.md, GEMINI.md, .junie/guidelines.md, .agent/rules/rulesmith.instructions.md, Copilot instruction files, and agent workflow files (.claude/agents/, .agents/skills/) with evidence-backed claims.
Show diff before apply.
```

## Troubleshooting

- MCP server not visible:
  confirm config JSON syntax and absolute paths.
- Stale server behavior:
  rebuild rulesmith and restart Claude host process.
- Very large context:
  keep `includeContent=false`, use targeted `read_files` only.
