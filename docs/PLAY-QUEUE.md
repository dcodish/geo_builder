# PLAY QUEUE — what is waiting for the operator to try

Work that is **built, gated and PR'd, but not yet played**. The workflow's merge gate is *operator plays + approves* ([docs/22 §4](22-workflow.md)), so a PR sitting here is not finished work — it is work waiting on a human.

Utterances are **one per line, copy-paste ready**: type each line into the app's input in the order given. Nothing else is on the line, so a whole block can be pasted step by step without editing.

Start the app with `npm run dev` and open **`http://localhost:5173/3d.html`** for the 3-D builder (dev serves at the ROOT, not `/3d-builder/`).

---

**The queue is EMPTY** (2026-07-29). PRs #390 (S3 — plane relations) and #391 (S5 — distances) were played on the work PC — all 13 tests passed — and merged; the relations program (#378) is fully on `main`. Play findings were filed as #395/#396/#397/#398 + a #384 widening (triage-first; none built yet).

Note: `main` is AHEAD of prod — `prod/2026-07-28-3` predates S3+S5. Deploying is an operator call.

---

## Housekeeping

Several stale worktrees from merged branches are still on the **home machine** under
`%TEMP%\claude\geo-wt\` (`feat-305`, `feat-307`, `feat-313`, `feat-349`, `feat-351`,
`feat-353`, `try-306-307`). They are outside the repo and outside Dropbox by design, so they cost
nothing but disk — `git worktree remove` + `git worktree prune` when you want them gone.
