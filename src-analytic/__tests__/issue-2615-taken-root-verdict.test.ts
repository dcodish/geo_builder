/**
 * A CROSSING NEVER SETTLES ON AN EARLIER POINT WHILE ITS PAIR HAS A FREE ROOT (#2615, ADR-AG-350) — ADR-AG-263's start,
 * made a verdict.
 *
 * Book p3 ex. 21 (the ellipse sweep, 2026-10-30): the ellipse's a and b are fixed only by the JOINT solve of c, the
 * slope of F1B and «A על האליפסה». Measured at 216cf8bb: «E» answered «(5/2, 9/2) או (5, -3)» at seeds 0, 2–5 — A's
 * own coordinates offered as an option — and the last line was refused `crossing-already-named` at seed 1. The
 * ADR-AG-263 start reads the roots at the SEEDED figure, where A is not yet on the ellipse, and `crossing-distinct`
 * kept E apart from signature siblings only. 2-D (`otherCrossing`, ADR-045 R8) always takes the root A does not hold.
 * Seed sweeps per ADR-AG-144.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { drawableAt } from '../engine/evaluate';
import { fmtAnalytic } from '../format';
import saved from './fixtures/issue-2615-p3-21-chord.analytic.json';

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const kindWord = ((k: string) => k) as never;

/**
 * Every line through the REAL submit door; the recorded lines, the lines answered «already known» (not recorded, the
 * student carries on), and the first refusal, if any.
 */
function submitAll(lines: readonly string[], seed: number): { acc: string[]; known: string[]; refused?: string } {
  const acc: string[] = [];
  const known: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as { kind: string; line?: string; error?: { key: string } };
    if (v.kind === 'already-known') {
      known.push(line);
      continue;
    }
    if (v.kind !== 'record') return { acc, known, refused: `${line} → ${v.error?.key ?? v.kind}` };
    acc.push(v.line ?? line);
  }
  return { acc, known };
}
/** `known`: the lines the door answers «already known» — only a sign the figure already implies (ADR-AG-353 §6). */
const E = (lines: readonly string[], seed: number, known: readonly string[] = []) => {
  const r = submitAll(lines, seed);
  expect(r.refused, `seed ${seed}`).toBeUndefined();
  expect(r.known, `seed ${seed}`).toEqual(known);
  const d = derive(r.acc, seed);
  expect(d.faults, `seed ${seed}`).toEqual([]);
  return ask(d, 'E', fmtAnalytic, kindWord).value;
};

describe('#2615 — p3-21: E is the chord’s other end, never A', () => {
  it.each(SEEDS)('seed %i: «E» answers exactly (5, -3)', (seed) => {
    // «b > 0» after «x²/a²+y²/b²=1»: an ellipse's semi-axis letters are positive (ADR-AG-353 §6, R191), as «r > 0» is
    // after a radius (#2419) — answered «already known», never recorded; the student's sequence still builds E.
    expect(E(saved.lines, seed, ['b > 0'])).toBe('(5, -3)');
  });

  it.each(SEEDS.slice(0, 6))('seed %i: E is never within sight of A in any drawable configuration', (seed) => {
    const d = derive([...saved.lines], seed);
    for (let s = seed; s < seed + 4; s += 1) {
      const f = drawableAt(d.construction, s);
      const a = f.points.find((p) => p.id === 'A')!;
      const e = f.points.find((p) => p.id === 'E')!;
      expect(Math.hypot(a.x - e.x, a.y - e.y), `config ${s}`).toBeGreaterThan(1);
    }
  });
});

describe('#2615 — the class: a curve that reaches A only through a joint solve', () => {
  // r = c from the slope, then A on the circle: c = r = 25. The line through A and the centre — E is the antipode.
  const CIRCLE = ['נתון מעגל שמשוואתו (x-c)^2+y^2=r^2', 'c > 0', 'F(c,0)', 'B(0,-r)', 'שיפוע הישר FB הוא 1', 'A(1,7)', 'A על המעגל'];
  // s = p from the slope, then A on the parabola: p = s = 4.
  const PARABOLA = ['נתונה פרבולה שמשוואתה y^2=2px', 'p > 0', 'A(2,s)', 's > 0', 'A על הפרבולה', 'B(0,s)', 'F(p/2,0)', 'שיפוע הישר BF הוא -2'];

  it.each(SEEDS.slice(0, 6))('seed %i: the circle, through its centre — E = (49, -7) (refused before)', (seed) => {
    expect(E([...CIRCLE, 'הישר AF חותך את המעגל בנקודה E'], seed)).toBe('(49, -7)');
  });
  it.each(SEEDS.slice(0, 6))('seed %i: the circle, through P(1,1) — E = (1, -7) alone', (seed) => {
    expect(E([...CIRCLE, 'P(1,1)', 'הישר AP חותך את המעגל בנקודה E'], seed)).toBe('(1, -7)');
  });
  it.each(SEEDS.slice(0, 6))('seed %i: the parabola — E = (2/9, -4/3) alone', (seed) => {
    expect(E([...PARABOLA, 'P(1,1)', 'הישר AP חותך את הפרבולה בנקודה E'], seed)).toBe('(2/9, -4/3)');
  });
});

describe('#2615 — controls: what already took the other root keeps it, what was refused stays refused', () => {
  // («A על האליפסה» is refused `already-follows` on the numeric ellipse: A(2.5,4.5) is on it already.)
  it.each(SEEDS.slice(0, 6))('seed %i: the numeric ellipse', (seed) => {
    expect(E(['נתונה אליפסה שמשוואתה x^2/40+y^2/24=1', 'A(2.5,4.5)', 'F1(4,0)', 'הישר AF1 חותך את האליפסה בנקודה E'], seed)).toBe('(5, -3)');
  });
  it.each(SEEDS.slice(0, 6))('seed %i: one free parameter pinned by A alone (#1917’s shape)', (seed) => {
    expect(E(['נתונה אליפסה שמשוואתה x^2/a^2+y^2/24=1', 'A(2.5,4.5)', 'A על האליפסה', 'F1(4,0)', 'הישר AF1 חותך את האליפסה בנקודה E'], seed)).toBe('(5, -3)');
  });
  it('a chord whose both ends are named has no third crossing (#1893)', () => {
    const r = submitAll(['x^2+y^2=25', 'A(3,4)', 'C(-3,4)', 'הישר AC חותך את המעגל בנקודה E'], 0);
    expect(r.refused).toMatch(/third-crossing$/);
  });
  it('a tangent at a named point has no second crossing (#1924)', () => {
    const r = submitAll(['x^2+y^2=25', 'A(3,4)', 'P(7,1)', 'הישר AP חותך את המעגל בנקודה E'], 0);
    expect(r.refused).toMatch(/tangent-no-second-crossing$/);
  });
});
