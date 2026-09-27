/**
 * A GIVEN THAT CAN HOLD ONLY OUTSIDE A DECLARED DOMAIN IS REFUSED, NEVER MET THERE (#1493, ADR-AG-162).
 *
 * Found while building #1324: «נתון מעגל O» · three «על המעגל» · «O אמצע BD» over givens that cannot hold built
 * with NO fault. The solve drove the radius (declared positive) to −1.0; at a negative radius the circle is
 * VACANT, and an incidence on a vacant circle judges nothing (ADR-AG-008) — so every sentence read as met,
 * and the student saw a figure with no circle and no refusal. Measured sibling, no circle at all: «a > 0 ·
 * A(a,0) · A על הישר x=-3» drew a = −3, silently outside the domain the student declared.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';

const faults = (lines: string[]) => derive(lines, 0).faults.map((f) => [f.index, f.code]);

describe('#1493 — the drawn effort stays inside every declared domain', () => {
  it('the issue’s case: three incidences and a midpoint that cannot hold are refused, and the circle is drawn', () => {
    const d = derive(['A(0,4)', 'B(-3,0)', 'D(3,0)', 'נתון מעגל O', 'A על המעגל', 'B על המעגל', 'D על המעגל', 'O אמצע BD'], 0);
    expect(d.faults.length).toBeGreaterThan(0);
    expect(d.faults.every((f) => f.code === 'unsatisfiable')).toBe(true);
    expect(d.figure.env.r_O).toBeGreaterThan(0);
    expect(d.figure.vacant).toEqual([]);
  });

  it('the diameter spelling of the same contradiction (#1324) — refused on its own lines', () => {
    const f = faults(['A(0,4)', 'B(-3,0)', 'D(3,0)', 'נתון מעגל O', 'A על המעגל', 'BD קוטר במעגל']);
    expect(f.length).toBeGreaterThan(0);
    expect(f.every(([, code]) => code === 'unsatisfiable')).toBe(true);
  });

  it('the sibling with no circle: «a > 0» then a given that needs a = −3 is refused on that given', () => {
    const d = derive(['a > 0', 'A(a,0)', 'A על הישר x=-3'], 0);
    expect(d.faults.map((f) => [f.index, f.code])).toEqual([[2, 'unsatisfiable']]);
    expect(d.figure.env.a).toBeGreaterThan(0);
  });

  it('controls: the same figures where the givens CAN hold are untouched', () => {
    expect(faults(['A(0,3)', 'B(-3,0)', 'D(3,0)', 'נתון מעגל O', 'A על המעגל', 'B על המעגל', 'D על המעגל', 'O אמצע BD'])).toEqual([]);
    const ok = derive(['a > 0', 'A(a,0)', 'A על הישר x=3'], 0);
    expect(ok.faults).toEqual([]);
    expect(ok.figure.env.a).toBeCloseTo(3, 6);
    // No declared domain: −3 is a legitimate value, and it is taken.
    const free = derive(['A(a,0)', 'A על הישר x=-3'], 0);
    expect(free.faults).toEqual([]);
    expect(free.figure.env.a).toBeCloseTo(-3, 6);
  });

  it('the stated centre was always refused, and still is (the issue’s control)', () => {
    expect(faults(['A(0,4)', 'B(-3,0)', 'D(3,0)', 'נתון מעגל O', 'A על המעגל', 'B על המעגל', 'D על המעגל', 'O(0,0)'])).toEqual([
      [4, 'unsatisfiable'],
      [5, 'unsatisfiable'],
      [6, 'unsatisfiable'],
    ]);
  });
});
