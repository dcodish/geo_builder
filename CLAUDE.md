# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Geo Builder is a browser app where Israeli high-school students describe a geometry construction in natural language (Hebrew or English) and watch it render on an interactive canvas, **building the figure up one step at a time**, with relevant theorems surfaced as they build. UI is RTL Hebrew by default.

The defining interaction: a student adds information incrementally — "square ABCD" → "point G on AD" → "angle GAB = 37°" — and the figure forms and adapts as constraints accumulate. When a construction has more than one valid drawing, one is shown and the student can press a button to cycle to an alternative configuration.

## Current state: from-scratch rebuild in progress

**The geometry engine is being rebuilt from scratch.** The original implementation was a *shape-template matcher* (it recognized "this is a square/triangle" and placed vertices analytically) and dead-ended: it couldn't represent free points, points-on-objects, arbitrary accumulating constraints, or enumerate alternative configurations.

- **`src/` currently holds only scaffolding** — React bootstrap (`main.tsx`), a placeholder `App.tsx`, i18n setup, and styles. The engine, store, parser, renderer, and UI described below are **the target design, not yet built**. Don't go looking for them yet.
- **`archive/`** holds the entire old template-based implementation (engine, store, JSXGraph canvas, LLM service, components, types). It's outside `src/`, so it is **not compiled or bundled** — keep it only as reference. Useful references in there: the old Claude tool schema (`archive/src/services/llm/`) and theorem predicates (`archive/src/engine/theorems/`).

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
