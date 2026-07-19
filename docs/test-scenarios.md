# Reported scenarios — regression record

A human-readable index of the **real figures** the operator has built while testing, each
captured the moment a bug was found. Every entry is replayed automatically, end-to-end
(parse-with-context → fact list → replay, exactly as the app does), by
[`src/__tests__/scenarios-corpus.ts`](../src/__tests__/scenarios-corpus.ts) (run by the sharded `scenarios-e2e-*.test.ts` slices — ADR-280 / issue #60) — so "what used to
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

### `q27-eo-diameter-new-circle` — «EO קוטר» builds the NEW Thales circle on EO, not an impossible diameter of circle O (#152, ADR-366)
Operator session `qx5a19co` (bagrut Q27): «EO קוטר» — where O is circle O's own centre — was attached to circle O (`point-on-circle O`, impossible) and deferred; «EO קוטר במעגל חדש» no-op'ed. The endpoint-is-centre impossibility now routes the statement to `circleOnDiameter` (new circle, centre = auto-named midpoint of EO); «במעגל חדש» is an explicit create signal; ordinary diameter/chord attachments byte-unchanged. Unit locks in `endpoint-is-centre-routing.test.ts`.

### `four-unnamed-semicircles-on-square` — a square with an unnamed semicircle outside on each of the 4 sides (#213, ADR-365)
Operator prod repro 2026-07-19 (+ session `agwxxo9k`): the second UNNAMED semicircle re-picked the letter O — the picker consulted `ctx.points` only, blind to the ADR-342 anonymous centre `@ctr-O` living in `ctx.circles` — re-emitted the first's ids and refused «coincides with its constructed target». All three hand-rolled pickers (semicircle/quarter/sector) now use the shared `freeLabel([points, circles], …)` discipline; the quantified one-liner also stops dropping «מחוץ לריבוע» (bulge threads per side). Unit locks in `unnamed-centre-pickers.test.ts`.

### `definite-circles-tangent-binds-pair` — «המעגלים משיקים זה לזה» binds THE two drawn circles, never an invented third (#215 P1, ADR-363)
Operator repro 2026-07-19 (found triaging #214): with «מעגל O» + «מעגל P» drawn, the definite plural emitted an INVENTED circle-Q + `circles-tangent O↔Q` — P silently dropped, three circles rendered, all rows green. `circlesTangent` (and the whole two-circle family) now resolves its pair at the shared `resolveCirclePair` chokepoint: bind at exactly 2 existing, complete the pair at 1 (letter-independent), introduce at 0, DEFER at 3+ / half-named; a from-marker («מנקודה») is never read as a touch. Class tests in `circle-pair-binding.test.ts`.

### `diameter-through-point-imperative` — «הוסף קוטר העובר בנקודה A»: the THROUGH phrasing + a leading imperative reach the ADR-270 diameter (#201, ADR-353)
Prod log-triage 2026-07-17 (LIVE, 1 user): the construct existed («קוטר מנקודה F», ADR-270) but the THROUGH wording fell to the LLM → not-handled. Operator ruling 2026-07-18: «קוטר ב/מנקודה A» means the diameter THROUGH A — one construct, more phrasings, widened at the rule's own from-marker (the ADR-3D-026 phrasing-class discipline): «[ה]עובר בנקודה», the bare locative «בנקודה», the stacked-prefix slip «במנקודה», «דרך [נקודה]», En "through [the point]", and a tolerated leading imperative («הוסף», "add/draw"). Class test `diameter-from-point.test.ts` (13 forms + the no-theft set); catalog +1.


### The #185 nine-parser-gap batch (prod log-triage 2026-07-17, operator-approved ALL NINE — ADR-350/ADR-351)
Eleven scenarios, one per approved row (row 2 and row 7 carry two forms each), all verbatim prod utterances:

- `polygon-noun-binds-existing-quad` — «מרובע ABCD» → «המצולע חסום במעגל»: the GENERIC polygon noun is a definite reference; the unique existing polygon supplies arity + ids (the ADR-245 pattern extended into `inscribedPolygon`'s kind ladder).
- `point-on-the-definite-line` — «קטע AB» → «נקודה G על הקו»: the ADR-029 implicit-reference pattern, line edition — with exactly one drawn segment, «הקו» is it.
- `line-with-point-creates-the-line` — «קו ועליו נקודה A» as the FIRST utterance: no segment yet → the rule creates one (auto-named endpoints, the inscribe auto-label precedent) with A riding it.
- `parallel-to-the-bases` — «EL מקביל לבסיסים» on a trapezoid: the definite BASES resolve via the ADR-169 `parallels` hint; ∥-to-one-base ≡ ∥-to-both (the bases are mutually parallel); a parallelogram defers.
- `centres-segment` — «קטע מרכזים» / «מרכז מעגלים» with two circles: the segment joining the two centre points (an anonymous ADR-342 centre becomes visible by use, FR-RN-8).
- `angle-word-number-degrees` — «זווית C שווה לשלושים מעלות»: Hebrew/English cardinals before a degree word normalise to digits at the parse boundary (compounds sum: «ארבעים וחמש» → 45); a counting word with no degree suffix («צלע אחת») is never rewritten.
- `isosceles-paren-appositive` — «ABC משולש שווה שוקיים (AB=AC)»: a parenthesized RELATION is a clause separator for the ADR-264 split; the stated pair pins the soft default (ADR-114/234); √(…) value groups never split.
- `square-with-side-in-one-line` — «ריבוע ABCD שצלעו הוא 1»: rewritten at the boundary to the appositive «ריבוע ABCD, AB = 1»; scoped to equilateral-sided shapes (a rectangle's «שצלעו» would be an unstated pick, ADR-052).
- `rectangle-two-sides-values` — «מלבן ABCD» → «צלע אחת 10 צלע שניה 5»: two ADJACENT ring edges of THE unique polygon get the values.
- `chained-angle-word-equality` — «זוית AEB שווה לזווית BEC שווה 60 מעלות»: «שווה ל» before an angle/arc reference or a degree value normalises to `=`; the ADR-343 chain distributes the value to every member. Operator ruling 2026-07-17 narrowing ADR-119: angles/arcs actionable, general segment word-equality stays out.
- `arc-word-equality` — «הקשת AE שווה לקשת DC»: the word operator feeds ADR-116's arcEquality → equal central angles.

### `chained-value-marks-every-member` — «AB=BC=8»: the chained value lands on EVERY member, both labelled 8 (#163, ADR-343)
Operator dev test 2026-07-16: "BC is marked on canvas as 8 but AB was not marked as 8." `chainedEquality` split a chain into adjacent pairwise clauses only, so the value landed on the LAST member; every earlier member lost its stated value on the figure (a docs/17 §6 display-honesty gap — the geometry itself was correct). Operator ruling 2026-07-17: «AB=BC=8 means AB=8 and BC=8». The chain's one owner now distributes a value tail to every member (lengths, angles, symbolic all inherit); the entailed `set-equal` is KEPT (ADR-234 `pinsSoftVariant` reads it; redundancy measured green through replay). Class test `chained-value.test.ts` (all four flavour rows, both locales, the pure member chain unchanged); `symbolic.test.ts` re-derived (it had enshrined the defect).

### `qx5a19co-plural-chords-conjunction` — «AB ו DC מיתרים»: BOTH chords land — all four endpoints on the circle + both segments (#151, ADR-344)
Operator session `qx5a19co` ("commands I had to work around"): the natural both-chords-at-once declaration read only the first label pair; D,C dropped → weak → LLM → not-understood → forced one chord per line. The plural carrier-membership class (ADR-076/240/`pluralSpecialLines` family): the label list now pairs sequentially, each pair one chord — all memberships + all segments, mirrored for plural diameters; intersect compounds never pair-read; odd token counts fall back byte-identically. Class test `plural-chords.test.ts` (three chords, shared endpoint dedupe, singular byte-identical, plural diameters, replay membership; both locales).

### `pxeb2ng8-count-digit-two-tangents` — «מנקודה A יוצאים 2 משיקים למעגל»: the DIGIT spelling builds like the word spelling, no LLM (#160, ADR-345)
Operator dev session `pxeb2ng8` (2026-07-16): the «שני» spelling built; the «2» spelling produced the IDENTICAL correct Thales parse and `droppedGivenNumbers` threw it away (`weak:dropped:2` → LLM → not-understood) — one word, two spellings, opposite outcomes. A COUNT quantifier is consumed by the rule's structure, not a payload; the gate now blanks count slots (bare integer + plural countable noun, He/En morphology) while ratio/size digits (פי 2, «2 times», פעמים, רדיוס 5, decimals) stay gated. This scenario locks parse+build; the gate itself (command-identity + the anti-regression set) is locked in `adr-250.test.ts`.

### `gxccyt2n-hidden-centre-never-squats-letter` — «שני מעגלים נחתכים» → «P על המשך BA»: the invisible auto centre never squats P (#177 P1, ADR-342)
Operator prod session `gxccyt2n` (2026-07-16): the auto-named hidden centre P was M1-bound by the student's «P על המשך BA» → an impossible collinearity parked "deferred" forever, the canvas asserting a claim the student never made. The ADR-297 namespace-hijack class, centre edition. Now an unnamed circle's centre POINT is anonymous (`@ctr-P`) while the LETTER stays the circle's reference token («מעגל P» unchanged); the boundary is PLACING vs REFERENCING (amended ruling): metric givens («OP=4», «OA=5») and bare segments («OP», «PA») bind-and-promote the token; placing statements create the student's fresh point. Class test `anon-centre.test.ts` (emitters, promotion strict, naming flow + converse, dot-promote, the positional negative).

### `trapezoid-stated-long-base-first-draw` — «טרפז ABCD» + «AB < CD»: the stated order flips the TEMPLATE, never a k≈1.08 boundary grind (#173 P1, ADR-341)
Operator 2026-07-16: "when I write AB<CD i get something that is a trapezoid but not nice. what I really want is a basic trapezoid with CD as the large base." One class, two symptoms: the long-base side is an unstated DISCRETE choice hard-baked twice — template k=0.6 + sampler capped below 1 (the ADR-052 smell CLAUDE.md names verbatim), so the stated order was "repaired" to the region boundary (k=1.079, a skewed near-parallelogram). Now: a pre-scan (ADR-163 M4 shape) rotates the ids by two so the template long base lands on the stated-long pair (first draw k=1/0.6≈1.667 — the mirror default), and the sampler straddles 1 when unstated / stays in the stated branch when pinned. Class test `trapezoid-long-base.test.ts` (defaults, smell gate, branch pinning, iso-trapezoid legs) — 4/6 verified red on the pre-fix tree.

### `[gxccyt2n-show-another-composite-validated]` — every "show another" view satisfies the givens (#175 P1, ADR-340) — in `scenarios-props-resample.test.ts`
Operator, prod session `gxccyt2n` (2026-07-16, two internally-tangent circles + tangents from A + the area equality): "I built this shape and it was good. When I asked for another configuration I got several errors and the diagram is broken." The button validated only the SEED, then applied `cycleAlt`/`cycleVariant` on the facts unchecked — flipping D's branch onto seed 2 broke the stated internal tangency (centres 1.04 → 1.44 apart) with «B ו-D נפלו על אותה נקודה». Now the search space is the COMPOSITE (facts × seed × branch × variant), every candidate validated whole (`searchAnotherView`), applied as one transition; `cycleAlt`/`cycleVariant` are gated the same way. The lock replays the exact 8-step sequence (LLM steps carry the logged commands), asserts 3 presses all valid, and pins the deterministic breaking pair (seed 2 + D-flip → the gated `cycleAlt` must no-op) — verified to FAIL on the pre-fix tree.

### `inscribe-square-in-right-triangle` — «ריבוע DEFG חסום במשולש ABC» in a right triangle: a genuine square in GENERAL POSITION (#166 ADR-338 + #176 ADR-339)
Operator 2026-07-16 (session `tos0z5cf`), THE reported sequence — two defects fixed on it. **ADR-338:** it used to fail «over-constrained: … GD ⟂ DE cannot hold» — the four defining constraints were applied independently, each `applyStep` moving the figure before the next attached; jointly solved, the figure builds. **ADR-339 (the play-test follow-up):** the joint solve at the parser's blind `variant: 0` landed the degenerate CORNER square (D≡A — forced *for that variant*, avoidable by the hypotenuse siblings = a DEFAULT collision per ADR-123); the default now settles to the general-position variant. Asserts: all green, a genuine square, zero coincidences, every square vertex clear of every container vertex. The corner square stays reachable by cycling — its closed-form oracle lock (`side = 1/(1/|AB|+1/|AC|)`, D≡A surfaced as a forced coincidence) lives in `inscribe-joint-solve.test.ts` at the PINNED variant.

### `inscribe-rectangle-in-right-triangle` — «מלבן DEFG חסום במשולש ABC»: the RECTANGLE macro builds too (#166)
Operator 2026-07-16 ("ensure we cover not only ריבוע but also מלבן חסום"). Same greedy-solve class, different expansion (three right angles vs rhombus+one). An inscribed rectangle is *under-determined* (free aspect ratio), so failing at all was the clearest proof the defect was the solve ORDER, not the geometry.

### `inscribe-square-in-plain-triangle-with-right-angle` — the inscribe no longer BREAKS the earlier right angle (#166 ADR-338 + #176 ADR-339)
The third row of #166's reproduction table, and the worst: «משולש ABC» + «זוית A ישרה» + inscribe used to fail «∠BAC = 90° cannot hold» — the greedy solve broke the student's OWN earlier given and then blamed it (a docs/17 §6 breach: an error must name the conflicting NEW statement). Jointly solved, the square lands AND ∠BAC = 90° still holds; the default is the general-position variant (ADR-339), never the corner degenerate.

### `inscribe-rectangle-builds-in-plain-triangle` — the baseline that must STAY green (ADR-337/338 guard)
The success branch both fixes must preserve: ADR-337 (a legitimately-succeeding macro is still promoted from its trial) and ADR-338 (coupling the constraints must not break a case the greedy path already solved).

### `arc-value-drives-central-angle` — «קשת AB = 40»: an absolute arc measure drives the central angle (ADR-335 play-gate)
Operator 2026-07-16: «arc AB = 40» as a given. Before `arcValue` this fell through to `distanceConstraint` — the arc's DEGREES committed as a chord LENGTH, the word קשת dropped, all gates quiet (the #153 family). Now: `set-angle` at the centre (arc ≡ central angle, ADR-116); no circle resolvable → 'stop' (escalate), never a length fall-through.
### `q22-arc-sum-enforced-not-truncated` — the FULL bagrut Q22: arc-sum + `S_{CFG}=S_{CGH}` force HG ⊥ AB (#153 P1 / #154)
Operator 2026-07-15/16 (sessions `qx5a19co` + `wn3axiea`; exam text supplied 2026-07-16): the arc-SUM given parsed green but `arcEquality` truncated it to the first arc of each side — the figure was constrained by ∠AOC = ∠AOD, a DIFFERENT given, every honesty gate silent. Now `measureSum` lowers the whole term list to ONE `set-measure-sum` over the central angles, and with the exam's REAL second given — the AREA equality `S_{CFG}=S_{CGH}` (the issue text had mis-transcribed it as an angle equality) — the exam theorem is FORCED: arc condition ⇒ CF=CG; area equality over collinear bases (D-F-C-H) ⇒ CF=CH; Thales converse ⇒ **HG ⊥ AB** (cos = 0.0000 measured). Both chords must carry the מיתר noun (a bare «CD חותך…» leaves D off the circle — honest per ADR-052, but «קשת AD» is then meaningless).
### `q22-arc-sum-typed-early-order-independence` — the arc-sum typed EARLY still builds (M2/ADR-104)
The compound sum entered straight after the chords (before H/HG) defers/drives the same free DOF — entry-order independence for the new constraint kind.
### `power-of-point-median-product-builds` — «4*DM*DM=BM*ME» builds the true product (#145 P1 / #144)
Operator 2026-07-15 (prod session `o90uiwwh` seq 18–35): the medians figure + 4·DM² = BM·ME. `equalSegments`' unanchored regex slid to the interior «DM=BM» and committed a WRONG `set-equal` (the coefficient-less quotient forms committed silently). Now `lengthProduct` lowers it to ONE `set-length-product` (log-domain residual) driving the free M; the relation holds exactly. («CF תיכון» after a prior median is a separate parser gap, filed.)
### `segment-sum-drives-endpoint` — «AB + CD = EF» drives a free endpoint (#154)
The additive length family: one `set-measure-sum` (coefs [1,1,−1]), never a truncated `set-equal(C,D,E,F)` dropping AB (the unreported sibling the class probe surfaced).
### `angle-sum-180-forces-parallel` — «זווית A + זווית B = 180» (single-vertex arms) forces AD ∥ BC (#154)
The additive angle family with a numeric target + ADR-164 single-vertex arm resolution; co-interior angles at 180 force AD ∥ BC on the final coordinates.
### `secant-apex-far-point-named-near` — «AD חותך למעגל בנקודה B» — apex + far crossing D, near B (issue #136, ADR-332)
Operator 2026-07-15: the secant «AD חותך למעגל» (apex A external, only the FAR crossing D named) was not-handled, and «…בנקודה B» was mis-grabbed by `lineMeetsCircle` and built NOTHING (a `line-through chord-AD` to a never-created D). The new `secantFarPoint` rule (before `lineMeetsCircle`) creates D as a free-θ on-circle far crossing and the named near crossing B via line∩circle with a one-sided order A→B→D keeping D on the far side.
### `secant-from-point-far-crossing` — «מנקודה A יוצא חותך למעגל בנקודה D» — the from-point secant phrasing (issue #136, ADR-332)
Operator 2026-07-15 (play-testing PR #137): the from-point phrasing (A the external apex from «מנקודה A», D the FAR crossing from «בנקודה D») fell through to lineLineIntersection → LLM. `secantFarPoint` gained a from-point branch, gated to a cut OF THE CIRCLE and guarded off the diameter family (so it never steals «קוטר … חותך את הצלע AC»).
### `secant-apex-far-point-bare-anon-near` — «AD חותך למעגל» bare — D far, near an anonymous @-dot (issue #136, ADR-332)
Operator 2026-07-15: bare «AD חותך למעגל» escalated to the LLM. Now D is a free-θ far crossing, the unnamed near crossing an anonymous promotable @-dot (#32/ADR-297), the secant's rotation about the external apex A a free DOF (ADR-052); A is created via `point-circle-side` outside.
### `two-tangents-from-point-distinct` — the two tangents from a point are DISTINCT (issue #142, ADR-333)
Operator 2026-07-15 (dev play-test): two separate «tangent from A» statements landed on the SAME touch point («B ו-C נפלו על אותה נקודה») — `tangentFromExternal` always emitted branch 0. Fixed: a SECOND single tangent from the same apex (its `tanaux-` circle already exists, via `ctx.tangentAuxes`) takes branch 1 = the other touch.
### `single-external-tangent-builds` — «מנקודה A יוצא משיק למעגל בנקודה B» builds (prod regression, issue #138)
Prod regression: the singular external tangent parsed OK in prod on 2026-07-11 (source:parser) but broke by 2026-07-15 (weak:dropped:משיק/tangent → LLM → built-nothing) — the ADR-292 משיק verb gate (deployed prod/2026-07-12-2) didn't recognise `tangentFromExternal`'s Thales aux-circle construction (`tanaux-`/`~tanmid-`, no literal `tangent` object). Fixed by adding `tanaux-`/`tanmid-` to the gate's satisfied set (ADR-292 Am.). This scenario locks the parse+build; the gate itself is locked by `verb-gate.test.ts`.
### `parallel-line-from-a-point` — «מנקודה A ישר מקביל ל-DO» draws a parallel line through A (issue #127, ADR-327)
Prod log-triage 2026-07-14: the "from a point" origin (`מנקודה A` / `מ-A` / `from point A`) wasn't in the drawn-line through-point anchor `THROUGH_PT`, so `מנקודה A ישר מקביל ל-DO` escalated to the paid LLM though the `parallel-line` construct already existed. Fixed by a `FROM_PT` anchor on the parallel-line rule; the `ל=` typo for `ל-` is tolerated. The perpendicular "from a point" is deliberately left to the foot rule (a shared anchor would make the ⟂ rule shadow foot phrasings).
### `bare-free-point-positioned-by-next-statement` — «נקודה A» + «AB=5» recruit a bare 2-DOF free point (issue #104, ADR-328)
Prod log-triage 2026-07-13 (~4 users): a bare `נקודה A`/`point A` was not-handled — the rebuild never re-exposed the original "free point (2 DOF)" primitive (every point arrived via a relation). Now it builds a free, sampled (ADR-052), idempotent (`ifAbsent`) point recruited by a later given; anchored so a trailing relation still goes to the relational rules, and a lone letter stays escalation.
### `diagonals-meet-noun-form` — «G נקודת מפגש האלכסונים» — the diagonal crossing by noun (issue #44, ADR-329)
Prod (~5-6 users): naming the diagonal crossing by NOUN was not-handled; only the lettered form parsed. Now resolves the context quad → two diagonals + their crossing (ADR-110 macro).

### `medians-meet-centroid-noun-form` — «M מפגש התיכונים» — the triangle centroid by noun (issue #44, ADR-329)
Operator: generalize to the four triangle centres. «M מפגש התיכונים» builds the centroid = (A+B+C)/3 (two medians + crossing); the same macro covers angle-bisectors/altitudes/⊥-bisectors.
### `semicircle-on-every-side-of-square` — «על כל צלע של ריבוע יש חצי מעגל» (issue #29, ADR-330)
Prod session p3du4l9p: the classic composite (a polygon with a semicircle on each side) was not-handled; only the single-side form parsed. The quantified form now resolves the context polygon and builds one closed-form semicircle per side (ADR-110 macro). Outward-vs-inward bulge is a documented follow-up (winding is unknown at parse time).
### `semicircle-outside-a-triangle-side` — «חצי מעגל על צלע AB מחוץ למשולש» orients the bulge outward (issue #134, ADR-331)
Operator play-test: a semicircle "outside the triangle" errored (the `משולש` leftover tripped SHAPE_LEFTOVER). Now the bulge clause is consumed and resolved to a render-time orientation (arc `bulgeRef` = the opposite vertex; renderer flips the arc so the apex is on the far side of the diameter). `בתוך` bulges inward. Also a follow-up path for #29’s every-side outward orientation.

### `q5-isosceles-incircle-sqrt3-ratio-and-area` — bagrut Q5: «AC=√(3)CO» (√() toolbar ratio) + «S_{CKE}=6» build green (issues #114/#115, ADR-310/311)
Operator prod session `qderonm3` (2026-07-13). The √3 ratio typed with the √() palette form (`AC=√(3)CO`, `AC גדול פי √(3) מ CO`) had failed deterministically and escalated to the LLM, which produced a malformed figure — so `E על CB` defaulted onto the auto-created free point K and `S_{CKE}=6` reported "cannot place E so area=6". Fixed at two roots: #114 (ratio rules use the shared `NUMEXPR` atom, so `√(3)` parses deterministically — no LLM detour) and #115 (a free on-segment rider defaults into general position, off existing points). The exact sequence now builds green; |CK|=√63 and area(CKE)=6 both hold.

### `verbose-relational-ratio-builds` — «אורך AC גדול פי k מהקטע AB» drives the ratio (issue #105, ADR-318)
Operator (bagrut Q5): the verbose relational ratio with `אורך`/`הקטע` noun prefixes escalated because the loose `segment` rule grabbed the `קטע` in `מהקטע` and dropped the factor. Fixed by the ratio RHS noun-skip + running `ratioConstraint` before `segment`; `שורש N → √N` + a verbose-length frame (`אורך X הוא √N`) added in `normalizeUtterance`; the vague unnamed-sides form gets a guided message.

### `point-between-builds-on-segment` — «E בין A ל-B» builds a free point on segment AB (issue #95, ADR-317)
Prod session `lrbdnp5v`: the BETWEEN phrasing built nothing (escalated → built-nothing). It is exactly `E על AB` — a free point-on-segment; `pointOnSegment` now recognises it (guarded against the ratio/angle/swap/area-ratio rules that also use `בין`).

### `arc-minor-midpoint-on-arc-not-chord` — «D אמצע הקשת הקטנה AB» lands on the ARC, not the chord (issue #90, ADR-316)
Operator report: the arc-magnitude qualifier `הקטנה` between `הקשת` and the labels made `arcMidpoint` fall through to the generic `midpoint` rule → D on the chord (silent wrong figure). Now the qualifier is tolerated; MAJOR selects the far arc (branch 1 / `major` flag). The engine already had both arc midpoints (antipodal).

### `q5-circle-cuts-BO-K-stays-on-segment` — «המעגל חותך את BO בנקודה K» + «CK=√63»: K stays on segment BO (issue #119, ADR-313)
Operator dev session `disb4ebn` (2026-07-13). `המעגל חותך את BO בנקודה K` (O = incircle centre, B = external vertex) placed K between B and O, then the size given `CK=√(63)` flipped it to the intersection beyond O (off the segment), silently green. Fixed by a stable within-segment SELECTION: `line-circle-intersection` gains `onSegment:[B,O]` — the root with parameter in (0,1), scale-invariant so it can't flip. A pure pick (no constraint), so unlike a driving `order` it never over-constrains a sibling co-linear crossing (the tangent/secant #3 regression the `order` attempt hit).

### `hosem-slip-container-marker-wins` — משולש ABC חוסם במעגל: the ב container marker wins over the verb letter (issues #31/#38, ADR-283)
**Steps**: `משולש ABC חוסם במעגל` · `BC קוטר`
**Guards against:** operator prod session `jsptarcl` (2026-07-11): the חוסם/חסום one-letter slip was read by the VERB alone, so the utterance silently built the INCIRCLE DUAL (bisectors, incentre, auto-named feet) with every row ✓, and `BC קוטר` then over-constrained (a triangle side can't be an incircle diameter). Fix (ADR-283): `normalizeInscriptionSlip` at the `normalizeUtterance` boundary — an active חוסם-family verb directly governing a ב-marked container noun rewrites to the passive (the ADR-245 container marker is authoritative); direct-object `חוסם את המעגל` and bare `חוסם מעגל` untouched. **Asserts:** all steps ok; one circle with A,B,C all ON it (the circumcircle); B–centre–C collinear (BC a genuine diameter); no bisector scaffolding minted.

### `semicircle-on-existing-square-side` — ריבוע → על צלע CD יש חצי מעגל → CD קוטר (issue #28, ADR-284)
**Steps**: `ריבוע` · `על צלע CD יש חצי מעגל` · `CD קוטר`
**Guards against:** operator prod sessions `p3du4l9p`/`z57b5nd0`/`fxp24nna`: the semicircle rule predated M1 + free-radius — it re-declared the square's existing C,D with PINNED θ on a hidden radius-5 circle that never reached the side (rows ✓, figure verifier-amber), and `CD קוטר` couldn't resolve the circle implicitly. Fix (ADR-284): both-endpoints-existing lowers CLOSED-FORM — centre = midpoint of CD, radius through C — zero solve, so the prior square cannot move. **Asserts:** all steps ok, no violations; centre exactly the midpoint; |centre·C| = |centre·D| = |CD|/2; the square's four sides still equal.

### `semicircle-diameter-phrasing-on-existing-side` — ריבוע → חצי מעגל שהקוטר שלו CD (issue #28, ADR-284)
**Steps**: `ריבוע` · `חצי מעגל שהקוטר שלו CD`
**Guards against:** the same sessions' possessive phrasing hit the same pinned-θ re-declaration and left the arc floating off the square. **Asserts:** all steps ok; C and D both at radius |CD|/2 from the centre.

### `ratio-radical-coefficient` — AB=√2*OD parses deterministically (issue #52, ADR-285)
**Steps**: `מעגל O` · `D על המעגל` · `AB` · `AB=√2*OD`
**Guards against:** operator prod report (2026-07-11): the radical-coefficient proportion `AB=√2*OD` was not recognized (escalated to the LLM, which failed in prod) while `AB=√2*R` and `AB/OD = √2` worked — `ratioConstraint`'s coefficient atom was plain-decimal while its `/`-form sibling was already √-aware. Fix (ADR-285): the shared radical-aware coefficient atom (RCOEF) on both `=` sides, the trailing divisor, and the Hebrew פי form. **Asserts:** all steps ok; |AB| = √2·|OD| in the built figure.

### `height-from-vertex-never-drops-onto-a-diagonal` — גובה מ A / גובה מ B in a quad with a diagonal (ADR-263)
**Steps**: `מקבילית ABCD` · `BD` · `גובה מ A` · `גובה מ B` · `BE גובה`
**Guards against:** operator report (2026-07-09): a parallelogram with the diagonal BD drawn — `גובה מ A` was understood but `גובה מ B` was refused, and `BE גובה` drew onto the diagonal BD. Root cause: the `altitude` rule's neighbour-adjacency fallback triangulated the quad ACROSS the drawn diagonal (from A → the single triangle ABD → foot on the DIAGONAL BD; from B → two triangles ABD, CBD → refused as ambiguous). Fix (ADR-263): the opposite side must be a real POLYGON EDGE not touching the apex (`oppositePolygonEdges`, which can never return a diagonal); a parallelogram/quad's several genuine heights → DRAW ONE deterministically rather than refuse (superseding ADR-169's parallelogram-defers); the auto-named foot also excludes every existing point (no F/F redefinition). **Asserts:** all steps ok; three feet with distinct labels; every foot's base is a real side of ABCD (never BD) and the height is ⟂ that side.

### `rhombus-inscribed-in-triangle` — מעוין BDEF חסום במשולש ABC (a polygon inscribed in a polygon)
**Steps**: `מעוין BDEF חסום במשולש ABC`
**Guards against:** operator request (2026-07-09): the bagrut figure "מעוין חסום במשולש" (rhombus inscribed in a triangle) had no construct — the student had to place points by hand — and worse, `מעוין חסום במשולש ABC` **silently misparsed to the triangle's incircle** (a circle), dropping the rhombus word (`isCircleInPolygon` only checked the container, not that the inscribed thing was a circle). Fix (ADR-262): a general polygon-in-polygon `inscribe` command — shared labels coincide with their container vertex, other vertices ride the sides as free on-segment points, and the shape's equal-side / right-angle constraints flex them into shape (the ADR-110 macro pattern, no new engine construct); the mirror/base-side is a cyclable variant (ADR-052/M4); `incircle` now requires a circle noun. **Asserts:** all steps ok; the container triangle + all four rhombus vertices exist; four equal sides (a genuine rhombus); D, E, F each lie ON a side of triangle ABC.

### `bisector-from-vertex-no-triple` — CD חוצה זוית (angle bisector from a vertex, triple omitted) draws a REAL bisector
**Steps**: `משולש ABC` · `AB=AC` · `CD חוצה זוית`
**Guards against:** operator report (2026-07-08): after `triangle ABC` + `AB=AC`, typing `CD חוצה זוית` drew a line but the two half-angles at C were NOT equal (a prod user also errored on this phrasing). Root cause: the deterministic parser resolved an angle bisector from a vertex only when the angle triple was spelled out (`CD חוצה זוית ACB`); with it omitted the input escalated to the LLM, which drew a bare line with no equal-angle constraint. Fix: `bisectorPlacesPoint` resolves the omitted angle from the vertex (the segment's first letter) + the figure's neighbours (the ADR-164 single-vertex resolution, gated to an explicit "angle"/"זוית" so a segment bisection never mis-fires); ambiguous vertices (≠2 edges) ask for the three letters. **Asserts:** all steps ok; D placed within segment AB; ∠ACD = ∠DCB.

### `bisector-from-vertex-in-triangle` — BD חוצה זוית במשולש ABC is not shadowed by the triangle rule
**Steps**: `משולש ABC` · `BD חוצה זוית במשולש ABC`
**Guards against:** sibling of the above (from the debug log): the `…במשולש ABC` phrasing escalated to the LLM because the `triangle` rule matched the embedded `משולש ABC`, saw the `חוצה זוית` SHAPE_LEFTOVER, and returned `'stop'`. Fixed by ordering `bisectorPlacesPoint` ahead of the shape rules (the same placement median/altitude/midsegment already use); safe there because it defers on intersect keywords. **Asserts:** all steps ok; D placed; ∠ABD = ∠DBC.

### `ntzdgqn2-kite-detection-honours-requirements` — the kite figure's forced relations survive detection sampling (ADR-256)
**Steps** (store-driven, viewRelations + detectShapes): `AB קוטר במעגל O` · `C על המעגל` · `M מחוץ למעגל` · `AM חותך את CO בנקודה K` · `E על BO` · `OK=OE` · `MK=ME` · `MO` · `AC` · `BC/EK=5/3`
**Guards against:** operator report (2026-07-08, session `ntzdgqn2`): "show equal angles" missed ∠AMO = ∠OME, and △OMK ~ △CAK was absent from the similar-triangles list — both FORCED by the givens (kite SSS ⇒ ∠KMO=∠EMO; ∠MOK = ∠COB/2 = ∠OCA + vertical angles at K ⇒ AA similarity). Root cause (ADR-256): the detection layers' ground-truth pool included samples violating the figure's own stated requirements — a seed sliding the meet's crossing K past segment CO flips ray O→K, breaking the equality in that sample only, so a relation true in every VALID config read "not forced". The pool is now gated by `requirementSamples` (onSeg meets within segments) + `extensionsClear`, the same bar as `firstSatisfyingSeed`, with a never-below-2 fallback. **Follow-up (ADR-257):** merging △ACK into the congruent pair degraded the class to "similar" and △OEM ≅ △OMK vanished — a congruent SUB-GROUP inside a mixed class is now emitted as its own `congruent` row beside the `similar` one. **Asserts:** the equal-angle classes contain the M-wedge pair (∠AMO/∠KMO with ∠EMO); the similar classes contain {A,C,K} ~ {K,M,O}; AND a `congruent` class holds {E,M,O} ≅ {K,M,O}.

### `stated-meet-relocates-loose-point` — AM חותך את CO בנקודה K with M loose: the stated meet re-seats M (ADR-255)
**Steps**: `AB קוטר` · `C על במעגל` · `M מחוץ למעגל` · `AM חותך את CO בנדוקה K` (typos as typed)
**Guards against:** operator session `gaawv4fr` (2026-07-08): with M's outside seed up-LEFT of the circle, segments AM and CO cannot cross — the figure built ✓ with K on the continuations; the verifier's amber was easy to miss and `findValidConfig` was null (seed jitter explores only a small neighbourhood of a free default, so no config could carry M across the figure). Root cause (ADR-255): a statement that constrains a free point's REGION ("these segments cross") was recorded only as a post-hoc requirement — nothing used it to place the point. Apply now re-seats a genuinely loose endpoint (non-pinned, constraint-free, fewest dependents) along the ray from its fixed mate through the other segment's midpoint, preserving its circle sides (the stated "M מחוץ למעגל" survives, ADR-254) and general position (ADR-253); constrained endpoints (ADR-166 apexes) stay with their reflection mechanism. **Asserts:** all steps ok; M strictly outside circle O; K within segment AM and within segment CO; verifier clean.

### `kite-EMKO-outside-point` — AB קוטר, M מחוץ למעגל, AM חותך את CO ב-K, E על BO, דלתון EMKO (ADR-253 + ADR-254)
**Steps**: `AB קוטר במעגל O` · `C על המעגל` · `AC` · `M מחוץ למעגל` · `AM` · `OM` · LLM: `K חיתוך AM ו-OC` (the operator's typo "AM חותף…" escalated) · `E על BO` · `OK=OE` · `MK=ME`
**Guards against:** operator report (2026-07-08, session `ad66x493`, bagrut kite question) — two coupled bugs. (1) ADR-254: "M מחוץ למעגל" was unrepresentable (LLM → not-understood), so M entered as a bare `AM` endpoint with no record it belongs outside. The side statement now parses (`point-circle-side`): a NEW id becomes a free point seeded outside in general position; the side is a verifier/`meetsRequirements` requirement (`figure.v.outsideCircle`), so sampling keeps M outside and a contradicted side reads amber. (2) ADR-253: see the sibling scenario below. **Asserts:** all steps ok; M strictly outside circle O; |OK|=|OE| and |MK|=|ME| (the kite); K distinct from O; E within segment BO; verifier clean.

### `kite-EMKO-degenerate-default` — the same figure WITHOUT the side statement: a bare "AM" endpoint must not stack onto B (ADR-253)
**Steps**: `AB קוטר במעגל O` · `C על המעגל` · `AC` · `AM` · `OM` · LLM: `K חיתוך AM ו-OC` · `E על BO` · `OK=OE` · `MK=ME`
**Guards against:** the fact list as it actually committed in session `ad66x493` (the refused side statement dropped out). Root cause (ADR-253): `placeBase`'s one-anchor fit is a pure translation, so `AM` placed M at A+(5,0) — EXACTLY on B and collinear with A,O,B — K = AM∩OC collapsed onto O and both kite givens hard-failed at the only composition the apply gate judges, on every seed (the seed is applied after the fold, so no sweep can rescue an apply-time failure; the step parked as "deferred" forever). Defaults now land in general position (golden-angle spin around the anchor; identity kept when already generic). **Asserts:** all steps ok; the two kite equalities hold; M did not stack onto B.

### `incircle-inverted-passive-quad` — במרובע ABCD חסום מעגל O: the inverted passive reads as the INCIRCLE, not the converse (ADR-245)
**Steps**: `במרובע ABCD חסום מעגל O` · `OB`
**Guards against:** operator report (2026-07-06, session `ufxrtyp2`): "we don't have support for במרובע חסום מעגל". Root cause (ADR-245): `isCircleInPolygon` discriminated the inscription roles by word ORDER (circle word before polygon word ⇒ incircle), a proxy that flips subject and container on every inverted passive — the bagrut-standard "במרובע ABCD חסום מעגל O" silently built the CONVERSE (quad ABCD riding circle O, every row ✓). The container is the noun carrying the ב prefix / English "in", wherever it sits; order is only the no-marker fallback. The mirror inversion ("במעגל O חסום מרובע ABCD" → was an incircle) and the poly-word-gap siblings (kite, parallelogram — "מעגל חסום בדלתון" built a kite-ON-circle) are the same class, closed by the shared marker/word lists. **Asserts:** all steps ok; each side of ABCD tangent to circle O (distance from O = r); no vertex on the circle; verifier clean.

### `incircle-definite-ref-binds-existing-quad` — ABCD מרובע ואז "במרובע חסום מעגל": the definite reference binds to THE existing quad (ADR-245)
**Steps**: `ABCD מרובע` · `במרובע חסום מעגל`
**Guards against:** the same operator session, second sequence: with quad ABCD already drawn, the unnamed definite "במרובע" (THE quad) auto-minted a FRESH polygon (EFGH) and inscribed *it* — ignoring the figure the student was talking about. An unnamed definite shape reference now binds to the existing polygon when exactly one n-gon is in the figure (the ADR-029 implicit-reference pattern, polygon edition; zero or 2+ candidates keep the old auto-name/defer behaviour), in both the incircle and inscribed-polygon rules. **Asserts:** all steps ok; no fresh vertex E; ABCD's four sides tangent to the auto-centred incircle; verifier clean.

### `two-concentric-circles-q6` — שני מעגלים בעלי מרכז משותף O: chords of the outer and inner circles on one line (ADR-244, bagrut Q6)
**Steps**: `נתונים שני מעגלים בעלי מרכז משותף O` · `AD מיתר במעגל החיצוני` · `BC מיתר במעגל הפנימי` · `B ו-C על AD` · `E נקודה על המעגל החיצוני`
**Guards against:** operator report (2026-07-06): "שני מעגלים בעלי מרכז משותף O gives me just one circle". Root cause (ADR-244): circle IDENTITY was the centre letter (`circle-<centre>`), so a second concentric circle was unrepresentable — the He phrase dead-ended at the LLM (whose improvised second circle command collapsed into a RESIZE of the first, log session `3k5jezuu`), the En phrase HALF-parsed to one circle, and "המעגל החיצוני/הפנימי" silently attached to the one circle. Fix: the pair macro (`circle-O` bound outer + `circle-O-2` bound inner via `set-radius-order`, a verifier-gated requirement — radii stay free DOFs), the qualifier-resolution post-pass at the parse seam (chokepoint — every circle rule at once, incl. membership disambiguation), per-circle-id `circleMembers`, and an `ambiguous-circle` clarification for unqualified references. **Asserts:** all steps ok; A, D, E on the outer circle and B, C on the inner; inner radius strictly smaller; B and C within segment AD (the drawing's one line A-B-C-D); verifier clean.

### `diameter-edit-rereads-at-position` — editing "AB קוטר" → "AC קוטר" re-reads at the step's own position, staying a real diameter (ADR-241)
**Steps**: `מעגל O` · `AB קוטר` · `BD מיתר` · `BD⊥AC` · ✎ edit step 2 → `AC קוטר`
**Guards against:** operator report (2026-07-06, screenshot session): the figure drew correctly with AB, but editing the diameter to AC broke it — A slipped off the circle, C floated far outside, every row still ✓. Root cause (ADR-241): `commitEdit` re-parsed against the END-STATE context, where C already existed (created free by the ⊥ step), so the diameter rule's existing-endpoints branch lowered to a bare `set-collinear A O C` — dropping the memberships — and the splice replayed that weaker command at position 2. The edit now parses against the PREFIX context (the figure before the edited step — where the replacement is actually replayed); `replaceGroup` also gained the submit path's seed-validity search. **Asserts:** all steps ok; A,B,C,D on the circle; |AC| = 2r (through the centre); BD ⊥ AC.

### `diameter-on-existing-free-points` — "AC קוטר" on already-existing free A,C asserts membership, not just collinearity (ADR-241)
**Steps**: `מעגל O` · `BD⊥AC` · `AC קוטר`
**Guards against:** the no-edit member of the same class, reachable on the plain submit path: the ADR-137 existing-endpoints branch gated on label EXISTENCE where the semantics need circle MEMBERSHIP, emitting only the through-centre collinearity — A and C stayed floating with every row ✓ and the verifier green (it checks only what the commands assert). The branch now also asserts `point-on-circle` for any existing endpoint not already a member (idempotent for real chord endpoints, ADR-099). **Asserts:** A, C on the circle; |AC| = 2r; BD ⊥ AC.

### `multi-point-on-circle-membership` — "A ו C נמצאות על המעגל" puts EVERY listed point on the circle (ADR-240)
**Steps**: `מעגל O` · `A ו C נמצאות על המעגל` · `OC` · `OA` · `AC`
**Guards against:** the operator's exported `.geo.json` (2026-07-06): the membership step was saved as `point-on-circle A` ALONE — `pointOnCircle` read only the FIRST label of a multi-subject statement; `droppedNewLabels` flagged C and escalated, but the LLM round-trip re-entered the same single-subject grammar and the partial lowering committed — then travelled in the file to every machine (load replays stored commands, ADR-232). The rule now reads the ADR-076 uppercase-label-list subject; the LLM commit path re-checks `droppedNewLabels` (ADR-240); load runs the drift+dropped audit (ADR-242). **Asserts:** all steps ok; A and C on the circle.

### `perpendicular-helper-flips-to-reach-crossing` — right triangle + "DF ⟂ AB" + "AC and DF meet at E": DF flips to the side where it crosses AC (ADR-227)
**Steps**: `משולש ישר זוית ABC` · `D אמצע AB` *(LLM)* · `DF אנך ל AB` · `AC ו DF נחתכים בנקודה E`
**Guards against:** operator session `nc207foh` — a right triangle ABC, D the midpoint of the hypotenuse AB, `DF ⟂ AB`, then `AC ו DF נחתכים בנקודה E`. The step built with no error but **E landed off both segments** (param ≈ −4.2 along DF, 1.22 along AC); the operator: *"DF should have moved so it fits the input"*. Root cause (ADR-227): F, the loose end of the perpendicular, is a free point whose **side** (which ray of the perpendicular from D) is an unstated DOF, but `reflectAnchors` only granted a reflection axis to a *shared-vertex* right angle — so F was never flippable and its side stayed anti-correlated with the triangle shape (whenever the triangle flexed so E was within AC, F pointed away). Fix: (1) the loose end of a **cross-segment perpendicular** is reflectable across the other segment's line; (2) a **direction-helper** (a perpendicular/parallel loose end with no metric constraint) reflects **after** the continuous sample — reflecting it before shifts the free-cluster spin centroid and re-shapes the triangle, coupling the two independent DOFs. **Asserts:** every step lands ok; E lies within both segment AC and segment DF (0.02 < t < 0.98 on each).

### `q8-similar-triangles-detected` — bagrut Q8b: "detect shapes" surfaces △DEG ~ △CEF (opt-in similar-triangle classes) (ADR-224)
**Steps**: `משולש ישר זוית ABC` · `משולש ישר זוית ABD` · `AC ו DB נחתכים בנקודה E` · `F אמצע EB` · `G אמצע EA` · `DG` · `CF`
**Guards against:** operator manual test of the full bagrut Q8 figure — two right triangles sharing hypotenuse AB, legs meeting at E, F/G the midpoints of EB/EA, then DG and CF drawn. The operator asked why the tool doesn't flag **△DEG ~ △CEF** as similar (part ב asks the student to prove exactly that). Decision (ADR-224): surface similar/congruent triangle **classes** in the **opt-in "detect shapes" panel** — the same student-initiated reveal boundary as the shape badges (naming the pair still leaves the proof to the student), NOT the always-on theorem feed (whose ADR-208 no-reveal rule stands). Reported as **classes** (union-find over the forced-across-samples similarity relation) so a figure with many mutually-similar triangles is one legible row, not O(n²) pairs. **Asserts:** every step lands ok; `detectShapes(...).similar` contains a class holding both `CEF` and `DEG`; every reported class has ≥2 members, each a distinct 3-vertex triangle.

### `two-right-triangles-share-hypotenuse` — bagrut Q8: two right triangles on a shared hypotenuse AB — the second right angle holds and the legs meet (ADR-223)
**Steps**: `משולש ABC ישר זוית` · `משולש ABD ישר זוית` · `AC ו BD נחתכים בנקודה E`
**Guards against:** operator session `avs58sfn` (bagrut Q8): two right triangles sharing hypotenuse AB, their legs meeting at E. **Two bugs:** (1) the knee at D was drawn but **∠ADB came out 52°, not 90°**; (2) **"AC and BD cannot meet."** **One root cause (ADR-223):** `right-triangle`'s vertex order is **semantic** (right angle at the **last** id), but it sat in `DERIVED_SLOTS`, so `normalizeShapeComposition` **cyclically rotated** `[A,B,D]`→`[B,D,A]` to reuse the existing edge AB — silently moving the right angle from D to **A** (∠BAD=90, knee still drawn at D). Removed right-triangle from the rotation set; the apply case now handles composition itself: it **swaps** the two interchangeable hypotenuse endpoints so a **fresh** one becomes the derived perp-offset, and when the **whole hypotenuse pre-exists** (this case) it asserts the right angle as a **constraint** driving the **new** vertex D onto the Thales circle over AB (not a pre-existing leg's shape DOF — a stability fix). D is made **reflectable** across AB (its two leg endpoints) so the sampler flips it to C's side where the legs cross. `commandConflict` learns that a right-triangle's derived vertex landing on an existing point is a reinterpretation, not a redefinition. **Asserts:** every step lands ok; ∠ACB = ∠ADB = 90°; C and D on the same side of AB; E within both segments AC and BD.

### `parallelogram-cut-triangle-surfaces-parallels-and-similarity` — a parallelogram cut by BE & AD produced to F → alternate/corresponding parallels (L1) + similar triangles (L2) surface (ADR-220)
**Steps**: `מקבילית ABCD` · `E על DC` · `המשך BE ו AD נפגשים בנקודה F`
**Guards against:** operator session (2026-07-04): a parallelogram ABCD, E on the base DC, then BE and AD produced to meet at F. The operator expected the discovery feed to name the alternate/corresponding-angle theorems (זויות מתחלפות וזויות מתאימות, **#4/#6**) and, deeper, **similar triangles**. Root cause + fix (ADR-220): (1) #4/#6 were gated behind a **kind-whitelist** transversal test that didn't recognise the cutting triangle FAB (sides FA, FB + the parallelogram edge AB form a drawn-edge 3-cycle) — replaced by a coordinate-free `structuralTriangles` (any 3-cycle in the neighbour graph), so a bare trapezoid/parallelogram (a 4-cycle only, ADR-210) still suppresses 4/6 while this figure surfaces them at **Declared L1**; (2) the AA-similarity **#69** + its ratio consequences **#71** were structurally excluded (ADR-208 no-reveal) — now admitted as **Entailed (L2)** whenever a stated parallel is a side of a triangle whose apex is off the other parallel (`similarityEvidence`, the Thales / line-parallel-to-a-side config); (3) a guiding concept "if there are parallel lines, look for similar triangles" rides the same premise. Feed behaviour + discovery levels asserted in [`matchers.test.ts`](../src/theorems/__tests__/matchers.test.ts). **Asserts:** every step lands ok; F is collinear with B,E and with A,D (the two-line meet); the feed contains #4, #6, #69, #71.

### `two-circles-kite-surfaces-kite-and-isosceles-theorems` — two intersecting circles + their radii → the kite OAPB and its isosceles triangles surface, entailed (ADR-218)
**Steps**: `שני מעגלים נחתכים` · `AB` · `OP` · `PA` · `PB` · `OA=OB`
**Guards against:** operator session (debug log 2026-07-04, the `שני מעגלים נחתכים` figure). The operator built the classic kite OAPB of two intersecting circles and reported the feed was thin: "i have an isosceles triangle but no relevant theorems appear … added OA=OB and got 1 sentence but there are others … no kite theorems." Root cause (ADR-218): the theorem matchers only read **typed** shape/equal facts, never the circle **structure** the construction already encodes — so the isosceles triangles OAB/PAB (two radii each: |OA|=|OB|, |PA|=|PB|) and the kite OAPB (two circles sharing A,B) went unrecognised because nobody typed "isosceles"/"kite". These are coordinate-free construction **entailments**, not measured coincidences. Fix: `isoscelesEvidence` now derives isosceles from a circle's centre + two drawn radii; a new `kiteEvidence` derives a kite from two circles sharing two drawn-out points; and the kite theorems **37/38** were added to the table (a pure gap). Feed behaviour asserted in [`matchers.test.ts`](../src/theorems/__tests__/matchers.test.ts). **Asserts:** every step lands ok; the kite geometry holds (|OA|=|OB|, |PA|=|PB|, OP ⟂ AB); the feed contains #22, #37, #38 — all entailed, none typed as a shape word.

### `height-in-parallelogram-builds-and-surfaces-theorems` — a height dropped in a parallelogram (with its diagonals) builds a clean right-angle foot, and the feed reacts (ADR-214)
**Steps**: `מקבילית ABCD` · `DB` · `AC` · `DE גובה על AB`
**Guards against:** operator session `tzqfaub6`. After building a parallelogram, drawing its diagonals, and dropping a height from D onto AB, the operator observed "i added a height from D but no new theorem was selected" — the live theorem feed didn't react to the height. Root cause (Turn-5, 2026-07-04): a `foot` (what `גובה` lowers to) wasn't recognised as a right-angle premise, so Pythagoras (#28) never surfaced; and there was no "distance between two parallel lines is constant" theorem (#3) to announce a perpendicular dropped between parallel sides. Fix (ADR-214): `rightAngleFacts` now counts a `foot`; #28 became a MAIN headline; #3 was added (fires when a foot's base is one parallel edge and its apex sits on the opposite one); and a new **guiding-principle concept** layer (`src/theorems/concepts.ts`) surfaces "right triangle → name one acute angle α, the other 90°−α" off the same premise. Feed behaviour is asserted in [`src/theorems/__tests__/matchers.test.ts`](../src/theorems/__tests__/matchers.test.ts). **Asserts:** every step lands ok; the height foot E lies strictly on segment AB and DE ⟂ AB (∠DEA = 90°).

### `thirty-sixty-ninety-triangle-detected-and-surfaces-33-34` — a size given that forces a 30-60-90 triangle is detected as that special type and surfaces #33/#34 (ADR-215)
**Steps**: `מקבילית ABCD` · `DE גובה לצעל BC` · `DC=2CE`
**Guards against:** operator session `x73i1cpx`. Triangle CDE is right-angled at E (the height foot) with hypotenuse DC = 2·CE, so ∠DCE = 60°, ∠CDE = 30° — a 30-60-90. The operator reported two gaps: (1) the special 30-60-90 **theorems** (#33 leg-opposite-30° = ½-hypotenuse, #34 its converse) weren't surfaced, and (2) the shape badge said only "CDE is a right angle", not the special 30-60-90 **type**. Diagnosed as two independent causes sharing the shapes layer: `classifyTriangle` had no angle-magnitude axis (a 30-60-90 collapsed to `right-triangle`), and #33/#34 weren't in `THEOREM_TABLE`. Fix (ADR-215; the operator chose "always surface when detected"): a `30-60-90-triangle` shape sub-type in [`detectShapes.ts`](../src/engine/detectShapes.ts) + #33/#34 firing whenever such a triangle is **detected** (stated or emergent), consuming the shapes layer. Feed behaviour asserted in [`matchers.test.ts`](../src/theorems/__tests__/matchers.test.ts); classification in [`detectShapes.test.ts`](../src/engine/__tests__/detectShapes.test.ts). **Asserts:** every step lands ok; CDE is detected as `30-60-90-triangle`; the feed contains #33 and #34.

### `degenerate-tangent-line-fails-fast-no-freeze` — a tangent named by one repeated point ("BB … בנקודה B") is rejected fast, never freezes the solver (ADR-202)
**Steps**: `שני מעגלים נחתכים` · `C על מעגל P` · `CA משיק למעגל O בנקודה A` · `CA` · `D על מעגל O` · `BB משיק למעגל P בנקודה B`
**Guards against:** operator session `wetjqgsj`. The last tangent is named by the DEGENERATE line "BB" (one point repeated), so the parser emitted `set-perpendicular(P,B,B,B)` — its operand B→B is a zero-length vector (NaN direction). Not rejected, the solver churned ~4.4 s per replay (`recruitFreeDofs` chasing the NaN over every free DOF) before a bogus over-constraint; the app runs that slow replay many times in its config-search loop → the UI FROZE. Fix (ADR-202): `applyStep` rejects a ∥/⟂ with a zero-length operand (identical endpoint ids) up front, before any evaluate — 4.4 s → ~15 ms, for any source (parser typo, LLM, `AA ⟂ BC`). **Asserts:** `lastError` names the degenerate token ("distinct points … single point"); the prior figure is kept (O,P,A,B,C,D all placed); the valid earlier `OA ⟂ CA` still holds.

### `baseless-midsegment-places-G-on-a-side-and-alternates` — a base-less "EG קטע אמצעים" (E on a side) pins E to the midpoint, places G on one of the two other sides, cyclable (ADR-199)
**Steps**: `משולש ABC` · `E על AC` · `EG קטע אמצעים`
**Guards against:** operator session `n6zuhw65`. With NO parallel base named, `EG קטע אמצעים` fell through the midsegment rule to the plain-segment rule → a bare `segment E-G` with G undefined ("EG was not drawn correctly"). A midsegment joins two MIDPOINTS, so E must be the midpoint of AC and G the midpoint of one of the two other sides — AB (→ EG ∥ CB) or CB (→ EG ∥ AB) — and WHICH is genuinely unstated (ADR-052), so it must be a cyclable alternative ("G should have been placed on either side CB or AB with ability to alternate between them"). Fix (ADR-199): the parser's `midsegmentBaseless` resolves E's host side from `ctx.onSegment` and the triangle from `ctx.neighbors`, emitting a `midsegment` `shape-variant` `[A,C,B,E,G]`; `expandShapeVariant` pins E to the midpoint (`set-equal(A,E,E,C)`) and makes G the midpoint of AB (variant 0) or CB (variant 1); `VARIANT_COUNT.midsegment = 2`, so "show another configuration" flips G between the sides. **Asserts:** all steps ok; `|AE|=|EC|`; G is the midpoint of AB or CB; EG ∥ the opposite side; variant 1 lands G on the OTHER side.

### `named-midsegment-reuses-existing-midpoint-endpoint` — a named "EF קטע אמצעים במשולש DCA" whose endpoint E is already a midpoint reuses E (no stray M/N) (ADR-199 Am.)
**Steps**: `טרפז ABCD חסום במעגל` · `AC` · `E אמצע AD` · `EF קטע אמצעים במשולש DCA`
**Guards against:** operator session `tg6s9dnp` ("I now have M and N somehow"). The named midsegment escalated to the LLM (the deterministic `midsegment` rule needs a base; without one it dived into `midsegmentBaseless`, which only recognised a **free on-segment** anchor — E is a **derived midpoint** — so it returned null → LLM), and the LLM "normalised" the utterance to `קטע האמצעים לצלע CA במשולש DCA`, **dropping the labels EF**, so the unnamed branch auto-minted midpoints **M and N** (N a duplicate of the existing E). Fix (ADR-199 Am.): a new `ctx.midpointOf` maps each existing midpoint to the segment it bisects; `midsegmentBaseless` anchors E from `onSegment` **or** `midpointOf`, so E is reused and only the fresh F is created (F = midpoint of one of the two other sides, cyclable). **Asserts:** all steps ok; E and F honoured, **no M/N**; E stays the midpoint of AD; F is the midpoint of AC or DC; EF ∥ the third side.

### `incremental-midsegment-resolves-triangle-from-figure` — a midsegment named AFTER the triangle resolves the triangle from the figure
**Steps**: `משולש ABC` · `GE קטע אמצעים מקביל ל AB`
**Guards against:** operator session `z5dkmbla`. The midsegment declared in a **separate, later step** (`GE קטע אמצעים מקביל ל AB`, after the triangle) fell through to the parallel-constraint rule and became a **plain parallel segment** (`segment GE` + `set-parallel`, **no midpoints**), because `midsegment` required the triangle NAMED in the same utterance — so with no "משולש ABC" here `triM` was null and the rule bailed. Consequence: G,E were free, the sides carried no equal halves, and "view relations" showed no equal sides/angles (the reported symptom). Fix: `midsegment` resolves the triangle from the figure (`ctx.neighbors`, apex = the unique vertex adjacent to both base endpoints) when it isn't named in-utterance — the same context inference altitude/single-vertex-angle use. GE now decomposes to `midpoint(C,A)=G`, `midpoint(C,B)=E`, `segment GE`. **Asserts:** all steps ok; `AG=CG`, `BE=CE`; `GE ∥ AB`; the equal halves + corresponding angles surface via `detectRelations`.

### `on-segment-point-stays-within-its-segment` — a driven on-segment point stays WITHIN its segment, not on the extension (ADR-194)
**Steps**: `ריבוע ABCD` · `E על AB` · `F על DC כך ש DF:FC=1:10` · `EF מקביל ל BC`
**Guards against:** operator session `wdrfq1wf`. `EF ∥ BC` is satisfiable in-segment (E and F both at t=1/11), but the figure came back with E and F at **t=−1/9 — outside their segments, on the extension** beyond A and D, so "E on AB" and "F on DC" were both silently violated (green, `violations:[]`). The distance-based ratio `|DF|=0.1·|FC|` has two roots (internal t=1/11 **and** external t=−1/9), and the multi-carrier joint solver picked the external one because `setCarrierVals` clamped only an EXTENSION on-segment point (t≥1.02) and wrote a PLAIN on-segment point's t **unclamped**, letting the unbounded search slide it off its segment. Fix (ADR-194): a plain on-segment point lives between its endpoints (t∈[0,1]) by definition — clamp it there in `setCarrierVals`, so the solver moves the figure's other DOFs and lands the internal root. **Asserts:** E within AB and F within DC (0≤t≤1, collinear); `DF:FC ≈ 1:10`; `EF ∥ BC`.

### `impossible-perp-does-not-clobber-ratio-pinned-point` — an impossible later ⟂ hard-fails cleanly; it does NOT drag a ratio-pinned point off (ADR-193)
**Steps**: `ריבוע ABCD` · `F על CD` · `DF:FC=1:4` · `E על AB` · `FE אנך ל BC`
**Guards against:** operator session `vpt763yn`. `DF:FC=1:4` pins F at t=0.8; then `FE ⟂ BC` is geometrically impossible (F on the top edge, E on the bottom edge, BC vertical ⇒ `FE·BC` is a constant −25). Two reported bugs, one root cause: **F moved off its ratio position** and **the drawn line came out parallel to BC, not perpendicular**. The perpendicular drives E and the ratio drives F (both `on-segment-solved`); the joint solver can't satisfy the impossible ⟂, returns a best-effort placement (regulariser pulls both to the seed midpoints) and **discards its `ok=false`**; `setCarrierVals` clears the solve directives so neither driven constraint is a driver OR a check, and `evaluateCore` reports `ok` on a figure violating both. Fix (ADR-193): `evaluate` re-verifies every DRIVEN constraint at the resolved positions — an unsatisfiable driven system is honestly over-constrained, so the step hard-fails, the prior figure is kept (F stays put), and ADR-191 drops the FE scaffolding. **Asserts:** `|FC|/|DF| ≈ 4`; `lastError` over-constrained and names the ⟂; no `seg-EF`/`seg-FE`; square + seg-BC intact; every point placed; `violations` empty.

### `segment-ratio-colon-drives-division-point` — bare "DF:FC = 1:2" drives F so |DF| = ½|FC| — no silent equality (ADR-192)
**Steps**: `ריבוע ABCD` · `E על AB` · `F על CD` · `DF:FC=1:2`
**Guards against:** operator session `o2m8f0w8`. The keyword-free colon ratio `DF:FC=1:2` had no deterministic rule so it escalated to the LLM, which returned the correct `DF = FC/2` — but `equalSegments` then matched the `DF = FC` prefix and **silently dropped the `/2`**, asserting `|DF| = |FC|` (a plain equality) instead of the 1:2 ratio. Green status, no error, wrong geometry (the ADR-024/026 half-parse class). Fix (ADR-192): (A) `ratioConstraint` reads a trailing divisor `= FC/2` → `set-ratio(k=½)` and `equalSegments` bails on a divided RHS (`SEG_DIV_RHS` guard); (B) a new `segmentRatioColon` rule parses the bare `seg:seg = p:q` form deterministically → `set-ratio(k=p/q)`, so it never escalates. **Asserts:** every step ok; `|FC| / |DF| ≈ 2`.

### `impossible-perpendicular-drops-its-segment` — an utterance is ATOMIC: an impossible "EF ⟂ BC" draws neither a stray segment nor a green build (ADR-191)
**Steps**: `ריבוע ABCD` · `E על צלע AB ב- 40%` · `F על DC` · `EF ו- BC מאונכים`
**Guards against:** operator session `8twmmb5r`. The ⟂ is impossible (EF spans the square bottom→top, so it can never be perpendicular to the vertical BC). The parser lowers the utterance to a GROUP `[segment EF, segment BC, set-perpendicular]` (FR-IN-7 auto-draws the ⟂ pair), and `replay` applied each fact independently — so the scaffolding `segment EF` committed on its own and **seg-EF was still drawn even though a "can't place F …" message was shown**. Fix: a group is atomic — a group with a hard-failed fact AND a succeeded one is poisoned and the figure is rebuilt with the whole group blocked, so seg-EF never appears (seg-BC, shared with the square, is still drawn by the square). The pending/deferral case (ADR-104) is untouched. **Asserts:** `lastError` set; no `seg-EF`; the square (incl. seg-BC) intact; every point still placed; no verifier violation.

### `plural-segment-noun-points-on-sides` — "F, G, H on הקטעים AB, AC, CB" (PLURAL segment-keyword noun) places all three (ADR-187)
**Steps**: `משולש ABC ישר זוית` · `נקודות F, G, H על הקטעים AB, AC, CB`

### `named-midsegment-keeps-its-endpoint-names` — "PQ קטע אמצעים לצלע BC במשולש ABC" keeps endpoints P,Q (was auto-renamed M,N) (ADR-150)
**Steps**: `משולש ABC` · `PQ קטע אמצעים לצלע BC במשולש ABC`
**Guards against:** sibling of the named-altitude bug (ADR-149), found by auditing every rule that auto-names a derived point. The `midsegment` rule always auto-named its two endpoints (M,N via `freeLabel`) and had no named-form path, so "PQ קטע אמצעים …" silently renamed the student's P,Q. Fix: the rule reads a leading or keyword-first named pair (**uppercase labels only**, so a lowercase connector like "to BC" is never misread as labels T,O) that isn't the triangle's own vertices. **Asserts:** all steps OK; endpoints named P,Q; no M,N fabricated; P=mid(AB), Q=mid(AC); PQ ∥ BC (the midsegment theorem holds).

### `named-altitude-keyword-first-keeps-foot` — "הגובה CD במשולש ABC" (keyword-first order) keeps foot D (ADR-150)
**Steps**: `משולש ABC` · `הגובה CD במשולש ABC`
**Guards against:** completes the ADR-149 fix — the first pass only caught the name-FIRST order ("CD גובה"); the keyword-FIRST order ("הגובה CD" / "the altitude CD") was still not-handled → escalated to the LLM → "altitude from C" → foot auto-named F → the original CF symptom. The named-segment detection now matches either word order (uppercase labels immediately after the keyword, so a lowercase connector is never read as a name). **Asserts:** all steps OK; foot named D, no F fabricated; D on line AB; CD ⟂ AB.

### `altitude-in-trapezoid-drops-to-opposite-base` — "CE גובה בטרפז" drops from C to the opposite parallel base AB (ADR-169)
**Steps**: `טרפז ABCD ישר זווית` · `CE גובה בטרפז`
**Guards against:** session `sub2ys2a` — "CE גובה בטרפז" (height in a trapezoid) escalated to the LLM and returned not-understood, while "CD גובה" works on a triangle. The `altitude` rule inferred the opposite side ONLY via triangle logic (two neighbours of the apex that are joined to each other); in trapezoid ABCD the apex C's neighbours B,D are a **diagonal**, not an edge → no triangle → the rule bailed. Fix (ADR-169): the height now drops to the **opposite parallel base**, resolved from `ctx.parallels` (vertex-disjoint parallel edge-pairs derived from the figure via `parallelEdgePairs`); C sits on base DC ∥ AB so the foot lands on AB. A parallelogram (two parallel pairs) is left ambiguous → defers (ADR-052). **Asserts:** all steps OK; foot E created (not escalated); E on line AB; CE ⟂ AB.

### `altitude-to-named-side` — "גובה לצלע AB" drops the altitude from the opposite vertex (issue #107)
**Steps**: `משולש ABC` · `גובה לצלע AB`
**Guards against:** log-triage 2026-07-13 (operator-approved) — "גובה לצלע AB" (altitude TO a side) was not-handled, while the mirror forms work: "גובה מ A" (altitude FROM a vertex, ADR-263) and "הוסף תיכון לצלע AB" (median TO a side, #71). The `altitude` rule resolved its apex only from a "from/מ" phrase or a named segment, so the vertex-less "to a named side" phrasing fell through to `return null`. Fix (#107): mirror the median's vertex-less side form — the apex is the unique third vertex of a figure triangle carrying side AB, then reuse the foot+segment lowering. Several candidate triangles or none → defer (ADR-052), never guess. **Asserts:** all steps OK; a foot created on AB; the altitude CF ⟂ AB.

### `midsegment-in-trapezoid-joins-leg-midpoints` — "קטע האמצעים בטרפז" builds the trapezoid median (ADR-222)
**Steps**: `טרפז ABCD` · `קטע האמצעים בטרפז`
**Guards against:** the `קטע אמצעים` (midsegment) rule was **triangle-only** — it inferred the apex from two base endpoints that share a common vertex, so a trapezoid (whose two legs do NOT meet at a point) had no apex and the utterance escalated to the LLM and returned not-understood. Fix (ADR-222): a trapezoid midsegment now resolves from the figure's unique vertex-disjoint parallel base-pair (`ctx.parallels`, mirroring the ADR-169 altitude) — the two bases AB ∥ DC give the legs AD, BC via `ctx.neighbors`, and the median joins their midpoints (two `midpoint`s + a `segment`), parallel to and midway between the bases; the constraint solver keeps it parallel, so no new engine construct. A self-contained named form ("midsegment of trapezoid ABCD") also builds the trapezoid inline. A parallelogram (two parallel pairs) is left ambiguous → defers (ADR-052). **Asserts:** all steps OK; two leg-midpoints created; each is the midpoint of a leg (AD/BC); median ∥ base AB; |median| = (|AB|+|DC|)/2 (the median theorem).

### `named-altitude-keeps-its-foot-name` — "CD גובה במשולש ABC" keeps the foot D (was silently renamed CF) (ADR-149)
**Steps**: `משולש ABC` · `CD גובה במשולש ABC`
**Guards against:** operator manual test (2026-06-29) — asked for **CD** to be a גובה (altitude); the figure built but the segment came out **CF**, dropping the student's foot letter `D`. Root cause: the `altitude` rule derived the apex only from a "from/מ" phrase and **always auto-named the foot** via `freeLabel` (→ `F`); a leading *named* altitude segment ("CD גובה …", where C is the apex/vertex and D the foot) returned `not-handled` → escalated to the LLM → rephrased to "altitude from C" → foot named `F` → `segment CF`. Fix: the `altitude` rule now recognises a leading named altitude segment (height/altitude/גובה **only** — "EF אנך ל AB" stays the ⟂ constraint, handled later) and uses the second letter as the foot id instead of auto-naming it. **Asserts:** all steps OK; the foot is named `D` and no `F` was fabricated; `D` on line `AB`; `CD ⟂ AB`.

### `point-on-chord-named-carrier` — "E על מיתר AC" (a point ON a named carrier) parses; E is not dropped (ADR-147)
**Steps**: `מעגל O` · `מיתר AC` · `E על מיתר AC`
**Guards against:** operator-reported "E על מיתר AC was not-understood". The point-on rules required the carrier's two labels to come **immediately** after על/on, so a descriptor noun (`מיתר`/chord, `צלע`/side, `קטע`/segment, `אלכסון`/diagonal — He or En) wedged between the connector and the labels made them miss; worse, with a circle in context the `chord`/`segment` carrier-**defining** rule grabbed the bare "AC" run and **silently dropped** the named rider point E. Root fix: a shared `CARRIER_NOUN` set — `SEG_NOUN` lets the point-on rules skip the noun, and `POINT_ON_CARRIER` makes the carrier-defining rules bail on a `<point> on <carrier> AB` utterance so point-on wins; `withChordMembership` now also reads a `point-on-segment` carrier, so A,C still land on the circle. **Asserts:** all steps OK; E placed (not dropped), on segment AC and between A,C; A,C equidistant from O (on the circle).

### `two-tangent-circles-then-size-given-flexes-radii` — "two circles tangent externally" then "OP = 4" resizes the radii instead of over-constraining (ADR-052)
**Steps**: `שני מעגלים משיקים מבחוץ` · `OP=4`
**Guards against:** operator session `23vqi9u8`. The figure was built with both radii **pinned** at the default seeds (5 and 3): the deterministic parser had no rule for the unnamed "two circles tangent externally", so it escalated to the LLM, which emitted `circle … radius 5`/`radius 3` (FIXED) + `circles-tangent`. External tangency then forces `|OP| = r1+r2 = 8` rigidly, so the student's own `OP = 4` was reported *"over-constrained: |OP| = 8 cannot hold"* — a value never given (ADR-052 violation); the touch point M was likewise rigid at `|OM| = r1 = 5`. Root fix: (1) a deterministic `circlesTangent` rule that materialises the two circles with **free** radii (distinct seeds, `ifAbsent` so a stated radius is preserved); (2) the engine builds external tangency as a `coincide` between the touch point seen from each circle (M = `radial-toward(c1→c2)`, a hidden `~`-witness = `radial-toward(c2→c1)`), with both free radii marked as **permanent drivers** of it, so `|OP| = r1+r2` is a constraint the radii flex to satisfy; the recruiter reaches the radii via `radial-toward` ancestry (`circlesOfPoint`/`pointParents`). **Asserts:** all steps OK (no over-constraint); `|OP| = 4`; `|OM| + |MP| = |OP|` (M on both circles ⇒ genuine tangency); `|OM| < 4` (r1 shrank off its seed of 5).

### `chord-tangent-to-other-circle-at-endpoint` — "the chord AD in circle P is tangent to circle O at A" creates D + the chord + OA ⟂ AD (not mutual tangency)
**Steps**: `שני מעגלים נחתכים` · *(LLM)* chord CB tangent to P at B · `CB` · `המיתר AD במעגל P משיק למעגל O בנקודה A`
**Guards against:** operator session `vk346px4`: the last step parsed to a single `circles-tangent` between circle-P and circle-O — point **D** and the **chord AD** were dropped entirely, and it asserted the two circles are tangent to *each other*, contradicting the opening "two circles intersect". Green ✓ while nothing appeared on the canvas. Root cause: `circlesTangent` fires on "two `מעגל X` tokens + a `משיק` keyword", but here `במעגל P` is the chord's *host*, not a second tangent circle — the rule throws the chord away. The deterministic parser also had no tangent-chord construct (the symmetric step-2 chord only worked via the LLM). Fix: a new `tangentChord` rule (splits at the tangent keyword → host circle before, tangency circle + point after) emits both endpoints on the host circle + `set-perpendicular(target→Z) ⟂ chord` + the segment; plus a `chord`/`מיתר` guard on `circlesTangent`. **Asserts:** all steps OK; D lies on circle P (|PD| = |PA|); ∠OAD = 90° (radius OA ⟂ the chord ⇒ tangent at A); verifier clean.

### `diameter-on-existing-chord-is-a-constraint` — "AB is a diameter" of an existing circle whose A,B already exist makes the chord a diameter (ADR-137)
**Steps**: `משולש ABC חסום במעגל` · `AB קוטר במעגל O`
**Guards against:** operator session `ylea4zal`: "but I added `AB קוטר במעגל P` and it failed" — `'B' is already defined → built-nothing`. The figure's circle (a circumcircle named P) existed with A,B on it, so the `diameter` rule fired and its command re-created A as a fresh on-circle point and B as "the antipode of A", redefining the existing A,B → the redefinition guard rejected it. Root cause (ADR-137): a diameter declared over points that already exist on the circle must be a CONSTRAINT on the existing chord, not a re-creation (same pattern as ADR-080/092/099/115). Fix: emit `set-collinear [A, centre, B]` — the centre is equidistant from A,B (both on the circle), so collinearity forces it to their midpoint ⇒ AB is a diameter; the engine flexes the figure (numerically for a derived circumcentre — no cycle — or by antipode conversion for an independent centre). **Asserts:** all steps OK; across 5 seeds ∠ACB = 90° (Thales) and the centre O lies on AB. *(The current parser auto-names the inscribed circle O via on-circle points, not the session's circumcircle-P — a representation drift; the literal circumcircle-named-P case is locked as a unit test in `circle-on-diameter.test.ts`.)*

### `order-only-solve-stays-samplable` — an inscribed triangle + tangent∩extension stays UNDETERMINED, no "forced" angle numbers (ADR-136 Am. 2)
**Steps**: `משולש ADB חסום במעגל` · `המשיק בנקודה D והמשך AB נפגשים בנקודה E`
**Guards against:** operator (screenshot) — the "view relations"/DOF cue showed every angle as a definite number (51.8°, 65°, …) on a 2-DOF figure ("the shape is not defined, so this should not have happened"). The ADR-135 `order` field on the tangent∩extension `line-intersection` (`collinear-order [A,B,E]`) recruited the inscribed triangle's on-circle vertices A,D,B and marked them `solve`, re-freezing the very vertices ADR-136 had un-frozen. An order/region constraint removes 0 DOF (ADR-039), so the carriers stay free WITHIN the region — but the sampler's "samplable" predicates excluded any `solve`-marked point → all 16 samples identical → every angle "definitive" (the ADR-052 smell: `freeDofCount`=2 but `freeDofs`=[O]). Fix (ADR-136 Am. 2): a carrier whose `solve` is ONLY an order/region constraint is NOT consumed — it stays samplable; `evaluate` re-enforces the order from the perturbed seed. **Asserts:** all steps OK; `freeDofCount > 0`; A,D,B ∈ `freeDofs`; `detectRelations(...).definiteAngles == []`; across 8 seeds the triangle's ∠ADB takes ≥3 distinct values while E stays beyond B (collinear-order holds, t>1).

### `circumcircle-cuts-segment-d-on-side` — "the circumcircle of ABC cuts CE at D" keeps D ON segment CE (ADR-127)
**Steps**: `circle O radius 5` · `מנקודה A יוצאים שני משיקים למעגל` · `∠CAB=90` · `CE ו BE מיתרים במעגל` · `EB` · `המעגל שחוסם את משולש ABC חותך את CE בנקודה D`
**Guards against:** operator "all worked well but the last view violates the rule that D is on CE". `circumcircleMeetsSegment` built D on the INFINITE line through C,E with no order constraint, so the default seed put D on the chord but "show another configuration" slid it onto the extension (t up to 4.3). The first fix (`set-line [C,D,E]`) failed — `set-line`'s `addCollinear` mis-drove the free on-circle endpoint C → "unresolved dependencies … line-CD" (D is already collinear). Fix (ADR-127): carry the order on the `line-circle-intersection` itself (new `order` field → a lone `collinear-order` constraint), folded into the joint minimisation so D stays between C and E in every config. **Asserts:** all steps OK; D collinear with C,E; projection parameter t ∈ [0,1] (on the segment). *(The operator's real run had a typo "חותרך" → LLM; the corrected spelling exercises the deterministic rule.)*

### `two-tangents-from-point-unnamed-touch` — "מנקודה A יוצאים שני משיקים למעגל O" builds without naming the touch points (ADR-126)
**Steps**: `circle O radius 5` · `מנקודה A יוצאים שני משיקים למעגל O`
**Guards against:** (session gd0kkj) "two tangents from A to circle O" fell to the LLM and built nothing, while a previous question worked — because that one NAMED the touch points ("…בנקודות B ו C"). Root cause: `tangentsFromExternal` required a named touch-point pair (`if (!abM) return null`), so the natural unnamed phrasing bailed the rule. Fix (ADR-126): auto-name two fresh touch points when none are given, then build the Thales two-tangent construction; the named form is unchanged. **Asserts:** all steps OK; two touch points built, both on circle O (distance 5 from the centre).

### `named-incenter-of-incircle` — "M מרכז המעגל החסום במשולש BDC" names the incentre M, builds ONE incircle (ADR-125)
**Steps**: `מלבן DCBA` · `BD` · `M מרכז המעגל החסום במשולש BDC`
**Guards against:** (session djvbb7) the incentre came out **O** not M, and the tangency foot on BD flipped letters (G→F) when hidden. Root cause: the `incircle` rule only caught a centre phrased "circle M"/"centred at M" (`circleCenter`), not the subject form "M [is the] centre of …", so the leading label M was dropped → the dropped-label gate (ADR-089) escalated to the LLM → the LLM built a **second, complete incircle** (centre O, foot G, circle-O) stacked on the parser's (centre I, foot F, circle-I). Fix (ADR-125): `incenterLabel` captures the subject-named incentre, so M is honoured — nothing dropped, no escalation, one incircle. **Asserts:** all steps OK; exactly one circle, centred on M; M equidistant from the three sides of BDC (incentre). *(Also fixed in the same report, not a scenario: a hidden circle now draws nothing — truly invisible but clickable — instead of a faint dashed ghost.)*

### `area-ratio-converges-points-allowed` — kite + "area NCE = ¼ area ACD" resolves with N landing on the centre O (ADR-121 Am./123)
**Steps**: `ABCD דלתון חסום במעגל` · `AB=AD` · `CB=CD` · `E על DC` · `BE⊥DC` · `AC` · `N = חיתוך BE ו-AC` · `שטח משולש NCE= רבע שטח משולש ACD`
**Guards against:** the area-ratio given failed two ways (session id4dn4a2): `S_{ACD}=4S_{NCE}` didn't parse (coefficient glued to the marker — ADR-121 Am.), and the verbose form errored "O and N would be at the same point". △NCE~△ACD is structural (right kite ⇒ ∠ADC=∠NEC=90°, shared ∠C), so ¼ ⟺ CN/CA=½; AC is a diameter (Thales) ⇒ O is the midpoint of AC ⇒ CN/CA=½ places N exactly on O. The solver was fine (other ratios converge) — only the coincidence guard hard-failed at N=O. Fix (ADR-123): a forced coincidence is allowed with a notice (O was never user-defined), default collisions stay avoided. **Asserts:** all steps OK; `area(NCE)=¼ area(ACD)`; `|NO|≈0`; the N=O coincidence is surfaced.

### `congruent-triangles-word-form` — "משולש ABC חופף למשולש GHT" makes GHT congruent to ABC (SSS) (ADR-032/120)
**Steps**: `משולש ABC חופף למשולש GHT`
**Guards against:** operator question "do we support congruent/similar triangles?". Congruence (`חופף`/`≅`/congruent) and similarity (`דומה`/`~`/similar) are supported (ADR-032): `congruence` reshapes the 2nd triangle to match the 1st by SSS. Locked at BUILD level so corresponding sides stay equal. (ADR-120 also makes the `△` glyph a parser keyword + toolbar button so `△ABC` builds a triangle and `△ABC ≅ △DEF` works — covered by catalog-coverage.) **Asserts:** all steps OK; `|GH|=|AB|`, `|HT|=|BC|`, `|TG|=|CA|`.

### `parallel-chords-keep-circle-membership` — "CD ו AF מיתרים מקבילים" puts C,D,F ON circle O, not free points (ADR-119)
**Steps**: _(LLM)_ `circle O + diameter AB` · `CD ו AF מיתרים המקבילים זה לזה`
**Guards against:** after `AB קוטר במעגל`, the chords-with-a-relation utterance parsed to two PLAIN segments + `set-parallel` — the `מיתר`/chord membership was dropped, so C,D,A,F were free points NOT on circle O. Root cause: `parse` is first-match-wins, `parallelConstraint` (plain segments only) runs before the `chord` rule and claims the utterance; and `chord` itself handles only one chord. Fix (ADR-119): a centralised post-pass `withChordMembership` — every SEGMENT endpoint in a chord-flavoured utterance with a resolvable circle is asserted on the circle (idempotent; centre excluded; a midpoint is not a segment endpoint). General across parallel/⟂ chords. **Asserts:** all steps OK; `|OC|=|OD|=|OF|=r`; `CD ∥ AF`.

### `isosceles-explicit-pair-overrides-default` — "משולש שווה שוקיים ABC" + "AB=BC" stays isosceles, not equilateral (ADR-114)
**Steps**: `ABC משולש שווה שוקיים` · `AB=BC` · `AK תיכון` · _(LLM)_ `L = mid AB, segment CL` · `D = חיתוך AK ו-CL`
**Guards against:** the isosceles macro hard-coded `|AB|=|AC|` ("apex = first vertex"). "Isosceles" only asserts SOME two sides equal — which pair is the student's to state (ADR-052) — so `משולש שווה שוקיים ABC` then `AB=BC` stacked `|AB|=|AC|` + `|AB|=|BC|` into an **equilateral** triangle the student never asked for. Fix (ADR-114): the macro's default pair is `soft`, and `replay` drops it when an explicit equality on the same triangle is given, so the stated pair wins. **Asserts:** all steps OK; `|AB|=|BC|` (the stated pair) holds; `|AC|` differs (not equilateral).

### `isosceles-appositive-stated-pair-one-line` — "משולש ABC הוא שווה שוקיים, כלומר AC=BC" in ONE line: shape + stated pair both land (ADR-264)
**Steps**: `משולש ABC הוא שווה שוקיים, כלומר AC=BC`
**Guards against:** the textbook appositive form (shape declaration + "כלומר <pair>" in one utterance) was never parsed deterministically — `multiStatement` requires every piece to carry a relation operator, the shape rule 'stop's on the leftover clause, and the whole line escalated to the LLM, whose decomposition could silently DROP the stated pair (its labels all already appear on the shape, so the new-label/number honesty gates never fired — the student saw success with their given missing). Fix (ADR-264): the clause fallback parses shape + givens all-or-nothing; `droppedGivenRelations` is the gate twin for whatever still escalates. **Asserts:** all steps OK; the STATED `|AC|=|BC|` holds; `|AB|` differs (the soft default yielded — not equilateral).

### `isosceles-bare-shape-with-pair-one-line` — "משולש שווה שוקיים שבו AB=AC" (LABEL-LESS shape + pair) draws a real TRIANGLE (ADR-264 Am. 1)
**Steps**: `משולש שווה שוקיים שבו AB=AC`
**Guards against:** operator dev session `zalwhvsh` — committed as segments + `set-equal` with NO triangle ("AB is equal to AC but this is not a triangle"). The label-less shape rule DEFERS (null, not 'stop'), so `equalSegments` claimed the `AB=AC` clause mid-string and dropped the declaration (the lax-relation-rule class: equality/distance/angle all did it). Fix: the dropped-shape-noun guard on the winning parse + the clause split as the deterministic rescue. **Asserts:** all steps OK; `|AB|=|AC|`; A,B,C non-collinear (a real triangle); the polygon object drawn.

### `kite-stated-pair-one-line` — "דלתון ABCD, AB=AD" in ONE line: the kite + the student's stated pair both land (ADR-264)
**Steps**: `דלתון ABCD, AB=AD`
**Guards against:** the comma sibling of the appositive form — escalated whole to the LLM; a decomposition returning only the kite committed silently (the pair's labels all appear on the kite → no gate fired). Now deterministic: kite + explicit `set-equal` (the ADR-234 pin). **Asserts:** all steps OK; `|AB|=|AD|` and `|CB|=|CD|` hold.

### `perpendicular-from-midpoint-flexes-rhombus` — a constraint flexes the rhombus angle to land G on a diagonal's extension (ADR-113)
**Steps**: `ABCD מעוין` · `F אמצע BC` · `E אמצע AB` · _(LLM)_ `K = AC ∩ BD` · `G על המשך BD` · `GE⊥AB`
**Guards against:** `GE⊥AB` failing *"over-constrained: GE ⟂ AB cannot hold"* (session `oew743rq`). With `AB` horizontal and `E` its midpoint, `GE⊥AB` forces `G` directly above `E`; on line `BD` that crossing sits beyond `D` only when the rhombus angle at `A` is **< 60°** (at 60° the unique solution is the degenerate `G=D`). So the figure must **flex the rhombus angle** jointly with `G`'s extension parameter — but the drivable-ancestor walk **stopped at the free param carrier `G`** and never reached the shape DOF (the rhombus angle, carried by `D` = `G`'s parent) behind it, so the recruiter could only slide `G` onto `D`. A `git bisect` proved this never worked (back to 2026-06-17 it failed with "D and G would be at the same point"). Fix (ADR-113): in `drivable` mode, record a free on-segment carrier **and keep walking past it** to the DOFs behind its segment. **Asserts:** all steps OK; `GE⟂AB` holds exactly (cos≈0); `G` strictly beyond `D` (param `t>1.02`) and distinct from `D`.

### `kite-named-shape` — "דלתון ABCD" builds a kite from the named shape alone (ADR-110)
**Steps**: `דלתון ABCD`
**Guards against:** the theorem-list audit found no kite/דלתון construct. Added (ADR-110) as a parser MACRO — a general `quadrilateral` + `|AB|=|AD|` + `|CB|=|CD|` constraints flex the free quad into a kite (axis AC), reusing the tested constraint solver with no new engine construct. The same pattern delivers isosceles/equilateral triangle and isosceles trapezoid. **Asserts:** all steps OK; |AB|=|AD| and |CB|=|CD| hold (verifier green).

### `regular-hexagon` — "regular hexagon ABCDEF" builds a 6-gon with equal sides + 120° angles (ADR-111)
**Steps**: `regular hexagon ABCDEF`
**Guards against:** the polygon family capping at 4 vertices. Added (ADR-111) a generic `polygon` command + a `regularPolygon` rule that places n equally-spaced vertices on a hidden, free-radius circle (corners pinned → rigid up to similarity, ADR-112). **Asserts:** all steps OK; all 6 sides equal; all 6 interior angles ≈120°.

### `q4-constraints-order-independent` — full Q4 builds with CE⟂AB entered BEFORE the sizes (ADR-104)
**Steps**: `שני מעגלים נחתכים בנקודות A ו B` · `נקודה C על מעגל P` · `המשך CA חותך את מעגל O בנקודה D` · `המשך CB חותך את מעגל O בנקודה E` · `נקודה G על המשך DE` · `CG חותך את מעגל P בנקודה F` · `AF ו BC נחתכים בנקודה H` · `∠GEC = ∠CHA` · `CE⊥AB` · `CD=36` · `DE=18`
**Guards against:** `CE⟂AB` failing "over-constrained" when entered BEFORE `CD=36, DE=18` — without the sizes it's an under-determined coupled solve the engine can't land; with them it's determinate. The operator's principle: the diagram must build the same regardless of entry order. Fix (ADR-104): after the in-order pass, `replay` RETRIES still-failed CONSTRAINT-only facts against the now-complete figure to a fixpoint, so a constraint typed too early is effectively re-ordered after the givens that pin it. Verified order-independent across five orderings (the others in `recruit-circle-center.test.ts` / engine tests). **Asserts:** all steps OK; |CD|=36, |DE|=18, CE⟂AB all hold; verifier green.

### `distance-drives-circle-centres-apart` — "CD=36" spreads two circles' centres so the distance holds (ADR-103)
**Steps**: `שני מעגלים נחתכים בנקודות A ו B` · `נקודה C על מעגל P` · `המשך CA חותך את מעגל O בנקודה D` · `CD=36`
**Guards against:** a size given on points that ride two intersecting circles (bagrut Q4: `CD=36`, ultimately `CE⟂AB` with `CD=36, DE=18`) failing "over-constrained: |CD|=36 cannot hold". Root cause (ADR-103): `recruitFreeDofs` surfaced a circle's free RADIUS but never its free CENTRE, and `ancestors` doesn't traverse a circle∩circle point — so the centres O,P were unreachable. Pinned a fixed gap apart, the circle∩circle geometry caps |CD| (~8) however large the radii grow. Fix: surface a circle's free, non-pinned centre as a drivable DOF alongside its radius. **Asserts:** all steps OK; |CD|=36 holds (verifier green); the centres spread (|OP|>8). **Known limit:** entering `CE⟂AB` BEFORE the sizes is an under-determined coupled solve that still doesn't converge — sizes must precede the ⟂ (the full-Q4 build is covered in `engine/__tests__/recruit-circle-center.test.ts`).

### `angle-equality-on-q4` — "∠EDA = ∠CBA" (angle EQUALITY) parses and holds on the Q4 figure (ADR-100)
**Steps**: `שני מעגלים נחתכים בנקודות A ו B` · `נקודה C על מעגל P` · `המשך CA חותך את מעגל O בנקודה D` · `המשך CB חותך את מעגל O בנקודה E` · `מרובע EBAD חסום במעגל O` · `∠EDA = ∠CBA`
**Guards against:** an angle EQUALITY (`∠GEC=∠CBA`, the operator's proof relations) returning not-understood — the `angle` rule needs a numeric value, so a two-angle equality fell through to the LLM. The engine already had the relation (`set-angle-ratio` k=1, as similar-triangles uses); only the parser lacked it. Fix (ADR-100): an `angleEquality` rule reads "∠ABC = ∠DEF" (Hebrew "זווית"/∠, optional coefficient "= 2∠DEF") → set-angle-ratio. Exercised with the book's part-א theorem ∠EDA=∠CBA. **Asserts:** all steps OK (no LLM); an `angle-ratio` constraint is recorded; ∠EDA=∠CBA holds in the figure; verifier clean. (Parser cases in `parser/__tests__/angle-equality.test.ts`.)

### `inscribe-existing-points-in-existing-circle` — "מרובע EBAD חסום במעגל O" when O and the vertices already exist (ADR-099)
**Steps**: `שני מעגלים נחתכים בנקודות A ו B` · `נקודה C על מעגל P` · `המשך CA חותך את מעגל O בנקודה D` · `המשך CB חותך את מעגל O בנקודה E` · `מרובע EBAD חסום במעגל O`
**Guards against:** the full bagrut Q4 (session `99j7krj3`) — the inscribe step `מרובע EBAD חסום במעגל O` weak-erroring → LLM built-nothing because the rule emitted `circumcircle(circle-O, …)` to build the circumscribing circle, but circle O ALREADY existed, so it redefined the centre O (`'O' is already defined`) and dropped the whole step. The vertices E,B,A,D are already ON circle O by their own construction. Fix (ADR-099): when the named circle already exists, assert membership per vertex (`point-on-circle`, idempotent for an on-circle point — ADR-093) + draw the polygon, never re-creating the circle. **Asserts:** all steps OK; still exactly two circles (O not duplicated); E,B,A,D on circle O; the quad EBAD drawn; the book's part-א theorem ∠EDA=∠CBA holds.

### `free-point-on-circle-both-extensions-reach-far-side` — a free C on circle P whose two "המשך" secants must each reach circle O's far side (ADR-098)
**Steps**: `שני מעגלים נחתכים בנקודות A ו B` · `נקודה C על מעגל P` · `המשך CA חותך את מעגל O בנקודה D` · `המשך CB חותך את מעגל O בנקודה E`
**Guards against:** the operator's "point C is not positioned in a place that can satisfy the input" (session `n19qmb3t`). C is a FREE point on circle P; at the default placement C is outside circle O, so on line CB the far crossing IS B and the only other crossing falls BETWEEN C and B — E on the near side, `המשך` (beyond B) violated, yet the figure showed green. Three gaps (ADR-098): the `extend-onto-circle` shared-endpoint branch recorded no directional intent; C's free θ was sampled blind to it; the verifier re-derived neither membership nor order. Fix (sample/gate, never drive): the verifier flags a wrong-side figure (amber), the sampler/"show another" gate on a clean extension margin, and the app auto-advances the seed to a configuration where BOTH extensions reach the far side. **Asserts:** all steps OK; D,E on circle O; D beyond A and E beyond B; neither collapsed onto the shared crossing; verifier clean. A companion store-path test `free-on-circle-extensions-auto-advance` checks `execute` auto-advances the seed.

### `diameter-from-point-cuts-side-onto-segment` — "the diameter from F cuts side AC at E" lands E ON the segment (ADR-077)
**Steps**: `משולש ABC ישר זוית` · `נקודות F, G, H נמצאות על הצלעות AB, AC, BC` · `מרובע GCHF חסום במעגל` · `AB משיק למעגל בנקודה F` · `קוטר המעגל היוצא מנקודה F חותך את הצלע AC בנקודה E`
**Guards against:** TWO bugs (ADR-077). The "קוטר … חותך …" phrasing escalating to the LLM and building nothing (`lineLineIntersection` `stop`s on "קוטר"; no diameter-cuts-a-side rule); and the line∩line crossing landing E on the *continuation* of AC (s≈1.148) instead of the segment, because nothing constrained the crossing to the side. Fix: a `diameterCutsSegment` rule emits the diameter-line (F–O) ∩ line AC PLUS `set-line [A,E,C]` (E between A and C), so the figure FLEXES a free DOF (the triangle reshapes, F moving with it) to bring E onto the side. **Asserts:** all steps OK (no LLM); E on segment AC (s∈[0,1]); E collinear with F,O (on the diameter); givens verifier clean.

### `existing-line-tangent-adapts-the-circle` — "AB tangent at F" on an EXISTING line flexes the circle (ADR-075 + ADR-076)
**Steps**: `משולש ABC ישר זוית` · `נקודות F, G, H נמצאות על הישרים AB, AC, CB` · `מרובע GCHF חסום במעגל` · `AB משיק למעגל בנקודה F`
**Guards against:** TWO bugs from the same figure. (ADR-076) the "F, G, H on AB, AC, CB" step escalating to the LLM and building nothing — there was no deterministic rule for N points placed pairwise on N segments; it now parses to three `point-on-segment` (both "הישרים"/lines and "הצלעות"/sides). (ADR-075) "AB tangent at F" on the existing segment AB ERRORING `unresolved dependencies for: A,B,F,G,H,O,tan-F,circle-O` — the parser treated AB as a *new* drawn tangent and re-created the triangle's vertices A,B as `point-on-line` markers on `tan-F`, closing a dependency cycle (A → tan-F → circle-O → O=circumcentre(G,C,H) → G on AC → A); and there was no path reading "existing line tangent to circle" as a circle-flexing CONSTRAINT. Fix (ADR-075): when A,B and the touch point F all pre-exist, emit `set-perpendicular(O,F,A,B)` — the radius ⟂ the existing line, i.e. tangency. **Asserts:** all steps OK (no LLM); F,G,H placed; radius O–F ⟂ AB (cos∠≈0); |OF| = circumradius (F on the circle); givens verifier clean.

### `r7-concyclic-after-competing-distances` — "ABHD concyclic" holds after HF=4/GE=5 (R7 joint re-bind, ADR-045)
**Steps**: `מקבילית ABCD` · `F על המשך הצלע AB` · `E על המשך הצלע BA` · `FE` · `EC חותך את AD בנקודה G` · `FD חותך את הצלע BC בנקודה H` · `HF=4` · `GE=5` · `מרובע ABHD בר חסימה במעגל`
**Guards against:** a later constraint falsely reporting "over-constrained" because earlier constraints (HF=4, GE=5) greedily claimed every free DOF it could reach (the R7 binding bug — the figure had 6 DOF and the constraint builds fine alone). Fix (ADR-045 amendment): the joint re-bind re-points one over-subscribed claimed DOF so the new constraint joins the joint solve. **Asserts:** all steps OK; ABHD genuinely concyclic (D on the circumcircle of A,B,H); HF=4 and GE=5 still hold.

### `r7-equal-after-competing-distances` — "BH=FH" holds after HF=4/GE=5 (R7 joint re-bind, ADR-045)
**Steps**: same figure, ending in `BH=FH` instead.
**Guards against:** the same R7 binding bug for an equal-length constraint. **Asserts:** all steps OK; |BH|=|FH|; HF=4 and GE=5 preserved.

### `triangle-circumscribes-circle-is-incircle` — "משולש DEF חוסם את המעגל" is the incircle (ADR-066)
**Steps**: `משולש DEF חוסם את המעגל`
**Guards against:** the triangle-first "circumscribes" phrasing being misparsed to a circumcircle (circle through D,E,F). Fix (ADR-066): the `incircle` rule matches it (ordered, so a circle-first "מעגל חוסם משולש" stays a circumcircle). **Asserts:** all steps OK; the incircle's tangency point G lies on side DE; the inradius to DF equals the inradius to DE.

### `incircle-has-three-tangency-points` — the incircle marks all three touch points (ADR-151)
**Steps**: `משולש ABC` · `משולש ABC חוסם מעגל`
**Guards against:** the general incircle branch materialising only the single radius foot, so a student saw one tangency mark instead of three. Fix (ADR-151): build a ⟂ foot on each of the three sides (F on AB, G on BC, H on CA); F also defines the radius, the other two land on the circle automatically (the incentre is equidistant). **Asserts:** all steps OK; each foot lies on its side; all three feet are the same distance from the incentre (on the circle).

### `bagrut-q4-tangent-secant-perpendicular` — the real textbook figure, with its symbolic given (ADR-069)
**Steps**: `מעגל שרדיוסו R ומרכזו O` · `מנקודה A יוצא משיק למעגל בנקודה B` · `המשך AO חותך את המעגל בנקודות C ו D` · `G על המשך DB` · `DG` · `AG⊥AD` · `∠ADB=α`
**Guards against:** the claim that the engine can't build a real bagrut problem. It can — with the book's OWN given, the SYMBOLIC `∠ADB=α` (a label, not a number). The operator's numeric experiments (AG=8 AND AC=0.5DC) over-constrained a shape-determined figure; the α-labelled form builds. Also exercises lineCutsCircleTwice (ADR-068) + the now-free external apex (ADR-069). **Asserts:** all steps OK; C,D on the circle and on line AO; AG ⟂ AD; D, B, G collinear.

### `bagrut-q4-numeric-angle-drives-the-figure` — NUMERIC ∠ADB=30 flexes the figure (R7 binding, ADR-073)
**Steps**: same figure as above, ending `∠ADB=30` (a NUMBER, not α).
**Guards against:** the figure staying rigid at the seed (19.86°) and reporting `over-constrained: ∠ADB = 30° cannot hold` — a R7 BINDING failure: the greedy `AG⊥AD` claimed the free apex A, and `G על המשך DB` froze G at the default extension t=1.3, so ∠ADB had no DOF (the solve itself converges fine once a DOF is free). Fix (ADR-073): on the failure path the recruit FREES THE BLOCKER — re-points AG⊥AD to its recruitable default-extension operand G and releases A for ∠ADB — then the joint solve reaches the stated angle. ADR-064 is untouched (it succeeds eagerly, never reaching the recruit). **Asserts:** all steps OK; ∠ADB = 30°; AG ⟂ AD; D,B,G collinear; C,D on the circle and on line AO.

### `line-through-center-and-secant` (unit: line-through-center-and-secant.test.ts) — no phantom circle; named line cuts twice (ADR-068)
**Steps**: parse `ישר AD עובר דרך מרכז המעגל` (no phantom circle) + `AO חותך את המעגל בנקודות C ו-D` (builds the secant).
**Guards against:** (1) a centre reference ("מרכז המעגל") auto-creating a phantom circle P; (2) a named line cutting the circle at two points having no rule. Fix (ADR-068): `centred` is a circle definition only with a NAMED centre; new `lineCutsCircleTwice` builds line-through + both line-circle crossings. **Asserts:** the centre-reference doesn't build a circle; the secant builds C, D on the circle, collinear with A–O; one-crossing still routes to `lineMeetsCircle`.

### `perpendicular-cuts-extension` (unit: perpendicular-cuts-extension.test.ts) — ⟂ operand never read as a plain line (ADR-067)
**Steps**: parse `המשך DB והאנך לישר AD נפגשים בנקודה G` (defers) + `האנך ל-AD בנקודה A חותך את המשך DB בנקודה G` (builds).
**Guards against:** the generic line∩line rule dropping "אנך" and reading "the perpendicular to AD" as "line AD" — which, since AD and DB share D, collapsed G onto D (degenerate, then "DG" failed). Fix (ADR-067): `lineLineIntersection` defers on a ⟂/∥ modifier; the `perpendicular … cuts … at` form accepts a "המשך"/extension target. **Asserts:** the ambiguous one-liner escalates; the explicit form builds G = (⟂ to AD at A) ∩ line DB (GA ⟂ AD, G on line DB).

### `tangential-triangle-via-llm-decomposition` — a tangent through each vertex, meeting at D E F (ADR-066)
**Steps**: `משולש ABC חסום במעגל` · `המשיק בנקודה A והמשיק בנקודה B נפגשים בנקודה D` · `…B…C…E` · `…C…A…F`
**Guards against:** the operator's long sentence ("a tangent through each vertex … meeting at D E F") having no path. It decomposes (via the LLM) into 3 two-tangent-meet lines — the building blocks now in the catalog. These canonical lines, replayed, build the tangential triangle DEF. **Asserts:** all steps OK; all six tangent segments ⟂ their radius (genuine tangents).

### `two-tangents-meet-at-a-point` — "המשיק מנקודה A והמשיק מנקודה C נפגשים בנקודה D" (ADR-066)
**Steps**: `משולש ABC חסום במעגל` · `המשיק מנקודה A והמשיק מנקודה C נפגשים בנקודה D`
**Guards against:** two tangents meeting at a point escalating to the LLM and building nothing (no tangent∩tangent rule). Fix (ADR-066): `twoTangentsMeet` builds the tangent at each on-circle point + their `line-intersection`. **Asserts:** all steps OK; DA ⟂ OA and DC ⟂ OC (each line through D is a genuine tangent).

### `symbolic-2alpha-drives-shape-not-the-fixed-point` — "2α" drives the free shape, not a fixed point (ADR-064)
**Steps**: `משולש שווה שוקיים ABC שבו AB=AC חוסם במעגל` · `נקודה D על המשך BC` · `BD` · `DA` · `∠CAD=α` · `∠BOC=2α`
**Guards against:** the operator's real α/2α bug (with the glyph): a central angle `∠BOC=2α` ERRORED "cannot place D on segment BC…" because `driveOrCheck` drove D (placed on the extension, t=1.3) to satisfy the relation. Fix (ADR-064): only a FREE on-segment point is driveable; a stated-ratio/extension point is a given, so the relation drives the triangle's free shape and D stays put. **Ground-truth correction (ADR-264 Am. 2):** step 1 used to half-parse to a bare circumcircle (the isosceles + stated pair silently dropped); with the full parse, ∠BAC=∠CAD is unsatisfiable at the seeded t with AB=AC, so the unstated extension t is legitimately driven. **Asserts:** all steps OK; ∠BOC = 2·∠CAD; |AB|=|AC| holds; D beyond C on the extension (t>1).

### `spelled-out-alpha-then-2alpha` — "alpha" / "2alpha" read as α / 2α, not 2° (ADR-063)
**Steps**: `משולש ABC` · `∠BAC=alpha` · `∠ABC=2alpha`
**Guards against:** spelled-out "alpha" missing the single-Greek-letter variable regex, so "2alpha" half-parsed to the NUMBER 2 (a 2° angle, dropping the variable) — the operator's "result is wrong". Fix (ADR-063): normalise spelled-out Greek names to symbols at the parse entry, bounded so a digit prefix ("2alpha") works but an uppercase point pair ("MU") and a longer word ("alphabet") don't. **Asserts:** all steps OK; ∠ABC = 2·∠BAC (ratio ≈ 2), and ∠ABC is not a tiny 2°.

### `chained-equality-trisects-segment` — "AL=LK=KC" trisects AC (coupled equalities, ADR-062)
**Steps**: `משולש ABC` · `L ו- K נקודות על AC` · `AL=LK=KC`
**Guards against:** the chained equality erroring "unresolved dependencies for: L, K". The parser chains it (AL=LK + LK=KC), but each equality drove a different free point referencing the other → a closed-form cycle (L needs K, K needs L). Fix (ADR-062): `resolveDriven` promotes coupled solved-on-segment points to numeric carriers and joint-solves. **Asserts:** all steps OK; AL=LK=KC, each ≈ |AC|/3 (L, K trisect AC).

### `perpendicular-cuts-segment-at-new-point` — "perpendicular to AC at K cuts AB at E" creates E + EK (ADR-061)
**Steps**: `משולש ABC` · `BA=BC` · `L ו- K נקודות על AC` · `האנך ל- AC בנקודה K חותך את AB בנקודה E`
**Guards against:** the perpendicular phrasing emitting only the line and dropping "cuts AB at E" (operator: "it just drew a line") — so E was never placed and EK never drawn. Fix (ADR-061): `perpendicularLine` detects a cut clause, builds the perpendicular as scaffolding, crosses it with AB to place E, and draws segment K–E. **Asserts:** all steps OK; seg-EK drawn; E on AB; EK ⟂ AC.

### `two-points-on-one-segment` — two free points on the same segment don't collide (ADR-060)
**Steps**: `משולש ABC` · `L על AC` · `K על AC`
**Guards against:** the second point erroring with "L and K would be at the same point" (and the combined "L ו-K נקודות על AC" building nothing via the LLM). Root cause: a free point-on-segment always seeded t=0.5, so the second collided with the first. Fix (ADR-060): seed a new free point in the middle of the largest open gap among the segment's existing points (0.5, then 0.25, 0.75, …); plus a `pointsOnSegment` rule for the combined phrasing (the Hebrew "points" word needs `[א-ת]*`, not ASCII `\w`). **Asserts:** all steps OK; L ≠ K; both on segment AC.

### `extension-meet-draws-lines-to-G` — "המשך CA ו-BD נפגשים בנקודה G" draws both lines to G (ADR-054 A2)
**Steps**: `משולש ABC חסום במעגל שרדיוסו R` · `BC קוטר` · `D נקודה על המעגל על הקשת AB` · `המשך CA ו BD נפגשים בנקודה G`
**Guards against:** the crossing G being placed while the drawn segments stop at the inner points (CA, BD) — the lines not reaching G (the operator had to draw CG/BG by hand). Fix (ADR-054 A2): with an extension word present, draw each line base→G (C→G, B→G) so the inner points lie on the segments (extension visible); emit the intersection (defining G) BEFORE the segments, else a segment to a not-yet-defined G creates a stray free point ("G already defined"). Plain diagonals ("M = intersection of AC and BD") stay whole. **Asserts:** all steps OK; seg-CG & seg-BG drawn; G on line CA and line BD; A between C–G and D between B–G.

### `corner-tangent-circle-grows-to-vertex` — "C נמצאת על המעגל" grows the corner circle to reach C (ADR-057 A1)
**Steps**: `מלבן ABCD` · `AB ו- AD משיקים למעגל O` · `C נמצאת על המעגל`
**Guards against:** "point C is on the circle" building nothing (operator: "why isn't C adjusted to be on the circle?"). C is a derived rectangle vertex that can't slide onto the circle, so `point-on-circle` hit its give-up branch — but the corner circle has a FREE size DOF (the centre's slide). Fix (ADR-057 A1): when the circle's radius is set by a point T on it (`circle-through`), "P on circle" ⟺ |centre·P| = |centre·T| is pushed as an `equal` that drives the centre's free on-line offset until P lands on it, tangency preserved. Plus `pointOnCircle` now resolves a definite/unnamed circle ("על המעגל") via context. **Asserts:** all steps OK; |OC| = radius (C on the circle); still tangent to both sides (|OK| = radius; E on AB, K on AD).

### `corner-tangent-circle` — "AB ו-AD משיקים למעגל O" — a circle tangent to two sides of a corner (ADR-057)
**Steps**: `מלבן ABCD` · `AB ו- AD משיקים למעגל O`
**Guards against:** the input escalating to the LLM and building nothing (there was no engine vocabulary for a circle constrained tangent to a GIVEN line — only tangent FROM a point). Root cause was a missing primitive, not an LLM failure. Built compositionally (no engine change, like the incircle): the centre O is a FREE point on the bisector of ∠BAD (equidistant from both sides — a free-size DOF, ADR-052), the radius comes from a circle through the foot on AB (tangent there), and tangency to AD is automatic (equidistant). E, K are the ⟂ feet onto each side. **Asserts:** all steps OK; |OE| = |OK| (tangent to both at one radius); E on AB and K on AD; OE ⟂ AB and OK ⟂ AD (a tangent radius ⟂ the side).

### `perp-constraint-keeps-quad-convex` — "OD⊥AC" nudges D to the NEAR arc-midpoint, quad stays convex (ADR-056)
**Steps**: `מרובע ABCD חסום במעגל O` · `AB קוטר` · `E על המשך AD כך ש CE⊥AE` · `OD⊥AC`
**Guards against:** the last step "messing the shape up — it was good up to that point". `OD⊥AC` has two roots (the two arc-midpoints of AC, half a circle apart). D sat at ≈330° (already near-perpendicular) but the 1-DOF driven solve took `roots[0]` = the FAR root ≈148°, which falls between A and B and **crossed the quad**. Fix (ADR-056): when no order constraint rides the carrier, order roots by nearness to its current value, so D nudges to ≈328° (the smallest move). **Asserts:** all steps OK; ABCD still convex/in cyclic order around O; OD ⟂ AC actually holds (cos ≈ 0). "Show another configuration" still reaches the far root.

### `circumcircle-of-triangle-cuts-chord` — "המעגל החוסם את משולש ABC חותך את CE בנקודה D" (circumcircle ∩ a chord)
**Steps**: `מעגל` · `מנקודה A יוצאים שני משיקים למעגל בנקודות B ו C` · `∠CAB=90` · `מיתר CE` · `המעגל החוסם את משולש ABC חותך את CE בנקודה D`
**Guards against:** the input didn't parse even via the LLM. Five fixes: a new `circumcircleMeetsSegment` (circumcircle + line∩circle avoiding the shared vertex); the `triangle` rule deferring on a circumscribe phrase (and the `g`-flag `re.test` lastIndex corruption it exposed); `freeLabel` no longer reusing an existing circle's centre; `parseCtx` dropping only `~`-**scaffolding** circles (a tangent's Thales aux) while keeping a real un-drawn circle (a cyclic quad's `בר חסימה`) — so `מיתר CE` resolves unambiguously; and the coincidence check exempting `~`-scaffolding points (the circumcentre legitimately lands on the hidden Thales midpoint). **Asserts:** D placed, on line CE, distinct from C. (Also answers: yes, `מיתר CE` replaces "E on the circle" + "CE".)

### `directional-cut-drives-free-apex-from-far` / `directional-cut-works-when-apex-close` — directional `המשך` line∩line: the engine SOLVES the free apex
**Steps**: `מעגל O` · *(deterministic now)* tangents from external D touch circle O at B,C · `המשך BD חותך את המשך OC בנקודה A`
**Guards against:** `המשך` is **directional** (beyond the 2nd letter — [ADR-054](06-decisions.md#adr-054)) — A must be beyond D and beyond C. D is a **free DOF**, so the engine must SOLVE it (operator requirement: no manual repositioning). Whether the extensions meet depends on apex distance (meets when D close, ~< 1.4R; a parallel singularity sits between the close and far basins). Fix: the directional operand emits a `collinear-order` that DRIVES the free apex; AND the two-tangent construct now seeds the apex CLOSE (~1.2R) so the real figure lands clean with no driving (A=(10.7,−7.1), like the textbook). The two scenarios pin both: a far-seeded apex still gets driven to a valid A; a close apex lands clean. (An early diagnosis wrongly claimed symmetry made it impossible — it's apex-distance-dependent. Driving from a far seed lands a valid-but-ugly near-parallel A; the close default avoids it.)

### `cut-form-intersection-on-extensions` — "המשך BD חותך את המשך OC בנקודה A" → A = line BD ∩ line OC
**Steps**: `point B at (0,0)` · `point D at (2,0)` · `point O at (3,2)` · `point C at (3,1)` · `המשך BD חותך את המשך OC בנקודה A`
**Guards against:** the parser only knew "BD **and** OC intersect at A", not "BD **cuts** OC at A" (the verb *between* the two segments), so the operator's Hebrew escalated to the LLM — which rewrote it **in English** and lossily as "point A on the extension of BD and on the extension of OC"; the parser then matched only the first clause (A on BD's extension at t=1.3) and **dropped the OC half**, placing a wrong point. Fixed by adding the **cut-form** to `lineLineIntersection` (seg1 · cut-verb · seg2 · point → line∩line), so it parses deterministically and **stays Hebrew**. **Asserts:** A on line BD AND on line OC, at the true crossing (3,0) — beyond both drawn segments.
**Also fixed (UX):** an LLM-handled input now shows as ONE step row labelled by the **student's original utterance**, never the LLM's English canonical lines.

### `two-circles-mutual-tangent-secants` — bagrut: two circles tangent to each other + two secants (△ABC∼△BDA, CEDF parallelogram)
**Steps** (the operator's actual Hebrew input)
1. `שני מעגלים נחתכים בנקודות A ו B`
2. `המשיק למעגל O בנקודה A פוגש את מעגל P בנקודה D`
3. `המשיק למעגל P בנקודה B פוגש את מעגל O בנקודה C`
4. `המשך CA חותך את מעגל P בנקודה E`  *(E beyond A — strict directional `המשך`, [ADR-054](06-decisions.md#adr-054))*
5. `המשך DB חותך את מעגל O בנקודה F`  *(F beyond B)*

**Guards against:** the "tangent to circle X at P meets circle Y at Q" phrasing misparsed **twice**.
(1) It contains "tangent" + two circle names + "at", so `circlesTangent` grabbed it and made the two
circles *mutually* tangent at A — contradicting that they already **intersect** at A,B. (2) Even the
dedicated rule first missed the active verb **"פוגש"** (meets): only `נחתך/נפגש/cuts/meets` were in the
shared `INTERSECT_KW`, so the operator's "פוגש את מעגל P" still fell through to `circlesTangent` and D was
never created. Fixed: `פוגש`/`פגש` added to `INTERSECT_KW`, and a dedicated rule (before `circlesTangent`)
reads it as a tangent **line** ∩ the other circle — taking the crossing that **avoids** the shared point —
and **draws the chord**. E,F now use the **directional** `extend-onto-circle` rule ([ADR-054](06-decisions.md#adr-054)):
`המשך CA חותך מעגל P` places E *beyond A* (order C→A→E) on circle P, the figure adapting (a free radius grows)
so the extension reaches it. (Originally `המשך AC` via the order-agnostic `lineMeetsCircle`; reworded to the
strict directional form when `המשך` became directional.) **No fixed assumptions** — the only free DOFs are the
two circle radii.
**Asserts:** every step OK (no over-constraint / no mutual-tangency misparse); C,F on circle O and D,E on
circle P; AD ⟂ radius OA and CB ⟂ radius PB (tangency); C,A,E and D,B,F each collinear; no derived point
collapses onto the shared crossings A,B.

### `second-intersection-avoids-shared-point` — "E on line DB" (E,B on circle O) is the other crossing
**Steps**
1. `two circles intersect at A and B`
2. `C על מעגל O`
3. `D על מעגל P`
4. `נקודה E נמצאת על מעגל O`
5. `C על הישר AD`
6. `נקודה E נמצאת על המשך הישר DB`

**Guards against:** "E on line DB" with E and B both on circle O was modelled as a generic driven
collinearity, so the numeric solve landed on the degenerate crossing E = B or the wrong side,
seed-dependently (the operator saw both and only fixed it by cycling). It is really the second
intersection of line DB with circle O, so it becomes a line∩circle that AVOIDS the shared point B —
deterministic, never E = B (ADR-050 Amendment 2). Same for C on line AD (A on circle O).
**Asserts:** C,A,D and E,D,B each collinear; E is well away from B and C from A; both on circle O.

### `two-collinear-chain-solves` — a chain of two "line through a point" constraints solves
**Steps**
1. `שני מעגלים נחתכים בנקודות A ו-B`
2. *(LLM → `point-on-circle C circle-O`, `point-on-circle D circle-P`)*
3. `ישר AD עובר בנקודה C`
4. `E על מעגל O`
5. `ישר DB עובר בנקודה E`

**Guards against:** two collinearity constraints sharing a carrier (D fixes A,D,C; E then fixes
D,B,E — a triangular system) failed with a false `over-constrained: A,D,C collinear cannot hold`.
The joint driven solver minimised the SUM of both residuals, pulling the shared D toward both and
satisfying neither, and `multiStartSolve` discarded an accepted solution when its polish wandered into
a degenerate same-cost basin. Fixed by a binding-aware seed + keeping the best accepted candidate
through the polish (ADR-050 Amendment 1).
**Asserts:** both collinearities hold at once; D stayed on circle P (r≈3.6), E on circle O (r≈5);
neither collapsed onto A/B.

### `line-through-intersection-collinear` — "line CE passes through A" lines up C, A, E
**Steps**
1. `שני מעגלים חותכים זה את זה בנקודות A ו B`
2. `C על המעגל הימני` *(LLM → `point-on-circle C circle-P`)*
3. `E על המעגל השמאלי` *(LLM → `point-on-circle E circle-O`)*
4. `ישר CE עובר בנקודה A`

**Guards against:** the secant-through-an-intersection-point figure (two circles meet at A,B; C on
one, E on the other; line CE through A) had no expressible form — `ישר CE עובר בנקודה A` was silently
DROPPED (the LLM modelled it as "A on line CE", matching no rule), and the retry `E על המשך הצלע AC`
hit `'E' is already defined`. Both now route to the new `collinear` constraint (ADR-050): a parser
rule for the line-through phrasing, and an engine reinterpretation of a redefining "P on segment" of
an existing free point.
**Asserts:** every step applies cleanly (no drop, no redefine error); C, A, E are collinear; neither
C nor E collapsed onto A (the OTHER crossing); C stayed on its circle (r≈3.6) and E on its (r≈5).

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

### `trapezoid-dc-greater-than-ab` — "DC>AB" reshapes a trapezoid so the right side is longer
**Steps**
1. `טרפז ABCD חסום במעגל`
2. `DC>AB`

**Guards against:** session `ei99765k` — a segment-length inequality `DC>AB` escalated to the LLM
and returned not-understood. The parser only read single-letter named-measure orderings
(`measureOrder`, `α<β`), so a direct two-letter segment comparison had no rule — even though the
engine has supported `set-length-order`/`length-order` since ADR-039. The inscribed trapezoid always
drew `|AB|` longer than `|DC|` with no way to flip it. ADR-158 adds the `lengthOrder` rule.
**Asserts:** every step is `ok` **and** the inequality holds visibly — `|DC|` strictly greater than
`|AB|` with a real gap.

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

### `constrained-inscribed-quad-stays-convex` — a constrained cyclic quad draws convex, not crossed (ADR-097)
**Steps:** `מרובע BCED חסום במעגל` · `המשך BD והמשך CE נפגשים שנקודה A` · `AE=2CE` · `AD=CE`
**Guards against:** the figure drew a CROSSED (bowtie) quad while the cue read "5 DOF" and "show another configuration" said impossible. Root cause (ADR-097): the general inscribed quad pinned its vertices at the convex-default angles (`free=false` — an ADR-052 violation), so the constraint solver could only move E,D and was boxed into a crossed branch (a convex solution exists only when all four vertices are free). Fix: general-quad vertices are FREE (convex angles are a starting position); the driven solver prefers a convex branch and, on a convex-failing coupled solve, RECRUITS the polygon's free vertices so it reshapes convex.
**Asserts:** all steps OK; BCED in convex cyclic order around O; |AE| = 2·|CE| and |AD| = |CE| hold; verifier green.

### `constrained-inscribed-quad-resample` — the same figure offers different convex drawings
**Steps:** the four steps above, then press "show another configuration" repeatedly (seed > 0, via the real store + `resample()`).
**Guards against:** "5 DOF but impossible" — the pinned vertices left only similarity DOF, so resample never found a different drawing. With the vertices freed (ADR-097), resampling must surface a genuinely different drawing.
**Asserts:** resample finds ≥1 different view; every resampled configuration is **convex** and still satisfies |AE| = 2·|CE| and |AD| = |CE|.

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

### `concyclic-flexes-the-rectangle` — EABF concyclic flexes the rectangle's free size (ADR-070)
**Steps**: `מלבן ABCD` · `E על AD` · `CE חותך את האלכסון DB בנקודה F` · `EABF בר חסימה במעגל`
**Guards against:** "unresolved dependencies" (a cycle: the hidden circumcircle is built through E, F depends on E, the constraint drives E) AND a silent failure on the short default rectangle. Fix (ADR-070): route the self-coupled solved point numerically (breaks the cycle), and keep `concyclic` as a check so the recruit-DOFs fallback grows the rectangle's height (a free DOF, ADR-052) until the four points share a circle. **Asserts:** all steps OK; still a rectangle (AB⟂AD); E still on AD; EABF concyclic (F on the circumcircle of E,A,B).

### `sqrt-times-radius` — "AB=√2R" is √2·R (radius var), not a bare √2
**Steps:** `נתון מעגל O שרדיוסו R` · `מנקודה A מעבירים משיק למעגל בנקודה D` · `B נקודה על המעגל` · `AB` · `OB` · `OD` · `AO` · `∠AOD=α` · `∠AOB=β` · `AB=√2R`
**Guards against:** `measureSqrt` not being anchored to end-of-input (unlike its sibling length rules), so `AB=√2R` matched only the `√2` and **silently dropped the trailing R** (the ADR-024/026 class) — AB came out ≈ 1.414 instead of √2·R. The rule now consumes an optional trailing variable that multiplies the radical and anchors the RHS, so `√2R` ⇒ `{coef: √2, var: R}`, R bound to the circle radius (5).
**Asserts:** all steps OK; |AB| = 5√2; |OB| = 5 (B on the circle); the length label reads `√2R`.

### `point-is-meeting-of-line-with-circle` — the noun/definitional form of line∩circle
**Steps:** `מעגל O שרדיוסו R` · `נקודה A על המעגל` · `נקודה E היא מפגש של AO עם המעגל`
**Guards against:** the verb forms (`AO חותך/פוגש את המעגל בנקודה E`, `AO meets the circle at E`) worked, but the **definitional noun form** `E היא מפגש של AO עם המעגל` returned `not-handled` and escalated to the LLM. Two parser gaps: `INTERSECT_KW` lacked the **noun** `מפגש`/`meeting` (it had only the verb forms `נפגש`/`פוגש`), and `crossingAfterCircle` only finds a point named **after** the circle, whereas here E is declared **first**. Fix: `lineMeetsCircle` also accepts the noun keyword, and a new `leadingNamedPoint` helper reads the point named ahead of the construction (`[נקודה] E היא …` / `point E is …`).
**Asserts:** all steps OK; E and A are equidistant from O (both on the circle); E is a distinct crossing (not A again); A, O, E are collinear (E lies on line AO).

### `sqrt-times-free-radius` — "AB=√2R" + "BO=R" on a free-radius circle (ADR-071)
**Steps:** `מעגל O` · `מנקודה A מחוץ למעגל מעבירים משיק לנקודה D` · `B על המעגל` · `AB` · `AO` · `BO` · `DO` · `AB=√2R` · `BO=R`
**Guards against:** three stacked defects — (1) the parser dropping the trailing R in `√2R` (unanchored rule); (2) lowering freezing R to the circle's default 5 on a FREE-radius circle, turning `AB=√2R` into a fixed distance that fought the free radius (seed-fragile over-constraint, ADR-051/052); (3) the joint solver giving up. Fix (ADR-071): a first-class `length-radius` constraint that drives the radius DOF **and** the witness on-circle angle (the tangent caps the radius, so a moderate radius + the right θ satisfies it), making `BO=R` a tautology.
**Asserts:** all steps OK; |AB| = √2·|OB| (the relation holds); labels `√2R` and `R`. A companion test `sqrt-times-free-radius-allseeds` replays the same sequence across seeds 0–8 (the over-constraint was seed-dependent).

### `corner-tangent-on-existing-circle` — "AB ו AD משיקים למעגל O" where O already exists (ADR-115)
**Steps:** `ABCD דלתון - AB=AD ו BC=DC` (→LLM: quad + the two equal-pair constraints + sides) · `משולש BCD חסום במעגל O` · `AB ו AD משיקים למעגל O`
**Guards against:** `cornerTangentCircle` re-CONSTRUCTING a corner circle (free centre on the angle bisector + `circle-through` the foot) on a circle O that ALREADY exists — which re-radiused O and kicked the inscribed B,C,D off it (originally a stale-server `'O' is already defined` crash; on HEAD a verifier-amber wrong figure). Fix (ADR-115): when O exists, emit a tangency CONSTRAINT per arm — each tangent at its tip, radius O–tip ⟂ the arm.
**Asserts:** all steps OK; |OB|=|OC|=|OD| (O keeps all three members); OB⟂AB and OD⟂AD (tangent at the tips).

### `triangle-circumscribes-existing-circle` — "משולש DEF חוסם את המעגל O" where O already exists (ADR-115)
**Steps:** `משולש ABC` · `מעגל חוסם את משולש ABC` · `משולש DEF חוסם את המעגל O`
**Guards against:** the audit sibling — the `incircle` rule re-deriving the incentre (bisector∩bisector + `circle-through` the foot) on an existing circle O, re-radiusing it so A,B,C fell off. Fix (ADR-115): build the DUAL — three free touch points on O, a tangent at each, the named vertices as the pairwise tangent intersections (deterministic; the foot-on-circle alternative over-constrains the third side).
**Asserts:** all steps OK; |OA|=|OB|=|OC| (O keeps the original triangle's vertices); each side of DEF is at distance = radius from O (tangent).

### `arc-ratio-and-implicit-tangent-q4` — bagrut Q4 arc given + implicit-circle tangent (ADR-116, ADR-115 Am.)
**Steps:** `מרובע ABCD דלתון - AB=AD` (→LLM: quad + AB=AD + sides) · `משולש BCD חסום במעגל O` · `AB ו AD משיקים למעגל` (NO name) · `המשך BO חותך את המעגל בנקודה E` · `קשת DE = 2 קשת CE`
**Guards against:** two gaps from the operator's Q4 session — (1) no `קשת`/arc term for the textbook `⌢DE = 2⌢CE`; (2) the UNNAMED tangent (`למעגל`, one circle present) fell through ADR-115's named-only guard and spawned spurious tangent feet E, K + an auxiliary circle P, hijacking the label E so the constraint referenced a pinned point that "would not move". Fix: ADR-116 maps arc-measure ratios to the central-angle ratio (arc XY ≡ ∠XOY → `set-angle-ratio`); ADR-115 Am. resolves the tangent's circle implicitly (named OR the one circle) so the unnamed tangent constrains O and creates no points.
**Asserts:** all steps OK; points K and P do NOT exist (no spurious tangent circle); E is on circle O; circle O keeps its members (C, D, E, B at radius); arc DE = 2·arc CE holds (central ∠DOE = 2∠COE).

### `equilateral-triangle-inscribed` — equilateral qualifier applied to an inscribed triangle (ADR-117)
**Steps:** `ABC משולש שווה צלעות חסום במעגל`
**Guards against:** `inscribedPolygon` silently dropping the triangle shape word — it detects quad shapes (square/rhombus/…) but ignored equilateral/isosceles, and "שווה צלעות" isn't a SHAPE_LEFTOVER token, so it built a GENERIC inscribed triangle (not equilateral) instead of constraining or escalating. Fix (ADR-117): detect equilateral/isosceles and append the macros' equal-side constraints to the inscribe, flexing the on-circle vertices into shape.
**Asserts:** all steps OK; |AB|=|BC|=|CA| (equilateral); the circle's centre O exists.

### `area-absolute-sets-scale-not-shape` — a lone area sets size, keeps shape (ADR-118)
**Steps:** `ABC משולש שווה צלעות חסום במעגל` · `שטח המשולש ABC הוא 13`
**Guards against:** area being treated as a shape constraint. A lone absolute area pins the figure's SCALE (the similarity gauge), not its shape — the triangle stays equilateral, resized so its area is 13.
**Asserts:** all steps OK; |AB|=|BC|=|CA| (still equilateral); area = 13 (shoelace); the on-figure label `{ids:[A,B,C], text:'13'}` is emitted.

### `area-ratio-reshapes` — an area ratio drives a shape DOF (ADR-118)
**Steps:** `משולש ABF` · `משולש BFE` · `שטח המשולש ABF גדול פי 2 משטח המשולש BFE`
**Guards against:** the natural-language area-ratio phrasing ("גדול פי 2 מ" = 2× larger) not parsing / not reshaping. A dimensionless area ratio drives a shape DOF until it holds.
**Asserts:** all steps OK; area(ABF) = 2·area(BFE).

### `collinear-flexes-redundant-carrier-kite-tangents` — a redundant constraint lends its hoarded DOF so a collinearity solves (ADR-130)
**Steps:** `דלתון ABCD` · `משולש BCD חסום במעגל` · `AD ו AB משיקים למעגל` · `E על קשת BC` · `קשת BE שווה פעמיים קשת EC` (→LLM: `set-angle-ratio ∠BOE = 2∠EOC`) · `AC` · `E נמצאת על המשך DO`
**Guards against:** the greedy one-carrier-per-constraint solver falsely reporting `over-constrained` (and misclassifying it as a "pending — add givens" red message) on a fully-determined, solvable figure. The two tangencies claimed A,B, the kite's AB=AD/CB=CD claimed C,D, the arc-ratio claimed E — every DOF busy when the collinear `D,O,E` arrived, and the recruiter's steal only fired for an over-subscribed (≥2-carrier) constraint. The figure is solvable because the kite's AB=AD is REDUNDANT (implied by the two equal tangents from A). Fix (ADR-130): case (E) in `recruitFreeDofs` lends a reachable claimed carrier to the new constraint and accepts the first lend under which the WHOLE system evaluates valid (self-verifying).
**Asserts:** all steps OK; D,O,E collinear (E is the antipode of D); B,C,D,E all on circle O (equal radii); arc BE = 2·arc EC (∠BOE = 2∠EOC) still holds.

### `inscribed-trapezoid-stays-a-trapezoid-when-flexed` — an inscribed trapezoid keeps AB ∥ CD when flexed (ADR-131)
**Steps:** `טרפז ABCD חסום במעגל` · `המשיק למעגל בנקודה C והמשך AB נפגשים בנקודה E` · `BE=BC`
**Guards against:** the engine "forgetting it's a trapezoid" by the third step. The inscribed trapezoid encoded AB ∥ CD only as fixed starting vertex angles (non-free, no `set-parallel`), so a later given (`BE=BC`) that drove an on-circle vertex slid it off its angle and destroyed the parallelism. Fix (ADR-131, mirroring ADR-117 for triangles): emit a persistent `set-parallel(A,B,C,D)` and make the vertices FREE (the base ratio/height are unstated DOFs), so the figure flexes to satisfy later givens while AB ∥ CD persists (cyclic + parallel ⇒ isosceles automatically).
**Asserts:** all steps OK; AB ∥ CD still holds after BE=BC; B, C, D all on circle O; BE = BC satisfied.

### `unlabeled-inscribed-quad-auto-names-vertices` — a bare polygon auto-names its vertices (ADR-132)
**Steps:** `מרובע חסום במעגל`
**Guards against:** an unlabeled polygon ("quadrilateral inscribed in a circle", no vertex labels) falling through the deterministic parser to the LLM. Every polygon rule required an explicit label run (only `circle`/`מעגל` worked bare). Fix (ADR-132): a shape rule with NO labels and nothing else geometry-significant left over auto-names its vertices A,B,C,… (skipping existing points), across the standalone, inscribed, named-macro and regular-polygon families, He + En. A partial label run (`מרובע ABC`) still escalates.
**Asserts:** all steps OK; the four auto-named vertices A,B,C,D all lie on the auto-centred circle O; a quadrilateral was built.

### `emergent-parallelogram-between-segments` — a parallelogram with no polygon object is detected (ADR-162)
**Steps:** `טרפז ABCD חסום במעגל` · `E על AB` · `ED מקביל ל BC`
**Guards against:** the shape detector seeing only DECLARED polygon objects, so a parallelogram EBCD formed BETWEEN segments (sides EB=part of AB, BC, CD, DE) — never declared as a polygon — was never badged. Fix (ADR-162): a shared implicit-edge universe (drawn segments + polygon edges + on-host splits + visible-line edges) feeds emergent triangle/quad cycle detection (conservative: named special types only, simple in every sample).
**Asserts:** all steps OK; `detectShapes` includes `parallelogram` on {B,C,D,E} and the declared `isosceles-trapezoid` on {A,B,C,D}.

### `right-triangle-explicit-angle-reseats-right-vertex` — an explicit "∠ABC = 90" re-seats the right angle (ADR-163)
**Steps:** `ABC משולש ישר זוית` · `זווית ABC = 90`
**Guards against:** `right-triangle ABC` pinning the right angle at the LAST vertex C structurally (B is built ⟂ at C), so a following `זווית ABC = 90` on a different vertex collided with the structural ∠C=90 and was refused "over-constrained". WHICH vertex is the right one is UNSTATED (ADR-052), so the default must yield to the stated angle (same shape as the ADR-114 soft equal-pair). Fix (ADR-163): a position-independent `replay` pre-scan reorders the right-triangle ids so an explicitly-90° vertex becomes the structural right-angle vertex; the explicit angle then holds as a passing check.
**Asserts:** all steps OK; ∠ABC ≈ 90°.

### `single-vertex-angle-on-triangle-vertex` — "זווית B = 90" resolves arms from the figure (ADR-164)
**Steps:** `משולש ABC` · `זווית B = 90`
**Guards against:** requiring all three letters to state an angle. The parser now resolves a single-vertex angle's two arms from the figure when the vertex has EXACTLY two edges (one possible angle — here B joins A and C in triangle ABC), so ∠ABC is set to 90° without spelling all three letters. When the vertex has >2 edges the parser returns an `ambiguous-angle` clarification asking for three letters instead of guessing or escalating to the LLM (covered by `parser/__tests__/single-vertex-angle.test.ts`).
**Asserts:** all steps OK; ∠ABC ≈ 90°.

### `trapezoid-constraint-morph-flags-amber` — a constraint that morphs a trapezoid is flagged amber (ADR-165)
**Steps:** `טרפז ישר זווית ABCD` · `זווית ABC = 90`
**Guards against:** a constraint silently morphing a declared named shape into a different one shown as clean green. A right trapezoid (90/63/117/90) + `∠ABC = 90` forces the legs parallel → a rectangle (90/90/90/90). ADR-157 only guards re-declaring a different shape WORD; a constraint reshape (ADR-033) slips past. Operator decision (allow-but-flag): the figure is geometrically valid so it is NOT refused, but the givens verifier raises `figure.v.trapezoidMorph` (a declared trapezoid whose both opposite-side pairs became parallel) through the amber channel.
**Asserts:** all steps apply OK; `violations` contains `figure.v.trapezoidMorph` (so this scenario sets `expectViolations`).

### `segment-meet-lands-on-segments` — two segments meet ON the segments, not the continuation (ADR-166)
**Steps:** `ABCD מלבן` · `BCF משולש שווה צלעות` · `AED משולש שווה צלעות` · `AE ו BF נפגשים בנקודה G` · `DE ו CF נפגשים בנקודה H` (bagrut Q9)
**Guards against:** a plain segment-meet landing on the *continuation*, AND the emergent `EGFH` rhombus going undetected. The equilateral apexes E,F were sampled pointing OUTWARD, so AE,BF diverge and `line-line-intersection` placed G at the infinite-line crossing on the backward extension (param ≈ −1). Fixes (ADR-166): the parser flags a plain meet `onSeg` (no `המשך`/`הישר`) → the verifier (`figure.v.meetOnSegment`) + `meetsRequirements` require the crossing within both segments; the apex side is made an explorable REFLECTION DOF (seed high bits) so `firstSatisfyingSeed`/`findValidConfig` mirror the apexes inward. **Amendment:** shape detection now sees `EGFH` — `onHostEdges` splits an `onSeg` crossing's operand segments (G ↔ A,E,B,F), detection samples the requirement-satisfying config (`firstSatisfyingSeed`, not seed 0), and `convergedSamples` drops numerically-diverged solves so the forced rhombus isn't masked.
**Asserts:** all steps OK; G and H each land within both their segments (param ∈ (0.02, 0.98)); `detectShapes` reports `EGFH` as a rhombus.

### `emergent-shapes-through-crossings` — emergent ABH, CDG, EGFH all detected via the geometric edge model (ADR-167)
**Steps:** `מלבן ABCD` · `משולש שווה צלעות BCE` · `משולש שווה צלעות DAF` · `EC ו DF נפגשים בנקודה G` · `H = חיתוך BE ו-AF`
**Guards against:** the implicit-edge universe being a hand-maintained whitelist of point KINDS (`onHostEdges`), so an emergent shape whose sides run through a crossing built by an unlisted kind goes undetected — the "node-definition issue, again" loop (ADR-162 → ADR-166). Fix (ADR-167): `figureEdges` splits every drawn segment/polygon-edge GEOMETRICALLY — any point collinear on the carrier in every sample AND within its span in some valid config splits it, regardless of construction kind; `onHostEdges` deleted. The topological edge universe stays generous; the "forced in every sample" classifier still gates which cycles are real shapes.
**Asserts:** all steps OK; `detectShapes` reports the emergent `isosceles-triangle:ABH`, `isosceles-triangle:CDG`, and `rhombus:EGFH` (none declared as polygons); `detectRelations` reports the equal-segment classes {AH,BH,CG,DG} and {EG,EH,FG,FH}.

### `square-diagonal-right-isosceles` — a square's diagonal gives ONE "right isosceles triangle" badge, not isosceles + right (ADR-197)
**Steps:** `ריבוע ABCD` · `שטח ABCD הוא 16` · `AC`
**Guards against:** operator report (screenshot) — a square ABCD with its diagonal AC surfaced each half-triangle (ABC, ACD) as TWO separate shape badges, `משולש שווה שוקיים` + `משולש ישר זווית`, where the operator expected ONE `משולש ישר זווית ושווה שוקיים`. Root cause: `classifyTriangle` emitted a badge per orthogonal axis (equal-sides + right-angle). Fix (ADR-197): `right-isosceles-triangle` is its own `ShapeType` (mirroring `isosceles-trapezoid`/`right-trapezoid`) and `classifyTriangle` composes the two axes into the single most-specific type; the two-axis double-badging is gone everywhere (a scalene right triangle is now just `right-triangle`, not `triangle` + `right-triangle` too).
**Asserts:** all steps OK; `detectShapes` reports `right-isosceles-triangle` on {A,B,C} and {A,C,D}; no plain `isosceles-triangle` or `right-triangle` badge remains.

### `square-both-diagonals-no-phantom-kites` — a square + both diagonals produces no phantom kite badges (ADR-198)
**Steps:** `ריבוע ABCD` · `AC` · `BD` · `E = חיתוך AC ו-BD`
**Guards against:** operator report (screenshot) — a square with both diagonals meeting at E surfaced spurious kite badges (ABED, ABCE, ADCE, BCDE). Root cause: the emergent-quad degeneracy gate only rejected ZERO-area cycles; a "quad" A-B-E-D where E lies on diagonal BD keeps triangle ABD's area, so `classifyQuad` read the collinear B-E-D corner as a kite vertex. Fix (ADR-198): `isSimpleEverywhere` also rejects a STRAIGHT vertex (a corner collinear with its two neighbours) — a lower-order polygon, not a genuine quad. General: drawing both diagonals of any polygon plants their crossing on every diagonal.
**Asserts:** all steps OK; `detectShapes` reports NO `kite:*` badge; the genuine content survives (`square:ABCD`, plus the eight right-isosceles triangles incl. `ABE`, `ABC`).

---

### `generic-triangle-gets-no-badge` — a plain triangle earns no shape badge; only special shapes do (declutter, ADR-221)
**Steps:** `טרפז ABCD` · `משולש ABD`
**Guards against:** operator report (2026-07-04, latest manual test) — "the trapezoid and several triangles were not detected in the shapes. In general when detecting shapes, if there is nothing special about a triangle we don't need to show it (otherwise there are too many)." A GENERIC triangle (no forced equal side / right angle / special angle) should earn no badge — a figure sprouts many incidental triangles (diagonals, cevians, midsegments) and badging every plain one floods the panel and buries the shapes that carry a specific theorem. Before, a DECLARED generic triangle always badged while an EMERGENT one was already dropped; the fix (ADR-221) aligns the two. Nothing is lost for the theorem feed (`table.ts` reads typed `triangle` commands directly from the facts).
**Asserts:** all steps OK; `detectShapes` reports `trapezoid:ABCD` and NO generic `triangle:*` badge.

---

### `emergent-trapezoid-through-a-point-on-its-side` — a polygon whose SIDE has a point on it is now detected (collinear merge, ADR-221)
**Steps:** `מקבילית ABCD` · `E על המשך CD כך ש CD=DE` · `EA`
**Guards against:** operator report (2026-07-04, screenshot) — a parallelogram ABCD with CD extended to E (CD=DE) and EA drawn showed only `מקבילית ABCD`; the operator noted "there is also a trapezoid ABCE" (AB ∥ CD, E on line CD ⇒ AB ∥ CE). Root cause: the emergent-cycle edge graph had only ATOMIC edges, and the trapezoid's side C–E is broken by D, so the 4-cycle A-B-C-E was never enumerable. `collinearSplits` (ADR-167) splits a carrier at an interior point; nothing MERGED a collinear chain into a through-edge. Fix (ADR-221): a `collinearMerges` pass adds the through-edge C–E when D is strictly between C and E and collinear in every sample (fixpoint for longer chains), wired into `detectShapes` enumeration.
**Asserts:** all steps OK; `detectShapes` reports `parallelogram:ABCD` and an `*trapezoid:ABCE`; the generic triangle ADE stays unbadged.

---

> **Backfilled 2026-07-02 (hardening plan A6 / ADR-174):** the scenarios below were already live regression tests in the scenario corpus (now `scenarios-corpus.ts`, ADR-280) but had not been indexed here (the index had drifted behind the code). Each entry is generated from the scenario's own `title` / `steps` / `guards`. A parity test now fails CI if any scenario id is missing from this file, so the index can no longer drift.

### `name-existing-circle-centre` — "O מרכז המעגל" reveals the centre of an EXISTING inscribed circle (ADR-148 #2), without clobbering it
**Steps**: `מרובע ABCD חסום במעגל` · `O מרכז המעגל`
**Guards against:** production triage (events.jsonl, 2026-06-29, sessions 0nzwixeg/ea5dfjpr): after "מרובע ABCD חסום במעגל" (a circle with a hidden auto-centre O), "O מרכז המעגל" / "מרכז המעגל O" built nothing — the student wanted to NAME/reveal the existing centre, but there was no command for it (ADR-148 deferred #2) and re-creating the circle is idempotent. Root fix: a `name-center` command flips the circle's `autoCenter` off (centre shows, FR-RN-8) WITHOUT touching its radius (re-emitting `circle` would clobber the inscribed-circle radius spec and kick the vertices off). The parser's `nameCenter` rule emits it when the named centre already belongs to a circle; with no circle yet "O מרכז המעגל" still CREATES one (order-independent `circleCenter`).

### `re-entry-reuses-no-duplicate-circles` — Re-entering "inscribe ABCD in a circle" reuses the circle (no stacked O/P/Q); the incircle is a distinct circle
**Steps**: `מרובע ABCD חסום במעגל` · `מרובע ABCD חסום במעגל` · `מעגל חסום במרובע ABCD`
**Guards against:** operator-reported (local test): inscribe typed repeatedly then incircle showed "O and P on the same point" — each re-inscribe minted a NEW circumcircle (O, P, Q), all landing on the same circumcentre, because an auto-named centre re-picks a fresh freeLabel and defeats the deterministic-id idempotency. Root fix (ADR-156): a construct reuses an existing object satisfying its definition — re-inscribing points already on a circle reuses that circle; re-issuing the incircle reuses its deterministic bisectors. Result: ONE circumcircle + ONE incircle, no coincidence.

### `incircle-of-trapezoid-flexes-tangential` — "O הוא מרכז המעגל החסום בטרפז" — the incircle of a trapezoid; the trapezoid flexes to tangential
**Steps**: `O הוא מרכז המעגל החסום בטרפז`
**Guards against:** operator feature request (from the triage report): generalise the incircle from triangle-only to any polygon, flexing a quad to TANGENTIAL when it can. "O הוא מרכז המעגל החסום בטרפז" auto-names trapezoid ABCD + incentre O (bisectors at two adjacent vertices), drops a foot on each side, and forces the non-auto edge's foot onto the incircle so the trapezoid flexes until all four sides are tangent. The four touch points end equidistant from O (a true incircle). A rigidly pinned non-tangential quad would surface as over-constraint (operator: raise an issue) — handled by the general constraint machinery.

### `inscribed-angle-on-diameter-thales` — "זווית היקפית נשענת על הקוטר" on an existing circle → Thales: the inscribed angle on the diameter is 90°
**Steps**: `מעגל O רדיוס 5` · `זווית היקפית נשענת על הקוטר`
**Guards against:** operator feature request (from the triage report): support the inscribed-angle-on-diameter (Thales). Requires an existing circle (operator choice). Builds a diameter A–B + apex C on the circle + chords A–C, B–C, and marks ∠ACB = 90°. The right angle holds automatically for any C (Thales), so set-angle 90 is a check that draws the right-angle square.

### `altitude-from-vertex-infers-triangle` — "גובה מנקודה D" infers the opposite side from the apex's unique triangle, even with extra points present
**Steps**: `משולש ABD` · `קטע MN` · `גובה מנקודה D`
**Guards against:** production triage (events.jsonl, 2026-06-29): bare "גובה מנקודה D" / "הורד גובה מנקודה D" failed when the figure had MORE than two other points — the altitude rule's context fallback required the whole figure to be exactly apex+2. Root fix: derive the opposite side from the adjacency (ctx.neighbors) — the apex's UNIQUE triangle. Apex in 2+ triangles (ambiguous) still defers rather than guess a side (ADR-052). The well-specified "גובה מנקודה D לצלע AB" was never affected.

### `bagrut-chord-diameter-perp-session` — real production session: "AB קוטר במעגל" → "D אמצע הרדיוס OB" → "AC מיתר" → "E על המיתר AC" → "DE מקביל ל BC" → "ED=EC" → "F על AB" → "EF אנך ל AB" builds a valid figure (no step escalates)
**Steps**: `AB קוטר במעגל` · `D אמצע הרדיוס OB` · `AC מיתר` · `E על המיתר AC` · `DE מקביל ל BC` · `ED=EC` · `F על AB` · `EF אנך ל AB`
**Guards against:** Production usage analytics (2026-06-29, 57 students) showed this exact bagrut flow was the dominant FAILING session. Three deterministic gaps fixed: (1) "E על המיתר AC" — the DEFINITE article "המיתר" was missing from CARRIER_NOUN (only bare "מיתר" had ה?), so the point-on-chord rule dropped the rider E; (2) "AB קוטר במעגל" as an opener (A,B new, no circle yet) did not DEFINE a circle from its diameter; (3) "EF אנך ל AB" — the ⟂ constraint matched "מאונך" but not the noun form "אנך". Each step must now parse deterministically (no LLM escalation) and the assembled figure must satisfy every given.

### `equality-recruitment-not-forced` — equality-recruited carriers are sampled — "DE=EF" + "DF=DB" no longer report false "definite" angles
**Steps**: `משולש ABC חסום במעגל` · `המשיק בנקודה D והמשך AB נפגשים בנקודה E` · `AD` · `DB` · `נקודה F על AB` · `DE=EF` · `DF` · `DF=DB`
**Guards against:** operator (2026-06-27, "view relations" on this tangent/secant figure): after the two equality givens the layer printed MANY definite angle numbers on an under-determined figure. CONFIRMED real this session by an independent (engine-free) variety trace — ∠A(B,D) ranges 0.5°–114° across valid configs while DE=EF and DF=DB both hold, so the angles are NOT forced. Root cause (ADR-141, the deeper sibling of ADR-136 Am.2): `applySeed` only perturbs carriers whose `solve` is undefined/order-only, so an EQUALITY-driven parametric carrier (on-circle θ / on-segment t) was FROZEN. The two equalities removed 2 DOF but RECRUITED ~6 carriers (A,B,D,F + the centre/circle); the residual (recruited > removed) freedom hid in the frozen set, so every sample was identical and every angle read "definitive" (11 of them). Fix: perturb a driven parametric carrier about its CURRENT θ/t (keeping its `solve`) ONLY when its constraint is OVER-recruited (carriers > dofRemoved) AND the figure is genuinely under-determined (freeDofCount>0); `evaluate` re-solves to a different valid config where residual freedom exists, and snaps back in-basin where it does not (so a fully-consumed `|AB|=|AC|` does NOT flip to the mirror). Cannot introduce a false negative: re-solving stays valid, so a genuinely-forced relation still holds in every sample.

### `extension-onto-circle-side-inferred-from-circle` — bagrut Q4: a reversed "המשך BD" (typo for DB) still builds clean — the circle disambiguates the extension side
**Steps**: `שני מעגלים נחתכים בנקודות A ו B` · `המשיק למעגל O בנקודה A חותך את מעגל P בנקודה D` · `המשיק למעגל P בנקודה B חותך את מעגל O בנקודה C` · `נקודה F נמצאת על המשך הצלע BD וחותכת את מעגל O בנקודה F` · `DF` · `המשך הצלע CA חותך את מעגל P בנקודה E`
**Guards against:** operator session 1dugj1cw (bagrut Q4: two circles meet at A,B; AD tangent to the left circle at A; CB tangent to the right at B; F on the extension of BD onto the left circle; E on the extension of CA onto the right circle). The original figure has F BEYOND B (D→B→F), so the input should read "המשך DB" — but the operator wrote "המשך BD", which the parser reads as beyond D. That direction is geometrically impossible (D is on a tangent to the left circle, so always OUTSIDE it ⇒ line BD can only re-cross it behind B, never beyond D), so `firstSatisfyingSeed` could satisfy NO seed and the WHOLE figure drifted — E also landed wrong (the verifier flagged both). Root cause (ADR-142): for the SHARED-ENDPOINT extend-onto-circle (a line endpoint already on the target circle), the other crossing is UNIQUE — the side is forced by the geometry, not the BD/DB letter order. Fix: `extensionsClear` (the seed-gate) and the givens-verifier both accept the new point on EITHER extension when an endpoint is on the circle (flag only a genuinely-between point); a neither-on-circle driven extension stays strict. So the typo builds clean and the seed search finds a config where E is also beyond A.

### `obtuse-acute-angle` — "∠C קהה" (obtuse) / "∠C חדה" (acute) reshape the triangle so ∠ACB is >90° / <90°
**Steps**: `משולש ABC` · `∠C קהה`
**Guards against:** operator: "∠C קהה" (∠C is obtuse) returned not-understood — no support for זווית קהה/חדה (obtuse/acute). Added (ADR-108): a one-sided angle constraint (>90°/<90°) modelled like the ADR-039 orderings — it reshapes the figure (drives a free DOF) so the angle falls on the requested side, removing 0 DOF. The parser reads both "∠ABC קהה" and the single-vertex "∠C קהה" (arms resolved from the figure's neighbours).

### `midpoint-of-existing-on-segment-point` — "A אמצע CD" when A is ALREADY a free point on CD drives A to the midpoint, not "already defined"
**Steps**: `משולש BCD` · `A על CD` · `A אמצע CD`
**Guards against:** operator (session lqtx8fn5): A was placed on side CD ("A ו E נמצאות על הצלעות CD ו BD"), then "A אמצע CD" (A is the midpoint of CD) → weak:error → built-nothing ("'A' is already defined"). The midpoint redefinition went to `reinterpretAsConstraint`, but `freeCarrierAncestor` searched only A's ANCESTORS (C,D — free vertices, not param carriers), never A itself, so it found no carrier and gave up. Fix (ADR-107 Am.): for a `midpoint` redefinition, use A's OWN free on-segment DOF as the carrier — drive A's t to the midpoint of CD (the operator's working "AD=AC" was the manual equivalent). Scoped to `midpoint` so the collinear/second-placement reinterpretations are unaffected.

### `bisector-onto-existing-point` — "EG חוצה זוית DEF" when G already exists (placed on DF) CONSTRAINS G to the bisector, not re-creates it
**Steps**: `משולש DEF` · `G על DF` · `EG חוצה זוית DEF`
**Guards against:** operator (session 86cympns): G was placed on DF ("G על DF"), then "EG חוצה זוית DEF" (EG bisects ∠DEF) → weak:error → LLM built-nothing. The angle-bisector treatment exists, but `bisectorPlacesPoint`'s "the segment's first letter is the vertex" branch always CREATED the bisector-foot point via a line∩line — re-creating the already-placed G → "'G' is already defined". Fix (ADR-107): when that foot point ALREADY EXISTS, emit the bisector CONSTRAINT instead — ∠(D,E,G) = ∠(G,E,F) (set-angle-ratio k=1) — which drives the existing G (on its segment DOF) onto the bisector. (Distilled to the core figure; the operator's full figure added a rhombus + ratios around it.)

### `driven-extension-point-stays-beyond` — "E on the extension of DC" driven by ∠CAE=50 stays BEYOND C (on the extension), not pulled between D and C
**Steps**: `משולש ABC חסום במעגל O` · `D אמצע קשת BC` · `∠ABC=60` · `∠BAC=α` · *(LLM step)* · `∠CAE=50`
**Guards against:** operator (session 3yvigwa7): triangle ABC inscribed, D = arc-midpoint of BC, E on the extension of chord DC, then ∠CAE=50. E ended up BETWEEN D and C (param 0.16), not on the extension — "point E didn't respect that it needed to be after D". Root cause (ADR-105): ∠CAE=50 DRIVES E, and the driven solver searched/placed an on-segment carrier in [0,1] (the interior), ignoring that E is an EXTENSION point (t>1 by definition) — the unbounded joint optimiser then pulled E back between the endpoints to satisfy the angle. Fix: an extension on-segment carrier is searched past 1 (single-carrier range + mixed-carrier range) AND hard-clamped to t≥1.02 in setCarrierVals, so the optimiser must keep E on the extension and move the figure's OTHER free DOFs (the triangle) to satisfy the angle.

### `two-tangents-one-touch-already-exists` — "two tangents from E at A and D" where A is an existing on-circle point (a diameter endpoint)
**Steps**: `B אמצע AC` · `AB קוטר` · `מנקודה E יוצאים משיקים למעגל בנקודות A ו D`
**Guards against:** operator session: B mid AC, "AB קוטר" (circle O, A a diameter endpoint on it), then "מנקודה E יוצאים משיקים למעגל בנקודות A ו D" → ERRORED "'A' is already defined" → LLM built nothing. `tangentsFromExternal` builds the two touch points via a Thales circle∩circle, which RE-CREATES A — conflicting with the existing A (ADR-094). Fix: when EITHER touch point already exists, fall back to the tangency-CONSTRAINT form (the two-tangent generalisation of ADR-081/093): each touch P is point-on-circle (idempotent if already on it) + set-perpendicular(O,P,E,P), so both EA and ED are real tangents and the figure flexes. The all-new two-tangent case keeps the Thales construction. Verified through the real App.submit pipeline (parse → gates → execute), not just parse→replay.

### `tangent-at-a-diameter-endpoint-no-cycle` — "EA משיק למעגל בנקודה A" where A is a diameter endpoint (the circle's through-point) — no dependency cycle
**Steps**: `B אמצע AC` · `AB קוטר` · `מנקודה E מעבירים משיק למעגל בנקודה D` · `נקודה C נמצאת על המשך הצלע ED` · `EA משיק למעגל בנקודה A`
**Guards against:** operator session: B midpoint of AC, then "AB קוטר" (circle O with diameter AB, so A is the through-point defining O's radius), a tangent from E at D, C on the extension of ED, then "EA משיק למעגל בנקודה A" → ERRORED "unresolved dependencies for: A,B,O,…,circle-O,…" and the LLM built nothing. NOT a new construct — it's tangent-at-a-point (ADR-081). Root cause (ADR-093): the rule emits `point-on-circle A`, but A DEFINES circle O's radius (`circle-through` point), and `pointOnCircle` didn't recognise a through-point as on the circle, so the apply converted A to an on-circle point → A→circle-O→A cycle. Fix: `pointOnCircle` now treats a circle's through-point as on it, so `point-on-circle A` is idempotent (A is already on the circle) and only the tangency constraint (OA ⟂ EA) is added.

### `midpoint-creates-its-endpoints` — "B אמצע הקטע AC" on an empty figure creates A,C (and the segment) — B is their midpoint
**Steps**: `B אמצע הקטע AC`
**Guards against:** operator session: "B אמצע הקטע AC" on an empty figure ERRORED "unresolved dependencies for: B" and escalated to the LLM (which built nothing) — because `midpoint` (unlike `segment`) did not create its endpoints, so with A,C absent the midpoint had nothing to bisect. Root cause (ADR-091): a missing-endpoint gap, not an LLM job — "B is the midpoint of segment AC" implies the segment AC. Fix: when an endpoint is NEW, `midpoint` prepends a (idempotent) segment that creates + draws AC; when both exist it emits just the midpoint (unchanged).

### `given-diameter-defines-circle` — "AB קוטר במעגל O" with A,B already placed defines a circle on diameter AB (centre O = midpoint)
**Steps**: `B אמצע צלע AC` · `AB קוטר במעגל O`
**Guards against:** operator session: after "B אמצע צלע AC" (so A,B exist), "AB קוטר במעגל O" ERRORED "'B' is already defined" — the "במעגל" (in a circle) routed it to `diameter` (add-to-existing, which makes B an antipode), but the circle O didn't exist and A,B were GIVEN points. Bare "AB קוטר" was not-handled. Fix (ADR-092): circleOnDiameter also fires for a GIVEN diameter — both endpoints already exist AND there is no existing circle to attach to — so it defines a circle with AB as its diameter (centre = midpoint of AB), even without a define-marker. The cyclic "AD קוטר במעגל ABCD" (circle exists) and "diameter DE in circle O" (new points) still route to `diameter`.

### `diameter-in-a-circle-defined-by-centre-radius` — "AB קוטר במעגל שמרכזו O ורדיוסו R" defines a circle with AB as diameter (centre O = midpoint AB)
**Steps**: `קטע AB` · `AB קוטר במעגל שמרכזו O ורדיוסו R`
**Guards against:** operator session: "AB קוטר במעגל שמרכזו O ורדיוסו R" (AB is a diameter in a circle whose centre is O and radius R) ERRORED "'B' is already defined" — the "במעגל" (in a circle) routed it to `diameter` (add-to-existing, which makes B an antipode) although the circle was being DEFINED by its centre/radius, and A,B already existed. Fix (ADR-091): `circleOnDiameter`'s define-markers now include the centre/radius specification (שמרכזו / ורדיוסו / centered / radius) — you describe a circle's centre/radius when DEFINING it — so it builds a circle centred at the midpoint of AB. Plain "diameter X in circle O" (no centre/radius clause) still routes to `diameter`.

### `circle-defined-by-its-diameter` — "AB קוטר של מעגל O" builds a circle whose diameter is AB (centre = midpoint of AB)
**Steps**: `משולש ABC` · `AB קוטר של מעגל O`
**Guards against:** operator session: after triangle ABC, the operator tried 5+ ways to make a circle with AB as its diameter — "AB קוטר של מעגל", "AB קוטר של מעגל O", "מעגל שבו AB קוטר" — and ALL failed (the unnamed/define phrasings were not-handled; "AB קוטר של מעגל O" misrouted to the `diameter` rule which tries to re-create A as an on-circle point and ERRORED because A,B already exist). Root cause (ADR-090): there was no construct for a circle DEFINED BY its diameter — only `diameter` (adds a diameter to an EXISTING circle). Fix: a `circleOnDiameter` rule for the DEFINE phrasings (of/with/whose-diameter, He+En) → segment AB + midpoint(centre) + circle-through, so the centre is the midpoint of AB and A,B are the diameter's endpoints; works whether A,B are new or pre-existing. The add-phrasing "diameter DE in circle O" still routes to `diameter`.

### `set-circle-radius-by-value-no-segment` — "radius of circle P is 4" sets an existing circle's radius by value — no segment, no invented point
**Steps**: `משולש BDA` · `מעגל P חסום במשולש BDA` · `רדיוס מעגל P הוא 4`
**Guards against:** operator session (2026-06-22): incircle P of triangle BDA, then "רדיוס מעגל P הוא 4" → built-nothing (escalated to the LLM). To set the radius the operator had to invent a point and write "PF=4", which drew the radius segment. Fix (ADR-087): a `setRadius` parser rule + a `set-radius` engine command. For a through-radius circle (the incircle's radius is |P·foot|) it adds a distance constraint that FLEXES the figure to the stated size; for a free/length radius it sets the value. No segment is drawn and no point is invented. Fires only for an EXISTING circle (creation 'circle O radius 5' still goes to `circle`).

### `existing-vertex-on-extension-keeps-order` — "C on the continuation of DA" puts an EXISTING on-circle C beyond A (order D→A→C), not at the near intersection
**Steps**: `משולש ABC חסום במעגל` · `מנקודה D יוצא משיק למעגל בנקודה B` · `C נמצאת על המשך DA` · `DA`
**Guards against:** operator session (2026-06-22): triangle ABC inscribed, tangent at B from D, then "C נמצאת על המשך DA" (C on the continuation of DA). It aligned D,A,C but in the WRONG order — C landed BETWEEN D and A (param 0.18), not beyond A as asked. Root cause (ADR-086): `pointOnExtension` always emitted `point-on-segment … extension` (t=1.3), but C already existed as an on-circle vertex, so the apply path kept C on the circle and read it as a bare collinearity — picking the NEAR secant intersection and dropping the order. Fix: when the named point ALREADY EXISTS, emit an ORDERED collinearity `set-line [D, A, C]` instead, which drives the existing point (on whatever carrier it has — here the circle) to sit beyond the far end in order. C stays on the circle as the FAR secant point. A genuinely new point is still created on the extension.

### `inscribed-triangle-scalene-tangent-meets-CA` — inscribed triangle is scalene by default, so "tangent at B meets the extension of CA at D" builds at the default view
**Steps**: `משולש ABC חסום במעגל` · `המשיק למעגל בנקודה B והמשך CA נפגשים בנקודה D`
**Guards against:** operator session vob7kih2 (2026-06-22): triangle ABC inscribed, then the one-sentence "המשיק למעגל בנקודה B והמשך CA נפגשים בנקודה D" ERRORED "cannot construct D: lines tan-B and line-CA are parallel". Root cause (ADR-085): the inscribed triangle defaulted to ISOSCELES — pure golden-angle spacing gives 3 points two equal gaps, putting B at the arc-midpoint of AC (AB=BC), and the tangent at an arc-midpoint is EXACTLY parallel to the chord, so the deterministic line∩line had no solution at the default seed. That isosceles default is itself a fixed assumption the student never stated (ADR-052). Fix: a bounded alternating skew in `nextTheta` makes the default a GENERIC scalene triangle, so tangent@B ∦ CA and D builds. (Operator also reported D always landing on one side — fixed separately by sampling a lone on-line marker's sign, see phase-sample.test.ts.)

### `tangent-from-external-D-then-pinned-by-extension` — "from D a tangent at B" creates D on the tangent immediately; "extension of CA meets the tangent at D" pins it
**Steps**: `משולש ABC חסום במעגל` · `מנקודה D יוצא משיק למעגל בנקודה B` · `המשך CA נפגש עם המשיק בנקודה D`
**Guards against:** operator session nhm9154u / twiwst5h (2026-06-22): triangle ABC inscribed in circle O, then "מנקודה D יוצא משיק למעגל בנקודה B" (from point D a tangent touches at B) drew the tangent at B but DROPPED D (operator: "still didnt create point D and just created a tangent line"), and the defining step "המשך CA נפגש עם המשיק בנקודה D" (the extension of CA meets the tangent at D) was not-handled → escalated to the LLM → built nothing. The engine fully supports the figure (the one-sentence form already built D as a line∩line). Fix (ADR-084, operator chose "D appears at step 2"): (1) `tangentLine` creates the NAMED external apex D as a free marker ON the tangent line (point-on-line), so it shows immediately and slides; (2) a tight `extensionMeetsExistingPoint` rule reads "extension of CA meets the tangent at [existing] D" as set-line [C,A,D] — D is already on the tangent, so this only has to put it on the CA extension, which DRIVES its on-line DOF to the crossing (order C→A→D). No parse-context plumbing needed.

### `unnamed-circle-secant-full-q4` — "one circle → no name": "BD חותך את המעגל בנקודה A" (the definite "the circle") resolves to the single circle
**Steps**: `מרובע BKCD` · `KB מקביל ל CD` · `משולש KCD חסום במעגל` · `KB משיק למעגל` · `BD חותך את המעגל בנקודה A`
**Guards against:** operator principle (2026-06-22): "when there is only ONE circle in the diagram, I should not have to say its name." The full bagrut Q4 (quad BKCD, KB∥CD, triangle KCD inscribed, KB tangent, then the secant BD cutting the circle at A) couldn't be completed because the secant step "BD חותך את המעגל בנקודה A" used the DEFINITE article ("המעגל" / "the circle", no name) and returned not-handled → escalated to the LLM. Root cause: `lineMeetsCircle` / `extendOntoCircle` resolved the circle via `circleCenter` (NAMED only) AND anchored the crossing point on "circle <name>" (a name letter required after the circle word) — both failed for "the circle". Fix (ADR-083): a `resolveMentionedCircle` helper resolves the single circle when the utterance mentions a circle at all (named OR definite), and a `crossingAfterCircle` helper anchors the "at X" with the name optional. Guarded against the line∩line false-grab — an utterance mentioning NO circle still must not be read as a circle cut (see unnamed-circle.test.ts NEGATIVE case).

### `segment-tangent-no-explicit-touch-point` — "KB משיק למעגל" (tangent to the circle, NO "at K") — the touch point is inferred from the on-circle endpoint
**Steps**: `מרובע BKCD` · `KB מקביל ל CD` · `משולש KCD חסום במעגל` · `KB משיק למעגל`
**Guards against:** operator sessions xstllu0i / mmfbpvaz (2026-06-22): quad BKCD, KB ∥ CD, triangle KCD inscribed in circle O, then "KB משיק למעגל" — repeatedly reported as STILL broken after the ADR-081 fix. The ADR-081/075 endpoint-tangency paths in `tangentLine` were ALL gated behind an explicit "at X" / "בנקודה X" clause (`if (!center || !atM) return null`). The student's natural phrasing OMITS the touch point because it is geometrically forced — K is already on the circle (inscribed-triangle vertex), so the only possible tangency point IS K. With no "at" clause the rule bailed; `tangentFromExternal` also bailed (both K,B already exist → no unique external apex); so it fell through to the LLM, which returned "not-understood" / "built-nothing". The ENGINE was never the problem — fed the command it builds a true tangent (K on circle, OK⟂KB, KB∥CD, verifier clean). Fix (ADR-082): when there is no "at" clause, INFER the touch from the named segment's endpoint that is a member of THIS circle (exactly one — both endpoints on it would be a chord, not a tangent). Then the existing ADR-081 branch emits point-on-circle K + set-perpendicular(O,K,K,B).

### `tangent-meets-extension-lands-on-named-side` — "the tangent at D and the EXTENSION of AB meet at E" puts E beyond B (on AB's extension), not the wrong side
**Steps**: `משולש ABD חסום במעגל` · `המשיק למעגל בנקודה D והמשך AB נפגשים בנקודה E` · `F על AB` · `DE=FE` · `DF`
**Guards against:** operator session efm2i69l: triangle ABD inscribed, then "המשיק למעגל בנקודה D והמשך AB נפגשים בנקודה E", F on AB, DE=FE, DF. E landed beyond A (the BA side), not on the continuation of AB (beyond B) as asked. Root cause: `tangentLineIntersection` built E as a `line-intersection` on the INFINITE line A–B with NO order — so the crossing fell wherever the geometry put it (here beyond A). The directional "המשך AB" (E beyond the 2nd letter) was dropped. Fix: carry an `order:[A,B,E]` on the `line-intersection` (the proven ADR-127 mechanism, shared with `line-circle-intersection`) → a `collinear-order` whose residual folds into the joint solve, flexing the inscribed triangle so E lands beyond B in the default config — no sampler search, no perf hit, no broad `set-line`.

### `relations-layer-tangent-chord-angle` — the "view relations" layer surfaces the TANGENT-CHORD angle (∠ between tangent DE and chord DB = inscribed ∠DAB) and no FALSE relations
**Steps**: `משולש ABD חסום במעגל` · `המשיק בנקודה D והמשך AB נפגשים בנקודה E`
**Guards against:** operator session r4vs1i0y (testing the relations layer, ADR-134/136): on a free inscribed triangle ABD + a tangent at D meeting AB's extension at E, (1) the layer first reported many angles as forced that are NOT — root cause (ADR-136): the inscribed triangle's vertices had no samplable theta (ADR-052), so the shape was frozen and every angle looked invariant; fixed by making the vertices free + a scalene default, and the detector now merges same-direction rays + drops degenerate angles. (2) Then it MISSED ∠EDB = ∠DAB (the tangent-chord angle) — the angle universe was built only from segments/polygon edges, so the drawn tangent line D–E was not an "edge"; fixed by also connecting points that lie on a VISIBLE line (the tangent's touch point D + the crossing E).

### `extension-meet-draws-lines-to-G` — "המשך CA ו-BD נפגשים בנקודה G" draws BOTH lines through to the meeting point G
**Steps**: `משולש ABC חסום במעגל שרדיוסו R` · `BC קוטר` · `D נקודה על המעגל על הקשת AB` · `המשך CA ו BD נפגשים בנקודה G`
**Guards against:** the operator's figure (session): triangle ABC in a circle, BC diameter, D on arc AB, then "the extension of CA and BD meet at G". The crossing G was placed but the drawn segments stopped at the inner points (CA, BD) — the lines didn't visually REACH G, so the operator had to draw CG/BG by hand. Fix: in `lineLineIntersection`, when an extension is named (המשך/extension), draw each line from its base THROUGH to G (C→G, B→G) instead of the bare operands — and emit the intersection (which DEFINES G) BEFORE those segments, else a segment to a not-yet-defined G would create G as a stray free point and conflict ('G is already defined'). A plain diagonals crossing ("M = intersection of AC and BD", no extension) is untouched — its full segments stay whole.

### `extend-onto-tangent-line-is-rejected-clearly` — directional "המשך CA" where line CA is the TANGENT to the target circle → rejected with a clear message, no crash
**Steps**: `שני מעגלים ננחתכים בנקודות A ו- B` · `המשיק למעגל O בנקודה A חותך את מעגל P בנקודה C` · `המשיק למעגל P בנקודה B חותך את מעגל O בנקודה D` · `המשך CA חותך את מעגל O בנקודה F`
**Guards against:** the operator's actual session (jvdi4sl7) CRASHED step 4 with "A and F would be at the same point". Diagnosed from the geometry: C was defined as "tangent to circle O at A meets circle P", so line CA IS the tangent to circle O at A (cos(CA,OA)=0) — it touches O only at A, so "המשך CA חותך מעגל O" has NO second crossing F. The figure is geometrically impossible as typed, but the engine reported it via the opaque generic coincidence check. Two fixes: (1) extend-onto-circle, when an endpoint is already on the target circle, routes to a deterministic line∩circle that AVOIDS the shared endpoint (ADR-054); (2) that path, when NO fresh crossing remains (tangent / chord), now returns a CLEAR "line is tangent … no second crossing to extend onto" message instead of collapsing F onto A. This locks that the impossible input is handled GRACEFULLY (prior figure kept, clear error), never a crash.

### `redefine-existing-point-onto-circle` — redefining an existing point as "on circle P" drives it onto the circle (never a silent no-op)
**Steps**: `שני מעגלים נחתכים בנקודות A ו B` · `C על מעגל O` · `E על המשך AC` · `E על מעגל P`
**Guards against:** this is the LLM-decomposition path that produced a GREEN-but-WRONG figure. The operator typed "המשך AC חותך את מעגל P בנקודה E"; before lineMeetsCircle existed it escalated, and the LLM split it into "E על המשך AC" + "E על מעגל P". The second command (point-on-circle for the ALREADY-EXISTING E) hit addObj, which no-ops on an existing id — so the on-circle fact was SILENTLY DROPPED: every step reported ok, lastError was null, yet E sat ~7.4 from P's centre (radius 3.6), nowhere near the circle. Fixed in applyCommand: re-defining an existing on-segment/extension point as "on circle C" — when one of its line ends is also on C — becomes the SECOND crossing (line∩circle, avoiding the shared end), so E is driven onto the circle instead of dropped. (The post-evaluate verifier is the general net for any case this does not reconcile.)

### `median-ratio-drives-E` — triangle, median BD, E on BC, P = AE∩BD, then |BP|=3|PD| — slides E to satisfy it
**Steps**: `משולש ABC` · `BD תיכון לצלע AC` · `E על BC` · *(LLM step)* · `BP=3PD`
**Guards against:** a ratio constraint on a derived point P recruited the triangle vertices but the joint solver ignored the on-segment DOF (E) that actually moves P (mixed free+parametric carriers routed to the free-only solver) → over-constrained.

### `two-circles-meet-at-A-and-B` — "שני מעגלים נחתכים בנקודות A ו-B" — both circles created (overlapping) + both intersections
**Steps**: `שני מעגלים נחתכים בנקודות A ו- B`
**Guards against:** no rule for "two circles intersect at A and B" → it escalated and the LLM produced a SINGLE point G (not A AND B), and the two circles did not visibly meet. A deterministic rule now creates both circles overlapping and BOTH intersection points (the two branches).

### `two-circles-then-secant-from-A` — two circles → point C on the right circle → a secant from existing A cuts the left circle at D
**Steps**: `שני מעגלים נחתכים בנקודות A ו- B` · `C על מעגל P` · `מנקודה A ישר חותך את המעגל O בנקודות C ו-D`
**Guards against:** the LLM fallback re-parsed its canonical steps with NO figure context, so "from A a line cuts circle O at C and D" fell to the "first secant" branch (which needs an "outside" cue) and was DROPPED — "the next command failed". llmParse now threads the figure context (and accumulates ids across steps) into each re-parse, so the secant-from-an-existing-point branch fires. (Steps 2–3 are the LLM canonical lines the log recorded; parsed here with context exactly as llmParse does.)

### `oc-half-radius-sizes-the-chord` — "OC = 0.5R" sizes the chord (R auto-binds to the radius; "C אמצע מיתר AB" is the midpoint)
**Steps**: `circle centered at O radius 5` · `מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B` · `נקודה C היא אמצע מיתר AB` · `OC=0.5R`
**Guards against:** two bugs: (1) "C אמצע מיתר AB" was grabbed by the chord rule (created A,B + segment, DROPPED midpoint C) — midpoint now runs before chord; (2) the reserved radius symbol R was unbound unless declared, so "OC=0.5R" was a free label — R now auto-binds to the circle radius. Together: OC=0.5R drives the chord midpoint to half the radius.

### `kite-tangents-redundant-equality-not-over-constrained` — "דלתון ABCD" + "B,C,D on circle O" + "AB,AD tangent" no longer FALSELY over-constrains (ADR-139/140)
**Steps**: `ABCD דלתון` · `נקודות B C D על מעגל שמרכזו O` · `AB ו AD משיקים למעגל`
**Guards against:** operator session 5anuc529: the figure errored "over-constrained: |AB| = |AD| cannot hold" at the tangent step. Two root causes, both fixed: (ADR-139) the recruiter's case (B) recruited a DECOY free DOF (the apex A) for the 2nd tangency `OD⟂AD`, which set `did` (skipping the redundant-lend case (E)) AND consumed A (defeating case (D)); the fix verifies a recruit before letting it skip the self-verifying redundancy cases. (ADR-140) `point-on-circle` on the constraint-DRIVEN vertex D dropped its `solve`, so the conversion rolled back and D never reached the circle; the fix preserves the `solve`. With both, the over-constraint is GONE and AB,AD are real tangents (B,D on the circle, radius ⟂ each side, |AB|=|AD|). KNOWN PARKED LIMITATION: the parser drops "B,C,D on circle O" membership (defect a) so C is not asserted on the circle here, and the fully-membership variant does not converge in the joint solver (defect d, 0/24 seeds) — see the 2026-06-28 session-log entry. This scenario locks the recruiter+conversion half (the over-constraint fix).

### `circle-circumference-sizes-radius` — "מעגל O_1 שהיקפו 6π" (ADR-228)
**Steps**: `מעגל O_1 שהיקפו 6π`
**Guards against:** operator-reported (2026-07-05): the centre showed as "O" (the `_1` subscript was dropped — a point token is a letter + GLUED digits, so the underscore truncated the label) and the radius was not set (circumference was unhandled → escalated to the LLM, which drew a default circle). Fix A: `normalizePointSubscript` rewrites `O_1`/`O_{1}` → `O1` for every label. Fix B: a circle sized by its circumference/area lowers to a NUMERIC radius (circumference 6π ⇒ r = C/2π = 3), reusing the fixed-radius path. Asserts centre `O1`, radius via length 3.

### `polygon-perimeter-sizes-figure` — "משולש ABC" + "היקף ABC = 20" (ADR-228)
**Steps**: `משולש ABC` · `היקף ABC = 20`
**Guards against:** feature (2026-07-05): היקף is BOTH a circle's circumference and a polygon's perimeter; on a polygon it is now a first-class `perimeter` constraint (the sibling of area, ADR-118) — `set-perimeter` drives the figure so Σ of the sides equals the given, and the givens verifier re-derives and checks it. Asserts the triangle's perimeter equals 20 (verifier green).

### `tangent-circles-named-then-circumference` — "שני מעגלים O1 ו O2 משיקים מבחוץ" + "היקף מעגל O1 הוא 6pi" (ADR-228 Am.)
**Steps**: `שני מעגלים O1 ו O2 משיקים מבחוץ` · `היקף מעגל O1 הוא 6pi`
**Guards against:** operator-reported (2026-07-05): two externally-tangent circles named O1/O2, then setting O1's circumference, was refused. Three root causes: (1) the tangent-circles rule read names via a per-circle `מעגל X` regex that the PLURAL `מעגלים O1 ו O2` broke (the `ים` suffix stops the adjacency) → O1/O2 dropped, O/P invented, so circle O1 never existed; (2) circumference on an EXISTING circle fell to the `circle` CREATION rule (re-emitted circle → addObj ignores → size dropped) — now emits `set-radius`; (3) `6pi` (the word) read as 6, not 6π. Asserts circles keep names O1/O2, O1 radius = 3, pair stays externally tangent (on the published circle map, what the renderer draws).

### `tangent-circles-both-radii-pinned-by-size` — "…משיקים מבחוץ" + "היקף מעגל O1 = 6π" + "שטח O2 = 81π" (ADR-228 Am.3)
**Steps**: `שני מעגלים O1 ו O2 משיקים מבחוץ` · `היקף מעגל O1 הוא 6π` · `שטח O2 הוא 81π`
**Guards against:** operator-reported (2026-07-05): pinning BOTH tangent-circle radii (circumference on O1, area on O2) over-constrained with "M/E coincides with ~touch-M cannot hold" (also read as "an error when changing M to E" — the rename made the message say E). The free-radius tangency `coincide` is driven by whichever radius is FREE; pinning the second left it with no carrier though a free CENTRE can satisfy |O1O2|=r1+r2. Fix (ADR-228 Am.3): `set-radius` recruits a free centre when it pins the last free-radius tangency driver. Also: bare "שטח O2" (no "מעגל") resolves the known circle. Asserts O1 r=3, O2 r=9, stays externally tangent (|O1O2|=12), no error.

### `line-through-both-centres-avoids-tangency-point` — "…בנקודה E" + on-circle A/B + "AB עובר דרך מרכזי המעגלים" (ADR-228 Am.4)
**Steps**: `שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה E` · `היקף O1 הוא 6π` · `שטח O2 הוא 81π` · `A על מעגל O1` · `B על מעגל O2` · `AB עובר דרך מרכזי המעגלים`
**Guards against:** operator-reported (2026-07-05): the last step placed A AND B onto the tangency point E (on the centre line and on both circles), with no warning; it also didn't parse (escalated to the LLM). Fix (ADR-228 Am.4): `lineThroughCenters` parses it to an ORDERED `set-line [A, centreOfA, centreOfB, B]` so each endpoint sits at the FAR intersection of the centre line with its own circle — A, B distinct at the diameter ends. Asserts A, B, E all distinct, A–O1–O2–B collinear, radii 3 & 9.

### `two-tangents-apex-collinear-with-pinned-point` — bagrut Q11 end-to-end (ADR-229)
**Steps**: `שני מעגלים O1 ו O2 משיקים מבחוץ` · `A על מעגל O1` · `C על מעגל O2` · `AC עובר דרך O1 ו O2` · `היקף מעגל O1 הוא 6π` · `שטח מעגל O2 = 81π` · `מנקודה B יוצאים שני משיקים למעגל O2 בנקודות C ו D` · `A נמצא על המשך BD`
**Guards against:** the coupled "one point, two conditions" class: the apex B, claimed by one tangency (⟂ at the fixed C), has a spare DOF along the tangent line that the final collinear (A on extension of BD) must consume — the one-constraint-per-carrier model read it as over-constrained, and a naive joint co-drive destabilised the unrelated circles-tangency at E. ADR-229 freeze-and-co-drive: bake the valid partial solution, re-drive only the constraint's own carriers (host carries the new constraint via `solve.also`), freeze the rest, multi-start the host. Asserts the closed-form solution |AB|=30, |BC|=18, |AD|=12, |AC|=24, A-B-D collinear, D on O2.

### `tangent-circle-size-given-drives-radius-not-centre` — size given on a tangency radius (ADR-230)
**Steps**: `שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M` · `O1M=9` · `O2M=16` · `מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B`
**Guards against:** operator session `gzswxmq3` (dev debug log): with M the touch point, `O1M=9`/`O2M=16` are the two radii, then two tangents from N to O1 at M and B — the tangent step over-constrained (`|O1M|=9 cannot hold`) and the 2nd tangent came out non-perpendicular. Root cause (ADR-230): a `set-distance |centre·P|` (P on the circle) is a RADIUS given, but the free radius was busy driving the tangency coincide, so `driveOrCheck` fell through to the useless free CENTRE, bloating the solve to 6 coupled DOF. Fix: route a size given on a BUSY tangency radius to the radius (pin it) and hand the centre-gap to a free centre; an AVAILABLE free radius (intersecting circles) stays flexible. Asserts all steps ok, |O1M|=9, |O2M|=16, both tangents genuinely ⟂ to the radius.

### `existing-point-statements-lower-to-constraints` — a statement about an existing point is a constraint, never "already defined" (M1, ADR-231)
**Steps**: `טרפז ABCD חסום במעגל` · `טרפז BCED` · `המשכי CE ו CD נפגשים בנקודה A` · `BA` · `AC` · `O מרכז מעגל חסום במשולש ABC` · `O על ED`
**Guards against:** operator prod session `fn34ptei` (2026-07-06): "O על ED" and the incircle re-statement both crashed `'O' is already defined` — in EITHER entry order — the fifth reported member of the ADR-075/099/115/119/124 class. The ADR-028/050 reinterpretation mechanism was gated (param-carrier-only, no recruit on the conflict branch); M1 widens it to any existing point, adds the standard recruit failure path, and reports the RELATION on failure. This exact sequence contains a genuinely degenerate step (CE and CD share C), so the lock asserts the honest-error class: no status ever matches "already defined", the failure names the relation (`cannot hold`), no hidden `~` ids leak, and the prior figure is preserved. Satisfiable members are locked in `redefine-existing-point.test.ts`.

### `q11-sizes-last-order-independence` — the reversed Q11 builds to the same closed form (ADR-231)
**Steps**: `שני מעגלים O1 ו O2 משיקים מבחוץ` · `A על מעגל O1` · `C על מעגל O2` · `AC עובר דרך O1 ו O2` · `מנקודה B יוצאים שני משיקים למעגל O2 בנקודות C ו D` · `A נמצא על המשך BD` · `היקף מעגל O1 הוא 6π` · `שטח מעגל O2 = 81π`
**Guards against:** review F1 (2026-07-06, probed): the same Q11 givens with the sizes typed LAST failed `over-constrained` while sizes-first built — entry order changed satisfiability, breaking ADR-104's commitment. Fixes: structural deferrable predicate (`set-radius`/area/perimeter were missing from the hand list), unowned-coincide re-home through the recruiter, the (F)-bake directive restore, and the HOIST pass (a still-failed pure relation re-folds at the earliest position where its references exist — the dual of deferral). Asserts the identical closed form as the sizes-first scenario: |AB|=30, |BC|=18, |AD|=12, |AC|=24.

### `perpendicular-helper-flips-mirrored-slot` — "FD אנך ל AB" flips like "DF אנך ל AB" (ADR-231)
**Steps**: `משולש ישר זוית ABC` · (LLM) `D אמצע AB` · `FD אנך ל AB` · `AC ו FD נחתכים בנקודה E`
**Guards against:** review F8: the ADR-227 reflection fix granted the flip axis only to the SECOND letter of each ⟂ operand (`con.b`/`con.d`), so the mirrored phrasing kept the original bug. The anchors are now slot-free (an endpoint of one segment reflects across the other segment's line, whichever slot it occupies) and the direction-helper classifier also reads ADR-229 co-driven (`solve.also`) constraints. Asserts E lands WITHIN both segments.

### `segment-tangent-at-on-circle-endpoint-new-far-end` — "BA משיק למעגל" is the tangent AT A, not FROM A (ADR-233)
**Steps**: `משולש ACD` · `ACD חסום במעגל` · `BA משיק למעגל`
**Guards against:** operator session `pr1y4i70` (2026-07-06, "tried to create a tangent on C with no success until I changed syntax"): with A, C, D on the circle, `BA משיק למעגל` was read by `tangentFromExternal` as a tangent FROM A (the one existing label) to a NEW touch B — but A is ON the circle, so the Thales aux-circle on OA is internally tangent at A and the touch B collapsed onto A (degenerate). Root cause (ADR-233): the apex role was assigned by the proxy "it already exists" instead of the semantic fact "it is off the circle". Fix: `tangentFromExternal` defers when its would-be apex is a circle member, and `tangentLine` materialises the other named endpoint B as a ±offset slider on the tangent (nothing typed is dropped). The unclosed on-circle-endpoint + NEW-off-circle-endpoint member of the ADR-081/082 family. Asserts B is placed and distinct from A, A/C/D lie on one circle, and BA ⟂ OA (genuinely tangent at A).

### `isosceles-pin-soft-pair` — "AB=AC" after "משולש שווה שוקיים" COMMITS (pins the soft pair), not "already drawn" (ADR-234)
**Steps**: `משולש ABC שווה שוקיים` · `AB=AC` (through the App.submit-faithful gate)
**Guards against:** operator session `z4v1zza3` (2026-07-06): the isosceles draws with a SOFT default equal-pair (apex A ⇒ `|AB|=|AC|`, ADR-138) that "show equal length" correctly does NOT report (the pair is genuinely unstated, ADR-052). When the student then states `AB=AC` — specifying WHICH sides are equal — it happens to match the hidden default, so the geometry doesn't move, and `dryRunOutcome` read it as `empty` → the gate said "already on the figure — nothing to add" and dropped the student's choice. Root cause (ADR-234): stating the pair is genuine new information — it pins the soft default (soft→forced) even without a geometric delta. Fix: `dryRunOutcome` gains a semantic case (`pinsSoftVariant`) — a `set-equal` naming an enabled shape-variant's not-yet-stated pair counts as produced. Asserts: step 1 reports nothing forced; `AB=AC` classifies as COMMIT (not noop); afterward "show equal length" reports the pair and `|AB|=|AC|` holds.

### `size-given-scales-similarity-gauge-figure` — a size on a scale-free figure is a SCALE statement (ADR-237)
**Steps**: `שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M` · `מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B` · `מנקודה N יוצאים שני משיקים למעגל O2 בנקודות M ו A` · `A נמצאת על המשך BN` · `O2O1` · `O2M=9` · `O1M=16`
**Guards against:** operator session `gblq4wue` (2026-07-06, "I loaded the diagram that failed before and it is still failing"): the full two-tangent-circles bagrut figure (tangent pairs from N to BOTH circles, A-B-N collinear = the common outer tangent) refused `O2M=9` — "over-constrained: M coincides with its constructed target cannot hold" — and left it deferred forever. The ADR-230 reroute pinned r2 correctly, but `keepTangencyDriven` had no idle centre to hand the tangency gap to (O1's centre drives the collinearity, O2's a tangency ⟂), the coincide stayed owned by the one free radius (which cannot widen the gap), and the 9-DOF recruited solve never converges on what is a SIMILARITY-GAUGE move. Root cause (ADR-237): the figure's first absolute size is a statement about SCALE, satisfied in closed form by scaling every free DOF by k = stated/measured — now the step failure path's LAST resort (after the recruiter, try-and-verify, disabled by any pinned coordinate). Asserts |O2M|=9, |O1M|=16, |O1O2|=25 exactly, all four tangency ⟂s, and A-N-B collinearity.

### `shared-touch-tangents-sizes-last` — two tangent circles + tangents from N through the SHARED touch M + sizes LAST (ADR-238)
**Steps**: `שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M` · `מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B` · `מנקודה N יוצאים שני משיקים למעגל O2 בנקודות M ו A` · `A נמצאת על המשך BN` · `O1M=9` · `O2M=16`
**Guards against:** operator prod session `sq9lt4fj` (2026-07-06, "I'm trying to set radius sizes and it fails"): the 2nd size was refused ("M coincides with its constructed target cannot hold", logged `deferred-constraint` forever) and circle-O2's radius collapsed to ~0.26. Two root causes (ADR-238): **degenerate parking** — the driven solve for N (carrying "O1M ⟂ NM", a constraint with manifold slack) parked N at the regularised-nearest point of the ⟂ line, i.e. ON the touch M (the residual's own collapse point), wedging every later solve — fixed by the anti-collapse barrier RETRY in both driven solvers (basin selection only; healthy results are untouched bit-for-bit); and **HOIST gated behind `!pending`** — the order-independence rescue never ran from the `deferred-constraint` state even though the same facts sizes-first build clean — HOIST now runs from pending too (acceptance unchanged: clean AND not pending). Asserts the closed form: radii 9/16, |O1O2|=25, |NM|=|NB|=|NA|=√(r1·r2)=12, tangencies genuinely ⟂.

### `common-tangent-two-circles` — "AB משיק משותף לשני המעגלים" + the soft pairing swapped by later explicit memberships (ADR-238)
**Steps**: `שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M` · `AB משיק משותף לשני המעגלים` · `מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B` · `מנקודה N יוצאים שני משיקים למעגל O2 בנקודות M ו A` · `A נמצאת על המשך BN` · `O1M=9` · `O2M=16`
**Guards against:** operator prod session `sq9lt4fj` ("we are missing a construct of tangent to 2 circles"): the utterance had no deterministic rule (the plural מעגלים + משיק would misparse via `circlesTangent` as mutual tangency of two NEW circles) and escalated to the LLM. The `commonTangent` rule (unique "משותף"/"common" trigger, before `circlesTangent`) decomposes to on-circle touches + radius-⟂-tangent per circle + the segment; the unstated touch↔circle pairing is a `softPair` default the store pre-scan SWAPS when a later explicit membership names the opposite assignment (M4 defaults-yield, the ADR-163 pre-scan shape). Asserts the full session: pairing swapped (B on O1, A on O2), common-tangent ⟂s, sizes land, |NA|=|NB|=|NM|=12.

### `common-tangent-at-shared-touch` — "CD משיק משותף לשני המעגלים בנקודה M" (ADR-239 variant 2)
**Steps**: `שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M` · `CD משיק משותף לשני המעגלים בנקודה M`
**Guards against:** the "tangent at intersection" half of the missing-construct report: the single common tangent at the shared touch M of two tangent circles. The rule asserts M's membership on both circles + centres collinear with M (idempotent when already tangent) and draws the tangent line at M, with the naming letters C,D as ±offset markers (ADR-036/233 — nothing typed is dropped). Asserts CD ⟂ O1O2 at M on both sides.

### `m68n76e7-carrier-draw-and-typo-ratio` — stated carriers auto-draw; a typo never silently drops a stated ratio (ADR-250)
**Steps**: `משולש ABC שווה צלעות חסום במעגל` · `D על המשך הצלע BC` · `AD חותך את המעגל בנקודה E` · `שטח AEB גדול פי 2.25 משוטח משולש CED` (the typo, LLM-mocked with the corrected phrasing's own lowering)
**Guards against:** operator prod session `m68n76e7` (2026-07-07): (1) the extension and the secant placed their points but drew NONE/HALF of the stated carriers — the student hand-typed DA/DB/EC/BE to complete the drawing; now `seg-BC`+`seg-CD` (base + extension leg) and `seg-AE`+`seg-DE` (BOTH halves of the stated AD, split at E) are drawn by the parse seam (`withCarrierSegments` + the `lineMeetsCircle` fix). (2) The typo `משוטח` let the TRIANGLE rule claim the area-ratio utterance and commit a bare △AEB marked ✓ — the stated 2.25 silently dropped; `droppedGivenNumbers` (the ADR-089 numeric sibling) now flags it, the gate escalates, and the committed step carries `set-area-ratio` with S(AEB)/S(CED) ≈ 2.25 verified.

### `shared-endpoint-extension-either-side-default` — booklet-571 p.78 Q4: "המשך AC חותך את מעגל P בנקודה E" lands E beyond A (issue #19)
**Steps**: `שני מעגלים נחתכים בנקודות A ו-B` · `AD מיתר במעגל P משיק למעגל O בנקודה A` · `CB מיתר במעגל O משיק למעגל P בנקודה B` · `המשך AC חותך את מעגל P בנקודה E` (the operator typed חותר — LLM-corrected canonical line) · `CE`
**Guards against:** operator session `eew5ezi5` (2026-07-10, the ADR-124/#6 source question re-typed correctly with the NEW point E): every step showed ✓ but E landed BETWEEN C and A (t = 0.64), amber `orderBeyond` — "fails to create the C-A-E sequence". Root cause (issue #19): ADR-142's shared-endpoint either-side semantics lived only behind `extensionsClear`'s `relax` flag (set solely by `firstSatisfyingSeed`'s fallback pass), so the strict primary sweep demanded the geometrically-impossible "beyond C" at every seed (CB tangent to P pins C outside P), burned the app's 2500ms wall budget before the fallback, and `meetsRequirements`/`findValidConfig` rejected the very seed the fallback found. Fix (ADR-267): a PREFERENCE LADDER — strict letter order wins wherever achievable (the ADR-098 free-DOF family is untouched), the ADR-142 either-side bar is the acceptance tier, and `firstSatisfyingSeed` searches BOTH in one interleaved budget-safe sweep (a fallback bar must ride the same loop, never a second pass); `meetsRequirements`/`findValidConfig`/`resample`/the sample filter all honour the ladder. A companion test locks the search under the app's REAL 2500ms budget (the suite's Infinity budget is what masked this).

### `extension-cuts-bare-segment-keeps-on-segment-default` — "המשך FO חותך את AC בנקודה E" keeps E ON segment AC (issue #22, ADR-268)
**Steps**: `ABC משולש ישר זווית` · `F על AB` · `G על AC` · `H על CB` · `GCHF מרובע` · `הGCHF חסום במעגל` · `AB משיק למעגל בנקודה F` · `AB מקביל ל GH` · `CF` · `המשך FO חותך את AC בנקודה E`
**Guards against:** operator prod test 2026-07-10 (saved `figure-2026-07-10.geo (6).json`, P1): E was placed on the CONTINUATION of AC (t = 1.139, beyond C), every row ✓, zero violations — the stated bare-segment given silently violated. Root cause (ADR-268): per-operand reference semantics computed utterance-globally in `lineLineIntersection` — המשך on the FIRST operand stripped the on-segment default from the SECOND, bare operand. Now per-operand `onSeg1`/`onSeg2` (the within twin of `dir1`/`dir2`) lowers to `collinear-order [X,E,Y]`; asserts E within AC, E beyond O (F-O-E), verifier clean.

### `q4-chord-cuts-radius-textbook-nouns` — the bagrut Q4 circle figure in textbook wording (issue #17, ADR-269)
**Steps**: `AB קוטר במעגל O` · `המיתר CK חותך את הרדיוס AO בנקודה E` · `זווית EKO = זווית ABK` · `המשך הקטע KO חותך את המיתר CB בנקודה P` · `PO = 4` · `רדיוס המעגל הוא 4.8`
**Guards against:** operator prod session `wtgzh6v2` (2026-07-10): the two noun-marked cut steps failed the deterministic parse (המיתר/הרדיוס/הקטע made every cut/meet rule miss — the ADR-119 class one seam earlier) and the LLM fallback dropped the chord. Now `lineLineIntersection` stops only on diameter/tangent nouns, `withCarrierMembership` restores the chord/radius memberships (centre-ref bail scoped to diameter utterances; scaffolding segments to the new crossing excluded), and `CUT_FILLER` tolerates the nouns. Asserts E on radius AO and chord CK, P on chord CB beyond O (K-O-P), C/K/B on circle O, ∠EKO=∠ABK, |PO|=4, r=4.8.

### `bare-diameter-from-point` — "קוטר מנקודה F" with an auto-named antipode (issue #21, ADR-270)
**Steps**: the `extension-cuts-bare-segment…` figure with the workaround replaced: … `CF` · `קוטר מנקודה F` · `המשך FO חותך את AC בנקודה E`
**Guards against:** operator prod test 2026-07-10: every bare "diameter from F" form was not-handled → LLM escalation; the operator fell back to the cut-compound workaround. The `diameterFromPoint` rule (diameter word + from-marker + exactly ONE label + no cut verb) resolves the circle, asserts F's membership (M1), auto-names the antipode and emits the existing `diameter` command. Asserts D is F's antipode (|OD|=|OF|, F-O-D collinear) and the follow-up cut still lands E within AC.

### `narrow-angle-class-pickable` — the stated ∠EKO=∠ABK class is detected AND hover-pickable at the K wedge (issue #18, ADR-271)
**Steps**: the `q4-chord-cuts-radius-textbook-nouns` figure (session wtgzh6v2)
**Guards against:** "show equal sides & angles" (hover-only, ADR-167 Am. 2) could never reveal the stated equal angles: inside a wedge ≲26° every probe within the 44px vertex reach was under the 10px segment reach of the nearest ARM, and the arms (radii) are always an equal-length class — the segment stole every possible cursor position (∠EKO is 16.8°). `relationAt` now excludes an ACTIVE wedge's own arms from the segment candidates. Asserts the class {∠ABK, ∠BKO, ∠CKO} is detected and a probe on the K-wedge bisector (app-faithful reaches through the real `fitTransform`) picks the ANGLE class.

### `b13-extension-equality-no-vacuous-collapse` — "GA = AC" is never "satisfied" by collapsing A onto C (issue #7, ADR-272)
**Steps**: `triangle ABC inscribed in circle O` · `diameter BC in circle O` · `G on the extension of CA` · `GA = AC` · `line GB meets circle O at D`
**Guards against:** the ADR-243 B13 corpus ENGINE FINDING: the equality was "satisfied" by driving the free on-circle vertex A exactly onto C — a VACUOUS 0 = 0 the relative-residual cost and `isSatisfied` both reward, admitted by the failure-path accepts; the NEXT step then exploded "over-constrained: |GA| = |AC| cannot hold". `newConstraintsNonVacuous` now gates every applyStep accept (per-constraint, so ADR-123's forced coincidence with an UNreferenced point is untouched). Asserts A≠C, |GA|=|AC| genuinely, G beyond A (A the midpoint of GC), and D builds on circle O.

### `adr-124-contradictory-extension-refused-honestly` — the operator's exact contradictory sequence keeps the honest refusal (issue #6, ADR-124 unparked)
**Steps**: `שני מעגלים נחתכים בנקודות A ו-B` · `המיתר AD במעגל P משיק למעגל O בנקודה A` · `CB מיתר במעגל O משיק למעגל P בנקודה B` · `המשך CA חותך את מעגל P בנקודה D`
**Guards against:** the ADR-124 parked question, resolved by the operator's ruling (2026-07-11): "AD tangent to O at A" IS a given — so the sequence re-using the chord endpoint D as the extension target (asserting C-A-D collinear) is genuinely over-determined (proven by tangent-chord algebra + a 15k-sample engine-free sweep), and the honest over-constrained refusal is final. Asserts the last step is refused (lastError non-null), the prior figure is kept, and both stated tangencies genuinely hold. The book's correct form (a NEW point E, C-A-E) is locked by `shared-endpoint-extension-either-side-default`.

### `tangent-through-on-circle-point-binds-touch-by-membership` — "דרך הנקודה C העבירו משיק למעגל שחותך את המשך הקטע BA בנקודה E" binds the touch semantically (issue #36, ADR-275)
**Steps**: `משולש ABC חסום במעגל` · `BC קוטר` · `דרך הנקודה C העבירו משיק למעגל שחותך את המשך הקטע BA בנקודה E`
**Guards against:** operator prod session `jsptarcl` (2026-07-11): `tangentLineIntersection` bound the tangency point by POSITION (first post-keyword בנקודה label), so the book's "דרך הנקודה C העבירו משיק" phrasing — touch named BEFORE the keyword — swapped the roles (`tangent at E` + crossing id C), dragged the on-circle C to the bogus crossing and refused over-constrained. `orientTouchCut` now binds the touch to the circle MEMBER wherever it sits; positional only as the both-new tiebreak (through-carrier breaking it). Asserts C stays on circle O (the touch), EC ⟂ OC, and E on line BA beyond A (B-A-E).

### `tangent-rider-collinear-solves-own-offset` — "ישר BAE" on a tangent-riding E solves the 1-DOF crossing without disturbing the earlier givens (issue #37, ADR-276)
**Steps**: `משולש ABC חסום במעגל` · `BC קוטר` · `G על המשך CA` · `GA=AC` · `D על קשת AB` · `ישר GDB` · `S_{DBCA}/S_{GAD}=15` · `AD` · `מנקודה E יוצא משיק למעגל בנקודה C` · `ישר BAE`
**Guards against:** operator prod session `jsptarcl` (2026-07-11): the last step was refused "over-constrained: |GA| = |AC| cannot hold" after a ~24s replay. Two class fixes (ADR-276): a SATISFIED one-sided order now costs 0 in the joint solvers (`jointCostTerm` — its aim-margin gradient used to drag the joint minimum off the collinear root), and the failure path's new stage-0 (`settleOnFrozenPrior`) solves the new statement's own carriers over the FROZEN prior solution before any recruiting. Also locks blame honesty (a refusal names the NEW statement). Asserts all green, |GA|=|AC| genuinely holds, EC ⟂ OC, E on line BA beyond A. Perf lock rides the suite (replay 24.6s → 0.86s).

### `bare-segment-cuts-circle-keeps-on-segment-default` — "GB חותך את המעגל בנקודה D" lands D WITHIN GB (issue #30, ADR-277)
**Steps**: `משולש ABC חסום במעגל` · `BC קוטר` · `G על המשך CA` · `GB חותך את המעגל בנקודה D` · `GA=AC`
**Guards against:** operator prod session `jsptarcl` (2026-07-11): a bare pair means the SEGMENT (ADR-077/268), but `lineMeetsCircle` emitted the crossing with no `order`, so D defaulted onto the continuation (t≈1.27 past B), silently green. A bare pair now carries the ADR-127 `order: [a, D, b]`; `הישר`/`line` keeps the infinite-line semantics (B13 corpus asserted unchanged); sibling `lineCutsCircleTwice` swept (both crossings within a bare pair). Asserts D within GB, D on circle O, |GA|=|AC| holds. The verbatim jsptarcl composite (opening with the #31 חוסם misparse) lands with the #31 fix.

### `inscribe-existing-triangle-with-radius-symbol` — "משולש ADO חסום במעגל אחר, שרדיוסו r" builds the SECOND circle through existing points (issue #53, ADR-279)
**Steps**: `משולש ABC חסום במעגל` · `BC קוטר` · `G על המשך CA` · `GA=AC` · `D על קשת AB` · `ישר GDB` · `משולש ADO חסום במעגל אחר, שרדיוסו r`
**Guards against:** operator prod report (2026-07-11, the booklet tangent-secant question part ג): the trailing radius-symbol clause שרדיוסו r defeated the end-anchored `droppedCirclePredicate` gate, and once the circumcircle existed the ADR-156 idempotent re-inscribe branch committed a BARE `triangle ADO` — inscription AND r vanished, every row ✓. ADR-279: the `droppedRadiusSymbol` measure-symbol honesty lane + the widened `CIRCLE_PRED_TAIL` (a predicate carries its circle's qualifier/size clause) + the `sizeStatementLeftover` guard on the size rules (`setRadius` stole the numeric sibling and resized the WRONG circle). Asserts the fresh entry builds circle P through A, D, O (r stays unbound — binding is issue #54); the refusal half (a re-type never commits a bare triangle) is locked in `src/parser/__tests__/issue-53.test.ts`.

### `first-utterance-meet-of-default-segments` — מיתר CK חותך את AO בנקודה E as the FIRST utterance (#34, ADR-287)

**Guards against:** issue #34 (baseline log-triage 2026-07-11; three distinct prod users): the first-utterance compound refused "cannot construct E: lines CK and AO are parallel". Root cause: the ADR-253 general-position spin covered only 1-anchor templates — two DISJOINT default segments (both horizontal, the second a pure translation offset) were exactly parallel, so the meet had no crossing at the only composition the apply gate judges, and the ADR-255 re-seat had nothing to aim at. ADR-287 adds direction to the general-position bar for bare segment templates (0-anchor spin added; 1-anchor predicate extended; shapes keep canonical orientation). **Asserts:** all steps ok; E within segment CK and within segment AO.

### `plural-hemshekhei-extensions-meet` — המשכי CF ו DE נפגשים בנקודה G (#79, ADR-294)

**Guards against:** the plural המשכי parsing to the OPPOSITE constraint (a bare onSeg meet) because every regex keyed on the literal המשך misses the medial-kaf inflections — the recorded ADR-3D-035 kaf-class trap. **Asserts:** the operator's exact 6-step two-circles sequence builds with F between C–G and E between D–G (G really on both extensions).

### `tangent-to-circumscribing-circle` — הישר ℓ משיק בנקודה C למעגל החוסם את המשולש ABC (#82 P1, ADR-291/292)

**Guards against:** the silent tangent drop — the circumcircle rule claiming the compound, minting a duplicate circle and losing the tangent with a green row. **Asserts:** exactly one circle; the tangent `tan-C` exists; all steps ok.

### `restated-circumscription-resolves` — המעגל חוסם את CEFO after בר חסימה (#83, ADR-291)

**Guards against:** the M1 re-create class — a second coincident circle + duplicate constraint, and the guess-the-hidden-name problem. **Asserts:** one circle, now VISIBLE, zero coincidence pairs.

### `circumscribing-circle-cuts-side` — המעגל החוסם את CEFO חותך את הצלע AC בנקודה D (#81, ADR-291)

**Guards against:** the book phrasing being not-understood (3-label-only run) and the workaround minting duplicates. **Asserts:** one circle (the existing one referenced) that stays HIDDEN (#86 — scaffolding), D strictly within segment AC.

### `circumscribing-circle-cut-creation-path-hidden` — cut sentence with no prior בר חסימה creates the circle hidden (#86, ADR-291 Am.)

**Guards against:** the cut sentence's CREATION path minting a VISIBLE circumscribing circle. **Asserts:** `circumcircleMeetsSegment` creates the circle `hidden: true` (scaffolding — its role is only locating D), one circle, D within AC. The explicit «המעגל חוסם את CEFO» statement (`circumcircle` rule) still reveals its circle via `show-circle`.

### `tangent-secant-detection-honours-valid-configs` — tangent/secant figure detection hygiene (#49/#50/#88, ADR-295)

**Guards against:** the detection layers reading a false ground truth from invalid configs or scaffold objects. **Asserts (one figure, three members of the ADR-295 class):** no `~`-scaffold point in any equality class (the AO Thales midpoint split is gone, #49) while the real radii equality CO=DO and AB=AG survive; △ABD~△ACB surfaces in the similar/congruent classes once the C≡D collapse samples are dropped (#50); and the genuinely-forced ∠CAG=90° still prints on the healthy (~13-sample) pool (#88 over-suppression guard — the pool-size floor suppresses only STARVED pools, locked at the engine level in `relations.test.ts`).

### `incircle-feet-are-anonymous-not-namespace-hijack` — incircle feet are anonymous @-ids (#32, ADR-297)

**Guards against:** an auto-minted decomposition point occupying a student letter, so a later student statement binds to the invisible scaffolding. **Asserts:** the incircle's three tangency feet are ANONYMOUS promotable points (`@f-<side>` — never F/G/H), so «G על המשך CA» after the incircle creates a FRESH on-segment point on CA's extension, not a constraint on the incircle foot. The feet render as clickable dots (no label) the student promotes to a letter (locked in `promote.test.ts`).

### `radical-fraction-length-value` — נתון: BC = 35/√32 builds (#77, ADR-298)

**Guards against:** a stated radical/fraction VALUE (`35/√32`, `35/2`, `√32/5`, `5√2/3`) being unparseable, forcing a hand-computed decimal. **Asserts:** the operator's exact «נתון: BC = 35/√32» builds with |BC| = 35/√32; the shared `NUMEXPR` value atom lowers a quotient in the length/area/perimeter/radius positions and keeps the verbatim radical-fraction text (unit-tested in `radical-fraction-values.test.ts`, incl. no-theft of `12√2`/`AB=CD/2`/`√2R` and the radius/area positions + the honesty gate).

### `right-angle-word-and-glyph-forms` — ∡ glyph + ⁰ superscript right-angle (#45, ADR-299)

**Guards against:** right-angle input variants (∡/∢ glyphs, ⁰ superscript, Cyrillic homoglyph labels, the «ישרה»/«right angle» word, a lowercase vertex) failing. **Asserts:** «∡ABC=90⁰» on a triangle builds ∠ABC = 90 (the ∡→∠ + ⁰→° normalization). The word / Cyrillic / lowercase-vertex forms are locked in `right-angle-forms.test.ts`.

### `q4-external-secant-and-on-circle-parallel` — Q4 construction: מ-B secant + D על המעגל (#96/#97, ADR-300/301)

**Guards against:** the abbreviated «מ-B» external-point cue being not-handled (#96) and «D על המעגל כך ש-…» dropping the on-circle membership so D floats free (#97). **Asserts:** the bagrut 2023-קיץ-א Q4 construction builds — E, A land on circle O (secant from the abbreviated «מ-B»), D is on circle O (membership kept), and CD ∥ EA holds.

### `tangent-through-oncircle-point-then-back-reference` — 2025 bagrut: משיק דרך נקודת החיתוך A + «המשיק חותך את המעגל ב-K» (#100)

**Guards against:** the two-clause textbook tangent form failing on both clauses: «דרך הנקודה A העבירו משיק למעגל» had no touch-inference lane for a through-point that is a circle MEMBER (the touch), and the definite back-reference «המשיק חותך את מעגל P בנקודה K» had no rule at all (`lineLineIntersection` 'stop's on משיק → not-handled). **Asserts:** the operator's exact 6-step sequence (two intersecting circles, O on the big one, A = circle∩circle) builds — the tangent touches at A, K lands on the big circle away from A, and OA ⟂ AK. He/En + defer/no-theft edges locked in `issue-100.test.ts`.

### `bagrut-2025-two-circles-full-figure` — the FULL 2025 bagrut two-circle question (#54, #99, #100)

**Guards against:** the three gaps that made the question unbuildable in prod (operator report 2026-07-12): no way to name a radius with a letter or relate two radii (#54 — «רדיוס מעגל O הוא R», «R > r», «R = 1.5r»), no region disambiguator (#99 — «הנקודה E נמצאת על מעגל O בתוך המשולש KAO»), and the two-clause tangent form (#100). **Asserts:** all 11 exam utterances parse deterministically and the built figure matches the printed one — R/r ratio exactly 1.5, R>r, O and A on their circles, OA ⟂ AK with K on the big circle, E on the small circle strictly inside △KAO, and M (המשך AE ∩ OK) strictly within segment OK. Unit coverage: `radius-symbols.test.ts` (14), `region-side.test.ts` (10), `issue-100.test.ts` (9, on main).

### `bagrut-2025-verbatim-unnamed-circles` — the 2025 bagrut in its PUBLISHED wording (#102, ADR-305)

**Guards against:** the exam's unnamed-circle references «המעגל הגדול/הקטן» dead-ending (only concentric pairs resolved size qualifiers). **Asserts:** all 10 verbatim utterances parse deterministically — the first qualifier use assigns the roles from the drawn sizes AND appends the locking `set-radius-order` (the operator's "translate it to a R>r like constraint" ruling) — and the built figure matches the print: R/r = 1.5 exactly, R>r, O and A on their circles, OA ⟂ AK with K on the big circle, E on the small circle inside △KAO, M within OK. Unit coverage: `size-qualifier.test.ts` (8).

### `intersection-of-the-circles-binds-existing` — «נקודת החיתוך של המעגלים» binds the two drawn circles (#111, ADR-307)

**Guards against:** a definite plural circle reference inventing a third circle (the single-"the circle" implicit-reference existed; the two-circle plural didn't). **Asserts:** with circle O and circle P drawn, «A היא נקודת החיתוך של המעגלים» yields EXACTLY those two circles with A on both — no circle-Q. Unit coverage: `definite-two-circles.test.ts` (7).

### `extension-crossing-then-midpoint-given` — «M אמצע OK» on the AE-extension∩OK crossing (#110, ADR-308)

**Guards against:** the 2025-bagrut part-ב given «נתון כי M אמצע OK» reporting over-constrained though satisfiable — a soft `collinear-order` had over-recruited the upstream free DOF (E) and the radii, so the reinterpret couldn't reach E and the 2-D coincide couldn't be solved by a 1-D carrier. **Asserts:** the full exam + the midpoint given builds — M bisects OK (|OM|=|MK|), reached by flexing E, with E still on the small circle, K on the big circle, OA ⟂ AK, and A-E-M collinear. Unit coverage: `midpoint-of-crossing.test.ts`.

### `central-angle-valueless-and-valued` — «זוית מרכזית COD» marks/drives the angle at centre O (#106, ADR-323)

**Guards against:** the central-angle phrasings returning `not-handled` (→ LLM) — there was no central-angle construct. **Asserts:** on «מעגל O» + on-circle C, D, the utterance «זוית מרכזית COD = 80» drives ∠COD to 80° (C, D staying on the circle), draws the two radii (so the centre shows), and marks + labels the angle at O. Unit coverage: `central-angle.test.ts` (valueless → `mark-angle`; the arc-subtended form resolves the centre from `circleMembers`, defers when it can't; both locales).

### `unknown-circle-name-binds-unnamed-circle` — «מעגל O1»/«מעגל O2» bind the two unnamed circles (#186, ADR-347)

**Guards against:** prod session `hqxbjh0x` — a circle referenced by a name that matches no circle was silently INVENTED as a new circle (wrong figure, green) or left a dangling reference surfacing the raw «unresolved dependencies for: E». **Asserts:** after «שני מעגלים נחתכים» + the LLM chord placing D,F on the second circle, «D ו F על מעגל O1» binds that circle by the membership signal and «E ו C על מעגל O2» binds the sole remaining unnamed one; exactly two circles remain (`circle-O1`, `circle-O2`), all four memberships hold geometrically, and no auto centre stays hidden. Unit coverage: `circle-name-binding.test.ts`, `dangling-circle.test.ts`.

### `chord-in-the-right-circle` — «מיתר DF במעגל הימני» resolves deterministically (#188, ADR-349)

**Guards against:** a directional circle reference («המעגל הימני/השמאלי» / right|left) escalating to the LLM — the prod session hqxbjh0x utterance. **Asserts:** on two unnamed intersecting circles, the chord lands on the circle whose centre is drawn further right; every step green. Unit coverage: `directional-circle.test.ts`.

### `quarter-circle-in-right-triangle-any-end-order` — «OCD רבע מעגל» builds regardless of end-letter order (#202, ADR-354)

**Guards against:** prod sessions `cm4ak2yo`/`3yrpvz14` — the quarter circle centred at O (on AC) with ends C and D (on AB) refused `unresolved dependencies` in the OCD end order while ODC built: the C-membership converted the free vertex C into a rider of a circle whose centre rides segment AC (the ADR-093 inverted-dependency cycle). **Asserts:** the full bagrut sequence (`ABC משולש ישר זוית`, AC=15, BC=10, O על AC, D על AB, `OCD רבע מעגל`) builds all-green to the closed form |OC| = |OD| = 6 with OC ⟂ OD and D on AB. Unit coverage: `membership-cycle.test.ts`, `adr-355.test.ts`, the ADR-356 block in `arc-shapes.test.tsx`.

### `sector-DCE-angle-style-in-right-triangle` — «גזרה DCE» builds the sector, centre read angle-style (#171, ADR-357)

**Guards against:** the sector construct not existing (prod `cm4ak2yo`: «גזרה DCE» → LLM → not-understood) and the naming convention regressing. **Asserts:** on the right triangle with D on CB and E on AC, «גזרה DCE» reads the MIDDLE letter as the centre (the letters bind angle-style), sizes |CD| = |CE|, and draws the arc + both bounding radii from C. Unit coverage: `sector.test.ts` (free-angle DOF, stated 80°, reflex 200° major arc, centre-first on a bare canvas, fresh-label defaults, leftover stop).

### `sector-ODC-value-word-form` — «גזרה ODC שווה 90» parses the value word-form + O-family centre (#171, ADR-357 Am.)

**Guards against:** play-test session `9blvgg2o` — «שווה 90» was not a value marker (the stated 90 landed nowhere → honesty refusal → LLM dead end), and the centre-first run reading misread the operator's letters. **Asserts:** the right-triangle figure + «גזרה ODC שווה 90» builds with centre O, |OC| = |OD|, a 90° central angle, and the 90° arc. Unit coverage: the value-form / naming-convention / central-angle blocks in `sector.test.ts`.

### `two-circles-disjoint-operator` — «שני מעגלים זרים» draws genuinely disjoint circles (#196, ADR-358)

**Guards against:** the LLM emitting two unrelated circles drawn intersecting, all rows green (prod 2026-07-18). **Asserts:** two circles, verifier clean, centre gap > radii sum. Unit coverage: `two-circle-family.test.ts`.

### `two-circles-contained-operator` — «שני מעגלים מוכלים» draws one circle inside the other (#196, ADR-358)

**Guards against:** the LLM resizing ONE circle (the second never created — "gives me one circle"). **Asserts:** two circles, verifier clean, inner strictly inside outer. Unit coverage: `two-circle-family.test.ts`.
