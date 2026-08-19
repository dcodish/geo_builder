/**
 * #723 — the shared display formatter itself. Each product locks its own routing through this
 * (`src/__tests__/display-format.test.ts`, `src3d/__tests__/display-format.test.ts`); a single
 * cross-product test cannot live here, because `shell → src` and `shell → src3d` are forbidden edges.
 */
import { describe, expect, it } from 'vitest';
import { DISPLAY_DECIMALS, fmtNum } from '../format';

describe('#723 — the display-number chokepoint', () => {
  it('the house precision is two decimals', () => {
    expect(DISPLAY_DECIMALS).toBe(2);
    expect(fmtNum(5.130102354)).toBe('5.13');
    expect(fmtNum(254.410193)).toBe('254.41');
  });

  it('never «-0», and trailing zeros are trimmed', () => {
    expect(fmtNum(-0.0004)).toBe('0');
    expect(fmtNum(7)).toBe('7');
    expect(fmtNum(7.5)).toBe('7.5');
  });

  it('a DISPLAY rule only — the model keeps full precision', () => {
    const x = 2.1213203435596424;
    expect(fmtNum(x)).toBe('2.12');
    expect(x).toBe(2.1213203435596424);
  });

  it('a surface may ask for more places — the ceiling is a ruling, not a signature (#491)', () => {
    expect(fmtNum(-0.5862, 3)).toBe('-0.586');
  });
});
