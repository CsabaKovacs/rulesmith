# Junie Guidelines for rulesmith

## Context
You are working inside the `rulesmith` repository.

- Monorepo: `packages/core`, `packages/cli`, `packages/mcp`.
- Main implementation: TypeScript/Node ESM.
- `examples/fixtures` are scanner/render fixtures; avoid treating them as core runtime architecture.

## Execution Rules
- Use evidence-first reasoning and reference concrete files for architectural claims.
- Keep changes minimal and contract-safe.
- Prefer editing `src` files, then rebuild generated `dist` outputs.

## Mandatory Checks
- `pnpm -r test`
- `pnpm -r build`
- `pnpm -r lint`

## High-Risk Files (extra caution)
- `packages/core/src/fs/safe.ts`
- `packages/mcp/src/server.ts`
- `packages/core/src/render/index.ts`
- `packages/core/src/scanner/sampling.ts`

## Guardrails
- Preserve write allowlist boundaries and path safety.
- Preserve MCP tool contracts and stdio behavior.
- Keep generated target file paths stable.

## Documentation Sync
When behavior, flags, integrations, or risk model changes, update:
- `README.md`
- `docs/integrations/*`
- `SECURITY.md`

## Security Reminder
MCP + host AI usage may transmit repository content externally depending on host configuration.
Do not expose secrets; sanitize examples and prompts.

## Unknowns
- Root `format` script not defined.
- Root `dev` script not defined.
