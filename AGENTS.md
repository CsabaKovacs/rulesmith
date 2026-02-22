# rulesmith Repository Conventions (AI-Reviewed)

This file captures enforceable conventions for this repository based on direct file evidence.

## Project Snapshot
- Repository type: pnpm monorepo (`packages/*`).
- Primary implementation stack: TypeScript + Node.js ESM in `packages/core`, `packages/cli`, `packages/mcp`.
- Additional languages (PHP/Dart/Python/Go) are present mainly in `examples/fixtures/*` for scanner test coverage; do not treat them as core runtime stack conventions.
- Build/test/lint commands are workspace-level scripts from root `package.json`.

Evidence:
- `pnpm-workspace.yaml`
- `package.json`
- `packages/core/package.json`
- `packages/cli/package.json`
- `packages/mcp/package.json`
- `examples/fixtures/*`

## Setup Commands
- install: `pnpm install`
- build: `pnpm -r build`
- test: `pnpm -r test`
- lint: `pnpm -r lint`
- format: `UNKNOWN` (no root format script)
- dev: `UNKNOWN` (no root dev script)

Evidence:
- `package.json`

## Repository Layout
- `packages/core/src`: source of truth for profile/schema, scanner/sampling, safe FS, packs/decision tree, renderer.
- `packages/cli/src`: `rulesmith` CLI commands (`start`, `scan`, `sample`, `bundle`, `compose`, `render`, `diff`, `apply`, `doctor`).
- `packages/mcp/src/server.ts`: MCP stdio server tool registration and prompt/resource exposure.
- `packs/default`: templates, orchestrator prompts, decision tree.
- `examples/fixtures`: synthetic repos used for scanner/render testing.
- `docs/integrations`: host setup docs.

## Source vs Dist Policy
- Edit `src` files, not `dist`, unless there is a deliberate packaging exception.
- Any source change that affects emitted JS/types requires rebuilding so `dist` stays in sync before release.
- Keep TypeScript `rootDir=src` and output `outDir=dist` conventions per package.

Evidence:
- `packages/core/tsconfig.json`
- `packages/cli/tsconfig.json`
- `packages/mcp/tsconfig.json`

## Core Behavioral Rules
- `rulesmith` itself must not call an embedded LLM/model; it is an evidence + rendering tool.
- MCP server logs must go to stderr; do not print operational logs to stdout.
- Preserve deterministic evidence behavior in scanner and bundle flow.
- Keep `build_evidence_bundle` defaults paths-only (`includeContent=false`) and cleanup behavior explicit.

Evidence:
- `README.md`
- `packages/mcp/src/server.ts`
- `packages/core/src/scanner/sampling.ts`

## Safe FS and Write Guardrails
- Repository boundary protections (no traversal, no absolute escape, no symlink escape) are mandatory.
- Allowed generated write targets are restricted to:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `.junie/guidelines.md`
  - `.github/copilot-instructions.md`
  - `.github/instructions/*.instructions.md`
- Safe mode must not overwrite changed existing content.

Evidence:
- `packages/core/src/fs/safe.ts`
- `packages/core/test/fs.safe.test.ts`

## MCP Tool Contract
- Maintain tool surface compatibility unless a breaking change is intentional and documented.
- Current tool set includes scan/list/search/read/sample/bundle/render/diff/apply and pack helpers.
- Optional fields in tool schemas should remain backward compatible where possible.

Evidence:
- `packages/mcp/src/server.ts`
- `README.md`

## Rendering and Targets
- Supported targets currently: `codex`, `copilot`, `claude`, `junie`.
- Preserve target-specific outputs and path contracts.
- If changing templates or target behavior, update tests/snapshots accordingly.

Evidence:
- `packages/core/src/render/index.ts`
- `packs/default/pack.json`
- `packages/core/test/render.test.ts`
- `packages/core/test/__snapshots__/render.test.ts.snap`

## Testing and Quality Bar
- Minimum required checks before merge:
  - `pnpm -r test`
  - `pnpm -r build`
  - `pnpm -r lint`
- For behavioral changes in `core`/`render`/`fs`/`scanner`, add or update vitest coverage in `packages/core/test`.
- CLI and MCP currently use `--passWithNoTests`; if adding tests there, enforce them consistently.

Evidence:
- `package.json`
- `packages/core/package.json`
- `packages/cli/package.json`
- `packages/mcp/package.json`

## Documentation and Policy Maintenance
- Update docs in the same change when behavior, flags, outputs, or integrations change.
- Keep these policy docs coherent: `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CLA.md`, `GOVERNANCE.md`, `TRADEMARKS.md`.
- Keep integration docs aligned with actual CLI flags and MCP behavior.

Evidence:
- `README.md`
- `SECURITY.md`
- `docs/integrations/*`

## Security and Data Exposure Rules
- Never weaken safe path enforcement or allowlist boundaries without explicit security review.
- Treat MCP-host data flow as sensitive: avoid exposing secrets or proprietary code unintentionally.
- Keep disclaimers and security policy language aligned with actual risk model.

Evidence:
- `packages/core/src/fs/safe.ts`
- `SECURITY.md`
- `README.md`
- `docs/integrations/README.md`

## Implementation Do/Don't
- DO keep changes scoped and evidence-backed.
- DO prefer compatibility-preserving edits in MCP/CLI schemas.
- DO update tests/snapshots/docs with behavior changes.
- DON'T introduce speculative abstractions without repeated evidence.
- DON'T rely on fixture repos as production architecture guidance.
- DON'T bypass safe FS protections for convenience.

## UNKNOWN/TODO
- Add an explicit root-level `format` command if formatting policy should be enforced uniformly.
- Decide whether `packages/cli` and `packages/mcp` should move from `--passWithNoTests` to required tests.
