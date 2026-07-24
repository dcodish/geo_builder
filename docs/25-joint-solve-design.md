# 25 — S3.2 design: joint component solving as the default assignment semantics

_Status: **DESIGN — awaiting operator sign-off (docs/24 §4.1). No code exists yet; nothing in this doc is built.** Slice S3.2 of [docs/24](24-foundation-hardening-plan.md); closes generator **G2** of [docs/23](23-architecture-review-2026-07.md) (the M2 solver-ownership class — ~10 new members in the 2.5 weeks after ADR-231, the heaviest still-generating class). Direction stated by [ADR-338](06-decisions.md#adr-338): "No mechanism owned a macro's defining constraints as one system … the joint minimiser already exists; the gap was purely in the **assignment layer**."_

## 1. The problem, precisely

Today a constraint acquires its carrier **greedily and sequentially**: `driveOrCheck` picks at apply time by a preference ladder; when the primary solve fails, `recruitFreeDofs` negotiates ownership through cases (B)→(D)→(C)→(E)→(F), then scale rescue, deferral, HOIST. Every rung exists because per-constraint ownership couldn't express some coupling pattern (`also` co-drives, steals, lends, frozen bakes). The rung pile is docs/17's own #1 registered chokepoint, and each new coupling pattern adds a rung beside the others rather than generalizing them.

The root: **ownership is per-constraint** while the geometry is **per-component** — a set of constraints sharing reachable DOFs is one system, and which DOF "belongs to" which constraint is not a fact about the figure at all; it is an artifact of our solver bookkeeping.

## 2. The semantic model

At each step (and each deferral round):

1. **Component partition.** Build the bipartite graph: active constraints ↔ the free/drivable DOFs each can reach (the existing `ancestors(…, 'drivable')` walk). Connected components over shared DOFs partition the constraints into independent systems.
2. **Joint solve per component.** The component containing the step's new constraints is solved **as one system** from the pre-step basin: all its constraints, all its DOFs, one minimisation. Other components are untouched (their solved values stand — the generalization of `settleOnFrozenPrior`'s freeze).
3. **Ownership derived, not negotiated.** A component's DOF set belongs to the component. The per-object `solve` directive becomes a *derived record* of the component solve (kept for compatibility during migration), not the primary ownership ledger. Steal/lend/co-drive vanish as concepts: they were all ways of moving a DOF between constraints *inside one component*.

The honesty spine is unchanged: every component solve is try-and-verify (full `evaluate` + the vacuous gate + the driven re-verify) — the self-verification discipline that lets today's rescues never commit a lying figure carries over verbatim.

## 3. What already exists (why this is an assignment-layer change, not a solver rewrite)

- `resolveMixedCarriers` already minimises `Σ jointCostTerm` over **every constraint attached to every carrier** — nothing in it is arity-limited (ADR-338 proved this by attaching a macro's N constraints before one evaluate: `applyCoupledStep` **is** a component solve for the special case "the new constraints are one component").
- `withOrderCons` already folds soft orders into any joint cost.
- The 3-D app already has the numerics this needs at higher dimension: `src3d/engine/solve3.ts` is a **Levenberg–Marquardt least-squares with central-difference Jacobian and seeded multi-start** (V4/ADR-3D-007). The 2-D solver's Nelder–Mead diverges past ~6–8 DOF (the ADR-281 finding: "the joint solve balloons — 8-D NM where the minimal 4-D solves cleanly — and diverges into rejection or a compromise basin"), which is exactly why staged one-DOF-at-a-time recruiting was needed. **LM is the enabler**: with a Jacobian-based local solver, solving a whole component at once is numerically reasonable, and the staged rungs stop being load-bearing.

## 4. Staged build (each stage independently shippable + revertible)

**Stage (a) — observability, zero behavior change.** Compute the component partition at every failing step; attach it to the ladder trace (`component:{cons:5,dofs:7}`); an integrity test asserts partition correctness on canonical figures. Ships alone; gives us measured component-size distributions over the scenario corpus (how often is a component small enough for today's solver? how often would LM be needed?).

**Stage (b) — joint-first with the ladder as live fallback.** On primary failure: solve the new-constraint component jointly (LM, seeded from the pre-step basin, regularised toward the seed exactly like today's nearest-solution discipline; component DOFs marked; constraints = the component's full set + soft orders). If the component solve verifies → accept (trace `component:solved`). If not → **fall through to the S1.1 unified ladder unchanged**. Gate: the full scenario corpus builds identically or better (a step that used to refuse may now build — each such delta reviewed one by one); hardest-fixture replay within the docs/24 perf budget (≤1.25× baseline); the ADR-281 over-recruit locks (issue #51/#59 figures) must stay green — the regulariser + component minimality replace "least ownership".
  - *Component minimality:* try the **minimal closed sub-component** first (the constraints transitively reachable from the new statement's refs alone), then the full component — the ADR-281 lesson expressed at component granularity, two rungs instead of six.
  - *LM port:* a 2-D `solveLM(residuals, seed, opts)` in `src/engine/` modeled on `solve3.ts` (central-difference Jacobian, damping, seeded multi-start ring like recruiter case (F)'s compass). Characterization tests first (the S0.3 pattern).

**Stage (c) — rung retirement, one at a time, evidence-gated.** With joint-first live, each rung's own locked tests are run with the rung disabled; a rung whose tests all pass under joint-first is deleted (its tests stay). Predicted subsumption map:

| Rung | Predicted fate under joint-first |
| --- | --- |
| (B) staged singleton→minimal→full | subsumed by component minimality |
| (D) free-the-blocker | subsumed — a blocker re-point is just the component solving jointly |
| (C) steal | subsumed — over-subscription is a per-constraint-ownership artifact |
| (E) redundant lend | subsumed — a redundant constraint is simply satisfied inside the component |
| (F) freeze-and-co-drive | subsumed — `also` was per-constraint ownership's escape hatch; the frozen bake becomes "other components untouched" |
| stage-0 settle (ADR-276) | becomes the *definition* (only the new component re-opens) |
| scale rescue (ADR-237) | **kept** — a closed-form global move no local solver finds; runs after a failed component solve |
| anti-collapse barrier (ADR-238) | kept inside the numeric core (basin-search shaping, orthogonal to assignment) |
| deferral (ADR-104) + HOIST (ADR-231) | kept — they are *statement-order* semantics, not assignment; deferral rounds simply re-partition |

## 5. Risks and their mitigations

1. **Basin regressions** (a component solve lands a different valid configuration than today's staged path → stability/scenario check deltas). Mitigation: seed from the pre-step basin + the same regularisation; corpus parity report per stage; deltas reviewed, never auto-accepted.
2. **Dimensionality** (a pathological component spans the whole figure). Mitigation: minimal-sub-component first; LM; the existing cooperative budget applies inside component solves; measured p95 component size from stage (a) before stage (b) ships.
3. **Perf** (Jacobian = 2·n evaluates per iteration). Mitigation: docs/17 §7 discipline — hardest-fixture before/after in the ADR; the fold memo means the cost lands only on failing steps, which today already run the whole rung ladder (often more evaluates than one LM solve).
4. **Compatibility of the `solve` directive record** (save files, worker transfer, tests reading directives). Mitigation: directives remain written (as the component's derived record) until stage (c) completes; the S0.5 interning invariant guards the boundary.

## 6. Test strategy

- Stage (a): partition unit tests + corpus-wide component-size report (no behavior assertions).
- Stage (b): the ENTIRE existing suite is the gate (≈4,900 tests, all M2-class scenario locks green); plus new joint-first unit tests on the canonical M2 figures (Q11, the two-tangent-circles family, #51, #236); plus the perf lock.
- Stage (c): per-rung — disable, run the rung's citing tests, delete only on green; the rung's tests remain as permanent locks on the component path.

## 7. Decisions for the operator (sign-off checklist)

1. **Approve the direction** (component partition as the assignment semantics; ladder as fallback until retirement) — yes/no.
2. **Approve the LM port** into `src/engine` (new numeric core dependency-free code, ~200 lines, modeled on solve3.ts) — yes/no.
3. **Retirement policy**: delete subsumed rungs (tests stay) vs keep them dormant behind a flag. Recommendation: delete — dormant code rots and the tests are the safety.
4. **Stage (b) acceptance for behavior deltas**: operator reviews the list of steps that change refuse→build (each is a rescue-power gain, but some may be locked scenarios asserting refusal). Recommendation: review-per-delta.
5. **Scheduling**: stages are session-sized — (a) one session, (b) 2–3, (c) 1–2 spread out.
