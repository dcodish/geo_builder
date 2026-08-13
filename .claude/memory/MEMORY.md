# Memory Index

Working rules (never patch, no autonomous API calls, triage-first, readiness gate, commit ⇒ push,
PR-for-features, worktree hazards) live in **[CLAUDE.md](../../CLAUDE.md) → Standing rules / Workflow**,
which loads every session and has operator authority. One fact, one home — do not mirror them here
([ADR-W-002](../../docs/06w-decisions-workspace.md)).

- [Vision and stall](vision-and-stall.md) — what Geo Builder is really for (incremental figure-building) and why the template-based engine dead-ended
- [Architecture decisions](architecture-decisions.md) — settled rebuild direction: constructive engine, parser-first + Haiku API fallback, cost controls
- [Bagrut theorem source](bagrut-theorem-source.md) — the official theorem list PDF (canonical source for the theorem feature) + how to read it
- [Memory in repo](memory-in-repo.md) — keep durable memory in the repo (docs/), not local memory, so it travels across computers
- [Tool denials are observations](tool-denials-are-observations.md) — never report "I can't do X" from a denial without checking the permission config and retrying the canonical minimal command form
- [Work PC / cross-machine](work-pc-cross-machine.md) — David switches work/home PCs; project syncs via git/GitHub (moved out of Dropbox 2026-07-23) — pick up cross-machine progress via git + the ADR-log tails at session start
- [Pending triage recommendations](pending-triage-recommendations.md) — two hand-verified 2-D feature recommendations from the 2026-08-11 log-triage await operator approval (the full report is gitignored, work-PC only); delete once filed or declined
