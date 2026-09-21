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

**R11a — the PALETTE offers only what the grammar reads**
([ADR-AG-122](06c-decisions-analytic.md#adr-ag-122),
[#1129](https://github.com/dcodish/geo_builder/issues/1129)). A chip inserting a character the parser
then refuses hands the student `not-handled` on their own click, which is worse than no chip —
#511's rule, and the operator's own framing when ruling the analytic set.

The set: `²` `³` `√` `·` `π` `ℓ` `≤` `≥` `≠` `|x|` `d_{}` `x_{}`. **`°` and `∡` are deliberately absent**
until the angle capability exists (§5d marks «∡ACB = 90°» ✗); they arrive in that work's own change,
because a chip is part of shipping a notation rather than a follow-up to it.

Mechanically enforced: every entry is driven through the real grammar, with a totality guard so a
button cannot be added without a proof — and pressing any chip inside a Hebrew sentence must not
change how the line isolates, since RTL is the default and a split run is a visibly broken line.

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
**Extended (operator, 2026-09-19, #1242):** *"the idea of order is not relevant since the diagram should
either respect all input or refuse to build."* Any CONSISTENT given set builds the same figure in any
order — a constraint typed before the objects it names is honoured once a later line declares them — and a
line the figure cannot honour is refused IN FULL: nothing of it is drawn, no fragment of it reads as
accepted ([ADR-AG-133](06c-decisions-analytic.md#adr-ag-133)).

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

**Two of these are now partly answered elsewhere and are left open deliberately, not by oversight.**
[ADR-AG-072](06c-decisions-analytic.md#adr-ag-072) §5 rules that a **kind** is shown whenever the kind
is invariant across the parameter, which is R13's question asked about a locus rather than about a
stated parametric equation; and its whole lane is triggered by a point having exactly one free degree
of freedom, which is R18's "may DOF reporting prompt?" answered *yes, for this one case*. Whether
either generalises is the operator's to say.

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

**R104 — a rule owns only what it PARSED; a sentence it recognised by its noun alone reaches the fallback** ([ADR-AG-139](06c-decisions-analytic.md#adr-ag-139), [#1272](https://github.com/dcodish/geo_builder/issues/1272)). *(Operator, 2026-09-20: "we need to support all such forms of writing. I would expect the llm escape to assist in cases of minor deviations".)* A refusal is a statement about the student's own words, so a rule may refuse only a tail it actually read. «פרבולה I: y^2=2x» is not a bad equation — «I: y^2=2x» is not something the student wrote — and «נתון מעגל I - x^2+y^2=16» is not a hyperbola out of scope: the dash is the student's connective, not a sign. Such a sentence is «לא הצלחתי להבין», which is the one answer that lets the model normalise the spelling. The other direction stands unchanged: a refusal the tool genuinely owns (a truncated equation, a reserved coordinate, a degenerate role, a curve with no points) is a better answer than a guess and never goes to the model.

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

**R61 — a value is called KNOWN only if it holds across configurations that actually DIFFER**
([ADR-AG-126](06c-decisions-analytic.md#adr-ag-126)). The data panel may present a number as determined
only when the givens determine it — never because the three configurations it happened to sample were the
same picture. The tool must not print «N דרגות חופש» above a panel of certainties: freedom that the figure
reports is freedom some quantity must show. A value the student GAVE stays known (this is not "mark
everything unknown"), and a determined figure — one configuration — keeps reporting its values, which is
what R55's sibling rule protects in the other direction.

**R60 — a crossing that lands on a point the figure ALREADY HAS is refused, naming it**
([ADR-AG-125](06c-decisions-analytic.md#adr-ag-125), the analytic member of the cross-product ruling
[ADR-W-066](06w-decisions-workspace.md#adr-w-066)). Two distinct named points are never drawn at the same
place. «P נקודת החיתוך של הישר AB עם הישר CD» where that crossing IS `B` must not mint a second letter at
B's position: the geometry is right and only the name is wrong, so the tool affirms the crossing and
refuses the name, saying which point is already there. The structural member — two lines whose letters
force it — is refused at the parser (R-level, #1175); this is the POSITIONAL one, and **its freedom gate is
R55's, for R55's reason**: silent while another configuration may still separate them, reported once none
can. A coincidence in a figure that can still move is a fact about this configuration and is the
configuration search's business ([#1273](https://github.com/dcodish/geo_builder/issues/1273)), not a
refusal.

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

**R63 — a letter after «מעגל» is the centre; a NUMERAL is the circle's own name**
([ADR-AG-038](06c-decisions-analytic.md#adr-ag-038), extended by
[ADR-AG-118](06c-decisions-analytic.md#adr-ag-118)).
«נתון מעגל O שמשוואתו (x-3)²+(y-5)²=25» draws the circle and places `O` at its centre, as a point
the student can then talk about. A NUMERAL names the circle itself — a Roman numeral («מעגל I») or an
**Arabic digit («מעגל 1»)**, both 1–5 — and the circle named by a centre letter stays anonymous, so
one letter never means two objects.

The digit half is the operator's ruling of 2026-09-19 (*"the rule of I, II, III for circle names AND
1,2,3 are ok … any other capital letters would become the name of the center"*), and it is an
extension rather than a change: the set of naming tokens grows and every other capital letter keeps
its meaning. A digit needs no tie-breaking device at all, where a Roman numeral does: a point name is
`[A-Z][0-9]?`, so `I` and `V` are legal points and a bare digit is not, and «מעגל 1» therefore has no
competing centre reading to be told apart from.

**Still refused, and it is a gap rather than a decision:** «נתון מעגל 1» with NO equation. The bare
form builds an open circle today by keying its identity on the centre's letter (`circle-at-O`,
radius `r_O`), which a digit-named circle has no letter for —
[#1257](https://github.com/dcodish/geo_builder/issues/1257).
**R56 — a curve minted to CARRY a point is not drawn**
([ADR-AG-032](06c-decisions-analytic.md#adr-ag-032)). «נקודה B על הישר y=x» means *B is (t,t)*: the
point appears, the line does not. Stating «y=x» on its own line draws it — and when the carrier was
already there, that line PROMOTES it and is recorded as a change, never answered «כבר ידוע» or «כבר
נובע». The carrier remains in the data panel throughout, because it is the honest answer to *where
does B live*.
**R57 — the segment noun is optional, and naming a segment introduces its endpoints**
([ADR-AG-033](06c-decisions-analytic.md#adr-ag-033)). «EF» is «הקטע EF»: one object, one id, either
spelling. Endpoints that do not exist yet are introduced as free vertices with their two degrees of
freedom, as a shape noun's vertices are — because the sentence NAMES the segment. Referring to a
point one does not have («M אמצע AB») still refuses (R-level #1028); the difference is naming
versus mentioning, not which noun was used.
**R58 — a point can be placed in a QUADRANT** ([ADR-AG-034](06c-decisions-analytic.md#adr-ag-034)).
«C ברביע השלישי» — and «נמצאת», «הנקודה C», «נתון», and the English «C is in the third quadrant» —
draws `C` in that quadrant. It is a REGION: the point keeps both degrees of freedom, moves under
«הציגו תצורה אחרת» inside its quadrant, and a point already placed elsewhere is refused rather than
quietly redrawn.

**R59 — a crossing with a DRAWN PIECE exists only on the piece, and the figure decides what is a piece** ([ADR-AG-135](06c-decisions-analytic.md#adr-ag-135)). *(Operator, 2026-09-20, T11: "a root outside the segment is not a lesser configuration — it is not a configuration"; on the noun: "the figure is the authority".)* «P נקודת החיתוך של הצלע CA עם המעגל» has exactly the roots that lie on the side `CA`; a chord that genuinely meets the circle twice offers both; a segment that never reaches the curve has no crossing and the sentence is refused, never drawn past its own end. `CA` drawn as a side is a segment whatever word the sentence used — «הישר CA» denotes the side there and keeps its infinite reading only where the letters name nothing drawn. This is about the crossing sentence: an altitude's foot may fall beyond its side (#1232) and a point «על הישר BC» may sit beyond the endpoints (#1069), as their own rulings say.

**R60 — two positions the solver cannot tell apart are ONE position, and a determined point's locus is that point** ([ADR-AG-136](06c-decisions-analytic.md#adr-ag-136)). *(Operator, 2026-09-20 on #1259: "a cluster inside solver resolution is not an option set"; 2026-09-19 on #1227: "saying M cannot be calculated is wrong … refer to the location of point M".)* At a tangency the solves land within the solver's own resolution of one another; the panel prints ONE point there, never a list of near-identical "cases" with magnitudes nobody gave — the tolerance is derived from the solve's own stopping rule, `10·√SOLVE_TOL` of scale. And «המקום הגיאומטרי של M» on a determined M answers M's position («נקודה · (4, 0)») or its finite set («שתי נקודות · (4, −3), (4, 3)») in the locus lane's own grammar; «לא ניתן לחשב מהנתונים» is reserved for what the givens genuinely do not fix, and «עדיין לא נקבע» for an open figure.

**R61 — two distinct named points are never opened on top of each other** ([ADR-W-070](06w-decisions-workspace.md#adr-w-070), [ADR-AG-138](06c-decisions-analytic.md#adr-ag-138)). *(Operator, 2026-09-20, T18: "even if they do fall on the same point by chance … the system should not show them on top of each other. It should automatically look for a different config and show them differently"; the same rule in every builder.)* Where a configuration keeps the figure's named points apart, the tool opens on it by itself. A preference below validity, never a requirement: a figure whose every configuration stacks two labels is still drawn — refusing such a statement is R43/#1254's job — and the tolerance is the figure's own span, never an absolute number.

**R61 — a circle marks its centre** ([ADR-AG-036](06c-decisions-analytic.md#adr-ag-036)). Every drawn
circle shows its centre, because in analytic geometry the centre is always part of the figure. The
mark appears whenever the circle does; the VALUE beside it appears only when the givens fix it, so a
circle whose centre rides a parameter is marked and left unlabelled rather than labelled with one
sample's coordinates. The centre owns no letter — it is part of the circle, not a point the student
named.
**R64 — a shape is never drawn collapsed** ([ADR-AG-039](06c-decisions-analytic.md#adr-ag-039)). The
vertices of a shape are distinct points, and a configuration that puts two of them in the same place
is not shown — «דלתון ABCD» never draws `B` and `D` together, however well that would satisfy its
equal sides. It costs no freedom: the figure is as open as the givens leave it, and only the drawing
is filtered.

**R65 — a measure can be compared to another measure**
([ADR-AG-040](06c-decisions-analytic.md#adr-ag-040)). «שטח ABC גדול פי 3 משטח CEF», «AB גדול פי 2
מ-BC», «AB גדול ב-2 מ-BC» and «שטח ABC = שטח CEF + 4» are all givens the figure honours, and areas
and lengths mix freely in one expression. A comparison a determined figure does not satisfy is
refused, naming the statement.

**R66 — a point on a line shows what the line makes of it**
([ADR-AG-041](06c-decisions-analytic.md#adr-ag-041)). «B על הישר y=x» reads `B = (x_B, x_B)` in the
data panel — the dependency, not a value — and the carrier itself gets no row of its own, because a
curve row cannot say whose carrier it is. A point on a circle keeps its open row.

**R67 — the panel shows every drawn segment's SLOPE**
([ADR-AG-041](06c-decisions-analytic.md#adr-ag-041)), under the same honesty gate as every other row:
a number when the givens fix it, «אנכי» for a vertical segment — which is an answer, not an absence —
and an open row when the figure is still free to change it.

**R68 — stating where an existing point is, is a given about it**
([ADR-AG-042](06c-decisions-analytic.md#adr-ag-042)). «M(3,2)» after «M מפגש התיכונים במשולש ABC»
says the centroid is there: true, and it is accepted; false, and it is refused naming the statement;
and on a figure that can still move, the figure moves until it holds. «שיעור ה-x של M הוא 3» is the
same given with the y left open. Naming a point and THEN defining it a second way is still refused.

**R69 — the data panel can be ASKED** ([ADR-AG-044](06c-decisions-analytic.md#adr-ag-044)). Its own
input box answers questions about the figure without changing it: «AB», «שטח ABC», «AB + BC»,
«2AB», a point's name for its coordinates, «משוואת הישר ℓ1» for its equation. **A thing is askable
because it is sayable** — the ask lane reads the same measure grammar the givens do. An answer passes
the same honesty gate as every row, and an unanswerable question says WHY: not fixed yet, cannot be
computed, or not understood.

**R70 — a circle can be given by its centre, and pinned by TANGENCY**
([ADR-AG-045](06c-decisions-analytic.md#adr-ag-045)). «נתון מעגל O» draws a circle with a free centre
and a free radius — three degrees of freedom, and it moves under «הציגו תצורה אחרת». «מעגל O משיק
לציר x» says the distance from the centre to that axis is the radius, which is how the corpus pins a
circle without giving a number; «משיק לשני הצירים» says it twice. Which SIDE of the axis the circle
sits on is not asserted, because the student did not say.

**R71 — a curve the givens have not fixed shows its equation**
([ADR-AG-046](06c-decisions-analytic.md#adr-ag-046)). «נתונה פרבולה שמשוואתה y²=2px» reads
`y^2 - 2·p·x = 0` in the data panel rather than `—`, and a circle stated by its centre reads that
centre and radius. No value is printed — the row names what the figure depends on, which is what
being open actually means.

**R72 — a value with two roots is listed as BOTH**
([ADR-AG-047](06c-decisions-analytic.md#adr-ag-047)). «C נמצאת על הישר 4x-y-9=0» with «שטח המשולש ABC
הוא 7» reads `(1, -5) או [(3, 3)]` in the data panel, with the drawn one marked — never one of them
alone, and never a dash. A point with continuous freedom is not an option set and keeps its open row.

**R73 — a crossing can be NAMED** ([ADR-AG-048](06c-decisions-analytic.md#adr-ag-048)).
«P נקודת החיתוך של המעגל I עם ציר ה-x» places `P` on both, and where there are two crossings the panel
lists both (R72) while «הציגו תצורה אחרת» moves between them. Two lines, a line and an axis, and a
curve and an axis all read the same way; an operand the tool cannot read is refused by name.

**R74 — a conic is named by its KIND** ([ADR-AG-049](06c-decisions-analytic.md#adr-ag-049)).
«הנקודה A נמצאת על האליפסה», «נקודה B על המעגל» and «P על הפרבולה» place the point on the one curve of
that kind — including a circle given by its centre, and a conic whose kind comes from the fit rather
than from a noun. A figure holding two of a kind refuses the reference rather than picking or
inventing an ordinal, because no exam in the corpus ever needs one.

**R75 — naming a shape draws it** ([ADR-AG-050](06c-decisions-analytic.md#adr-ag-050)).
«שטח המשולש ABC הוא 7» and «M מפגש התיכונים במשולש ABC» each draw the triangle they name, with the
givens that noun carries — the same object «משולש ABC» would have built, absorbed if it is already
there. «שטח ABC הוא 6» names no shape and draws none; a noun whose arity disagrees with its vertices
is refused.

**R76 — a crossing can be clicked, and it adds the SENTENCE**
([ADR-AG-054](06c-decisions-analytic.md#adr-ag-054)). Where two drawn straight pieces cross and both
can be named, a dashed ring marks the spot; clicking it adds «P נקודת החיתוך של הישר AB עם הישר CD»
to the givens — the same line typing it would add, editable and removable like any other. No ring is
offered where a point already stands, or where either object has no name the grammar can use.
**Amended by [ADR-AG-056](06c-decisions-analytic.md#adr-ag-056) (#1092):** a curve's EQUATION is such
a name. «נתון הישר y=9» and the bare «y=9» offer rings reading «...עם הישר y=9», and that sentence
re-parses to the same curve rather than a second one. The limit that remains is AMBIGUITY, not
namelessness. **Amended again by [ADR-AG-061](06c-decisions-analytic.md#adr-ag-061) (#1096, operator
ruling):** a CONIC's crossings are offered too — «האליפסה x^2/9+y^2/4=1» names exactly one curve — and
where a line meets a conic twice, clicking a ring shows the solution at THAT ring. A tangency offers
no ring while the sentence it would add does not build (#1100).

**R77 — the session can be SAVED, and a load says what it restored**
([ADR-AG-055](06c-decisions-analytic.md#adr-ag-055)). The figure has a name, the session downloads as
`<name>-analytic.json`, and opening one replays the student's own lines through the real parser. A
file from another builder is refused as that builder's, a file from a newer version says to refresh,
and any line that no longer builds is NAMED rather than dropped — a saved figure holds the sentences,
not the coordinates, so the tool can always answer "which of my givens did you lose?".

**R78 — the input panel never reorders what the student wrote**
([ADR-AG-055](06c-decisions-analytic.md#adr-ag-055)). Every line here is a Hebrew sentence carrying an
equation, so an LTR run laid out under an RTL base does not merely look odd — «(x-3)^2+(y-4)^2=9»
becomes «2+(y-4)^2=9^(x-3)», a formula the student did not write. Every surface that shows a line —
the box while typing, its live preview, the example chips, the fact list and its editor — isolates the
runs and takes its direction from the content.

**And the live preview TYPESETS what it shows** ([ADR-W-070](06w-decisions-workspace.md#adr-w-070) ·
[#1152](https://github.com/dcodish/geo_builder/issues/1152)). The strip under the box and the fact row
a few pixels below it show the same equation, so one of them printing `^2` where the other draws a real
superscript tells the student their transcription came out wrong when it did not. Mathematics is
typeset wherever it is shown — the #1082 ruling, on this surface.

**Its trigger is the presence of MATHEMATICS, not the presence of a bidi change.** A pure-LTR equation
— «(x-3)^2+(y-4)^2=9» with no Hebrew around it — needs no isolation, so it used to get no strip at
all. It gets one: the strip is not a bidi repair that sometimes appears, it is what you typed, typeset.

**Order matters: isolate first, then typeset.** The runs are decided by the bidi layer and its isolate
characters ride through the typesetter untouched. Typesetting the raw text instead would reorder the
equation — exactly what R78 exists to prevent.

**R79 — a centre the student NAMED carries its value**
([ADR-AG-055](06c-decisions-analytic.md#adr-ag-055)). «נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25» draws
`O(3, 5)`: the equation is read, not solved, so the centre is as given as writing `O(3,5)` would be.
A parametric circle's centre stays open — no sampled number reaches the canvas (ADR-052) — and only
ONE label is drawn at the place, so nothing can hide anything.


**R80 — a line can be CONSTRUCTED through a point** ([ADR-AG-057](06c-decisions-analytic.md#adr-ag-057)).
«דרך P עובר ישר מקביל ל AB» and its perpendicular sibling draw the line through P whose direction is
copied from AB — from a named line, or from an axis, whichever the student names. The construction
adds no degrees of freedom: the anchor's are the anchor's and the direction is copied, so the tool
asserts nothing the question did not give (ADR-052). An anchor that does not yet exist is introduced
with DOF, as «הישר AB» introduces A and B; the direction operand is a reference and introduces
nothing.


**R81 — the chrome is the suite's** ([ADR-AG-058](06c-decisions-analytic.md#adr-ag-058)). The figure's
name sits centred above the canvas, the canvas controls in its inline-end corner, and the under-canvas
row carries «הציגו תצורה אחרת» as its one accent with «בטל · בצע שוב · נקה הכל» opposite — the
same row, in the same order, as every other builder. **A step can always be taken back:** undo and
redo cover adding, editing, deleting and clearing, and because the session is the line list, an undone
figure is re-derived rather than restored.


**R82 — the givens list is typeset, like the data panel**
([ADR-AG-059](06c-decisions-analytic.md#adr-ag-059)). A line the student typed is shown with its
formula rendered — `(x-3)²+(y-5)²=25`, not `(x-3)^2+…` — in the panel they read to check what they
told the tool, and the Hebrew around it stays Hebrew. Editing a line still shows the characters they
typed: what is displayed is derived, never stored.


**R83 — the canvas can be moved and aimed** ([ADR-AG-060](06c-decisions-analytic.md#adr-ag-060)).
Dragging moves the view; the wheel zooms about the cursor, so the point being read stays where it is.
The grid and the tick labels stay crisp and true at every zoom, because the view re-projects the world
box rather than scaling the drawing. ↺ restores the framing and re-arms the automatic centring; until
the student moves the view, a figure that grows stays framed.


**R84 — an answer shows the move that produced it**
([ADR-AG-062](06c-decisions-analytic.md#adr-ag-062)). Asking for a distance or for a line's equation
shows the formula **with this figure's values substituted** — `d = √((4-1)² + (5-1)²)` under
`AB = 5` — never the bare formula and never the arithmetic worked through, which would be the tool
doing the student's homework. The formulas are AUTHORED in the subject's own words, because a
rendering derived from the engine would be correct and unlike anything in a notebook. A row with no
technique behind it — a coordinate read off the givens, a line the student wrote down, a sum they
assembled — shows none, and an answer the figure does not determine shows none either.

**R85 — an intersection sentence can say WHICH crossing it means**
([ADR-AG-065](06c-decisions-analytic.md#adr-ag-065)). A straight meets a conic twice, and both
crossings are offered, so the student must be able to name either: «נקודת החיתוך **הראשונה**/**השנייה**
של הישר AB עם המעגל I». Two sentences naming crossings of the same pair name **two different points** —
the tool may never put two letters on one location — and the ring a student clicks commits the sentence
for the crossing under it, so what is written down re-reads as the point that was clicked. Where a pair
has only one crossing the sentence carries no ordinal, because there is nothing to disambiguate.

**R86 — a measurement can be reached by CLICKING, and a distance is shown as a construction**
([ADR-AG-066](06c-decisions-analytic.md#adr-ag-066)). Clicking a point or a line offers the questions
that object admits — a point's coordinates and its distance to each named line; a line's equation, its
slope, and the length between its two nodes when its name really is two points. Each option is the
**sentence the student could have typed**, and choosing it asks that sentence, so the click teaches the
wording rather than hiding it. The distance from a point to a line is **drawn**: the perpendicular from
the point, the right angle at its foot, and the value on it — never the number alone, because the
construction is what the student has to perform. It is decoration and never an object, an ask never
changes the figure (R24), and the height appears only when the distance is knowledge (R25) — on a
figure that does not fix it, the answer is open and nothing is drawn.

The answer **stays in the panel** once asked ([ADR-AG-067](06c-decisions-analytic.md#adr-ag-067)): the
panel is a record of what the student asked and what the figure answered. What the canvas shows is a
**view** of it — clicking the same menu entry again clears the dotted line and **keeps the row**, and
clicking once more draws it again. Only the ✕ on the row discards the record, and its drawing goes with
it. **Typing** the same question again is a different gesture and must neither duplicate nor hide: it
re-answers, replaces its row, and shows.

**R87 — a point the givens leave one degree of freedom has a מקום גיאומטרי, and the tool draws it,
names it and prints its equation when it can determine it**
([ADR-AG-072](06c-decisions-analytic.md#adr-ag-072)). Locus is the most-asked construct in the
corpus — 13 of 20 — and the exam prints no figure for it (P1).

**It is asked, not stated.** The student describes the point with ordinary givens, leaving it free:
«נקודה P» and «PA מאונך ל-PB» is a P with one degree of freedom left, and the DOF cue already says so
(R18, P4). Then the ask lane is asked — «המקום הגיאומטרי של P» — and the answer is a row plus a
drawing, under R86's lifetimes: clicking the entry again clears the drawing and keeps the row, ✕
discards both. **There is no locus sentence to learn**; the set-former phrasing is sugar over the same
figure, and a locus that needs a quantifier over *objects* rather than points («מרכזי המעגלים
שהקטע AB הוא מיתר שלהם») is refused by name rather than approximated (R-refusal, §9).

**What the answer contains, and what gates each part.** The **trace** is drawn whenever the point has
exactly one free degree of freedom — and this is the one drawn answer that is honest *because* the
figure is under-determined, since it shows every position the givens allow rather than one sample.
R25's "shown only when it is knowledge" therefore gains a second arm here rather than an exception: a
locus is knowledge **as a set**. The **kind** (ישר · מעגל · פרבולה · אליפסה — the corpus has no
others) is named whenever the kind is the same for every admissible parameter value. The **equation**
is printed only when the *set itself* is the same for every admissible parameter value — swept at two
seeds it must come back the same curve. Where a parameter moves the set, as in חורף 25's
`A(−9a,0)`, `B(41a,0)`, the student sees the circle, sees that it is a circle, sees it grow as
«הציגו תצורה אחרת» changes `a` (P6), and sees **no equation** — because naming one would mean either
asserting one sample's `a` as a given (P3, [ADR-052](06-decisions.md#adr-052)) or deriving a symbolic
form, which is the NO-CAS boundary.

**R25a — the object the student asked for is ON SCREEN**
([ADR-AG-120](06c-decisions-analytic.md#adr-ag-120),
[#1198](https://github.com/dcodish/geo_builder/issues/1198)). The view is fitted to everything that
gets DRAWN, not to the figure alone. A traced locus is decoration the caller hands to the renderer
after the frame has been decided, and measured on the figure above it fell outside the frame in **4
of 6 configurations** — the tool clipping the one thing the question was about. A trace the student
has collapsed does not widen the frame: it is not on the canvas, and zooming out for something
invisible is the same failure pointing the other way.

**And the frame stays put across «הציגו תצורה אחרת»** ([ADR-AG-137](06c-decisions-analytic.md#adr-ag-137),
[#1262](https://github.com/dcodish/geo_builder/issues/1262) — #1198's second symptom, ruled
2026-09-20: *"fit once, then the frame is the student's"*). The control changes the DRAWING inside a
frame that stays where it was — flipping transparencies on one projector — and whatever zoom or pan
the student had is kept. The frame re-fits only when the new configuration has largely left it, the
same rule that governs a new fact; a configuration much larger or smaller than the first may then be
badly framed, and re-centre is the escape hatch. Measured on the figure above: the shown window is
identical at every press (was a factor of 3 in width and a ±60 swing in centre).

**The tool never grades.** The student does not type a claimed equation to be marked ✓ or ✗ (operator,
2026-09-16: *"I dont want a validation tool"* — ADR-AG-072 §6, amending
[ADR-AG-001](06c-decisions-analytic.md#adr-ag-001) D1). The tool's own arithmetic is still checked
against itself: an equation it cannot re-verify against the trace it drew is **not printed at all**,
and the shape stands alone. A printed equation is a claim the tool makes, and the honesty invariant
binds it exactly as it binds every other row that prints a number.

**R88 — a RATIO between two lengths is a given the student can state**
([#1124](https://github.com/dcodish/geo_builder/issues/1124)).

The exam writes a division in three ways, and all three are accepted:

| the student types | what it does |
| --- | --- |
| «AC:CB = 3:2» | a relation between two lengths over points that **already exist** |
| «C מחלקת את AB ביחס 3:2» / "C divides AB in ratio 3:2" | **mints** `C` on `AB`, between its ends |
| «היחס בין AC ל-CB הוא 3:2» | the exam's prose spelling of the same placement |

The split is by FORM, not by preference: the bare colon references endpoints, the keyworded divider
creates one — which is what lets a student state the whole thing in a single sentence.

A ratio is a **rewrite of a length equation**, not a new kind of given: `AC:CB = p:q` means
`|AC| = (p/q)·|CB|`, which is the same constraint «AC = 1.5CB» already stated. The two produce the same
figure, and that is asserted rather than assumed.

**Out of scope, and refused by name:** an n-way chain, «AC:CB:BD = 3:2:4». Reading the first pair out of
it would silently drop a stated given.

**R89 — a notation the tool WRITES is a notation it READS**
([#1127](https://github.com/dcodish/geo_builder/issues/1127),
[#1134](https://github.com/dcodish/geo_builder/issues/1134)).

| the student types | why it must be read |
| --- | --- |
| `x_A = 5`, `y_A = 3`, `x_{A} = 7` | the data panel PRINTS coordinates this way, and R31c calls it canonical |
| «x של A הוא 5» | the bare form, beside the noun forms «שיעור ה-x של A…» / «ערך ה-x…» |
| «קדקוד A(1,2)» | the exam's own Hebrew word for a vertex, wherever «הנקודה» is admitted |
| «מרחק של C מ-AB» | the same distance question as «המרחק מ-C ל-AB», in the other word order |

A product that writes a notation and then refuses it back teaches the student that their own correct
transcription is wrong, and sends them hunting for a mistake they did not make.

**And the converse: a sentence the tool OFFERS must be one worth writing**
([ADR-AG-130](06c-decisions-analytic.md#adr-ag-130) ·
[#1235](https://github.com/dcodish/geo_builder/issues/1235)). A clickable crossing ring composes a given
and puts it in the student’s own list of what they stated, so it carries the tool’s word that the
sentence means something. «P נקודת החיתוך של הישר CE עם הישר CE» does not — a line does not cross
itself — and a student cannot be expected to know that is something the tool should have known.

**No offered ring names one object twice, and none is offered where a point already sits.** Both are
questions about whether two things are the SAME thing, so both are judged relative to the figure’s own
scale, never against an absolute number (ADR-AG-021). An absolute threshold on a quantity that carries
the scale is not a threshold on anything geometric, and it is how a second and third letter reach one
location.

**A component states ONE coordinate.** `x_A = 5` leaves `y` free, as every component form does — pinning
both would invent a given the student never stated (ADR-052).

**R90 — a circle's CENTRE can be given a letter, by clicking it or by saying so**
([#1109](https://github.com/dcodish/geo_builder/issues/1109)).

«O מרכז המעגל I» · «O is the centre of circle I», and the same sentence offered by clicking the centre
mark that R31 already draws.

**It names; it never asserts.** The letter attaches to the point the circle already determines and
commits no constraint and no degree of freedom — so on «נתון מעגל O משיק לציר x» the centre keeps its
freedom after being named. A label is not a given.

**The offer appears only where a name is missing**, and disappears once one exists: a centre that already
carries a letter, or has a point sitting on it, is not offered again. An ANONYMOUS circle is not offered
either — there is no «המעגל ‹name›» to write, and a sentence the parser cannot read back must never be
offered (R-level statement of ADR-AG-048's «two surfaces, one grammar»).

**Circle-only.** A parabola's focus and an ellipse's centre are the same question and are not covered.

**R91 — a shape noun promises a RING, and every configuration drawn honours it**
([#1158](https://github.com/dcodish/geo_builder/issues/1158) ·
[#1166](https://github.com/dcodish/geo_builder/issues/1166)).

«טרפז ABCD» promises a trapezoid, and a trapezoid is a **simple** quadrilateral — its sides do not
cross. «משולש ABC» promises a triangle, and three points on one line are not one. Neither promise is
carried by the relations the noun lowers to, so both are kept where the tool chooses which
configuration to show: a crossed or collapsed ring is never drawn, and never offered by
«הציגו תצורה אחרת».

**This is a promise about the NOUN, not about beauty**, and it stops exactly where the noun stops:

- **Simple, not convex.** A concave «מרובע» is a legitimate quadrilateral and the exam draws them.
  Only a ring that crosses *itself* is rejected.
- **Collapsed, not narrow.** A thin triangle is honest — R14's unstated magnitudes are free, and a
  figure whose givens force a tight wedge must still be drawable. Only an exactly-flat ring is
  rejected.

Rejecting either of the two right-hand cases would assert a given the student never gave, which is
the same cardinal sin as drawing a figure that violates its givens ([ADR-052](06-decisions.md#adr-052)).

**R92 — among the configurations it MAY show, the tool opens on one that is not a sliver**
([ADR-AG-128](06c-decisions-analytic.md#adr-ag-128) ·
[#1174](https://github.com/dcodish/geo_builder/issues/1174)). R91 decides what may be drawn; this
decides which of those is drawn first. A student who states «משולש ABC» and nothing about its shape
should not be shown a 1.4° wedge when a 25° triangle is two presses away — the tool is choosing, and
when it chooses it should choose a figure the student can work on.

**It is a PREFERENCE and never a requirement**, which is what keeps it on the right side of R14. A
figure whose givens force a tight wedge is still drawn, unmoved and without complaint; the preference
simply has nothing better to offer. And it never reaches what the tool CLAIMS: a value is known only
if it holds across the configurations the tool would admit, not across the ones it finds handsome.

**Variety survives it.** «הציגו תצורה אחרת» still walks ten distinct configurations in ten presses
on the reported figures; a preference that narrowed the figure down to one picture would be trading
one defect for a worse one.

**Where the student's own coordinates force a bad ring** — four pinned points written in an order
that crosses, or three collinear points called a triangle — **the line is refused**
([ADR-AG-129](06c-decisions-analytic.md#adr-ag-129) ·
[#1170](https://github.com/dcodish/geo_builder/issues/1170)). The figure is determined, so there is no
configuration to choose and nothing the tool can do to honour the noun. Operator ruling, 2026-09-17,
having been offered draw-with-a-notice instead: refuse it.

The refusal is about the RING and names the statement the student wrote, never a search that failed —
on a determined figure there was only ever one configuration, so «לא נמצאה תצורה» would not be a true
sentence. It points at the two things the student can change: the order of the letters, or the
coordinates.

**One line gets one message, and the more specific one wins.** «P מפגש האנכים האמצעיים במשולש ABC» on
three collinear points declares the triangle and asks for its circumcentre at once; it keeps R-level
ADR-AG-008’s answer — the circumcentre is what was asked for and it is what does not exist — and gains
no second refusal beside it.

**R92 — a point may be NAMED before it is PLACED**
([#1136](https://github.com/dcodish/geo_builder/issues/1136)).

«נקודה M» · «נתונה נקודה M» · «M היא נקודה» · «point M» introduces `M` as a point with **two degrees
of freedom** — drawn at a sampled position, moving when «הציגו תצורה אחרת» advances the
configuration, counted by the DOF cue (R18, P4), and pinned by any later given that determines it.

**It is a free point, not a default.** A point that exists but never moves would be a magnitude the
tool asserted and the student never gave, which is R14's rule and
[ADR-052](06-decisions.md#adr-052)'s cardinal sin wearing a different hat. Two configurations must
place it in two different places.

**This is what R87 stands on.** A locus is a point described by its property, so the property has to
have something to attach to. Before it, the only way to obtain a 2-DOF point was to name it as the
vertex of a polygon — «משולש ABM» — which asserts a triangle the question never mentioned.

**A LINE still cannot be named before it is determined** («ישר k»), and a circle already could
(«מעגל O»). That asymmetry is known and filed
([#1171](https://github.com/dcodish/geo_builder/issues/1171)), not intended.

**R93 — what a shape noun leaves UNSTATED is the tool's assumption, and stating it is new information**
([#1159](https://github.com/dcodish/geo_builder/issues/1159)).

«טרפז ABCD» promises that **one** pair of opposite sides is parallel. It does not say which — the
student wrote a noun, not a pair — so the tool picks one by the ring's lettering in order to draw
anything at all, and that pick is **its own**, never a given.

Two consequences, and both are promises to the student:

- **Naming a pair settles it.** «AB מקביל ל-CD» pins the pair the tool had merely guessed; «BC מקביל
  ל-AD» replaces the guess with the other pair and the figure ROTATES. The tool never keeps its
  assumption *and* the student's statement — that draws a parallelogram on a figure they called a
  trapezoid.
- **An assumption is never quoted back as their own given.** «זה כבר נובע מהנתונים שכתבתם» — *it
  already follows from what you wrote* — may only be said about things they actually wrote. A
  statement that pins an assumption is recorded like any other given, because it narrowed the figure's
  commitment even though it moved nothing.

**A noun that genuinely states a choice is different.** «מקבילית ABCD» gives BOTH pairs — the noun says
so — so restating one really is a restatement, and «כבר ידוע» is the honest answer there. The
distinction is whether the *noun* settled it or the *tool* did.

**One statement gets one answer.** A segment is undirected and so are ∥ and ⊥, so «AB מקביל ל-CD» and
«AB מקביל ל-DC» are the same sentence and must never receive different replies.
**R94 — a value the student stated exactly is DISPLAYED exactly**
([#1120](https://github.com/dcodish/geo_builder/issues/1120)).

The slope of «y=(4/3)x» is **4/3**, and the panel says `4/3`. It does not say `1.33`, which is a
different number — this tool is about exactness, and rounding a stated value into a wrong one teaches
the student to write the wrong one on an exam.

**Small rationals only, and only where the value is already knowledge.** A number is shown as a
fraction when it is one to within a tight relative tolerance and its denominator is small; anything
else keeps the house two-decimal display (R-level: [#723](https://github.com/dcodish/geo_builder/issues/723)'s
ruling is untouched, and this sits ABOVE it). **A decimal the student typed is their number**:
`1.3333` is displayed as `1.33` and never dressed up as `4/3`.

There is no √ or π form in this tool yet — those values show as decimals until the corpus asks for
them.
them.

**R95 — a name that denotes a line denotes it to every question, and to every surface**
([#1148](https://github.com/dcodish/geo_builder/issues/1148), [#1139](https://github.com/dcodish/geo_builder/issues/1139)).

`AB` is a line whenever `A` and `B` are points the figure holds — whether the student drew it as a
line, stated it as a segment, or got it as a side of «משולש ABC». Every question that can be asked
about a line can be asked about it: its **equation**, its **slope**, and the **distance** from a point
to it. A question the tool answers in one spelling and refuses in another is the tool disagreeing with
itself about what the figure contains.

**R95a — and what a line can be ASKED, its row SHOWS**
([ADR-AG-121](06c-decisions-analytic.md#adr-ag-121),
[#1219](https://github.com/dcodish/geo_builder/issues/1219)). A determined line's fold carries its
**explicit form** («הצורה המפורשת», `y = mx + b`) beside the general one already in its row, and its
**slope**. Neither is computed for this: the slope was reachable by asking all along and had nowhere
to be shown, which is the same tool-disagrees-with-itself failure R95 is about, one surface over.

**A VERTICAL line says «אנכי», not nothing.** It has no explicit form — `x = 4` is already its natural
one — and no slope, and *saying so is knowledge*: the rule this tree already applied to a vertical
SEGMENT, which the line row had not inherited. An invented «y = ∞x» and a silently empty row are both
wrong, and the second is what an unconsidered version of this would have produced.

A fractional slope is written the way a textbook writes it, with the fraction after the variable —
`y = -x/2 + 7/2`, never `y = -1/2x`. The explicit form cannot clear its fractions the way the general
form does (its `y` coefficient is fixed at 1), so it obeys #1180's ruling by notation instead of by
scaling.

An **open** line keeps its open form and gains no slope built from one configuration's numbers
(#1023, [ADR-052](06-decisions.md#adr-052)).

**The menu offers exactly what the lane answers.** An option the click menu composes must be a
sentence the ask lane answers; the two are one enumeration, not two lists that happen to agree. A
drawn side is an object the student can see, so it is an object they can click.

**The honesty gate is unchanged and applies per question.** A line whose coefficients are the same in
every configuration has an equation; one that moves does not, and says so. A line can be knowledge
while the points naming it are not — «A(0,0)» with «B על הישר y=x» has the equation `x - y = 0` and no
length — and each question is answered on its own terms.

**R96 — every spelling of one question gets one answer, and the operands decide the roles**
([#1151](https://github.com/dcodish/geo_builder/issues/1151)).

«המרחק בין C ל-AB» and «המרחק בין AB ל-C» are the same question. So are «מרחק של C מ-AB»,
«distance from C to AB» and «distance between AB and C». A grammar that answers one and refuses
another is teaching the student that the tool has a secret word order, which no exam has.

**Roles come from what each operand IS, never from where it sits.** A one-letter name is a point; a
two-letter name or a curve name is a line. Two points are a plain distance — «המרחק בין A ל-B» is the
length `AB` and answers the same number — and a point with a line is the distance to that line,
written in either order.

**The distance between two PARALLEL lines is askable, and between crossing ones it is refused**
([ADR-AG-132](06c-decisions-analytic.md#adr-ag-132) ·
[#1205](https://github.com/dcodish/geo_builder/issues/1205)). «המרחק בין AB ל-l1» answers when the two are
parallel — the third member of the measure family, beside a point pair and a point-to-line.

**When they cross, the tool refuses and says why.** There is no single distance between intersecting
lines — it is zero at the crossing and grows away from it — so answering `0` would let a misconception
stand (operator ruling, 2026-09-19). The refusal names the parallel condition and names what CAN be
asked instead: the distance from a point to a line, or the crossing point itself. It is not
«לא הבנתי את השאלה» — the question was understood — and not «לא ניתן לחשב מהנתונים» either, which
would blame the student’s givens for a question that has no single answer at all.

**A question naming something absent is told so.** «המרחק בין C ל-QR» on a figure with no `QR` reports
the missing object; it never answers «לא ניתן לחשב מהנתונים», which is a claim about the figure rather
than about the question.

**Every NOTATION for a distance is the same question** ([ADR-AG-119](06c-decisions-analytic.md#adr-ag-119),
[#1128](https://github.com/dcodish/geo_builder/issues/1128)). **Operator ruling, 2026-09-16:**
*"`d_{AB}` should also work for questions. as well as `|AB|`"*, and on the spelling list,
*"we need to support all of these"*.

`AB` · `d_{AB}` · `d_{A,B}` · `d(A,B)` · `|AB|` · «המרחק בין A ל-B» · «המרחק בין A לבין B» ·
«המרחק מ-A ל-B» · «המרחק AB» · «אורך AB» · «אורך הקטע AB» · «הקטע AB» · «צלע AB» — one term, on both
surfaces. Before this a student had exactly one way in, the symbolic `AB = 10`, and every plain
Hebrew word for a length was refused.

**A length noun is admitted only when it adds NOTHING to the pair it precedes.** «הקטע», «צלע»,
«אורך» and «מרחק» name the measurement and no more, so «הקטע AB = 10» is `|AB| = 10`. «תיכון»,
«גובה», «שוק», «בסיס» and «יתר» each assert something BESIDES a length — that the segment is a
median, a height, a leg, a base, a hypotenuse — and reading those as a bare length would drop the
student's claim silently, so they stay refused until the tool can honour both halves. «הישר AB» is
refused for its own reason: a line has no length (R103's extent ruling).

**The Hebrew word for «=» is one of the spellings** ([ADR-AG-127](06c-decisions-analytic.md#adr-ag-127),
[#1260](https://github.com/dcodish/geo_builder/issues/1260)). «אורך הקטע AB הוא 10» states exactly what
«אורך הקטע AB = 10» states — as do «היא», «הם», «הן», «שווה» and «שווה ל-» — so a student
who finishes the sentence in words is understood.

**And a BOUND is never an equality.** The connective is an allowlist of the words that mean "is",
not a list of the words that do not. «אורך AB גדול מ-10», «אורך AB לפחות 10» and «אורך AB > 10»
state a RANGE; none of them may commit `AB = 10`. An unfamiliar connective goes unread and
escalates — the tool would rather not understand a sentence than invent a given from it.

**A stated curve is nameable however it entered the figure**
([#1149](https://github.com/dcodish/geo_builder/issues/1149)). A line the student first used to carry
a point and then stated on its own is the SAME line as one stated outright, and behaves identically —
same crossing rings, same name. How an object came to exist is the tool's bookkeeping, not something
the student should be able to feel.

**R97 — a given the tool accepted is DRIVEN, or it is refused; it is never quietly ignored**
([#1201](https://github.com/dcodish/geo_builder/issues/1201)).

«המרחק מ-A לישר l1 = 5» is a statement about the figure, exactly as «AB = 5» is. Once accepted it must
shape the drawing — and when no configuration can satisfy it, the tool says so and names the student's
own sentence. What it may never do is draw a figure that contradicts a given while listing that given
as one it holds.

**This is the honesty invariant at the level of the SOLVE, not the parser.** A statement can survive
parsing, become the right constraint, and still be dropped on the way to the drawing — and that is the
worst of the three failures, because nothing on screen says anything is wrong.

**A magnitude that cannot be measured is not a magnitude that is satisfied.** Where the tool cannot
evaluate a stated quantity at all, it must treat that as a fault to report rather than as a residual of
zero — which is what "no opinion" silently becomes inside a least-squares solve.

**R98 — a position carries at most one name, and a second naming is REFUSED, never silent**
([#1153](https://github.com/dcodish/geo_builder/issues/1153)).

«P מרכז המעגל I» names the centre. A later «O מרכז המעגל I» is not a second point — it is the same
point, named again — and the tool says so, naming the letter that already holds it. Three letters
stacked on one position is a figure the student cannot read, and it is drawn from statements that each
looked accepted.

**Renaming is an action the student takes, never a substitution the tool performs.** The refusal names
the holder and says what to do about it; nothing is silently re-pointed at a different letter.

**Naming the same thing with the SAME letter stays a no-op.** Repeating «P מרכז המעגל I» is a student
restating themselves, and restatement has always been absorbed.

This is about **one object named twice**. Two points the student stated independently that happen to
land on one position is a different question — the tool may not assume a coincidence was asserted when
an unstated magnitude is a free DOF (ADR-052) — and it is not answered by this requirement.

**R99 — a panel heading names what the rows ARE, in the student's own word**
([#1147](https://github.com/dcodish/geo_builder/issues/1147)).

The data panel's equations section lists what the student stated or asked about the curves in their
figure, and every row in it is an equation. So it is headed «משוואות» / «Equations» — not «עקומים», which
is the tool's internal category (`kind: 'curve'`) and a word the exam never uses.

**A heading is a promise about its rows.** Naming the implementation's type there teaches the student a
vocabulary the question paper does not share, and it is the same defect as showing them an internal id.

**R100 — an answer and its working are separate rows, and the working can be folded away**
([#1206](https://github.com/dcodish/geo_builder/issues/1206), [#1207](https://github.com/dcodish/geo_builder/issues/1207)).

A question the student asked shows its answer on one line and, beneath it, how that answer was reached.
The two never share a line: a formula running on past the equation it belongs to reads as a second,
unrelated fragment.

**The working is shown by default and the student may fold it.** It is part of the answer (#1053), so
it is not hidden until they say so — and folding it leaves the question and its equation, which is what
they asked to keep.

**The measure menu offers only questions worth asking.** An option is offered when the ask lane answers
it AND the answer can be something other than zero — so clicking a vertex does not offer the distance to
the sides that vertex is an endpoint of.

**R101 — a figure the student opens is visible**
([#1209](https://github.com/dcodish/geo_builder/issues/1209)).

Pan and zoom belong to the figure they were computed for. Opening a saved figure, or clearing and
starting a new one, shows that figure whole — the previous view is not carried onto something it was
never computed for.

A loaded save that appears empty reads as **data loss**: the student's own file looks like it failed to
open, and nothing on screen contradicts that.
**R102 — a curve row states an EQUATION, and its derived properties fold beneath it**
([#1212](https://github.com/dcodish/geo_builder/issues/1212)).

Under «משוואות», every curve — line, circle, parabola, ellipse — leads with its own equation. The centre
and radius, the semi-axes, the foci, the directrix are true and useful and **secondary**: they sit on a
second row the student can fold away, exactly as R100 folds an answer's working.

**The given is never replaced by something derived from it.** A student who typed
«(x-3)^2+(y-4)^2=9» and is shown only `O(3, 4), r = 3` has had their own statement taken off the screen
and a consequence of it put in its place — which is the honesty invariant read backwards. The derived
properties are the addition; the equation is the given. And «משוואת המעגל» is answered with the
equation, because that is what was asked.

The exception is a curve the givens have not FIXED, which shows its open form rather than an invented
equation — no coefficient is ever sampled and printed as fact (R21, [#1023](https://github.com/dcodish/geo_builder/issues/1023)).

**R103 — a named cevian ACTUALLY REACHES its side, and may reach the side's extension**
([#1232](https://github.com/dcodish/geo_builder/issues/1232)).

«AD תיכון לצלע BC» and «AD גובה לצלע BC» each state TWO things: `D` lies on `BC`, and `AD` has the
role's own property — through the midpoint, or perpendicular. Both must hold in every configuration.
An altitude whose foot floats beside the side is not an altitude, and the number a student measures
off it means nothing.

This is R40's rule applied to the cevian the student NAMED rather than to the decoration: *"a median
that does not actually end at the opposite midpoint would teach something false, which is worse than
teaching nothing."* The same sentence is true of a height, and the student's own named `D` is the case
where it costs the most.

**The foot is on the LINE, not bounded to the segment.** An obtuse triangle's altitude foot falls
beyond an endpoint — that is ordinary geometry, not a broken figure. Bounding the foot to the segment
would refuse a correct construction, which is the same honesty failure pointing the other way.

**R103a — the TRIANGLE may identify the side, and the cevian's target may be written with a maqaf**
([#1165](https://github.com/dcodish/geo_builder/issues/1165), [#1222](https://github.com/dcodish/geo_builder/issues/1222)).

A student who has written «משולש ABC» says «AD תיכון במשולש ABC», not «AD תיכון לצלע BC» — naming the
side is the tool's phrasing, not theirs. Both are the same statement and the tool accepts both, in
both languages, for both roles; so is «AD תיכון ל-BC», where the maqaf is the ordinary Hebrew
connector this product already relies on elsewhere.

The apex is what makes the triangle spelling determinate: it is a vertex of the named triangle, and
the side is the two vertices that are left. So the apex must BE one of them — «XD תיכון במשולש ABC»
leaves three candidate sides, and the tool refuses it by name rather than choosing one (ADR-052: it
never invents what the student did not state). That refusal is its own message, because the two
neighbouring ones would each say something untrue about a sentence whose triangle is perfectly good.

**Still not accepted, and deliberately:** the spellings that name no target at all — «AD גובה»,
«תיכון מ-A לצלע BC» with no letter for the foot. Those need the FIGURE to say what the cevian reaches
or need the tool to mint a name, and this parser reads one sentence with no figure in hand
([#1240](https://github.com/dcodish/geo_builder/issues/1240), and #1222's apex-fronted arm).
