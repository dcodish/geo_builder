/**
 * #1366 — «|z1| = 9r» once z1 has a value. A featured catalog row («r נשאר חופשי») that was REFUSED
 * with «אינו מתיישב עם: "z1 = 3+4i"» — a contradiction that does not exist, since r = 5/9 satisfies it.
 *
 * Root cause (measured): `linearize` keeps a real parameter inside the modulus CONSTANT, so
 * `z1 = 3+4i` beside `|z1| = 9r` eliminated to `0 = 9r/5` — a row with no unknowns and a non-trivial
 * constant, which the elimination read as `0 = c`. A constant cannot absorb a given; the parameter was
 * published as free by the derive layer and was not an unknown of the solver.
 *
 * The fix keeps the representation (every parametric answer — `15r`, `54r²` — reads it) and changes
 * only the VERDICT: tier 1 reads the leftover rows as a small system over the parameter atoms. The
 * negative rows matter most: "any leftover row mentioning a parameter is fine" would pass every positive
 * case here and silently accept the first two refusals.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { submitLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';

const at = (lines: string[], name: string) => deriveLines(lines).points.find((p) => p.name === name);
const modulus = (lines: string[], name: string) => {
  const p = at(lines, name);
  return p ? Math.hypot(p.z.re, p.z.im) : null;
};

describe('#1366 — a determined modulus plus a free real parameter is an EQUATION in the parameter', () => {
  it.each([
    [['z1 = 3+4i', '|z1| = 9r']],
    [['|z1| = 9r', 'z1 = 3+4i']],
    [['z1 = 3+4i', '|z1| = 5r']],
    [['z1 = 3+4i', '|z1| = r']],
    [['z2 = 2cis150', '|z2| = 9r']],
  ])('%j builds, with no contradiction and nothing unsatisfied', (lines) => {
    const d = deriveLines(lines);
    expect(d.contradiction).toBeNull();
    expect(d.unsatisfied).toEqual([]);
    expect(d.points).toHaveLength(1);
  });

  it('both entry orders draw the SAME figure — the student\'s own z1, at 3+4i', () => {
    for (const lines of [['z1 = 3+4i', '|z1| = 9r'], ['|z1| = 9r', 'z1 = 3+4i']]) {
      const z = at(lines, 'z1')!.z;
      expect(z.re).toBeCloseTo(3, 9);
      expect(z.im).toBeCloseTo(4, 9);
    }
  });

  it('r is SOLVED, not sampled: a second modulus in r is drawn at its value (|z2| = 18r = 10), at every seed', () => {
    const lines = ['z1 = 3+4i', '|z1| = 9r', '|z2| = 18r'];
    for (let seed = 0; seed < 24; seed++) {
      const p = deriveLines(lines, 0, seed).points.find((q) => q.name === 'z2')!;
      expect(Math.hypot(p.z.re, p.z.im), `seed ${seed}`).toBeCloseTo(10, 9);
    }
    expect(modulus(lines, 'z2')).toBeCloseTo(10, 9);
  });

  it('r is counted ONCE as a degree of freedom — free alone, not free once a value pins it', () => {
    expect(deriveLines(['|z1| = 9r']).freeDof).toEqual(['arg z1', 'r']);
    expect(deriveLines(['z1 = 3+4i', '|z1| = 9r']).freeDof).toEqual([]);
    expect(deriveLines(['z1 = 3+4i', '|z1| = 9r', '|z2| = 18r']).freeDof).toEqual(['arg z2']);
  });

  it('the catalog row alone is unchanged — r stays free until something pins it', () => {
    const d = deriveLines(['|z1| = 9r']);
    expect(d.contradiction).toBeNull();
    expect(d.points.map((p) => p.name)).toEqual(['z1']);
  });
});

describe('#1366 — the genuine conflicts STILL refuse (the guard against the cheap fix)', () => {
  it('two givens forcing r to two values (9r = 5 and 4r = 5) is a modulus contradiction', () => {
    expect(deriveLines(['z1 = 3+4i', '|z1| = 9r', '|z1| = 4r']).contradiction).toBe('modulus');
  });

  it('a numeric modulus that disagrees (|z1| = 7 against 5) is a modulus contradiction', () => {
    expect(deriveLines(['z1 = 3+4i', '|z1| = 7']).contradiction).toBe('modulus');
  });

  it('|z1| = -5 is still IMPOSSIBLE on its own (#719 channel), not a contradiction', () => {
    const d = deriveLines(['|z1| = -5']);
    expect(d.contradiction).toBeNull();
    expect(d.unsatisfied).toContain('|z1| = -5');
  });

  /**
   * The mirror half. `o = 1+i` reads «a positive real parameter equals 1+i»; it used to be refused only
   * because the modulus half called `0 = o/√2` a contradiction. Once that half SOLVES `o = √2`, the
   * argument half must refute it — a positive real has argument 0, not 45°.
   */
  it('a real parameter equated to a non-real number is refused by the ARGUMENT half', () => {
    expect(deriveLines(['o = 1+i']).contradiction).toBe('argument');
    expect(deriveLines(['r = 3+4i']).contradiction).toBe('argument');
  });
});

describe('#1366 — the reported sequence, through the real submit gate', () => {
  beforeEach(() => useComplexStore.getState().resetSession());

  it('«z1 = 3+4i» then «|z1| = 9r» — both lines land', () => {
    expect(submitLine('z1 = 3+4i')).toBe(true);
    expect(submitLine('|z1| = 9r')).toBe(true);
    expect(useComplexStore.getState().lines).toEqual(['z1 = 3+4i', '|z1| = 9r']);
    expect(useComplexStore.getState().lastError).toBeNull();
  });

  it('…and the genuine conflict after it is still refused, naming the statement', () => {
    expect(submitLine('z1 = 3+4i')).toBe(true);
    expect(submitLine('|z1| = 9r')).toBe(true);
    expect(submitLine('|z1| = 4r')).toBe(false);
    expect(useComplexStore.getState().lines).toEqual(['z1 = 3+4i', '|z1| = 9r']);
  });
});
