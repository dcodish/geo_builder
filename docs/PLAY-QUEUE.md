# PLAY QUEUE — what is waiting for the operator to try

Work that is **built, gated and PR'd, but not yet played**. The workflow's merge gate is *operator plays + approves* ([docs/22 §4](22-workflow.md)), so a PR sitting here is not finished work — it is work waiting on a human.

Utterances are **one per line, copy-paste ready**: type each line into the app's input in the order given. Nothing else is on the line, so a whole block can be pasted step by step without editing.

Start the app with `npm run dev` and open **`http://localhost:5173/3d.html`** for the 3-D builder (dev serves at the ROOT, not `/3d-builder/`).

---

## PR #399 — the magnitude bundle (#393 + #335, ADR-3D-107) · PR #400 — the panel bundle (#384/#395–#398, ADR-3D-108)

Both built 2026-07-29 (operator-commissioned fix session). **One checkout plays both**: branch `play/2026-07-29` merges the two PR branches over `main` (which also carries the #389 מעויין fix). The full copy-paste scripts live in the session's handoff message; highlights:

```
תיבה ABCDA'B'C'D'
נסמן: AB=u, AD=v, AA'=w
|u|=|v|=1
```

```
מקבילון ABCDEFGH
נסמן: AB=u, AD=v, AE=w
|w+u|=|w-u|
```

```
פירמידה משולשת ABCD
המרחק בין D למישור ABC הוא 6
```
(→ dashed height witness + knee + `d(D, ABC) = 6` panel row; the plane's fact-row button now cycles מישור מלא ← פאה בלבד ← מוסתר; the query «המרחק בין D למישור ABC» renders RTL with the plane name un-arrowed.)

Note: `main` is AHEAD of prod — `prod/2026-07-28-3` predates S3+S5, #389, and both bundles. A deployment session follows the play.

---

## Housekeeping

Several stale worktrees from merged branches are still on the **home machine** under
`%TEMP%\claude\geo-wt\` (`feat-305`, `feat-307`, `feat-313`, `feat-349`, `feat-351`,
`feat-353`, `try-306-307`). They are outside the repo and outside Dropbox by design, so they cost
nothing but disk — `git worktree remove` + `git worktree prune` when you want them gone.
