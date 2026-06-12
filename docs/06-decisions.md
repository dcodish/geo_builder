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

**Amendment 2 (2026-06-11) — the shared edge need not be named first (order-independence).** The fit above places *new* vertices, but a shape can reuse an existing point only at a *free base* slot — derived corners still conflict (above). Base slots are fixed positions in the vertex tuple (e.g. a square's free base is positions 0–1, derived 2–3), so reuse only worked when the shared edge happened to be named first. `trapezoid ABCD` then `square RTCD` (a square on side DC, naming the new corners R,T first) put the existing C,D on the square's *derived* slots and was rejected — "C is already defined" — even though it's a routine construction. **Fix:** `normalizeShapeComposition` (apply.ts) cyclically **rotates the vertex tuple** so existing points land on free slots, not derived ones, before both the conflict check and the build. A polygon is a cycle, so a rotation is the *same* shape with a different start vertex (`square RTCD` → base `CDRT`); it prefers the as-typed order and rotates only when it strictly reduces derived-slot clashes. When no rotation can free an existing point from a derived slot — a *diagonal* pair, or all vertices already declared — it remains a genuine conflict (ADR-009 holds). This also means an existing point named where a derived corner would sit is reinterpreted as a *base* corner (reused), consistent with "base corners reference whatever point already carries that id." Covered by tests (square RTCD builds on the trapezoid's DC; CDRT and RTCD give the same square; a diagonal pair and an all-four redeclaration still conflict).

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

---

## ADR-016 — Segment crossings are a click-to-create affordance, never auto-created

**Status:** Accepted (2026-06-11)

**Context.** When two drawn segments visibly cross — e.g. a parallelogram's diagonals AC and BD — the crossing is often a meaningful point (here, the centre where the diagonals bisect). Should the app mark it automatically? Auto-creating it is tempting but wrong for this engine: (1) it reintroduces *figure recognition / inference*, exactly what the constructive rebuild rejected (ADR-001) — every object should exist because it was declared; (2) N segments give O(N²) crossings, most incidental → clutter and fragile "interesting?" heuristics; (3) the figure is **dynamic** — free points move and alternatives cycle — so an auto-point (no DOF, no identity, a side effect of two segments' current positions) would blink in/out or jump, violating the stability guarantee; (4) a useful point needs a name the student will reference, and auto-labels (P1, P2) collide with their scheme; (5) noticing the diagonals meet and choosing to name the point is part of the geometric reasoning.

**Decision.** Crossings are a **suggestion**, promoted only by the student. The explicit construct stays the default (`line-line-intersection`, already parseable both directions). On top of it, the renderer detects interior crossings of *declared* segments (`findSegmentCrossings`, pure) and draws a **faint hollow dot** that brightens on hover; **clicking it creates a real, named `line-line-intersection` point** (the host picks the first free capital letter and runs it through the normal command path, so it's an ordinary editable/deletable/undoable fact). A crossing at a shared vertex isn't offered; once named, the dot disappears (an existing point now sits there). Detection lives behind an optional `onPickIntersection` prop, so the renderer stays a swappable, side-effect-free consumer (ADR-004) — it emits a pick intent; the host owns creation. **Theorem detection (Phase 6) does not need the point marked** — a predicate can compute the crossing internally to state "the diagonals bisect each other" without putting an object on the canvas.

**Consequences.** Marking an intersection costs one click instead of a sentence, while the model stays constructive and stable — nothing appears unbidden, and every marked point is a normal declared object. Rejected alternatives: auto-mark all crossings (clutter, instability, naming collisions); a typed-only path (kept, but high-friction for discovery). Future: the same hover/click affordance could offer midpoints, feet of perpendiculars, or tangent points as those constructs land. Covered by render tests (the AC×BD centre is offered once; adjacent/parallel segments offer nothing; a named crossing stops being offered).

---

## ADR-017 — Two distinct points may never share a location; a composed shape flips to avoid it

**Status:** Accepted (2026-06-11)

**Context.** A parallelogram `ABCD` and a square `CDFG` sit on opposite sides of edge CD; a third shape `parallelogram CDTY` built on CD placed its new vertices T,Y *exactly* on A,B — the default fit (ADR-013) reconstructed the first parallelogram on top of itself. Two distinct labels at one location is a degenerate, broken-looking figure. The operator's rule: **never position two nodes on top of each other — that is an error** — but here the shape had room to go elsewhere (the other side, or a different size), so it should be *placed*, not rejected.

**Decision.** Two layers. (1) **Invariant:** `evaluate` now fails any figure where two distinct points coincide (within `LEN_EPS`), flagged `coincide: true`; the step keeps the prior figure and explains ("T and A would be at the same point") — same contract as over-constraint. This holds for *every* construct, not just shapes. (2) **Auto-avoidance for composition:** when a shape built on exactly two existing points would coincide, `applyStep` retries once with `mirrorComposition` — the shape's *new free* vertices reflected across the edge through its two reused points, putting it on the open side (derived corners recompute from the reflected frees). If the mirror is clean it's used silently; if it still coincides (or the shape has no free vertex to flip — e.g. a second square on the same edge, whose far corners are fixed by the edge), the coincidence error stands. The default side is always preferred; the flip only fires on a collision.

**Consequences.** `parallelogram CDTY` now lands on the empty side, T,Y distinct from A,B, still a valid parallelogram. The invariant turns every silent overlap into an honest, explained failure that preserves the prior figure. Coincidence detection is O(P²) per evaluate — negligible at v1 figure sizes. Not done (bounded scope): trying *different proportions* to dodge a collision. The deeper generalisation is **[ADR-018](#adr-018--alternatives-are-samples-of-the-figures-residual-freedom)** — the colliding default is just one sample of an underdetermined shape; cycling should explore the freedom.

**Amendment (2026-06-11) — composition prefers the side *away* from existing geometry, and any shape can flip.** Two upgrades made textbook-clean defaults possible. (1) The derived corner kinds (`derived`/`perp-offset`/`rotated`) gained a `flip` flag that mirrors them to the other side of the base edge *without changing vertex labels* — so square/rectangle/rhombus (whose corners are derived, not free) can now flip too, not just the free-vertex shapes. `mirrorComposition` reflects new free vertices **and** toggles `flip` on new derived corners, mirroring the whole shape. (2) `applyStep` (`chooseComposition`) now evaluates *both* the default placement and the mirror and picks the valid one whose body sits on the side of the edge **away** from existing geometry — not only when the default coincides, but whenever the default would land on the occupied side. So a square built on a parallelogram's edge flips to the empty side instead of overlapping it; two squares on one edge land on opposite sides; a third (both sides full) still errors by the coincidence invariant. This decouples composition aesthetics from template tuning, which let the standalone templates be normalised to a clean **base-on-the-x-axis, built-upward** orientation (parallelogram/trapezoid were previously drawn base-at-top; the general quad had a tilted base) — the textbook look the operator asked for. Covered by engine tests (square flips to the empty side; second square goes to the opposite side; both-sides-full errors; templates upright).

---

## ADR-018 — Alternatives are samples of the figure's residual freedom

**Status:** Accepted (2026-06-11) · **Stage 1 built (2026-06-11)** · generalises [ADR-001](#adr-001--rebuild-the-engine-as-a-constructive--dependency-graph-model)/FR-ALT, reframes [ADR-017](#adr-017--two-distinct-points-may-never-share-a-location-a-composed-shape-flips-to-avoid-it)

**Stage 1 (built, 2026-06-11).** `FreePoint.pinned` distinguishes a point the *student* fixed (explicit "point A at (x,y)" → pinned) from one the *engine* defaulted (a shape's base vertex, a segment/circle's auto-created point → not pinned). `applySeed(construction, seed)` (`sample.ts`, pure + deterministic via mulberry32) perturbs only the non-pinned free points — a seeded rotation of the free cluster + independent per-point jitter — so the figure is re-drawn while every shape stays structurally valid (derived points recompute from their moved parents; a square is still a square). The store holds a `seed` (UI-only, not in undo history); `replay(facts, seed)` applies it; `resample()` advances to the next seed that evaluates (skipping degenerate draws); the "show another configuration" button calls `cycleAlt` when a discrete branch is selected, else `resample()`. `freeDofs()` lists the remaining free points. Tests in `phase-sample.test.ts`. **Deferred (Stage 2/3):** constraints pruning sampled DOFs automatically (5d already removes a DOF when a constraint drives an on-segment point); a visible "degrees of freedom remaining" cue.

**Context.** "Show another configuration" today cycles only **discrete** branch indices — which side a circle∩circle or angle solution sits on. But the product's defining interaction (vision §core, FR-EN "rarely fully determined", FR-ALT) is broader and *continuous*: an underdetermined figure has residual degrees of freedom, and the student should **see** that freedom and watch it shrink as facts accumulate, until exactly one figure remains. A parallelogram on an edge with an unspecified third vertex can be *anywhere*. The collision incident (ADR-017) made this concrete — operator's framing: *"the shape could be anywhere; the student should see a different valid drawing each time they cycle — a random size/rotation — until they add enough information to narrow it to one solution. Lots of freedom early is correct."* So a colliding default isn't a special error; it's one unlucky sample of a shape that could be drawn elsewhere.

**Decision.** Treat alternatives as **samples of the figure's residual freedom**, not only discrete branches. "Show another configuration" re-samples the **free** degrees of freedom — free points the student did *not* pin, a shape's engine-chosen (unspecified) vertices, and global placement/orientation — deterministically from a configuration seed, while keeping every *stated* fact satisfied (constraints solved, derived relations held, discrete branches honoured). As constraints accumulate (Phase 5d), free DOFs are consumed, so successive samples vary *less*, converging to a single rigid figure when fully determined — the convergence is itself the lesson. Discrete-branch cycling becomes the 0-dimensional special case of the same mechanism.

This requires a **pinned-vs-free distinction on points** that the engine currently lacks: a point the student fixed (`point A at (0,0)`) is *pinned* and never varies; a point the engine defaulted (a shape's unspecified base vertex) is *free* and is what cycling re-samples. Only free DOFs move.

**Consequences.** This is the product's core made literal — the student perceives "not yet determined" by watching the figure wander, and "determined" when it stops. Collisions (ADR-017) stop being a special case: the engine samples a non-colliding configuration and the student can cycle to others; the ADR-017 mirror is just the simplest, first sampler. **Staged:** Stage 1 — the pinned/free distinction + a seeded sampler so cycling re-draws an underdetermined figure (free points/vertices + orientation); Stage 2 — Phase-5d constraints prune the sampled DOFs automatically; Stage 3 — a visible "degrees of freedom remaining" cue. Not yet built — captured here as the direction; sequencing TBD against Phase 5b/5d.

---

## ADR-019 — Lines are constructive scaffolding (an `(anchor, dir)` object), not drawn geometry

**Status:** Accepted (2026-06-11) · Phase 5b · extends [ADR-001](#adr-001--rebuild-the-engine-as-a-constructive--dependency-graph-model)

**Context.** Phase 5b needs angle bisectors, perpendiculars, and their crossings (corpus Q2: E = bisector(∠BAC) ∩ bisector(∠BCA), F = AE ∩ BC; Q3: F = foot of ⟂ from C to AD; Q4: D = bisector(∠BAC) ∩ bisector(∠ABC)). A bisector is a ray whose direction is *derived* from an angle — it isn't defined by two existing points, so the existing `line-line-intersection` (which takes four point ids) can't express "where two bisectors meet." The question was how to represent a derived line. Options: (a) a first-class **Line object** with several constructors; (b) a derived **direction point** on the bisector plus the existing 4-point intersection; (c) push it into constraint-solving (5d). (b) clutters the canvas with an auxiliary labelled point; (c) is a 2-DOF simultaneous solve, heavier than needed for a one-shot construction.

**Decision.** Introduce a first-class **`Line`** object (`types.ts`) carrying a `LineSpec` — `through` (two points), `bisector` (internal bisector of ∠p-vertex-q), `perpendicular`, or `parallel` (to a line, through a point). A line has **no coordinates**: the evaluator resolves each to an `(anchor, dir)` pair (`resolveLine`), in the *same* topological sweep as points (a line needs its points; a `line-intersection` point needs its lines — they interleave to a fixed point). New point kinds consume lines/points directly: `line-intersection` (two `Line` ids), `foot` (⟂ foot onto line a→b), `midpoint`. A new line kind is one `resolveLine` case; a new derived point is one `tryEval` case — neither needs a new top-level type. **Lines are scaffolding and are never rendered** — `scene.ts` ignores `kind:'line'`; only the *segments* the student names (e.g. `segment AE`, `segment CF`) are drawn. So a bisector contributes a crossing point and the segments around it, with no stray auxiliary dot. The existing 4-point `line-line-intersection` stays for through∩through (e.g. F = AE ∩ BC), so the new `line-intersection` (two Line ids) is used only when a line is *derived* (bisector∩bisector). `right-triangle ABC` is a shape with the right angle at the **last** id: A and C are free legs, B is a derived `perp-offset` perpendicular to CA at C, so ∠C stays 90° as A or C moves (consistent with how other shapes fix a default size).

**Consequences.** Q2/Q3/Q4 reproduce from typed He/En utterances (`phase5b.test.ts`, 11 tests). The renderer was untouched (the gate is structural). A *single* bisector fact ("AD bisects ∠BAC") and the `parallel`/`perpendicular` **constraint** phrasings ("BC ∥ AD") deliberately stay out of grammar — they shape an underdetermined figure and belong to Phase 5d, not construction; only the **meet of two bisectors** (fully determined) is wired now. The `parallel` line kind exists in the engine (cheap) ahead of its first parser use (Phase 5c, Q6). Drawing a line itself (clipped to the viewport, e.g. "draw the bisector") is deferred until a question needs a bare line shown.

---

## ADR-020 — Circles are first-class drawn objects; circle-dependent points resolve in the same sweep

**Status:** Accepted (2026-06-11) · Phase 5c · extends [ADR-019](#adr-019--lines-are-constructive-scaffolding-an-anchor-dir-object-not-drawn-geometry)

**Context.** Phase 5c reproduces the three circle problems (Q5: a triangle inscribed in a circle + the midpoint of arc BC; Q6: a chord and a diameter crossing, plus a parallel line ∩ the circle; Q7: an inscribed triangle, the tangent at a vertex, and an angle bisector meeting a side). This is the first phase that must **draw** a curve — Phase 2 deferred circles. Open questions: how to model a circle and a point *on* it, how a circle composes with the existing point/line dependency graph, and how the tangent (a line whose direction comes from a circle) fits ADR-019's line model.

**Decision.** A **`Circle`** is a top-level object (like `Line`) carrying a centre point id and a `RadiusSpec` (`length` — a fixed value, or `through` — the distance to a point on it). Unlike a line, a circle **is rendered** (an unfilled outline, drawn before segments so chords sit on top; `scenePositions` adds the circle's extent to the fit so it is never clipped). The evaluator resolves circles, lines, and points in **one interleaved fixed-point sweep**: a circle needs its centre; a tangent line needs its circle; an on-circle / line∩circle point needs its circle (and line) — so the sweep already handled lines+points (ADR-019) and now adds circles. New circle-dependent point kinds, each one `tryEval` case: **`on-circle`** (1 DOF — an angle θ; a lone "A on circle O" auto-spreads by a golden angle so inscribed vertices never coincide), **`antipode`** (a diameter's far end, 2·centre − of), **`arc-midpoint`** (the normalized sum of the two radius directions; `branch` flips to the other arc), and **`line-circle`** (0/1/2 solutions, `branch` selects). The **tangent** is one more `LineSpec` (`{via:'tangent', circle, at}`) resolving to (`at`, ⟂ to the radius there) — so a tangent is an ordinary scaffolding line (ADR-019) that happens to read a circle. An inscribed polygon is *not* a new primitive: it is `circle` + N `on-circle` points + the existing `triangle`/`quadrilateral` shape reused on those points (composition, ADR-013). A `circle`'s centre and a `segment`'s endpoints are created if missing (like a shape's base) so "circle centered at O radius 5" and bare segments work standalone.

**Consequences.** Q5, Q6, Q7 reproduce from typed He/En utterances (`phase5c.corpus.test.ts`, 6 tests) on top of circle-primitive unit tests (`phase5c.test.ts`, 8) — the full v1 construct vocabulary is now covered (Q1–Q7). 173 tests green, build clean. The corpus figures are valid drawings of the givens **up to free configuration** (e.g. the two chords of Q6 cross at a generic interior point, not the specific "C is the midpoint of OB" the algebra fixes — solving stays a non-goal, ADR/Vision). A tangent's `line∩circle` legitimately equals the point of tangency, so materializing that point trips the coincidence guard (ADR-017) — a minor, honest limitation (you already have the point). A circle through *three* points (circumscribed / circumcentre) is a different construct and stays out of grammar for now. Drawing a bare line (a tangent or bisector as a visible line, clipped to the viewport) remains deferred (ADR-019).

---

## ADR-021 — The constraint family is one generic mechanism (distance, equal, parallel, perpendicular)

**Status:** Accepted (2026-06-11) · Phase 5d · extends [ADR-014](#adr-014--constraint-driven-solving-is-one-generic-mechanism-not-a-point-kind-per-combination)

**Context.** Phase 5d finishes the constraint phrasings 5b/5c deliberately left out of grammar: `AB = 6` (fix a length), `AB = CD` (equal segments), `AB ∥ CD`, `AB ⟂ CD`. ADR-014 already built the generic mechanism for `angle` (a constraint is `constraintRefs` + `residual` + `describeConstraint`, solved over a 1-DOF on-segment carrier by `solveParam`). The question was only whether new constraints fit it without new machinery.

**Decision.** Each new constraint is **three small cases** in `solve.ts` (refs / residual / describe) plus a `residualTolerance` case — nothing else. `apply.ts` gains a single generic `driveOrCheck(con)`: if any referenced point is a plain on-segment point it is upgraded to an `on-segment-solved` carrier the constraint *places* (the same path angle used); otherwise the constraint is pushed as a *check* and `evaluate` flags it as over-constrained if its residual exceeds tolerance. `evaluate`'s constraint loop is now fully generic (`residual`/`residualTolerance`/`describeConstraint`), no longer angle-specific. Residuals are signed so `solveParam` can bracket a root: distance/equal use the length difference; parallel/perpendicular use the **unit** cross / dot (∈ [−1,1]) so the scale is bounded and the sign flips through the solution. Parser adds `AB = 6` / `AB = CD` / `AB ∥ CD` / `AB ⟂ CD` (He/En); the unnamed-foot phrasing "perpendicular from A to BC" stays out of grammar (it is the foot construct, not the ⟂ constraint).

**Consequences.** A constraint that references a sliding point *shapes* the figure (e.g. an on-segment E slides until `EB = 3`, or until `AE ⟂ AB`); over fully-determined points it is an honest over-constraint check that keeps the prior figure. Tests in `phase5d-constraints.test.ts`. **Fixed in passing:** `solveParam` missed a root that landed *exactly* on a grid sample (a symmetric configuration where the residual is exactly 0 at t = 0.5) — it now records exact-zero samples as roots, not just strict sign changes. Still 1-DOF only: a constraint driving a *free* point (2 DOF) leaves residual freedom and is Stage 2 of [ADR-018](#adr-018--alternatives-are-samples-of-the-figures-residual-freedom); a single angle bisector (a 1-DOF on-ray placement) is likewise deferred.

---

## ADR-022 — Lines can be drawn (visible flag), and two circles can cross

**Status:** Accepted (2026-06-12) · extends [ADR-019](#adr-019--lines-are-constructive-scaffolding-an-anchor-dir-object-not-drawn-geometry)/[ADR-020](#adr-020--circles-are-first-class-drawn-objects-circle-dependent-points-resolve-in-the-same-sweep)

**Context.** ADR-019 made `Line` objects pure scaffolding — never rendered — because their value was the *crossing* they produce. But that left the **tangent** (and bisector, perpendicular, parallel) with no way to be *seen*: a student typing "tangent at A" got either nothing (no standalone rule) or, at best, an invisible line whose only trace was a point. Real geometry work needs to draw a tangent, an angle bisector, a perpendicular through a point. Separately, the engine could intersect a line with a circle but **not two circle objects** with each other (only the radius-based `point-by-distances`).

**Decision.** A `Line` gains an optional **`visible`** flag. Lines created as scaffolding inside a compound (the bisector inside "where two bisectors meet", the tangent inside "tangent ∩ AB") stay invisible (flag absent); lines the student asks to *draw* set `visible: true`. The renderer resolves visible lines to `(anchor, dir)` (`scene.ts` `lineGeometry`, mirroring the engine's `resolveLine` — lines are a rendering concern, ADR-004) and draws each as a **dashed line clipped to the viewport** (an infinite line rendered as a long segment through its anchor; the SVG viewport clips it), behind the segments. New **standalone parser rules** emit visible lines: `bisector of angle ABC` (distinct from "AD bisects ∠BAC", which would *place a point* — still deferred), `tangent to circle O at A`, `line through P perpendicular to AB`, `line through P parallel to AB`. A new **`circle-circle`** point kind (and `circle-circle-intersection` command + parser "G is the intersection of circle O and circle P") crosses two circle objects via the existing `circleCircleIntersect`, 0/1/2 branches, cyclable like the other branch points.

**Consequences.** "We don't have משיק" is fixed — a tangent (and bisector / perpendicular / parallel) now draws. Two circles and their intersection are first-class. Tests: `src/render/__tests__/lines-circles.test.tsx` + a `circle-circle` campaign family (357 committed cases; 70k+ stress sweep clean). **Still deferred:** an **implicit circle** so `משיק ב-A` / `מיתר AB` attach to the on-screen circle without naming it (ambiguous once two circles exist — needs canvas context passed to the parser); a single bisector that *places a point* on the ray (1-DOF, ADR-018 territory); right-angle / tick / arc marks.
