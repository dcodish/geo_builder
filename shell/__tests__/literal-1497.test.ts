/**
 * #1497 (ADR-W-179) — A STATED NUMBER AND HOW THE STUDENT SPELLED IT.
 *
 * Operator, 2026-09-28: *"we need to keep the format of entry"*, for every tool, and `√8` stays `√8`. sr-22
 * (ADR-W-175, 2026-11-02) is newer and binds a typed decimal: «7.9999» reads «8», computed in full.
 */
import { describe, expect, it } from 'vitest';
import { givenText, readLiteral } from '../literal';

const tier = (v: number) => `tier(${v})`;

describe('#1497 — readLiteral', () => {
  it.each([
    ['2/3', 2 / 3, '2/3'],
    ['0.5', 0.5, '0.5'],
    ['1.25', 1.25, '1.25'],
    ['7', 7, '7'],
    ['√8', Math.sqrt(8), '√8'],
    ['6√5', 6 * Math.sqrt(5), '6√5'],
    ['√5/2', Math.sqrt(5) / 2, '√5/2'],
    ['3√7/2', (3 * Math.sqrt(7)) / 2, '3√7/2'],
    ['√(2/3)', Math.sqrt(2 / 3), '√(2/3)'],
    ['2.5√2', 2.5 * Math.SQRT2, '2.5√2'],
    ['-√2', -Math.SQRT2, '-√2'],
    ['−2/3', -2 / 3, '-2/3'],
    ['(2/3)', 2 / 3, '2/3'],
    ['(-2/3)', -2 / 3, '-2/3'],
    [' 2 / 3 ', 2 / 3, '2/3'],
    ['2 * √7', 2 * Math.sqrt(7), '2√7'],
    ['2·√7', 2 * Math.sqrt(7), '2√7'],
    ['⅔', 2 / 3, '2/3'],
    ['2½', 2.5, '2.5'],
  ])('«%s» is %d, spelled «%s»', (raw, value, src) => {
    const lit = readLiteral(raw);
    expect(lit?.value).toBeCloseTo(value, 12);
    expect(lit?.src).toBe(src);
  });

  it.each(['', 'k', '2k', '/4', '3/0', '√(5/0)', '2+3', '2*7', '4π', '√', '1/2√3'])('«%s» is no literal', (raw) => {
    expect(readLiteral(raw)).toBeNull();
  });

  it('only a decimal numeral is a decimal', () => {
    expect(readLiteral('4.1')?.decimal).toBe(true);
    expect(readLiteral('-4.1')?.decimal).toBe(true);
    for (const raw of ['4', '41/10', '2.5√2', '√2.5']) expect(readLiteral(raw)?.decimal).toBe(false);
  });
});

describe('#1497 — givenText: a given as typed, a decimal in the house decimals', () => {
  it.each([
    [2 / 3, '2/3', '2/3'],
    [4 / 6, '4/6', '4/6'],
    [Math.sqrt(8), '√8', '√8'],
    [5, '5', '5'],
    [0.5, '0.5', '0.5'],
    [1.25, '1.25', '1.25'],
    [7.9999, '7.9999', '8'], // sr-22
    [0.6667, '0.6667', '0.67'], // sr-22: typed and computed follow the same rule
    [4.1, '4.10', '4.1'],
  ])('%d spelled «%s» reads «%s»', (value, src, text) => {
    expect(givenText(value, src, tier)).toBe(text);
  });

  it('with no spelling, the product keeps its tiers', () => {
    expect(givenText(0.5, undefined, tier)).toBe('tier(0.5)');
  });
  it('a spelling that no longer reads as the value is never printed: the figure holds the value', () => {
    expect(givenText(4 / 3, '2/3', tier)).toBe(`tier(${4 / 3})`);
  });
  it('an expression that is no literal prints as it stands', () => {
    expect(givenText(4 * Math.PI, '4π', tier)).toBe('4π');
    expect(givenText(2 + Math.sqrt(3), '2 + √3', tier)).toBe('2 + √3');
  });
});
