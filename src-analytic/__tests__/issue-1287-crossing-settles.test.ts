/**
 * #1287 ([ADR-AG-134](../../docs/06c-decisions-analytic.md#adr-ag-134)) — A CROSSING SETTLES ON THE CURVES
 * OR IS REPORTED ONCE; A NON-SOLUTION IS NEVER A CONFIGURATION.
 *
 * Measured before (ADR-AG-124's tree and today's alike): the chord «A(-5,1)» «B(5,1)» on «x^2+y^2=16»
 * meets the circle at (±3.873, 1), and the typed «P נקודת החיתוך של הקטע AB עם המעגל» placed P at
 * (0, 2.5) on seeds 0 and 4 — on neither the chord nor the circle — with the same fault reported twice.
 * The even-seed projection seeds the crossing at the chord's MIDPOINT, which sits on the circle's axis
 * of symmetry: there the two residual gradients are parallel, the descent cannot leave x = 0, and it
 * parks at a local minimum. Three things were wrong and are locked separately below: the solve gave up
 * from one start; the configuration search called a non-solution `whole`; the fault was doubled.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { drawableAt, evaluate, isKnowledge } from '../engine/evaluate';
import { parseLine } from '../parser/parseAnalytic';
import { fold } from '../engine/apply';
import { solveLM, solveMultiStart } from '../engine/solve';
import type { Fact } from '../engine/types';

const CHORD = ['A(-5,1)', 'B(5,1)', 'משוואת המעגל x^2+y^2=16', 'הקטע AB', 'P נקודת החיתוך של הקטע AB עם המעגל x^2+y^2=16'];
const TOL = 1e-6;
const P = (d: ReturnType<typeof derive>) => {
  const p = d.figure.points.find((q) => q.id === 'P');
  if (!p) throw new Error('no P');
  return p;
};

describe('#1287 — the typed crossing lands ON both curves, at every seed', () => {
  it('seeds 0–7: P on the chord and on the circle, no fault, no freedom left', () => {
    for (let seed = 0; seed < 8; seed++) {
      const d = derive(CHORD, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(d.figure.unsatisfied, `seed ${seed}`).toEqual([]);
      const p = P(d);
      expect(Math.abs(p.y - 1), `seed ${seed}: on the chord`).toBeLessThan(TOL);
      expect(Math.abs(Math.hypot(p.x, p.y) - 4), `seed ${seed}: on the circle`).toBeLessThan(TOL);
      expect(d.figure.carrierDof, `seed ${seed}: the crossing consumed P's freedom`).toBe(0);
    }
  });

  it('both roots stay reachable across seeds — the case #1286’s ruling protects (a chord that meets the circle twice offers both)', () => {
    const signs = new Set<number>();
    for (let seed = 0; seed < 8; seed++) signs.add(Math.sign(P(derive(CHORD, seed)).x));
    expect([...signs].sort()).toEqual([-1, 1]);
  });

  it('the solver alone: from the symmetric midpoint start the single-start descent parks off both curves; the multi-start converges', () => {
    // residuals of the line y = 1 and the circle x² + y² = 16, scale-normalised like the engine's
    const residuals = (v: number[]) => [v[1] - 1, (v[0] * v[0] + v[1] * v[1] - 16) / 8];
    const single = solveLM([0, 1], residuals);
    expect(single.ok, 'the saddle start does not converge on its own').toBe(false);
    const multi = solveMultiStart([[0, 1], [-2.5, 1], [2.5, 1]], residuals);
    expect(multi.ok).toBe(true);
    expect(Math.abs(Math.abs(multi.values[0]) - Math.sqrt(15))).toBeLessThan(1e-5);
    expect(Math.abs(multi.values[1] - 1)).toBeLessThan(1e-5);
  });
});

describe('#1287 — a non-solution is not a configuration', () => {
  it('a genuinely impossible crossing (the chord misses the circle) is reported ONCE, on the line that stated it, and P is not asserted as known', () => {
    const lines = ['A(-5,1)', 'B(5,1)', 'משוואת המעגל x^2+y^2=0.25', 'הקטע AB', 'P נקודת החיתוך של הקטע AB עם המעגל x^2+y^2=0.25'];
    const d = derive(lines, 0);
    expect(d.faults.map((f) => [f.index, f.code])).toEqual([[4, 'unsatisfiable']]);
    expect(d.outcomes[4]).toBe('faulted');
    expect(d.figure.unsatisfied.length, 'both incidences unmet — the figure says so').toBeGreaterThan(0);
  });

  it('the configuration search never chooses a seed whose givens do not hold when another seed’s do', () => {
    // Build the construction the way derive does, then ask the search directly at every seed.
    const facts: Fact[] = [];
    for (const l of CHORD) {
      const r = parseLine(l);
      if (!r.ok) throw new Error(`no parse: ${l}`);
      facts.push(...r.facts);
    }
    const { construction } = fold(facts);
    for (let seed = 0; seed < 8; seed++) {
      const shown = drawableAt(construction, seed, true);
      expect(shown.unsatisfied, `seed ${seed}: what is shown satisfies every given`).toEqual([]);
    }
    // and the knowledge gate reads the crossing from configurations that HOLD, so P's y is known (= 1)
    // while its x is not (two roots)
    const py = isKnowledge(construction, (f) => f.points.find((p) => p.id === 'P')?.y ?? null);
    expect(py.known, 'y = 1 on every admissible configuration').toBe(true);
    if (py.known) expect(Math.abs(py.value - 1)).toBeLessThan(1e-6);
    const px = isKnowledge(construction, (f) => f.points.find((p) => p.id === 'P')?.x ?? null);
    expect(px.known, 'x = ±3.873 — two admissible roots, not knowledge').toBe(false);
  });

  it('a raw evaluate at the once-failing seed now converges too (the multi-start), so the search has nothing to skip on this figure', () => {
    const facts: Fact[] = [];
    for (const l of CHORD) {
      const r = parseLine(l);
      if (!r.ok) throw new Error(`no parse: ${l}`);
      facts.push(...r.facts);
    }
    const { construction } = fold(facts);
    for (const seed of [0, 4]) expect(evaluate(construction, seed).unsatisfied, `seed ${seed}`).toEqual([]);
  });
});
