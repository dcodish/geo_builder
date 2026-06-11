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
    case 'parallel':
    case 'perpendicular':
      return [con.a, con.b, con.c, con.d];
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
    case 'parallel': {
      const u = unit(sub(get(con.b), get(con.a)));
      const v = unit(sub(get(con.d), get(con.c)));
      return u.x * v.y - u.y * v.x; // sin∠ → 0 when ∥
    }
    case 'perpendicular': {
      const u = unit(sub(get(con.b), get(con.a)));
      const v = unit(sub(get(con.d), get(con.c)));
      return u.x * v.x + u.y * v.y; // cos∠ → 0 when ⟂
    }
  }
}

/** Tolerance for "is this constraint satisfied?" — degrees for angle, units for length, sin/cos for ∥/⟂. */
export function residualTolerance(con: Constraint): number {
  switch (con.type) {
    case 'angle':
      return ANGLE_EPS;
    case 'distance':
    case 'equal':
      return 1e-6;
    case 'parallel':
    case 'perpendicular':
      return 1e-6;
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
    case 'parallel':
      return `${con.a}${con.b} ∥ ${con.c}${con.d}`;
    case 'perpendicular':
      return `${con.a}${con.b} ⟂ ${con.c}${con.d}`;
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
  return solveParam(f);
}
