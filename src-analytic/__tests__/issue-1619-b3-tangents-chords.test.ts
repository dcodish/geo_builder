/**
 * TANGENTS AND CHORDS (#1619 stream B3, #1430, ADR-AG-195) — the 471 booklet's circle sentences.
 *
 * - a tangency AT A NAMED POINT («המעגל משיק לציר ה-x בנקודה A», «הישר BC משיק למעגל בנקודה B», «הקטע CD
 *   משיק למעגל בנקודה A», «AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה») lowers to: the point on the circle,
 *   the point on the line, and the line ⊥ the radius there — for ANY circle, because the radius direction
 *   reads the resolved circle;
 * - THE TANGENT AS AN OBJECT («המשיק למעגל בנקודה A») is that line, built: a `line-at` on the radius turned
 *   a quarter; «משוואת המשיק … היא …» states its equation; «המשיק» alone is the one in the figure;
 * - a line tangent to a circle the figure DETERMINES (an equation circle) pins the line's freedom (#1430
 *   step 1), and a tangent FROM a point is a free-direction line through it (#1430 step 3);
 * - CHORDS (ruling 4 on #1616: *"Chord: yes"*) — both ends on the circle, the segment drawn.
 *
 * Seed sweep per ADR-AG-144: a lock that passes at 2/24 seeds must not read as done, so every new
 * constraint is measured at 24 seeds and the whole-rate is asserted.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { canonicalConstraint } from '../engine/solve';
import type { NumCurve } from '../engine/types';
import { knownCurve } from '../engine/evaluate';

const SEEDS = 24;
const EPS = 1e-5;

type P = { x: number; y: number };
const build = (lines: string[], seed = 0) => {
  const d = derive(lines, seed);
  const pt = (id: string): P => {
    const p = d.figure.points.find((q) => q.id === id);
    if (!p) throw new Error(`no point ${id} at seed ${seed}`);
    return p;
  };
  const circle = (): Extract<NumCurve, { kind: 'circle' }> => {
    const cs = d.figure.curves.map((c) => c.curve).filter((c): c is Extract<NumCurve, { kind: 'circle' }> => c.kind === 'circle');
    if (cs.length !== 1) throw new Error(`expected one circle, got ${cs.length}`);
    return cs[0];
  };
  const curve = (id: string) => d.figure.curves.find((c) => c.id === id)?.curve ?? null;
  return { d, pt, circle, curve };
};

const close = (a: number, b: number, tol = EPS) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const at = (p: P, x: number, y: number) => close(p.x, x, 1e-4) && close(p.y, y, 1e-4);

/** Is the line through `u`,`v` tangent to circle `c` AT `t`? On the circle, on the line, ⊥ the radius. */
function tangentAt(c: { cx: number; cy: number; r: number }, t: P, u: P, v: P): boolean {
  const onCircle = close(Math.hypot(t.x - c.cx, t.y - c.cy), c.r);
  const dx = v.x - u.x;
  const dy = v.y - u.y;
  const n = Math.hypot(dx, dy);
  const onLine = Math.abs((t.x - u.x) * dy - (t.y - u.y) * dx) / n <= EPS * Math.max(1, c.r);
  const perp = Math.abs((dx * (t.x - c.cx) + dy * (t.y - c.cy)) / (n * c.r)) <= EPS;
  return onCircle && onLine && perp;
}
/** The same, for a line given as `ax + by + c = 0`. */
function lineTangentAt(c: { cx: number; cy: number; r: number }, t: P, l: { a: number; b: number; c: number }): boolean {
  const n = Math.hypot(l.a, l.b);
  const u = { x: t.x - l.b, y: t.y + l.a };
  return Math.abs(l.a * t.x + l.b * t.y + l.c) / n <= EPS * Math.max(1, c.r) && tangentAt(c, t, t, u);
}

const factsOf = (line: string) => {
  const r = parseLine(line);
  if (!r.ok) throw new Error(`${line}: ${r.code}`);
  return r.facts.map((f) => ({ ...f, src: '' }));
};
const constraintKeys = (lines: string[]) => derive(lines, 0).construction.constraints.map(canonicalConstraint).sort();

describe('#1619 B3 — a tangency AT A NAMED POINT', () => {
  it('«המעגל משיק לציר ה-x בנקודה A» (19/5): A is the foot of the centre on the axis', () => {
    const f = build(['נתון מעגל שמרכזו M(6,10)', 'המעגל משיק לציר ה-x בנקודה A']);
    expect(f.d.faults).toEqual([]);
    expect(at(f.pt('A'), 6, 0)).toBe(true);
    expect(close(f.circle().r, 10)).toBe(true);
  });

  it('«מעגל שמרכזו M משיק לציר ה-x בנקודה E» (17/5) creates the circle and names the touch', () => {
    const f = build(['מעגל שמרכזו M משיק לציר ה-x בנקודה E', 'M(3,5)']);
    expect(f.d.faults).toEqual([]);
    expect(at(f.pt('E'), 3, 0)).toBe(true);
    expect(close(f.circle().r, 5)).toBe(true);
  });

  it('«ציר ה-y משיק למעגל בנקודה A» (9/5) — the axis as the subject', () => {
    const f = build(['נתון מעגל שמרכזו M(7,5)', 'ציר ה-y משיק למעגל בנקודה A']);
    expect(f.d.faults).toEqual([]);
    expect(at(f.pt('A'), 0, 5)).toBe(true);
  });

  it('«הישר BC משיק למעגל בנקודה B» (19/5) — on an EQUATION circle: C lies on the tangent at B', () => {
    const f = build(['נתון מעגל x^2+y^2=25', 'B(3,4)', 'הישר BC משיק למעגל בנקודה B']);
    expect(f.d.faults).toEqual([]);
    expect(tangentAt(f.circle(), f.pt('B'), f.pt('B'), f.pt('C'))).toBe(true);
  });

  it('«הקטע CD משיק למעגל בנקודה A» (22/5) — the touch is ON the segment, between its ends', () => {
    for (let seed = 0; seed < 6; seed += 1) {
      const f = build(['נתון מעגל שמרכזו M(3,4)', 'הקטע CD משיק למעגל בנקודה A', 'C(-2,9)'], seed);
      expect(f.d.faults, `seed ${seed}`).toEqual([]);
      const [a, c, d] = [f.pt('A'), f.pt('C'), f.pt('D')];
      expect(tangentAt(f.circle(), a, c, d), `seed ${seed}`).toBe(true);
      const t = ((a.x - c.x) * (d.x - c.x) + (a.y - c.y) * (d.y - c.y)) / ((d.x - c.x) ** 2 + (d.y - c.y) ** 2);
      expect(t > 0 && t < 1, `seed ${seed}: t=${t}`).toBe(true);
    }
  });

  it('6/4 (#1430): «AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה» builds A(2,−1), C(−4,5) — or the mirror', () => {
    // The question's own line 2 is «O – מרכז המעגל» (B1's centre naming); the canonical «נתון מעגל שמרכזו O»
    // states the same circle so this lock stands on its own.
    const seen = new Set<string>();
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const f = build(
        ['נתון מעגל שמרכזו O', 'AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה', 'אלכסוני המרובע ABCO נפגשים בנקודה K', 'נתון: O(−2,1), B(8,11), K(−1,2)'],
        seed,
      );
      expect(f.d.faults, `seed ${seed}`).toEqual([]);
      const [a, c] = [f.pt('A'), f.pt('C')];
      const pair = (at(a, 2, -1) && at(c, -4, 5)) || (at(a, -4, 5) && at(c, 2, -1));
      expect(pair, `seed ${seed}: A(${a.x},${a.y}) C(${c.x},${c.y})`).toBe(true);
      expect(tangentAt(f.circle(), a, a, f.pt('B'))).toBe(true);
      expect(tangentAt(f.circle(), c, c, f.pt('B'))).toBe(true);
      seen.add(at(a, 2, -1) ? 'A(2,-1)' : 'A(-4,5)');
    }
    expect(seen.has('A(2,-1)')).toBe(true);
  });

  it('the respectively form is the two singular sentences — one statement, two spellings', () => {
    const pre = ['נתון מעגל שמרכזו O'];
    expect(derive([...pre, 'AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה'], 0).faults).toEqual([]);
    expect(constraintKeys([...pre, 'AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה'])).toHaveLength(4);
    expect(constraintKeys([...pre, 'AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה'])).toEqual(
      constraintKeys([...pre, 'AB משיק למעגל בנקודה A', 'BC משיק למעגל בנקודה C']),
    );
  });

  it('English spells the same facts', () => {
    expect(factsOf('the circle is tangent to the x-axis at the point A')).toEqual(factsOf('המעגל משיק לציר ה-x בנקודה A'));
    expect(factsOf('the line BC is tangent to the circle at B')).toEqual(factsOf('הישר BC משיק למעגל בנקודה B'));
    expect(factsOf('AB and BC are tangent to the circle at the points A and C respectively')).toEqual(
      factsOf('AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה'),
    );
  });

  it('refusals: a tangent from INSIDE the circle, and a degenerate touch at the line’s own end', () => {
    const inside = derive(['נתון מעגל x^2+y^2=25', 'P(1,1)', 'PA משיק למעגל בנקודה A'], 0);
    expect(inside.faults.map((f) => [f.index, f.code])).toEqual([[2, 'unsatisfiable']]);
    // P ON the circle: the only "touch" is A = P, which names no line PA.
    const onIt = derive(['נתון מעגל x^2+y^2=25', 'P(3,4)', 'PA משיק למעגל בנקודה A'], 0);
    expect(onIt.faults.map((f) => [f.index, f.code])).toEqual([[2, 'unsatisfiable']]);
  });
});

describe('#1619 B3 — the 24-seed sweep: a tangent-at-point is tangent at EVERY seed', () => {
  // Whole-rate before this stream: 0/24 (the sentences were `not-handled`). After: 24/24, asserted.
  it.each([
    [['נתון מעגל שמרכזו M', 'הישר BC משיק למעגל בנקודה B'], 'B', ['B', 'C']],
    [['נתון מעגל x^2+y^2=25', 'הקטע CD משיק למעגל בנקודה A'], 'A', ['C', 'D']],
    [['נתון מעגל שמרכזו M', 'AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה'], 'A', ['A', 'B']],
  ])('%j — tangent at %s on line %j at 24/24 seeds', (lines, touch, [u, v]) => {
    let whole = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const f = build(lines, seed);
      if (f.d.faults.length === 0 && tangentAt(f.circle(), f.pt(touch), f.pt(u), f.pt(v))) whole += 1;
    }
    expect(whole).toBe(SEEDS);
  });

  it('the tangent OBJECT is tangent at 24/24 seeds on a free circle and a free touch point', () => {
    let whole = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const f = build(['נתון מעגל שמרכזו M', 'המשיק למעגל בנקודה A'], seed);
      const l = f.curve('tangent-A');
      if (f.d.faults.length === 0 && l?.kind === 'line' && lineTangentAt(f.circle(), f.pt('A'), l)) whole += 1;
    }
    expect(whole).toBe(SEEDS);
  });
});

describe('#1619 B3 — the tangent as an OBJECT', () => {
  const C = ['נתון מעגל x^2+y^2=25', 'A(3,4)'];

  it('«המשיק למעגל בנקודה A» is the line through A perpendicular to the radius — 3x+4y=25', () => {
    const f = build([...C, 'המשיק למעגל בנקודה A']);
    expect(f.d.faults).toEqual([]);
    const l = f.curve('tangent-A');
    expect(l?.kind).toBe('line');
    expect(lineTangentAt(f.circle(), f.pt('A'), l as { a: number; b: number; c: number })).toBe(true);
  });

  it('21/5: «המשיק חותך את ציר ה-x בנקודה B ואת ציר ה-y בנקודה D» — the one tangent, both crossings', () => {
    const f = build([...C, 'המשיק למעגל בנקודה A', 'המשיק חותך את ציר ה-x בנקודה B ואת ציר ה-y בנקודה D']);
    expect(f.d.faults).toEqual([]);
    expect(at(f.pt('B'), 25 / 3, 0)).toBe(true);
    expect(at(f.pt('D'), 0, 6.25)).toBe(true);
  });

  it('13/5 — the whole question lands: the tangent at A crosses BC at the origin, y = 2x is its equation', () => {
    const corpus = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8')) as Array<{ id: string; lines: string[] }>;
    const q = corpus.find((x) => x.id === '13/5')!;
    const f = build(q.lines);
    expect(f.d.faults).toEqual([]);
    expect(at(f.pt('A'), 6, 12)).toBe(true);
    expect(at(f.pt('C'), 12, 9)).toBe(true);
    expect(at(f.pt('O'), 0, 0)).toBe(true);
  });

  it('a stated equation that AGREES with the tangent at A lands; one that does not is refused on its line', () => {
    expect(derive([...C, 'המשיק למעגל בנקודה A', 'משוואת המשיק למעגל בנקודה A היא 3x+4y=25'], 0).faults).toEqual([]);
    expect(derive([...C, 'משוואת המשיק למעגל בנקודה A היא 3x+4y=25', 'המשיק למעגל בנקודה A'], 0).faults).toEqual([]);
    const wrong = derive([...C, 'המשיק למעגל בנקודה A', 'משוואת המשיק למעגל בנקודה A היא y=2x'], 0);
    expect(wrong.faults.map((x) => [x.index, x.code])).toEqual([[3, 'unsatisfiable']]);
  });

  it('its printed equation is GATED (knownCurve): known at a fixed touch point, open at a free one', () => {
    const fixed = derive([...C, 'המשיק למעגל בנקודה A'], 0).construction;
    const l = knownCurve(fixed, 'tangent-A');
    expect(l?.kind).toBe('line');
    const { a, b, c } = l as { a: number; b: number; c: number };
    expect(close(a / c, -3 / 25) && close(b / c, -4 / 25)).toBe(true);
    const free = derive(['נתון מעגל x^2+y^2=25', 'המשיק למעגל בנקודה A'], 0).construction;
    expect(knownCurve(free, 'tangent-A')).toBeNull();
  });

  it('the stated equation is a CARRIER beside the drawn tangent — one line on the canvas, not two', () => {
    const f = build([...C, 'המשיק למעגל בנקודה A', 'משוואת המשיק למעגל בנקודה A היא 3x+4y=25']);
    expect(f.d.figure.curves.filter((c) => c.curve.kind === 'line' && c.stated)).toHaveLength(1);
  });

  it('«משוואת המשיק היא …» with no point: the one tangent object, none (a tangent line), several (refused)', () => {
    expect(derive([...C, 'המשיק למעגל בנקודה A', 'משוואת המשיק היא 3x+4y=25'], 0).faults).toEqual([]);
    expect(derive([...C, 'המשיק למעגל בנקודה A', 'משוואת המשיק היא y=2x'], 0).faults.map((x) => x.code)).toEqual(['unsatisfiable']);
    // None: the stated line is tangent to the circle — its distance from the centre is the radius.
    const none = build(['נתון מעגל שמרכזו M(0,5)', 'משוואת המשיק היא 4x + 3y = 40']);
    expect(none.d.faults).toEqual([]);
    expect(close(none.circle().r, 5)).toBe(true);
    const two = derive(['נתון מעגל x^2+y^2=25', 'A(3,4)', 'B(-3,4)', 'המשיק למעגל בנקודה A', 'המשיק למעגל בנקודה B', 'משוואת המשיק היא 3x+4y=25'], 0);
    expect(two.faults.map((x) => [x.index, x.code])).toEqual([[5, 'ambiguous-shape']]);
  });

  it('bare «המשיק» with no tangent in the figure is refused naming the host, never guessed', () => {
    const d = derive(['נתון מעגל x^2+y^2=25', 'המשיק חותך את ציר ה-x בנקודה B'], 0);
    expect(d.faults.map((x) => [x.index, x.code])).toEqual([[1, 'ambiguous-shape']]);
  });

  it('English: "the tangent to the circle at A", and its equation', () => {
    expect(factsOf('the tangent to the circle at A')).toEqual(factsOf('המשיק למעגל בנקודה A'));
    expect(factsOf('the equation of the tangent to the circle at A is 3x+4y=25')).toEqual(factsOf('משוואת המשיק למעגל בנקודה A היא 3x+4y=25'));
  });
});

describe('#1430 — tangency to a DETERMINED circle, and a tangent FROM a point', () => {
  it('«הישר y=kx+10 משיק למעגל x²+y²=25» pins k to ±√3 — one root per seed, both reached', () => {
    const roots = new Set<string>();
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const f = build(['נתון מעגל x^2+y^2=25', 'הישר y=kx+10 משיק למעגל'], seed);
      expect(f.d.faults, `seed ${seed}`).toEqual([]);
      const l = f.d.figure.curves.find((c) => c.curve.kind === 'line')!.curve as { a: number; b: number; c: number };
      // y = kx + 10 ⇔ -k·x + y - 10 = 0, normalised by b.
      const k = -l.a / l.b;
      expect(close(Math.abs(k), Math.sqrt(3), 1e-6), `seed ${seed}: k=${k}`).toBe(true);
      expect(close(Math.abs(l.c) / Math.hypot(l.a, l.b), 5)).toBe(true);
      roots.add(k > 0 ? '+' : '-');
    }
    expect([...roots].sort()).toEqual(['+', '-']);
  });

  it('a line through a point INSIDE the circle cannot be tangent — refused on its line', () => {
    const d = derive(['נתון מעגל x^2+y^2=25', 'הישר y=kx+1 משיק למעגל'], 0);
    expect(d.faults.map((x) => [x.index, x.code])).toEqual([[1, 'unsatisfiable']]);
  });

  it('«דרך A עובר משיק למעגל» — both tangents from A(10,0) across seeds, tangent at every one', () => {
    const slopes = new Set<string>();
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const f = build(['נתון מעגל x^2+y^2=25', 'A(10,0)', 'דרך A עובר משיק למעגל'], seed);
      expect(f.d.faults, `seed ${seed}`).toEqual([]);
      const l = f.d.figure.curves.find((c) => c.curve.kind === 'line')!.curve as { a: number; b: number; c: number };
      expect(close(Math.abs(l.c) / Math.hypot(l.a, l.b), 5)).toBe(true);
      expect(close(l.a * 10 + l.c, 0)).toBe(true);
      slopes.add(Math.sign(-l.a / l.b) > 0 ? '+' : '-');
    }
    expect([...slopes].sort()).toEqual(['+', '-']);
    const inside = derive(['נתון מעגל x^2+y^2=25', 'A(1,0)', 'דרך A עובר משיק למעגל'], 0);
    expect(inside.faults.map((x) => [x.index, x.code])).toEqual([[2, 'unsatisfiable']]);
  });

  it('the side-as-subject arm: «הצלע AB משיקה למעגל M» ≡ «מעגל M משיק לצלע AB», and the same figure at 24 seeds', () => {
    const pre = ['נתון מעגל M', 'מרובע ABCD'];
    const a = [...pre, 'הצלע AB משיקה למעגל M'];
    const b = [...pre, 'מעגל M משיק לצלע AB'];
    expect(constraintKeys(a)).toEqual(constraintKeys(b));
    for (let seed = 0; seed < SEEDS; seed += 1) {
      expect(derive(a, seed).figure.points, `seed ${seed}`).toEqual(derive(b, seed).figure.points);
    }
  });
});

describe('#1619 B3 — CHORDS (ruling 4 on #1616: the refusal is lifted)', () => {
  const C = ['נתון מעגל x^2+y^2=25'];

  it('a side lying on a circle is ACCEPTED — the out-of-scope refusal is gone', () => {
    const d = derive([...C, 'הצלע AB נמצאת על המעגל'], 0);
    expect(d.faults).toEqual([]);
  });

  it('«AB מיתר במעגל» ≡ «מיתר AB» ≡ «הצלע AB נמצאת על המעגל»: both ends on the circle, the segment drawn', () => {
    const keys = constraintKeys([...C, 'AB מיתר במעגל']);
    expect(constraintKeys([...C, 'מיתר AB'])).toEqual(keys);
    expect(constraintKeys([...C, 'הקטע AB נמצא על המעגל'])).toEqual(keys);
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const f = build([...C, 'AB מיתר במעגל'], seed);
      expect(f.d.faults).toEqual([]);
      for (const id of ['A', 'B']) expect(close(Math.hypot(f.pt(id).x, f.pt(id).y), 5)).toBe(true);
      expect(f.d.figure.segments.some((s) => [...s.ends].sort().join('') === 'AB')).toBe(true);
    }
  });

  it('11/5: «במעגל המיתרים AC ו-BD נפגשים בנקודה E» — four ends on the circle, E inside both chords', () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const f = build([...C, 'במעגל המיתרים AC ו-BD נפגשים בנקודה E, כמתואר בציור'], seed);
      expect(f.d.faults, `seed ${seed}`).toEqual([]);
      for (const id of ['A', 'B', 'C', 'D']) expect(close(Math.hypot(f.pt(id).x, f.pt(id).y), 5)).toBe(true);
      const e = f.pt('E');
      for (const [u, v] of [['A', 'C'], ['B', 'D']]) {
        const [p, q] = [f.pt(u), f.pt(v)];
        const t = ((e.x - p.x) * (q.x - p.x) + (e.y - p.y) * (q.y - p.y)) / ((q.x - p.x) ** 2 + (q.y - p.y) ** 2);
        expect(t >= -1e-6 && t <= 1 + 1e-6, `seed ${seed} ${u}${v} t=${t}`).toBe(true);
      }
    }
  });

  it('7/5: «במעגל שמרכזו M המיתרים AB ו-BC שווים» — ends on circle M, |AB| = |BC|', () => {
    const f = build(['במעגל שמרכזו M המיתרים AB ו-BC שווים', 'M(3,1)']);
    expect(f.d.faults).toEqual([]);
    const m = f.pt('M');
    const r = Math.hypot(f.pt('A').x - m.x, f.pt('A').y - m.y);
    for (const id of ['B', 'C']) expect(close(Math.hypot(f.pt(id).x - m.x, f.pt(id).y - m.y), r)).toBe(true);
    const len = (u: string, v: string) => Math.hypot(f.pt(u).x - f.pt(v).x, f.pt(u).y - f.pt(v).y);
    expect(close(len('A', 'B'), len('B', 'C'))).toBe(true);
  });

  it('English spells the same chords', () => {
    expect(factsOf('AB is a chord of the circle')).toEqual(factsOf('AB מיתר במעגל'));
    expect(factsOf('in the circle the chords AC and BD meet at E')).toEqual(factsOf('במעגל המיתרים AC ו-BD נפגשים בנקודה E'));
  });
});
