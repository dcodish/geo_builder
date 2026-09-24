/**
 * #1331 — «∠ABC = ∠ACB» was «לא הצלחתי להבין את המשפט» in every spelling. Analytic's angle grammar was
 * exactly one member wide: a RIGHT angle.
 *
 * Ruled 2026-09-21 (the numeric angle, round #1332 T19) and 2026-09-24 (both halves): a numeric angle
 * «זווית ABC = 60» / «∠ABC = 60», and an angle equality or ratio «∠ABC = ∠ACB» / «∠ABC = 2∠ACB», each a
 * residual in the solve (`angle`, `angle-ratio`), read through the SAME noun atom as the right angle.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { parseLine } from '../parser/parseAnalytic';
import { reportedDof } from '../engine/carriers';

const angleDeg = (lines: string[], v: string, a: string, b: string, seed = 0) => {
  const d = derive(lines, seed);
  const P = (id: string) => d.figure.points.find((q) => q.id === id)!;
  const V = P(v), A = P(a), B = P(b);
  const ux = A.x - V.x, uy = A.y - V.y, wx = B.x - V.x, wy = B.y - V.y;
  return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
};

const TRI = ['משולש ABC'];

describe('#1331 — the operator\'s sentence and its spellings now parse', () => {
  it.each([
    '∠ABC = ∠ACB',
    'זווית ABC = זווית ACB',
    'זווית ABC שווה לזווית ACB',
    'angle ABC = angle ACB',
    '∠ABC = 60',
    'זווית ABC = 60',
    'זווית ABC היא 60',
    '∠ABC = 60°',
    'angle ABC is 60',
    '∠ABC = 2∠ACB',
  ])('«%s» is a constraint, not not-handled', (line) => {
    const r = parseLine(line);
    expect(r.ok, line).toBe(true);
  });

  it('«∠ABC = 90» keeps its right-angle lowering (perpendicular), read before the numeric rule', () => {
    const r = parseLine('∠ABC = 90');
    expect(r.ok && JSON.stringify(r)).toContain('perpendicular');
  });
});

describe('#1331 — the figure HONOURS the stated angle, at every seed', () => {
  it('«∠ABC = 60»: the angle at B is 60°', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const d = derive([...TRI, '∠ABC = 60'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(angleDeg([...TRI, '∠ABC = 60'], 'B', 'A', 'C', seed), `seed ${seed}`).toBeCloseTo(60, 4);
    }
  });

  it('«∠ABC = ∠ACB» (the operator\'s case, after AB = AC): the base angles are equal', () => {
    const lines = [...TRI, 'AB = AC', '∠ABC = ∠ACB'];
    const d = derive(lines, 0);
    expect(d.faults).toEqual([]);
    expect(angleDeg(lines, 'B', 'A', 'C')).toBeCloseTo(angleDeg(lines, 'C', 'A', 'B'), 4);
  });

  it('«∠ABC = 2∠ACB»: the ratio holds', () => {
    const lines = [...TRI, '∠ABC = 2∠ACB'];
    expect(derive(lines, 0).faults).toEqual([]);
    expect(angleDeg(lines, 'B', 'A', 'C')).toBeCloseTo(2 * angleDeg(lines, 'C', 'A', 'B'), 4);
  });

  it('a stated angle CONSUMES one degree of freedom', () => {
    const before = derive(TRI, 0);
    const after = derive([...TRI, '∠ABC = 60'], 0);
    expect(reportedDof(after.construction, after.figure.carrierDof)).toBe(reportedDof(before.construction, before.figure.carrierDof) - 1);
  });

  it('an impossible angle is refused naming the statement, never drawn green', () => {
    const v = decideSubmit('∠ABC = 200', TRI, 0);
    expect(v.kind).toBe('refused');
  });
});

describe('#1331 — through the real submit gate', () => {
  it.each(['∠ABC = 60', '∠ABC = ∠ACB', '∠ABC = 2∠ACB', 'זווית ABC היא 40'])('«%s» after «משולש ABC» is recorded', (line) => {
    expect(decideSubmit(line, TRI, 0).kind).toBe('record');
  });
});
