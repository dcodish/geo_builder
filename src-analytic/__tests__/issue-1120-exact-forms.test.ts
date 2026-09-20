/**
 * #1120 — A STATED EXACT VALUE IS DISPLAYED IN ITS EXACT FORM. Operator ruling, 2026-09-16:
 * **"exact forms"**.
 *
 * *"in the data panel, the slope of 4/3 is written as 1.33 which is wrong"* — and *wrong* is the right
 * word rather than *imprecise*: in analytic geometry the slope of that line **is** 4/3, and `1.33` is a
 * different number the panel was stating as the value.
 *
 * ## What this file has to pin, and why both directions matter
 *
 * The exact form is RECOGNISED from the float, as both sibling trees that print exact forms do — the
 * exactness of `4/3` lives in the equation the student typed, several layers above the `number` that
 * reaches display. Recognition is only honest while it stays recognition:
 *
 *  - `4/3` must print as `4/3` — the reported case;
 *  - **`1.3333` typed by a student must stay `1.3333`-rounded**, not be dressed as `4/3`. With a loose
 *    enough tolerance or a large enough denominator every float is "rational", and the tier becomes the
 *    lie the issue warned against.
 *
 * The second is the one that keeps this feature honest, and it is asserted first-class.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { fmtAnalytic, fractionText } from '../format';

describe('#1120 — the reported case, through the real ask lane', () => {
  it('the slope of y=(4/3)x reads 4/3, not 1.33', () => {
    const d = derive(['A(0,0)', 'B(3,4)', 'משוואת הישר AB היא y=(4/3)x'], 0);
    expect(d.faults).toEqual([]);
    for (const q of ['שיפוע הישר AB', 'שיפוע AB']) {
      expect(ask(d, q, fmtAnalytic).value, q).toBe('4/3');
    }
  });

  it('a whole-number answer on the same figure is untouched', () => {
    const d = derive(['A(0,0)', 'B(3,4)', 'משוואת הישר AB היא y=(4/3)x'], 0);
    expect(ask(d, 'AB', fmtAnalytic).value).toBe('5');
  });
});

describe('#1120 — the tier itself', () => {
  it('prints the small rationals an exam actually uses', () => {
    expect(fmtAnalytic(4 / 3)).toBe('4/3');
    expect(fmtAnalytic(-4 / 3)).toBe('-4/3');
    expect(fmtAnalytic(1 / 2)).toBe('1/2');
    expect(fmtAnalytic(1 / 3)).toBe('1/3');
    expect(fmtAnalytic(3 / 4)).toBe('3/4');
  });

  it('leaves integers, and zero, exactly as they were', () => {
    expect(fmtAnalytic(0)).toBe('0');
    expect(fmtAnalytic(5)).toBe('5');
    expect(fmtAnalytic(-2)).toBe('-2');
    // The sub-epsilon clamp the old `fmt` carried, kept: a derived point on an axis reads 0, not -0.
    expect(fmtAnalytic(-1e-17)).toBe('0');
  });

  /**
   * THE COUNTER-DIRECTION — the assertion that separates recognition from invention.
   *
   * A decimal the student typed is their number, and dressing it up as a nearby fraction would be the
   * tool asserting a value they did not give. The tolerance is relative and the denominator is capped
   * at 12, so the two are far apart.
   */
  it('a value that merely LOOKS rational is left alone', () => {
    expect(fmtAnalytic(1.3333)).toBe('1.33'); // NOT 4/3
    expect(fmtAnalytic(7.34)).toBe('7.34');
    expect(fmtAnalytic(0.334)).toBe('0.33'); // NOT 1/3
    // No surd tier in this tree (no witness in the corpus yet) — √2 falls to the decimal, honestly.
    expect(fmtAnalytic(Math.SQRT2)).toBe('1.41');
    // π is not 22/7, and must not be printed as it.
    expect(fmtAnalytic(Math.PI)).toBe('3.14');
  });

  it('fractionText answers only about fractions', () => {
    expect(fractionText(4 / 3)).toBe('4/3');
    expect(fractionText(3)).toBeNull(); // an integer is not a fraction
    expect(fractionText(0)).toBeNull();
    expect(fractionText(1.3333)).toBeNull();
    // A denominator that reduces away is an integer after all.
    expect(fractionText(6 / 3)).toBeNull();
  });

  /**
   * The tier is above the SHARED fallback, never a replacement for it — `shell/format.ts` still owns
   * every decimal expansion, which is #723's chokepoint ruling. A value with no exact form must come
   * back with exactly the digits the house formatter would have produced.
   */
  it('anything without an exact form falls through to the house formatter unchanged', () => {
    for (const v of [7.34, 1.3333, Math.SQRT2, Math.PI, 123.456, -0.017]) {
      expect(fmtAnalytic(v)).toBe(fmtAnalytic(v));
      expect(fractionText(v)).toBeNull();
    }
  });
});
