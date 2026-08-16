/**
 * S3 gate (#620): the v2 engine reached through the REAL input path.
 *
 * Every case here types the student's own Hebrew (or its English mirror) through the prototype
 * parser's `parseLine`, bridges the facts, and folds them with `derive2`. That matters more than the
 * unit tests below it: a solver that works when called directly and never gets called is the failure
 * mode #535 cost the 3-D tree, so the gate drives the path a student actually takes.
 *
 * The headline is the operator's own refused session (#607) building and cycling.
 */
import { describe, expect, it } from 'vitest';

import { parseLine } from '../../parser/parse';
import type { Fact } from '../../engine/model';
import { bridgeFacts, derive2 } from '../derive2';

/** The real path: an utterance becomes facts exactly as the input box would produce them. */
const facts = (...lines: string[]): Fact[] => {
  const out: Fact[] = [];
  for (const line of lines) {
    const r = parseLine(line);
    if (!r.ok) throw new Error(`did not parse: ${line} (${r.key})`);
    out.push(...r.facts);
  }
  return out;
};

const named = (d: ReturnType<typeof derive2>, name: string) => d.points.find((p) => p.name === name);

describe('#607 — the operator’s refused session, through the real input path', () => {
  const SESSION = ['z1 ברביע הראשון', 'z1^3 = z3', '-2z1 = conj(z3)'];

  it('BUILDS — the figure the prototype refuses', () => {
    const d = derive2(facts(...SESSION));
    expect(d.contradiction).toBeNull();
    expect(d.untranslated).toEqual([]);
    expect(named(d, 'z1')).toBeDefined();
  });

  it('z1 = √2·cis45° exactly, and z3 = 2√2·cis135°', () => {
    const d = derive2(facts(...SESSION));
    expect(named(d, 'z1')!.exactLabel).toBe('√2·cis45°');
    expect(named(d, 'z3')!.exactLabel).toBe('2√2·cis135°');
    expect(named(d, 'z1')!.z.re).toBeCloseTo(1, 9);
    expect(named(d, 'z1')!.z.im).toBeCloseTo(1, 9);
  });

  it('the quadrant given leaves ONE configuration — the other three are pruned, not hidden', () => {
    const withQuadrant = derive2(facts(...SESSION));
    expect(withQuadrant.configCount).toBe(1);
    // …and without it there are exactly four, which is the exam's «כל האפשרויות»
    const without = derive2(facts('z1^3 = z3', '-2z1 = conj(z3)'));
    expect(without.configCount).toBe(4);
    const seen = [0, 1, 2, 3].map((i) => derive2(facts('z1^3 = z3', '-2z1 = conj(z3)'), i));
    expect(seen.map((d) => Math.round(named(d, 'z1')!.argumentDeg)).sort((a, b) => a - b)).toEqual([
      45, 135, 225, 315,
    ]);
  });

  it('nothing is left free — the givens determine the figure', () => {
    expect(derive2(facts(...SESSION)).freeDof).toEqual([]);
  });

  it('cycling wraps rather than running off the end', () => {
    const four = facts('z1^3 = z3', '-2z1 = conj(z3)');
    expect(derive2(four, 4).configIndex).toBe(0);
    expect(derive2(four, -1).configIndex).toBe(3);
  });
});

describe('other corpus systems through the same path', () => {
  it('z^3 = 8 plots the three cube roots', () => {
    const d = derive2(facts('z^3 = 8'));
    expect(d.configCount).toBe(3);
    const degs = [0, 1, 2].map((i) => Math.round(derive2(facts('z^3 = 8'), i).points[0].argumentDeg));
    expect(degs.sort((a, b) => a - b)).toEqual([0, 120, 240]);
  });

  it('a cartesian literal keeps its modulus exact: |3+4i| = 5', () => {
    const d = derive2(facts('z1 = 3+4i'));
    expect(named(d, 'z1')!.modulus).toBe('5');
    expect(named(d, 'z1')!.z.re).toBeCloseTo(3, 9);
    expect(named(d, 'z1')!.z.im).toBeCloseTo(4, 9);
  });

  it('an exact-angle literal is carried exactly, not recognised numerically', () => {
    const d = derive2(facts('z = 1+i'));
    expect(named(d, 'z')!.exactLabel).toBe('√2·cis45°');
  });

  it('CONTRADICTORY givens are refused, not drawn', () => {
    const d = derive2(facts('z = 1', 'z = i'));
    expect(d.contradiction).toBe('argument');
    expect(d.points).toEqual([]);
  });
});

describe('the bridge is honest about what it cannot carry', () => {
  it('an ADDITIVE definition is reported as numeric-tier work, never silently skipped', () => {
    const { untranslated, constraints } = bridgeFacts(facts('w = z1 + z2'));
    expect(untranslated).toHaveLength(1);
    expect(untranslated[0].why).toMatch(/not multiplicative/);
    expect(constraints).toEqual([]);
  });

  it('a fact kind with no v2 form yet says so, with the student’s own line attached', () => {
    const { untranslated } = bridgeFacts(facts('סדרה הנדסית z1, z2, z3'));
    expect(untranslated.length).toBeGreaterThan(0);
    expect(untranslated[0].src).toContain('z1');
    expect(untranslated[0].why).toMatch(/no v2 form yet/);
  });

  it('a partially-bridgeable session still solves the part it can', () => {
    // the sequence is not carried yet, but the equation and the quadrant are
    const d = derive2(facts('סדרה הנדסית z1, z2, z3', 'z1 ברביע הראשון', 'z1^3 = z3', '-2z1 = conj(z3)'));
    expect(d.untranslated).toHaveLength(1); // the sequence, named
    expect(named(d, 'z1')!.exactLabel).toBe('√2·cis45°'); // …and the rest still builds
  });
});

describe('parameters stay free (ADR-052)', () => {
  it('|z1| = 9r prints 9r, and the drawing is only ONE sample of it', () => {
    const { constraints, untranslated } = bridgeFacts(facts('|z1| = 9r'));
    expect(untranslated).toEqual([]);
    expect(constraints).toHaveLength(1);
    const a = derive2(facts('|z1| = 9r'), 0, 0);
    const b = derive2(facts('|z1| = 9r'), 0, 1);
    // the modulus TEXT is seed-invariant knowledge...
    expect(a.points.map((p) => p.modulus)).toEqual(b.points.map((p) => p.modulus));
    // ...and the argument is still free, so the cue must say so
    expect(a.freeDof).toContain('arg z1');
  });
});

describe('ALWAYS VISUALISE — an under-determined figure still draws (operator report, 2026-08-16)', () => {
  // Reported from ?engine=v2: with `z1 ברביע הראשון` + `z1^3 = z3` the canvas was EMPTY. The engine
  // plotted only numbers whose magnitude the givens forced, so every partially-specified figure — which
  // is every figure while the student is still typing — rendered nothing. Two rules had been conflated:
  // "do not print an unknown value as knowledge" (kept, at the label) and "do not draw it" (wrong; the
  // standing product rule is ADR-CX-001 D3, always visualise, with ADR-052's default-as-a-STARTING-value).
  const REPORTED = ['z1 ברביע הראשון', 'z1^3 = z3'];

  it('the reported session DRAWS both numbers', () => {
    const d = derive2(facts(...REPORTED));
    expect(d.contradiction).toBeNull();
    expect(d.points.map((p) => p.name).sort()).toEqual(['z1', 'z3']);
    for (const p of d.points) {
      expect(Number.isFinite(p.z.re) && Number.isFinite(p.z.im), p.name).toBe(true);
      expect(p.z.re === 0 && p.z.im === 0, `${p.name} must not sit on the origin`).toBe(false);
    }
  });

  it('...but reports the sampled halves as NOT known — drawn is not the same as forced', () => {
    const d = derive2(facts(...REPORTED));
    for (const p of d.points) {
      expect(p.modulusKnown, `${p.name} magnitude is not stated`).toBe(false);
      expect(p.exactLabel, `${p.name} has no exact reading yet`).toBeNull();
    }
    expect(d.freeDof.length).toBeGreaterThan(0);
  });

  it('the sample MOVES with the configuration — a default, never a fixed value (ADR-052)', () => {
    const a = derive2(facts(...REPORTED), 0, 0);
    const b = derive2(facts(...REPORTED), 0, 1);
    const moved = a.points.some((p, i) => Math.hypot(p.z.re - b.points[i].z.re, p.z.im - b.points[i].z.im) > 1e-6);
    expect(moved, 'a new configuration must resample the free DOFs').toBe(true);
  });

  it('the quadrant given still HOLDS in the drawing it produced', () => {
    const d = derive2(facts(...REPORTED));
    const z1 = d.points.find((p) => p.name === 'z1')!;
    expect(z1.z.re, 'z1 is in the first quadrant').toBeGreaterThan(0);
    expect(z1.z.im, 'z1 is in the first quadrant').toBeGreaterThan(0);
  });

  it('a number that is merely NAMED is on the canvas too', () => {
    const d = derive2(facts('z9'));
    expect(d.points.map((p) => p.name)).toContain('z9');
  });

  it('a fully-determined figure is unchanged — the fix did not loosen what was known', () => {
    const d = derive2(facts('z1 ברביע הראשון', 'z1^3 = z3', '-2z1 = conj(z3)'));
    const z1 = d.points.find((p) => p.name === 'z1')!;
    expect(z1.modulusKnown && z1.argumentKnown).toBe(true);
    expect(z1.exactLabel).toBe('√2·cis45°');
  });
});
