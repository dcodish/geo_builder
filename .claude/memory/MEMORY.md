# Memory Index

- [Vision and stall](vision-and-stall.md) — what Geo Builder is really for (incremental figure-building) and why the template-based engine dead-ended
- [Architecture decisions](architecture-decisions.md) — settled rebuild direction: constructive engine, parser-first + Haiku API fallback, cost controls
- [Bagrut theorem source](bagrut-theorem-source.md) — the official theorem list PDF (canonical source for the theorem feature) + how to read it
- [Readiness gate](readiness-gate.md) — don't call anything "ready" until its test gate passes; report tests honestly
- [Test server on fix-ready](test-server-on-fix-ready.md) — never say a fix is done without a running dev server, its URL, and the test cases; utterances go one-per-line in a code block for copy-paste (Stop hook enforces the server part)
- [Memory in repo](memory-in-repo.md) — keep all durable memory in the repo (docs/), not local memory, so it travels across computers
- [Work PC / cross-machine](work-pc-cross-machine.md) — David switches work/home PCs; project now syncs via git/GitHub (moved out of Dropbox 2026-07-23) — pick up cross-machine progress via git + source-of-truth docs at session start
- [Never patch, fix root](never-patch-fix-root.md) — never special-case the erroring input; fix the core engine feature even if big; ask when unsure of scope
- [No autonomous API calls](no-autonomous-api-calls.md) — only the operator authorises live Anthropic/Haiku calls; be the oracle myself with the session model
- [Triage-only during testing](triage-only-during-testing.md) — operator reports = file issue + diagnosis + fix plan, then STOP; even dictated/trivial changes wait for the fix session
- [Commit+deploy still needs a PR](commit-deploy-still-needs-pr.md) — the instruction waives only play-and-approve; branch + PR + self-merge, never direct-to-main
- [Commit means push](commit-means-push.md) — when the operator says "commit", also push to GitHub (it is the only channel to the other machine)
- [Operator tests Hebrew only](operator-tests-hebrew-only.md) — never put English cases in play scripts; the suite covers En mirrors
- [Check branch before editing](check-branch-before-editing.md) — shared tree may be on a play/* branch; verify before editing, fix in a main worktree
- [Worktree node_modules junction](worktree-node-modules-junction.md) — never link node_modules into a worktree; `git worktree remove` follows it and destroys the shared tree's copy
