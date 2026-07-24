/**
 * Constraint-driven DOF solving (ADR-012/ADR-014).
 *
 * A constraint is generic over three things, and only these grow as new
 * constraint types land:
 *   - `constraintRefs` — which points it references,
 *   - `residual`      — a scalar that is 0 exactly when it is satisfied,
 *   - `describeConstraint` — how to name it in an error message.
 *
 * The *solver* stays the same for all of them: when a constraint drives a
 * 1-DOF carrier (an on-segment point's parameter t), `solveParam` finds every
 * t where the residual vanishes, and the branch index picks among them. A new
 * constraint type means a new `case` in each function below — not a new point
 * kind, evaluator rule, or solver.
 */

import type { Constraint, Construction, Id, LengthBoundConstraint, SolveDirective, SolvedOnSegmentPoint, Vec } from './types';
import {
  ANGLE_EPS,
  ORDER_ANGLE_MARGIN_DEG,
  ORDER_ANGLE_MIN_GAP_DEG,
  ORDER_LEN_MARGIN_FRAC,
  ORDER_LEN_MIN_FRAC,
  boundAim,
  isOrderConstraint,
} from './types';
import { add, angleDeg, circumcenter, dist, polygonArea, polygonPerimeter, scale, solveParam, sub, unit } from './geometry';

/** A length bound's aim/accept margins in LENGTH units: the order fractions taken against the stated
 *  bound, then window-clamped (`boundAim`) so a narrow range keeps a reachable target (ADR-390). */
function lengthBoundAim(con: LengthBoundConstraint): { margin: number; minGap: number } {
  const ref = Math.max(Math.abs(con.max ?? con.min ?? 0), 1e-9);
  return boundAim(con.min, con.max, ORDER_LEN_MARGIN_FRAC * ref, ORDER_LEN_MIN_FRAC * ref);
}

/** The point ids a constraint references. */
export function constraintRefs(con: Constraint): Id[] {
  switch (con.type) {
    case 'angle':
      return [con.vertex, con.ray1, con.ray2];
    case 'distance':
      return [con.a, con.b];
    case 'equal':
    case 'ratio':
    case 'parallel':
    case 'perpendicular':
      return [con.a, con.b, con.c, con.d];
    case 'length-radius':
      return [con.a, con.b, con.center, con.witness];
    case 'angle-ratio':
      return [con.v1, con.a1, con.b1, con.v2, con.a2, con.b2];
    case 'coincide':
      return [con.p, con.q];
    case 'angle-order':
      return [con.v1, con.a1, con.b1, con.v2, con.a2, con.b2];
    case 'length-order':
      return [con.a, con.b, con.c, con.d];
    case 'concyclic':
      return con.points;
    case 'collinear':
      return [con.a, con.b, con.c];
    case 'collinear-order':
      return con.points;
    case 'angle-bound':
      return [con.vertex, con.ray1, con.ray2];
    case 'length-bound':
      return [con.a, con.b];
    case 'area':
    case 'perimeter':
      return con.ids;
    case 'area-ratio':
    case 'perimeter-ratio':
      return [...con.ids1, ...con.ids2];
    case 'measure-sum':
      return con.points;
    case 'length-product':
      return [...con.lhs, ...con.rhs];
  }
}

/** One measure-sum term's value at these positions: |pair| (stride 2) or ∠ at the middle id (stride 3). */
function measureSumTerm(con: { unit: 'length' | 'angle'; points: Id[] }, i: number, get: (id: Id) => Vec): number {
  return con.unit === 'length'
    ? dist(get(con.points[2 * i]), get(con.points[2 * i + 1]))
    : angleDeg(get(con.points[3 * i + 1]), get(con.points[3 * i]), get(con.points[3 * i + 2]));
}

/**
 * Circumcircle of a concyclic constraint's first three points (centre + radius), or null when
 * those three are collinear/coincident (no stable circle — the residual then returns NaN so the
 * root finder skips this position). Shared by `residual`/`constraintScale`.
 */
function concyclicCircle(pts: Vec[]): { o: Vec; r: number } | null {
  if (pts.length < 4) return null; // < 4 points are always concyclic — nothing to measure
  const o = circumcenter(pts[0], pts[1], pts[2]);
  if (!o) return null;
  return { o, r: dist(o, pts[0]) };
}

/**
 * Signed residual: 0 ⇔ the constraint is satisfied at these positions. The sign
 * must change through a solution so `solveParam` can bracket it; for parallel /
 * perpendicular we use the (unit) cross / dot, which is signed and ∈ [−1, 1].
 */
export function residual(con: Constraint, get: (id: Id) => Vec): number {
  switch (con.type) {
    case 'angle':
      return angleDeg(get(con.vertex), get(con.ray1), get(con.ray2)) - con.value;
    case 'distance':
      return dist(get(con.a), get(con.b)) - con.value;
    case 'equal':
      return dist(get(con.a), get(con.b)) - dist(get(con.c), get(con.d));
    case 'ratio':
      return dist(get(con.a), get(con.b)) - (con.k * dist(get(con.c), get(con.d)) + (con.add ?? 0));
    case 'length-radius':
      // |center→witness| is the radius (witness is ON the circle), so this is the ratio form |ab| = k·R.
      return dist(get(con.a), get(con.b)) - (con.k * dist(get(con.center), get(con.witness)) + (con.add ?? 0));
    case 'angle-ratio':
      return angleDeg(get(con.v1), get(con.a1), get(con.b1)) - con.k * angleDeg(get(con.v2), get(con.a2), get(con.b2));
    case 'coincide':
      return dist(get(con.p), get(con.q)); // 0 ⇔ the two points meet
    case 'parallel': {
      const du = sub(get(con.b), get(con.a));
      const dv = sub(get(con.d), get(con.c));
      // A collapsed segment has no direction — NOT a satisfied constraint. Return NaN so the root
      // finder skips it (else unit(0)→(0,0) makes the residual a spurious 0, snapping the point onto
      // the other endpoint — e.g. "CF ⟂ DF" with F on line AD collapsing F onto D).
      if (du.x * du.x + du.y * du.y < 1e-18 || dv.x * dv.x + dv.y * dv.y < 1e-18) return NaN;
      const u = unit(du);
      const v = unit(dv);
      return u.x * v.y - u.y * v.x; // sin∠ → 0 when ∥
    }
    case 'perpendicular': {
      const du = sub(get(con.b), get(con.a));
      const dv = sub(get(con.d), get(con.c));
      if (du.x * du.x + du.y * du.y < 1e-18 || dv.x * dv.x + dv.y * dv.y < 1e-18) return NaN; // see `parallel`
      const u = unit(du);
      const v = unit(dv);
      return u.x * v.x + u.y * v.y; // cos∠ → 0 when ⟂
    }
    case 'collinear': {
      // sin∠(b·a·c): the two rays a→b and a→c are parallel/antiparallel exactly when the three
      // points are collinear. Signed and ∈ [−1, 1] (like `parallel`), so it sign-changes as the
      // third point crosses the line and the bracketing root-finder/optimizer descends it.
      const du = sub(get(con.b), get(con.a));
      const dv = sub(get(con.c), get(con.a));
      // A collapsed ray has no direction — NOT a satisfied constraint. NaN so the solver skips it
      // (else unit(0)→(0,0) is a spurious 0, snapping the driven point onto `a` — see `parallel`).
      if (du.x * du.x + du.y * du.y < 1e-18 || dv.x * dv.x + dv.y * dv.y < 1e-18) return NaN;
      const u = unit(du);
      const v = unit(dv);
      return u.x * v.y - u.y * v.x;
    }
    // ONE-SIDED residuals (≥ 0): zero across the whole satisfying region, positive (and increasing)
    // as the order is violated. The solver descends them like any other residual, but — being flat at
    // 0 — they have no sign change for the bracketing root-finder, so an order constraint is only ever
    // driven through the optimizer (it's pushed as a check; recruitFreeDofs supplies the carriers).
    case 'angle-order':
      // 0 once ∠1 is at least MARGIN below ∠2. Driving toward 0 aims for a clearly-visible gap.
      return Math.max(0, angleDeg(get(con.v1), get(con.a1), get(con.b1)) - angleDeg(get(con.v2), get(con.a2), get(con.b2)) + ORDER_ANGLE_MARGIN_DEG);
    case 'length-order': {
      const longer = dist(get(con.c), get(con.d));
      return Math.max(0, dist(get(con.a), get(con.b)) - longer + ORDER_LEN_MARGIN_FRAC * longer);
    }
    case 'concyclic': {
      // Signed (length-unit) deviation of the points beyond the first three from the circle through
      // those three: 0 ⇔ all on one circle, and it sign-changes as a point crosses the circle (so a
      // 1-DOF on-segment carrier brackets in closed form). NaN when the first three give no circle.
      const pts = con.points.map(get);
      const c = concyclicCircle(pts);
      if (!c) return con.points.length < 4 ? 0 : NaN;
      let s = 0;
      for (let i = 3; i < pts.length; i++) s += dist(c.o, pts[i]) - c.r;
      return s;
    }
    case 'collinear-order': {
      // ONE-SIDED (≥ 0): 0 once the points' projections onto the line P0→Pn-1 are strictly increasing
      // (each ≥ MARGIN·L past the previous), positive by the total "backwards" overlap otherwise — so it
      // pins the listed order. Like the other order residuals it has no sign change (optimizer-driven only).
      const pts = con.points.map(get);
      const p0 = pts[0];
      const dir = sub(pts[pts.length - 1], p0);
      const L = Math.hypot(dir.x, dir.y);
      if (L < 1e-9) return 0; // the ends coincide — nothing to order
      const proj = pts.map((p) => ((p.x - p0.x) * dir.x + (p.y - p0.y) * dir.y) / L); // signed distance along the line
      let r = 0;
      for (let i = 0; i + 1 < proj.length; i++) r += Math.max(0, proj[i] - proj[i + 1] + ORDER_LEN_MARGIN_FRAC * L);
      return r;
    }
    case 'angle-bound': {
      // ONE-SIDED (≥ 0): 0 once the angle sits at least MARGIN inside every stated bound; the two sides
      // SUM so a range drives from whichever end is violated. Acuteness is this at 90 ({min:90} obtuse /
      // {max:90} acute — ADR-108), a student's numbers are the same shape (ADR-390). Optimizer-driven.
      const a = angleDeg(get(con.vertex), get(con.ray1), get(con.ray2));
      const { margin } = boundAim(con.min, con.max, ORDER_ANGLE_MARGIN_DEG, ORDER_ANGLE_MIN_GAP_DEG);
      let r = 0;
      if (con.min !== undefined) r += Math.max(0, con.min + margin - a);
      if (con.max !== undefined) r += Math.max(0, a - (con.max - margin));
      return r;
    }
    case 'length-bound': {
      // The length twin: the margin is a FRACTION of the stated bound (the `length-order` convention),
      // then clamped to the window exactly like the angle case.
      const d = dist(get(con.a), get(con.b));
      const { margin } = lengthBoundAim(con);
      let r = 0;
      if (con.min !== undefined) r += Math.max(0, con.min + margin - d);
      if (con.max !== undefined) r += Math.max(0, d - (con.max - margin));
      return r;
    }
    case 'area':
      // signed: area − value (area is length²). Passes through the target with a sign change as a DOF varies.
      return polygonArea(con.ids.map(get)) - con.value;
    case 'area-ratio':
      return polygonArea(con.ids1.map(get)) - con.k * polygonArea(con.ids2.map(get));
    case 'perimeter':
      // signed: perimeter − value (length units). Sign-changes through the target as a DOF varies.
      return polygonPerimeter(con.ids.map(get)) - con.value;
    case 'perimeter-ratio':
      return polygonPerimeter(con.ids1.map(get)) - con.k * polygonPerimeter(con.ids2.map(get));
    case 'measure-sum': {
      // signed: Σ coefᵢ·mᵢ − target (length units or degrees). Sign-changes through the target as a
      // DOF varies. An angle term propagates angleDeg's NaN on a collapsed ray (solver skips — the
      // `parallel` discipline); a length term of a collapsed pair is honestly 0 (a real length).
      let s = -con.target;
      for (let i = 0; i < con.coefs.length; i++) s += con.coefs[i] * measureSumTerm(con, i, get);
      return s;
    }
    case 'length-product': {
      // LOG-domain monomial residual: log k + Σlog|lhsᵢ| − Σlog|rhsⱼ| — signed, sign-changing
      // through the root, scale-free when factor degrees match (the parser guarantees they do), and
      // relative-error-sized in `jointCostTerm` beside the equal/ratio terms. A near-zero factor
      // returns NaN (never ±∞) so `solveParam`/the optimizer skip the sample — the collapsed-ray
      // discipline (see `parallel`): a degenerate collapse must never read as "satisfied".
      let r = Math.log(con.k);
      for (let i = 0; i + 1 < con.lhs.length; i += 2) {
        const d = dist(get(con.lhs[i]), get(con.lhs[i + 1]));
        if (d < 1e-9) return NaN;
        r += Math.log(d);
      }
      for (let i = 0; i + 1 < con.rhs.length; i += 2) {
        const d = dist(get(con.rhs[i]), get(con.rhs[i + 1]));
        if (d < 1e-9) return NaN;
        r -= Math.log(d);
      }
      return r;
    }
  }
}

/**
 * Tolerance for "is this constraint satisfied?" — degrees for angle, units for length, sin/cos for ∥/⟂.
 * For the LENGTH-unit constraints (distance/equal/ratio) the tolerance is **relative to the figure
 * scale** (`scale` = the figure's extent): a fixed 1e-6 is ~7 significant digits on a figure of size
 * ~20, which a derivative-free solve through a construction (e.g. a length driven via an incenter)
 * can't reliably hit, so a visually-exact result was wrongly flagged. A genuine contradiction is off
 * by whole units, far beyond `1e-4·scale`. Angle (degrees) and ∥/⟂ (unit cross/dot ∈ [−1,1]) are
 * already scale-free. (See [ADR-033](docs/06-decisions.md#adr-033).)
 */
/**
 * The characteristic LENGTH of a length-unit constraint at these positions — the scale its tolerance
 * is relative to. Using the constraint's OWN magnitude (not the whole figure's extent) stops the solver
 * "gaming" a relative tolerance by shrinking the constrained part while a far-off point keeps the figure
 * span large. Scale-free constraints (angle, ∥/⟂) return 1. (See [ADR-033](docs/06-decisions.md#adr-033).)
 */
export function constraintScale(con: Constraint, get: (id: Id) => Vec): number {
  switch (con.type) {
    case 'distance':
      return Math.abs(con.value);
    case 'equal':
      return dist(get(con.c), get(con.d));
    case 'ratio':
      return Math.abs(con.k * dist(get(con.c), get(con.d)) + (con.add ?? 0));
    case 'length-radius':
      return Math.abs(con.k * dist(get(con.center), get(con.witness)) + (con.add ?? 0));
    case 'length-order':
      return Math.max(dist(get(con.c), get(con.d)), 1e-9); // relative to the longer length
    case 'collinear-order':
      return Math.max(dist(get(con.points[0]), get(con.points[con.points.length - 1])), 1e-9); // relative to the line span
    case 'angle-order':
    case 'angle-bound':
      return 90; // an order residual is ≤ MARGIN degrees — scale it like a right angle so it sits ~O(0.1) alongside relative length residuals
    case 'length-bound':
      return Math.max(Math.abs(con.max ?? con.min ?? 0), 1e-9); // relative to the stated bound (the `distance` convention)
    case 'concyclic': {
      const c = concyclicCircle(con.points.map(get));
      return c ? Math.max(c.r, 1e-9) : 1; // relative to the circle's radius (a length-unit residual)
    }
    case 'area':
      return Math.max(Math.abs(con.value), 1e-9); // area² units — relative to the target area
    case 'area-ratio':
      return Math.max(con.k * polygonArea(con.ids2.map(get)), 1e-9); // relative to the (scaled) reference area
    case 'perimeter':
      return Math.max(Math.abs(con.value), 1e-9); // length units — relative to the target perimeter
    case 'perimeter-ratio':
      return Math.max(con.k * polygonPerimeter(con.ids2.map(get)), 1e-9); // relative to the (scaled) reference perimeter
    case 'measure-sum': {
      if (con.unit === 'angle') return 1; // degrees are scale-free (the angle/angle-ratio convention)
      // Length units: an ABSOLUTE sum scales to its target (the perimeter precedent); a RELATIVE
      // Σ=Σ (target 0) scales to its LARGEST term measured at the positions — a max, not a mean, so
      // the solver can't "game" a relative tolerance by shrinking one side (the ADR-033 discipline).
      if (con.target !== 0) return Math.max(Math.abs(con.target), 1e-9);
      let m = 1e-9;
      for (let i = 0; i < con.coefs.length; i++) m = Math.max(m, Math.abs(con.coefs[i]) * measureSumTerm(con, i, get));
      return m;
    }
    case 'length-product':
      return 1; // the LOG residual is dimensionless (relative error per factor) — scale-free by construction
    default:
      return 1; // angle / angle-ratio / parallel / perpendicular / coincide are scale-free (or fixed)
  }
}

export function residualTolerance(con: Constraint, scale = 1): number {
  switch (con.type) {
    case 'angle':
      return ANGLE_EPS;
    case 'distance':
    case 'equal':
    case 'ratio':
    case 'length-radius':
    case 'concyclic':
    case 'area':
    case 'area-ratio':
    case 'perimeter':
    case 'perimeter-ratio':
      return Math.max(1e-6, 2e-4 * scale);
    case 'measure-sum':
      // angle unit: scale is 1 (constraintScale) so this is the ANGLE_EPS discipline in degrees;
      // length unit: the relative length-group tolerance against the sum's own scale.
      return con.unit === 'angle' ? ANGLE_EPS : Math.max(1e-6, 2e-4 * scale);
    case 'length-product':
      // log-space: a per-factor relative-error budget of 2e-4 (the length-group discipline), summed
      // over the factor count — Σ|Δlog| ≈ Σ relative errors.
      return Math.max(1e-6, ((con.lhs.length + con.rhs.length) / 2) * 2e-4);
    case 'parallel':
    case 'perpendicular':
    case 'collinear':
      return 1e-6;
    case 'angle-ratio':
      return ANGLE_EPS;
    case 'coincide':
      return 1e-4; // a driven numeric solve won't hit exact zero — a looser "they meet"
    case 'angle-order':
      // Accept any config at least MIN_GAP past the bound: residual ≤ (MARGIN−MIN_GAP) ⇔ the angle is at
      // least MIN_GAP° on the requested side, not merely touching it.
      return ORDER_ANGLE_MARGIN_DEG - ORDER_ANGLE_MIN_GAP_DEG;
    case 'angle-bound': {
      // Same rule against the STATED bound, with the window-clamped margins (ADR-390). A two-sided
      // range sums two one-sided residuals, but only one can be positive at a time (min < max), so the
      // single-side tolerance is the right bar.
      const { margin, minGap } = boundAim(con.min, con.max, ORDER_ANGLE_MARGIN_DEG, ORDER_ANGLE_MIN_GAP_DEG);
      return margin - minGap;
    }
    case 'length-bound': {
      const { margin, minGap } = lengthBoundAim(con);
      return margin - minGap;
    }
    case 'length-order':
      return (ORDER_LEN_MARGIN_FRAC - ORDER_LEN_MIN_FRAC) * scale; // scale = the longer length (constraintScale)
    case 'collinear-order':
      return (ORDER_LEN_MARGIN_FRAC - ORDER_LEN_MIN_FRAC) * scale; // scale = the line span
  }
}

/**
 * Whether a constraint holds: its residual is within (scaled) tolerance. The single gate
 * used by the evaluator's over-constraint check AND every driven-solver accept test —
 * before this, the same `|residual| ≤ residualTolerance(constraintScale)` expression was
 * hand-recopied at four sites (ADR-045).
 */
export function isSatisfied(con: Constraint, get: (id: Id) => Vec): boolean {
  return Math.abs(residual(con, get)) <= residualTolerance(con, constraintScale(con, get));
}

/**
 * A constraint's SQUARED contribution to a JOINT driven-solve cost — the relative-residual
 * convention (ADR-033 Am.1 / ADR-045 R5), shared by `resolveFreeDriven` and `resolveMixedCarriers`.
 *
 * For the one-sided ORDER family (angle/length/collinear-order, acuteness) the residual is hinged at
 * the AIM margin (`ORDER_*_MARGIN`), but everything inside the ACCEPTANCE tolerance is a drawn-clarity
 * PREFERENCE, not a violation — so here it costs ZERO (ADR-276, issue #37). Before this, a *satisfied*
 * order's margin gradient competed at full weight with a hard equality's residual and dragged the joint
 * minimum off the equality's root (the "ישר BAE" figure: the collinear root leaves E only ~7% of |BA|
 * beyond A — inside the 12% aim margin — so the order term shifted the optimum just past collinear's
 * 1e-6 tolerance and `solutionAccepted` rejected every candidate; the step then read over-constrained).
 * Beyond the tolerance the order costs fully, so a genuinely wrong-side configuration is still pulled
 * back in. The aim margin keeps steering where it belongs: the 1-D driven path's root ORDERING (which
 * picks among discrete roots) — there is no competing equality inside a root choice.
 */
export function jointCostTerm(con: Constraint, get: (id: Id) => Vec): number {
  const sc = Math.max(constraintScale(con, get), 1e-9);
  const v = residual(con, get) / sc;
  if (isOrderConstraint(con)) {
    const tolN = residualTolerance(con, sc) / sc;
    const over = Math.max(0, Math.abs(v) - tolN);
    return over * over;
  }
  return v * v;
}

/** "40 < ∠ABC < 60" / "∠ABC > 40" / "|AB| < 5" — a bound rendered the way the student wrote it. */
function boundText(measure: string, min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) return `${min} < ${measure} < ${max}`;
  return min !== undefined ? `${measure} > ${min}` : `${measure} < ${max}`;
}

/** Human-readable form of a constraint, for error messages. */
export function describeConstraint(con: Constraint): string {
  switch (con.type) {
    case 'angle':
      return `∠${con.ray1}${con.vertex}${con.ray2} = ${con.value}°`;
    case 'distance':
      return `|${con.a}${con.b}| = ${con.value}`;
    case 'equal':
      return `|${con.a}${con.b}| = |${con.c}${con.d}|`;
    case 'ratio':
      return `|${con.a}${con.b}| = ${con.k}·|${con.c}${con.d}|${con.add ? ` ${con.add > 0 ? '+' : '−'} ${Math.abs(con.add)}` : ''}`;
    case 'length-radius':
      return `|${con.a}${con.b}| = ${con.k}·R${con.add ? ` ${con.add > 0 ? '+' : '−'} ${Math.abs(con.add)}` : ''}`;
    case 'angle-ratio':
      return `∠${con.a1}${con.v1}${con.b1} = ${con.k}·∠${con.a2}${con.v2}${con.b2}`;
    case 'parallel':
      return `${con.a}${con.b} ∥ ${con.c}${con.d}`;
    case 'perpendicular':
      return `${con.a}${con.b} ⟂ ${con.c}${con.d}`;
    case 'coincide':
      // A `~`-prefixed side is a HIDDEN helper (a re-stated placement ~P, a tangency touch ~touch-X, a
      // diameter midpoint ~diaAB — ADR-028/ADR-231/ADR-037): students never typed that id, so describe
      // the visible point against "its constructed target", not the internal name.
      return con.q.startsWith('~')
        ? `${con.p} coincides with its constructed target`
        : con.p.startsWith('~')
          ? `${con.q} coincides with its constructed target`
          : `${con.p} coincides with ${con.q}`;
    case 'angle-order':
      return `∠${con.a1}${con.v1}${con.b1} < ∠${con.a2}${con.v2}${con.b2}`;
    case 'length-order':
      return `|${con.a}${con.b}| < |${con.c}${con.d}|`;
    case 'concyclic':
      return `${con.points.join(', ')} concyclic`;
    case 'collinear':
      return `${con.a}, ${con.b}, ${con.c} collinear`;
    case 'collinear-order':
      return `${con.points.join('–')} in order on a line`;
    case 'angle-bound':
      return `${boundText(`∠${con.ray1}${con.vertex}${con.ray2}`, con.min, con.max)}`;
    case 'length-bound':
      return `${boundText(`|${con.a}${con.b}|`, con.min, con.max)}`;
    case 'area':
      return `area(${con.ids.join('')}) = ${con.value}`;
    case 'area-ratio':
      return `area(${con.ids1.join('')}) = ${con.k}·area(${con.ids2.join('')})`;
    case 'perimeter':
      return `perimeter(${con.ids.join('')}) = ${con.value}`;
    case 'perimeter-ratio':
      return `perimeter(${con.ids1.join('')}) = ${con.k}·perimeter(${con.ids2.join('')})`;
    case 'measure-sum': {
      // Reassemble the student's equation: positive-coef terms on the left, negated (RHS) terms back
      // on the right, the numeric target joining whichever side keeps everything positive.
      const term = (i: number): string => {
        const m =
          con.unit === 'length'
            ? `|${con.points[2 * i]}${con.points[2 * i + 1]}|`
            : `∠${con.points[3 * i]}${con.points[3 * i + 1]}${con.points[3 * i + 2]}`;
        const c = Math.abs(con.coefs[i]);
        return c === 1 ? m : `${c}·${m}`;
      };
      const lhs: string[] = [];
      const rhs: string[] = [];
      for (let i = 0; i < con.coefs.length; i++) (con.coefs[i] >= 0 ? lhs : rhs).push(term(i));
      if (con.target !== 0) rhs.push(`${con.target}${con.unit === 'angle' ? '°' : ''}`);
      return `${lhs.join(' + ') || '0'} = ${rhs.join(' + ') || '0'}`;
    }
    case 'length-product': {
      const side = (ids: Id[]): string => {
        const parts: string[] = [];
        for (let i = 0; i + 1 < ids.length; i += 2) parts.push(`|${ids[i]}${ids[i + 1]}|`);
        return parts.join('·') || '1';
      };
      return `${con.k === 1 ? '' : `${con.k}·`}${side(con.lhs)} = ${side(con.rhs)}`;
    }
  }
}

/**
 * All parameters t ∈ [0,1] where placing the point at a + t·(b−a) satisfies
 * its embedded constraint. 'pending' while any referenced position is not yet
 * computed (topological evaluation order). The result's length is the branch
 * count; an empty array means the constraint cannot be met on this segment.
 */
export function solvedOnSegmentCandidates(
  p: SolvedOnSegmentPoint,
  pos: Map<Id, Vec>,
): number[] | 'pending' {
  const a = pos.get(p.a);
  const b = pos.get(p.b);
  if (!a || !b) return 'pending';
  for (const id of constraintRefs(p.constraint)) {
    if (id !== p.id && !pos.has(id)) return 'pending';
  }
  const f = (t: number): number => {
    const self = add(a, scale(sub(b, a), t));
    return residual(p.constraint, (id) => (id === p.id ? self : pos.get(id)!));
  };
  // An EXTENSION point (initial t outside [0,1]) may be placed beyond the segment — search a wide
  // range around it (e.g. the ⟂ foot from C lands past D). A point on the segment proper stays in [0,1].
  const ext = p.t0 !== undefined && (p.t0 < 0 || p.t0 > 1);
  const roots = ext ? solveParam(f, Math.min(0, p.t0!) - 2, Math.max(1, p.t0!) + 2) : solveParam(f);
  // Discard a DEGENERATE root that collapses the point onto another point the constraint references
  // (e.g. "CF ⟂ DF" with F on line AD has a spurious root at F = D, where DF has no direction). The
  // residual sign-flips there, so the root finder brackets it; we drop it so the real foot is used.
  const segLen = Math.max(1, dist(a, b));
  const others = constraintRefs(p.constraint)
    .filter((id) => id !== p.id)
    .map((id) => pos.get(id))
    .filter((v): v is Vec => !!v);
  const cands = roots.filter((t) => {
    const self = add(a, scale(sub(b, a), t));
    return others.every((o) => dist(self, o) > 1e-4 * segLen);
  });
  // Order by proximity to the initial parameter so branch 0 is the solution NEAREST where
  // the point started — an extension point (t0>1, e.g. F on the continuation of CB) keeps
  // its root on the extension rather than snapping to a closer one on the segment proper.
  if (p.t0 !== undefined) cands.sort((x, y) => Math.abs(x - p.t0!) - Math.abs(y - p.t0!));
  return cands;
}

// ── Constraint identity (S0.5, docs/24 — the docs/23 two-regimes finding) ─────────────────────────
//
// Constraints have TWO identity regimes and each has one legitimate use:
//  - REFERENCE identity is the OWNERSHIP regime: a solve directive's `constraint` must be the very
//    object stored in `constraints[]`, because the orphan sweep, carrier counts, and the recruiter's
//    case-(D) comparison all key by reference. A structural clone at a directive boundary breaks
//    those paths SILENTLY — `unownedDirectiveConstraints` makes that loud.
//  - CONTENT identity is the DEDUP regime: two structurally identical constraints count once in a
//    solver's distinct-constraint list. Every content comparison goes through `constraintKey` —
//    never an inline JSON.stringify (the inline copies were the latent-bug class).

/** THE content-key for constraint dedup. Semantics: byte-stable JSON of the constraint as built
 *  (property order is stable because constraints are built by literal object syntax at one site per
 *  type). Not for ownership — see the regime note above. */
export const constraintKey = (k: Constraint): string => JSON.stringify(k);

/**
 * The interning invariant: every directive-held constraint (an object's `solve.constraint`, each
 * `solve.also` entry, and an `on-segment-solved`'s `constraint`) must be REFERENCE-present in
 * `constraints[]`. Returns the violators (empty = healthy). Locked by
 * `constraint-identity.test.ts`; run it against any new mechanism that copies or rebuilds
 * directive-bearing objects.
 */
export function unownedDirectiveConstraints(c: Construction): Constraint[] {
  const interned = new Set<Constraint>(c.constraints);
  const out: Constraint[] = [];
  const check = (k: Constraint | undefined) => {
    if (k && !interned.has(k) && !out.includes(k)) out.push(k);
  };
  for (const o of c.objects) {
    const sv = (o as { solve?: SolveDirective }).solve;
    if (sv) {
      check(sv.constraint);
      for (const k of sv.also ?? []) check(k);
    }
    if (o.kind === 'on-segment-solved') check(o.constraint);
  }
  return out;
}
