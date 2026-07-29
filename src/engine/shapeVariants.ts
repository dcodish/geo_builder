/**
 * Ambiguous named-shape VARIANTS ([ADR-138](docs/06-decisions.md#adr-138)).
 *
 * A kite / isosceles triangle names a shape whose EQUAL-PAIR is genuinely unstated (which diagonal is the
 * kite's axis; which vertex is the isosceles apex). Per [ADR-052](docs/06-decisions.md#adr-052) that choice
 * is FREE, not a fixed assumption — so the parser emits a single `shape-variant` command carrying a cyclable
 * `variant` index, and `replay` expands it here to the base shape + the variant-selected `set-equal`s.
 *
 * Two rules make it behave as the student expects:
 *  - an EXPLICIT `set-equal` on the shape's sides PINS the matching variant (so "kite ABCD" + "AB=BC" flips
 *    the kite to that axis instead of stacking) — this generalises the ADR-114 isosceles soft default; and
 *  - a pair an explicit equality already provides is NOT re-emitted (no duplicate constraint that would
 *    corrupt the DOF count).
 *
 * Pure and deterministic. The expansion is shared by `lowerOne` (the fallback path) and `replay` (which
 * supplies the explicit equalities for the pin), and `VARIANT_COUNT` drives the cycle ("show another").
 */

import type { Command, Id } from './types';

export type VariantShape = 'kite' | 'isosceles' | 'midsegment';

/** How many valid configurations each shape has — the modulus "show another configuration" cycles. A kite has
 *  two symmetry axes, an isosceles triangle three apexes, a base-less midsegment two host sides for its free
 *  endpoint ([ADR-199](docs/06-decisions.md#adr-199)). */
export const VARIANT_COUNT: Record<VariantShape, number> = { kite: 2, isosceles: 3, midsegment: 2 };

/** A `set-equal` argument tuple `[a,b,c,d]` meaning |ab| = |cd|. */
type EqTuple = [Id, Id, Id, Id];

/** The base shape command (the polygon the equalities flex into the named shape). */
function baseCommand(shape: VariantShape, ids: Id[]): Command {
  return shape === 'kite'
    ? { type: 'quadrilateral', ids: [ids[0], ids[1], ids[2], ids[3]] }
    : { type: 'triangle', ids: [ids[0], ids[1], ids[2]] };
}

/**
 * Every variant's equal-pair(s), indexed by variant. A KITE has two adjacent-equal pairs per axis (they move
 * as one unit): axis AC ⇒ {|AB|=|AD|, |CB|=|CD|}, axis BD ⇒ {|AB|=|BC|, |AD|=|DC|}. An ISOSCELES triangle
 * has one equal pair per apex: A ⇒ |AB|=|AC|, B ⇒ |AB|=|BC|, C ⇒ |AC|=|BC|.
 */
function variantPairs(shape: VariantShape, ids: Id[]): EqTuple[][] {
  const [a, b, c, d] = ids;
  if (shape === 'kite') {
    return [
      [[a, b, a, d], [c, b, c, d]], // variant 0 — axis AC: |AB|=|AD|, |CB|=|CD|
      [[a, b, b, c], [a, d, d, c]], // variant 1 — axis BD: |AB|=|BC|, |AD|=|DC|
    ];
  }
  return [
    [[a, b, a, c]], // variant 0 — apex A: |AB|=|AC|
    [[a, b, b, c]], // variant 1 — apex B: |AB|=|BC|
    [[a, c, b, c]], // variant 2 — apex C: |AC|=|BC|
  ];
}

/** Canonical key for an undirected segment {x,y}. */
const seg = (x: Id, y: Id): string => (x < y ? `${x}|${y}` : `${y}|${x}`);
/** Canonical key for an unordered pair of segments (a set-equal / a variant pair), order-independent. */
const pairKey = (p: Id, q: Id, r: Id, s: Id): string => [seg(p, q), seg(r, s)].sort().join('=');

/** Does an explicit `set-equal {a,b,c,d}` assert the SAME two segments as a variant pair `[p,q,r,s]`? */
export function eqMatchesPair(eq: { a: Id; b: Id; c: Id; d: Id }, pair: EqTuple): boolean {
  return pairKey(eq.a, eq.b, eq.c, eq.d) === pairKey(pair[0], pair[1], pair[2], pair[3]);
}

/**
 * Does the explicit equality `setEqual` NAME one of the equal-pairs of some enabled `shape-variant` that
 * NO existing explicit equality already asserts? Such a statement is the student CHOOSING which sides of a
 * kite / isosceles are equal — it PINS a previously-SOFT default ([ADR-138](docs/06-decisions.md#adr-138) /
 * design-rules M4). That is genuinely new information (soft engine guess → the student's stated choice: it
 * flips the relation from "not forced" to "forced/reported") even though the geometry — which already used
 * that pair as its default drawing — does not move. Without this, restating the default pair (e.g. `AB=AC`
 * on an isosceles that soft-defaulted to apex A) is wrongly swallowed as a redundant "already drawn" no-op.
 * A `midsegment` variant carries no equal-pair, so it never pins.
 */
export function pinsSoftVariant(
  setEqual: { a: Id; b: Id; c: Id; d: Id },
  shapeVariants: { shape: VariantShape; ids: Id[] }[],
  explicitEqs: { a: Id; b: Id; c: Id; d: Id }[],
): boolean {
  const alreadyStated = (pair: EqTuple) => explicitEqs.some((eq) => eqMatchesPair(eq, pair));
  for (const sv of shapeVariants) {
    if (sv.shape === 'midsegment') continue;
    for (const variant of variantPairs(sv.shape, sv.ids)) {
      for (const pair of variant) {
        if (eqMatchesPair(setEqual, pair) && !alreadyStated(pair)) return true;
      }
    }
  }
  return false;
}

/**
 * A base-less MIDSEGMENT ([ADR-199](docs/06-decisions.md#adr-199)) — `ids = [P, Q, R, E, G]`: the student
 * placed `E` on side `PQ` of triangle `PQR` and called `EG` a midsegment, without naming the parallel base.
 * A midsegment joins two MIDPOINTS, so `E` is pinned to the midpoint of `PQ` (a `set-equal` drives the free
 * on-segment point), and `G` is the midpoint of one of the two OTHER sides — `PR` (variant 0 ⇒ EG ∥ QR) or
 * `QR` (variant 1 ⇒ EG ∥ PR). Which side is genuinely unstated (ADR-052), so it is the cyclable variant —
 * UNLESS the student states it: an explicit `point-on-segment` placing `G` on PR or QR PINS the variant
 * ([ADR-412](docs/06-decisions.md#adr-412), issue #407 — the on-segment sibling of the kite/isosceles
 * explicit-equality pin and the inscribe `explicitOnSegs` pin, ADR-262).
 */
function expandMidsegment(ids: Id[], variant: number, explicitOnSegs: { id: Id; a: Id; b: Id }[] = []): Command[] {
  const [p, q, r, e, g] = ids;
  let chosen = ((variant % 2) + 2) % 2;
  for (let v = 0; v < 2; v++) {
    const [sa, sb] = v === 0 ? [p, r] : [q, r];
    if (explicitOnSegs.some((o) => o.id === g && ((o.a === sa && o.b === sb) || (o.a === sb && o.b === sa)))) {
      chosen = v;
      break;
    }
  }
  const other: [Id, Id] = chosen === 0 ? [p, r] : [q, r]; // G rides PR (v0) or QR (v1)
  return [
    { type: 'set-equal', a: p, b: e, c: e, d: q }, // E is the midpoint of PQ: |PE| = |EQ|
    { type: 'midpoint', id: g, a: other[0], b: other[1] }, // G is the midpoint of the chosen other side
    { type: 'segment', a: e, b: g }, // draw the midsegment EG
  ];
}

/**
 * Expand a `shape-variant` command into engine commands. `explicitEqs` are the genuine `set-equal`s the
 * student/LLM gave (NOT from another shape-variant) — they (1) PIN the variant they match and (2) suppress
 * re-emitting that pair. With none, the figure uses `cmd.variant` and emits all its pairs (seed-0/variant-0
 * reproduces the historical drawing). A `midsegment` variant carries no equal-pair to pin, so `explicitEqs`
 * is unused there.
 */
export function expandShapeVariant(
  cmd: { shape: VariantShape; ids: Id[]; variant: number },
  explicitEqs: { a: Id; b: Id; c: Id; d: Id }[],
  explicitOnSegs: { id: Id; a: Id; b: Id }[] = [],
): Command[] {
  if (cmd.shape === 'midsegment') return expandMidsegment(cmd.ids, cmd.variant, explicitOnSegs);
  const all = variantPairs(cmd.shape, cmd.ids);
  const n = all.length;
  const matchesAny = (pair: EqTuple) => explicitEqs.some((eq) => eqMatchesPair(eq, pair));
  // An explicit equality on any of a variant's pairs PINS that variant (the student stated which pair is equal).
  let chosen = ((cmd.variant % n) + n) % n;
  for (let v = 0; v < n; v++) {
    if (all[v].some(matchesAny)) {
      chosen = v;
      break;
    }
  }
  // Emit the chosen variant's pairs, skipping any an explicit equality already provides (avoids a duplicate
  // constraint that would over-count the DOF / double-drive).
  const eqs: Command[] = all[chosen]
    .filter((pair) => !matchesAny(pair))
    .map(([a, b, c, d]) => ({ type: 'set-equal', a, b, c, d }) as Command);
  return [baseCommand(cmd.shape, cmd.ids), ...eqs];
}
