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
import type { Fact } from '../../model/fact';
import { bridgeFacts, derive2 } from '../derive2';
import { deriveLines } from '../../app/deriveLines';

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
  it('z^3 = 8 plots the three cube roots — all at once, as ONE configuration (#680)', () => {
    // Until #680 this read `configCount === 3` and walked the roots one per configuration. They are a
    // SET, not three drawings of one point (ADR-CX-005 mode 1), so the exam's «פתרו את המשוואה» now
    // shows the whole answer and there is nothing left to cycle (ADR-CX-020). Full coverage of the
    // family lives in replay/__tests__/solution-sets.test.ts.
    const d = derive2(facts('z^3 = 8'));
    expect(d.configCount).toBe(1);
    expect(d.canCycle).toBe(false);
    const degs = d.points.map((p) => Math.round(p.argumentDeg)).sort((a, b) => a - b);
    expect(degs).toEqual([0, 120, 240]);
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

describe('S4 CLOSE — the same figures, now from the v2 parser (deriveLines)', () => {
  // The bridge reads the prototype's facts; this reads the student's TEXT. Both feed one shared fold,
  // so the check that matters is that they agree — a second derivation that must match a first is a
  // second derivation that will drift (the ADR-346 mirror class).
  const SESSION = ['z1 ברביע הראשון', 'z1^3 = z3', '-2z1 = conj(z3)'];

  it('#607 builds from TEXT, with the same exact readings', () => {
    const d = deriveLines(SESSION);
    expect(d.contradiction).toBeNull();
    expect(d.untranslated).toEqual([]);
    expect(d.points.find((p) => p.name === 'z1')!.exactLabel).toBe('√2·cis45°');
    expect(d.points.find((p) => p.name === 'z3')!.exactLabel).toBe('2√2·cis135°');
    expect(d.freeDof).toEqual([]);
  });

  it('agrees with the bridge, point for point', () => {
    const viaText = deriveLines(SESSION);
    const viaBridge = derive2(facts(...SESSION));
    expect(viaText.points.map((p) => [p.name, p.exactLabel])).toEqual(
      viaBridge.points.map((p) => [p.name, p.exactLabel]),
    );
    expect(viaText.configCount).toBe(viaBridge.configCount);
  });

  it('the four configurations still enumerate, and cycle', () => {
    const noQuadrant = ['z1^3 = z3', '-2z1 = conj(z3)'];
    expect(deriveLines(noQuadrant).configCount).toBe(4);
    const degs = [0, 1, 2, 3].map((i) =>
      Math.round(deriveLines(noQuadrant, i).points.find((p) => p.name === 'z1')!.argumentDeg),
    );
    expect(degs.sort((a, b) => a - b)).toEqual([45, 135, 225, 315]);
  });

  it('the English mirror gives the same figure', () => {
    const en = deriveLines(['z1 in the first quadrant', 'z1^3 = z3', '-2z1 = conj(z3)']);
    expect(en.points.find((p) => p.name === 'z1')!.exactLabel).toBe('√2·cis45°');
  });

  it('under-determination still DRAWS and still reports what is free', () => {
    const d = deriveLines(['z1 ברביע הראשון', 'z1^3 = z3']);
    expect(d.points.map((p) => p.name).sort()).toEqual(['z1', 'z3']);
    expect(d.points.every((p) => !p.modulusKnown)).toBe(true);
    expect(d.freeDof.length).toBeGreaterThan(0);
  });

  it('a line the v2 grammar cannot read is REPORTED, with the student’s own words', () => {
    // F13 (loci) is the specimen now that F9 parses. The point of this test is the REPORTING, so it
    // needs a line the grammar genuinely does not cover — using one that has since been implemented
    // would leave the assertion passing for the wrong reason.
    const d = deriveLines(['z1^3 = z3', 'המקום הגאומטרי של z הוא מעגל']);
    expect(d.untranslated).toHaveLength(1);
    expect(d.untranslated[0].src).toContain('המקום');
    // ...and the rest of the session still builds
    expect(d.points.length).toBeGreaterThan(0);
  });

  it('a line that DROPS content is reported as not-understood, never absorbed', () => {
    const d = deriveLines(['z1 ברביע הראשון ומקבילית']);
    expect(d.untranslated).toHaveLength(1);
    expect(d.untranslated[0].why).toContain('ומקבילית');
  });
});

describe('A FILTER BOUNDS THE SAMPLE, not only the branches (operator report, 2026-08-16)', () => {
  // Reported from prod: «z1 ברביע הראשון» alone drew z1 at ~1·cis~0° — on the +Re AXIS, which is in
  // no quadrant at all. The quadrant pruned enumerated branches, but a direction the givens never pin
  // is a sampled DOF, not a branch, so nothing asked the sample to respect the given. The figure
  // contradicted its own stated fact while every check passed.
  const quadrantOf = (re: number, im: number): number =>
    re > 0 && im > 0 ? 1 : re < 0 && im > 0 ? 2 : re < 0 && im < 0 ? 3 : re > 0 && im < 0 ? 4 : 0;

  it('THE REPORT: the quadrant given holds in the drawing, with nothing else stated', () => {
    const d = deriveLines(['z1 ברביע הראשון']);
    const z1 = d.points.find((p) => p.name === 'z1')!;
    expect(quadrantOf(z1.z.re, z1.z.im), 'z1 must be strictly inside quadrant 1').toBe(1);
  });

  it('...and never lands ON an axis, which belongs to no quadrant', () => {
    for (let seed = 0; seed < 40; seed++) {
      const z1 = deriveLines(['z1 ברביע הראשון'], 0, seed).points[0];
      expect(Math.abs(z1.z.re), `seed ${seed}`).toBeGreaterThan(1e-6);
      expect(Math.abs(z1.z.im), `seed ${seed}`).toBeGreaterThan(1e-6);
      expect(quadrantOf(z1.z.re, z1.z.im), `seed ${seed}`).toBe(1);
    }
  });

  it('every quadrant, in both languages', () => {
    for (const [line, q] of [
      ['z1 ברביע הראשון', 1],
      ['z1 ברביע השני', 2],
      ['z1 ברביע השלישי', 3],
      ['z1 ברביע הרביעי', 4],
      ['z1 in the second quadrant', 2],
      ['z1 in the fourth quadrant', 4],
    ] as const) {
      const p = deriveLines([line]).points[0];
      expect(quadrantOf(p.z.re, p.z.im), line).toBe(q);
    }
  });

  it('the sample still MOVES between configurations — bounded is not frozen (ADR-052)', () => {
    const degs = [0, 1, 2, 3].map((s) => deriveLines(['z1 ברביע הראשון'], 0, s).points[0].argumentDeg);
    expect(new Set(degs.map((d) => Math.round(d))).size).toBeGreaterThan(1);
    for (const d of degs) {
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(90);
    }
  });

  it('an unconstrained number is sampled, never a fixed 1·cis0°', () => {
    const a = deriveLines(['z9'], 0, 0).points[0];
    const b = deriveLines(['z9'], 0, 1).points[0];
    expect(Math.hypot(a.z.re - b.z.re, a.z.im - b.z.im)).toBeGreaterThan(1e-6);
  });

  it('a DETERMINED direction is still verified, not resampled — the filter did not become a driver', () => {
    // z^3 = 8 puts a root at 0°, which is in no quadrant; asking for quadrant 1 must find none.
    // `z` is declared first so the equation constrains that letter — the three roots are its three
    // configurations, and none of them is interior to a quadrant (ADR-CX-021).
    const d = deriveLines(['z', 'z^3 = 8', 'z ברביע הראשון']);
    expect(d.configCount).toBe(0);
    expect(d.emptiedBy).not.toBeNull();
  });
});

describe('ONE VERDICT PER LINE — the row and the canvas cannot disagree (operator report, 2026-08-16)', () => {
  // Reported from prod: the figure BUILT and z1/z3 were determined, while the row for
  // `-2z1 = conj(z3)` was marked red — because the canvas drew v2 while the fact list was still
  // styled by the PROTOTYPE's evaluation, and the prototype is precisely what refuses that line
  // (#607). Two surfaces, one fact, opposite answers. The UI half is in App.tsx; this locks the
  // engine half: v2 must report NOTHING wrong with a line it read.
  const SESSION = ['z1 ברביע הראשון', 'z1^3 = z3', '-2z1 = conj(z3)'];

  it('v2 reports no failure for any line of a session it fully understands', () => {
    const d = deriveLines(SESSION);
    expect(d.untranslated).toEqual([]);
    expect(d.contradiction).toBeNull();
  });

  it('the refusals v2 DOES report are keyed by the student’s own line, so a row can find its own', () => {
    const d = deriveLines([...SESSION, 'המקום הגאומטרי של z הוא מעגל']);
    expect(d.untranslated).toHaveLength(1);
    expect(d.untranslated[0].src).toBe('המקום הגאומטרי של z הוא מעגל');
    // ...and every OTHER line is unblamed, which is what keeps the red mark on the right row
    for (const line of SESSION) expect(d.untranslated.some((u) => u.src === line)).toBe(false);
  });
});
