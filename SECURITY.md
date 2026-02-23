# Security Policy

## Reporting a Vulnerability

If you discover a potential security issue in `rulesmith`, please report it privately before any public disclosure.

### Preferred reporting channel
- Open a **private security advisory** on GitHub for this repository.

### Fallback
- If private advisory reporting is unavailable, contact the maintainer privately (see repository contact details).
- Do **not** publish proof-of-concept exploits or sensitive details in public issues/discussions.

Please include (if possible):
- affected version, release tag, or commit hash
- environment (OS, Node.js version)
- reproduction steps
- impact assessment
- proof-of-concept (sanitized if needed)
- suggested mitigation (optional)

## Supported Versions

Security fixes are typically provided for:
- the latest released version
- the `main` branch (development head)

Older versions may be unsupported or fixed on a best-effort basis only.

## Response Expectations

Project maintainers aim to:
- acknowledge reports within **72 hours**
- provide an initial assessment within **7 days**
- coordinate disclosure timing when a fix is required

These timelines are goals, not guarantees.

## Scope

This policy covers security issues in `rulesmith`, including (but not limited to):
- path traversal / repository escape
- symlink escape outside repository root
- write-allowlist bypass
- unintended file disclosure via MCP tools
- unsafe file handling in CLI/MCP workflows

## Out of Scope / Not a Security Guarantee

`rulesmith` is a local-first evidence and workflow tool. It does **not** guarantee:
- correctness of repository interpretation
- correctness/safety of host AI outputs
- secure behavior of third-party AI hosts or plugins (for example Codex, Claude, Copilot, Junie, Gemini, Antigravity)
- confidentiality guarantees for data sent to host AI providers through MCP-integrated workflows

AI-assisted outputs (instructions, prompts, diffs, code suggestions) must be reviewed and validated by a qualified human before use in any environment.

Do not rely on generated outputs for security-critical, safety-critical, legal, financial, or compliance-sensitive decisions without additional expert review.

When you use MCP with a host AI, you are responsible for controlling what repository data is shared with that host/provider.
Project maintainers and contributors do not accept liability for data/code exposure caused by host AI usage or configuration.

## Responsible Disclosure

Please allow reasonable time for investigation and remediation before public disclosure.

We appreciate responsible reports that help improve the safety of the project.
