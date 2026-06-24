/**
 * Independent closed-form geometry — the ORACLE for the coordinate-validation campaign
 * ([docs/06-decisions.md] ADR-109). This file deliberately imports NOTHING from the engine:
 * it recomputes each construct's coordinates by hand so that comparing its output to the
 * engine's is a genuine *differential* check (two independent implementations of the same
 * spec must agree). If this ever imported engine geometry it would be checking the engine
 * against itself — worthless.
 *
 * Every function returns the FULL SET of geometrically-valid positions (a singleton for a
 * deterministic construct, two for a branchy one). The campaign passes a figure iff the
 * engine's coordinates match one whole valid configuration within tolerance.
 */

export interface Pt {
  x: number;
  y: number;
}

// ── vector ops ───────────────────────────────────────────────────────────────
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
export const len = (a: Pt): number => Math.hypot(a.x, a.y);
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
/** Unit-length copy (caller guarantees non-zero). */
export const norm = (a: Pt): Pt => scale(a, 1 / len(a));
/** Left-hand perpendicular (90° CCW). */
export const perpL = (a: Pt): Pt => ({ x: -a.y, y: a.x });

// ── constructs (each returns the set of valid positions) ─────────────────────

/** Midpoint of A,B — deterministic. */
export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Foot of the perpendicular from P onto the infinite line AB — deterministic. */
export function footOnLine(p: Pt, a: Pt, b: Pt): Pt {
  const ab = sub(b, a);
  const t = dot(sub(p, a), ab) / dot(ab, ab);
  return add(a, scale(ab, t));
}

/** Intersection of the infinite lines AB and CD — deterministic (null if parallel). */
export function lineLineIntersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
  return add(a, scale(r, t));
}

/** Point at parameter t along A→B (t∈[0,1] is the segment; t>1 the extension). */
export function alongSegment(a: Pt, b: Pt, t: number): Pt {
  return add(a, scale(sub(b, a), t));
}

/**
 * The 0/1/2 intersections of circle (c1,r1) with circle (c2,r2). The ordering of the two
 * solutions (base ± offset) is arbitrary here — the campaign accepts EITHER, so it only
 * verifies the engine landed on a true intersection, not which branch index it called it.
 */
export function circleIntersect(c1: Pt, r1: number, c2: Pt, r2: number): Pt[] {
  const d = dist(c1, c2);
  if (d < 1e-12) return [];
  if (d > r1 + r2 + 1e-12 || d < Math.abs(r1 - r2) - 1e-12) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = Math.sqrt(Math.max(0, h2));
  const u = norm(sub(c2, c1)); // toward c2
  const base = add(c1, scale(u, a));
  const off = scale(perpL(u), h);
  if (h < 1e-9) return [base];
  return [add(base, off), sub(base, off)];
}

/** Trilateration: a point at dist d1 from A and d2 from B — same as circle∩circle. */
export function byDistances(a: Pt, d1: number, b: Pt, d2: number): Pt[] {
  return circleIntersect(a, d1, b, d2);
}

/** Square ABCD on base A→B — the two chiralities (C,D on the left vs right of AB). */
export function squareCorners(a: Pt, b: Pt): { C: Pt; D: Pt }[] {
  const dir = sub(b, a);
  const left = perpL(dir); // |left| = |AB|
  const right = scale(left, -1);
  return [
    { C: add(b, left), D: add(a, left) },
    { C: add(b, right), D: add(a, right) },
  ];
}

/** Parallelogram ABCD from three vertices — D is determined: D = A + C − B. */
export function parallelogramD(a: Pt, _b: Pt, c: Pt): Pt {
  return { x: a.x + c.x - _b.x, y: a.y + c.y - _b.y };
}
