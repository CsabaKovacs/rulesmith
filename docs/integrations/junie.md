# Junie Integration (JetBrains)

Junie can run MCP servers from an `mcp.json` configuration.

## 1) Build rulesmith

```bash
cd /absolute/path/to/rulesmith
pnpm install
pnpm -r build
```

## 2) Configure MCP server

Project scope (recommended):
- `.junie/mcp/mcp.json`

User scope:
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

## 3) Start and verify in Junie

- open MCP settings in Junie (or use `/mcp` in Junie CLI)
- confirm `rulesmith` is Active
- open your target repository
- run your mapping prompt in Junie chat

Prompt example:

```text
Use rulesmith MCP on this repository.
Run scan_repo, build_evidence_bundle with includeContent=false, then use list_files/search/read_files to collect concrete evidence.
Generate AGENTS.md, CLAUDE.md, GEMINI.md, GitHub Copilot instruction files, and agent workflow files (.junie/skills/, .agents/skills/).
Also generate .junie/guidelines.md for Junie-specific behavior and .agent/rules/rulesmith.instructions.md for Antigravity rules compatibility.
Show diff before apply.
```

## Troubleshooting

- server not starting:
  verify `node` path and absolute `server.js` path.
- config ignored:
  check whether Junie is using project-scope or user-scope config.
- output too large:
  keep bundle paths-only and sample by area, not full file-content dumps.
