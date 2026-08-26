# 06d — Decision log: the complex-numbers tool (`src-complex/`)

_The complex-numbers track's OWN ADR log (ids `ADR-CX-NNN`), separate from the sibling logs **by
design** — docs/20 §12 rule 3: parallel session streams must not race on one ADR numbering sequence.
Same conventions otherwise: every significant decision gets an entry; the plan of record is
[27-complex-numbers-tool.md](27-complex-numbers-tool.md)._

---

## ADR-CX-001 — Product accepted; planning decisions D1–D5 resolved (2026-08-14)

**Context.** The product was registered in the workspace ([docs/22 §9](22-workflow.md)) with no plan.
An operator planning session produced [docs/27](27-complex-numbers-tool.md) — a corpus reading of
eight 572 exams (2011–2024) plus the formula-sheet contract — which posed five decisions. The
operator resolved all five the same day (issue
[#583](https://github.com/dcodish/geo_builder/issues/583)).

**Decisions (operator, 2026-08-14):**

1. **D1 — exact polar core.** Verification runs over exact values — arguments as rational multiples
   of π, moduli as bounded radicals, numeric fallback for non-nice values. Chosen because the
   corpus's for-all-n and minimal-n asks (4 of 8 exams) are unverifiable by numeric sampling.
   Bounded, **no CAS** — the ADR-3D-002 symbolic-layer discipline transplanted.
2. **D2 — v1 given-forms = the docs/27 §8 grammar.** Cartesian/polar literals with parameter
   coefficients, six operations + conjugate + |·| + integer powers, `zⁿ = w`, the closed locus list,
   quadrant/membership givens, symbolic exponents `kn+c`. Linear systems over ℂ and mixed-modulus
   equations (`|z|i + 2z = √3`) deferred past v1.
3. **D3 — standing product rule: ALWAYS VISUALIZE.** Operator's wording: "the rule should be
   (always) to visualize the problem — whenever possible, we draw the points." No
   plot-after-candidate mode exists; exact-value labels are toggleable. Corollary from the same
   ruling: **wherever possible the student can switch a number's displayed form between polar and
   cartesian** — a display transform only, which must never reach the parser or engine (the
   ADR-448 / ADR-3D-144 display-seam rule applies from day one).
4. **D4 — series in scope.** Sequence/series asks are a recurring part of the corpus questions, so
   v1 plots power cycles and verifies student-claimed sum values (never printing a sum unprompted —
   the reproduce-and-verify charter is unchanged).
5. **D5 — build order: complex before analytic.** "We will leave analytic to the end." The product
   queue is now complex next, analytic (doc 19) last; doc 19's open §6 decision stays parked and
   does not block this track.

**Consequences.** docs/27 is ACCEPTED and gains the C0–C5 corpus-gated build plan (§9); this file
opens the `06d` log; the `complex` GitHub label exists; build slices go the feature/PR route with
per-slice exam gates becoming permanent fixtures. Entry point: C0 (product tree + Gauss plane +
literals + the polar↔cartesian toggle).

---

## ADR-CX-002 — The pedagogy ruling and the capstone exemplar (2026-08-14)

**Status:** Accepted (operator, same session as ADR-CX-001)

**Context.** Debating prototype-now vs define-first, the operator supplied one exam question
(image; transcribed in [docs/27 §2b](27-complex-numbers-tool.md)) with the ruling: *"from a
pedagogy POV, I would like the user to be able to enter the inputs from this question and have the
tool visualize the location of points and calculations."* The question turns out to exercise all
six corpus archetypes at once, ending with five roots of `Z⁵ = Z₁·Z₂³·Z₄` (= Z₂⁵ by construction)
judged against a parallelogram — the plotted constellation *is* the exam's answer (1 on / 1 inside
/ 3 outside).

**Decisions.**

1. **The pedagogical charter, stated by the operator:** the student enters a real exam question's
   givens; the tool visualizes the *locations* of the numbers and the *calculations* (derived
   numbers, measures, root constellations) as geometry. This is the complex edition of the
   reproduce-and-verify charter — the figure, not a printed answer, is what teaches.
2. **The exemplar is the CX capstone gate** (docs/27 §9): after C2–C5 it must reproduce
   end-to-end from typed Hebrew givens, r staying a free DOF throughout, with the expected figure
   pinned in docs/27 §2b (θ = arctan ½ via the area given, the `arg Z₂ < 45°` inequality pruning
   the second branch; perimeter 60r; parallelogram; roots 1 on / 1 inside / 3 outside).
3. **D2 grammar extended** (v1): argument inequalities/ranges as branch-selecting givens ·
   measure claims as expressions in a parameter (`= 15r`, `= 60r`), verified across sampled r ·
   polygon objects over represented points incl. the named origin O, with perimeter/area ·
   quadrilateral-classification claims (reusing the 2-D He lexicon) · sequence-defined numbers
   (geometric-sequence phrasing defines Z₄ = Z₂²/Z₁) · root-vs-region counting claims
   (inside/on/outside a stated polygon).
4. **D1 refined:** the exact-argument representation is **symbolic base + rational multiple of
   π** — the exemplar's pinned θ = arctan ½ is not rational-π, yet the root spacing θ + k·72°
   must stay exact; the numeric fallback carries the base, the offsets stay symbolic. The
   rational-π family alone would have silently failed this whole question family
   (Pythagorean-triple exams), which is why the refinement is recorded now, before C1 exists.

**Consequences.** docs/27 §2b holds the transcription, target utterance shape, gate assertions,
and grammar deltas; C1's exact core is specified as two-layer (symbolic-base arguments, sampled
parameters) from the start; the 2-D quadrilateral vocabulary becomes a deliberate cross-product
*pattern* reuse (copied lexicon, never a code import — the isolation rule stands).

---

## ADR-CX-003 — The input language is a contract of generic sentence FAMILIES (2026-08-14)

**Status:** Accepted (operator directive, same day)

**Context.** Reviewing the §2b exemplar the operator directed: *"make sure we have the language to
support it. Be generic here — not only these specific formats but all families of them."* The
ad-hoc grammar lists (D2 + the ADR-CX-002 deltas) named forms by example; nothing stated the
generalization each example stands for, which is exactly how a parser grows case-by-case patches
(the 2-D tool's original sin, docs/13).

**Decision.** [docs/27 §10](27-complex-numbers-tool.md) is the authoritative grammar contract:
**thirteen sentence families (F1–F13)**, each defined generically (any names, any comparator, any
arity, any parameter expression — not a specific question's phrasing), each carrying at least two
corpus witnesses, each assigned to its build slice. Two cross-cutting principles govern all of
them:

1. **P1 — one form, driveOrCheck decides.** A relation sentence has ONE canonical form; whether it
   pins a DOF (given) or verifies (claim) is the engine's decision. No given/claim phrasing split
   may ever enter the grammar.
2. **P2 — exam typography normalizes at the parse seam.** Unicode subscripts (`Z₁`), superscripts
   (`Z₂³`), `°`, `−`, `·`, `×`, NBSP and bidi controls are display forms; `Z₁Z₂³Z₄` ≡
   `z1*z2^3*z4`. Implemented in the C0 prototype the same day (subscript + implicit-multiplication
   normalization with tests).

Completeness is auditable in both directions (docs/27 §10 coverage check): every corpus statement
maps to a family or a *named* deferral (linear systems over ℂ, mixed-modulus equations); every
family has corpus witnesses — no speculative grammar. A new question that fits no family is a
**family-level** addition to §10 first, never a one-off parser rule — the anti-patch tripwire for
this product.

**Consequences.** Per-slice catalogs are authored from the family table; scenario gates cite
families, not phrasings; the `not-handled` seam (→ LLM fallback) is defined as "outside every
family" rather than "outside the tested strings".

---

## ADR-CX-004 — Implicit typing by the exam's naming convention (2026-08-14)

**Status:** Accepted (operator ruling, same day)

**Context.** Operator: *"z and w are complex numbers — so if I just write z or z2 or z10 or w1 it
should be a complex number without having to specify it."* The bagrut's naming convention is
strong and two-sided: z- and w-family names denote complex numbers, while a, b, d, m, n, p, r, t
denote real parameters — which is exactly why implicit typing must be scoped to the z/w family and
not every identifier (`|z₁| = 9r` must keep r a real parameter, never auto-create a complex r).

**Decision.**

1. **A z/w-family name (`/^[zw]\d*$/`) referenced before definition auto-creates a free complex
   number** — visible in the fact list (badged as implicitly created), draggable, placed by the
   deterministic name-keyed default. The ADR-3D-146 auto-creation idiom: naming an object in a
   statement is enough to bring it into existence.
2. **An explicit definition of that name later UPGRADES the implicit fact in place** — same
   position in the ordered fact list, so facts that already consume the name still evaluate
   (order-dependence bug caught by the test the same day). Explicit-vs-explicit conflicts still
   refuse, naming the conflicting statement.
3. **Non-z/w names stay explicit** and unknown references to them error honestly; they are the
   real-parameter namespace (F1 domains).
4. **Solutions of an equation are referencable named points** (`z^3 = 8` defines z1, z2, z3 for
   later expressions) — pending the F8 set-reference design for the collision case.

Implemented in the C0 prototype with four locking tests; docs/27 §10 F1 updated.

---

## ADR-CX-005 — An equation is ABOUT its letter (2026-08-15)

**Status:** Accepted (operator ruling, during prototype play)

**Context.** The prototype treated `z^3 = w` as "enumerate the cube roots of w, named z1..z3" even
when `z` already existed as a number — leaving z disconnected from z₁..z₃. Operator: a letter z
must be related to its indexed letters; and when the equation involves an existing number "it has
a solvable meaning that should be represented."

**Decision — three modes, decided by whether the letter already exists** (stamped at entry, F8):

1. **Fresh letter → enumerate.** The exam's `פתרו את המשוואה` idiom: the n solutions plot as
   X₁..Xₙ, and the **bare letter is reserved** — a later independent `X = …` refuses (naming the
   equation), and X is never implicit-created as a disconnected free point.
2. **Existing FREE letter → constrain.** driveOrCheck: X snaps to a solution (fixed-point on the
   nearest n-th root, prefix replayed per iteration so a **self-referential** rhs like
   `z³ = w, w = z·z` solves); the candidate set draws display-only; the fact row carries the
   check. "Show another configuration" resamples → X can land on a different solution — branch
   cycling falls out organically.
3. **Existing DETERMINED letter → verify.** The equation is a claim, ✓/✗ (`z1² = −4` after
   `z1 = 2i` verifies; `z1² = 4` refutes).

**Consequences.** Roots-fact identity includes the whole normalized equation (two equations about
one letter are distinct facts; conflicting ones surface as a failed check, never silent). Engine
note recorded from the fix: a projected iterate is *always* an exact root of the previous rhs —
convergence must be judged by step size + a self-consistent final residual, never by residual
against the pre-projection rhs. The real C3 build inherits these semantics.

---

## ADR-CX-006 — The engine is a LOG-POLAR constraint system: an exact linear tier, then a numeric residue (2026-08-15)

**Status:** Accepted (operator plan approval, 2026-08-15) · **Closes the class behind
[#607](https://github.com/dcodish/geo_builder/issues/607)** · **Supersedes** the C0 prototype's
per-fact sweep solver

**Context.** The prototype solves fact by fact: each relation picks a target number and iterates it
toward satisfaction. #607 is where that ends. The operator typed 2023 קיץ מועד ב Q3 — a geometric
sequence over ℂ with `z1^3 = z3`, `-2z1 = conj(z3)`, `z1` in the first quadrant. The system is
satisfiable (`z1 = √2·cis 45°`), but the composed map `z1 ← conj(z1³)/(−2)` has a **repelling
fixpoint**, so every sweep diverges and the acceptance gate honestly refuses a question the exam
expects a student to answer. This is not a missing rule. It is the 2-D `driveOrCheck` class — a greedy
per-constraint carrier claim over a scalar iteration — arriving in the third tree in its first week,
alongside #599 and #600, which are the same class in the target-selection direction.

**Decision.** Every number is represented in **log-polar coordinates** `(u, θ) = (ln|z|, arg z)`, and
the constraint system is split by a structural test on the expression AST.

A constraint is **monomial** when both sides are single terms built only from literals, references,
multiplication, division, integer powers, roots and conjugation — no addition. In log-polar every
monomial constraint is **linear**:

| operation | log-polar | |
|---|---|---|
| `z·w` | `(u_z + u_w, θ_z + θ_w)` | linear |
| `z^n` | `(n·u, n·θ)` | linear |
| n-th root of `z` | `(u/n, θ/n + k/n)` | linear + an **integer unknown k** |
| conjugate of `z` | `(u, −θ)` | linear |
| `\|z\| = k·\|w\|`, `arg z − arg w = 90°`, geometric sequences, quadrant givens | linear equations / inequalities | |

So the multiplicative core of the corpus — which is most of it — is a **linear system over ℚ**, solved
by exact Gaussian elimination, not by iteration. Three properties fall out rather than being built:

1. **Branches are the integer unknowns.** The `k` in each angle equation *is* the exam's
   «מצא את כל האפשרויות». Solving modulo one turn enumerates the configuration set.
2. **Free DOF is the nullspace dimension.** [ADR-052](06-decisions.md#adr-052) conformance becomes
   **structural** instead of audited — the one class on the 2-D scoreboard that never converged,
   because there `rawMovableDof` and the samplable `freeDofs` are two hand-maintained answers to one
   question.
3. **"Which DOF does this constraint drive" is the pivot choice in elimination**, so the six-case
   recruiter ladder [docs/LADDER.md](LADDER.md) stage 3 needs in 2-D has no analogue here.

Everything else — sums, distances, areas, perimeters, series values, cartesian components, non-linear
loci — is the **numeric residue**, solved as residuals over the (usually 0–3 dimensional) free basis
the exact tier leaves, with all 1-D roots enumerated as further branches.

**Verification, run before the decision was taken.** The #607 system, by hand through the rule above:

```
z3 = z1^3            ->  u3 = 3·u1         ;  t3 = 3·t1
-2·z1 = conj(z3)     ->  ln2 + u1 = u3     ;  t1 + 1/2 = -t3 + k      (turns)
=> u1 = ln2/2  =>  |z1| = √2 exactly
=> 4·t1 = k - 1/2  =>  t1 in {315°, 45°, 135°, 225°}
=> the quadrant given prunes to 45°   =>   z1 = √2·cis45°
```

Closed form, zero iterations, and the four candidate configurations are the branch set the
"show another configuration" button already promises.

**The exact carriers** (refining [ADR-CX-002](#adr-cx-002)'s D1, which said *symbolic base + rational
multiple of π* without naming a representation):

- **Modulus** = a rational exponent vector over atoms (primes, and real-parameter symbols). `√2` is
  `{2: 1/2}`; `9r` is `{3: 2, r: 1}`; an n-th root divides every exponent. Radicals are exact and
  closed under the whole multiplicative core, including `2^(1/3)`, which a `p/q·√n` recognizer cannot
  express.
- **Argument** = a rational number of **turns** plus a ℚ-combination of symbolic angle atoms. `45°` is
  `1/8`; the §2b exemplar's `arctan(1/2) + k·72°` keeps an exact offset over a numeric base.

Both were exercised against corpus asks before adoption: `|z4| = 2^4·r = 16r` reproduces the §2b gate,
and 2023 קיץ ב sub-item ג (`z_{4n}` real for all n, `z_{4n−2}` pure imaginary for all n) is decided by
integer arithmetic on turns — a question no amount of float sampling can answer.

**Scope, explicitly.** This is bounded linear algebra over ℚ on two vector spaces. **No CAS** — the
[ADR-3D-002](06b-decisions-3d.md) symbolic-layer discipline. A number that can be zero, or that is
defined additively, has no logarithm: those nodes carry a numeric value only and their constraints
fall to the numeric tier. **A node is exact iff its whole derivation is multiplicative over exact
atoms** — exactness is opportunistic, but the rule for when it holds is structural, not a heuristic.

**Consequences.** The solve ladder is three tiers instead of a stage-3 case ladder, and it is written
down as `docs/LADDER-CX.md` **before** the stages exist rather than after fifteen rungs accumulated
(the docs/23 R6 finding). Each tier is transactional and every accept passes one `stepAccepted`
predicate ([ADR-413](06-decisions.md#adr-413)'s shape). Inequalities are **filters on the branch and
parameter set, never drivers** — the 3-D `Requirement3` rule. `engine/model.ts` is retired
([ADR-CX-008](#adr-cx-008)).

---

## ADR-CX-007 — The grammar contract is re-derived from ELEVEN exams; nine sentence families were missing (2026-08-15)

**Status:** Accepted (operator plan approval, 2026-08-15) · **Extends** [ADR-CX-003](#adr-cx-003) ·
**Plan of record:** [docs/27 §10](27-complex-numbers-tool.md)

**Context.** ADR-CX-003 made the input language a contract of generic sentence families F1–F13, each
carrying at least two corpus witnesses, with the anti-patch rule that *a new question fitting no
family is a family-level addition, never a one-off parser rule*. The contract was authored from
**eight** exams.

The operator supplied the 2026 מיקוד for שאלון 572 (יואל גבע, 2026 edition), which confirms **all 28
exams of the booklet (2020–2025) are in scope, every question** — so Q3 is complex numbers in ~22 real
papers, not eight. Re-reading eleven of them (2020 קיץ א/ב, 2020 חורף, 2021 חורף א, 2021 חורף ב,
2021 קיץ ב, 2022 חורף, 2022 נבצרים, 2023 קיץ א, 2023 מיוחד, 2024 חורף) against the F1–F13 table gives
the measurement that matters: **only two questions map end to end. Nine contain at least one statement
with no family**, and the gaps are not exotic — five of them carry three or four independent witnesses
each. The families were not wrong; the sample was too small to reveal them.

**Decision.** [docs/27 §10](27-complex-numbers-tool.md) gains nine families and names three deferrals,
each with its witness count and its build slice:

| id | family | witnesses |
|---|---|---|
| G1 | polynomial equations over ℂ beyond `X^n = expr` — quadratic/quartic, complex or parametric coefficients, factored form, affine base `(z+c)^n = e`, leading coefficient | 4 |
| G2 | generative point-set asks — complete the polygon, list the vertices, sample a witness on a locus | 4 |
| G3 | intersection as constructor — line∩circle, line∩locus, locus∩circumscribed circle, selected by quadrant / ordinal / exclusion | 3 |
| G4 | transform over a point set — multiply a whole set by `w`, constrain the image, solve for the multiplier | 3 |
| G5 | incidence on a regular n-gon — stated vertices driving the integer `n` | 3 |
| G6 | equation synthesis (inverse-F8) — "write an equation whose solutions are these" | 2 |
| G7 | sums over sets, and of expressions in the terms (`Σ z_k·conj(z_k)`, `Σ over a solution set = 0`) | 2 |
| G8 | real-parameter algebra — sign claims, parameter ratios, measure ratios, symbolic answers | 2 |
| G9 | non-linear loci — a locus in `z^2` (hyperbola), conjugates with a squared modulus | 2 |
| G10–G12 | **deferred, named:** Re/Im extraction into ordered real parameters · symbolic degree (`z^n = 2^n` with `n` unknown, pinned by an area equation in `n`) · locus fitting (inverse-F13) | 1 each |

G1 is satisfied by Durand–Kerner over degree ≤ 4 (all roots at once, ~40 LOC, no CAS), with the exact
recognizer lifting nice roots back into [ADR-CX-006](#adr-cx-006)'s carriers.

**A stated non-goal, recorded rather than chased.** 2021 קיץ מועד ב Q3 is essentially un-visualizable:
a quartic, a factored polynomial in two real parameters, «הוכיחו כי a·b > 0», and answers demanded
«באמצעות a ו-b». Of the eleven questions it is the only one a picture barely helps. The product's
thesis is *the figure answers the question*; this exam is the honest counterexample and is recorded as
a limitation instead of driving a parameter-algebra subsystem nothing else needs.

**Consequences.** Per-slice catalogs are authored from the extended table. The completeness audit runs
in both directions as before — every corpus statement maps to a family or a *named* deferral, every
family carries witnesses — but the corpus is now the booklet, not a sample of it. The un-family'd
statements found in the sweep are the reason the parser is rebuilt rather than extended
([ADR-CX-008](#adr-cx-008)): G1, G2 and G3 change what the equation and object layers must be, and
retrofitting them onto a grammar shaped by `X^n = expr` is the patch route standing rule 1 forbids.

---

## ADR-CX-008 — The foundation is rebuilt behind an engine switch; the prototype's TESTS are what survive (2026-08-15)

**Status:** Accepted (operator ruling, 2026-08-15)

**Context.** The C0 prototype (PR #588) shipped to production on 2026-08-15 and absorbed most of C1–C4
in place. In its first week it reproduced **five** defect classes already diagnosed in the sibling
products — #599/#600 (carrier ownership), #602 (multi-root display honesty), #603 (drag versus
constraint), #606 (acceptance gate), #607 (joint solve). It also lacks capabilities the shared charter
treats as settled: no undo/redo (**FR-HS-2 is a *Must***), no fact enable/disable (the
[ADR-010](06-decisions.md#adr-010) "experiment and see the impact" move — delete-only is destructive
experimentation), no DOF cue (FR-ALT-4), no in-app privacy note (**NFR-SE-3**, in a product the
homepage links publicly), no build stamp, no usage logging, no LLM fallback, no image export, no
catalog panel.

Operator ruling: *"the objective is to have a solid tool and not a patched tool — so if needed, we
throw away, and if something helps, we keep it."*

**Decision.** The engine is replaced, not extended, and the decision is taken per artifact on merit.

**Thrown away:** `engine/model.ts` (978 lines holding the fact model, evaluation, solving and
presentation glyphs at once — its per-fact drives are the #607 ceiling) · `engine/complex.ts`'s
float-only `Cx` · `render/GaussPlane.tsx` (cartesian-only, React-coupled, no scene seam) ·
`styles.css`'s third palette.

**Kept and ported:** the exam-typography normalization and bidi-control stripping in `parser/parse.ts`
— hard-won, tested, and independent of the solver ([ADR-CX-003](#adr-cx-003) P2); it becomes the one
orthography chokepoint. The working Hebrew and English sentence forms are content, re-authored as
catalog specimens.

**Kept as the acceptance corpus:** the ~85 tests in `__tests__/prototype.test.ts`. They encode
operator-validated semantics — [ADR-CX-004](#adr-cx-004) implicit typing, [ADR-CX-005](#adr-cx-005)
an-equation-is-about-its-letter, and the whole §2b capstone — and are the strongest artifact the
prototype produced. They are rewritten to drive the **store's submit path** rather than `derive()`
directly, because a test that calls the engine cannot catch a pipeline that stops calling it.

**Kept unchanged:** the tree, the URL, `complex.html`, the vite config, the save-file format, the store
shape, and the localStorage persistence — which is FR-HS-4, and the one surface where this product is
*ahead* of both siblings.

**Cutover.** v2 grows beside the prototype behind an `?engine=v2` switch, so `main` stays deployable
and both engines are playable side by side; the final PR flips the default and deletes the old engine.
Slices are foundation-first (operator ruling) — value core, solver, replay, parser, then the
visualization layer — so the invisible work lands before the visible work sits on top of it.

**Consequences.** The C0–C5 slice plan in [docs/27 §9](27-complex-numbers-tool.md) is replaced by
S0–S7. The prototype's issues stay closed: they were correctly fixed for the architecture that existed,
and the rebuild is not a claim that those fixes were wrong. #607 is closed by the tier-1 solver rather
than by the joint-Newton follow-up its own body proposed.

---

## ADR-CX-009 — The four deferrals the siblings paid for are built on day one (2026-08-15)

**Status:** Accepted (operator plan approval, 2026-08-15) · **Sibling audit:** this entry IS the audit
— the classes are imported from `src/` and `src3d/` deliberately, per
[ADR-W-004](06w-decisions-workspace.md#adr-w-004)

**Context.** A sweep of the 2-D record (452 ADRs), the 3-D record (157), the four systemic reviews and
the live queue produces one summary: the 2-D foundation was right, and nearly all of its cost came
from four mechanisms that were **correctly identified early and deferred because they were expensive
on an existing tree.** Each is cheap on a young one. They are the reason this planning pass happened at
all, so they are decided before the first commit rather than discovered again.

**Decision — all four ship in the slice that first needs them, and none may be deferred.**

1. **A second mention of a name is a GIVEN, not a redefinition.**
   [ADR-009](06-decisions.md#adr-009) imported compiler semantics (`commandConflict` = redefinition
   error), which docs/23 calls *"the single largest bug class in the project's history"* — ~24 members
   across two products, five sessions each closing one, before M1 retreated from it one object-kind at
   a time. The input language here is **accumulating assertions about one object system**. Existing-name
   lowering lives at **one apply-boundary seam**, never in a parser rule, and rules *ask* a single
   `existingRef()` resolver rather than each deciding. [ADR-CX-005](#adr-cx-005) already states this for
   equations — it becomes the seam, not a habit.
2. **Total span accounting instead of a `dropped*` gate family.** 2-D grew ~18 honesty gates, each added
   after a silent-drop P1, each an enumeration, the family eventually producing defects of its own; 33
   closed bugs sit in that theme. The complete mechanism was named in
   [ADR-250](06-decisions.md#adr-250) and is **still not enforcing**. Here it is the only mechanism:
   every non-filler token span must be **claimed** by the winning parse or the parse refuses and
   escalates. Accounting is a **multiset** ([ADR-429](06-decisions.md#adr-429)) and it **fails closed** —
   an unknown word is content, not filler ([ADR-435](06-decisions.md#adr-435)). **No `dropped*` gate is
   ever added**: reaching for gate #2 means the 18-member path was chosen.
3. **Constraint-to-DOF binding decided once, jointly.** The greedy apply-time pick plus a rescue ladder
   is generator G2, still open in 2-D after two months (#416, #4, #64, #174, #281) and already present
   here as #607/#599/#600. [ADR-CX-006](#adr-cx-006)'s elimination *is* the joint binding. A preference
   ladder survives only as a **tie-break** — docs/13 R7 refuted deleting it, because tier order encodes
   same-residual disambiguation a joint solver cannot recover. Constraints carry a typed
   `strength: required | preference | visual` before the second constraint type exists (2-D's #64).
4. **A lexical layer from rule one.** `parse.ts` spells the point-label fragment **342 times**; the
   Hebrew final-kaf trap fired at least three times *after being recorded as a trap*; and the atoms that
   fix it shipped in 2-D with #361 still open because **nothing consumes them**. Every rule composes
   from `lexicon.ts` atoms, with the ratchet ceiling set at zero inline fragments on the first commit
   and a generative stem x morphology matrix test.

Two further mechanisms cost P1s in 2-D and are free here, so they land with the solver:

- **The obligation-preservation gate** ([ADR-402](06-decisions.md#adr-402)): a rescue may never lose a
  given. Its root cause is worth restating because it is structural — *"dropping a constraint makes the
  remaining system EASIER, so a destructive rescue is MORE likely to pass"*: the machinery was
  **rewarded** for destroying givens, for ~2.5 weeks in production, caught by nothing but the verifier.
- **One storage shape per obligation.** ADR-402 was only possible because a constraint could live either
  in a list or embedded in a solved carrier, and the restore law knew one shape. Every obligation is
  listed in exactly one place.

**Consequences.** These are acceptance criteria on the slices, not aspirations: the import-direction
test, the ratchet, the span accountant and the `strength` field are each part of the slice that
introduces their layer, and a slice that would grow a chokepoint list is mis-scoped (docs/24 §0).
[docs/17](17-design-rules.md) applies to this tree **as-is** rather than as a per-product copy, and the
sibling audit it mandates now spans three trees.

---

## ADR-CX-010 — The ordered LINE list is the source of truth; the ACTIVE engine gatekeeps input (2026-08-16)

**Status:** Accepted · **Closes:** #658 · **Ladder:** stage 0b (`cx0:parse`) — which parser the input
boundary consults · **Slice:** S7's cutover, arriving early

### Context

The C0 prototype's store kept only its own `Fact[]` and reconstructed the student's lines from
`f.src`. Under `?engine=v2` the app then derived the v2 input from those facts. The consequence was
not a cosmetic one: **the retiring parser gatekept the input box.** A line the prototype refused never
became a fact, so it never reached v2 at all — and therefore *every* form the v2 grammar added beyond
the prototype's was unreachable in the running app, however well the engine handled it.

The operator's report was «z1 מדומה טהור» — not recognised in prod. The v2 grammar reads that line
correctly and has since S6 part 1; the prototype cannot read it, and the prototype was asked.

This is the same class [#653](https://github.com/dcodish/geo_builder/issues/653) fixed one layer
higher. There the *canvas* was v2 while the *fact list* was the prototype, and the two contradicted
each other about the same line. Here the *engine* is v2 while the *input path* was still the
prototype. Both are one question answered by two engines; the second was simply invisible, because a
line that never arrives produces no contradiction to notice.

### Decision

**The store owns an ordered `lines: string[]`, and that is the session's source of truth.** The
prototype's fact list becomes one derived consumer of it rather than its origin.

1. **The active engine decides acceptance.** Under `v2`, `addLine` consults `parseLineV2` and nothing
   else — no prototype parse, no fact staging, no acceptance gate borrowed from the retiring engine. A
   line is accepted when the engine that will draw it can read it, and refused with *that* engine's
   reason when it cannot.
2. **The engine switch is read in the store, not in the component.** The stored session is replayed
   through `addLine` at import time, so the engine has to be known before that happens — a v2 session
   rehydrated through the prototype's yes/no would silently lose every v2-only line on reload, which
   is this same defect returning by the back door.
3. **The statement list follows the active engine**, completing #653: under v2 the rows *are* the
   lines, deleted by position, since a v2 row owns no fact id.
4. **`serialize()` emits the lines directly** instead of collapsing consecutive `src` duplicates — the
   saved session is now literally what the student typed.

### Why this is the cutover arriving early, not a patch

[ADR-CX-008](#adr-cx-008) already commits S7 to deleting the prototype input path. Owning the line
list is the first half of that deletion. The alternative — teaching the prototype parser the v2 forms
so it would stop refusing them — would have grown the tree that is scheduled for removal, and would
have had to be done again for every family S4–S6 adds. The seam moves once.

### The test discipline this changes

#658's own diagnosis of why S6 shipped broken: *"The S6 claim tests call `deriveLines` directly and
never cross the store."* That is [#535](https://github.com/dcodish/geo_builder/issues/535)'s lesson in
the 3-D tree — **a solver that works when called and never gets called** — and the S3 commit message
quoted it immediately before this reintroduced it. So the lock is
`src-complex/store/__tests__/submit-path.test.ts`, which drives `useComplexStore.addLine`, the one
entry point the input box uses. **A fix at this seam is not accepted on a test that calls the engine
directly.**

### Also fixed, in the same layer

`2cis(-30)` did not parse. The sign reached `cisOf` as a negation rather than as a number, and a bare
`num` test refused it — in the *expression* grammar, so every rule composed on top inherited the gap
rather than each carrying its own. The angle is now read through `parseUnary`, which makes
`2cis(-30)`, `2cis-30` and `2cis(30)` one form. A symbolic angle (`cis α`) is still refused there
deliberately: that is a free direction and belongs to the relation rules, not to a literal.

---

## ADR-CX-011 — F9: a sequence is stated by TERM POSITIONS, and the geometric case is exact (2026-08-16)

**Status:** Accepted · **Slice:** S4 (grammar) + S2 (solve) · **Ladder:** stage 0b (two rules), stage 1
(geometric), stage 3 (arithmetic) · **Family:** F9 (docs/27 §10)

### The decision in one line

A stated sequence lowers to relations **between term positions**, not between adjacent terms — which
makes «בהתאמה» (term-position givens in any positions) the general case rather than an extra rule.

### Why positions

The corpus does not only give consecutive terms. «Z₁ and Z₂ are the first two terms … and the FIFTH
term is Z₄» is the same sentence family as «Z₁, Z₂, Z₃ is a geometric sequence», and a grammar that
modelled adjacency would need a second mechanism for the first one. So a term carries its position,
and eliminating the ratio `q` from `t_p = t_{p₁}·q^(p − p₁)` gives, for terms at `p₁ < p₂ < pᵢ`:

    (tᵢ / t₁)^(p₂ − p₁)  =  (t₂ / t₁)^(pᵢ − p₁)

This is **monomial for every choice of positions**. No division into cases, and no `q` introduced as an
unknown the student never named — which matters, because an invented unknown would show up in the
free-DOF count and the cue would report a degree of freedom the question does not have.

### Why the geometric case is the exact one, and the arithmetic case is not

A geometric sequence is pure multiplication, and multiplication is linear in log-polar coordinates. So
it lands in tier 1 as ordinary ℚ-linear rows — and the integer turn-unknown those rows carry **is**
the exam's «מנת הסדרה — כל האפשרויות». The alternative ratios are the branch set, cycled by "show
another configuration"; they are not a separate enumeration feature.
([ADR-CX-006](#adr-cx-006) predicted exactly this, and F9 is the family that demonstrates it.)

An arithmetic sequence is addition, which has no closed form in log-polar coordinates. It is stated in
the **same sentence shape** and the engine decides which tier reads it — docs/27 §10's P1 applied to a
family rather than to a single relation. Until the numeric tier lands it is **deferred and listed**,
never dropped and never solved multiplicatively.

### Two terms impose nothing

«z1, z2 סדרה הנדסית» declares both names and emits **no constraint**. Any two numbers are the first two
terms of *some* geometric sequence, so a relation there would invent a given the student never made —
[ADR-052](06-decisions.md#adr-052) in its ordinary form. The names are still drawn: the figure exists,
it is simply not over-determined.

### The final-nun trap fired again — and the atom that exists for it was not being used

The rule matched every fragment of «z1 ו-z2 הם שני האיברים הראשונים…» *except the ordinal*. Cause:
`ORDINALS` spelled «ראשון» with a literal **final** nun. In «ברביע הראשון» the nun genuinely is
word-final, so the literal looked right — but the same ordinal inflects to «הראשונ**י**ם» in F9, where
it is medial.

This is the trap [lexicon.ts](../src-complex/parser/lexicon.ts) opens by warning about, with the `NUN`
atom already sitting three lines above the offending literal, and it is the same class as ADR-3D-035 /
ADR-182 / ADR-294 / ADR-403 / ADR-435 #4. Both ordinal ladders now spell it through the atom.
**Bilingual word order was the other half**: Hebrew orders the opening phrase count → noun → ordinal
and English ordinal → count → noun, so «the first two terms» is carried as ONE atom
(`FIRST_TERMS_PHRASE`) rather than as a word order some rule picks.

### Deliberately not built here, and named

- **Series** — «w + w² + … + w^(4n)» (F9's sums, and G7). Additive *and* symbolically counted; it needs
  the numeric tier and symbolic exponents together.
- **A sequence stated across several lines.** The parser is per-line and stateless, so a sequence must
  be stated in one sentence. Every corpus witness is one sentence, so this costs nothing today — but
  «האיבר החמישי בסדרה הוא z7» as a follow-up line needs sequence identity, which is a model addition
  and not a rule.
- **«מנת הסדרה» as a named value.** Expressible today as `q = z2/z1` (F2), whose alternatives are the
  same branch set. A dedicated noun would need the sequence identity above.

---

## ADR-CX-012 — F6: objects are drawn and claim NOTHING; the origin is a point, not an unknown (2026-08-16)

**Status:** Accepted · **Slice:** S4 (grammar) + S5 (scene) · **Ladder:** stage 0b (four rules),
stage 5c (`buildScene`) · **Family:** F6 (docs/27 §10)

### The decision

A stated object — segment, polygon, circle — **imposes no constraint**. «המרובע OZ₁Z₂Z₃» means *draw
it*, nothing more.

The temptation is to read the noun as a shape assertion: four points named as a quadrilateral in that
order "must" be a simple, convex quadrilateral. That would assert a figure the question never gave
([ADR-052](06-decisions.md#adr-052)) — and the corpus's own printed figures are frequently non-convex,
so the assertion would be *wrong* as often as it was unasked-for. Which configuration is drawn is
what "show another configuration" is for. **A shape becomes a claim in F11** («מקבילית», «מלבן»),
where it is checked and refused when false; that is the family that carries shape semantics, and it is
the only one that may.

### The origin is available everywhere and is an unknown nowhere

`O` may appear in any object without being declared, because it is a point of the plane rather than a
number the student introduced. Critically it is **excluded from `declares`**: adding it to the solver's
name list would create a variable that is neither free nor determined by anything, and it would then
be counted in the nullspace and reported by the DOF cue as a degree of freedom the question does not
have. The free-DOF count is a single published definition ([ADR-CX-006](#adr-cx-006)) and everything
reads it, so polluting it corrupts the cue, the knowledge gates and the sampler at once.

### Glued run versus starred run — a convention, kept deliberately

`z1z2` is a point RUN; `z1*z2` is the product of two numbers. That is unambiguous rather than
arbitrary: the name grammar puts digits last, so `z1z2` cannot be an identifier, while `z1*z2` is
ordinary F2 arithmetic that must keep meaning what it says.

But a run **pasted from an exam** arrives starred — `Z₁Z₂` normalizes to `z1*z2`, because a subscript
run ends a name and the orthography chokepoint inserts the product. So after a shape keyword the
separator is tolerated («הקטע Z₁Z₂» = «הקטע z1z2»), and only a *bare* line requires the glued form.
The keyword is what removes the ambiguity, so it is what earns the tolerance.

### Arity is enforced

«המשולש OZ₁Z₂Z₃» names four points and is **refused**. A noun promising three vertices and receiving
four is a mistyped line, and drawing it anyway would be the figure quietly disagreeing with its own
label — the class where a green ✓ sits over a wrong picture.

Likewise «המעגל החוסם» accepts exactly **three** points. Three points determine a circle; a fourth is a
*cyclic claim* about that vertex (F11 again). Accepting it would let a false statement draw a circle
fitting three of the four vertices and silently ignore the last.

### Resolution happens in replay, not in the scene

Objects are resolved to positions in `foldConstraints`, because that is where the parameter sample
lives: a circle of radius `r` has no drawable size until `r` has a value, and the scene layer must not
be the one that invents it. Two consequences were found by building it:

- **An object can be the only mention of a parameter.** «המעגל שמרכזו O ורדיוסו r» names `r` and no
  constraint does, so sampling only what the *constraints* mention left the circle with no radius and
  it silently did not draw. A stated given producing nothing on the canvas is the drop class; objects
  are now walked for parameters too.
- **The view must fit the circle, not just its centre.** The extent came from the plotted numbers
  alone, so a large radius over small numbers drew a circle running off every edge. For a product whose
  thesis is *the figure answers the question*, correct-and-unreadable is the same as wrong.

An object whose vertex has no position is **dropped whole**, never drawn partially: a triangle missing
a corner is not a triangle, and inventing the corner would be ADR-052 with a straight edge on it.
`known` travels on the object exactly as it does on a point, so an object resting on any sampled
vertex is dashed.

### Bilingual word order, for the third time

«המעגל החוסם» puts the adjective after the noun; «circumscribed circle» puts it before. Same asymmetry
as «ברביע הראשון» / «in the first quadrant» (F5) and «שני האיברים הראשונים» / «the first two terms»
(F9). **Every noun-plus-modifier phrase in this grammar needs both orders spelled**, and that is now
three families deep — it is the rule, not the exception. Both English spellings of «centre»/«center»
are in the atom for the same reason.

### Deliberately not built, and named

- **A circle stated by its diameter**, and «מעגל היחידה» as a named object.
- **Circumscribing a regular n-gon** — needs G5's incidence machinery (S6).
- **The prototype's `shape` facts are NOT bridged.** They are exactly what this grammar replaces;
  translating them would keep the retiring input path alive one slice longer than
  [ADR-CX-008](#adr-cx-008) allows.

---

## ADR-CX-013 — Tier 2 exists: the numeric residue, and F7 measures that drive or check (2026-08-16)

**Status:** Accepted · **Slice:** S3 (the missing half) + S4 (grammar) · **Ladder:** stage 3a/3b/3c/3e
· **Family:** F7 (docs/27 §10), and F9's additive half

### What was missing

[ADR-CX-006](#adr-cx-006) specified two tiers. Only tier 1 existed. Everything non-multiplicative —
distances, perimeters, areas, arithmetic sequences, cartesian component equations — was *listed as
deferred* and then nothing read the list. That was honest as far as it went, but it meant the §2b
capstone («θ pinned by the area given … perimeter 60r») could not be built at all.

### The design

**A constraint contributes exactly three things and the solver never changes**: `refs`, a signed
`residual` that is zero exactly when satisfied, and a `describe` for the refusal
([ADR-CX-009](#adr-cx-009) §3). The minimiser sees numbers only. That is the whole guard against the
2-D tree's six-case recruiter, which grew because every new constraint type could teach the solver a
new trick; here a constraint may only *report*.

- **3a** — residuals over the free basis tier 1 leaves, typically 0–3 dimensions. Iteration is over
  what elimination could not remove, never over the whole figure. That is the difference from the C0
  prototype, which iterated per fact over everything and diverged on #607.
- **3b** — one free dimension is a root-finding problem, and every root is a configuration. «כל
  האפשרויות» over a single DOF falls out here the way branch enumeration does in tier 1.
- **3c** — Levenberg–Marquardt with a numeric Jacobian and deterministic multi-start. LM rather than
  Gauss–Newton because an area is quadratic and a distance is a square root, and Gauss–Newton
  overshoots badly on exactly those. The jitter is deterministic: a solver that finds the answer only
  sometimes is worse than one that never does, because the failure is unreportable.
- **3e** — the honesty backstop. Every relation is re-verified against the FINAL values and reported.

### F7: one sentence form, and the ENGINE decides

«שטח OZ₁Z₂Z₃ הוא 150r²» is a given in one exam and a claim in another. docs/27 §10's P1 says one form
and the engine decides — and here that is not a heuristic, it is arithmetic: **if the figure has a free
degree of freedom the residual can consume, tier 2 drives it; if the figure is determined, the same
residual is evaluated and reported.** There is no second sentence shape for "verify that the area is
150r²", and the parser never has to guess which the student meant.

### Three defects found by building it, each fixed at the root

1. **The free basis was taken over the CONSTRAINT names, not the drawn names.** Tier 1 only sees names
   a constraint mentions, so «z2» declared on its own line was drawn (at an ad-hoc sample) but was
   absent from the vector tier 2 was allowed to move. «אורך z1z2 = 5» with z2 free therefore reported
   *violated* — the one point that could have satisfied it was pinned by omission. **A point free
   enough to draw is free enough to drive.**
2. **A measure can be the only mention of a parameter.** «אורך z1z2 = 15r» names `r` where no
   constraint does, so it was undecidable and silently did not drive. This is literally the same
   omission that left an F6 circle with no radius — one cause, two symptoms, both fixed by sampling
   parameters from every surface that can name one.
3. **The final-letter trap, twice in one session.** «היקף» ends in a final *pe* and was spelled with
   the `KAF` atom, so the word refused itself. The guard test only checked כ/מ/נ — three of the five
   final forms — so it could not see it. **A guard that checks most of a closed set will be wrong about
   the rest**: it now checks all five, and `PE`/`TSADI` atoms exist.

### The DOF cue had to change with it

`freeDof` is tier 1's nullspace dimension — the freedom *before* stage 3. Reporting it afterwards tells
a student the figure can still move in a direction their own given has just pinned. So `drivenDof` is
published alongside it: the **numeric rank of the residual Jacobian at the solution**, computed rather
than tracked so it cannot drift from what the residuals actually did. The cue reports the difference.

### What a tier-2 value is NOT

A value the numeric tier determined is **not** marked as known. `modulusKnown`/`argumentKnown` mean
*carried exactly*, and a floating-point solution is not that, so a driven figure still prints with `≈`.
This is deliberately conservative: it understates rather than overclaims, and the alternative — calling
a converged float "knowledge" — is the failure mode a knowledge panel exists to prevent (S6, #623).

### Known gap, named rather than papered over

**Stage 3d, the obligation-preservation gate, is not built.** With conflicting givens («z2 = 0» and
«אורך z1z2 = 99») the backstop reports both as unsatisfied — nothing vanishes under a green figure,
which is the property that matters most — but the minimiser lands between them and `z2` drifts off its
stated value. The correct behaviour is to refuse the student's NEWEST statement and keep the earlier
figure intact: [ADR-402](06-decisions.md#adr-402)'s lesson, that a solve which drops a given makes the
remaining system *easier* and is therefore **rewarded** for destroying it. LADDER-CX marks 3d and
`cx3:refuse` as pending, and a test pins the current behaviour so the gap is visible rather than
assumed away.

Also not built: symbolic series («w + w² + … + w^(4n)»), which needs symbolic exponents as well as
this tier; and `z = 0` has no log-polar form, so it reaches tier 2 as a deferred equation and is solved
numerically rather than exactly.

---

## ADR-CX-014 — The knowledge panel: a number prints only when the givens force it (2026-08-16)

**Status:** Accepted · **Slice:** S6 (#623) · **Ladder:** stage 5d · **Family:** F7 (the question form)

### The operator's ruling

Values print **only on request, and only when they are knowledge** — invariant across every valid
configuration, with the gauge pinned. The figure shows everything; the panel prints only what was asked
for and only what is known.

### Why this is a predicate and not a heuristic

The natural implementation is to sample a few configurations and print the value if it did not move.
[ADR-421](06-decisions.md#adr-421) is a P1 that came out of exactly that shape: an inference from
sampling variance **inverts silently at N = 1**, because with one sample nothing varies and therefore
everything looks invariant. The rule is not merely imprecise — it is *backwards* in the case the
student hits first, a figure they have only begun to specify.

So `isKnowledge` is structural and is asked once, by everything:

1. **Carried exactly?** Knowledge, whatever else is free. `|z₁| = 9r` is knowledge *expressed in r* —
   the corpus's «הביעו באמצעות r» register — and the exponent vector carries it with nothing sampled.
2. **Otherwise, is the figure closed?** No remaining free DOF, and exactly one valid configuration.
3. **Otherwise not knowledge**, and the panel says *why* rather than printing a number.

Rule 3 is deliberately conservative: it will withhold values that are in fact invariant, such as an
area equal across all four branches. That is the safe direction — a withheld truth costs a hint, an
asserted falsehood costs the answer.

### A question and a statement are the same words minus one

«שטח OZ₁Z₂Z₃» asks; «שטח OZ₁Z₂Z₃ = 150r²» states. That is the whole difference, which is why
`EQUATES_KW` is **required** in the relation rule rather than optional: an optional separator would
silently turn a question into an assertion.

### The defect this uncovered — two definitions of one number

The panel printed a sampled area as knowledge on its first run. Root cause: `freeDof` was published
from `t1.freeDof`, and **tier 1 only ever sees names a constraint mentions**. A number the student
merely declared («z2» on its own line) was genuinely free, invisible to tier 1, and the figure
therefore reported ZERO degrees of freedom — so the knowledge gate, asking that same count, concluded
the figure was closed.

[ADR-CX-006](#adr-cx-006) requires the free-DOF count to be **one definition, read by the cue, the
knowledge gates and the sampler alike**. There were two: tier 1's list, and the larger basis tier 2 was
already optimising over ([ADR-CX-013](#adr-cx-013) found the same gap from the other side, where a
measure could not drive the point it needed). They are now one list, derived from the basis, and real
parameters are in it — `r` unstated is a free magnitude, and a measure in `r` is not a number until
something pins it.

That both a solver bug and an honesty bug came out of the same duplicated quantity is the argument for
the single-definition rule, not an anecdote about it.

### Not done here, and named

The prototype's «בדגימה הנוכחית: {{value}}» string still exists in `i18n/index.ts`. It is unreachable
under `?engine=v2` — the panel that rendered it is not mounted — so the ruling holds for the v2 surface.
It is deleted with the rest of the prototype in S7 rather than edited now, which would grow the
retiring path. **G4–G9, the formula-sheet surfacing and parameter-expression rows for non-modulus
quantities remain open on #623.**

---

## ADR-CX-015 — A plotted number carries a READING, composed once (2026-08-16)

**Status:** Accepted · **Slice:** S5 (#622), before the visualization layer · **Ladder:** stage 5d
· **Fixes:** [#675](https://github.com/dcodish/geo_builder/issues/675)

### The report

«z1 = 3+4i» drew `z₁` on the canvas with **no value beside it** — while the banner one inch above it
printed `z₁ ≈ 5·cis53.1301°`. `z1 = 1+i` worked. The difference is that 45° is a rational multiple of
π and 53.13° is not, so `fromCartesian` carries the second as an opaque angle **atom**, no closed
polar form exists, and `exactLabel` is null.

That the commonest way a student writes a complex number is the one that renders worst made this a
foundation defect rather than a cosmetic one, and it was fixed **before** S5 rather than after: S5
builds an entire visualization layer on this same scene→renderer seam.

### Two defects, one visible

1. **The renderer decided a presentation it had nothing to decide with.** `PolarPlane` did
   `p.exact ? \`${p.label} = ${p.exact}\` : p.label` — a fallback to *nothing*, because a nullable
   field forces the consumer to invent the other case. The banner had a decimal fallback; the canvas
   had none. Two surfaces answering one question from two sources is the [#653](https://github.com/dcodish/geo_builder/issues/653)
   class, and it is also a straight breach of this renderer's own header: *the engine owns what
   exists; this file owns where the ink goes.*
2. **`exactLabel === null` was read as "nothing to say".** It means *no symbolic rendering exists*.
   Both halves of `3+4i` are forced by the given — it is knowledge by every test in
   [ADR-CX-014](#adr-cx-014); only its typography is decimal. The engine was **understating what it
   knew**, which is the honest direction to be wrong in and still wrong.

### The decision

**Stage 5d composes the reading; every surface prints it.** `DerivedPoint.reading: string` is
non-null and non-empty by construction, built beside the value it describes:

| the value | the reading |
|---|---|
| carried in closed form | `z₁ = √2·cis45°` — `=` is reserved for a forced value the exact core can write |
| forced, no closed form | `z₁ ≈ 5·cis53.1301°` — `≈` says the typography is decimal, not that the value is loose |
| a sampled half | `z₁ ≈ ~2.5·cis~63°` — `~` marks the coordinate the student did **not** state (ADR-052) |

There is deliberately **no fourth case in which a point carries only its name.** `ScenePoint.exact:
string | null` became `reading: string` for the same reason: a nullable field is an invitation to a
second rule downstream.

`v2Labels` now *reads* that field instead of re-deriving it from the same inputs. That is the half of
the fix that prevents recurrence — patching `PolarPlane` with its own fallback would have left two
independent label rules in the tree and returned this issue in a different costume.

### A second copy found in passing

Three implementations of `prettyName` existed (the prototype's, the scene's, and a local one in the
v2 adapter), and they had already drifted: the adapter's subscripted only the **first** trailing
digit, so `z10` printed `z₁0`. Since the reading now carries the name, one definition is forced —
`model/naming.ts`, imported by both. A display rule with two implementations is the same class as a
value with two definitions ([ADR-CX-014](#adr-cx-014)); it is only cheaper when it is found early.

### The lock

A canvas-reading test over the cartesian corpus (`3+4i`, `1+i`, `2cis150`, `5`, `2cis(-30)`, `-3i`)
asserts every plotted point carries a reading that is not the bare name — and, the assertion that
actually matters, that the canvas reading and the banner reading are the **same string** for the same
point. The first assertion catches this bug; the second catches its whole class.

---

## ADR-CX-016 — The visualization layer: series, rotation, cycles, regions (2026-08-16)

**Status:** Accepted · **Slice:** S5 ([#622](https://github.com/dcodish/geo_builder/issues/622))
· **Ladder:** stage 5c · **Families:** F9 (the shape of a sequence), F2 (product as rotation), F12 (the
counting picture)

### What this slice is for

The operator's headline requirement, from the first conversation about this product: *"I want the
visualization part to be strong. I want students to see the polar coordinates… and see how a series
behaves."* The polar substrate landed with S3; this is the rest — the pictures that make the topic's
four moves visible instead of algebraic.

| picture | what it makes visible | corpus witness |
|---|---|---|
| **TermSpiral** | a geometric sequence is a **logarithmic spiral**; `\|q\| = 1` closes it into a **circle**, `arg q = 0` collapses it to a **ray**, an arithmetic sequence is a **straight line** | §2b ג, 2024 חורף, 2015 |
| **SumChain** | partial sums head to tail: convergence is a point the chain crawls into, and «the terms sum to zero» is a **closed polygon** | 2015 ב, 2024 ד, G7 |
| **RotationArc** | `w = z·u` is a **turn by arg u and a stretch by \|u\|** — De Moivre, one step at a time | 2020, 2023, F2 |
| **ValueCycle** | `wⁿ` visits a **finite ring of directions** and starts again; the period is the answer to «z^(6n) takes only two values» | 2013, 2015, 2022, 2023 |
| **Region** | every plotted number placed **inside / on / outside** a stated polygon — the §2b ד count, as a picture | §2b ד |

### Three decisions inside it

**1 — the statement travels beside its constraints.** A sequence lowers to `(t₃/t₁)² = (t₂/t₁)³`, which
is the same relation with the *sequence dissolved out of it*: nothing downstream could tell those three
numbers from three unrelated ones, so no spiral could be drawn from the fold's output. `ParsedLine`
therefore carries `sequences` as **statements** as well as the constraints they imply. The statement
asserts nothing extra — the constraints remain the whole of what the sentence claims — it is what the
scene draws.

**2 — the spiral takes the SHORT way round, and says which terms are stated.** Between two terms Δ
positions apart the true path may wind any number of extra turns, and which one is right depends on
intermediate terms the student never named. The minimal winding is the only choice that adds no
information. For the same reason the per-position step `q` is published **only between adjacent stated
terms**: with a gap it is a Δ-th root with Δ values, and choosing one would put an intermediate term on
the screen that the givens do not force ([ADR-052](06-decisions.md#adr-052)). The chain sums the
**stated terms only**, and the infinite-sum limit point appears only when they run consecutively from
the first — otherwise `t₁/(1−q)` would not be the sum of the sequence the student stated.

**3 — a cycle is DECIDED, never measured.** `cyclePeriod` is non-null only when the modulus is exactly
1 **and** the argument is a rational part of a turn, both asked of the exact carriers
([ADR-CX-006](#adr-cx-006) D1) — `period` is the reduced denominator of the turns. A float would answer
this question wrong with complete confidence: a sampled 59.9999° looks like 60° and has no period at
all. This is the same line ADR-CX-013 drew for tier-2 values, applied to a picture rather than a label.

### The display seam, asserted rather than promised

The `n` stepper is **component state**: not in the store, not in the save file, not in undo, and it
reaches the scene as an argument. The polar/cartesian toggle already sat outside the parse path; what
was missing was the proof. The gate now runs **every catalog specimen, in both languages, through the
real store under both views** and requires the accepted lines and the derived figure to be identical
strings — the ADR-448 / ADR-3D-144 seam rule, checked over the whole surface rather than an example,
because both sibling products state this rule and both have broken it once.

`buildScene` grew its inputs at the same time, and took a named `SceneInput` + `SceneDisplay` rather
than more positional parameters — the same move `foldConstraints` needed this slice (eleven positional
arguments, one transposition away from a figure quietly about something else).

### Deliberately not built, and named

- **`Locus`** — the primitive is in the S5 scope list, but **F13 has no grammar yet**: nothing in the
  parser produces a locus, so a locus primitive would have no witness to render and no test that could
  fail. It lands with the family, not before it. (docs/27 §10 F13, slice C4/S4 in the original plan.)
- **A count CLAIM over a region** (F12, «כמה … בתוך / על / מחוץ»). The region layer draws where the
  numbers are and counts them; asserting that count is a *claim*, checked at stage 4, and the claim
  grammar for it is S6/#623 work. The picture is what this slice owes.
- **Symbolic series** («w + w² + … + w^(4n)») still needs symbolic exponents, as
  [ADR-CX-013](#adr-cx-013) recorded. `ValueCycle` draws the *cycle* a symbolic power walks; the sum
  over it is not yet expressible.
- **The shell adoption** — struck from this slice by operator ruling on 2026-08-16 (issue #622 comment):
  `AppFrame`, the product switcher, fact enable/disable, the DOF cue, undo/redo, image export, the build
  stamp and the privacy note are built once in `shell/` by the unification programme
  ([ADR-W-018](06w-decisions-workspace.md)), for all four builders, rather than a third private copy
  here. Complex therefore finishes the foundation rebuild with known parity gaps — **no undo/redo,
  delete-only facts** — and that is a scheduling decision, not a decision to leave them unbuilt.

---

## ADR-CX-017 — Knowledge in a UNIT, the formula sheet, and claims about every n (2026-08-16)

**Status:** Accepted · **Slice:** S6 ([#623](https://github.com/dcodish/geo_builder/issues/623))
· **Ladder:** stages 4a and 5d · **Families:** F7 (the parameter register), F12 (quantified claims)

### 1. «הביעו באמצעות r» — a free parameter can be a UNIT rather than an unknown

The corpus asks constantly for a measure *expressed in a parameter*: «הביעו באמצעות r את אורך הקטע
Z₁Z₂» (docs/27 §2b א, answer `15r`), «הביעו באמצעות r את היקף המרובע» (`60r`). The knowledge gate
([ADR-CX-014](#adr-cx-014)) had to refuse every one of them: the figure genuinely has a free degree of
freedom, so no NUMBER is knowledge. And yet `15r` **is** knowledge, exactly, and it is the answer the
exam wants.

The resolution is that `r` is not an unknown of the figure — it is its **unit**. If scaling every
magnitude and `r` together produces another configuration that satisfies every relation, the givens
describe a one-parameter family of *similar* figures, and a length in that family is `c·r` for a single
c: a fact about all of them at once.

So the predicate is: **the remaining freedom is exactly the symmetry group.** Two transformations are
tried and each is *checked against every live residual*, not assumed —

| symmetry | what it does | what a measure must do under it |
|---|---|---|
| **scale** | every magnitude and every free parameter ×λ | multiply by `λ^degree` (1 for a length or perimeter, 2 for an area) |
| **turn** | every free direction +37° | not change at all |

— and the value prints only when the number of *verified* symmetries equals the remaining DOF count,
so nothing is left that could move the shape. A figure that pins an absolute size somewhere («z1 = 3»
beside a free `r`) fails both checks and prints nothing, which is correct: there `r` really is an
unknown. A figure free only up to **rotation**, with no parameter at all, now prints the plain number —
the same discovery, in the case where the unit is 1.

This is deliberately not the shape [ADR-421](06-decisions.md#adr-421) forbids. Nothing is inferred from
sampling variance: the transformed states are *evaluated* against the constraint system, and the
homogeneity of the measure is *required* rather than observed. It inherits ADR-CX-014's conservative
direction unchanged — every check that fails withholds the value.

### 2. The formula sheet, byte-matched

[docs/29](29-complex-formula-reference.md) transcribes the three formulas the official 5-unit sheet
carries for this topic — polar multiplication, De Moivre, the n-th roots — and
`src-complex/formulas/table.ts` carries the same three strings, matched **in both directions** by an
integrity test: nothing in the table the sheet does not say, and nothing in the document the table does
not carry. (docs/28 was taken by the unification programme between the issue being written and the work
being done; the reference is docs/**29**.)

The two-way check is the point. A one-way check lets the table quietly grow a fourth formula — the
conjugate, division and `|z|` are the three most tempting, and none of them is on the sheet — which
would be the app teaching, as *"the formula sheet says"*, something the sheet does not say. That is the
same class of dishonesty as printing a sampled value as knowledge.

**Surfacing is structural, never a keyword match**: a formula appears because the figure *does the
operation* — a product surfaces CX-F1, an integer power surfaces CX-F2, and an equation `Xⁿ = c` that
produced more than one configuration surfaces CX-F3, because the `k` in that formula is exactly what
"show another configuration" walks. Every surfaced row names the student's own lines that triggered it,
which is what "premise highlighting" reads.

### 3. F12 — «לכל n טבעי» and «ה-n המינימלי», decided by congruence

Four of the eleven re-read exams ask a minimal-n question and three ask a for-all-n one. Neither is a
property any finite set of drawings has, which is the whole reason [ADR-CX-006](#adr-cx-006) D1 chose
exact turns over floats — and the machinery was already in the value layer (`smallestPower`, `period`)
waiting for a grammar.

- «לכל n טבעי, w^(4n) ממשי» → `w^m` is real iff `2m·θ ≡ 0 (mod 1)`; substituting `m = kn + c` and
  requiring it for every n splits into two integer conditions (`2kθ ≡ 0`, `2cθ ≡ target`). No search.
- «ה-n המינימלי שעבורו wⁿ מדומה טהור הוא 5» → the least solution of `n·2θ ≡ ½`. A stated n that *works*
  but is not least is refuted **with the least one named**, because that is the question that was asked.
- An argument with no closed form (`3+4i`, whose 53.13° is not a rational part of a turn) is `unknown`,
  never refuted — refusing a true claim tells a student their correct answer is wrong, and that is the
  one direction of this error that costs something.

There is deliberately **no question form** for the minimal n. «Find the minimal n» is what the exam asks
the *student*; a tool that printed it unprompted would be answering the question rather than checking
the answer, which is the charter line every sibling holds.

### What S6 still owes, named rather than implied

- **Families G4–G9** (transform over a point set, incidence on a regular n-gon, equation synthesis, sums
  over a set, real-parameter algebra, non-linear loci). Each needs grammar *and* engine work of its own
  — they are a slice apiece, not a finishing touch — and none is built. Filed as follow-up work rather
  than left implicit in this slice's issue.
- **The compound half of the 2023 קיץ א ד gate**: «the minimal n such that wⁿ is pure imaginary AND
  lies outside the circumscribed circle» is a conjunction of a congruence with a region test. The
  congruence half is built and exact; the conjunction is not.
- **A region COUNT claim** (F12's third clause, «כמה … בתוך / על / מחוץ»). S5 draws the counting picture
  ([ADR-CX-016](#adr-cx-016)); asserting the count is a stage-4 claim and is not built.

---

## ADR-CX-018 — G7 sums, G8 ratios, and the equation that was dropped in silence (2026-08-16)

**Status:** Accepted · **Slice:** S6 ([#623](https://github.com/dcodish/geo_builder/issues/623))
· **Ladder:** stages 3a and 5d · **Families:** G7, G8 (docs/27 §10b)

### The defect this uncovered, which matters more than the families

«z1 + z2 = 5+2i» **did nothing at all**: no drive, no refusal, no row. Two causes, both at the root:

1. **An exact carrier with no symbolic form was read as having no value.** `5+2i` has an argument that
   is not a rational part of a turn, so the value layer carries its direction as an opaque *atom*;
   `evaluate()` cannot resolve an atom without the sample map, and the residual builder never had one.
   This is [#675](https://github.com/dcodish/geo_builder/issues/675)'s root cause in a second place —
   *no closed form* misread as *no value* — and it is fixed the same way: the residual `Env` carries the
   atom sample, which the fold already had.
2. **An unevaluable relation was excluded from the live system and then never mentioned.** The comment
   above the filter said `undecided` was "a distinct answer from unsatisfied, and reported as one" —
   and nothing reported it. `Derived2.undecided` now carries them and the banner prints them.

The second is the graver of the two. A given that produces *nothing* is the silent-drop class this
tree's charter names first: *nothing stated is ever silently dropped*. It was invisible because the
figure still looked finished.

### G7 — sums over a set

`z₁·z̄₁ + z₂·z̄₂ + … = 30` (2024 חורף) and «סכום המספרים הוא אפס» (2021 חורף א) need no new machinery
once the above is fixed: an additive equation is a deferred constraint, its residual is the two real
equations it implies, and docs/27 §10's P1 does the rest — the same sentence **drives** a free term and
**checks** a determined figure, with a false sum reported by the stage-3e backstop.

### G8 — a ratio is knowable where neither half is

«מצאו את היחס בין השטחים» is answerable for a figure with a free unit, because the unit divides out —
which is why 2021 קיץ ב can demand every answer «באמצעות a ו-b» and still have determinate ratios.

`RatioQuery` is its own form rather than two queries, because the *knowability* differs: a length is
`15r` only when the figure has a unit, while a ratio of two lengths is a plain number whatever the unit
is. The test is [ADR-CX-017](#adr-cx-017)'s symmetry check applied to the quotient — the value must be
unchanged under every verified symmetry — so it passes exactly where the ratio really is invariant.

### Still not built, and named

**G4** (transform over a point set), **G5** (incidence on a regular n-gon) and **G6** (equation
synthesis) all need the same missing substrate: a **solution SET as a first-class object**. Today
`z³ = 8` is one point per configuration and the branch button walks the three; those three families need
all n solutions present at once, which is [ADR-CX-005](#adr-cx-005)'s «X reserves the bare letter and is
related to X₁..Xₙ» half, not yet implemented. **G9** (non-linear loci) needs the F13 locus layer, which
also does not exist. Each is a slice; none is a finishing touch.

---

## ADR-CX-019 — The cutover gate, measured: eight capabilities rebuilt, one blocker named (2026-08-17)

**Status:** Accepted · **Slice:** S7 ([#624](https://github.com/dcodish/geo_builder/issues/624))
· **Ladder:** stage 0b · **Families:** F1, F2, F4 (the inequality half), F7

### The gate, and why it had to be measured rather than argued

[ADR-CX-008](#adr-cx-008)'s cutover deletes `engine/model.ts` and `engine/complex.ts`. The operator's
condition on it is exact: *"if v2 cannot cover something the prototype covers, STOP and report it
rather than deleting the capability."* A claim that v2 is ready would be worth nothing without a
measurement, so every form the prototype's own 76-test suite exercises was run through **both**
grammars and the difference printed.

That measurement is now a test (`cutover-parity.test.ts`), not a document: a form the prototype reads
and v2 does not **fails the suite**. It found nine gaps.

### Eight were grammar, and are built

| gap | what it is now |
|---|---|
| «z1 מספר מרוכב» | F1 spelled out — and the only way to declare a name *outside* the z/w convention complex at all |
| «הצמוד של z1», «ההופכי של z1» | word-spelled operators, rewritten to `conj(…)` / `1/(…)` at the orthography chokepoint, beside the combining overline |
| «החלק הממשי של z1» | the same treatment for the projections |
| `z1 = 2cis(θ)` | the Greek letters the palette inserts are normalized to their Latin spellings — two spellings of one parameter were two different parameters |
| `z1 = 2cis(theta)` | F2's generic polar form: it states the **magnitude** and leaves the direction free, rather than refusing the line |
| `arg z2 < 45`, `90 < arg z1 < 180` | **F4's inequality half** — the engine has carried `BranchFilter.range` since S2 and the sampler has honoured its window since S3; only the sentence was missing, so the §2b capstone's own branch selector could not be typed |
| `re(z1)`, `im(z1)` | real projections, lowered to `(z ± z̄)/…` so every consumer keeps reading the same six operations |
| `\|z1-z2\|`, `im(z1)`, `z1*z2` on their own line | a bare expression is a **question**, answered by the knowledge rule |

### Two defects the measurement uncovered

1. **`im(z1)` was a product.** The tokenizer read `im` as a NAME, so a stated projection silently
   became a product with an invented real parameter — the same defect the `TOKEN` comment already
   records for `2cis150`, in a second place. A mis-parse is worse than a refusal: the refusal says so.
2. **A last-resort rule can undo an honest refusal.** The first bare-expression rule read
   «triangle Oz1z2z3» — a shape noun with the wrong vertex count, which the shape rule refuses **on
   purpose** — as the implicit product `triangle · O · z1 · z2 · z3`. The arity guard exists to stop a
   green ✓ sitting over a wrong picture, and a catch-all rule that rescues every refused sentence is
   the worst thing a catch-all can be. It now requires the line to be written the way maths is written,
   with no space between operands, and the guard test that caught it stays.

The bare-expression answer is also where the prototype's **calculation panel** lands, rebuilt on the
honesty contract: that panel printed the current sample and called it an answer, and this one prints
`15r` for «|z1-z2|» over the §2b givens, a number over a determined figure, and *why not* otherwise.
The degree is **measured** under the scale symmetry rather than declared, so `r` versus `r²` is
arithmetic rather than a table of quantity kinds.

### The ninth gap is not grammar, and it BLOCKS the cutover

**A solution set is not referencable in v2.** The prototype's «z³ = 8» names z₁, z₂, z₃ — three points
a later line can talk about — while v2 draws one point and walks the three as *configurations*. Three
prototype tests depend on it (referencable solution names, name reservation, and the anonymous set of
the §2b part ד), and [ADR-CX-005](#adr-cx-005) specifies the v2 behaviour that would replace it and
which is not implemented.

Under the operator's own condition this **stops the cutover**: deleting the prototype today deletes a
capability rather than replacing it. It is [#680](https://github.com/dcodish/geo_builder/issues/680),
it carries a design question that needs a ruling (what branch cycling cycles once all n roots are drawn
at once), and **#616 cannot close until it is built.** Everything else S7 asks for — the fixture net,
the corpus fixtures, the test rewrite onto the store's submit path — is unblocked and remains to do.

---

## ADR-CX-020 — Nothing to cycle: the button reads one published answer (2026-08-17)

**Status:** Accepted · **Slice:** S5/S7 seam · **Ladder:** stage 5b · **Operator ruling:** 2026-08-17,
answering [#680](https://github.com/dcodish/geo_builder/issues/680)'s design question

### The ruling

Asked what "show another configuration" should cycle once an equation's solutions are all drawn at
once rather than walked one at a time, the operator answered: **«if there are no dofs left, the button
can be disabled»**.

That settles more than the question asked. It says the button's meaning is not "walk the branch index"
but **"is there another drawing to show?"** — which is one question with one answer, whatever produces
the alternatives.

### What it decides

- **Today**: a figure with exactly one configuration and no remaining freedom disables the button. It
  could not change the picture, and a control that visibly does nothing tells a student their figure
  might be wrong when it is simply *determined*.
- **For #680**: materialising `z³ = 8` as three named points z₁, z₂, z₃ in ONE configuration is now
  unblocked. The three solutions stop being three configurations, and the button — reading the same
  published answer — switches itself off for that figure, because there is genuinely nothing else to
  show. No separate rule is needed for the roots case.

`Derived2.canCycle` is published rather than recomputed in the component, for the reason every count in
this engine is ([ADR-CX-006](#adr-cx-006)): the DOF cue, the knowledge gates and this button must not
be able to disagree about how free the figure is. It is `configCount > 1 || remainingDof > 0`, and
`remainingDof` is the same tier-1-minus-tier-2 number [ADR-CX-013](#adr-cx-013) made honest.

### What it does NOT decide

The rest of #680 — the enumeration itself, the reserved bare letter, the anonymous set of §2b part ד —
is still to build, and remains the reason [#616](https://github.com/dcodish/geo_builder/issues/616)
cannot close ([ADR-CX-019](#adr-cx-019)).

---

## ADR-CX-021 — A solution set is one configuration of n points, and «solve» is told from «relate» by the earlier lines (2026-08-17)

**Status:** Accepted · **Issue:** [#680](https://github.com/dcodish/geo_builder/issues/680) ·
**Stage:** LADDER-CX 1b (lowering) and 1c (exact argument solve) · **Supersedes nothing; refines**
[ADR-CX-005](#adr-cx-005)

**Context.** [ADR-CX-019](#adr-cx-019) measured the cutover gate and found nine capabilities the
prototype reads and v2 did not. Eight were grammar. The ninth was structural: the prototype's
`z³ = 8` names **z₁, z₂, z₃** — three points a later line can refer to — while v2 lowered the same
equation to one unknown and walked the three roots as *configurations*. Deleting `engine/model.ts`
with that gap open would have deleted a capability rather than replaced it, which is what S7's own
gate forbids. This is the ninth gap closed.

### Decision 1 — the n solutions are ONE configuration containing n points

Lowering a fresh enumerating equation emits the solutions as *related* unknowns rather than as n
independent ones: X₁ solves the equation itself, and every later solution is pinned to X₁ — same
modulus, exactly `k/n` of a turn further round. The constellation is therefore exact even when the
right-hand side is not yet known, and it needs no closed form for the roots.

X₁'s argument row is marked **`principal`** and drops its integer turn unknown, which is the one place
this engine ever refuses a branch. The justification is that it is not a branch: *which* solution is
called X₁ is a labelling convention (argument order from the principal root, the same order the
prototype's `nthRoots` used), and left un-pinned the n rotations of one point set would enumerate as n
indistinguishable configurations. `configCount` is then 1 and the cycle button switches itself off,
which is [ADR-CX-020](#adr-cx-020) arriving exactly as it predicted, with no rule special to roots.

Ordinary equations keep their turn unknown, so #607's genuinely multi-configuration family is
untouched — verified, not asserted, by that session's tests still reading `configCount === 4`.

### Decision 2 — the mode is ASKED, never stamped

ADR-CX-005's three modes were stamped onto the fact by the store. Only by the store — so every other
producer (the v2 parser's own path, a fixture from disk, a hand-built fact in a test) silently got the
*fresh* reading, and `z1^3 = 8` enumerated into `z11, z12, z13`. A default that is wrong whenever the
caller forgets is the seam [ADR-CX-009](#adr-cx-009) exists to remove.

`rootsMode(varName, n, mentioned, grounded)` in `model/naming.ts` is now the single question. The store
still stamps — the retiring prototype's `factNames` reads the stamp — but it stamps *by asking*, so the
mode the store reserves names for and the mode the figure is built from cannot drift apart.

### Decision 3 — «solve this» is told from «relate these» by what earlier lines mentioned

Not by whether the right-hand side is closed. That was the first attempt and the corpus refuted it:
§2b part ד is `z⁵ = z₁z₂³z₄`, an enumeration with three unknowns on the right.

An equation enumerates when its letter is new **and every name on its right was mentioned by an earlier
line**. `z³ = 8` and part ד both qualify. `z₁³ = z₃` typed cold does not — z₃ is brought into being by
that very statement, and a number cannot ground the statement that invented it; its several solutions
are the exam's «כל האפשרויות», the configurations #607 exists to cycle.

**Mentioned, not defined.** «|z₁| = 9r» introduces z₁ through a relation, and the student who wrote it
has plainly stated z₁ — reading only definitions would have broken the §2b exemplar, whose numbers all
enter through relations.

The honesty argument is the one that settles it: reading `z₁³ = z₃` as an enumeration prints
`z₁₁, z₁₂, z₁₃`, and a doubled subscript is a *different number* in exam notation.

### Decision 4 — an anonymous solution has no name, and the one place that writes names enforces it

When the indexed names are already the student's, the set is drawn anonymously (ADR-CX-005's existing
ruling). Those ids live in a `#s…` namespace — uncollidable for the same reason tier 1's `#k` is — and
`prettyName` returns the empty string for them, so ADR-447's rule that an internal id never reaches a
rendered string is enforced where names become text rather than at each surface (the #653 class).

### Consequences

- **G4, G5 and G6 are unblocked** — all three needed the solution set as an object
  ([#623](https://github.com/dcodish/geo_builder/issues/623)).
- The cutover's remaining work is no longer blocked on capability, only on the fixture net, the
  prototype's 76 tests moving onto the store's submit path, and the deletion itself (#624).
- `Constraint.principal` is the first row-level flag in tier 1. It is deliberately narrow: set by one
  lowering, meaningless elsewhere, and inert for every other constraint.

---

## ADR-CX-022 — The fact vocabulary outlives the evaluator: `engine/` splits before it is deleted (2026-08-17)

**Status:** accepted · **Slice:** S7 ([#624](https://github.com/dcodish/geo_builder/issues/624)) ·
**Ladder stage:** none — it relocates what stages 0a–0b *produce* and removes a stage-5 duplicate; no
step, token or refusal changes. Verified by the suite being unchanged: 577 green in `src-complex/`
before and after, the 76 prototype tests and [ADR-CX-019](#adr-cx-019)'s 38-test parity gate included.

**Context.** ADR-CX-008's cutover plan reads *"delete `engine/model.ts` and `engine/complex.ts`"*, and
that turned out to be two different deletions wearing one filename. Fourteen files imported from
`engine/`; measured, most of them wanted the **fact vocabulary** and none of them wanted the evaluator.

The vocabulary cannot go with the evaluator, for a reason the cutover gate itself creates:
`parser/parse.ts` **survives** the deletion. It is ADR-CX-019's parity oracle — the test that fails if
v2 stops reading a form the prototype reads — and a parser cannot outlive the facts it produces.

**Decision.** Split `engine/` along that line before deleting half of it.

- **`model/fact.ts`** (new) — `Fact`, `Expr`, `ArgTerm`, `Cmp`, `RelSpec`, `factId`, `collectRefs`,
  `factNames`, `factRefs`, `IMPLICIT_COMPLEX_RE`, `isScalarExpr`, `paramValue`, `defaultFree`. What a
  statement *is*, with nothing that evaluates one.
- **`value/value.ts`** — `fmtNum`, the panel's three-decimal number formatter. `Cx` and `cx` were
  **already here**, structurally identical to the prototype's, so the duplicates were deleted rather
  than moved; `cisDeg(r, deg)` was likewise already here as `cPolar`, and the 15 call sites were
  repointed rather than an alias kept.
- **`engine/`** keeps only `derive`/`deriveScene`, the prototype `Scene`, and the doubles-only
  operators the sweeps use — i.e. exactly what #624 deletes.

Two `Expr` types now sit in `model/`, and they stay separate. `expr.ts`'s is v2's, whose defining
question is whether a node is monomial; `fact.ts`'s is the prototype grammar's, carrying IEEE doubles.
Merging them would push the prototype's precision boundary into the layer built not to have one
([ADR-CX-006](#adr-cx-006)).

`engine/model.ts:463`'s `prettyName` was a **fourth** copy of a rule `model/naming.ts` exists to hold
alone — the #653 class, and the one its own header was written about. Deleted, callers repointed. The
remaining `prettyExpr` is a different question (a whole expression string, not a name) and stays.

**What this cost the layer guard.** `engine` now imports downward from `value` and `model` while four
layers still import `engine` — recorded as the two allowances in `__tests__/import-direction.test.ts`,
which go with the directory. Every remaining edge *into* `engine` is one the cutover deletes outright:
`derive` (the store's acceptance gate), `deriveScene` (`App.tsx:130`), the prototype `Scene` (the Gauss
plane and `scene2`'s adapter).

**Two measurements this exposed, both reported to #624 rather than acted on here:**

1. **Under `?engine=v2` there is no acceptance gate at all.** ADR-CX-019's plan describes the store's
   ADR-276 gate as *"not behind the engine switch"*; #658 in fact made `addLine` return early for v2
   before ever reaching it. So a v2 session today cannot produce `incompatible` or `duplicate-name` —
   the next step is not a like-for-like port but restoring a doctrine v2 never had, which is why its
   corpus before/after matters more than the plan assumed, not less.
2. **`bridgeFacts` and `derive2(facts)` have no production caller** — `deriveLines` → `parseLineV2` →
   `foldConstraints` is the app path, and the S3 bridge survives only in `derive2.test.ts`. The guard's
   own comment predicted its deletion *"when S4 lands"*; S4 has landed.

**Consequences.** The cutover's deletion step shrinks to genuinely dead code. Also the prerequisite
[#673](https://github.com/dcodish/geo_builder/issues/673) needs before a `shell/` tree can exist: a
vocabulary in a layer, not in a monolith about to be removed.

---

## ADR-CX-023 — The acceptance gate comes up a layer, and v2 gets one at all (2026-08-17)

**Status:** accepted · **Slice:** S7 ([#624](https://github.com/dcodish/geo_builder/issues/624)) ·
**Ladder stage:** **0e — the dry run.** Stage 0e is *"dry-run on a trial fact list; keep-prior on
failure"*, and this is that stage for the v2 line list. It sits above stage 1's own refusal because the
two answer different questions: stage 1 says *these givens cannot all hold*, stage 0e says *which line
to blame, and therefore what to keep*.

### The defect

[ADR-CX-019](#adr-cx-019)'s plan described the store's ADR-276 gate as *"not behind the engine
switch — a v2 session's acceptance is decided by the prototype today"*. Measured, it is worse than
that: [#658](https://github.com/dcodish/geo_builder/issues/658) made `addLine` **return early** for v2
as soon as the grammar could read a line, and the gate sits below that return. **Under `?engine=v2`
there was no acceptance gate at all** — a session accepted `|z1| = 5` and then `|z1| = 7`, and drew a
figure satisfying neither.

So this is not a port. It is restoring a doctrine v2 never had.

### Decision 1 — the gate lives in `app/`, and the store stops deciding

The prototype's `derive` is in `engine/`, which the store may import. v2's fold is reached through
`deriveLines`, which composes `parser` with `replay` — permitted in `app/` **and nowhere else**, by a
guard that already caught this exact composition living in the wrong layer once. The gate therefore
comes up a layer into `app/submit.ts`, and the store goes back to being state: `recordLine`, `setError`,
`resetSession`, `restoreView`, and it decides nothing.

`addLine` **throws** on a v2 line rather than falling through. A default that is wrong whenever the
caller forgets is the seam [ADR-CX-009](#adr-cx-009) exists to remove, and a silent bypass of the gate
is exactly that shape.

Session persistence went up with it, into `app/session.ts`, called once from `main.tsx`. Replaying a
stored session **is** a submit — every stored line passes the grammar and the gate — so it cannot be a
module side effect of defining the state container. The saved seed is now restored *before* the replay:
the old order restored it after, which with a gate in the path would re-gate a session saved in
configuration 3 against configuration 0 and silently drop a line that holds only in the saved drawing.

This is also the extraction 2-D had to perform after the fact (docs/23: a 2,717-line store holding the
replay engine) and the reason this tree has an `app/` layer from its first slice.

### Decision 2 — a GIVEN can be violated; an ANSWER cannot

The gate reads the three signals a stated given produces — `contradiction` (an inconsistent linear
system), `emptiedBy` (a filter that empties the configuration set, stage 2's `bound-unsatisfiable`) and
`unsatisfied` (a numeric relation the solver could not satisfy) — and **ignores `claims` entirely**. A
student's wrong answer must land and be marked ✗; refusing it would be the tool grading the input box
instead of the figure. `undecided` is not a violation either: *the engine could not evaluate this* is a
different sentence from *this is false*, and its own contract says so.

Only a **newly** broken signal refuses. A figure that already carries an unsatisfiable given keeps
accepting statements — the doctrine is about damage the new line causes, not the state it arrives into.

The mini config-search is kept (8 configurations, the prototype's number) and is justified only by the
numeric tier: tier 1's contradictions and stage 2's pruning are exact and seed-independent, but a
relation over a sampled parameter may hold at another seed, and refusing a student's line over one
sample would be [ADR-052](06-decisions.md#adr-052) inverted.

### Decision 3 — the refusal names the earlier statement DIFFERENTIALLY

*"Which earlier line, removed, lets this one in?"* — the doctrine's own question, answered the way it is
phrased. The alternative was provenance tracking through Gaussian elimination, and it is the wrong tool:
elimination's conflict set names only its own rows, and would say nothing about a filter that emptied
the branch set or a numeric relation that stopped being satisfiable. The differential search covers
every refusal cause with one mechanism, and it costs `2n` folds on the refusal path only.

When no single earlier line explains it, the statement cannot hold at all (`o = 1+i`) and the new
`impossible` error quotes the student's own line. `incompatible` with an empty detail — what the
prototype fell back to — would have printed *"cannot hold together with: «»"*: an error message about
internal state wearing a statement's clothes.

### The parity gap this uncovered

`arg(z1) < 30`, parenthesised, is what the prototype's own #606 case types. The prototype reads it; v2
returned `not-handled`. ADR-CX-019's form list sampled the bare `arg z2 < 45` and missed it — a
capability the cutover would have deleted. `arg` is a KEYWORD in four relation rules, not an operator in
the expression grammar, so the fix is at the orthography chokepoint (`normalize.ts`: parentheses around
a name after the argument keyword are punctuation) rather than an optional paren in each pattern and in
every future argument rule. `conj`/`re`/`im` are genuinely functions and keep theirs. The three
parenthesised spellings are now in `PROTOTYPE_FORMS`.

### Measured before/after over the corpus

39 sessions, 104 lines, driven through the v2 submit path before and after.

- **8 lines change verdict, every one of them a contradiction v2 previously accepted**, and each new
  refusal names the earlier statement: `|z1| = 7` after `|z1| = 5` · `arg z1 = 60` after `arg z1 = 30` ·
  `z1 ברביע השני` after `arg z1 = 30` · `|z1| = 7` and `z1 = 5` after `z1 = 3+4i` · `arg z1 < 30` after
  `z1 = 1+i` · `o = 1+i` (now `impossible`).
- **7 final figures change**, all in the same direction: from a broken figure (a contradiction, an empty
  branch set, or zero points drawn) to the last valid one. That is keep-prior working.
- **Zero regressions.** Nothing that was accepted and clean is now refused: every §2b exemplar part,
  every grammar form and every claim family is byte-identical.

One divergence from the prototype is deliberate, and it is Decision 2's line: `z1 = 1+i` then
`arg z1 < 30` is **accepted with a ✗** by the prototype and **refused** by v2. Drawing z₁ at 45° while
the student stated `< 30` violates a given, which is the cardinal sin this product is written against,
so the stricter reading is the honest one — and the prototype had no claim families with which to tell a
given from an answer.

**Operator ruling, 2026-08-17, on that exact case:** *"z1 = 1+i then arg z1 < 30 — we should refuse."*
So the refusal is the decision rather than an inference from the ladder, and the prototype's
accept-with-a-✗ is retired with it.

### Consequences

- `duplicate-name` becomes prototype-only. Under [ADR-CX-009](#adr-cx-009) §1 a second mention of a name
  is a *given*, so a contradictory redefinition is `incompatible` and a consistent one is simply another
  given — which is why `z1 = 3+4i` then `|z1| = 5` is accepted.
- `store/__tests__/submit-path.test.ts` used `['z1 = 3+4i', 'z1 ממשי', 'arg z1 = 45']` as neutral data;
  `3+4i` fixes the argument at 53.13°, so the gate refuses the third line. The data was accidentally
  contradictory, and finding it was the first thing the gate did.
- Steps 3–5 of #624 remain blocked on [#680](https://github.com/dcodish/geo_builder/issues/680): the
  solution-set capability is not on the v2 path at all, only on the retiring bridge.

---

## ADR-CX-024 — The solution set reaches the v2 path, and the fold becomes where order-dependent readings are decided (2026-08-17)

**Status:** accepted · **Slice:** S7 ([#624](https://github.com/dcodish/geo_builder/issues/624)),
closes [#680](https://github.com/dcodish/geo_builder/issues/680) and
[#686](https://github.com/dcodish/geo_builder/issues/686) ·
**Ladder stage:** **0d′** — `rootsMode` already lives there; what changes is *who asks it*. No new rung.

### The defect

[ADR-CX-021](#adr-cx-021) built the solution set — the n solutions as one configuration containing n
points — **inside `bridgeFacts`**. `rootsMode` and `solutionNames` were called from nowhere else, so the
capability existed only for facts arriving from the retiring prototype parser. Under `?engine=v2`,
measured:

| lines | prototype | v2, before |
| --- | --- | --- |
| `z^3 = 8` | `z1,z2,z3` named, 1 config | one point `z`, 3 configs |
| `z^3 = 8` · `w = z1 * 2` | `w = 4·cis0°` | **`z1` invented as a free number**, `w ≈ ~4.8·cis~189°` |
| `z^3 = 8` · `z = 1+i` | refused, naming the equation | accepted |
| `z1 = 5` · `z^4 = 16` | 4 anonymous solutions + `z1` | one point `z`, 4 configs |

Row 2 is [ADR-052](06-decisions.md#adr-052)'s sin, not a missing feature: a reference to a stated
solution silently became an invented free number with a sampled position printed for it.

Two things hid it. `cutover-parity.test.ts` asks `parseLineV2(line).ok` — a question about **parsing**,
which every one of these forms passes; the capability is in the fold. And `solution-sets.test.ts` never
called `setEngine`, so it submitted through the store's **prototype** branch and folded through the
bridge: eight green tests describing a path the product does not ship (#686).

### Decision 1 — the parser reports the SHAPE; the fold decides the READING

`rootsMode(varName, n, priorNames, grounded)` needs the names *earlier lines* mentioned. `parseLineV2`
takes one line and is stateless — deliberately, because span accounting depends on it — so it
structurally cannot answer. That is why the lowering ended up on the bridge: the bridge was the only
place that iterated statements in order.

So the parser's `equation` rule now emits a `RootsEquation` in a new `roots` channel and **no
constraint** for it, and `app/deriveLines.ts` — the first layer that sees the lines in order — asks the
mode and emits the constraints. This is the split the tree already uses for measures, which drive or
verify by the same logic: *the parser names what the student said; the fold decides what it means.*

### Decision 2 — one lowering, in `model/solutionSet.ts`

`asRootsEquation` and `solutionSetConstraints` are shared by `deriveLines` and `bridgeFacts`. ADR-CX-021
Decision 2 removed a forgettable *stamp* and left a forgettable *lowering* one layer out — the same
class, so it gets the same answer: the lowering lives where both producers reach it and neither owns it,
and the two paths cannot emit different constraints for the same sentence.

### Decision 3 — a reserved letter is ENFORCED, not merely declared

Reserving without enforcing only moves the phantom. After `z^3 = 8`, a line mentioning `z` has no honest
reading — `z` is already three points — and the fold auto-created a *fourth*, free `z` and drew it at a
sampled direction. So `deriveLines` tracks the reserving statement and reports any later line that
mentions the letter, quoting that statement; the acceptance gate ([ADR-CX-023](#adr-cx-023)) refuses on
a newly-untranslated line, so the refusal reaches the student the way the prototype's did.

This makes «arg z» after an enumeration a refusal rather than an answer. That is honest but not
complete: the exam's «הפתרון ברביע הרביעי» *selects* among an enumerated set (2023 קיץ א opens with it),
and selection is a capability neither engine has. Filed rather than faked.

### Decision 4 — the roots formula is recognised STRUCTURALLY, not by a branch count

`surfacedFormulas` surfaced CX-F3 (n-th roots) when an equation `Xⁿ = <no unknowns>` had
`configCount > 1`. With an enumeration that count is 1, so «z³ = 8» — the roots formula's own example —
started surfacing **CX-F2, De Moivre**: not a missing row but the wrong one. A branch count was a proxy
for *the base is being solved for*; the structure says it outright, so the condition is now
`c.principal === true || configCount > 1` — an enumerated set's own row, or a constrained letter still
walking its turn unknown. A verification of a determined value is neither, and stays De Moivre.

### What the corpus tests were encoding

Eleven tests failed, and none of them was a regression: each used `['z^n = c']` as a convenient source of
*configurations*, which is the reading ADR-CX-021 had already retired for the bridge. They passed only
because this path had not received the lowering. Every one is re-expressed on `['z', 'z^n = c']` — an
existing letter, constrained, whose n roots genuinely are its n configurations (ADR-CX-005 mode 2) — and
the enumeration is asserted separately, on names rather than on a count.

One was a different kind of failure and is worth recording: `rules.test.ts`'s `build()` helper
concatenated `parsedLine.constraints`, so it silently dropped #607's middle line the moment power
equations stopped being lowered by the parser. The accumulator is therefore exported as `lowerLines`, and
it is the only sanctioned way to turn lines into fold input — a hand-rolled one drops whatever channel it
has not heard of, which is the silent-drop class wearing a test helper's clothes.

### Consequences

- **#624's deletion step is unblocked.** v2 now covers the referencable solution set, which was the
  ninth cutover gap and the operator's stated stop condition.
- **G4, G5 and G6** ([#623](https://github.com/dcodish/geo_builder/issues/623)) are unblocked on the path
  that ships, not only on the bridge.
- `bridgeFacts` still has its own copy of the mode question; both call `rootsMode` and
  `solutionSetConstraints`, so they cannot drift, and the bridge goes with the cutover.
- Selection among an enumerated solution set, and [#688](https://github.com/dcodish/geo_builder/issues/688)'s
  claim drive-or-check, are named gaps — operator ruling 2026-08-17: v2 defects wait for dedicated
  complex sessions; only capability the prototype HAS blocks the cutover.

## ADR-CX-025 — A filter's window survives the change of basis, and is re-verified on the drawn direction (2026-08-17)

**Status:** accepted · **Slice:** S7 ([#624](https://github.com/dcodish/geo_builder/issues/624)),
fixes [#690](https://github.com/dcodish/geo_builder/issues/690) ·
**Ladder stage:** **2b** gains the projection; **3e** gains the filter backstop it never had.

### The defect

Found by the #624 step-3 coverage measurement, not by a user — which is the point of measuring rather
than eyeballing what the retiring suite locks.

A filter had exactly two arms, and a name could fall between them. `filterBranches` PRUNES enumerated
branches, reading `branch.angles` — so it reaches a name whose direction the equations *fixed*. The
`windows` map BOUNDS the sample and the minimiser, keyed by name — so it reaches a name in the *free
basis*. A name elimination made **dependent** on the basis is in neither, and its filter was dropped in
silence:

```
z3 ברביע הראשון
arg z3 + arg z2 = 0
```

→ z₃ drawn at **219.52°**, outside the stated quadrant, with `unsatisfied`, `emptiedBy`, `undecided` and
`untranslated` all clean. Deriving the §2b setup **with** and **without** its two z₂ filters gave the
identical figure: the givens had no effect at all.

It cost the corpus exemplar. §2b part ב built at z₂ = 243.44° with a perimeter of 72.8452r, where the
prototype builds z₂ = 20°→26.57° and answers **60r**. This is [ADR-052](06-decisions.md#adr-052)'s
cardinal sin — a figure that contradicts a stated given — reached by a new route.

It is a **class, not a case**: which of a filter's three possible roles a name gets is decided by pivot
order inside Gaussian elimination, which is invisible from the line the student typed. Any F4/F5 filter
paired with any monomial relation can land in it. And because ADR-CX-023's acceptance gate reads exactly
the signals that stayed clean, the gate accepted the line that broke the figure.

### Decision 1 — a window on a dependent name is a window on the basis coordinate that carries it

The linear tier leaves every dependent direction as an affine function of the basis,
`arg(name) = K + Σ cᵢ·arg(basisᵢ)`. A window on the left is therefore a window on the right whenever
exactly one `cᵢ` is non-zero — the corpus case, because the exam relates directions in pairs. So
`solve/window.ts` projects it there and the existing `windows` map does both of its jobs for the
dependent name too.

This is deliberately **not a third arm**. One `narrow()` call already reaches the initial sample *and*
the minimiser bounds, because both read that map — so the fix is at the chokepoint that exists rather
than beside it. LADDER-CX's own tripwire is *"if this file grows a case ladder, that is the tripwire"*,
and a third mechanism per filter role would have been one.

A filter still **selects and never drives** ([ADR-CX-002](#adr-cx-002)): bounding the basis picks among
the drawings the equations already allow, exactly as bounding a free direction always did. No row, no
residual, nothing determined.

### Decision 2 — a direction's window is bounded at its turn, both ends

«arg z < 45°» is the sector (0°, 45°), not the half-line (−∞, 45°). `filter.ts` already read it that way
— it folds into [0°, 360°) before comparing — but the bound was implicit, and an implicit one cannot
survive a change of basis: an unbounded end has no turn to be a representative *of*, so shifting it by a
turn silently admits different directions. The first cut of this module carried the infinity through and
let «arg z2 < 45» pass at 66.28°. Making both ends explicit is the fix, not a tidy-up.

Which turn's representative to keep is chosen by overlap with what that coordinate is **already**
confined to, so accumulating two filters intersects instead of landing in different turns.

### Decision 3 — stage 3e re-verifies every filter against the direction actually DRAWN

Measures have had this backstop since the tier landed; filters had none, and that asymmetry is what made
#690 silent rather than merely wrong. Pruning and projection are both *arrangements* to make a filter
hold, and an arrangement can fail to reach: a window over two basis coordinates is a half-plane that
projection honestly declines, and the numeric tier may afterwards move a direction pruning had settled.

So the last word is read off the drawn point — whatever route the number took, the student's question is
asked about the student's number. It is reported through `unsatisfied` rather than a new channel because
it is the same sentence (*you stated this and the drawing does not do it*), and because the acceptance
gate already reads that signal — so the line that breaks an earlier given is now blamed rather than
accepted, with no change to the gate.

`BranchFilter` gained `src`, so the report quotes the student's line; `describeFilter` is the fallback
for a filter built in code, and is in the student's register because a violated filter is shown to them.

### Consequences

- **The §2b capstone builds on v2**: z₂ = 26.57° (arctan ½), perimeter **60r**, matching the prototype.
- **The cutover is unblocked** on this axis — this was a capability the prototype had and v2 did not.
- Projection covers one basis coordinate; two or more is reported, not drawn. A half-plane window would
  need an interval-propagation machine, and that is a CAS-shaped thing this tree refuses without an
  operator decision (`src-complex/CLAUDE.md` boundary 3). Reporting is honest; inventing is not.
- `filterBranches` is unchanged: pruning a branch that fixes the direction is still the first arm, and
  projection deliberately skips a branch-fixed name rather than bounding a coordinate that moves nothing.

## ADR-CX-026 — Three parity gaps the cutover measurement found: word order, the polar shape, and a type error (2026-08-17)

**Status:** accepted · **Slice:** S7 ([#624](https://github.com/dcodish/geo_builder/issues/624)),
fixes [#691](https://github.com/dcodish/geo_builder/issues/691) ·
**Ladder stage:** **0b** (rules) and **0c** (span accounting). No new rung.

The remainder of the #624 step-3 measurement — driving every input line the prototype suite exercises
through `app/submit.ts`. Each is a form the prototype reads or a refusal it makes and v2 did not, so each
blocked the cutover on the operator's stated condition.

### Decision 1 — a quadrant given has no word order

`quadrantGiven` already refused to fix the order of the *noun* and the *ordinal*, citing ADR-3D-145:
*spelling one order refuses half the register*. It then fixed the order of the **name**, anchoring on
`^(NAME)\s+…`. That refused «ברביע הראשון z2» — which is what RTL typing produces and what the operator
types ([#599](https://github.com/dcodish/geo_builder/issues/599); its regression coverage existed only
inside the prototype suite). Both placements are now read.

Tried as two placements rather than searched for generally, because the region scanned for the ordinal
must **exclude** the name: «z4 quadrant 4» otherwise finds its ordinal inside `z4`.

«נמצא» went to the span accountant instead — the rule matched, and the framing verb was left unclaimed,
so the line was refused for content nobody dropped. It joins `FILLER` with its inflections and the
English location verbs. That list is an **allowlist that may grow**, and each addition costs at most one
unnecessary escalation; the alternative, a denylist, costs a wrong figure (ADR-CX-009 §2).

### Decision 2 — the generic polar form states what its SHAPE states, and no more

`<mod> cis <ang>` has a symbolic half in either position, and only *numeric modulus, symbolic angle* was
read. «z1 = r cis θ» — the spelling the exam prints — fell through to the expression grammar, which lexed
`rcis` as a single name and read the line as a product of two invented parameters.

One rule now reads all of them, and the shape decides the lowering, which is [ADR-052](06-decisions.md#adr-052)
applied literally:

| modulus | angle | stated |
| --- | --- | --- |
| numeric | symbolic | `\|z\| = m` — direction free |
| symbolic | numeric | `arg z = a` — magnitude free |
| symbolic | symbolic | nothing but the name |
| absent | symbolic | `\|z\| = 1` — `cis θ` is the unit circle |
| numeric | numeric | a literal; the expression grammar reads it exactly |

The modulus group backtracks over `rcis`, so the spaced and unspaced spellings are one rule rather than
two. The numeric classes come from the `NUM` lexicon atom — the ratchet test caught the first cut
spelling the fragment inline, which is ADR-CX-009 §4 working as designed.

### Decision 3 — a magnitude may not silently equal a complex number

When one side of an equation is `|·|`, the other was wrapped in `abs` unconditionally. That is right for
«\|z1\| = 9r» (a real parameter) and «\|z1\| = 2\|z2\|» (already a magnitude), and wrong for «\|z1\| = 9w»,
which it re-read as «\|z1\| = 9\|w\|» — inventing a complex `w`, drawing a phantom for it and reporting
`freeDof: ["|w|", "arg z1", "arg w"]`. The prototype refuses the line.

A complex `ref` appearing outside every `|·|` now refuses. Inside the bars a complex number *is* a
magnitude and belongs there; outside them it carries a direction too, and equating that to a magnitude
states nothing coherent. The student is told, rather than shown a different statement.

**And the same flag was hiding a third reading**, found while locking the palette forms in step 3. A bare
NAME opposite the bars is a **definition**, not a magnitude relation: «w1 = \|z1\|» states w1 completely —
it is the real number \|z1\|, argument included. Lowered modulus-only it kept `\|w1\| = 5` and left the
direction free to be sampled, so over `z1 = 3+4i` it drew **1.91 + 4.62i** instead of **5**. Half a given,
dropped in silence — the same class as the other two, one flag along.

So the shape asks a three-way question and is now read as three:

| opposite the bars | sentence | lowering |
| --- | --- | --- |
| a bare name | a definition — the number, completely | ordinary equation, both rows |
| a real-valued expression | a magnitude relation | modulus row only (ADR-052: no invented direction) |
| a complex expression | a type error | refused, naming the line |

`abs` is already exact in the value layer — real and non-negative — so the definition case needs nothing
added beyond letting the ordinary equation carry it.

### Withdrawn from the issue

A false geometric sequence over determined numbers was filed as a fourth gap and is not one: it lowers to
a **monomial** constraint, so tier 1 reports it as an inconsistent row through `contradiction` — earlier
and better than the numeric check the measurement looked for. The probe read `unsatisfied` and not
`contradiction`. Recorded because a withdrawn finding is worth as much as a confirmed one when the next
session re-measures.

## ADR-CX-027 — The cutover: the prototype is deleted, and there is one engine (2026-08-17)

**Status:** accepted · **Slice:** S7 ([#624](https://github.com/dcodish/geo_builder/issues/624)),
closes [#616](https://github.com/dcodish/geo_builder/issues/616) ·
**Ladder stage:** none — no mechanism changes. This removes the second path *to* the ladder.

### What went

| deleted | why it could go |
| --- | --- |
| `engine/complex.ts`, `engine/model.ts` | the prototype's float evaluator and its `Scene` — replaced by `value/` + `replay/` + `scene/` |
| `parser/parse.ts` | the prototype grammar. It outlived the evaluator only as ADR-CX-019's parity oracle; see below |
| `model/fact.ts` | the fact vocabulary ADR-CX-022 extracted **so that `parse.ts` could outlive the evaluator**. With `parse.ts` gone it had zero importers |
| `render/GaussPlane.tsx` | the prototype canvas; `PolarPlane` replaced it in S5 |
| `replay/scene2.ts`'s `sceneFromDerived2` | the adapter that drew a `Derived2` through the prototype `Scene`. The file's banner readings stay — they are live |
| `replay/derive2.ts`'s `bridgeFacts` + `derive2(facts)` | the second entry into the fold, test-only since S4 |
| the store's `engine` / `setEngine` / `facts` / `addLine` / `removeFact` | the second submit path |
| `?engine=v2`, `useV2`, the `engine=v2` badge, the prototype panels | the switch and everything that branched on it |
| `__tests__/prototype.test.ts`, `replay/__tests__/derive2.test.ts` | the suites of the deleted code, replaced by the step-3 measurement |

`value/value.ts` stays: it is the exact value layer, not prototype vocabulary.

### Decision 1 — `parse.ts` goes, and its FORM LIST stays

ADR-CX-022 assumed `parse.ts` would survive as the parity oracle, and that assumption was worth
re-testing at the point the prototype actually died (operator decision, 2026-08-17). It does not
survive. The parity question — *does v2 read everything the prototype read?* — is asked **once**, at the
cutover, and after it there is nothing left to be at parity with; keeping a second 528-line grammar to
answer a question that no longer has a product meaning is a drift source, not a safety net.

What was worth keeping is the **list**, and it is kept. `cutover-parity.test.ts` becomes a v2-only form
corpus: every utterance still parses, and a grammar regression fails it. The list is not about the
prototype and never was — it is the set of forms a student types, assembled by measurement rather than
by invention, which is exactly why it found eight capabilities in S7, then #680, then #690 and #691.

Deleting `parse.ts` made `model/fact.ts` dead in turn, which is the extraction being *undone in the
right order*: the vocabulary was moved down so the parser could outlive the evaluator, and when the
parser goes the reason goes with it.

### Decision 2 — one way in, and the guard shrinks to say so

The tree had two entry paths for four slices: `addLine` → prototype facts → `derive`, and `submitLine`
→ lines → `deriveLines` → the fold. That arrangement cost three issues, all the same shape — a
capability reachable from only one path is invisible to tests aimed at the other:

* **#658** — the prototype parser gatekept the input box, so every v2-only form was unreachable
* **#680** — ADR-CX-021's solution set lived inside `bridgeFacts`, so the shipped path never had it
* **#686** — eight green tests described the bridge rather than the product

`import-direction.test.ts` records the result rather than a promise: the `engine` layer and its
allowances are gone, and `store` may now import `value` and nothing else, because the store is state.
The allowances were listed as *exactly the edges that existed* while the prototype waited to die,
which is what let the deletion be a subtraction instead of an excavation.

### Decision 3 — the prototype's calculation panel goes with it

It read `deriveScene`, so it could not survive the evaluator. Its own calc input is not a lost
affordance: the same lines are typed in the main box, where a bare expression is a query. The panel's
replacement is [#648](https://github.com/dcodish/geo_builder/issues/648)'s UI programme, which owns the
design; a stopgap panel built here would be work that programme would delete.

### Consequences

- **v2 is what students get.** Prod ran the prototype until this deploy.
- **#616 closes.** The foundation rebuild is complete: S0–S7.
- `src-complex/` loses ~1,900 lines and one whole layer. 556 tests over 22 files, all green.
- The named gaps stay named, not fixed: [#688](https://github.com/dcodish/geo_builder/issues/688)
  (claim drive-or-check), [#694](https://github.com/dcodish/geo_builder/issues/694) (selection among an
  enumerated solution set), and the rest of the 572 booklet's Q3s as fixtures.

## ADR-CX-028 — «הורידו שאלה» is NOT built here: the question document is 2-D and 3-D only (#745)

**Status:** accepted, 2026-08-19 · **Issue:** [#745](https://github.com/dcodish/geo_builder/issues/745)
· operator ruling, 2026-08-19: *"הורידו שאלה should be in 3d but not in complex"*

**Context.** #745 moved the question-document composer and the clean-export rasteriser into `shell/`
([ADR-W-027](06w-decisions-workspace.md#adr-w-027)) so a capability that had been trapped in `src/`
could reach the sibling builders. The issue as filed carried this builder too, and the first
implementation shipped it here: a `questionLines` module, a `.docx` handler, the button, and both
locale strings. The operator ruled during play-and-approve that the complex builder does not get it.

**Decision.** The complex builder does **not** offer «הורידו שאלה». The leg is removed rather than
hidden behind a flag — an unused surface is a surface that rots, and a flag would leave the reader
guessing whether the gap is a decision or a defect.

**What it keeps.** The shared **rasteriser**. This tree's `rasterCanvas` was the third product-local
copy of svg→png in the workspace — #742's own comment flagged it as *"a shell candidate"* — and it now
calls `shell/export/svgToPng`. Behaviour-neutral here (this renderer tags nothing, so the clean-export
contract is a no-op, and `sourceSize` reads the Gauss plane's viewBox exactly as the inline copy read
its client box), and it retires the copy the workspace had already named. **The n/a is the document,
not the export layer** — the distinction this ADR exists to keep straight.

**How the decision is held.** `shell/__tests__/question-export.test.ts` asserts the negative directly:
this tree reaches no question composer, offers no button, defines no question strings, and has no
givens module — while still rasterising through the shared path. A deliberate n/a and a forgotten cell
are indistinguishable in a passing suite, so the n/a is the thing under test. This is the
[#664](https://github.com/dcodish/geo_builder/issues/664) conformance-matrix discipline applied before
the matrix exists: an unexamined cell fails, and a declared one says so out loud.

**What is NOT decided here.** The rationale is the operator's and is recorded as given, not inferred.
Image download and copy-image already exist in this builder (#742) and are untouched;
[#713](https://github.com/dcodish/geo_builder/issues/713) keeps whatever export work remains. If the
ruling is ever revisited, the shared composer is already in place — re-adding the leg is a givens rule,
a handler, a button and two strings, which is exactly what was removed.

## ADR-CX-029 — A claim over an UNDETERMINED number drives; over a determined one it still only checks (#688)

**Operator report (2026-08-17), one line, `?engine=v2`:**

```
z1 מדומה טהור
```

**Drawn:** z₁ at `189.12°`, modulus ≈ 2.4 — nowhere near the imaginary axis. **Panel:** the claim reads
`unknown` («הארגומנט של z1 עדיין לא נקבע מהנתונים»). **freeDof:** `|z1|`, `arg z1`. Same for «z1 ממשי»,
«z1 ו-z2 צמודים זה לזה», the English mirrors, and `|z1| = 5` + «z1 מדומה טהור» (modulus honoured,
direction sampled at 189°).

**`verifyClaim` was not the defect.** It is honest: with `arg z1` free there is nothing to verify, and
`unknown` is a first-class answer, deliberately distinct from `refuted`. The defect is that the tool had
no reading for *"the student stated a property of a number that nothing else determines"*, and both
readings it did have are wrong:

- as a **claim** → verdict `unknown`, and then the sampler places z₁ at 189° anyway. **That sampled
  direction is not neutral: it ASSERTS `arg z1 ≈ 189°`, contradicting what the student just typed.**
  [ADR-052](../06-decisions.md#adr-052)'s conformance smell in its worst form — not a default
  masquerading as fixed, but a default **contradicting** something stated. It is also the #653 class:
  the panel says "not yet determined" while the canvas says "z₁ is at 189°, plainly not imaginary".
- **ignoring it** → a silently dropped statement.

**Decision — give the claim families the half they never got: `driveOrCheck`.** F3/F4 relations do it;
ADR-CX-005's roots modes do it. A claim whose relevant DOF is FREE lowers to a constraint; over a
determined subject it stays a check.

| claim | when the DOF is free, lowers to |
| --- | --- |
| `real` | `arg(z²) = arg(1)` ⇒ `2·arg z = 0 + k` ⇒ **{0°, 180°}** |
| `imaginary` | `arg(z²) = arg(−1)` ⇒ `2·arg z = ½ + k` ⇒ **{90°, 270°}** |
| `conjugates` | a `mod` row `\|z2\| = \|z1\|` **+** an `arg` row `arg z2 = arg(1/z1)` |
| `forall-power`, `minimal-power` | **unchanged, check-only** — they answer «prove/find n», and driving them would let a guess reshape the figure |

Squaring the subject is what turns a modular claim into an ordinary row, so the integer turn unknown —
which IS the branch set ([ADR-CX-006](#adr-cx-006)) — yields the two configurations for free and
«show another configuration» walks 90° ↔ 270°. **No new solver concept, and no claim kinds enumerated
inside the solver.**

**The seam is `foldConstraints`, and that is the architectural half of this fix.** `parseLineV2(raw)` is
stateless by construction, so a per-line lowering structurally CANNOT decide "is my subject already
pinned?" — v2 had no place where a lowering may ask what earlier lines established. `foldConstraints`
is that place: it already holds tier 1's `freeDof` and `knownModulus`. It now solves tier 1 once to
learn what the other lines determined, collects the rows the claims may contribute, and re-solves only
when there are any. [#680](https://github.com/dcodish/geo_builder/issues/680) hits the same wall with
`rootsMode`, so the seam serves both.

**The guard is the whole safety argument, and it is subtler than "ask tier 1".** Two measurements
shaped it:

1. **Absent is maximally free, not determined.** `freeDof` is built from the solver's `free` basis, and
   a name no constraint mentions never enters the system — so the LONE claim, which is the reported
   case, read as "not free" and never drove. The test is therefore *pinned*: determined, with every
   residual coefficient a turn unknown (mirroring how `knownModulus` is built from the modulus half).
2. **Tier 1 is not the only lane that can pin a subject.** Only MONOMIAL rows reach it, so a name fixed
   by a deferred constraint would read as free and the claim would drive it — a claim overriding a
   given, the one thing this must never do. A name mentioned in any deferred constraint is therefore
   treated as determined. Conservative on purpose: a false "determined" costs the old behaviour (a
   check, verdict `unknown`), while a false "free" costs a figure that contradicts a stated given.

So *"a claim that could move the figure would make every answer correct"* survives intact: a claim can
only move a figure the givens left open, i.e. where there was no answer to get wrong. «z1 = 3+4i» then
«z1 מדומה טהור» is unchanged — accepted, `refuted`, still drawn at 53.13°.

**One user-visible CONSEQUENCE, recorded rather than absorbed.** A driving claim is a figure-shaping
statement, so it now participates in the acceptance gate's blame differential. On
«z1 = 1+i» → «z1 מדומה טהור» → «arg z1 < 30», the inequality is still refused, but the refusal is now
`impossible` rather than `incompatible`: removing «z1 = 1+i» leaves a claim that genuinely forces
arg z1 ∈ {90°, 270°}, so the inequality fails in that counterfactual too, and no single earlier line
explains the refusal. The FIGURE is unaffected (z₁ stays at 1+i, the claim still marked ✗) — what moved
is the blame message on a line that contradicts both earlier statements independently. Flagged for the
operator rather than assumed; refining blame to prefer naming a GIVEN over a claim would be a change to
the acceptance doctrine, which wants its own ruling.

The ordering asymmetry the issue raised is [ADR-276](../06-decisions.md#adr-276) working as designed
(the earlier statement wins): «z1 מדומה טהור» then «z1 = 3+4i» refuses, while the reverse order accepts
both and marks the claim ✗.

Locks: `claim-drive-688.test.ts` (14 tests — the operator's line, both configurations, the real axis,
a stated modulus honoured while the direction is driven, the conjugate family, the determined-subject
guards including the acceptance-gate figure, and a corpus-wide invariant: **no plotted point may sit
where it refutes a claim the panel has not refuted**).

## ADR-CX-030 — A why is a CODE: the engine publishes reasons, the reading layer words them (#716)

**Status:** Accepted (2026-08-26) · **Ladder:** stage 5d (the reading seam) · **Fixes:** [#716](https://github.com/dcodish/geo_builder/issues/716)

**The report (B3 parity round, 2026-08-18):** with the UI toggled to English, the honesty strip and
the panel readings still rendered Hebrew — «אין תצורה תקפה · הצורה נקבעה במלואה», the ✗/?/⚠ row
suffixes. The scope measurement on the issue found the class engine-wide: Hebrew display prose was
COMPOSED at the point of decision in `solve/claims.ts` (~15 verdict whys), `model/knowledge.ts`
(`whyNotKnowledge`), the stage-3e measure verdicts and `v2Status`'s heirs in `replay/scene2.ts`,
`solve/window.ts` (`describeFilter`), `solve/residuals.ts` (the `'משוואה'` fallback),
`app/deriveLines.ts` (the untranslated-line reasons) and the App's hardcoded strip suffixes. No
language toggle could reach any of it, because by the time the UI ran, the words were already chosen.

**Decision — the docs/17 chokepoint move, in three parts:**

1. **The engine publishes WHAT happened, never how to say it.** `model/why.ts` defines `Why`, a
   discriminated union of reason codes with the parameters that make each about the student's own
   statement (`{ code: 'minimal-refuted', name, prop, least }`). `ClaimVerdict.why`,
   `KnowledgeRow.why`, `CheckedMeasure.why` and `Untranslated.why` all carry `Why` now (`null` on a
   knowledge row exactly when a value prints — a number needs no excuse). `whyNotKnowledge` returns a
   code. `Derived2.contradiction` was already a code and now stops leaking raw into prose.
2. **One translator at the reading seam.** `whyText(why, t)` in `replay/scene2.ts` — beside the
   ADR-CX-015 chokepoint, for the same reason — words a code through the product i18n, received as an
   argument the way `v2Formulas` already receives `lang`, so `replay/` stays pure and imports no
   i18next instance. The v2 readers (`v2Freedom`, `v2Contradiction`, `v2Knowledge`, `v2Measures`,
   `v2Claims`) take the same `Translate`; the App passes its `t`, and the strip suffixes and its
   `dir` follow the UI language. The switch is exhaustive over `Why` — a new code without an arm or a
   key is a type error, not a silently-untranslated row. All wordings, both languages, live in
   `i18n/index.ts`; the Hebrew renderings are byte-identical to what the product always showed (one
   deliberate exception: the contradiction parenthetical now words the axis — «ערך מוחלט»/«ארגומנט» —
   where it used to print the raw engine token `modulus`/`argument`).
3. **`src` is REQUIRED on `Constraint` and `BranchFilter` — the root of the two solver fallbacks.**
   `describeFilter` and `'משוואה'` existed only because `src` was optional while every real
   constructor sets it. Making the type tell the truth deletes both: a refusal always quotes the
   student's own line (the `unsatisfied`/`undecided` channels stay language-neutral source text),
   and the test-only filter constructors carry math-notation `src`. Names, sources and power texts
   interpolate through `whyText` untranslated for the same reason — they are the student's words or
   math, correct in every language.

**The locks moved with the strings, as the issue's plan required.** Engine-level tests now assert
codes and params (`claims`, `knowledge`, `knowledge-in-r`, `tier2`, `window`, `tier1`); the rendering
locks (`b6-status-split`, and the new `i18n-readings-716.test.ts` regression) drive the readers
through the REAL resources via `getFixedT` — Hebrew wordings exact, and an English sweep asserting no
reading surface emits a Hebrew codepoint over English input, which locks the CLASS rather than the
reported strings. Bidi isolates are stripped before comparison (ADR-W-029's display/content line).

**Consequence for the conformance matrix:** the interaction family's «error voice / language» row is
green for complex — every student-facing reason the engine produces now follows the UI language.

## ADR-CX-031 — A violated measure GIVEN refuses like any other given (#788)

**Status:** Accepted (2026-08-26) · **Ladder:** stage 3e → the `unsatisfied` channel · **Fixes:** [#788](https://github.com/dcodish/geo_builder/issues/788)

**The report (operator, playing the #716 build):** «z1 = 3+4i» · «z2 = 3» · «אורך z1z2 = 99» — a
length no configuration can satisfy — was ACCEPTED. The line sat in the fact list as an ordinary
given, nothing appeared on the always-visible strip or beside the input, and the ✗ verdict rendered
only in the data panel — an opt-in surface, hidden on narrow screens. The other tools refuse this
class at submit (2-D: [ADR-417](../06-decisions.md), «AB = 4, BC = 4, AC = 9» → impossible), and
cross-tool mimicry is the operator's guiding principle.

**Root cause — the measure-verdict channel never joined the refusal surfaces.** Stage 3e always
computed `checkedMeasures` honestly, but `unsatisfied` was composed from live residuals filtered to
`deferred-*` keys, so violated measure residuals were excluded. Both refusal consumers — the honesty
strip and ADR-CX-023's acceptance gate — read `unsatisfied`, so the verdict existed with no surface
that could refuse or shout it. This is the asymmetry ADR-CX-025 closed for FILTERS (#690), one
channel over: the filter fix's own words — *reported through `unsatisfied` rather than a new channel
because it is the same sentence, and the acceptance gate already reads that signal* — applied verbatim
to measures.

**Decision:** stage 3e's violated measures join `unsatisfied` by their `src`. One composition site in
`foldConstraints`; both behaviors follow from the existing consumers, with no new mechanism:

- the **acceptance gate** refuses a newly-unsatisfiable measure with the standard
  incompatible/impossible blame beside the input — the 2-D parity behavior;
- the **strip** carries «✗ «…» — לא מתקיים בתצורה הזו» for figures that arrive violated (load, edit,
  toggle), so the broken given can never hide behind the data toggle (the B6 ruling).

The boundaries hold: a measure that can DRIVE still drives (its residual is satisfied, so it never
enters the violated set — F7 drive-or-check untouched); `undecided` stays out of the channel («could
not evaluate» is a different sentence from «false», the gate's own doctrine); F10 CLAIMS are answers
and remain accepted-and-✗. The panel's verdict row stays — the strip and gate are additive.

Locks: `measure-refusal-788.test.ts` — the operator's exact sequence refused at the gate (Hebrew and
English mirrors), the load path carrying the given on the strip channel, and the two must-not-change
paths: a driving measure still drives, a true measure still holds with nothing unsatisfied.
