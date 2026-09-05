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
- [PR items need their own server](pr-items-need-their-own-server.md) — an unmerged PR can't be played on the `main` dev server; give each PR item its own port (round #783, 2026-08-26)
- [gh --body @- eats issue bodies](gh-body-at-dash-eats-issues.md) — `--body @-` files the literal characters, not stdin; it has destroyed three issue bodies (#361, #765, #766) — always `--body-file`
- [Stacked PR merge order](stacked-pr-merge-order.md) — never `--delete-branch` mid-stack: it auto-closes the next PR, and a closed PR can't be reopened while its base is gone (round #800, 2026-08-29)
- [Tier JSON machine drift](tier-json-machine-drift.md) — #812 dropped the timings, so a diff there is now a REAL membership change (commit it); it can still differ per machine (2026-09-01)
- [Look at the UI before he does](no-browser-self-test.md) — the harness CAN drive a browser (Playwright, proven 2026-08-31); `npm run smoke:visual` is the gate, and reading the screenshots is the job
- [Measure before diagnosing](measure-before-diagnosing.md) — a root cause read off the code is a hypothesis; run the case and print the real state before it goes in the issue body (2026-08-31: two of four wrong)
- [Heredocs eat backslashes](heredoc-eats-backslashes.md) — bash heredocs silently halve backslashes and run backticks; write files with the Write tool and do string surgery from a .cjs script, then read the lines back (round #869)
- [Gate after the LAST file](gate-after-the-last-file.md) — run `tsc -b` after the test file exists, not before it; two test-only type errors reached the batch gate in round #869
- [A red suite may be the gate working](red-suite-may-be-the-gate-working.md) — measure each failing scenario on the PRE-change baseline before relaxing a new invariant; in #872 all three red locks were asserting figures that already shipped flat
- [Classifier blocks gh pr merge](classifier-blocks-pr-merge.md) — project settings allow it but auto-mode refuses; finish the PR route and hand the operator the merge
- [Test the framing, not just the facts](test-the-framing-not-just-the-facts.md) — an escalation's QUESTION is a hypothesis too; check whether the given should have been HONOURED before pricing a nicer refusal (2026-09-05 #909, #892)
