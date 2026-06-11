/** Pure 2D geometry helpers. No state. */

import type { Vec } from './types';

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });

/** 90° counter-clockwise rotation. */
export const rot90 = (v: Vec): Vec => ({ x: -v.y, y: v.x });

export const len = (v: Vec): number => Math.hypot(v.x, v.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Unit vector in the direction of v (zero vector maps to zero). */
export const unit = (v: Vec): Vec => {
  const l = len(v);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};

/** Rotate v counter-clockwise by `deg` degrees. */
export function rotate(v: Vec, deg: number): Vec {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** Signed cross product (a−o) × (b−o); zero ⇒ o,a,b collinear. */
export const cross = (o: Vec, a: Vec, b: Vec): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Reflect point p across the line through a and b (a degenerate a≈b returns p). */
export function reflectAcross(p: Vec, a: Vec, b: Vec): Vec {
  const d = sub(b, a);
  const dd = d.x * d.x + d.y * d.y;
  if (dd < 1e-18) return p;
  const t = ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / dd;
  const foot = { x: a.x + t * d.x, y: a.y + t * d.y };
  return { x: 2 * foot.x - p.x, y: 2 * foot.y - p.y };
}

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
/**
 * Intersection of the (infinite) line through a→b and the line through c→d.
 * Returns null when the lines are parallel or coincident (no single point).
 */
export function lineLineIntersect(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const r = sub(b, a); // direction of line 1
  const s = sub(d, c); // direction of line 2
  const denom = r.x * s.y - r.y * s.x; // r × s
  if (Math.abs(denom) < 1e-12) return null; // parallel/coincident
  const ac = sub(c, a);
  const t = (ac.x * s.y - ac.y * s.x) / denom;
  return add(a, scale(r, t));
}

/**
 * All roots of a scalar residual f over t ∈ [tMin,tMax]. Deterministic: scan a
 * fixed grid for sign changes, then bisect each bracket (ADR-012/ADR-014 —
 * constraint-driven DOF). Returns the roots ascending; each is a solution
 * *branch*. Non-finite samples (e.g. an angle measured at a coincident point)
 * are skipped. f is any constraint residual (0 ⇔ satisfied) — the solver is
 * generic over the constraint type.
 */
export function solveParam(
  f: (t: number) => number,
  tMin = 0,
  tMax = 1,
  steps = 256,
): number[] {
  const roots: number[] = [];
  let pt = tMin;
  let pf = f(tMin);
  for (let i = 1; i <= steps; i++) {
    const t = tMin + ((tMax - tMin) * i) / steps;
    const ft = f(t);
    if (isFinite(pf) && isFinite(ft) && pf !== 0 && (pf < 0) !== (ft < 0)) {
      // bisect the bracket [pt, t]
      let lo = pt;
      let hi = t;
      let flo = pf;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if (!isFinite(fm)) {
          lo = mid;
          continue;
        }
        if (flo < 0 === fm < 0) {
          lo = mid;
          flo = fm;
        } else {
          hi = mid;
        }
      }
      const r = (lo + hi) / 2;
      if (!roots.some((o) => Math.abs(o - r) < 1e-7)) roots.push(r);
    }
    pt = t;
    pf = ft;
  }
  return roots;
}

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
