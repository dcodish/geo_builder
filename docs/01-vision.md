# 01 — Vision & Purpose

> Written for the 2-D builder. Geo Builder is now four builders (2-D, 3-D, analytic, complex), and the
> pedagogy charter for all of them is [docs/10](10-pedagogy.md) (#1861). Theorem surfacing (goal G4) is
> switched off by the operator (#740). The operator's rulings in
> [ADR-W-118](06w-decisions-workspace.md#adr-w-118) win where this document differs.

## The problem

Israeli high-school geometry problems almost always come with **both a verbal statement and a figure**. Because the figure is already drawn for them, students typically **copy it onto their paper visually** — reproducing the picture without pausing to understand the data it encodes: what each given fact means, and how the facts relate to one another. They begin solving from a drawing they never really read, so the _givens_ — the very information that points toward a solution — go unexamined.

Existing tools don't address this. A general dynamic-geometry system like GeoGebra is construction-oriented and assumes the user is deliberately building a figure, not trying to _understand_ one that was handed to them.

There is a second angle: **creating** figures. Teachers and textbook authors need accurate geometry diagrams to put _into_ exams, worksheets, and books — and producing them with existing tools is tedious (GeoGebra is powerful but cumbersome for quickly turning out a clean, correctly-proportioned figure). Describing a figure in words and exporting the result would be far faster than constructing it by hand.

## Purpose

Geo Builder has students **enter the problem's data one fact at a time and watch the figure build itself** as each fact is added. Because the figure responds to every datum, the student sees **how the data items relate** — why this length, this angle, this point-on-a-side matters — instead of passively copying a finished picture. The act of entering the givens, one by one, is what turns copying into understanding.

As the figure takes shape, the system **surfaces the theorems relevant to the data entered**. This helps the student understand _why_ each fact was given and what it implies for **how to approach solving** the problem — connecting the givens to the path toward a solution.

The same describe-it-and-see-it capability serves a second purpose: a teacher or author can produce a figure from a sentence and **export it as an image** for a book, exam, or worksheet — without wrestling with a general-purpose construction tool.

## Audience

- **Primary:** Israeli high-school students preparing for bagrut geometry.
- **Secondary — teachers:** preparing problems, demonstrating them live, and **authoring materials** (exams, worksheets).
- **Secondary — content / textbook authors:** producing clean, correctly-proportioned geometry diagrams to include in books and printed materials. For this audience the value is describing a figure quickly and **exporting it as an image**.
- Not programmers. The interface is Hebrew, right-to-left, and must be usable with no training.

## Positioning — why this tool, when any AI can draw the picture

Recorded with the operator, 2026-10-26 (#2555). Applies to all four builders. Keep this section as the
source for any demo, video or pitch.

**The competition is general AI.** A teacher or student can paste a question into ChatGPT, Claude or
Gemini and get a picture. Producing *an image* is no longer the value. The value is what happens
**between** the givens and the picture: building it one given at a time, and seeing the figure change as
givens are added or removed.

**The core idea.** What the tool works on is **the problem's list of givens**, not the picture. The list
is ordered and editable, and the figure follows it. No other tool in the landscape has that object.

### The landscape

| | Input | What you get | Strong at | Where Geo Builder differs |
| --- | --- | --- | --- | --- |
| **AI chatbots** | Paste the question | A static picture, plus the solution | No effort; any topic | Their pictures look plausible but are often geometrically wrong; a new fact means a new picture; they hand over the answer |
| **GeoGebra** | Construct by hand with tools and commands | A live, draggable figure, 2-D and 3-D | Power, generality, community | You must know *how* to construct the figure, which is part of the problem; building takes time |
| **Desmos** | Equations | Live graphs, 2-D and 3-D | Analytic geometry, polish | You must already have the equations. Turning "the altitude from A" into one is the student's exercise |
| **Geo Builder** | The problem's givens, in free Hebrew or English text, one at a time | A live figure, correct by construction, that changes with every given | See below | — |

**One sentence:** Geo Builder turns a problem's givens into a live figure, built one given at a time, so
the class sees what each given does. AI gives you a picture of the answer; GeoGebra and Desmos make you
construct the figure yourself.

### Key benefits

Each benefit comes with the moment that shows it, for a demo or video.

1. **Plain language, rich vocabulary.** Free Hebrew or English text in the wording of bagrut questions,
   across four vocabularies: plane geometry, solid geometry, analytic geometry, complex numbers. No
   command syntax and no construction skill. *Show:* type a bagrut question's givens line by line as they
   appear on the page.
2. **The figure builds one given at a time.** Each given visibly changes the figure, and existing points
   never jump. *Show:* «ריבוע ABCD» → «נקודה G על AD» → «זווית GBA = 37», and G slides along AD until the
   angle holds.
3. **Switch a given off and on, edit it, delete it.** The figure loosens and you can see what that given
   was holding in place. *Show:* turn off the angle given, and G is free again.
4. **What the question did not say is visible.** «הציגו תצורה אחרת» shows another drawing the givens
   allow. An AI shows one picture and implies it is the only one. *Show:* a triangle that the question
   never said was acute flips to obtuse.
5. **Correct by construction, and checked.** Every figure is computed from the givens and checked
   against them: a stated 37° is 37°. *Show:* the givens list with every given verified, beside an AI
   picture with a wrong proportion.
6. **Every stated value is on the figure.** Lengths, angles and right-angle marks are labelled the way
   exam figures are.
7. **It does not solve the problem.** The figure helps the student think without giving the answer away.
   For a teacher this is a feature, not a gap.
8. **Live and spatial in 3-D.** Rotate and pan a solid to see it from any side. *Show:* a cube with a
   midpoint, turned around.
9. **From the givens straight to the figure, with no solving first.** In analytic geometry, "the altitude
   from A" or "a circle through three points" is drawn without the student computing any equation.
10. **Classroom and authoring ready.** Hebrew, right-to-left, in the browser, no installation, free;
    export the figure as an image for a worksheet or exam.

### What is not defensible

AI that writes a **live** GeoGebra or Desmos file from a pasted question is coming. When it works,
"language in, live figure out" stops being unique. What stays ours is the givens-list experience (add,
remove, alternatives, what each given constrains), guaranteed correctness, and the fit to the curriculum
and the classroom. Effort goes there, not into competing on drawing breadth.

## The core interaction (the heart of the product)

The user enters information **incrementally**, and the figure builds up and adapts as constraints accumulate:

1. "ריבוע ABCD" (square ABCD) → a square is drawn.
2. "נקודה G על AD" (point G on AD) → G appears somewhere on side AD.
3. "הזווית GBA שווה ל-37°" → the figure adapts: G slides along AD until the angle holds (or the system reports that no position works).

Two consequences define the product:

- **The figure is rarely fully determined.** Often more than one drawing satisfies the facts so far. The system shows **one valid configuration** and lets the user press a button to **cycle to an alternative** if one exists.
- **It builds, it doesn't restart.** Each new fact refines the existing figure; previously placed points should not jump around (see stability, NFR-*).

When the figure is fully specified, the construction is complete.

## Goals

- G1 — Accept incremental natural-language input (Hebrew and English) and render the described figure.
- G2 — Support genuinely incremental refinement: facts accumulate; the figure adapts without restarting.
- G3 — Represent under-determined figures and let the user browse alternative valid configurations.
- G4 — Surface relevant theorems as the figure is built, to help the student understand _why_ the given data matters and what approaches it suggests for solving the problem.
- G5 — Help students understand the relationships between the given data items, rather than treating the figure as a picture to copy.
- G6 — Let teachers and authors produce a figure from a description and **export it as an image**, for use in books, exams, and worksheets.
- G7 — Be free to distribute to students and teachers (no per-user cost barrier; see cost NFRs).
- G8 — Work in Hebrew RTL by default, on ordinary school hardware, with minimal/no onboarding.

## Non-goals (v1)

- Not a general dynamic-geometry system (GeoGebra replacement). The vocabulary is scoped to bagrut-style figures.
- Not a proof engine or solver of "find x" problems — it builds and displays figures, it does not solve the exercise.
- Not a curriculum, lesson sequence, or grading system.
- Not free-form drawing/construction by mouse; input is descriptive (language or guided), not draw-by-hand.
- Not a page-layout or illustration suite — authoring support means exporting the built figure as an image, not composing documents.

## Success criteria

- A student can reproduce a typical bagrut figure from its wording in a handful of steps, without instruction.
- Adding a fact never makes the existing figure jump or distort confusingly.
- When multiple drawings are valid, the user can find the one matching their problem via the alternatives toggle.
- Distribution cost to the operator stays negligible and bounded (see [NFRs](03-nonfunctional-requirements.md)).
- A teacher or author can produce a clean, correctly-proportioned figure from its description and export it as an image, faster than building it by hand in a general tool.
