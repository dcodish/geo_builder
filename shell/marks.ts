/**
 * #1714 (ADR-AG-225) — THE PLANAR MARK GEOMETRY, shared by every builder that draws a flat figure.
 *
 * A textbook marks a stated measure with three shapes: a right-angle SQUARE (the knee) at a vertex, an
 * ARC between the two rays of an angle, and short HATCH TICKS across a segment («these are equal»). 2-D
 * drew all three inline in `src/render/Figure.tsx` (ADR-031, ADR-134); analytic drew its own knee at the
 * foot of an answered perpendicular (#1048); the complex Builder draws its argument arcs. Analytic's
 * stated-measure layer was about to be the THIRD copy of the same arithmetic, so the arithmetic lives
 * here once and every planar builder calls it (the third-copy rule, docs/28 §5c).
 *
 * Pure screen-space vector maths: points in, points out. No product knowledge, no strings, no styling —
 * each caller decides its own sizes, colours and SVG serialisation. The 3-D builder is deliberately not a
 * consumer: its knee and arc lie in the plane of two WORLD arms and foreshorten with the orbit
 * (`src3d/render/rightAngles.ts`), which is a different geometry, not a copy of this one.
 *
 * The expressions are written exactly as 2-D's inline code wrote them, so 2-D's markup is byte-identical
 * after the hoist (asserted by its lock, not hoped for).
 */

export interface MarkPt {
  x: number;
  y: number;
}

/** A unit vector, or the zero vector for a degenerate one (2-D's `unitVec`). */
export function unitOf(v: MarkPt): MarkPt {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
}

/**
 * The right-angle KNEE at `v` between the rays to `p1` and `p2`, with legs of length `s`: three corners —
 * on the first ray, the square's far corner, on the second ray.
 */
export function rightAngleKnee(v: MarkPt, p1: MarkPt, p2: MarkPt, s: number): [MarkPt, MarkPt, MarkPt] {
  const u1 = unitOf({ x: p1.x - v.x, y: p1.y - v.y });
  const u2 = unitOf({ x: p2.x - v.x, y: p2.y - v.y });
  return [
    { x: v.x + u1.x * s, y: v.y + u1.y * s },
    { x: v.x + (u1.x + u2.x) * s, y: v.y + (u1.y + u2.y) * s },
    { x: v.x + u2.x * s, y: v.y + u2.y * s },
  ];
}

/**
 * An ANGLE ARC at `v` of radius `r`, from the ray to `p1` to the ray to `p2`, the SHORT way round (the
 * interior angle, never its reflex complement), sampled at `n + 1` points.
 */
export function angleArcPoints(v: MarkPt, p1: MarkPt, p2: MarkPt, r: number, n = 14): MarkPt[] {
  const u1 = unitOf({ x: p1.x - v.x, y: p1.y - v.y });
  const u2 = unitOf({ x: p2.x - v.x, y: p2.y - v.y });
  const th1 = Math.atan2(u1.y, u1.x);
  let dth = Math.atan2(u2.y, u2.x) - th1;
  while (dth > Math.PI) dth -= 2 * Math.PI;
  while (dth < -Math.PI) dth += 2 * Math.PI;
  return Array.from({ length: n + 1 }, (_, k) => {
    const th = th1 + (dth * k) / n;
    return { x: v.x + r * Math.cos(th), y: v.y + r * Math.sin(th) };
  });
}

/**
 * The unit direction INTO the angle at `v` — the bisector of the two rays — where a value label sits. A
 * straight angle has no interior bisector, so it answers the perpendicular to the first ray.
 */
export function wedgeBisector(v: MarkPt, p1: MarkPt, p2: MarkPt): MarkPt {
  const u1 = unitOf({ x: p1.x - v.x, y: p1.y - v.y });
  const u2 = unitOf({ x: p2.x - v.x, y: p2.y - v.y });
  const b = { x: u1.x + u2.x, y: u1.y + u2.y };
  const l = Math.hypot(b.x, b.y);
  return l < 1e-9 ? { x: -u1.y, y: u1.x } : { x: b.x / l, y: b.y / l };
}

/**
 * `count` HATCH TICKS across segment a–b, centred on its midpoint, each `2·half` long and perpendicular to
 * the segment, `spacing` apart along it — the textbook «these are equal» (1 tick for the first equality
 * class, 2 for the second, …).
 */
export function equalTickSegments(a: MarkPt, b: MarkPt, count: number, half: number, spacing: number): Array<[MarkPt, MarkPt]> {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / L;
  const uy = (b.y - a.y) / L;
  const nx = -uy;
  const ny = ux;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return Array.from({ length: count }, (_, k) => {
    const off = (k - (count - 1) / 2) * spacing;
    const cx = mx + ux * off;
    const cy = my + uy * off;
    return [
      { x: cx - nx * half, y: cy - ny * half },
      { x: cx + nx * half, y: cy + ny * half },
    ];
  });
}

/**
 * A MARK IS SIZED BY ITS CORNER, NOT BY THE FIGURE (#1337, [ADR-544](../docs/06-decisions.md#adr-544)) — hoisted
 * from 2-D with the rest of the mark geometry (#1714). The ratio to draw a corner's marks at: 1 when the corner has
 * room for a mark of `fullPx`, less when it does not, never below {@link MIN_MARK_SCALE}. The ruling is SHRINK,
 * never drop — everything the student stated stays visible — so this never answers zero.
 *
 * With `MARK_FIT_FRACTION = 0.35`, two marks at the ends of one side occupy `0.7 · room` and cannot touch; the
 * floor is deliberately tiny so it never fights that guarantee on the smallest corners.
 */
export const MARK_FIT_FRACTION = 0.35;
export const MIN_MARK_SCALE = 0.05;
export function markFitScale(roomPx: number, fullPx: number): number {
  if (!Number.isFinite(roomPx) || roomPx <= 0 || fullPx <= 0) return 1;
  return Math.min(1, Math.max((MARK_FIT_FRACTION * roomPx) / fullPx, MIN_MARK_SCALE));
}
