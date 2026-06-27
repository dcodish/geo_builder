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
**Guards against:** the operator's real α/2α bug (with the glyph): a central angle `∠BOC=2α` ERRORED "cannot place D on segment BC…" because `driveOrCheck` drove D (placed on the extension, t=1.3) to satisfy the relation. Fix (ADR-064): only a FREE on-segment point is driveable; a stated-ratio/extension point is a given, so the relation drives the triangle's free shape and D stays put. **Asserts:** all steps OK; ∠BOC = 2·∠CAD; D stays at t≈1.3.

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
