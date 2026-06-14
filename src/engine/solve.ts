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

import type { Constraint, Id, SolvedOnSegmentPoint, Vec } from './types';
import { ANGLE_EPS } from './types';
import { add, angleDeg, dist, scale, solveParam, sub, unit } from './geometry';

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
    case 'angle-ratio':
      return [con.v1, con.a1, con.b1, con.v2, con.a2, con.b2];
    case 'coincide':
      return [con.p, con.q];
  }
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
      return Math.max(1e-6, 2e-4 * scale);
    case 'parallel':
    case 'perpendicular':
      return 1e-6;
    case 'angle-ratio':
      return ANGLE_EPS;
    case 'coincide':
      return 1e-4; // a driven numeric solve won't hit exact zero — a looser "they meet"
  }
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
    case 'angle-ratio':
      return `∠${con.a1}${con.v1}${con.b1} = ${con.k}·∠${con.a2}${con.v2}${con.b2}`;
    case 'parallel':
      return `${con.a}${con.b} ∥ ${con.c}${con.d}`;
    case 'perpendicular':
      return `${con.a}${con.b} ⟂ ${con.c}${con.d}`;
    case 'coincide':
      return `${con.p} coincides with ${con.q}`;
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
  return roots.filter((t) => {
    const self = add(a, scale(sub(b, a), t));
    return others.every((o) => dist(self, o) > 1e-4 * segLen);
  });
}
