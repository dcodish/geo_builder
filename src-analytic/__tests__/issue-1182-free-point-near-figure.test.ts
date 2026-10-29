/**
 * #1182 — A FREE POINT IS DRAWN NEAR THE FIGURE THE STUDENT STATED ([ADR-AG-347](../../docs/06c-decisions-analytic.md#adr-ag-347)).
 *
 * Operator, round #1181 T28 and round #1193 T10: *"there is no point in showing such a point M which is so
 * far away from A and B that it's impossible to see what's happening. seeds should always try to find a
 * close point and work backwards if no choice."* Ruled 2026-09-20 *"change the solve"*, 2026-10-28
 * "1182 - A" (inside `solveLM`, no slower), 2026-10-29 card 2 A (variety bar: 10 distinct places).
 *
 * Root cause: on an under-determined figure `solveLM`'s damped step is the shortest step from the CURRENT
 * iterate, so the free directions drift and the solve stops wherever the descent lands on the solution
 * set. At `caf00532` «A(0,0) · B(6,8) · נקודה M · MA = MB» seeded M beside the figure at seed 0 and
 * stopped it at (−13.8, 16.6): A and B were 39 % of the view, and 3 of 24 configurations were under half.
 *
 * Every lock calls `derive` / `solveLM`; none re-implements the anchored step.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { solveLM } from '../engine/solve';
import { ask } from '../app/ask';
import { fmtAnalytic } from '../format';
import operatorFixture from './fixtures/issue-1182-free-point-near-figure.analytic.json';

type D = ReturnType<typeof derive>;
const OPERATOR = ['A(0,0)', 'B(6,8)', 'נקודה M', 'MA = MB'];
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const at = (d: D, id: string) => d.figure.points.find((p) => p.id === id)!;
/** The stated figure's share of the view: |AB| over the larger side of the box the canvas frames. */
const share = (d: D) => 10 / Math.max(d.box.maxX - d.box.minX, d.box.maxY - d.box.minY);
const maxMove = (a: D, b: D) =>
  Math.max(0, ...a.figure.points.map((p) => {
    const q = b.figure.points.find((x) => x.id === p.id);
    return q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
  }));
const whole = (d: D) =>
  d.figure.unsatisfied.length === 0 && d.figure.selectorsOk
  && d.figure.ringFaults.every((r) => r.violation === 'trapezoid-is-parallelogram');

describe('#1182 — solveLM anchors its Newton step at the start', () => {
  /** |MA| − |MB| with A(0,0), B(6,8): one equation in two unknowns, the bisector 3x + 4y = 25. */
  const bisector = ([x, y]: number[]) => [Math.hypot(x, y) - Math.hypot(x - 6, y - 8)];
  /** The foot of the perpendicular from `p` to 3x + 4y = 25 — the nearest member of the solution set. */
  const foot = ([x, y]: number[]) => {
    const t = (3 * x + 4 * y - 25) / 25;
    return [x - 3 * t, y - 4 * t];
  };

  it('anchored, the solve lands on the member of the solution set nearest its start', () => {
    for (const start of [[-3.7, -4.3], [12, -6], [-6, 14], [1.9, 5.6]]) {
      const r = solveLM(start, bisector, 120, 2);
      expect(r.ok, `start ${start}`).toBe(true);
      const [fx, fy] = foot(start);
      expect(Math.hypot(r.values[0] - fx, r.values[1] - fy), `start ${start}`).toBeLessThan(0.05);
    }
  });

  it('`anchored = 0` is the plain damped step, unchanged', () => {
    const start = [-3.7, -4.3];
    expect(solveLM(start, bisector, 120, 0)).toEqual(solveLM(start, bisector, 120));
  });

  it('an anchored solve never trades residual for nearness: it converges to the same tolerance', () => {
    for (const start of [[-3.7, -4.3], [12, -6]]) {
      const r = solveLM(start, bisector, 120, 2);
      expect(Math.abs(bisector(r.values)[0])).toBeLessThan(1e-6);
    }
  });
});

describe('#1182 — the operator\'s figure, «A(0,0) · B(6,8) · נקודה M · MA = MB»', () => {
  const ds = SEEDS.map((s) => derive(OPERATOR, s));

  it('the fixture is the operator\'s sequence', () => {
    expect(operatorFixture.lines).toEqual(OPERATOR);
  });

  it('the opening configuration shows A and B in a usable share of the view (a ratio, not a coordinate bound)', () => {
    expect(share(ds[0])).toBeGreaterThan(0.5);
  });

  it('at every one of 24 configurations the stated points take at least half the view', () => {
    const small = SEEDS.filter((s) => share(ds[s]) < 0.5);
    expect(small, `seeds under half: ${small.join(', ')}`).toEqual([]);
  });

  it('M is on the bisector at every configuration (nearness never trades the given)', () => {
    for (const s of SEEDS) {
      const m = at(ds[s], 'M');
      expect(Math.abs(Math.hypot(m.x, m.y) - Math.hypot(m.x - 6, m.y - 8)), `seed ${s}`).toBeLessThan(1e-5);
      expect(ds[s].figure.unsatisfied, `seed ${s}`).toEqual([]);
    }
  });

  it('ADR-052: «הציגו תצורה אחרת» still moves M — at least 10 places 1 unit apart over 24 seeds (ruling 2026-10-29)', () => {
    const distinct: { x: number; y: number }[] = [];
    for (const d of ds) {
      const m = at(d, 'M');
      if (distinct.every((q) => Math.hypot(m.x - q.x, m.y - q.y) > 1)) distinct.push(m);
    }
    expect(distinct.length).toBeGreaterThanOrEqual(10);
    // …and consecutive presses move it.
    for (let s = 1; s < SEEDS.length; s += 1) {
      const a = at(ds[s - 1], 'M');
      const b = at(ds[s], 'M');
      expect(Math.hypot(a.x - b.x, a.y - b.y), `seed ${s - 1} → ${s}`).toBeGreaterThan(1e-3);
    }
  });

  it('the locus of M is one answer at every configuration', () => {
    const kind = ((k: string) => (k === 'line' ? 'ישר' : k)) as never;
    const answers = new Set(SEEDS.map((s) => ask(ds[s], 'המקום הגיאומטרי של M', fmtAnalytic, kind).value));
    expect([...answers]).toEqual(['ישר · 3x + 4y - 25 = 0']);
  });
});

describe('#1182 — a fact that adds nothing does not move the figure (#1264 ①, derive level)', () => {
  const moves = (pre: string[], line: string) => [0, 1, 2, 3, 4, 5].map((s) => maxMove(derive(pre, s), derive([...pre, line], s)));

  it('«מלבן ABCD» + «AB מאונך ל-BC» moves no point more than 0.2 (it moved up to 24.9)', () => {
    for (const v of moves(['מלבן ABCD'], 'AB מאונך ל-BC')) expect(v).toBeLessThanOrEqual(0.2);
  });

  it('«משולש ABC · AB = AC» + the base angles moves no point more than 0.05 (it moved up to 0.148)', () => {
    for (const v of moves(['משולש ABC', 'AB = AC'], 'זווית ABC = זווית ACB')) expect(v).toBeLessThanOrEqual(0.05);
  });

  it('«משולש ABC · זווית ABC = 90» + «AB מאונך ל-BC» stays put (the #1264 sequence)', () => {
    for (const v of moves(['משולש ABC', 'זווית ABC = 90'], 'AB מאונך ל-BC')) expect(v).toBeLessThan(1e-6);
  });
});

describe('#1182 — the whole-rate is not reduced where an earlier projection lost seeds', () => {
  it('«מרובע ABCD · מעגל M משיק לצלעות AB ו-BC» keeps at least 8 whole configurations of 24', () => {
    const w = SEEDS.filter((s) => whole(derive(['מרובע ABCD', 'מעגל M משיק לצלעות AB ו-BC'], s))).length;
    expect(w).toBeGreaterThanOrEqual(8);
  });

  it('«מרובע ABCD · הזווית בין BD ל-BA היא 30» keeps at least 15 whole configurations of 24', () => {
    const w = SEEDS.filter((s) => whole(derive(['מרובע ABCD', 'הזווית בין BD ל-BA היא 30'], s))).length;
    expect(w).toBeGreaterThanOrEqual(15);
  });
});
