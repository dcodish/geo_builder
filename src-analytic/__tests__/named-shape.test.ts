/**
 * A SHAPE NAMED IN A GIVEN IS DRAWN (#1080).
 *
 * Operator, 2026-09-15, looking at three points, an area given, and no triangle:
 * *"in such a case, the triangle should be drawn as the user mentions and refers to it"*.
 *
 * The shape noun was read for its ARITY and then discarded — «משולש» survived only long enough to
 * check the vertex count, and the figure showed three loose dots for a question plainly about a
 * triangle.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';

const figure = (lines: string[], seed = 0) => {
  const d = derive(lines, seed);
  return {
    d,
    segments: d.figure.segments.length,
    polygons: d.construction.objects.filter((o) => o.kind === 'polygon'),
    dof: reportedDof(d.construction, d.figure.carrierDof),
  };
};

describe('#1080 — naming a shape brings the shape', () => {
  it('the operator’s own figure draws its triangle', () => {
    const r = figure(['A(4,0)', 'B(0,-2)', 'C נמצאת על הישר 4x-y-9=0', 'שטח המשולש ABC הוא 7']);
    expect(r.d.faults).toEqual([]);
    expect(r.segments).toBe(3);
    expect(r.polygons).toHaveLength(1);
  });

  it('and so does a concurrency sentence — «במשולש ABC» says there is a triangle', () => {
    const r = figure(['A(0,0)', 'B(4,0)', 'C(0,3)', 'M מפגש התיכונים במשולש ABC']);
    expect(r.d.faults).toEqual([]);
    expect(r.segments).toBe(3);
  });

  it('a quadrilateral likewise', () => {
    const r = figure(['A(0,0)', 'B(4,0)', 'C(4,4)', 'D(0,4)', 'שטח המרובע ABCD הוא 16']);
    expect(r.d.faults).toEqual([]);
    expect(r.segments).toBe(4);
  });

  it('stating the shape as well is still ONE polygon', () => {
    // The same fact «משולש ABC» produces, with the same canonical id, so M1 absorbs the second.
    const r = figure(['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC', 'שטח המשולש ABC הוא 6']);
    expect(r.d.faults).toEqual([]);
    expect(r.polygons).toHaveLength(1);
    expect(r.segments).toBe(3);
  });

  it('carries the noun’s OWN givens, not merely the ring', () => {
    // «שטח הדלתון ABCD הוא 24» is a kite AND an area, because that is what the sentence says.
    const r = figure(['A(0,0)', 'B(4,0)', 'C(4,4)', 'D(0,4)', 'שטח הדלתון ABCD הוא 24']);
    expect(r.d.faults.map((f) => f.code)).toContain('unsatisfiable');
    // …and the square above is NOT a kite with those equal sides, which is why it refuses. On free
    // vertices the same sentence builds.
    const free = figure(['שטח הדלתון ABCD הוא 24']);
    expect(free.d.faults).toEqual([]);
    const p = Object.fromEntries(free.d.figure.points.map((q) => [q.id, q]));
    const len = (a: string, b: string) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
    expect(len('A', 'B')).toBeCloseTo(len('A', 'D'), 4);
  });
});

describe('#1080 — and it names nothing it was not told', () => {
  it('no noun, no shape — «שטח ABC הוא 6»', () => {
    // The vertices alone say which figure; the student named no shape, so none is drawn.
    const r = figure(['A(0,0)', 'B(4,0)', 'C(0,3)', 'שטח ABC הוא 6']);
    expect(r.d.faults).toEqual([]);
    expect(r.segments).toBe(0);
  });

  it('a noun whose arity disagrees is REFUSED — #1042’s rule, finally applied here', () => {
    expect(
      derive(['A(0,0)', 'B(4,0)', 'C(4,4)', 'D(0,4)', 'שטח המרובע ABC הוא 16'], 0).faults.map((f) => f.code),
    ).toEqual(['bad-arity']);
  });

  it('on an empty canvas it BUILDS the triangle rather than refusing', () => {
    // Was `unknown-reference`. Naming a shape introduces its vertices, which is the ruling the
    // operator gave for «הישר AB» and the behaviour «משולש ABC» has always had.
    const r = figure(['שטח המשולש ABC הוא 6']);
    expect(r.d.faults).toEqual([]);
    expect(r.segments).toBe(3);
    expect(r.dof).toBe(5);
  });
});
