/**
 * A CIRCLE AND A CONIC (#2618 PR 2, ADR-AG-360 / ADR-AG-361).
 *
 * Operator, 2026-10-30: *"now we need to build all capabilities"*, and his ruling of the same day on the plan's Q1 → A:
 * «מעגל חסום באליפסה» / «האליפסה חסומה במעגל» / «המעגל חוסם את האליפסה» draw the textbook's concentric circle, through
 * the minor-axis vertices (inside) or the major-axis vertices (around). Measured at fb94d176 (after PR 1), every one of
 * «המעגל משיק לאליפסה», «… בנקודה B», «… בנקודות B ו-D», «מעגל חסום באליפסה», «האליפסה חסומה במעגל», «המעגל חוסם את
 * האליפסה» was `not-handled`, and «המעגל משיק לפרבולה» too.
 *
 * The locks are about GEOMETRY at every configuration (seeds 0–5): the circle meets the conic at the touch point with its
 * radius along the conic's normal there; the concentric circle is centred at the origin with the smaller / larger semi-axis.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { parseLine } from '../parser/parseAnalytic';
import type { NumCurve } from '../engine/types';
import p526b from './fixtures/ellipse-book-p5-26b.analytic.json';
import p526bIn from './fixtures/ellipse-book-p5-26b-inscribed.analytic.json';
import p526bAround from './fixtures/ellipse-book-p5-26b-around.analytic.json';

const SEEDS = [0, 1, 2, 3, 4, 5];
const ELLIPSE = 'נתונה אליפסה שמשוואתה x^2/25+y^2/9=1';
const PARABOLA = 'נתונה פרבולה שמשוואתה y^2=8x';

type P = { x: number; y: number };
type D = ReturnType<typeof derive>;
const pointsOf = (d: D): Record<string, P> => Object.fromEntries(d.figure.points.map((q) => [q.id, { x: q.x, y: q.y }]));
const circlesOf = (d: D) => d.figure.curves.map((c) => c.curve).filter((c): c is Extract<NumCurve, { kind: 'circle' }> => c.kind === 'circle');
const theCircle = (d: D) => {
  const cs = circlesOf(d);
  expect(cs).toHaveLength(1);
  return cs[0];
};
/** The canonical conic's gradient at p — what the circle's radius at a touch runs along. */
const normalOf = (kind: 'ellipse' | 'parabola', p: P): P => (kind === 'ellipse' ? { x: p.x / 25, y: p.y / 9 } : { x: -4, y: p.y });
const onConic = (kind: 'ellipse' | 'parabola', p: P) => (kind === 'ellipse' ? p.x ** 2 / 25 + p.y ** 2 / 9 - 1 : (p.y ** 2 - 8 * p.x) / 8);
const cross = (u: P, v: P) => (u.x * v.y - u.y * v.x) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));

/**
 * Does the circle TOUCH the conic? The touch is where the circle is closest to the conic along a normal: scan the conic
 * for the point whose normal line passes through the centre and whose distance is the radius. Independent of the tool's
 * own touch parameter, so the lock reads the figure, not the mechanism.
 */
function touches(kind: 'ellipse' | 'parabola', c: { cx: number; cy: number; r: number }): boolean {
  const at = (t: number): P => (kind === 'ellipse' ? { x: 5 * Math.cos(t), y: 3 * Math.sin(t) } : { x: (t * t) / 8, y: t });
  const [lo, hi] = kind === 'ellipse' ? [-Math.PI, Math.PI] : [-60, 60];
  const miss = (t: number) => {
    const p = at(t);
    const d = { x: c.cx - p.x, y: c.cy - p.y };
    return Math.abs(Math.hypot(d.x, d.y) - c.r) / 5 + Math.abs(cross(d, normalOf(kind, p)));
  };
  let best = Infinity;
  let bt = lo;
  const N = 20000;
  for (let i = 0; i <= N; i++) {
    const t = lo + ((hi - lo) * i) / N;
    const m = miss(t);
    if (m < best) [best, bt] = [m, t];
  }
  // A golden-section polish around the best sample.
  let [a, b] = [bt - (hi - lo) / N, bt + (hi - lo) / N];
  for (let i = 0; i < 80; i++) {
    const m1 = a + (b - a) * 0.382;
    const m2 = a + (b - a) * 0.618;
    if (miss(m1) < miss(m2)) b = m2;
    else a = m1;
  }
  return miss((a + b) / 2) < 1e-5;
}

const facts = (line: string) => {
  const r = parseLine(line);
  return r.ok ? JSON.stringify(r.facts, (k, v) => (k === 'src' ? undefined : v)) : r.code;
};

describe('#2618 PR 2 — the readings', () => {
  it('every touch spelling is ONE circle-conic fact over the one circle slot, on the ellipse and the parabola', () => {
    for (const [noun, en, host] of [['אליפסה', 'ellipse', 'ellipse'], ['פרבולה', 'parabola', 'parabola']] as const) {
      const bare = facts(`המעגל משיק ל${noun}`);
      expect(bare).toContain('"t":"circle-conic"');
      expect(bare).toContain(`"host":"${host}"`);
      expect(bare).not.toContain('"ats"');
      expect(facts(`the circle is tangent to the ${en}`)).toBe(bare);
      expect(facts(`המעגל משיק ל${noun} בנקודה B`)).toContain('"ats":["B"]');
      expect(facts(`the circle is tangent to the ${en} at B`)).toBe(facts(`המעגל משיק ל${noun} בנקודה B`));
      expect(facts(`המעגל משיק ל${noun} בנקודות B ו-D`)).toContain('"ats":["B","D"]');
      expect(facts(`מעגל M משיק ל${noun}`)).toContain('"k":"named","name":"M"');
    }
  });

  it('the concentric-circle spellings: inside and around, He and En, both word orders', () => {
    const inside = ['מעגל חסום באליפסה', 'נתון מעגל חסום באליפסה', 'המעגל חסום באליפסה', 'באליפסה חסום מעגל', 'האליפסה חוסמת את המעגל', 'a circle is inscribed in the ellipse', 'the ellipse circumscribes the circle'];
    const around = ['האליפסה חסומה במעגל', 'במעגל חסומה האליפסה', 'המעגל חוסם את האליפסה', 'מעגל חוסם את האליפסה', 'the ellipse is inscribed in a circle', 'the circle circumscribes the ellipse'];
    for (const s of inside) expect(facts(s), s).toBe(facts('מעגל חסום באליפסה'));
    for (const s of around) expect(facts(s), s).toBe(facts('האליפסה חסומה במעגל'));
    expect(facts('מעגל חסום באליפסה')).toContain('"fit":"inscribed"');
    expect(facts('האליפסה חסומה במעגל')).toContain('"fit":"circumscribed"');
    expect(facts('האליפסה חסומה במעגל M')).toContain('"k":"named","name":"M"');
  });

  it('the concentric circle is the ellipse\'s alone: «מעגל חסום בפרבולה» is read by nothing, as before', () => {
    expect(parseLine('מעגל חסום בפרבולה')).toMatchObject({ ok: false, code: 'not-handled' });
    expect(parseLine('הפרבולה חסומה במעגל')).toMatchObject({ ok: false, code: 'not-handled' });
  });

  it('a size tail or a branch word is not this reading (left exactly as it was)', () => {
    expect(parseLine('המעגל משיק לאליפסה מבחוץ')).toMatchObject({ ok: false, code: 'not-handled' });
    expect(parseLine('מעגל שרדיוסו 3 משיק לאליפסה')).toMatchObject({ ok: false, code: 'not-handled' });
  });
});

describe('#2618 PR 2 — a circle touching a conic, no point named', () => {
  it('the touch check itself: x²+y²=9 touches the ellipse, x²+y²=16 cuts it, (x−7)²+y²=1 misses it', () => {
    expect(touches('ellipse', { cx: 0, cy: 0, r: 3 })).toBe(true);
    expect(touches('ellipse', { cx: 0, cy: 0, r: 4 })).toBe(false);
    expect(touches('ellipse', { cx: 7, cy: 0, r: 1 })).toBe(false);
    expect(touches('parabola', { cx: -1, cy: 0, r: 1 })).toBe(true);
  });

  for (const [curve, kind] of [[ELLIPSE, 'ellipse'], [PARABOLA, 'parabola']] as const) {
    for (const seq of [
      [curve, 'נתון מעגל M', `המעגל משיק ל${kind === 'ellipse' ? 'אליפסה' : 'פרבולה'}`],
      [curve, `מעגל M משיק ל${kind === 'ellipse' ? 'אליפסה' : 'פרבולה'}`],
      [curve, `המעגל משיק ל${kind === 'ellipse' ? 'אליפסה' : 'פרבולה'}`],
    ]) {
      it(`«${seq.slice(1).join(' · ')}» on the ${kind} — the circle touches it, at every configuration`, () => {
        for (const seed of SEEDS) {
          const d = derive(seq, seed);
          expect(d.faults, `seed ${seed}`).toEqual([]);
          expect(touches(kind, theCircle(d)), `seed ${seed}`).toBe(true);
        }
      });
    }
  }

  it('where it touches is free: «הציגו תצורה אחרת» draws another circle (ADR-052)', () => {
    const seq = [ELLIPSE, 'נתון מעגל M', 'המעגל משיק לאליפסה'];
    const drawn = new Set(SEEDS.map((seed) => theCircle(derive(seq, seed))).map((c) => `${c.cx.toFixed(3)},${c.cy.toFixed(3)},${c.r.toFixed(3)}`));
    expect(drawn.size).toBeGreaterThan(3);
  });

  it('24-seed whole-rate ≥ 20/24 (ADR-AG-144), on both conics', () => {
    for (const seq of [
      [ELLIPSE, 'נתון מעגל M', 'המעגל משיק לאליפסה'],
      [PARABOLA, 'נתון מעגל M', 'המעגל משיק לפרבולה'],
    ]) {
      const kind = seq[0] === ELLIPSE ? 'ellipse' : 'parabola';
      let whole = 0;
      for (let seed = 0; seed < 24; seed++) {
        const d = derive(seq, seed);
        if (d.faults.length === 0 && touches(kind, theCircle(d))) whole++;
      }
      expect(whole, seq.join(' · ')).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('#2618 PR 2 — a circle touching a conic at named points', () => {
  it('p5-26 ב — the circle touching the ellipse at its y-axis crossings is x²+y²=9', () => {
    for (const seed of SEEDS) {
      const d = derive(p526b.lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const c = theCircle(d);
      expect(c.cx).toBeCloseTo(0, 6);
      expect(c.cy).toBeCloseTo(0, 6);
      expect(c.r).toBeCloseTo(3, 6);
      expect(pointsOf(d).M.x).toBeCloseTo(0, 6);
    }
  });

  for (const [curve, kind, noun] of [[ELLIPSE, 'ellipse', 'אליפסה'], [PARABOLA, 'parabola', 'פרבולה']] as const) {
    it(`a free B on the ${kind}: B on both curves, the radius at B along the ${kind}'s normal`, () => {
      for (const seed of SEEDS) {
        const d = derive([curve, 'נתון מעגל M', `המעגל משיק ל${noun} בנקודה B`], seed);
        expect(d.faults, `seed ${seed}`).toEqual([]);
        const { B, M } = pointsOf(d);
        const c = theCircle(d);
        expect(Math.abs(onConic(kind, B))).toBeLessThan(1e-6);
        expect(Math.hypot(B.x - c.cx, B.y - c.cy) - c.r).toBeCloseTo(0, 6);
        expect(cross({ x: B.x - M.x, y: B.y - M.y }, normalOf(kind, B))).toBeCloseTo(0, 6);
      }
    });
  }

  it('REFUSAL: one point named twice is the existing repeated-letter refusal', () => {
    expect(parseLine('המעגל משיק לאליפסה בנקודות B ו-B')).toMatchObject({ ok: false, code: 'repeated-vertex' });
  });
});

describe('#2618 PR 2 — the circle inscribed in the ellipse, and around it (ruling Q1 → A)', () => {
  const concentric = (d: D, r: number) => {
    const c = theCircle(d);
    expect(c.cx).toBeCloseTo(0, 6);
    expect(c.cy).toBeCloseTo(0, 6);
    expect(c.r).toBeCloseTo(r, 6);
  };

  it('«מעגל חסום באליפסה» draws x²+y²=9, through the minor-axis vertices; «האליפסה חסומה במעגל» x²+y²=25', () => {
    for (const seed of SEEDS) {
      concentric(derive([ELLIPSE, 'מעגל חסום באליפסה'], seed), 3);
      concentric(derive([ELLIPSE, 'האליפסה חסומה במעגל'], seed), 5);
    }
  });

  it('the major axis on the y-axis: inside r = 3, around r = 4', () => {
    const tall = 'נתונה אליפסה שמשוואתה x^2/9+y^2/16=1';
    for (const seed of SEEDS) {
      concentric(derive([tall, 'מעגל חסום באליפסה'], seed), 3);
      concentric(derive([tall, 'המעגל חוסם את האליפסה'], seed), 4);
    }
  });

  it('the figure\'s circle is the one it means: «נתון מעגל M» · «המעגל חוסם את האליפסה» puts M at the origin, r = 5', () => {
    for (const seed of SEEDS) {
      const d = derive([ELLIPSE, 'נתון מעגל M', 'המעגל חוסם את האליפסה'], seed);
      expect(d.faults).toEqual([]);
      concentric(d, 5);
      expect(pointsOf(d).M).toEqual({ x: expect.closeTo(0, 6), y: expect.closeTo(0, 6) });
    }
  });

  it('a parametric ellipse: the inscribed radius is the smaller of a and b, in every configuration', () => {
    for (const seed of SEEDS) {
      const d = derive(['נתונה אליפסה שמשוואתה x^2/a^2+y^2/b^2=1', 'מעגל חסום באליפסה'], seed);
      expect(d.faults).toEqual([]);
      const e = d.figure.curves.map((c) => c.curve).find((c) => c.kind === 'ellipse') as Extract<NumCurve, { kind: 'ellipse' }>;
      concentric(d, Math.min(Math.abs(e.a), Math.abs(e.b)));
    }
  });

  it('REFUSAL: a circle the figure already has, of another radius, is refused on the line', () => {
    expect(derive(['נתון מעגל שמשוואתו x^2+y^2=16', ELLIPSE, 'מעגל חסום באליפסה'], 0).faults.map((f) => f.code)).toEqual(['unsatisfiable']);
  });

  it('REFUSAL: two circles in the figure — which one is asked, never picked', () => {
    const faults = derive([ELLIPSE, 'נתון מעגל M', 'נתון מעגל K', 'מעגל חסום באליפסה'], 0).faults;
    expect(faults.map((f) => [f.code, f.host?.kind, f.host?.found])).toEqual([['ambiguous-shape', 'circle', 2]]);
  });

  it('REFUSAL: no ellipse in the figure is the existing contextual refusal, for both readings', () => {
    for (const line of ['מעגל חסום באליפסה', 'המעגל משיק לאליפסה']) {
      const faults = derive(['נתון מעגל M', line], 0).faults;
      expect(faults.map((f) => [f.code, f.host?.kind, f.host?.found]), line).toEqual([['ambiguous-shape', 'ellipse', 0]]);
    }
  });
});

describe('#2618 PR 2 — the textbook figures (fixtures, rule 4)', () => {
  it('p5-26 ב, typed line by line, records every line', () => {
    for (const fx of [p526b, p526bIn, p526bAround]) {
      const held: string[] = [];
      for (const line of fx.lines) {
        const v = decideSubmit(line, held, 0);
        expect(v.kind, `${fx.name}: «${line}»`).toBe('record');
        if (v.kind === 'record') held.push(v.line);
      }
    }
  });

  it('every fixture builds green at every configuration', () => {
    for (const fx of [p526b, p526bIn, p526bAround]) {
      for (const seed of SEEDS) expect(derive(fx.lines, seed).faults, `${fx.name} seed ${seed}`).toEqual([]);
    }
  });
});
