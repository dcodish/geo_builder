/**
 * #723 — ONE display formatter, every tool. The operator's ruling, playing B5: *"decimal points, only two
 * numbers after the point. This is a rule that should be for all of the tools we have."*
 *
 * The lock is not "this product happens to round to 2" — it is that its value surface ROUTES THROUGH the
 * shared chokepoint, so the next precision decision is made once instead of once per tool. A private
 * rounder that agrees today is exactly what this catches, which is why the cases are the ones where two
 * plausible rounders DISAGREE (half-way values, negative zero, long tails) rather than round numbers.
 *
 * The lock is PER PRODUCT by necessity as well as by design: a single cross-product test would have to
 * live in `shell/` and import the products, and `shell → src` / `shell → src3d` are forbidden edges
 * (BOUNDARIES.json). The shared half — `fmtNum` itself — is locked in `shell/__tests__/display-format`.
 */
// values with NO exact form in any product's tiers, so what is compared is the decimal fallback itself
const TAILS = [5.130102354, 254.410193, 9.30000001, -0.0004, 2.6749999, 1.0049999, -3.14159265];

import { describe, expect, it } from 'vitest';
import { fmtNum } from '../../shell/format';
import { formatMeasure, formatAngle } from '../format';

describe('#723 — 2-D measures render through the shared formatter', () => {
  it('every value agrees with the chokepoint, digit for digit', () => {
    for (const x of TAILS) expect(formatMeasure(x), String(x)).toBe(fmtNum(x));
  });

  it("what stays 2-D's own: the non-finite dash and the degree sign", () => {
    expect(formatMeasure(Number.NaN)).toBe('—');
    expect(formatMeasure(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatAngle(37.129)).toBe(`${fmtNum(37.129)}°`);
  });
});
