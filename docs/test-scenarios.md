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

### `secant-from-external-point` — a line from outside the circle cutting it at A, B
**Steps:** `נתון מעגל O שרדיוסו R`, `מנקודה E מחוץ למעגל מעבירים ישר שחותך את המעגל בנקודות A ו- B`.
**Guards against:** no "secant from an external point" construct → it escalated, and the LLM decomposed
it into "E על המשך OA" — referencing A before it exists (a circular definition, `unresolved
dependencies for E`). A deterministic rule now builds A,B on the circle (a chord) + E on the
extension, collinear and outside.
**Asserts:** A,B on the circle (equal radii); E outside (|OE| > radius); E,A,B collinear (a straight secant).

### `two-tangents-from-external-point` — both tangents from a point outside the circle
**Steps:** `circle O radius 5`, `from point E outside circle O two tangents touch the circle at A and B`.
**Guards against:** only "tangent AT a point on the circle" existed; tangents FROM an external point
were unsupported and half-parsed to a single wrong tangent. Built via the Thales circle on OE
(A,B = circle O ∩ circle-on-diameter-OE).
**Asserts:** A,B on the circle; E outside; EA⟂OA and EB⟂OB (true tangents); |EA|=|EB|.

### `single-tangent-from-external-point` — one tangent from an external point
**Steps:** `מעגל סביב O רדיוס 5`, `מנקודה E מחוץ למעגל יוצא חותך למעגל בנקודות A ו B`, `ED משיק למעגל`.
**Guards against:** a SINGLE tangent from an external point being unsupported — the LLM dropped
"ED משיק למעגל" and turned "מנקודה E … משיק" into a circle-through that redefined circle-O. The
existing external E is now the apex and D the computed touch point.
**Asserts:** D on the circle; ED ⟂ OD (a true tangent).

### `two-secants-from-same-point` — two secants sharing one external point
**Steps:** `circle O radius 5`, `from a point E outside circle O a line cuts the circle at A and B`,
`from E a line cuts the circle at C and D`.
**Guards against:** a second secant from E re-placing/over-constraining E (it moved inside the circle).
The 2nd secant reuses the existing E (line E–C + the other intersection D), no constraint, so E stays put.
**Asserts:** all four points on the circle; E stays outside; both secants collinear through E.

### `named-perpendicular-through-point` — a named perpendicular keeps its endpoints
**Steps:** `ישר AB` *(→ segment AB)*, `נקודה C על AB`, `DE אנך לAB בנקודה C`.
**Guards against:** the parser not handling "DE ⟂ AB at C" → it escalated, and the LLM rewrote it to
an UNNAMED "line through C ⟂ AB", **dropping D and E**. The parser now handles it deterministically
(through-point via "בנקודה / at", leading line name "DE").
**Asserts:** the perpendicular line through C exists, D and E are created ON it (CD ⟂ AB, CE ⟂ AB)
and are distinct (straddle the foot C).

### `named-perp-bisector-of-existing-segment` — "CD is the ⊥-bisector of AB" constrains, doesn't redefine
**Steps:** `ישר AB` *(→ segment AB)*, `ישר CD` *(→ segment CD)*, `CD אנך אמצעי ל AB`.
**Guards against:** the perp-bisector rule (a) bisecting the leading NAME "CD" instead of the segment
after the connector ("ל AB"), dropping AB; and (b) re-creating C,D as markers when they already exist →
"'D' is already defined". It now reads AB as the bisected segment, and — since CD exists — *constrains*
it (|CA|=|CB|, |DA|=|DB|) so the existing line becomes the ⊥-bisector. (If C,D did NOT exist it would
instead construct the bisector and name it CD with markers.)
**Asserts:** no over-constraint; C and D each equidistant from A and B (⇒ CD is the ⊥-bisector of AB).

### `existing-segment-perpendicular-cuts-at-new-point` — a loose CD becomes a clean ⟂ cross at a new E
**Steps:** `AB` *(→ segment AB)*, `CD` *(→ segment CD)*, `CD אנך ל AB וחותך אותו בנקודה E`.
**Guards against:** the NAME (CD) already exists and the cut-point (E) is new. Originally the rule
anchored the perpendicular on the not-yet-made E (`unresolved dependencies`) and re-created C,D
(`already defined`); a constraint-only fix made CD ⟂ AB but the segments did **not** visually cross
(E floated off both). The construct path now **repositions** the loose C,D onto the perpendicular
through E (E created on AB, C,D straddling it — an `on-line` marker may replace a loose free point).
**Asserts:** no error; CD ⟂ AB; E lies **on** segment AB **and between** C and D (a real centred cross).

### `perpendicular-cuts-at-existing-point` — a perpendicular through an EXISTING point, no redefinition
**Steps:** `ישר AB` *(→ segment AB)*, `C על AB`, `ישר ED אנך לAB וחותך אותו בנקודה C`.
**Guards against:** the "cuts / חותך" keyword making the generic line∩line rule *stop* (it can't read it),
aborting the parse to the LLM, which then modelled the foot as "C על ED" — **redefining C** (already on AB)
→ "'C' is already defined" over-constraint. The perpendicular-line rule now runs before line∩line and reads
"בנקודה C" as the through-point, so C is reused.
**Asserts:** no over-constraint; ED ⟂ AB through C (CD ⟂ AB, CE ⟂ AB); C stays on AB (0 < t < 1).

### `quad-diagonals-resample` — "show another configuration" keeps a quad clean & convex
**Steps:** `מרובע ABCD`, `AC=10`, `DB=10`, then press "show another configuration" repeatedly.
**Guards against:** the sampler landing on a self-crossing (tangled) **or** concave (dart) ABCD quad —
both evaluate fine (no coincident points) but neither is a valid *drawing* of the shape. (Exercises
seed > 0, which the seed-0 scenario runner can't reach — replayed through the real store + `resample()`.)
**Asserts:** every resampled configuration keeps the polygon **convex** (`polygonsConvex`) and the
diagonals still hold (|AC| = |BD| = 10).

### `two-circles-show-another` — two intersecting circles, "show another" never collides A onto B
**Steps:** `שני מעגלים נחתכים בנקודות A ו- B`, then press "show another configuration" repeatedly.
**Guards against:** an intermittent "cannot construct B" error. A and B are the SAME circle∩circle at
branches 0 and 1 — both already drawn — so the button cycled A's branch onto B's (n=2, 0→1), making
A≡B and failing the second crossing. `cyclableBranch` now reports no unshown branch, so the button
only resamples the circle centres. Also asserts the opener draws **no chord AB** and gives the two
circles **distinct radii** (5 and 3.6) so they read as two different circles, not a symmetric lens.
**Asserts:** `branchId` is undefined (nothing cyclable); every press evaluates OK and keeps A, B distinct.

### `two-circles-then-secant-from-A` — LLM fallback re-parses its steps WITH the figure context
**Steps:** `שני מעגלים נחתכים בנקודות A ו- B`, `C על מעגל P`, `מנקודה A ישר חותך את המעגל O בנקודות C ו-D`
(steps 2–3 are the LLM's canonical lines the log recorded, parsed here with context exactly as `llmParse` does).
**Guards against:** the LLM fallback re-parsing its canonical steps with **no figure context**, so
"from A a line cuts circle O at C and D" fell to the "first secant" branch (needs an "outside" cue)
and was **dropped** — "the next command failed". `llmParse` now threads the figure context (and
accumulates ids across steps) into each re-parse, so the secant-from-an-existing-point branch fires.
**Asserts:** all steps OK; D is placed and lies on the left circle O (|OD| = radius of O).

### `two-circles-secant-web` — two secants from existing points stay valid across every "other view"
**Steps:** `שני מעגלים נחתכים בנקודות A ו- B`, `C על מעגל P`, `מנקודה A ישר חותך את המעגל O בנקודות C ו-D`,
`segment CD`, `מנקודה C ישר חותך את המעגל O בנקודות B ו-E` (steps 2–5 are the LLM canonical lines, parsed with
context as `llmParse` does), then "show another configuration" 8×.
**Guards against:** (1) the secant rule re-placing an existing crossing (C) onto circle O — pinning C to BOTH
circles so it collapsed to the intersection; (2) the new crossing D/E using a fixed `line-circle` branch index
whose root order flips as the line turns, so under resampling D/E intermittently collapsed onto A/B ("would be
at the same point"). ADR-040: an existing crossing is a direction point (never re-placed), and the new crossing
is "the OTHER crossing" (the root not coinciding with a placed point, `avoid`).
**Asserts:** canonical + 8 resampled views all evaluate OK; C stays on the right circle P (not on O); D and E
lie on the left circle O and stay distinct from A and B on every view.

### `circumcircle-of-existing-points` — circumscribed circle of a triangle whose vertices already exist
**Steps:** `משולש CDE`, `A על CD`, `B על CE`, `משולש ABC`, `מעגל חוסם את ABC` (the last is the LLM canonical
line for "מעגל חוסם את משולש ABC", re-parsed with context as `llmParse` does).
**Guards against:** `"'A' is already defined — it can't be redefined as something different"`. The
`circumcircle` command reuses-or-creates its three points exactly like a shape/segment, but it was missing
from `commandConflict`'s `isShape` allow-list — and that gate runs `applyCommand` against an EMPTY
construction, so it saw A,B,C as fresh free-points and (since A,B already existed as on-segment points)
flagged a false redefinition conflict, dropping the circle. Fixed by adding `circumcircle` to `isShape`.
**Asserts:** all steps OK (no redefinition over-constraint); O is the circumcentre — |OA| = |OB| = |OC|.

### `point-on-arc-no-midpoint-word` — "F על קשת BC" (point ON arc, no "midpoint") builds, not dropped
**Steps:** `משולש CDE`, `A על CD`, `B על CE`, `מרובע ABED חסום במעגל` (circle-O), `משולש ABC חסום במעגל`
(circle-P), `F על קשת BC`.
**Guards against:** the arc rule requiring the word midpoint/אמצע — so "F על קשת BC" (a point ON arc BC)
matched no rule, escalated, and was **dropped** ("error"); a retry fell to plain `point-on-circle` and put F
generically on the wrong circle O (near E–D). The rule now also accepts on/על and resolves (by membership)
to the circle holding **both** B and C (P). (F sits at the arc's midpoint; a freely-sliding on-arc point is a
future refinement.)
**Asserts:** all steps OK (parses deterministically, no LLM); F is on circle P; F is equidistant from B and C (on arc BC).

### `arc-resolves-to-circle-holding-both-endpoints` — "arc BC" picks the circle that contains B and C
**Steps:** `משולש CDE`, `A על CD`, `B על CE`, `מרובע ABED חסום במעגל` (circle-O), `משולש ABC חסום במעגל`
(circle-P), `F אמצע הקשת BC במעגל O` (the LLM canonical line, with the WRONG circle O).
**Guards against:** the arc-midpoint of BC landing on circle O — but C is not on O (only on P), so F sat in a
meaningless spot ("placement of F is wrong"). The parser now carries point→circle membership
(`ParseContext.circleMembers`, from the engine's `circleMembers`), so the arc rule resolves to the circle
holding **both** endpoints (P) — overriding a wrong named circle even on the LLM re-parse path.
**Asserts:** all steps OK; |PF| = radius of P (F on circle P); F is NOT on circle O.

### `second-inscribed-circle-fresh-centre` — a 2nd inscribed circle doesn't collide on centre O
**Steps:** `משולש CDE`, `A על CD`, `B על CE`, `מרובע ABED חסום במעגל` (1st circle → centre O), `משולש ABC חסום במעגל`.
**Guards against:** `"'O' is already defined"`. The inscribed/circumcircle centre auto-picker only dodged the
**vertex** letters, not points already in the figure, so the second circle re-picked `O`. The picker now also
avoids `ctx.points`, so the second circle gets a fresh centre (P).
**Asserts:** all steps OK; two distinct centres O, P exist; triangle ABC's three vertices lie on the 2nd circle (centre P).

### `cyclic-quad-existing-vertices` — inscribing a quad whose 4 vertices already exist (ADR-041)
**Steps:** `משולש CED`, `A על CD`, `B על CE`, `מרובע ABDE בר חסימה` (the last is the LLM canonical line for
"מרובע ABDE חסום במעגל", re-parsed with context).
**Guards against:** the quad re-placing A, B, D, E as **fresh on-circle points** — detaching A from segment
CD and B from CE. The new `concyclic` constraint instead draws/hides the circumcircle through three of them
and drives a free DOF (A's slide on CD) until all four share the circle.
**Asserts:** all steps OK; A stays collinear on C–D (not re-pinned); all four equidistant from the circumcentre O.

### `circle-through-four-existing-points` — "circle through A B E D" makes the 4th concyclic, not dropped
**Steps:** `משולש CED`, `A על CD`, `B על CE`, `circle through A B E D` (the LLM canonical line for "מעגל ABED").
**Guards against:** the `circumcircle` rule reading only the first **three** of four labels — so the circle
passed through A, B, E but missed D. It now draws the circumcircle of three and adds a `concyclic` constraint
over all four (ADR-041).
**Asserts:** all steps OK; D lies on the circle too (all four equidistant from O).
