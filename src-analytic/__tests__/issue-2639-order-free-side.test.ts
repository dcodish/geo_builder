/**
 * THE FREE SIDE OF AN ORDER IS PLACED AFTER ITS BOUND (#2639, ADR-AG-419).
 *
 * Measured at c0029d25: «A מעל C» over a C the solve puts on (0, 10) was refused `unsatisfiable` at every seed. C is a free
 * vertex, so #1462's swap gave it A's lower start, C descended to the root (0, 0) «C מעל ציר ה-x» excludes, and at the
 * seeds where C did land on (0, 10) A's sample lay below it. Every case runs the real door: `decideSubmit`, then `derive`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { drawableAt } from '../engine/evaluate';
import above from './fixtures/issue-2639-above-solved-point.analytic.json';
import chain from './fixtures/issue-2639-order-chain.analytic.json';

const SEEDS = [0, 1, 2, 3, 4];
const BASE = above.lines.slice(0, -1);
const CIRCLE = BASE[0];

function submitAll(lines: readonly string[], seed: number): { acc: string[]; refused?: string } {
  const acc: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as { kind: string; line?: string };
    if (v.kind !== 'record') return { acc, refused: line };
    acc.push(v.line ?? line);
  }
  return { acc };
}
function built(lines: readonly string[], seed: number) {
  const r = submitAll(lines, seed);
  expect(r.refused, `seed ${seed}`).toBeUndefined();
  const d = derive(r.acc, seed);
  expect(d.faults, `seed ${seed}`).toEqual([]);
  return d;
}
const pt = (d: { figure: { points: { id: string; x: number; y: number }[] } }, id: string) => d.figure.points.find((p) => p.id === id)!;

describe('#2639 — an order against a point the solve settles', () => {
  it.each(SEEDS)('seed %i: «A מעל C» records, A above C = (0, 10)', (seed) => {
    const d = built(above.lines, seed);
    expect(pt(d, 'C').y).toBeCloseTo(10, 4);
    expect(Math.abs(pt(d, 'C').x)).toBeLessThan(1e-4);
    expect(pt(d, 'A').y).toBeGreaterThan(10);
  });

  it('every configuration holds it, and «הציגו תצורה אחרת» still moves A', () => {
    const d = built(above.lines, 0);
    const ys = new Set<string>();
    for (let s = 0; s < 24; s += 1) {
      const f = drawableAt(d.construction, s);
      const a = f.points.find((p) => p.id === 'A')!;
      const c = f.points.find((p) => p.id === 'C')!;
      expect(c.y, `config ${s}`).toBeCloseTo(10, 4);
      expect(a.y, `config ${s}`).toBeGreaterThan(c.y);
      ys.add(a.y.toFixed(3));
    }
    expect(ys.size).toBeGreaterThan(1);
  });

  it.each(SEEDS)('seed %i: stability — the line does not move what stood before it', (seed) => {
    const before = built(BASE, seed);
    const after = built(above.lines, seed);
    expect(pt(after, 'C').x).toBeCloseTo(pt(before, 'C').x, 6);
    expect(pt(after, 'C').y).toBeCloseTo(pt(before, 'C').y, 6);
    expect(after.figure.curves.length).toBe(before.figure.curves.length);
  });
});

describe('#2639 — the class', () => {
  it.each(SEEDS)('seed %i: the other spellings and directions', (seed) => {
    expect(pt(built([...BASE, 'A מתחת ל-C'], seed), 'A').y).toBeLessThan(10);
    expect(pt(built([...BASE, 'x_A > x_C'], seed), 'A').x).toBeGreaterThan(0);
    expect(pt(built([...BASE, 'A משמאל ל-C'], seed), 'A').x).toBeLessThan(0);
    const d = built([...BASE, 'C מעל A'], seed);
    expect(pt(d, 'A').y).toBeLessThan(pt(d, 'C').y);
  });

  it.each(SEEDS)('seed %i: a bound placed by a crossing', (seed) => {
    const d = built([CIRCLE, 'הישר y=x+1 חותך את המעגל בנקודות P ו-Q', 'A מעל P', 'A מעל Q'], seed);
    expect(pt(d, 'A').y).toBeGreaterThan(Math.max(pt(d, 'P').y, pt(d, 'Q').y));
  });

  it.each(SEEDS)('seed %i: two bounds, the point between them', (seed) => {
    const d = built([...BASE, 'D(1,20)', 'A מעל C', 'A מתחת ל-D'], seed);
    const y = pt(d, 'A').y;
    expect(y).toBeGreaterThan(10);
    expect(y).toBeLessThan(20);
  });

  it.each(SEEDS)('seed %i: a chain over the solved point, either order of the lines', (seed) => {
    for (const lines of [chain.lines, [...BASE, 'B מעל A', 'A מעל C']]) {
      const d = built(lines, seed);
      expect(pt(d, 'A').y).toBeGreaterThan(pt(d, 'C').y);
      expect(pt(d, 'B').y).toBeGreaterThan(pt(d, 'A').y);
    }
  });

  it('a stated bound still holds at every seed, and two free points still order by #1462', () => {
    for (const seed of SEEDS) {
      const d = built(['C(0,10)', 'A מעל C'], seed);
      expect(pt(d, 'A').y).toBeGreaterThan(10);
      const f = built(['נקודה A', 'נקודה B', 'A מעל B'], seed);
      expect(pt(f, 'A').y).toBeGreaterThan(pt(f, 'B').y);
    }
  });
});

describe('#2639 — an order that cannot hold is still refused', () => {
  it.each(SEEDS)('seed %i: «A מעל C» · «A מתחת ל-C»', (seed) => {
    expect(submitAll([...above.lines, 'A מתחת ל-C'], seed).refused).toBe('A מתחת ל-C');
  });
  it.each(SEEDS)('seed %i: a cycle of orders', (seed) => {
    expect(submitAll([...chain.lines, 'C מעל B'], seed).refused).toBe('C מעל B');
  });
  it.each(SEEDS)('seed %i: two bounds with no room', (seed) => {
    expect(submitAll([...BASE, 'D(1,5)', 'A מעל C', 'A מתחת ל-D'], seed).refused).toBe('A מתחת ל-D');
  });
});
