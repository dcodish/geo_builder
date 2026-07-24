# The solve ladder — the one ordered contract

_Slice S0.2 of [docs/24](24-foundation-hardening-plan.md). This is the cross-layer contract [docs/17 §4](17-design-rules.md) implies but never wrote down: the exact order in which mechanisms fire for a submitted command, from pre-gates to seed sweeps. **Every future mechanism ADR must state "inserts at stage N.x" and update this file** — the docs/23 review found the order was emergent from nested code across three files, with pieces existing in triplicate._

_Instrumentation: `StepResult.ladder` (an ordered string trace of the stages traversed, ending with the stage that accepted or refused) — attached by `applyStep`/`applyCoupledStep`, asserted by `src/engine/__tests__/ladder-contract.test.ts`. Diagnostic metadata only; never semantics._

## Stage 0 — pre-gates (`applyStep`, before anything mutates)

| # | Gate | Trace token | Refusal |
|---|---|---|---|
| 0a | `circlesTangentError` — a `circles-tangent` with a `through` radius can't be sized | `pre:tangent` | yes |
| 0b | `degenerateConstraintError` — structurally-NaN operand by id ("BB" ⟂, "∠ABB") | `pre:degenerate` | yes |
| 0c | `danglingCircleError` — a NEW point riding a circle id that exists nowhere | `pre:dangling` | yes |
| 0d | `normalizeShapeComposition` — rotate a shape's vertices onto an existing edge (rewrite, not a gate) | — | no |

## Stage 1 — the conflict / M1 branch (`commandConflict` ≠ null)

The reinterpretation chain, first non-null wins (M1: a statement about an existing object is a constraint):

| # | Reinterpreter | Trace token |
|---|---|---|
| 1a | `reinterpretAsConstraint` — a point-placement re-statement → hidden twin + driven `coincide` (or a carrier-less coincide for the failure path) | `m1:constraint` |
| 1b | `reinterpretAsCollinear` — "P on a–b" on an existing P → rider conversion (free P) or collinear+order | `m1:collinear` |
| 1c | `replaceCyclicForDiameter` — diameter over a ≥3-vertex cyclic polygon → re-place all vertices | `m1:cyclic-diameter` |
| 1d | `reinterpretDiameter` — diameter over two existing points → midpoint≡centre driven coincide | `m1:diameter` |

Then the M1 branch's own mini-ladder: **primary** evaluate + non-vacuous gate (`m1:primary`) → **settle** on frozen prior (`m1:settle`) → **recruit** (`m1:recruit`, → stage 3) → refuse with `blameNewStatement` (`m1:refuse`). No reinterpreter fires → the plain "already defined" conflict (`m1:conflict-refuse`).

> **As-found divergence (S1.1 target):** this branch runs **no orphaned-coincide sweep and no scale rescue**, unlike stage 2 — undocumented whether intent or drift.

## Stage 2 — the main branch (no conflict)

| # | Step | Trace token |
|---|---|---|
| 2a | `applyCommand` (eager carrier pick via `driveOrCheck` — the greedy assignment; ADR-230's semantic radius routing lives here) | — |
| 2b | primary `evaluate` | `main:primary` on accept |
| 2c | `mirrorComposition`/`chooseComposition` — shape-on-existing-edge side choice; both sides stacking → refuse (`main:stack-refuse`) | `main:mirror` when the mirror wins |
| 2d | vacuous-satisfaction gate `newConstraintsNonVacuous` at EVERY accept (issue #7) | — |
| — | **failure path** (primary failed or vacuous): | |
| 2e | orphaned-`coincide` re-home sweep (M2 law i) — unowned coincides join the recruit list | `main:orphans` |
| 2f | `settleOnFrozenPrior` (stage-0, ADR-276) — **skipped when orphans exist** | `main:settle` |
| 2g | `recruitFreeDofs` over newCons + orphans (→ stage 3) | `main:recruit` |
| 2h | `scaleRescue` (ADR-237) — first size given on a similarity-gauge figure, closed-form scale, try-and-verify | `main:scale` |
| 2i | refuse: `blameNewStatement` / vacuous-shaped over-constraint | `main:refuse` |

### `applyCoupledStep` (ADR-338 — a macro's N constraints as one system)

Degenerate pre-gate per command → attach ALL constraints → one evaluate (`coupled:primary`) → settle (`coupled:settle`) → recruit (`coupled:recruit`) → scale (`coupled:scale`) → refuse (`coupled:refuse`).

> **As-found divergences:** no orphan sweep (constraint-only commands *shouldn't* orphan a coincide — but `applyRadiusGiven` runs inside `applyCommand`, which this path calls, so the assumption is unverified); no M1 chain / mirror (justified: `set-*` produces no objects). S1.1 makes both explicit.

## Stage 3 — `recruitFreeDofs` internals (the A–F case ladder)

Cooperative budget (`budgetExceeded()`) can bail between cases — armed only around view searches, never the primary submit fold.

| # | Case | What | Verified? | Trace token |
|---|---|---|---|---|
| 3A | on-segment-solved widening | a closed-form solved point that can't satisfy alone → back to numeric + recruit its free param ancestors | no (joint solve decides) | `recruit:A` |
| — | per new constraint K: early-stop when the system already evaluates valid (an earlier K's recruit fixed the step) | | | |
| 3B | staged recruiting (ADR-281): each candidate DOF **alone** → the newest ref's minimal set → the full union | self-verified per rung; **the last rung commits the widest marking even on failure** (downstream cases re-point from it) | `recruit:B` / `recruit:B-forced` |
| 3D | free-the-blocker (ADR-074): re-point an earlier claimant K1 to an alternative DOF, release the contested one to K | verified after | `recruit:D` |
| 3C | steal from an over-subscribed constraint (≥2 carriers) | **NON-TRANSACTIONAL: the steal persists even when its verification fails** — two comments document downstream compensation; violates M2 law (ii); S1.1 fixes | `recruit:C` |
| 3E | redundant-carrier lend — K1 stays as a check | self-verifying | `recruit:E` |
| 3F | freeze-and-co-drive (ADR-229): bake, re-drive only K's refs, `solve.also` on the free-point host, multi-start compass ring, directive restore | self-verifying | `recruit:F` |

## Stage 4 — `evaluate` / the driven solvers

1. Topological sweep (`evaluateCore`) resolves circles, lines, points in one interleaved fixed point.
2. `resolveDriven` routing: coupled closed-form points promote to numeric → heterogeneous carrier mix (shape scalars / on-line / free+param) → `resolveMixedCarriers`; free vertices only → `resolveFreeDriven` (regularised Nelder–Mead); single param carrier → 1-D `drivenRoots` with **order-preferred else nearest-root** selection (branch cycles the sorted roots).
3. `resolveMixedCarriers` internal escalation: near-first accept → grid-scan seed → binding-aware Gauss–Seidel seed → cardinal restarts → convex-then-relaxed → **anti-collapse barrier retry** (retry-only; primary descent untouched).
4. **The honesty backstop (always):** every driven constraint is re-verified against final positions — a best-effort solve that missed fails the evaluate loudly. This is what makes stages 2–3 unable to commit a lying figure.

## Stage 5 — the store fold (`computeFold`, geoStore.ts)

M4 pre-scans (soft-equal / right-angle reseat / trapezoid rotate / centre promotion / softPair swap) → per-fact `applyStep`/`applyCoupledStep` (content-keyed fold memo, per-seed tail) → **ADR-104 deferral fixpoint** (still-failed constraint-only facts retried against the completed figure; reference-identical failures skipped) → atomic-group poisoning fixpoint → **HOIST** (order-independence re-fold, depth ≤ 2, per-seed acceptance) → pending-vs-error classification.

## Stage 6 — seed/config sweeps (view searches; budgeted)

`firstSatisfyingSeed` (strict → relaxed extension bar → converged fallback, reflection-mask tiers in seed high bits) · `meetsRequirements` · `findValidConfig` (bounded branch combinatorics) · `searchResample` (shape-fingerprint difference). Budgets: worker 12 s (`WORKER_SEARCH_BUDGET_MS`), main-thread sync fallback 2.5 s, tests ∞. A budget-aborted fold is never cached.

## Known as-found asymmetries (inputs to S1.1)

| # | Asymmetry | Status |
|---|---|---|
| L1 | M1 branch: no orphan sweep, no scale rescue | S1.1 decides intent-or-drift, makes it an explicit parameter |
| L2 | `applyCoupledStep`: no orphan sweep | same |
| L3 | case 3C steal persists on failed verification (M2 law ii violation, compensated downstream) | S1.1 fixes to restore-on-failure |
| L4 | case 3B's last rung commits the widest marking on failure | deliberate (downstream cases re-point from it) — S1.1 keeps, documents |
