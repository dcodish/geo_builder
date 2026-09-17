---
name: pr-may-ship-mid-pass
description: "Re-check a PR's state in the same breath as handing over its play sheet — a parallel session can merge AND deploy it while you prepare one"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d17442e8-222f-4865-91cf-cdf0862091bd
  modified: 2026-09-17T08:04:17.506Z
---

A play sheet prepared for an "open" PR can be obsolete before it is handed over. In the 2026-09-17
`/decisions` pass, PR #1143 was open with 28 undeployed commits at session start; by the time the sheet
was written — worktree updated to the PR head, dev server launched on 5177, all five cases re-validated
through `decideSubmit` — a parallel session had **merged it and deployed it** as `prod/2026-09-17`.
The sheet asked the operator to play an unmerged PR on localhost that was already live on production.

**Why:** this workspace runs several concurrent sessions against one repo. The existing
[[shared-tree-branch-races]] note covers the *branch* racing under a write; this is the same hazard one
level up — the **PR itself**, its merge state, and the **deploy tag** all move while a session reads and
prepares. `gh pr view` at the start of a pass is a snapshot, not a fact.

**How to apply:** immediately before handing over any PR play sheet, re-run `gh pr view <n> --json state`
and `git tag -l 'prod/*' --sort=-creatordate | head -1` in the **same compound** as posting it. If the PR
merged, drop the localhost framing and point at prod instead. Check `docs/DEPLOY-LOG.md` for a same-day
entry before announcing a deploy gap — the tag can appear mid-session, which turns "28 commits undeployed,
say the word" into a stale claim. Related: [[deploys-are-mine-to-run]], [[pr-items-need-their-own-server]].
