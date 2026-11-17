/**
 * THE CONIC'S OWN FRAME (#2664, [ADR-AG-455](../../docs/06c-decisions-analytic.md#adr-ag-455)) — the one place a parabola
 * or an ellipse off the origin, or a parabola opening along y, is carried to and from its canonical position.
 *
 * A conic whose axes are parallel to the coordinate axes is the canonical one moved: `(x−h)²/a² + (y−k)²/b² = 1` is
 * `u²/a² + v²/b² = 1` in `u = x − h, v = y − k`; `(y−k)² = 2p(x−h)` is `v² = 2p·u` there; and `(x−h)² = 2p(y−k)` is the
 * same with `u = y − k, v = x − h` (the axis swap). Every consumer that knows the canonical closed form (the residual,
 * the focus, the directrix, the foci, the walk of a straight, the normal, the polyline) reads the point through
 * {@link toLocal}, works canonically, and returns through {@link toWorld}. Never re-derived per file.
 *
 * The canonical curve is the zero offset: `h`, `k` and `axis` are ABSENT on a curve at the origin opening along x, so
 * such a curve is the same object, with the same numbers, as before this module existed. A leaf: it imports types only,
 * so `derived.ts` (which `curves.ts` reaches through `evaluate`) can read it without a cycle.
 */
import type { NumCurve } from './types';

type Pt = { x: number; y: number };
export type ConicCurve = Extract<NumCurve, { kind: 'parabola' | 'ellipse' }>;

/** The offset of a conic's centre (an ellipse) or vertex (a parabola), and whether its axis is y (the swap). */
export function frameOf(c: ConicCurve): { h: number; k: number; swap: boolean } {
  return { h: c.h ?? 0, k: c.k ?? 0, swap: c.kind === 'parabola' && c.axis === 'y' };
}

/** True when the conic sits at the origin opening along x — the canonical one, with no frame to apply. */
export function isCanonicalFrame(c: ConicCurve): boolean {
  const f = frameOf(c);
  return f.h === 0 && f.k === 0 && !f.swap;
}

/** A world point in the conic's canonical coordinates. */
export function toLocal(c: ConicCurve, x: number, y: number): Pt {
  const { h, k, swap } = frameOf(c);
  if (swap) return { x: y - k, y: x - h };
  // The canonical frame returns the numbers untouched (no `-0 + 0`), so a curve at the origin is bit-identical.
  return h === 0 && k === 0 ? { x, y } : { x: x - h, y: y - k };
}

/** A canonical point back in the world. */
export function toWorld(c: ConicCurve, u: number, v: number): Pt {
  const { h, k, swap } = frameOf(c);
  if (swap) return { x: v + h, y: u + k };
  return h === 0 && k === 0 ? { x: u, y: v } : { x: u + h, y: v + k };
}

/** A DIRECTION between the two frames: the offset does not move a vector; the swap is its own inverse. */
export function vecFrame(c: ConicCurve, v: Pt): Pt {
  return frameOf(c).swap ? { x: v.y, y: v.x } : v;
}

/** A canonical line `a·u + b·v + c = 0` written in the world. */
export function lineToWorld(cu: ConicCurve, l: { a: number; b: number; c: number }): NumCurve & { kind: 'line' } {
  const { h, k, swap } = frameOf(cu);
  // u = x − h, v = y − k (or swapped: u = y − k, v = x − h); substitute and collect.
  return swap
    ? { kind: 'line', a: l.b, b: l.a, c: l.c - l.a * k - l.b * h }
    : { kind: 'line', a: l.a, b: l.b, c: l.c - l.a * h - l.b * k };
}

/**
 * A parabola's ROLE POINTS (#2835, [ADR-AG-470](../../docs/06c-decisions-analytic.md#adr-ag-470)) — the focus `(p/2, 0)` and
 * the vertex `(0, 0)` of `v² = 2p·u`, carried to the world through the frame. The ONE closed form: the derived rule
 * `parabola-point` («F מוקד הפרבולה», «V קודקוד הפרבולה»), `curves.ts`'s `parabolaFocus` and the ask lane read it, so a
 * named role point and an asked one cannot disagree.
 */
export type ParabolaRole = 'focus' | 'vertex';
export function parabolaRolePoint(c: Extract<NumCurve, { kind: 'parabola' }>, role: ParabolaRole): Pt {
  return toWorld(c, role === 'focus' ? c.p / 2 : 0, 0);
}

/** The same conic at the origin, opening along x — what the canonical closed forms take. */
export function canonicalOf<C extends ConicCurve>(c: C): C {
  if (isCanonicalFrame(c)) return c;
  const { h: _h, k: _k, ...rest } = c as C & { axis?: 'x' | 'y' };
  void _h;
  void _k;
  if ('axis' in rest) delete (rest as { axis?: 'x' | 'y' }).axis;
  return rest as C;
}
