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
- [Prior rulings live in comments](prior-rulings-live-in-comments.md) — an issue body is written once and never revised: the ruling may sit in a comment, and the WORK may already have shipped — check comments AND `git log` before calling anything open (2026-08-16 #509; 2026-08-25 #659)
- [Shared-tree branch races](shared-tree-branch-races.md) — re-verify the shared tree's branch in the SAME compound as any write git op there; a parallel session can switch it mid-flight (2026-08-13 near-miss)
- [Gate lines are read, not matched](gate-lines-are-read-not-matched.md) — evidence produced is not evidence read; && between gates; quote the decisive lines before claiming green
- [Deploys are mine to run](deploys-are-mine-to-run.md) — never hand a deploy back to the operator; the permissions are already in place, so run it and finish the tag + DEPLOY-LOG record
