# Memory Index

Working rules live in CLAUDE.md, docs/17, docs/22, docs/RUNBOOK.md and the skills, never here; this folder holds harness and machine mechanics only ([ADR-W-118](../../docs/06w-decisions-workspace.md#adr-w-118) C2).

- [Tool denials are observations](tool-denials-are-observations.md) — read the permission config and retry the canonical minimal command before saying "I can't"
- [gh pr merge works](gh-pr-merge-works.md) — merge with `gh pr merge`; only a local `git merge` into main is refused
- [Heredocs eat backslashes](heredoc-eats-backslashes.md) — write files with the Write tool; do string surgery from an asserted .cjs script
- [Tier JSON machine drift](tier-json-machine-drift.md) — a test-tiers.json diff is a real membership change, but it varies per machine and per run
- [Jev experiment](jev-experiment.md) — the parked "did you mean" model: where the harness and key live, and what the operator pre-approved
- [Promo video plan](promo-video-plan.md) — the operator's parked teacher-video project: format, storyboard, open questions
