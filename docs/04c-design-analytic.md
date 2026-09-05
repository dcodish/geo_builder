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
| `engine/` | ~1,000 lines | `expr` (the numeric expression layer), `conic`, `curves`, `apply`, `evaluate`, `derive`, `types` |
| `parser/` | ~400 | `parseAnalytic.ts` + `catalogAnalytic.ts` |
| `render/` | ~215 | `scene.ts` (pure) + `Figure.tsx` |
| `store/` | ~120 | Zustand, the ordered fact list as source of truth |

Roughly 2,350 source lines against `src/`'s 42,000 — this is a V0, not a peer.

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

- **Test coverage is thin by the workspace's standards** — 2 test files and ~460 test lines against
  ~2,350 source lines, where the mature trees run better than 1:1. Appropriate for a V0 in build, and
  worth stating plainly so it is a known position rather than an oversight discovered later.
- **`02c` is still marked IN PROGRESS.** It was captured live from an operator session and its decisions
  are not all ratified as `ADR-AG-NNN` yet; where it and [docs/19](19-analytic-geometry-tool.md)
  disagree, docs/19 is authoritative until they are.
- **Not deployed** (above). The readmission path is mechanical: flip `enabled` to `true` and drop
  `devOnly` in [`products.json`](../products.json), and add its RUNBOOK row.
