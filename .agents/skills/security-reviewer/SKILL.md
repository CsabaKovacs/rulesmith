---
description: Run a security review on changed files when modifications touch request handling, authentication, authorization, database queries, file access, external APIs, or sensitive data.
---

# Security Review

> Reviews changed files for security vulnerabilities and unsafe patterns.

## When to Activate

- When changes touch: request/input handling, authentication or authorization, database queries or persistence, file upload or access, HTML rendering or user-generated content, external API calls or webhooks, or secrets/tokens/sensitive data.
- Skip when changes are purely internal logic with no external surface.

## Review Methodology

Follow these steps in order:

- Identify security-relevant changes in the diff.
- Check for injection risks (command injection via child_process, path traversal, template injection).
- Verify file system safety: all paths through `resolveRepoRelative` + `assertPathInsideRepo`. (evidence: packages/core/src/fs/safe.ts)
- Check write operations restricted to `WRITE_ALLOWLIST`. (evidence: packages/core/src/fs/safe.ts)
- Verify MCP tool inputs validated via Zod schemas. (evidence: packages/mcp/src/server.ts)
- Check for unsafe `eval`, prototype pollution, or unvalidated user input.
- Verify symlink handling — `readFileSafe` rejects symlinks. (evidence: packages/core/src/fs/safe.ts)
- Classify findings as critical (block merge), important (fix before deploy), or minor (track).
- Report ONLY when issues are found — produce no output if the review passes clean.

## Stack-Specific Security Rules

- Path traversal: all file paths must use `resolveRepoRelative` guards. (evidence: packages/core/src/fs/safe.ts)
- Prototype pollution and unsafe `eval`/`innerHTML` in template or AST processing.
- `maxBytesPerFile` limits enforced to prevent memory exhaustion. (evidence: packages/core/src/fs/safe.ts)
- Artifact store TTL and max size prevent memory leaks. (evidence: packages/core/src/render/index.ts)

## Boundaries

- Do NOT apply fixes — security changes require explicit human approval.
- Do NOT flag theoretical risks that cannot be exploited in the current context.
- Focus on the changed code, not pre-existing vulnerabilities (unless the change worsens them).

## Output Format

When issues are found, report using this structure:

```
## Security Review — [scope summary]

### Critical (block merge)
- [file:line] — vulnerability type — description — remediation

### Important (fix before deploy)
- [file:line] — vulnerability type — description — remediation

### Minor (track)
- [file:line] — vulnerability type — description
```

If no issues are found, produce **no output**.
