/**
 * #1595 (ADR-W-176) — the shared «two letters on one dot» notice: the pair reader and the one sentence.
 */
import { describe, expect, it } from 'vitest';
import he from '../locales/he.json';
import en from '../locales/en.json';
import { CONVERGE_KEY, coincidentPairs, convergeText } from '../converge';

const at = (x: number) => x;
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('#1595 — coincidentPairs', () => {
  it('every pair at one place, earlier member first, in the caller order', () => {
    expect(coincidentPairs([['A', at(0)], ['B', at(1)], ['C', at(0)], ['D', at(0)]], same)).toEqual([
      ['A', 'C'],
      ['A', 'D'],
      ['C', 'D'],
    ]);
  });
  it('points apart give nothing, and one name listed twice is not a pair', () => {
    expect(coincidentPairs([['A', at(0)], ['B', at(1e-3)]], same)).toEqual([]);
    expect(coincidentPairs([['A', at(0)], ['A', at(0)]], same)).toEqual([]);
  });
});

describe('#1595 — convergeText and the suite key', () => {
  it('the key carries 2-D\'s ADR-123 sentence, Hebrew and English', () => {
    expect(CONVERGE_KEY).toBe('suite.notice.converge');
    expect(he.suite.notice.converge).toBe('{{a}} ו-{{b}} נפלו על אותה נקודה.');
    expect(en.suite.notice.converge).toBe('{{a}} and {{b}} have landed at the same point.');
  });
  it('one sentence per pair, space-joined, each name through the caller', () => {
    const t = (k: string, v: Record<string, string>) => `${k}:${v.a}/${v.b}`;
    expect(convergeText([['M', 'N'], ['B', 'D']], t, (id) => `<${id}>`)).toBe('suite.notice.converge:<M>/<N> suite.notice.converge:<B>/<D>');
    expect(convergeText([], t)).toBe('');
  });
});
