# 01 — Vision & Purpose

_Last updated: 2026-06-10_

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

## The core interaction (the heart of the product)

The user enters information **incrementally**, and the figure builds up and adapts as constraints accumulate:

1. "ריבוע ABCD" (square ABCD) → a square is drawn.
2. "נקודה G על AD" (point G on AD) → G appears somewhere on side AD.
3. "הזווית GAB שווה ל-37°" → the figure adapts to satisfy it (or reports a contradiction).

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
