# 04w — Design: the shared chrome (`shell/`)

_How the one shared UI tree is built. Registered in [`DOCS.json`](../DOCS.json) as the `workspace`
product's design doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

**What it must promise** is [02w](02w-requirements-workspace.md) — one look, an always-present ask lane,
a save envelope that refuses a foreign file, and so on. This document is how those are built, and why
the tree exists at all.

## The problem it solves

Three products grew the same chrome three times and it looked and behaved like three different apps.
[docs/28 §1](28-product-unification.md) measured the divergence: the ask lane existed in three shapes,
bidi isolation was present in two builders and absent in the third, and the doctrine was duplicated **in
prose** across the orientation files — which §1c named as the real defect. Copying an engine is correct
(2-D and 3-D geometry differ in kind); copying a *button row* is not.

## The one architectural rule

> **`shell/` is parameterized by its caller and knows no product.**

Roster, labels, content and callbacks arrive **as data**. A shared module may never branch on product
identity, because "a fork wearing a shared file's name" ([ADR-W-016](06w-decisions-workspace.md#adr-w-016)
rule 2) reintroduces the divergence the tree exists to remove.

**How it is achieved in practice: slots, not flags.** Every frame component takes the product-shaped part
as a prop it renders without inspecting — `AskLane` takes "the product's own answered rows",
`DataPanel` takes "extra product blocks below the skeleton", `FactList` takes "the product's row of list
actions". The component owns the *shape*; the caller owns the *content*.

**Verified, not assumed** (2026-09-05): the word "product" appears 58 times in `shell/frame/`, every one
in a prop docblock describing a slot. There is no `product === '2d'`-style branch anywhere in `shell/`
source — the only such comparisons in the tree are inside a test asserting switcher config.

## What may enter, and when

[ADR-W-016](06w-decisions-workspace.md#adr-w-016) seeds the tree **by evidence**: a surface enters only
when it is *already implemented ≥ 2 times and settled*. The clause exists to stop an abstraction being
invented from a single example, where the second use then bends its shape.

[ADR-W-040](06w-decisions-workspace.md#adr-w-040) records what the clause is actually counting:
**consumers, not copies.** A settled single implementation that acquires a second *consumer* satisfies
it; a surface still being designed does not, however many callers want it. That reading is what let
`mathText` move in with one implementation and two consumers rather than being copied first and
extracted later.

## Two layers

| Layer | Modules | What they are |
|---|---|---|
| **Primitives** | `theme.ts` · `bidi.ts` · `i18n.ts` · `format.ts` · `math.tsx` · `symbols.ts` · `save.ts` · `switcherConfig.ts` | Pure, no React, no product knowledge. Design tokens, bidi isolation, the i18n bootstrap, number/math display, the save envelope, the config overlay merge |
| **Frame** | `AppFrame` · `Workbench` · `Switcher` · `InputArea` · `FactList` · `DataPanel` · `AskLane` · `SymbolRow` · `QuickChips` · `Banner` · `ManualScreen` · `Modal` · `ToolButton` · `FigureName` | React components implementing the D1–D10 rulings ([docs/28 §4a](28-product-unification.md)), each taking its product-shaped content as a slot |
| **Export** | `export/svgToPng.ts` · `export/questionDoc.ts` | The shared output paths behind "save image" and "download question" |

The primitives layer is the one a product can adopt without changing its layout, which is why adoption
started there.

## Adoption order, and why it was staggered

The tree was created with **exactly one consumer** — `src-complex/`, the product not yet in production —
under an explicit operator constraint: *"i cannot afford impacting the 2d and 3d in prod."* That is why
the first ADR records its own reversibility: nothing shipped depended on it, so the tree could have been
deleted without touching a live product.

Consumers were then added deliberately, each as its own tracked edge in
[`BOUNDARIES.json`](../BOUNDARIES.json): `src-complex` → `src3d` (B3) → `src-analytic` (born after the
chassis existed, so it mounted the frame rather than re-deriving it) → `src` **last**. With the 2-D edge
the one-look goal became structural rather than aspirational: every product now consumes the tree, so a
chrome change that reaches one reaches all.

## Boundaries

Enforced by `server/__tests__/isolation.test.ts` reading `BOUNDARIES.json`:

- **allowed:** each product tree → `shell` (four edges, each asserted **real** — so the manifest can
  never advertise an adoption the code has lost).
- **forbidden:** `shell` → any product tree (the parameterization rule, made mechanical), and
  `shell ↔ server` in both directions (`shell/` ships in browser bundles; importing server code would
  pull key handling into every consumer).

Asserting the *allowed* edges is as load-bearing as forbidding the others: it is what stops `shell/`
quietly becoming a dead tree the registry still advertises.

## Known gap — the rule is enforced at the import level only

`BOUNDARIES.json` can prove `shell/` does not **import** a product. It cannot prove a shared component
has not grown a `variant` / `mode` / `kind` prop that *is* product identity wearing a different name —
the same fork, one layer down. Today that holds by review and by the slot discipline above, and the
audit found it clean; nothing makes it fail automatically if it stops being true.

The designed mechanism is the **conformance matrix** ([docs/28 §5 Phase 2](28-product-unification.md),
issue [#664](https://github.com/dcodish/geo_builder/issues/664)) — one row per shared contract, one
column per builder, where *an unexamined cell fails the suite*. It is specified and not yet built.
Recorded here rather than only in the issue, because a design doc that omits the weakest property of its
central rule is not describing the system.
