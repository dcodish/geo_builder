/**
 * Pure R³ vector math for the 3-D tool (docs/20 §6.1).
 *
 * NOTE ON THE CROSS PRODUCT: the Israeli curriculum has NO cross product (docs/20 §3),
 * so it must never surface in anything student-facing. It is used here strictly as an
 * internal computational device (face normals for hidden-edge classification, camera
 * frames) — the same way the 2-D engine uses linear algebra the student never sees.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const add3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale3 = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
/** Internal-only (see file header): never student-facing. */
export const cross3 = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const norm3 = (a: Vec3): number => Math.sqrt(dot3(a, a));
export const dist3 = (a: Vec3, b: Vec3): number => norm3(sub3(a, b));

export function normalize3(a: Vec3): Vec3 {
  const n = norm3(a);
  if (n < 1e-12) throw new Error('normalize3: zero vector');
  return scale3(a, 1 / n);
}

/** Linear interpolation a + t·(b−a) — the on-segment point. */
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => add3(a, scale3(sub3(b, a), t));

/** Centroid of a non-empty list of points. */
export function centroid3(ps: Vec3[]): Vec3 {
  const s = ps.reduce(add3, v3(0, 0, 0));
  return scale3(s, 1 / ps.length);
}

/** The circumcentre of triangle a-b-c in R³ (ADR-3D-080), or null when collinear. */
export function circumcenter3(a: Vec3, b: Vec3, c: Vec3): Vec3 | null {
  const ab = sub3(b, a);
  const ac = sub3(c, a);
  const n = cross3(ab, ac);
  const n2 = dot3(n, n);
  if (n2 < 1e-18) return null;
  const term = add3(scale3(cross3(n, ab), dot3(ac, ac)), scale3(cross3(ac, n), dot3(ab, ab)));
  return add3(a, scale3(term, 1 / (2 * n2)));
}

/** Newell's method — a polygon's normal from its vertex ring (internal device). */
export function newellNormal(pts: Vec3[]): Vec3 {
  let n = v3(0, 0, 0);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    n = v3(n.x + (p.y - q.y) * (p.z + q.z), n.y + (p.z - q.z) * (p.x + q.x), n.z + (p.x - q.x) * (p.y + q.y));
  }
  return n;
}

// ---------------------------------------------------------------------------
// #305 (ADR-3D-090): the circumcentre of a RING — where a right pyramid's apex sits above
// ---------------------------------------------------------------------------

/**
 * The least-squares (algebraic) circumcentre of a 2-D ring: solve x²+y² = 2cx·x + 2cy·y + k.
 *
 * EXACT for any triangle and for any cyclic ring. For a ring the solver has not yet driven
 * cyclic it returns the best-fit centre, which keeps a right pyramid's apex continuous (and
 * so the figure drawable and the residual differentiable) all the way to convergence.
 * Degenerate (collinear) input falls back to the centroid rather than blowing up.
 */
export function ringCircumcentre2(pts: { x: number; y: number }[]): { x: number; y: number } {
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sr = 0, srx = 0, sry = 0;
  for (const p of pts) {
    const r = p.x * p.x + p.y * p.y;
    sx += p.x; sy += p.y; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y;
    sr += r; srx += r * p.x; sry += r * p.y;
  }
  const m = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const rhs = [srx, sry, sr];
  const det3 = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const D = det3(m);
  const centroid = { x: sx / n, y: sy / n };
  if (!Number.isFinite(D) || Math.abs(D) < 1e-14) return centroid;
  const col = (i: number) => m.map((row, r) => row.map((v, cIdx) => (cIdx === i ? rhs[r] : v)));
  const c = { x: det3(col(0)) / D / 2, y: det3(col(1)) / D / 2 };
  return Number.isFinite(c.x) && Number.isFinite(c.y) ? c : centroid;
}

/**
 * The circumcentre of a COPLANAR 3-D ring — project onto the ring's own plane basis, fit
 * there, lift back. The n-gon generalization of {@link circumcenter3}: for 3 points the two
 * agree to machine precision. Null when the ring has no well-defined plane (degenerate).
 */
export function ringCircumcentre3(pts: Vec3[]): Vec3 | null {
  if (pts.length < 3) return null;
  const o = centroid3(pts);
  const n = newellNormal(pts);
  if (norm3(n) < 1e-14) return null; // collinear / degenerate ring — no plane, no centre
  // an orthonormal in-plane basis (u,v)
  const seed = Math.abs(n.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
  const u = normalize3(cross3(n, seed));
  const v = normalize3(cross3(n, u));
  const c2 = ringCircumcentre2(pts.map((p) => ({ x: dot3(sub3(p, o), u), y: dot3(sub3(p, o), v) })));
  return add3(o, add3(scale3(u, c2.x), scale3(v, c2.y)));
}

/**
 * The INCIRCLE of a coplanar 3-D triangle — centre and radius of the circle tangent to all three
 * sides, living in the triangle's own plane (#442). Closed form, no solver:
 * `I = (a·A + b·B + c·C)/(a+b+c)` with `a=|BC|` etc., and `r = Area/s`.
 *
 * TRIANGLES ONLY, deliberately. Every triangle has an incircle; a general quadrilateral does NOT (only
 * a tangential one does), so a best-fit circle for a 4-gon would draw a figure tangent to nothing — the
 * lie this returning `null` prevents. The parser refuses the quad case with a message instead.
 */
export function triangleIncircle3(pts: Vec3[]): { center: Vec3; radius: number } | null {
  if (pts.length !== 3) return null;
  const [A, B, C] = pts;
  const a = norm3(sub3(B, C)), b = norm3(sub3(C, A)), c = norm3(sub3(A, B));
  const per = a + b + c;
  if (per < 1e-12) return null;
  const center = scale3(add3(add3(scale3(A, a), scale3(B, b)), scale3(C, c)), 1 / per);
  const area = norm3(cross3(sub3(B, A), sub3(C, A))) / 2;
  if (area < 1e-12) return null; // degenerate (collinear) triangle — no incircle
  return { center, radius: (2 * area) / per };
}
