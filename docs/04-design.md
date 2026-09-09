# 04 — Design & Architecture

_Last updated: 2026-07-24 (S4.3 of [docs/24](24-foundation-hardening-plan.md) — the layer map truthed-up to the built system; the original 2026-06-10 design text is kept where it still describes reality). Status: **built and in production** — everything below exists. The day-to-day working doctrine is [docs/17](17-design-rules.md); the solve-ladder contract is [docs/LADDER.md](LADDER.md); the current architectural assessment is [docs/23](23-architecture-review-2026-07.md)._

## 1. Guiding principles

- **One source of truth.** The engine computes the figure; everything else (rendering, theorems, history) reads from it.
- **Describe, then construct.** The user states facts; the system constructs. The construction is a *dependency graph*, not a recognized template.
- **Stability is structural.** Continuity between steps comes from persisting degrees of freedom and branch choices, not from after-the-fact smoothing heuristics.
- **The LLM is optional and replaceable.** It sits behind a narrow boundary and handles only the inputs a free local parser can't.

## 2. Pipeline overview

```
  user utterance (He/En)
        │
        ▼
  ┌───────────────┐   parser-first; LLM only on miss
  │  Input layer  │  grammar parser ──(can't handle)──▶ Claude API (Haiku, via proxy)
  └───────────────┘
        │  command[]
        ▼
  ┌───────────────┐   pure reducer: command → new graph (immutable)
  │ Apply command │
  └───────────────┘
        │  dependency graph (objects + constraints + branch choices)
        ▼
  ┌───────────────┐   validate → topological evaluate → positions
  │    Engine     │   (over-constraint check; branch selection)
  └───────────────┘
        │  computed figure (positions + derived measures)
        ├───────────────▶  Theorem detection  ──▶ theorem panel
        ▼
  ┌───────────────┐   declarative SVG from figure
  │   Renderer    │   (React; swappable)
  └───────────────┘
```

A step runs apply → validate → evaluate → recompute, is appended to history, and is und/redoable.

## 3. Data model — the dependency graph

The figure is a set of **objects**, each with a *definition* referencing earlier objects, classified by degrees of freedom (DOF):

| Kind | DOF | Examples | Notes |
|------|-----|----------|-------|
| Free point | 2 | A, B placed to start a shape | Draggable anywhere |
| On-object point | 1 | "G on AD" (parameter `t` along AD); point on a circle | The construct the old engine could not express |
| Derived point | 0 | intersection, midpoint, foot of perpendicular | Fully determined by parents |

- **Constraints** (distance, angle, right-angle, parallel, perpendicular, equal-segments) are relations attached to the definitions.
- **Branch index** — derived objects with multiple solutions (line∩circle, circle∩circle) store which solution is chosen. This is the substrate for the alternatives feature.
- IDs are deterministic (e.g. `seg-AB`, `poly-ABC`) so repeated commands are idempotent.

## 4. Engine

- **Topological evaluation:** order objects by dependency, compute each from its parents → coordinates. No template/shape recognition.
- **Branches = alternatives:** when an object has N≥2 solutions, the branch index selects one. The "show another configuration" action increments it and re-evaluates. Enumerating branches is how alternatives are produced — for free, not as a special case.
- **Stability:** DOF parameters (free-point coords, on-object `t`) and branch indices **persist across steps**. A new constraint re-evaluates only what depends on it; unrelated objects keep their parameters, so the figure does not jump.
- **Over-constraint / contradiction:** before committing a step, check satisfiability. If unsatisfiable, reject the step, keep the previous figure, and surface a clear message. This is general (not triangle-only as in the old code).
- **A fact whose subject is gone ([ADR-483](06-decisions.md#adr-483), #926):** the fold asks `isSymbolBound` (in `engine/lower.ts`, beside the symbol table it reads) before applying a `set-var`; a value for a letter no statement binds is stamped into the same "no longer available" register as a point whose defining step was removed, so the row and the banner both say so. The table is whole-list, so a definition re-added anywhere binds it again. The ✎ edit seam (`app/editPipeline.ts`) compares the other rows' statuses before/after the replace and names any it orphaned, while still committing the edit.
- **Fit transform:** map computed coordinates into the viewport; persist the transform so the view is stable across steps.

## 5. Input layer

A single boundary: `utterance → command[]`.

- **Primary — deterministic grammar parser.** Handles the common, bounded geometry phrasings in Hebrew and English (shapes, points-on, distances, angles, special lines). Free, offline, instant.
- **Fallback — Claude API.** Only when the parser cannot confidently parse. Model: `claude-haiku-4-5` (sufficient for short structured extraction; far cheaper than Opus/Fable). Calls go through a **server-side proxy** that holds the key (never in the browser), is gated, and is rate-limited. `max_tokens` and prompt size kept minimal.
- The engine is agnostic to which path produced the commands.

## 6. Rendering

- **Hand-rolled SVG via React**, drawn declaratively from the engine's computed figure. No imperative reconciler (that existed only because the old JSXGraph API was imperative).
- Visual vocabulary: points, segments, polygons, circles, angle arcs, right-angle marks, equal-side ticks, labels, dashed special lines; smooth animation of moved points; pan/zoom/fit.
- **Swappable:** consumes engine output only, so it can be replaced (e.g. with a library like Mafs) without engine changes.
- **Export-friendly:** because the figure is already SVG, exporting it as an image (SVG/PNG) for the authoring use-case (Vision G6 / FR-HS-5) is straightforward — serialize the rendered SVG, or rasterize it to PNG.

## 7. Theorems

`detect(figure)` predicates evaluate the computed figure and return matches (definite vs possible), sorted definite-first, shown bilingually. Grouped by figure type (triangle, quadrilateral, circle). The canonical catalog is [`07-theorem-reference.md`](07-theorem-reference.md) (the official bagrut list); **theorem IDs are the official bagrut numbers** (so surfaced theorems are citable), and detection targets the entries tagged _property_ / _converse_ — not definitions, area formulas, or the out-of-scope appendices.

## 8. Tech stack

- React + Vite + Zustand (+ `zundo` for temporal undo/redo) + TypeScript.
- Hand-rolled SVG renderer.
- Path alias `@/` → `src/` (kept in sync between `tsconfig.json` and `vite.config.ts`).
- Vitest for tests (notably the stability regression test).

## 9. Module layout (`src/`) — as built (2026-07-24)

```
src/
  engine/        the constructive core: types (dependency-graph model), geometry, solve (constraints:
                 refs/residual/describe + constraintKey identity), apply (applyCommand reducer + eager
                 carrier pick), evaluate (topological sweep + the numeric driven solvers), step
                 (applyStep/applyCoupledStep + the failure ladder — contract in docs/LADDER.md, trace on
                 StepResult.ladder), sample, verify (givens verifier), relations/detectShapes (read-only
                 detection over the shared sample core), inscribe/variants, solveBudget,
                 valuesPanel (the derived-values rows + the ask lane, over the ONE shared sample pool)
                 - its SYMBOL lane (ADR-485, #929) reads the ADR-031 symbol table the #427 unit lane
                   FILTERS, enumerated instead: every letter the student named is a quantity, so it gets
                   a row (natun when valued, nigzar when the figure forces it) and is askable by name
                   through the `var` query. One lane feeds both seams - never a second enumeration.
  parser/        parse.ts (deterministic bilingual grammar, ordered rules + post-pass chokepoints +
                 honesty gates), catalog, context (buildParseCtx — the docs/17 §3b registry), scope,
                 llm/llmShared (the LLM-fallback seam; re-parse + gate battery)
  app/           submitPipeline.ts — the text→command orchestration, extracted from App.tsx and
                 directly tested (S0.4)
                 - errorSubject.ts (ADR-487, #943): `utteranceForError(facts, status, raw)` — WHICH
                   sentence a refusal is about. Pure over its three inputs; it exists because
                   `humanizeError` is deliberately figure-free (ADR-228 Am.6), so the student's own
                   wording must be handed to it by the layer that has the fact list. The link needs no
                   plumbing: ADR-398 already makes the banner's `lastError` and the failing row's
                   `status` the same string, so the owning fact is found by that identity
  replay/        core.ts — the PURE replay layer (S1.2): fold memo + deferral + HOIST + seed/config
                 searches + the shared sample core; engine ← replay ← store enforced by test
                 — the config searches RANK rather than merely accept (ADR-486, #942): a view that
                   stacks two named points is legal (ADR-123 — a forced coincidence must still draw)
                   but is the LAST tier, below every separated one. `separatedView` is that predicate,
                   consulted once each by searchAnotherView / firstSatisfyingSeed / findValidConfig
  store/         geoStore.ts (Zustand + zundo: the fact list as source of truth, actions,
                 rename/swap/merge; re-exports the replay layer), figureFile (save/load), loadAudit,
                 geoWork/geoWorker (the Web-Worker seam)
                 — the drawn figure is `(facts, seed)`: a STRUCTURAL edit (remove/removeGroup/
                   replaceGroup/toggle/setGroupEnabled) resets the seed to 0 so re-entering a line
                   reproduces its first result, while undo/load/rename keep it (ADR-484, #938). The
                   satisfying-seed search runs whenever the figure does not build at the current seed
                   (`Derived.sampledFailure`), not only when it builds and looks bad.
  render/        transform + scene (pure figure→primitives) + Figure.tsx (declarative SVG, pan/zoom,
                 hover picks); a pure consumer of engine output
                 — #942 (ADR-486): points the geometry drove onto one spot are drawn as ONE label
                   («B=D»); the merge is by label only, so ids, positions and hover targets are intact
  theorems/      the authored theorem table + coverage disposition map + rank bands + audit harness
  validation/    the differential coordinate oracle (engine-import-free; dev/CI only)
  export/        question export (.docx)
  i18n/          locales (he/en)
server/          the shared LLM proxy + admin dashboards (parameterized by tool:, serves 2-D and 3-D)
src3d/           the sibling 3-D product (pattern-copied, never imported — see CLAUDE.md §multi-product)
```

## 10. Build order (de-risk the core first) — *historical: all steps complete*

> The full phased plan (scope, dependencies, requirement coverage, per-phase gates, milestones) is in [`09-implementation-plan.md`](09-implementation-plan.md). The list below is the summary.

1. **Engine core slice** — dependency graph + topological eval + free/on-segment/intersection points + branch cycle. Prove it on fixtures (build + stability; a genuine two-branch construction; a contradiction) from hardcoded command lists. *Make-or-break.*
2. **SVG renderer** for that slice.
3. **Grammar parser** → commands (replaces the hardcoded list).
4. **Expand** objects/constraints/special-lines to the full v1 scope.
5. **Theorem detection.**
6. **API fallback + proxy** + cost controls.
7. **Polish + deploy.**

## 11. Key risks

- **R1 — Engine expressiveness.** Does the constructive/branch model cover the v1 figure vocabulary cleanly? Mitigation: prove the slice (step 1) before building outward.
- **R2 — Parser coverage vs. fallback rate.** If the grammar parser is too narrow, API usage (and cost) rises. Mitigation: design the grammar from real bagrut phrasings; measure fallback rate.
- **R3 — Stability under attachment.** Keeping shared/derived geometry stable as constraints accumulate. Mitigation: persistent DOF/branch indices + the stability test.

## The within-segment gate and its structural exemption (#944, [ADR-489](06-decisions.md#adr-489))

`intersectionsWithinSegments` exists to catch a crossing that has wandered off the end of its segment —
the signature of a wrong configuration, which the reflection sampler is meant to fix. It therefore
assumes the crossing *could* be interior.

That assumption fails for exactly one construction shape: **the two carriers share a vertex**. «D = חיתוך
AB ו-BC» names the crossing of AB and BC, and two segments meeting at B cross only at B — so "strictly
inside both spans" is not a tight tolerance, it is unsatisfiable. `shareEndpoint` is the guard, and it is
structural (does the construction give the carriers a common endpoint?) rather than numeric, because a
wider `WITHIN_MARGIN` would re-admit the near-collapse basin #569 exists to catch.

The question is asked at **three** sites and all three take the exemption: the gate itself,
`segmentsCrossWithin` (the point-free sibling from ADR-383), and `reflectMaskForFailing`, which picks
reflection culprits from the same test — an exempt meet is not failing, so it must not be blamed.
