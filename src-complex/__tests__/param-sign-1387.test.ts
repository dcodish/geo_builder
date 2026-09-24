/**
 * #1387 + #1406 (ADR-CX-045) — a real parameter's SIGN follows its USE.
 *
 * Operator ruling, 2026-09-24: *"param as a size if positive. this is not the case for u^5=-32"*. A
 * parameter that stands as a size (a modulus, a radius, a measure, a scale factor) is positive; any
 * other use (an additive term, an odd power, a number equal to it) is any real. Mixed use is a size.
 *
 * Root cause (measured at pickup, eef9dda4): every real parameter was modelled as POSITIVE in both tiers —
 * tier 1 kept it only as a log-magnitude (so `5·arg u = arg(−32)` had no solution), and tier 2 bounded it
 * with `lo: 1e-6` (so `z1 = a + b·i` could only reach quadrant I, and «|z1| = 5» / «z1 ברביע השני» were
 * FALSELY refused, naming `z1 = a + b*i`).
 *
 * Every lock here CALLS the decision it guards: `paramSigns` is the one sign-by-use reading, and the
 * sequences run through the real `acceptLine` / `submitLine` gate and the real `deriveLines` fold.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { deriveLines, lowerLines } from '../app/deriveLines';
import { acceptLine, submitLine } from '../app/submit';
import { paramSigns } from '../model/paramSign';
import { useComplexStore } from '../store/useComplexStore';

const SEEDS = Array.from({ length: 24 }, (_, s) => s);
const signsOf = (lines: string[]) => {
  const l = lowerLines(lines);
  return paramSigns({ constraints: l.constraints, objects: l.objects, measures: l.measures });
};
const z1At = (lines: string[], seed: number) => deriveLines(lines, seed, seed).points.find((p) => p.name === 'z1')!.z;
const unsatisfiedSeeds = (lines: string[]) =>
  SEEDS.filter((s) => {
    const d = deriveLines(lines, s, s);
    return d.contradiction !== null || d.unsatisfied.length > 0;
  });

describe('ADR-CX-045 — the sign-by-use reading (the decision itself)', () => {
  it.each([
    [['|z1| = 9r'], [], ['r']],
    [['המעגל שמרכזו O ורדיוסו r'], [], ['r']],
    [['z1 = 3+4i', 'z2 = 2cis150', 'אורך z1z2 = 15r'], [], ['r']],
    [['z1 = 3+4i', 'z2 = r*z1'], [], ['r']],
    [['z1 = a + b*i'], ['a', 'b'], []],
    [['z1 = 2 + r*i'], ['r'], []],
    [['u^5 = -32'], ['u'], []],
    [['z1 = u'], ['u'], []],
  ])('%j → sign-free %j, size %j', (lines, signed, size) => {
    const s = signsOf(lines);
    expect([...s.signed].sort()).toEqual(signed);
    expect([...s.size].sort()).toEqual(size);
  });

  it('MIXED use is a size: «|z1| = 9r» beside «z2 = 2 + r*i» keeps r positive, in both entry orders', () => {
    for (const lines of [['|z1| = 9r', 'z2 = 2 + r*i'], ['z2 = 2 + r*i', '|z1| = 9r']]) {
      const s = signsOf(lines);
      expect([...s.signed]).toEqual([]);
      expect([...s.size]).toEqual(['r']);
    }
  });
});

describe('#1387 — «z1 = a + b*i» with a modulus or a quadrant is no longer falsely refused', () => {
  beforeEach(() => useComplexStore.getState().resetSession());

  it.each([
    [['z1 = a + b*i', '|z1| = 5']],
    [['|z1| = 5', 'z1 = a + b*i']],
    [['z1 = a + b*i', 'z1 ברביע השני']],
    [['z1 ברביע השני', 'z1 = a + b*i']],
    [['z1 = a + b*i', 'z1 in the second quadrant']],
    [['z1 = a + b*i', 'z1 ברביע השלישי']],
  ])('%j — accepted through the real submit gate, satisfied at 24/24 seeds', (lines) => {
    for (const l of lines) expect(submitLine(l), l).toBe(true);
    expect(useComplexStore.getState().lines).toEqual(lines);
    expect(unsatisfiedSeeds(lines)).toEqual([]);
  });

  it('the quadrant-II figure really is in quadrant II — a < 0 < b — at every seed', () => {
    for (const s of SEEDS) {
      const z = z1At(['z1 = a + b*i', 'z1 ברביע השני'], s);
      expect(z.re, `seed ${s}`).toBeLessThan(0);
      expect(z.im, `seed ${s}`).toBeGreaterThan(0);
    }
  });

  it('|z1| = 5 is honoured at every seed', () => {
    for (const s of SEEDS) {
      const z = z1At(['z1 = a + b*i', '|z1| = 5'], s);
      expect(Math.hypot(z.re, z.im), `seed ${s}`).toBeCloseTo(5, 6);
    }
  });

  it('the neighbours: «z1 = a+3i · |z1| = 5» 0/24 unsatisfied (was 5/24), «z1 = 2 + r*i · |z1| = 5» still 0/24', () => {
    expect(unsatisfiedSeeds(['z1 = a+3i', '|z1| = 5'])).toEqual([]);
    expect(unsatisfiedSeeds(['z1 = 2 + r*i', '|z1| = 5'])).toEqual([]);
    expect(unsatisfiedSeeds(['z1 = a + b*i'])).toEqual([]);
  });

  it('a genuine conflict still refuses: «z1 = a+3i» cannot have |z1| = 2', () => {
    expect(acceptLine(['z1 = a+3i'], '|z1| = 2', 0).ok).toBe(false);
  });
});

describe('#1406 — an odd power of a sign-free parameter may be negative', () => {
  beforeEach(() => useComplexStore.getState().resetSession());

  it('«u^5 = -32» is accepted and «פרמטרים» shows u = -2', () => {
    expect(submitLine('u^5 = -32')).toBe(true);
    expect(deriveLines(['u^5 = -32']).params).toEqual([{ name: 'u', value: '-2' }]);
  });

  it('…and asking «u» answers -2, exactly', () => {
    const row = deriveLines(['u^5 = -32'], 0, 0, ['u']).knowledge.find((k) => k.label === 'u');
    expect(row?.value).toBe('-2');
  });

  it('«u^5 = -32 · z1 = u» draws z₁ at −2 at every seed, and reads it exactly', () => {
    for (const s of SEEDS) {
      const z = z1At(['u^5 = -32', 'z1 = u'], s);
      expect(z.re, `seed ${s}`).toBeCloseTo(-2, 9);
      expect(z.im, `seed ${s}`).toBeCloseTo(0, 9);
    }
    expect(deriveLines(['u^5 = -32', 'z1 = u']).points[0].reading).toBe('z₁ = 2·cis180°');
  });

  it('REFUSAL: «u^4 = -16» has no real solution and stays refused', () => {
    expect(submitLine('u^4 = -16')).toBe(false);
    expect(deriveLines(['u^4 = -16']).contradiction).toBe('argument');
  });

  it('an even power with a positive value has TWO real solutions: «u^2 = 4» is u = ±2, and «u» is not knowledge', () => {
    const d = deriveLines(['u^2 = 4'], 0, 0, ['u']);
    expect(d.params).toEqual([{ name: 'u', value: '±2' }]);
    expect(d.enumeratedConfigCount).toBe(2);
    expect(d.knowledge.find((k) => k.label === 'u')?.value).toBeNull();
  });

  it('a free sign-free parameter reads as a MAGNITUDE: «z1 = u» on its negative side is |u|·cis180°, never u·cis180°', () => {
    const readings = SEEDS.slice(0, 4).map((s) => deriveLines(['z1 = u'], s, s).points[0].reading);
    expect(readings).toContain('z₁ ≈ |u|·cis180°');
    for (const r of readings) expect(r).toMatch(/\|u\|/);
  });
});

describe('ADR-CX-045 — a SIZE stays positive (the other half of the ruling)', () => {
  it('«|z1| = 9r» alone: r stays free and positive in the fold (the modulus reads r, never |r|)', () => {
    for (const s of SEEDS) {
      const p = deriveLines(['|z1| = 9r'], s, s).points[0];
      expect(p.modulus, `seed ${s}`).toBe('9r');
    }
  });

  it('mixed use: «|z1| = 9r · z2 = 2 + r*i · |z2| = 5» draws z₂ ABOVE the axis at every seed (r = +√21)', () => {
    for (const s of SEEDS) {
      const z = deriveLines(['|z1| = 9r', 'z2 = 2 + r*i', '|z2| = 5'], s, s).points.find((p) => p.name === 'z2')!.z;
      expect(z.im, `seed ${s}`).toBeGreaterThan(0);
    }
  });

  it('…while the same sum with no size use reaches BOTH signs across seeds (r is any real)', () => {
    const ims = SEEDS.map((s) => z1At(['z1 = 2 + r*i', '|z1| = 5'], s).im);
    expect(ims.some((y) => y > 0)).toBe(true);
    expect(ims.some((y) => y < 0)).toBe(true);
  });

  it('«z1 = 3+4i · |z1| = 9r» still solves r = 5/9', () => {
    expect(deriveLines(['z1 = 3+4i', '|z1| = 9r']).params).toEqual([{ name: 'r', value: '5/9' }]);
  });
});
