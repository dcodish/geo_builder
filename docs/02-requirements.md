# 02 — Functional Requirements

_Last updated: 2026-06-10. Scope: v1 ("broader v1" — see [Design §Scope](04-design.md))._

IDs are stable references (`FR-<area>-<n>`). "Must" = v1; "Should" = desirable in v1; "Later" = post-v1.

## Actors

- **Student** — describes a figure step by step to understand a problem.
- **Teacher** — same capability; prepares or demonstrates figures, and authors materials.
- **Author** — a teacher or textbook author who builds figures to embed in exams, worksheets, or books; primary need is image export.
- (No authentication or distinct roles in v1; all are the same anonymous user.)

## User stories

### Student

- US-1 — As a student, I want to enter the problem's facts one at a time and see the figure update after each, so that I understand how each given shapes it.
- US-2 — As a student, I want to choose among the valid drawings when my figure isn't fully determined, so that it matches the problem I'm solving.
- US-3 — As a student, I want to be told clearly when a fact conflicts with earlier ones, so that I can correct my input instead of trusting a wrong figure.
- US-4 — As a student, I want to see the theorems relevant to the figure I've built, so that I understand why the data was given and how to approach the solution.
- US-5 — As a student, I want to undo and redo steps, so that I can fix a mistake without rebuilding from scratch.
- US-6 — As a student, I want to clear the figure and start over, so that I can move on to a new problem.
- US-7 — As a student, I want a clear hint on how to phrase a fact when it isn't understood, so that I can continue without getting stuck.
- US-8 — As a student, I want to see the list of facts I've entered, so that I can track what the figure is based on.
- US-9 — As a student, I want to drag a point that isn't fully fixed, so that I can explore how the figure is free to vary.
- US-10 — As a student, I want my figure to still be there after a reload, so that I don't lose my work.

### Teacher

- US-11 — As a teacher, I want to build a figure live in Hebrew with no setup, so that I can demonstrate a problem to my class.

### Author

- US-12 — As an author, I want to describe a figure and export it as a clean image, so that I can include accurate diagrams in exams, worksheets, and books without drawing them by hand.

### All users

- US-13 — As a user, I want to work in Hebrew or switch to English, so that I can use the language I'm comfortable with.

## Input & parsing

- **FR-IN-1 (Must)** — Accept free-text input in Hebrew and English describing geometry facts.
- **FR-IN-2 (Must)** — Translate each accepted input into one or more structured commands the engine can apply. (How — local parser first, LLM fallback — is a design decision; see [ADR-002](06-decisions.md).)
- **FR-IN-3 (Must)** — Each submitted utterance is one **step**: it may produce several commands (e.g. "square ABCD" creates the polygon plus its right-angle/equal-side constraints).
- **FR-IN-4 (Must)** — When input cannot be understood, show a helpful clarification message (bilingual) and leave the figure unchanged.
- **FR-IN-5 (Should)** — Offer input affordances (examples, autocomplete, or a guided builder) so users phrase facts the parser supports.
- **FR-IN-6 (Should)** — Accept **relational measures with named variables** that set a relation between measures *without fixing a number* (the tool draws the relation; the student solves for the unknown): a length as `coef·var` with a lowercase-latin variable (`AB = 3x`) and an angle as `coef·var` with a Greek variable (`∠ABC = 2α`); points stay uppercase so the two never collide. Two measures sharing a variable form a proportion (`AB = 3x` + `DF = x` ⇒ `|AB| = 3·|DF|`); a value given for the variable (`x = 4`) resolves every measure that uses it to an absolute size. The figure stays free until something pins the scale. (See [ADR-031](06-decisions.md#adr-031).)
- **FR-IN-7 (Should)** — A **relation or measure stated over named segments/angles** also **draws** the segment(s) it names, so stating a fact puts its lines on the figure without a separate "draw segment" request: a line relation (`AB ⟂ CD`, `AB ∥ CD`) draws both segments; a length given (`AB = 6`) draws `AB`; an equality (`AB = CD`) draws both compared segments; an angle (`∠ABC = 37`) draws its two arms (`BA`, `BC`). Drawing is idempotent (a no-op for a segment already present), so on an existing corner the arms/edges are not duplicated. (Symbolic measures — `AB = 3x`, `∠ABC = 2α` — do not yet auto-draw; they flow through the variable-lowering pipeline.)
- **FR-IN-8 (Should)** — Accept an **ordering assumption between two named measures** (`α < β`, `x > y`, also `≤`/`≥`) and **actively reshape** the figure so the relation holds *visibly* — the angle (or segment) labelled with the smaller variable comes out clearly smaller — while every other given still holds. An ordering selects a configuration; it never fixes a number. If the geometry permits only a small gap the figure still adopts it; if the ordering is incompatible with the other givens, the prior figure is kept and the contradiction is flagged. (See [ADR-039](06-decisions.md#adr-039).)
- **FR-IN-9 (Later) — coordinate data-entry mode (analytic geometry).** A future, *opt-in* input mode where the student places points/objects by explicit **coordinates** (`A = (3, 4)`) and builds on a coordinate grid — useful for **analytic ("analytical") geometry**, where the coordinate system is the point of the exercise. This is a deliberate, separate capability on the **data-entry side**: the engine already works in coordinates internally, and a single `point A at (x,y)` is already parsed, but everyday synthetic-geometry construction should *not* require coordinates (students describe relations, not numbers). Deferred — build when analytic-geometry support is taken on; until then coordinate entry stays an incidental way to pin a point, not a first-class mode (no grid, axes, or coordinate read-outs).

## Construction & engine

- **FR-EN-1 (Must)** — Build the figure incrementally: each new object may be defined in relation to objects already present.
- **FR-EN-2 (Must)** — Support free points; points constrained to lie on a segment, line, or circle; and derived points (intersection of two objects, midpoint of a segment, foot of a perpendicular).
- **FR-EN-3 (Must)** — Support shapes: triangle, quadrilateral, circle. Two circles can be stated **tangent to each other** at a point (external by default, internal on request); the engine moves a centre so they touch at exactly that point. (See [ADR-037](06-decisions.md#adr-037).)
- **FR-EN-4 (Must)** — Support constraints: distance, angle measure, right angle, parallel, perpendicular, equal segments.
- **FR-EN-5 (Must)** — Support special lines: height, median, angle bisector, perpendicular bisector, midsegment.
- **FR-EN-6 (Must)** — Compute positions for all objects that are consistent with the current facts.
- **FR-EN-7 (Must)** — Adding a new fact refines the existing figure; it must not reposition already-placed objects beyond what the new constraint requires (see [NFR stability](03-nonfunctional-requirements.md)).
- **FR-EN-8 (Must)** — Detect contradictory / unsatisfiable input (over-constraint), reject that step, keep the previous valid figure, and report why (US-3).
- **FR-EN-9 (Must)** — Re-issuing an equivalent command is idempotent (no duplicate objects).
- **FR-EN-10 (Must)** — Recompute derived measures (lengths, angles, classifications) from final positions for display and theorem detection.
- **FR-EN-11 (Must)** — A constraint added on objects that are already placed *reshapes* the figure to satisfy it, rather than only checking it: the engine drives an available degree of freedom (an on-object parameter, a free point), and when the directly-referenced object has none, it recruits a free degree of freedom from an ancestor. Multiple such constraints compose. If no assignment satisfies the constraint, it is rejected per FR-EN-8. (See [ADR-028](06-decisions.md#adr-028).)
- **FR-EN-12 (Should)** — A stated *relation between two triangles* — congruence (`ABC ≅ DEF`) or similarity (`ABC ~ DEF`) — reshapes the second triangle so the relation holds (congruent ⇒ corresponding sides equal; similar ⇒ corresponding angles equal), drawing either triangle first if it isn't already present. Two disjoint shapes are placed clear of each other. (See [ADR-032](06-decisions.md#adr-032).)
- **FR-EN-13 (Must)** — Every shape carries the degrees of freedom of the real shape, so a sizing/shaping constraint *reshapes* it rather than being a spurious over-constraint: a square resizes from a side, a rectangle's height is settable, a rhombus's angle, a trapezoid's short side, a right-triangle's leg — while the shape's defining property (equal sides, right angles, parallels) is preserved. A constraint that genuinely cannot hold (a non-90° angle in a square) is still rejected per FR-EN-8. (See [ADR-033](06-decisions.md#adr-033).)
- **FR-EN-14 (Should)** — A **cyclic quadrilateral** (`מרובע ABCD בר חסימה` / "cyclic quadrilateral ABCD" / "inscribable in a circle") — a common bagrut given — builds a convex quad whose four vertices are concyclic, so opposite angles sum to 180°, **without drawing the circumscribing circle** (a hidden circle that only constrains the vertices). Contrast "inscribed / חסום במעגל", which draws the circle.
- **FR-EN-15 (Should)** — Support **partial-circle shapes**: a **semicircle** (`חצי מעגל שקוטרו AB` / "semicircle with diameter AB") draws a 180° arc on a diameter (the diameter is drawn, the centre shown); a **quarter circle** (`רבע מעגל` / "quarter circle") draws a 90° arc with its two bounding radii. The arc is a first-class drawable primitive; the circle carrying its endpoints is hidden, so only the arc and its straight edges render.
- **FR-EN-16 (Should)** — **Polygons are convex by default.** A declared polygon (quadrilateral, parallelogram, trapezoid, …) is always drawn convex unless the student explicitly asks for a **concave** shape (`קעור` / "concave"); "show another configuration" only surfaces convex configurations (a self-crossing or concave "dart" drawing is never offered unbidden — [ADR-018](06-decisions.md#adr-018), `polygonsConvex`). *Today:* enforced for the default template and the sampler. *Deferred:* a convexity preference in the constraint solver (so constraint-driven reshaping also stays convex), and the `קעור` opt-in keyword (no concave construct exists yet — build when a corpus problem needs one).

## Alternative configurations

- **FR-ALT-1 (Must)** — When a construction step has multiple valid solutions (e.g. the two intersections of a line and a circle), choose one deterministically and render it.
- **FR-ALT-2 (Must)** — Provide a control to **cycle to the next alternative configuration** when one exists; indicate when none does.
- **FR-ALT-3 (Should)** — The chosen alternative persists across subsequent steps (cycling doesn't reset when a new fact is added).
- **FR-ALT-4 (Should)** — Show the figure's **remaining degrees of freedom** as a running cue (`Degrees of freedom: N` while underdetermined; `✓ fully determined` at 0), so the student sees the freedom shrink as facts accumulate and stop when the figure is a single rigid drawing. A free point counts 2; a free parametric/shape DOF counts 1; a DOF a constraint drives or the student pinned counts 0. *(Realised — [ADR-018](06-decisions.md#adr-018) Stage 3.)*

## Rendering & interaction

- **FR-RN-1 (Must)** — Render points, segments, polygons, circles, angle arcs, right-angle marks, equal-side ticks, vertex labels, and dashed special lines.
- **FR-RN-2 (Must)** — Display constrained measures (a set distance, a set angle) on the figure: a length along its segment, an angle at its vertex, showing the number for a numeric measure and the expression (`3x`, `2α`) for a symbolic one (the resolved number once its variable has a value). On by default, with one toggle to hide all measure labels. *(Realised — [ADR-031](06-decisions.md#adr-031).)*
- **FR-RN-3 (Must)** — Animate position changes smoothly when a step moves existing points (no instantaneous teleport).
- **FR-RN-4 (Must)** — Fit the figure to the viewport; provide pan, zoom, and reset.
- **FR-RN-5 (Should)** — Allow dragging free points anywhere, and on-object points along their host object.
- **FR-RN-6 (Should)** — Provide figure-orientation controls that change only the *view*, never the engine's geometry: rotate by 90° and 180°, flip horizontally and vertically, rotate freely, align a user-named segment to horizontal (type its two endpoints), and reset. Vertex labels stay upright and readable under every orientation. **Align-to-horizontal is a *standing* request:** it remembers the chosen segment and re-applies on every change, so the segment stays horizontal as later constraints reshape the figure (a manual rotation adds as an offset on top); reset clears it.
- **FR-RN-7 (Must)** — Draw an angle mark at a vertex **only when the student stated that angle** (never from a merely computed 90°): a *right-angle square* for an explicit right angle (`∠ABC = 90`, a perpendicular `AB ⟂ CD`, a right-triangle), an *angle arc* for any other given angle (`∠ABC = α`, `∠ABC = 37`). Toggled with the measure labels. (Realises the marks part of FR-RN-1; see [ADR-031](06-decisions.md#adr-031).)

## Theorems

- **FR-TH-1 (Must)** — When a fact is entered, run detection over the **entire accumulated figure** (all enabled facts), and surface what has **changed**: theorems whose hypothesis is now satisfied, and confidence/relevance updates to theorems already shown. The **analysis is whole-figure** — a theorem's hypothesis may span several facts and only become satisfied (or only change tier) when a specific *later* fact lands, so looking only at the last fact is wrong. The **presentation is delta-based** — the feed updates in place rather than re-listing everything, so it never floods. A fact may legitimately surface nothing (construction primitives and definitions carry no theorem); that is expected, not a failure.
- **FR-TH-2 (Must)** — Surfaced theorems accumulate in a **growing feed** alongside the canvas. Each entry is **attributed to the fact that completed (or last changed) it** and persists as the figure grows; disabling/removing a fact removes or downgrades the theorems that depended on it (mirrors the dependent-drop semantics of FR-EN-9). A theorem already shown is **not duplicated** when a later fact re-touches it — the existing entry **updates in place** (re-highlights, or changes tier per FR-TH-3).
- **FR-TH-3 (Must)** — Each entry carries a **confidence tier**, **recomputed every step** as the figure grows (a *possible* match becomes *certain* when its completing fact arrives, and can drop again if that fact is removed), driving both ordering and visual treatment, highest first:
  - **Certain** — the hypothesis is fully met by the construction (green). *e.g. a diameter is present → Theorem 103.*
  - **Possible** — would hold only in a more special case, one given away (amber). *e.g. two equal sides given → isosceles is **certain**, equilateral is **possible**.*
  - **Recall** — a related theorem the configuration evokes but does not satisfy (grey; optional, may be suppressed to avoid noise).

  The tier may be painted as a representative score (e.g. 100% / ~60%) for the UI, but it is an **ordinal tier**, not a computed probability — we stay exact and citable (Pedagogy §5.4). Structural detection (ADR-038) does not produce a continuous likelihood.
- **FR-TH-4 (Must)** — Each feed entry is **traceable**: selecting it highlights on the canvas the exact objects/facts that satisfied the hypothesis (Pedagogy §5.3).
- **FR-TH-5 (Must)** — Present each theorem bilingually (He/En) with its exact catalog statement ([07](07-theorem-reference.md)) and its **official bagrut number**. Surface **P** (use-it) and **C** (recognition/converse) theorems; **never** surface **O**-tagged items, definitions, or area/perimeter formulas.
- **FR-TH-6 (Should)** — Within a single fact's surfacing, order most-relevant-first and **cap** the count so one fact never floods the feed.

## Reveal — figure unmasking (deferred, own phase)

On-demand, **opt-in** annotation of what the figure geometrically *is* — distinct from theorem surfacing (which is structural and automatic). Deliberately a **separate, later phase** ([Plan Phase 9](09-implementation-plan.md#phase-9--reveal--figure-unmasking-deferred)): it ships independently of Phase 6, and pedagogically it must **never** clue the student unbidden.

- **FR-RV-1 (Later)** — Provide a **Reveal** control that, only when the student presses it, annotates the current figure with everything it geometrically exhibits: equal segments (tick marks), equal and right angles (arc/right-angle marks), and measured lengths/angles.
- **FR-RV-2 (Later)** — Reveal is **strictly opt-in and reversible**: nothing is annotated until requested, and it can be toggled off. No geometric fact is ever surfaced automatically (this is the boundary that keeps "students reach their own conclusions without unsolicited clues" — Pedagogy §5.1).
- **FR-RV-3 (Later)** — Reveal is powered by **geometric (coordinate) analysis** of the computed figure — the layer deliberately deferred from theorem detection in [ADR-038](06-decisions.md#adr-038). It catches emergent/coincidental equalities a structural pass cannot.

## History & session

- **FR-HS-1 (Must)** — Show the ordered list of steps the user has entered.
- **FR-HS-2 (Must)** — Support undo/redo of steps.
- **FR-HS-3 (Must)** — Provide "clear / start over".
- **FR-HS-4 (Should)** — Persist the current construction across page reloads (local only).
- **FR-HS-5 (Should)** — Export the current figure as a clean, print-ready image (SVG and/or PNG) for use in exams, worksheets, and books. Primary value for the author audience (see [Vision](01-vision.md)). *(Realised — PNG **save** and **copy-to-clipboard** from the canvas, over-sampled 2× on a white background.)*
- **FR-HS-6 (Later)** — Share a figure via link.
- **FR-HS-7 (Should)** — **Relabel** a point everywhere (`rename E to G` / `שנה שם E ל-G`) so the lettering can match a textbook figure, without changing the geometry. The rename rewrites that letter across every step and is undoable; it refuses to relabel onto a letter already in use (no silent merge of two points). Pairs with the naming-order + orientation levers documented in [12-letter-placement.md](12-letter-placement.md). (See [ADR-035](06-decisions.md#adr-035).)
- **FR-HS-8 (Should)** — **Merge** two *existing* points into one (`merge F into E` / `מזג F ל-E`) — the explicit fold the rename deliberately refuses. The target survives; the source's own definition is dropped, every reference to the source is rewritten to the target, and any fact that collapses (a `segment EF` → `EE`) is removed. Undoable as one step. Refuses to fold a **shape vertex** (it has no standalone definition to drop — edit the shape instead) and refuses when either point is missing (merging into a *new* letter is a rename, not a merge).

## Internationalization

- **FR-I18N-1 (Must)** — Hebrew RTL is the default UI; English is available; switching updates layout direction.
- **FR-I18N-2 (Must)** — All user-facing text is localized; parser and any LLM fallback accept both languages.
