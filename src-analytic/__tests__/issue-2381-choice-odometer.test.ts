/**
 * #2381 ([ADR-AG-302](../../docs/06c-decisions-analytic.md#adr-ag-302)) — every static discrete axis is one digit of
 * one odometer: constraint choices, region choices and crossing pairs.
 *
 * Measured before (3cae7f25): two radius-10 circles tangent to M at A took the SAME side in all 24 configurations
 * (N₁ = N₂ at (−5,0) or (15,0)), and «N1 משמאל ל-N2» was refused `unsatisfiable` — every choice read `seed % n`, so
 * only the diagonal combinations were ever drawn, and the retry walked `seed + k < max n`, the diagonal again. Two
 * right triangles reached 3 of 9 seats, three tangent circles 2 of 8.
 *
 * Every case runs the real path: `decideSubmit` per line, `derive` → `drawableAt` over the configuration pool.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { unstatedChoices } from '../engine/unstatedChoices';
import { derive } from '../engine/derive';
import { assignmentAt } from '../engine/discreteAxes';
import { drawableAt, POOL_SIZE, type Figure } from '../engine/evaluate';
import repro from './fixtures/issue-2381-q3-repro-left-of.analytic.json';
import exam from './fixtures/issue-2381-q3-exam-centres.analytic.json';

const REPRO = repro.lines.slice(0, 6);
const at = (f: Figure, id: string) => {
  const p = f.points.find((q) => q.id === id);
  return p ? [Math.round(p.x * 1000) / 1000 + 0, Math.round(p.y * 1000) / 1000 + 0] : null;
};
const recordsEveryLine = (lines: readonly string[]) => {
  for (let i = 0; i < lines.length; i += 1) expect(decideSubmit(lines[i], lines.slice(0, i), 0).kind, lines[i]).toBe('record');
};
/** The distinct readings the pool's admitted configurations give. */
const poolReadings = (lines: readonly string[], read: (f: Figure) => string) => {
  const d = derive(lines, 0);
  expect(d.faults).toEqual([]);
  const seen = new Set<string>();
  for (let s = 0; s < POOL_SIZE; s += 1) {
    const f = drawableAt(d.construction, s);
    if (f.unsatisfied.length === 0 && f.selectorsOk) seen.add(read(f));
  }
  return seen;
};
const side = (f: Figure, id: string) => (at(f, id)![0] < 0 ? 'L' : 'R');

describe('#2381 — the operator\'s Q3 ב lines', () => {
  it('«N1 משמאל ל-N2» records (fixture), with N₁ = (−5, 0) and N₂ = (15, 0) in every admitted configuration', () => {
    recordsEveryLine(repro.lines);
    const seen = poolReadings(repro.lines, (f) => JSON.stringify([at(f, 'N1'), at(f, 'N2')]));
    expect([...seen]).toEqual([JSON.stringify([[-5, 0], [15, 0]])]);
  });

  it('the exam\'s own centres (fixture): the last line records, N₁ = (−4, −12) and N₂ = (12, 0)', () => {
    recordsEveryLine(exam.lines);
    const seen = poolReadings(exam.lines, (f) => JSON.stringify([at(f, 'N1'), at(f, 'N2')]));
    expect([...seen]).toEqual([JSON.stringify([[-4, -12], [12, 0]])]);
  });

  it('without the side line the pool holds all four combinations', () => {
    expect([...poolReadings(REPRO, (f) => side(f, 'N1') + side(f, 'N2'))].sort()).toEqual(['LL', 'LR', 'RL', 'RR']);
  });

  it('the opening drawing never stacks N₁ on N₂ (R61): another combination is opened on', () => {
    const d = derive(REPRO, 0);
    expect(at(d.figure, 'N1')).not.toEqual(at(d.figure, 'N2'));
  });

  it('REFUSAL — «N1 משמאל ל-N2» and «N2 משמאל ל-N1» together stay refused', () => {
    const lines = [...repro.lines, 'N2 משמאל ל-N1'];
    expect(decideSubmit(lines[7], lines.slice(0, 7), 0).kind).toBe('refused');
  });
});

describe('#2381 — the class: every combination of every kind of axis is reachable', () => {
  it('three radius-10 circles tangent at A: 8 of 8', () => {
    const lines = [...REPRO, 'נתון מעגל שמרכזו N3 ורדיוסו 10', 'מעגל N3 משיק למעגל M בנקודה A'];
    expect(poolReadings(lines, (f) => side(f, 'N1') + side(f, 'N2') + side(f, 'N3')).size).toBe(8);
  });

  it('two right triangles: 9 of 9 seats', () => {
    const lines = ['משולש ABC ישר זווית', 'A(0,0)', 'B(4,0)', 'משולש DEF ישר זווית', 'D(10,0)', 'E(14,0)'];
    const right = (f: Figure, v: string, u: string, w: string) => {
      const [p, q, r] = [at(f, v)!, at(f, u)!, at(f, w)!];
      return Math.abs((q[0] - p[0]) * (r[0] - p[0]) + (q[1] - p[1]) * (r[1] - p[1])) < 1e-2;
    };
    const seat = (f: Figure, [a, b, c]: string) => (right(f, a, b, c) ? a : right(f, b, a, c) ? b : c);
    expect(poolReadings(lines, (f) => seat(f, 'ABC') + seat(f, 'DEF')).size).toBe(9);
  });

  it('a tangency choice × a crossing pair: 4 of 4', () => {
    const lines = [...REPRO.slice(0, 4), 'הישר y = 1 חותך את המעגל M בנקודות P ו-Q'];
    expect(poolReadings(lines, (f) => side(f, 'N1') + (at(f, 'P')![0] < 0 ? 'P' : 'Q')).size).toBe(4);
  });
});

describe('#2381 — controls: one axis reads exactly as before', () => {
  it('one choice of n options takes `choiceSeed mod n` (the old rule, unchanged)', () => {
    for (const lines of [['משולש ABC ישר זווית'], ['משולש ABC', 'sin∢ABC = 0.5'], ['משולש קהה זווית ABC']]) {
      const c = derive(lines, 0).construction;
      const n = assignmentAt(c, 0).radices[0];
      expect(n, lines.join(' · ')).toBeGreaterThan(1);
      for (let s = 0; s < POOL_SIZE; s += 1) expect(assignmentAt(c, s).digits).toEqual([s % n]);
    }
  });

  it('crossing pairs only: pair k swaps on bit k of the seed (#1539\'s rule, absorbed)', () => {
    const c = derive(['מעגל I: x^2+y^2=25', 'מעגל II: (x-4)^2+(y-1)^2=9', 'המעגל I חותך את המעגל II בנקודות A ו-B', 'מעגל III: (x+4)^2+y^2=9', 'המעגל I חותך את המעגל III בנקודות C ו-D'], 0).construction;
    for (let s = 0; s < 8; s += 1) expect(assignmentAt(c, s).digits).toEqual([s & 1, (s >> 1) & 1]);
  });

  it('seed 0 is all zeros for every figure', () => {
    const c = derive(['משולש ABC ישר זווית', 'משולש DEF שווה שוקיים', 'משולש קהה זווית GHK'], 0).construction;
    expect(assignmentAt(c, 0).digits.every((x) => x === 0)).toBe(true);
  });

  it('ADR-AG-227 still holds: «sin∢ABC = ½» draws its obtuse option (the spread preference never crosses)', () => {
    const deg = new Set<number>();
    for (let s = 0; s < 4; s += 1) {
      const f = derive(['משולש ABC', 'sin∢ABC = 0.5'], s).figure;
      const [b, a, c] = [at(f, 'B')!, at(f, 'A')!, at(f, 'C')!];
      const u = [a[0] - b[0], a[1] - b[1]];
      const v = [c[0] - b[0], c[1] - b[1]];
      deg.add(Math.round((Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(u[0], u[1]) / Math.hypot(v[0], v[1])) * 180) / Math.PI));
    }
    expect([...deg].sort()).toEqual([150, 30]);
  });

  it('the readers name the option the canvas drew, for the SECOND choice of a pair too', () => {
    const lines = ['משולש ABC שווה שוקיים', 'משולש DEF שווה שוקיים'];
    const len = (f: Figure, [p, q]: readonly string[]) => Math.hypot(at(f, p)![0] - at(f, q)![0], at(f, p)![1] - at(f, q)![1]);
    const drawnPairs = new Set<string>();
    for (let s = 0; s < 9; s += 1) {
      const d = derive(lines, s);
      const notes = unstatedChoices(d);
      expect(notes.length, `seed ${s}`).toBe(2);
      for (const n of notes) {
        if (n.kind !== 'equal-pair') throw new Error(n.kind);
        for (const [u, v] of n.pairs) expect(Math.abs(len(d.figure, u) - len(d.figure, v)), `seed ${s}`).toBeLessThan(1e-2);
      }
      drawnPairs.add(JSON.stringify(notes.map((n) => (n.kind === 'equal-pair' ? n.pairs : null))));
    }
    // …and the two triangles' notes are not locked together: more than the three diagonal readings occur.
    expect(drawnPairs.size).toBeGreaterThan(3);
  });
});
