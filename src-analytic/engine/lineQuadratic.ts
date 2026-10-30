/**
 * THE ONE SUBSTITUTION OF A STRAIGHT INTO A CANONICAL CONIC (#1096, #1268, ADR-AG-292; a leaf module since #2618,
 * ADR-AG-355).
 *
 * A straight walked as `p0 + t·d` leaves a QUADRATIC `A·t² + B·t + C` in each canonical conic. Every reader that asks
 * where a straight meets a conic, or whether it only touches it, reads these three numbers: the crossing order and the
 * click-path rings (`crossing-order.ts`), and the tangency row of a line touching an ellipse or a parabola
 * (`solve.ts`, `tangent-curve`). It lives in a module of its own, importing nothing from the solver, so the solver can
 * read it without an import cycle through `crossing-order.ts`.
 */
import type { Pt } from './derived';
import type { NumCurve } from './types';

/** A straight line with a DIRECTION: a point `p0` on it, and the way it is walked. */
export interface Walk {
  p0: Pt;
  d: Pt;
}

/** The quadratic `A·t² + B·t + C` a walked straight `p0 + t·d` leaves in a canonical conic — `null` for a non-conic. */
export function lineQuadratic(w: Walk, conic: NumCurve): { A: number; B: number; C: number } | null {
  const { p0, d } = w;
  let A = 0;
  let B = 0;
  let C = 0;
  if (conic.kind === 'circle') {
    const q = { x: p0.x - conic.cx, y: p0.y - conic.cy };
    A = d.x * d.x + d.y * d.y;
    B = 2 * (d.x * q.x + d.y * q.y);
    C = q.x * q.x + q.y * q.y - conic.r * conic.r;
  } else if (conic.kind === 'ellipse') {
    const ia = 1 / (conic.a * conic.a);
    const ib = 1 / (conic.b * conic.b);
    A = d.x * d.x * ia + d.y * d.y * ib;
    B = 2 * (p0.x * d.x * ia + p0.y * d.y * ib);
    C = p0.x * p0.x * ia + p0.y * p0.y * ib - 1;
  } else if (conic.kind === 'parabola') {
    // y² = 2p·x
    const two = 2 * conic.p;
    A = d.y * d.y;
    B = 2 * p0.y * d.y - two * d.x;
    C = p0.y * p0.y - two * p0.x;
  } else {
    return null;
  }
  return { A, B, C };
}

/** A conic's own size — the scale a "touches" judgement is relative to (#1924, ADR-AG-272). 0 for a line. */
export function conicSize(cu: NumCurve): number {
  if (cu.kind === 'circle') return Math.abs(cu.r);
  if (cu.kind === 'ellipse') return Math.max(Math.abs(cu.a), Math.abs(cu.b));
  if (cu.kind === 'parabola') return Math.abs(cu.p);
  return 0;
}
