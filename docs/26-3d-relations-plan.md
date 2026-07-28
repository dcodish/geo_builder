# 3-D relations — the operand-atom program

**Status: PROPOSED (2026-07-28).** Commissioned by the operator after #375: *"since we need all of these
relations… we also have [skew]… I want to have a big task here to just do all of them… I think it's better
to have the right generic solution."*

Authoritative for the relation-coverage work. Per-slice decisions go in
[06b-decisions-3d.md](06b-decisions-3d.md); status updates go in CLAUDE.md's 3-D section.

## 1. The problem, measured

Four bugs on 2026-07-28 ([ADR-3D-095](06b-decisions-3d.md#adr-3d-095), 097, 098, 100) were one class: *a
relation modelled correctly, exposed through an enumeration that covers a subset of its operand kinds.*
Fixing cells one at a time is what built the table below. Measured on `main` + #375:

| | two segments | named line ℓ | line & plane | plane & plane |
| --- | --- | --- | --- | --- |
| ⟂ | ✓ | **✗** | ✓ (both plane forms) | **✗** |
| ∥ | **✗** | **✗** | ✓ (segment only) | **✗** |
| skew (מצטלבים) | ✓ | **✗** | — | — |
| intersecting (נחתכים) | ✓ | **✗** | ✓ named π only | **✗** (ישר החיתוך) |
| coincident (מתלכדים) | **✗** | **✗** | — | **✗** |
| contained (מוכל) | — | **✗** | **✗** | — |
| angle = v | ✓ | **✗** | ✓ (segment only) | **✗** |
| distance = v | **✗** | **✗** | **✗** | **✗** |
| point ON it | — | **✗** | — | ✓ |

**The pattern: a named line is a second-class operand, and ∥ is thinner than ⟂ everywhere.** The
capabilities largely EXIST — `on-line` is fully built ([ADR-3D-031](06b-decisions-3d.md#adr-3d-031)),
`line-plane-angle` works for a segment ([ADR-3D-027](06b-decisions-3d.md#adr-3d-027)), the engine carries a
`seg-par` pin, skew is a built claim. What is missing is *reach*, not machinery.

## 2. The generic solution

### 2.1 The operand atom

Every relation in this space takes two operands drawn from ONE closed set:

```ts
type Operand3 =
  | { kind: 'point'; id: Id }
  | { kind: 'segment'; a: Id; b: Id }      // also the pair form of a vector
  | { kind: 'vector'; name: string }
  | { kind: 'line'; name: string }         // ℓ, ℓ1 — parametric or derived
  | { kind: 'plane-run'; ids: Id[] }       // ABC, ABCD
  | { kind: 'plane-named'; name: string }; // π, π1
```

ONE tokenizer reads an operand from text (nouns optional and non-deciding — the #375 lesson: classify by
what the token IS, since the kinds are known). ONE resolver turns it into geometry:

```ts
resolveOperand(op, c, resolved) -> { point } | { dir, through } | { normal, d }
```

A line-like operand yields a direction plus a point on it; a plane-like operand yields a normal plus offset.
Everything downstream speaks only that.

### 2.2 One relation, one row

```ts
type Rel3 = 'perp' | 'parallel' | 'skew' | 'intersecting' | 'coincident' | 'contains' | 'angle' | 'distance';
```

A single command `{ type: 'relate3'; rel: Rel3; lhs: Operand3; rhs: Operand3; value?: number }`. Apply routes
it M1-style — drive when the figure has the freedom, verify when determined — and the residual is chosen
from a table keyed by `(rel, lhsShape, rhsShape)` where shape ∈ {point, line, plane}. That is **8 relations ×
6 shape pairs**, not 8 × every phrasing × every noun.

**This is what kills the class:** a new operand kind is one tokenizer case and one resolver arm; a new
relation is one table row. Neither requires touching any existing rule.

### 2.3 What it replaces

`perpPlaneClaim`, `perpSegGiven`, `linePerpPlane`, `planeLinePerp` (#375), `parallelClaim`, the mutual-position
rules, `linePlaneAngle`. Each is re-expressed as a table row. The migration is only safe if the lowering is
proved unchanged — see §4.

## 3. Slices

**S1 — the atom, no behaviour change.** `Operand3` + tokenizer + resolver. Re-express the EXISTING ⟂ rules
through it. Gate: every currently-parsing utterance lowers to byte-identical commands (the shadow matrix is
the instrument — it must change by *nothing at all* in this slice).

**S2 — fill the line column.** Point-on-named-line (the reported item; wires the built `on-line`), ∥, ⟂,
angle for named lines. Gate: the §1 table's "named line ℓ" column is ✓ throughout.

**S3 — plane ↔ plane.** ∥, ⟂, angle, and the intersection line as a first-class relation.

**S4 — mutual positions, complete.** intersecting / parallel / skew / coincident over every operand pair,
as GIVENS (driving) as well as claims. **Includes showing skew** — the operator's explicit ask. The
common perpendicular already exists ([ADR-3D-028](06b-decisions-3d.md#adr-3d-028)); drawing it dashed
between the two lines, with its length, is what makes "these never meet" visible rather than asserted.

**S5 — distances.** point–plane, skew lines, parallel planes; as givens, as claims, and in the query lane.

Order is a preference, not a dependency: S2–S5 are independent once S1 lands. S1 is the one that must be
first, and the one whose value is invisible from the outside.

## 4. Non-negotiables

- **S1 changes no lowering.** The shadow-matrix snapshot is the proof: it must not change in S1 at all.
  Later slices may only change it by ADDITION (the [ADR-3D-090](06b-decisions-3d.md#adr-3d-090) discipline).
- **M1 duality per relation**: a statement about a determined figure verifies; about a free one, drives.
  A relation that can only verify is not finished — with placement free ([ADR-3D-095](06b-decisions-3d.md#adr-3d-095))
  verify-only refuses `claim-refuted` on nearly every seed.
- **General position on every path.** ADR-3D-095's guard was bypassed twice this session — once by the
  projection (#372), once by the driven path (#375 Am. 1). Any new drive must be checked against it.
- **Both locales, both orders, nouns non-deciding** (#375).
- **The chokepoint registry must SHRINK**: this program deletes rules, it does not add them.
