# Reported scenarios — regression record

A human-readable index of the **real figures** the operator has built while testing, each
captured the moment a bug was found. Every entry is replayed automatically, end-to-end
(parse-with-context → fact list → replay, exactly as the app does), by
[`src/__tests__/scenarios.test.ts`](../src/__tests__/scenarios.test.ts) — so "what used to
work still does" is checked on every change, at the level you actually use the app.

This complements the per-fix unit tests: those assert at the parser/engine level; these
replay the **exact utterance sequences** and so catch pipeline-level regressions (parser
context threading, rule ordering, the store replay/grouping) the unit tests don't exercise.

> **Standing rule (see [../CLAUDE.md](../CLAUDE.md)):** when the operator reports a bug and
> it's diagnosed from `logs/debug-log.jsonl`, the fix is not done until the exact sequence is
> added here and to the test file. A reported bug → a permanent end-to-end scenario.

**How a step is recorded:** a deterministic utterance is stored verbatim (it's re-parsed with
the live figure as context). A step that goes through the LLM is stored as the *canonical
commands* it produced (from the log), since the LLM is mocked in tests.

---

## Scenarios

### `alpha-less-than-beta-reshapes` — "α<β" actively reshapes the figure
**Steps**
1. `triangle ABC`
2. `BD תיכון לצלע AC`
3. `E על BC`
4. `AE ו BD נחתכים בנקודה P`
5. `BP=3PD`
6. `AB=k`
7. `∠BAP=α`
8. `∠ABP=β`
9. `α<β`
10. `AE⊥BD`

**Guards against:** an ordering between two named measures (`α<β`) was unparsed (it escalated to
the LLM, which gave up); and even understood, an inequality has no dedicated carrier, so the joint
solver ignored it and the figure kept a misleading ∠BAP > ∠ABP that "show another configuration"
rarely escaped (≈3.6 % of seeds). ADR-039.
**Asserts:** the givens still hold (`|BP|=3|PD|`, `AE⊥BD`) **and** the assumption is now true and
visible on the figure — ∠BAP strictly < ∠ABP with a clear gap.

### `median-ratio-drives-E` — a ratio on a derived point slides the DOF behind it
**Steps**
1. `משולש ABC`
2. `BD תיכון לצלע AC`
3. `E על BC`
4. `AE ו-BD נחתכים בנקודה P` *(operator typo "נחכתכים" → LLM → `P = AE∩BD`)*
5. `BP=3PD`

**Guards against:** a ratio constraint on a derived point (P = AE∩BD) recruited the triangle's
vertices but the joint solver dropped the on-segment DOF (E) that actually moves P — mixed
free + parametric carriers were routed to the free-vertex-only solver → "over-constrained."
**Asserts:** `|BP| = 3·|PD|` (E slid so P lands at the 3:1 point on BD).

### `tangent-chord-bisector` — cyclic quad + two coupled constraints
**Steps**
1. `ABCD חסום במעגל`
2. `AC` *(→ segment AC)*
3. `BD` *(→ segment BD)*
4. `F חיתוך AC ו-BD`
5. `המשיק בנקודה C חותך את המשך AB בנקודה E`
6. `AB=CB`
7. `AC חוצה את הזווית ECD`

**Guards against:** the coupled givens (`AB=CB` *and* the bisector) driving one cyclic vertex
onto another / into a crossed quad; `AC bisects ∠ECD` being unparsed and silently dropped;
`חותך` (cuts) not being an intersection keyword (it clobbered A,B by naming the tangent).
**Asserts:** `AB=CB`, `∠ECA=∠ACD` (AC bisects ∠ECD), and the quad stays convex.

### `bagrut-4d` — cyclic quad, diameter, ⟂ foot on an extension, inscribed angle
**Steps**
1. `ABCD בר חסימה במעגל`
2. `AD קוטר במעגל ABCD`
3. `F על המשך CB כך ש FB⊥FA`
4. `∠BDA=24`

**Guards against:** the angle step scrambling the quad / breaking the diameter; F snapping
from the CB-extension onto segment CB.
**Asserts:** AD still a diameter (A,D antipodal about O), `∠BDA=24°`, `∠ABD=90°` (Thales),
F on the continuation of CB (t>1), `∠AFB=90°`.

### `inscribed-vs-cyclic` — inscribed draws the circle, cyclic hides it
**Steps:** `ABCD חסום במעגל`
**Guards against:** the bare form (no "מרובע") escalating to the LLM and collapsing to the
cyclic/hidden form; the inscribed quad being crossed (golden-angle spread).
**Asserts:** circle is drawn (not hidden), quad convex.

### `cyclic-quad-hidden` — concyclic convex quad, circle not drawn
**Steps:** `ABCD בר חסימה`
**Asserts:** circle hidden, opposite angles sum to 180°, quad convex.

### `named-perpendicular-through-point` — a named perpendicular keeps its endpoints
**Steps:** `ישר AB` *(→ segment AB)*, `נקודה C על AB`, `DE אנך לAB בנקודה C`.
**Guards against:** the parser not handling "DE ⟂ AB at C" → it escalated, and the LLM rewrote it to
an UNNAMED "line through C ⟂ AB", **dropping D and E**. The parser now handles it deterministically
(through-point via "בנקודה / at", leading line name "DE").
**Asserts:** the perpendicular line through C exists, D and E are created ON it (CD ⟂ AB, CE ⟂ AB)
and are distinct (straddle the foot C).

### `quad-diagonals-resample` — "show another configuration" keeps a quad clean & convex
**Steps:** `מרובע ABCD`, `AC=10`, `DB=10`, then press "show another configuration" repeatedly.
**Guards against:** the sampler landing on a self-crossing (tangled) **or** concave (dart) ABCD quad —
both evaluate fine (no coincident points) but neither is a valid *drawing* of the shape. (Exercises
seed > 0, which the seed-0 scenario runner can't reach — replayed through the real store + `resample()`.)
**Asserts:** every resampled configuration keeps the polygon **convex** (`polygonsConvex`) and the
diagonals still hold (|AC| = |BD| = 10).
