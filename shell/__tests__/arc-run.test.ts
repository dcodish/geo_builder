/**
 * #2486 (ADR-759, ADR-AG-331) — the arc family's ONE reader of a three-letter run, and its inverse.
 *
 * Operator ruling 2026-10-24 (e8 A): the MIDDLE letter is the centre, as in ∠AOB, for «רבע מעגל», «חצי מעגל» and
 * «גזרה»; the sector's measured O-family exception (an O/P/Q letter written first is the centre when the middle is
 * not) is kept exactly, so no sector changes.
 */
import { describe, expect, it } from 'vitest';
import { arcRunRoles, spellArcRun } from '../arcRun';

describe('arcRunRoles — the measured table (issue #2486 §1, "after the change")', () => {
  it.each([
    ['AOB', 'O', ['A', 'B']],
    ['OAB', 'O', ['A', 'B']],
    ['ABO', 'B', ['A', 'O']],
    ['ABC', 'B', ['A', 'C']],
    ['ODC', 'O', ['D', 'C']],
    ['DCE', 'C', ['D', 'E']],
    ['PAB', 'P', ['A', 'B']],
    ['APB', 'P', ['A', 'B']],
    ['OPA', 'P', ['O', 'A']],
    ['POA', 'O', ['P', 'A']],
  ] as const)('%s → centre %s', (run, centre, ends) => {
    expect(arcRunRoles([...run] as [string, string, string])).toEqual({ centre, ends: [...ends] });
  });

  it('indexed letters: an indexed O-family letter is O-family («O1AB» → O1)', () => {
    expect(arcRunRoles(['O1', 'A', 'B'])).toEqual({ centre: 'O1', ends: ['A', 'B'] });
    expect(arcRunRoles(['A', 'B1', 'C'])).toEqual({ centre: 'B1', ends: ['A', 'C'] });
  });
});

describe('spellArcRun — the inverse round-trips', () => {
  const LETTERS = ['A', 'B', 'C', 'D', 'O', 'P', 'Q', 'O1'];
  const oFam = (p: string) => /^[OPQ]\d*$/.test(p);
  const sameSet = (x: readonly string[], y: readonly string[]) => [...x].sort().join() === [...y].sort().join();

  it('every (centre, {a, b}) over the alphabet: spelt → read back as the same roles, or null', () => {
    let spelt = 0;
    for (const c of LETTERS)
      for (const a of LETTERS)
        for (const b of LETTERS) {
          if (new Set([c, a, b]).size < 3) continue;
          const run = spellArcRun(c, a, b);
          if (run === null) {
            // the only unspellable roles: both ends O-family around a centre that is not
            expect(oFam(a) && oFam(b) && !oFam(c), `${c}/${a},${b} should be spellable`).toBe(true);
            continue;
          }
          spelt++;
          const parts = run.match(/[A-Z]\d*/g)!;
          expect(parts).toHaveLength(3);
          const roles = arcRunRoles(parts);
          expect(roles.centre, run).toBe(c);
          expect(sameSet(roles.ends, [a, b]), run).toBe(true);
        }
    expect(spelt).toBeGreaterThan(0);
  });

  it('the null cases, listed: two O-family ends around a non-O centre', () => {
    expect(spellArcRun('C', 'O', 'P')).toBeNull();
    expect(spellArcRun('A', 'Q', 'O1')).toBeNull();
  });

  it('prefers the angle notation, keeping the ends’ order when it reads back', () => {
    expect(spellArcRun('O', 'A', 'B')).toBe('AOB');
    expect(spellArcRun('C', 'D', 'O')).toBe('DCO');
    // «OCD» would read O (written first) — the speller turns the ends round
    expect(spellArcRun('C', 'O', 'D')).toBe('DCO');
  });
});
