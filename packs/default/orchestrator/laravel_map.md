# Laravel Mapping Workflow (Host Agent)

Use `scan_repo` first to get deterministic signals and confidence scores.

Then build evidence in this order:
1. `sample_repo` with `laravel-focused` strategy.
2. `search` for architectural terms (`Route::`, controllers, services, jobs, policies).
3. `read_files` for sampled and matched files.
4. `build_evidence_bundle` for a compact profile + selected file corpus.

Rules:
- Every architectural claim must cite evidence file paths.
- Distinguish observed facts from inferred conventions.
- If confidence is low, write explicit UNKNOWN/TODO entries.
- In strict/very-strict mode, generated rules MUST include a mandatory section that enforces system-found conventions and language standards only where they do not conflict with already-applied repository patterns.

Output goal:
- Generate AGENTS.md with enforceable instructions tied to evidence.
