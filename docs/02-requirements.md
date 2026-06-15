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
- **FR-IN-7 (Should)** — A **line relation between two named segments** (`AB ⟂ CD`, `AB ∥ CD`) also **draws** both segments, so naming a relation puts its lines on the figure without a separate "draw segment" request. Drawing is idempotent (a no-op for a segment already present).

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

## Alternative configurations

- **FR-ALT-1 (Must)** — When a construction step has multiple valid solutions (e.g. the two intersections of a line and a circle), choose one deterministically and render it.
- **FR-ALT-2 (Must)** — Provide a control to **cycle to the next alternative configuration** when one exists; indicate when none does.
- **FR-ALT-3 (Should)** — The chosen alternative persists across subsequent steps (cycling doesn't reset when a new fact is added).

## Rendering & interaction

- **FR-RN-1 (Must)** — Render points, segments, polygons, circles, angle arcs, right-angle marks, equal-side ticks, vertex labels, and dashed special lines.
- **FR-RN-2 (Must)** — Display constrained measures (a set distance, a set angle) on the figure: a length along its segment, an angle at its vertex, showing the number for a numeric measure and the expression (`3x`, `2α`) for a symbolic one (the resolved number once its variable has a value). On by default, with one toggle to hide all measure labels. *(Realised — [ADR-031](06-decisions.md#adr-031).)*
- **FR-RN-3 (Must)** — Animate position changes smoothly when a step moves existing points (no instantaneous teleport).
- **FR-RN-4 (Must)** — Fit the figure to the viewport; provide pan, zoom, and reset.
- **FR-RN-5 (Should)** — Allow dragging free points anywhere, and on-object points along their host object.
- **FR-RN-6 (Should)** — Provide figure-orientation controls that change only the *view*, never the engine's geometry: rotate by 90° and 180°, flip horizontally and vertically, rotate freely, align a user-named segment to horizontal (type its two endpoints), and reset. Vertex labels stay upright and readable under every orientation.
- **FR-RN-7 (Must)** — Draw an angle mark at a vertex **only when the student stated that angle** (never from a merely computed 90°): a *right-angle square* for an explicit right angle (`∠ABC = 90`, a perpendicular `AB ⟂ CD`, a right-triangle), an *angle arc* for any other given angle (`∠ABC = α`, `∠ABC = 37`). Toggled with the measure labels. (Realises the marks part of FR-RN-1; see [ADR-031](06-decisions.md#adr-031).)

## Theorems

- **FR-TH-1 (Must)** — Detect theorems relevant to the current figure and list them, most-relevant first.
- **FR-TH-2 (Must)** — Distinguish definite matches from possible ones.
- **FR-TH-3 (Must)** — Present each theorem bilingually (He/En), with its statement.

## History & session

- **FR-HS-1 (Must)** — Show the ordered list of steps the user has entered.
- **FR-HS-2 (Must)** — Support undo/redo of steps.
- **FR-HS-3 (Must)** — Provide "clear / start over".
- **FR-HS-4 (Should)** — Persist the current construction across page reloads (local only).
- **FR-HS-5 (Should)** — Export the current figure as a clean, print-ready image (SVG and/or PNG) for use in exams, worksheets, and books. Primary value for the author audience (see [Vision](01-vision.md)). *(Realised — PNG **save** and **copy-to-clipboard** from the canvas, over-sampled 2× on a white background.)*
- **FR-HS-6 (Later)** — Share a figure via link.
- **FR-HS-7 (Should)** — **Relabel** a point everywhere (`rename E to G` / `שנה שם E ל-G`) so the lettering can match a textbook figure, without changing the geometry. The rename rewrites that letter across every step and is undoable; it refuses to relabel onto a letter already in use (no silent merge of two points). Pairs with the naming-order + orientation levers documented in [12-letter-placement.md](12-letter-placement.md). (See [ADR-035](06-decisions.md#adr-035).)

## Internationalization

- **FR-I18N-1 (Must)** — Hebrew RTL is the default UI; English is available; switching updates layout direction.
- **FR-I18N-2 (Must)** — All user-facing text is localized; parser and any LLM fallback accept both languages.
