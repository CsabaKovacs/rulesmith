# CLI Mode (Deterministic, No Host AI)

This mode is deterministic and **does not use an AI model**.

After build, run directly:

```bash
node packages/cli/dist/index.js --help
```

## One-command interactive flow

```bash
node packages/cli/dist/index.js start /absolute/path/to/target-repo
```

Alias:

```bash
node packages/cli/dist/index.js /start /absolute/path/to/target-repo
```

`start` can run fully interactive (strictness, standards mode, targets, apply mode).

## Common commands

Scan:

```bash
node packages/cli/dist/index.js scan /absolute/path/to/target-repo
```

Sample paths:

```bash
node packages/cli/dist/index.js sample /absolute/path/to/target-repo \
  --strategy by-extension \
  --maxFiles 80
```

Build evidence bundle:

```bash
node packages/cli/dist/index.js bundle /absolute/path/to/target-repo \
  --focus generic \
  --maxFiles 2000 \
  --out .rulesmith/bundle.json
```

Render files:

```bash
node packages/cli/dist/index.js render /absolute/path/to/target-repo \
  --pack default \
  --targets codex,copilot,claude,junie,gemini,antigravity \
  --outdir .rulesmith/out
```

Diff:

```bash
node packages/cli/dist/index.js diff /absolute/path/to/target-repo \
  --pack default \
  --targets codex,copilot,claude,junie,gemini,antigravity
```

Apply:

```bash
node packages/cli/dist/index.js apply /absolute/path/to/target-repo \
  --pack default \
  --targets codex,copilot,claude,junie,gemini,antigravity \
  --mode safe
```

Doctor:

```bash
node packages/cli/dist/index.js doctor /absolute/path/to/target-repo
```

## Bundle size behavior (important)

By default, bundle mode is **paths-only**:
- bundle stores file paths, not file content
- keeps context footprint small for large projects

If you explicitly want file content in bundle:

```bash
node packages/cli/dist/index.js bundle /absolute/path/to/target-repo \
  --focus generic \
  --maxFiles 100 \
  --include-content
```

## Packs and overrides

Default pack: `packs/default`

Override matching relative files using `--overrides`.

Example:

```bash
node packages/cli/dist/index.js render /absolute/path/to/target-repo \
  --pack default \
  --overrides /absolute/path/to/my-pack-overrides \
  --targets codex,copilot,claude,junie,gemini,antigravity \
  --outdir .rulesmith/out
```

Override-able files include:
- `templates/*.hbs`
- `orchestrator/*.md`
- `decision-tree.yaml`

## Troubleshooting

`rulesmith` missing from host MCP list:
- rebuild (`pnpm -r build`)
- re-add MCP server with absolute paths
- verify server path exists: `packages/mcp/dist/server.js`

MCP server starts but tools fail:
- run `node packages/mcp/dist/server.js` directly to inspect stderr
- confirm host restarts after MCP config changes

Bundle gets too large:
- keep `includeContent=false`
- lower `maxFiles`
- use targeted `list_files/search/read_files` in host workflow

Template/render issues:

```bash
node packages/cli/dist/index.js doctor /absolute/path/to/target-repo
```

## Verification on fixture repos

```bash
node packages/cli/dist/index.js scan examples/fixtures/laravel_messy_min
node packages/cli/dist/index.js diff examples/fixtures/laravel_messy_min --pack default --targets codex,copilot,claude,junie,gemini,antigravity
```
