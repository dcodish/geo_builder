/**
 * THE VALUE CYCLE — what `wⁿ` does, drawn as the finite thing it is.
 *
 * Four of the eleven re-read exams ask something of the form «prove w^(4n) is real for every n», «z^(6n)
 * takes only two values», «find the minimal n such that wⁿ is pure imaginary». Every one of them is the
 * same picture: when `|w| = 1` and `arg w` is a rational part of a turn, the powers of `w` visit a
 * **finite ring of directions and then start again**. Print that ring and the ask stops being an
 * exercise in congruences and becomes something the student can count.
 *
 * The eligibility test is exact and it has to be
 * ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006) D1): `period` comes from the reduced
 * denominator of the angle's turns, so `cis 60°` cycles with period 6 and a *sampled* 59.9999° has no
 * period at all. A float would answer this question wrong with complete confidence, which is why the
 * decision is asked of the exact carrier in `derive2` and only the drawing happens here.
 */

import type { Cx } from '../value/value';
import type { DerivedPoint } from '../replay/derive2';

export interface SceneCycle {
  readonly name: string;
  /** how many powers before the cycle returns — `cis72°` has period 5 */
  readonly period: number;
  /** `z¹ … z^period`, in order; the last is 1, which is where the return arrow points */
  readonly powers: readonly Cx[];
  /** which power the `n` stepper is sitting on — an index into `powers` */
  readonly current: number;
  /** the ring the whole cycle sits on: modulus 1 by construction, kept for the renderer */
  readonly radius: number;
  readonly known: boolean;
}

/**
 * Past this many steps the ring stops being countable and becomes a circle of dots.
 *
 * A cycle of period 360 is arithmetically true and pedagogically worthless; the point is still drawn
 * with its reading, so nothing is hidden — only this extra picture is withheld. The corpus's periods
 * are 2, 3, 4, 5, 6, 8 and 12.
 */
export const MAX_DRAWN_PERIOD = 24;

/**
 * The cycles of every eligible number, with the stepper's current power marked.
 *
 * `n` is DISPLAY STATE (ADR-CX-001 D3): it arrives as an argument, it is never stored, it never
 * reaches the parser or the engine, and stepping it cannot change the figure — only which power of the
 * cycle is highlighted.
 */
export function cyclesOf(points: readonly DerivedPoint[], n = 1): SceneCycle[] {
  const out: SceneCycle[] = [];
  for (const p of points) {
    const period = p.cyclePeriod;
    if (period === null || period < 2 || period > MAX_DRAWN_PERIOD) continue;
    const powers: Cx[] = [];
    for (let k = 1; k <= period; k++) {
      const deg = (p.argumentDeg * k) % 360;
      const rad = (deg * Math.PI) / 180;
      powers.push({ re: Math.cos(rad), im: Math.sin(rad) });
    }
    out.push({
      name: p.name,
      period,
      powers,
      // n counts powers from 1, and n = period + 1 is n = 1 again — that IS the cycle
      current: (((Math.round(n) - 1) % period) + period) % period,
      radius: 1,
      known: p.modulusKnown && p.argumentKnown,
    });
  }
  return out;
}
