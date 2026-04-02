# Claude Code Operating Rulebook (rulesmith)

## Execution Contract
- Work evidence-first: claims about architecture or behavior must reference repository files.
- Prefer minimal diffs and preserve existing contracts unless change scope explicitly says otherwise.
- Treat `packages/*/src` as source of truth; do not hand-edit `dist` as primary change path.

## Stack and Scope
- Main runtime stack for this repo: TypeScript/Node monorepo (`packages/core`, `packages/cli`, `packages/mcp`).
- Non-TS languages in `examples/fixtures` are fixture data for scanner coverage, not core runtime rules.

Evidence:
- `pnpm-workspace.yaml`
- `packages/core/src/index.ts`
- `packages/cli/src/index.ts`
- `packages/mcp/src/server.ts`
- `examples/fixtures/*`

## Required Commands
- install: `pnpm install`
- build: `pnpm -r build`
- test: `pnpm -r test`
- lint: `pnpm -r lint`

Evidence:
- `package.json`

## High-Risk Areas (Preserve Carefully)
- Safe FS boundaries and allowlist behavior.
- MCP tool schemas and backward compatibility.
- Render target paths and output contracts.
- Bundle defaults (`includeContent`, cleanup behavior).

Evidence:
- `packages/core/src/fs/safe.ts`
- `packages/mcp/src/server.ts`
- `packages/core/src/render/index.ts`
- `packages/core/src/scanner/sampling.ts`

## Write Guardrails
- Allowed generated files:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `.junie/guidelines.md`
  - `.github/copilot-instructions.md`
  - `.github/instructions/*.instructions.md`
  - `.claude/agents/*.md`
  - `.agents/skills/*/SKILL.md`
  - `.junie/skills/*/SKILL.md`
- Never broaden this in unrelated changes.

Evidence:
- `packages/core/src/fs/safe.ts`

## Testing Rules
- Run `pnpm -r test` and `pnpm -r build` after meaningful code changes.
- If touching renderer/safe-fs/scanner logic, update or add tests in `packages/core/test`.
- Keep snapshots updated only when output changes are intentional.

Evidence:
- `packages/core/test/render.test.ts`
- `packages/core/test/fs.safe.test.ts`

## Docs and Policy Sync
- Update `README.md`, `docs/integrations/*`, and `SECURITY.md` when behavior/risk model changes.
- Keep CLI examples consistent with actual flags/defaults.

## Security and Data Handling
- `rulesmith` does not embed an LLM; host AI performs reasoning.
- MCP workflows may transmit repository content to external AI providers based on host configuration.
- Avoid including secrets in evidence reads/prompts.

Evidence:
- `README.md`
- `SECURITY.md`
- `docs/integrations/README.md`

## UNKNOWN/TODO
- Root `format` and `dev` scripts are not defined.
