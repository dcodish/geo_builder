# 19 — Analytic-geometry tool (a sibling app): corpus reading, chassis fit, the build plan

_Drafted 2026-07-06 from an operator question ("I want to build a similar tool for analytical geometry —
is it a different tool altogether?"). **Rewritten 2026-09-03** against the real corpus — twenty
consecutive 572 Q1s instead of the original three-exam sample — which changed three premises and
resolved the §6 decision that had blocked this plan for two months. Status: **ACCEPTED,
decision-complete — D1/D2 resolved by the operator ([ADR-AG-001](06c-decisions-analytic.md#adr-ag-001)).
No code yet; `src-analytic/` is still in `plannedTrees`.**_

The 2-D Geo Builder is **synthetic** plane geometry: relations → a figure, coordinates deliberately
derived and non-unique. The 3-D Space Builder is **space** — vectors on solids, planes by equation
([docs/20](20-space-vectors-tool.md)). The complex Builder is the **Gauss plane**
([docs/27](27-complex-numbers-tool.md)). This is the fourth: **the coordinate plane** — points,
lines, circles and conics as objects carrying equations.

---

## 1. Positioning — the tool draws the figure the exam refuses to draw

The decisive corpus fact, and the one the July draft missed: **17 of the 20 questions print no figure
at all.** Three carry a bare sketch. Two go further and instruct the student to draw — `שרטטו את שתי
האפשרויות` (חורף 24) and `סרטטו במערכת צירים אחת סקיצה של שני המעגלים ושל כל המשיקים המשותפים`
(קיץ א' 22).

That inverts the sibling products' proposition. The 2-D and 3-D tools **reproduce a figure the exam
printed**; here there is nothing to reproduce, and the student's first and hardest act — getting
two circles, their common tangents and a parabola onto one pair of axes in the right relative
positions — is exactly what the tool would do for them. It is the same shape of value the complex
tool found ([docs/27 §1](27-complex-numbers-tool.md), "the Gauss plane is a drawing the exam never
prints"), and it is why this is a product rather than a feature.

**A separate app at its own URL, a sibling in this repo** — shared `node_modules`, one test suite,
the shared `shell/` chrome ([ADR-W-016](06w-decisions-workspace.md#adr-w-016)), its own entry, build
config and deploy directory. The student picks the tool by topic: these are different bagrut
questions (**Q1 analytic** vs Q2 vectors vs Q3 complex, all in פרק ראשון of שאלון 572/582). Product
#4 is the first born *after* the shared chassis existed, which is a real saving against the July
estimate.

## 2. Corpus reading — twenty consecutive Q1s

Source: `בגרויות 572.pdf` (the level up / אילון פרץ collection), a question-1-by-question-1 book
covering **קיץ א' 2021 → קיץ ב' 2026** with the author's own per-exam topic index. All twenty read
2026-09-03. Tallies below are over those twenty.

### 2a. What recurs

| Construct | In how many | Forms actually seen |
|---|---|---|
| **Circle** | 18/20 | centre-radius `(x−3)²+(y−4)²=9` · general `x²+y²−2ax−2x=0` · part-parameterised `x²−6x+y²+t=0` · by centre + a tangency |
| **Tangency** | 15/20 | line↔circle · line↔parabola · circle↔circle (internally *and* externally) · circle↔two lines · circle inscribed in a triangle / rhombus · **common tangent of two circles** |
| **Locus** | 13/20 | and the shape is always one of four: **ישר** ×4 · **פרבולה** ×5 · **מעגל** ×3 · **אליפסה** ×1 |
| **Parabola** | 11/20 | **canonical only** — `y²=2px`, `y²=54x`, `y²=2ax`; `מוקד` / `מדריך` named |
| **Symbolic parameter** | 10/20 | `a, b, t, k, p, m, n`, **inside the coefficients** |
| **Point–line distance** | 10/20 | `מרחק נקודה מישר` — the algebraic engine of every tangency |
| **Ellipse** | 8/20 | **canonical only** — `x²/a²+y²/b²=1`, `F₁` right focus, `F₂` left |
| **Area / perimeter asks** | 8/20 | triangle area and perimeter, area ratios, `פי כמה גדול`, maximal-area asks |

**No hyperbola. No rotated conic. No translated conic.** Every parabola in twenty exams sits on the
x-axis; every ellipse is centred at the origin. This is the single most load-bearing scoping fact in
the document: the conic layer is **two shape families in standard position**, each with one or two
parameters — not a general conic engine, and nothing like a CAS.

### 2b. The archetype, in one sentence

**Objects arrive as equations with a parameter in them; a stated relation (usually a tangency or a
distance) pins the parameter, often to two roots; a point then sweeps and the student must name the
curve it traces.**

Three exams in full, to make the shape concrete:

| Exam | Given | Asked |
|---|---|---|
| **קיץ א' 22** | two internally tangent circles `(x−a)²+y²=r²` (M) and `(x−13)²+y²=R²` (N); `MN=9`, `r:R=1:2`, `r<R` | N's equation and **both possibilities** for M's · **sketch both circles and all common tangents in one coordinate system** · the tangent through the touch point · `mx−y+n=0` is a common tangent → find `m,n` (two possibilities) · can those tangents also touch a second, *externally* tangent pair? |
| **חורף 25** | `A(−9a,0)`, `B(41a,0)`, `a>0`; P with `∠APB=90°` | show the locus of P is a circle, give its equation **in terms of `a`** · max area of `APB` is 156.25 → find `a` · with `a=½`, mid-AB is a canonical parabola's focus; parabola ∩ circle in Q1 at C → find C · tangent to the parabola at C, and a parallel tangent to the circle → the distance between them (**two possibilities**) |
| **קיץ ב' 24** | rhombus `ABCD` with diagonals on the axes, `AC=10`, one vertex `√5` from the origin | AB's equation · the inscribed circle's equation · the touch point M in Q1 · foot K of M's perpendicular to the x-axis, E on `x=−a`, G the midpoint of `EK` → **show the locus of G is a parabola**, find its equation · N on it with `x_N=5` → the two circles centred N tangent to the inscribed circle |

### 2c. The construct set (what the engine must own)

**Given forms.** Coordinate point (with a parameter: `A(−9a,0)`) · line by equation, general /
slope-intercept / vertical / parameterised (`mx−y+n=0`, `y=−ax`) · circle by equation, three forms ·
canonical parabola by equation *or* by focus+directrix · canonical ellipse by equation *or* by
foci + major axis · named roles `מוקד` `מדריך` `הציר הראשי` `קוטר` `מיתר` `רדיוס` · incidence
(`נמצאת על`, `ברביע הראשון`, `על החלק החיובי של ציר x`, `x_M < x_A`, `−1.5 ≤ y_A ≤ 1.5`) ·
relations (tangent — all five kinds above; ⊥; ∥; `אמצע`; chord; angle = 90°) · metric pins (`AM=10`,
`MN=9`, `AB=4√5`, area = 9, max area = 156.25, ratio `r:R = 1:2`) · **affine edits of a curve**
(`הזיזו 9 ימינה ו-12 למטה`, `מכפילים את שיעור ה-y של כל נקודה ב-2/3` — the `#כיווץ מעגל` idiom,
twice).

**Ask forms.** Equation of a line / circle / parabola / ellipse / **locus**, sometimes `הביעו
באמצעות k` · coordinates of a point, sometimes via the parameter · value of the parameter, **one or
two possibilities** · length, distance, area, perimeter, area ratio · *prove* the locus is a
line/circle/parabola/ellipse, that four points are concyclic, that a quadrilateral is a kite or a
square · *decide and justify* — `האם קיימת נקודה…?`, `האם הישר משיק?`, `גדול, קטן או שווה?` ·
**draw** — `שרטטו את שתי האפשרויות`.

### 2d. Stable vocabulary (for the parser)

`מקום גיאומטרי` · `מצא/מצאו את משוואת ה…` · `הביעו באמצעות` · `פרמטר` · `שתי האפשרויות` ·
`שרטטו/סרטטו` · `ראשית הצירים` · `נמצאת על` · `עובר דרך` · `מקביל` · `ניצב`/`מאונך` · `משיק` ·
`משיק משותף` · `משיקים מבפנים`/`מבחוץ` · `חותך` · `נקודת החיתוך` · `מוקד` · `מדריך` · `הציר הראשי` ·
`קוטר` · `מיתר` · `חסום במעגל` · `בר-חסימה` · `הרביע הראשון` · `שווה מרחק מ…`

## 3. The formula-sheet contract (and what it implies)

The 5-unit sheet's entire **גאומטריה אנליטית** section is **two** formulas: the distance between two
points, and `x²/a²+y²/b²=1`. That is all. Not the line equation, not `y−y₁=m(x−x₁)`, not the circle,
not the point–line distance the corpus leans on in 10 of 20 exams, and **not the parabola** — those
are expected by heart.

Two consequences. (a) **The ellipse gets a sheet entry and the parabola does not**, which is exactly
why the parabola always appears in the canonical `y²=2px` form with `F(p/2,0)` and directrix
`x=−p/2` — the student is reciting a memorised triple, so the tool must speak that triple natively.
(b) **No hyperbola on the sheet**, matching its total absence from twenty exams: the conic family is
closed at `{line, circle, parabola, ellipse}` and should be hard-coded as such.

## 4. Product definition — what the student does, per ask type

Charter unchanged from the three shipped siblings: **reproduce and verify, never solve**
([ADR-AG-001](06c-decisions-analytic.md#adr-ag-001) D1).

| Exam ask | Tool behaviour |
|---|---|
| `מצאו את משוואת המעגל` | The student types their claimed equation; the tool checks it against the built figure and marks ✓ / refuses. It never prints the equation unprompted. |
| `הביעו באמצעות k את משוואת המעגל` | Same, **verified across sampled values of `k`** — a wrong coefficient fails some sample. This is `src3d`'s `AM→ = u + ½v − w` claim mechanism, and it is why no CAS is needed. |
| `מצאו את משוואת המקום הגיאומטרי` | The tool sweeps the moving point's free DOF and **paints the trace** (the student watches the curve get drawn); the claimed equation is verified as a residual over the swept points. |
| `שרטטו את שתי האפשרויות` | Both roots of the parameter pin are real configurations; `show another configuration` cycles them — the existing branch index. |
| `מצאו את הערך של a` | The student states the pinning relation; the tool root-finds, and a two-root pin surfaces as two branches, never as a silently-chosen one. |
| `האם קיימת נקודה שבעבורה…?` | A refusal is a first-class answer. `no-roots` is an honest contradiction, never a fabricated point. |
| `סרטטו את שני המעגלים וכל המשיקים המשותפים` | This *is* the tool. No verification needed — the drawing is the deliverable. |

## 5. Decisions

**Resolved** ([ADR-AG-001](06c-decisions-analytic.md#adr-ag-001), operator 2026-09-03):

- **D1 — draw-and-verify, NO CAS.** The §6 deadlock of the July draft. It dissolved once the corpus
  showed that even `הביעו באמצעות k` asks verify by sampling the parameter. The `src3d` NO-CAS
  boundary ([src3d/CLAUDE.md](../src3d/CLAUDE.md) rule 3) is adopted verbatim, escalation route
  included.
- **D2 — V0 is the equation + tangency substrate, not the locus.** See §7.

**Deliberately still open:** the URL and deploy path · the 471 ↔ 572 profile split (the registry's
"ONE engine with curriculum-level profiles" — [docs/22 §9](22-workflow.md)); V0/V1 target 572 only ·
whether an answer is ever revealed after a wrong attempt.

## 6. Architecture — what is new, what is transplanted

**New core #1 — the coordinate substrate.** Axes, gridlines, an **absolutely pinned gauge**. This is
the deepest departure from the 2-D tool, where placement is gauge and "a number drawn on the canvas
must be seed-invariant knowledge". Here the coordinate frame is given, so **coordinates *are*
knowledge**. `src3d` already draws exactly this line ("gauge vs knowledge" — [src3d/CLAUDE.md](../src3d/CLAUDE.md)),
and its landing funnel is the model to copy.

**New core #2 — curves as first-class objects carrying an equation.** A closed family of four:
line, circle, canonical parabola, canonical ellipse. Each is a small record with a normalised
coefficient form, an evaluator, a plotter, a point-membership residual, and a tangency predicate
against each of the other three. A parameter may occupy any coefficient slot. **This is a fixed
table of ~10 curve-pair relations, not an algebra system.**

**New core #3 — the locus sweep.** A moving point with a defining property, its free DOF sampled and
its trace painted, plus a residual check of the student's claimed equation against the trace. This
sits *directly* on the existing free-DOF sampler: a locus **is** a swept free DOF, and `שתי
האפשרויות` **is** the branch index. That observation from the July draft survives the re-reading
intact and is still the plan's best piece of leverage.

**Transplanted whole (not re-derived):** the one-parameter pin by numeric root-find, roots as
branches, `no-roots` as an honest contradiction — `src3d`'s algebraic lane
([ADR-3D-002](06b-decisions-3d.md#adr-3d-002)) · the claim-verification-across-configurations
mechanism · M1 duality (a statement about an existing object is a given, not a re-creation) ·
[ADR-052](06-decisions.md#adr-052) (an unstated magnitude is a free DOF, never a default asserted as
fact).

**Reuse table.**

| Layer | Status |
|---|---|
| `shell/` — frame, header, `⋯` menu, About/privacy, product switcher, save envelope, symbol palette | **free** — mount it, as `src-complex` does |
| SVG renderer + `transform.ts` (world→screen, isotropic fit, Y-flip) | **copied**, + axes/grid and curve plotting |
| Parser front-end, rule pipeline, `catalog` as coverage map, LLM fallback via the `tool:`-parameterised proxy | **copied**, new grammar |
| Store: Zustand + zundo, ordered fact list as source of truth, derive-on-demand, save/load, image export | **copied** |
| Free-DOF sampler + branch index | **copied — and it is the locus generator** |
| Engine geometry, constraint solve | **new** (product trees never share; [BOUNDARIES.json](../BOUNDARIES.json)) |

## 7. Phased build plan (gates in the doc-20 style; each gate = tests green + `tsc`/build clean + the operator can PLAY it)

- **V0 — substrate + tangency** (D2). Axes and the pinned gauge · the four curve types **by
  equation** · point-on, curve∩curve intersections, point–line distance · all five tangency kinds ·
  the one-parameter pin with roots as branches. Covers outright the ~7 of 20 exams with no locus
  ask. **Gate: קיץ א' 2022** — two internally tangent circles, both possibilities for M, all common
  tangents drawn in one coordinate system.
- **V1 — the locus lane.** Moving point, swept trace, claimed-equation verification, `שרטטו את שתי
  האפשרויות`. **Gate: חורף 2024** (locus parabola with a parameter, both branches drawn) **and
  קיץ א' 2024** (locus line from `MA=MB` between two circles).
- **V2 — conic roles and metric asks.** `מוקד`/`מדריך`/`הציר הראשי` as first-class given forms;
  triangle area/perimeter over named points; area ratios; the affine `#כיווץ מעגל` edit.
  **Gate: חורף 2023 and קיץ א' 2023.**
- **V3 — full 572 legacy coverage.** Every one of the twenty exams' *inputs* expressible, on the
  docs/20 §14 pattern. Exit criterion is stated in inputs, never in solutions.
- **V4 — the 471 profile.** The 4-point `גיאומטריה משולבת` question: a named polygon pinned to the
  axes, mixed equation/coordinate/synthetic givens, no loci, no conics, no parameters, plus
  `בר-חסימה`. Corpus: `אוסף שאלות בגרויות 2020 עד 2024 חורף לפי נושא.pdf` pp. 36–46 (14 questions,
  ללא מעגל) and 47–57 (13, עם מעגל). Same engine, a curriculum profile.

## 8. Testing & validation corpus

Per [docs/08](08-testing-strategy.md) and standing rule 4: reported inputs become permanent coverage,
fixtures-first. The twenty Q1s are the validation corpus, indexed the way `fixtures3/` indexes the
3-D exams — **we reproduce each figure, never solve it**, and compare against the official answer
only for the *pinned parameter values*, which are the one thing the exam publishes that the tool
also computes.

## 9. Risks and explicit non-goals

- **NO CAS** (D1). Anything needing symbolic solving beyond a 1–2-DOF numeric root-find goes back to
  the operator rather than growing an algebra system by increments.
- **No hyperbola, no rotated or translated conic** — absent from twenty exams and from the formula
  sheet. Adding one is a decision, not a fix.
- **Never print an answer the exam asks for.** The reproduce-and-verify line is the same one the
  three shipped products hold; analytic geometry is where it is most tempting to cross, because the
  answer *is* an equation the engine will be holding.
- **The gauge inversion is the subtle hazard.** Every honesty habit in the 2-D tree assumes drawn
  coordinates are meaningless. Here they are the answer. A pattern copied across without re-reading
  that assumption is the predictable first bug class ([ADR-W-004](06w-decisions-workspace.md#adr-w-004)).

---

**Summary.** A fourth sibling at its own URL. Its distinguishing value is that **the exam prints no
figure**, so the tool is not reproducing a drawing but supplying one. The new core is a coordinate
substrate plus a closed four-curve family with a fixed tangency table; the parameter pin, the branch
index, the claim verifier and the free-DOF sweep that generates every locus are all transplanted
from shipped code. **Next step: file the tracking issue, then V0 against the קיץ א' 2022 gate.**
