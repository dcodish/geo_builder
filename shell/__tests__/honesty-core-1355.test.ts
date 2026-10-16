/**
 * #1355 (ADR-AG-280) — the honesty accounting core, product-free.
 *
 * Each row pins one property a broken core would lose; the property is named in the row, so a red row says
 * which regression it caught: a set instead of a multiset (2-D #437), a case-sensitive stated side (#779), a
 * mirror gate that ignores `existing`, the article «a» read as a name, a sign read into an occurrence, an
 * exponent-blind scan.
 */
import { describe, expect, it } from 'vitest';
import { LATIN_FILLER, nameAccounting, scanNumbers, spendAccounts, unionByMax } from '../llm/honestyCore';

describe('spendAccounts — the multiset', () => {
  const values = (xs: number[]) => xs.map((value) => ({ value }));
  const cands = (o: { value: number }) => [o.value, o.value * o.value];

  it('one account pays for ONE occurrence (#437: «4*4» with a single 4 loses a given)', () => {
    expect(spendAccounts(values([4, 4]), [4], cands)).toEqual([{ value: 4 }]);
  });
  it('two accounts pay for two', () => {
    expect(spendAccounts(values([4, 4]), [4, 4], cands)).toEqual([]);
  });
  it('a candidate lowering pays (a radius 5 paid by the 25 of r²)', () => {
    expect(spendAccounts(values([5]), [25], cands)).toEqual([]);
  });
  it('nothing to pay with is a drop, in order', () => {
    expect(spendAccounts(values([2, 3]), [], cands)).toEqual([{ value: 2 }, { value: 3 }]);
  });
  it('accounts compare at six decimals', () => {
    expect(spendAccounts(values([0.3]), [0.1 + 0.2], cands)).toEqual([]);
  });
});

describe('nameAccounting — the set difference, both ways', () => {
  it('a stated name nothing mentions is dropped', () => {
    expect(nameAccounting({ stated: ['M', 'H', 'B', 'C'], written: ['M', 'H', 'O', 'G'], existing: new Set(['O', 'M', 'G']) }))
      .toEqual({ dropped: ['B', 'C'], invented: [] });
  });
  it('the stated side is case-blind (#779): «c» is the student’s C, both ways', () => {
    expect(nameAccounting({ stated: ['c'], written: ['C'] })).toEqual({ dropped: [], invented: [] });
  });
  it('an existing name is exempt from INVENTED by default, never silently from DROPPED', () => {
    const existing = new Set(['P', 'l1']);
    expect(nameAccounting({ stated: ['l1'], written: ['P'], existing })).toEqual({ dropped: ['l1'], invented: [] });
    expect(nameAccounting({ stated: ['l1'], written: ['P'], existing, exemptExistingFromDropped: true })).toEqual({ dropped: [], invented: [] });
  });
  it('an existing name can be counted as invented when the caller asks', () => {
    expect(nameAccounting({ stated: ['l'], written: ['P', 'l'], existing: new Set(['P']), exemptExistingFromInvented: false }))
      .toEqual({ dropped: [], invented: ['P'] });
  });
  it('an `accounted` name pays for a stated one but is never itself invented', () => {
    expect(nameAccounting({ stated: ['D'], written: [], accounted: ['D', 'Z'] })).toEqual({ dropped: [], invented: [] });
  });
  it('a name the model wrote that nobody stated is invented, once', () => {
    expect(nameAccounting({ stated: [], written: ['H', 'H'] })).toEqual({ dropped: [], invented: ['H'] });
  });
});

describe('scanNumbers / unionByMax / LATIN_FILLER', () => {
  it('is unsigned, reads a fraction as one occurrence, and honours the caller’s blanks', () => {
    expect(scanNumbers('C(-3,5) slope 1/2 F1', [/(?<=[A-Za-z])\d+/g])).toEqual([
      { raw: '3', value: 3 },
      { raw: '5', value: 5 },
      { raw: '1/2', value: 0.5 },
    ]);
  });
  it('a blanked exponent is not a magnitude', () => {
    expect(scanNumbers('x^2+y^2=25', [/\^\d+/g]).map((o) => o.value)).toEqual([25]);
  });
  it('one statement read twice pays once (the richer source, not the sum)', () => {
    expect(unionByMax([2, 3], [2, 3, 3]).sort()).toEqual([2, 3, 3]);
  });
  it('the article «a» is filler', () => {
    expect(LATIN_FILLER.has('a')).toBe(true);
  });
});
