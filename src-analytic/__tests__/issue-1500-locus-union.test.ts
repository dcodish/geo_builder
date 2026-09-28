/**
 * THE LOCUS IS THE FULL SOLUTION SET — every connected component, drawn and named (#1500).
 *
 * Operator, prod, 2026-09-28: *"I asked for the loci of G. it sometimes give 3x + 4y = 0 and
 * sometimes just says ישר. there should be 2 lines for this loci and both should appear since they
 * are the answer together and not just one of them."*
 *
 * The figure: G with dist(M, line OG) = 6 — the lines through O tangent to the circle centre
 * M(2,6) radius 6, which is the UNION of `y = 0` and `3x + 4y = 0`. Measured before the fix: no
 * seed ever drew or named both lines; seed 4 printed «ישר · 3x + 4y = 0» as THE locus — a
 * confident equation for a strict subset, the one thing this product may not do (ADR-AG-072 §4).
 *
 * Two defects, two arms: the tracer covered only the component the seed landed on (arm A —
 * discovery + the union gate), and `fitLine`/`normalized` believed a noise-level coefficient as
 * the monic lead, so `y = 0` printed `x + 64029472y = 0`-shaped garbage or nothing (arm B).
 *
 * Seed sweep per ADR-AG-144's rule: a 2/24 pass must not read as done.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { drawnLoci } from '../app/answers';
import { derive } from '../engine/derive';
import { shapeOfTrace } from '../engine/locusFit';
import { fmtAnalytic } from '../format';

const SEQ = ['משולש OMG', 'O(0,0)', 'M(2,6)', 'MH גובה לצלע OG', 'MH=6'];
const SEEDS = 24;

/** The he kind words, singular and the union's plural — what App.tsx injects. */
const kindWord = ((k: string, n: number) =>
  n > 1 ? ({ line: 'שני ישרים', circle: 'שני מעגלים' } as Record<string, string>)[k] : ({ line: 'ישר', circle: 'מעגל' } as Record<string, string>)[k]) as never;

const answer = (lines: string[], seed: number) => ask(derive(lines, seed), 'המקום הגיאומטרי של G', fmtAnalytic, kindWord);

const onY0 = (p: { x: number; y: number }) => Math.abs(p.y) < 0.02 * Math.max(1, Math.abs(p.x));
const onL2 = (p: { x: number; y: number }) => Math.abs(3 * p.x + 4 * p.y) < 0.05 * Math.max(1, Math.hypot(p.x, p.y));

describe('#1500 — the union is the answer, at every configuration', () => {
  it("the operator's exact figure: BOTH equations, the same row, at every seed of a 24-seed sweep", () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const a = answer(SEQ, seed);
      expect(a.value, `seed ${seed}`).toBe('שני ישרים · 3x + 4y = 0 · y = 0');
    }
  });

  it('the drawn locus contains points on both branches, at every seed', () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const a = answer(SEQ, seed);
      const comps = a.locus?.components ?? [];
      expect(comps.length, `seed ${seed}`).toBe(2);
      const all = comps.flatMap((c) => c.points);
      expect(all.some(onY0), `seed ${seed}: no points on y = 0`).toBe(true);
      expect(all.some(onL2), `seed ${seed}: no points on 3x + 4y = 0`).toBe(true);
    }
  });

  it('each drawn line says WHICH part of the answer it is — its own equation as its label', () => {
    const a = answer(SEQ, 0);
    const labels = drawnLoci([a]).map((l) => l.label);
    expect(labels).toHaveLength(2);
    expect(new Set(labels)).toEqual(new Set(['y = 0', '3x + 4y = 0']));
  });
});

describe('#1500 arm B — the monic lead tolerates the fit’s own noise', () => {
  it('a trace along y = 0 with 1e-8-level cross-noise snaps to y = 0, not to a garbage lead', () => {
    // The corrector's leavings DRIFT — the real traces fit a normal like (1.5e-8, 1), not pure
    // symmetric wobble — so the synthetic trace carries the same shape: a noise-level slope the
    // old 1e-9 lead bar believed (measured red before the fix) plus wobble.
    const pts = Array.from({ length: 120 }, (_, i) => ({
      x: -20 + (40 * i) / 119,
      y: 1.5e-9 * (-20 + (40 * i) / 119) + 1e-8 * Math.sin(i * 0.7),
    }));
    const s = shapeOfTrace(pts);
    expect(s).toBeTruthy();
    expect(s!.curve.kind).toBe('line');
    expect(s!.conic).toEqual({ A: 0, B: 0, C: 0, D: 0, E: 1, F: 0 });
  });
});

describe('#1500 — the honesty rule is untouched: a parameterised union refuses the equations', () => {
  /**
   * M(2a,6) keeps dist(M, y=0) = 6 = MH at every `a`, so `y = 0` is a component of every
   * configuration's set — while the second tangent line turns with `a`. One component's equation
   * is invariant, the other's is not: the union did not agree, so the row is the KINDS alone.
   * Printing «y = 0» here would be a confident claim about a set the tool could not confirm.
   */
  it('«M(2a,6)»: two lines drawn, kinds only, no equation — at every seed that finds the union', () => {
    let unions = 0;
    for (let seed = 0; seed < 12; seed += 1) {
      const a = answer(['משולש OMG', 'O(0,0)', 'M(2a,6)', 'MH גובה לצלע OG', 'MH=6'], seed);
      const comps = a.locus?.components ?? [];
      if (comps.length < 2) continue; // a configuration that saw one component keeps the old answer shape
      unions += 1;
      expect(a.value, `seed ${seed}`).toBe('שני ישרים');
    }
    // The refusal must actually be exercised, not skipped into a vacuous pass.
    expect(unions).toBeGreaterThanOrEqual(6);
  });
});

describe('#1500 — single-component answers are byte-identical (the counter-lock)', () => {
  it('the bisector still answers «ישר · x - 4 = 0», one drawn curve, labelled by the whole row', () => {
    const a = ask(derive(['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'], 0), 'המקום הגיאומטרי של M', fmtAnalytic, kindWord);
    expect(a.value).toBe('ישר · x - 4 = 0');
    expect(a.locus?.components).toHaveLength(1);
    expect(drawnLoci([a])[0].label).toBe('ישר · x - 4 = 0');
  });
});
