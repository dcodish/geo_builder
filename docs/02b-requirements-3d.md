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
- **FR-SP-6 (Must)** — **A stated new label must land on the figure.** A decomposition that loses a point
  the student named is **refused, naming the label** — never committed with the point missing. A label
  that already exists is context, not a drop. *(Realised — `droppedNewLabels3`, `honesty3.test.ts`.)*

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

## Coverage

- **FR-SP-7 (Should)** — **Every 2009–2024 exam's space/vectors INPUT is expressible.** The tool
  reproduces the figure and verifies claims for the whole legacy corpus; it does not solve any of it.
  *(Realised — [docs/20](20-space-vectors-tool.md) §14, V8 complete. Documented remaining niches are
  low-frequency and coordinate-expressible: orthoscheme and the dihedral face↔base angle.)*

## Non-goals

- **Solving the exam question.** The tool draws and verifies; the student solves.
- **A CAS** (FR-VC-3), and **the cross product** as a taught operation (FR-VC-4).
- **Importing from a sibling product.** `src3d/` never imports `src/`; patterns are copied, not shared
  ([`BOUNDARIES.json`](../BOUNDARIES.json)). This is a hard boundary with operator authority, and it is
  mechanically enforced.
