# Manual verification — deferred-backlog batch (2026-06-15)

A hands-on checklist for the five changes shipped in the "deferred backlog" batch
(commits `988aa58`…`8f452e0`, docs `3025f4a`). Everything is **automatically tested**
(891 green); this is the *human* pass — what to type and what you should see on the canvas.

> **Setup:** `npm install` (if a fresh machine), then `npm run dev` and open the local URL.
> Default UI is Hebrew/RTL — each check gives a Hebrew **and** English phrasing; either works.
> Use **Clear all** (מחק הכל) between checks unless a check says to keep building.
> If something looks off, the dev server writes every input + figure snapshot to
> `logs/debug-log.jsonl` — read the last `figure` line to reconstruct the exact state.

---

## (a) Distance/equal/angle givens now DRAW their segments — FR-IN-7 extension

A length/equality/angle fact used to constrain invisibly; now it also draws the segment(s) it names
(idempotent — no duplicate on a segment that's already there).

| # | Type this (En) | …or (He) | You should see |
|---|---|---|---|
| a1 | `square ABCD` then `AC = 10` | `ריבוע ABCD` ואז `AC = 10` | The **diagonal AC appears** (it wasn't drawn before) and the square **resizes** so the diagonal is 10 (side ≈ 7.07). |
| a2 | `quadrilateral ABCD` then `AC = BD` | `מרובע ABCD` ואז `AC = BD` | **Both diagonals AC and BD appear** and the figure adjusts so they're equal length. |
| a3 | `point A at (0,0)`, `point B at (4,0)`, `point C at (4,3)`, then `angle ABC = 90` | …ואז `זווית ABC = 90` | **Two arms BA and BC are drawn** at vertex B, with a **right-angle mark** (FR-RN-7). |

**Edge check (idempotent):** on a `triangle ABC`, type `AB = AC`. AB and AC are already edges, so
**nothing new is drawn** (no doubled lines) — the triangle just reshapes to make them equal.

**Deliberate non-behaviour:** a *symbolic* measure does **not** auto-draw. `AB = 3x` shows the `3x`
label but draws no segment (it flows through the variable pipeline). This is intentional.

---

## (b) Explicit MERGE command — fold two points into one (FR-HS-8)

`rename` refuses to relabel onto a letter already in use (it won't silently merge). `merge` is the
explicit fold: the **target survives**, the source is absorbed.

**Build this first:**
1. `square ABCD` / `ריבוע ABCD`
2. `point E on AB at 30%` / `נקודה E על AB ב-30%`
3. `point F on AB at 70%` / `נקודה F על AB ב-70%`
4. `segment CF` / `קטע CF`  ← a segment that touches F

| # | Type this | You should see |
|---|---|---|
| b1 | `merge F into E` / `מזג F ל-E` | **F disappears.** The `segment CF` is now **C→E** (it followed the fold). The fact list loses F's "point F on AB" row. The figure replays with **no error**. |
| b2 | press **Undo** (בטל) | Everything comes back in **one step** — F returns, the segment is CF again. |

**Refusal checks (you should get a small amber note, no change to the figure):**
- `merge D into A` / `מזג D ל-A` → *"D is a shape vertex and can't be folded"* (a square corner has no standalone definition).
- `merge E into Z` / `מזג E ל-Z` → *"There's no point Z to merge into…"* (merging into a **new** letter is a rename, not a merge).

---

## (c) "Show another configuration" now slides a free on-line marker — ADR-036 A2

A tangent named by two points creates markers C/D on it. Until a constraint claims them, they're free —
and re-sampling now moves them.

**Build this (pinning O and A so the markers are the main thing moving):**
1. `point O at (0,0)` / `נקודה O ב-(0,0)`
2. `circle centered at O radius 5` / `מעגל סביב O רדיוס 5`
3. `point A at (5,0)` / `נקודה A ב-(5,0)`
4. `line CD tangent to circle O at A` / `הישר CD משיק למעגל O בנקודה A`

| # | Action | You should see |
|---|---|---|
| c1 | — | A circle, a **vertical tangent line at A**, with **C above and D below** A (straddling it). |
| c2 | press **Show another configuration** (הצג תצורה אחרת) a few times | **C and D slide along the tangent** to different distances from A each press (they stay on opposite sides — the segment CD keeps spanning A). Deterministic: the same number of presses gives the same picture. |

> If you didn't pin O/A, resampling also moves the circle/tangency point — that's fine, just busier;
> the thing to watch is that C and D's distances from the tangency point change.

---

## (d) Named perpendicular / parallel lines now create a far-end marker — ADR-036 A3

Previously only a *tangent* named by two points made markers. Now a drawn perpendicular/parallel line
named with an extra letter marks that point on it.

**Build this first:**
1. `point A at (0,0)`, `point B at (6,0)` / `נקודה A ב-(0,0)`, `נקודה B ב-(6,0)`
2. `point P on AB at 50%` / `נקודה P על AB ב-50%`

| # | Type this | You should see |
|---|---|---|
| d1 | `line PQ through P perpendicular to AB` / `הישר PQ דרך P מאונך ל-AB` | A **perpendicular line through P**, with a **point Q marked on it** (above P). Q is now referenceable. |
| d2 | (keep going) `segment AQ` / `קטע AQ` | A segment from A to Q draws — proving **Q exists** as a real point. |
| d3 | control: `line through P perpendicular to AB` (no "PQ") | The perpendicular draws but **no extra marker** appears (naming is what creates it). |

Same works for **parallel**: `line PQ through P parallel to AB` / `הישר PQ דרך P מקביל ל-AB`.
The **angle-bisector** named by a point (`AD bisects angle BAC` / `AD חוצה את הזווית BAC`) already
worked before this batch — it places D via its own path; unchanged.

---

## (e) "Degrees of freedom remaining" cue + driven-DOF pruning — ADR-018 Stages 2 & 3 (FR-ALT-4)

A live read-out beside **Show another configuration** of how much freedom the figure still has, shrinking
to "fully determined" as you pin it down.

| # | Type this (cumulative — don't clear) | The cue should read |
|---|---|---|
| e1 | `square ABCD` / `ריבוע ABCD` | **Degrees of freedom: 4** (blue) — the square can still be placed/rotated/sized (A,B free). |
| e2 | `point A at (0,0)` / `נקודה A ב-(0,0)` | **Degrees of freedom: 2** (one vertex pinned). |
| e3 | `point B at (6,0)` / `נקודה B ב-(6,0)` | **✓ Fully determined** (green) — a single rigid drawing. |

**Stage-2 pruning check (a constraint consumes a DOF):**
1. Clear, then `parallelogram ABCD` / `מקבילית ABCD` → cue **Degrees of freedom: 6** (A,B,C free).
2. `diagonal AC` / `אלכסון AC` → still **6** (a segment adds no freedom).
3. `AB = AC` / (equal sides+diagonal) → the count **drops to 4** — the constraint drove one free vertex,
   so it no longer counts as free.

> Note on the count: a *lone* square reads **4**, not 0, because its position/rotation/size are still
> free (only its *shape* is fixed). It reaches **0** once you pin two vertices. If you'd prefer the cue to
> mean "shape determined" regardless of placement, that's a one-line counting change — flag it.

---

## Quick regression sanity (should all still work)

- A real corpus figure, e.g. Q1: `מקבילית ABCD`, `אלכסון AC`, `נקודה E על AC ב-45%`, `קטע BE`, `קטע BD` — builds cleanly.
- `α<β` on the Q5 median figure still reshapes (∠BAP < ∠ABP) — the last batch's headline.
- Undo/redo, language toggle, save/copy PNG, edit-a-fact (✎), include/exclude (checkbox) all behave.

If every box above matches, the batch is verified. Anything that doesn't — note the exact utterance and
what you saw; `logs/debug-log.jsonl` will have the reproducible state.
