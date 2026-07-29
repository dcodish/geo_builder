# PLAY QUEUE — what is waiting for the operator to try

Work that is **built, gated and PR'd, but not yet played**. The workflow's merge gate is *operator plays + approves* ([docs/22 §4](22-workflow.md)), so a PR sitting here is not finished work — it is work waiting on a human.

Utterances are **one per line, copy-paste ready**: type each line into the app's input in the order given. Nothing else is on the line, so a whole block can be pasted step by step without editing.

Start the app with `npm run dev` and open **`http://localhost:5173/3d.html`** for the 3-D builder (dev serves at the ROOT, not `/3d-builder/`).

---

## PRs #406 · #409 · #410 — the 2026-07-29 afternoon batch (2-D)

Built on the work PC (remote session); the operator plays from the HOME PC. **One checkout plays all three** — the combined branch also carries the concurrent session's midsegment fix (ADR-411/412/413):

```
git fetch origin
git checkout play/2026-07-29b
npm run dev
```

Open **http://localhost:5173/** (no `npm install` needed — no dependency changed).

### A. PR #406 (#402, ADR-408) — «ישר GFH» with a new letter CREATES the point

```
טרפז ABCD
EF קטע אמצעים
DB
AC
G על המשך AB
ישר GFH
GH מקביל ל AD
```

«ישר GFH» must create H beyond F on line GF **instantly** (before: «H is not defined», slowly — the #403 half is already on `main`). The last step drives the ∥ and shows a KNOWN amber (#404, pre-existing: the trapezoid morphs to a parallelogram instead of sliding G — deliberately visible, its fix is queued).

### B. PR #409 (#362, ADR-409) — membership mints the circle it presupposes

On an EMPTY figure:

```
A ו-C נמצאות על המעגל
M מחוץ למעגל
```

A circle appears with A, C riding it and M outside — no LLM spinner. Also worth a try fresh:

```
M ו-N בתוך המעגל
```

### C. PR #410 (#217, ADR-410) — the VALUES PANEL

```
ריבוע ABCD
AB = 4
AC
```

Press **חשב ערכים** (next to «הצג קשרים»): AB = 4 under **נתון**; other sides + 90° corners under **נגזר**; **AC = 4√2 with a real radical bar** (MathML); שטח ABCD = 16. Click a row → it highlights on the canvas. Then fresh:

```
מעגל O שרדיוסו 3
```

→ radius 3 (נתון) + **שטח (O) = 9π**. Then the honesty case — fresh:

```
משולש ABC
D אמצע BC
משולש ABD
משולש ACD
```

→ **no numeric rows at all** (nothing is fixed), but **יחסי שטחים** shows the median's equal halves (S · S, with ABC = 2S).

### Decisions waiting besides the play

- **PR #411 is an ACCIDENT candidate** — it is the play branch itself as a PR (title auto-filled). Close it unless you deliberately want an all-at-once merge; #406/#409/#410 are the reviewable units.
- After merging: the **next deploy batch** holds #383 (3-D trace fix), #365 (fold prefix reuse), #403 (instant refusals), the midsegment fix, and whatever merges from the play.

## Housekeeping

Several stale worktrees from merged branches are still on the **home machine** under
`%TEMP%\claude\geo-wt\` (`feat-305`, `feat-307`, `feat-313`, `feat-349`, `feat-351`,
`feat-353`, `try-306-307`). They are outside the repo and outside Dropbox by design, so they cost
nothing but disk — `git worktree remove` + `git worktree prune` when you want them gone.
