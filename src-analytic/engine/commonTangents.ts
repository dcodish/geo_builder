/**
 * THE COMMON TANGENTS OF TWO CIRCLES, IN CLOSED FORM (#2390, [ADR-AG-314](../../docs/06c-decisions-analytic.md#adr-ag-314)).
 *
 * A common tangent is a line at signed distance r₁ from the first centre and ±r₂ from the second. With d the distance
 * between the centres, u the unit vector from the first to the second and u⊥ its left normal, the line's unit normal is
 *
 *   n = k·u + s·√(1 − k²)·u⊥,   k = (r₂ − r₁)/d (the EXTERNAL pair, both centres on one side)
 *                               k = −(r₁ + r₂)/d (the INTERNAL pair, the centres on opposite sides)
 *
 * and the line is n·X + c = 0 with c = r₁ − n·C₁. Family `a` is the tangent lying on the LEFT of the directed line of
 * centres (s = −1), `b` the one on the right: a side that stays put as the configuration moves. A TANGENT pair has one double root — |k| = 1 for the internal
 * pair of externally tangent circles, for the external pair of internally tangent ones — the `touch` family.
 *
 * Arithmetic on the numeric circles of one configuration: no CAS, no solve (src-analytic/CLAUDE.md). A family the
 * configuration does not have (|k| > 1, beyond the tolerance) is `null`, a vacancy, never a guess.
 */
import { normalizedLine } from './lines';
import type { CommonTangentFamily, NumCurve } from './types';

type Circle = Extract<NumCurve, { kind: 'circle' }>;
type Line = Extract<NumCurve, { kind: 'line' }>;

/**
 * How close |k| must come to 1 to be the double root — relative, as the crossings' identity tolerance is (#1235): a
 * tangency the solve meets to ~1e-9 is ONE line, never two lines a hair apart or none.
 */
export const TOUCH_TOLERANCE = 1e-6;

/** The line of `family` tangent to both circles, normalized to leading coefficient 1 (the panel's one triple). */
export function commonTangentLine(p: Circle, q: Circle, family: CommonTangentFamily): Line | null {
  const dx = q.cx - p.cx;
  const dy = q.cy - p.cy;
  const d = Math.hypot(dx, dy);
  if (!(d > TOUCH_TOLERANCE * Math.max(1, p.r, q.r))) return null; // concentric: no common tangent at all
  const u = { x: dx / d, y: dy / d };
  const w = { x: -u.y, y: u.x };
  const kExt = (q.r - p.r) / d;
  const kInt = -(p.r + q.r) / d;
  let k: number;
  let s: number;
  if (family === 'touch') {
    k = Math.abs(Math.abs(kInt) - 1) <= Math.abs(Math.abs(kExt) - 1) ? kInt : kExt;
    if (Math.abs(Math.abs(k) - 1) > TOUCH_TOLERANCE) return null;
    s = 0;
  } else {
    k = family.startsWith('ext') ? kExt : kInt;
    // `a` is the tangent on the LEFT of the directed line of centres: its normal leans right (the centres lie on +n).
    s = family.endsWith('-a') ? -1 : 1;
  }
  const disc = 1 - k * k;
  if (disc < -TOUCH_TOLERANCE) return null;
  const root = Math.sqrt(Math.max(0, disc));
  const nx = k * u.x + s * root * w.x;
  const ny = k * u.y + s * root * w.y;
  const c = p.r - (nx * p.cx + ny * p.cy);
  // `lines.ts`'s normal form (leading coefficient 1), so one line prints one way.
  const n = normalizedLine(nx, ny, c);
  return n ? { kind: 'line', ...n } : null;
}

/** How two circles sit — the answer `pairPositionOf` (M1) reads off the construction. */
export type PairPosition = 'apart' | 'ext-tangent' | 'cross' | 'int-tangent' | 'inside';

/** The families a position has, in naming order: the external pair first (#2390's ruled pattern). */
export const FAMILIES_OF: Readonly<Record<Exclude<PairPosition, 'inside'>, readonly CommonTangentFamily[]>> = {
  apart: ['ext-a', 'ext-b', 'int-a', 'int-b'],
  'ext-tangent': ['ext-a', 'ext-b', 'touch'],
  cross: ['ext-a', 'ext-b'],
  'int-tangent': ['touch'],
};

/** How two placed circles sit, at a relative tolerance — for circles whose centres and radii are constants. */
export function positionOfCircles(p: Circle, q: Circle): PairPosition {
  const d = Math.hypot(q.cx - p.cx, q.cy - p.cy);
  const tol = 1e-9 * Math.max(1, p.r, q.r, d);
  const sum = p.r + q.r;
  const diff = Math.abs(p.r - q.r);
  if (Math.abs(d - sum) <= tol) return 'ext-tangent';
  if (d > sum) return 'apart';
  if (Math.abs(d - diff) <= tol && diff > tol) return 'int-tangent';
  if (d < diff) return 'inside';
  return diff <= tol && d <= tol ? 'inside' : 'cross';
}
