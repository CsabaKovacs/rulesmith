# Instruction Quality Rubric

A generated instruction file is acceptable only if:
- Claims are traceable to scanner evidence or explicit file references.
- Commands are concrete and executable, or marked UNKNOWN.
- Guardrails enumerate forbidden/generated/vendor paths.
- Framework conventions are conditionally applied based on confidence.
- Unknowns and risks are listed explicitly.
- In `strict` / `very-strict` policy, the output contains a dedicated `Mandatory System-Conventions (Strict Enforcement)` section.
- In `strict` / `very-strict` policy, the mandatory section includes language-specific system-found solutions (with evidence) and standards-enforcement rules that explicitly preserve already-applied repository patterns.

Reject output that:
- Invents commands with no evidence.
- Uses vague style guidance without repo-specific anchors.
- Omits guardrails or uncertainty sections.
- Omits the mandatory strict-conventions section when strictness is `strict` or `very-strict`.
