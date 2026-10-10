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

/**
 * The INTERNAL bisector direction of ∠(a·apex·b), as a unit vector — the normalised sum of the two
 * unit arm directions. `null` when it does not exist: an arm of zero length, or two opposite rays
 * (a straight angle has no internal bisector direction, only a bisector plane).
 *
 * #872 (ADR-3D-212): the ONE definition of what "bisects" means in R³. Every consumer — the
 * constructive placement in `evaluate`, the driving residual in `solve3`, the verification in
 * `claims` — reads it from here. The defect this replaces was two lanes deriving the meaning
 * independently: the constructive lane used this direction, the given lane lowered the same sentence
 * to an equality of the two arm ANGLES, which in R³ is a whole plane of directions through the apex
 * and admits every out-of-plane one.
 */
export function bisectorDir3(apex: Vec3, a: Vec3, b: Vec3): Vec3 | null {
  const ra = sub3(a, apex);
  const rb = sub3(b, apex);
  if (norm3(ra) < 1e-12 || norm3(rb) < 1e-12) return null;
  const bis = add3(normalize3(ra), normalize3(rb));
  if (norm3(bis) < 1e-9) return null; // opposite rays: no internal bisector direction
  return normalize3(bis);
}

/** Linear interpolation a + t·(b−a) — the on-segment point. */
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => add3(a, scale3(sub3(b, a), t));

/**
 * #1728 — where the lines a1–b1 and a2–b2 cross: the midpoint of their closest approach (closed form), so
 * a crossing of coplanar lines is exact and a skew pair still gets a defined point for the verifier to
 * judge. `null` for parallel or degenerate lines — there is no crossing to place.
 */
export function lineCrossing3(a1: Vec3, b1: Vec3, a2: Vec3, b2: Vec3): Vec3 | null {
  const d1 = sub3(b1, a1);
  const d2 = sub3(b2, a2);
  const n = cross3(d1, d2);
  const n2 = dot3(n, n);
  if (n2 <= 1e-24 * Math.max(dot3(d1, d1) * dot3(d2, d2), 1e-300)) return null;
  const w = sub3(a2, a1);
  const t1 = dot3(cross3(w, d2), n) / n2;
  const t2 = dot3(cross3(w, d1), n) / n2;
  return scale3(add3(add3(a1, scale3(d1, t1)), add3(a2, scale3(d2, t2))), 0.5);
}

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

/**
 * #571 — the normal of the plane a point RUN spans, ORDER-FREE.
 *
 * A plane named by points is a SET: «מישור BB'DD'» and «מישור BB'D'D» name one plane, and any stated
 * order must resolve to it. `newellNormal` cannot answer that question — it is twice the polygon's
 * SIGNED-AREA vector, so the order B→B'→D→D' traces a self-crossing bowtie whose two triangles cancel
 * exactly, the normal comes out 0, and the figure was refused `not-coplanar` on four points that are
 * perfectly coplanar. An order-sensitive computation was answering an order-free question.
 *
 * The largest triple cross product is a function of the point SET, so every ordering gives the same
 * plane. Two properties are kept deliberately:
 *
 *  - **Orientation.** The stated order decides the normal's SIGN whenever it says anything (the
 *    right-hand rule), so every figure that resolves today keeps its exact normal direction — which is
 *    what «above/below the plane» and the solver's signed residuals read. A self-crossing order says
 *    nothing about orientation (its signed areas cancel), and there the sign is fixed deterministically
 *    by making the dominant component positive — stable across iterations and seeds, unlike a
 *    first-non-zero rule.
 *  - **Refusals.** Collinear or coincident runs still return the zero vector, so every caller's
 *    degeneracy guard fires exactly as before; and being coplanar is still verified separately, so a
 *    genuinely non-coplanar run is refused as it always was.
 *
 * Canonical rings — a solid's faces, a polygon's own ring — are built in non-crossing order and keep
 * `newellNormal`: for those the order IS the shape (it names the edges), not a way of naming a plane.
 */
/**
 * #571 — the same point RUN, ordered so it can be DRAWN: the non-crossing ring around the plane the
 * set spans. «מישור BB'DD'» names two parallel edges, and drawing the stated order would ink a crossed
 * bowtie — asserting a self-crossing the student never stated (operator ruling, 2026-08-16: the drawn
 * patch takes the convex reorder; the plane's identity is unaffected either way, this is ink only).
 * A run whose stated order is already non-crossing is returned untouched.
 */
export function runRingOrder(pts: Vec3[]): Vec3[] {
  if (pts.length < 4) return pts;
  const n = runNormal(pts);
  if (norm3(n) < 1e-12) return pts;
  const k = normalize3(n);
  const c = centroid3(pts);
  const e1raw = sub3(pts[0], c);
  const e1n = sub3(e1raw, scale3(k, dot3(e1raw, k)));
  if (norm3(e1n) < 1e-12) return pts;
  const e1 = normalize3(e1n);
  const e2 = cross3(k, e1);
  // angles in [0, 2π) FROM pts[0], so a run already stated non-crossing comes back byte-identical:
  // `runNormal` takes its sign from the stated order, which makes that order the ascending one.
  const withAngle = pts.map((p) => {
    const q = sub3(p, c);
    const a = Math.atan2(dot3(q, e2), dot3(q, e1));
    return { p, a: a < 0 ? a + 2 * Math.PI : a };
  });
  withAngle.sort((x, y) => x.a - y.a);
  return withAngle.map((x) => x.p);
}

/**
 * #1499 / #1849 (ADR-3D-310) — has this declared polygon's ring COLLAPSED onto a line? Its greatest
 * spanning normal is at most 1e-4 of its own span squared (scale-free). The ONE predicate behind the
 * pivot's flat-ring judgement (`solvePivot`) and the `polygon-open` claim of a polygon declared over
 * existing points, so the two lanes cannot disagree about what "flat" means. A ring shrunk to a point is
 * the coincidence gates' business, not this one's.
 */
export function ringCollapsed3(pts: Vec3[]): boolean {
  return ringOpenness3(pts) <= 1e-4;
}

/**
 * #1923 (ADR-3D-314) — does this ring CROSS ITSELF? Two NON-adjacent sides properly cross: each separates the
 * other's endpoints, strictly, in the plane the four endpoints share. Beside `ringCollapsed3` so the ring checks
 * live in one place. Only a PROPER crossing counts — a vertex that merely touches another side, a collapsed ring
 * (the collapse predicate's business) or two sides that are skew in space (they never meet) is not one; this is
 * analytic's `properlyCross` (ADR-AG-129) in R³. Scale-free tolerances; deterministic.
 */
export function ringSelfCrossing3(pts: Vec3[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  let span = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) span = Math.max(span, norm3(sub3(pts[j], pts[i])));
  if (span < 1e-12) return false;
  const eps = 1e-9 * span * span;
  /** the signed side of `p` against the line ab, measured along the plane normal `nrm` */
  const side = (a: Vec3, b: Vec3, p: Vec3, nrm: Vec3) => dot3(cross3(sub3(b, a), sub3(p, a)), nrm) / norm3(nrm);
  const crosses = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): boolean => {
    // the plane of the two sides — skew sides never meet
    const nrm = runNormal([a, b, c, d]);
    if (norm3(nrm) < eps) return false; // all four on one line: a collapse, not a crossing
    const unit = scale3(nrm, 1 / norm3(nrm));
    if (Math.abs(dot3(sub3(c, a), unit)) > 1e-9 * span || Math.abs(dot3(sub3(d, a), unit)) > 1e-9 * span || Math.abs(dot3(sub3(b, a), unit)) > 1e-9 * span) return false;
    const d1 = side(a, b, c, nrm);
    const d2 = side(a, b, d, nrm);
    const d3 = side(c, d, a, nrm);
    const d4 = side(c, d, b, nrm);
    return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing side
      if (crosses(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  return false;
}
/**
 * #1928 (ADR-3D-319) — how SKEW a ring is: the spread of its vertices ALONG the normal of its best-spanning
 * triple (`runNormal`), over the ring's extent (its greatest pairwise distance). 0 for a flat ring, and
 * scale-free, so the caller judges it against one RELATIVE tolerance — `CLAIM_REL_TOL`, the number the claims
 * already use (vec3 holds no tolerances of its own, and importing `operands` here would be a cycle).
 *
 * Third of the three ring predicates, beside `ringCollapsed3` (ADR-3D-310) and `ringSelfCrossing3` (ADR-3D-314),
 * so "is this ring the shape it was declared to be" is answered in one place. A ring with no plane at all
 * (fewer than 4 vertices, collinear, coincident, shrunk onto a point) is 0: that is the COLLAPSE predicate's
 * business, and reporting skew for it would blame the wrong statement. `solve3`'s private `offPlaneSpread` is
 * this measure in absolute units against a differently chosen plane; it serves the solver's own collapse band
 * and is deliberately left alone.
 */
export function ringSkew3(pts: Vec3[]): number {
  if (pts.length < 4) return 0; // a triangle is flat by construction
  let span = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) span = Math.max(span, norm3(sub3(pts[j], pts[i])));
  if (span < 1e-12) return 0;
  const nrm = runNormal(pts);
  const mag = norm3(nrm);
  if (mag < 1e-12) return 0; // no plane: collinear or coincident
  const unit = scale3(nrm, 1 / mag);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const h = dot3(sub3(p, pts[0]), unit);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return (hi - lo) / span;
}

/** How OPEN a ring is: its greatest spanning normal over its span squared (0 = on one line). Infinity for a
 *  ring too small to judge (fewer than 3 points, or shrunk onto a point). */
export function ringOpenness3(pts: Vec3[]): number {
  if (pts.length < 3) return Infinity;
  let maxD = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) maxD = Math.max(maxD, norm3(sub3(pts[j], pts[i])));
  return maxD > 1e-12 ? norm3(runNormal(pts)) / (maxD * maxD) : Infinity;
}

export function runNormal(pts: Vec3[]): Vec3 {
  if (pts.length < 3) return v3(0, 0, 0);
  let best = v3(0, 0, 0);
  let bestMag = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      for (let k = j + 1; k < pts.length; k++) {
        const n = cross3(sub3(pts[j], pts[i]), sub3(pts[k], pts[i]));
        const m = norm3(n);
        if (m > bestMag) {
          bestMag = m;
          best = n;
        }
      }
    }
  }
  if (bestMag === 0) return best; // collinear or coincident — no plane, and the callers refuse as before
  const stated = newellNormal(pts);
  const agree = dot3(best, stated);
  if (Math.abs(agree) > 1e-9 * bestMag * Math.max(norm3(stated), 1e-30)) return agree < 0 ? scale3(best, -1) : best;
  // a self-crossing order carries no orientation — choose one deterministically
  const ax = Math.abs(best.x) >= Math.abs(best.y) && Math.abs(best.x) >= Math.abs(best.z) ? best.x : Math.abs(best.y) >= Math.abs(best.z) ? best.y : best.z;
  return ax < 0 ? scale3(best, -1) : best;
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
