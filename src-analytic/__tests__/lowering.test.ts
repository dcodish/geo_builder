/**
 * A COORDINATE STATEMENT ABOUT A POINT THAT EXISTS (#1046, #1040) — and the blame that makes a false
 * one reportable (#1079).
 *
 * Operator, 2026-09-15: *"how would i be able to say that the x value of M is 3 if it refuses to
 * draw M again. it should know I am referring to the existing M"*.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';

const PINNED = ['A(0,0)', 'B(6,0)', 'C(3,6)', 'M מפגש התיכונים במשולש ABC'];
const codes = (lines: string[]) => derive(lines, 0).faults.map((f) => f.code);
const at = (lines: string[], id: string, seed = 0) => derive(lines, seed).figure.points.find((p) => p.id === id)!;

describe('#1046 — a coordinate about an existing point is a STATEMENT about it', () => {
  it('accepts the true one, and keeps ONE M', () => {
    const d = derive([...PINNED, 'M(3,2)'], 0);
    expect(d.faults).toEqual([]);
    // The invariant #1038 was protecting, untouched: one name, one object.
    expect(d.construction.objects.filter((o) => o.id === 'M')).toHaveLength(1);
    expect(d.figure.points.filter((p) => p.id === 'M')).toHaveLength(1);
  });

  it('REFUSES the false one, naming the statement', () => {
    // The centroid of this triangle is (3,2). The student says (9,9); the figure says no.
    expect(codes([...PINNED, 'M(9,9)'])).toEqual(['unsatisfiable']);
  });

  it('and on an UNDETERMINED figure it is a constraint the solve honours', () => {
    // The issue proposed two dispositions — verify when determined, constrain when not — and one
    // constraint kind is both: here the vertices move until the centroid really is at (3,2).
    const lines = ['משולש ABC', 'M מפגש התיכונים במשולש ABC', 'M(3,2)'];
    expect(derive(lines, 0).faults).toEqual([]);
    for (const seed of [0, 1, 2]) {
      const m = at(lines, 'M', seed);
      expect(m.x).toBeCloseTo(3, 4);
      expect(m.y).toBeCloseTo(2, 4);
    }
  });

  it('leaves a free VERTEX being placed as the substitution it always was', () => {
    // «משולש ABC» then «A(1,1)» consumes two degrees of freedom exactly; nothing is searched for.
    const d = derive(['משולש ABC', 'A(1,1)'], 0);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.find((o) => o.id === 'A')?.kind).toBe('point');
  });

  it('and a genuine second DEFINITION is still a clash', () => {
    // The asymmetry is the point: naming M and then saying M is the centroid defines M twice.
    expect(codes(['A(0,0)', 'B(6,0)', 'C(3,6)', 'M(3,5)', 'M מפגש התיכונים במשולש ABC'])).toEqual([
      'name-kind-clash',
    ]);
  });
});

describe('#1040 — ONE coordinate, in words', () => {
  it('«שיעור ה-x של M הוא 3» — the operator’s own sentence', () => {
    expect(codes([...PINNED, 'שיעור ה-x של M הוא 3'])).toEqual([]);
    expect(codes([...PINNED, 'שיעור ה-x של M הוא 9'])).toEqual(['unsatisfiable']);
  });

  it('leaves the OTHER component free, which is the whole difference from «M(3,2)»', () => {
    const lines = ['שיעור ה-y של B הוא 4'];
    expect(derive(lines, 0).faults).toEqual([]);
    expect(at(lines, 'B').y).toBeCloseTo(4, 6);
    // Free: it moves between configurations (ADR-052).
    expect(at(lines, 'B', 0).x).not.toBeCloseTo(at(lines, 'B', 1).x, 6);
  });

  it('accepts the spellings the corpus uses, and the English', () => {
    for (const line of ['שיעור ה-x של B הוא 2', 'ערך ה-x של B הוא 2', 'the x value of B is 2']) {
      const d = derive([line], 0);
      expect(d.faults, line).toEqual([]);
      expect(d.figure.points.find((p) => p.id === 'B')!.x).toBeCloseTo(2, 6);
    }
  });
});

describe('#1079 — a constraint created at M1 is blamed on the line that stated it', () => {
  /**
   * Found by testing the FALSE version of #1046's new sentence. `derive` blamed an unsatisfiable
   * constraint through a map built from the PARSER's facts, so a constraint synthesised inside
   * `applyFact` was not in it and the fault was silently skipped — the engine DETECTED it every time
   * (`unsatisfied` was 1) and said nothing.
   *
   * Four sentence kinds resolve their references at M1, and every one of them was unreportable.
   */
  const FALSE_ON_A_DETERMINED_FIGURE: Array<[string, string[]]> = [
    ['«זווית B ישרה»', ['A(0,0)', 'B(4,0)', 'C(1,3)', 'משולש ABC', 'זווית B ישרה']],
    ['«שטח הדלתון הוא 999»', ['A(0,0)', 'B(4,0)', 'C(4,4)', 'D(0,4)', 'דלתון ABCD', 'שטח הדלתון הוא 999']],
    ['«M(9,9)» on a centroid', [...PINNED, 'M(9,9)']],
    ['«שיעור ה-x של M הוא 9»', [...PINNED, 'שיעור ה-x של M הוא 9']],
  ];

  it.each(FALSE_ON_A_DETERMINED_FIGURE)('%s is REFUSED, not accepted in silence', (_name, lines) => {
    expect(derive(lines, 0).faults.map((f) => f.code)).toContain('unsatisfiable');
  });

  it('the parser-lowered spelling of the same given behaves identically', () => {
    // The two spellings diverged for a day; this is what stops them diverging again.
    const resolved = codes(['A(0,0)', 'B(4,0)', 'C(1,3)', 'משולש ABC', 'זווית B ישרה']);
    const spelled = codes(['A(0,0)', 'B(4,0)', 'C(1,3)', 'משולש ABC', 'זווית ABC ישרה']);
    expect(resolved).toEqual(spelled);
  });

  it('and a TRUE resolved given is still accepted', () => {
    expect(codes(['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC', 'זווית A ישרה'])).toEqual([]);
  });

  it('blames the right LINE, not merely some line', () => {
    const d = derive([...PINNED, 'M(9,9)'], 0);
    expect(d.faults[0].index).toBe(4);
    expect(d.faults[0].detail).toBe('M(9,9)');
  });
});
