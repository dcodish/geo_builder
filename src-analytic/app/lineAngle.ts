/**
 * THE ANGLE A LINE MAKES WITH THE POSITIVE x-AXIS (#1322) — one decision, for the panel row and the ask.
 *
 * Operator, 2026-09-21, reading the 572 question: *"we should add to line properties the tan of the
 * slope (m = tan α)"*; ruled 2026-09-24: the panel row AND the question. Part (ב) of that exam asks
 * «מצא את הזווית שבין הישר … ובין הכיוון החיובי של ציר ה-x», and `m = tan α` is the identity it turns on.
 *
 * Three things were decided rather than assumed (the issue's own list):
 *
 * 1. **The angle is in [0°, 180°)**, so a negative slope reads OBTUSE (y = −x → 135°), the way the exam
 *    expects, never as a negative angle.
 * 2. **A vertical line is 90°.** It has no slope (#1078), and it is the one case where the angle says MORE
 *    than the slope row does.
 * 3. **It is gated like every printed number**: the value prints only when it is the same in every
 *    configuration (`isKnowledge`), and never from one seed's sample (#1020's class).
 *
 * The panel reads a drawn segment's direction and the ask reads a named line's, but both go through
 * {@link lineAngleOf}, so the two surfaces cannot disagree about the answer, its vertical case, or when it
 * is unknown (ADR-W-053).
 */
import { fmtNum } from '../../shell/format';
import { isKnowledge, type Figure } from '../engine/evaluate';
import { isVertical } from '../engine/lines';
import type { Construction } from '../engine/types';

/** A direction in one configuration: what a caller reads off a figure. */
export type DirectionReader = (f: Figure) => { dx: number; dy: number } | null;

/** The angle, in degrees in [0, 180), of one direction. Both ends of the fold snap to 0, so a horizontal line never flickers between 0 and 180. */
export function angleWithXAxis(dx: number, dy: number): number {
  if (isVertical(dx, dy)) return 90;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const folded = ((deg % 180) + 180) % 180;
  return folded < 1e-9 || 180 - folded < 1e-9 ? 0 : folded;
}

/** The angle as KNOWLEDGE: a number only when every valid configuration agrees on it. */
export function lineAngleOf(c: Construction, read: DirectionReader): { known: true; deg: number } | { known: false } {
  const k = isKnowledge(c, (f) => {
    const v = read(f);
    return v === null ? null : angleWithXAxis(v.dx, v.dy);
  });
  return k.known ? { known: true, deg: k.value } : { known: false };
}

/** The one spelling of an angle on screen — two decimals (#723), with the degree sign. */
export const angleText = (deg: number): string => `${fmtNum(deg)}°`;
