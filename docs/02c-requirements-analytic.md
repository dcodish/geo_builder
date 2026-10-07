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
*(**BUILT** 2026-09-29 by [ADR-AG-170 Am. 1](06c-decisions-analytic.md#adr-ag-170-amendment-1--2026-09-29-pre-play-one-noun-table-one-numeral-the-noun-checked-one-connective-grammar),
for every noun × every family, named and anonymous: «נתונה פרבולה I שמשוואתה x²+y²=16» is refused with
«המשוואה … מתארת מעגל, לא פרבולה» and nothing is drawn. The hyperbola case keeps the generic scope wording.
One pair is ACCEPTED by operator ruling (2026-09-29, Am. 2): a circle under the ellipse noun is the
a = b ellipse — «נתונה אליפסה I שמשוואתה x²+y²=16» records as ellipse I, with coinciding foci.)*

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

The set: `²` `³` `√()` `·` `π` `ℓ` `≤` `≥` `≠` `|x|` `d_{}` `x_{}` `⊥` `∥` `∠` `°` `α` `β` `γ` `δ` `θ` `<` `S_{}` `⌢{}`
([ADR-AG-212](06c-decisions-analytic.md#adr-ag-212), [#1696](https://github.com/dcodish/geo_builder/issues/1696):
the 2-D palette reviewed chip by chip; `√()` wraps a selection as 2-D's does). Each later chip arrived with its
notation: the Greek angle names with the angle alias ([ADR-AG-215](06c-decisions-analytic.md#adr-ag-215)), `<` with
order between measures ([ADR-AG-216](06c-decisions-analytic.md#adr-ag-216)), `S_{}` with the area notation
([ADR-AG-214](06c-decisions-analytic.md#adr-ag-214)), `⌢{}` with arc measures ([ADR-AG-220](06c-decisions-analytic.md#adr-ag-220)).
The 2-D chips still absent — `△` `≅` `~` (#1622) — are absent because their sentences are not read yet, and each
arrives in that work's own change, because a chip is part of shipping a notation rather than a follow-up to it.

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

> **Now the rule** ([ADR-AG-180](06c-decisions-analytic.md#adr-ag-180), #1473 — the live risk fired: an
> area-12 triangle printed `C = (x_C, −4)` beside a canvas drawing y = +4). "Invariant across every
> admissible configuration" is judged over **one configuration pool** — the 24 drawable configurations every
> knowledge gate reads (a coordinate, a parameter, a curve's coefficients, and the option set), never a
> smaller sample sized for "does it vary?". The pool is sampled, not proven; the escalation path is exact
> per-object enumeration, never a smaller pool. **On the page, a value not yet confirmed over the whole pool
> shows «בודק…» — never a provisional number** (operator ruling 2026-09-29, B′): the figure draws at once,
> the check completes after the render, and the row settles to its value, its options or «—».

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
accepted ([ADR-AG-133](06c-decisions-analytic.md#adr-ag-133)). **A line that CREATES a point is no
exception** (operator, 2026-09-21, #1339/#1340: *"yes - it should"*): «M אמצע AB» above «A(0,0)» ·
«B(4,0)» builds with M at (2, 0), and a derived point whose operands no line declares stays refused,
naming the reference ([ADR-AG-156](06c-decisions-analytic.md#adr-ag-156); the cross-product rule is
[ADR-W-089](06w-decisions-workspace.md#adr-w-089)).

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

**R121 — A three-letter ANGLE is askable, with a method hint.** «זווית BMC» (also «∠BMC»,
«גודל הזווית BMC», "angle BMC") answers in the data panel through the SAME atoms the given rules
read (#1331) — sayable ⇒ askable by construction — with the honesty gate every value arm passes.
No worked formula (operator, 2026-09-29, reversing the 2026-09-27 ruling: the tan-difference formula
is outside the curriculum). Under the answer: «ניתן להשתמש בשיפועי הישרים או במשפט הקוסינוסים», with
the law-of-cosines half only when all three vertices are known. An angle the student STATED is answered with no hint at all. *(#1409, #1525; realised —
[ADR-AG-176](06c-decisions-analytic.md#adr-ag-176) Am. 1.)*

**R122 — Radius, focus, directrix and perimeter are sayable and askable in the exam's spellings, and a
stated value outside its quantity's range is refused.** The radius is a given at creation («נתון מעגל O
שרדיוסו 5», «ברדיוס 5», «שאורך רדיוסו 5», «נתון מעגל שמרכזו (2,3) ורדיוסו 5») and afterwards («רדיוס
המעגל (הוא|שווה|=)? 5», «אורך הרדיוס הוא 5», «המעגל ברדיוס 5»); the perimeter is a real given that fixes
one degree of freedom («היקף המשולש ABC הוא 12», «היקף ABC = 12», «ההיקף הוא 12» over the one polygon);
the focus names or places a point («F מוקד הפרבולה», «מוקד הפרבולה הוא F», «מוקד הפרבולה הוא (2,0)» —
which pins a parameterised parabola); the directrix is a checked claim («מדריך הפרבולה הוא x=-2», «ישר
המדריך x=-2»). Every role is askable in the same words, behind any opener («מהו», «מצא את», "what
is") and closer («?»), which every ask accepts. A radius of zero or less is refused naming the
sentence and the bound («חייב להיות גדול מ-0»), never drawn as a vanished circle. A role with no host,
or several, is refused (or answered) naming the host to define or name — never with an unrelated
example. «R=5»/«r=5» are not radius givens (a letter is a point or a parameter). *(#1432; realised —
[ADR-AG-169](06c-decisions-analytic.md#adr-ag-169) Am. 1.)*

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

**Ruled — an altitude's right angle is a KNEE, drawn only when the student STATED it** *(operator ruling,
2026-09-19, #1241; [ADR-AG-237](06c-decisions-analytic.md#adr-ag-237))*: *"when we do a height, I want the
knee to show since this is a direct request from the user. if the angle is calculated as 90 we don't show it
since its derived"*. A right-angle mark is drawn iff the perpendicularity was stated — «AD גובה לצלע BC»,
«הגובה מ-A לצלע BC», «D רגל האנך מ-A ל-BC», «זווית ABC ישרה», «AB ⊥ BC» — and never for a 90° the solve
produced (R168). **Still open:** labels for the remaining constructions (the medians' parts are ruled above;
the others may want nothing at all). See [ADR-AG-014](06c-decisions-analytic.md#adr-ag-014).

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
A curve named by a numeral — line, circle, parabola or ellipse, 1–9 or I–IX — keeps the notation the
student used, and «1» and «I» are ONE name: once «ישר 1» exists, «ישר I» (naming it again or referring
to it) is REFUSED with a note that the two are the same name and a request to keep the notation already
in use — never a second object, never a silent merge (operator ruling 2026-09-29,
[ADR-AG-170 Am. 2](06c-decisions-analytic.md); this supersedes ADR-AG-168's reading of «המעגל 1» as
«המעגל I»).

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

**R105 — a given set that holds only in a degenerate limit is REFUSED, never drawn as a needle**
([ADR-AG-143](06c-decisions-analytic.md#adr-ag-143), [#1334](https://github.com/dcodish/geo_builder/issues/1334) —
the analytic twin of 2-D's [ADR-537](06-decisions.md#adr-537)). «משולש ABC» · «AB = AC» · «∠ABC = 90»
holds only when B and C are one point; a figure that satisfies it within the solver's tolerance is a
needle the tolerance bought, not a triangle, and it is refused naming the statement that completed the
contradiction — at every configuration, never only at the seeds where the needle happens to fall under
the collapse floor. A genuinely thin figure (a stated 1° apex, 89° + 90°) is an exact solution and is
still drawn: thinness is never the test, the existence of an exact solution is.

**R106 — a given that DETERMINES a parameter is honoured** ([ADR-AG-144](06c-decisions-analytic.md#adr-ag-144),
[#1317](https://github.com/dcodish/geo_builder/issues/1317) — *operator, 2026-09-21: "one design pass over the
solver … so a student can build the whole 572 figure"*). «N על הישר l3» on `(k+1)x+2y−12+5k=0` pins `k = 2`;
so does a stated slope, and so does a length between points whose coordinates carry the parameter. The
class is *every given that determines a parameter*, not any one sentence. The parameter's value is then
KNOWLEDGE and prints in the panel (through the same gate as every number); the line's equation prints with
it substituted; the freedom cue counts a pinned parameter as pinned. A pin with two roots is two
configurations, walked by «הציגו תצורה אחרת» and listed as the option set (R-ADR-AG-047); a declared domain
keeps only the roots inside it, silently (D7 kind 1). **An unpinned parameter is never moved by the solve**:
the vertices are solved first with every parameter at its sample, and the parameters join only when the
vertices alone cannot satisfy the givens — a free `a` stays the seed's, so no given the student never
gave is manufactured by the solver reaching for a knob. **A parameter row is a claim** (#1343): a value prints only through the knowledge gate, and a declared symbol nothing in the figure reads is never a value — its row is its domain, marked «(לא בשימוש בשרטוט)».

**R107 — a line may be created through a point with its direction UNKNOWN** ([ADR-AG-144](06c-decisions-analytic.md#adr-ag-144),
[#1319](https://github.com/dcodish/geo_builder/issues/1319)). «דרך N עובר ישר», «דרך M עובר ישר l4», «a line
through N» — the exam's own sentence for a line the rest of the question determines. The line is drawn through
the point at a sampled direction, carries ONE degree of freedom (counted in the cue, moved by «הציגו תצורה
אחרת»), and its equation is withheld until a later given pins the direction. A named one can be crossed,
referred to and measured against exactly as a stated line («A נקודת החיתוך של הישר l4 עם הישר 1»). The
parallel/perpendicular members (R-ADR-AG-057) are unchanged.

**R108 — a derivation stated about a point that ALREADY EXISTS is a condition on it** ([ADR-AG-144](06c-decisions-analytic.md#adr-ag-144),
[#1320](https://github.com/dcodish/geo_builder/issues/1320) — *operator: "can I define points A and point B
and say that point M is [the midpoint]?"*). «M אמצע AB» when `M` is the y-axis crossing does not redefine `M`
and is not a name clash: it is a constraint the figure must meet, and it is what fixes the direction of the
line that put `A` and `B` where they are. Every derived rule behaves the same way (a centroid, a circle's
centre). An exact restatement is absorbed as already known; a false one about placed points is refused as
unsatisfiable, naming the sentence. One name still holds one object. This is the converse of the #1046 ruling
(a coordinate about an existing derived point), and the asymmetry between the two directions is gone.

**R109 — the exam's own line names: a NUMERAL names a line** ([ADR-AG-144](06c-decisions-analytic.md#adr-ag-144),
[#1298](https://github.com/dcodish/geo_builder/issues/1298), [#1318](https://github.com/dcodish/geo_builder/issues/1318)
— *operator ruling, 2026-09-21: a digit MAY name a line or a circle; the student is copying the exam*). «נתון
הישר 1: 2x-y+8=0», «משוואת ישר 1 היא …», «נתון הישר I: …», «line 1: …» declare; «N על הישר 3», «נקודת החיתוך
של הישר 1 עם הישר 2», «שיפוע הישר 3 הוא …» refer. The panel calls the line «ישר 1» / «line 1» (the R63
circle precedent), so the panel and the exam agree. «II» is a numeral, never *"the line through I and I"*
— no phantom point is ever minted from a name — and a two-point name that repeats its letter («הישר AA») is
refused. A bare equation opening with a digit is still an equation. In an operand slot a numeral needs its
noun («הישר 3»); with the line noun dropped, a Roman numeral is still a circle (R-#1072).

**R109 amendment (2026-10-04, [ADR-AG-234](06c-decisions-analytic.md#adr-ag-234),
[#1750](https://github.com/dcodish/geo_builder/issues/1750)).** «1» and «l1» stay different names, and a
reference to one the figure lacks is still refused. When the figure has a name the student's is a NEAR MISS of
— the same name but for an `l`/`ℓ` before a line's digits, a prime, a subscript digit or letter case — the
refusal names the figure's names of that kind and the one meant: «הישר 1 עדיין לא הוגדר. … באיור יש את הישרים l1
ו-l2. התכוונתם ל-l1?». It is offered only when the student's sentence with that name in it would be accepted.

**R110 — the SIGN of a derived quantity is a stated given, honoured as a selector** ([ADR-AG-144](06c-decisions-analytic.md#adr-ag-144),
[#1323](https://github.com/dcodish/geo_builder/issues/1323)). «שיפוע הישר l5 שלילי», «השיפוע של l1 חיובי»,
«שיפוע l1 קטן מ-0», «the slope of l1 is negative» — the exam's *«ושיפועו שלילי»* — pick between the
configurations the other givens leave open (D7 kind 2). A configuration with the wrong sign is never drawn;
with no freedom left, a contradicted sign is refused on the sentence. Never a value keyword in the slope rule:
«the slope of l1 is negative» used to be accepted as a product of eight symbols and built green. The class
is *an inequality about a DERIVED quantity*; a slope is its first member, and a length, an area or a
coordinate join it as members, not as new rules. «m<0» remains a parameter declaration (F11's own bare form,
the corpus's declare-before-use) — and a declared symbol nothing uses is marked as such in the panel, so a
student who meant a slope is told.

**R60 amendment (2026-09-21, [ADR-AG-146](06c-decisions-analytic.md#adr-ag-146),
[#1333](https://github.com/dcodish/geo_builder/issues/1333)).** The right angle's spellings include the
English `=` form — «angle ABC = 90» — and they mean the same thing **in any case**: «Angle», «ANGLE» and
«angle» are one sentence. The rule behind it is general and belongs to every measure sentence: **a length
is named by a WHOLE name, never by a letter pair taken out of the middle of a word.** «ANGLE ABC» is not
three measurements. A non-right angle value remains out of scope in both languages.

**R60 / R115 amendment (2026-09-24, [ADR-AG-155](06c-decisions-analytic.md#adr-ag-155),
[#1407](https://github.com/dcodish/geo_builder/issues/1407)).** The Hebrew angle noun is read in both of its
spellings, plene «זווית» and defective «זוית», wherever an angle is named: a right angle, a size, a ratio,
«חוצי הזוויות», «משולש ישר-זווית» and the question «הזווית בין … לציר ה-x». The shape nouns read the plene
and defective spellings the 2-D tool reads: «מעויין» is «מעוין», and «שוה» is «שווה».

**R115 — an angle can be stated by its SIZE and in RATIO to another angle**
([ADR-AG-153](06c-decisions-analytic.md#adr-ag-153), [#1331](https://github.com/dcodish/geo_builder/issues/1331)).
«∠ABC = 60» (also «זווית ABC היא 60», «60°», «60 מעלות»), «∠ABC = ∠ACB» and «∠ABC = 2∠ACB» are givens in
both languages: the figure honours them at every configuration, and each consumes a degree of freedom.
Three letters name the angle; a lone vertex still names only a right angle (R60).

**R115 amendment (2026-09-25, [ADR-AG-158](06c-decisions-analytic.md#adr-ag-158),
[#1407](https://github.com/dcodish/geo_builder/issues/1407)).** A lone vertex names an angle of ANY size, and on
either side of a ratio: «זווית C = 60», «זוית C=200», «∠C = 60», «angle C is 60», «זווית B = זווית C»,
«∠B = 2∠C». When the figure draws exactly TWO distinct edges at the vertex (shape sides and segments
together, a side drawn twice counting once) it means the angle between them, and the sentence means exactly
what its three-letter form means: «זוית C=200» after «משולש ABC» is refused as a given no triangle can meet,
as «זווית ACB = 200» is. Belonging to several shapes does not make a vertex ambiguous: after «משולש ABC» ·
«מרובע ABCD», «זווית B = 60» is ∠ABC and «זווית D = 60» is ∠ADC (operator ruling, 2026-09-27; 2-D's rule).
When MORE than two edges meet there (C and A in that figure), the tool refuses and names a real three-letter
angle to write instead («זווית ACB»), and that sentence builds; when fewer than two meet there, it refuses
and asks for three letters. Restating the same angle in three letters, in either ray order,
is recognised as already known.

**R115 amendment 2 (2026-10-05, [ADR-AG-243](06c-decisions-analytic.md#adr-ag-243),
[#1445](https://github.com/dcodish/geo_builder/issues/1445); operator ruling 2026-09-27).** More than two edges
at a vertex no longer make a lone vertex ambiguous when the vertex belongs to exactly ONE shape: the letter then
names that shape's interior angle. After «משולש ABC» · «BD חוצה זווית B» (or «BD גובה», «BD תיכון», «D על AC» ·
«הקטע BD»), «זווית B = 2 זווית C», «זווית B = 30», «זווית B ישרה» and «זווית B = זווית C» mean what their
three-letter forms with ∠ABC mean, and the tool says so: «הובן כ-∠ABC». With no shape at the vertex, or two or
more (a sub-triangle «משולש ABD» counts, and so does the #1407 figure's C), the tool still refuses, and now lists
every angle at the vertex in three letters («∠ABC, ∠ABD, ∠CBD»). The same sentence reads the same way in the 2-D
Builder (ADR-590).

**R116 — a line's angle with the positive x-axis is shown and can be asked**
([ADR-AG-154](06c-decisions-analytic.md#adr-ag-154), [#1322](https://github.com/dcodish/geo_builder/issues/1322)).
Beside each slope the panel prints the angle α the line makes with the positive x-axis (m = tan α), in
[0°, 180°) so a negative slope reads obtuse, 90° for a vertical line, and only when the givens fix it.
«הזווית בין הישר l1 לציר ה-x» (and the exam's «…ובין הכיוון החיובי של ציר ה-x») asks the same number.

**R117 — a circle can be stated by the points it passes through, or by its diameter**
([ADR-AG-160](06c-decisions-analytic.md#adr-ag-160), [#1464](https://github.com/dcodish/geo_builder/issues/1464),
[#1324](https://github.com/dcodish/geo_builder/issues/1324)). «מעגל ABD», «המעגל העובר דרך הנקודות A, B ו-D» and
«המעגל החוסם את המשולש ABD» draw the circle through the three points; «BD קוטר במעגל» and «נתון מעגל שקוטרו BD» draw
the circle whose diameter is BD. Neither needs an equation, and neither invents a centre letter the student did
not write — the panel shows the centre by its coordinates and prints the equation whenever the points are fixed
(operator ruling, 2026-09-27: the circle is COMPUTED from its points). The circle follows its points: it adds no
freedom, moves nothing already drawn, and «הציגו תצורה אחרת» carries it along. When the figure already has a circle,
«BD קוטר במעגל» is a statement ABOUT that circle (both ends on it and its centre at their midpoint, or — for a
circle through three points — the right angle at the third); a defining phrase («שקוטרו», «במעגל חדש») always makes
a new one. Three collinear points, a repeated letter, several unnamed circles, or a circle known only by its
equation are each refused by name — never a circle drawn through a guess.

**R118 — a comparison of coordinates chooses the configuration**
([ADR-AG-161](06c-decisions-analytic.md#adr-ag-161), [#1462](https://github.com/dcodish/geo_builder/issues/1462)).
«שיעור ה-x של B גדול משיעור ה-x של D», `x_B > x_D`, `B_x > D_x`, `x_B > 3`, `y_A < 0` and «שיעור ה-x של B חיובי» are
givens like any other: where the rest of the question leaves two drawings, the figure shows the one the comparison
names, at every configuration «הציגו תצורה אחרת» offers — so a student never has to solve the condition by hand to
get the right figure. It consumes no freedom. A comparison no drawing can satisfy is refused, naming the sentence.

**R119 — incidence reads in the exam's orders, over its operands**
([ADR-AG-164](06c-decisions-analytic.md#adr-ag-164), [#1281](https://github.com/dcodish/geo_builder/issues/1281),
[#1495](https://github.com/dcodish/geo_builder/issues/1495); the operand vocabulary unified by
[ADR-AG-168](06c-decisions-analytic.md#adr-ag-168), [#1429](https://github.com/dcodish/geo_builder/issues/1429):
«P על המעגל I» in every spelling, digits and Roman numerals one circle, the crossing sentence with the clitic
as written («ו-l2», «והישר l2»), the distributive «של הישרים l1 ו-l2», the bare «של הישרים» resolved to the
exactly-two, both verb orders («נחתכים בנקודה E», «חותך את … בנקודה E»), the meeting noun as the crossing's head («A מפגש
הישרים 1 ו-2», «A נקודת המפגש של הישר l1 עם הישר l2» — [ADR-AG-230](06c-decisions-analytic.md#adr-ag-230),
[#1609](https://github.com/dcodish/geo_builder/issues/1609); a concurrency role after it stays the role), a contextual «עם המעגל», and an
equation operand meaning THE existing curve that carries it — never a second copy and never an internal id in
a refusal. «…בנקודות A ו-B» awaits the operator's root-assignment ruling, #1512). A point on a line may be said with the LINE first («הישר CD עובר דרך P»,
«ישר 3 עובר דרך הנקודה N», «CD מכיל את P»), with a SIDE as the subject («הצלע BC נמצאת על הישר y=x-4», «האלכסון BD
מונח על הישר y=x», «הבסיס CD נמצא על ישר העובר דרך …»), and with a point given only by its COORDINATES («הנקודה
(-3,7)») — each means exactly what the point-first sentence means. A point given only by coordinates is named by
the tool from a reserved set (P₁, P₂, …) unless the student already named a point there, and the row says the tool
named it. A side on a circle is refused by name. **What a crossing draws is its grammatical subject's** ([ADR-AG-241](06c-decisions-analytic.md#adr-ag-241), [#1751](https://github.com/dcodish/geo_builder/issues/1751)): the verb («AC ו-BD נפגשים בנקודה M», «AC חותך את BD בנקודה M», «האלכסונים נפגשים בנקודה M») draws its lines named by letters or by role, with M; the noun («M מפגש AC ו-BD», «M נקודת החיתוך של AC ו-BD», «M מפגש האלכסונים») draws M alone — 2-D's rule (ADR-592).

**R120 — a circle can be pinned by tangency to a LINE, in every order**
([ADR-AG-165](06c-decisions-analytic.md#adr-ag-165), [#1501](https://github.com/dcodish/geo_builder/issues/1501);
the line member of R70's tangency). «מעגל M משיק לישר l1», «מעגל M משיק לישרים l1 ו-l2», «מעגל M משיק לישר
3x+4y=0» (the sentence supplies the line), «משיק לישר AB» (the line through two named points), the contextual
«המעגל משיק לישר l1», and the line first — «הישר l1 משיק למעגל M», «הישרים l1 ו-l2 משיקים למעגל» — all say the
same thing: the distance from the centre to that line is the radius. Axes and lines mix in one list («משיק לציר
ה-x ולישר l1»). A BOUNDED noun bounds the tangency ([#1503](https://github.com/dcodish/geo_builder/issues/1503)):
«משיק לצלע AB» (or «קטע», «בסיס», side/segment/base) means the touch point lies on the side itself — a circle
touching only the side's extension does not satisfy it — while «משיק לישר AB» keeps the infinite line. Which SIDE
of the line the circle sits on is not asserted, because the student did not say.
Tangency to a line the figure does not hold is refused naming the line; tangency about a circle known only by
its equation, and circle-to-circle tangency, are refused by name — never dropped, never guessed.

**R122 — two circles can be stated tangent, and which touch is a configuration until the student says**
([ADR-AG-167](06c-decisions-analytic.md#adr-ag-167), [#1504](https://github.com/dcodish/geo_builder/issues/1504);
the circle member of R120's family). «מעגל M משיק למעגל K», the contextual «המעגל משיק למעגל K», the flipped
«המעגל I משיק למעגל M», the plural «המעגלים משיקים (זה לזה)», and the mixed list («משיק לציר ה-x ולמעגל K»)
all state one equation: the distance between the centres is the radii's sum (touching outside) or the radii's
absolute difference (touching inside). Which touch is an UNSTATED configuration — «הציגו תצורה אחרת» cycles
between them — until «מבחוץ»/«מבפנים» (externally/internally) pins it. Both circles must carry a centre and a
radius to pull on; tangency about an equation circle or a computed circle is refused by name, an unknown circle
by its name, and a circle is never tangent to itself.
*Amendment 1 (2026-09-29, pre-play).* Every way a student names the two circles reads: «מעגל O ומעגל M משיקים»,
«המעגל O והמעגל M משיקים», «(ה)מעגלים O ו-M משיקים» (also «O וM»), and "circle O and circle M are tangent" /
"circles O and M are tangent". The branch word is one list — מבחוץ / חיצונית / externally, מבפנים / פנימית /
internally — and may stand after the verb, after the target or at the end, with «זה לזה» in either order. «…בנקודה T»
names the touch point, drawn where the circles meet. A word that has no circle-to-circle relation to attach to
(«משיק לציר ה-x מבחוץ») is refused, never dropped. Two circles with the SAME centre are never tangent (operator
ruling): the sentence is refused. A given that could only hold with a circle of radius zero — «מבחוץ» and then
«מבפנים», or a centre ON the axis it is said to be tangent to — is refused on the sentence that completed the
contradiction, never drawn with an invisible circle.

**R114 — the tool never accepts a sentence a textbook would not print; it teaches the one it would**
([ADR-AG-150](06c-decisions-analytic.md#adr-ag-150),
[#1353](https://github.com/dcodish/geo_builder/issues/1353), implementing
[ADR-W-030](06w-decisions-workspace.md#adr-w-030)). «הוסף C מחלקת את AB ביחס 3:2» must not build. The
tool understood it perfectly, and that is exactly why it must not accept it: what a student types comes
back to them in the fact list, in the saved file and in the exported image, so accepting the imperative
teaches the imperative. Instead the tool puts the textbook sentence — «C מחלקת את AB ביחס 3:2» — into
the input box, says why, and the student presses Enter once. Nothing is recorded on their behalf: the
row that appears is a sentence they submitted.

The sentence the tool offers is always one the tool would ACCEPT IF SUBMITTED NOW — not merely one
that parses. Pre-filling a grammatical sentence the figure cannot yet support would tell the student
to press Enter and then refuse them for doing it, which is worse than accepting the imperative. So
where the underlying sentence would not be accepted — «C מחלקת את AB ביחס 3:2» before A and B exist —
nothing is taught, and the student gets the honest refusal naming the real problem. Where it cannot produce a sentence it is silent about it rather than guessing — an
imperative over something the tool does not understand («צייר משהו יפה») is left exactly as it is
today. The verbs are a closed, published list, not a model's judgement: what counts as non-canonical
input is a teaching decision this product owns.

**The exam's own construction imperatives are taught the same way** ([ADR-AG-206](06c-decisions-analytic.md#adr-ag-206),
[#1620](https://github.com/dcodish/geo_builder/issues/1620); operator ruling 2026-10-01). The bagrut builds its
figure with «העבירו», «הורידו», «מעבירים», «בחרו», often after an adverbial and not at the start of the line. Each
is answered with the plain sentence, pre-filled for the student to confirm:

- «העבירו משיק למעגל בנקודה C» → «המשיק למעגל בנקודה C»; «דרך הנקודה D שעל המעגל העבירו משיק למעגל» → «המשיק למעגל בנקודה D» (a tangent at D touches the circle at D, so nothing is dropped).
- «העבירו מיתר AD» → «המיתר AD»; «העבירו את האלכסון AC במרובע ABCD» → «האלכסון AC במרובע ABCD».
- «בחרו נקודה E כרצונכם, הנמצאת על הצלע DC» → «הנקודה E נמצאת על הצלע DC» («כרצונכם» says the point is free, which it already is). When the figure already holds the sentence, it is still taught, and confirming it answers «already known».
- «מן הנקודה B הורידו אנך לציר ה-x» → «האנך מהנקודה B לציר ה-x»; «מן הקודקודים A ו-C העבירו אנכים לציר ה-x, החותכים אותו בנקודות E ו-F בהתאמה» → «האנכים מהקודקודים A ו-C לציר ה-x חותכים אותו בנקודות E ו-F בהתאמה».
- «מן הנקודה E העבירו ישר המקביל לציר ה-y וחותך את הצלע AB בנקודה F» → «הישר העובר דרך הנקודה E מקביל לציר ה-y וחותך את הצלע AB בנקודה F».
- «דרך E מעבירים קטע EF המקביל ל-DA» → «הקטע EF מקביל ל-DA»; «במשולש OBC העבירו גבהים OD ו-BE לצלעות BC ו-OC בהתאמה» → «במשולש OBC, OD ו-BE הם גבהים לצלעות BC ו-OC בהתאמה».

A sentence the tool cannot yet accept is not taught: the line keeps its honest refusal. A sentence that DESCRIBES
a drawn object with the same verb — «הנקודה E נמצאת על האנך שהורידו מנקודה B לציר ה-x» — is not an instruction
and is never taught.

**R113 — a display name reads in the right order, whatever its script**
([ADR-AG-149](06c-decisions-analytic.md#adr-ag-149),
[#1344](https://github.com/dcodish/geo_builder/issues/1344)). The panel's equations row must read
«ישר 3: 3x + 2y − 2 = 0», never «3 :3 ישרx + 2y − 2 = 0». A name that mixes a Hebrew noun with a digit
— «ישר 1», «מעגל 1», the names the tool itself gives (R63, R109) — is an ISLAND in a left-to-right row
and is isolated as one. The panel is the one place a student checks what the tool understood, so a row
they cannot read is a row that fails its purpose. The typed INPUT BOX is a separate surface with its
own answer (the live preview beneath it) and its own open question (R-#1296).

**R112 — one line, one row: a curve stated twice is ONE object, however it is spelled**
([ADR-AG-147](06c-decisions-analytic.md#adr-ag-147),
[#1342](https://github.com/dcodish/geo_builder/issues/1342)). «נתון הישר 1: 2x-y+8=0» then
«נתון הישר 2x-y+8=0» — or the same line in slope form, or under a second name — is the SAME line, and the
tool says «כבר ידוע» instead of drawing it twice. Identity is the EQUATION, never the id the tool happened
to mint. Naming a line that had no name is not a restatement: it records, and the panel calls the line by
the student's name from then on. A line has ONE name, so a second one is refused naming the holder (the
R-#1153 rule, for curves). Two lines that are genuinely different — however close — stay two lines.
**Names are compared as a student READS them** ([ADR-AG-183](06c-decisions-analytic.md#adr-ag-183),
[#1350](https://github.com/dcodish/geo_builder/issues/1350)): «l3» and «ישר 3» are different lines to the
tool, but a student reads both as "line 3". Both are kept — the exam prints both conventions — and the moment
the second is named the tool says they are two different lines (a notice, never a refusal). The reading is
`lN ⇄ N` (with `ℓ` and the Roman numeral); `m3` or `k1` read as their own names.

**R111 — a word the tool does not know is REFUSED in a value slot, never absorbed as parameters**
([ADR-AG-145](06c-decisions-analytic.md#adr-ag-145),
[#1321](https://github.com/dcodish/geo_builder/issues/1321)). «שיפוע הישר l1 הוא tan(30)» must be refused
naming the sentence, not accepted as `t·a·n·30`. The promise is the honesty invariant applied to the
expression layer: **a stated magnitude is never silently reinterpreted.** `√` is the only function the tool
has; every other letter run in a value slot is either the exam's juxtaposed parameters (`2a`, `2ax`, `25k²`
— kept, they are the corpus's own notation) or a word, and a word is a refusal the student can see. The same
promise covers the tool's own vocabulary: a measure noun the tool writes into its catalog («the distance
between A and B») must be CONSUMED by the rule that claims it, because a leftover word is a phantom
parameter and a phantom parameter makes the given satisfiable at any value.

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
force it — is refused at the parser (R-level, #1175), and so is its limit: a crossing of a line WITH ITSELF
(«הישר AB עם הישר BA», [#1255](https://github.com/dcodish/geo_builder/issues/1255),
[ADR-AG-140](06c-decisions-analytic.md#adr-ag-140)) names no point and is refused by an OWNED answer that
says so and shows «P על הישר AB» — never escalated to the model, never built as a silently floating point
(*operator ruling, 2026-09-20: refuse it*); this is the POSITIONAL one, and **its freedom gate is
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
«זווית B ישרה» (also «הזווית B היא 90», «∡B = 90», and «∠ABC = 90» / «∠B ישרה» — the glyph the 2-D
tool teaches reads here too, [#1330](https://github.com/dcodish/geo_builder/issues/1330),
[ADR-AG-142](06c-decisions-analytic.md#adr-ag-142)) settles it, and the figure keeps that seat at
every configuration. A vertex that names no single angle — no shape through it, or several — is
refused with the format that would work, never resolved by guessing which two rays were meant.

**R62 — a diagonal is an object, and a concurrency point has a verb**
([ADR-AG-037](06c-decisions-analytic.md#adr-ag-037)). «אלכסוני המרובע ABCD נפגשים בנקודה O» builds
the same figure as «O מפגש האלכסונים במרובע ABCD», in the construct state the sentence form actually
uses, and with the vertices optional when the figure has one shape to mean — **in both forms**: «M מפגש
האלכסונים», «M מפגש האלכסונים במרובע» and «אלכסוני המרובע נפגשים בנקודה M» all mean the one quadrilateral
drawn, and are refused (never guessed) when the figure has none or several; a shape noun written without
letters is still checked against the construct («מפגש התיכונים במרובע» is refused for arity)
([ADR-AG-182](06c-decisions-analytic.md#adr-ag-182)). «משוואת האלכסון AC היא
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

**R61 — two distinct named points are never opened on top of each other** ([ADR-W-072](06w-decisions-workspace.md#adr-w-072), [ADR-AG-138](06c-decisions-analytic.md#adr-ag-138)). *(Operator, 2026-09-20, T18: "even if they do fall on the same point by chance … the system should not show them on top of each other. It should automatically look for a different config and show them differently"; the same rule in every builder.)* Where a configuration keeps the figure's named points apart, the tool opens on it by itself. A preference below validity, never a requirement: a figure whose every configuration stacks two labels is still drawn — refusing such a statement is R43/#1254's job — and the tolerance is the figure's own span, never an absolute number. **"On top of each other" is what the student SEES** ([#1526](https://github.com/dcodish/geo_builder/issues/1526), [ADR-AG-181](06c-decisions-analytic.md#adr-ag-181)): two points closer than a hundredth of the drawn frame count as stacked, not only two at the identical position — so a point riding a line, circle or curve that passes through an existing point («Y נמצאת על הישר y=x» beside V(0,0)) is never opened on it unless the givens force it there.

**R61 — a circle marks its centre** ([ADR-AG-036](06c-decisions-analytic.md#adr-ag-036)). Every drawn
circle shows its centre, because in analytic geometry the centre is always part of the figure. The
mark appears whenever the circle does; the VALUE beside it appears only when the givens fix it, so a
circle whose centre rides a parameter is marked and left unlabelled rather than labelled with one
sample's coordinates. The centre owns no letter — it is part of the circle, not a point the student
named. *(Amended by R123: a CANONICAL circle's centre is the point `O`.)*
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
**The givens list offers the suite's three row operations** ([ADR-AG-177](06c-decisions-analytic.md#adr-ag-177),
docs/28 D6): a checkbox MUTES a given — the row stays, the figure is drawn as if it had never been said —
alongside ✎ edit in place and ✕ delete. Un-muting a given that the figure has since contradicted is refused,
naming that given, and the row stays muted. A muted given is saved, shared and restored muted, and undo
takes a mute back.


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
**Amended by [ADR-AG-157](06c-decisions-analytic.md#adr-ag-157) (#1268): the ordinal CHOOSES.** «הראשונה» and
«השנייה» each name one root on their own, with no second named point needed, in one stated order: the
straight is walked from the first letter it is named by toward the second («הישר AB» and «הישר BA» number
the other way round), or left to right — bottom to top when vertical — when it has no points of its own
(an equation, an axis, a named line). The order is the whole line's, so the crossing on a triangle side
keeps its line's number, and naming the one beyond the side is refused on that sentence. A clicked ring
commits the word for the root under it, and a ring is never re-numbered once its sibling is taken.
«הציגו תצורה אחרת» never swaps a crossing the sentence named; a sentence without an ordinal still leaves
the choice open, and both roots stay listed and reachable for it (R72).
**Amended by [ADR-AG-185](06c-decisions-analytic.md#adr-ag-185) (#1512): both crossings in ONE sentence.**
«הישר l1 חותך את המעגל I בנקודות A ו-B» and «A ו-B נקודות החיתוך של הישר l1 עם המעגל I» (and the plural
verb «…נחתכים בנקודות A ו-B», and English) name both crossings at once: the FIRST letter is the first root
of the order above and the second letter the second — the operator's ruling, exactly what the two ordinal
sentences would say. The assignment is fixed: «הציגו תצורה אחרת» never swaps it, and a student who wants
the other assignment swaps the letters in the sentence (the points stay; the letters move). The sentence
states TWO points, so a pair that does not meet in two points is refused on that sentence — a line that
misses the conic or touches it, and two straight lines (which meet once).
**Amended by [ADR-AG-236](06c-decisions-analytic.md#adr-ag-236) (#1416): two conics have the order too.** A
pair of conics — two circles, a circle and an ellipse or a parabola — is numbered in the READING direction
of the plane: left to right, and bottom to top where two crossings stand one above the other (the order a
straight with no points of its own already takes). So «P נקודת החיתוך הראשונה של המעגל I עם המעגל II» and
«…השנייה…» name two different points, and «המעגל I חותך את המעגל II בנקודות A ו-B» names both. Naming a
crossing that already has a letter is refused naming that letter AND the two things that cross, as the
grammar says them («נקודת החיתוך של המעגל I עם המעגל II היא P…») — never calling two circles «ישרים».

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
(R18, P4). Then the ask lane is asked — «המקום הגיאומטרי של P», or in the exam's own words
«משוואת המקום הגיאומטרי של P», or with the opener a student writes («מצא את», «מהו», «find», «what
is»; [#1301](https://github.com/dcodish/geo_builder/issues/1301),
[ADR-AG-141](06c-decisions-analytic.md#adr-ag-141)) — every spelling one question with one answer, and
never a question repeated back as the name of a curve the student forgot to draw — and the answer is a
row plus a drawing, under R86's lifetimes: clicking the entry again clears the drawing and keeps the row, ✕
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

**The locus is the whole solution set, components and all**
([ADR-AG-166](06c-decisions-analytic.md#adr-ag-166),
[#1500](https://github.com/dcodish/geo_builder/issues/1500); operator: *"there should be 2 lines for
this loci and both should appear since they are the answer together and not just one of them"*). A
set with several connected components — the two lines through a point tangent to a circle, the two
parallels at distance d — is drawn whole (every component its own curve, each labelled with its own
part of the answer), named in the plural («שני ישרים»), and equated with **every** component's
equation, one per line ([#1508](https://github.com/dcodish/geo_builder/issues/1508)) — the same row
at every configuration, never the component the seed happened to land on. The gates above apply to the UNION: the equations print only
when the whole set came back the same, and a parameterised union still answers kinds alone. One
component's equation printed as *the* locus is a confident claim about a strict subset — the one
thing this product may not do.

**The locus is drawn only where the givens allow it**
([ADR-AG-245](06c-decisions-analytic.md#adr-ag-245),
[#1817](https://github.com/dcodish/geo_builder/issues/1817)). A stated region — a coordinate range
(«x_B > 1» · «x_B < 3»), a sign («שיעור ה-y של B חיובי»), a quadrant, a side («D על הצלע AB»), an order
between measures («MA > 5») — holds on every position the trace paints, exactly as it holds on the one
configuration the canvas shows: the trace is the allowed pieces of the curve, each ending where the
region ends, and a component the region excludes entirely is neither drawn nor named. The row still
names the carrier curve and prints its equation (the exam asks for the equation of the curve the
points lie on); it never prints an extent read off the drawing.

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
mark that R31 already draws. **Any numeral the circle was named by works** — «O מרכז מעגל 1», «O מרכז המעגל II»,
"O is the centre of circle 2" — in the notation the circle was declared in (the other notation gets the
notation note, R51's ruling) ([#1529](https://github.com/dcodish/geo_builder/issues/1529), ADR-AG-179).
Every ring offered on a numeral-named line, circle, parabola or ellipse — centre or crossing — is a
sentence that records.

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

**The folded properties are one LINE per fact, and a bare coordinate says what it is**
([ADR-AG-232](06c-decisions-analytic.md#adr-ag-232), [#1597](https://github.com/dcodish/geo_builder/issues/1597);
operator ruling 2026-09-30). A circle shows «מרכז המעגל: (3, 4)» and «r = 5» on two lines — «מרכז המעגל: O(0, 0)»
when a point sits at the centre. A parabola shows «מוקד: (27/2, 0)» and «מדריך: x = -27/2». An ellipse shows
«a = 5, b = 3» and «מוקדים: (4, 0), (-4, 0)». A line's single line («y = 2x + 1, m = 2») names itself and is
unchanged.

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

~~**Still not accepted, and deliberately:** the spellings that name no target at all — «AD גובה»,
«תיכון מ-A לצלע BC» with no letter for the foot.~~ Accepted since R103b.

**R103b — the angle bisector is the third cevian, and a cevian may leave its target or its foot to the figure**
([ADR-AG-209](06c-decisions-analytic.md#adr-ag-209), [#1284](https://github.com/dcodish/geo_builder/issues/1284),
[#1222](https://github.com/dcodish/geo_builder/issues/1222), [#1240](https://github.com/dcodish/geo_builder/issues/1240);
operator rulings: the 2-D tool's verdict is the reference, 2026-10-02; the tool may name what the student did not, in a
reserved name, and says so — #1263, 2026-09-20; "the user can always change it" — #1222, 2026-09-19).

- **The angle bisector** reads in every shape the median and altitude read: «CE חוצה זווית C במשולש ABC», «CE חוצה-זווית
  לצלע AB», «CE הוא חוצה זווית C במשולש ABC»; and by its ANGLE alone: «AD חוצה את הזווית BAC», «AD חוצה זווית A»,
  «האלכסון DB חוצה את הזווית ADC», «AM הוא חוצה זווית CMD» (the vertex may be either end of the segment), "AD bisects
  angle BAC". The two angles at the vertex are equal on the drawn figure.
- When the segment's other end is a NEW point, it is the bisector's foot on the opposite side (inside it). When it is a
  point the figure already has, that point lies on the bisector — on the bisector's own ray, never the opposite one.
- «E חיתוך חוצי הזוויות BAC ו-BCA» (and «E נקודת החיתוך של חוצי הזוויות A ו-C», «חוצי הזוויות … נחתכים בנקודה E»)
  puts E on both bisectors; «חוצה זווית ABC» on its own draws the bisector as a line.
- **A cevian whose target the figure determines:** «AD גובה», «AD תיכון» (the side opposite A in the one triangle that
  has A), «גובה לצלע BC» / «תיכון לצלע BC» (the apex is the third vertex). An apex in several triangles ASKS which
  (name the side or the triangle); in none, the sentence is refused.
- **A cevian whose foot has no letter:** «תיכון מ-A במשולש ABC», «גובה מ-A במשולש ABC», «גובה מנקודה A», «תיכון מ-A
  לצלע BC», "the altitude from A". The tool names the foot with 2-D's letter (R103c) — M for a median's foot, H for an
  altitude's — and the fact row says «הכלי קרא לנקודה M». The student can rename it like any letter; the sentence is
  then rewritten to name it («תיכון מ-A במשולש ABC פוגש את הצלע בנקודה K»).
- A sentence that names its triangle («… במשולש ABC») draws the triangle when the figure does not have it yet, as in
  2-D.
- «גובה המשולש לצלע AB הוא CD», «הגובה AD לצלע BC» read as «CD גובה לצלע AB» / «AD גובה לצלע BC».
- **Plural, paired by «בהתאמה»:** «OD ו-BE הם גבהים לצלעות BC ו-OC בהתאמה», «BE ו-CF הם גבהים במשולש ABC», «EB ו-EC הם
  חוצי הזווית ABC ו-BCD בהתאמה הנפגשים בנקודה E», and the English "OD and BE are the altitudes to sides BC and OC
  respectively" — each segment is its own cevian; a shared end of two bisectors is where they meet.
- **Refused, each by name:** a bisector whose segment does not start at the angle's vertex («XD חוצה זווית BAC», «AD
  חוצה זווית C», «CE חוצה זווית A במשולש ABC»); a bisector ending on one of its own rays («AB חוצה זווית BAC»); a
  bisector of an angle whose points the figure lacks; a bisector that contradicts a stated angle (the later statement
  is refused as unsatisfiable, named).
- ~~**Not yet:** «תיכון ליתר».~~ Accepted since R103c.

**R103c — the tool's letters are 2-D's, and «תיכון ליתר» never assumes the right angle**
([ADR-AG-211](06c-decisions-analytic.md#adr-ag-211), [#1620](https://github.com/dcodish/geo_builder/issues/1620),
[#1222](https://github.com/dcodish/geo_builder/issues/1222); operator rulings 2026-10-02 on #1620).

- A point a sentence introduces without a letter takes 2-D's letter: **M** for a midpoint (a median's foot, a
  perpendicular bisector's midpoint, a midsegment's first end — its second end N), **H** for a foot (an altitude's, a
  perpendicular's; 2-D writes F, which is the focus letter in this tool). When the letter is taken, the next free one:
  M, N, P, Q …; H, G, P …. F is never chosen. Two medians are M and N; two altitudes H and G.
- The row says «הכלי קרא לנקודה M». A later sentence that uses the letter refers to that point; a later sentence that
  names the same point a second time is refused and names the letter («already-named»), and the student renames it.
  The letter never changes when lines are added.
- The same point reached two ways is one point: «D אמצע BC» then «תיכון מ-A במשולש ABC» runs the median to D.
- Adding such a cevian never moves the triangle: the tool's foot is computed from it.
- Any tool letter can be renamed; the sentence is rewritten to name it («… פוגש את הצלע בנקודה K», «אנך אמצעי ל-AB
  חותך אותו בנקודה K»).
- A point given only by its coordinates keeps its own reserved name (P₁, #1281) — it is not a construct.
- «תיכון ליתר» / «גובה ליתר» / "the median to the hypotenuse": when the figure states the right angle («זווית C ישרה»),
  the cevian runs from it to the side facing it. When it does not — «משולש ישר-זווית ABC» alone — the tool ASKS which
  side is the hypotenuse; it never assumes C (2-D does: #1689). With no right triangle at all it asks too.
  «תיכון ליתר AB» names the hypotenuse, and so states that the right angle faces AB.

**R123 — a canonical circle's centre is the point O, unless a letter is already there**
([ADR-AG-184](06c-decisions-analytic.md#adr-ag-184), [#1270](https://github.com/dcodish/geo_builder/issues/1270)).
*(Operator, 2026-09-20: "for canonical circles only, the center is O automatically unless user mentioed a letter. user can change this later anyway".)*

A circle stated by an equation centred on the origin — «x²+y²=16», «נתון מעגל 1 שמשוואתו x²+y²=25»,
«x²+y²=r²» — gets its centre as a REAL point `O`: drawn, in the points list, and usable by name in a
later sentence («הקטע OA», «משולש AOB»). The circle's row reads `O(0, 0), r = 4` and says the tool chose
the name («הכלי קרא לנקודה O»). It is a default, and it yields: a point the student stated at the origin
names the centre instead (`A(0,0)` → `A(0, 0), r = 4`, in either order); a centre the student named keeps
their letter; a point `O` the student defined elsewhere (`O(5,5)`) keeps the letter and the centre shows
its coordinates alone — never a second `O` and never an invented `O₁`. A translated circle, a parabola's
focus and an ellipse's foci are unchanged: coordinates alone.

**R128 — a point's letter can be changed, and everything that names it follows**
([ADR-AG-191](06c-decisions-analytic.md#adr-ag-191), [#1154](https://github.com/dcodish/geo_builder/issues/1154)).
*(Operator, 2026-09-16: "we want to allow changing a node letter by clicking on it like the 2d tools mechanism"; 2026-09-21: "if a letter is changed, change all inputs and data panel items accordingly".)*

The student types «שנה שם A ל-G» (also «שנה את האות A ל-G», «החלף A ב-G», "rename A to G"), or clicks the
point on the canvas and picks «שנה אות», which puts «שנה שם A ל-» in the input box for them to finish. Every
given that names A now reads G — inside runs too («משולש GBC», «M אמצע GB», «משוואת הישר GC …») — while an
equation's x, y and parameters and every Hebrew word stay as written; every question in the data panel
follows the letter and answers what it answered before. The list keeps its rows (no row is added), the
points the student placed do not move, and one «בטל» undoes the whole rename. A letter already in use is
refused and the message quotes the line that holds it; a letter that is not a point name («AB», «5»), a
point the figure does not have, and the same letter are each refused by name. A letter the tool chose (the
canonical centre O, a name given to a point stated only by coordinates) is not renamed and says so.

**R124 — a given typed in the exam's own frame is understood as the given; a proof target is refused, with a reason**
([ADR-AG-187](06c-decisions-analytic.md#adr-ag-187), [#1618](https://github.com/dcodish/geo_builder/issues/1618)).
*(Operator, 2026-10-01, #1616: the 4-point questions "involve more geometry … starting as pure geometry and then moves into analytical"; proof targets: "refuse and explain that this is not a proof engine".)*

A student copies the 4-point question as printed, and each line is understood as the bare given it states:
- a given-prefix («נתון:», «נתון כי», «ידוע כי», «עוד נתון:»), a continuing «ו…», a figure reference («(ראה ציור)», «כמתואר בסרטוט שלפניכם»), and length units
- the Israeli coordinate pair «A(2;10)», «10½», and the exam's angle glyph «∢»
- the shape as a context («במלבן ABCD, …»), with its givens in parentheses («טרפז ישר זווית ABCD (AB ∥ CD, AB ⊥ AD)»), or as a predicate («המרובע ABCO הוא טרפז ישר זווית», «ABC משולש»)
- the origin in every spelling («O ראשית הצירים», «הנקודה O היא ראשית הצירים»), which is the point O(0,0)
- plural subjects and «בהתאמה» («הנקודות A ו-B נמצאות על ציר ה-x ועל ציר ה-y בהתאמה»)
- two givens on one line («AB = 20, AC = 15»)

The same holds in English for the forms the catalogue shows.

A line is accepted whole or not at all; the row recorded is the line as typed. A side named by its ROLE («השוק BC», «היתר AC») stays a claim about that role and is not reduced to «הצלע».

What the student is asked to **prove** («הוכיחו כי …», «הראו כי …», "prove that …") is never drawn. The tool answers that it is a claim to prove, not a given, that the tool draws the givens and does not check proofs, and asks for only what the question gives. Since #1666 the rule is shared with 2-D and 3-D ([FR-SU-15](02w-requirements-workspace.md), [ADR-W-107](06w-decisions-workspace.md#adr-w-107)): it also catches «יש להוכיח …», an item marker and a claim after a given on the same line, where the message quotes the claim.

A right trapezoid («טרפז ישר זווית») does not decide which leg is perpendicular. A stated right angle decides it, and until one is stated it is a configuration «הציגו תצורה אחרת» cycles.

*R124, amended 2026-10-01:* the subject noun may drop the copula («משולש ABC ישר זווית»); the origin may be used as an unnamed point («… דרך ראשית הצירים»), and it is called O unless that letter is already taken. What the tool TEACHES (its command list and examples) is one fact per line, even where it accepts the exam's bracketed or comma-joined forms.

**R125 — "already follows" is said only about a given that is true in EVERY configuration of the figure**
([ADR-AG-188](06c-decisions-analytic.md#adr-ag-188), [#1629](https://github.com/dcodish/geo_builder/issues/1629)). *(Narrows R54.)*
*(Operator, 2026-10-01, on «נתון: שיפוע הצלע BC הוא -1/2»: "T4 — fails on last statement". The tool answered «זה כבר נובע» and kept drawing the square whose slope is +1/2.)*

When the givens admit more than one drawing (mirror images, two roots) even with no freedom left, a given that holds in one drawing and fails in another **chooses** between them. It is not redundant. It is recorded like any other given, its row appears, and the figure moves to a drawing that satisfies it. «הציגו תצורה אחרת» then stays within the drawings it allows. On the square from exam 15 Q5, «שיפוע הצלע BC הוא -1/2» records and draws B(2,4), C(10,0), while «…הוא 1/2» records and draws the mirror B(−2,4), C(−10,0). «זה כבר נובע מהנתונים שכתבתם» is kept for a given that is true in every drawing, such as «אורך הצלע AB הוא √80» on the same square. When the tool cannot tell, it records the line: an extra row costs nothing, but a dropped given contradicts the figure.

**R127 — the whole figure is always on the canvas**
([ADR-AG-190](06c-decisions-analytic.md#adr-ag-190), [#1624](https://github.com/dcodish/geo_builder/issues/1624)).
*(Operator, 2026-10-01: "we should have a rule that the full shape is always in the canvas. we can play with the ratio of axis but the image needs to be in window".)*

After any change — a new line, an edit, an undo, «הציגו תצורה אחרת» — every drawn point and every drawn
segment of the figure is inside the canvas, with the usual margin. The frame does not move for a change
that already fits, so pressing through configurations still flips transparencies on one projector (R25a);
when a configuration does not fit, the frame widens just enough to show it — the window the student was
looking at stays inside the new one, so a press never shrinks the frame, never jumps sideways and never
re-fits from nothing. A figure that has largely left a panned or zoomed view after a new line is
re-centred (R101's rule, #1225). Both axes keep one scale: a square still looks square. *(Supersedes, for a
press, R25a's "re-fits only when the new configuration has largely left it". Unequal axis scales are an
open question to the operator and not part of this requirement.)*

**R126 — a trapezoid keeps exactly one pair of parallel sides, or the page says it no longer does**
([ADR-AG-189](06c-decisions-analytic.md#adr-ag-189), [#1627](https://github.com/dcodish/geo_builder/issues/1627); the 2-D ruling [ADR-157](06-decisions.md#adr-157), ported).
*(Operator, 2026-10-01: "when i wrote c=90 it accepted but then i got a rectangle.")*

«טרפז», «טרפז שווה שוקיים» and «טרפז ישר זווית» promise exactly one pair of parallel sides, so the tool
never draws one as a parallelogram or a rectangle while a true trapezoid fits the givens. That covers the
configuration it opens on and every one «הציגו תצורה אחרת» offers. When the givens FORCE a parallelogram,
whether the student's coordinates fix it («טרפז ABCD» · `A(0,0)` · `B(4,0)` · `C(4,3)` · `D(0,3)`) or a
stated given leaves only rectangles on a figure that can still move («טרפז ישר זווית ABCO» · «∠C = 90» ·
«∠O = 90», or «BC = AO»), every line is recorded and the figure is drawn, and an amber warning above the
given list names the trapezoid and the line that forced it: «הטרפז ABCO כבר אינו טרפז: עם "∠O = 90" שני
זוגות הצלעות הנגדיות שלו מקבילים…». The warning describes the drawing on screen: it stays while the drawing
is a parallelogram and disappears when the forcing line is edited, deleted or unticked («כלול בציור»), and a
drawing that is a real trapezoid never shows it (ADR-AG-189 Amendment 1, operator ruling 2026-10-01, the
2-D [ADR-165](06-decisions.md#adr-165)). A narrow trapezoid whose legs are nearly parallel stays drawable.

---

**R129 — two letters can be swapped; a taken letter offers the swap; the tool's own letters can be changed; a changed letter does not move the drawing**
([ADR-AG-192](06c-decisions-analytic.md#adr-ag-192), [#1631](https://github.com/dcodish/geo_builder/issues/1631), [#1303](https://github.com/dcodish/geo_builder/issues/1303)).
*(Operator, 2026-10-01: "if a letter is occupied, it offers to switch letters … we want that same mechanism now for analytics"; 2026-09-21: "if a letter is changed, change all inputs and data panel items accordingly".)*

The student types «החלף בין A ל-B» (also «החליפו בין A ל-B», «החלף בין A לבין B», "swap A and B"), or — on
the point's letter popover — types a letter that is already in use, sees the line that holds it quoted and
that row highlighted, and accepts «החליפו בין A ל-B». Every given, every data-panel question and every AI
display sentence exchanges the two letters at once; an equation's x, y and parameters are never touched; each
question answers what it answered before; nothing is deleted and no row is added; both orders do the same
thing; one «בטל» undoes the whole swap. «החלף A ב-G» stays a rename. A letter the figure does not have, the
same letter twice, and a name that is not a point name are each refused by name.

A letter the tool chose — the canonical circle's centre O, a name given to a point stated only by its
coordinates (P₁, or O for the origin) — can be renamed or swapped like any other: the new letter is written
into the student's own sentence that made the point («נתון מעגל G שמשוואתו …», «נתונה הנקודה G(-3,7)»),
and the figure is the same figure. Only where that sentence has no form that names the point (an equation
with no noun, a coordinate inside a longer sentence) is the change refused, and it says so.

Changing or swapping a letter never moves the drawing: a vertex the student left free is drawn where it
was, with its new letter, and a swap exchanges the labels in place. Saved figures, links and restored
sessions keep this.

*Amends R128's last sentence* ("A letter the tool chose … is not renamed and says so"): now renamed through
the student's sentence, as above.

**R130 — the exam's sentences about the circle the figure has are understood**
([ADR-AG-193](06c-decisions-analytic.md#adr-ag-193), [#1619](https://github.com/dcodish/geo_builder/issues/1619) B1, [#1598](https://github.com/dcodish/geo_builder/issues/1598)).
*(Operator, 2026-09-30, on «x^2+y^2=16» beside «O(5,5)»: "the center of the circle in this case has no dot that I can press and create the center"; 2026-10-01: "now we need to work on phase B".)*

A student types the 4-point exam's own sentences about its circle, and each draws what it says:
- **a point on it** — «A על מעגל M» (the circle named by its centre letter), «המעגל עובר דרך A», «המעגל עובר דרך ראשית הצירים O»;
- **its crossings at named points** — «המעגל חותך את ציר ה-x בנקודה A», «… בנקודות B ו-C», «… את החלק החיובי של ציר ה-x בנקודה A», «B היא אחת מנקודות החיתוך של המעגל עם ציר ה-y». Two named crossings are always two different points, and a circle that only touches the axis is refused for them. Which letter is which is a drawing «הציגו תצורה אחרת» changes, because the sentence does not say;
- **its centre named and placed** — «O – מרכז המעגל», «מרכז המעגל M נמצא על ציר ה-y», «… נמצא בנקודה (4,8)», «נתון מעגל שמרכזו M נמצא על החלק החיובי של ציר ה-y». A sentence about «המעגל» when the figure has no circle introduces that circle;
- **its radius and centre by role** — «אורך הקטע AB שווה לרדיוס המעגל», «CD עובר דרך מרכז המעגל». An unnamed centre used as a point is refused, asking for its letter first;
- **its regions** — «הנקודה B נמצאת מחוץ למעגל» / «בתוך המעגל», «E נמצאת על הקשת הקטנה AC» (or «הגדולה»). A region never removes a degree of freedom; a figure with no freedom that contradicts it is refused on that line;
- **its own frame** — «משוואת המעגל הנתון היא …», «בסרטוט שלפניכם מתואר מעגל, העובר דרך הנקודות O, C, A», «המעגל משיק לציר ה-x וחותך את ציר ה-y בנקודה C», «הנקודה B נמצאת מחוץ למעגל, על החלק החיובי של ציר ה-x».

**The centre of any circle can be named** (#1598): «P מרכז המעגל», «P מרכז המעגל x^2+y^2=16», «P מרכז המעגל שמשוואתו …», and by clicking the centre of a circle that has only its equation — the click writes that sentence. On a canonical circle the student's letter replaces the tool's O. With several circles and no equation the sentence is refused, naming the circles; a centre that already has a letter keeps it, and a second letter is refused naming the first.

**R131 — a polygon inscribed in a circle, a circle inscribed in a polygon, the points where its sides touch, and «חד זוויות»**
([ADR-AG-194](06c-decisions-analytic.md#adr-ag-194), [#1619](https://github.com/dcodish/geo_builder/issues/1619) B2, [#1554](https://github.com/dcodish/geo_builder/issues/1554)).
*(Operator, 2026-09-29: "we should support all quads as part of 1554 that can be חסום and חוסם"; 2026-10-01: "now we need to work on phase B".)*

The student types the exam's opener as printed: «מרובע ABCD חסום במעגל», «המרובע ABCD חסום במעגל שמרכזו M», «מרובע
ABCD חסום במעגל שמשוואתו (x−2)² + (y+2)² = 100», «משולש ABC חסום במעגל שקוטרו AC», «במעגל שמרכזו M חסום משולש חד
זוויות ABC», «המעגל החוסם את המרובע ABCD», «מרובע ABCD בר חסימה», and the English equivalents. Every shape noun
can be inscribed — triangle and every quadrilateral noun — and the shape is drawn whether or not it was drawn
before. The circle is the one the sentence describes: on the named centre, by the given equation, on the given
diameter, or (with no description) the circle through the vertices; afterwards it is «המעגל» like any other
circle. Every vertex lies on it in every configuration, and «הציגו תצורה אחרת» still moves the figure. A noun
that cannot be inscribed as itself is drawn as the shape it must be (a cyclic parallelogram is a rectangle, a
cyclic trapezoid isosceles, a cyclic rhombus a square, a cyclic kite right-angled at its side vertices).

The converse — «מעגל חסום במשולש ABC», «במשולש AOB חסום מעגל שמרכזו C», «משולש ABC חוסם מעגל», «מעגל חסום במרובע
ABCD» — draws the circle inside the shape, touching every side; a named centre on a triangle's incircle is the
point where the angle bisectors meet. A quadrilateral circumscribes a circle only when AB + CD = BC + DA, and
the sentence states that as a given (a parallelogram becomes a rhombus, a rectangle a square). «הצלעות AO, BO
ו-AB משיקות למעגל בנקודות D, E ו-F בהתאמה» names the touch points: each lies on its side and on the circle; on a
circle given by its centre the sides become tangent to it. «חד זוויות» is honoured: the triangle drawn is acute
in every configuration, and coordinates that make it not acute are refused on the sentence that said it.

The diameter forms land: «AD הוא קוטר במעגל», «הצלע AC היא קוטר במעגל», «הקטע AB הוא קוטר במעגל שמרכזו M», «קוטר
המעגל AC נמצא על הישר 3y − 2x − 4 = 0» — including a diameter between vertices the circle passes through by
incidence. A sentence followed by its givens in parentheses is read as both.

Refused by name, never dropped: a radius or an equation on an incircle; a touch on a circle that cannot be made
tangent (one given by its equation). «טרפז ישר זווית ABCD חסום במעגל» is refused (R135, operator ruling
2026-10-01).

**R131 amendment — a quadrilateral's incircle on a named centre, the side list, and the sentence with no letters**
([ADR-AG-242](06c-decisions-analytic.md#adr-ag-242), [#1554](https://github.com/dcodish/geo_builder/issues/1554); the
2-D sibling builds each, ADR-W-108).
- «במרובע ABCD חסום מעגל O», «מעגל M חסום במרובע ABCD», «מעגל חסום במרובע ABCD שמרכזו O», "circle O is inscribed in
  quadrilateral ABCD" (and every quadrilateral noun): the named letter is the centre of the inscribed circle, which
  touches all four sides in every configuration. «O מרכז המעגל» after «מעגל חסום במרובע ABCD» names the same point.
  «במשולש ABC חסום מעגל O» names the triangle's incentre the same way.
- «מעגל M משיק לצלעות AB, BC, CD ו-DA» (also with commas only, and "circle M is tangent to the sides AB, BC, CD and
  DA") is the same statement as «מעגל M חסום במרובע ABCD» and draws the same figure. When the figure already has a
  circle M, the sentence is about that circle: it becomes tangent to all four sides, and no second circle appears.
  A list of only some of the sides («מעגל M משיק לצלעות AB ו-BC») draws a circle on M touching those sides.
- «מרובע חסום במעגל», «טרפז חסום במעגל», «משולש חסום במעגל», «מעגל חסום במרובע», "a quadrilateral is inscribed in a
  circle" — the sentence with no letters — is read as the lettered sentence: the tool names the vertices with the
  next free letters (ABCD on an empty canvas), as the 2-D tool does. «טרפז ישר זווית חסום במעגל» is refused like the
  lettered sentence. «המרובע חסום במעגל» (the definite noun) refers to a shape the figure has and is not this sentence.
- Not yet: the same circle typed as four separate lines («מעגל M משיק לצלע AB» …) touches all four sides, but it
  is a different drawing from the sentence's, not the same one.

**R132 — a tangent at a named point, the tangent as an object, tangency to any circle, and chords**
([ADR-AG-195](06c-decisions-analytic.md#adr-ag-195), [#1619](https://github.com/dcodish/geo_builder/issues/1619) B3, [#1430](https://github.com/dcodish/geo_builder/issues/1430)).
*(Operator, 2026-10-01: "now we need to work on phase B"; #1616 ruling 4: "Chord: yes.")*

The student types the exam's own tangency sentence with its touch point and the figure honours it:
- «המעגל משיק לציר ה-x בנקודה A», «מעגל שמרכזו M משיק לציר ה-x בנקודה E», «ציר ה-y משיק למעגל בנקודה A», «הישר BC משיק למעגל בנקודה B», «הקטע CD משיק למעגל בנקודה A», «AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה». The touch point is on the circle and on the line, and the line is perpendicular to the radius there, at every configuration. For «הקטע» the touch is between the segment's ends.
- «המשיק למעגל בנקודה A» draws the tangent at A. «המשיק» then refers to it: «המשיק חותך את ציר ה-x בנקודה B ואת ציר ה-y בנקודה A». «משוואת המשיק (בנקודה A) היא …» gives its equation. An equation that is not the tangent there is refused on its own line, and the line is drawn once.
- A line may be tangent to a circle given by its equation: «הישר y=kx+10 משיק למעגל x²+y²=25» finds the values of k, cycled by «הציגו תצורה אחרת». «דרך P עובר משיק למעגל» draws a tangent from P, and the other tangent is the other configuration.
- A chord is accepted: «AB מיתר במעגל», «הצלע AB נמצאת על המעגל», «במעגל המיתרים AC ו-BD נפגשים בנקודה E», «במעגל שמרכזו M המיתרים AB ו-BC שווים».

Refused by name, never drawn: a tangent from a point inside the circle, a touch point that would coincide with the line's other end, and a bare «המשיק» when the figure has no tangent or several. The imperatives «העבירו משיק / מיתר» are taught as these sentences (R114).

**R132 amendment — tangents FROM a point, in every spelling 2-D reads**
([ADR-AG-233](06c-decisions-analytic.md#adr-ag-233), [#1430](https://github.com/dcodish/geo_builder/issues/1430)).
«מנקודה P יוצאים שני משיקים למעגל», «מהנקודה P יוצא משיק למעגל O», «מנקודה P משיקים למעגל», «… הנוגעים בו בנקודות A ו-B»,
"from point P two tangents are drawn to the circle" draw the tangent(s) from P. Touch points the sentence does not name are
named by the tool, T then S (as 2-D names them). The exam's «מהנקודה P העבירו משיקים למעגל» is taught onto «מהנקודה P
יוצאים שני משיקים למעגל» (R114). A point inside the circle is refused, naming the line.

**R133 — «המעגל» is the circle the figure has**
([ADR-AG-196](06c-decisions-analytic.md#adr-ag-196), [#1633](https://github.com/dcodish/geo_builder/issues/1633), [#1619](https://github.com/dcodish/geo_builder/issues/1619)).
*(Operator, 2026-10-01: "now we need to work on phase B"; #1633: "The student stated ONE circle twice.")*

A sentence about «המעגל» with no name means the circle already drawn:
- «נתון מעגל שמרכזו M» then «משוואת המעגל היא (x−3)²+(y−1)²=10» (also «משוואת המעגל הנתון היא: …», «נתונה משוואת המעגל: …») draws ONE circle: M moves to (3,1) and the radius is √10. An equation that contradicts the circle — a different equation for a circle given by its equation, a centre already placed elsewhere, a radius already given — is refused on that line.
- «משולש ABC חסום במעגל» after a circle exists puts A, B and C on that circle. «המעגל עובר דרך הנקודות A, B ו-C» after a circle exists is «A על המעגל» three times.
- A sentence that describes its circle («חסום במעגל שמרכזו M», «… שמשוואתו …», «נתון מעגל M שמשוואתו …», «משוואת המעגל M היא …») means the circle already drawn with that centre or that equation — its equation then pins that circle, as above — and otherwise draws a new one.
- With no circle yet, each of these sentences draws its circle, as before. With two or more circles, «המעגל» is refused as ambiguous and the circles are named; the student names the one they mean.

The touch sentence «הצלעות AO, BO ו-AB משיקות למעגל בנקודות D, E ו-F בהתאמה» (and "the sides … touch the circle at …") works for every circle, including one given by its equation; on an inscribed circle the touch points are exactly where the sides meet it.

**R134 — a value is printed only when the drawings whose givens hold agree on it, and «הציגו תצורה אחרת» always reaches another drawing when there is one**
([ADR-AG-197](06c-decisions-analytic.md#adr-ag-197), [#1642](https://github.com/dcodish/geo_builder/issues/1642), [#1638](https://github.com/dcodish/geo_builder/issues/1638), [#1635](https://github.com/dcodish/geo_builder/issues/1635), [#1634](https://github.com/dcodish/geo_builder/issues/1634), [#1539](https://github.com/dcodish/geo_builder/issues/1539)).
*(Operator, 2026-10-01: "there is no way to know A or C or B"; "point B is showing as 2 possible locations but it cannot be"; «הציגו תצורה אחרת» "should always swap if there are more than 1 option".)*

- The data panel and the answers print a number (or «… או …») only from drawings in which every given the student wrote holds. A drawing that breaks a given — a point off the axis it was put on, a point outside its quadrant — is never a source of a value.
- A figure that can still move prints a value only when several different drawings agree on it. «משולש AOB ישר זווית» with its sides on the axes and the inscribed centre C in the second quadrant prints A as «(x_A, 0)», B as «(0, y_B)» and C as «—», never a pair of sample values.
- When the other givens decide which angle of «משולש ישר זווית» is the right one, every drawing uses that angle.
- A chord has two different ends, and the points named in «המיתרים AB ו-BC» are three different points: corpus 7/5 prints B = (2, −2) alone.
- A sentence whose condition can hold in no drawing is refused on that line even when the figure still has freedom: «המעגל משיק לציר ה-x» then «המעגל חותך את ציר ה-x בנקודות B ו-C» refuses the second sentence.
- An unstated radius (any free value) is drawn inside the range where the figure exists, never stuck at the edge of it: «מעגל שמרכזו M(6,10)» · «B על המעגל» · «B על ציר ה-y» draws circles of different radii larger than 6, and B moves.
- «הציגו תצורה אחרת» on a figure with exactly one drawing says there is no other. Two crossings named in one sentence — «המעגל חותך את ציר ה-x בנקודות B ו-C», «הישר l1 חותך את המעגל I בנקודות A ו-B» — are first drawn in the order written, and the button swaps them. (R85 amended: the pair is no longer "never cycled".) A single ordinal («נקודת החיתוך הראשונה») keeps its root.

**R135 — a sentence draws what it names, the extent belongs to the statement, every list and paste is read, and a tangency states its circle**
([ADR-AG-198](06c-decisions-analytic.md#adr-ag-198), [#1639](https://github.com/dcodish/geo_builder/issues/1639), [#1640](https://github.com/dcodish/geo_builder/issues/1640), [#1636](https://github.com/dcodish/geo_builder/issues/1636), [#1641](https://github.com/dcodish/geo_builder/issues/1641), [#1643](https://github.com/dcodish/geo_builder/issues/1643), rulings of 2026-10-01 on [#1554](https://github.com/dcodish/geo_builder/issues/1554) and [#1619](https://github.com/dcodish/geo_builder/issues/1619)).
*(Operator, 2026-10-01: "the line BC should be drawn as well"; "for some reason it refuses to draw BC"; "i tried several variations … and none worked except this exact one".)*

- A sentence that names a pair draws it: «BC משיק למעגל בנקודה B», «AC הוא קוטר במעגל», «AB ⊥ CD», «הצלע AO נמצאת על ציר ה-x», «CD עובר דרך P». «הישר BC» draws the line BC; «הקטע BC», «הצלע BC» and a bare «BC» draw the segment. Typing the pair afterwards answers «כבר ידוע». A pair the figure already draws as a side is not drawn twice. «הישר BC» on a line of its own draws the line.
- The extent belongs to each statement. A bare «BC» typed to see it draws the segment and never changes what an earlier sentence said about the line BC. A point «על הצלע BC» / «על הקטע BC» is between B and C; «על הישר BC» is anywhere on the line; «על BC» is between B and C when the figure already draws the segment BC (or a side BC), and on the line when it does not. A point that cannot be where the sentence puts it is refused on that line.
- A list of points is read however it is separated — «A, B, C על המעגל», «נקודות A, B ו-C נמצאות על המעגל», «A, B, ו-C …» — with or without «(ה)נקודות» and with the verb dropped before «על». «ציר ה- x» with a space is «ציר ה-x». A list joined by a relation between its members («A ו-B סימטריות») is never split.
- Text pasted from the screen reads as typed: the invisible direction marks are ignored, and a leading «·», «•», «*» or «- » is a list mark. «מרכז המעגל הוא M» names the centre as «M מרכז המעגל» does.
- «טרפז ישר זווית ABCD חסום במעגל» (and «… בר חסימה», "right trapezoid ABCD is inscribed in a circle") is refused: the message names the right trapezoid and the rectangle a circle would force, and offers «מלבן ABCD חסום במעגל».
- A tangency sentence about «המעגל» typed when the figure has no circle draws the circle, with no letter for its centre until a sentence names it («O מרכז המעגל»). With one circle it means that circle; with several it is refused and the circles are named. Corpus 6/4 typed as printed builds A(2,−1), C(−4,5) (or the mirror); «הצלעות AO, BO ו-AB משיקות למעגל בנקודות D, E ו-F בהתאמה» typed before «במשולש AOB חסום מעגל שמרכזו C» builds the same figure as the printed order.

**R136 — the data panel's option rows read in order, and a loaded figure keeps the student's own words**
([ADR-AG-199](06c-decisions-analytic.md#adr-ag-199), [#1644](https://github.com/dcodish/geo_builder/issues/1644), [#1632](https://github.com/dcodish/geo_builder/issues/1632)).
*(Operator, 2026-10-01, playing PR #1637 T5: "the −2 is not shown correctly … the 2- is shown also on the screenshot you took.")*

- A data-panel row that joins two positions with «או» shows each position exactly as written, left to right: `A = [(3/5, 4/5)] או (4, -2)`, never `(2- ,4)`. The same holds for any panel row that contains a Hebrew word.
- A point's canvas label shows a coordinate typed with the exam's minus «−» exactly as one typed with «-»: «C(4,−2)» and «C(4,-2)» both read `C(4, -2)`. A stated fraction keeps its written form (`2/3` stays `2/3`).
- Opening a saved file, a share link or a restored session shows every row the way it showed when saved. A row built by the AI fallback shows the student's own sentence, not the tool's command line. A muted row stays muted, and a renamed letter stays where it was drawn.

- A slope row in the data panel reads, in this order: the segment, its slope, «זווית עם ציר ה-x», the angle (`AB: 2 · זווית עם ציר ה-x: 63.43°`). The Hebrew label reads naturally, with x right after «ה-». A vertical segment reads `CD: אנכי (אין שיפוע) · זווית עם ציר ה-x: 90°`.

**R137 — a piece named by its role is understood wherever a side is, and the role is honoured; a length given draws the pairs it names**
([ADR-AG-200](06c-decisions-analytic.md#adr-ag-200), [#1651](https://github.com/dcodish/geo_builder/issues/1651), [#1652](https://github.com/dcodish/geo_builder/issues/1652), [#1620](https://github.com/dcodish/geo_builder/issues/1620) item 2).
*(Operator, 2026-10-02, playing PR #1637: "when i write הישר BC מקביל לציר ה-x — accepted. when i write המיתר BC מקביל לציר ה-x — its rejected"; "when a user types OC = 15, BC = 3 — i would think they want to also draw the segments, otherwise they would say something like המרחק בין".)*

- «המיתר BC», «הקוטר BC», «הרדיוס MB», «המשיק BC», «השוק BC», «הבסיס AB» and «היתר AC» (and "the chord / diameter / radius / tangent / leg / base / hypotenuse") are read in every sentence that reads «הצלע BC»: a relation («… מקביל לציר ה-x»), a length («אורך השוק BC הוא 6»), an equation («משוואת המיתר BC היא y=1»), a point on it («E על השוק AD»), a side on a line («היתר AC מונח על הישר …»), and on a line of its own.
- The role is a given and the figure honours it: a chord's ends are on the circle; a diameter passes through the centre; a radius runs from the centre to the circle; a tangent touches the circle; a leg of a trapezoid is not one of its parallel sides and a base is; the right angle faces the hypotenuse; the base of an isosceles triangle faces its apex. A role the figure contradicts is refused naming the sentence; a role with nothing to belong to (a leg with no polygon, a chord with no circle) is refused, never dropped.
- «התיכון» and «הגובה» are still not read in these sentences (2-D drops the claim there too), except the equation: «משוואת התיכון AD היא …» keeps its median claim (R165).
- A length given draws each pair it names: «OC = 15, BC = 3», «AB = 2CD», «AB + BC = 10», «AC:CB = 3:2», «אורך הקטע AB הוא 3». A distance spelling — «המרחק בין O ל-C הוא 15», «המרחק OC = 15», «d_{OC} = 15», «|OC| = 15» — states the distance and draws nothing.

**R138 — a clicked segment can be hidden or dashed, and a clicked unnamed centre takes the letter the student types**
([ADR-AG-201](06c-decisions-analytic.md#adr-ag-201), [#1653](https://github.com/dcodish/geo_builder/issues/1653), [#1598](https://github.com/dcodish/geo_builder/issues/1598)).
*(Operator, 2026-10-02: "in the analytic tool we dont have an option to click on a segment and hide it like we have in 2d"; "i want to be able to press on the center of a circle to create a letter in addition to the ability to define it through input like O מרכז המעגל".)*

- Clicking a drawn segment opens a menu with «הסתירו קטע» and «מקווקו», and the segment's measurements below them. A hidden segment is not drawn. A faint dashed mark stays on the line, which is not part of the downloaded image, and clicking it offers «הציגו קטע». One «בטל» also brings the segment back. A hidden segment can still be measured and referred to, and a length the student stated for it stays on the canvas.
- A dashed or hidden segment stays that way after saving and opening the file, after a share link, and after a restored session. It follows its letters when a point is renamed or two letters are swapped. «נקה הכל» clears these choices.
- Clicking the centre of a circle whose centre has no letter opens the letter box («מרכז המעגל»). The letter the student types adds exactly the row they could have typed: «M מרכז המעגל x²+y²=16» for a circle given by its equation, «C מרכז המעגל I» for a named circle, «M מרכז המעגל» for the figure's only computed circle. The letter is the centre. A letter already in use names the row that holds it and offers to swap: the centre takes that letter, and the old point takes the centre's automatic letter, undone in one step. A character that is not a letter is refused and nothing is added.
- A canonical circle's centre is still the tool's O (R123), with no ring to click.


**R139 — every circle can be named in a sentence, a diameter works on every circle, and the data panel never shows the tool's own symbols**
([ADR-AG-203](06c-decisions-analytic.md#adr-ag-203), [#1659](https://github.com/dcodish/geo_builder/issues/1659), [#1665](https://github.com/dcodish/geo_builder/issues/1665), [#1663](https://github.com/dcodish/geo_builder/issues/1663)).

- A circle computed from a triangle can be referred to by what it is to that triangle, in any sentence about a circle: «X מרכז המעגל החוסם את המשולש ABC», «D על המעגל החוסם את המשולש ABC», «DE מיתר במעגל החוסם את המשולש ABC», «הישר DE משיק למעגל החוסם את המשולש ABC בנקודה D», and «… המעגל החסום במשולש ABC» for the inscribed circle (and "the circumcircle / incircle of triangle ABC", "the circle circumscribing / inscribed in triangle ABC"). It means the circle the figure has through every vertex (or tangent to every side), however it was stated; with no such circle the sentence is refused. «המעגל החוסם את המשולש ABC» typed on its own line is still the statement that the triangle is inscribed.
- A circle can also be referred to by its centre inside another sentence: «A על המעגל שמרכזו M», «הישר BC משיק למעגל שמרכזו M בנקודה B», «B נמצאת מחוץ למעגל שמרכזו M», «אורך הקטע BC שווה לרדיוס המעגל שמרכזו M», "A is on the circle with centre M" — the same as «מעגל M».
- Clicking the centre of a computed circle that is one of several offers the letter box, and the letter adds «K מרכז המעגל החוסם את המשולש ABC» (or «… החסום במשולש ABC»).
- «AB קוטר במעגל», «הקוטר AB …» and «הקוטר AB = 10» work on every circle — one given by its equation, one a tangency sentence drew, one computed from points — not only on a circle whose centre has a letter. A radius on a centre with no letter is still refused.
- A circle whose equation the givens do not fix shows «—» in the data panel, never the tool's internal symbols (such as «θ_…»). An open equation the student wrote (with their own parameters) is still shown.

**R140 — a chord, diameter or radius sentence introduces the points it names, and a chord or diameter typed before any circle draws the circle**
([ADR-AG-204](06c-decisions-analytic.md#adr-ag-204), [#1669](https://github.com/dcodish/geo_builder/issues/1669); operator ruling 2026-10-02: the analytic tool behaves as the 2-D tool does here).

- «AB קוטר», «AB קוטר במעגל», «הקוטר AB מקביל לציר ה-y», «המיתר AB מקביל לציר ה-x», «נתון מעגל שקוטרו AB», «הרדיוס OA» and «OA רדיוס» work when A and B are not yet in the figure: each named point is added, on the circle, free to move along it. A point already placed keeps its place — after «A(3,4)» on x²+y²=25, «AB קוטר במעגל» puts B at (−3,−4).
- A diameter's two ends are antipodal (the segment passes through the centre and is twice the radius).
- With no circle in the figure, «AB קוטר» draws the circle on AB, and «מיתר AB» / «המיתר AB …» draws a circle through A and B; the centre has no letter until «O מרכז המעגל» names it. An equation stated afterwards («משוואת המעגל היא …») is that circle's equation.
- With one circle the sentence is about that circle; with several it asks which.
- «OA רדיוס» means OA is a radius (as «הרדיוס OA»). With no circle at all it is still refused. On a circle whose centre has no letter, the radius now names the centre (R143, #1670).

**R141 — the perpendicular from a point and its foot, the line through a point that cuts a side, and «האנך» as a reference**
([ADR-AG-207](06c-decisions-analytic.md#adr-ag-207), [#1620](https://github.com/dcodish/geo_builder/issues/1620) slice C; operator ruling 2026-10-02: the analytic tool behaves as the 2-D tool does for plane geometry).

- «האנך מהנקודה B לציר ה-x» (also to a side, «לצלע AC», to a line, «לישר l1», or to a tangent) draws the perpendicular from B to its foot. The foot is a point; with no letter given the tool names it (H, then G, P … — R103c) and says so on the row, and the student can rename it.
- The foot named in the same sentence — «האנך מהקודקוד C לציר ה-x חותך אותו בנקודה D», «D רגל האנך מ-C לציר ה-x», «האנכים מהקודקודים A ו-C לציר ה-x חותכים אותו בנקודות E ו-F בהתאמה» — is that letter. A foot on a side's line may lie beyond the side, as in 2-D. «אנך אמצעי ל-AB» draws the midpoint and the perpendicular bisector.
- «הישר העובר דרך הנקודה E מקביל לציר ה-y וחותך את הצלע AB בנקודה F» (and «דרך E עובר ישר מקביל ל-… החותך את …», «ישר דרך P מאונך ל-AB») states the line and where it cuts the side; on a SIDE the point lies between its ends. The piece EF is drawn and the line itself is not, as in 2-D, until a sentence states the line.
- «האנך» refers to the perpendicular already drawn — «הנקודה E נמצאת על האנך שהורידו מנקודה B לציר ה-x», «המשיק והאנך נחתכים בנקודה D». With none, or several and no description that picks one, the sentence is refused and says how to name it.
- A perpendicular named in full inside another sentence — its point and its line, «E על האנך מ-A ל-BC», «האנך מ-A ל-BC והתיכון מ-B נפגשים בנקודה E» — is drawn when the figure has none: the foot (named by the tool) and the piece. One already drawn (also as «הגובה מ-A» or «AD גובה לצלע BC») is the one meant, never drawn again. «E נקודת החיתוך של האנך מ-A ל-BC עם הישר BC» names the foot E ([ADR-AG-229](06c-decisions-analytic.md#adr-ag-229), #1727).
- «הצלע CB מקבילה לציר ה-x, וחותכת את ציר ה-y בנקודה E» is both statements about CB.
- «הקטע EF מקביל ל-DA» (and «EF ∥ DA», «הצלע EF מקבילה ל-DA», «הישר EF מקביל ל-DA», R143) with F not yet placed adds F, free to move along the parallel through E, until a later given places it.
- Refused by name: a perpendicular from a point of the line itself, a foot that is its own point, a line the sentence does not name readably.
- **Amended by [ADR-AG-213](06c-decisions-analytic.md#adr-ag-213) (#1620 S7) — the two tangents meet.** «המשיק בנקודה A והמשיק בנקודה C למעגל O נפגשים בנקודה D» draws both tangents and D where they cross, as 2-D does; on an empty canvas it also adds circle O and puts A and C on it, free to move. «למעגל O» said once belongs to both tangents, before or after the point. «המשיקים למעגל O בנקודות A ו-C נפגשים בנקודה D» and English ("the tangent at A and the tangent at C to circle O meet at D", "the tangents to circle O at A and C meet at D") say the same. «המשיקים נפגשים בנקודה D» (also «D נקודת החיתוך של המשיקים», "the tangents meet at D") means the two tangents already drawn and also draws AD and CD; with none, one or three tangents the tool asks which two. Tangents at the two ends of a diameter are parallel: the sentence is refused as impossible, naming the sentence, in every spelling of the diameter («AC קוטר», «AC קוטר במעגל O», «הקוטר AC», «AC קוטר במעגל», and after «A על המעגל» / «C על המעגל»). It never carries the "pick another letter" hint, because the sentence refers to A and C rather than defining them. It is never drawn as a circle shrunk to a dot, nor as A, C and D on one point. One tangent named twice is refused.
- «נפגשים», «נחתכים» and «מצטלבים» mean the same for two lines («הישר AC והישר BD נפגשים בנקודה E», "l1 and l2 meet at E"), as in 2-D.

**R142 — diagonals, extensions, the midsegment and a point on a side with a condition read as the 2-D tool reads them**
([ADR-AG-208](06c-decisions-analytic.md#adr-ag-208), [#1620](https://github.com/dcodish/geo_builder/issues/1620); operator ruling 2026-10-02: the analytic tool gives the same experience as 2-D for plane geometry).

- «E על המשך הצלע BC» (and «E על המשך BC», «נקודה E על המשך הקטע BC») puts E on the line BC past C, free to slide along the extension; «… מעבר ל-B» puts it past B instead. A sentence about «המשך AD» on an empty canvas adds A and D, as 2-D does. A point placed inside the side is not on its extension, and saying it is is refused naming the sentence.
- «המשכי הצלעות AD ו-BC נפגשים בנקודה E» (and «המשך הצלע AD והמשך הצלע BC נפגשים …») puts E where the two lines cross, past D and past C. Parallel sides do not meet, and the sentence is refused.
- «המשך AC חותך את מעגל O בנקודה E» puts E on the circle, on the line AC past C.
- «הנקודה E נמצאת על צלע BC כך ש-AE = AC» places E on the side and states AE = AC; «כך ש-…» joins any placement to the condition after it. Both parts are givens: a condition the tool cannot read refuses the whole line, never keeping the placement without it. A condition the placement cannot meet is refused naming the sentence.
- «האלכסונים AC ו-BD נפגשים בנקודה E» puts E where the two named diagonals meet, and draws them; it works on an empty canvas too. Two sides named as diagonals («האלכסונים AB ו-CD» in «מרובע ABCD») are refused, never read as the real diagonals.
- «אלכסוני הטרפז נפגשים בנקודה M» and «E היא נקודת החיתוך של אלכסוני הדלתון» mean that shape's diagonals: the trapezoid beside a plain quadrilateral, a right trapezoid as a trapezoid. With two trapezoids the tool asks which; with none it refuses. «…, שנמצאת על ציר ה-y» after a sentence that names a point is a given about that point. «שטח הטרפז …» finds a right trapezoid the same way.
- «האלכסון AC» and «האלכסון AC במרובע ABCD» draw the diagonal (the second also states the quadrilateral); a side named as its diagonal is refused.
- «קטע האמצעים לצלע BC במשולש ABC» draws the segment joining the midpoints of AB and AC, and «קטע האמצעים בטרפז ABCD» the one joining the midpoints of the legs BC and DA. The midpoints are named M and N, as in 2-D (the next free letters when those are taken, and the student's own letters in «DE קטע אמצעים …»); the tool says it named them. A midpoint the student already named keeps its letter.
- «שכל קודקודיו מונחים על הצירים» (and «כל קודקודי הטרפז נמצאים על הצירים») puts every vertex of the shape on the x-axis or the y-axis; which axis each vertex takes is not stated, so «הציגו תצורה אחרת» moves between the possible assignments.

**R143 — a sentence that names points or a circle the figure does not have yet builds as it does in the 2-D tool**
([ADR-AG-210](06c-decisions-analytic.md#adr-ag-210), [#1670](https://github.com/dcodish/geo_builder/issues/1670), [#1686](https://github.com/dcodish/geo_builder/issues/1686); operator rulings 2026-10-02: follow 2-D, *"accept new letter with same logic the 2d tool has"*, an unlabelled centre is never «O» until named, and a new letter beside it is a free point until a sentence places it).

- «AB קוטר» · «OB רדיוס» (also «מיתר AB» · «OA רדיוס» and «A על המעגל» · «OA רדיוס»): the radius gives the centre the student's letter, so O is the centre. The sentence is still refused when both ends of the radius are off the circle, or when there is no circle.
- «A על המעגל» (also «A על מעגל», «A, B ו-C על המעגל», "A is on a circle") with no circle draws a circle through the point. The circle's centre has no letter. The centre and the radius move with «הציגו תצורה אחרת».
- A circle named by a letter the figure does not have yet is drawn on that centre: «A על המעגל שמרכזו M», «A על מעגל O», «מיתר AB במעגל O», «AB ו-CD מיתרים במעגל O», «AB קוטר במעגל O», «AB משיק למעגל C», «המשיק למעגל O בנקודה A».
- New letters in a relation are added as free points wherever the 2-D tool adds them. This holds beside a circle whose centre has no letter too.
  - Added: «BD⊥AC», «AB∥CD», «AB = CD», «AB = 5», «AB + BC = 10», «זווית ABC = 30», «M אמצע AB», «E על AB», «AB חותך את CD בנקודה E», «C מחלקת את AB ביחס 3:2», «AD גובה במשולש ABC» (this one also draws the triangle).
  - A point that a later line defines is still defined by that line.
  - Still refused, as in 2-D, when the letters are new: «AB = 2CD», «AB:BC = 2:3», «AD גובה לצלע BC».
- «AB קוטר» · «BO = 5» draws BO with B where it is and O a free point. O is not the centre until the student says so. A later «O מרכז המעגל», «OB רדיוס» or «הרדיוס OB» then moves that same O to the centre; no second point appears.

**R161 — lengths, angles, crossings and congruent or similar triangles read as the 2-D tool reads them**
([ADR-AG-218](06c-decisions-analytic.md#adr-ag-218), [#1622](https://github.com/dcodish/geo_builder/issues/1622); operator rulings 2026-10-02: the same experience as 2-D for plane geometry, and «≅ / ~», segment products and a letter in a length are ported to analytic.)

- «△ABC ≅ △DEF» (also «משולש ABC חופף למשולש DEF», «המשולשים ABC ו-DEF חופפים») draws both triangles with the corresponding sides equal. «△ABC ~ △DEF» (also «ABC ~ DEF», «המשולשים ABC ו-DEF דומים») draws them with the corresponding angles equal. The palette offers △, ≅ and ~. A sentence asking the student to PROVE it («הוכיחו ש-△ABC ≅ △DEF») is still refused.
- «AB·AC = AD²» holds on the figure.
- «AB = 3a», «AB = a²», «AD = 12√a», «AB = AC = 3k»: the letter is a free length. It moves with «הציגו תצורה אחרת» until a later given fixes it («AB = 6» makes a = 2, shown in the panel). The same letter in two lengths relates them.
- **x and y are never a length here** (operator ruling 2026-10-03, ADR-AG-222; this replaces the 2026-10-02 reading). «AB = 3x», «AB = 2y», «AB = x²», «AD = 12√x», «AB = AC = 3x» are refused with a message that says why: in the analytic tool x and y are the plane's coordinates, so name the length with another letter, e.g. «AB = 3a» or «AB = 3k». The 2-D tool reads them as before. «y = 2x + 1» and «x = 4» are the plane's lines.
- A chain of equalities states every link: «AB = AC = 3x», «זוית AEB שווה לזווית BEC שווה 60 מעלות».
- «CD חותך את AB» (also «AB ו-CD נחתכים», «הקטעים AB ו-CD נחתכים») draws the two segments crossing, with no point named. «CD חוצה את AB» makes CD pass through the midpoint of AB (named M, or the letter given by «בנקודה K»).
- «הזווית בין BD ל-BA היא 30» is the angle DBA. Two sides with no common end form no angle, and the sentence is refused.
- An angle value may be written in words: «שווה לשלושים מעלות», "thirty degrees".
- «A = 40» is the angle at A when A is a vertex of the figure; on a free point the tool asks which angle.
- «נסמן את שטח ABCD ב-S» labels the area S, and the panel shows its value once the figure fixes it. (The distance forms, «ישר ABE» and «קו ועליו נקודה A» are promised by R160.)
- In a trapezoid, «המרחק בין AB לבין CD הוא 3» keeps AB and CD parallel and 3 apart.
**R162 — the circle and tangent sentences of the 2-D tool build here too, and two fresh circles are named by order**
([ADR-AG-219](06c-decisions-analytic.md#adr-ag-219), [#1622](https://github.com/dcodish/geo_builder/issues/1622), [#1693](https://github.com/dcodish/geo_builder/issues/1693); operator rulings 2026-10-02: the analytic tool gives the same experience as 2-D for plane geometry, and on #1688 *"first mention names one"*).

- A circle by its centre in 2-D's words: «מעגל סביב O רדיוס 5», «מעגל עם מרכז O». A circle sized by a value: «מעגל O שהיקפו 6π» (radius 3), «מעגל O ששטחו 9π», «מעגל O שקוטרו 10», «מעגל בקוטר 10», «מעגל שרדיוסו 5». A radius named by a letter, «מעגל O שרדיוסו R», stays free; «R > r» then keeps the circle with radius R the larger in every configuration. «R > r» about letters no circle carries is refused naming the letter.
- «נתון מעגל» and «מעגל» draw a new circle each time; its centre has no letter until a sentence names it. «מרכז המעגל» on its own refers to the circle already drawn (or draws one). «רדיוס המעגל הוא 5» sets the radius of a circle drawn without one.
- Two circles: «שני מעגלים», «שני מעגלים זרים» (each outside the other, always), «שני מעגלים מוכלים» and «מעגל P מוכל בתוך מעגל O» (one strictly inside the other, always), «מעגל מוכל בתוך המעגל הגדול» (a new circle inside the circle the figure has), «שני מעגלים בעלי מרכז משותף O» (two circles on O, the second the inner), «שני מעגלים נחתכים בנקודות A ו-B» (A and B on both; without the letters the crossings are named A and B). Every size and position not stated moves with «הציגו תצורה אחרת».
- **Two fresh circles are named by order.** After «שני מעגלים נחתכים …» (or any two circles one sentence drew that no statement tells apart), the first new letter that names a circle — «נקודה C על מעגל P», «O מרכז המעגל» — names the first circle, and the next new letter names the other. Once a statement tells the two circles apart (one inside the other), a new letter is asked about instead. «מעגל O» on its own is still a new circle.
- Lines cutting circles: «ישר החותך את המעגל בשתי נקודות» (the points named C and D, or «בנקודות C ו-D»), «ישר חותך את שני המעגלים בנקודות C, D, E ו-F» (C, D on the first circle, E, F on the second, along the line in that order), «מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B» (E outside, A between E and B), «הישר AC פוגש את מעגל P בנקודה E».
- Tangents: «משיק למעגל» (the touch point named T), «מנקודה E משיק נוגע במעגל O בנקודה D», «מנקודה E מחוץ למעגל O שני משיקים נוגעים במעגל בנקודות A ו-B», «AB משיק משותף למעגלים O ו-P», «AB משיק משותף חיצוני / פנימי לשני המעגלים» (the centres on the same side of AB, or on opposite sides), «CD משיק משותף למעגלים O ו-P בנקודה M» (the circles touch at M; M between C and D), «מנקודה A יוצאים שני משיקים לשני המעגלים» (the touches named B, C and D, E), «AB מיתר במעגל O ומשיק למעגל P».
- Each of these is also read in English («circle centered at O radius 5», «two circles intersect at A and B», «AB is a common tangent to circles O and P», …).

**R151 — an angle named by a Greek letter, and the tan or cos of an angle, read as givens**
([ADR-AG-215](06c-decisions-analytic.md#adr-ag-215), [#1621](https://github.com/dcodish/geo_builder/issues/1621); operator rulings 2026-10-01: tan of an angle is in scope, sin/cos follow when needed; 2026-10-02: the same experience as 2-D for plane geometry).

- «∢ABC = α», «זווית ABC = 2α», and the exam's «נסמן ∢DCB = 2α» / «נסמן: זווית ADB = α» name the angle by a Greek letter (α β γ δ θ and the rest of the lowercase alphabet; π stays the number). The letter is a free value: the triangle may take any shape, the angle follows it, and «הציגו תצורה אחרת» changes it. The same letter on two angles makes them equal.
- A later «α = 30» (or «α = 30°») sets the letter, and so the angle. A figure that already fixes the angle at another value refuses the line, naming it. «θ = 2β» relates two letters.
- A Latin letter is not set this way: «a = 5» and «r=5» stay unread, as before (a single Latin letter can mean a radius or a point).
- «tan∢BAO = 2», «tan(∢BAO) = 2», «tg∢BAO = 2», «טנגנס הזווית BAO הוא 2» and "the tangent of angle BAO is 2" state the angle by its tangent. A positive tangent is an acute angle and a negative one an obtuse angle. The drawing may still be any reflection of the figure, as for an angle given in degrees. «קוסינוס הזווית ACB = 3/4» and «cos∢ACB = 3/4» state it by its cosine; a cosine outside −1…1 is refused, naming the line.
- «sin∢ACB = 1/2» is not read: a sine fits an acute angle and an obtuse one, and the tool does not choose between them.
- The symbol palette offers α β γ δ θ.

**R152 — a coordinate stated about a vertex, and an order between measures, read as the 2-D tool reads them**
([ADR-AG-216](06c-decisions-analytic.md#adr-ag-216), [#1621](https://github.com/dcodish/geo_builder/issues/1621); operator ruling 2026-10-02: the analytic tool gives the same experience as 2-D for plane geometry).

- «שיעור ה-y של הקודקוד A הוא 10» states A's y-coordinate exactly as «שיעור ה-y של הנקודה A הוא 10» does. The same holds for every point sentence: «הקודקוד» and «הקדקוד» name a point as «הנקודה» does.
- «שיעור ה-y של הקודקוד B קטן מ-6» says which of the figure's possible positions B takes. It never moves a point the other givens already fix. A figure where it cannot hold is refused, naming the sentence.
- An order between two lengths or two angles, or between a length or an angle and a number, is a given about the figure: «AB < BC», «AB קטן מ-BC», «DC > AB», «AB ≤ 10», «AB לפחות 3», «∢ABC ≤ 40°», «20 < ∢ABC < 60», «זווית ABC גדולה מ-40», «∢ABC < ∢BAC», «זווית ABC קהה», «זווית ABC חדה».
  - The figure is drawn with the order true. Where the order leaves freedom, «הציגו תצורה אחרת» still moves the figure, always inside the order.
  - ≤, ≥, «לפחות» and «לכל היותר» admit equality; <, >, «גדול מ» and «קטן מ» do not.
  - The sentence draws the segments it names, and adds points the figure does not have yet, as «AB = 5» does.
  - An order the other givens contradict is refused, naming the sentence. Comparing a length with an angle is refused.
- The symbol palette offers `<`.
- Not read: «D מעל A», «C מימין ל-B» (positions on the drawing; awaiting a ruling) and «משולש קהה זווית ABC» (which angle is obtuse is unstated).

**R150 — the ratio of two measures, and the area notation S_{…}, as givens**
([ADR-AG-214](06c-decisions-analytic.md#adr-ag-214), [#1621](https://github.com/dcodish/geo_builder/issues/1621); operator ruling 2026-10-02: the analytic tool gives the same experience as 2-D for plane geometry).

- «היחס בין שטח המשולש AOB לשטח הטרפז ADCB הוא 4:5» states that the two areas are in the ratio 4:5. The ratio may be written `p:q`, as a fraction («4/5») or as a number («0.8»). Either measure may be an area, a length or a distance, and the polygon may have any number of vertices. «the ratio of the area of triangle AOB to the area of trapezoid ADCB is 4:5» is the English form.
- «S_{ABC}» and «S_ABC» mean «שטח ABC», in a given («S_{ABC} = 13», «S_BDC / S_ODC = 0.8») and in a question. The palette has an «S_{}» button: select the vertices, press it, and get «S_{ABC}».
- A length ratio may be written with «/»: «DO/DE = 2/3», «CD/OB = 5/2», the same as «DO:DE = 2:3».
- An area value may be written «שטח המשולש ABD שווה ל-45», and in English «the area of triangle ABC is 45».
- A ratio pins only what it states. Every other size and shape stays free and moves with «הציגו תצורה אחרת».
- A ratio that cannot hold is refused, naming the sentence. For example: a part of a triangle twice the triangle's area, or a triangle with all three vertices on one line («S_BDC» when D is on BC).
- A ratio that names a point the figure does not have is refused, naming that point.

**R163 — arcs, sectors, semicircles and the diameter from a point build as they do in the 2-D tool**
([ADR-AG-220](06c-decisions-analytic.md#adr-ag-220), [#1622](https://github.com/dcodish/geo_builder/issues/1622); operator rulings 2026-10-02: analytic gives 2-D's verdict for plane geometry, and the arc rows are ported).

- An arc's measure is its central angle: «קשת AB = 40 במעגל O», «⌢{AC} = 60°», «קשת AC = 60» (the one circle), «קשת DE = 2 קשת CE», «קשת AB שווה לקשת BC», «קשת AC + קשת BE = קשת AD + קשת BC», «קשת AB + קשת CD = 180». The arc's ends are put on the circle. An arc of more than 180° is the circle's other arc. A circle whose centre has no letter works too. An arc whose ends the figure does not have is refused, naming the missing point.
- «זוית מרכזית COD» draws the radii OC and OD (the middle letter is the centre); «זוית מרכזית COD = 80» also sets the angle.
- «חצי מעגל שקוטרו AB», «חצי מעגל על צלע AB מחוץ למשולש ABC» (or «בתוך»), «על כל צלע של ריבוע ABCD יש חצי מעגל» draw the half circle over AB and the diameter AB; the full circle is not drawn. A point put «על המעגל» lies on that half's circle, so the angle it sees AB at is 90°.
- «רבע מעגל» draws a 90° arc with its two radii, and the tool names the ends (A, B — the next free letters); «רבע מעגל OAB» uses the student's letters, O the centre. «גזרה AOB בזווית 80» draws the two radii OA, OB and the 80° arc; with no angle the angle is free and moves with «הציגו תצורה אחרת»; an angle over 180 draws the large arc. A sector cut from a circle the figure already has rides that circle.
- «M אמצע הקשת BC במעגל O» places M halfway along the small arc BC («הקשת הגדולה» — the large one).
- «קוטר מנקודה F במעגל O», «קוטר העובר בנקודה A במעגל O» draw the diameter from that point; the tool names the far end (D, or the next free letter). «קוטר» alone names both ends. «קוטר מעגל O היוצא מנקודה F חותך את הצלע AC בנקודה E» draws the piece from F to E, where the diameter's line meets AC.
- «מעגל O בקוטר 10» / «מעגל O שקוטרו 10» is the circle with radius 5.
- The symbol palette has the ⌢{} button: select «AC», press it, get «⌢{AC}».
- Every sentence above has its English twin («arc AB = 40 in circle O», «semicircle with diameter AB», «quarter circle», «sector AOB with angle 80», «M is the midpoint of arc BC in circle O», «diameter from point F in circle O», «circle O with diameter 10»).
**R160 — the shapes and points the 2-D tool reads build the same here**
([ADR-AG-217](06c-decisions-analytic.md#adr-ag-217), [#1622](https://github.com/dcodish/geo_builder/issues/1622) slice E1; operator ruling 2026-10-02: analytic gives the same experience as 2-D for plane geometry).

- A bare run of three or four letters («ABC», «ABCD») is the triangle or quadrilateral it names.
- «מחומש ABCDE», «משושה …», «מתומן …» draw a polygon of that many sides and assert nothing else. «משובע», «מתושע», «מעושר» without «משוכלל» are refused by name, offering the nouns that build.
- «מחומש משוכלל ABCDE» (and «משושה / משובע / מתומן / מתושע / מעושר משוכלל», "regular pentagon ABCDE") draws a regular polygon: equal sides and equal angles. Its size, place and turn are free and move with «הציגו תצורה אחרת».
- A shape may state its size: «ריבוע ABCD שצלעו הוא 1» (square, rhombus, equilateral triangle, a regular polygon), «מלבן במידות 4*6» / «מלבן 4 על 6» (any quadrilateral: the first number is AB, the second BC). «מלבן ABCD שצלעו 4» asks which side is meant.
- A shape written without letters («ריבוע», «ריבוע שצלעו 4», «מחומש משוכלל») is lettered by the tool with the first free letters (A, B, C, …), as in 2-D; the row says so, and the letters can be renamed. «קו ועליו נקודה A» draws a line BC with A on it.
- «מעוין BDEF חסום במשולש ABC», «מלבן DEFG …», «ריבוע DEFG …»: a letter the triangle shares is its vertex, and every other vertex lies on a side. When the letters do not say which side, «הציגו תצורה אחרת» moves between the possible placements.
- Points: «נקודה E על AC ב-40%» (40% of the way from A); «C במרחק 5 מ-A ו-5 מ-B»; «D על AB במרחק 3 מ-A»; «אמצע AB» (the tool names it M); «הנקודה E נמצאת בתוך המשולש KAO» / «… מחוץ ל…» (naming the triangle draws it); «C ו-D בצדדים שונים של AB» / «… באותו צד של AB»; «ישר ABE» (A, B, E on one line, B between).
- A bound on a length is R-numbered with the orders of #1621 D3 (ADR-AG-216); «AB בין 5 ל-9» / "AB is between 5 and 9" now reads as the window «5 < AB < 9».
- «המעגל החוסם את המשולש ABC» named in a sentence when the figure has no such circle draws it (the circle through A, B and C), as a named circle does (R143).

**R164 — an order between angle names, an angle named by a label, and an area label on an empty canvas build as they do in the 2-D tool**
([ADR-AG-221](06c-decisions-analytic.md#adr-ag-221), [#1622](https://github.com/dcodish/geo_builder/issues/1622) slice E5; operator ruling 2026-10-02: analytic gives 2-D's experience for plane geometry).

- «α < β», «α > β», «α ≤ β», «α < 30», «α > 150°», «20 < α < 60» are orders between angle names (R151), or between an angle name and a number of degrees. They build on an empty canvas, as in 2-D, and hold once «∢ABC = α» / «∢BAC = β» say which angles they are, typed before or after the order. The angles stay free inside the region and move with «הציגו תצורה אחרת». A later value the order contradicts («α = 50», «β = 40» after «α < β») is refused, naming the value's line.
- «α < AB» compares an angle with a length and is refused by name; «α < 2β» is not read (2-D does not read it either).
- «נסמן זוית BAM כ-A1» names the angle BAM «A1», as the book does: the arms AB and AM are drawn, the angle stays as free as it was, and the data panel shows it as ∠A1 (its value once the figure fixes it). On an empty canvas A, B and M are introduced. The same sentence: «נסמן זוית CAD כ 1» (the vertex letter and the digit: A1), «נסמן ∠CAB = A1», «נסמן זווית CAB בתור A1», «נסמן זוית CAB כזוית A1», "denote angle CAB as A1". A Greek name («נסמן זוית BAM כ-α») is the angle name of R151.
- A label already given to another angle, or already a point's name, is refused, naming it — in either order («נקודה A1» then the label, or the label then «נקודה A1»). Nothing reads the label afterwards («A1 = 30» is not read, as in 2-D).
- Without the verb, «∠CAB = A1» is not a label: a point's name is never the value of a length or an angle («∠ABC = A», «∠ABC = B2», «∠ABC = A₁», «AB = A1», «AB = 2A», «AB = AC + D», «∢ABC < A», «α = A1»). The sentence is not read (it goes to the model), as in 2-D — it is never recorded as an unknown named A. The radius R beside a length («AB = 1.6R») and a letter naming an area («שטח המשולש ABC = S») still read, as in 2-D ([ADR-AG-238](06c-decisions-analytic.md#adr-ag-238), [#1701](https://github.com/dcodish/geo_builder/issues/1701)).
- An indexed name in a value — «שטח המשולש ABC = A1», «שטח המשולש ABD = S1», «AB = a1», «∠ABC = α1», «y = m1x + 2», «A(a1, 0)», «S_1», «S₁» — is not read (it goes to the model), as in 2-D and 3-D. It is never read as a multiple of a shared unknown: «S1» and «S2» are never S and 2S, so no ratio the student did not state is drawn. «AB = a», «AC = 2a» and «שטח המשולש ABC = B» still read ([ADR-AG-244](06c-decisions-analytic.md#adr-ag-244), [#1785](https://github.com/dcodish/geo_builder/issues/1785)).
- «נסמן את שטח ABCD ב-S» on an empty canvas draws the quadrilateral ABCD with free vertices, and S is its area (shown in the panel). The shape named next («ריבוע ABCD», «מלבן ABCD») takes the quadrilateral over. 2-D commits the label and draws nothing; here the label introduces what it names, as «AB = 5» introduces A and B. Only the label does this: an area VALUE about points the figure does not have («שטח ABCD = 20») is still refused, as in 2-D.

**R165 — the equation of a median keeps the median; position words between points choose the configuration; an obtuse triangle is obtuse at one vertex, any of the three**
([ADR-AG-222](06c-decisions-analytic.md#adr-ag-222), [#1662](https://github.com/dcodish/geo_builder/issues/1662), [#1706](https://github.com/dcodish/geo_builder/issues/1706), [#1707](https://github.com/dcodish/geo_builder/issues/1707), [#1708](https://github.com/dcodish/geo_builder/issues/1708); operator rulings 2026-10-03.)

- «משוואת התיכון AD היא y=x» and «משוואת הגובה AD היא …» state the line AND the median / altitude: D is the midpoint of BC (or the foot of the perpendicular from A), in the one triangle of the figure with vertex A whose opposite side contains D. When several triangles have the vertex A and D is on none of their sides, the tool asks which; with no triangle at A the sentence is refused — the claim is never dropped. «AD גובה» after «D על BC» picks the triangle the same way.
- «D מעל A», «D מתחת ל-A», «C מימין ל-B», «C משמאל ל-B» (and «הנקודה C נמצאת מימין לנקודה B», "D is above A", "C is to the right of B") say which configuration is meant: y of D greater than y of A, x of C greater than x of B. They pin nothing; they choose among the figures the other givens leave. They are read inside parentheses after a placement too: «A ו-D על ציר ה-y (D מעל A), B ו-C על ציר ה-x (C מימין ל-B)» (the 2020 exam's question 5 now builds D(0,9), A(0,6), B(4,0), C(6,0)). The 2-D tool does not read screen directions; this is the analytic tool's own reading, because its axes are fixed.
- «משולש קהה זווית ABC» («קהה-זווית», «ABC משולש קהה זווית», "obtuse triangle ABC") says one of the three angles is obtuse without saying which: the first figure is obtuse at one vertex, and «הציגו תצורה אחרת» moves the obtuse angle to the others. A later given decides it («זווית BAC = 30», «זווית ABC = 40» leave only C); givens that leave no obtuse angle are refused. «ABC משולש חד זוויות» now reads letters-first too.
- Corpus 7/4 «נתון: S_BDC / S_ODC = 0.8» stays refused: the page prints it so, and with D on BC the triangle BDC has no area. The exam's answer key is the ratio S_BEC / S_ODC = 0.8 (B(6,8)), which the tool builds when typed.
- A point against an axis says which side of it the point is on: «D מתחת לציר x», «A מעל ציר ה-x», «C משמאל לציר ה-y», «B מימין לציר y» ("D is below the x-axis"). Several givens may share one line, joined by «;»: «A משמאל ל-O ו-C מימין ל-O; B על החלק החיובי של ציר y; D מתחת לציר x (ציור)» (a bare «(ציור)» states nothing).

**R166 — a stated length is written where it can be read**
([ADR-AG-223](06c-decisions-analytic.md#adr-ag-223), [#1717](https://github.com/dcodish/geo_builder/issues/1717))

- A length the student stated («AO = 3») is written beside its segment, on the side away from the figure. It is written in the figure's blue. It never overlaps a point's label (with its coordinates), a point, a drawn side or another stated length. It never stands in the row of axis numbers, where it would read as one of them. When the first place is taken, the number moves further out, and to the other side if it must.
- A stated segment that lies on an axis is drawn in the figure's colour over the axis.
- The number keeps one place across «הציגו תצורה אחרת» when the figure itself does not move.

**R167 — two lines of any kind meet at a named point**
([ADR-AG-224](06c-decisions-analytic.md#adr-ag-224), [#1715](https://github.com/dcodish/geo_builder/issues/1715))

- «<line> ו<line> נפגשים בנקודה E» works for any two lines the tool draws: an angle bisector («חוצה זוית B», «חוצה הזווית ABC»), an altitude or median from a vertex («הגובה מ-A», «התיכון מ-B»), a perpendicular bisector («האנך האמצעי לצלע AB»), a drawn perpendicular («האנך מ-C ל-AB»), a tangent at a point, or a named line. It also accepts «נחתכים» / «נפגשות» / «מצטלבים», «ב-E», «ו-», and English "… and … meet at E". Each line is drawn, and E is where they cross. Two bisectors of a triangle meet at its incentre; two altitudes at the orthocentre; two medians at the centroid; two perpendicular bisectors at the circumcentre.
- The same lines work in «E נקודת החיתוך של X עם Y», «X חותך את Y בנקודה E» and «E על X».
- Parallel lines are refused as impossible. The same line written twice is refused. Two named lines that share a letter («הישר AB והישר BC») are refused, because they meet at that point.
- An altitude or median named only by its side («הגובה לצלע BC») is not read in these sentences.
- A perpendicular «האנך מ-P ל-X» is drawn if the figure has none, and is the drawn one otherwise (R141, #1727).

**R168 — what the student stated about a length, an angle, an area or an arc is written on the figure, as in the 2-D tool**
([ADR-AG-225](06c-decisions-analytic.md#adr-ag-225), [#1714](https://github.com/dcodish/geo_builder/issues/1714); operator ruling 2026-10-02: analytic gives 2-D's experience for plane geometry; the canvas shows the inputs, the panel the computed values — ADR-W-047).

- A stated angle draws an arc at its vertex with the value the student gave: «∢ABC = 30» → «30°», «∢ABC = α» → «α». Once the letter is valued («α = 30») the figure shows «30°», as 2-D does.
- A trig given writes the angle it fixes, in degrees: «tan∢BAO = 2» → «63.43°» (never «tan=2»); «cos∢ABC = 0.5» → «60°».
- A stated right angle («זווית ABC ישרה», «∢ABC = 90», «AB ⊥ BC») draws the square knee, never «90°». «משולש ישר-זווית ABC» draws the knee at the vertex the configuration chose, and it moves with «הציגו תצורה אחרת».
- A stated altitude or perpendicular («AD גובה לצלע BC», «AD גובה במשולש ABC», «הגובה מ-A לצלע BC», «D רגל האנך מ-A ל-BC») draws one knee at its FOOT — on the side, or on its extension when the foot falls outside it (#1241, ADR-AG-237). Stating it again, or adding «זווית ADB ישרה», still draws one. A 90° the tool derived (a right angle that comes out of coordinates, Thales' angle, a median) draws none.
- A stated length is written on its segment in the student's own form: «AB = 5» → «5», «AB = 3a» → «3a».
- A stated equality marks both members: «AB = AC» one tick on each, «∢ABC = ∢ACB» one arc on each; a second equality class draws two.
- «שטח המשולש ABC הוא 13» writes «S=13» inside the triangle; «⌢AC = 60°» writes «60°» on the arc, never at the centre.
- Each value sits AT its mark (#1733, ADR-AG-228): an angle's value next to its arc, never farther than 2.5 times the arc's radius from the vertex; an area's inside its shape; an arc's along the arc. A length label moves out of an angle value's way, and no value covers a point's label.
- A shape noun's own definition is not marked («מלבן ABCD» draws no knees, «מעוין ABCD» no ticks), and a value the tool computed is never written on the canvas: it is in the data panel.

**R169 — a value the givens fix up to two choices shows both**
([ADR-AG-226](06c-decisions-analytic.md#adr-ag-226), [#1716](https://github.com/dcodish/geo_builder/issues/1716); operator ruling 2026-10-03: *"if there are 2 options, we always show up to 2 options"*).

- A data-panel row whose value is the same in every configuration shows it, as before.
- A row whose value takes exactly two values across the configurations the givens allow lists both, joined by «או». This applies to every row: a coordinate pair, a parameter, a slope and its angle with the x-axis, a length, and an equation. Example: 9/4 typed as the exam prints it (without the figure note) shows «שיפוע AB: -2 או 2».
- More than two values, or a value that moves continuously, shows «—». A point with four possible positions shows «—».
- A given that settles the choice («A משמאל ל-O …») turns the row back into one value («2»).

**R170 — a trig given is written as its angle and indicates a slope; sin is a choice between two angles**
([ADR-AG-227](06c-decisions-analytic.md#adr-ag-227), [#1719](https://github.com/dcodish/geo_builder/issues/1719); operator ruling 2026-10-03: *"translate it to an angle and write it down"*).

- «tan∢BAO = 2», «cos∢ABC = 0.5», «sin∢ABC = 0.5» are written as the ANGLE they fix: on the canvas at the angle's arc («63.43°», never «tan=2»), and in the data panel under «זוויות» («∢BAO = 63.43°»).
- When one arm of the angle is an axis or a line of known direction, the given also fixes the other arm's slope, shown in the slope row with up to two values (R169). Corpus 9/4 typed as printed gives «-2 או 2»; with its figure note it gives «2».
- «sin∢ABC = 0.5» (also «סינוס הזווית ABC הוא 0.5», "the sine of angle ABC is 0.5") fits two angles, 30° and 150°. The first figure draws one, «הציגו תצורה אחרת» moves to the other, and the panel lists both («30° או 150°») until a given settles it («∢ABC > 90» leaves 150°).
- «sin∢ABC = 1» is the right angle. A sine greater than 1 or less than −1 is refused, naming the line.
- A choice the givens leave open is never changed silently in favour of a better-looking drawing: the drawing shown belongs to the option the configuration took.
