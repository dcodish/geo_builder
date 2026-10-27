/**
 * #1182 (ADR-AG-339) — AMONG THE SOLUTIONS THE GIVENS ALLOW, THE SOLVE DRAWS THE ONE NEAREST WHERE IT STARTED.
 *
 * The operator, 2026-09-18 (round #1181 T28): *"there is no point in showing such a point M which is so far away from A
 * and B that it's impossible to see what's happening. seeds should always try to find a close point and work backwards
 * if no choice."* Ruled 2026-09-20: change the solve. Joined by #1264 ①: a fact that adds nothing must not move the
 * figure.
 *
 * Every lock calls `derive` / `decideSubmit`; none re-implements the projection.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { viewBox } from '../engine/evaluate';
import { nearestSolution, solveLM } from '../engine/solve';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { fmtAnalytic } from '../format';

const OPERATOR = ['A(0,0)', 'B(6,8)', 'נקודה M', 'MA = MB'];
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const at = (d: ReturnType<typeof derive>, id: string) => d.figure.points.find((p) => p.id === id)!;
const maxMove = (a: ReturnType<typeof derive>, b: ReturnType<typeof derive>) =>
  Math.max(0, ...a.figure.points.map((p) => {
    const q = b.figure.points.find((x) => x.id === p.id);
    return q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
  }));
const whole = (d: ReturnType<typeof derive>) =>
  d.figure.unsatisfied.length === 0 && d.figure.selectorsOk && d.figure.ringFaults.every((r) => r.violation === 'trapezoid-is-parallelogram');

describe('#1182 — the primitive', () => {
  it('walks a converged point to the nearest member of its set, and leaves an isolated solution alone', () => {
    // x + y = 2: from (5, −3) the nearest member to the origin is (1, 1).
    const line = (v: number[]) => [v[0] + v[1] - 2];
    const near = nearestSolution([5, -3], [0, 0], line)!;
    expect(near[0]).toBeCloseTo(1, 6);
    expect(near[1]).toBeCloseTo(1, 6);
    // a point (two independent rows): nothing is free, nothing moves
    expect(nearestSolution([1, 1], [0, 0], (v) => [v[0] - 1, v[1] - 1])).toBeNull();
    // already nearest
    expect(nearestSolution([1, 1], [0, 0], line)).toBeNull();
  });

  it('never trades a residual for proximity: every point it returns solves the system', () => {
    // a circle of radius 5 — curved, so the tangent step leaves the set and the polish must bring it back
    const circle = (v: number[]) => [Math.hypot(v[0], v[1]) - 5];
    const x = solveLM([-4, 3.2], circle).values;
    const near = nearestSolution(x, [10, 0.5], circle)!;
    expect(Math.abs(circle(near)[0])).toBeLessThan(1e-6);
    expect(Math.hypot(near[0] - 10, near[1] - 0.5)).toBeLessThan(Math.hypot(x[0] - 10, x[1] - 0.5));
  });
});

describe('#1182 — the operator\'s figure is legible at every configuration', () => {
  /** Asserted as a share of the view, not a coordinate bound: a locus that really runs away must still be drawn. */
  it('A and B (10 apart) fill at least half the view at every seed 0–23', () => {
    for (const seed of SEEDS) {
      const d = derive(OPERATOR, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const b = viewBox(d.figure);
      expect(10 / (b.maxX - b.minX), `seed ${seed}: M at (${at(d, 'M').x.toFixed(2)}, ${at(d, 'M').y.toFixed(2)})`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('M still moves: ≥ 12 materially different positions across 24 seeds (ADR-052, never a pin)', () => {
    const ms = SEEDS.map((s) => at(derive(OPERATOR, s), 'M'));
    const distinct: { x: number; y: number }[] = [];
    for (const m of ms) if (distinct.every((q) => Math.hypot(m.x - q.x, m.y - q.y) > 1)) distinct.push(m);
    expect(distinct.length).toBeGreaterThanOrEqual(12);
    // and every one is on the bisector of AB (MA = MB holds)
    for (const m of ms) expect(Math.abs(Math.hypot(m.x, m.y) - Math.hypot(m.x - 6, m.y - 8))).toBeLessThan(1e-4);
  });

  it('the locus answers the same thing at every configuration', () => {
    const kind = ((k: string) => (k === 'line' ? 'ישר' : k)) as never;
    const answers = new Set(SEEDS.map((s) => ask(derive(OPERATOR, s), 'המקום הגיאומטרי של M', fmtAnalytic, kind).value));
    expect([...answers]).toHaveLength(1);
    expect([...answers][0]).toMatch(/^ישר · /);
  });

  it('a bare triangle still varies across configurations', () => {
    const keys = new Set([0, 1, 2, 3, 4, 5].map((s) => derive(['משולש ABC'], s).figure.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(';')));
    expect(keys.size).toBeGreaterThanOrEqual(5);
  });
});

describe('#1182 / #1264 ① — a fact that adds nothing moves nothing', () => {
  const CASES: Array<[string[], string]> = [
    [['משולש ABC', 'AB = AC'], 'זווית ABC = זווית ACB'],
    [['מלבן ABCD'], 'AB מאונך ל-BC'],
    [OPERATOR, 'MB = MA'],
    [['משולש ABC', 'זווית ABC = 90'], 'AB מאונך ל-BC'], // #1264's own sequence
  ];
  for (const [pre, line] of CASES) {
    it(`${pre.join(' · ')} + «${line}»: every point stays where it was, the figure stays whole`, () => {
      for (const seed of [0, 1, 2, 3, 4, 5]) {
        const before = derive(pre, seed);
        const after = derive([...pre, line], seed);
        expect(maxMove(before, after), `seed ${seed}`).toBeLessThan(1e-4);
        expect(whole(after), `seed ${seed}`).toBe(true);
      }
    });
  }

  it('the isosceles base angles: the door already answers «already-follows» (ADR-AG-330), so the jump is derive-level', () => {
    const pre = ['משולש ABC', 'AB = AC'];
    expect(decideSubmit('זווית ABC = זווית ACB', pre, 0).kind).toBe('already-follows');
  });
});

describe('#1182 — validity is never traded', () => {
  /** The figures the 2026-10-06 prototype lost seeds on: a tangent circle walked off its ring. */
  const FIGS: Array<[string[], number]> = [
    [['מרובע ABCD', 'מעגל M משיק לצלעות AB ו-BC'], 8],
    [['מרובע ABCD', 'הזווית בין BD ל-BA היא 30'], 15],
  ];
  for (const [lines, headWhole] of FIGS) {
    it(`${lines.join(' · ')}: whole at ≥ ${headWhole} of 24 seeds (HEAD's count)`, () => {
      expect(SEEDS.filter((s) => whole(derive(lines, s))).length).toBeGreaterThanOrEqual(headWhole);
    });
  }
});
