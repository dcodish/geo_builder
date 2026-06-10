/** Pure 2D geometry helpers. No state. */

import type { Vec } from './types';

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });

/** 90° counter-clockwise rotation. */
export const rot90 = (v: Vec): Vec => ({ x: -v.y, y: v.x });

export const len = (v: Vec): number => Math.hypot(v.x, v.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Signed cross product (a−o) × (b−o); zero ⇒ o,a,b collinear. */
export const cross = (o: Vec, a: Vec, b: Vec): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Measure of angle ∠(p1–vertex–p2) in degrees, range [0, 180]. */
export function angleDeg(vertex: Vec, p1: Vec, p2: Vec): number {
  const u = sub(p1, vertex);
  const w = sub(p2, vertex);
  const lu = len(u);
  const lw = len(w);
  if (lu === 0 || lw === 0) return NaN;
  let c = (u.x * w.x + u.y * w.y) / (lu * lw);
  c = Math.max(-1, Math.min(1, c));
  return (Math.acos(c) * 180) / Math.PI;
}

/**
 * Intersection points of circles (c1,r1) and (c2,r2), 0/1/2 results,
 * deterministically ordered: index 0 is on the +perpendicular side of the
 * c1→c2 axis, index 1 on the −side. Used as the solution branches.
 */
export function circleCircleIntersect(c1: Vec, r1: number, c2: Vec, r2: number): Vec[] {
  const d = dist(c1, c2);
  if (d < 1e-9) return []; // concentric — no discrete intersection
  if (d > r1 + r2 + 1e-9) return []; // circles too far apart
  if (d < Math.abs(r1 - r2) - 1e-9) return []; // one circle inside the other
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = h2 > 0 ? Math.sqrt(h2) : 0;
  const dir = scale(sub(c2, c1), 1 / d); // unit vector c1 → c2
  const mid = add(c1, scale(dir, a));
  if (h <= 1e-9) return [mid]; // tangent — single point
  const perp = rot90(dir);
  return [add(mid, scale(perp, h)), add(mid, scale(perp, -h))];
}
