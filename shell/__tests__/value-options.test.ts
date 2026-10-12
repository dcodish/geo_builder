/**
 * #1867 (ADR-634) — the one cross-builder rule for a quantity's values: one value; «±a» for opposites; «a או x = b»
 * otherwise, ascending; nothing for three or more (operator rulings B12, #1861, W1).
 */
import { describe, expect, it } from 'vitest';
import { realValueOptions, valueOptionsOf, valueOptionsText, type OptionAlgebra } from '../valueOptions';

const fmt = (v: number) => String(Math.round(v * 100) / 100);
const text = (values: number[], label?: string) => {
  const o = realValueOptions(values);
  return o ? valueOptionsText(o, fmt, { or: 'או', ...(label ? { label } : {}) }) : null;
};

describe('#1867 — classification', () => {
  it('one value (duplicates fold)', () => {
    expect(realValueOptions([3, 3, 3 + 1e-9])).toEqual({ kind: 'one', value: 3 });
  });
  it('two values, ascending whatever the input order', () => {
    expect(realValueOptions([4, -2, 4])).toEqual({ kind: 'two', values: [-2, 4] });
  });
  it('a pair of opposites keeps the positive member', () => {
    expect(realValueOptions([Math.SQRT2, -Math.SQRT2])).toEqual({ kind: 'opposites', value: Math.SQRT2 });
  });
  it('three or more, or none, classify as nothing (#1861)', () => {
    expect(realValueOptions([0, 4, -2])).toBeNull();
    expect(realValueOptions([])).toBeNull();
  });
  it('the tolerance is the caller\'s', () => {
    expect(realValueOptions([1, 1.00005], 1e-4)).toEqual({ kind: 'one', value: 1 });
    expect(realValueOptions([1, 1.00005], 1e-6)?.kind).toBe('two');
  });
  it('any value type, through its own algebra', () => {
    type P = [number, number];
    const alg: OptionAlgebra<P> = {
      same: (a, b) => a[0] === b[0] && a[1] === b[1],
      opposite: (a, b) => a[0] === -b[0] && a[1] === -b[1],
      compare: (a, b) => a[0] - b[0] || a[1] - b[1],
    };
    expect(valueOptionsOf<P>([[1, 2], [-1, -2]], alg)).toEqual({ kind: 'opposites', value: [1, 2] });
    expect(valueOptionsOf<P>([[3, 0], [1, 2]], alg)).toEqual({ kind: 'two', values: [[1, 2], [3, 0]] });
  });
});

describe('#1867 — the W1 spelling', () => {
  it('«x = ±a» when opposites', () => {
    expect(`m = ${text([2, -2], 'm')}`).toBe('m = ±2');
  });
  it('«x = a או x = b» otherwise', () => {
    expect(`m = ${text([4, -2], 'm')}`).toBe('m = -2 או m = 4');
  });
  it('a row with no «name =» shape joins the bare values', () => {
    expect(text([4, -2])).toBe('-2 או 4');
  });
  it('one value prints as itself; three print nothing', () => {
    expect(text([7], 'm')).toBe('7');
    expect(text([1, 2, 3], 'm')).toBeNull();
  });
  it('two values that print alike are not two answers', () => {
    expect(text([1.001, 1.002])).toBeNull();
  });
  it('a compound ± operand is wrapped by the caller', () => {
    const o = realValueOptions([-5, 5])!;
    expect(valueOptionsText(o, () => '2+3i', { or: 'או', pmOperand: (s) => `(${s})` })).toBe('±(2+3i)');
  });
});
