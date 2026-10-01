/**
 * #1629 — a given that SELECTS among discrete configurations is not "already follows".
 *
 * Operator, 2026-10-01, playing PR #1625 T4: «נתון: שיפוע הצלע BC הוא -1/2» answered «זה כבר נובע
 * מהנתונים שכתבתם», added no row, and kept drawing the mirror square whose slope BC is +1/2.
 *
 * Measured on `main` @ 47e7d335 before the fix: the square below has two drawings at 0 DOF —
 * B(2,4), C(10,0) (slope BC −1/2) and B(−2,4), C(−10,0) (slope BC +1/2) — and `decideSubmit`
 * answered `already-follows` for BOTH slopes at every seed. The #1063 gate checked continuous freedom
 * only, and its "the given holds" condition was read off a trial derivation that re-searches seeds
 * until it does. The fix judges entailment over the configuration pool (ADR-AG-188).
 *
 * Every case calls `decideSubmit` / `derive` — the real path (#1102/#1118).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { configurationPool, drawableAt } from '../engine/evaluate';

const SQUARE = ['ריבוע ABCD', 'O(0,0)', 'O אמצע AB', 'E(0,-5)', 'E על הצלע AD', 'C על ציר ה-x'];

const pt = (d: ReturnType<typeof derive>['figure'], id: string) => {
  const p = d.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return p;
};

/** B's x-coordinate in every configuration of the pool — the side of the mirror each one is on. */
const poolBx = (lines: readonly string[]): number[] => {
  const c = derive(lines, 0).construction;
  const pool = configurationPool(c);
  pool.fill();
  return pool.ready().map((s) => pt(drawableAt(c, s), 'B').x);
};

describe('#1629 — a selecting given records; an entailed one still follows', () => {
  it('the square has BOTH mirror configurations before the slope is stated (the premise)', () => {
    const xs = poolBx(SQUARE);
    expect(xs.some((x) => Math.abs(x - 2) < 1e-4)).toBe(true);
    expect(xs.some((x) => Math.abs(x + 2) < 1e-4)).toBe(true);
  });

  for (const seed of [0, 1, 2]) {
    it(`«שיפוע הצלע BC הוא -1/2» RECORDS and the figure shows B(2,4), C(10,0) (seed ${seed})`, () => {
      const line = 'שיפוע הצלע BC הוא -1/2';
      expect(decideSubmit(line, SQUARE, seed).kind).toBe('record');
      const f = derive([...SQUARE, line], seed).figure;
      expect(pt(f, 'B').x).toBeCloseTo(2, 4);
      expect(pt(f, 'B').y).toBeCloseTo(4, 4);
      expect(pt(f, 'C').x).toBeCloseTo(10, 4);
      expect(pt(f, 'C').y).toBeCloseTo(0, 4);
    });

    it(`«שיפוע הצלע BC הוא 1/2» RECORDS and the figure shows the mirror B(−2,4), C(−10,0) (seed ${seed})`, () => {
      const line = 'שיפוע הצלע BC הוא 1/2';
      expect(decideSubmit(line, SQUARE, seed).kind).toBe('record');
      const f = derive([...SQUARE, line], seed).figure;
      expect(pt(f, 'B').x).toBeCloseTo(-2, 4);
      expect(pt(f, 'B').y).toBeCloseTo(4, 4);
      expect(pt(f, 'C').x).toBeCloseTo(-10, 4);
      expect(pt(f, 'C').y).toBeCloseTo(0, 4);
    });
  }

  it('once recorded, every configuration the tool can show satisfies the selecting given', () => {
    const xs = poolBx([...SQUARE, 'שיפוע הצלע BC הוא -1/2']);
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) expect(x).toBeCloseTo(2, 4);
  });

  it('a given TRUE in both configurations (|AB| = √80) still answers already-follows', () => {
    // The premise, measured: AB = √80 in each mirror (A = −B, B = (±2, 4)).
    const c = derive(SQUARE, 0).construction;
    const pool = configurationPool(c);
    pool.fill();
    for (const s of pool.ready()) {
      const f = drawableAt(c, s);
      expect(Math.hypot(pt(f, 'A').x - pt(f, 'B').x, pt(f, 'A').y - pt(f, 'B').y)).toBeCloseTo(Math.sqrt(80), 4);
    }
    for (const seed of [0, 1, 2]) {
      expect(decideSubmit('אורך הצלע AB הוא √80', SQUARE, seed).kind).toBe('already-follows');
    }
  });
});
