# 04 — Design & Architecture

_Last updated: 2026-06-10. Status: design; engine core (Phase 1) implemented in `src/engine/`, renderer/store/parser/UI still pending._

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

## 9. Planned module layout (`src/`)

> Indicative; created as the build proceeds.

```
src/
  engine/        dependency-graph model, topological solver, branches, over-constraint, computed measures
  parse/         grammar parser (He/En) + LLM-fallback client (talks to the proxy)
  store/         apply-command reducer + Zustand store (history, undo/redo, alternatives state)
  render/        SVG components driven by engine output
  theorems/      detect(figure) predicates
  i18n/          locales (he/en)
  components/    app shell, input bar, step history, theorem panel
proxy/           server-side API proxy (key custody, gate, rate-limit) — deploy artifact
```

## 10. Build order (de-risk the core first)

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
