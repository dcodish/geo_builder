# 19 — Analytic-geometry tool (a sibling app): corpus reading, chassis fit, the build plan

_Drafted 2026-07-06 from an operator question ("I want to build a similar tool for analytical geometry —
is it a different tool altogether?"). **Rewritten 2026-09-03** against the real corpus — twenty
consecutive 572 Q1s instead of the original three-exam sample — which changed three premises and
resolved the §6 decision that had blocked this plan for two months. Status: **ACCEPTED,
decision-complete — D1/D2 by [ADR-AG-001](06c-decisions-analytic.md#adr-ag-001), the pedagogy lane by
[ADR-AG-002](06c-decisions-analytic.md#adr-ag-002) as amended by
[ADR-AG-003](06c-decisions-analytic.md#adr-ag-003) (the data panel follows the 3-D contract;
multipart is a workspace model), conformance as a V0 gate by
[ADR-AG-004](06c-decisions-analytic.md#adr-ag-004), and the **input language** (§10) by
[ADR-AG-005](06c-decisions-analytic.md#adr-ag-005). **V0 slice A BUILT**
([ADR-AG-006](06c-decisions-analytic.md#adr-ag-006)) — the tree is registered and the tool draws;
it is deliberately **not deployed** ([ADR-AG-007](06c-decisions-analytic.md#adr-ag-007)).**_

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
| `מצאו את משוואת המעגל` | The student types their claimed equation; the tool checks it against the built figure and marks ✓ / refuses. The data panel *also* carries the equation once it is knowledge, behind the student's own checkbox — the 3-D contract ([ADR-AG-003](06c-decisions-analytic.md#adr-ag-003) §2, §4b). |
| `הביעו באמצעות k את משוואת המעגל` | Same, **verified across sampled values of `k`** — a wrong coefficient fails some sample. This is `src3d`'s `AM→ = u + ½v − w` claim mechanism, and it is why no CAS is needed. |
| `מצאו את משוואת המקום הגיאומטרי` | The tool sweeps the moving point's free DOF and **paints the trace** (the student watches the curve get drawn); the claimed equation is verified as a residual over the swept points. |
| `שרטטו את שתי האפשרויות` | Both roots of the parameter pin are real configurations; `show another configuration` cycles them — the existing branch index. |
| `מצאו את הערך של a` | The student states the pinning relation; the tool root-finds, and a two-root pin surfaces as two branches, never as a silently-chosen one. |
| `האם קיימת נקודה שבעבורה…?` | A refusal is a first-class answer. `no-roots` is an honest contradiction, never a fabricated point. |
| `סרטטו את שני המעגלים וכל המשיקים המשותפים` | This *is* the tool. No verification needed — the drawing is the deliverable. |

## 4b. Multipart, the data panel, and the trace ([ADR-AG-002](06c-decisions-analytic.md#adr-ag-002) · [ADR-AG-003](06c-decisions-analytic.md#adr-ag-003))

§2's shape has a consequence for how the student works: the input here is **sparse**. A Q1 gives four
lines of givens and then asks a question, so unlike the sibling tools the student is not typing many
facts for the tool to draw. And the question arrives in **sections** — א ב ג ד ה — each building on
the last.

### Multipart is the workspace model, not an analytic feature

There is no per-section state. The **ordered fact list accumulates across the whole question**, the
figure is re-derived, and the data panel is that ledger made visible; section 2's givens are simply
appended after section 1's. What makes a later section land without surprise is **M1 — existing-id
lowering** ([docs/17 §M1](17-design-rules.md)):

> A command that would create an object whose id already exists is not a conflict and not a
> re-creation: it **lowers to constraints on the existing object** … The lowering lives in ONE place
> at the apply boundary — never in individual parser rules.

That is exactly the section-2 case: the student restates something section 1 established, or names an
object section 1 created, and it lands as a *given on the existing object*. It is mature in every
tree (`reinterpretAsConstraint` and the #613 restate-dedupe in 2-D; "M1 duality intact — new id →
free rider, existing id → verified/driven given" in 3-D) and has twice been exercised on real
multipart exams: [ADR-308](06-decisions.md#adr-308) (a 2025-bagrut **part-ב** undrawable until M1's
over-constraint reporting was fixed) and [ADR-3D-031](06b-decisions-3d.md#adr-3d-031) (a 2024-Q2
**part-ב** chain landing on the book's answer).

> **Obligation on this product:** `src-analytic/` inherits M1 **at the apply boundary from day one**,
> not as a later refinement. Without it every second section of every question is a false conflict.
> This is [ADR-W-004](06w-decisions-workspace.md#adr-w-004) applied forward rather than after a bug —
> the products copy patterns by design, so a load-bearing pattern is copied deliberately.

### The data panel — the 3-D contract, unchanged

**What is fixed by the data is shown** ([ADR-AG-003](06c-decisions-analytic.md#adr-ag-003) §2,
operator: *"this should be just like the 3d — we show the values and equations once they are defined
by the input"*). Derived results, equations and coordinates included, appear when they are
**knowledge** — invariant across every valid configuration, never one sample's value
([ADR-052](06-decisions.md#adr-052)) — behind the same explicit student checkbox that gates the 3-D
panel ([src3d/engine/dataView.ts](../src3d/engine/dataView.ts)). The honesty gate is the one the
shared skeleton already binds: *"a value row may print a VALUE only when it is knowledge."*

### The ask channel already exists

`shell/frame/DataPanel.tsx` ships the fixed section skeleton *points · measures · relations ·
parameters · **ask***; `src3d/engine/queries.ts` ([ADR-3D-057](06b-decisions-3d.md#adr-3d-057)) is
the channel — "a question, never a fact: it never enters `replay`, never moves a point, never appears
in the step list". The third utterance class (**givens · claims · asks**) is settled architecture in
shared chrome and arrives with the chassis.

### Later — the derivation trace

The one thing this product wants that the siblings do not have: **"how was this row reached?"** —
which givens and which formula produced it (operator, [ADR-AG-003](06c-decisions-analytic.md#adr-ag-003)
§3: *"an option of showing how we reached this result… we can scope this as a later version"*).

Its substrate is an **authored technique table** — the ~30 named moves of the subject (line through
two points · point + slope · perpendicular slope · point–line distance · tangency ⟺ distance = r ·
tangent to a canonical parabola at a point · focus/directrix …), indexed by target kind. The table is
**teacher knowledge, not engine knowledge**: a readable catalog in the operator's voice bound to the
code table by an integrity test (the `PRINCIPLE_TABLE` model, [docs/18 §6](18-theorem-relevance-plan.md)),
doubling as the coverage map of the technique inventory the way `catalog.ts` does for input.

**Deferred (R1, §7).** V1 ships the panel behaviour above and nothing more. The trace explains a
result the student can already see — provenance, not a hint — so the anti-solver boundary is carried
entirely by the knowledge gate, not by withholding. A **notices** lane (Lane B: the tool volunteering
`הישר משיק למעגל בכל תצורה` unasked, the analogue of the 2-D L3-observed hint and the home of the
corpus's most common `הוכיחו` item) stays deferred separately (D5, R2).

## 5. Decisions

**Resolved** ([ADR-AG-001](06c-decisions-analytic.md#adr-ag-001) and
[ADR-AG-002](06c-decisions-analytic.md#adr-ag-002), operator 2026-09-03):

- **D1 — draw-and-verify, NO CAS.** The §6 deadlock of the July draft. It dissolved once the corpus
  showed that even `הביעו באמצעות k` asks verify by sampling the parameter. The `src3d` NO-CAS
  boundary ([src3d/CLAUDE.md](../src3d/CLAUDE.md) rule 3) is adopted verbatim, escalation route
  included.
- **D2 — V0 is the equation + tangency substrate, not the locus.** See §7.
- ~~**D3** — the route lane splits by currency~~ · ~~**D4** — the tool never chains~~ —
  **both amended the same day by [ADR-AG-003](06c-decisions-analytic.md#adr-ag-003)**, below.
- **D3′ — the data panel follows the 3-D contract.** What is fixed by the data is shown — equations
  and coordinates included — when it is knowledge, behind the same student checkbox that gates the
  3-D panel. See §4b.
- **D4′ — the technique table's first delivery is a derivation trace, not an options menu**, and it
  is deferred (R1, §7). V1 ships the panel behaviour and nothing more.
- **D5 — the notices lane (Lane B) is deferred** (R2, §7).
- **Multipart is the workspace model, and M1 is not optional here** — the analytic engine inherits
  existing-id lowering at the apply boundary from day one. See §4b.
- **D6 — naming conventions taken from the corpus**: circles named, conics anonymous (one each,
  max), lines `ℓ1`/`ℓ2` typed `l1`/`l2` with the 3-D `\w` trap inherited. See §10a.
- **D7 — an inequality is one of THREE things** — parameter domain (declaration, filters roots) ·
  branch selector (post-solve, picks among branches) · sweep range (sampling, bounds a free DOF).
  Not interchangeable; V0's gate exam needs the first two at once. See
  [ADR-AG-005](06c-decisions-analytic.md#adr-ag-005).
- **D8 — the catalog carries the `catalog3.ts` contract** — reference + coverage map + the LLM's only
  allowed vocabulary, over corpus phrasings rather than an invented command language. See §10.
- **Settled by convention:** URL `/analytic-builder/`, devUrl `/analytic.html`, `build:analytic` →
  `dist-analytic/`, matching the three siblings.

**Deliberately still open:** the 471 ↔ 572 profile split (the registry's "ONE engine with
curriculum-level profiles" — [docs/22 §9](22-workflow.md)); V0/V1 target 572 only · whether an
answer is ever revealed after a wrong claim (largely moot under D3′).

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
| `shell/` — `AppFrame`, `Switcher`, `Workbench`, `InputArea`, `FactList`, `DataPanel`, `AskLane`, `QuickChips`, `SymbolRow`, `ManualScreen`, `canvasControls`, theme/bidi/format/i18n/save/symbols/export | **mandatory, not merely free** — mount it; re-implementing any of it fails V0's conformance gate ([ADR-AG-004](06c-decisions-analytic.md#adr-ag-004)). All three shipped products already consume it |
| SVG renderer + `transform.ts` (world→screen, isotropic fit, Y-flip) | **copied**, + axes/grid and curve plotting |
| Parser front-end, rule pipeline, `catalog` as coverage map, LLM fallback via the `tool:`-parameterised proxy | **copied**, new grammar |
| Store: Zustand + zundo, ordered fact list as source of truth, derive-on-demand, save/load, image export | **copied** |
| Free-DOF sampler + branch index | **copied — and it is the locus generator** |
| Engine geometry, constraint solve | **new** (product trees never share; [BOUNDARIES.json](../BOUNDARIES.json)) |

## 7. Phased build plan (gates in the doc-20 style; each gate = tests green + `tsc`/build clean + the operator can PLAY it)

> **NOT DEPLOYED until the tool has decent capability** (operator, 2026-09-03 —
> [ADR-AG-007](06c-decisions-analytic.md#adr-ag-007)). The registry entry carries `enabled: false`,
> so no deployed builder can render a chip pointing at a path that would 404; `devOnly: true` keeps
> the tool in its own switcher locally. Undeploying is one registry line plus a RUNBOOK row.


- **V0 — substrate + tangency** (D2). Axes and the pinned gauge · the four curve types **by
  equation** · point-on, curve∩curve intersections, point–line distance · all five tangency kinds ·
  the one-parameter pin with roots as branches. Covers outright the ~7 of 20 exams with no locus
  ask. **Gate — BOTH halves, one gate:** (a) **קיץ א' 2022** reproduced — two internally tangent
  circles, both possibilities for M, all common tangents drawn in one coordinate system; and
  (b) **the suite-conformance checklist green** ([ADR-AG-004](06c-decisions-analytic.md#adr-ag-004)) —
  the tool's chip in every other builder's switcher, its `switcherAnalytic` key in *every* product's
  He and En resources, the shared frame mounted rather than re-implemented, the
  [ADR-W-024](06w-decisions-workspace.md#adr-w-024) canvas cluster, `BOUNDARIES.json` moved out of
  `plannedTrees` with a total classification, and the `shell/__tests__` parity locks enumerating the
  fourth tree. [docs/28 §5](28-product-unification.md) Phase 4 is the whole return on the
  unification work: this is the first product that never re-derives the chrome.
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

The data panel ships **with V0** — it is the 3-D contract, not a feature (D3′). Two pedagogy items sit
on a **second axis**, deferred, needing the V0 substrate but none of the loci, so they renumber
nothing:

- **R1 — the derivation trace** (§4b, D4′). "How was this row reached?" — which givens and which
  named technique produced it, over the authored technique table. Gate when it lands: for a shown
  row, the trace names only givens the student actually entered and techniques from the catalog.
- **R2 — the notices lane** (Lane B, deferred by D5). Needs the forced-across-samples discipline and
  an anti-flood cap of its own before it ships.

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
- **The knowledge gate now carries the whole honesty boundary.** With D3′ the panel prints equations
  and coordinates, so nothing is protected by withholding any more — everything rests on "a value row
  may print a VALUE only when it is knowledge". A value that is really one sample's, printed here, is
  not a cosmetic bug: it is the tool asserting a given the question never gave
  ([ADR-052](06-decisions.md#adr-052)).
- **The trace must explain, never plan.** R1 answers "how was *this* reached", over the path the
  engine actually took, for a row already on screen. It must not answer "how *could* you reach X" for
  something not yet determined — that is a planner, and it grows by increments. A search, a depth
  parameter, or a route ranked by which one the engine would take is the tripwire.
- **M1 skipped early is the predictable first bug class** — see §4b. Every multipart question breaks
  at its second section without it, and it is much cheaper at the apply boundary on day one than
  retrofitted per parser rule ([docs/17 §M1](17-design-rules.md)).

## 10. The input language — sentence families ([ADR-AG-005](06c-decisions-analytic.md#adr-ag-005))

Extracted from the same twenty exams as §2. This is the [docs/27 §10](27-complex-numbers-tool.md)
layer for this product, and it seeds `src-analytic/parser/catalogAnalytic.ts` — which, on the
`catalog3.ts` contract, is three things at once: the **user-facing reference**, the **coverage map**
(a guard test re-parses every entry in He *and* En), and **the only vocabulary the LLM fallback is
allowed to emit**.

**The governing principle: the student types the exam's own sentence.** Every canonical form below is
a phrasing that actually occurs in the corpus, not an invented command language. Where the exam says
`נתון מעגל I שמשוואתו (x−3)²+(y−4)²=9, ומרכזו בנקודה K`, that is the input.

### 10a. Naming conventions (what the corpus actually does)

| Object | Convention | Notes |
|---|---|---|
| Point | Capital letter, optional digit subscript — `A`, `M`, `F₁`, `D₂` | The [ADR-228](06-decisions.md#adr-228) subscript convention; typed `F1`, `D2` |
| Line | `ℓ`, `ℓ₁`, `ℓ₂` — typed `l`, `l1`, `l2`; or by two points (`AB`); or by role (`המשיק`) | **Inherits the 3-D trap: `ℓ` is not a `\w` character** — never `\b` after a line name, use an explicit lookahead ([src3d/CLAUDE.md](../src3d/CLAUDE.md)) |
| Circle | **Named** — `מעגל I` / `מעגל II` (Roman numerals, the corpus's own device), or `המעגל שמרכזו M`, or bare `המעגל` when unique | Circles are the one family that regularly comes in twos, so naming is not optional |
| Parabola, ellipse | **Anonymous** — `הפרבולה`, `האליפסה` | No exam in twenty carries two parabolas or two ellipses; at most one of each per figure |
| Axes, origin | `ציר ה-x`, `ציר ה-y`, `ראשית הצירים` (`O`) | The frame always exists; it is never declared |

### 10b. The fifteen families

Each family lists the phrasing the corpus actually uses; the En column is the catalog's parallel
entry.

| # | Family | Hebrew (canonical) | English |
|---|---|---|---|
| **F1** | Point by coordinates | `נתונה הנקודה A(2,6)` · `A(−9a,0)` | `point A(2,6)` |
| **F2** | Incidence | `הנקודה A נמצאת על האליפסה` · `B נמצאת על החלק החיובי של ציר ה-x` · `M נמצאת ברביע הראשון` · `E היא נקודה כלשהי על מעגל II` | `A is on the ellipse` · `B is on the positive x-axis` · `E is any point on circle II` |
| **F3** | Line by equation | `נתון הישר ℓ1: 4y−3x−20=0` · `משוואת הישר AC היא y=−2x+8` · `הישר x=−4` | `line l1: 4y−3x−20=0` |
| **F4** | Line by construction | `D היא נקודת החיתוך של הישר AC עם ציר ה-y` · `דרך A העבירו ישר המקביל לציר ה-x` · `מ-M מורידים אנך לציר ה-x החותך אותו בנקודה K` · `הישר העובר דרך ראשית הצירים ודרך A` | `D is the intersection of AC with the y-axis` · `through A draw a line parallel to the x-axis` |
| **F5** | Circle | `נתון מעגל I שמשוואתו (x−3)²+(y−4)²=9, ומרכזו בנקודה K` · `משוואת המעגל x²+y²−2ax−2x=0` · `מעגל שמרכזו M(6,10)` · `מעגל שמרכזו F העובר דרך B` · `המשולש ABC חסום במעגל שמרכזו M` · `מעגל חסום במעוין` | `circle I: (x−3)²+(y−4)²=9, centre K` · `circle centred M through B` · `circle inscribed in the rhombus` |
| **F6** | Conic | `נתונה פרבולה קנונית שמשוואתה y²=54x` · `נתונה אליפסה שמשוואתה x²/9+y²/b²=1` · `אורך הציר הראשי של האליפסה הוא 4t` | `canonical parabola y²=54x` · `the major axis of the ellipse is 4t` |
| **F7** | Role | `F1 הוא המוקד הימני של האליפסה` · `מוקדי האליפסה נמצאים על ציר ה-x` · `הנקודה (t,0) היא מוקד של פרבולה קנונית` · `הישר ℓ2 הוא מדריך של פרבולה קנונית` · `AC הוא קוטר במעגל` · `הקטע AB הוא מיתר במעגל` | `F1 is the right focus of the ellipse` · `l2 is the directrix of a canonical parabola` · `AC is a diameter of the circle` |
| **F8** | Tangency | `הישר y=x משיק למעגל` · `המשיק למעגל בנקודה A` · `דרך D העבירו משיק למעגל` · `הישר mx−y+n=0 הוא משיק משותף לשני המעגלים` · `מעגל שמרכזו M משיק לישרים ℓ1 ו-ℓ2` · `שני מעגלים המשיקים זה לזה מבחוץ` / `מבפנים` · `הישר ℓ משיק לפרבולה בנקודה A` | `y=x is tangent to the circle` · `the tangent to the circle at A` · `a common tangent to the two circles` · `two circles tangent externally` |
| **F9** | Mutual position | `הישר BM מאונך לציר ה-x` · `AC מקביל ל-MB` · `הישר הנתון ניצב לישר שמצאתם בסעיף א` | `BM is perpendicular to the x-axis` |
| **F10** | Metric given | `AB = 4√5` · `אורך הקטע המחבר את מרכזי המעגלים הוא 9` · `רדיוס המעגל שווה ל-5` · `היחס בין אורכי הרדיוסים הוא 1:2` · `∡APB = 90°` · `שטח המשולש KLM הוא 9` · `השטח הגדול ביותר של המשולש APB הוא 156.25` · `המרחק בין הישרים EF1 ו-GF2 הוא 24` · `AC²+BC²=1250` | `AB = 4√5` · `the ratio of the radii is 1:2` · `the largest possible area of APB is 156.25` |
| **F11** | Parameter declaration | `a הוא פרמטר חיובי` · `a הוא פרמטר שונה מאפס` · `t הוא פרמטר קטן מ-9` · `0<k<6` | `a is a positive parameter` · `t is a parameter less than 9` |
| **F12** | Curve edit (affine) | `מזיזים את המעגל ב-9 יחידות ימינה ו-12 יחידות למטה` · `מכפילים את שיעור ה-y של כל נקודה על המעגל ב-2/3` | `translate the circle 9 right and 12 down` · `multiply the y-coordinate of every point on the circle by 2/3` |
| **F13** | Locus *(V1)* | `המקום הגיאומטרי של כל הנקודות שהמרחק שלהן מ-A שווה למרחק שלהן מהישר ℓ1` · `המקום הגיאומטרי של כל הנקודות M המקיימות MA=MB` · `המקום הגיאומטרי של מרכזי המעגלים שהקטע AB הוא מיתר שלהם` | `the locus of all points equidistant from A and l1` · `the locus of the centres of the circles having AB as a chord` |
| **F14** | Branch selector / sweep range | `שיעור ה-y של B קטן מ-6` · `שיעור ה-x של M קטן משיעור ה-x של A` · `A היא נקודה כלשהי על מעגל II כך ש-−1.5 ≤ שיעור ה-y של A ≤ 1.5` | `the y-coordinate of B is less than 6` |
| **F15** | Ask / claim *(the ask lane)* | `משוואת BD` · `|AB|` · `שטח ABC` · `הזווית BAC` · claim: `משוואת המעגל היא (x−5)²+y²=9` | `equation of BD` · `area ABC` |

### 10c. Input normalization — what the parser accepts as the same thing

A student types on a keyboard; the exam is typeset. Both must reach one internal form, at the single
normalization chokepoint the 2-D parser already has (never per rule):

`^2` ≡ `²` · `-` ≡ `−` (hyphen-minus ≡ minus sign) · `sqrt(5)` ≡ `√5` · `<=` `>=` ≡ `≤` `≥` ·
`l1` ≡ `ℓ1` · `F1` ≡ `F₁` · `<A` ≡ `∡A` (the [#237](https://github.com/dcodish/geo_builder/issues/237)
keyboard form) · `*` ≡ `·` · `pi` ≡ `π`.

The symbol palette (`shell/symbols.ts`, per-product data on a shared core) offers `²  √  ≤  ≥  ℓ  ∡  π
−` with wrap-selection, so the typed forms above are a fallback, never the only route. **Every symbol
the palette offers must parse** — the shared test contract.

### 10d. Coverage and the V0 cut

| Family | V0 | V1 | Later |
|---|---|---|---|
| F1 F2 F3 F4 F5 F7 F8 F9 F10 F11 F14 | ✓ | | |
| F6 (conics) | ✓ equation forms · focus/directrix forms | | |
| F13 (locus) | | ✓ | |
| F12 (curve edits) | | ✓ (it feeds the `#כיווץ מעגל` loci) | |
| F15 (ask lane) | ✓ scalars + claims | | trace (R1) |

**Deliberately out of the language, V0–V1:** ratio-division of a segment as a *given* (`BF:FD=1:2` —
it appears in the corpus only as an ask) · any non-canonical conic · any second parabola or second
ellipse in one figure · `הראו כי`-style proof requests (they are asks about the figure, served by the
claim lane, not new given forms).


---

**Summary.** A fourth sibling at its own URL. Two things distinguish it. **The exam prints no
figure**, so the tool is not reproducing a drawing but supplying one. And the input is *sparse* and
arrives in **sections** — four lines of givens, then a question, then more givens — so the
accumulating data panel does more work here than in any sibling, and M1 carries it (§4b). The new
core is a coordinate substrate plus a closed four-curve family with a fixed tangency table; the
parameter pin, the branch index, the claim verifier, the data panel, the ask channel and the
free-DOF sweep that generates every locus are all transplanted from shipped code. **Next step: V0
against the קיץ א' 2022 gate.**
