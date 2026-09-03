/**
 * Curve geometry — resolution to numbers, membership residuals, and the polylines the renderer
 * draws. Pure; no React, no store, no parser.
 *
 * A note on residuals. Every membership/tangency question in this product reduces to "how far is
 * this from zero", and the residuals below are SCALE-NORMALIZED so that the same tolerance means
 * the same thing for a circle of radius 3 and one of radius 300. That matters more here than in
 * the synthetic tool: the exam supplies real magnitudes (`AC = 10`, `MN = 9`, radii of 1 and 2),
 * so a raw algebraic residual would silently change meaning between questions.
 */
import { curveFromEquation } from './conic';
import type { Env } from './expr';
import type { Curve, NumCurve } from './types';

/** Below this a residual counts as zero. Tuned to the corpus's magnitudes, not to a solver. */
export const TOL = 1e-7;

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a curve's equation against a parameter assignment. Returns null when there is no such
 * curve at this parameter value — an empty circle, a degenerate line. That null is an honest "not
 * at this value", which is exactly what the domain filter and the branch selector need to see; it
 * must never be softened into a drawn approximation.
 */
export function resolveCurve(c: Curve, env: Env): NumCurve | null {
  const res = curveFromEquation(c.eq, env, c.kind);
  return res.ok ? res.curve : null;
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

/** Scale-normalized distance-like residual: 0 on the curve, growing away from it. */
export function residual(c: NumCurve, x: number, y: number): number {
  switch (c.kind) {
    case 'line':
      // The true point–line distance — the corpus's own `מרחק נקודה מישר`, used in 10 of 20.
      return Math.abs(c.a * x + c.b * y + c.c) / Math.hypot(c.a, c.b);
    case 'circle':
      return Math.abs(Math.hypot(x - c.cx, y - c.cy) - c.r);
    case 'parabola':
      // y² − 2px, divided by a scale so the tolerance travels between questions.
      return Math.abs(y * y - 2 * c.p * x) / Math.max(1, Math.abs(2 * c.p));
    case 'ellipse': {
      const v = (x * x) / (c.a * c.a) + (y * y) / (c.b * c.b) - 1;
      return Math.abs(v) * Math.min(c.a, c.b);
    }
  }
}

export function isOn(c: NumCurve, x: number, y: number, tol = 1e-6): boolean {
  return residual(c, x, y) <= tol;
}

// ---------------------------------------------------------------------------
// Conic roles — what the exam names (docs/19 §10b F7)
// ---------------------------------------------------------------------------

/** `y² = 2px` → focus `(p/2, 0)`. The memorised triple the formula sheet does NOT give. */
export function parabolaFocus(c: NumCurve & { kind: 'parabola' }): { x: number; y: number } {
  return { x: c.p / 2, y: 0 };
}

/** `y² = 2px` → directrix `x = −p/2`, as a line `1·x + 0·y + p/2 = 0`. */
export function parabolaDirectrix(c: NumCurve & { kind: 'parabola' }): NumCurve {
  return { kind: 'line', a: 1, b: 0, c: c.p / 2 };
}

/**
 * Ellipse foci. The major axis may be either one — `x²/9 + y²/25 = 1` has its foci on the y-axis —
 * so this returns them oriented, rather than assuming the x-axis the way a hard-coded `c² = a²−b²`
 * would. Returns `[right, left]` (or `[top, bottom]`) in the exam's `F₁, F₂` order.
 */
export function ellipseFoci(
  c: NumCurve & { kind: 'ellipse' },
): [{ x: number; y: number }, { x: number; y: number }] {
  if (c.a >= c.b) {
    const f = Math.sqrt(c.a * c.a - c.b * c.b);
    return [
      { x: f, y: 0 },
      { x: -f, y: 0 },
    ];
  }
  const f = Math.sqrt(c.b * c.b - c.a * c.a);
  return [
    { x: 0, y: f },
    { x: 0, y: -f },
  ];
}

// ---------------------------------------------------------------------------
// Extent and rendering
// ---------------------------------------------------------------------------

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The bounded curves' own extent; null for a line or a parabola, which have none. */
export function curveExtent(c: NumCurve): Box | null {
  switch (c.kind) {
    case 'circle':
      return { minX: c.cx - c.r, minY: c.cy - c.r, maxX: c.cx + c.r, maxY: c.cy + c.r };
    case 'ellipse':
      return { minX: -c.a, minY: -c.b, maxX: c.a, maxY: c.b };
    default:
      return null;
  }
}

/**
 * The polyline(s) to draw, clipped to `box`. Unbounded curves are sampled over the visible window
 * only — which is why the view box is an input rather than something the renderer guesses: a
 * parabola drawn over a fixed range would run off any view that does not happen to match it.
 */
export function polylines(c: NumCurve, box: Box, steps = 240): Array<Array<[number, number]>> {
  switch (c.kind) {
    case 'line':
      return lineSegmentIn(c, box);
    case 'circle': {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = (i / steps) * 2 * Math.PI;
        pts.push([c.cx + c.r * Math.cos(t), c.cy + c.r * Math.sin(t)]);
      }
      return [pts];
    }
    case 'ellipse': {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = (i / steps) * 2 * Math.PI;
        pts.push([c.a * Math.cos(t), c.b * Math.sin(t)]);
      }
      return [pts];
    }
    case 'parabola': {
      // Sampled in y, not x: `y² = 2px` is single-valued in y, so one pass draws both arms and no
      // sqrt branch has to be chosen (choosing one is how a parabola loses half of itself).
      const pts: Array<[number, number]> = [];
      const span = Math.max(Math.abs(box.minY), Math.abs(box.maxY));
      for (let i = 0; i <= steps; i += 1) {
        const y = -span + (2 * span * i) / steps;
        pts.push([(y * y) / (2 * c.p), y]);
      }
      return [pts];
    }
  }
}

/** Clip `ax+by+c=0` to the box, returning zero or one segment. */
function lineSegmentIn(
  c: NumCurve & { kind: 'line' },
  box: Box,
): Array<Array<[number, number]>> {
  const hits: Array<[number, number]> = [];
  const push = (x: number, y: number) => {
    const e = 1e-9;
    if (x >= box.minX - e && x <= box.maxX + e && y >= box.minY - e && y <= box.maxY + e) {
      if (!hits.some(([hx, hy]) => Math.abs(hx - x) < 1e-9 && Math.abs(hy - y) < 1e-9)) {
        hits.push([x, y]);
      }
    }
  };
  if (Math.abs(c.b) > TOL) {
    push(box.minX, -(c.a * box.minX + c.c) / c.b);
    push(box.maxX, -(c.a * box.maxX + c.c) / c.b);
  }
  if (Math.abs(c.a) > TOL) {
    push(-(c.b * box.minY + c.c) / c.a, box.minY);
    push(-(c.b * box.maxY + c.c) / c.a, box.maxY);
  }
  return hits.length >= 2 ? [[hits[0], hits[1]]] : [];
}
