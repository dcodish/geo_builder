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
import type { DerivedRule, FootLine } from './derived';
import type { Id } from './types';
import { reversedFamily } from './commonTangents';

/** One slot of one pair on one circle, in either order of the pair (#2408, ADR-AG-403). */
function sameCommonTouch(a: Extract<DerivedRule, { t: 'common-touch' }>, b: Extract<DerivedRule, { t: 'common-touch' }>): boolean {
  if (a.circles[0] === b.circles[0] && a.circles[1] === b.circles[1]) return a.family === b.family && a.on === b.on;
  if (a.circles[0] === b.circles[1] && a.circles[1] === b.circles[0]) return reversedFamily(a.family) === b.family && a.on !== b.on;
  return false;
}

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

function sameFootLine(a: FootLine, b: FootLine): boolean {
  if (a.k === 'axis') return b.k === 'axis' && a.axis === b.axis;
  if (a.k === 'curve') return b.k === 'curve' && a.id === b.id;
  return b.k === 'points' && sameSet([a.a, a.b], [b.a, b.b]);
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
    case 'incircle-centre':
      return b.t === 'incircle-centre' && sameRing(a.v, b.v);
    case 'circle-centre':
      return b.t === 'circle-centre' && a.curve === b.curve;
    case 'parabola-point':
      return b.t === 'parabola-point' && a.curve === b.curve && a.role === b.role;
    case 'ellipse-point':
      return b.t === 'ellipse-point' && a.curve === b.curve && JSON.stringify(a.role) === JSON.stringify(b.role);
    // Where two circles touch is one point whichever circle is named first (#1504).
    case 'touch-point':
      return b.t === 'touch-point' && sameSet([a.a, a.b], [b.a, b.b]);
    // One slot of one pair, on one circle (#2408): the same touch whichever order the pair is named in — the family's
    // a/b side is read along the directed line of centres, so a reversed pair swaps a and b.
    case 'common-touch':
      return b.t === 'common-touch' && sameCommonTouch(a, b);
    // One circle, one side: the same touch whichever end is named first (#1619 B2).
    case 'side-touch':
      return b.t === 'side-touch' && a.circle === b.circle && sameSet([a.a, a.b], [b.a, b.b]);
    // One point, one line: the same foot whichever end of a two-point line is named first (#1620, ADR-AG-207).
    case 'foot':
      return b.t === 'foot' && a.from === b.from && sameFootLine(a.onto, b.onto);
    // One side, one ring size, one index — the side's direction matters (the ring turns left from it).
    case 'regular-vertex':
      return b.t === 'regular-vertex' && a.a === b.a && a.b === b.b && a.n === b.n && a.k === b.k;
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

/**
 * #1595 (ADR-AG-372) — does this rule name a FEATURE OF A CURVE (its centre, focus, an ellipse's vertex or focus, where
 * two circles or a circle and a side touch) rather than build a point FROM POINTS?
 *
 * The split decides what a second letter for the same derivation is. Built from points («N אמצע AB» after «M אמצע AB»,
 * a second centroid), it is a new letter its definition forces onto a named point: recorded, with the coincidence notice
 * (the 2026-11-02 ruling, 2-D's verdict). A curve's feature is one object; a second letter for it is a rename, which 2-D
 * answers as one (`centreAlreadyNamed`), so it stays the `already-named` refusal. Exhaustive, like `sameDerivation`: a
 * new rule must answer.
 */
export function namesCurveFeature(rule: DerivedRule): boolean {
  switch (rule.t) {
    case 'circle-centre':
    case 'parabola-point':
    case 'ellipse-point':
    case 'touch-point':
    case 'common-touch':
    case 'side-touch':
      return true;
    case 'midpoint':
    case 'centroid':
    case 'incentre':
    case 'orthocentre':
    case 'circumcentre':
    case 'diagonals':
    case 'incircle-centre':
    case 'foot':
    case 'regular-vertex':
      return false;
    default: {
      const undecided: never = rule;
      throw new Error(`derived rule has no curve-feature answer: ${JSON.stringify(undecided)}`);
    }
  }
}
