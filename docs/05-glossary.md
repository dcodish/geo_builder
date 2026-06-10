# 05 — Glossary

_Last updated: 2026-06-10. Shared vocabulary for the domain and the system, so docs, code, and conversations stay consistent._

## Domain (geometry)

- **Figure / construction** — the whole drawing the user is building.
- **Object / element** — a single geometric entity: point, segment, line, polygon, circle, angle, special line.
- **Free point** — a point with 2 degrees of freedom; placed without constraint, draggable anywhere.
- **On-object point** — a point constrained to lie on a segment, line, or circle; 1 degree of freedom (a parameter along the host). E.g. "G on AD".
- **Derived point** — a point fully determined by other objects; 0 degrees of freedom. E.g. an intersection, a midpoint, the foot of a perpendicular.
- **Constraint** — a required relation among objects: distance, angle measure, right angle, parallel, perpendicular, equal segments.
- **Special line** — height (altitude), median, angle bisector, perpendicular bisector, midsegment.
- **Configuration / alternative** — one of several valid drawings consistent with the facts so far. Multiple configurations arise from solution **branches**.
- **Over-constrained / contradiction** — a set of facts with no valid drawing (e.g. forcing an angle that the existing constraints already fix differently).

## System

- **Utterance** — one piece of natural-language input the user submits.
- **Step** — the unit of history: one utterance and the command(s) it produced, applied to the figure. Undoable/redoable.
- **Command** — a structured instruction the engine applies (e.g. create-polygon, set-distance, add-point-on-segment). The output of the input layer.
- **Input layer / boundary** — the `utterance → command[]` interface. Implemented by the grammar parser, with the LLM as fallback.
- **Grammar parser** — the deterministic, offline, free parser that handles common Hebrew/English phrasings. The primary path.
- **LLM fallback** — a Claude API call (model `claude-haiku-4-5`) used only when the grammar parser can't handle an input. Reached via the proxy.
- **Proxy** — the server-side component that holds the API key, gates access, and rate-limits, so the key never reaches the browser.
- **Dependency graph** — the data model: objects defined in terms of earlier objects.
- **Degrees of freedom (DOF)** — how unconstrained an object is: free (2), on-object (1), derived (0).
- **Topological evaluation** — computing object positions in dependency order.
- **Branch / branch index** — which of several solutions a derived object takes (e.g. which of two line–circle intersections). Cycling branches = browsing alternatives.
- **Fit transform** — the mapping from the figure's internal coordinates to viewport pixels (center + scale), persisted for visual stability.
- **Computed measures** — lengths, angles, and classifications derived from final positions; used for display and theorem detection.
- **Theorem match** — a theorem the current figure satisfies (definite) or might satisfy (possible).
- **Stability** — the requirement that existing objects don't visibly jump when a new fact is added.

## Stack terms

- **JSXGraph** — the dynamic-geometry library used by the *old* (archived) implementation; **not** used in the rebuild.
- **Mafs** — a React math-visualization library considered (and not chosen) for rendering; the renderer is hand-rolled SVG but kept swappable.
- **Zustand / zundo** — state store / temporal (undo-redo) middleware.
