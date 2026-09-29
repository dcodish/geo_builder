/**
 * A CIRCLE ON A CENTRE POINT, AND TANGENCY TO THE AXES (#1060).
 *
 * Operator, 2026-09-15: *"we need to support מעגל O משיק לציר x and all verses of the axis
 * tangency"*. Measured then: 0 of 11 phrasings.
 *
 * Tangency is how the corpus pins a circle WITHOUT giving its radius, so the assertions are about
 * the GEOMETRY that produces — |y_O| = r, and the degrees of freedom each given consumes.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';

const figure = (lines: string[], seed = 0) => {
  const d = derive(lines, seed);
  const circle = d.figure.curves[0];
  return {
    d,
    dof: reportedDof(d.construction, d.figure.carrierDof),
    centre: d.figure.points.find((p) => p.id === 'O'),
    r: circle && circle.curve.kind === 'circle' ? circle.curve.r : null,
  };
};

describe('#1060 — a circle given by its CENTRE', () => {
  it('«נתון מעגל O» is a circle with a free centre and a free radius — three degrees', () => {
    const f = figure(['נתון מעגל O']);
    expect(f.d.faults).toEqual([]);
    expect(f.dof).toBe(3);
    expect(f.centre).toBeDefined();
    expect(f.r).toBeGreaterThan(0);
  });

  it('its radius is POSITIVE at every configuration', () => {
    // #1019 made an undeclared parameter sample negative, which is right for a coefficient and
    // wrong for a length. The row declares the domain rather than hoping.
    for (let seed = 0; seed < 8; seed += 1) {
      expect(figure(['נתון מעגל O'], seed).r, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('and the circle MOVES between configurations, as an unpinned figure must (ADR-052)', () => {
    const a = figure(['נתון מעגל O'], 0);
    const b = figure(['נתון מעגל O'], 1);
    expect([a.r, a.centre!.x]).not.toEqual([b.r, b.centre!.x]);
  });

  it('the centre is a POINT the student can talk about', () => {
    const d = derive(['נתון מעגל O', 'O(3,5)'], 0);
    expect(d.faults).toEqual([]);
    const o = d.figure.points.find((p) => p.id === 'O')!;
    expect([o.x, o.y]).toEqual([3, 5]);
  });
});

describe('#1060 — tangency to an axis, in every phrasing the operator listed', () => {
  const X_AXIS = [
    'מעגל O משיק לציר x',
    'המעגל O משיק לציר ה-x',
    'נתון מעגל O המשיק לציר x',
    'מעגל שמרכזו O משיק לציר x',
    'circle O is tangent to the x-axis',
  ];

  it.each(X_AXIS)('%s — the distance to the axis IS the radius', (line) => {
    const f = figure([line]);
    expect(f.d.faults).toEqual([]);
    expect(Math.abs(f.centre!.y)).toBeCloseTo(f.r!, 5);
    // One equation, one degree of freedom consumed — the operand matrix in the issue.
    expect(f.dof).toBe(2);
  });

  it('the y-axis reads the OTHER coordinate', () => {
    const f = figure(['מעגל O משיק לציר y']);
    expect(f.d.faults).toEqual([]);
    expect(Math.abs(f.centre!.x)).toBeCloseTo(f.r!, 5);
  });

  it('«משיק לשני הצירים» is both, and consumes two', () => {
    const f = figure(['המעגל O משיק לשני הצירים']);
    expect(f.d.faults).toEqual([]);
    expect(Math.abs(f.centre!.x)).toBeCloseTo(f.r!, 5);
    expect(Math.abs(f.centre!.y)).toBeCloseTo(f.r!, 5);
    expect(f.dof).toBe(1);
  });

  it('holds at every configuration, not just the first', () => {
    for (let seed = 0; seed < 5; seed += 1) {
      const f = figure(['מעגל O משיק לציר x'], seed);
      expect(Math.abs(f.centre!.y), `seed ${seed}`).toBeCloseTo(f.r!, 5);
    }
  });

  it('says nothing about WHICH SIDE, because the student did not', () => {
    // Unsigned on purpose: a circle below the x-axis touches it exactly as one above does, and
    // demanding a sign would assert a side the question never gave (ADR-052).
    const signs = new Set<number>();
    for (let seed = 0; seed < 12; seed += 1) signs.add(Math.sign(figure(['מעגל O משיק לציר x'], seed).centre!.y));
    expect(signs.size).toBeGreaterThan(1);
  });
});

describe('#1060 — the contextual form', () => {
  it('«המעגל משיק לציר ה-x» means the one circle in the figure', () => {
    const d = derive(['נתון מעגל O', 'המעגל משיק לציר ה-x'], 0);
    expect(d.faults).toEqual([]);
    const o = d.figure.points.find((p) => p.id === 'O')!;
    const c = d.figure.curves[0];
    expect(c.curve.kind).toBe('circle');
    if (c.curve.kind === 'circle') expect(Math.abs(o.y)).toBeCloseTo(c.curve.r, 5);
  });

  it('and is refused when it names no single circle', () => {
    expect(derive(['המעגל משיק לציר ה-x'], 0).faults.map((f) => f.code)).toEqual(['ambiguous-shape']);
    expect(
      derive(['נתון מעגל O', 'נתון מעגל K', 'המעגל משיק לציר ה-x'], 0).faults.map((f) => f.code),
    ).toEqual(['ambiguous-shape']);
  });
});

describe('#1060 — an ordinary circle is untouched', () => {
  it('«נתון מעגל I שמשוואתו …» still names the circle by numeral', () => {
    const d = derive(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'], 0);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.map((o) => o.id)).toEqual(['circle-I']);
  });

  it('and «נתון מעגל O שמשוואתו …» still names its CENTRE (#1059)', () => {
    const d = derive(['נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25'], 0);
    expect(d.faults).toEqual([]);
    const o = d.figure.points.find((p) => p.id === 'O')!;
    expect([o.x, o.y]).toEqual([3, 5]);
  });
});
