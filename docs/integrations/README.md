# Integration Guides

Use these guides when you want `rulesmith` as an MCP evidence layer in a host AI client.

Safety note: `rulesmith` helps structure evidence and workflow, but generated instructions and AI outputs still require human review before use.
When used through MCP with a host AI, repository content may be transmitted to third-party AI services according to your host/tool settings.
Do not expose secrets or sensitive code unless you explicitly accept that risk.

- `codex.md` - Codex CLI and Codex IDE extension setup
- `claude.md` - Claude Code and Claude Desktop setup
- `junie.md` - JetBrains Junie setup
- `gemini.md` - Gemini CLI setup
- `antigravity.md` - Google Antigravity setup

## Common prerequisites

```bash
cd /absolute/path/to/rulesmith
pnpm install
pnpm -r build
```

All guides use the same MCP server entrypoint:

`node /absolute/path/to/rulesmith/packages/mcp/dist/server.js`
