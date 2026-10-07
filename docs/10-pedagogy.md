# 10 — Pedagogy: the charter for all four builders

> **Draft for the operator's review** (#1861 step 3). Built from his own words. Where text was written by
> a session and no ruling stands behind it, it says so, marked *session-drafted*.

The operator asked for this document in these words:

> *"the pedagogy is where the logic is and why i would want certain behaviors. its supposed to help
> design the features using my guildelines. we need a general pedagogy and perhaps per tool where things
> differ"* (2026-10-07, #1861)

**How to use it.**
- Before you build anything a student sees, in any builder, find the principle it touches.
- Follow the principle's **For a feature** line.
- If no principle covers the behaviour, or the feature would bend one, it is a product decision. Write it as a `[proposed]` line in the plan and ask the operator (CLAUDE.md rule 7).
- Product docs implement these principles; they never re-decide them. Where a product doc differs, this document wins.
- The rulings of 2026-10-07 are recorded verbatim in [ADR-W-118](06w-decisions-workspace.md#adr-w-118).

**How each principle reads.**
- **His words** are verbatim, with the source.
- **Why** is his stated reason, when he gave one. Where he gave none, the line says so; a session's reading is marked *session reading*, and he may rewrite it.

---

## 1. Why the tool exists

*Session-drafted, awaiting the operator.* Bagrut geometry questions print a figure. Students copy it
without reading the givens that produce it. The tool reverses that: the student enters the givens, one at
a time, and watches the figure build from them.

His closest words:
- *"from a pedagogy POV, I would like the user to be able to enter the inputs from this question and have
  the tool visualize the location of points and calculations."* (2026-08-14, ADR-CX-002)
- *"the base is geometry with coordinates, because that is how the bagrut is built"* (analytic,
  2026-09-04, ADR-AG-009)
- *"the rule should be (always) to visualize the problem — whenever possible, we draw the points."*
  (complex, 2026-08-14, ADR-CX-001)

**Four builders, two situations.**

| Builder | The exam… | So the tool… |
| --- | --- | --- |
| **2-D geometry** | prints a figure | rebuilds it from the givens. It is the reference for plane geometry in every builder (P12) |
| **3-D space** | prints a solid | rebuilds it from the givens |
| **Analytic geometry** | prints no figure | draws the figure the question describes |
| **Complex numbers** | prints no Gauss plane | draws the numbers the question gives |

---

## 2. The principles: all four builders

### P1 — The student states the givens; the figure follows
- **His words:**
  - *"This issue of multipart is not specific for this type of question. It's always been the case in all of the questions we do. … Section two builds on section one, so the engine should not be surprised … the data panel accumulates all of the referred or inferred data from the question."* (2026-09-03, ADR-AG-003)
  - *"the idea of order is not relevant since the diagram should either respect all input or refuse to build"* (2026-09-19, #1242).
- **Why:** *"the diagram should either respect all input or refuse to build"*.
- **For a feature:**
  - Every given the student types changes the figure or the panel, or it is refused with a reason (P9).
  - The order of the givens never changes the result.
  - A later part of a question adds to what is already there.

### P2 — No fixed assumptions
- **His words:**
  - *"the radii need to be DOFs — there is no chance the fixed values will hold for any question."* (2026-06-17, ADR-051)
  - *"when we say «משולש ABC שווה שוקיים» you fix AB=AC, which is not always the case and not what the user said — it just says 2 sides must be equal."* (2026-06-24, ADR-114)
  - *"When drawing a quarter of a circle, it is not clear what order of nodes to enter so I think the tool should not assume one."* (2026-09-15, ADR-521)
  - *"the user doesnt know that O was assigned … thats why we create a random point O until user assigns its location"* (2026-10-02, #1688)
- **Why:** *"there is no chance the fixed values will hold for any question"*; it is *"not what the user said"*; *"the user doesnt know that O was assigned"*.
- **For a feature:**
  - An unstated size, angle, position, proportion or choice is free (ADR-052).
  - A default is only a starting drawing. It changes on «הציגו תצורה אחרת» and when a later given forces it.

### P3 — Openness is visible
- **His words:**
  - *"the shape could be anywhere; the student should see a different valid drawing each time they cycle — a random size/rotation — until they add enough information to narrow it to one solution. Lots of freedom early is correct."* (2026-06, ADR-018)
  - *"when there are 0 dof but still more than 1 solution we need such a message added to the regular dof that we report"* (2026-09-30, ADR-556)
  - «הציגו תצורה אחרת» *"should always swap if there are more than 1 option"* (2026-10-01, #1539)
- **Why:** *"until they add enough information to narrow it to one solution"*.
- **For a feature:**
  - The status shows how much is still free.
  - «הציגו תצורה אחרת» re-samples everything unstated.
  - «✓ הציור נקבע במלואו» appears only when exactly one figure fits; otherwise the status says how many configurations exist (B8, #1596, every builder).

### P4 — A choice the tool made is said, never presented as forced
- **His words:**
  - *"when we draw a משולש שווה שוקיים or דלתון we should draw as we do today but add a message that the image doesnt know or assume which of the sides are equal and that the user should specifically say which are equal"* (2026-09-10, #973)
  - *"we should keep the message up as long as its not defined"* (2026-09-11)
  - Withdrawing one such note: *"we don't need this message. the right angle could still be anywhere and it sounds from the message that it must be A"* (2026-09-30, ADR-556)
  - *"I write «טרפז ABCD» and the tool assumed AB is parallel to CD. I then write «AB parallel to CD» and the tool says this is already known — which it should not be, because that was assumed, not given."* (ADR-AG-082)
- **Why:** a message must not make an open choice *"sound … that it must be"* one way; and something the tool chose *"was assumed, not given"*.
- **For a feature:**
  - Say that a choice is the tool's, never which one as if it were the student's.
  - An assumption is never reported as "already known".
  - Every builder (B10; analytic is ported in #1864).

### P5 — The canvas shows what the student stated; computed values go in the data panel
- **His words:**
  - *"if the value of the parameter is computable, but user did not enter it, the canvas always shows the parameter and data panel can show the computed values."* (2026-09-08, ADR-W-047)
  - *"The canvas carries the inputs and the data panel has the calculated values."* (2026-09-29, #1563)
  - *"Anything that is derived from the figure should stay in the data panel"* (2026-09-15, ADR-AG-016)
  - *"we should have 10 show on the AB line since this is a given and not calculated."* (ADR-AG-028)
  - *"when we do a height, I want the knee to show since this is a direct request from the user. if the angle is calculated as 90 we don't show it since its derived"* (2026-09-19, #1241)
- **Why:** *"in part 1 of the question user needs to work with the parameter alpha and in a later part alpha is given."* (#925). Replacing the letter with its value on the canvas would erase what part 1 reasons about.
- **For a feature:**
  - A value appears on the canvas because the student stated it, or because the student asked for it.
  - A value the tool computed goes in the panel.
  - A letter the student valued later gets a chip that switches between letter and value.
- **Recorded exceptions**, each ruled:

  | Exception | Ruling |
  | --- | --- |
  | **A measurement the student asked to see** is drawn on the canvas | *"i want to see values on the canvas as well as in the data panel … he can always untick a meansurement he wanted to see"* (#1121) |
  | **Analytic: a circle's centre** is always marked, with its coordinates when known | *"in analytical geo the center is always important … if center is known, put its values."* (ADR-AG-036) |
  | **Analytic: a parabola's focus and directrix, an ellipse's foci** | *"analytics also address the foci and the מדריך for parabola and elipses"* (B7, #1863; not built yet) |
  | **3-D: computed coordinates** while the data panel is open | ADR-3D-014 Am. 3 |
  | **Complex: a typed number** shows as typed, and in its polar form in the polar view | D1, 2026-10-07 (#1862) |

### P6 — Values are marked; relations are listed
- **His words:**
  - *"when an angle of segment are given, we need to put those values on the sement or angle like the 2d tool does"* (2026-10-03, #1714)
  - On the equality ticks a session added beyond that request: *"I dont remember asking for the markers on the sides of the isosceles triangle. we dont need them."* … *"remove entirely. i never asked for this"* (2026-10-06, #1805)
- **Why:** no stated reason beyond the request itself. *Session reading:* the resting figure should look like the question. A mark the student did not ask for is a clue the student did not ask for.
- **For a feature:**
  - A stated length, angle, area or letter, and the right-angle knee, appear on the figure.
  - A stated relation (AB = AC, ∥) is in the givens list. It is drawn only in an opt-in relations layer, never as a mark at rest (B2, every builder).
  - An area reads «S=13» (B9, every builder).

### P7 — Answers are pulled, never pushed, and never step by step
- **His words:**
  - *"we dont solve it for you means we dont show you step-by-step solutions"* (2026-10-07, B5)
  - *"While this is somewhat against the ADR that says this is not a discovery tool, this is how I want students to get used to organizing their data. We can have a checkbox."* (2026-07-07, ADR-3D-014)
  - *"we show the values and equations once they are defined by the input … we show in data panel."* (2026-09-03, ADR-AG-003)
  - *"when I select to see a distance or an equation of a line, I want the relevant formula to be shown on screen, so we don't just show the result — we show what to use to get to this result."* (2026-09-15, ADR-AG-062). He chose the level that shows the formula with this figure's numbers, without the arithmetic.
  - *"I don't want a guessing game. we either show or not. I think we need to show the equation if we can determine it"* (2026-09-16, ADR-AG-072)
- **Why:** *"this is how I want students to get used to organizing their data"*; *"we show what to use to get to this result"*.
- **For a feature:**
  - Nothing appears unbidden on the canvas.
  - The data panel opens on request.
  - A value appears only when the givens determine it.
  - A formula may show this figure's numbers. The working (the arithmetic, the steps) never shows.

### P8 — Two possible values are both shown
- **His words:**
  - *"2 options - yes - because many exams ask questions that have 2 options. but not more than 2."* (2026-09-29, #1506)
  - *"if there are 2 options, we always show up to 2 options."* (2026-10-03, ADR-AG-226)
  - *"there should be 2 lines for this loci and both should appear since they are the answer together and not just one of them"* (ADR-AG-166)
  - *"complex should also show both values - so it should follow all of the tools"* (2026-10-07, B12)
- **Why:** *"because many exams ask questions that have 2 options"*.
- **For a feature:**
  - Show up to two values, joined by «או», in every builder (#1867).
  - More than two possible values: not ruled. Treat it as `[proposed]` and ask him.

### P9 — A refusal teaches the reason
- **His words:**
  - *"tell user why it is refused and not some generic message. this rule should go into pedagogy"* (2026-09-03, #887)
  - *"why can't SO be 4?"*, raised to P1 (2026-09-30, #1590)
  - *"refuse on all tools with a message since it contradicts ABC is a triangle and a flat line is not a triangle"* (2026-10-07, #1849)
  - *"even if they do fall on the same point by chance … the system should not show them on top of each other … So this is otherwise very confusing to show two points on the same location."* (2026-09-20, ADR-W-066)
  - Proof targets: *"all refused with exaplanation"* (2026-10-02, #1649)
- **Why:** a generic message *"should be more specific"*; two points stacked are *"very confusing"*; a flat line *"is not a triangle"*.
- **For a feature:**
  - Every refusal names the student's statement and says what in the figure conflicts with it, and what to do next where there is something.
  - "No figure fits", "several fit" and "not supported yet" read as three different sentences.
  - When the tool is at its own limit, it says so and never implies the student miscalculated.
  - One wording per refusal kind in every builder, with 2-D as the reference (B13, #1868).
  - Never draw a figure green for givens that cannot hold.

### P10 — Input is taught, never silently accepted
- **His words:**
  - *"When a user enters a command like add a line, draw a shape, we need to tell him to add the input as a textbook would… I don't want the tool to support the wrong text input because it teaches them wrong."* (2026-08-24, #778)
  - *"…we can tell them exactly how to write it… but also translate what the user said and write it ourselves, so the user isn't upset that he has to enter things twice."* (#778)
  - *"if a fact is already known - it should not be added. this is true to all tools."* (2026-08-16, #613)
- **Why:** *"because it teaches them wrong"*; *"so the user isn't upset that he has to enter things twice"*.
- **For a feature:**
  - Non-textbook input is answered with the textbook form, pre-filled for the student.
  - A restated fact is acknowledged as already following, not added. A fact the tool only assumed is not "known" (P4).

### P11 — The student's language and the student's words
- **His words:**
  - *"nothing should be in english if data was entered in hebrew"* (ADR-AG-172)
  - *"the data panel says נתוני העקום and עקום is mathematically correct but not what a highschool student would expect"* (ADR-AG-099)
  - *"in the data panel, the slope of 4/3 is written as 1.33 which is wrong"* (ADR-AG-084)
  - *"decimal points, only two numbers after the point. This is a rule that should be for all of the tools we have."* (#723)
  - *"no need for an llm mark - we have that in the logs and user couldnt care less"* (ADR-W-065)
- **Why:** *"not what a highschool student would expect"*; 1.33 for 4/3 *"is wrong"*.
- **For a feature:**
  - Hebrew throughout, in a high-school student's vocabulary, never engine words (B11: «הענף» goes, #1866).
  - Exact forms first, then at most two decimals.
  - A line the AI fallback rewrote carries no marker.

### P12 — One sentence, one verdict, one drawing, in every builder
- **His words:**
  - *"we need a rule that ensures consistency in data input. especially on geo stuff between 2d and analytics tool"* (2026-10-02, #1649)
  - *"analytics and 2d should have same user experience"* (#1669)
  - *"If I ask for a behavior that doesnt match the 2d decision in a non-2d tool, I want to be warned about it. If i change behavior in 2d tool that affects the other tools, i should be asked about it too."* (2026-10-07, B1)
- **Why:**
  - *"I think its of value to have all work the same way for future maintenance and user standardization"* (#1359)
  - *"from a user pov he should be familiar with the tool and how to use it and what to expect"* (ADR-W-018)
- **For a feature:**
  - For plane geometry, 2-D is the reference for what a sentence means **and** for how the figure is drawn and worded.
  - A deliberate difference is a recorded exception (docs/22 §10; the behaviour table in 02w).
  - Warn him in both directions before building.

### P13 — The figure is the authority, and it stays in view
- **His words:**
  - *"the figure is the authority"*; *"a root outside the segment is not a lesser configuration — it is not a configuration"* (2026-09-20, 02c R59)
  - *"we should have a rule that the full shape is always in the canvas. we can play with the ratio of axis but the image needs to be in window"* (2026-10-01)
  - *"clean canvas always"* (2026-09-06, ADR-W-046)
  - *"when drawing a triangle for the first time (i.e., new canvas) we want A on top and BC horizonal"* (#161)
  - *"I see no difference in the cases so we should always allow switching names of nodes."* (#1199)
- **For a feature:**
  - The whole figure stays in the window.
  - A new builder or a cleared canvas starts empty.
  - Letters can always be swapped.
  - A drawing that breaks a given is not "one of the configurations".

### P14 — The teacher uses the student's tool
- **His words:** *"add it to complex too. this is a basic capability of the tool"* — on exporting the question as a document (2026-10-07, B16).
- **Why:** no further stated reason. The 2026-09-15 choice (ADR-AG-010) put authoring and live demonstration in scope and a question library out.
- **For a feature:**
  - There is no separate teacher mode.
  - Whatever a teacher needs (export, a clean figure for a worksheet) is in every builder (#1872).

### P15 — Theorem surfacing is switched off
- **His words:** *"for the 2d tool i want to disable the theorems for now. its not ready and is just confusing."* (2026-08-18, #740)
- **The original intent, in his words** (kept for when he revisits it):
  - *"theorems that should appear don't appear, and it seems pretty random what theorems are presented."*
  - *"not critical if one is higher than the other, but the important ones first"*
  - *"Principles are things that I, as a teacher, can tell you: whenever something is given — or whenever something emerges from the diagram — you should think about something. Tips on how to approach the problem, not theorems."* (docs/18, 2026-07-06)
- **For a feature:**
  - The 2-D engine and its tests stay.
  - Students see nothing.
  - Re-enabling it is his decision (B4).
  - The design history is in [archive/18](archive/18-theorem-relevance-plan.md), [archive/16](archive/16-theorems-plan.md) and the first version of this document ([archive/10-pedagogy-2026-06](archive/10-pedagogy-2026-06.md)).

---

## 3. Where the tools differ

### 2-D geometry
- **The reference** for plane geometry: its verdicts, its drawing and its wording (P12).
- **The relations layer.** Equal sides and angles show when the student opts in and points at them. A declared shape's own equalities show when the layer is on.
- **Vectors are not part of 2-D, by design.** They belong to the space unit (#1184).

### 3-D space
- **The solid rests on the floor.** *"Keep it flat on the floor"* (2026-09-27, ADR-3D-272). «הציגו תצורה אחרת» changes its shape, never its tilt.
- **Vectors live here.** *"on 3d tool, i cannot create a simple vector AB. on first classes of the subject this is required."* (#1184). Stated vectors are drawn, along with what follows from them: *"this is important for students learning geometric vectors"*; *"only stated vectors. anything else, the user can ask for specifically."* (ADR-3D-254)
- **Organising the data.** The data panel can show derived sides and coordinates, *"how I want students to get used to organizing their data"* (ADR-3D-014). Coordinates show on the canvas while the panel is open, a recorded exception to P5.

### Analytic geometry
- **The exam prints no figure,** so the tool draws the one the question describes. It is built on *"geometry with coordinates, because that is how the bagrut is built"* (ADR-AG-009).
- **Conic marks.** A circle's centre is always marked (P5 exception). A parabola's focus and directrix, and an ellipse's foci, follow the same rule (#1863).
- **Formulas, not working.** An asked-for distance or equation shows its formula with this figure's numbers, never the arithmetic (P7).
- **No checking of answers:** *"I dont want a validation tool"* (ADR-AG-072).
- **Locus on request.** A locus appears when the student asks for it.
- **x and y are never a length:** *"I dont think its good practive anyway to confuse x in analytics. in the 2d its normal but not in analytics"* (ADR-W-109).

### Complex numbers
- **Always draw:** *"the rule should be (always) to visualize the problem — whenever possible, we draw the points."* (ADR-CX-001)
- **The canvas follows P5,** with the typed-number exception (D1, #1862).
- **Claims.** A bare statement the givens decide is checked: holds, does not hold, or can't tell. A line with «הוכיחו» is refused like everywhere else (D3, #1870).
- **Roots:** *"if there is only 1 root symbol in the real and/or in the imaginary part, we leave the root symbol but if there is more, we use decimal"* (#1404).
- **The AI fallback** is coming, as in the other builders (B14, #1869).

---

## 4. Session-drafted text awaiting the operator

These passages have no ruling behind them yet. Treat them as `[proposed]`.
- §1's thesis, "copy the figure vs read the givens". It originates in docs/01 and the first version of this document (2026-06), both written by sessions.
- The *session reading* lines in P6.
- The eight principle tips below.

---

## עקרונות — the principles catalog (T5, ADR-248)

_**Session-drafted, awaiting the operator's review** (ADR-248 §3 wrote these eight in an overnight run;
ruling B4). The 💡 PRINCIPLES lane is switched off with the theorem surface (#740)._

_`PRINCIPLE_TABLE` (src/theorems/principles.ts) must match this table byte for byte; an integrity test
enforces it. To add or rephrase a principle, edit here AND in the table — the test fails until both agree.
Intent archetypes are principles whose trigger is a givens-constellation and whose tip is a
direction-QUESTION; they never instantiate objects and never see the question text (the D5 guardrails)._

**In this document, only this table may have a row whose first cell is a lowercase word.** The guard reads
every such row as a principle.

| slug | Hebrew tip | English tip |
|---|---|---|
| right-triangle-complementary | משולש ישר-זווית: נסמן זווית חדה אחת ב-α, והשנייה היא 90°−α (שתי הזוויות החדות משלימות ל-90°). | Right triangle: name one acute angle α and the other is 90°−α (the two acute angles are complementary). |
| parallels-seek-similar-triangles | אם יש ישרים מקבילים, חפשו משולשים דומים. | If the figure has parallel lines, look for similar triangles. |
| congruence-hunt | נתונים כמה קטעים/זוויות שווים בין שני משולשים — אולי חפיפת משולשים? | Several equal segments/angles between two triangles are given — perhaps congruent triangles? |
| bisector-setup | זווית שחוצים אותה — בדקו את משפטי חוצה הזווית. | An angle is bisected — check the angle-bisector theorems. |
| midsegment-setup | שני אמצעי צלעות — קטע אמצעים? | Two side midpoints are given — a midsegment? |
| thales-chain | קוטר נתון — איזו זווית היקפית נשענת עליו? | A diameter is given — which inscribed angle stands on it? |
| power-of-a-point | שני חותכים/משיק מנקודה חיצונית — המשפטים התומכים (נספח). | Two secants / a tangent from an external point — see the supporting (appendix) product relations. |
| median-hunt | נתון תיכון — במשולש ישר-זווית זכרו שהתיכון ליתר שווה למחציתו. | A median is given — in a right triangle remember the median to the hypotenuse equals half of it. |
