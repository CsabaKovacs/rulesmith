# GitHub Copilot Instructions for rulesmith

## Purpose
This repository builds `rulesmith`: a local-first MCP server + CLI for deterministic repository evidence and instruction file generation.

## Primary Stack
- TypeScript + Node.js ESM monorepo.
- Source code under `packages/*/src`.
- Fixture repositories under `examples/fixtures` are test inputs, not production architecture.

## Required Workflow
1. Prefer small, scoped changes.
2. Keep behavior evidence-backed with file references.
3. Preserve contracts unless a breaking change is explicitly requested.
4. Update tests/docs with behavior changes.

## Commands
- install: `pnpm install`
- build: `pnpm -r build`
- test: `pnpm -r test`
- lint: `pnpm -r lint`

## Critical Guardrails
- Do not weaken safe path protections in `packages/core/src/fs/safe.ts`.
- Do not broaden write allowlist casually.
- Keep MCP logs on stderr and avoid protocol-breaking stdout noise.
- Maintain MCP tool compatibility where possible.
- Keep render target outputs stable:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `.junie/guidelines.md`
  - `.github/copilot-instructions.md`
  - `.github/instructions/*.instructions.md`

## Change-Specific Requirements
- If changing renderer templates/behavior, update `packages/core/test/render.test.ts` and snapshots.
- If changing scanner/sampling logic, verify bundle and sampling behavior remains deterministic.
- If changing CLI flags/examples, update `README.md` and `docs/integrations/*`.
- If changing risk/data-handling behavior, update `SECURITY.md` and README disclaimers.

## Do / Don't
- DO edit `src` first and rebuild `dist`.
- DO keep TypeScript types explicit across public boundaries.
- DO preserve backward compatibility for MCP schema changes when feasible.
- DON'T infer core project standards from fixture language files.
- DON'T introduce broad rewrites mixed with functional changes.
- DON'T include secrets in prompts, examples, or evidence artifacts.

## Unknowns
- Root `format` script is not defined.
- Root `dev` script is not defined.
