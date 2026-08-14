# 27 — Complex-numbers tool (a sibling app): corpus reading, chassis fit, open decisions

_Drafted 2026-08-14 from an operator request: "I want to start thinking what a tool for complex numbers
would look like." The product is already **registered** as the fourth sibling
([docs/22 §9](22-workflow.md)): `src-complex/`, ADR log `06d-decisions-complex.md`, ids `ADR-CX-NNN`,
label `complex` — but until this note it had no corpus reading and no plan. Grounded in a fresh corpus
reading of **eight** 572 exams (§2) and the official formula sheet (§3), in the mold of
[19-analytic-geometry-tool.md](19-analytic-geometry-tool.md) (analytic, still PROPOSED) and
[20-space-vectors-tool.md](20-space-vectors-tool.md) (3-D, shipped). Status: **ACCEPTED,
decision-complete — D1–D5 resolved by the operator (2026-08-14, §8;
[ADR-CX-001](06d-decisions-complex.md#adr-cx-001)). No code yet; C0 (§9) is the entry point.**_

Same charter as every sibling: **the student types the givens, the tool reproduces the figure and
verifies claims — it never solves the exam question.**

---

## 1. Positioning — the Gauss plane is a drawing the exam never prints

In the modern 572/035582 format the complex-numbers question is **Q3, the closer of פרק ראשון**,
worth 33⅓ points. The [572 coverage audit](21-572-coverage-audit.md) explicitly left it out of scope
for both existing tools. The single strongest finding of the corpus reading: **no sampled exam prints a
figure for the complex question, yet almost every one requires reasoning about the Gauss plane** —
loci that turn out to be circles, roots that form regular polygons, quadrant selection, circumscribed
circles, multiplication that rotates. The exam leaves the sketch entirely to the student. A tool that
*renders* the plane as the student types the givens fills exactly the gap the exam leaves open — the
same value proposition as the 2-D builder, aimed at a question where the official paper gives the
student nothing to look at.

## 2. Corpus reading — what a complex-numbers Q3 actually is

Sampled: 2024 חורף, 2023 קיץ א, 2022 חורף, 2020 קיץ (modern 035582); 2018 קיץ (035582),
2015 חורף + 2013 קיץ (035807), 2011 חורף (035007 — older format, complex sat in פרק שני). Q3 in every
modern exam; the anatomy (givens → 3–4 chained sub-items of increasing depth) is stable across formats.

| Exam | Setup (what the student is GIVEN) | The asks |
|---|---|---|
| **2024 חורף** | `z = x+yi`; locus equation `\|6 − z̄ − 8i\|² − \|10i\| = \|9+12i\|`; then A, M (= the locus circle's center) with equal argument and `2\|z_A\| = \|z_M\|`; then a **geometric sequence** of complex numbers with `z₁ ↔ A`, `z₅ ↔ M` | show the locus is a **circle**; coordinates of A; the ratio q — **כל האפשרויות** (q⁴ = 2, all four roots); `Σ z_k·z̄_k` |
| **2023 קיץ א** | `z³ = 1/z³` (⇔ z⁶=1); z₀ the solution **ברביע הרביעי**; A,B,C represent `d·z₀`, `di·z₀`, `d·z₀⁴` (d>0 a **parameter**); area △ABC = 5d+6; `w = (z₀² − z₀⁻²)(1+i)` | pick the root by quadrant; **pin d** from the area; `\|w\|`, arg w; **minimal n** with wⁿ pure imaginary AND outside the circumscribed circle |
| **2022 חורף** | `z₁, z₂` in cartesian form with **quadratic-in-parameter** components; then `w₁ = (z₁/√2)^{4n}`, `w₂ = (z₂/√2)^{4n+2}`; locus `\|z−p\| = m` | pin a so z₁,z₂ are **conjugates**; prove **for all n**: w₁ real, w₂ pure imaginary; find p,m so the circle carries w₁,w₂ for every n (unit circle) |
| **2020 קיץ** | `z₁ = cis α`, `z₂ = cis(7α/3)`, `π/2<α<π`, quotient real; `w = z₁/z₂ + z₁z₂`; equation `z³ = w⁶` | pin α; prove product imaginary; **all** solutions of z³=w⁶; can the 3 roots be vertices of a **משושה משוכלל**? find the rest; an n>6 with the roots on a regular n-gon |
| **2018 קיץ** | `\|z₁\|=\|z₂\|=r`, `arg z₁ + arg z₂ = 90°` (constraint-defined, r a parameter); C on the line `y=x`; `z₁±z₂` given; `z₃² = 2i`; D = `z₃·(z₁z₂)²` | prove z₁z₂ pure imaginary; explain △ABC isosceles; coordinates of C and D — **שתי האפשרויות**; area of quadrilateral BDAC for the C **ברביע הראשון** |
| **2015 חורף** | the mixed-modulus equation `\|z\|·i + 2z = √3`; the solution = apex of an isosceles triangle inscribed in an **origin-centered circle**; `z₂ = 1`; `w = z₁z₂z₃` | solve; deduce z₃ from the symmetry; the sum `w + w² + … + w^{4n}` |
| **2013 קיץ** | the **same** equation `\|z\|·i + 2z = √3` (verbatim repeat of 2015) | solve; prove `z^{6n}` takes only **two values** over all natural n |
| **2011 חורף** | z₁,z₂,z₃ **on one line through the origin**, quadrant placement given, `z₁ = r₁(cos α + i sin α)` — fully symbolic | express `(z₁−z₃)/(z₂−z₃)` via the moduli |

**The archetypes** (each appears in ≥ 2 exams):

1. **Locus → recognizable curve.** `|expr(z, z̄)| = const` is a circle; membership of a line (`y=x`,
   a line through the origin); quadrant conditions. (2024, 2022, 2018, 2011)
2. **Multi-valued roots, enumerated.** `zⁿ = w`, `z₃² = 2i`, `q⁴ = 2` — with the ask phrased
   **"מצא את שתי האפשרויות / כל האפשרויות"**, and a follow-up that *selects a branch by quadrant*.
   (2018, 2020, 2023, 2024)
3. **Roots as geometry.** The solution set forms a regular polygon / inscribed triangle; asks about
   the circumscribed circle, remaining vertices, areas. (2020, 2023, 2015, 2018)
4. **A real parameter pinned by a condition.** r, a, d, α, p, m — pinned by conjugacy, an area, a
   reality condition, an argument relation. (all four modern exams)
5. **Powers with symbolic exponent n.** `w^{4n}` real **for all n**; `z^{6n}` takes two values;
   **minimal n** under argument-congruence + modulus conditions. (2022, 2023, 2015, 2013)
6. **Constraint-defined numbers.** A number given not by a value but by relations
   (`|z₁|=|z₂|=r`, arg sum, collinearity, mixed-modulus equations). (2018, 2015, 2013, 2011)

**Operation frequency:** modulus & argument 8/8 · polar↔cartesian conversion ~all · De Moivre
powers 6/8 · root extraction 4/8 · conjugate 2/8 · multiplication-by-i-as-rotation, polar quotient,
linear systems over ℂ — once each. **Fusion with neighboring topics is the norm, not the exception:**
geometric sequences (2024), triangle/quadrilateral area (2023, 2018), trig identities (2020),
parameter algebra (2022).

**Stable vocabulary** (for the parser): `מספר מרוכב`, `מישור גאוס`, `ערך מוחלט`, `ארגומנט (זווית)`,
`צמוד / צמודים זה לזה`, `מדומה טהור`, `ממשי`, `רביע ראשון/…/רביעי`, `המקום הגאומטרי`, `מעגל שמרכזו…`,
`מעגל חוסם`, `משולש שווה־שוקיים`, `מצולע/משושה משוכלל`, `קדקוד`, `פתרונות המשוואה`,
`מצא את כל האפשרויות`, `ראשית הצירים`, `הישר y=x`, `סדרה הנדסית`, `n מספר טבעי`.

## 2b. The operator's pedagogical exemplar (2026-08-14) — the capstone gate

While resolving the prototype-vs-define question the operator supplied one exam question with the
ruling: *"from a pedagogy POV, I would like the user to be able to enter the inputs from this
question and have the tool visualize the location of points and calculations."* Transcription
(operator-supplied image, [ADR-CX-002](06d-decisions-complex.md#adr-cx-002)):

> המספרים המרוכבים Z₁ ו-Z₂ נמצאים על מישור גאוס ומקיימים: arg Z₁ − arg Z₂ = 90°,
> |Z₁| = 9r, |Z₂| = 12r (r ≠ 0). המספר Z₂ נמצא ברביע הראשון ונתון: arg Z₂ < 45°.
> **א.** הביעו באמצעות r את אורך הקטע Z₁Z₂.
> **ב.** המספר המרוכב Z₃ מקיים: |Z₃| = 20r, arg Z₃ + arg Z₂ = 0°. ראשית הצירים בנקודה O.
> נתון ששטח המרובע OZ₁Z₂Z₃ הוא 150r². הביעו באמצעות r את היקף המרובע OZ₁Z₂Z₃.
> **ג.** המספרים Z₁ ו-Z₂ הם בהתאמה שני האיברים הראשונים בסדרה הנדסית שבה האיבר השלישי הוא Z₄.
> קבעו איזה סוג מרובע הוא המרובע OZ₂Z₃Z₄.
> **ד.** נתונה המשוואה: Z⁵ = Z₁·Z₂³·Z₄. קבעו כמה מפתרונות המשוואה נמצאים בתוך המרובע OZ₂Z₃Z₄,
> כמה נמצאים על המרובע וכמה נמצאים מחוץ לו.

**Why it is the capstone: it exercises all six §2 archetypes in one question.** Constraint-defined
numbers with parameter r (archetype 6) · the free angular DOF pinned by the area relation, with the
`arg Z₂ < 45°` **inequality acting as a branch selector** — sin 2θ = 0.8 has two roots in the
quadrant; the inequality prunes θ ≈ 63.4°, leaving θ = arctan ½ (archetypes 4, 2) · a
sequence-DEFINED number Z₄ = Z₂²/Z₁ (archetype 5 / D4) · quadrilateral geometry with
classification (archetype 3) · a `z⁵ = w` root constellation judged against a region (archetypes
2, 3). The designed collapse Z₁·Z₂³·Z₄ = Z₂⁵ means the five solutions are Z₂ · (fifth roots of
unity) — the plotted picture answers ד at a glance: **one solution on the quadrilateral (Z₂
itself), one inside, three outside.** That is the operator's pedagogy ruling made concrete: the
locations ARE the calculation.

**Expected figure (gate assertions):** θ = arctan ½ ≈ 26.57°; |Z₁Z₂| = 15r (the 9-12-15
triangle); perimeter of OZ₁Z₂Z₃ = 60r (sides 9r, 15r, 16r, 20r); OZ₂Z₃Z₄ is a **parallelogram**
(side vectors O→Z₂ and Z₄→Z₃ equal; sides 12r, 16r); the Z⁵ solutions lie on |Z| = 12r at 72°
spacing, counted 1 on / 1 inside / 3 outside. All linear-in-r claims verify across sampled r
(r stays a free DOF end to end — ADR-052).

**Grammar deltas this adds to the D2 v1 list** ([ADR-CX-002](06d-decisions-complex.md#adr-cx-002)):
argument **inequalities/ranges** as givens (branch selectors; quadrant givens are the special
case) · **measure claims as expressions in a parameter** (`אורך Z₁Z₂ = 15r`, `היקף … = 60r`; the
area form as a *pinning given*) · **polygon objects over represented points** including the named
origin O, with perimeter/area measures · **quadrilateral-type classification claims** (`מקבילית` —
the 2-D product's He quadrilateral lexicon reuses) · **sequence-defined numbers** (first/second/
third-term phrasing defines Z₄) · **root-vs-region counting claims** (inside / on / outside a
stated polygon).

**D1 refinement the exemplar forces:** the pinned angle arctan ½ is *not* a rational multiple of
π — so the exact-argument type is **symbolic-base-plus-rational-π-offset** (`θ₀ + k·72°` stays
exact even when θ₀ is only numeric), with the numeric fallback carrying θ₀ itself and
parameter-expression claims verified across sampled r. The rational-π family still covers the
roots-of-unity corpus; this exemplar's Pythagorean-triple family rides the fallback by design.

## 3. The formula-sheet contract (and why it is good news)

The official 5-unit formula sheet (`5-MATH-Formula_NEW.pdf`, p. 4 — מספרים מרוכבים) contains **exactly
three formulas**: polar multiplication, De Moivre, and the n-th-roots formula
(`z_k = ⁿ√R[cos(φ/n + 2kπ/n) + i sin(φ/n + 2kπ/n)]`, k = 0…n−1). No conjugate, no division, no |z| —
those are assumed understanding. The examinable machinery is a **small, closed operation set**: this
tool's engine core is the *smallest* of the four products. There is no conic zoo (analytic), no solid
family + projection renderer (3-D). The domain is: points in ℝ², polar coordinates, and six arithmetic
operations.

## 4. The chassis fit — three exact matches

The constructive engine's three central ideas each map onto a corpus archetype **without stretching**:

- **Branch index ↔ multi-valued roots.** `z³ = w` stores `branchCount = 3`; the existing
  "show another configuration" button *is* the exam's "מצא את כל האפשרויות". A quadrant given
  ("ברביע הרביעי") is a branch-selection fact — precisely the 3-D tool's "שיעור ה-z חיובי" idiom.
- **Free DOF ↔ the unstated parameter.** `|z₁| = |z₂| = r` with r unstated is a free DOF
  ([ADR-052](06-decisions.md#adr-052) verbatim: sampled, resampled on cycle, pinned the moment a
  relation arrives — `שטח המשולש הוא 5d+6` pins d exactly like a 2-D length given pins a side).
  A number constrained by `arg z₁ + arg z₂ = 90°` is a point with 1 remaining DOF — the
  point-on-object idiom on the ray/circle.
- **Dependency graph ↔ derived numbers.** `w = z₁·z₂`, `di·z₀`, `z₀⁴`, `z₃·(z₁z₂)²` are derived
  points (0 DOF) computed by complex arithmetic — topological evaluate verbatim. Adding `w = z₁·z₂`
  to the figure and *watching it move* as z₁ slides is the incremental-building interaction, unchanged.

Also transfering as-is: the SVG renderer + `transform.ts` (the Gauss plane is a 2-D plane; axes/grid
are the same small addition doc 19 §3 lists) · the bilingual RTL parser front-end + catalog + LLM
fallback (`tool: 'complex'` on the shared server, never a fork) · the app shell (fact list, undo/redo,
save/load, export, i18n) · the givens verifier — `w מדומה טהור`, `z₁ ו-z₂ צמודים`, `הפתרונות יוצרים
משושה משוכלל` are green/amber claims in the ADR-053 idiom.

## 5. What is genuinely new (the core of the build)

1. **An exact polar core.** Corpus numbers live almost entirely in the ring of "nice" polar values:
   arguments are rational multiples of π, moduli are radicals (√2, ⁿ√R). Two archetypes *cannot* be
   verified by numeric sampling: **for-all-n claims** (`w^{4n}` real for every natural n) and
   **minimal-n asks** — but both are trivial over exact arguments (`arg w = k·π/m` ⇒ the power's
   argument is a congruence class). Recommendation (D1): represent arguments exactly as rational
   multiples of π with a numeric fallback for non-nice values; moduli as `(rational · √rational)`
   with numeric fallback. This is the same *bounded, no-CAS* discipline as the 3-D symbolic vector
   layer (doc 20: "bounded symbolic layer — NO CAS").
2. **An expression grammar.** The 2-D parser parses relation *sentences*; here the givens are
   *expressions*: `w = (z₁/√2)^{4n}`, `z₃·(z₁z₂)²`, `|6 − z̄ − 8i|² = 25`. The parser needs a small
   expression sub-grammar (literals a+bi and r·cis θ, the six operations, conjugate bar, |·|, powers
   with integer or `kn+c` symbolic exponents). Bounded: no general algebra, just the corpus forms.
3. **The locus layer (small).** `|z − p| = m` → circle; `|z − a| = |z − b|` → perpendicular
   bisector; `arg(z − a) = θ` → ray; membership of a stated line. Unlike analytic geometry, the
   corpus loci resolve to a *closed list* of recognizable curves — first-class objects, not swept
   traces, so the analytic tool's open CAS question (doc 19 §6) does **not** block this tool.
4. **Symbolic exponent n.** Powers `w^{kn+c}` rendered as the finite cycle of values they generate
   (periodicity over exact arguments), enabling the two-values-of-`z^{6n}` and minimal-n asks.
5. **Axes + quadrants substrate.** Drawn axes, origin, quadrant naming, the line y=x — shared ground
   with the future analytic tool (see §7).

**Series are IN scope** (D4 resolved — "series are many times part of the questions"): the tool
*plots* the powers of w (the periodic cycle on the unit circle is exactly the picture that makes
those sums obvious) and **verifies a student-claimed sum value** (`w + w² + … + w^{4n}`,
`Σ z_k·z̄_k`) over the exact core. Charter intact: it never *prints* the sum unprompted — the
student claims, the tool checks.

## 6. Product definition — what the student does, per ask type

| Exam ask | Tool behavior |
|---|---|
| "z₀ הפתרון ברביע הרביעי של z⁶=1" | The equation is a fact → 6 points appear (regular hexagon); the quadrant given selects the branch; the student can toggle exact-value labels (D3) |
| "מצא את שתי האפשרויות" | The existing branch-cycling button; both configurations printable/exportable |
| "הראו כי המקום הגאומטרי הוא מעגל" | The locus equation is a fact → the tool draws the resolved curve; the student's claimed center/radius is a verifiable claim |
| "מצאו את d" (area = 5d+6) | d is a free DOF; the area relation pins it (driveOrCheck); or the student types their d → verified |
| "הוכח כי w₁ ממשי לכל n" | Claim → verified exactly over the polar core (argument congruence), never by sampling |
| "מצאו את ה-n המינימלי…" | The student types their n → the claim (`wⁿ מדומה טהור`, `מחוץ למעגל החוסם`) verifies; the power-cycle plot shows *why* |
| "האם הפתרונות קדקודים של משושה משוכלל" | A polygon-membership claim → verified; the completing vertices drawable as derived points |
| "חשב את השטח" | Measure labels on demand, the 3-D tool's idiom — the figure is the answer check |
| "חשב את הסכום w + w² + … + w^{4n}" | The power cycle is plotted (periodicity made visible); the student types their claimed value → verified exactly (D4) |

## 7. Strategic observation — complex may deserve to come **before** analytic

The registry lists analytic (doc 19) ahead of complex, but the corpus reading inverts the effort
estimate: analytic is blocked on a real open decision (locus deliverable, doc 19 §6) and needs an
equation/CAS-lite layer plus a conic family; complex needs **three formula-sheet formulas, a closed
locus list, and a bounded exact-polar core** — while reusing the 2-D renderer *directly* (it is a
plane, not a projection). Building complex first would also land the **axes/coordinate substrate**
that analytic needs anyway, as a smaller, decision-complete project. **This is D5 — the operator's
call, not a decision this note makes.**

## 8. Decisions — RESOLVED by the operator (2026-08-14, [ADR-CX-001](06d-decisions-complex.md#adr-cx-001))

- **D1 — verification substrate: EXACT polar core.** Arguments as rational multiples of π, moduli as
  bounded radicals (`rational · √rational`), numeric fallback for non-nice values. For-all-n and
  minimal-n asks — present in 4 of 8 sampled exams — are unverifiable numerically. Bounded, **no
  CAS** — the 3-D symbolic-vector-layer discipline.
- **D2 — v1 given-forms: the proposed grammar.** Cartesian/polar literals (incl. parameter
  coefficients), the six operations + conjugate + |·| + integer powers, `zⁿ = w` equations, the
  locus list of §5.3, quadrant/membership givens, symbolic exponents `kn+c`. **Deferred past v1:**
  linear systems over ℂ as givens (2018's `z₁+z₂ = 7+7i` pair), mixed-modulus equations
  (`|z|i + 2z = √3`) — representable later as constraint facts. **Extended same day by the
  operator exemplar (§2b, ADR-CX-002):** argument inequalities/ranges, parameter-expression
  measure claims, polygon objects incl. O, classification claims, sequence-defined numbers,
  root-vs-region counting claims.
- **D3 — a standing product rule: ALWAYS VISUALIZE.** The operator's ruling is stronger than the
  recommended option: *"the rule should be (always) to visualize the problem — whenever possible,
  we draw the points."* Everything representable is drawn, immediately, with exact-value labels
  toggleable; there is no plot-after-candidate mode. Corollary, same ruling: **wherever possible the
  student can switch a number's displayed form between polar and cartesian views** — the toggle is a
  display transform only and never reaches the engine or parser (the ADR-448/ADR-3D-144 seam rule).
- **D4 — series are IN scope.** "Series are many times part of the questions" — power-cycle plots
  and verification of student-claimed sum values ship in v1 (see §5/§6).
- **D5 — build order: complex BEFORE analytic.** "We will leave analytic to the end." The queue is
  now: complex next, analytic last. Registry updated ([docs/22 §9](22-workflow.md)).

## 9. Phased build plan — corpus-gated slices (doc-20 style)

Every slice ends with an exam question reproducing **end-to-end through the real parse → replay
path** with claims verified — the same gate discipline as the 3-D V-slices. Parser coverage
(bilingual, catalog-driven) and the `tool: 'complex'` server parameterization grow *with each
slice*, never as a separate phase.

- **C0 — the plane and the number.** New product tree `src-complex/` (own entry + build config, no
  `@/` alias, isolation-guard coverage), Gauss-plane renderer on the 2-D SVG chassis (axes, grid,
  origin, quadrants), store/replay instantiation, cartesian + polar literals as plotted points,
  free/draggable numbers, the **polar↔cartesian display toggle** (D3), fact list + undo + i18n.
  **Gate:** `z₁ = 3+4i` and `z₂ = 2·cis 150°` render labeled; toggle switches both displayed forms.
- **C1 — exact arithmetic + derived numbers.** The exact polar core (D1); the six operations,
  conjugate, |·|, integer powers as **derived points** in the dependency graph; deterministic ids;
  derived points move live as their inputs drag. **Gate:** 2011's symbolic quotient scene builds;
  `w = z₁·z₂` follows z₁ live.
- **C2 — constraints, parameters, branches.** Unstated magnitudes as free DOFs (ADR-052); relations
  driveOrCheck (modulus equality/ratio, argument relations, conjugacy, quadrant, line membership);
  branch cycling wired to "show another configuration". **Gate:** 2018 reproduces — constraint-defined
  z₁, z₂, both options for C, area claim verified.
- **C3 — equations and root geometry.** `zⁿ = w` producing the n-root constellation
  (branch-indexed), quadrant selection of a root, regular-polygon and circumscribed-circle claims,
  parameter pinning through a metric relation. **Gates:** 2020 (z³ = w⁶ + the hexagon asks) and
  2023 (z⁶ = 1, quadrant pick, d pinned by the area) reproduce.
- **C4 — loci.** The closed list: `|z − p| = m` → circle, `|z−a| = |z−b|` → perpendicular bisector,
  `arg(z − a) = θ` → ray, stated lines; locus-shape claims verified. **Gates:** 2024א and 2022ג.
- **C5 — symbolic exponents + series.** `w^{kn+c}` as its finite value-cycle, for-all-n and
  minimal-n verification over argument congruences, claimed-sum verification (D4). **Gates:** 2022ב,
  2023ד, 2015ב, 2013ב(2), 2024ד.

- **CX capstone — the operator exemplar (§2b).** Once C2–C5 have landed, the full §2b utterance
  sequence reproduces end-to-end: r free throughout, θ pinned by the area given with the
  inequality pruning the second branch, Z₄ sequence-derived, the parallelogram classification
  verified, the five Z⁵ solutions plotted and counted **1 on / 1 inside / 3 outside**. This gate
  is the product's definition of "the pedagogy works": the student typed only the exam's givens,
  and the figure answered the question.

Build route per the workflow: each slice is a feature branch + PR with the operator's
play-and-approve; corpus gates become permanent fixtures/scenarios in the product's test lane.

## 10. The input language — generic sentence families ([ADR-CX-003](06d-decisions-complex.md#adr-cx-003))

Operator directive (2026-08-14): the language must support the §2b exemplar **and every family it
belongs to — "not only these specific formats but all families of them."** This section is the
generic grammar contract the per-slice catalogs are authored from. Two cross-cutting principles
collapse most of the surface area:

- **P1 — one sentence form, driveOrCheck decides.** `שטח OZ₁Z₂Z₃ הוא 150r²` is a *given* (pins a
  DOF) in one question and a *verifiable claim* in another. The grammar defines ONE form per
  relation; whether it drives or checks is the engine's DOF decision, never a second phrasing.
  (The 2-D driveOrCheck principle, verbatim.)
- **P2 — display typography normalizes at the parse seam.** Students paste from exam PDFs:
  Unicode subscripts (`Z₁`), superscripts (`Z₂³`), `°`, `−`, `·`, invisible bidi controls all
  normalize before the grammar sees them (ADR-448/ADR-3D-144). `Z₁Z₂³Z₄` and `z1*z2^3*z4` are the
  same utterance.

| # | Family (generic form) | Canonical He (one witness form) | Corpus witnesses | Slice |
|---|---|---|---|---|
| F1 | **Declarations**: k names as complex numbers; real parameters with domain (`≠ 0`, `> 0`, `טבעי`, an interval). **Implicit typing ([ADR-CX-004](06d-decisions-complex.md#adr-cx-004)): z- and w-family names (`z`, `z2`, `z10`, `w1`…) are complex WITHOUT declaration — first reference auto-creates a visible free number; other letters (a, d, m, n, r, t…) are real parameters by the same exam convention** | `Z1 ו-Z2 מספרים מרוכבים` (optional for z/w) · `r ≠ 0` · `π/2 < α < π` | §2b, 2020, 2022, 2023 | C0/C2 |
| F2 | **Value definitions**: `name = expr` — literals cart/polar, components/angles may be expressions in real parameters; six ops, conjugate, integer & symbolic `kn+c` powers | `w = (z1/2)^(4n)` · `z1 = (2a²+5a+4) + (2a²+3a+2)i` | §2b, 2018, 2020, 2022 | C0/C1, C5 |
| F3 | **Modulus relations**: `\|A\| ⟨cmp⟩ rhs`, rhs = number · param-expr · `k·\|B\|`; chained equalities; cmp ∈ {=, <, >, ≤, ≥, ≠} | `\|Z1\| = 9r` · `\|z1\| = \|z2\| = r` · `2\|z_A\| = \|z_M\|` | §2b, 2018, 2024 | C2 |
| F4 | **Argument relations**: signed sums/integer multiples of `arg` terms vs an angle or each other, any comparator — inequalities are BRANCH SELECTORS | `arg Z1 − arg Z2 = 90` · `arg Z2 < 45` · `לשניהם אותו ארגומנט` | §2b, 2018, 2024 | C2 |
| F5 | **Location givens**: quadrant; on an axis/half-axis; on a stated line/ray; on a circle; inside/on/outside a region | `Z2 ברביע הראשון` · `C על הישר y=x` · `על ישר העובר דרך ראשית הצירים` | §2b, 2011, 2018, 2023 | C2/C4 |
| F6 | **Objects**: segment between numbers; polygon of any arity over represented points (the origin `O` is always available); circle by center+radius or circumscribed (`מעגל חוסם`) | `הקטע Z1Z2` · `המרובע OZ1Z2Z3` · `המעגל החוסם את המשולש ABC` | §2b, 2015, 2023 | C2/C3 |
| F7 | **Measures** (given OR claim, P1): length/distance, perimeter, area, modulus, argument — rhs number or param-expr | `אורך Z1Z2 = 15r` · `שטח OZ1Z2Z3 הוא 150r²` · `היקף … = 60r` | §2b, 2018, 2023 | C2 |
| F8 | **Equations & solution sets**: `X^n = expr` creates the solution SET; solutions referenced collectively (`הפתרונות`), selected by quadrant / argument-range / ordinal — selection avoids naming collisions (the §2b `Z` vs `Z₁` case); enumeration asks (`כל האפשרויות`) are the branch surface | `Z^5 = Z1·Z2³·Z4` · `הפתרון שברביע הרביעי` · `(z3)² = 2i — שתי האפשרויות` | §2b, 2018, 2020, 2023, 2024 | C3 |
| F9 | **Sequences**: geometric/arithmetic over ℂ; term-position givens in any positions (`בהתאמה`); a term defined by the others; the ratio/difference as a derived (multi-branch) value; sums of consecutive terms incl. symbolic count `kn` | `Z1 ו-Z2 הם שני האיברים הראשונים בסדרה הנדסית שבה האיבר השלישי הוא Z4` · `מנת הסדרה — כל האפשרויות` · `w + w² + … + w^(4n)` | §2b, 2015, 2024 | C5 |
| F10 | **Number-type claims**: real, pure imaginary, conjugates of each other | `w מדומה טהור` · `z1 ו-z2 צמודים זה לזה` | 2018, 2020, 2022 | C2 |
| F11 | **Classification claims**: triangle types (שווה-שוקיים, שווה-צלעות, ישר-זווית), quadrilateral types (the 2-D He lexicon: מקבילית, מלבן, ריבוע, מעוין, טרפז, דלתון), regular n-gon — incl. over a solution set | `OZ2Z3Z4 מקבילית` · `הפתרונות קדקודים של משושה משוכלל` | §2b, 2015, 2018, 2020 | C3 |
| F12 | **Quantified claims**: `לכל n טבעי`, minimal/existential n, and COUNT claims over a set vs a region (`כמה … בתוך / על / מחוץ`) | `לכל n, w1 ממשי` · `ה-n המינימלי שעבורו…` · `פתרון אחד על המרובע, אחד בתוכו, שלושה מחוצה לו` | §2b, 2013, 2022, 2023 | C5 |
| F13 | **Loci**: `המקום הגאומטרי` of points satisfying an equation in z (and z̄) from the closed §5.3 list; locus-type claims (`הוא מעגל`) | `\|z − p\| = m` · `המקום הגאומטרי … הוא מעגל` | 2022, 2024 | C4 |

**Deliberately deferred, restated** (D2): linear systems over ℂ as givens (`z₁+z₂ = 7+7i` with
`z₁−z₂ = 1−i`, 2018) and mixed-modulus equations (`\|z\|·i + 2z = √3`, 2013/2015). Both are
*representable* later as constraint facts; nothing in the family table forecloses them.

**Coverage check (both directions).** Every statement in the §2b exemplar maps to a family
(setup → F1 F3 F4 F5 · א → F6 F7 · ב → F1 F3 F4 F6 F7 · ג → F9 F11 · ד → F8 F12), and every
statement in the eight sampled exams maps to a family or a named deferral. Conversely every family
carries at least two corpus witnesses — no speculative grammar. A catalog entry is authored
per-slice from this table; the table, not any single question's phrasing, is what "supported"
means.

---

**Summary:** the fourth sibling at its own URL; the smallest engine core of the four products; the
2-D chassis (renderer, parser front-end, shell, verifier) reuses directly, and the engine's three
central ideas — branch index, free DOF, dependency graph — each land on a corpus archetype exactly.
The genuinely new work is a bounded exact-polar arithmetic core, an expression sub-grammar, a closed
locus list, and symbolic exponents. **D1–D5 are resolved (§8): exact core, proposed v1 grammar,
always-visualize + polar↔cartesian toggle, series in scope, complex before analytic. Next step: C0,
via the feature/PR route.**
