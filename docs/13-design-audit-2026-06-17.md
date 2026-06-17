# 13 — Design & Development Audit (2026-06-17)

_A full design + development audit of the constructive engine, prompted by the operator's observation: "I have been debugging this engine case by case and patching it. I want a full review of what was built and consider some re-work and generalizations where applicable."_

> **Status of recommendations:** the directions here are captured as **Proposed** ADRs [ADR-043](06-decisions.md#adr-043)–[ADR-047](06-decisions.md#adr-047), pending discussion before any are accepted/built. Phase 6 (theorems) is **deferred** by operator decision (2026-06-17): the goal is a *full working diagramming tool first*. The consolidations below are the path to that — they remove the seams that keep breaking case-by-case.

## How this was produced

A multi-agent audit: 8 deep-readers mapped every subsystem in full (parser → IR → engine → render → store), 4 critics attacked from distinct lenses (generalization, patch-smell/fragility, architectural drift, test methodology), the findings were consolidated into 13 theses, **each thesis was then adversarially re-verified against the real code** (default-skeptic: is the claim overstated? would the rework break determinism/stability/the constructive model?), and the survivors were synthesized into this report. The verification pass materially changed the conclusions — it caught that a naive solver-merge would *lose* a capability, that the diameter `antipode` pin can't be deleted, that the on-segment-solved branch isn't persistable through replay, and that one claimed layering violation was simply wrong. The recommendations are the ones that survived that scrutiny.

---

## 1. Verdict

**The core bet is sound. Keep the constructive dependency-graph engine — do not change the approach.** The make-or-break decision (every object defined in terms of earlier ones, classified by DOF; a topological fixed-point sweep to coordinates; constraints as residuals driving a DOF; branches and seeded resampling as the "alternatives" feature) holds up under adversarial reading. The cleanest layers — the constraint residual interface (`solve.ts`), the fixed-point sweep (`evaluateCore`), the geometry primitives (`geometry.ts`), the event-sourced replay store — genuinely realize the stated generic design.

What is felt as "case-by-case patching" is **real but narrow**: it concentrates in *four identifiable seams* where one concept got hand-re-enumerated across 5–8 sites with no compiler link, so each new construct forces synchronized edits and a forgotten copy is a **silent** bug, not a type error. That is a refactor-and-consolidate problem, not a rewrite. The move is to pull the drifted seams toward the clean layers — not to touch the clean layers.

---

## 2. What is working and must NOT be reworked

These are load-bearing decisions that already keep the architecture's promises. Treat them as a hard boundary on every recommendation.

- **`solve.ts` — the constraint residual interface.** `constraintRefs` / `residual` / `constraintScale` / `residualTolerance` / `describeConstraint` are five parallel one-liner switches on `con.type`. Adding a constraint truly *is* one case each, with no new point kind, evaluator, or solver — concyclic ([ADR-041](06-decisions.md#adr-041)) and angle/length-order ([ADR-039](06-decisions.md#adr-039)) slotted in exactly this way. The signed-residual + NaN-on-collapsed-segment discipline (`solve.ts:89,97`) is principled. **This is the model the rest of the engine should be pulled toward.**
- **`evaluateCore`'s interleaved fixed-point sweep** (`evaluate.ts:599–629`). The `while(progressed)` loop over circles → lines → points resolves mutual dependencies (circle↔centre, tangent-line↔circle, on-circle↔circle) with no hand-maintained topological sort, and reports the stuck set honestly. `resolveLine`/`resolveCircle` and the per-kind `tryEval` dispatch are clean.
- **`geometry.ts` primitives.** `solveParam` (fixed grid-scan + bisect), `circleCircleIntersect` (deterministic ± centre-axis ordering), `lineCircleIntersect`, `footOnLine` — pure, small, degeneracy-guarded, deterministically ordered. **The determinism here is what the entire test strategy stands on.**
- **Event-sourced replay** (`geoStore.ts:102–152`). An O(n) fold with a uniform keep-prior/cascade contract and *zero* `switch(cmd.type)` branches; positions are never stored, so undo can't desync; in-place edit and the `owned` cascade get their correctness from replay ordering. `reinterpretAsConstraint` (`step.ts:464`) is itself a *sound* generalization — keep it; only its diameter siblings are the patch.
- **The two parser contracts:** `Rule = AnyCommand[] | null | 'stop'`, where `'stop'` means "recognised-but-unreadable, escalate rather than half-parse," and the LLM fallback that **desugars to canonical lines re-parsed by the same deterministic parser** (so the engine never executes model-authored JSON). These are the strongest ideas in the input layer.
- **`fitTemplate`, `transform.ts`, the label-placement scorer (`outwardDir`/`chooseLabelDirs`), `lower.ts`, `_invariants.ts`.** All clean, generic, and correctly scoped.

> **Rule worth adopting:** any future unified-solver or branch-key work **must reuse `circleCircleIntersect`'s centre-axis sense and `solveParam`'s fixed 256-step grid as the canonical ordering source** — never invent a new ordering. That is the single concrete way a generalization could regress the stability/determinism guarantees these layers currently provide. (Captured in [ADR-045](06-decisions.md#adr-045).)

---

## 3. The real problem, named

The patching is not random; it has a structural signature: **the same concept is hand-enumerated across many sites with no compiler link, and a missing copy fails silently.** It concentrates in four places, each with the same root cause.

1. **"Which kinds carry a DOF" is re-typed 7–8 times.** The set `{free-point, on-segment, on-circle, on-line, perp-offset, rotated, scaled-offset}` with its DOF count and `solve === undefined` gate is hand-listed in `driveOrCheck`'s ladder (`apply.ts:44–108`), the four carrier filters in `resolveDriven` (`evaluate.ts:86–101`), `carrierSpec`/`setCarrierVals` (`evaluate.ts:339–373`), `sample.ts` `freeDofs`/`rawMovableDof`, and `step.ts` `freeDrivableAncestors`/`markDriven`. A kind added to the 21-member `GeoPoint` union but forgotten in `POINT_KINDS` (a hand-typed `ReadonlySet<string>`, `types.ts:327`) drops out of `c.objects.filter(isGeoPoint)` (`evaluate.ts:588`) **with no type error.** → [ADR-043](06-decisions.md#adr-043)

2. **"Which commands reuse-or-create their base points" lives in 4+ disconnected lists.** `placeBase` (`apply.ts:306–313`, skip-existing-ids) is the *actual* authority; `isShape` (`step.ts:64–76`), `DERIVED_SLOTS`, `POINT_PLACEMENTS`, `shapeKinds`, and `mirrorComposition`'s flip-set merely restate it. These have **already drifted in production**: the circumcircle false-conflict (git `1fdd6a0`, 2026-06-17) was exactly a missing `isShape` entry, and the Learning note records "the apply-side reuse logic and the conflict-gate allow-list are two places that must agree." → [ADR-043](06-decisions.md#adr-043)

3. **The DOF re-solver fractured into 3 near-duplicate numeric bodies + a 6-way router.** The coupled block (`evaluate.ts:139–224`), `resolveFreeDriven` (235–306), and `resolveMixedCarriers` (381–454) each do *seed → JSON.stringify-dedup → withOrderCons → Nelder-Mead + restarts → polish → accept-or-keep-seed*, but with **three different residual conventions** (coupled = absolute + soft barrier; free = absolute + hard reject; mixed = relative + hard reject) and degeneracy thresholds ~40× apart (`0.04*span` vs `1e-3*span` vs absolute `1e-6`). The "is satisfied?" gate is hand-recopied byte-identical at four sites (192, 302, 450, 665). → [ADR-045](06-decisions.md#adr-045)

4. **The parser re-implements construct-vs-constrain in ~8 rules, and the `=`-RHS family survives only on hand-tuned ordering.** Each rule that can create *or* constrain pre-existing points open-codes its own existence check (`ctx.points.includes(...)`, `have.has(...)`) with no shared combinator. Eight `=`-RHS rules match the same `XY =` prefix and *none return `'stop'` on a partial match* — they return `null` and depend entirely on RULES-list position to avoid a silent half-parse (the documented [ADR-024](06-decisions.md#adr-024)/[ADR-026](06-decisions.md#adr-026) bug: `"AB = 12√x"` half-parsing to `set-distance 12`). → [ADR-046](06-decisions.md#adr-046)

**The common thread:** the abstraction often **already exists but is consumed by only one caller** — `carrierSpec` is a complete carrier table; `reinterpretAsConstraint` is the generic construct-vs-constrain mechanism; `placeBase` is the reuse authority. The work is mostly *routing the other callers through the home that already exists*, not inventing new machinery.

---

## 4. Prioritized re-work / generalization recommendations

| # | Recommendation | Impact | Effort | Confidence | ADR |
|---|----------------|--------|--------|-----------|-----|
| R1 | Expose resolved lines + circles in `EvalOk` (stop the renderer re-computing engine geometry) | High | **Small** | High | [044](06-decisions.md#adr-044) |
| R2 | Single engine-owned `branchable` source; fix the on-segment-solved gap *deliberately* | High | Small | High | [043](06-decisions.md#adr-043) |
| R3 | Centralize the carrier descriptor + make `POINT_KINDS` compiler-checked | High | Medium | High | [043](06-decisions.md#adr-043) |
| R4 | One SHAPES registry → derive the 4+ allow-lists; make reuse a structural predicate | High | Large (stage it) | High | [043](06-decisions.md#adr-043) |
| R5 | Consolidate the 3 solvers (shared scaffold + one `isSatisfied` + one residual/degeneracy policy) | High | Medium | High (cleanups) | [045](06-decisions.md#adr-045) |
| R6 | Collapse the `=`-RHS cascade into one rule; lift construct-vs-constrain into IR normalization | High | Large (incremental) | Med-High | [046](06-decisions.md#adr-046) |
| R7 | Decide constraint→DOF binding once jointly (retire greedy `driveOrCheck` + after-failure recruit) | High | Large | Medium | [045](06-decisions.md#adr-045) |
| R8 | Geometric (not positional) branch identity; generalize the `avoid` one-off | Medium | Medium | Medium | [045](06-decisions.md#adr-045) |
| R9 | LLM context: `absorb` circle-coverage + mutable `circleMembers` | Medium | Small | High | [046](06-decisions.md#adr-046) |

> Ordered by leverage; effort is honest, not optimistic.

### R1 — Expose resolved geometry in `EvalOk` (do this first)

**Problem.** The renderer is meant to be a pure consumer, but `scene.ts:117` `lineGeometry` is a verbatim re-implementation of `evaluate.ts:696` `resolveLine` (its own comment admits it "mirrors the engine's `resolveLine` … because the engine doesn't expose its internal resolution"), and `scene.ts:209–221` re-derives circle radius *including the non-trivial tangent-inner formula*. They have **already diverged**: the engine reads any resolved outer circle (`evaluate.ts:682`) while the renderer gates on `outer.radius.via === 'length'` (`scene.ts:214`), so a tangent-inner circle with a `via:'through'` outer renders nothing; the engine returns descriptive errors where the renderer silently returns `null`. The data is already built and thrown away: `evaluateCore` holds populated `lines`/`circles` maps (`evaluate.ts:586–587`) but `EvalOk` (`evaluate.ts:39–42`) returns only `{ positions }`.

**Generalization.** Add `lines: Map<Id, ResolvedLine>` and `circles: Map<Id, ResolvedCircle>` to `EvalOk`; export the two file-local interfaces; include the maps in both `ok:true` returns. Thread them through `Derived` (`geoStore.ts`) into `buildScene`; **delete** `lineGeometry` and the radius re-derivation.

**Collapses.** The 5-case line switch and the tangent-inner/through radius math become one source of truth; the standing renderer-vs-engine divergence is eliminated; any future `Line.via` or `RadiusSpec` mode is added once, in `evaluate`.

**Risk / caveat.** Purely additive — positions unchanged, so determinism and stability are untouched. **One correction to the naive "just `.get(id)` it" framing:** `Figure.tsx:138–141` applies `orient()` to positions *before* `buildScene`, so the renderer must orient the resolved geometry too (orient `anchor`/`center` as points; rotate + component-flip `dir`; `r` is invariant). A few presentational lines, not a literal drop-in. Keep the genuinely-presentational parts in the renderer: arc sweep/largeArc flags, the line-trim-to-extent pass (`scene.ts:246–257`), and the autoCenter/hidden draw-gating. Add a guard test asserting `scene` geometry equals `evaluate()`'s resolved values (modulo orientation) so they can't silently re-diverge.

**Why first:** highest value-to-risk ratio in the audit, and it teaches the codebase the pattern "the engine owns geometry; the view consumes it."

### R2 — One engine-owned `branchable` source (and a deliberate decision on on-segment-solved)

**Problem.** "This point has cyclable discrete branches" is enumerated three times over two spaces, and the lists **do not match**: `step.ts:613` `BRANCHABLE` has 5 object kinds *including* `on-segment-solved`; `App.tsx:264` and `scenarios.test.ts:654` `BRANCHABLE_KINDS` have 4 — **dropping `on-segment-solved`**; `geoStore.ts:446` is a 4-element *command-type* set. The test is a verbatim copy of the stale UI literal, so it encodes the very drift it should catch.

**Generalization.** Export one canonical `firstCyclableBranch(c): Id | undefined` from the engine; have `App.tsx` and `scenarios.test.ts` call it instead of re-listing kinds. Give `geoStore.cycleAlt` an engine-owned object-kind→command-type table.

**Honest correction to the headline.** "It's already cyclable, just relocate the predicate" is **overstated**: `on-segment-solved` is *not* persistable through replay — `apply.ts:48` synthesizes `branch: 0` fresh on every `applyCommand`, and `point-on-segment`/`set-angle` commands carry no `branch` field. So cycling steps a transient branch that replay immediately resets to 0; `sample.ts` `freeDofs` also excludes the kind. **Therefore split this:** (a) ship the dedup now (pure, zero behavior change) and *keep* `on-segment-solved` out of the user-facing set with a comment; or (b) commit to making it genuinely cyclable — add `branch?: number` to `point-on-segment`, thread `cmd.branch ?? 0` through `apply.ts:48`, and add a regression test that builds a two-root figure and asserts `t` actually flips **after replay**. Do not bill (b) as a free predicate move.

### R3 — Centralize the carrier descriptor; make `POINT_KINDS` compiler-checked

**Problem.** §3 item 1, in full. A forgotten copy is a silent dropped DOF.

**Generalization, two independently-valuable pieces.**

*Piece 1 (free, do regardless):* derive `type GeoPointKind = GeoPoint['kind']`; type `POINT_KINDS` from a `const POINT_KIND_LIST = [...] as const satisfies readonly GeoPointKind[]` with a paired exhaustiveness `Record<GeoPointKind, true>`, so a union member forgotten in the list is a **compile error**. Collapse the two `solve?` shapes (`SolveDirective` at `types.ts:47,69,221,300` vs the inline `{constraint;branch}` at `124,138,150`) into the one named `SolveDirective`; this removes the `as { solve?: unknown }`/`as GeoObject` casts and lets one `hasDriveDirective(o)` helper replace ~10 inline `o.solve === undefined` tests.

*Piece 2 (small `carriers.ts`):* `carrierOf(o): Carrier | null` with `{ kind, dofCount, isParametric, preferenceRank, eligible(o,pinned), seed(), scale(span), jitter(), read(), write(o,vals) }`, **seeded verbatim from the existing `carrierSpec`/`setCarrierVals`/`sample.ts` tables** (on-circle spin+jitter, perp 0.55–1.85×, scaled 0.3–0.85, rotated 40–140°, angleDeg scale 90 — figure-tuned, copy them, do not flatten). Then the four `resolveDriven` filters, `freeDofs`, `rawMovableDof`, `freeDrivableAncestors`, and `markDriven` all read `carrierOf`.

**Scope limit (load-bearing).** Leave `driveOrCheck` as a thin ladder that *consults* `carrierOf`'s `preferenceRank` but keeps two asymmetries a flat ranking would lose: (1) the on-segment → `on-segment-solved` **kind mutation** (`apply.ts:48`), which takes a different placement path (`evaluate.ts:820`); and (2) the **per-tier eligibility predicates** (free-point checks `!rigid`; shape/on-segment check `!pinned`; on-circle/on-line don't). The preference order is genuinely load-bearing — on-line beats on-circle so `"AC ⟂ TC"` moves the marker, not the tangency point (`apply.ts:51–54`). Encode those as `carrier.eligible(o, pinned)` if you want them table-driven, but verify with a before/after corpus coordinate snapshot.

### R4 — One SHAPES registry; make reuse a structural predicate

**Problem.** §3 item 2. Plus eight near-identical shape arms (`apply.ts:361–447`) differing only by a template literal and one derived-vertex line, and five 0-DOF kinds (`derived`, `parallelogram-vertex`, `perp-offset`, `rotated`, `scaled-offset`) that all encode "the computed corner of a quad" — three of them literally `base + linear-map(to−from)` (`evaluate.ts:796–818`).

*Stage 1 (do now, kills the confirmed circumcircle-class bug):* replace the `isShape` literal with a structural `reusesBase(cmd)` — mark the free-points that `applyCommand(empty, cmd)` produces via `placeBase` and skip the conflict for those ids, so `commandConflict` **consumes apply's own output** instead of a parallel list. Derive `DERIVED_SLOTS`/`POINT_PLACEMENTS`/`shapeKinds` from one `SHAPES` registry keyed by role. Add a guard test: `reusesBase(cmd)` is true for every command whose apply arm calls `placeBase`/`upsertCircle`. This makes the false-conflict class structurally impossible.

*Stage 2 (defer behind corpus tests):* fold the five vertex kinds into one `DerivedVertex { anchor, from, to, param: {kind:'dist'|'angle'|'ratio', value, flip?} }`. **Do not collapse to a bare `Mat2`** — each kind carries a different *drivable scalar* with per-kind seed/scale the [ADR-033](06-decisions.md#adr-033) solver and sampler read (scale 90 for angle, `|dist|`, 0.5 floor for ratio). `parallelogram-vertex` (a+c−b, 3 points, no flip) correctly stays separate. The renderer never references these kinds, so the swappable boundary is unaffected.

**Risk.** Stage 1 touches only apply-time/conflict-time classification — no coordinates, branches, or determinism. Stage 2's risk lives in seed coords + the drivable-scalar parameterization, which is why it is second.

### R5 — Consolidate the three DOF solvers

**Do now (low-risk, no behavior change):** (1) extract one exported `isSatisfied(con, get)` and replace all four copies. (2) Extract the shared scaffold (dedup + `withOrderCons` + Nelder-Mead/polish/seed-fallback) into one helper the three bodies call as thin configs. (3) Pick **one residual convention — the relative one** ([ADR-033](06-decisions.md#adr-033) Am.1 already declares it un-gameable) — and apply it to `resolveFreeDriven`. (4) Pick **one degeneracy policy** (hard `degenerateSpread` + seed fallback, exempting `coincidePairs`).

**Do NOT yet:** physically route pure-parametric multi-carrier cases through `resolveMixedCarriers` and delete the coupled block. Verification found a genuine **capability loss**: the coupled block runs a full-range grid-scan coordinate-descent start (`evaluate.ts:207–222`, scanning `[0,1]`/`[0,2π]`) before Nelder-Mead, whereas `resolveMixedCarriers` uses cardinal restarts of `±{0.5,1,2}` and gives parametric carriers `scale=[1]` — so it perturbs θ by only ±2 rad and **cannot reach a satisfying branch on the far side of a circle**. Routing everything through it would regress `adr028-driven` and `cyclic-quad` figures. The merge is a *refactor-plus-port*: first give `resolveMixedCarriers` a per-bounded-DOF grid-scan seeding step (port `207–222`), then merge. Keep the single-1-D `drivenRoots` path (`117–130`) as the fast path — it is the only thing that gives clean discrete-root cycling for "show another configuration."

**Gate.** A dedicated driven-solver stability harness asserting `maxDelta` ≈ 0 on pre-existing vertices before/after, across the adr028/cyclic-quad/shape-dof figures.

### R6 — Parser: collapse the `=`-RHS cascade; lift construct-vs-constrain into IR normalization

**Do first — part (a), highest value / lowest risk:** fold the 8 `=`-RHS rules into **one** `XY = <rhs>` rule backed by `parseLengthRHS(expr)` returning a typed value (`number | π·k | k√r | k·varⁿ | ratio | equal-ref`), with an "unreadable" discriminant the single rule maps to `'stop'`. This converts an ordering accident into a structural property and makes the documented half-parse class ([ADR-024](06-decisions.md#adr-024)/[ADR-026](06-decisions.md#adr-026)) impossible. Add the ordering-invariant test and the missing √/sqrt coverage case (currently absent from `parser-coverage.test.ts`).

**Then — part (b), incrementally:** the engine **already** has the generic construct-vs-constrain home — `reinterpretAsConstraint` + `POINT_PLACEMENTS` (`step.ts:464–482`) auto-lowers a re-definition into a `coincide` constraint driving a free DOF. So this is *not* "build a new pass"; it is "stop pre-deciding existence in the parser and let the existing engine reinterpretation be the single home." Have the point-placement forks (`perpBisector`, `perpendicularLine` foot, `circumcircle`, `inscribedPolygon`, `ensureTriangles`) emit always-construct. The topology-divergent forks (`secantFromExternal`, `tangentFromExternal`) emit a *different segment topology per branch*, so they need a richer intent tag than a reuse boolean — treat them as a second, smaller family. **Fold the parser into the reinterpret chain; do not delete it.**

**Correction to the audit's own framing:** the "doc-11 §72 coordinate-boundary violation" claim is **dropped** — `App.tsx:147–151` feeds the parser `construction.objects` and `circleMembers` (computed purely from declared kinds/parents, `step.ts:563–587`), **never coordinates**. The accurate critique is "the parser branches on prior-figure *structure*, duplicating existence logic the engine already owns." Keep `scenarios.test.ts` as the acceptance gate; do it rule-family by rule-family.

### R7 — Decide constraint→DOF binding once (the deepest rework — gate it)

**Problem.** Carrier selection is split across two phases that silently override each other: `driveOrCheck` commits one carrier greedily at apply time; after `evaluate` fails, `recruitFreeDofs` (`step.ts:365`) walks ancestors to recruit more — its own comment admits "driveOrCheck may have picked a carrier that can't actually move the constraint (a rectangle's |AD| drives A, but |AD| is the height behind D)." Three near-identical walkers exist (`freeCarrierAncestors`, `freeDrivableAncestors`, `freeCarrierAncestor`), and the diameter case spawned two bespoke siblings (`replaceCyclicForDiameter`, `reinterpretDiameter`) tried in a fixed `?? ?? ` chain (`step.ts:144`).

**Split into three pieces by risk:**
- *(1) Cheap, now:* collapse the three walkers into one parametrized `ancestors(objects, start, {terminals, traverseLines, mode})`. `freeDrivableAncestors` is already the superset; pure refactor.
- *(2) Medium:* fold `reinterpretDiameter` into `reinterpretAsConstraint` (near-duplicate coincide-driving path), but **keep `replaceCyclicForDiameter`** for now.
- *(3) Hard, gated:* unify the apply-time pick and the recruit. **Do not just "make recruitment the only path"** — `driveOrCheck`'s tier order encodes same-residual disambiguation the joint solver *cannot* recover (both choices satisfy the identical residual). Keep `driveOrCheck` as a deterministic **priority hint/tie-break weight**; let one walker supply the full candidate set; and add a **real per-DOF stay-put penalty** — the current regulariser is `λ=1e-3` and its own comments say it "only breaks ties on the solution manifold, never competing with driving the residual," so it does **not** hold over-recruited DOFs near seed. Gate behind the `maxDelta` stability harness.

**Refuted sub-claim to respect:** you cannot delete `replaceCyclicForDiameter` wholesale. The θ-redistribution *can* fall out of the joint solve (verified: it reproduces the antipodal spread), but the function also **converts D to a structural `antipode` object** (`step.ts:242`) so a *later* constraint can't grab D and scramble the diameter. The adversarial probe showed that without that structural pin, a follow-up `∠BDA=24°` step fails (17.9° vs 24°, `step.ok=false`), which would break `scenarios.test.ts:293` (bagrut-4d) and `cyclic-quad.test.ts:150`. The θ-spread can go; **the antipode pin must remain or migrate into a first-class persistent "antipodal" relation first.**

### R8 / R9 — Opportunistic

- **R8 (branch identity):** the stored `branch` indexes a position in a numerically-ordered list whose order flips as the figure flexes (`% n` silently re-selects a geometric branch). Land the cheap fallback first — extract the `avoid` block into a shared `otherCrossing(sols, pos, referenceId)` used by both line-circle and circle-circle, retiring the line-circle-only `avoid` and the `step.ts:606` special case. Then, where it pays (line-circle benefits most), carry a **signed-side geometric key** so `branch` selects "the + side." Note honestly: circle-circle's order is robust under continuous rigid motion and is currently masked by a `cyclableBranch=false` workaround — frame that half as removing latent fragility, not fixing a live break. Write the property test first; keep the honest coincidence error at tangency.
- **R9 (LLM context):** the real root cause is broader than "frozen `circleMembers`": `absorb` (`llm.ts:34`) registers only `circle`/`circle-through` into `circles`, *not* `circumcircle`, so a plan `["circle through A B C", "M is the midpoint of arc BC"]` drops step 2. Add the missing circle-introducing types to `absorb`, make `circleMembers` a mutable local that accumulates on-circle outputs, and add the regression scenarios. The subscripted-id widening (`/^[A-Z]$/` vs the parser's `[A-Za-z]\d*`) is real but *latent* — `llmShared.ts:59` forbids the model from emitting `O1` — so do it as cheap hardening, not a live bug.

---

## 5. Test strategy shift — from per-figure memorization to invariants

The methodology currently **amplifies** the patch loop: a NON-NEGOTIABLE "every reported bug becomes an end-to-end scenario" rule produces a monotonically growing example suite (24 additive commits, 0 removals; ~26 scenarios), while the only general asset — the 343-case campaign — is **positive-only by construction** (generators tightened until "the sweep stopped finding bugs"; `campaign.test.ts` has exactly two `.toBe(true)` assertions and zero rejection assertions). `fast-check` and Playwright were specified in [ADR-008](06-decisions.md#adr-008) / the strategy doc and **never adopted** (absent from `package.json`). The universal promises — stability, determinism, distinctness, replay-equivalence — are each pinned by a handful of hardcoded fixtures and tested on no generated figure. That is precisely why bug *classes* are discovered one figure at a time.

**Add a property layer over the existing seeded campaign generators + `_invariants.ts`, in three tiers by difficulty.** (Captured in [ADR-047](06-decisions.md#adr-047).)

**Tier A — easy, safe, do now (read-only post-checks; would have caught real classes):**
- **Determinism:** `build(cmds)` twice, assert positions deep-equal. The engine is pure (mulberry32, no `Date`/`Math.random` in evaluate), so this is genuinely free.
- **Distinctness:** blanket pairwise-separation post-check in the campaign loop (`campaign.test.ts:565`), removing per-family `.distinct` opt-in.
- **Replay-equivalence:** wrap each campaign command list as enabled Facts, run `replay()`, assert positions match `build()`. **Currently untested entirely** — `build()` (campaign) and `replay()` (scenarios) are exercised in disjoint suites and are *independent folds* (`lower()` whole-list symtab vs `lowerOne()` per-fact + owned/broken cascade), so divergence is possible and would have surfaced bug classes structurally.

**Tier B — negative-space corpus (the missing correctness gate for a teaching tool):**
- An **algebraic over-constraint** generator: take a valid, fully-determined figure, measure a true length/angle with the `inv` library, append a `set-distance`/`set-angle`/`set-equal` differing by > tolerance, assert `evaluate(...).ok === false` *and* prior-figure preservation. This hits the pure check path (`evaluate.ts:660–667`), so rejection is **guaranteed by construction**. Collapses the scattered F3 / redefinition-conflict one-offs into one family.
- A **threshold-agreement probe** (a probe, not a pure gate): drive a length → 0 / force two points together / collinear-triangle seed, generated at several spans (≈1, 100, 1e4), routed deliberately through the three inconsistent anti-collapse paths to surface whether `0.04*span`, `1e-3*span`, and the absolute `LEN_EPS=1e-6` still agree at large span (they almost certainly don't — that itself is a finding worth an ADR). Keep contradictions *provably* unsatisfiable, never merely "visually degenerate."

**Tier C — harder, scope honestly (not "~80 lines"):**
- **Stability** as a generated property requires the engine to **report the set it legitimately moved** (recruited/mirrored/reinterpreted ancestors), because a naive "all prior ids frozen < ε" will false-fail on exactly those branches (`step.ts:144,161–165,175` deliberately move them). Add a small `applyStep` diagnostic (`movedAncestors`) so the frozen set = prior-defined ids minus that set. Then adopt `fast-check` with the seeded shrinker for the branch/resample-stability family — driven off the **single** `firstCyclableBranch` from R2, not a re-listed allow-list.

**Demote, don't delete, the scenario rule.** Amend `CLAUDE.md` so the *first* response to a bug is "extend a campaign family's generator range or add an `_invariants.ts` predicate so the suite turns red"; add a scenario only for bugs the engine campaign cannot reach (parser rule-ordering, parse-with-context threading, LLM decomposition, store/resample orchestration). Two corrections: the property infrastructure **already exists** (`campaign.test.ts` + `_invariants.ts`, built 2026-06-12) — do not block on a new suite; and the generalize-first mandate **already exists** at `CLAUDE.md:37` — the real gap is that nothing makes "extend the property suite" the path of least resistance. **What actually shrinks:** the *pure-geometry invariant* each scenario asserts migrates into a campaign family, but the scenarios that carry `{llm:[...]}` steps or drive the store **stay** as pipeline coverage. Add a meta-test that fails if `scenarios.test.ts` grows without a paired campaign-family/invariant change.

---

## 6. Sequenced plan (Phase 6 deferred — "full working tool first")

By operator decision (2026-06-17), **Phase 6 (theorems) is deferred** until the diagramming tool is fully working. The waves below are the consolidations that make the tool stop breaking case-by-case; they *are* the path to "a full working tool," not a detour from it.

**Wave 1 — free / near-free, ship immediately (days):**
- R1 (resolved geometry in `EvalOk`).
- R3 Piece 1 (`POINT_KINDS` compiler-checked + unify `solve?` to `SolveDirective`).
- R2 dedup (export `firstCyclableBranch`), with an explicit decision recorded on the on-segment-solved gap.
- R5 cleanups (1)–(2): `isSatisfied` + shared solver scaffold.
- Test Tier A (determinism, distinctness, replay-equivalence).

**Wave 2 — medium, gated by Wave 1 (weeks):**
- R3 Piece 2 (`carriers.ts` + route the readers through `carrierOf`), with the corpus coordinate-snapshot gate.
- R4 Stage 1 (`reusesBase` structural predicate + SHAPES registry; kills the circumcircle-class bug permanently) + its guard test.
- R6 part (a) (the `=`-RHS collapse + `parseLengthRHS` + ordering-invariant test + √ coverage).
- R5 (3) (one residual + one degeneracy policy).
- R9 (LLM `absorb` coverage).
- Test Tier B (negative-space algebraic over-constraint + threshold probe).

**Wave 3 — large, each behind its own stability harness (deliberate, unhurried):**
- R6 part (b) (construct-vs-constrain → fold parser into the existing reinterpret chain, family by family).
- R7 pieces (1)→(2)→(3), in that order; the solver port from R5 must land before R7(3).
- R8 (geometric branch keys) — property test first.
- R4 Stage 2 (`DerivedVertex` fold).
- Test Tier C (engine-reported `movedAncestors` + `fast-check` stability family).

**What NOT to do now:** do not route all driven carriers through `resolveMixedCarriers` before porting its grid-scan seeding (R5 caveat); do not delete `replaceCyclicForDiameter`'s antipode pin (R7 refuted sub-claim); do not touch `solve.ts`'s residual switches, `evaluateCore`, `geometry.ts`, the replay fold, `fitTemplate`, or the label scorer (§2).

---

## 7. Open questions for the operator

1. **on-segment-solved cycling (R2):** is a "show another configuration" button for an angle-along-a-segment point a feature you actually want? If yes, it's a command-field + reducer change (R2 option b); if no, document it out of the UI.
2. **Anti-collapse thresholds at large coordinate spans (Tier B probe):** if the probe confirms `0.04*span` / `1e-3*span` / absolute `1e-6` disagree at span ≈ 1e4, make all three span-relative, or is there a deliberate reason the final coincidence guard is absolute? Needs an ADR either way.
3. **The scenario-growth meta-test (§5):** enforce "no new scenario without a paired campaign/invariant change" as a CI gate? It is the only thing that makes the demotion stick under time pressure — but it adds friction to the fix loop.
4. **Determinism-reuse rule:** confirm it should be written into the rework ADRs as a hard constraint (any new ordering must reuse `circleCircleIntersect`/`solveParam`).

---

**Bottom line:** the foundation is right and several layers are genuinely excellent. The instinct that the engine has been patched case-by-case is correct, but the cause is narrow and nameable — four hand-synced enumerations and one fractured solver — not the constructive model. Consolidate those toward the clean layers that already exist, and shift testing from per-figure memorization to invariants.

---

## 8. Progress tracker (resume pointer)

_Branch `rebuild-foundation` · **959 tests green**, `tsc` + `vite build` clean · all commits pushed to GitHub `dcodish/geo_builder` · last updated 2026-06-17._

**Wave 1 — DONE & pushed** (commit `0917cf2`; docs `e25b75a`):
- [x] **R3 Piece 1** — `POINT_KINDS` compile-checked via `Record<GeoPointKind,true>`; the two inline `solve?` shapes unified to `SolveDirective`.
- [x] **R1** — engine owns line/circle resolution (`resolveLine`/`resolveCircle` exported); renderer calls them, divergent copy deleted; fixed the tangent-inner render bug.
- [x] **R5(1)** — one exported `isSatisfied(con,get)` replaces the 4 byte-identical gates.
- [x] **R2** — a constraint-driven on-segment point is genuinely cyclable AND survives `replay` (`branch` on the command → `solveBranch` on the object); one engine-owned `firstCyclableBranch`.
- [x] **Test Tier A** — determinism + build()/replay() equivalence over the 343-figure campaign.

**Wave 2 — DONE & pushed:**
- [x] **Stability snapshot harness** (`44f29f3`) — golden config of 9 driven figures; **the gate for all solver/carrier work**.
- [x] **R4 Stage 1** (`0af6c6d`) — `commandConflict` reuse derived structurally (`reusesBase`); circumcircle false-conflict class killed.
- [x] **R9(a)** (`253dd6b`) — LLM `absorb` registers a circumcircle centre.
- [x] **R3 Piece 2** (`62c7b22`) — `carriers.ts` `carrierOf` exhaustive classifier; routed the drift-prone kind-lists through it. **Adversarially verified EQUIVALENT.**
- [x] **Tier B** (`87de166`) — negative-space over-constraint coverage (guaranteed-contradiction figures).
- [x] **R6(a)** (`ab6079c`) — anchored the greedy `=`-RHS rules; prefix half-parse class structurally closed (+ √ coverage tests).
- [x] **R5(3)** (`791e4e3`) — `resolveFreeDriven` uses the relative residual (one convention). **Adversarially verified SAFE**; 1 snapshot figure moved to an equivalent valid config (reviewed + accepted).

**Wave 3 + leftovers — NOT STARTED** (each its own focused pass; **all gated by the stability snapshot**):
- [ ] **R5 scaffold/merge** — extract the shared Nelder-Mead scaffold across the 3 solver bodies + merge the coupled block into `resolveMixedCarriers`. ⚠️ **PORT the coupled block's full-range grid-scan SEEDING first** (`evaluate.ts:207–222`), else far-branch parametric figures (adr028-driven, cyclic-quad) regress. Also fold the coupled block's soft-barrier degeneracy onto `degenerateSpread`.
- [ ] **R7 binding** — decide constraint→DOF binding once (retire greedy `driveOrCheck` + after-failure `recruitFreeDofs`; one ancestor walker). ⚠️ **Keep `replaceCyclicForDiameter`'s antipode pin** (or migrate it to a first-class persistent relation FIRST) — deleting it breaks bagrut-4d / cyclic-quad (audit-confirmed). Keep `driveOrCheck` as a tie-break + add a real per-DOF stay-put penalty.
- [ ] **R8** — geometric (signed-side) branch keys; first extract the `avoid` one-off into a shared `otherCrossing`. Property test first.
- [ ] **R4 Stage 2** — fold the five 0-DOF vertex kinds into one `DerivedVertex` (NOT a bare `Mat2` — each carries a drivable scalar). Behind corpus snapshot.
- [ ] **R9(b)** — accumulate `circleMembers` across LLM steps (running construction + the engine's `circleMembers`).
- [ ] **R6 full fold** — collapse all 7 `=`-RHS rules into one `parseLengthRHS`; only if a real misparse appears (anchoring already closed the harm).
- [ ] **Test Tier C** — engine-reported `movedAncestors` diagnostic + `fast-check` stability family + the coordinate-span threshold probe (would also pin R5(3)'s one residual risk).

**Open questions resolved (2026-06-17 discussion):** R2 cycling = a feature (built); thresholds = small figures, small fixed value (no relativization); scenario-growth meta-test = accepted (build once Tier-A/B exists); determinism-reuse rule = accepted. Drag/preview design = [ADR-048](06-decisions.md#adr-048) (Phase 8). **Phase 6 (theorems) is deferred** by operator decision — full working tool first; the rework above is the path to it.

**To resume from home:** `git pull` on `rebuild-foundation`; read this §8 + the top of [PROJECT-MEMORY.md](PROJECT-MEMORY.md) (the 2026-06-17 Wave 1/Wave 2 session-log entries have the per-item detail + gotchas). Each ADR ([043](06-decisions.md#adr-043)–[047](06-decisions.md#adr-047)) carries an "Implemented" note matching the above. `npm install` (node_modules not in git), then `npx vitest run` should show 959 green.
