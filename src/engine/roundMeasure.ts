/**
 * The AREA and BOUNDARY-LENGTH of a measure operand — a polygon ring OR a round figure
 * ([ADR-632](../../docs/06-decisions.md#adr-632), issue #172).
 *
 * ADR-118 made area a measure over a POLYGON (`polygonArea`, shoelace) and ADR-228 gave the polygon its
 * perimeter. A sector's area (½·θ·r²) and an arc's length (θ·r) are the same two measures over a different
 * operand, so they ride the SAME constraints (`area`/`area-ratio`/`perimeter`/`perimeter-ratio`), the same
 * `driveOrCheck`, verifier and labels — every consumer asks this module what the operand measures instead of
 * calling the polygon formula itself. That is the seam, and it is the only place the formulas live.
 *
 * Which arc between the two ends is meant is NOT re-decided here: it is the drawn arc's identity
 * (`spanDeg`/`minor`, ADR-356/357), resolved by the one shared {@link orientArc} — so the sector whose area is
 * stated is exactly the sector on the canvas, a reflex one included.
 */
import { orientArc } from './arcs';
import { dist, polygonArea, polygonPerimeter } from './geometry';
import type { RoundOperand, Vec } from './types';

/** The swept central angle θ (radians, in (0, 2π]) and the radius of a round operand at `pts`. */
export function roundSweep(pts: Vec[], round: RoundOperand): { theta: number; r: number } | null {
  const [c, p, q] = pts;
  if (!c || !p) return null;
  const r = dist(c, p);
  if (round.whole) return { theta: 2 * Math.PI, r };
  if (!q) return null;
  const or = orientArc(c, p, q, { spanDeg: round.spanDeg, minor: round.minor });
  return or ? { theta: Math.abs(or.sweepAng), r } : { theta: 0, r };
}

/** Area of the operand: the polygon's shoelace area, or the sector's ½·θ·r² (a whole disc: π·r²). */
export function operandArea(pts: Vec[], round?: RoundOperand): number {
  if (!round) return polygonArea(pts);
  const s = roundSweep(pts, round);
  return s ? 0.5 * s.theta * s.r * s.r : 0;
}

/** Boundary length of the operand: the polygon's perimeter, or the arc's θ·r (a whole circle: 2π·r). */
export function operandBoundary(pts: Vec[], round?: RoundOperand): number {
  if (!round) return polygonPerimeter(pts);
  const s = roundSweep(pts, round);
  return s ? s.theta * s.r : 0;
}

/** The operand's name in an engine message: the polygon's letters, or «sector AOB» / «circle O». */
export function operandText(ids: readonly string[], round?: RoundOperand): string {
  const shown = ids.map((id) => id.replace(/^@ctr-/, ''));
  if (!round) return shown.join('');
  return round.whole ? `circle ${shown[0]}` : `sector ${shown[1]}${shown[0]}${shown[2] ?? ''}`;
}
