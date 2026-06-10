# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Geo Builder is a browser app where Israeli high-school students describe a geometry construction in natural language (Hebrew or English) and watch it render on an interactive canvas, **building the figure up one step at a time**, with relevant theorems surfaced as they build. UI is RTL Hebrew by default.

The defining interaction: a student adds information incrementally — "square ABCD" → "point G on AD" → "angle GAB = 37°" — and the figure forms and adapts as constraints accumulate. When a construction has more than one valid drawing, one is shown and the student can press a button to cycle to an alternative configuration.

## Current state (rebuild in progress — gate-driven, see [docs/09-implementation-plan.md](docs/09-implementation-plan.md))

The original implementation was a *shape-template matcher* that dead-ended (couldn't represent free points, points-on-objects, accumulating constraints, or alternative configurations). Rebuilding from scratch as a constructive engine. **Phases 1–3 (engine core + SVG renderer + store/app shell) are complete (milestone M2 — interactive build). Text input is still hand-encoded: the parser is Phase 4.**

- **`src/engine/`** — the constructive engine: dependency-graph data model (`types.ts`), pure `geometry.ts`, `applyCommand` reducer, topological `evaluate` (with over-constraint detection), and `step` (apply/keep-prior, `cycleAlternative`, `branchCount`). Tested in `src/engine/__tests__/phase1.test.ts` — **6/6 green** (build+stability, alternatives, over-constraint, determinism, idempotency); milestone M1 reached. Supported constructs **so far**: `square`, point-on-segment, circle∩circle intersection, angle-check. Breadth comes in Phase 5.
- **`src/render/`** — the SVG renderer (Phase 2): pure `transform.ts` (isotropic fit, centred, Y-flipped world→screen) and `scene.ts` (`Construction` + `positions` → flat primitives, no React), with `Figure.tsx` a thin declarative SVG map over the scene plus pan/zoom/reset. Tested in `src/render/__tests__/phase2.test.tsx` — **9/9 green** (transform, scene "figure → nodes", DOM-free static render via `react-dom/server`; no jsdom). The renderer is a **pure consumer** of engine output and swappable.
- **`src/store/`** — the session store (Phase 3): `geoStore.ts` is Zustand + `zundo` (temporal undo/redo) wrapping the engine — an `execute(cmd)` pipeline (apply → evaluate → keep-prior-on-error → log), `cycleAlt`, `clear`. Positions are **not** stored (derived via `evaluate` in the view); the error banner is excluded from undo history. Tested in `src/store/__tests__/phase3.test.ts` — **9/9 green** (pipeline, stability, keep-prior-on-error, undo/redo, clear, alternatives, i18n key-parity).
- **`src/` app shell** — `main.tsx`, i18n (Hebrew default, RTL via `document.dir`), styles, and `App.tsx` now the **store-driven shell**: canvas + step log + undo/redo/clear + alternatives + language toggle. The text input is **disabled** (parser is Phase 4); a "quick facts" row drives the store so the loop is usable now. The **parser and real text input are not built yet** (Phase 4).
- **`archive/`** holds the entire old template-based implementation — outside `src/`, **not compiled or bundled, and excluded from tests** (`vite.config.ts`). Reference only; useful bits: the old Claude tool schema (`archive/src/services/llm/`) and theorem predicates (`archive/src/engine/theorems/`).
- **Validation corpus:** `docs/sample questions/` holds 7 real bagrut problems (text + image). The plan is corpus-driven — we reproduce each *figure* (never solve) and compare to the official image.

**Next step (resume here):** Phase 4 (grammar parser: Hebrew/English `utterance → command[]`, replacing the hardcoded "quick facts"; enable the text input) → Phase 5a (general quadrilateral + arbitrary segment + line∩line) → reproduce corpus **Q1** side-by-side with its image. The build is on branch `rebuild-foundation`.

## Project memory (rule)

All durable project context lives **in this repo** — it syncs via Dropbox, so it travels to any machine David works from. The assistant's machine-local memory does **not** travel, so **never rely on it for this project.** At session start, read [`docs/PROJECT-MEMORY.md`](docs/PROJECT-MEMORY.md). Record decisions in the ADR log ([`docs/06-decisions.md`](docs/06-decisions.md)), status in the plan ([`docs/09-implementation-plan.md`](docs/09-implementation-plan.md)), and operational notes in `docs/PROJECT-MEMORY.md` — not only in local memory.

## Documentation

Full project docs live in [`docs/`](docs/) — vision, functional + non-functional requirements, design/architecture, glossary, and the decision log (ADRs). Start at [`docs/README.md`](docs/README.md). These are the authoritative, detailed source; this file is the quick orientation and points there for depth. **Keep both in sync as the design evolves**, and add an ADR to `docs/06-decisions.md` for any significant decision.

## Testing & definition of ready

Test strategy and per-step acceptance gates live in [`docs/08-testing-strategy.md`](docs/08-testing-strategy.md). **Working rule for this repo: do not report a feature or build step as "ready" until its acceptance gate passes** — tests green, `tsc`/build clean, results shown honestly (no skipped/`.only` specs hiding gaps). The engine is pure and deterministic and is tested hardest; the LLM fallback is mocked (no live API calls in tests). The **stability** regression (existing points must not jump when a fact is added) is a first-class test.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b` typecheck then `vite build`
- `npm test` — Vitest (watch mode). Single file: `npx vitest run <path>`. Single test by name: `npx vitest run -t "<name>"`
- Path alias `@/` → `src/` (keep `tsconfig.json` and `vite.config.ts` in sync)

## Target architecture

Natural language → commands → constructive evaluation → rendered figure. Build it in this order (the first step is the make-or-break risk):

### 1. Constructive / dependency-graph engine (the core)

Replaces the old template solver. Every object is **defined in terms of earlier objects**, classified by degrees of freedom:

- **Free point** (2 DOF) — placed, draggable.
- **Point-on-object** (1 DOF) — a parameter `t` along a segment/line/circle. This is what makes "G on AD" representable — the thing the old model couldn't express.
- **Derived point** (0 DOF) — intersection, midpoint, foot of perpendicular; fully determined by its parents.

Key properties:

- **Evaluation is topological** (dependency order) → coordinates. No template matching.
- **Branches are the "alternatives" feature.** A line∩circle or circle∩circle has 0/1/2 solutions; each derived object stores a **branch index**. "Show another configuration" increments the branch index and re-evaluates.
- **Stability is structural, not heuristic.** DOF parameters and branch indices persist across steps, so adding a constraint re-evaluates downstream objects without perturbing earlier choices — the figure doesn't jump. (No `previousPositions`/`fitState` threading like the old solver.)
- **Over-constraint detection** is general: if a step can't be satisfied, flag it, keep the prior figure, surface a "that contradicts…" message.

### 2. Rendering — hand-rolled SVG via React

The engine is the single source of truth; React renders SVG declaratively from its computed output (points, segments, polygons, circles, angle arcs, right-angle marks, equal-side ticks, labels, dashed special lines; animate free-point moves; pan/zoom + fit). **No imperative reconciler** (that layer existed in the old code only because JSXGraph was imperative — JSXGraph is gone). The renderer is a **swappable layer** — it could be replaced (e.g. with Mafs) without touching the engine.

### 3. Input layer — parser-first, API fallback

A clean `utterance → command[]` boundary. A **deterministic Hebrew/English grammar parser runs first** (free, offline, handles the common simple inputs); only ambiguous phrasings **escalate to the Claude API** (`claude-haiku-4-5` — sufficient for bounded structured parsing, ~10× cheaper than Opus/Fable). The engine never knows which parser produced the commands.

**API key handling:** the key must live **only in a server-side proxy** — never shipped to the browser (the old code's `VITE_ANTHROPIC_API_KEY`-in-browser approach is abandoned). Cost controls: prepaid credit cap, Console spend limit, gated proxy (per-class code) + per-IP rate limit, low `max_tokens`, lean prompt.

### 4. Theorems (v1)

`detect(figure)` predicates run over the computed model and surface relevant theorems as the student builds.

## v1 scope

- **Shapes:** triangle, quadrilateral, circle
- **Points:** free, on-segment/on-line/on-circle, intersection, midpoint, foot
- **Constraints:** distance, angle, right-angle, parallel, perpendicular, equal-segments
- **Special lines:** height, median, angle bisector, perpendicular bisector, midsegment
- **Alternatives toggle** + **theorem panel**

## Conventions to carry forward

- **RTL Hebrew is the default.** All user-facing strings go through `useTranslation`/`t()` (`src/i18n/`, `locales/he.json` + `en.json`). Toggling language updates `document.documentElement.dir`. The parser and any LLM fallback handle both Hebrew and English input.
- **Deterministic element IDs** (e.g. `seg-AB`, `poly-ABC`) so re-issuing the same command is idempotent — preserve this in the new model.
- **Stack:** React + Vite + Zustand + TypeScript. State/undo can use Zustand (+ `zundo` for temporal undo/redo, as the old store did).
