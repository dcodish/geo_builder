# 02c — Requirements: the analytic-geometry tool (`src-analytic/`)

**Status: IN PROGRESS — and this is the product's standing requirements doc.** Captured live from an
operator session (2026-09-04) while the thoughts were still being given, and promoted from `19a` into
the `02c` slot by [ADR-W-041](06w-decisions-workspace.md#adr-w-041) (2026-09-05, operator ruling).

**That promotion changed this file's lifecycle, so the change is recorded rather than made silently.**
The original header said this file *"folds into 19 and is deleted"* once its decisions ratified as
`ADR-AG-NNN` in [06c](06c-decisions-analytic.md). It no longer does. Under ADR-W-041 a product's
requirements are a **standing contract** and [docs/19](19-analytic-geometry-tool.md) is its build
**plan** — a plan finishes and becomes history, a contract does not. Ratification therefore changes
this file's *status line*, not its existence; the analytic sections of `docs/19` fold into **here**,
not the reverse. Until a section is ratified, [docs/19](19-analytic-geometry-tool.md) stays
authoritative where the two disagree.

Read it as *the operator's intent plus its consequences*, with the open questions marked. Where a
consequence is mine rather than theirs, it says so.

---

## 1 — The pedagogy

Everything below is downstream of these. If a requirement and a principle disagree, the principle wins
and the requirement is wrong.

**P1 — The tool supplies the figure the exam withholds.** 17 of 20 sampled שאלון 572 Q1s print no
drawing, and two instruct the student to draw one. The siblings *reproduce* a printed figure; this
product *produces* the one the question withheld. Every other principle follows from that asymmetry.

**P2 — Text is the only source of givens. The picture is not an input.** Some exams, older ones
especially, do not define the question fully and lean on the drawing to carry a given. **The operator's
ruling: that is a defect in the exam, not a gap the tool should paper over.** Only text builds the
figure. If the text is incomplete, the student is expected to supply the missing given.

**P3 — The tool never compensates for an under-specified question.** The corollary of P2, and the
easiest mistake available to us, because while building the corpus we can *see* the intended figure. If
the text does not say the centre is in the fourth quadrant, the tool must not put it there because the
picture does. A default that happens to match the drawing is [ADR-052](06-decisions.md#adr-052)'s
cardinal sin wearing a disguise.

**P4 — An under-determined figure is drawn, and its openness is visible.** Not refused, not defaulted.
The tool draws a member of the family and reports how much is still free (the siblings' DOF cue).

**P5 — The tool cannot tell "the maths leaves a family" from "the exam left something out", and must
not try.** `y² = 2px` and a question that forgot to state a quadrant look identical from inside. It
reports what is open; the human judges which kind of openness it is. *(Consequence, mine.)*

**P6 — A parametric equation is a FAMILY, not a curve.** Drawing one member and letting the student
cycle teaches the family. Drawing one member and freezing it teaches that the parabola has a
particular size — a given the exam never gave.

**P7 — Configuration choice belongs to the student.** «כמתואר בציור» resolves ambiguity by picture, and
in this product the picture does not exist yet. So «הציגו תצורה אחרת» is not a convenience here; it is
the *substitute for the exam's own disambiguation*, and the tool must never silently pick a branch and
present it as the answer.

**P8 — Noticing under-specification is a skill worth teaching.** P2–P4 together mean the tool makes a
sloppy question visibly sloppy. That is a feature.

---

## 2 — The base model

**R1 — The base is geometry with coordinates, because that is how the bagrut is built.** *(Operator
ruling, 2026-09-04.)* The primitive is the **geometric object** — point, segment, polygon, circle,
conic — and an equation, a shape noun, or a coordinate pair are three ways a student can *state* one.

This **inverts** the V0 slice-A architecture, where a curve *is* `f(x, y; params) = 0` and everything
else hangs off it. The exact conic fit ([ADR-AG-006](06c-decisions-analytic.md#adr-ag-006) D1) is not
discarded — it stops being the model and becomes *how an equation identifies which object it names*.

> **Consequence for the record:** ADR-AG-006's "a curve is ONE thing" must be restated as a decision
> about *curve objects inside a larger model*, or the next session builds from a superseded claim.

> **Timing:** this is the cheapest moment the decision is available — one slice built, nothing
> deployed, no student input. Re-founding later costs every slice built on the old shape as well.

> **RATIFIED — [ADR-AG-009](06c-decisions-analytic.md#adr-ag-009) (2026-09-15).** The operator
> re-affirmed R1 and directed that the re-founding is the **next slice**, ahead of the relations lane
> [docs/19 §7](19-analytic-geometry-tool.md) had sequenced first. The consequence above is discharged
> there: ADR-AG-006 D1 is superseded as a statement about the *model* and retained as a statement about
> *curve objects*. The timing note held — nothing was built on either shape in the interval, and the
> three §5 questions were measured through the real path before the ADR was written.

**R2 — The gauge starts free and coordinates consume it.** This is the genuine difference from the
synthetic tool and most of the engine's spec in one sentence. In `src/` the gauge is *always* free —
position, rotation and scale are never givens. Here «משולש שווה שוקיים ABC» with no coordinates draws
generically; «A(0,0)» and «B(4,0)» progressively anchor it.

**R3 — The honesty gate generalises for free, and must not be duplicated.** An unanchored shape's
vertices vary by seed → `isKnowledge` says not-knowledge → the panel prints `—`. Anchor it and the
coordinates become invariant → the panel prints them. *A coordinate is knowledge exactly when the
givens fix it.* No new mechanism.

**R4 — `src-analytic/` still never imports `src/`.** The constructive layer is **copied, not shared**
(`BOUNDARIES.json`, `server/__tests__/isolation.test.ts`). Cost acknowledged: a second constructive
layer and a second catalog half for the shape vocabulary.

**R5 — Staging that keeps R1 inside the NO-CAS line** ([ADR-AG-001](06c-decisions-analytic.md#adr-ag-001) D1):

| tier | shape | solve cost |
| --- | --- | --- |
| 1 | every vertex coordinate-stated | none |
| 2 | some coordinates + one shape constraint (`\|AB\| = \|AC\|`) | 1–2 unknowns, the sanctioned numeric root-find |
| 3 | unanchored with several interacting constraints | a general constraint solver — i.e. the synthetic engine again |

Tier 3 is the boundary between "V1" and "a second constructive engine". ~~**Open: where V1 stops.**~~

> **RESOLVED — tier 3, by transplant ([ADR-AG-009](06c-decisions-analytic.md#adr-ag-009), 2026-09-15).**
> Measured before ruling, and the table's own framing was the thing that needed correcting. Tier 2 does
> **not** reach the corpus: §5a interacts a partly-anchored parallelogram, an area value and two
> tangencies, and §5c derives every vertex from two side lines plus a ratio. And tier 3's *"i.e. the
> synthetic engine again"* overstates the cost — the synthetic engine's solve core is small and already
> exists twice (`src/engine/carriers.ts` classifies the DOF, `solve.ts` supplies per-constraint
> residuals, `evaluate.ts` minimises `Σ jointCostTerm` across every carrier). The 14,102 lines in
> `src/engine` are overwhelmingly **grammar**, not solver, and grammar breadth is paid per corpus
> question at either tier. So the **core is transplanted and the grammar is not**; every construct
> beyond the core is justified by a corpus question or it does not come across.

---

## 3 — Stating an object

**R6 — The shape noun is OPTIONAL for an equation and LOAD-BEARING for a shape.** *(Operator ruling.)*
A bare `y^2=54x` builds; «נתונה פרבולה שמשוואתה» is not required, because the fit already knows the
kind. But «מקבילית ABCD» *is* the given — it carries AB ∥ DC and nothing else states it. Both are true
and they are not in tension.
*(Ruled 2026-09-04; **BUILT** 2026-09-15 by [ADR-AG-019](06c-decisions-analytic.md#adr-ag-019), #1037.
Until then `y^2=54x` — this requirement's own example — answered `not-handled` and escalated to the
LLM. See also R44 on what identifies an unnamed curve.)*

**R7 — When a noun IS given with an equation, it is checked against the fit and a mismatch is named.**
«נתונה אליפסה שמשוואתה x²/9−y²/16=1» must still answer "that is a hyperbola, and this tool does not
draw those" — the diagnosis that a bare equation cannot produce, because there is no stated expectation
to contradict.

**R8 — Coordinates are written `A(2,6)`.** *(Operator ruling: comma, not semicolon.)*
**OPEN:** the exam prints `A(3;5)`. Does the semicolon *parse* (with the comma as the taught form, the
`²`/`^` split ruled in #511), or is it *refused*? The two build differently.

**R9 — Picture references are recognised and ignored.** «כמתואר בציור», «לפי הציור», «כמתואר בשרטוט»,
«ראו ציור» parse to **nothing**, are tolerated **inline and trailing** (they hang off sentences that do
carry content), and must **not** fall through to `not-handled` — escalating a sentence we fully
understand to the paid LLM so it can guess at an empty clause is the failure
[ADR-3D-214](06b-decisions-3d.md#adr-3d-214) Decision 2 forbids in the sibling.

**R10 — Anaphora.** «למעגל זה», «המעגל» must resolve to an object introduced without a name
(«נתון מעגל, שמרכזו M…»).

**R11 — Notation.** Primes (`A'`, `F₁'`) and subscripts (`F₁`, `l1`). Primes already exist in the 3-D
tree; subscripts are new to this input language.

**R31 — A point's COMPONENTS are addressable and comparable: `Ax > Bx`.** *(Operator ruling,
2026-09-04.)* The typed form of «שיעור ה-x של קדקוד A גדול משיעור ה-x של קדקוד B» (5d). Comparison
operators `<` `≤` `≥` `≠` are already on the palette.

**R31a — SEMANTICS first, because it decides correctness.** A *strict* comparison is a **selector**, not
an equation: `Ax > Bx` pins nothing and instead chooses among configurations that already satisfy the
givens — R14's discrete labelling DOF being consumed. An *equality* genuinely constrains: `Ax = Bx`
forces AB vertical. Same syntax, two different members of
[ADR-AG-005](06c-decisions-analytic.md#adr-ag-005) D7's three kinds. **Treating a strict comparison as
an equation would report "no solution" on a perfectly good figure.**

**R31b — NOTATION HAZARD, to be measured against the corpus before it ships.** `Ax` already has a
meaning here. The expression layer multiplies by juxtaposition (ADR-AG-006 D2 — the reason `2a`,
`4√5`, `2ax` work), and the standard line form `Ax + By + C = 0` uses uppercase coefficient names, which
is ordinary notation and exactly what #339 covers in the 3-D tree.

```
Ax > Bx            → A's x-component vs B's x-component
Ax + By + C = 0    → A·x + B·y + C = 0, a line with symbolic coefficients
```

A disambiguation exists and rests on a convention the tool already follows — **point labels uppercase,
parameters lowercase** — so `ax` is unambiguously a product. It does **not** settle the
`Ax + By + C = 0` case, where the uppercase letters are coefficients; that needs the surrounding form
(a comparison of two bare tokens versus an equation summing terms in `x` and `y`).

This is the exact class that silently ate real input in the sibling: a case-insensitive `[IVX]`
Roman-numeral class swallowed the `x` of `x²+y²−2ax−2x=0` (ADR-AG-006). **Measure it against the
corpus; do not reason it away.** *(Hazard, mine.)*

**R31c — The chosen notation is `x_A`, with the Hebrew phrase as the PRIMARY input.** The exam writes
it in words — «שיעור ה-x של קדקוד A» — and never symbolically, so under the type-the-exam's-sentence
principle the words are the primary form and `x_A` is the shorthand for people who would rather type
less. Both parse; the catalog teaches the words, because those are what is on the page.

Rejected, on collisions rather than taste:

| form | why not |
| --- | --- |
| `A(x)` | collides with the point DECLARATION `A(2,6)` — ambiguous with the tool's commonest input |
| `Ax` | collides twice: juxtaposition multiplication, and `Ax + By + C = 0` |
| `xA` | only a CASE away from `xa`, a legitimate product — the `[IVX]` shape exactly |
| `x_A` | **chosen.** No collision; the underscore is unused elsewhere in the grammar; standard maths; reads in the exam's own order; and the 2-D palette already carries an `S_{}` subscript button, so it is existing machinery |

*Worth checking before closing this off: whether `Ax + By + C = 0` with uppercase symbolic coefficients
actually occurs in the 572 corpus. If it never does, `Ax` could later be accepted as an additional
spelling under the #511 accept-both-teach-one pattern. `x_A` is correct either way.*

**R32 — NEAR-MISS INPUT is understood from context where the figure makes it unambiguous, and TAUGHT.
Never silently accepted, never guessed, never outsourced.** *(Operator ruling, 2026-09-04, stated for
`x_A` but general.)*

This is [ADR-W-030](06w-decisions-workspace.md) / #778 — *"non-canonical input is TAUGHT, never
silently accepted"* — applied here, and its pre-fill mechanism is exactly the operator's "better yet":
the tool understands `xA`, builds it, **and shows `x_A`**. Accepted *and* taught, which is neither a
refusal nor a silent fix. (#778's implementation is pending and its input list has gone stale; the
ruling stands.)

**"Suspects" must be a MEASURED near-miss, not a guess** — otherwise the parser invents intent, which
is ADR-052's sin moved into the input layer. Context means *what is declared in the figure*:

| situation | verdict |
| --- | --- |
| `A` is a declared point and no parameter `a` is in scope | unambiguous → understand it, show `x_A` |
| `a` is a declared parameter and no point `A` exists | unambiguous → it is the product `x·a` |
| **both** a point `A` and a parameter `a` exist | **ambiguous → refuse and NAME the format; do not pick** |

Two prohibitions, both already ruled in the family: never accept silently without teaching
(ADR-W-030), and never escalate to the paid LLM, because this is input we recognise —
[ADR-3D-214](06b-decisions-3d.md#adr-3d-214) D2's *"a refusal we own, not a question we outsource"*
applies even more plainly to recognised-but-misspelled than to recognised-but-unsupported.

---

## 4 — Parameters, families and choice

**R12 — A parameter is normal, not an edge case.** At least one is typical, and `x²/a² + y²/b² = 1`
carries two. An unknown parameter is never a reason to refuse: sample it inside its domain and draw.

**R13 — Three cases, decided by whether the KIND is invariant over the domain:**

| case | behaviour |
| --- | --- |
| kind invariant (`y² = 2px` is a parabola for every `p ≠ 0`) | draw it; the parameter is a free DOF that must move on «הציגו תצורה אחרת» |
| degenerate at isolated values (`p = 0` collapses it to a doubled axis) | exclude those values from the domain; the engine's `vacant` already means "not at this value, and NOT an error" |
| **kind varies over the domain** (`x² + a·y² = 1` is an ellipse for `a>0`, a hyperbola for `a<0`, two lines at `a=0`) | **OPEN — needs a ruling.** The tool must not silently draw and name the sampled one |

> R13's third row is `isKnowledge` one level up: not "is this coordinate knowledge" but **"is this
> SHAPE knowledge"**. *(Consequence, mine — to be measured before it is written as a requirement.)*

**R14 — Every unstated choice is a DOF, discrete or continuous.** *(Operator ruling, on «אחד
המוקדים».)* Continuous ones sample and resample; discrete ones cycle. One doctrine, one mechanism —
the same one already ruled for the right-angle seat ([ADR-481](06-decisions.md#adr-481)).

| example | kind |
| --- | --- |
| «אחד המוקדים» — which focus | discrete, 2-valued |
| «E נקודה על האליפסה» | continuous, 1 DOF |
| which axis intersection is `A` vs `A'` | discrete, 2-valued |
| a tangency branch | discrete |

**R15 — The tool never has to work out that an ambiguity is harmless.** Both foci give the same
distance here by symmetry; the tool represents the choice anyway, and if the figure does not change
when cycled, nothing was lost. No special case for "this one happens not to matter".

**R16 — `isKnowledge` must vary the DISCRETE choices too, not only the continuous parameters.** A value
is knowledge when it is invariant across *every* free DOF. Otherwise a number true only of the branch
we happened to pick prints as a fact. *(Consequence, mine — and a live risk: today the gate
re-evaluates across seeds.)*

**R17 — A stated shape noun may narrow a parameter's domain.** «נתונה אליפסה שמשוואתה x²+a·y²=1» plausibly
means "the values of `a` that make this an ellipse" — a fourth way of writing a domain, alongside
[ADR-AG-005](06c-decisions-analytic.md#adr-ag-005) D7's three. **OPEN:** intended, or should a stated
kind never constrain?

**R18 — The DOF cue is visible**, as in the siblings («דרגות חופש: 1»). **OPEN:** passive reporting
only, or may the tool *prompt* ("still 2 free — did the question state more?").

---

## 4a — Data entry and what the canvas shows

**R19 — A shape noun stands alone, and constraints arrive afterwards.** *(Operator, 2026-09-04.)*
«משולש ABC» is a complete statement: a triangle with a free gauge and free shape, drawn generically
(R2). «משוואת הצלע AB היא y = x−1» then constrains it. Both orders must work — Q3's text gives the
equations first, the operator's example gives the noun first — which is the entry-order independence
the 2-D tool locks as M2.

**R20 — Objects can display their equations on the canvas, behind a toggle, with STATED and DERIVED
visually distinguished.** *(Operator: "so user can see what he entered and what was derived from it —
same logic as in the 3-D tool.")* The distinction is the point; the toggle is the mechanism. It is the
panel's «k = -3» versus «t = ?» split, moved onto the canvas.

**R21 — A derived equation IS often the exam's answer, and showing it is correct.** *(Operator ruling,
2026-09-04, overruling an earlier draft of this requirement that would have gated it.)*

The concern was that Q3 part א asks «מצא את משוואת המעגל החוסם», so a canvas labelling the circumcircle
has answered the question. The ruling: **this is the same case as the 3-D tool, and for a student the
answer is meaningless without the way.** The bagrut awards marks for the derivation, not the number — a
student who reads the equation off the canvas cannot write the working that earns the marks, so nothing
transferable has been given away. Precedent in the product already:
[ADR-3D-032](06b-decisions-3d.md#adr-3d-032) prints a derived plane equation on a determined figure.

**The positive framing, which is the feature's real value: the derived equation is a CHECK.** The
student works part א by hand, and the canvas agrees or it does not. Agreement confirms; disagreement
says look again *without saying where* — which is the right amount of help, and the strongest thing
this tool does for a student working alone. *(Framing, mine; the ruling is the operator's.)*

**Consequence: the toggle's job is legibility, not protection.** It exists so the canvas is not
cluttered with an equation on every object. That collapses most of open ruling 5 — a single global
«הצג משוואות» is likely enough, and per-object display can wait for a case that demands it.

**R22 — The equation display doubles as a DETERMINACY signal, and that is the pedagogy.** The
circumcircle of a not-yet-determined triangle has a seed-dependent equation — not knowledge, so it
shows as open. It becomes printable exactly when the student's givens have pinned the figure. *The
moment the equation appears is the moment the student learns their givens were sufficient.*
*(Consequence, mine.)*

**R23 — TWO SURFACES, ONE GRAMMAR: the main input CONSTRUCTS, the data panel ASKS.** *(Operator
ruling, 2026-09-04.)* «מעגל חוסם את ABC» typed into the main input **adds the circle to the figure and
draws it**; the same sentence typed into the data panel **is calculated and not drawn**. The surface,
not the wording, decides. One catalog therefore serves both lanes — a real economy, and it means every
construct the tool can build is automatically a construct it can be asked about.

**R24 — An ask is a DRY-RUN construction: built internally, evaluated, discarded.** It must never
mutate the figure. The 2-D tool's `dryRunOutcome` already has this shape (apply on top of the current
facts without committing), so it is copied rather than invented. It rides the ask channel
[ADR-AG-002](06c-decisions-analytic.md#adr-ag-002) reserved, which #741 unified across the builders.

**R25 — An ask obeys `isKnowledge` exactly as the canvas does.** Ask for the circumcircle of a triangle
that is not yet determined and the answer is *open*, never a seed-dependent equation printed as fact.
No second honesty mechanism — and the ask lane inherits R22's teaching: the answer arrives precisely
when the givens suffice.

**R26 — A queried object that cannot exist refuses honestly, and is never a silent blank.** The
circumcircle of a collapsed triangle; a tangent from a point inside a circle.

**R27 — Queries persist with the figure.** The 3-D store already saves them beside the facts
(`loadFigure(facts, seed, queries, …)`), so a saved analytic figure carries both what the student built
and what they asked.

**Design risk to play for:** the two surfaces must be visually unmistakable, or a student types a
construction into the ask box and wonders why nothing was drawn. The 2-D layout — an «שאלו על ערך» box
with its own «חשב» button — is probably enough, but this is the kind of thing that only shows up on
play. *(Note, mine.)*

**R28 — The data panel is an INVENTORY of everything the figure determines — distances and equations —
exactly as in 2-D, 3-D and complex.** *(Operator ruling, 2026-09-04.)* Not only a place to ask. The
shared panel sections in `shell/` (unified by #671) are reused rather than re-derived.

**R29 — The analytic-specific row types are EQUATIONS and COORDINATES.** The siblings list lengths and
angles; this product adds the equation of every line and curve, and every point's coordinates, as
first-class rows.

**R30 — Three panel behaviours carry over unchanged from the siblings, and need no new design:**

- **per-row knowledge gating** — a distance that varies with a free DOF shows as open, never as a
  number. It is what makes the panel trustworthy enough to check homework against (R21);
- **on request, not on every keystroke** — each value costs a solve *per seed*, since `isKnowledge`
  decides invariance by re-evaluating; n values is n×k solves, so «חשב ערכים» is the trigger;
- **invalidation on the next fact** — the 3-D rule: opening the panel pulls, and the next given
  invalidates it.

**OPEN — what bounds "all"?** Distances are pairwise, so six named points is fifteen rows and a real
bagrut figure reaches that easily. Three candidates:

| option | cost |
| --- | --- |
| everything pairwise | complete; a wall of numbers on any real figure |
| only what the figure NAMES — declared segments, polygon sides, radii — plus whatever was asked | legible; needs a rule for "names" |
| everything, grouped and collapsible | complete and legible; the most UI |

*My instinct is the second for V1, since R23 makes asking for the rest cheap — but "all computable" is
what was said, so this is left open rather than narrowed unilaterally.*

Patterns to copy from the 3-D tree (copied, never imported): the per-object display cycle already used
for planes (full / face / hidden), and knowledge-gated panel rows.

**OPEN:** is the toggle global («הצג משוואות»), per-object, or both?

---

## 5 — Capability inventory, from the corpus

Two questions, read for what the FIGURE needs. Parts marked «מצא»/«הבע» are ask-lane, not
figure-building.

### 5a — Parallelogram + tangent circle (`A(3;5)`, `B(7;8)`, r=5, area 13)

| need | today |
| --- | --- |
| circle declared by its CENTRE, with no equation | ✗ — a circle *is* its equation |
| polygon as a named shape («מקבילית ABCD») carrying AB ∥ DC | ✗ |
| a side (`DC`) addressable as a line | ✗ |
| the axes as first-class objects («ציר ה-y») | ✗ |
| quadrant membership as a sign-pair region constraint | ✗ |
| tangency circle ↔ axis | ✗ |
| tangency circle ↔ line **at a named point** | ✗ |
| a point that is both a polygon vertex and a tangency point | ✗ |
| radius by value | ✓ |
| polygon area by value | ✗ |
| partial anchoring — only A and B stated | ✗ |

**What it proves:** two of seven givens are coordinates; the rest are synthetic. An equation-first model
cannot express this question at all. R1 is not a preference.

### 5b — Canonical ellipse `x²/a² + y²/b² = 1`

| need | today |
| --- | --- |
| **two ellipses in one figure** (part ג's «אליפסה קנונית חדשה») | ✔ since [ADR-AG-018](06c-decisions-analytic.md#adr-ag-018) (#1026) — the "slot" was an id collision between two anonymous conics, not a decision; anonymous conics now take a content-derived id and a figure holds as many as the question does |
| a conic with two symbolic semi-axes | partly — needs measuring |
| axis intersections as named points (A, A', B, B') | ✗ |
| foci as nameable objects | partly — `ellipseFoci`/`parabolaFocus` compute them; they are not objects |
| point-on-curve with 1 DOF («E נקודה על האליפסה») | ✗ |
| ⟂ between a stated line and a line through two named points (`A'B`) | ✗ |
| distance point ↔ focus = value | ✗ |
| ∥ between a segment and an axis | ✗ |
| a curve required to pass through named points | ✗ |
| triangle over derived points | ✗ |
| altitude of a triangle, and a RATIO `k` between two altitudes | ✗ |

**What it proves:** nearly every named point here is *derived* — intersections, foci, a point on the
curve — where 5a's were *stated*. Both must work. And symbolic parameters are the normal mode: the exam
prints a figure for an ellipse whose axes are both unknown.

**The blocker is a wrong decision, not a missing feature.** The one-conic-per-kind slot is contradicted
by a real corpus question.

**And it hands us a clean instance of P2:** «חותכת את ציר ה-x בנקודות A ו-'A» never says which is which.
The picture puts `A` on the positive side; the text does not. Under P2 the student states it, or the
labelling is an honest R14 discrete choice.

**Part ג is a parameterised FAMILY, not a figure** — a second ellipse related to the first by a ratio
`k`, with a limiting `k` where the foci meet at the origin. Closer to a slider than a construction.
Proposed V1 boundary: **א and ב in scope, ג deferred.** **OPEN.**

---

### 5c — Triangle by SIDE EQUATIONS + parabola with a pinned parameter

«במשולש ABC משוואת הצלע AB היא y = x−1» · «ומשוואת הצלע AC היא y = −x+3» · «הנקודה D(6;3) נמצאת על
הצלע BC» · «BD/DC = 1/3» · «הנקודה D(6;3) נמצאת על הפרבולה y² = 2px» · «ישר המשיק לפרבולה בנקודה D
נפגש בנקודה F עם ישר העובר דרך C כך ש-FD = FC»

| need | today |
| --- | --- |
| a polygon's SIDE stated as a line equation | ✗ |
| a vertex derived as the intersection of two side lines (A) | ✗ |
| a vertex free ALONG a stated line (B on AB, C on AC — 1 DOF each) | ✗ |
| a coordinate-stated point constrained to a segment, driving its still-free endpoints | ✗ |
| segment ratio `BD/DC = 1/3` | ✗ — `length-ratio` exists in the 3-D tree to copy |
| circumscribed circle as a derived object | ✗ |
| a conic parameter PINNED by a membership statement (`D` on `y²=2px` ⇒ `p = 3/4`) | ✗ — the "one-parameter pin" ADR-AG-006 lists as not claimed |
| tangent to a conic AT a named point on it | ✗ |
| a line through a named point, otherwise free (1 DOF of direction) | ✗ |
| line ∩ line as a named point (F) | ✗ |
| distance equality `FD = FC`, consuming that direction DOF | ✗ |

**What it proves — a polygon arrives THREE ways, and only an object-first model holds all of them:**

| question | how the polygon is stated | vertices |
| --- | --- | --- |
| 5a parallelogram | shape noun + 2 vertex coordinates + area | partly stated, partly solved |
| 5b ellipse | — | all derived (axis intersections, foci) |
| 5c triangle | **side equations** | all derived from lines + a ratio |

**The pin arrives through GEOMETRY, not syntax.** «הנקודה D נמצאת על הפרבולה y²=2px» determines `p`
because D is on the curve. The student states geometry; the pin is a *consequence*. No pin keyword is
needed, and none should be invented.

**It exercises the multipart model properly** ([ADR-AG-003](06c-decisions-analytic.md#adr-ag-003)):
part ב does not start a new figure, it grows part א's — triangle → circumcircle → parabola → tangent → F.

**More pressure on the conic slot:** a circle and a parabola coexist here, so the slot rule's fate
depends on whether a circle occupies one. 5b already broke it outright.

**`D(6;3)` — the semicolon again, three questions running.** Relevant to R8.

### 5d — Right triangle from a vertex, a hypotenuse equation, and an ORDER given (no figure)

«במשולש ישר-זווית ABC נתון: ∡ACB = 90°, C(4;−2)» · «משוואת היתר AB היא 2x+y−3=0» · «שיעור ה-x של קדקוד
A גדול משיעור ה-x של קדקוד B» · א «שעבורם ניצבי המשולש ABC מקבילים לצירים» · ב «ניצבי המשולש ABC אינם
מקבילים לצירים, אך אורך היתר שלו זהה לאורך היתר במשולש שבסעיף א'»

| need | today |
| --- | --- |
| right triangle with the seat EXPLICITLY pinned («∡ACB = 90°») | ✗ here — the ADR-163 channel exists in 2-D |
| a side named by its ROLE — «היתר», «ניצבי המשולש» — resolved from where the right angle sits | ✗ |
| a side stated by equation (as 5c) | ✗ |
| **coordinate-component comparison** — `x_A > x_B` | ✗ — a coordinate is stated today, never addressed or compared |
| ∥ between a triangle's legs and the axes | ✗ |
| **EXCLUSION** — «אינם מקבילים לצירים» | ✗ — specced for the sibling as #507 («זווית A לא תהיה ישרה» builds a ≠ requirement instead of refusing); copy it |
| **cross-part value reference** — «אורך היתר … זהה … במשולש שבסעיף א'» | ✗ — the hardest new demand |

**This question is the positive proof of P2.** It carries **no figure at all**, and precisely because
there is no picture to point at, the exam is forced to state everything — including the labelling:
«שיעור ה-x של קדקוד A גדול משיעור ה-x של קדקוד B». A well-authored question needs no drawing. The older
ones that lean on theirs are the defective ones, which is exactly the operator's ruling, evidenced from
the other direction.

**And it is a textbook R14 case.** Part א's condition yields the pair {(4,−5), (2.5,−2)}; *which of
them is called A* is a discrete choice, and the exam consumes that DOF with the x-comparison instead of
a drawing. Precisely the shape the requirement wants.

**The genuinely new architectural demand is the cross-part reference.**
[ADR-AG-003](06c-decisions-analytic.md#adr-ag-003) made multipart a workspace model; this needs more —
a **named result that crosses parts**, where a quantity *derived* in part א becomes a *given* in part ב.

---

## 6 — Open rulings

1. **R8** — semicolon coordinates: parsed-but-untaught, or refused?
2. **R13** — a parametric equation whose *kind* changes with the parameter: what does the tool do?
3. **R17** — may a stated shape noun narrow a parameter's domain?
4. **R18** — DOF reporting: passive only, or may it prompt?
5. **R20** — equation toggle: a single global «הצג משוואות» is likely enough now that R21 makes it a legibility control rather than a gate. Per-object display only if a case demands it.
6. ~~**R5 / 5b** — where V1 stops: tier 2 vs tier 3~~ — **tier 3, by transplant**
   ([ADR-AG-009](06c-decisions-analytic.md#adr-ag-009)). Still open: **part ג of 5b in or out.**
7. **R28** — what bounds "all computable" in the data panel: pairwise, named-only, or grouped?
8. The conic-slot removal needs its own ADR superseding the slot decision.

---

## 7 — The teacher lane ([ADR-AG-010](06c-decisions-analytic.md#adr-ag-010))

Sections 1–6 are entirely student-facing, which was an omission rather than a decision: the workspace
has named teachers and authors a secondary audience since [01 §Audience](01-vision.md), and the three
shipped products serve them through the shared image and `.docx` export. This section is the analytic
product's own answer, ruled by the operator on 2026-09-15.

**The asymmetry that makes the question sharper here.** P1's defining fact cuts both ways. 17 of 20
sampled Q1s print no figure, so the student has nothing to reproduce — and the **teacher preparing that
lesson has nothing to project or photocopy either**, and must build the coordinate diagram by hand in a
general construction tool. That is exactly the tedium [01](01-vision.md) named for the authoring
audience, met at its worst.

**R33 — Worksheet authoring is in scope, on the mechanism that already ships.** A teacher builds the
figure by describing it and takes away the figure plus its givens: the clean image ([FR-HS-5](02-requirements.md))
and the `.docx` question page ([FR-HS-11](02-requirements.md), [ADR-251](06-decisions.md#adr-251)),
inherited from `shell/` rather than re-derived. This is a **conformance-and-fit** requirement, not a new
capability — what it asks is that the exports are actually good enough to put in front of a class, and
that this is played rather than assumed.

**R34 — Live demonstration is a design condition, not a feature.** «הציגו תצורה אחרת» and R22's
determinacy signal are already built, and the ruling is that they are designed and played **for
projection**: legible at a distance, and the configuration cycle visible as a *change* rather than as a
figure that silently differs. The teaching content is the thing the tool is uniquely placed to show —
*why a question has two answers*, and *the moment a set of givens becomes sufficient* (R22).

**R35 — No teacher mode, no role, no separate surface.** The three shipped products have none
([02 §Actors](02-requirements.md): *"no authentication or distinct roles in v1; all are the same
anonymous user"*), and nothing here creates one. A teacher uses the student's tool.

**R36 — The teacher lane is gated by expressiveness, not by chrome.** A teacher cannot author an
analytic worksheet until the tool can build the figure, so R33 and R34 are paid for at
[ADR-AG-009](06c-decisions-analytic.md#adr-ag-009)'s B3 gate (§5a and §5c building), not before it.
Stating this prevents the predictable mistake of polishing an export for figures the tool cannot yet
produce.

**Offered and NOT taken — a corpus question library.** The twenty 572 Q1s as loadable saved figures a
teacher opens as a starting point. It is nearly free once the tool can express them, because the
validation fixtures and a teacher's question bank would be the same files, and
[FR-HS-10](02-requirements.md) already names a built-in library as future. The operator did not select
it. **Not rejected on the merits — not in scope now**, and nothing above forecloses it.

---

## 8 — The «lines and points» corpus, and what it changes

**Status: a SECOND corpus, read 2026-09-15.** Sections 1–7 are written against the שאלון 572 Q1
corpus — conics, tangency, loci, symbolic parameters ([docs/19 §2](19-analytic-geometry-tool.md)). The
operator then brought roughly forty exercises from the topic they are **teaching now**: midpoints,
medians, centroids, incircles, areas, sides given by equation. It is the same product and a different
exam topic, and it changes the priorities enough to be written down rather than absorbed.

### 8a — What it contains, by frequency

Tallied over the ~40 exercises, most common first:

| construct | ~exercises | example phrasing |
| --- | --- | --- |
| shape noun | ~20 | `משולש ABC` · `מקבילית ABCD` · `טרפז ישר-זווית ABCD` |
| **side or line by equation** | ~18 | `משוואת הצלע AB היא y=2x+9` · `הישר 4x+3y=0` |
| point on an object / in a region | ~14 | `C נמצאת על הישר 4x-y-9=0` · `B על ציר ה-y` · `ברביע הראשון` |
| **midpoint** | ~11 | `M אמצע AB` · `אמצע הצלע BC הוא (-1,-2)` |
| **area as a PIN** | ~10 | `שטח המשולש ABC הוא 24` |
| concurrency points | ~6 | `מפגש התיכונים` · `מפגש הגבהים` · `מרכז המעגל החסום` |
| two-case ask | ~6 | «הבחן בין שתי אפשרויות» |

**Three things this corpus does that the 572 one does not**, each with a consequence:

- **It names points far less.** «קצותיו הם (8,1), (-2,-5)», «מפגש התיכונים הוא בנקודה (1,2)» — bare
  coordinate pairs with no letter. The 572 corpus always names. *(An unnamed point does not parse
  today; the tool requires a letter.)*
- **It says «צלע» where the 572 corpus says «ישר».** `משוואת הצלע AC` does not parse while
  `משוואת הישר AC` does — a one-word gap across three exercises.
- **It has no conics at all.** The entire canonical-conic layer, which is most of what V0 built, is
  unused here.

### 8b — Two new input families (F16, F17)

The docs/19 §10 families F1–F15 were extracted from the 572 corpus. These two come from this one, and
are numbered onward rather than renumbering a settled table.

| # | family | Hebrew | English |
| --- | --- | --- | --- |
| **F16** | Derived point by ROLE | `M אמצע AB` · `M מפגש התיכונים במשולש ABC` · `O מפגש חוצי הזוויות במשולש ABC` · `H מפגש הגבהים במשולש ABC` · `P מפגש האנכים האמצעיים במשולש ABC` · `G מפגש האלכסונים במרובע ABCD` | `M is the midpoint of AB` · `M is the centroid of triangle ABC` |
| **F17** | Segment and NEUTRAL shape noun | `הקטע AB` · `משולש ABC` · `מרובע ABCD` | `segment AB` · `triangle ABC` |

**R37 — a shape noun that carries a GIVEN is not an F17 entry.** «מקבילית» asserts AB ∥ DC, «ריבוע»
asserts four equal sides. Drawing either as a plain ring of sides would drop a stated given, so they
are refused by name until the constraint layer can honour them. F17 is deliberately the *neutral*
nouns only — the ones that assert nothing beyond their vertices.

**R38 — a construction may not reference a point the figure does not have.** «M אמצע AB» before `A`
exists is refused, naming the missing point. Inventing it would place a position the question never
gave ([ADR-052](06-decisions.md#adr-052)) and spend a letter the student is about to use
([ADR-297](06-decisions.md#adr-297)). *Consequence, and a load-bearing one:* it also guarantees a
parent always precedes its dependent, which is why evaluation needs no topological sort
([ADR-AG-013](06c-decisions-analytic.md#adr-ag-013)).

**R39 — a derived point contributes NO new degree of freedom.** Its freedom is its parents', already
counted. The midpoint of `A(-9a,0)` and `B(3,4)` leaves the figure at 1 DOF, not 2 — and its
coordinates are knowledge exactly when its parents' are.

### 8c — What this corpus says about the roadmap

**It confirms R1 from an independent direction.** The object-first model was ruled from the 572
corpus's §5 questions; this corpus needs the same thing for entirely different reasons — shape nouns
and derived points rather than parallelograms and tangency.

**And it re-orders the work.** Midpoints and concurrency points outrank almost everything in B2 and
B3, and need neither, which is why they landed first
([ADR-AG-013](06c-decisions-analytic.md#adr-ag-013)). What remains, in this corpus's order: **point on
an object / in a region** (~14 exercises, on no slice yet), **area as a pin** (~10, needs B2), and the
constrained shape nouns (needs B3).

**OPEN — the 471 ↔ 572 profile split, again and more sharply.** [§5](#5--capability-inventory-from-the-corpus)
lists it as deliberately open. This corpus is what that split is *about*: no conics, no parameters,
heavy on derived points. Whether the two topics are one tool with a profile or simply one tool whose
catalog covers both is still unanswered — nothing yet forces the question, and
[ADR-AG-012](06c-decisions-analytic.md#adr-ag-012) explicitly did **not** settle it.

**R40 — a derived point can SHOW THE CONSTRUCTION that defines it.** *(Operator ruling, 2026-09-15.)*
The medians for a centroid, the altitudes for an orthocentre, the bisectors for an incentre — drawn
dotted, with the feet as dots, and each median's two **parts** labelled `2x`/`x`, `2y`/`y`, `2z`/`z`.
Behind a single global «הצג בנייה» toggle, off by default.

**The label names the PARTS, not the ratio** *(operator ruling, 2026-09-15)*. `2:1` states the
property; `2x` and `x` hand the student the variables to write the equation with, and a different
letter per median lets all three enter one calculation. That is the difference between being told a
fact and being given something to compute with, which is the whole point of R40.

The reason is R21's own: *the answer is meaningless without the way*. A derived point drawn as a bare
dot shows the answer and hides the method, and for this topic the method is the lesson. It is not
solving — the construction is what the student must build.

**The construction is DECORATION.** No id, no letter, never in the fact list; a construction line
minted as an object would occupy a name the student is about to use
([ADR-297](06-decisions.md#adr-297)). And it must be drawn from the REAL geometry — a median that does
not actually end at the opposite midpoint would teach something false, which is worse than teaching
nothing.

**Still open:** labels for the other constructions. Only the centroid's 2:1 is ruled; an altitude's
right angle probably wants a mark rather than text, and the others may want nothing at all.
See [ADR-AG-014](06c-decisions-analytic.md#adr-ag-014).

## 9 — What a REFUSAL owes the student ([ADR-AG-017](06c-decisions-analytic.md#adr-ag-017))

The honesty invariants already say a stated given may never vanish and that a message names the
STATEMENT rather than internal state. Round #1056 found three ways the tool broke them while every
test stayed green, and the common shape is worth stating as a requirement in its own right: **a rule
that recognised the student's sentence owes an answer about that sentence.** Saying "I did not
understand" about a sentence we did parse is a false statement to the student, and it routes a
well-formed given to the LLM escalation seam instead of answering it.

**R41 — a shape noun ASSERTS its vertex count, and the assertion is checked.** «משולש» is three
vertices and «מרובע» is four, in the noun the student typed *and* in the construct they named. Both
halves are the requirement: «משולש ABCD» must be refused, and so must «מפגש התיכונים במרובע ABC» —
the second built a centroid and silently ignored the word «מרובע», which is a stated given vanishing
rather than merely a missed refusal. A label may not name two vertices of one figure: «משולש ABA» is
not a triangle.

**R42 — `x` and `y` name the PLANE and cannot be a point's unknown.** «M(3,y)» is refused, naming the
supported form («M(3,t)»). They are the variables every curve equation is written in, so they are
reserved out of the free-parameter register; a point holding one would be sampled by nothing and drawn
nowhere. The requirement is that this is a DECISION at the point of entry and not a filter that drops
by omission — the original defect was accepted input that committed, drew nothing and said nothing.

**R43 — a refusal names what it collided WITH, not only that it collided.** A name clash reports what
the letter already holds, in the construct's own corpus noun («M is already the centroid»), never in
internal terms. «השם כבר משמש עצם מסוג אחר» told the student they had picked a bad name; they had not,
and it sent them to fix the letter instead of showing them the collision. A refusal that misdescribes
the problem is worse than one that is merely narrow, because the student acts on it.

**R44 — an anonymous curve's identity is its EQUATION** ([ADR-AG-019](06c-decisions-analytic.md#adr-ag-019)).
«הישר x-y+2=0» and the bare «x-y+2=0» are one line stated two ways, and the figure must hold one object,
not two. All unnamed curves therefore share a single content-derived namespace; a NAMED curve (`ℓ1`,
`מעגל I`) is identified by its name, because a name is an identity. A corollary the tool got wrong the
moment the noun became optional: **a statement that claims no family does not contradict one that
claimed a family** — only two different *claims* conflict.

**R45 — a statement that adds nothing is SAID, not silently swallowed or silently duplicated**
([ADR-AG-020](06c-decisions-analytic.md#adr-ag-020)). Restating something the figure already holds is
a legitimate thing for a student to do — it is how a question's later section refers back — so the
tool confirms it («זה כבר ידוע…») and does not add a second row. Informational, never an error: the
student was right. **A restatement that NARROWS is not this case** — «a הוא פרמטר» then «a<13» adds
information and is recorded like any other given; calling it "already known" would drop a stated given,
which is the one thing that may never happen.

**R46 — a free magnitude is sampled across everything the student left open, SIGN INCLUDED**
([ADR-AG-022](06c-decisions-analytic.md#adr-ag-022)). An unbounded parameter that only ever draws
positive asserts `a > 0`, which the question never gave — the same cardinal sin as drawing a figure
that violates a given, one step removed ([ADR-052](06-decisions.md#adr-052)). A *starting* value may be
the familiar one, so seed 0 may draw the right-opening parabola; every later configuration must be able
to reach the other sign, and «הציגו תצורה אחרת» must get there in a few presses rather than by luck.
Sampling must still stay away from a degenerate value (`a = 0` collapses `y²=2ax` to a doubled axis),
which is vacancy rather than a configuration worth showing.

**R47 — a relation is between two DIRECTIONS, and one definition serves them all**
([ADR-AG-024](06c-decisions-analytic.md#adr-ag-024)). «מקביל» and «מאונך»/«ניצב» hold between any two
things that have a direction: a segment, a polygon side, a named line, an axis. The student may write
any of them on either side, and the tool must accept the full synonym run and the optional particles.
**A stated slope is the same algebra** — parallel is equal slope — so the two share one definition; a
tool that could state a parallelism one way and measure it another would disagree with itself about
the same figure. A vertical segment has no slope, and a stated slope over one is refused rather than
satisfied.

**R48 — a given is checked whether or not the figure had freedom to spare**
([ADR-AG-024](06c-decisions-analytic.md#adr-ag-024), [#1062](https://github.com/dcodish/geo_builder/issues/1062)).
A student who places four points and then states what the question told them is exactly the student
who most wants to know their reading was right. Whether any carrier was free to move is a fact about
the SOLVER, not about whether the given holds, and it may not decide whether the student is told.

**R49 — a length is a VALUE the student can do arithmetic with**
([ADR-AG-025](06c-decisions-analytic.md#adr-ag-025)). «AB = 10», «AB = AC», «AB + BC = 10»,
«AB + BC = DE», «AB = 4√5», «2·AB = 3·CD» and «AC² + BC² = 1250» are one capability, not seven: an
equation between two expressions over lengths. A length is never negative, so a combination that would
require one is reported as unsatisfiable, naming the student's own statement. **`AB` remains a line's
name where the sentence says so** — «משוואת הישר AB היא y=2x» is corpus vocabulary too, and the two
readings are separated by which rule the sentence reaches first, not by the token.

**R50 — a NAME can be a geometric claim, and the tool honours it**
([ADR-AG-026](06c-decisions-analytic.md#adr-ag-026)). «הישר AB» is the line **through A and B**, so
giving its equation says something about those points: they lie on it. A student who states it over
points already placed elsewhere is told, and one who states it before placing them has them introduced
— free to slide along the line, which is the freedom the sentence actually leaves. An ARBITRARY name
(«הישר ℓ1») asserts nothing about any point and constrains none; the difference between the two is the
requirement.

**R51 — the NOUN is optional wherever the NAME is present** ([#1072](https://github.com/dcodish/geo_builder/issues/1072)).
02c R6 made the shape noun optional for an equation; that applies whether or not the student keeps the
object's name. «משוואת AB היא y=2x» ≡ «משוואת הישר AB היא y=2x», «l1: y=2x» ≡ «נתון הישר l1: y=2x», and
each pair is **one object**, because a name is an identity (R44). The name's own shape says what was
named — a two-point run or the `ℓ` device is a line, a Roman numeral is a circle — while the KIND still
comes from the fit, so the id records what the student called it and the classifier decides what it is.

**R52 — a length the figure KNOWS is shown, on the surface that matches its provenance**
([ADR-AG-028](06c-decisions-analytic.md#adr-ag-028)). Every drawn segment's length appears in the data
panel when it is knowledge, and `—` when it still moves. A length the student's own given **pinned** is
additionally drawn **on the segment**, because it is part of their question; a length the tool derived
is not, because it is an answer. A length stated in terms of a free parameter is a given and is **not a
number**, so it labels nothing — printing one sample of it would assert a value the question never gave.

**R53 — a point can be placed ON an object, and the NOUN says whether that is bounded**
([ADR-AG-029](06c-decisions-analytic.md#adr-ag-029)). «D על הצלע BC» and «D על הקטע BC» put `D` between
`B` and `C`; «D על הישר BC» puts it anywhere on their line, including beyond either end. Either way `D`
has **one degree of freedom** and moves along the object under «הציגו תצורה אחרת» — a bound is a region
and consumes no freedom. The object may be a side, a segment, a named line, a line given inline by its
equation, or an axis, and all of them are one sentence with one resolver. A point already placed off the
object is refused, naming the statement; a bound that can never be met on a determined figure is
reported rather than drawn around.

**R54 — a given the figure already ENTAILS is said, not recorded**
([ADR-AG-030](06c-decisions-analytic.md#adr-ag-030)). Stating something a determined figure already
satisfies adds no row and is answered «זה כבר נובע מהנתונים שכתבתם» — a different sentence from R45's
«כבר ידוע», because the student did not repeat themselves. **A given that holds only at the current
sample is NOT this case**: it must remove no freedom as well as hold, or a real given would be silently
discarded.

**R55 — an object that cannot exist is REPORTED once the figure has no freedom left**
([ADR-AG-031](06c-decisions-analytic.md#adr-ag-031)). A degenerate configuration is silent while another
configuration may yet have the object — that is R-level ADR-AG-008 and it stands. When every point is
fixed there is no other configuration, so «מפגש האלכסונים» of a concave quadrilateral, the circumcentre
of three collinear points and an empty circle are each named as not existing, rather than left absent
with nothing said.

**R59 — a shape noun carries its givens, and adding a noun is adding a ROW**
([ADR-AG-035](06c-decisions-analytic.md#adr-ag-035)). «מקבילית ABCD» draws a parallelogram that
really has `AB ∥ DC`; «דלתון ABCD», «ריבוע», «מעוין», «מלבן», «טרפז», «טרפז שווה שוקיים», «טרפז
ישר-זווית», «משולש ישר-זווית», «משולש שווה שוקיים» and «משולש שווה צלעות» likewise, with the English
nouns as aliases onto the same rows. The arity comes from the row, a contradiction («ריבוע ABCD»
with «AB = 2BC») is reported rather than drawn, and «שטח ה<noun>» names any of them — including by
the noun alone when the figure has exactly one such shape.

**R60 — an unstated choice CYCLES, and the student can consume it**
([ADR-AG-035](06c-decisions-analytic.md#adr-ag-035)). «משולש ישר-זווית ABC» does not say which angle
is right, so «הציגו תצורה אחרת» walks all three — R14's discrete degree of freedom, made real.
«זווית B ישרה» (also «הזווית B היא 90», «∡B = 90») settles it, and the figure keeps that seat at
every configuration. A vertex that names no single angle — no shape through it, or several — is
refused with the format that would work, never resolved by guessing which two rays were meant.

**R62 — a diagonal is an object, and a concurrency point has a verb**
([ADR-AG-037](06c-decisions-analytic.md#adr-ag-037)). «אלכסוני המרובע ABCD נפגשים בנקודה O» builds
the same figure as «O מפגש האלכסונים במרובע ABCD», in the construct state the sentence form actually
uses, and with the vertices optional when the figure has one shape to mean. «משוואת האלכסון AC היא
y=2x» is «משוואת הישר AC היא y=2x». **«האלכסון הראשי» and «האלכסון המשני» resolve only where the
shape noun distinguishes them** — a kite does, a parallelogram and a rhombus do not — and elsewhere
are refused by name rather than guessed.
