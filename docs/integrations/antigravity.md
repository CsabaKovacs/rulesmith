# Antigravity Integration

Google Antigravity supports MCP servers and can run `rulesmith` through a local stdio configuration.

## 1) Build rulesmith

```bash
cd /absolute/path/to/rulesmith
pnpm install
pnpm -r build
```

## 2) Add rulesmith in Antigravity MCP config

Use Antigravity MCP settings (or raw MCP config editor) and add:

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

After saving, reload/restart Antigravity so the MCP server is reconnected.

## 3) Run mapping workflow in chat

Prompt example:

```text
Use rulesmith MCP as evidence provider only.
Run:
1) scan_repo
2) build_evidence_bundle with focus="generic", maxFiles=2000, includeContent=false
3) expand evidence with list_files/search/read_files
4) generate/update AGENTS.md, CLAUDE.md, GEMINI.md, .junie/guidelines.md, .agent/rules/rulesmith.instructions.md, Copilot instruction files, and agent workflow files (.agents/skills/)
5) show diff first, then apply in safe mode
```

## Notes

- Antigravity MCP capabilities can vary by environment/version. If a server fails to connect, validate the MCP config and restart the session.
- Keep `includeContent=false` for large repositories, then use targeted `read_files` calls.
