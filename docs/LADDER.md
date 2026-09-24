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
| 0e | `metricImpossibility` — a pinned distance longer than the shortest pinned PATH between its endpoints ([ADR-417](06-decisions.md#adr-417); as-found, recorded here by ADR-538) | `pre:impossible` | yes |
| 0f | `angleSumImpossibility` — a declared polygon's stated interior angles summing past its own (n − 2)·180° ([ADR-538](06-decisions.md#adr-538)) | `pre:impossible` | yes |
| 0g | `boundImpossibility` — a stated BOUND and a stated VALUE of the same measure that exclude each other, strictness respected ([ADR-541](06-decisions.md#adr-541)) | `pre:impossible` | yes |

All three provers are SOUND one way only: a violation proves impossibility and refuses before the ladder;
passing proves nothing. The same three run inside the classifier's `constraintIsPending` (stage 5), so a
proven contradiction is never filed as ADR-104's pending state — and, because they run before anything
mutates, the refusal is also the CHEAP path (#1335 measured 19.6 s → 2.2 s on its own sequence).

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
| 2d | **the step-accept predicate** `stepAccepted` at EVERY accept — vacuous-satisfaction gate `newConstraintsNonVacuous` (issue #7) ∧ no collapsed declared polygon `collapsedPolygon` ([ADR-413](06-decisions.md#adr-413), flatness < 1e-4) ∧ no tolerance artefact `toleranceArtefactPolygon` ([ADR-537](06-decisions.md#adr-537), #1328: a declared polygon thinner than 5e-2 must survive a re-solve under a 0.02× degree tolerance — a needle two right angles bought with 0.5° of slack cannot). A refusal by this gate at ANY stage marks the step's error `degenerate` — a solution existed and was not a figure — and the fold's `classify` never files such a fact as pending | — |
| 2d′ | `ensureOwnership` at every PRIMARY accept ([ADR-399](06-decisions.md#adr-399), #150) — a new consuming constraint that landed UNOWNED while the current draw satisfies it is probed with the real sampler (`applySeed` 1..3); a probe whose evaluate BLAMES it (ADR-398 `violated`) runs the stage-3 recruiter at the probe state and transplants the fewest-carrier directive marking, values untouched (verified stable). A redundant statement survives the probes and stays a check. Twins on the m1/coupled accepts. | `main:own` / `m1:own` / `coupled:own` |
| — | **failure path** (primary failed or vacuous): | |
| 2e | orphaned-`coincide` re-home sweep (M2 law i) — unowned coincides join the recruit list | `main:orphans` |
| 2f | `settleOnFrozenPrior` (stage-0, ADR-276) — **skipped when orphans exist** | `main:settle` |
| 2g | `recruitFreeDofs` over newCons + orphans (→ stage 3) | `main:recruit` |
| 2h | `scaleRescue` (ADR-237) — first size given on a similarity-gauge figure, closed-form scale, try-and-verify | `main:scale` |
| 2h′ | **the preservation gate** wraps EVERY 2f–2h accept ([ADR-402](06-decisions.md#adr-402), #258): a rescue stage may not LOSE an obligation `next` carried (`obligationsOf` — listed ∪ embedded ∪ directive ∪ `also`; measured against **next**, never `prev`, so deliberate M1 rewrites are exempt). On a miss: repair by re-listing the dropped obligations as checks + re-evaluate, else the stage's accept is VOID and the ladder climbs on. Dropping a given made a rescue MORE likely to pass 2b/2d — the settle bake stripped an embedded `on-segment-solved` constraint (the restore law knew only the `solve`-directive shape) and won by it. | `preserve:repair` on a repaired accept; `preserve:reject` pushed when a stage's accept is voided |
| 2i | refuse: `blameNewStatement` / vacuous-shaped over-constraint | `main:refuse` |

### `applyCoupledStep` (ADR-338 — a macro's N constraints as one system)

Degenerate pre-gate per command → attach ALL constraints → one evaluate (`coupled:primary`) → settle (`coupled:settle`) → recruit (`coupled:recruit`) → scale (`coupled:scale`) → refuse (`coupled:refuse`).

> **As-found divergences:** no orphan sweep (constraint-only commands *shouldn't* orphan a coincide — but `applyRadiusGiven` runs inside `applyCommand`, which this path calls, so the assumption is unverified); no M1 chain / mirror (justified: `set-*` produces no objects). S1.1 makes both explicit.

## Stage 3 — `recruitFreeDofs` internals (the A–F case ladder)

Cooperative budget (`budgetExceeded()`) can bail between cases — armed only around view searches, never the primary submit fold.

> **The candidate universe** (stages 2g/3 and the S3.2 component partition alike) is defined by the `ancestors(…,'drivable')` walk, which since [ADR-438](06-decisions.md#adr-438) traverses a DERIVED circle centre (midpoint/circumcenter/…) to the DOFs behind it — so a constraint on a Thales-aux tangency touch reaches the external apex's parameter. Before that, pinning a radius could remove the walk's only visible escape and refuse a satisfiable figure.

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
3. `resolveMixedCarriers` internal escalation: near-first accept → grid-scan seed → binding-aware Gauss–Seidel seed → cardinal restarts → convex-then-relaxed → **anti-collapse barrier retry** (retry-only; primary descent untouched) → **the bound-aim yield** ([ADR-547](06-decisions.md#adr-547), #1351): only when that whole ladder accepted nothing and a `length-bound`/`angle-bound` is in the system, the ladder runs again with the bound's ADR-390 aim dropped (it costs only its distance outside its own inequality). `resolveFreeDriven` carries the same last rung after its convex-then-relaxed pick. Worst case ×2 on a failing solve with a bound; zero otherwise.
4. **The honesty backstop (always):** every driven constraint is re-verified against final positions — a best-effort solve that missed fails the evaluate loudly. This is what makes stages 2–3 unable to commit a lying figure.

## Stage 5 — the replay fold (`computeFold`, src/replay/core.ts — moved out of the store by S1.2)

M4 pre-scans (soft-equal / right-angle reseat / trapezoid rotate / centre promotion / softPair swap) → per-fact `applyStep`/`applyCoupledStep` (content-keyed fold memo, per-seed tail) → **ADR-104 deferral fixpoint** (still-failed constraint-only facts retried against the completed figure; reference-identical failures skipped) → atomic-group poisoning fixpoint → **HOIST** (order-independence re-fold, depth ≤ 2, per-seed acceptance) → pending-vs-error classification.

**The per-seed tail (`runTail`)**: reflections → `applySeed` (→ **the [ADR-476](06-decisions.md#adr-476) placement-precondition clamp**, #855: a construct whose feasibility bounds a sampled DOF caps it — a tangency caps the FREE radius at |PO| — so the sampler never proposes a seat outside the feasible set; a no-op on every feasible sample, and a STATED magnitude is never clamped) → radius overrides → ONE evaluate → **the [ADR-400](06-decisions.md#adr-400) basin retry** (#359): a failed evaluate retries ONCE with every directive-carrying carrier warm-started from the fold's committed values (`warmStartCarriers`) — the ADR-238 retry-only pattern at the tail seam, so a clean seed never pays it and sampled non-driven DOFs keep their variety. Only then does `tailChoice`'s rescue-chain fallback (a weaker/pending fold) come into play. Then the ADR-398 status attribution and per-seed presentation — where **the [ADR-476](06-decisions.md#adr-476) sampled-value guard** sits: this seam only overrides rows the fold marked `ok`, so a failure here can never be a contradiction of the givens and the `over-constrained` accusation degrades to an honest "not determined", naming the still-free objects by a structural walk (the 2-D port of [ADR-3D-138](06b-decisions-3d.md#adr-3d-138)).

## Stage 6 — seed/config sweeps (view searches; budgeted)

`firstSatisfyingSeed` (strict → relaxed extension bar → converged fallback, reflection-mask tiers in seed high bits) · `meetsRequirements` · `findValidConfig` (bounded branch combinatorics) · `searchResample` (shape-fingerprint difference). Budgets: worker 12 s (`WORKER_SEARCH_BUDGET_MS`), main-thread sync fallback 2.5 s, tests ∞. A budget-aborted fold is never cached.

## The DOF accountant (`freeDofCount`, src/engine/sample.ts) — read at 2d′/the submit gate and by every knowledge gate

Not a stage the ladder climbs, but the one number every stage's consumers read: `dryRunOutcome`'s `dofReduced` arm (the #156 guard), the «הכל נקבע» cue, the determined-figure fast path of the shared sample core, and the values-panel / relations knowledge gates. Its contract, since [ADR-536](06-decisions.md#adr-536) (#1264):

**shape DOF = raw movable DOF − rank(J) − free similarity gauge**, where **J** is the numeric Jacobian of every enforced constraint's residual rows (`residualRows`: a `coincide` is two rows, a `concyclic` of n points n−3, an order/bound constraint none) over every raw-movable parameter (`carrierParams`), taken at the SOLVED configuration — `resolveDrivenMemo`'s baked construction, i.e. the drawn figure. A row the others imply («AB ⟂ BC» after «∠ABC = 90», swapped operands, a right angle a square already has, a collinear the dependency graph guarantees) adds no rank and removes nothing. The enforced set is the checked list plus every `solve` directive's primary constraint AND its `also` obligations.

**Fails open toward MORE freedom:** a row whose gradient cannot be established (an unplaced operand, a collapsed ray) is counted as one per-row removal exactly as before, and a configuration that does not evaluate keeps the whole per-row tally. Over-counting freedom withholds a print; under-counting it asserts one — the honesty asymmetry every knowledge gate already follows. Memoised per construction identity (the `evaluate` idiom); cost 2·(movable parameters) `evaluateCore` sweeps with no solving.

## As-found asymmetries — RESOLVED by S1.1 (one `runFailureLadder`, 2026-07-24)

| # | Asymmetry | Resolution |
|---|---|---|
| L1 | M1 branch: no orphan sweep, no scale rescue | **DRIFT — unified.** An M1-reinterpreted command also runs apply's radius routing, so it can orphan a coincide; the sweep was added to the main branch (2026-07-06 review F1) and never mirrored. Scale rescue is structurally a no-op on M1 today (no positive `distance` emitted) — included uniformly. |
| L2 | `applyCoupledStep`: no orphan sweep | same — unified |
| L3 | case 3C steal persisted on failed verification (M2 law ii violation, compensated downstream) | **FIXED** — restore-on-failure; case 3D got the same treatment; the downstream compensations' comments updated (the early-stop guard remains for 3B-forced) |
| L4 | case 3B's last rung commits the widest marking on failure | deliberate (downstream cases re-point from it) — kept, documented |

All three entry points now call the ONE `runFailureLadder()` (step.ts) with a `prefix` trace tag; the stages of §2e–2i run identically everywhere.
