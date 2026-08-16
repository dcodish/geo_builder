# The complex-numbers solve ladder — the one ordered contract

_The `src-complex/` twin of [LADDER.md](LADDER.md), written **before** the stages exist rather than
after fifteen rungs accumulated — the docs/23 R6 finding was that the 2-D order was *"emergent from
nested code across three files, with pieces existing in triplicate"*. Same governance rule: **every
mechanism ADR must state "inserts at stage N.x" and update this file.**_

_Instrumentation: `StepResult.ladder` — an ordered string trace of the stages traversed, ending with
the stage that accepted or refused, asserted by `src-complex/__tests__/ladder-cx-contract.test.ts`.
Diagnostic metadata only; **never semantics.**_

The ladder is deliberately short. In 2-D, "which DOF does this constraint drive" needs a six-case
recruiter (LADDER stage 3) because geometric constraints are nonlinear and ownership is negotiated per
constraint over a greedy core. Here the multiplicative core is **linear in log-polar coordinates**
([ADR-CX-006](06d-decisions-complex.md#adr-cx-006)), so that question is answered by the pivot choice
in Gaussian elimination. If this file grows a case ladder, that is the tripwire — not a rung to add.

## Stage 0 — the input boundary (before anything is attached)

| # | Step | Trace token | Refusal |
|---|---|---|---|
| 0a | `normalize()` — the ONE orthography chokepoint: exam typography (Unicode sub/superscripts, `°`, `−`, `·`, `×`), invisible bidi and format controls, NBSP, primes, implicit multiplication | — | no (a rewrite) |
| 0b | `parse()` — ordered rules over `lexicon` atoms; first match wins; `'stop'` on recognised-but-unreadable | `cx0:parse` | `not-handled` → the LLM seam |
| 0c | **span accounting** — every non-filler token span must be claimed by the winning parse. Multiset, fails closed | `cx0:span` | yes → escalate, naming what was unclaimed |
| 0d | `existingRef()` — a name already in the figure resolves to that object. **A second mention is a GIVEN, not a redefinition** ([ADR-CX-009](06d-decisions-complex.md#adr-cx-009) §1) | `cx0:ref` | no |
| 0e | dry-run on a trial fact list; keep-prior on failure | `cx0:dryrun` | yes |

## Stage 1 — the exact linear tier

Monomial constraints (both sides single terms: literals, refs, `×`, `÷`, integer powers, roots,
conjugation — **no addition**) become two ℚ-linear systems over the log-polar unknowns.

| # | Step | Trace token |
|---|---|---|
| 1a | classify each constraint `monomial | general` — structural, on the AST | — |
| 1b | modulus system: exact Gaussian elimination over ℚ, RHS an exponent vector over prime/parameter atoms | `cx1:mod` |
| 1c | argument system: elimination over ℚ in **turns**, carrying the integer unknowns `k` | `cx1:arg` |
| 1d | **branch enumeration** — solve the `k` family modulo one turn; the result IS the configuration set | `cx1:branch` |
| 1e | publish the **nullspace dimension as the free-DOF count** — one definition, read by the DOF cue, the knowledge gates and the sampler alike | `cx1:dof` |
| — | an inconsistent linear system is an honest contradiction naming the conflicting statements | `cx1:refuse` |

## Stage 2 — the inequality filter

Quadrant givens, argument ranges (`arg z2 < 45°`), sign and domain givens (`r ≠ 0`, `n` natural).
**Filters on the branch and parameter set, never drivers** — the 3-D `Requirement3` rule. A filter that
empties the set is `bound-unsatisfiable`, refused rather than drawn.

| # | Step | Trace token |
|---|---|---|
| 2a | prune the stage-1 branch set | `cx2:prune` |
| 2b | restrict the free-parameter ranges | `cx2:range` |
| — | empty after pruning | `cx2:refuse` |

## Stage 3 — the numeric residue

Everything not monomial: sums and differences, distances, areas, perimeters, series values, cartesian
component equations, non-linear loci, polynomial equations (Durand–Kerner, degree ≤ 4).

A constraint contributes exactly three things and the solver never changes: **`refs`** (which numbers
it reads), **`residual`** (a signed scalar, zero exactly when satisfied), **`describe`** (how to name
it in a refusal). Constraints carry a typed `strength: required | preference | visual`; a satisfied
preference costs zero ([ADR-276](06-decisions.md#adr-276)).

| # | Step | Trace token | Built |
|---|---|---|---|
| 3a | build residuals over the free basis stage 1 left (usually 0–3 dimensions) | — | ✅ `solve/residuals.ts` |
| 3b | 1-D: enumerate **all** roots → further branches, ordered by nearness to the current value (stability) | `cx3:roots` | ✅ `otherRoots` |
| 3c | n-D: Levenberg–Marquardt with a numeric Jacobian, multi-start, budgeted | `cx3:lm` | ✅ `solveResiduals` |
| 3d | **obligation-preservation gate** — a solve may not lose a given; `obligations(next) ⊇ obligations(prev)` | `preserve:reject` on a voided accept | ⬜ pending |
| 3e | honesty backstop: re-verify **every** constraint against final values; a best-effort solve that missed fails loudly | `cx3:verify` | ✅ `Derived2.measures` / `.unsatisfied` |
| — | refuse, naming the student's **new statement**, never a collateral casualty | `cx3:refuse` | ⬜ pending |

**The free basis is taken over the DRAWN names, not the constraint names**
([ADR-CX-013](06d-decisions-complex.md#adr-cx-013)). Tier 1 only ever sees names a constraint
mentions, so a number the student merely declared is absent from its `free` list while still being
drawn — and a measure that could only be satisfied by moving *that* point reports violated. A point
free enough to draw is free enough to drive.

**Stage 3 changes the DOF count, so stage 5 must read the changed one.** `freeDof` is the nullspace
dimension *before* this stage; `drivenDof` is the numeric rank of the residual Jacobian at the
solution. The cue reports the difference.

## Stage 4 — claims

Claims never drive. Decided exactly where stage 1 covers the value — real iff `2θ ≡ 0` turns, pure
imaginary iff `2θ ≡ 1/2`, conjugates iff moduli equal and arguments sum to zero, for-all-n and
minimal-n by congruence on turns — and by the sampled knowledge discipline otherwise.

| # | Step | Trace token |
|---|---|---|
| 4a | exact decision over the ℚ carriers | `cx4:exact` |
| 4b | sampled verification across every valid configuration | `cx4:sampled` |
| — | refuted | `cx4:refuted` |

## Stage 5 — presentation

| # | Step | Trace token |
|---|---|---|
| 5a | `isDisplayable(facts, config)` — every enabled fact `ok`, verifier clean, every stated inequality satisfied. **One predicate**, consulted by initial display, resample and every cycle action | `cx5:displayable` |
| 5b | config search — walk the packed configuration index under 5a; when none exists, **say so** ([ADR-065](06-decisions.md#adr-065)'s report, which never crossed to a sibling) | `cx5:search` |
| 5c | `buildScene()` — pure; the visual model (points, arg arcs, modulus rings, spirals, sum chains, cycles, loci) | — |
| 5d | knowledge rows — a value prints only when invariant across every valid configuration **and** its gauge is pinned; formula surfacing reads the same model. **Every plotted number's `reading` is composed here too** ([ADR-CX-015](06d-decisions-complex.md#adr-cx-015)) — one string, printed unchanged by the canvas and the banner alike | — |

## Invariants that hold across the whole ladder

1. **Every stage is transactional.** A failed trial restores exactly what it mutated. 2-D's case 3C
   persisted a failed steal and two downstream stages compensated for it; that shape may not appear.
2. **Every accept passes one `stepAccepted` predicate** ([ADR-413](06-decisions.md#adr-413)).
3. **The failure path is cheaper than the success path** ([ADR-407](06-decisions.md#adr-407)) — a
   contradiction is detected in stage 1 by elimination, before any iteration.
4. **A budget-aborted result is never cached.**
5. **No stage may print a value.** Stage 5d is the only place a number reaches a string, and it asks
   the knowledge question first.
