/**
 * ONE RANK FOR THE ANALYTIC ENGINE: A DEPENDENT GIVEN IS DEPENDENT AT EVERY SEED (#2383, ADR-AG-309).
 *
 * Exam Q1 (summer 2024; #2379): the tangents at A and B meet at M, and «MA = MB». Once both tangents hold, MA = MB
 * IS the radical axis 4x + y + 3 = 0, so «M על הישר 4x+y+3=0» adds no constraint the figure does not already hold.
 * Measured at 3cae7f25: the freedom after that line read 0 at five seeds of six (1 at seed 2), and the locus answered
 * nothing. The equation Jacobian is rank 5 of 6 at every seed (σ₅ ≈ 0.8, σ₆ ≤ 1e-7); `freeRank` pivoted on the
 * FIRST entry above 1e-9 of the largest, inside the residue `solveLM` leaves at its 1e-7 acceptance. `nullDirection`
 * held a copy of the same elimination.
 *
 * Seed sweeps per ADR-AG-144.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { nullDirection } from '../engine/locus';
import { freeRank, jacobianRank, RANK_REL_TOL, SOLVE_TOL } from '../engine/solve';
import { fmtAnalytic } from '../format';
import locusLine from './fixtures/issue-2383-q1-locus-line.analytic.json';
import redundantLine from './fixtures/issue-2383-q1-redundant-line.analytic.json';

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const kindWord = ((k: string, n: number) =>
  n > 1
    ? ({ line: 'שני ישרים', circle: 'שני מעגלים' } as Record<string, string>)[k]
    : ({ line: 'ישר', circle: 'מעגל', parabola: 'פרבולה', ellipse: 'אליפסה' } as Record<string, string>)[k]) as never;

const Q1 = locusLine.lines.slice(0, 9);
const SECTION_A = locusLine.lines; // Q1 + «MA = MB»
const INLINE = 'M על הישר 4x+y+3=0';
const RADICAL_AXIS = 'ישר · 4x + y + 3 = 0';

/** The submit verdict of `line` after `before`, and the figure's freedom on each side of it. */
function step(before: readonly string[], line: string, seed: number) {
  const v = decideSubmit(line, [...before], seed) as { kind: string; line?: string };
  const after = v.kind === 'record' ? [...before, v.line ?? line] : [...before];
  return { kind: v.kind, before: derive([...before], seed).figure.carrierDof, after: derive(after, seed).figure.carrierDof, lines: after };
}
const locus = (lines: readonly string[], seed: number) =>
  ask(derive([...lines], seed), 'המקום הגיאומטרי של M', fmtAnalytic, kindWord).value;

describe('#2383 — the exam figure keeps its one degree of freedom', () => {
  it('both saved figures record line by line', () => {
    for (const fx of [locusLine, redundantLine]) {
      const acc: string[] = [];
      for (const line of fx.lines) {
        const v = decideSubmit(line, acc, fx.seed) as { kind: string; line?: string };
        expect(v.kind, `«${line}»`).toBe('record');
        acc.push(v.line ?? line);
      }
    }
  });

  it.each(SEEDS)('seed %i: section א — one freedom, the locus is the radical axis', (seed) => {
    expect(derive([...SECTION_A], seed).figure.carrierDof).toBe(1);
    expect(locus(SECTION_A, seed)).toBe(RADICAL_AXIS);
  });

  it.each(SEEDS)('seed %i: the inline line records (it draws a line) and keeps the freedom and the locus', (seed) => {
    const s = step(SECTION_A, INLINE, seed);
    expect(s.kind).toBe('record');
    expect(s.after).toBe(1);
    expect(locus(s.lines, seed)).toBe(RADICAL_AXIS);
  });

  it.each(SEEDS)('seed %i: the named line gains nothing, so «M על הישר l1» already follows', (seed) => {
    const named = [...SECTION_A, 'נתון הישר l1: 4x+y+3=0'];
    expect(step(named, 'M על הישר l1', seed).kind).toBe('already-follows');
  });

  it.each(SEEDS)('seed %i: the reverse order — the line first, then «MA = MB» already follows', (seed) => {
    expect(step([...Q1, INLINE], 'MA = MB', seed).kind).toBe('already-follows');
  });
});

describe('#2383 — the class: an implied given removes no freedom, whatever its shape', () => {
  it.each(SEEDS)('seed %i: «AK = 3» about A already on the radius-3 circle keeps the freedom', (seed) => {
    const s = step(Q1, 'AK = 3', seed);
    expect(s.after).toBe(s.before);
  });

  it.each(SEEDS)('seed %i: the plain bisector «MA = MB» + «M על הישר x=4» keeps one freedom', (seed) => {
    const s = step(['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'], 'M על הישר x=4', seed);
    expect(s.kind).toBe('record');
    expect(s.after).toBe(1);
  });

  it.each(SEEDS)('seed %i: a stated area restated as a line through the apex keeps one freedom', (seed) => {
    const s = step(['A(0,0)', 'B(4,0)', 'נקודה C', 'שטח המשולש ABC הוא 6'], 'C על הישר y=3', seed);
    expect(s.before).toBe(1);
    expect(s.after).toBe(1);
  });
});

describe('#2383 — the rank chokepoint, by hand', () => {
  const lin = (rows: number[][]) => (v: number[]) => rows.map((r) => r.reduce((s, a, i) => s + a * v[i], 0));
  const x = [0.3, -1.2, 2.5];

  it('the threshold is derived from the solver’s acceptance', () => {
    expect(RANK_REL_TOL).toBe(10 * SOLVE_TOL);
  });

  it('a row dependent up to a 1e-8 residue reads the deficient rank, with a 1-D null space', () => {
    const r = jacobianRank(x, lin([[1, 1, 0], [0, 1, 1], [1 + 1e-8, 2, 1]]));
    expect(r.rank).toBe(2);
    expect(r.nullBasis).toHaveLength(1);
    const d = r.nullBasis[0];
    expect(Math.abs(d[0] + d[1])).toBeLessThan(1e-6);
    expect(Math.abs(d[1] + d[2])).toBeLessThan(1e-6);
    expect(freeRank(x, lin([[1, 1, 0], [0, 1, 1], [1 + 1e-8, 2, 1]]))).toBe(1);
    expect(nullDirection(x, lin([[1, 1, 0], [0, 1, 1], [1 + 1e-8, 2, 1]]))).not.toBeNull();
  });

  it('a genuinely independent row of size 1e-3 is still counted', () => {
    expect(jacobianRank(x, lin([[1, 1, 0], [0, 1, 1], [1e-3, 0, 0]])).rank).toBe(3);
    expect(nullDirection(x, lin([[1, 1, 0], [0, 1, 1], [1e-3, 0, 0]]))).toBeNull();
  });

  it('the row ORDER does not decide the rank (no pivot order)', () => {
    const rows = [[1, 1, 0], [0, 1, 1], [1 + 1e-8, 2, 1]];
    for (const perm of [[0, 1, 2], [2, 0, 1], [1, 2, 0], [2, 1, 0]]) {
      expect(jacobianRank(x, lin(perm.map((i) => rows[i]))).rank).toBe(2);
    }
  });

  it('no rows: every direction is free; no unknowns: nothing is', () => {
    expect(jacobianRank(x, () => []).nullBasis).toHaveLength(3);
    expect(jacobianRank([], () => [1]).rank).toBe(0);
    expect(freeRank(x, () => [])).toBe(3);
  });
});
