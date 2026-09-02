/**
 * GENERAL-POSITION SPREAD (#194, ADR-474) — "is this drawing legible?"
 *
 * Operator, 2026-07-17 (the Q9 session): *"if the diagram draws angles that are small (i.e. fits the
 * constraints but the segments are very close), we should look for a seed that allows a better spread."*
 * On that figure roughly half the sampled seeds place A within ~2° of the secant — every stated
 * requirement is met, and ∠ACE draws at 0.8°. The figure is right and unreadable.
 *
 * This module answers ONE question about ONE drawing, and nothing else: does every wedge the student can
 * see open by at least `minDeg`? It is a pure single-sample predicate over positions the caller already
 * has, so it can be consulted inside the existing budgeted seed sweeps without adding a search of its own.
 *
 * **It is a PREFERENCE, never a requirement.** A figure whose givens FORCE a small wedge (a stated
 * `∠ABC = 5°`, genuinely tight geometry) fails this at every seed, and every caller is written to fall
 * through to today's behaviour when nothing better exists — [ADR-052](docs/06-decisions.md#adr-052): a
 * valid configuration must stay reachable and drawable. Putting spread in `meetsRequirements` would turn
 * a drawing preference into a refusal, which is the opposite of honest.
 *
 * **The detection sample pool is deliberately NOT filtered by it** (issue #193's boundary): ground truth
 * is what holds in every VALID configuration ([ADR-256](docs/06-decisions.md#adr-256)/295), so a
 * spread-filtered pool would over-claim — reporting relations that break only in squashed-valid configs.
 * The two fixes compose: #193 makes detection robust to squashed samples in the pool, this keeps them off
 * the canvas.
 */

import type { Construction, Id, Vec } from './types';
import { figureEdges } from './relations';

/** Below this, a drawn wedge is too tight to read. The operator's ask was "6–8°"; 7° splits it. */
export const SPREAD_MIN_DEG = 7;

/**
 * Two neighbours merge into ONE ray only when they are collinear to SOLVER precision. That is the whole
 * discrimination this predicate needs, and it costs nothing:
 *
 *  - a STRUCTURALLY collinear neighbour — a `set-line` rider, an on-segment point — sits on its carrier
 *    ray to ~1e-6 rad, so it merges and contributes no wedge (there is no angle there to read);
 *  - an ACCIDENTALLY near-collinear point — Q9's A at 0.8° off the secant — does NOT merge, and its tiny
 *    wedge is exactly what we penalise.
 *
 * So the structural-vs-squashed distinction falls out of the epsilon GAP (0.05° vs 7°) for free, with no
 * statedness analysis and no second sample.
 */
const MERGE_EPS_RAD = (Math.PI / 180) * 0.05;

/** The smallest wedge angle (radians) anywhere in the drawing, or `Infinity` when there is no wedge. */
export function tightestWedge(c: Construction, positions: Map<Id, Vec>): number {
  // The universe is the DRAWN edge set the detection layer already uses — one source of truth for "what
  // the student sees" (FR-RV-6), including the collinear splits, so a rider's two half-edges are the
  // same ink the renderer draws.
  const edges = figureEdges(c, [positions]);
  const nb = new Map<Id, Id[]>();
  for (const [a, b] of edges) {
    if (!positions.has(a) || !positions.has(b)) continue;
    (nb.get(a) ?? nb.set(a, []).get(a)!).push(b);
    (nb.get(b) ?? nb.set(b, []).get(b)!).push(a);
  }
  let tightest = Infinity;
  for (const [v, list] of nb) {
    if (list.length < 2) continue;
    const p = positions.get(v)!;
    // Distinct RAY directions at this vertex, merged at solver precision (see MERGE_EPS_RAD).
    const rays: number[] = [];
    for (const w of list) {
      const q = positions.get(w)!;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (Math.hypot(dx, dy) < 1e-9) continue; // a coincident point has no direction to contribute
      const a = Math.atan2(dy, dx);
      if (!rays.some((r) => angleGap(r, a) < MERGE_EPS_RAD)) rays.push(a);
    }
    if (rays.length < 2) continue;
    rays.sort((x, y) => x - y);
    // Every adjacent pair around the vertex, including the wrap — the wedges the student actually sees.
    for (let i = 0; i < rays.length; i++) {
      const next = i + 1 < rays.length ? rays[i + 1] : rays[0] + 2 * Math.PI;
      tightest = Math.min(tightest, next - rays[i]);
    }
  }
  return tightest;
}

/** Absolute angular distance between two directions, in [0, π]. */
function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/**
 * Does this drawing keep every visible wedge open by at least `minDeg`? A figure with no wedge at all
 * (a lone circle, two disjoint points) is trivially well spread — there is nothing to squash.
 */
export function wellSpread(c: Construction, positions: Map<Id, Vec>, minDeg = SPREAD_MIN_DEG): boolean {
  return tightestWedge(c, positions) >= (Math.PI / 180) * minDeg;
}
