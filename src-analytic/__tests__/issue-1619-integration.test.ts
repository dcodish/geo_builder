/**
 * #1619 PHASE B INTEGRATION — the three streams on one tree (ADR-AG-196), and #1633.
 *
 * 1. ONE lowering for a touch at a named point. B2 read «הצלעות … משיקות למעגל בנקודות … בהתאמה» into its own
 *    `touch-at`; B3 read every «משיק … בנקודה A» into `tangent-of` with `at` (A on the circle, A on the line,
 *    the line ⊥ the radius — for every circle kind). The integration keeps B3's: the plural sentence is read by
 *    B3's touch reader, and the incircle's closed-form touch point (B2's `side-touch`) is that lowering's
 *    branch for the incircle's own side.
 * 2. THE BINDING PRINCIPLE: a sentence whose subject is the contextual «המעגל» binds to THE circle the figure
 *    has when it has exactly one, creates one when it has none, and is refused as ambiguous with several; a
 *    sentence that describes its own circle (a centre, an equation) binds to a circle with that centre or
 *    that equation, and creates otherwise.
 * 3. The corpus questions the integrated tree draws, checked by hand against the geometry.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import type { Figure } from '../engine/evaluate';
import { parseLine } from '../parser/parseAnalytic';
import type { Fact } from '../engine/types';

type P = { x: number; y: number };
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const CORPUS: { id: string; lines: string[] }[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));
const corpus = (id: string) => CORPUS.find((q) => q.id === id)!.lines;
const codes = (lines: string[], seed = 0) => derive(lines, seed).faults.map((f) => [f.index, f.code]);
const pts = (f: Figure): Record<string, P> => Object.fromEntries(f.points.map((p) => [p.id, p]));
const circles = (f: Figure) =>
  f.curves.flatMap((c) => (c.curve.kind === 'circle' ? [{ id: c.id, cx: c.curve.cx, cy: c.curve.cy, r: c.curve.r }] : []));
const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const whole = (d: ReturnType<typeof derive>) =>
  d.faults.length === 0 && d.figure.unsatisfied.length === 0 && d.figure.ringFaults.length === 0 && d.figure.selectorsOk;
const factsOf = (line: string): Fact[] => {
  const r = parseLine(line);
  if (!r.ok) throw new Error(`${line}: ${r.code}`);
  return r.facts;
};
/** The foot of P on the line AB — where a tangent AB touches a circle centred at P. */
const foot = (p: P, a: P, b: P): P => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  return { x: a.x + t * dx, y: a.y + t * dy };
};

describe('ADR-AG-196 — one lowering for a touch at a named point (B2 ∪ B3)', () => {
  it('the plural side touch (B2) and the singular / two-tangent touch (B3) lower to the same fact kind', () => {
    const touches = (line: string) => factsOf(line).filter((f) => f.t === 'tangent-of');
    for (const line of [
      'הצלעות AO, BO ו-AB משיקות למעגל בנקודות D, E ו-F בהתאמה',
      'the sides AB, BC and CA touch the circle at D, E and F respectively',
      'AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה',
      'הישר BC משיק למעגל בנקודה B',
      'הקטע CD משיק למעגל בנקודה A',
    ]) {
      const t = touches(line);
      expect(t.length, line).toBeGreaterThan(0);
      for (const f of t) expect(f.t === 'tangent-of' && f.at !== undefined, line).toBe(true);
    }
    // No second fact kind survives the integration.
    expect(JSON.stringify(factsOf('הצלעות AO, BO ו-AB משיקות למעגל בנקודות D, E ו-F בהתאמה'))).not.toContain('touch-at');
    // «צלעות» bounds every side, as «הקטע» bounds one (#1503's noun rule).
    expect(touches('הצלעות AB ו-BC משיקות למעגל בנקודות D ו-E בהתאמה').every((f) => f.t === 'tangent-of' && f.lines![0].kind === 'points' && f.lines![0].bounded)).toBe(true);
    expect(touches('הישרים AB ו-BC משיקים למעגל בנקודות D ו-E בהתאמה').some((f) => f.t === 'tangent-of' && f.lines![0].kind === 'points' && f.lines![0].bounded)).toBe(false);
  });

  it('on the incircle the touch point is the closed-form foot of the centre on the side, at 24 seeds', () => {
    for (const seed of SEEDS) {
      const d = derive(['מעגל חסום במשולש ABC', 'הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה'], seed);
      expect(whole(d), `seed ${seed}`).toBe(true);
      expect(circles(d.figure)).toHaveLength(1);
      const c = circles(d.figure)[0];
      const q = pts(d.figure);
      for (const [t, a, b] of [['D', 'A', 'B'], ['E', 'B', 'C'], ['F', 'C', 'A']]) {
        const f = foot({ x: c.cx, y: c.cy }, q[a], q[b]);
        expect(near(q[t].x, f.x, 1e-12) && near(q[t].y, f.y, 1e-12), `${t} seed ${seed}`).toBe(true);
      }
    }
  });

  it('a circle on a centre and an EQUATION circle are touched through the same lowering (B2 refused the equation circle)', () => {
    for (const host of [['נתון מעגל שמרכזו M', 'משולש ABC'], ['(x-1)^2+(y-1)^2=4', 'משולש ABC']]) {
      let ok = 0;
      for (const seed of SEEDS) {
        const d = derive([...host, 'הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה'], seed);
        if (!whole(d)) continue;
        const c = circles(d.figure)[0];
        const q = pts(d.figure);
        const tangent = [['D', 'A', 'B'], ['E', 'B', 'C'], ['F', 'C', 'A']].every(([t, a, b]) => {
          const f = foot({ x: c.cx, y: c.cy }, q[a], q[b]);
          return near(dist(q[t], { x: c.cx, y: c.cy }), c.r, 1e-5) && near(q[t].x, f.x, 1e-5) && near(q[t].y, f.y, 1e-5);
        });
        if (tangent) ok += 1;
      }
      expect(ok, host[0]).toBe(24);
    }
  });

  it('#1430 — the two tangents from an external point still build (B3), A and C the touch points', () => {
    const d = derive(corpus('6/4'));
    expect(d.faults).toEqual([]);
    const q = pts(d.figure);
    expect([q.A.x, q.A.y, q.C.x, q.C.y].map((v) => Number(v.toFixed(6)) + 0)).toEqual([2, -1, -4, 5]);
  });
});

describe('ADR-AG-196 — the contextual «המעגל» binds to the one circle (#1633)', () => {
  it('#1633 — «נתון מעגל שמרכזו M» then «משוואת המעגל היא …» is ONE circle: M = (3,1), r = √10', () => {
    for (const lines of [
      ['נתון מעגל שמרכזו M', 'משוואת המעגל היא (x-3)^2+(y-1)^2=10'],
      ['נתון מעגל שמרכזו M', 'משוואת המעגל הנתון היא: (x − 3)² + (y − 1)² = 10'],
      ['נתון מעגל שמרכזו M', 'נתונה משוואת המעגל: (x-3)^2+(y-1)^2=10'],
    ]) {
      for (const seed of [0, 1, 2, 3]) {
        const d = derive(lines, seed);
        expect(d.faults, lines[1]).toEqual([]);
        const cs = circles(d.figure);
        expect(cs, lines[1]).toHaveLength(1);
        expect(near(cs[0].cx, 3) && near(cs[0].cy, 1) && near(cs[0].r, Math.sqrt(10))).toBe(true);
        expect([pts(d.figure).M.x, pts(d.figure).M.y]).toEqual([3, 1]);
      }
    }
  });

  it('a circle described by its centre letter is the circle on that centre — #1633 with the letter written in', () => {
    for (const second of ['נתון מעגל M שמשוואתו (x-3)^2+(y-1)^2=10', 'משוואת המעגל M היא (x-3)^2+(y-1)^2=10']) {
      const d = derive(['נתון מעגל שמרכזו M', second], 0);
      expect(d.faults, second).toEqual([]);
      expect(circles(d.figure), second).toHaveLength(1);
      expect([pts(d.figure).M.x, pts(d.figure).M.y]).toEqual([3, 1]);
    }
    // The letter says which circle, so a second circle is no ambiguity.
    const two = derive(['נתון מעגל שמרכזו M', 'נתון מעגל שמרכזו K', 'משוואת המעגל M היא (x-3)^2+(y-1)^2=10'], 0);
    expect(two.faults).toEqual([]);
    expect(circles(two.figure)).toHaveLength(2);
    expect([pts(two.figure).M.x, pts(two.figure).M.y]).toEqual([3, 1]);
    // Inside «חסום במעגל M שמשוואתו …»: bound by the letter, the equation pins the circle and the vertices lie on it.
    const inscribed = derive(['נתון מעגל שמרכזו M', 'משולש ABC חסום במעגל M שמשוואתו (x-3)^2+(y-1)^2=10'], 0);
    expect(inscribed.faults).toEqual([]);
    expect(circles(inscribed.figure)).toHaveLength(1);
    for (const v of ['A', 'B', 'C']) expect(near(dist(pts(inscribed.figure)[v], { x: 3, y: 1 }), Math.sqrt(10), 1e-6)).toBe(true);
    expect(codes(['נתון מעגל שמרכזו M', 'M(0,0)', 'משולש ABC חסום במעגל M שמשוואתו (x-3)^2+(y-1)^2=10'])).toEqual([[2, 'conflicting-restatement']]);
    // A named centre of a canonical circle keeps its letter: no O is offered beside it; unnamed, O is offered.
    expect(derive(['נתון מעגל P שמשוואתו x^2+y^2=16'], 0).figure.points.map((p) => p.id)).toEqual(['P']);
    expect(derive(['משוואת המעגל היא x^2+y^2=16'], 0).minted).toEqual([{ index: 0, id: 'O' }]);
  });

  it('with no circle it states one; the same equation again is known; the naming form keeps creating', () => {
    const d = derive(['משוואת המעגל היא (x-3)^2+(y-1)^2=10'], 0);
    expect(d.faults).toEqual([]);
    expect(circles(d.figure)).toHaveLength(1);
    expect(codes(['(x-3)^2+(y-1)^2=10', 'משוואת המעגל היא (x-3)^2+(y-1)^2=10'])).toEqual([]);
    expect(circles(derive(['(x-3)^2+(y-1)^2=10', 'משוואת המעגל היא (x-3)^2+(y-1)^2=10']).figure)).toHaveLength(1);
    // «משוואת המעגל x²+y²=25» (no copula, the catalog's naming form) names a circle by its equation.
    expect(factsOf('משוואת המעגל x^2+y^2=25').map((f) => f.t)).toEqual(['curve']);
  });

  it('a conflicting equation is refused naming the line — against an equation circle, a placed centre, a stated radius', () => {
    expect(codes(['(x-3)^2+(y-1)^2=10', 'משוואת המעגל היא (x-3)^2+(y-1)^2=9'])).toEqual([[1, 'conflicting-restatement']]);
    expect(codes(['נתון מעגל שמרכזו M', 'M(1,2)', 'משוואת המעגל היא (x-3)^2+(y-1)^2=10'])).toEqual([[2, 'conflicting-restatement']]);
    expect(codes(['נתון מעגל שמרכזו M שרדיוסו 4', 'משוואת המעגל היא (x-3)^2+(y-1)^2=10'])).toEqual([[1, 'conflicting-restatement']]);
    expect(codes(['נתון מעגל שמרכזו M', 'משוואת המעגל היא (x-3)^2+(y-1)^2=10', 'רדיוס המעגל הוא 4'])).toEqual([[2, 'conflicting-restatement']]);
  });

  it('two circles in the figure: «המעגל» is ambiguous and refused, never a pick', () => {
    expect(codes(['נתון מעגל שמרכזו M', 'נתון מעגל שמרכזו K', 'משוואת המעגל היא (x-3)^2+(y-1)^2=10'])).toEqual([[2, 'ambiguous-shape']]);
    expect(codes(['נתון מעגל שמרכזו M', 'נתון מעגל שמרכזו K', 'משולש ABC חסום במעגל'])).toEqual([[2, 'ambiguous-shape']]);
  });

  it('line-case parity: «משוואת הישר AB היא …» about an AB the figure has is a statement about it, like the circle sentence', () => {
    const d = derive(['משולש ABC', 'משוואת הישר AB היא y=2x+1'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves).toHaveLength(1);
    for (const v of ['A', 'B']) expect(pts(d.figure)[v].y).toBeCloseTo(2 * pts(d.figure)[v].x + 1, 6);
    expect(codes(['A(0,1)', 'B(1,3)', 'משוואת הישר AB היא y=2x+1'])).toEqual([]);
    expect(codes(['A(0,1)', 'B(1,3)', 'משוואת הישר AB היא y=3x+1'])).toEqual([[2, 'unsatisfiable']]);
  });

  it('«X חסום במעגל» with no description binds to the one circle — every vertex ON it, at 24 seeds', () => {
    for (const seed of SEEDS) {
      const d = derive(['נתון מעגל שמרכזו M', 'משולש ABC חסום במעגל'], seed);
      expect(whole(d), `seed ${seed}`).toBe(true);
      const cs = circles(d.figure);
      expect(cs).toHaveLength(1);
      const q = pts(d.figure);
      for (const v of ['A', 'B', 'C']) expect(near(dist(q[v], q.M), cs[0].r, 1e-6)).toBe(true);
    }
  });

  it('a circle the sentence DESCRIBES binds to the circle with that centre / equation, and otherwise is a new one', () => {
    // The centre named after an equation circle (#1598): «שמרכזו M» is that circle.
    const named = derive(['(x-3)^2+(y-1)^2=10', 'M מרכז המעגל', 'משולש ABC חסום במעגל שמרכזו M'], 0);
    expect(named.faults).toEqual([]);
    expect(circles(named.figure)).toHaveLength(1);
    const q = pts(named.figure);
    for (const v of ['A', 'B', 'C']) expect(near(dist(q[v], { x: 3, y: 1 }), Math.sqrt(10), 1e-6)).toBe(true);
    // The same equation: bound. A different centre: a second circle, as the sentence describes.
    expect(circles(derive(['(x-3)^2+(y-1)^2=10', 'משולש ABC חסום במעגל שמשוואתו (x-3)^2+(y-1)^2=10'], 0).figure)).toHaveLength(1);
    expect(circles(derive(['נתון מעגל שמרכזו M', 'משולש ABC חסום במעגל שמרכזו K'], 0).figure)).toHaveLength(2);
    // With none, «חסום במעגל» states the computed circle through the vertices, as before.
    expect(circles(derive(['משולש ABC חסום במעגל'], 0).figure).map((c) => c.id)).toEqual(['circle-thru-ABC']);
  });

  it('«המעגל עובר דרך הנקודות A, B ו-C» with a circle is three «X על המעגל» — the same figure', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const a = derive(['נתון מעגל שמרכזו M', 'המעגל עובר דרך הנקודות A, B ו-C'], seed);
      const b = derive(['נתון מעגל שמרכזו M', 'A על המעגל', 'B על המעגל', 'C על המעגל'], seed);
      expect(a.faults).toEqual([]);
      expect(circles(a.figure)).toHaveLength(1);
      expect(a.figure.points).toEqual(b.figure.points);
    }
    // With none it is the circle through the three, as #1464 built it (the points must exist).
    expect(circles(derive(['A(0,0)', 'B(4,0)', 'C(0,3)', 'המעגל עובר דרך הנקודות A, B ו-C'], 0).figure).map((c) => c.id)).toEqual(['circle-thru-ABC']);
  });

  it('corpus 7/5 and 12/5 draw on the ONE circle the equation describes', () => {
    const d7 = derive(corpus('7/5'));
    expect(d7.faults).toEqual([]);
    expect(circles(d7.figure)).toHaveLength(1);
    const q7 = pts(d7.figure);
    for (const v of ['A', 'B', 'C']) expect(near(dist(q7[v], { x: 3, y: 1 }), Math.sqrt(10), 1e-6)).toBe(true);
    const d12 = derive(corpus('12/5'));
    expect(d12.faults).toEqual([]);
    expect(circles(d12.figure)).toHaveLength(1);
    const q12 = pts(d12.figure);
    expect([q12.M.x, q12.M.y]).toEqual([4, -2]);
    for (const v of ['A', 'B', 'C']) expect(near(dist(q12[v], q12.M), 5, 1e-6)).toBe(true);
  });
});

/**
 * The corpus questions that fully land on the integrated tree, coordinates checked BY HAND against the
 * exam's geometry (ADR-AG-196 lists the working). Seed 0; a free point is not listed.
 */
describe('#1619 — the newly landing corpus questions draw the exam`s figure', () => {
  const FIGURES: Record<string, Record<string, [number, number]>> = {
    '2/5': { A: [7, -5], B: [7, 3], C: [0, 2], M: [4, -1] },
    '3/5': { A: [-8, 0], B: [0, 6], C: [-2, 2], D: [-2, 0], E: [0, 2], F: [-3.2, 3.6] },
    '4/4': { A: [1, 2], B: [3, 4], C: [3.4, 3.6] },
    '6/4': { A: [2, -1], B: [8, 11], C: [-4, 5], O: [-2, 1], K: [-1, 2] },
    '7/5': { M: [3, 1], A: [0.4, -0.8], B: [2, -2], C: [4, -2] },
    '9/5': { A: [0, -4], B: [-2, 0], C: [-8, 0], D: [-10, -4], M: [-5, -4] },
    '12/5': { A: [7, -6], B: [1, -6], M: [4, -2], D: [4, -6] },
    '13/5': { M: [9, 10.5], A: [6, 12], B: [9.6, 7.2], C: [12, 9], O: [0, 0], F: [0, 15] },
    '15/4': { B: [0, 12], C: [4, 10], D: [0, 2], E: [2, 6] },
    '16/4': { O: [0, 0], A: [4, 0], B: [9, 0], E: [4.5, 1.5], C: [0, 3] },
    '18/5': { A: [-10, 4], B: [-2, 0], C: [0, 4], M: [-5, 4] },
    '19/5': { M: [6, 10], A: [6, 0], B: [0, 18], C: [-4.8, 14.4] },
    '20/5': { A: [-5, 3], B: [3, 7], C: [4, 0], D: [-4, 0], M: [0, 3] },
  };
  it.each(Object.keys(FIGURES))('%s', (id) => {
    const d = derive(corpus(id));
    expect(d.faults).toEqual([]);
    for (const [p, [x, y]] of Object.entries(FIGURES[id])) {
      const at = d.figure.points.find((pt) => pt.id === p);
      expect(at, p).toBeDefined();
      expect(at!.x).toBeCloseTo(x, 4);
      expect(at!.y).toBeCloseTo(y, 4);
    }
  });

  it('5/4 — the chord AB at distance MO = 8 under an inscribed 72°: r = 8 / cos 72°', () => {
    const d = derive(corpus('5/4'));
    expect(d.faults).toEqual([]);
    expect(circles(d.figure)[0].r).toBeCloseTo(8 / Math.cos((72 * Math.PI) / 180), 4);
  });

  it('18/5 — D on the y-axis with ∢ADC = ∢BAC: (0, 24) or its mirror (0, −16)', () => {
    const d = pts(derive(corpus('18/5')).figure);
    expect(d.D.x).toBeCloseTo(0, 6);
    expect([24, -16].some((y) => Math.abs(d.D.y - y) < 1e-4)).toBe(true);
  });

  it('20/5 — E on the minor arc AC with EC = 7', () => {
    const q = pts(derive(corpus('20/5')).figure);
    expect(dist(q.E, q.C)).toBeCloseTo(7, 4);
    expect(dist(q.E, q.M)).toBeCloseTo(5, 4);
  });
});
