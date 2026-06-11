# 06 — Decision Log (ADRs)

_Last updated: 2026-06-10. Each entry records a decision, its context, and consequences. Add a new entry (don't rewrite history) when a decision is made or reversed._

---

## ADR-001 — Rebuild the engine as a constructive / dependency-graph model

**Status:** Accepted (2026-06-10)

**Context.** The original engine was a *shape-template matcher*: it recognized "this is a square / triangle" and placed vertices analytically. It dead-ended — it could not represent free points, points-on-objects ("G on AD"), arbitrary accumulating constraints, or enumerate alternative configurations. These are the three features most central to the product vision.

**Decision.** Rebuild as a **constructive / dependency-graph engine** (GeoGebra-style in spirit): every object is defined in terms of earlier ones; positions are computed by topological evaluation. Considered and rejected: a **numerical residual solver** (general, but less stable, figures jump, alternatives are fuzzy, failures hard to explain).

**Consequences.** Points-on-objects and free points become first-class (DOF model). Alternatives fall out of intersection branch choices. Stability becomes structural (persistent DOF/branch indices) rather than heuristic. Over-constraint detection becomes general. The old template/triangle/quad solver is discarded.

---

## ADR-002 — Input via parser-first, LLM-fallback behind a narrow boundary

**Status:** Accepted (2026-06-10)

**Context.** The product must be free to distribute, work offline, and not depend on a paid service for the common case. The old design called the LLM first with a regex fallback and shipped the API key in the browser.

**Decision.** Define a single `utterance → command[]` boundary. A **deterministic grammar parser runs first** (free, offline) and handles common phrasings; only inputs it can't handle **escalate to the Claude API**. The engine is agnostic to which path produced the commands.

**Consequences.** ~70–90% of inputs are expected to be handled locally at zero cost and zero latency. The LLM becomes optional and swappable. Requires building and maintaining a real grammar (risk R2 in the design doc).

---

## ADR-003 — LLM = Haiku 4.5; key behind a gated proxy; bounded cost

**Status:** Accepted (2026-06-10)

**Context.** Operator (David) is first-time with API billing, wants to give the tool away, and "has no motivation" to absorb open-ended cost. A browser-embedded key is both a cost and a security liability.

**Decision.** For the fallback, use **`claude-haiku-4-5`** (sufficient for short structured geometry parsing; ~10× cheaper than Opus/Fable, which add no quality on this task). The key lives **only in a server-side proxy**; the proxy is gated (per-class code) and rate-limited. Enforce a prepaid credit ceiling, a Console monthly spend limit, usage alerts, low `max_tokens`, and a lean prompt. A claude.ai **subscription cannot** power a distributed app's API calls — confirmed; not an option.

**Consequences.** Realistic exposure for a small utility is a few dollars/month and structurally incapable of surprising the operator. Requires running a small proxy (serverless is fine). Dev cost is negligible; use a separate dev key with its own cap.

---

## ADR-004 — Render with hand-rolled SVG (not JSXGraph, not Mafs)

**Status:** Accepted (2026-06-10)

**Context.** The engine is now the single source of truth, so the render layer only needs to *draw* its output. JSXGraph's value was its geometry *logic*, which is being replaced; its imperative API forced the old `BoardReconciler` sync layer. Mafs (a React math-viz lib) was considered.

**Decision.** Render with **hand-rolled SVG via React**, declaratively from engine output. Mafs rejected because it targets function-graphing — the geometry-specific visuals a construction tool needs (angle arcs, right-angle marks, equal-side ticks, dashed cevians, labels) aren't built-ins, so they'd be hand-drawn anyway; Mafs would only cover grid + pan/zoom (a small one-time chunk) at the cost of an external dependency.

**Consequences.** No imperative reconciler. Full control over geometry visuals. The renderer consumes engine output only, so it stays **swappable** — this decision is low-stakes and reversible without touching the engine.

---

## ADR-005 — Rebuild from scratch; archive the old implementation

**Status:** Accepted (2026-06-10)

**Context.** The existing code is built around the template engine that dead-ended. It's more useful as a requirements reference than as a foundation.

**Decision.** Keep the stack scaffolding (React + Vite + Zustand + TS, i18n, styles) and **rebuild the domain code from scratch**. Move the entire old implementation to `archive/` (outside `src/`, not compiled) for reference.

**Consequences.** Clean slate that compiles. Old tool schema and theorem predicates remain available as reference in `archive/`. `CLAUDE.md` and these docs describe the target design and current (scaffold-only) state.

---

## ADR-006 — v1 scope is "broader v1", with theorems included

**Status:** Accepted (2026-06-10)

**Context.** Choosing how much to deliver in the first usable version.

**Decision.** v1 covers triangles, quadrilaterals, circles; free / on-object / intersection / midpoint / foot points; distance, angle, right-angle, parallel, perpendicular, equal-segment constraints; height/median/bisector/perp-bisector/midsegment special lines; the alternatives toggle; **and** the theorem-surfacing panel (theorems are in v1, not deferred). Build order still front-loads the engine-core slice to de-risk before going broad.

**Consequences.** A capable first release, but a longer first build. The build order (Design §10) mitigates risk by proving the core vertically before expanding coverage.

---

## ADR-007 — Planning/design work runs on Opus 4.8 (Fable not warranted)

**Status:** Accepted (2026-06-10)

**Context.** Whether to use the top-tier model (Fable 5) for the design/planning sessions themselves.

**Decision.** Use **Opus 4.8** for planning. Fable 5 is a marginal upgrade at ~2× cost for a task Opus 4.8 already handles at a high level; planning is low-volume and the operator's own dev cost, so the gap isn't worth it. (Distinct from the *app's* runtime model, which is Haiku — see ADR-003.)

**Consequences.** None material; revisit only if a planning task proves genuinely frontier-hard.

---

## ADR-008 — Tests gate the build; "ready" has a definition

**Status:** Accepted (2026-06-10)

**Context.** The operator wants a testing strategy and a defined set of passing tests before anything is called "ready" — trustworthy "ready", not optimistic claims.

**Decision.** Adopt [`08-testing-strategy.md`](08-testing-strategy.md): Vitest for unit/integration/component, fast-check for invariants (proposed), Playwright for headline E2E (proposed). The engine (pure, deterministic) is tested hardest; the LLM fallback is **mocked** — no live API calls in CI. Each build step has an acceptance gate; nothing is "ready" until its gate passes, `tsc`/build are clean, and results are reported honestly (no skipped/`.only` specs hiding gaps).

**Consequences.** Slower per-step but trustworthy completion. Adds dev dependencies (fast-check, RTL/jsdom, Playwright). The stability regression is re-established as a first-class test (it guarded the old code too).

---

## ADR-009 — Redefining an existing object is a conflict, not a silent no-op

**Status:** Accepted (2026-06-10) · **Amended by [ADR-011](#adr-011--re-placing-a-free-point-is-a-move) (free points are an exception — re-placing one is a move).**

**Context.** Idempotency (FR-EN-9) was implemented by `addObj` skipping any object whose id already exists. That conflated two different cases: re-issuing the *identical* definition (a legitimate no-op) and issuing a *different* definition for an existing id (a contradiction). The latter was silently dropped — surfaced when a demo "triangle" reused the square's `A/B/C`: declaring `C` as "5 from A and 5 from B" while `C` was already the square's derived corner was ignored, yet the step still reported success. An accepted ✓ for an impossible fact is both wrong and misleading.

**Decision.** A command may **introduce** new objects but may not **redefine** an existing one. The pipeline (`applyStep`) calls `commandConflict(prev, cmd)` before mutating: it produces the command's canonical objects (against an empty construction) and, for any id already present, compares structurally — identical ⇒ idempotent no-op (accepted), different ⇒ rejected with "'X' is already defined…", keeping the prior figure (same path as over-constraint, FR-EN-8). `addObj`'s skip-if-present remains, but it is now only ever reached for genuine duplicates because conflicts are caught upstream. Considered and rejected: treating a redefinition as an in-place *move* — that conflates declaration with dragging (a Phase-8 interaction), and makes the build-by-facts flow unpredictable.

**Consequences.** Contradictory redefinitions are now caught as a distinct, explained failure class. Demo quick-facts are additionally gated in the UI so an inapplicable command can't be issued in the first place (defence in depth; the engine guard is the real safety net). Covered by engine tests (conflict rejected + prior kept; pure-add and identical re-issue still pass).

---

## ADR-010 — Facts are individually selectable/deselectable/deletable; the figure is derived by replay

**Status:** Accepted (2026-06-10)

**Context.** A student needs to revisit a fact they entered — fix a mistake, or experiment with the impact of removing it. The Phase-3 store kept the *accumulated construction* as its source of truth, which can represent "all facts so far" but not "this fact exists but is currently off," and offers no handle on an individual earlier fact.

**Decision.** Make the **ordered list of facts the source of truth**; derive the figure by **replaying the enabled facts** through the engine (`replay`). Each fact carries an `enabled` flag. Three operations: **select** (highlight the objects the fact introduced, on the canvas — UI-only, not undoable), **deselect/select** (toggle `enabled`; the figure re-derives), **delete** (remove the fact). When a deselected/deleted fact is depended on by a later fact, the dependent **auto-drops** (it fails to apply during replay and is flagged inactive) and is **restored** when the dependency returns — chosen over *blocking* the action or *cascading* deletes, because it best serves "experiment and see the impact" and loses nothing (reversible). Branch choices for alternatives live in the fact's command, so cycling = editing that fact and re-deriving. Undo/redo tracks the fact list (toggle/add/delete/cycle are all fact edits); selection is excluded from history via `partialize` + an `equality` guard so highlighting doesn't pollute undo.

**Consequences.** Deselect is trivially reversible; delete is clean; the model is closer to the constructive ideal (a program of construction steps, not a baked figure). Positions stay derived (not stored), so undo can't desync coordinates from facts. Slightly more compute (replay on every change) — negligible at v1 sizes; can be memoized/incrementalised later if needed. This generalises naturally to future reordering/editing of facts.

---

## ADR-011 — Re-placing a free point is a move

**Status:** Accepted (2026-06-10) · amends [ADR-009](#adr-009--redefining-an-existing-object-is-a-conflict-not-a-silent-no-op)

**Context.** ADR-009 treated *any* re-declaration of an existing id as a conflict, explicitly rejecting the "in-place move" reading. In use that surprised: a `square ABCD` places `B` at the default `(5,0)`; typing `point B at (6,0)` was rejected as "B is already defined," even though B is a **free** point and relocating it is geometrically fine (the square just resizes — `C`,`D` are derived from `A`,`B`). The user asked "what prevents B being at (6,0)?" — and the honest answer was "only our guard, not geometry."

**Decision.** A **free point** (and only a free point) may be re-placed: re-issuing `free-point` for an existing free point **updates its coordinates** — a *move* — provided the resulting figure stays valid (`evaluate` still succeeds; an over-constraint or broken dependency rejects and keeps the prior figure). Re-declaring a **derived / on-object / intersection** point as something different remains a conflict (ADR-009 stands for those): those points are *defined* by other objects, so "moving" them is meaningless. In the store, a reposition **updates the existing free-point fact in place** rather than stacking rows, and is undoable/deletable like any fact (deleting the move reverts to the original definition). This is distinct from, and complementary to, **drag** (Phase 8): drag is a pointer gesture on the canvas; this is the typed/command path to the same end.

**Consequences.** Typed repositioning works and reads naturally; the build-by-facts flow stays predictable because only free points (the things that genuinely have positional freedom) can move. When constraint-driven solving lands ([ADR-012](#adr-012--constraints-may-solve-a-free-dof-constructively-phase-5)), a move that would violate a constraint is rejected by the same `evaluate` gate. Covered by engine + store tests (move resizes the square and stays valid; derived points still conflict; deleting the move reverts).

---

## ADR-012 — Constraints may solve a free DOF constructively (Phase 5)

**Status:** Accepted (2026-06-10) · **implementation generalised by [ADR-014](#adr-014--constraint-driven-solving-is-one-generic-mechanism-not-a-point-kind-per-combination)** (2026-06-11) — an angle that references a point-on-segment (as its vertex *or* a ray endpoint) now solves the parameter `t` (deterministic scan + bisection, branch-indexed, reverts on delete via replay). Remaining cases (on-segment as a *ray*, free-point DOFs, distance/parallel/perpendicular drivers) still to come, on the ADR-014 mechanism.

**Context.** Phase 1 implemented the angle constraint as a satisfiability **check** only: the referenced points are already determined, so a constraint can only confirm or contradict. This collides with the vision (FR-EN-3/-4/-5: distance, angle, right-angle, parallel, perpendicular, equal-segments are meant to *shape* the figure). Concretely: with a square `TYUI` and `G` on `IU` at the default midpoint, `angle UGY = 50°` is rejected (the figure says 63.4°) — even though `G` has one free parameter and sliding it to `t≈0.16` would make the angle exactly 50°. The engine never looked, because it doesn't *solve* constraints.

**Decision.** When a constraint references a point that still has a **free degree of freedom** (a point-on-object's parameter `t`, or a free point), the engine will **solve that DOF** so the constraint is satisfied — keeping within the constructive model rather than adding a general solver. Approach: targeted, **deterministic** solves — analytic where possible, otherwise bounded 1-D root-finding over the parameter range — applied as a construction step that sets the DOF. Multiple solutions (e.g. two `t` values giving the same angle) become **alternatives** (branch indices, like intersections — [ADR-001](#adr-001--rebuild-the-engine-as-a-constructive--dependency-graph-model)/FR-ALT). **Over-constraint detection still fires** when *nothing* is free to absorb the constraint (the current behaviour, for fully-determined references). Explicitly **rejected**: a general numeric residual solver over arbitrary constraint sets — that reintroduces the instability / figure-jumping / fuzzy-alternatives that ADR-001 chose the constructive model to avoid. This widens in lock-step with the rest of Phase 5.

**Consequences.** Constraints become *constructive* (they place geometry), matching how students think ("make this angle 50°") and how GeoGebra-style tools behave. Determinism and structural stability are preserved because each solve is local, bounded, and branch-indexed. Requires deciding, per constraint type, which DOF it consumes and how to enumerate solution branches — designed construct-by-construct in Phase 5. Until then, constraints over fully-determined points remain checks (today's behaviour), and the angle-on-a-free-`t` case is **not yet** supported.

---

## ADR-013 — Shapes build on existing points (composition)

**Status:** Accepted (2026-06-10) · **amended 2026-06-11** — a composed shape's *new* vertices are now fitted to the reused ones (see the amendment at the end of this entry).

**Context.** A student built `parallelogram ABCD`, then `square ADFG` — a square on the existing side A–D. It was rejected: "'D' is already defined." The `square`/`quad`/`parallelogram` commands create *all* their corners fresh (base vertices as free points), so they couldn't attach to points that already exist. But building a shape on an existing edge (a square on a triangle's side, etc.) is a routine, legitimate construction — the rejection was a gap, not a real contradiction.

**Decision.** A shape command **builds on existing points**: its **base corners reference whatever point already carries that id** (any kind — free, derived, on-object, intersection), creating a free point only for ids that don't yet exist. The default coordinates a shape assigns a *new* base vertex are an initializer, not a definition, so a base corner **never conflicts**. The shape's own **derived** corners are still new and **still conflict** if their id already exists as something different (ADR-009 holds for them). Mechanically: `applyCommand` already reuses existing points (`addObj` skips existing ids); `commandConflict` now exempts a shape's produced *free-point* (base) objects, while keeping the strict rule for derived corners and for the standalone `free-point` *move* (ADR-011). The shared edge is one segment (undirected id), and each shape keeps its own polygon.

**Consequences.** Figures **compose** — squares/triangles/quads can be built on the sides of existing shapes, and a base corner that is a derived point (e.g. a parallelogram's 4th vertex) keeps updating, so the attached shape follows. There are two squares on a given edge (one per side); the engine picks one deterministically (CCW) — making the other an *alternative* is future work. Covered by tests (square on a parallelogram edge is a valid square reusing A,D; a shape whose **derived** corner would redefine an existing point still conflicts).

**Amendment (2026-06-11) — a composed shape's new vertices are fitted to the reused ones.** The original implementation reused existing base corners but gave each *new* free vertex its absolute template default, independent of where the reused corners actually are. That collapsed any shape with a **free** non-base vertex when built on an existing edge: e.g. `triangle ABC` then `parallelogram ABDF` reused A,B at (0,0),(6,0) but placed the free third vertex D at the template default (7,0) — on line AB — so D,F landed on that line and the parallelogram degenerated to a segment. (Square/rectangle/rhombus dodged this because their non-base vertices are *derived* from the base edge, which is also why no test caught it.)

**Fix.** A shape now fits its canonical template onto its existing base vertices ("anchors") via a **similarity transform** (rotate + uniform scale + translate), computed in `apply.ts` (`fitTemplate`/`placeBase`) from the anchors' *evaluated* positions (threaded into `applyCommand` as `pos`): 0 anchors → identity (standalone, unchanged); 1 → translation; ≥2 → the farthest-apart anchor pair fixes the frame. New free vertices are placed through that transform; reused vertices are left untouched, so the shape shares the existing edge and is a non-degenerate instance of its template regardless of where that edge sits (including reused **derived** endpoints, since the fit reads computed positions). **Testing gap closed:** `phase5-composition.test.ts` now builds *every* shape both standalone and on an existing edge, asserting its defining property purely from (x,y) — the case-cross (free non-base vertex) × (built on existing points) that previously had no coverage at all.

---

## ADR-014 — Constraint-driven solving is one generic mechanism, not a point kind per combination

**Status:** Accepted (2026-06-11) · refines [ADR-012](#adr-012--constraints-may-solve-a-free-dof-constructively-phase-5)

**Context.** The first ADR-012 slice absorbed a driving constraint into a bespoke point kind: an on-segment point whose angle is set became `on-seg-angle`, with its own type, evaluator case, and solver call. That shape doesn't scale — it enumerates the cross-product of (DOF carriers: on-segment, on-circle, free point…) × (constraint types: angle, distance, parallel, perpendicular…), one hand-built kind per combination, each with its own evaluation and branch-count logic. The slice also chose the driven DOF by looking **only at the constraint's vertex**, so an angle whose *ray endpoint* carried the freedom (e.g. "∠GBA = 37°" with G on AD — vertex B determined) was wrongly treated as a check and rejected, even though sliding G satisfies it. That broke the product's defining interaction.

**Decision.** Factor constraint-driven solving into three orthogonal parts (`src/engine/solve.ts`):

1. **Carriers stay generic.** A driven on-segment point becomes `on-segment-solved` — segment + the embedded `Constraint` + a branch index. One kind per *carrier*, regardless of which constraint drives it.
2. **Constraints contribute residuals.** Each constraint type defines `constraintRefs` (which points it references), `residual` (a scalar, 0 ⇔ satisfied), and `describeConstraint` (for error messages). A new constraint type is a new `case` in these three functions — not a new point kind, evaluator rule, or solver.
3. **One solver.** `solveParam` (geometry.ts) finds all roots of any residual over the carrier's parameter range by deterministic grid scan + bisection; the roots are the solution **branches** (alternatives, as in ADR-001/012). No root ⇒ "cannot place …" and the prior figure is kept.

**DOF selection considers every referenced point**, not just the vertex: the first reference (vertex, then ray1, then ray2 — deterministic) that still has a free DOF is driven; if none has, the constraint is a check (over-constraint detection, unchanged). A point already solved by an earlier constraint has no DOF left and counts as determined, so a second constraint on it correctly over-constrains.

This stays inside ADR-001/012's guardrails: each solve is local (one parameter), bounded, deterministic, and branch-indexed — it is *not* the rejected global residual solver.

**Consequences.** Phase 5d widens by adding residual cases (distance, parallel, perpendicular) and carrier kinds (on-circle, on-ray) independently — linear work, not multiplicative. The defining interaction works in both directions (angle at a driven vertex *and* angle to a driven ray point). A constraint that is *insensitive* to the available DOF (e.g. ∠GAB with G on AD: the angle is 90° for every t) is now rejected with the honest geometric answer — "cannot place G so that ∠GAB = 37°" — rather than a generic over-constraint message. Free-point (2-DOF) drivers remain future work and will need a 2-residual/2-DOF solve or a partial-determination model. The vision docs' example was corrected to the satisfiable "∠GBA = 37°".

---

## ADR-015 — A fact can be edited in place

**Status:** Accepted (2026-06-11) · generalises [ADR-011](#adr-011--re-placing-a-free-point-is-a-move)

**Context.** A student who typed "point E on AD at 20%" and later wants 40% had no way to change it. Re-typing was rejected as a redefinition conflict (ADR-009: E already exists as `on-segment t=0.2`, the new one is `t=0.4` → "already defined"); delete-then-re-add dropped E's dependents and re-appended E *after* them, breaking replay order. The only in-place edit was the free-point *move* (ADR-011). Yet editing an earlier fact is exactly what the incremental, fact-list model should make easy — ADR-010 already anticipated "reordering/editing of facts."

**Decision.** Add a store `update(factId, cmd, utterance)` that **replaces a fact's command at its existing list position**. The figure re-derives by replay (ADR-010). The UI exposes this as an **edit (✎) button** on each fact row, alongside ✓/×; clicking it opens the row as an inline text field pre-filled with the fact's phrasing, which is re-parsed on confirm (the same parser as the main input) and written back with `update`. Because the edited fact is applied at its own slot — *before* any dependent — the edited id is not yet present in the construction at that point, so `commandConflict` never fires: a parameter change just re-derives downstream, and a structurally incompatible change makes dependents **auto-drop reversibly** (ADR-010), rather than erroring. This means the edit is general (any fact, any field — ratio, angle value, coordinates, even kind/parents), not only a continuous-parameter tweak. The edit is one fact-list mutation, so it is **undoable** like any other (zundo). Re-typing a *new* line for an existing id remains a conflict (ADR-009 stands) — editing is the explicit, in-place path.

**Consequences.** "Change E to 40%" works: click ✎, fix the number, confirm. The replay/derived-figure model (ADR-010) carried almost all of this — `update` is a few lines and needed no engine change. Inline editing is per-row and single-active. Not yet built (deliberately deferred): drag-to-reorder facts (also enabled by the model) and dragging a point as the geometric form of the same edit (Phase 8). Covered by store tests (ratio edit re-derives without conflict; a dependent follows; the edit undoes).
