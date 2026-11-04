/**
 * #2286 ([ADR-AG-397](../../docs/06c-decisions-analytic.md#adr-ag-397)) — the suite's one detector for two numbers with
 * only whitespace between them (`shell/juxtaposedNumbers`). The builders' own locks drive it through their gates
 * (`src-analytic/__tests__/juxtaposed-numbers-2286.test.ts`, `src/app/__tests__/…`, `src3d/__tests__/…`); this one
 * holds the shape itself: what is a pair, what is not, and what each pair teaches.
 */
import { describe, expect, it } from 'vitest';
import { findJuxtaposedNumbers, findNumberPair, juxtaposedNumbersSpelledOut, teachPair } from '../juxtaposedNumbers';

describe('#2286 — a bare pair of numbers', () => {
  it.each([
    ['A(2 3, 1)', '2 3'],
    ['x = 2 3', '2 3'],
    ['AB = 2 3', '2 3'],
    ['A(2.5 3, 1)', '2.5 3'],
    ['A(-2 3, 1)', '2 3'],
    ['y = 1/2 3', '2 3'],
    ['AB = 12  5', '12  5'],
  ])('«%s» → «%s»', (line, text) => {
    expect(findNumberPair(line)?.text).toBe(text);
    const j = findJuxtaposedNumbers(line);
    expect(j?.kind === 'numbers' && j.text).toBe(text);
  });

  it.each(['A(2, 3)', 'y = 2x', 'y = 2 x', 'x = 2 √3', 'y = 2 (x+1)', 'AB = 2*3', 'AB = 2.5', 'l1 2', 'A1 3', 'AB = 5 ס"מ', 'A(2;3)', 'x₁ 2'])(
    '«%s» is not a pair',
    (line) => {
      expect(findNumberPair(line)).toBeNull();
      expect(findJuxtaposedNumbers(line)).toBeNull();
    },
  );

  it('a mixed number is its own shape: analytic and complex read it first, 2-D and 3-D leave it to #2248', () => {
    expect(findJuxtaposedNumbers('x = 2 1/2')).toMatchObject({ kind: 'mixed', text: '2 1/2', decimal: '2.5', sum: '2+1/2', product: '2*1/2' });
    expect(findNumberPair('x = 2 1/2')).toBeNull();
    // a bare pair beside a mixed number is still found by the 2-D / 3-D detector
    expect(findNumberPair('AB = 2 1/2, CD = 4 5')?.text).toBe('4 5');
  });

  it('the readings: decimal and one number only when both are whole; the value without a float tail', () => {
    expect(findNumberPair('AB = 2 3')).toMatchObject({ a: '2', b: '3', decimal: '2.3', joined: '23', product: '2*3', value: '6' });
    const p = findNumberPair('AB = 0.1 3')!;
    expect(p.decimal).toBeUndefined();
    expect(p.joined).toBeUndefined();
    expect(p.value).toBe('0.3');
  });

  it('teachPair keeps a reading only when the line reads with it in place', () => {
    const p = findNumberPair('A(2 3, 1)')!;
    // a grammar that reads `*`
    expect(teachPair('A(2 3, 1)', p, () => true)).toEqual({ kind: 'readings', decimal: '2.3', joined: '23', product: '2*3' });
    // a grammar that reads no `*`: the product is taught as its value
    expect(teachPair('A(2 3, 1)', p, (l) => !l.includes('*'))).toEqual({ kind: 'readings', decimal: '2.3', joined: '23', product: '6' });
    // a grammar whose bare parser cannot say it reads no `*` (2-D) asks for the value outright
    expect(teachPair('A(2 3, 1)', p, () => true, 'value')).toEqual({ kind: 'readings', decimal: '2.3', joined: '23', product: '6' });
    // a slot that wants two numbers (a point with its comma missing): the comma
    const q = findNumberPair('A(2 3)')!;
    expect(teachPair('A(2 3)', q, (l) => l === 'A(2, 3)')).toEqual({ kind: 'comma', comma: '2, 3' });
    // the replacement is made AT the pair, not at an earlier identical text
    const r = findNumberPair('A1 2 3')!;
    expect(r.text).toBe('2 3');
    const seen: string[] = [];
    teachPair('A1 2 3', r, (l) => (seen.push(l), false));
    expect(seen[0]).toBe('A1 6');
  });

  it('spelled out: every pair, a run included', () => {
    expect(juxtaposedNumbersSpelledOut('|z| = 2 3 4')).toBe('|z| = 2*3*4');
    expect(juxtaposedNumbersSpelledOut('|z| = 2')).toBeNull();
  });
});
