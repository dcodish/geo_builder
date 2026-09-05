# 02d — Functional Requirements: the complex-numbers Builder

_The contract for `src-complex/`, live at `/complex-builder/`. Registered in [`DOCS.json`](../DOCS.json)
as the `complex` product's requirements doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041)).
Decisions: [06d](06d-decisions-complex.md) (`ADR-CX-NNN`). Plan and grammar contract:
[docs/27](27-complex-numbers-tool.md)._

## What this document owns

A student types the givens of a bagrut **complex-numbers** question (שאלון 572, פרק ראשון Q3) line by
line and **the Gauss plane draws itself — the drawing the exam never prints.** Same charter as every
sibling: **the student types the givens, the tool reproduces the figure and verifies claims — it never
solves the exam question.**

**Contract, not catalogue.** The sentence families the parser accepts are
[docs/27 §10](27-complex-numbers-tool.md), which is the authoritative grammar contract, and the formula
sheet is [docs/29](29-complex-formula-reference.md) — **byte-matched against the formula table by a
test**, so it cannot drift. This document owns what the product promises: what is exact, what a number
on screen means, what may never be dropped, and how a claim is answered.

Shared surfaces — suite chrome, the ask lane and data panel, save/load, export, bidi — are
[02w](02w-requirements-workspace.md). Quality attributes are
[03](03-nonfunctional-requirements.md).

IDs are stable references, and their areas are letters-only so the FR-resolution guard can see them
(`FR-[A-Z]+-\d+`). "Must" = the product is dishonest or broken without it; "Should" = desirable;
"Later" = not yet.

## The figure

- **FR-GP-1 (Must)** — **The Gauss plane is always drawn.** The exam prints no diagram; producing it is
  the product's reason to exist. Every stated number appears on the plane, not only in a panel.
- **FR-GP-2 (Must)** — **The ordered fact list is the source of truth and the figure is derived.**
  Positions are never stored, so undo cannot desync. *(The suite-wide architecture, stated here because
  it is a promise about correctness, not only a design choice.)*
- **FR-GP-3 (Must)** — **A display transform never reaches the parser or the engine.** The
  polar↔cartesian toggle and the `n` stepper are **view state** — outside the store and outside undo — so
  changing how a number is *shown* can never change what was *stated*. *(ADR-CX-001 D3.)*

## Exactness and configuration

- **FR-CN-1 (Must)** — **The multiplicative core is answered EXACTLY, not numerically.** Products,
  quotients, powers and roots are decided by exact linear algebra over ℚ rather than by iteration, so a
  modulus or argument the givens force is reported without drift. Sums, areas, distances and series are
  the numeric residue. *(Realised — [ADR-CX-006](06d-decisions-complex.md).)*
- **FR-CN-2 (Must)** — **NO CAS.** The exact core is bounded linear algebra over two vector spaces.
  Anything wanting general symbolic algebra is refused and escalated to the operator, never approximated.
  *(Operator authority.)*
- **FR-CN-3 (Must)** — **Branches are the exam's «כל האפשרויות».** The integer `k` in an angle equation
  enumerates a real solution set, and "show another configuration" walks that set — so a question asking
  for *all* possibilities can be seen, not just described.
- **FR-CN-4 (Must)** — **A default is a starting value, never a fixed one.** An unstated magnitude is a
  free degree of freedom: it must move on "another configuration" or when a later given forces it. Free
  DOF has **one** definition — the nullspace dimension — read by the cue, the knowledge gates and the
  sampler alike, so the three can never disagree. *(The complex form of [ADR-052](06-decisions.md#adr-052).)*
- **FR-CN-5 (Must)** — **A second mention of a name is a GIVEN, not a redefinition.** Re-stating `z1`
  adds information about the existing number; it never silently replaces it. *(Realised —
  [ADR-CX-005](06d-decisions-complex.md), [ADR-CX-009](06d-decisions-complex.md).)*

## Knowledge and claims

- **FR-KN-1 (Must)** — **A number printed on screen is knowledge**: invariant across every valid
  configuration, with its gauge pinned. **The figure shows everything; the panel prints only what was
  asked for, and only what is known.** A value true of the current drawing but not forced by the givens
  is not printed. *(The product's statement of the suite rule [FR-DP-3](02w-requirements-workspace.md).)*
- **FR-KN-2 (Must)** — **A claim is the student's answer: verified, never obeyed.** A claim never
  reshapes the figure to become true.
- **FR-KN-3 (Must)** — **A claim gets one of THREE verdicts, and the third is not optional:**
  - **holds** — the givens force it, decided exactly;
  - **refuted** — the givens forbid it, decided exactly;
  - **unknown** — *not decidable from what has been stated.*

  The third exists because **a claim about a direction the givens leave free is not wrong, it is
  unanswered** — and marking it ✗ would tell a student their correct answer was incorrect because they
  had not finished entering the question. In a product whose defining interaction is entering a problem
  **line by line**, that distinction is the difference between a tool that checks a student and one that
  contradicts them out of its own incompleteness. *(Realised — `src-complex/model/claim.ts`. The 3-D
  builder collapses `unknown` into `refuted`; that is [#909](https://github.com/dcodish/geo_builder/issues/909),
  found by writing this requirement.)*
- **FR-KN-4 (Must)** — **The engine states WHAT happened; the reading layer words it.** A verdict carries
  a structured reason code, not a sentence, so the same fact reads correctly in Hebrew and English and
  the wording can improve without touching the engine. *(Realised — `model/why.ts`, #716.)*

## Input honesty

- **FR-LN-1 (Must)** — **Nothing stated is ever silently dropped.** Every non-filler token span in the
  student's line is claimed by the parse, or the line is **refused**. There is exactly one mechanism —
  span accounting — and **no `dropped*` gate is ever added**: the 2-D history shows those accumulate as
  per-symptom patches and still leave holes ([ADR-CX-009](06d-decisions-complex.md) §2).
- **FR-LN-2 (Must)** — **A refusal names the student's statement**, never internal state
  ([FR-SU-5](02w-requirements-workspace.md)), and reads correctly in an RTL sentence with LTR
  mathematics inside it ([FR-WI-2](02w-requirements-workspace.md)).
- **FR-LN-3 (Should)** — **Series are in scope**, being part of the corpus question rather than an
  extension of it. *(docs/27 §2.)*

## Non-goals

- **Solving the exam question.** The tool draws and verifies; the student solves.
- **A CAS** (FR-CN-2).
- **Importing from a sibling.** `src-complex/` never imports `src/` or `src3d/`; the `shell/` tree is the
  one sanctioned shared code, and the `engine` layer is copied-never-shared, always
  ([`BOUNDARIES.json`](../BOUNDARIES.json), [ADR-W-016](06w-decisions-workspace.md#adr-w-016)).
- **Regressing a sibling.** Capability grows here and the shipped products never regress — checked by
  `npm run check:siblings`, not promised ([ADR-W-017](06w-decisions-workspace.md#adr-w-017)).
