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
import { cleanNum, cleanMag } from '../engine/dataView';

describe('#723 — 3-D panel and query values render through the shared formatter', () => {
  it("the decimal fallback IS the chokepoint (tol tightened so 3-D's exact tiers stand aside)", () => {
    for (const x of TAILS) expect(cleanNum(x, 1e-9), String(x)).toBe(fmtNum(x));
  });

  it("what stays 3-D's own: the exact tiers ABOVE the fallback are untouched by the rule", () => {
    expect(cleanNum(4)).toBe('4');
    expect(cleanNum(0.5)).toBe('1/2');
    expect(cleanNum(0.125)).toBe('1/8');
    expect(cleanMag(Math.SQRT2)).toBe('√2');
  });

  it('a surface may still ask for more places — the canvas does (#491), pending the #723 ruling', () => {
    expect(cleanMag(-0.5862, 3)).toBe(fmtNum(-0.5862, 3));
  });
});
