# 10 — Pedagogy

_Last updated: 2026-06-13._

This is the **pedagogical charter** for Geo Builder: what we want students to *learn* by using it, the teaching principles each feature is meant to serve, and — most concretely — the **construction → theorem** payload that the theorem feature ([Phase 6](09-implementation-plan.md#phase-6--theorems)) must deliver. Where [01-vision](01-vision.md) says *what the product is* and [02-requirements](02-requirements.md) says *what it must do*, this document says **why, in learning terms** — and is the place to record every pedagogical intention as it comes up, so they aren't scattered across ADRs and chat.

It is a **living document.** When we decide the tool should teach or surface something, write it here.

---

## 1. The thesis: reading the givens, not copying the picture

Israeli bagrut geometry problems come with **both a verbal statement and a figure**. Because the figure is already drawn, students **copy it visually** and start solving from a picture they never actually *read* — the givens, the very information that points to the solution, go unexamined ([Vision §The problem](01-vision.md)).

Geo Builder's one move against this: the student **enters the problem's data one fact at a time and watches the figure build itself.** Because the figure responds to every datum, the student *sees how the data relate* — why this length, this angle, this point-on-a-side matters — instead of passively reproducing a finished drawing. **The act of entering the givens, one by one, is what turns copying into understanding.** Everything below is in service of that.

Two product facts carry pedagogical weight (Vision §Core interaction):

- **A figure is rarely fully determined.** Often more than one drawing fits the facts so far. We show one and let the student **cycle to an alternative** — teaching that the givens *constrain* a figure without uniquely fixing it, and that "the picture in the book" is one case among several.
- **It builds, it doesn't restart.** Each fact refines the existing figure; earlier points don't jump ([stability, NFR](03-nonfunctional-requirements.md)). Continuity is cognitive, not just visual: the student tracks *their own* accumulating construction.

This maps to Vision goals **G4** (surface relevant theorems → understand *why* the data matters and *how to approach* solving) and **G5** (understand the *relationships between the data*, not the figure as a picture to copy).

---

## 2. How each mechanic teaches

Every interaction is chosen for a learning effect, not just a feature checkbox.

| Mechanic | Requirement | What it teaches |
|---|---|---|
| **Incremental fact entry** (one datum → one visible change) | FR-EN-1, US-1 | Each given is a *separate thing to read and understand*; the student can't skip past a datum because each one visibly does something. |
| **The figure adapts to each fact** | FR-EN-1, FR-EN-10 | The *relationships* between data — a point slides until an angle holds, a side stretches until a length is met — are made visible, not stated. (**G5**) |
| **Alternatives toggle** (cycle valid configurations) | FR-ALT-1/2/3 | A set of givens can describe *more than one* figure; "the diagram" is a representative, not the truth. Trains students to ask "is my case the only one?" |
| **Stability** (no jump when a fact is added) | NFR (stability) | The construction is *theirs and continuous*; attention stays on the new fact, not on re-reading a re-shuffled picture. |
| **Over-constraint feedback** ("that contradicts…") | FR-EN-8, US-3 | Givens must be *mutually consistent*; a contradiction is information. Teaches that not every combination of facts is drawable. |
| **Theorem surfacing** | FR-TH-1/2/3, US-4 | Connects the givens to the **solution path** and to the **citable body of theory** (see §3–4). The core of **G4**. |
| **Bilingual He/En, RTL, zero-onboarding** | FR-I18N-*, NFR | Access *is* pedagogy: the tool must not add a language or tooling tax on top of the geometry. |

---

## 3. Theorem surfacing — the central teaching feature

As the figure takes shape, the system **surfaces the theorems whose hypotheses the current figure satisfies** ([07-theorem-reference](07-theorem-reference.md), FR-TH-1). This is where "build a figure" becomes "understand a problem." Design intentions:

- **Tied to what the student entered.** A theorem appears *because of* a fact (or facts) just added — so the student reads it as "*this* is why that given was there / *this* is what it buys me." We want a surfaced theorem to be **traceable to the specific facts that triggered it** (highlight them on the canvas).
- **Citable by official bagrut number.** IDs are the official theorem numbers (1–109). Surfacing "**Theorem 103**: an inscribed angle on a diameter is 90°" means the student can *cite it in an exam* — the feature isn't a hint, it's a bridge to the formal apparatus they're graded on.
- **Property (P) vs converse/characterization (C)** — these teach different moves:
  - **P** ("if the figure has X, then Y holds") — *use* a configuration to get a new fact. The forward step of solving.
  - **C** ("a figure with X **is** a Y" / "Y ⇒ X") — *recognize / justify a classification*. The step that lets a student name what they're looking at and justify it. Surfacing converses is how the tool helps students **identify** a figure's type, not just compute with it.
- **Definite vs possible matches** (FR-TH-2). A theorem whose hypothesis is *certainly* met vs one that *would* apply in a more special case. Distinguishing them trains rigor — "do I actually know this is isosceles, or does it just look it?"
- **Most-relevant first; don't flood** (FR-TH-1). A wall of 20 theorems teaches nothing. Surface the few the latest fact makes relevant.

**It surfaces; it does not solve or prove** ([Vision non-goals](01-vision.md)). The tool points at the theorem that applies and the facts that triggered it — *the student still does the reasoning.* We are deliberately not building a "find x" solver or a proof engine. The pedagogical bet is that *seeing the right theorem at the right moment, attached to the data that earned it*, is what's missing — not the answer.

---

## 4. Construction → theorem triggers (the pedagogical payload)

This is the actionable design target for Phase 6: **when the student builds X, the tool should raise theorem(s) #N.** It is the concrete form of "everything we want the tool to teach." Grow this table as constructs and theorems land; it is the bridge between the construct vocabulary (parser/engine) and the theorem catalog ([07](07-theorem-reference.md)).

### The worked example — right triangle inscribed in a circle

The construct we just built (`right triangle ABC inscribed in a circle`, [ADR-025](06-decisions.md#adr-025)) places A,B as a diameter and C on the circle, right angle at C. The moment that figure exists, the tool should surface:

- **Theorem 103 (P)** — *An inscribed angle subtending a diameter is a right angle (90°).* — זווית היקפית הנשענת על קוטר היא זווית ישרה.
- **Theorem 104 (C)** — *A 90° inscribed angle subtends a diameter.* — זווית היקפית בת 90° נשענת על קוטר.

The teaching: the student sees *why* "right angle" and "on the circle" went together — the hypotenuse **is** a diameter (so its midpoint is the centre, so the hypotenuse passes through the centre). 103 lets them *deduce* the right angle from the diameter; 104 lets them *deduce* the diameter from a right angle. This single figure is the canonical demonstration that the construct and the theorem are two faces of one fact — exactly the connection the tool exists to make.

### Starter trigger map (extend freely)

| When the figure contains… | Surface theorem(s) | Type |
|---|---|---|
| A right angle inscribed on / a diameter subtended by an inscribed angle | **103**, **104** | P, C |
| The three **medians** of a triangle (centroid) | **15** (concurrent), **17** (2:1 split), **16** (equal-area halves) | P |
| The three **angle bisectors** of a triangle | **80** (concurrent → incenter), **81** (every triangle has an inscribed circle) | P |
| An **inscribed angle** and the central angle on the same arc | **99** (inscribed = ½ central) | P |
| Two inscribed angles on the same chord, same side | **102** (equal) | P |
| A **tangent** drawn at a point of a circle | **105** (tangent ⟂ radius), **106** (converse) | P, C |
| Two **tangents** from one external point | **108** (equal), **109** (centre–point bisects the angle) | P |
| A **perpendicular from the centre to a chord** | **97** (bisects chord, central angle, arc) | P |
| A figure built as a **parallelogram / rectangle / rhombus** | the matching characterization theorems (e.g. **54**: a parallelogram with a right angle is a rectangle) | C |
| A **line parallel to one side of a triangle** cutting the others | **73** (extended Thales — proportional segments) | P |
| A transversal across **parallel lines** | **4** (alternate equal), **6** (corresponding equal), **8** (co-interior 180°); converses **5/7/9** when the equality is *given* | P, C |

> These are design intentions, not yet implemented detection. Phase 6's `detect(figure)` predicates ([plan](09-implementation-plan.md#phase-6--theorems)) realise this table; the gate is that the listed **P/C** IDs surface (with correct definite/possible confidence) and that **O**-tagged items, definitions, and area/perimeter formulas **never** surface.

---

## 5. Design guidelines for anything that "teaches"

When we add a surfacing rule, a hint, or any teaching affordance, it should respect these:

1. **Surface, don't solve.** Point at the relevant theorem and the triggering facts; never hand over the answer or a proof. (Vision non-goal.)
2. **One fact → a few theorems, not a flood.** Relevance and ordering matter more than recall; an overwhelming list is noise.
3. **Trace to the trigger.** A surfaced theorem should be linkable to the exact objects/facts that satisfied its hypothesis (highlight on canvas). The student must see *what in my figure made this apply*.
4. **Stay citable and exact.** Use official numbers and the catalog's exact statements ([07](07-theorem-reference.md)). The tool's authority is that it speaks the same language as the exam.
5. **Honour under-determination.** When the figure isn't fixed, say so (definite vs possible), and let alternatives be explored rather than implying the displayed case is the only one.
6. **Forward (P) and recognition (C) are both first-class.** Don't surface only "use this" theorems; the converses that let a student *name and justify* a configuration are half the skill.
7. **Hebrew-first, no jargon tax.** Statements appear in the student's language; the geometry is the only hard part on screen.

---

## 6. The teacher / author dimension

The same engine serves teaching beyond the solo student (Vision audience):

- **Live demonstration.** A teacher can build a problem's figure fact-by-fact in front of a class, making the "read the givens" habit visible — and use the alternatives toggle to show *why the book's figure is one case*.
- **Authoring** (G6, FR-HS-5). Producing clean, correctly-proportioned figures for exams/worksheets/books by *describing* them. The pedagogy here is indirect but real: materials authored this way inherit correct proportions and unambiguous givens.
- Modelling the disposition we want in students: *figures are described and reasoned about, not just drawn.*

---

## 7. Open pedagogical questions (future / possibly non-goal)

Recorded so they aren't lost; not commitments.

- **"Why does this theorem apply here?"** — a one-line, figure-specific justification beneath a surfaced theorem (still short of a proof).
- **Next-fact suggestion** — given the partial figure, nudge "what would pin this down?" Risks crossing into solving; weigh against the surface-don't-solve rule.
- **Progressive disclosure / sequencing** — should surfacing adapt to a student's level? Currently out of scope (Vision: not a curriculum), but worth revisiting.
- **From figure to proof skeleton** — explicitly a non-goal for v1; noted only to mark the boundary.
- **Misconception probes** — using the alternatives toggle deliberately to confront "it looked like X but isn't."

---

### Pointers

- [01-vision](01-vision.md) — goals **G4/G5**, the problem framing this doc deepens.
- [02-requirements](02-requirements.md) — **FR-TH-\***, **FR-ALT-\***, **FR-EN-8**, user story **US-4**.
- [07-theorem-reference](07-theorem-reference.md) — the canonical theorem catalog (IDs, P/C/O tags) that §4 maps onto.
- [09-implementation-plan](09-implementation-plan.md#phase-6--theorems) — **Phase 6**, where the §4 trigger map becomes `detect(figure)`.
