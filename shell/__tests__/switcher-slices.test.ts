/**
 * The strip's fold rule (#706's D4 amendment): everything inline up to MAX_INLINE; past that the
 * tail folds — and the ACTIVE builder is ALWAYS visible, whatever its registry position. Registry
 * order is preserved (A3 curates order later; the strip must not invent its own).
 */
import { describe, expect, it } from 'vitest';
import { MAX_INLINE, stripSlices, type RosterEntry } from '../frame/Switcher';

const roster = (n: number): RosterEntry[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, label: `P${i}`, url: `/p${i}/` }));

describe('stripSlices — the fold rule', () => {
  it('at or under MAX_INLINE, everything is inline and nothing folds', () => {
    for (const n of [2, 3, MAX_INLINE]) {
      const { inline, folded } = stripSlices(roster(n), 'p0');
      expect(inline).toHaveLength(n);
      expect(folded).toHaveLength(0);
    }
  });

  it('past MAX_INLINE the tail folds, order preserved', () => {
    const { inline, folded } = stripSlices(roster(6), 'p0');
    expect(inline.map((e) => e.id)).toEqual(['p0', 'p1', 'p2']);
    expect(folded.map((e) => e.id)).toEqual(['p3', 'p4', 'p5']);
  });

  it('an ACTIVE builder in the tail is pulled inline; the displaced entry folds', () => {
    const { inline, folded } = stripSlices(roster(6), 'p4');
    expect(inline.map((e) => e.id)).toEqual(['p0', 'p1', 'p4']);
    expect(folded.map((e) => e.id)).toEqual(['p2', 'p3', 'p5']);
    expect(inline.some((e) => e.id === 'p4')).toBe(true);
  });

  it('every entry appears exactly once, inline or folded', () => {
    for (const active of ['p0', 'p3', 'p5']) {
      const { inline, folded } = stripSlices(roster(6), active);
      const all = [...inline, ...folded].map((e) => e.id).sort();
      expect(all).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
    }
  });
});
