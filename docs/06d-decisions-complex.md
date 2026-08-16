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
