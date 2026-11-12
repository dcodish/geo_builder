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
import { curveFromEquation, type ClassifyResult } from './conic';
import { canonicalOf, frameOf, lineToWorld, toLocal, toWorld } from './conicFrame';
import type { Env } from './expr';
import type { Curve, NumCurve } from './types';

/** Below this a residual counts as zero. Tuned to the corpus's magnitudes, not to a solver. */
export const TOL = 1e-7;

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a curve's equation against a parameter assignment.
 *
 * Returns the classifier's own result, REASON INTACT (#896). Two failures live in that type and
 * they are not the same event: `vacant` is an honest "no such curve at this parameter value" — an
 * empty circle, a degenerate line — which the domain filter and the branch selector need to see and
 * which must never be softened into a drawn approximation; the scope reasons (`rotated`,
 * `hyperbola`, `not-a-curve`, `not-canonical`) are a REFUSAL the student is owed by name.
 *
 * This used to collapse both into `NumCurve | null`. The reason was computed by `classify` and
 * destroyed one line later, so a translated parabola parsed, committed, drew nothing and said
 * nothing — a stated given vanishing, which is the one thing this product may never do.
 */
export function resolveCurve(c: Curve, env: Env): ClassifyResult {
  return curveFromEquation(c.eq, env, c.kind, c.canonical);
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

/**
 * Scale-normalized distance-like residual: 0 on the curve, growing away from it — and SIGNED
 * (ADR-AG-144, #1317).
 *
 * It was an absolute value, and that broke the solve exactly where the solve needs it most. The
 * Jacobian is numerical, by central differences with a step of ~1e-6: at a point within that step of
 * its line, `|g|` differentiates to ~0 instead of ±g', so every incidence row vanished from the
 * Jacobian as the iterate approached the solution. A LINEAR figure never showed it — one Gauss–Newton
 * step lands from far away and stops — but a free direction couples the incidences nonlinearly and the
 * descent needs several steps near the answer; measured, it stalled just above tolerance at half the
 * seeds, at ~1000 iterations, with the right geometry in hand. A least-squares residual must be smooth
 * through zero; its sign is meaningless to the solve (it squares it) and meaningful to no caller but
 * `isOn`, which takes the magnitude.
 */
export function residual(c: NumCurve, x: number, y: number): number {
  switch (c.kind) {
    case 'line':
      // The true point–line distance — the corpus's own `מרחק נקודה מישר`, used in 10 of 20.
      return (c.a * x + c.b * y + c.c) / Math.hypot(c.a, c.b);
    case 'circle':
      return Math.hypot(x - c.cx, y - c.cy) - c.r;
    case 'parabola': {
      // y² − 2px, divided by a scale so the tolerance travels between questions — in the curve's own frame (#2664).
      const q = toLocal(c, x, y);
      return (q.y * q.y - 2 * c.p * q.x) / Math.max(1, Math.abs(2 * c.p));
    }
    case 'ellipse': {
      const q = toLocal(c, x, y);
      const v = (q.x * q.x) / (c.a * c.a) + (q.y * q.y) / (c.b * c.b) - 1;
      return v * Math.min(c.a, c.b);
    }
  }
}

export function isOn(c: NumCurve, x: number, y: number, tol = 1e-6): boolean {
  return Math.abs(residual(c, x, y)) <= tol;
}

// ---------------------------------------------------------------------------
// Conic roles — what the exam names (docs/19 §10b F7)
// ---------------------------------------------------------------------------

/** `y² = 2px` → focus `(p/2, 0)`. The memorised triple the formula sheet does NOT give. */
export function parabolaFocus(c: NumCurve & { kind: 'parabola' }): { x: number; y: number } {
  return toWorld(c, c.p / 2, 0);
}

/** `y² = 2px` → directrix `x = −p/2`, as a line `1·x + 0·y + p/2 = 0`. */
export function parabolaDirectrix(c: NumCurve & { kind: 'parabola' }): NumCurve {
  const canonical: NumCurve & { kind: 'line' } = { kind: 'line', a: 1, b: 0, c: c.p / 2 };
  const { h, k, swap } = frameOf(c);
  return h === 0 && k === 0 && !swap ? canonical : lineToWorld(c, canonical);
}

/**
 * Ellipse foci. The major axis may be either one — `x²/9 + y²/25 = 1` has its foci on the y-axis —
 * so this returns them oriented, rather than assuming the x-axis the way a hard-coded `c² = a²−b²`
 * would. Returns `[right, left]` (or `[top, bottom]`) in the exam's `F₁, F₂` order.
 */
export function ellipseFoci(
  e: NumCurve & { kind: 'ellipse' },
): [{ x: number; y: number }, { x: number; y: number }] {
  // Read at the origin and carried to the centre (#2664): the offset never changes which axis is major.
  const [p, q] = canonicalFoci(canonicalOf(e));
  return [toWorld(e, p.x, p.y), toWorld(e, q.x, q.y)];
}

function canonicalFoci(c: NumCurve & { kind: 'ellipse' }): [{ x: number; y: number }, { x: number; y: number }] {
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
    case 'ellipse': {
      const { h, k } = frameOf(c);
      return { minX: h - c.a, minY: k - c.b, maxX: h + c.a, maxY: k + c.b };
    }
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
        const q = toWorld(c, c.a * Math.cos(t), c.b * Math.sin(t));
        pts.push([q.x, q.y]);
      }
      return [pts];
    }
    case 'parabola': {
      // Sampled in y, not x: `y² = 2px` is single-valued in y, so one pass draws both arms and no
      // sqrt branch has to be chosen (choosing one is how a parabola loses half of itself).
      // Moved (#2664): sampled in the curve's own v — y − k, or x − h when it opens along y — over the box's span there.
      const pts: Array<[number, number]> = [];
      const { h, k, swap } = frameOf(c);
      const [lo, hi] = swap ? [box.minX - h, box.maxX - h] : [box.minY - k, box.maxY - k];
      const span = Math.max(Math.abs(lo), Math.abs(hi));
      for (let i = 0; i <= steps; i += 1) {
        const v = -span + (2 * span * i) / steps;
        const q = toWorld(c, (v * v) / (2 * c.p), v);
        pts.push([q.x, q.y]);
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
