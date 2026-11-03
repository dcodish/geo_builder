/**
 * #2646 (ADR-AG-384) — `scanNumbers` reads a ROOT as one occurrence, valued as it evaluates, with every radical
 * spelling (the shell's one radical atom, which 2-D's `droppedGivenNumbers` imports too). A plain number and a plain
 * fraction read as before.
 */
import { describe, expect, it } from 'vitest';
import { RADICAL, evalRadicalTerm, radicalTerm, scanNumbers } from '../llm/honestyCore';

const read = (s: string) => scanNumbers(s).map((o) => [o.raw, Math.round(o.value * 1e6) / 1e6]);

describe('scanNumbers — the radical term', () => {
  it.each<[string, [string, number][]]>([
    ['√2', [['√2', 1.414214]]],
    ['5√2', [['5√2', 7.071068]]],
    ['5·√2', [['5·√2', 7.071068]]],
    ['5*√2', [['5*√2', 7.071068]]],
    ['√(3/4)', [['√(3/4)', 0.866025]]],
    ['2/√3', [['2/√3', 1.154701]]],
    ['√32/5', [['√32/5', 1.131371]]],
    ['(5√2)', [['(5√2)', 7.071068]]],
    ['sqrt(2)', [['sqrt(2)', 1.414214]]],
    ['\\sqrt{2}', [['\\sqrt{2}', 1.414214]]],
    ['3/4', [['3/4', 0.75]]],
    ['5', [['5', 5]]],
    ['A(√2, 1)', [['√2', 1.414214], ['1', 1]]],
    ['(4-0)/(3-0)', [['4', 4], ['0', 0], ['3', 3], ['0', 0]]],
  ])('«%s»', (text, expected) => {
    expect(read(text)).toEqual(expected);
  });

  it('records where each occurrence starts', () => {
    expect(scanNumbers('AB = 5√2, C(1,2)').map((o) => o.at)).toEqual([5, 12, 14]);
  });
});

describe('the atom 2-D imports', () => {
  it('reads the √ glyph only; the evaluator strips one outer pair and keeps the radicand’s own', () => {
    const term = new RegExp(`^${radicalTerm(RADICAL)}$`);
    expect(term.test('5√2')).toBe(true);
    expect(term.test('(5√2)')).toBe(true);
    expect(term.test('sqrt(2)')).toBe(false);
    expect(evalRadicalTerm('(√(2))')).toBeCloseTo(Math.SQRT2);
    expect(evalRadicalTerm('7')).toBe(7);
  });
});
