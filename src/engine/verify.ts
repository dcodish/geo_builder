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

import type { Command, Id, Vec } from './types';
import type { ResolvedCircle } from './evaluate';
import { dist } from './geometry';

export interface GivenViolation {
  relation: 'on-circle' | 'tangent';
  ids: Id[];
  /** Human-readable, e.g. "E should lie on circle-P (radius 3.60) but is 7.42 from its centre". */
  message: string;
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

  return violations;
}
