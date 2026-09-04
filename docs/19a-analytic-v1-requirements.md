# Analytic Builder — V1 pedagogy and requirements

**Status: IN PROGRESS.** Captured live from an operator session (2026-09-04) while the thoughts were
still being given. It is the working record, not yet the plan of record: [docs/19](19-analytic-geometry-tool.md)
stays authoritative until the decisions here are ratified as `ADR-AG-NNN` in
[06c](06c-decisions-analytic.md), at which point this file folds into 19 and is deleted.

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

Tier 3 is the boundary between "V1" and "a second constructive engine". **Open: where V1 stops.**

---

## 3 — Stating an object

**R6 — The shape noun is OPTIONAL for an equation and LOAD-BEARING for a shape.** *(Operator ruling.)*
A bare `y^2=54x` builds; «נתונה פרבולה שמשוואתה» is not required, because the fit already knows the
kind. But «מקבילית ABCD» *is* the given — it carries AB ∥ DC and nothing else states it. Both are true
and they are not in tension.

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
| **two ellipses in one figure** (part ג's «אליפסה קנונית חדשה») | ✗ **BLOCKER** — the conic *slot* refuses it: «בשרטוט יכולה להיות פרבולה אחת ואליפסה אחת» |
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
6. **R5 / 5b** — where V1 stops: tier 2 vs tier 3, and part ג in or out.
7. **R28** — what bounds "all computable" in the data panel: pairwise, named-only, or grouped?
8. The conic-slot removal needs its own ADR superseding the slot decision.
