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
