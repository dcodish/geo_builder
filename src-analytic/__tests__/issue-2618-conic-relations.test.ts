/**
 * THE CIRCLE'S RELATIONS, ABOUT EVERY CONIC (#2618 PR 1, ADR-AG-355 / ADR-AG-356).
 *
 * Operator, 2026-10-30: *"now we need to build all capabilities"* — for the ellipse lessons of 14 Nov, and the parabola
 * after them. Measured at 216cf8bb, every relation between a line or a polygon and a CURVE (inscribed in, chord of,
 * diameter of, tangent to) was `not-handled` on the ellipse and on the parabola, because its readers spelled «מעגל» as
 * the only host and its apply arms resolved only a circle; the «קודקודי … נמצאים על» spelling was `not-handled` on every
 * curve; and a line touching any curve offered no crossing dot.
 *
 * The locks are about GEOMETRY at every configuration (seeds 0–5), never about which reader fired: a vertex is on the
 * curve, a tangent is perpendicular to the curve's normal at its touch point, a diameter's ends are opposite through
 * the centre, a pinned k is a root of the double-root condition. The circle's own suites stay unchanged.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { crossingSentence, crossingsOf, freeLetter } from '../engine/crossings';
import { parseLine } from '../parser/parseAnalytic';
import p322a from './fixtures/ellipse-book-p3-22a.analytic.json';
import p424a from './fixtures/ellipse-book-p4-24a.analytic.json';
import p527a from './fixtures/ellipse-book-p5-27a.analytic.json';
import p528 from './fixtures/ellipse-book-p5-28.analytic.json';
import p61b from './fixtures/ellipse-book-p6-1b.analytic.json';
import p81 from './fixtures/ellipse-book-p8-1.analytic.json';
import p83 from './fixtures/ellipse-book-p8-3.analytic.json';
import p86 from './fixtures/ellipse-book-p8-6.analytic.json';
import p87 from './fixtures/ellipse-book-p8-7.analytic.json';
import p88 from './fixtures/ellipse-book-p8-8.analytic.json';
import p89 from './fixtures/ellipse-book-p8-9.analytic.json';
import p810 from './fixtures/ellipse-book-p8-10.analytic.json';

const SEEDS = [0, 1, 2, 3, 4, 5];
const ELLIPSE = 'נתונה אליפסה שמשוואתה x^2/25+y^2/9=1';
const PARABOLA = 'נתונה פרבולה שמשוואתה y^2=8x';
const CIRCLE = 'נתון מעגל שמשוואתו x^2+y^2=25';

type P = { x: number; y: number };
const pointsOf = (d: ReturnType<typeof derive>): Record<string, P> => Object.fromEntries(d.figure.points.map((q) => [q.id, { x: q.x, y: q.y }]));
const onEllipse = (p: P) => p.x ** 2 / 25 + p.y ** 2 / 9 - 1;
const onParabola = (p: P) => (p.y ** 2 - 8 * p.x) / 8;
/** The canonical conic's gradient at p — the normal the tangent is perpendicular to. */
const normalOf = (kind: 'ellipse' | 'parabola' | 'circle', p: P): P =>
  kind === 'ellipse' ? { x: p.x / 25, y: p.y / 9 } : kind === 'parabola' ? { x: -4, y: p.y } : { x: p.x, y: p.y };
const cosBetween = (u: P, v: P) => (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
const facts = (line: string) => {
  const r = parseLine(line);
  // Every `src` dropped, nested ones too: the two spellings are one statement, each attributed to its own line.
  return r.ok ? JSON.stringify(r.facts, (k, v) => (k === "src" ? undefined : v)) : r.code;
};

describe('#2618 — a polygon inscribed in the ellipse or the parabola', () => {
  const ELLIPSE_SPELLINGS = [
    'מלבן ABCD חסום באליפסה',
    'המלבן ABCD חסום באליפסה',
    'באליפסה חסום מלבן ABCD',
    'האליפסה חוסמת את המלבן ABCD',
    'קודקודי המלבן ABCD נמצאים על האליפסה',
    'rectangle ABCD is inscribed in the ellipse',
    'the ellipse circumscribes rectangle ABCD',
    'the vertices of rectangle ABCD lie on the ellipse',
  ];
  for (const s of ELLIPSE_SPELLINGS) {
    it(`«${s}» — every vertex on the ellipse, at every configuration`, () => {
      for (const seed of SEEDS) {
        const d = derive([ELLIPSE, s], seed);
        expect(d.faults, `seed ${seed}`).toEqual([]);
        const p = pointsOf(d);
        for (const v of 'ABCD') expect(Math.abs(onEllipse(p[v])), `${v} seed ${seed}`).toBeLessThan(1e-6);
      }
    });
  }

  it('every spelling is ONE lowering: the facts «A, B, C ו-D נמצאות על האליפסה» states, after the ring', () => {
    const one = facts('מלבן ABCD חסום באליפסה');
    for (const s of ['באליפסה חסום מלבן ABCD', 'האליפסה חוסמת את המלבן ABCD', 'קודקודי המלבן ABCD נמצאים על האליפסה']) expect(facts(s)).toBe(one);
    // The ring is NOT marked cyclic — that flag is a circle claim (`notCyclic` is a circle fact).
    expect(one).not.toContain('"cyclic"');
    expect(one).toContain('"kind":"ellipse"');
  });

  it('the equilateral triangle of p5-27 and a triangle on the parabola', () => {
    for (const seed of SEEDS) {
      const e = derive([ELLIPSE, 'משולש שווה צלעות ABC חסום באליפסה'], seed);
      expect(e.faults, `seed ${seed}`).toEqual([]);
      const pe = pointsOf(e);
      for (const v of 'ABC') expect(Math.abs(onEllipse(pe[v]))).toBeLessThan(1e-6);
      const ab = Math.hypot(pe.A.x - pe.B.x, pe.A.y - pe.B.y);
      expect(Math.hypot(pe.B.x - pe.C.x, pe.B.y - pe.C.y)).toBeCloseTo(ab, 5);
      const q = derive([PARABOLA, 'משולש ABC חסום בפרבולה'], seed);
      expect(q.faults, `seed ${seed}`).toEqual([]);
      const pq = pointsOf(q);
      for (const v of 'ABC') expect(Math.abs(onParabola(pq[v]))).toBeLessThan(1e-6);
    }
  });

  it('REFUSAL: a rhombus inscribed in a parabola is the honest `polygon-collapsed` the two-step form gives', () => {
    expect(derive([PARABOLA, 'מעוין ABCD חסום בפרבולה'], 0).faults.map((f) => f.code)).toEqual(['polygon-collapsed']);
    expect(derive([PARABOLA, 'מעוין ABCD', 'A, B, C ו-D נמצאות על הפרבולה'], 0).faults.map((f) => f.code)).toEqual(['polygon-collapsed']);
  });

  it('«קודקודי … נמצאים על המעגל» is the circle\'s inscribed sentence, and the circle spelling is unchanged', () => {
    expect(facts('קודקודי המעוין ABCD נמצאים על המעגל')).toBe(facts('מעוין ABCD חסום במעגל'));
    expect(facts('the vertices of rhombus ABCD lie on the circle')).toBe(facts('rhombus ABCD is inscribed in a circle'));
    const d = derive([CIRCLE, 'קודקודי המעוין ABCD נמצאים על המעגל'], 0);
    expect(d.faults).toEqual([]);
    const p = pointsOf(d);
    for (const v of 'ABCD') expect(Math.hypot(p[v].x, p[v].y)).toBeCloseTo(5, 6);
  });
});

describe('#2618 — a chord and a diameter', () => {
  for (const [host, on, s] of [
    [ELLIPSE, onEllipse, 'AB מיתר באליפסה'],
    [ELLIPSE, onEllipse, 'המיתר AB באליפסה'],
    [ELLIPSE, onEllipse, 'AB is a chord of the ellipse'],
    [PARABOLA, onParabola, 'AB מיתר בפרבולה'],
    [PARABOLA, onParabola, 'AB is a chord of the parabola'],
  ] as const) {
    it(`«${s}» — both ends on the curve, two different points, the segment drawn`, () => {
      for (const seed of SEEDS) {
        const d = derive([host, s], seed);
        expect(d.faults, `seed ${seed}`).toEqual([]);
        const p = pointsOf(d);
        expect(Math.abs(on(p.A))).toBeLessThan(1e-6);
        expect(Math.abs(on(p.B))).toBeLessThan(1e-6);
        expect(Math.hypot(p.A.x - p.B.x, p.A.y - p.B.y)).toBeGreaterThan(1e-3);
        expect(d.figure.segments.some((g) => [...g.ends].sort().join() === 'A,B')).toBe(true);
      }
    });
  }

  it('the pair of chords meeting at E, about the ellipse', () => {
    const d = derive([ELLIPSE, 'באליפסה המיתרים AB ו-CD נפגשים בנקודה E'], 0);
    expect(d.faults).toEqual([]);
    const p = pointsOf(d);
    for (const v of 'ABCD') expect(Math.abs(onEllipse(p[v]))).toBeLessThan(1e-6);
  });

  for (const s of ['AB קוטר באליפסה', 'AB קוטר של האליפסה', 'קוטר AB באליפסה', 'AB is a diameter of the ellipse']) {
    it(`«${s}» — a chord through the centre, whose DIRECTION is free (operator ruling 2026-10-30, Q3)`, () => {
      const directions = new Set<number>();
      for (const seed of SEEDS) {
        const d = derive([ELLIPSE, s], seed);
        expect(d.faults, `seed ${seed}`).toEqual([]);
        const p = pointsOf(d);
        expect(Math.abs(onEllipse(p.A))).toBeLessThan(1e-6);
        expect(p.A.x + p.B.x).toBeCloseTo(0, 4);
        expect(p.A.y + p.B.y).toBeCloseTo(0, 4);
        directions.add(Number(Math.abs(Math.atan2(p.A.y, p.A.x) % Math.PI).toFixed(2)));
      }
      expect(directions.size).toBeGreaterThan(1);
    });
  }

  it('p3-22 א — the diameter of length 10 with a positive slope is the one through (2√5, √5)', () => {
    for (const seed of SEEDS) {
      const d = derive(p322a.lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const p = pointsOf(d);
      expect(Math.abs(p.A.x)).toBeCloseTo(2 * Math.sqrt(5), 5);
      expect(Math.abs(p.A.y)).toBeCloseTo(Math.sqrt(5), 5);
      expect((p.A.y - p.B.y) / (p.A.x - p.B.x)).toBeCloseTo(0.5, 5);
    }
  });

  it('«AB קוטר בפרבולה» stays exactly as before — a parabola has no centre, and that sentence is #2625', () => {
    expect(parseLine('AB קוטר בפרבולה')).toMatchObject({ ok: false, code: 'not-handled' });
  });

  it('REFUSAL: a chord of «the ellipse» with no ellipse, or with two, is the existing contextual refusal', () => {
    const none = derive(['AB מיתר באליפסה'], 0).faults;
    expect(none.map((f) => [f.code, f.host?.kind, f.host?.found])).toEqual([['ambiguous-shape', 'ellipse', 0]]);
    const two = derive([ELLIPSE, 'נתונה אליפסה שמשוואתה x^2/16+y^2/9=1', 'AB מיתר באליפסה'], 0).faults;
    expect(two.map((f) => [f.code, f.host?.kind, f.host?.found])).toEqual([['ambiguous-shape', 'ellipse', 2]]);
  });
});

describe('#2618 — a line tangent to a conic with no touch point named: the double-root row pins the line', () => {
  /** Every value of `sym` the configurations reach — each root must be reached. */
  const reached = (lines: string[], sym: string) => {
    const out = new Set<number>();
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      out.add(Number(d.figure.env[sym].toFixed(6)));
    }
    return [...out].sort((a, b) => a - b);
  };

  it('the book\'s k table (p8-7 … p8-10): each root, each in its own configuration', () => {
    expect(reached(p87.lines, 'k')).toEqual([-1, 1]);
    expect(reached(p88.lines, 'k')).toEqual([-9, 9]);
    expect(reached(p89.lines, 'k')).toEqual([1]);
    expect(reached(p810.lines, 'k')).toEqual([-4, 5]);
  });

  it('the English spelling and a named line read the same', () => {
    expect(reached([ELLIPSE, 'the line y=kx+5 is tangent to the ellipse'], 'k')).toEqual([-0.8, 0.8]);
    expect(reached([ELLIPSE, 'נתון הישר l1: y=x+m', 'הישר l1 משיק לאליפסה'], 'm').map((m) => Math.abs(m))).toEqual([Math.sqrt(34), Math.sqrt(34)].map((m) => Number(m.toFixed(6))));
  });

  it('the parabola: y = kx + 2 touches y² = 8x only at k = 1', () => {
    expect(reached([PARABOLA, 'הישר y=kx+2 משיק לפרבולה'], 'k')).toEqual([1]);
  });

  it('REFUSAL: a line through a point INSIDE the ellipse cannot touch it — the circle\'s `unsatisfiable`', () => {
    expect(derive([ELLIPSE, 'הישר y=kx+1 משיק לאליפסה'], 0).faults.map((f) => f.code)).toEqual(['unsatisfiable']);
  });

  it('REFUSAL: a SEGMENT whose line would touch outside its ends is refused, as on the circle; inside, it holds', () => {
    expect(derive([ELLIPSE, 'A(1,3)', 'B(4,3)', 'הקטע AB משיק לאליפסה'], 0).faults.map((f) => f.code)).toEqual(['unsatisfiable']);
    expect(derive([ELLIPSE, 'A(-2,3)', 'B(4,3)', 'הקטע AB משיק לאליפסה'], 0).faults).toEqual([]);
  });

  it('a tangent FROM P(10,0): the free-direction line through P, both tangents across configurations', () => {
    const slopes = new Set<number>();
    for (const seed of SEEDS) {
      const d = derive([ELLIPSE, 'נתונה הנקודה P(10,0)', 'דרך P עובר משיק לאליפסה'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const theta = Object.entries(d.figure.env).find(([k]) => k.startsWith('θ'))![1];
      slopes.add(Number(Math.tan(theta).toFixed(6)));
    }
    // y = m(x − 10) touches x²/25 + y²/9 = 1 ⇔ 9 + 25m² = 100m² ⇔ m = ±√(9/75).
    const m = Number(Math.sqrt(9 / 75).toFixed(6));
    expect([...slopes].sort((a, b) => a - b)).toEqual([-m, m]);
  });
});

describe('#2618 — a tangent AT a named point: on the curve, perpendicular to its normal', () => {
  for (const [kind, host, on, noun] of [
    ['ellipse', ELLIPSE, onEllipse, 'לאליפסה'],
    ['parabola', PARABOLA, onParabola, 'לפרבולה'],
    ['circle', CIRCLE, (p: P) => Math.hypot(p.x, p.y) - 5, 'למעגל'],
  ] as const) {
    it(`«הישר AB משיק ${noun} בנקודה A» — at every configuration`, () => {
      for (const seed of SEEDS) {
        const d = derive([host, `הישר AB משיק ${noun} בנקודה A`], seed);
        expect(d.faults, `seed ${seed}`).toEqual([]);
        const p = pointsOf(d);
        expect(Math.abs(on(p.A))).toBeLessThan(1e-6);
        expect(Math.abs(cosBetween({ x: p.B.x - p.A.x, y: p.B.y - p.A.y }, normalOf(kind, p.A)))).toBeLessThan(1e-6);
      }
    });

    it(`«המשיק ${noun} בנקודה A» — the tangent object, ⊥ the normal at A`, () => {
      for (const seed of SEEDS) {
        const d = derive([host, `A על ה${noun.slice(1)}`, `המשיק ${noun} בנקודה A`], seed);
        expect(d.faults, `seed ${seed}`).toEqual([]);
        const A = pointsOf(d).A;
        const line = d.figure.curves.find((c) => c.curve.kind === 'line')!.curve as { a: number; b: number; c: number };
        expect(line.a * A.x + line.b * A.y + line.c).toBeCloseTo(0, 6);
        // The line's normal (a, b) is parallel to the conic's normal at A.
        expect(Math.abs(cosBetween({ x: line.a, y: line.b }, normalOf(kind, A)))).toBeCloseTo(1, 6);
      }
    });
  }

  it('the tangent object\'s equation: «משוואת המשיק לאליפסה בנקודה A היא x+2y=4» on x²/8 + y²/2 = 1', () => {
    const E = 'נתונה אליפסה שמשוואתה x^2/8+y^2/2=1';
    expect(derive([E, 'A(2,1)', 'משוואת המשיק לאליפסה בנקודה A היא x+2y=4'], 0).faults).toEqual([]);
    // Free A: the stated tangent places it at its one touch point.
    const d = derive([E, 'A על האליפסה', 'משוואת המשיק לאליפסה בנקודה A היא x+2y=4'], 0);
    expect(d.faults).toEqual([]);
    expect(pointsOf(d).A.x).toBeCloseTo(2, 6);
    expect(pointsOf(d).A.y).toBeCloseTo(1, 6);
    // No touch point: the stated line is tangent to the ellipse.
    expect(derive([E, 'משוואת המשיק לאליפסה היא x+2y=4'], 0).faults).toEqual([]);
  });

  it('REFUSAL: an equation that is not the tangent at A is refused, never drawn', () => {
    const E = 'נתונה אליפסה שמשוואתה x^2/8+y^2/2=1';
    expect(derive([E, 'A(2,1)', 'משוואת המשיק לאליפסה בנקודה A היא x+y=3'], 0).faults.map((f) => f.code)).toEqual(['unsatisfiable']);
    expect(derive([E, 'משוואת המשיק לאליפסה היא x+y=9'], 0).faults.map((f) => f.code)).toEqual(['unsatisfiable']);
  });

  it('through a point ON the ellipse, «דרך A עובר משיק לאליפסה» is the tangent at A', () => {
    const d = derive([ELLIPSE, 'A על האליפסה', 'דרך A עובר משיק לאליפסה'], 0);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.some((o) => o.kind === 'line-at' && o.dir.k === 'normal' && o.through === 'A')).toBe(true);
  });
});

describe('#2618 — the crossing dot at a tangency (operator ruling 2026-10-30, Q2 → A: all three curves)', () => {
  for (const [lines, at] of [
    [p81.lines.slice(0, 2), { x: 4, y: 1 }],
    [p83.lines.slice(0, 2), { x: 4, y: 3 }],
    [p86.lines.slice(0, 2), { x: 2, y: 1 }],
    [[CIRCLE, 'נתון הישר y=5'], { x: 0, y: 5 }],
    [[PARABOLA, 'נתון הישר y=x+2'], { x: 2, y: 4 }],
  ] as const) {
    it(`${lines.join(' · ')} — ONE dot at the touch point, with no ordinal, whose sentence builds`, () => {
      for (const seed of SEEDS) {
        const d = derive([...lines], seed);
        const dots = crossingsOf(d.figure, d.construction);
        expect(dots, `seed ${seed}`).toHaveLength(1);
        expect(dots[0].x).toBeCloseTo(at.x, 6);
        expect(dots[0].y).toBeCloseTo(at.y, 6);
        expect(dots[0].nth).toBeUndefined();
        const sentence = crossingSentence(dots[0], freeLetter(d.construction));
        const after = derive([...lines, sentence], seed);
        expect(after.faults, `${sentence} seed ${seed}`).toEqual([]);
      }
    });
  }

  it('p8-1 · p8-3 · p8-6 — the student\'s own touch sentence records the touch point', () => {
    for (const [fx, at] of [[p81, { x: 4, y: 1 }], [p83, { x: 4, y: 3 }], [p86, { x: 2, y: 1 }]] as const) {
      for (const seed of SEEDS) {
        const d = derive(fx.lines, seed);
        expect(d.faults, `${fx.name} seed ${seed}`).toEqual([]);
        // Two incidences meet at a double root, so the solve lands within its resolution of the touch (#1096).
        expect(pointsOf(d).A.x).toBeCloseTo(at.x, 2);
        expect(pointsOf(d).A.y).toBeCloseTo(at.y, 2);
      }
    }
  });

  it('p8-7 — after the tangency PINS k, the touch is still one dot, and its sentence records', () => {
    for (const seed of SEEDS) {
      const d = derive(p87.lines, seed);
      const dots = crossingsOf(d.figure, d.construction);
      expect(dots, `seed ${seed}`).toHaveLength(1);
      const after = derive([...p87.lines, crossingSentence(dots[0], freeLetter(d.construction))], seed);
      expect(after.faults, `seed ${seed}`).toEqual([]);
    }
  });
});

describe('#2618 — the textbook figures (fixtures, rule 4)', () => {
  it('every fixture builds green at every configuration', () => {
    for (const fx of [p322a, p424a, p527a, p528, p61b, p81, p83, p86, p87, p88, p89, p810]) {
      for (const seed of SEEDS) expect(derive(fx.lines, seed).faults, `${fx.name} seed ${seed}`).toEqual([]);
    }
  });

  it('p4-24 א — the rhombus\'s diagonals lie on the axes: vertices (±4,0),(0,±3) or swapped', () => {
    for (const seed of SEEDS) {
      const p = pointsOf(derive(p424a.lines, seed));
      const ac = Math.abs(p.A.x);
      expect([3, 4].some((v) => Math.abs(ac - v) < 1e-6)).toBe(true);
      expect(p.A.y).toBeCloseTo(0, 6);
      expect(Math.abs(p.B.y)).toBeCloseTo(7 - ac, 6);
    }
  });

  it('p5-27 א — B and C at (−1.2, ±√5.88)', () => {
    for (const seed of SEEDS) {
      const p = pointsOf(derive(p527a.lines, seed));
      expect(p.B.x).toBeCloseTo(-1.2, 5);
      expect(p.C.x).toBeCloseTo(-1.2, 5);
      expect(Math.abs(p.B.y)).toBeCloseTo(Math.sqrt(5.88), 5);
    }
  });

  it('p5-28 — B and C at (0, ±7), A at (±12, ±2)', () => {
    for (const seed of SEEDS) {
      const p = pointsOf(derive(p528.lines, seed));
      expect(Math.abs(p.B.y)).toBeCloseTo(7, 5);
      expect(Math.abs(p.A.x)).toBeCloseTo(12, 5);
      expect(Math.abs(p.A.y)).toBeCloseTo(2, 5);
    }
  });

  it('p6-1 ב — a rectangle centred at the origin, every vertex on the ellipse', () => {
    for (const seed of SEEDS) {
      const p = pointsOf(derive(p61b.lines, seed));
      for (const v of 'ABCD') expect(p[v].x ** 2 / 36 + p[v].y ** 2 / 16).toBeCloseTo(1, 6);
      expect(p.A.x + p.C.x).toBeCloseTo(0, 6);
      expect(p.A.y + p.C.y).toBeCloseTo(0, 6);
    }
  });
});
