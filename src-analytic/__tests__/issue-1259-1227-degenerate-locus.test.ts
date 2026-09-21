/**
 * #1259 + #1227 ([ADR-AG-136](../../docs/06c-decisions-analytic.md#adr-ag-136)) — A CLUSTER INSIDE SOLVER
 * RESOLUTION IS ONE ANSWER, AND A DETERMINED POINT'S LOCUS IS THAT POINT.
 *
 * «A(0,0)» · «B(8,0)» · «נקודה M» · «MA = MB» · «MA = 4»: M is exactly (4, 0) — a tangency, one point. The
 * panel printed FOUR cases («(4, -0.0016) או (4, 0.0018) או …»), each a magnitude nobody gave, because the
 * twenty-four solves at a double root spread over 7.5e-4 of scale, seven times the value-identity bar; and
 * «המקום הגיאומטרי של M» on the two-root sibling «MA = 5» answered «לא ניתן לחשב מהנתונים» while the panel
 * three rows above read «[(4, -3)] או (4, 3)».
 *
 * Operator ruling 2026-09-20 (#1259): a cluster inside the solver's own resolution is NOT an option set —
 * route to the knowledge gate's answer. Operator, 2026-09-19 (#1227): "saying M cannot be calculated is
 * wrong … refer to the location of point M".
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { isKnowledge, knownOptions } from '../engine/evaluate';
import { SOLVE_RESOLUTION, SOLVE_TOL } from '../engine/solve';
import { ask } from '../app/ask';

const BASE = ['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'];
const readM = (f: { points: { id: string; x: number; y: number }[] }) => {
  const p = f.points.find((q) => q.id === 'M');
  return p ? [p.x, p.y] : null;
};
const mx = (c: ReturnType<typeof derive>['construction']) => isKnowledge(c, (f) => f.points.find((p) => p.id === 'M')?.x ?? null);
const my = (c: ReturnType<typeof derive>['construction']) => isKnowledge(c, (f) => f.points.find((p) => p.id === 'M')?.y ?? null);

describe('#1259 — the tangential figure is ONE point, not four cases', () => {
  it('knownOptions answers "not a set" and the knowledge gate answers (4, 0)', () => {
    const d = derive([...BASE, 'MA = 4'], 0);
    expect(knownOptions(d.construction, readM), 'a cluster inside solver resolution is not an option set').toBeNull();
    const x = mx(d.construction);
    const y = my(d.construction);
    expect(x.known && y.known, 'the panel says what it says for a determined point').toBe(true);
    if (x.known && y.known) {
      expect(Math.abs(x.value - 4)).toBeLessThan(1e-6);
      expect(Math.abs(y.value), 'the cluster midpoint rounds to the exact 0').toBeLessThan(2e-3);
    }
  });

  it('the two-root sibling «MA = 5» still reads EXACTLY two options — the regression that matters', () => {
    const d = derive([...BASE, 'MA = 5'], 0);
    const opts = knownOptions(d.construction, readM)!;
    expect(opts).toHaveLength(2);
    expect(opts.map((o) => Math.round(o[1]))).toEqual([-3, 3]);
    expect(my(d.construction).known, 'y is genuinely two-valued — not knowledge').toBe(false);
  });

  it('the resolution is derived from the solver tolerance, with the ruled margin', () => {
    expect(SOLVE_RESOLUTION).toBeCloseTo(10 * Math.sqrt(SOLVE_TOL), 15);
    expect(SOLVE_RESOLUTION).toBeGreaterThan(7.5e-4 * 3); // above the measured noise, with margin
    expect(SOLVE_RESOLUTION).toBeLessThan(1.5 / 100); // far below the real two-option separation
  });

  it('a genuinely continuous family is still not an option set, and the cap holds', () => {
    const d = derive(BASE, 0); // M free on x = 4
    expect(knownOptions(d.construction, readM)).toBeNull();
  });
});

describe('#1227 — the locus of a determined point is that point, or that finite set', () => {
  const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
  const locus = (lines: string[]) => ask(derive(lines, 0), 'המקום הגיאומטרי של M', fmt);

  it('«MA = 5»: the two positions, as a fact about the figure — never «cannot be computed»', () => {
    const a = locus([...BASE, 'MA = 5']);
    expect(a.fact).toBe('points');
    expect(a.points?.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[4, -3], [4, 3]]);
    expect(a.value).toBeNull();
    expect(a.unreadable).toBeUndefined();
  });

  it('the tangential case answers ONE point, not six — the count comes from the resolution-aware set, never from a sample length', () => {
    const a = locus([...BASE, 'MA = 4']);
    expect(a.fact).toBe('points');
    expect(a.points).toHaveLength(1);
    expect(Math.abs(a.points![0].x - 4)).toBeLessThan(1e-6);
    expect(Math.abs(a.points![0].y)).toBeLessThan(2e-3);
  });

  it('a fully pinned point answers that one point', () => {
    const a = locus(['M(3,7)']);
    expect(a.fact).toBe('points');
    expect(a.points).toEqual([{ x: 3, y: 7 }]);
  });

  it('an OPEN figure still answers its locus curve — the distinction #1223 protects survives', () => {
    const a = locus(BASE);
    expect(a.value).toMatch(/x - 4 = 0|x = 4/);
    expect(a.fact).toBeUndefined();
  });

  it('the panel and the answer row never disagree about where M is', () => {
    const d = derive([...BASE, 'MA = 5'], 0);
    const a = ask(d, 'המקום הגיאומטרי של M', fmt);
    const opts = knownOptions(d.construction, readM)!;
    expect(a.points!.map((p) => [p.x, p.y])).toEqual(opts);
  });
});
