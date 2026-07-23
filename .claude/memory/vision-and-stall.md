---
name: vision-and-stall
description: "Geo Builder's actual product vision and why the project stalled ~a year before June 2026"
metadata: 
  node_type: memory
  type: project
  originSessionId: 88027cdc-952d-4125-8f14-2fb88bd19212
---

**Pedagogical purpose (the "why"):** bagrut geometry problems come with both text AND a figure, so students copy the given figure visually without understanding the *givens* or how the data items relate. Entering the data one fact at a time and watching the figure build forces that understanding of relationships; the surfaced theorems then explain *why* each datum was given and what it implies for how to approach solving. (Not "drawing is hard" — the figure is provided; the problem is passive copying.) **Second audience — teachers/authors:** building clean geometry diagrams for books/exams/worksheets is painful in GeoGebra; a describe→**export-image** path serves them, so image export is a first-class goal (not just student-facing).

Geo Builder lets a student/teacher build a geometry-question figure **incrementally**, one natural-language step at a time, and watch the shape form: "square ABCD" → square drawn; "point G somewhere on AD" → G placed (semi-free) on AD; "angle GAB = 37°" → figure adapts. When a construction has **multiple valid drawings**, show one and let the student press a button to **cycle to an alternative** configuration if one exists. When the figure is fully determined, done.

**Why it stalled (diagnosis, June 2026):** the engine is a *shape-template matcher*, not a constraint/construction engine, so the three features most central to the vision can't be expressed:
1. Polygon-first data model — only `create-polygon` introduces geometry; no command/constraint for a free point or a point-on-segment (incidence). "G on AD" is unrepresentable.
2. `resolvePositions` recognizes known shapes (square/triangle) and places them analytically; it doesn't solve accumulating arbitrary constraints.
3. "Alternatives" is just the `flipped` boolean, not general enumeration of discrete valid configurations.

Reusable as-is: LLM NL→commands layer, i18n/RTL, BoardReconciler, step history, previous-positions stability trick, theorem detection. Only the **constraint model + solver** need replacing.

**Recommended direction:** rebuild as a **constructive / dependency-graph engine** (GeoGebra-style) — LLM emits construction *steps*, semi-free points get a DOF parameter, and discrete alternatives fall out of intersection branch choices. (Alternative considered: numerical residual solver — rejected as less stable, alternatives fuzzier.) Also needs general over-constraint/contradiction detection (current code only checks triangles). Not yet confirmed with David which path to take. See [[CLAUDE.md data-flow]] in repo for current pipeline.
