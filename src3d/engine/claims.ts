/**
 * Claim verification (docs/20 §5, §6.2): a claim is the STUDENT'S ANSWER, checked
 * against the figure — reproduce & verify, never solve. Verification is numeric
 * and runs across SEVERAL sampled configurations (different seeds), so a claim
 * that only happens to hold in one drawing of an under-determined figure — a
 * coincidence, not a truth — is refuted. This is the multi-sample discipline the
 * 2-D tool's relation detection uses, applied to answers.
 */

import { lineAtParam, planeAtParam, resolve3, type Resolved3 } from './evaluate';
import { lineRelDeviation, mutualHolds, mutualSides, MUTUAL_VERIFY_TOL, distanceBetween, figureExtent, planeCoincidenceDeviation, relDeviation, resolveOperand } from './operands';
import { atomVec, evalExpr } from './vecExpr';
import { cross3, dot3, newellNormal, norm3, sub3, v3, type Vec3 } from './vec3';
import type { Claim3, Construction3 } from './types';

/** Claim tolerance. Closed-form figures verify to ~1e-15; a figure placed by the V4
 *  NUMERIC pivot carries the finite-difference-Jacobian floor (~1e-6 in loosely
 *  conditioned, unpinned directions) — 2e-5 sits far above that noise and far below
 *  any wrong bagrut answer (which differs by ≥ 0.5). */
const REL_TOL = 2e-5;

/** Seeds checked for every claim: the display seed plus fixed offsets (deterministic). */
export const claimSeeds = (seed: number): number[] => [seed, seed + 1013, seed + 2027, seed + 4057];

function holdsAt(claim: Claim3, c: Construction3, resolved: Resolved3): boolean {
  // #375: a claim may reference a resolved LINE, not only positions. `evaluate3` is literally
  // `resolve3(...).positions`, so taking the whole Resolved3 costs nothing and stops the claim lane
  // being blind to everything the figure resolves besides its points.
  const pos = resolved.positions;
  switch (claim.type) {
    case 'vec-eq': {
      const l = evalExpr(claim.lhs, c, pos);
      const r = evalExpr(claim.rhs, c, pos);
      if (!l || !r) return false;
      const scale = Math.max(norm3(l), norm3(r), 1e-12);
      return norm3(sub3(l, r)) <= REL_TOL * Math.max(scale, 1);
    }
    case 'perp-plane': {
      const [s1, s2] = claim.seg.map((id) => pos.get(id)!);
      const [p1, p2, p3] = claim.plane.map((id) => pos.get(id)!);
      if (!s1 || !s2 || !p1 || !p2 || !p3) return false;
      const d = sub3(s2, s1);
      const e1 = sub3(p2, p1);
      const e2 = sub3(p3, p1);
      // the two plane directions must be independent, and d ⟂ both
      if (norm3(cross3(e1, e2)) <= REL_TOL * Math.max(norm3(e1) * norm3(e2), 1e-12)) return false;
      const ok1 = Math.abs(dot3(d, e1)) <= REL_TOL * Math.max(norm3(d) * norm3(e1), 1);
      const ok2 = Math.abs(dot3(d, e2)) <= REL_TOL * Math.max(norm3(d) * norm3(e2), 1);
      return ok1 && ok2;
    }
    case 'collinear3': {
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.some((p) => !p)) return false;
      const [a, b] = [ps[0]!, ps[1]!];
      const ab = sub3(b, a);
      for (let i = 2; i < ps.length; i++) {
        const ac = sub3(ps[i]!, a);
        if (norm3(cross3(ab, ac)) > REL_TOL * Math.max(norm3(ab) * norm3(ac), 1)) return false;
      }
      return true;
    }
    case 'length-eq': {
      const a = pos.get(claim.a);
      const b = pos.get(claim.b);
      if (!a || !b) return false;
      return Math.abs(norm3(sub3(b, a)) - claim.value) <= REL_TOL * Math.max(Math.abs(claim.value), 1);
    }
    case 'area-eq': {
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.some((p) => !p)) return false;
      const area = 0.5 * norm3(cross3(sub3(ps[1]!, ps[0]!), sub3(ps[2]!, ps[0]!)));
      return Math.abs(area - claim.value) <= REL_TOL * Math.max(Math.abs(claim.value), 1);
    }
    case 'coords-eq': {
      const p = pos.get(claim.id);
      if (!p) return false;
      const target = v3(claim.x, claim.y, claim.z);
      return norm3(sub3(p, target)) <= REL_TOL * Math.max(norm3(target), 1);
    }
    case 'coord-plane-rel': {
      // #324 (ADR-3D-079): the ring's relation to a coordinate plane/axis on the FINAL figure
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.some((p) => !p)) return false;
      const ring = ps as { x: number; y: number; z: number }[];
      let extent = 0;
      for (let i = 1; i < ring.length; i++) extent = Math.max(extent, norm3(sub3(ring[i], ring[0])));
      const tol = REL_TOL * Math.max(extent, 1);
      if (claim.mode === 'share') return ring.every((p) => Math.abs(p[claim.axis] - ring[0][claim.axis]) <= tol);
      if (claim.mode === 'zero') return ring.every((p) => Math.abs(p[claim.axis]) <= tol);
      const n = newellNormal(ring.map((p) => v3(p.x, p.y, p.z)));
      const nn = norm3(n);
      if (nn < 1e-12) return false; // the ring does not span a plane at all
      if (Math.abs(n[claim.axis]) > REL_TOL * nn) return false;
      if (claim.mode === 'contains') return Math.abs(dot3(n, ring[0])) <= REL_TOL * nn * Math.max(extent, 1);
      return true;
    }
    case 'plane-line-perp': {
      // #375: the point-run plane's normal must be PARALLEL to the line's direction (the plane ⟂ the
      // line). Judged on the FINAL figure, normalized by both magnitudes so neither a shrinking figure
      // nor an arbitrarily scaled direction vector can zero it for free.
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.length < 3 || ps.some((p) => !p)) return false;
      const ring = (ps as { x: number; y: number; z: number }[]).map((p) => v3(p.x, p.y, p.z));
      const n = newellNormal(ring);
      const nn = norm3(n);
      if (nn < 1e-12) return false; // the named points do not span a plane
      const ln = resolved.lines.get(claim.line);
      if (!ln) return false;
      const dn = norm3(ln.dir);
      if (dn < 1e-12) return false;
      return norm3(cross3(n, ln.dir)) <= REL_TOL * nn * dn;
    }
    case 'line-rel': {
      // S2 (#378, ADR-3D-103): resolved through the ONE operand seam (engine/operands.ts), so the
      // claim judges exactly the geometry the drive drove. Tolerance is the DRIVE's numeric floor
      // (the memberHolds3 reasoning, 1e-4) — the unmet trigger uses the same bar, so a figure the
      // drive accepts can never flap to claim-refuted; a wrong bagrut relation misses by ≥ ~1e-2.
      const ln = resolved.lines.get(claim.line);
      if (!ln) return false;
      const geom = resolveOperand(claim.op, c, { lines: resolved.lines, planes: resolved.planes })((id) => pos.get(id) ?? null);
      if (!geom) return false;
      const dev = lineRelDeviation(claim.rel, claim.deg, geom, ln.dir);
      return dev !== null && dev <= 1e-4;
    }
    case 'mutual-rel': {
      // S4 (#378): the general operand pair, through the same seam and the same classifier the
      // drive and the requirement gate read — one answer to "where do these two lie".
      const sides = mutualSides(claim.a, claim.b, c, { lines: resolved.lines, planes: resolved.planes }, (id) => pos.get(id) ?? null);
      if (!sides) return false;
      return mutualHolds(claim.rel, sides[0], sides[1], MUTUAL_VERIFY_TOL);
    }
    case 'plane-rel': {
      // S3 (#378): the general direction relation, through the one operand seam and the one
      // deviation function the drive uses — so a driven figure can never disagree with its claim.
      const abs = { lines: resolved.lines, planes: resolved.planes };
      const at = (id: string) => pos.get(id) ?? null;
      const ga = resolveOperand(claim.a, c, abs)(at);
      const gb = resolveOperand(claim.b, c, abs)(at);
      if (!ga || !gb) return false;
      const dev =
        claim.rel === 'coincident'
          ? planeCoincidenceDeviation(ga, gb, figureExtent(pos))
          : relDeviation(claim.rel, claim.deg, ga, gb);
      return dev !== null && dev <= 1e-4;
    }
    case 'distance-rel': {
      // S5 (#378): one geometry function, shared with the drive residual and the query lane.
      const abs = { lines: resolved.lines, planes: resolved.planes };
      const at = (id: string) => pos.get(id) ?? null;
      const ga = resolveOperand(claim.a, c, abs)(at);
      const gb = resolveOperand(claim.b, c, abs)(at);
      if (!ga || !gb) return false;
      const d = distanceBetween(ga, gb);
      return d !== null && Math.abs(d - claim.value) <= REL_TOL * Math.max(1, Math.abs(claim.value));
    }
    case 'plane-eq': {
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.length < 3 || ps.some((p) => !p)) return false;
      const n = v3(claim.cx, claim.cy, claim.cz);
      if (norm3(n) < 1e-12) return false; // not a plane at all
      // the named points must genuinely span a plane
      if (norm3(cross3(sub3(ps[1]!, ps[0]!), sub3(ps[2]!, ps[0]!))) < 1e-9) return false;
      return ps.every((p) => Math.abs(dot3(n, p!) + claim.d) <= REL_TOL * Math.max(norm3(n) * (1 + norm3(p!)), 1));
    }
    case 'angle-seg-eq': {
      const [a1, b1, a2, b2] = [claim.a1, claim.b1, claim.a2, claim.b2].map((id) => pos.get(id));
      if (!a1 || !b1 || !a2 || !b2) return false;
      const d1 = sub3(b1, a1);
      const d2 = sub3(b2, a2);
      const den = norm3(d1) * norm3(d2);
      if (den < 1e-12) return false;
      // the angle between LINES: undirected, ≤ 90° (the textbook convention)
      const deg = (Math.acos(Math.min(1, Math.abs(dot3(d1, d2)) / den)) * 180) / Math.PI;
      return Math.abs(deg - claim.deg) <= 1e-3;
    }
    case 'length-ratio': {
      const [a1, b1, a2, b2] = [claim.a1, claim.b1, claim.a2, claim.b2].map((id) => pos.get(id));
      if (!a1 || !b1 || !a2 || !b2 || claim.q === 0) return false;
      const len2 = norm3(sub3(b2, a2));
      if (len2 < 1e-12) return false;
      return Math.abs(norm3(sub3(b1, a1)) / len2 - claim.p / claim.q) <= REL_TOL * Math.max(claim.p / claim.q, 1);
    }
    case 'volume-eq':
    case 'lateral-area-eq': {
      const rev = c.revolutions.find((r) => r.kind === claim.solid);
      if (!rev || rev.radius === undefined) return false; // guarded upstream (no-such-solid / free-size-claim)
      const r = rev.radius;
      const h = rev.height ?? 0;
      let actual: number;
      if (claim.type === 'volume-eq') {
        actual = rev.kind === 'sphere' ? (4 / 3) * Math.PI * r ** 3 : rev.kind === 'cone' ? (Math.PI * r * r * h) / 3 : Math.PI * r * r * h;
      } else {
        actual = rev.kind === 'sphere' ? 4 * Math.PI * r * r : rev.kind === 'cone' ? Math.PI * r * Math.hypot(r, h) : 2 * Math.PI * r * h;
      }
      return Math.abs(actual - claim.value) <= REL_TOL * Math.max(Math.abs(claim.value), 1);
    }
    case 'volume-poly': {
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.length !== 4 || ps.some((p) => !p)) return false;
      const vol = Math.abs(dot3(sub3(ps[1]!, ps[0]!), cross3(sub3(ps[2]!, ps[0]!), sub3(ps[3]!, ps[0]!)))) / 6;
      return Math.abs(vol - claim.value) <= REL_TOL * Math.max(Math.abs(claim.value), 1);
    }
    case 'length-rel': {
      const [a1, b1, a2, b2] = [claim.a1, claim.b1, claim.a2, claim.b2].map((id) => pos.get(id));
      if (!a1 || !b1 || !a2 || !b2) return false;
      const target = claim.c * norm3(sub3(b2, a2));
      return Math.abs(norm3(sub3(b1, a1)) - target) <= REL_TOL * Math.max(target, 1);
    }
    case 'volume-eq-poly': {
      const vol = (ids: string[]): number | null => {
        const ps = ids.map((id) => pos.get(id));
        if (ps.length !== 4 || ps.some((p) => !p)) return null;
        return Math.abs(dot3(sub3(ps[1]!, ps[0]!), cross3(sub3(ps[2]!, ps[0]!), sub3(ps[3]!, ps[0]!)))) / 6;
      };
      const v1 = vol(claim.ids1);
      const v2 = vol(claim.ids2);
      return v1 !== null && v2 !== null && Math.abs(v1 - v2) <= REL_TOL * Math.max(v1, v2, 1);
    }
    case 'lines-rel': {
      // S4 (#378): delegates to the ONE shared classifier — the same scalars the mutual-position
      // drive, the data panel and the requirement gate read, so a driven figure can never disagree
      // with its own claim. The segments are BOUNDED sides (`מצטלבים`/`נחתכים` are statements about
      // the drawn segments, not their continuations — the 2-D ADR-166 reading in R³).
      const [a1, b1, a2, b2] = [claim.a1, claim.b1, claim.a2, claim.b2].map((id) => pos.get(id));
      if (!a1 || !b1 || !a2 || !b2) return false;
      const s1 = { geom: { point: a1, dir: sub3(b1, a1) }, bounded: true };
      const s2 = { geom: { point: a2, dir: sub3(b2, a2) }, bounded: true };
      // `parallel` here keeps its historic reading — two segments lying on ONE line satisfied the
      // old `cross ≈ 0` test, and a saved figure may rely on it.
      if (claim.rel === 'parallel') return mutualHolds('parallel', s1, s2, MUTUAL_VERIFY_TOL) || mutualHolds('coincident', s1, s2, MUTUAL_VERIFY_TOL);
      return mutualHolds(claim.rel === 'intersect' ? 'intersecting' : 'skew', s1, s2, MUTUAL_VERIFY_TOL);
    }
    case 'concyclic': {
      // #305 (ADR-3D-090): the ScalarPin's twin — opposite angles supplementary (see solve3).
      const q = claim.ids.map((id) => pos.get(id));
      if (q.length !== 4 || q.some((v) => !v)) return false;
      const [A, B, C, D] = q as Vec3[];
      const cosAt = (v: Vec3, p1: Vec3, p2: Vec3) => {
        const u1 = sub3(p1, v);
        const u2 = sub3(p2, v);
        const den = Math.max(norm3(u1) * norm3(u2), 1e-12);
        return dot3(u1, u2) / den;
      };
      return Math.abs(cosAt(A, B, D) + cosAt(C, B, D)) <= REL_TOL * 10;
    }
    case 'cos-angle-eq': {
      // V8-f (G6) on a determined figure: cos of the angle between two operands = value
      const u = atomVec(claim.u, c, pos);
      const v = atomVec(claim.v, c, pos);
      if (!u || !v) return false;
      const den = norm3(u) * norm3(v);
      if (den < 1e-12) return false;
      return Math.abs(dot3(u, v) / den - claim.cos) <= REL_TOL * Math.max(Math.abs(claim.cos), 1);
    }
    case 'dot-eq': {
      // V8-f (G9): u·v = c·d (a chained-equality link), checked on the determined figure
      const [a, b, cc, d] = [claim.a, claim.b, claim.c, claim.d].map((r) => atomVec(r, c, pos));
      if (!a || !b || !cc || !d) return false;
      const scale = Math.max(norm3(a) * norm3(b), norm3(cc) * norm3(d), 1e-12);
      return Math.abs(dot3(a, b) - dot3(cc, d)) <= REL_TOL * scale;
    }
    case 'cos-eq': {
      // V8-f (G10): ∠(a,b) = ∠(c,d) — equal angles ⟺ equal cosines
      const [a, b, cc, d] = [claim.a, claim.b, claim.c, claim.d].map((r) => atomVec(r, c, pos));
      if (!a || !b || !cc || !d) return false;
      const den1 = norm3(a) * norm3(b);
      const den2 = norm3(cc) * norm3(d);
      if (den1 < 1e-12 || den2 < 1e-12) return false;
      return Math.abs(dot3(a, b) / den1 - dot3(cc, d) / den2) <= REL_TOL;
    }
    case 'line-plane-angle': {
      // triage 3-D: sin β = |n·u| / (|n||u|) (formula sheet). n from two plane edges at pt[0].
      const a = pos.get(claim.a);
      const b = pos.get(claim.b);
      const pts = claim.plane.map((id) => pos.get(id));
      if (!a || !b || pts.some((p) => !p)) return false;
      const u = sub3(b, a);
      const n = cross3(sub3(pts[1]!, pts[0]!), sub3(pts[pts.length - 1]!, pts[0]!));
      const den = norm3(n) * norm3(u);
      if (den < 1e-12) return false;
      const beta = (Math.asin(Math.min(1, Math.abs(dot3(n, u)) / den)) * 180) / Math.PI;
      return Math.abs(beta - claim.deg) <= 1e-3;
    }
    case 'never-parallel': {
      // "ℓ ∦ π for EVERY parameter value" (2024-Q2 א): parallel ⟺ dir(m)·n(m) = 0,
      // so the claim holds iff that residual has NO zero over the scanned range —
      // sign changes AND near-zero touches both refute it. Parameter-scan, seed-free.
      let prev: number | null = null;
      for (let m = -25; m <= 25 + 1e-9; m += 0.01) {
        const ln = lineAtParam(c, claim.line, m);
        if (!ln) return false;
        const pl = planeAtParam(c, claim.plane, m);
        const scale = Math.max(norm3(ln.dir) * norm3(pl.n), 1e-12);
        const r = dot3(ln.dir, pl.n) / scale;
        if (Number.isNaN(r) || Math.abs(r) < 1e-4) return false; // touches parallel
        if (prev !== null && prev * r < 0) return false; // crosses parallel between samples
        prev = r;
      }
      return true;
    }
  }
}

/** True iff the claim holds in EVERY sampled configuration. */
export function verifyClaim(claim: Claim3, c: Construction3, seed: number): boolean {
  return claimSeeds(seed).every((s) => holdsAt(claim, c, resolve3(c, s)));
}
