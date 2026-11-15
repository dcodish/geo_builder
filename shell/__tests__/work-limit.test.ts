/**
 * The work limit and "not decided" (#2893, ADR-W-210 phase 4): a limit is counted in the work meter's unit, it nests,
 * it is the same in every run, and "not decided" is plain data the worker client can carry.
 */
import { describe, expect, it } from 'vitest';
import { limitReached, unitsLeft, withWorkLimit } from '../workLimit';
import { isNotDecided, notDecided } from '../notDecided';
import { meterWork } from '../workMeter';
import { afterRename, afterSwap } from '../frame/letterOffer';

/** A search that tries candidates, one unit each, until its loop sees the limit or it runs out of candidates. */
function search(candidates: number, solvesAt: number | null): { found: number | null; tried: number } {
  let tried = 0;
  for (let k = 0; k < candidates; k++) {
    if (limitReached()) break;
    meterWork(1);
    tried++;
    if (k === solvesAt) return { found: k, tried };
  }
  return { found: null, tried };
}

describe('the work limit', () => {
  it('a search that finishes inside its limit is not cut, and its limit is not reported reached', () => {
    const r = withWorkLimit(100, () => search(10, null));
    expect(r.value).toEqual({ found: null, tried: 10 });
    expect(r.reached).toBe(false);
    expect(r.spent).toBe(10);
  });

  it('a search that reaches its limit stops at exactly that many units, every time', () => {
    const runs = [0, 1, 2].map(() => withWorkLimit(25, () => search(1000, null)));
    for (const r of runs) expect(r).toEqual({ value: { found: null, tried: 25 }, reached: true, spent: 25 });
  });

  it('with no limit open nothing is reached, and the units left are unbounded', () => {
    expect(limitReached()).toBe(false);
    expect(unitsLeft()).toBe(Number.POSITIVE_INFINITY);
  });

  it('limits nest: the inner one is its own, and the outer one is reached by everything spent inside it', () => {
    const outer = withWorkLimit(30, () => {
      const inner = withWorkLimit(10, () => search(1000, null));
      expect(inner.reached).toBe(true);
      expect(unitsLeft()).toBe(20);
      return search(1000, null);
    });
    expect(outer.value.tried).toBe(20);
    expect(outer.reached).toBe(true);
  });

  it('a limit is closed when its search throws', () => {
    expect(() => withWorkLimit(5, () => { throw new Error('no figure'); })).toThrow('no figure');
    expect(limitReached()).toBe(false);
  });

  it("counts on the caller's own counter when one is given (a warmth-independent count)", () => {
    let charged = 0;
    const out = withWorkLimit(7, () => {
      let steps = 0;
      while (!limitReached()) { charged += 1; steps += 1; }
      return steps;
    }, () => charged);
    expect(out).toEqual({ value: 7, reached: true, spent: 7 });
    expect(limitReached()).toBe(false);
  });
});

describe('"not decided"', () => {
  it('is its own outcome, carries its resume token as opaque data, and survives a structured clone', () => {
    const nd = notDecided({ tried: [1, 2, 3] }, 42);
    expect(isNotDecided(nd)).toBe(true);
    expect(isNotDecided({ kind: 'commit' })).toBe(false);
    expect(isNotDecided(null)).toBe(false);
    expect(structuredClone(nd)).toEqual(nd);
  });
});

describe('the letter popover answers "not decided" (#2893)', () => {
  it('a rename or swap whose decision reached the limit is not the invalid note, and carries what «המשיכו לחפש» runs', () => {
    expect(afterRename({ ok: false, reason: 'not-decided', round: 1 }, 'K')).toEqual({ close: false, note: 'not-decided', takenBy: null, retry: { kind: 'rename', to: 'K', round: 1 } });
    expect(afterSwap({ ok: false, notDecided: { round: 2 } }, 'K')).toEqual({ close: false, note: 'not-decided', retry: { kind: 'swap', to: 'K', round: 2 } });
    expect(afterRename({ ok: false, reason: 'bad' }, 'K').note).toBe('bad');
    expect(afterSwap({ ok: false }).note).toBe('bad');
  });
});
