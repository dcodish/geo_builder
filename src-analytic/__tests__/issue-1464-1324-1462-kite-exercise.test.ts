/**
 * THE KITE EXERCISE (#1464, #1324, #1462 — ADR-AG-160, ADR-AG-161).
 *
 * Operator, prod session `j73pikxb`: the 572 kite — «ABCD דלתון · AB=AD · CB=CD · A(1,7) · BD on y=x · C on
 * y=−2x+17 · AB=6», then the condition that picks the drawing and the circle the question asks about. Every
 * one of these was `not-handled`, and so were the LLM's translations:
 *
 *   «שיעור ה- x של נקודה B גדול משיעור ה- x של נקודה D» · «B_x>D_x»        (#1462 — he typed B(7,7) instead)
 *   «מעגל BDA» · «מעגל שעובר בנקודות ABD»                                  (#1464)
 *   «BD קוטר» · «DB קוטר במעגל»                                            (#1324)
 *
 * Operator ruling 2026-09-27 (#1464): the circle is COMPUTED from its points — no solve, no invented
 * centre letter.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { distinctConfigSeeds, drawableAt, type Figure } from '../engine/evaluate';
import { reportedDof } from '../engine/carriers';
import { parseLine } from '../parser/parseAnalytic';
import { ask } from '../app/ask';
import { fmtNum } from '../../shell/format';

/** The operator's kite, with the shape noun first (the reversed «ABCD דלתון» is #1239's). */
const KITE = ['דלתון ABCD', 'AB=AD', 'CB=CD', 'A(1,7)', 'משוואת הקטע BD היא y=x', 'נקודה C נמצאת על הישר y=-2x+17', 'AB=6'];

const pt = (f: Figure, id: string) => {
  const p = f.points.find((q) => q.id === id);
  // `+ 0` folds -0 into 0: a coordinate that rounds to zero is zero, whichever side the solve left it.
  return p ? [Number(p.x.toFixed(3)) + 0, Number(p.y.toFixed(3)) + 0] : null;
};
const circleOf = (f: Figure) => {
  const c = f.curves.find((q) => q.curve.kind === 'circle')?.curve;
  return c && c.kind === 'circle' ? [Number(c.cx.toFixed(3)) + 0, Number(c.cy.toFixed(3)) + 0, Number(c.r.toFixed(3))] : null;
};
const R18 = Number(Math.sqrt(18).toFixed(3));

describe('#1464 — the circle through three points, in every spelling the exam and the operator use', () => {
  const spellings = [
    'מעגל ABD',
    'המעגל ABD',
    'מעגל BDA', // the operator's own order
    'מעגל שעובר בנקודות ABD', // the operator's own sentence
    'מעגל העובר דרך הנקודות A, B, D',
    'המעגל העובר דרך A, B ו-D',
    'המעגל החוסם את המשולש ABD',
    'מעגל חוסם משולש ABD',
    'המשולש ABD חסום במעגל',
    'circle ABD',
    'the circle through A, B, D',
    'the circle through the points A, B and D',
    'the circle passing through A, B and D',
    'the circumcircle of triangle ABD',
    'triangle ABD is inscribed in a circle',
  ];
  it.each(spellings)('%s → the circle through A, B, D: centre (4,4), r = √18', (line) => {
    const d = derive([...KITE, line], 0);
    expect(d.faults).toEqual([]);
    expect(circleOf(d.figure)).toEqual([4, 4, R18]);
  });

  it('one circle, whatever the order of the letters — «מעגל ABD» then «מעגל BDA» is a restatement', () => {
    const d = derive([...KITE, 'מעגל ABD', 'מעגל BDA'], 0);
    expect(d.faults).toEqual([]);
    expect(d.outcomes.at(-1)).toBe('known');
    expect(d.figure.curves.filter((c) => c.curve.kind === 'circle')).toHaveLength(1);
  });

  // #1619 B2 built the incircle: these voices are now CLAIMED — as the incircle, never as this circumcircle.
  it('the INCIRCLE voices are never read as the circumcircle — «מעגל חסום במשולש», «משולש חוסם מעגל» (2-D #31 / #38)', () => {
    for (const line of ['מעגל חסום במשולש ABD', 'משולש ABD חוסם מעגל']) {
      const r = parseLine(line);
      expect(r.ok).toBe(true);
      const defs = r.ok ? r.facts.flatMap((f) => (f.t === 'circle-thru' ? [f.def.t] : [])) : [];
      expect(defs).toEqual(['incircle']);
    }
  });

  it('«מעגל III» stays a circle NAME, and «נתון מעגל O» stays a circle on a centre (#1060)', () => {
    const iii = parseLine('מעגל III');
    expect(iii.ok && iii.facts.some((f) => f.t === 'circle-thru')).toBe(false);
    const o = parseLine('נתון מעגל O');
    expect(o.ok && o.facts.map((f) => f.t)).toEqual(['declare', 'param', 'circle-at']);
  });

  it('adds NO freedom and moves nothing — the stability invariant', () => {
    const before = derive(KITE, 0);
    const after = derive([...KITE, 'מעגל ABD'], 0);
    expect(reportedDof(after.construction, after.figure.carrierDof)).toBe(reportedDof(before.construction, before.figure.carrierDof));
    for (const id of ['A', 'B', 'C', 'D']) expect(pt(after.figure, id)).toEqual(pt(before.figure, id));
  });

  it('follows its points: «הציגו תצורה אחרת» still offers both kites, and the circle is the same one in each', () => {
    const c = derive([...KITE, 'מעגל ABD'], 0).construction;
    const seeds = distinctConfigSeeds(c);
    expect(new Set(seeds.map((s) => JSON.stringify(pt(drawableAt(c, s), 'B'))))).toEqual(new Set(['[1,1]', '[7,7]']));
    for (const s of seeds) expect(circleOf(drawableAt(c, s))).toEqual([4, 4, R18]);
  });

  it('a named circle answers its equation in the panel — «משוואת המעגל I»', () => {
    const d = derive(['A(0,3)', 'B(-3,0)', 'D(3,0)', 'מעגל I העובר דרך A, B ו-D'], 0);
    expect(ask(d, 'משוואת המעגל I', (v) => fmtNum(v)).value).toBe('x² + y² = 9');
  });

  it('refusals name the sentence: an unknown point, a repeated one, three pinned collinear points', () => {
    expect(derive(['A(0,0)', 'B(1,1)', 'מעגל ABQ'], 0).faults.map((f) => f.code)).toEqual(['unknown-reference']);
    expect(derive(['A(0,0)', 'B(1,1)', 'מעגל שעובר בנקודות A, B, A'], 0).faults.map((f) => f.code)).toEqual(['repeated-vertex']);
    const col = derive(['A(0,0)', 'B(1,1)', 'C(2,2)', 'מעגל ABC'], 0);
    expect(col.faults.map((f) => [f.index, f.code])).toEqual([[3, 'does-not-exist']]);
  });
});

describe('#1324 — a circle from its diameter, and a diameter of an existing circle', () => {
  const spellings = [
    'BD קוטר', // the operator's
    'BD קוטר במעגל',
    'DB קוטר במעגל', // the operator's
    'BD הוא קוטר במעגל',
    'הקטע BD הוא קוטר במעגל',
    'BD קוטר של המעגל',
    'BD קוטר של מעגל',
    'קוטר BD במעגל',
    'נתון מעגל שקוטרו BD', // the LLM's translation of his line
    'מעגל שקוטרו BD',
    'BD קוטר במעגל חדש',
    'BD is a diameter',
    'BD is a diameter of the circle',
    'BD is a diameter of a circle',
    'the circle with diameter BD',
    'a circle with diameter BD',
  ];
  it.each(spellings)('%s → the circle on diameter BD: centre (4,4), r = √18, and A is on it', (line) => {
    const d = derive([...KITE, line], 0);
    expect(d.faults).toEqual([]);
    expect(circleOf(d.figure)).toEqual([4, 4, R18]);
    // Item ד of the exercise: A lies on the circle whose diameter is BD (∠BAD = 90°).
    const a = d.figure.points.find((p) => p.id === 'A')!;
    expect(Math.hypot(a.x - 4, a.y - 4)).toBeCloseTo(Math.sqrt(18), 6);
  });

  it('about the circle already there — a circle through three points: Thales, both directions', () => {
    const holds = derive(['A(0,3)', 'B(-3,0)', 'D(3,0)', 'מעגל ABD', 'BD קוטר במעגל'], 0);
    expect(holds.faults).toEqual([]);
    expect(holds.figure.curves.filter((c) => c.curve.kind === 'circle')).toHaveLength(1);
    // A(0,4) is not on the circle with diameter BD: the right angle at A cannot hold.
    const fails = derive(['A(0,4)', 'B(-3,0)', 'D(3,0)', 'מעגל ABD', 'BD קוטר במעגל'], 0);
    expect(fails.faults.map((f) => [f.index, f.code])).toEqual([[4, 'unsatisfiable']]);
  });

  it('about a circle on a centre: both ends on it and the centre at their midpoint', () => {
    const d = derive(['A(0,3)', 'B(-3,0)', 'D(3,0)', 'נתון מעגל O', 'A על המעגל', 'BD קוטר במעגל'], 0);
    expect(d.faults).toEqual([]);
    expect(pt(d.figure, 'O')).toEqual([0, 0]);
    expect(circleOf(d.figure)).toEqual([0, 0, 3]);
  });

  it('a defining phrase makes a NEW circle even beside another one', () => {
    const d = derive(['A(0,4)', 'B(-3,0)', 'D(3,0)', 'מעגל ABD', 'נתון מעגל שקוטרו BD'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves.filter((c) => c.curve.kind === 'circle')).toHaveLength(2);
  });

  it('refusals: a circle known only by its equation (out-of-scope), two circles and none named (ambiguous)', () => {
    const eq = derive(['B(-3,0)', 'D(3,0)', '(x-3)^2+(y-4)^2=9', 'BD קוטר במעגל'], 0);
    expect(eq.faults.map((f) => [f.index, f.code])).toEqual([[3, 'out-of-scope']]);
    const two = derive(['A(0,4)', 'B(-3,0)', 'D(3,0)', 'מעגל ABD', '(x-3)^2+(y-4)^2=9', 'BD קוטר במעגל'], 0);
    expect(two.faults.map((f) => [f.index, f.code])).toEqual([[5, 'ambiguous-shape']]);
    // Ends that coincide have no circle.
    expect(derive(['A(0,0)', 'B(0,0)', 'BA קוטר'], 0).faults.map((f) => f.code)).toEqual(['does-not-exist']);
  });
});

describe('#1462 — a coordinate compared chooses the configuration', () => {
  const spellings = [
    'x_B > x_D', // the LLM's translation, unprompted
    'x_B>x_D',
    'B_x>D_x', // the operator's
    'x_{B} > x_{D}',
    'xB > xD',
    'x_D < x_B',
    'שיעור ה-x של B גדול משיעור ה-x של D',
    'שיעור ה- x של נקודה B גדול משיעור ה- x של נקודה D', // the operator's
    'שיעור ה-x של D קטן משיעור ה-x של B',
    'the x-coordinate of B is greater than the x-coordinate of D',
    'the x-coordinate of B is greater than that of D',
    'x_B > 4',
    'שיעור ה-x של B גדול מ-4',
  ];
  it.each(spellings)('%s → B(7,7) at seed 0 and at every drawn seed, with and without the circle', (line) => {
    for (const extra of [[], ['מעגל ABD']]) {
      const d = derive([...KITE, ...extra, line], 0);
      expect(d.faults).toEqual([]);
      expect(pt(d.figure, 'B')).toEqual([7, 7]);
      for (let seed = 0; seed < 24; seed += 1) expect(pt(drawableAt(d.construction, seed), 'B'), `seed ${seed}`).toEqual([7, 7]);
    }
  });

  it('without it the kite has two drawings; with it, one — the selector consumes no freedom', () => {
    const open = derive(KITE, 0);
    const chosen = derive([...KITE, 'x_B > x_D'], 0);
    expect(distinctConfigSeeds(open.construction)).toHaveLength(2);
    expect(distinctConfigSeeds(chosen.construction)).toHaveLength(1);
    expect(reportedDof(chosen.construction, chosen.figure.carrierDof)).toBe(reportedDof(open.construction, open.figure.carrierDof));
  });

  it('refusals name the sentence', () => {
    // A comparison no configuration satisfies — the plan's own refusal case.
    expect(derive([...KITE, 'B(1,1)', 'x_B > x_D'], 0).faults.map((f) => [f.index, f.code])).toEqual([[8, 'unsatisfiable']]);
    // Two comparisons that cannot both hold: the refusal names the one that fails in the configuration
    // drawn (#1268's selector blame) — either line of the pair, never a third.
    const pair = derive([...KITE, 'x_B > x_D', 'x_B < x_D'], 0).faults;
    expect(pair).toHaveLength(1);
    expect(pair[0].code).toBe('unsatisfiable');
    expect([7, 8]).toContain(pair[0].index);
    expect(derive([...KITE, 'x_B > x_Q'], 0).faults.map((f) => f.code)).toEqual(['unknown-reference']);
    expect(derive(['A(0,0)', 'x_A > x_A'], 0).faults.map((f) => f.code)).toEqual(['repeated-vertex']);
    // Two different axes are two different quantities — not read as a comparison.
    expect(parseLine('x_A > y_B').ok).toBe(false);
  });

  it('`axis-side` is the same comparison against 0 — «B על החלק החיובי של ציר x» still chooses', () => {
    const d = derive(['A(0,0)', 'נקודה B', 'AB=5', 'B על ציר x', 'B על החלק החיובי של ציר x'], 0);
    expect(d.faults).toEqual([]);
    expect(pt(d.figure, 'B')).toEqual([5, 0]);
  });

  it('a value may be stated in words: «שיעור ה-x של B חיובי»', () => {
    const r = parseLine('שיעור ה-x של B חיובי');
    expect(r.ok && r.facts[0].t === 'selector' && r.facts[0].sel).toEqual({
      kind: 'coord-compare',
      id: 'B',
      axis: 'x',
      greater: true,
      rhs: { value: { kind: 'num', value: 0 } },
    });
  });
});

describe('the whole exercise, as the operator would type it for the demo', () => {
  it('every item answers: AC, C, B and D in the right order, the circle on BD, C outside it, the area', () => {
    const d = derive([...KITE, 'שיעור ה-x של B גדול משיעור ה-x של D', 'BD קוטר במעגל'], 0);
    expect(d.faults).toEqual([]);
    const q = (s: string) => ask(d, s, (v) => fmtNum(v)).value;
    expect(q('משוואת הישר AC')).toBe('x + y - 8 = 0');
    expect(q('C')).toBe('(9, -1)');
    expect(q('B')).toBe('(7, 7)');
    expect(q('D')).toBe('(1, 1)');
    expect(q('שטח ABCD')).toBe('48');
    expect(circleOf(d.figure)).toEqual([4, 4, R18]);
    const c = d.figure.points.find((p) => p.id === 'C')!;
    expect(Math.hypot(c.x - 4, c.y - 4)).toBeGreaterThan(Math.sqrt(18)); // item ה: outside
  });
});
