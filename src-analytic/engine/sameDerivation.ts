/**
 * DO TWO DERIVED RULES DEFINE THE SAME POINT? (#1153)
 *
 * «P מרכז המעגל I» and «O מרכז המעגל I» are not two points that happen to coincide — they are one
 * point named twice. That is decidable from the RULES alone, with no coordinates and no tolerance,
 * and deciding it structurally is what keeps the check honest: a positional test would also catch
 * «A(3,4)» + «B(3,4)», which is a different question the operator has NOT ruled on.
 *
 * Order-insensitivity is per rule, and each answer is a small statement about the geometry:
 *
 * - **`midpoint`** — the midpoint of `AB` is the midpoint of `BA`.
 * - **`centroid` / `incentre` / `orthocentre` / `circumcentre`** — each is a centre of a TRIANGLE, and
 *   a triangle is a set of three vertices; naming them in another order names the same triangle.
 * - **`diagonals`** — the meet of a quadrilateral's diagonals. NOT a plain set: `ABCD` and `ABDC` are
 *   different quadrilaterals whose diagonals meet in different places, so the ring is compared as a
 *   CYCLE (rotations and reflections of the same ring, nothing more).
 * - **`circle-centre`** — one parent curve, compared directly.
 */
import type { DerivedRule } from './derived';
import type { Id } from './types';

/** The same unordered pair or set of vertices, whatever order they were written in. */
const sameSet = (a: readonly Id[], b: readonly Id[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * The same RING, up to rotation and reflection — `ABCD` ≡ `BCDA` ≡ `DCBA`, but NOT `ABDC`.
 *
 * A quadrilateral's diagonals are `AC` and `BD`; re-ordering the ring changes which pairs are
 * diagonals and therefore where they meet. Comparing as a set would call two genuinely different
 * points the same one and refuse a naming the student is entitled to make.
 */
function sameRing(a: readonly Id[], b: readonly Id[]): boolean {
  if (a.length !== b.length) return false;
  const n = a.length;
  const forms: string[] = [];
  for (const seq of [b, [...b].reverse()]) {
    for (let i = 0; i < n; i++) forms.push(seq.slice(i).concat(seq.slice(0, i)).join());
  }
  return forms.includes(a.join());
}

/** `true` when both rules define the SAME point — so naming the second is naming it twice. */
export function sameDerivation(a: DerivedRule, b: DerivedRule): boolean {
  if (a.t !== b.t) return false;
  switch (a.t) {
    case 'midpoint':
      return b.t === 'midpoint' && sameSet([a.a, a.b], [b.a, b.b]);
    case 'centroid':
    case 'incentre':
    case 'orthocentre':
    case 'circumcentre':
      return 'v' in b && b.v.length === 3 && sameSet(a.v, b.v);
    case 'diagonals':
      return b.t === 'diagonals' && sameRing(a.v, b.v);
    case 'circle-centre':
      return b.t === 'circle-centre' && a.curve === b.curve;
    default: {
      /**
       * EXHAUSTIVE on purpose. A new `DerivedRule` must decide whether two of its instances are the
       * same point — and a compile error here is how that question gets asked, rather than the new
       * rule silently inheriting "never the same" and reopening this class a fourth time.
       */
      const undecided: never = a;
      throw new Error(`derived rule has no sameness rule: ${JSON.stringify(undecided)}`);
    }
  }
}
