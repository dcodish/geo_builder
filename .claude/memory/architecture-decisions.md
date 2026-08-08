---
name: architecture-decisions
description: "Settled direction for the Geo Builder rebuild (engine + input layer + cost model), decided June 2026"
metadata: 
  node_type: memory
  type: project
  originSessionId: 88027cdc-952d-4125-8f14-2fb88bd19212
  modified: 2026-08-08T20:36:29.798Z
---

David is OK throwing away the current code and rebuilding from scratch; the existing repo is a **requirements baseline**, not something to preserve. Goal: a small, free-to-distribute utility for Israeli high-school geometry (teachers/students), no expectation of large scale but must not surprise-bill. Decisions settled June 2026 (see [[vision-and-stall]] for the vision and why the template engine dead-ended):

**Engine:** rebuild as a **constructive / dependency-graph engine** (GeoGebra-style), not the current shape-template matcher and not a numerical residual solver. Semi-free points get a DOF parameter; discrete alternatives ("show another configuration") fall out of intersection branch choices.

**Input layer — parser-first, API-fallback:** clean `utterance → command[]` boundary. A **deterministic grammar parser runs first (free, offline)** and handles the common simple inputs; only ambiguous/complex phrasings **escalate to the Claude API**. This inverts the current design (which calls the API first with a regex fallback) and cuts call volume ~70–90%.

**API cost model (David's first time with API billing):** use **Haiku 4.5** for parsing (sufficient for short structured geometry statements, ~$0.004/call). Cost controls: (1) prepay a small credit ceiling (~$20) rather than unlimited auto-reload; (2) Console monthly spend limit + usage alerts; (3) **mandatory server-side proxy** — never ship the key in the browser (current code exposes `VITE_ANTHROPIC_API_KEY` in-browser); (4) gate the proxy (per-class code) + per-IP rate limit — abuse of an open endpoint is the real risk, not legitimate students; (5) lower `max_tokens` to ~512, trim system prompt + tool schema. API stays an optional swap-in behind the boundary.

**v1 scope (decided June 2026):** "broader v1" — triangles, quadrilaterals, circles, point-on-object, midpoints, intersection points, special lines (height/median/bisector/perp-bisector/midsegment), distance/angle/right-angle/parallel/perpendicular/equal-segment constraints, the alternatives toggle, **and** the theorem-surfacing panel (theorems are in v1, not deferred).

**Stack (reconsidering, leaning):** keep React + Vite + Zustand + TS (sound; not why it stalled). The real change is the render layer — likely **drop JSXGraph for declarative SVG rendered by React from the engine's output**, because the constructive engine becomes the single source of truth and a declarative renderer removes the imperative BoardReconciler sync layer (JSXGraph's value was its geometry *logic*, which we're replacing). **Render finalized: hand-rolled SVG via React** (not Mafs). Rationale: Mafs is built for function-graphing, so the geometry-specific visuals a construction tool needs (angle arcs, right-angle marks, equal-side ticks, dashed cevians, vertex labels) aren't built-ins — we'd hand-draw them either way; Mafs would only cover the grid + pan/zoom, which is a small one-time chunk of code and not worth an external dependency for a free utility kept alive for years. Decision is low-stakes: the engine is the single source of truth and the renderer just draws its output, so the **renderer is a swappable layer** — can switch to Mafs/anything later without touching the engine.

Planning model: this design work runs on Opus 4.8 (sweet spot); Fable not needed for it.

**This entry records the settled DIRECTION, not status.** Every one of these decisions is long since built; current state is read from the ADR-log tails (`docs/06-decisions.md`, `docs/06b-decisions-3d.md`) and `gh issue list`, never from here. Validation is **corpus-driven**: `docs/sample questions/` holds real bagrut problems (text+image); reproduce each *figure* (never solve), compare against the official image. See [[vision-and-stall]] and [[bagrut-theorem-source]].
