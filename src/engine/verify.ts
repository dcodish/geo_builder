/**
 * Givens verifier — "does the final figure actually satisfy the problem?"
 *
 * A green run only means every step APPLIED without error. It does NOT mean the drawing honours
 * the relations the input stated: a fact can be silently dropped (a re-definition that no-ops), or
 * a solver can converge to a point that drifts off where it belongs. This module re-derives the
 * relations a command stream ASSERTS — from the ORIGINAL input, independent of how each object was
 * constructed — and checks them against the final coordinates. A non-empty result is a figure that
 * looks clean but does not match its givens, and should be surfaced (not shown as a silent green).
 *
 * First slice: on-circle membership (the class behind the "E not on the circle" bug) and a tangent's
 * tangency point. Expandable to constraint residuals (distance/angle/parallel/⟂) and collinearity.
 */

import type { Command, Constraint, Id, Vec } from './types';
import type { ResolvedCircle } from './evaluate';
import { dist } from './geometry';
import { constraintRefs, describeConstraint, isSatisfied, residual } from './solve';

export interface GivenViolation {
  /** The kind of relation that doesn't hold — an on-circle/tangent incidence, or any constraint type. */
  relation: 'on-circle' | 'tangent' | Constraint['type'];
  ids: Id[];
  /** Human-readable, e.g. "E should lie on circle-P (radius 3.60) but is 7.42 from its centre". */
  message: string;
}

/**
 * Re-derive the metric / incidence RELATIONS a command stream asserts — independent of how the engine
 * built each object — as plain {@link Constraint}s, so they can be checked against the final coordinates.
 * This is the [ADR-053](docs/06-decisions.md#adr-053) principle applied beyond on-circle membership: a
 * `set-distance`/`set-angle`/`set-parallel`/… command states a relation the FIGURE must honour, and a
 * silently-dropped or drifted one is caught here even when every step reported `ok`. The mapping mirrors
 * how `applyCommand` builds the same constraint, so it stays a faithful re-derivation, not a new model.
 *
 * The SOFT one-sided ORDER constraints (`set-angle-order`/`set-length-order`/`set-line`'s ordering) are
 * deliberately NOT re-derived as hard violations — they SELECT a configuration (a "visibly smaller" gap),
 * and a marginal-but-valid gap should not read as "the figure is wrong". `set-line`'s COLLINEARITY (the
 * hard part) is checked separately below.
 */
function assertedRelations(commands: Command[]): Constraint[] {
  const out: Constraint[] = [];
  for (const c of commands) {
    switch (c.type) {
      case 'set-angle': out.push({ type: 'angle', vertex: c.vertex, ray1: c.ray1, ray2: c.ray2, value: c.value }); break;
      case 'set-distance': out.push({ type: 'distance', a: c.a, b: c.b, value: c.value }); break;
      case 'set-equal': out.push({ type: 'equal', a: c.a, b: c.b, c: c.c, d: c.d }); break;
      case 'set-ratio': out.push({ type: 'ratio', a: c.a, b: c.b, c: c.c, d: c.d, k: c.k, add: c.add }); break;
      case 'set-length-radius': out.push({ type: 'length-radius', a: c.a, b: c.b, circle: c.circle, center: c.center, witness: c.witness, k: c.k, add: c.add }); break;
      case 'set-angle-ratio': out.push({ type: 'angle-ratio', v1: c.v1, a1: c.a1, b1: c.b1, v2: c.v2, a2: c.a2, b2: c.b2, k: c.k }); break;
      case 'set-parallel': out.push({ type: 'parallel', a: c.a, b: c.b, c: c.c, d: c.d }); break;
      case 'set-perpendicular': out.push({ type: 'perpendicular', a: c.a, b: c.b, c: c.c, d: c.d }); break;
      case 'set-concyclic': out.push({ type: 'concyclic', points: c.points }); break;
      case 'set-collinear': out.push({ type: 'collinear', a: c.a, b: c.b, c: c.c }); break;
    }
  }
  return out;
}

/** Every "point lies on circle" relation a command stream asserts — regardless of how it's built. */
function onCircleRefs(commands: Command[]): { point: Id; circle: Id }[] {
  const out: { point: Id; circle: Id }[] = [];
  for (const c of commands) {
    switch (c.type) {
      case 'point-on-circle':
      case 'line-circle-intersection':
      case 'arc-midpoint':
        out.push({ point: c.id, circle: c.circle });
        break;
      case 'circle-circle-intersection':
        out.push({ point: c.id, circle: c.circle1 }, { point: c.id, circle: c.circle2 });
        break;
      case 'diameter':
        out.push({ point: c.id1, circle: c.circle }, { point: c.id2, circle: c.circle });
        break;
      case 'circumcircle':
        out.push({ point: c.a, circle: c.id }, { point: c.b, circle: c.id }, { point: c.c, circle: c.id });
        break;
    }
  }
  return out;
}

/** Absolute tolerance for "on the circle", scaled to the radius (2%, with a small floor). */
const onCircleTol = (r: number) => Math.max(0.05, r * 0.02);

/** Friendly circle name for messages: `circle-P` → `circle P`. */
const circleLabel = (id: Id) => id.replace(/^circle-/, 'circle ');

/**
 * Check the figure's final coordinates against the relations its commands ASSERT. Returns the
 * relations that DON'T hold (empty = the drawing matches every stated given).
 */
export function checkGivens(
  commands: Command[],
  positions: Map<Id, Vec>,
  circles: Map<Id, ResolvedCircle>,
): GivenViolation[] {
  const violations: GivenViolation[] = [];

  const seen = new Set<string>();
  for (const { point, circle } of onCircleRefs(commands)) {
    const key = `${point}@${circle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = circles.get(circle);
    const p = positions.get(point);
    if (!c || !p) continue; // pending / not placed — a different failure mode, not an on-circle miss
    const d = dist(p, c.center);
    if (Math.abs(d - c.r) > onCircleTol(c.r)) {
      violations.push({
        relation: 'on-circle',
        ids: [point, circle],
        message: `${point} should lie on ${circleLabel(circle)} (radius ${c.r.toFixed(2)}) but is ${d.toFixed(2)} from its centre`,
      });
    }
  }

  for (const cmd of commands) {
    if (cmd.type !== 'tangent') continue;
    const c = circles.get(cmd.circle);
    const at = positions.get(cmd.at);
    if (!c || !at) continue;
    const d = dist(at, c.center);
    if (Math.abs(d - c.r) > onCircleTol(c.r)) {
      violations.push({
        relation: 'tangent',
        ids: [cmd.at, cmd.circle],
        message: `tangency point ${cmd.at} should lie on ${circleLabel(cmd.circle)} (radius ${c.r.toFixed(2)}) but is ${d.toFixed(2)} from its centre`,
      });
    }
  }

  // Every metric / incidence relation the commands assert (distance, angle, equal, ratio, ∥, ⟂, collinear,
  // concyclic, …) — checked against the final coordinates with the engine's own `isSatisfied` tolerance,
  // so a relation the solver accepted passes and only a genuinely-off (silently dropped, mis-built, or
  // later-perturbed) one is flagged. (ADR-053, extended past on-circle membership.)
  for (const con of assertedRelations(commands)) {
    const refs = constraintRefs(con);
    if (refs.some((id) => !positions.has(id))) continue; // a ref isn't placed — a different failure mode
    const get = (id: Id) => positions.get(id)!;
    const r = residual(con, get);
    if (!Number.isFinite(r)) continue; // a degenerate config (collapsed ray/circle) — NaN, not a measurable miss
    if (!isSatisfied(con, get)) {
      violations.push({ relation: con.type, ids: refs, message: `${describeConstraint(con)} does not hold in the final figure` });
    }
  }

  // `line ABE…` (`set-line`) asserts the named points are COLLINEAR (its ordering is a soft selector,
  // not re-checked). Flag an interior point that sits clearly off the line through the two ends.
  for (const cmd of commands) {
    if (cmd.type !== 'set-line') continue;
    const pts = cmd.points;
    if (pts.some((id) => !positions.has(id))) continue;
    const p0 = positions.get(pts[0])!;
    const pn = positions.get(pts[pts.length - 1])!;
    const span = dist(p0, pn);
    if (span < 1e-9) continue;
    for (let i = 1; i < pts.length - 1; i++) {
      const pi = positions.get(pts[i])!;
      const offset = Math.abs((pi.x - p0.x) * (pn.y - p0.y) - (pi.y - p0.y) * (pn.x - p0.x)) / span;
      if (offset > Math.max(0.05, 0.02 * span)) {
        violations.push({
          relation: 'collinear',
          ids: pts,
          message: `${pts.join('–')} should be collinear, but ${pts[i]} is ${offset.toFixed(2)} off the line`,
        });
      }
    }
  }

  return violations;
}
