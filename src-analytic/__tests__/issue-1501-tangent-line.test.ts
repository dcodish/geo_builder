/**
 * A CIRCLE TANGENT TO A LINE (#1501) — the general member of the tangency class #1060 opened.
 *
 * Operator, 2026-09-28: *"on analytic tool we need to support tangents — מעגל M משיק לישרים l1
 * ו- l2, מעגל M משיק לישר 3x+4y=0, and variants."* Measured then: 0 of 8 phrasings, every one
 * `not-handled`.
 *
 * Tangency is how the corpus pins a circle without giving its radius, so the assertions are about
 * the GEOMETRY it produces — the distance from the centre to the line IS the radius — and the
 * degrees of freedom each given consumes, at EVERY configuration (the seed-sweep rule: locks pass
 * at 2/24 seeds as well as at 24/24).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';

const build = (lines: string[], seed = 0) => {
  const d = derive(lines, seed);
  const centre = (id: string) => d.figure.points.find((p) => p.id === id) ?? null;
  const radius = () => {
    const c = d.figure.curves.map((c) => c.curve).find((c) => c.kind === 'circle');
    return c && c.kind === 'circle' ? c.r : null;
  };
  return { d, dof: reportedDof(d.construction, d.figure.carrierDof), centre, radius };
};

/** |ax₀ + by₀ + c| / √(a² + b²) — the formula-sheet distance the residual encodes. */
const dist = (p: { x: number; y: number }, a: number, b: number, c: number) =>
  Math.abs(a * p.x + b * p.y + c) / Math.hypot(a, b);

describe('#1501 — tangent to a NAMED line', () => {
  it('«מעגל M משיק לישר l1» — the distance from the centre to l1 IS the radius', () => {
    const f = build(['נתון הישר l1: y=2x+5', 'מעגל M משיק לישר l1']);
    expect(f.d.faults).toEqual([]);
    // y = 2x + 5 ⇔ 2x − y + 5 = 0
    expect(dist(f.centre('M')!, 2, -1, 5)).toBeCloseTo(f.radius()!, 5);
    // The circle had 3 degrees (centre 2, radius 1); one equation consumes one.
    expect(f.dof).toBe(2);
  });

  it('«מעגל M משיק לישרים l1 ו-l2» — both distances, two degrees consumed', () => {
    const f = build(['נתון הישר l1: y=2x+5', 'נתון הישר l2: y=-x+1', 'מעגל M משיק לישרים l1 ו-l2']);
    expect(f.d.faults).toEqual([]);
    const m = f.centre('M')!;
    expect(dist(m, 2, -1, 5)).toBeCloseTo(f.radius()!, 5);
    expect(dist(m, 1, 1, -1)).toBeCloseTo(f.radius()!, 5);
    expect(f.dof).toBe(1);
  });

  it('holds at EVERY configuration, not just the first', () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const f = build(['נתון הישר l1: y=2x+5', 'מעגל M משיק לישר l1'], seed);
      expect(f.d.faults, `seed ${seed}`).toEqual([]);
      expect(dist(f.centre('M')!, 2, -1, 5), `seed ${seed}`).toBeCloseTo(f.radius()!, 5);
    }
  });
});

describe('#1501 — tangent to a line given by its EQUATION, inline', () => {
  it('«מעגל M משיק לישר 3x+4y=0» — the sentence mints the line AND the tangency', () => {
    const f = build(['מעגל M משיק לישר 3x+4y=0']);
    expect(f.d.faults).toEqual([]);
    expect(dist(f.centre('M')!, 3, 4, 0)).toBeCloseTo(f.radius()!, 5);
    // The line is drawn — everything the student stated is visible on the figure.
    expect(f.d.figure.curves.map((c) => c.curve.kind).sort()).toEqual(['circle', 'line']);
  });

  it('«שמשוואתו» fronting the equation reads the same', () => {
    const f = build(['מעגל M משיק לישר שמשוואתו 3x+4y=0']);
    expect(f.d.faults).toEqual([]);
    expect(dist(f.centre('M')!, 3, 4, 0)).toBeCloseTo(f.radius()!, 5);
  });

  it('says nothing about WHICH SIDE, because the student did not (ADR-052)', () => {
    const signs = new Set<number>();
    for (let seed = 0; seed < 12; seed += 1) {
      const f = build(['מעגל M משיק לישר 3x+4y=0'], seed);
      const m = f.centre('M')!;
      expect(dist(m, 3, 4, 0), `seed ${seed}`).toBeCloseTo(f.radius()!, 5);
      signs.add(Math.sign(3 * m.x + 4 * m.y));
    }
    expect(signs.size).toBeGreaterThan(1);
  });

  it('restating the same equation is the SAME line — one curve, not two', () => {
    const f = build(['נתון הישר 3x+4y=0', 'מעגל M משיק לישר 3x+4y=0']);
    expect(f.d.faults).toEqual([]);
    expect(f.d.figure.curves.map((c) => c.curve.kind).sort()).toEqual(['circle', 'line']);
  });
});

describe('#1501 — tangent to the line through two POINTS', () => {
  it('«מעגל M משיק לישר AB» constrains against the line A and B span', () => {
    const f = build(['A(0,0)', 'B(6,0)', 'מעגל M משיק לישר AB']);
    expect(f.d.faults).toEqual([]);
    // AB is the x-axis here, so the distance is |y_M|.
    expect(Math.abs(f.centre('M')!.y)).toBeCloseTo(f.radius()!, 5);
  });

  it('a tangency naming points the figure does not have is refused, never invented', () => {
    const d = derive(['מעגל M משיק לישר AB'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['unknown-reference']);
  });
});

describe('#1501 — every order and the contextual form', () => {
  const L1 = 'נתון הישר l1: y=2x+5';

  it('«המעגל משיק לישר l1» means the one circle in the figure', () => {
    const f = build([L1, 'נתון מעגל M', 'המעגל משיק לישר l1']);
    expect(f.d.faults).toEqual([]);
    expect(dist(f.centre('M')!, 2, -1, 5)).toBeCloseTo(f.radius()!, 5);
  });

  it('«הישר l1 משיק למעגל M» — the line first, the same statement (the #1281 rule)', () => {
    const f = build([L1, 'נתון מעגל M', 'הישר l1 משיק למעגל M']);
    expect(f.d.faults).toEqual([]);
    expect(dist(f.centre('M')!, 2, -1, 5)).toBeCloseTo(f.radius()!, 5);
  });

  it('«הישרים l1 ו-l2 משיקים למעגל M» — the plural subject carries both', () => {
    const f = build([L1, 'נתון הישר l2: y=-x+1', 'נתון מעגל M', 'הישרים l1 ו-l2 משיקים למעגל M']);
    expect(f.d.faults).toEqual([]);
    const m = f.centre('M')!;
    expect(dist(m, 2, -1, 5)).toBeCloseTo(f.radius()!, 5);
    expect(dist(m, 1, 1, -1)).toBeCloseTo(f.radius()!, 5);
  });

  it('«הישר l1 משיק למעגל M» about a circle the figure does not have is refused', () => {
    const d = derive([L1, 'הישר l1 משיק למעגל M'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['unknown-reference']);
  });

  it('a mixed list — «מעגל O משיק לציר ה-x ולישר l1» — is the axis AND the line', () => {
    const f = build([L1, 'מעגל O משיק לציר ה-x ולישר l1']);
    expect(f.d.faults).toEqual([]);
    const o = f.centre('O')!;
    expect(Math.abs(o.y)).toBeCloseTo(f.radius()!, 5);
    expect(dist(o, 2, -1, 5)).toBeCloseTo(f.radius()!, 5);
    expect(f.dof).toBe(1);
  });
});

describe('#1501 — English', () => {
  it('«circle M is tangent to line l1»', () => {
    const f = build(['line l1: y=2x+5', 'circle M is tangent to line l1']);
    expect(f.d.faults).toEqual([]);
    expect(dist(f.centre('M')!, 2, -1, 5)).toBeCloseTo(f.radius()!, 5);
  });

  it('«the line l1 is tangent to the circle M»', () => {
    const f = build(['line l1: y=2x+5', 'נתון מעגל M', 'the line l1 is tangent to the circle M']);
    expect(f.d.faults).toEqual([]);
    expect(dist(f.centre('M')!, 2, -1, 5)).toBeCloseTo(f.radius()!, 5);
  });
});

describe('#1501 — refusals, never silent drops', () => {
  it('a tangency to a line the figure does not hold is refused by name', () => {
    const d = derive(['מעגל M משיק לישר l7'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['unknown-reference']);
  });

  it('tangency about a circle known only by its EQUATION is out of scope, by name', () => {
    const d = derive(['נתון מעגל I שמשוואתו x^2+y^2=25', 'נתון הישר l1: y=2x+5', 'המעגל משיק לישר l1'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['out-of-scope']);
  });

  it('«משיק» to an equation that is a CIRCLE is circle-to-circle tangency — out of scope, by name', () => {
    const d = derive(['מעגל M משיק לישר x^2+y^2=9'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['out-of-scope']);
  });

  it('circle-to-circle tangency by NAME stays not-handled — the escalation seam, not a guess', () => {
    const d = derive(['נתון מעגל K', 'מעגל M משיק למעגל K'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['not-handled']);
  });
});

describe('#1501 — the axis suite is untouched', () => {
  it('«מעגל O משיק לציר x» still reads r = |y_O|', () => {
    const f = build(['מעגל O משיק לציר x']);
    expect(f.d.faults).toEqual([]);
    expect(Math.abs(f.centre('O')!.y)).toBeCloseTo(f.radius()!, 5);
    expect(f.dof).toBe(2);
  });
});
