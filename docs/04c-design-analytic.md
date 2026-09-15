# 04c — Design: the analytic Builder (`src-analytic/`)

_How the analytic product is built. Registered in [`DOCS.json`](../DOCS.json) as the `analytic` product's
design doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

**What it must promise** is [02c](02c-requirements-analytic.md) — the V1 pedagogy and requirements
captured live from the operator. Decisions are [06c](06c-decisions-analytic.md); the plan of record is
[docs/19](19-analytic-geometry-tool.md).

> **Status: V0 in build, and deliberately NOT DEPLOYED**
> ([ADR-AG-007](06c-decisions-analytic.md)). Its `products.json` entry carries `enabled: false` plus
> `devOnly: true`, so no shipped builder can render a chip pointing at a 404 while the app is still
> reachable in its own dev switcher. This document describes a tree that is smaller and younger than its
> three siblings, and says so rather than describing an aspiration.

## What is different about this product

The siblings **reproduce** a printed figure. This one **produces the figure the exam withheld** — 17 of
20 sampled שאלון 572 Q1s print no drawing, and two instruct the student to draw one
([docs/19 §2](19-analytic-geometry-tool.md)). Every design choice below follows from that asymmetry, and
from the ruling that **text is the only source of givens**: where an exam leans on its picture to carry a
given, that is a defect in the exam, not a gap the tool should paper over
([02c](02c-requirements-analytic.md) P2/P3).

## Shape — the smallest of the four trees

| Layer | Size | What it is |
|---|---|---|
| `engine/` | ~1,200 lines | `expr` (the numeric expression layer), `conic`, `curves`, `apply`, `carriers` (the DOF contract), `evaluate`, `derive`, `types` |
| `parser/` | ~400 | `parseAnalytic.ts` + `catalogAnalytic.ts` |
| `render/` | ~215 | `scene.ts` (pure) + `Figure.tsx` |
| `store/` | ~120 | Zustand, the ordered fact list as source of truth |

Roughly 2,350 source lines against `src/`'s 42,000 — this is a V0, not a peer.

## The model — objects, and the register that makes them free

The primitive is the **geometric object** ([ADR-AG-009](06c-decisions-analytic.md#adr-ag-009),
ratifying [02c](02c-requirements-analytic.md) R1): a `Construction` is `{ params, objects }`, and
`GeoObject` is a discriminated union — `point` and `curve` are the two *stated* members V0 built, and
the shape nouns and derived points of [02c §5](02c-requirements-analytic.md) join them as further
members rather than as a parallel model. An equation, a shape noun and a coordinate pair are three
ways to *state* an object; the exact conic fit is how an equation identifies **which** object it names.

The object kinds are `point` and `curve` (stated), `derived` (a midpoint, a centroid, an incentre —
a pure function of parents already stated), and `segment` / `polygon` (drawn from their endpoints).

`engine/carriers.ts` holds the **degree-of-freedom contract**, and two things live there:

- **The register of free parameters is derived from the objects' own expressions**, never from the F11
  declarations. A declaration *narrows* a symbol's domain; it does not bring the symbol into
  existence. Reading declarations alone is what made `y²=2ax` — an entry on the tool's own reference
  card — evaluate to `NaN` and reach the honest "not at this parameter value" path by accident,
  drawing nothing and saying nothing (#1014).
- **`carrierOf` / `symbolDeps` / `objectDeps` are exhaustive switches** over `GeoObject`, so a new
  object kind is a compile error until it declares its freedom, its symbols and its dependencies. The
  2-D tree learned this the expensive way — the same kind-sets hand-listed across ~7 sites, where a
  forgotten one was a silent dropped DOF rather than a type error (ADR-043). The pattern is **copied,
  never imported**, before the vocabulary grew.

**There is deliberately no topological sort, and since #1028 that is a finding rather than a
deferral.** Derived points made the object→object relation non-empty — and a sort is still the wrong
shape, because `apply` refuses a statement naming an object that does not exist yet. A parent is
therefore always already in the list when its dependent is appended: declaration order is provably a
valid evaluation order and a cycle is unreachable. The invariant is asserted by
`depsPrecedeDependents` rather than re-established by a sort that could never find anything out of
place. A kind that can forward-reference is what would earn one.

## The three cores

- **`expr.ts` — the numeric expression layer.** Its docblock states the design intent exactly: *"the
  smallest thing that lets a coefficient carry a PARAMETER."* Analytic geometry's questions are full of
  half-specified equations (`y = mx + 8`, a circle with unknown radius), so a coefficient must be able to
  be an unknown without dragging in a symbolic algebra system. The scoping — *smallest thing* — is the
  design decision.
- **`conic.ts` — equation → curve, plus the canonicity gate.** An exact conic fit, with a gate deciding
  whether the result is in canonical form. The gate matters because a student's equation and the
  canonical one must be recognised as the same object.
- **`curves.ts` — curve geometry.** Resolution to numbers, membership residuals, and the polylines the
  renderer draws. **Pure**, so the renderer stays a consumer rather than a second geometry implementation
  — the same split every sibling uses.

## The submit path's three answers ([ADR-AG-020](06c-decisions-analytic.md#adr-ag-020))

`App.submit` dry-runs the whole line list with the new line appended, and the result is one of
**three** things, not two:

| outcome | recorded? | shown |
| --- | --- | --- |
| `faulted` | no | the refusal, naming the student's own statement |
| `created` / `narrowed` | yes | the figure updates |
| `known` | **no** | an informational notice — «זה כבר ידוע…» |

The third row is the one that was missing. `applyFact` had answered it since V0 as a boolean
`absorbed`, `derive` did not carry it, and the submit path therefore asked only *"is there a fault?"*
and recorded the line on every `no`. The student saw their sentence listed twice and was told nothing.

**The effect is decided once, at the apply boundary**, and carried out through `fold` (per fact,
positionally beside `errors`) and `derive` (rolled up per line). That is what makes the fact list, the
counter and the notice agree: they read one answer rather than each re-deriving one.

**`narrowed` exists because `absorbed` was hiding two events.** «a הוא פרמטר» then «a<13» merges into
the existing declaration — absorbed — but adds information, so it is a real given and belongs in the
list. Collapsing it into "already known" would silently drop a stated given.

## Born after the chassis

This is the **first builder created after `shell/` existed**, and the difference shows in what it did
*not* have to do: it mounts the shared frame from its first line rather than re-deriving chrome and being
retrofitted later. Suite conformance is **half of its V0 acceptance gate**
([ADR-AG-004](06c-decisions-analytic.md)), not a follow-up.

It also inherited the bidi discipline from day one — `shell/bidi` rides as a post-processor over every
rendered message, so `y = -2x + 8` cannot reverse inside a Hebrew refusal. The three siblings each
learned that separately, twice as a bug.

## Boundaries

`src-analytic/` never imports `src/`, `src3d/` or `src-complex/`; its only allowed edge is `shell/`, and
it posts to the proxy over HTTP rather than importing `server/`. These edges were declared in
[`BOUNDARIES.json`](../BOUNDARIES.json) **on arrival** rather than after a bug — the third tree had
shipped with a *vacuous* guard because it was registered with no edges at all, and that lesson was
applied to the fourth.

## Known gaps

- **Test coverage is still thin by the workspace's standards, though less so** — 3 test files and ~713
  test lines against ~2,650 source lines (110 tests), where the mature trees run better than 1:1. B1
  added the DOF-contract suite and a second catalog guard. Appropriate for a V0 in build, and worth
  stating plainly so it is a known position rather than an oversight discovered later.
- **`02c` is still marked IN PROGRESS**, though less of it is open than was. It was captured live from an
  operator session and its decisions are not all ratified as `ADR-AG-NNN` yet; where it and
  [docs/19](19-analytic-geometry-tool.md) disagree, docs/19 is authoritative until they are. **Ratified
  since:** R1/R2/R5 — the object-first model and the tier-3 solve
  ([ADR-AG-009](06c-decisions-analytic.md#adr-ag-009)) — and the teacher lane, 02c §7
  ([ADR-AG-010](06c-decisions-analytic.md#adr-ag-010)).
- **The equation-first descriptions above have been rewritten** for the object model
  ([ADR-AG-009](06c-decisions-analytic.md#adr-ag-009) B1). What has *not* changed is the tree's
  vocabulary: B1 re-founded the model without adding a single new statement form, so the families this
  product can express are still V0's. B2 (the joint solve) and B3 (the shape vocabulary) are where that
  moves.
- **Not deployed** (above). The readmission path is mechanical: flip `enabled` to `true` and drop
  `devOnly` in [`products.json`](../products.json), and add its RUNBOOK row.
