# 02b — Functional Requirements: the 3-D Space Builder

_The contract for `src3d/`, live at `/3d-builder/`. Registered in [`DOCS.json`](../DOCS.json) as the
`3d` product's requirements doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041)). Decisions:
[06b](06b-decisions-3d.md) (`ADR-3D-NNN`). Build plan: [docs/20](20-space-vectors-tool.md)._

## What this document owns — and what it deliberately does not

The product answers the bagrut **space/vectors** question (שאלון 572 Q2): vectors in the geometric
approach on solids, the algebraic R³ lane of planes and lines, and the solids they live on. Same charter
as its siblings: **the student types the givens, the tool reproduces the figure and verifies claims — it
never solves the exam question.**

**This is a contract, not a catalogue.** The construct inventory is
[`src3d/parser/catalog3.ts`](../src3d/parser/catalog3.ts) — 230 entries, machine-checked by a guard test
that asserts every one parses in **both** Hebrew and English. Re-listing constructs here would create a
second copy that *can* drift, while the catalogue cannot. This document owns the layer above: what the
figure promises, what a claim means, what may never be invented, and how the tool refuses.

Shared surfaces — the suite chrome, the ask lane and data panel, save/load, export, bidi — are
[02w](02w-requirements-workspace.md). Quality attributes are
[03](03-nonfunctional-requirements.md).

> **A note on the id scheme.** The areas below are letters-only (`FR-SP`, `FR-VC`, …) rather than the
> obvious `FR-3D-*`. The FR-resolution guard matches `FR-[A-Z]+-\d+`, so an id containing a digit in its
> area would be **invisible** to it — unresolvable by omission rather than checked, which is precisely
> the enumeration failure [#904](https://github.com/dcodish/geo_builder/issues/904) exists to close.

IDs are stable references. "Must" = the product is dishonest or broken without it; "Should" = desirable;
"Later" = not yet.

## The two lanes

- **FR-SP-1 (Must)** — The product supports **two lanes over one model**: a **geometric** lane, where the
  student names basis vectors on a solid (`נסמן: AB=u…`) and reasoning is affine, and an **algebraic**
  lane of R³ coordinates, parametric lines and plane equations. A figure may use both; the lane is a
  property of the *statement*, never a mode the student must select. *(Realised — [docs/20](20-space-vectors-tool.md) §4.)*

## The space model

- **FR-SP-2 (Must)** — **Under-determination is welcome.** An unstated dimension stays a free degree of
  freedom that resamples on "another configuration", while everything the student *did* pin stands still.
  A figure that is not fully determined is a normal state, not an error.
- **FR-SP-3 (Must)** — **Defaults yield to statements; nothing unstated is ever invented.** A prism not
  stated to be right is **oblique**. A qualifier the parser recognises must be one it can lower — a
  recognised-but-dropped qualifier is a silent given, the same cardinal sin as drawing a figure that
  violates the givens. *(The 3-D form of [ADR-052](06-decisions.md#adr-052).)*
- **FR-SP-4 (Must)** — **Gauge is not knowledge.** A figure's placement, rotation and scale are a gauge,
  sampled freely unless something absolute is present (an equation plane, a parametric line, a coordinate
  point, a pin). The consequence is the honesty rule the whole product rests on: **a number drawn on the
  canvas must be seed-invariant knowledge.** One drawing's values are not a given, and printing them is
  dishonest. *(Realised — the landing funnel classifies which gauge components are provably free;
  `landing-funnel.test.ts` is its lock. The shared statement is [FR-DP-3](02w-requirements-workspace.md).)*
- **FR-SP-5 (Must)** — **A statement about an EXISTING object is a given, not a re-creation.** The same
  utterance drives a free figure or verifies a determined one, decided when it is applied. *(The "M1
  duality", the most productive pattern in this tree — reach for it before adding a construct.)*
  **Which side of the duality a statement falls on is decided by the FIGURE's freedom — never by the
  statement's spelling.** Two utterances that name the same relation must reach the same lane: an angle
  between two segments is a given whether or not the segments meet, and whichever endpoint each was
  written from. A drive available for one phrasing and not its synonym refutes the student on the
  strength of how they wrote it. *(Realised for the angle family — [ADR-3D-217](06b-decisions-3d.md#adr-3d-217),
  #909; `seg-angle-drive-909.test.ts`.)*
- **FR-SP-6 (Must)** — **A stated new label must land on the figure.** A decomposition that loses a point
  the student named is **refused, naming the label** — never committed with the point missing. A label
  that already exists is context, not a drop. *(Realised — `droppedNewLabels3`, `honesty3.test.ts`.)*
- **FR-SP-7 (Should)** — **One line may declare a solid AND a construct on it.** «קובייה ABCD עם אלכסון AC'»
  builds both; the student writes the sentence they were going to write anyway rather than splitting it to
  suit the grammar. Every solid and every construct the tool already reads compose by construction — the
  reading is a SPLIT into the two rules that own the halves, never a table of supported pairs. Where the
  construct is ambiguous the composed form inherits its half's question: «עם אלכסון ראשי» on a box names
  none of the four space diagonals, so it ASKS (ADR-052), and a clarify is never flattened into a pick.
  *(Realised — [ADR-3D-237](06b-decisions-3d.md#adr-3d-237), #893; the 2-D counterpart is ADR-430/#461.)*

- **FR-SP-9 (Must)** — **An UNDER-SPECIFIED statement is told what is missing; only an UNSUPPORTED one is
  told the tool cannot do it.** The two are different failures and must not share a voice: a student who
  wrote a sentence the tool understands but cannot pin down needs to know *which detail* to add, while
  "this is not supported" sends them away from a form that works. So a statement the parser RECOGNISES as
  ambiguous surfaces a typed clarification that **names the alternatives in the student's own notation**
  — «זווית A» on a vertex where three edges meet lists the angles it could mean — and never escalates to
  the LLM lane, whose job is to guess, nor borrows the scope register's unsupported wording. The
  corollary that keeps this honest: **the tool asks only when the figure really is ambiguous.** Where the
  same sentence has exactly one reading, it is resolved and built — asking there would make the
  clarification's own sentence untrue, and a single reading is not a guess.
  *(Realised — [ADR-3D-239](06b-decisions-3d.md#adr-3d-239), #866; the earlier members of the family are
  ADR-3D-131, #836's main-diagonal ask, and #467's ambiguous height.)*

## Vectors — the geometric lane

- **FR-VC-1 (Must)** — Accept a **named basis** on a solid and reason affinely over it: sums, scalar
  multiples, and the identities a bagrut question asks a student to verify.
- **FR-VC-2 (Must)** — Support **at most one symbolic parameter** in a vector expression, pinned by a
  given through root-finding. *(Two unknowns in one expression is a known boundary — issue #301.)*
- **FR-VC-2a (Must)** — **A POWER in a coordinate component is supported where the solver can pin it,
  and refused BY NAME where it cannot.** On a figure carrying a solid, `C(p², p, 0)` builds and the
  relation `x = y²` holds. On a figure with no solid there is nothing to pin the exponent in, and the
  statement is **refused with a message naming what is missing** — never accepted with the power
  quietly discarded, which would state a given the student did not give. *(Realised —
  [ADR-3D-218](06b-decisions-3d.md#adr-3d-218), #898; `power-needs-solid-898.test.ts`. The guidance
  register carries the same precondition, so the hint cannot promise what the next line refuses.)*
- **FR-VC-2b (Must)** — **A student can give a VALUE to any letter the figure carries, whatever introduced
  it.** «p = 3» is honoured whether `p` was born as a vec-def ratio («SN = k·SC»), in a coordinate
  («C(p²,1,0)»), in a vector or pair injection, in a line or plane equation, as the algebraic lane's
  parameter, as an angle label («∠SAB = α») or as the name of a free component («C(p,1,0)», #814). A
  letter with more than one owner receives the value at every owner. A value the figure cannot satisfy is
  **refused, naming the statement**; a letter the figure does not carry is refused as unknown — never a
  silent no-op. *(Realised — [ADR-3D-219](06b-decisions-3d.md#adr-3d-219), #902; `issue-902.test.ts`,
  `fixtures3/coord-symbol-value-902.geo3.json`.)* **The same holds for a stated SIGN** («k חיובי»,
  «k שלילי»): it is honoured for every kind of letter the figure defines, selecting among the roots where
  the symbol is pinned and choosing which half of the free range where it is not — a sign is the student
  saying WHICH branch they meant, and a default that survived it would assert a given they never gave
  (ADR-052). A sign no letter in the figure can carry is refused as unknown; one this kind of letter
  genuinely cannot expose (a rider parameter, confined to (0,1) by its own membership) says exactly that.
  *(Realised — [ADR-3D-236](06b-decisions-3d.md#adr-3d-236), #930/#922.)*
- **FR-VC-2c (Must)** — **A value whose letter is no longer defined is a fact in error, and the change that
  undefined it says so.** When the row that introduced the letter («∠SAB = α», «C(p²,1,0)», «SN = k·SC»)
  is deleted, muted or edited away, the value row («α = 70», «p = 3», «k = 1/2») stays in the list, is
  marked as not in effect with a reason naming the letter, and the figure does not pretend the value
  applies; the delete / mute / edit is committed as asked but reports the rows it left without effect,
  in the student's wording — never a bare success. The value **takes effect again by itself** when a
  definition is back, even one added after the value row. The same report serves a relation on a point
  whose defining row is gone — one class, one seam. Suite rule:
  [ADR-W-044](06w-decisions-workspace.md#adr-w-044). *(Realised — [ADR-3D-220](06b-decisions-3d.md#adr-3d-220),
  #926; `issue-926.test.ts`.)*
- **FR-VC-3 (Must)** — **NO CAS.** Every "symbolic" feature is a numeric root-find, a closed form, or a
  linear solve. Anything needing symbolic solving beyond that is **refused and escalated to the operator**,
  not approximated. This bound is what keeps the engine's answers trustworthy. *(Operator authority,
  [docs/20 §12](20-space-vectors-tool.md).)*
- **FR-VC-4 (Must)** — **No cross product is surfaced to a student.** The curriculum has none; it may be
  used internally, never shown or taught. *(Operator authority.)*

## Equations — the algebraic lane

- **FR-EQ-1 (Must)** — Accept **planes and lines by equation** and by the standard textbook framings, in
  both the verb-headed and noun-headed forms a student actually writes («ℓ חותך את π בנקודה A» and
  «A נקודת החיתוך של ℓ עם π» are the same fact). *(A rule carrying one frame silently drops the other on a
  capability the engine already has — a recurring trap in this tree.)*
- **FR-EQ-2 (Must)** — **Roots are branches.** Where a pinned parameter has several solutions, each is a
  valid configuration the student can cycle, exactly as elsewhere in the suite.
- **FR-EQ-3 (Must)** — **`no-roots` is an honest contradiction, never a fake point.** When a stated
  parameter cannot be satisfied, the figure **refuses and names the statement** — it never invents a
  nearby value to keep drawing. The discrimination is the *residual*, not the wording: only a genuinely
  impossible figure refuses. *(Realised — `refusal-honesty.test.ts`.)*

## Claims — the student's answer, never a driver

- **FR-CL-1 (Must)** — **A claim is verified, not obeyed.** When a student asserts a value or relation,
  the tool checks it against the figure across **several seeded configurations** and **refuses it
  (`claim-refuted`) when it is wrong**. A claim must never reshape the figure to become true — that would
  make the tool agree with the student instead of checking them.
- **FR-CL-2 (Must)** — **No claim can escape by hiding inside a composite.** Every claim is recorded on
  the construction and verified on evaluation, so a claim arriving as part of a larger command is checked
  like any other. *(Realised — `Construction3.claims`, verified in `derive3`.)*
- **FR-CL-3 (Must)** — **A refusal names the student's statement, not internal state**
  ([FR-SU-5](02w-requirements-workspace.md)).

## Rendering

- **FR-RD-1 (Must)** — **Textbook-grade wireframe the student can orbit**, with hidden edges dashed the
  way a textbook draws them, so a solid reads as a solid rather than a tangle of lines.
- **FR-RD-2 (Must)** — **Vector notation renders as notation** (arrows, vector pairs), and mathematical
  text as mathematics — a power as a power, not `p^2`. *(Realised — `VecMath.tsx` and the shared
  `shell/math.tsx`, [ADR-W-040](06w-decisions-workspace.md#adr-w-040).)*
- **FR-RD-3 (Should)** — **A number appears on the canvas only when FR-SP-4 permits it** — invariant
  across the sampled gauge. This is the rendering face of the same honesty rule.
- **FR-RD-4 (Must)** — **One arc per wedge; the value wins once stated.** An angle the student marked
  draws ONE arc at its vertex whatever combination of records carries it — a name («∠SAB = α»), a value
  («∠SAB = 70»), or both, in either order. The arc reads the **stated value** once one exists («70°») and
  the **letter** until then («α»); it never prints both, and never two labels at one pixel. A right-angle
  value draws the textbook knee and no arc, even when the angle was first named. Two genuinely different
  wedges at one vertex draw two arcs. Suite rule: [ADR-W-045](06w-decisions-workspace.md#adr-w-045).
  *(Realised — [ADR-3D-221](06b-decisions-3d.md#adr-3d-221), #923; `issue-923-917.test.ts`,
  `pyramid-named-valued-angle-923.geo3.json`. The identity of a wedge is by point ids; the
  alternate-spelling collapse 2-D does by ray direction is filed separately.)*
- **FR-RD-6 (Should)** — **A parameter the student VALUED offers a display choice; one they never
  valued is never replaced.** A bagrut question is worked in parts: part 1 reasons with «α» and a later
  part supplies 70, so which form belongs on the figure depends on where in the question the student
  is — which the tool cannot infer and must not guess. Once they state the value themselves, the figure
  shows it (FR-RD-4) **and the line that valued it carries a chip that sends the figure back to the
  letter**, per parameter, kept across «הצג תצורה אחרת» and a save/load round trip. The chip appears
  only where the two forms actually COMPETE on a surface — a surface that showed the letter before the
  value arrived and the value after it — so a letter nothing draws offers no choice. And a parameter the
  student did **not** value is never substituted: even when the figure determines it, the canvas keeps
  their letter and the computed value stays in the data panel. That second half is an honesty invariant
  — a value the student never wrote must not appear on the figure as though they had. One rule for every
  builder ([ADR-W-047](06w-decisions-workspace.md#adr-w-047)). *(Realised for the angle arc —
  [ADR-3D-233](06b-decisions-3d.md#adr-3d-233), #925/#937; `issue-937-param-display-chip.test.ts`. The
  coordinate lane's panel chip is a later adoption.)*
- **FR-RD-7 (Should)** — **A figure whose givens force a solid FLAT says so, naming the statements.** When the stated givens collapse a named solid's defining extent — «פירמידה SABCD שבסיסה ריבוע» with «∠BAS = 40» and «∠DAS = 50», where `cos²40° + cos²50° ≡ 1` puts the apex exactly in the base plane — the tool must not hand back a flat quadrilateral with every fact green and say nothing. It shows a **notice** naming the student's own statements («זווית BAS = 40» and «זווית DAS = 50»), not the solid's declaration and not a bare number of degrees of freedom. Explicitly **not a refusal**: every given is honoured and the drawing is the only one that satisfies them, so withholding it would be the opposite error. The test is coplanarity relative to the figure's own scale, so it is uniform over every solid — a prism of zero height and a tetrahedron whose apex falls into its base are the same fact — while shapes that are flat by definition (the 2-D vector lane) are exempt. One rule for every builder — [ADR-W-048](06w-decisions-workspace.md#adr-w-048); the 2-D half is #945. *(Realised — [ADR-3D-234](06b-decisions-3d.md#adr-3d-234), #936.)*
- **FR-RD-8 (Should)** — **A stated LENGTH is drawn beside its segment.** «AB = 5» writes the 5 at AB's midpoint on the canvas, not only in the data panel — the honesty invariant *"everything the student stated is visible on the figure"* applied to the magnitude lane, which previously held for a stated distance (a labelled witness line) and a stated angle (a labelled arc) but not for the commonest kind of all. **Stated only:** a length the givens merely determine stays in the panel, because putting derived numbers on the drawing turns it into an answer sheet. **Always drawn, including on a hidden (dashed) back edge** — a number that appears and disappears as the figure orbits reads as the tool losing the given. A restated length («AB = 5» then «BA = 5») is one statement and one label. Relational givens («|AB| = 2|CD|») are deliberately out: which segment would carry the text has no obvious right answer. *(Realised — [ADR-3D-235](06b-decisions-3d.md#adr-3d-235), #918.)*
- **FR-RD-5 (Must)** — **A stated angle is marked where the segments MEET.** «הזווית בין AC' לבין BD' היא
  55» on segments that genuinely cross draws the arc + value at the crossing, exactly as a shared-vertex
  angle draws it at the vertex; a stated angle between segments that are **skew**, parallel, or would
  meet only beyond the drawn ink draws **nothing** on the canvas (the R³ honesty rule — a mark there
  would assert an intersection the figure does not have) and stays in the data panel. A stated 90° is
  the knee, never an arc labelled 90°. The mark follows the meeting, not the spelling. *(Realised —
  [ADR-3D-222](06b-decisions-3d.md#adr-3d-222), #917; `issue-923-917.test.ts`,
  `box-seg-angle-cross-917.geo3.json`.)*

## Coverage

- **FR-SP-7 (Should)** — **Every 2009–2024 exam's space/vectors INPUT is expressible.** The tool
  reproduces the figure and verifies claims for the whole legacy corpus; it does not solve any of it.
  *(Realised — [docs/20](20-space-vectors-tool.md) §14, V8 complete. Documented remaining niches are
  low-frequency and coordinate-expressible: orthoscheme and the dihedral face↔base angle.)*
- **FR-SP-8 (Must)** — **Case in labels: where the anchor proves a run is a label, it is read as one;
  elsewhere the convention is taught, never guessed.** Point labels are uppercase by convention, and 3-D
  carries case-significant tokens 2-D lacks (axes x/y/z, parameters k/m/t, vector names u/v/w, R vs r,
  ℓ), so a blanket case-fold is not available. A lowercase run **parses like its uppercase twin** in a
  position only a label can occupy — after the angle glyph/word or a point/vertex noun (#181), or at the
  head of a coordinate definition («c(p²,0,1)», #924). An un-anchored lowercase run («ab = 5»,
  «ac ⊥ bd», «תיבה abcd») is **taught** — the corrected spelling is shown (#353) — and is never sent to
  the paid fallback. The case-significant lanes are byte-unchanged: `t(m-2,m,m+2)` in a line equation is
  the parameter, «נקודה x» stays the student's to disambiguate. *(Realised —
  [ADR-3D-039](06b-decisions-3d.md#adr-3d-039), [ADR-3D-092](06b-decisions-3d.md#adr-3d-092),
  [ADR-3D-223](06b-decisions-3d.md#adr-3d-223); `lowercase-labels.test.ts`, `lowercase-nudge.test.ts`,
  `issue-924.test.ts`. Whether a SOLID noun should become an anchor — «תיבה abcda'b'c'd'», a run the
  nudge cannot lift — is escalated on #924: two rulings collide there.)*

## Non-goals

- **Solving the exam question.** The tool draws and verifies; the student solves.
- **A CAS** (FR-VC-3), and **the cross product** as a taught operation (FR-VC-4).
- **Importing from a sibling product.** `src3d/` never imports `src/`; patterns are copied, not shared
  ([`BOUNDARIES.json`](../BOUNDARIES.json)). This is a hard boundary with operator authority, and it is
  mechanically enforced.
