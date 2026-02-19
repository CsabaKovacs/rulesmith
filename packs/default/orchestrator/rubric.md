# Instruction Quality Rubric

A generated instruction file is acceptable only if:
- Claims are traceable to scanner evidence or explicit file references.
- Commands are concrete and executable, or marked UNKNOWN.
- Guardrails enumerate forbidden/generated/vendor paths.
- Framework conventions are conditionally applied based on confidence.
- Unknowns and risks are listed explicitly.

Reject output that:
- Invents commands with no evidence.
- Uses vague style guidance without repo-specific anchors.
- Omits guardrails or uncertainty sections.
