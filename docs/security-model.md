# Security Model

Read operations are repo-root bounded and normalized.

Write allowlist is strict:
- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.junie/guidelines.md`
- `.agent/rules/rulesmith.instructions.md`
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
