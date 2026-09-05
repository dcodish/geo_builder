# 04b — Design: the 3-D Space Builder (`src3d/`)

_How the 3-D product is built. Registered in [`DOCS.json`](../DOCS.json) as the `3d` product's design doc
([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

**What it must promise** is [02b](02b-requirements-3d.md). Decisions are [06b](06b-decisions-3d.md);
the build plan and its corpus reading are [docs/20](20-space-vectors-tool.md). This is the *how*.

## Shape

| Layer | Size | What it is |
|---|---|---|
| `engine/` | 22 files, ~13,900 lines | `Vec3` core, solids, the apply reducer, `derive3`/`resolve3`, the solver, the relation disposition map, the operand resolver |
| `parser/` | 7 files, ~5,700 lines | `parse3.ts` (context-free rules), `catalog3.ts` (the coverage map), `llmShared3.ts` (the 3-D prompt) |
| `render/` | 9 files, ~2,500 lines | Orthographic-orbit SVG: `scene3.ts` (pure) + `Figure3.tsx`, plus vector notation |
| `store/` | 5 files, ~1,500 lines | Zustand + `zundo`, derive-on-demand, keep-prior-on-error, `.geo3.json` save/load |

The tree **copies patterns from `src/`, it never imports them** — 2-D and 3-D geometry differ in kind, so
an abstraction over both would leak ([`BOUNDARIES.json`](../BOUNDARIES.json), operator authority). The
shared chrome ([04w](04w-design-shell.md)) is the one sanctioned shared code.

## The parser is context-free — deliberately, and it is the better architecture

`parse3.ts` has **no `ParseContext`**: rules match text and nothing else, and *resolution happens at
apply*. Verified — zero `ParseContext`/`ctx.` references in the file.

This is the opposite of 2-D, where the parser carries figure context, and the divergence is intentional
([docs/17 §3b](17-design-rules.md)). Deciding what a name refers to at **apply** time rather than parse
time is what makes [`FR-SP-5`](02b-requirements-3d.md)'s M1 duality possible: the same utterance drives a
free figure or verifies a determined one, because the decision is taken where the figure is known. A
context-carrying parser has to guess earlier, with less information.

Consequence for anyone adding a rule: **reach for M1 duality before adding a construct.** It is the most
productive pattern in this tree precisely because the seam exists.

## The solver — a coordinate-injection pivot, not a general CAS

`solve3.ts` handles the case the corpus actually asks for: a gauge-free figure built in the geometric
lane receives **absolute givens mid-session** (a point coordinate, a vector value), and the engine solves
for the **similarity** — translate, rotate, scale — *plus* the figure's free shape dimensions that realise
them. Numerically: least-squares over the dims, Levenberg–Marquardt with a central-difference Jacobian,
seed-rotated multi-start.

This is the concrete meaning of [`FR-VC-3`](02b-requirements-3d.md)'s **NO CAS** bound. Every "symbolic"
feature here is a numeric root-find, a closed form, or a linear solve; anything beyond that goes back to
the operator rather than being approximated. The bound is what makes the answers trustworthy — an
approximate symbolic result would be indistinguishable, to a student, from a correct one.

**A symbolic coordinate lives in one of two structurally different lanes, and the lane decides what can
be expressed.** With a solid present the component becomes a pivot **pin** carrying the full affine form,
exponents included; with no solid it becomes a `coord-sym` point whose components are stored as a
degree-1 `{k, p}`. They are different objects, not one object evaluated two ways — so a capability
present in one is not automatically present in the other, and the narrower lane must **refuse what it
cannot hold rather than narrow it silently**. A lossy lowering is the worst outcome available: it looks
like success and states a given the student never gave. See [ADR-3D-218](06b-decisions-3d.md#adr-3d-218)
(#898), where a component reducer summing coefficients and never reading exponents drew «C(p²,p,0)» as
«C(p,p,0)».

## Gauge, and why the landing funnel exists

A figure's placement, rotation and scale are a **gauge** — free unless something absolute pins them. The
**landing funnel** classifies which gauge components are *provably* free, and that classification is what
licenses [`FR-SP-4`](02b-requirements-3d.md): a number may be drawn only if it survives the gauge being
resampled. Without the funnel the engine could not distinguish "this length is 5" from "this length is 5
*in the drawing I happen to have chosen*", and printing the second is dishonest.

## Relations as a disposition map

`relationTable.ts` maps each `relation × operand-kind` pair to a status and the actions it licenses
(`drive`, `claim`, or unsupported) rather than scattering that knowledge across rules. Two properties
follow: a relation the engine cannot yet drive is **claim-gated** instead of silently mis-driven, and the
map is enumerable — which is how [docs/26](26-3d-relations-plan.md)'s program could be closed against a
list rather than against intuition.

`operands.ts` resolves operand *thunks*, so a rule names what it wants without knowing how that operand
will be produced.

## Claims

Recorded on `Construction3.claims` at apply and verified in `derive3`, so **a claim cannot escape by
arriving inside a composite command**. `claims.ts` checks each against four deterministic seeds
(`claimSeeds`) — the multi-sample discipline that makes a coincidence refutable.

## Rendering

Orthographic orbit, with hidden edges dashed the way a textbook draws them, decided by **numeric outward
normals** rather than a painter's-algorithm approximation. `scene3.ts` is pure and React-free;
`Figure3.tsx` mounts it. Vector notation (arrows, pairs) is `notation.ts`; general math text comes from
the shared [`shell/math.tsx`](04w-design-shell.md).

## Known gaps

Recorded here because a design doc that omits its weakest properties is not describing the system.

- **The claim verdict is two-valued** — `verifyClaim` returns a boolean, so "the givens forbid it" and
  "the givens leave it free" both surface as `claim-refuted`. In a product entered line by line that
  tells a student their correct answer is wrong because they had not finished typing, and it contradicts
  [`FR-SP-2`](02b-requirements-3d.md) ("under-determination is welcome") in the claim lane specifically.
  The complex builder solves this with a three-valued verdict.
  **[#909](https://github.com/dcodish/geo_builder/issues/909)** — the requirement in 02b deliberately
  describes today's behaviour, not the desired one.
- **A symbolic line-equation given resolves in ~12 s**, and the *canonical* spelling is the slowest path.
  **[#863](https://github.com/dcodish/geo_builder/issues/863).**
- **The DOF cue does not count the six placement DOFs** the sampler now varies, so the number a student
  sees and the freedom the engine has can disagree.
  **[#370](https://github.com/dcodish/geo_builder/issues/370)** — needs a ruling on the cue's semantics.
