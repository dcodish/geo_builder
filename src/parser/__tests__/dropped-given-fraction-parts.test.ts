/**
 * #2065 item 1 ([ADR-700](../../../docs/06-decisions.md#adr-700), the 2-D port of ADR-3D-340 §4) — A STATED FRACTION OR
 * ROOT IS NEVER PAID FOR BY ONE OF ITS PARTS.
 *
 * Measured at `main` 4b0b4592: `droppedGivenNumbers`' radical-aware fraction pass accounted a `TERM [/ TERM]` occurrence
 * when ANY of `[value, numerator, denominator]` had an unspent account. So any payload `1` or `2` (an angle equality's
 * `k: 1`, a ratio's `k: 2`) paid for a dropped «1/2», a `2` for «2/√3», and a lone radical's implied `/1` let a `1`
 * pay for «√2». Now a fraction is accounted by its VALUE, or by its numerator AND its denominator together (one of
 * each spent); a lone radical by its value only.
 */
import { describe, expect, it } from 'vitest';
import { droppedGivenNumbers } from '@/parser';
import type { AnyCommand } from '@/engine';

/** A command whose only number is `k` (the shape of an angle equality / a ratio coefficient). */
const k = (v: number): AnyCommand => ({ type: 'set-angle-ratio', v1: 'A', a1: 'B', b1: 'C', v2: 'D', a2: 'E', b2: 'F', k: v }) as AnyCommand;
const len = (v: number): AnyCommand => ({ type: 'measure-length', a: 'A', b: 'B', value: v }) as unknown as AnyCommand;
const pq = (p: number, q: number): AnyCommand => ({ type: 'set-ratio', a: 'A', b: 'B', c: 'C', d: 'D', p, q }) as unknown as AnyCommand;

describe('#2065 — one part of a fraction never pays for the whole', () => {
  it.each([
    ['AB = 1/2', [k(1)], [0.5]], // the numerator alone
    ['AB = 1/2', [k(2)], [0.5]], // the denominator alone
    ['AB = 2/√3', [k(2)], [2 / Math.sqrt(3)]], // a radical denominator: the numerator alone
    ['AB = √2', [k(1)], [Math.SQRT2]], // a lone radical's implied «/1»
    ['AB = 5√2', [k(5)], [5 * Math.SQRT2]], // the coefficient alone (already dropped before the fix)
    ['AB = -1/2', [k(-1)], [-0.5]], // signed: the numerator alone
  ])('«%s» read as %j drops %j', (u, cmds, want) => {
    const got = droppedGivenNumbers(u, cmds as AnyCommand[]);
    expect(got.length).toBe(want.length);
    got.forEach((g, i) => expect(g).toBeCloseTo(want[i] as number, 6));
  });

  it.each([
    ['AB = 3/4', [pq(3, 4)]], // the ratio keeps the pair: numerator AND denominator
    ['AB = 1/2', [len(0.5)]], // the value
    ['AB = √2', [len(Math.SQRT2)]], // the value
    ['AB = 2/√3', [len(2 / Math.sqrt(3))]],
    ['AB = 5√2', [len(5 * Math.SQRT2)]],
    ['AB = 2/2', [pq(2, 2)]], // a pair of equal parts needs both — present
  ])('«%s» read as %j is accounted', (u, cmds) => {
    expect(droppedGivenNumbers(u, cmds as AnyCommand[])).toEqual([]);
  });

  it('a pair of equal parts is not paid by ONE account of that number', () => {
    expect(droppedGivenNumbers('AB = 2/2', [k(2)])).toEqual([1]);
  });

  it('the pair is spent: one «3», «4» pair cannot pay for two «3/4» occurrences (ADR-437 multiset)', () => {
    expect(droppedGivenNumbers('AB = 3/4, CD = 3/4', [pq(3, 4)])).toEqual([0.75]);
    expect(droppedGivenNumbers('AB = 3/4, CD = 3/4', [pq(3, 4), len(0.75)])).toEqual([]);
  });
});

describe('#2065 — «p ל-q» is the same ratio pair as «p:q» in the gate (the shared RATIO_SEP atom)', () => {
  const sim = (kv: number): AnyCommand[] => [{ type: 'set-ratio', a: 'A', b: 'B', c: 'D', d: 'E', k: kv } as unknown as AnyCommand, k(1), k(1)];
  it.each([
    ['ABC ∽ DEF ביחס 1 ל-2', 0.5],
    ['ABC ∽ DEF ביחס 1 ל 2', 0.5],
    ['ABC ∽ DEF ביחס 2 ל-3', 2 / 3],
    ['ABC ∽ DEF ביחס של 3 ל-5', 0.6],
    ['ABC ∽ DEF ביחס 1:2', 0.5],
    ['ABC ∽ DEF ביחס 2:3', 2 / 3],
  ])('«%s» with k = %d drops nothing', (u, kv) => {
    expect(droppedGivenNumbers(u, sim(kv))).toEqual([]);
  });

  it('a «ל» pair no ratio pays for is not claimed: its digits are accounted one by one', () => {
    // «מ-3 ל-5» is a range, not a ratio — each number stands on its own account
    expect(droppedGivenNumbers('x גדל מ-3 ל-5', [len(3), len(5)])).toEqual([]);
    expect(droppedGivenNumbers('x גדל מ-3 ל-5', [len(3)])).toEqual([5]);
  });
});
