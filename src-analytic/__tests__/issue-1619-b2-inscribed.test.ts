/**
 * INSCRIBED AND CIRCUMSCRIBED (#1619 stream B2, #1554 — ADR-AG-194).
 *
 * The 471 corpus's circle openers — «מרובע ABCD חסום במעגל», «המרובע ABCD חסום במעגל שמרכזו M», «… שמשוואתו …»,
 * «משולש ABC חסום במעגל שקוטרו AC», «במעגל שמרכזו M חסום משולש חד זוויות ABC», «במשולש AOB חסום מעגל שמרכזו C»
 * and its touch points, the diameter forms — were every one `not-handled` or orphaned. One rule family now
 * lowers each sentence to the sentences it is made of (the noun, the circle, the incidences), the incircle is a
 * computed circle, and «חד זוויות» is a selector.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { distinctConfigSeeds, drawableAt, type Figure } from '../engine/evaluate';
import { parseLine } from '../parser/parseAnalytic';
import { decideSubmit } from '../app/submit';
import type { Fact } from '../engine/types';

type P = { x: number; y: number };
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const pt = (f: Figure, id: string) => {
  const p = f.points.find((q) => q.id === id);
  return p ? [Number(p.x.toFixed(3)) + 0, Number(p.y.toFixed(3)) + 0] : null;
};
const pts = (f: Figure): Record<string, P> => Object.fromEntries(f.points.map((p) => [p.id, p]));
const circleOf = (f: Figure) => {
  const c = f.curves.find((q) => q.curve.kind === 'circle')?.curve;
  return c && c.kind === 'circle' ? c : null;
};
const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);
const lineDist = (c: P, a: P, b: P) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / dist(a, b);
const angleAt = (v: P, p: P, q: P) =>
  (Math.acos(((p.x - v.x) * (q.x - v.x) + (p.y - v.y) * (q.y - v.y)) / (dist(v, p) * dist(v, q))) * 180) / Math.PI;
const near = (a: number, b: number, tol = 1e-5) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
/** A figure that may be shown as satisfying its givens. */
const whole = (d: ReturnType<typeof derive>) =>
  d.faults.length === 0 && d.figure.unsatisfied.length === 0 && d.figure.ringFaults.length === 0 && d.figure.selectorsOk;
/** A fact without its source line, at every depth (a `the-circle` carries facts of its own — ADR-AG-196). */
const stripSrc = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stripSrc)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'src').map(([k, x]) => [k, stripSrc(x)]))
      : v;
/** Facts without their source line — two spellings of one statement must lower to the same facts. */
const factsOf = (lines: string[]): unknown[] =>
  lines.flatMap((l) => {
    const r = parseLine(l);
    if (!r.ok) throw new Error(`${l}: ${r.code}`);
    return r.facts.map((x: Fact) => stripSrc(x));
  });
/** The circle the sentence binds to or states (ADR-AG-196): `create` with no circle, `about` with one. */
const SENT = '⟨the-circle⟩';
const onAll = (ids: string[], curve: string) => ids.map((id) => ({ t: 'constraint', k: { t: 'on-curve', id, curve } }));
/** The ring an INSCRIPTION declares carries the mark that it is on a circle (#1918, ADR-AG-252) — the declaration's facts, marked. */
const inscribedRing = (facts: unknown[]): unknown[] =>
  facts.map((f) => ((f as { t: string }).t === 'polygon' ? { ...(f as object), cyclic: true } : f));

describe('#1619 B2 — the 471 corpus questions build the exam`s own figure', () => {
  it('1/5 — «מרובע ABCD חסום במעגל שמשוואתו …»: A, B, C and the free D all on (x−2)² + (y+2)² = 100', () => {
    const d = derive(['מרובע ABCD חסום במעגל שמשוואתו (x−2)² + (y+2)² = 100', 'נתון: A(−8,−2), B(8,−10), C(2,8)'], 0);
    expect(d.faults).toEqual([]);
    const c = circleOf(d.figure)!;
    expect([c.cx, c.cy, c.r]).toEqual([2, -2, 10]);
    for (const p of Object.values(pts(d.figure))) expect(near(dist(p, { x: 2, y: -2 }), 10)).toBe(true);
  });

  it('2/5 — «במעגל שמרכזו M חסום משולש חד זוויות ABC»: M = (4,−1), r = 5, and the triangle is acute', () => {
    const d = derive(['במעגל שמרכזו M חסום משולש חד זוויות ABC', 'נתון: A(7,−5), B(7,3), C(0,2)'], 0);
    expect(d.faults).toEqual([]);
    expect(pt(d.figure, 'M')).toEqual([4, -1]);
    expect(Number(circleOf(d.figure)!.r.toFixed(3))).toBe(5);
  });

  it('3/5 — the incircle of AOB with centre C and its touch points D, E, F: A(−8,0), B(0,6), C(−2,2), F(−3.2,3.6)', () => {
    const lines = [
      'המשולש AOB הוא ישר זווית',
      'הנקודה O היא ראשית הצירים',
      'הצלע AO נמצאת על ציר ה-x, והצלע BO נמצאת על ציר ה-y (ראה ציור)',
      'במשולש AOB חסום מעגל שמרכזו C (הנקודה C נמצאת ברביע השני)',
      'הצלעות AO, BO ו-AB משיקות למעגל בנקודות D, E ו-F בהתאמה',
      'נתון: D(−2,0)',
      'נתון: שיפוע הצלע AB הוא 3/4',
    ];
    for (const seed of [0, 1, 2, 3]) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      const f = d.figure;
      expect([pt(f, 'A'), pt(f, 'B'), pt(f, 'C')]).toEqual([[-8, 0], [0, 6], [-2, 2]]);
      expect([pt(f, 'D'), pt(f, 'E'), pt(f, 'F')]).toEqual([[-2, 0], [0, 2], [-3.2, 3.6]]);
      expect(Number(circleOf(f)!.r.toFixed(3))).toBe(2);
    }
  });

  it('4/4 — «משולש ABC חסום במעגל שקוטרו AC» · «קוטר המעגל AC נמצא על הישר …»: C = (3.4, 3.6)', () => {
    const d = derive(['משולש ABC חסום במעגל שקוטרו AC', 'קוטר המעגל AC נמצא על הישר 3y − 2x − 4 = 0', 'נתון: A(1,2), B(3,4)'], 0);
    expect(d.faults).toEqual([]);
    expect(pt(d.figure, 'C')).toEqual([3.4, 3.6]);
  });

  it('8/5 — «מרובע ABCD חסום במעגל» · «∢BAD = ∢BCD» · A, C, D: B = (4,4)', () => {
    const d = derive(['מרובע ABCD חסום במעגל', 'נתון: ∢BAD = ∢BCD', 'נתון: A(4,−2), C(0,2), D(2,−2)'], 0);
    expect(d.faults).toEqual([]);
    expect(pt(d.figure, 'B')).toEqual([4, 4]);
  });

  it('10/5 — «מרובע ABCD חסום במעגל» · «∢ABC = ∢ADC» · B, D on the x-axis: B = (−2,0), D = (6,0)', () => {
    const d = derive(['מרובע ABCD חסום במעגל', '∢ABC = ∢ADC', 'C(4,2), A(0,-6)', 'ידוע כי הקודקודים B ו-D נמצאים על ציר ה-x (ראה ציור)'], 0);
    expect(d.faults).toEqual([]);
    expect([pt(d.figure, 'B'), pt(d.figure, 'D')]).toEqual([[-2, 0], [6, 0]]);
  });

  const EXAM_1554 = [
    'המרובע ABCD שלפניכם חסום במעגל (ראו סרטוט)',
    'נתון: ∢A = ∢C',
    'נתון: B(0,12), D(0,2)',
    'נתון כי שיפוע הצלע BC הוא -1/2',
    'נתון כי הנקודה E היא אמצע הצלע DC',
  ];
  it('15/4 (#1554`s exam) — C = (4,10), E = (2,6), the circle x² + (y−7)² = 25, ∠A = ∠C = 90°', () => {
    for (const seed of [0, 1, 2, 3]) {
      const d = derive(EXAM_1554, seed);
      expect(d.faults).toEqual([]);
      expect([pt(d.figure, 'C'), pt(d.figure, 'E')]).toEqual([[4, 10], [2, 6]]);
      const c = circleOf(d.figure)!;
      expect([Number(c.cx.toFixed(3)) + 0, Number(c.cy.toFixed(3)), Number(c.r.toFixed(3))]).toEqual([0, 7, 5]);
      const q = pts(d.figure);
      expect(angleAt(q.A, q.B, q.D)).toBeCloseTo(90, 4);
      expect(angleAt(q.C, q.B, q.D)).toBeCloseTo(90, 4);
    }
  });

  it('«BD קוטר במעגל» after it already follows — not out-of-scope, though D is ON the circle rather than defining it (#1554 arm 2)', () => {
    // It DRAWS the diameter BD (#1639, ADR-AG-198), so on the exam's figure — BD a diagonal, not drawn — it
    // records; once BD is drawn the statement adds nothing, and says so.
    expect(decideSubmit('BD קוטר במעגל', EXAM_1554, 0)).toMatchObject({ kind: 'record' });
    expect(decideSubmit('BD קוטר במעגל', [...EXAM_1554, 'BD'], 0)).toMatchObject({ kind: 'already-follows' });
  });
});

describe('#1619 B2 — every spelling lowers to the sentences it is made of', () => {
  it('a quadrilateral in a circle, in every voice, is the same facts', () => {
    const base = factsOf(['מרובע ABCD חסום במעגל']);
    for (const l of [
      'המרובע ABCD חסום במעגל',
      'המרובע ABCD שלפניכם חסום במעגל (ראו סרטוט)',
      'מרובע ABCD הוא חסום במעגל',
      'המעגל החוסם את המרובע ABCD',
      'במעגל חסום מרובע ABCD',
      'מרובע ABCD בר חסימה',
      'ABCD חסום במעגל',
      'quadrilateral ABCD is inscribed in a circle',
      'cyclic quadrilateral ABCD',
    ])
      expect(factsOf([l]), l).toEqual(base);
  });

  // ADR-AG-196: «חסום במעגל» is THE circle — the figure's one circle when it has one (every vertex on it),
  // the computed circle through the first three when it has none.
  it('the bare circle is computed through the first three vertices and the fourth is ON it', () => {
    expect(factsOf(['מרובע ABCD חסום במעגל'])).toEqual([
      ...inscribedRing(factsOf(['מרובע ABCD'])),
      {
        t: 'the-circle',
        create: [
          { t: 'circle-thru', id: 'circle-thru-ABC', def: { t: 'through', pts: ['A', 'B', 'C'] } },
          { t: 'constraint', k: { t: 'on-curve', id: 'D', curve: 'circle-thru-ABC' } },
        ],
        about: onAll(['A', 'B', 'C', 'D'], SENT),
      },
    ]);
  });

  it('a circle the sentence introduces is read by the circle rules: on a centre, by its equation, on a diameter', () => {
    const on = onAll;
    // A circle the sentence DESCRIBES binds to a circle with that centre / that equation, else is stated (ADR-AG-196).
    expect(factsOf(['המרובע ABCD חסום במעגל שמרכזו M'])).toEqual([
      ...inscribedRing(factsOf(['מרובע ABCD'])),
      {
        t: 'the-circle',
        create: [...factsOf(['מעגל שמרכזו M']), ...on(['A', 'B', 'C', 'D'], 'circle-at-M')],
        about: on(['A', 'B', 'C', 'D'], SENT),
        match: { centre: 'M' },
      },
    ]);
    const eq = factsOf(['מעגל שמשוואתו (x−2)² + (y+2)² = 100']);
    expect(factsOf(['מרובע ABCD חסום במעגל שמשוואתו (x−2)² + (y+2)² = 100'])).toEqual([
      ...inscribedRing(factsOf(['מרובע ABCD'])),
      {
        t: 'the-circle',
        create: [...eq, ...on(['A', 'B', 'C', 'D'], (eq[0] as { id: string }).id)],
        about: [{ t: 'circle-eq', circleId: SENT, eq: (eq[0] as { curve: { eq: unknown } }).curve.eq }, ...on(['A', 'B', 'C', 'D'], SENT)],
        match: { eq: (eq[0] as { curve: { eq: unknown } }).curve.eq },
      },
    ]);
    expect(factsOf(['משולש ABC חסום במעגל שקוטרו AC'])).toEqual([
      ...inscribedRing(factsOf(['משולש ABC'])),
      ...factsOf(['מעגל שקוטרו AC']),
      ...on(['B'], 'circle-diam-AC'),
    ]);
  });

  it('the container first and the triangle with its adjective: the same statement as the polygon first', () => {
    expect(factsOf(['במעגל שמרכזו M חסום משולש חד זוויות ABC'])).toEqual(factsOf(['משולש חד זוויות ABC חסום במעגל שמרכזו M']));
    expect(factsOf(['במעגל חסום משולש חד זווית ABC'])).toEqual(factsOf(['משולש חד-זוויות ABC חסום במעגל']));
    expect(factsOf(['משולש חד זוויות ABC'])).toContainEqual({ t: 'selector', sel: { kind: 'acute', ids: ['A', 'B', 'C'] } });
  });

  it('the incircle in every voice is one computed circle — and never the circumcircle', () => {
    const base = factsOf(['מעגל חסום במשולש ABC']);
    for (const l of ['במשולש ABC חסום מעגל', 'המשולש ABC חוסם מעגל', 'משולש ABC חוסם את המעגל', 'the incircle of triangle ABC', 'a circle inscribed in triangle ABC'])
      expect(factsOf([l]), l).toEqual(base);
    // The circle rides the binding (ADR-AG-198): a circle already stated tangent to every side IS this circle,
    // otherwise the computed incircle is created — so the creation is read through `the-circle`.
    const within = (fs: unknown[]) => fs.flatMap((f) => ((f as Fact).t === 'the-circle' ? [f, ...(f as Extract<Fact, { t: 'the-circle' }>).create] : [f]));
    expect(within(base)).toContainEqual(expect.objectContaining({ t: 'circle-thru', id: 'circle-in-ABC', def: { t: 'incircle', pts: ['A', 'B', 'C'] } }));
    expect(within(base).some((f) => (f as { def?: { t: string } }).def?.t === 'through')).toBe(false);
    // …and the converse: a polygon IN a circle never builds an incircle.
    expect(within(factsOf(['מרובע ABCD חסום במעגל'])).some((f) => (f as { def?: { t: string } }).def?.t === 'incircle')).toBe(false);
  });

  it('a quadrilateral`s incircle carries its Pitot condition, AB + CD = BC + DA', () => {
    expect(factsOf(['מעגל חסום במרובע ABCD'])).toContainEqual(factsOf(['AB+CD=BC+DA'])[0]);
  });

  it('the diameter forms lower onto «AB קוטר במעגל»', () => {
    expect(factsOf(['הקטע AB הוא קוטר במעגל שמרכזו M'])).toEqual(factsOf(['הקטע AB', 'מעגל שמרכזו M', 'AB קוטר במעגל M']));
    expect(factsOf(['הקטע AB הוא קוטר במעגל'])).toEqual(factsOf(['הקטע AB', 'AB קוטר במעגל']));
    expect(factsOf(['קוטר המעגל AC נמצא על הישר 3y − 2x − 4 = 0'])).toEqual(
      factsOf(['AC נמצא על הישר 3y − 2x − 4 = 0', 'AC קוטר במעגל']),
    );
    expect(factsOf(['הצלע AC היא קוטר במעגל'])).toEqual(factsOf(['AC קוטר במעגל']));
  });

  // Integration (ADR-AG-196): the plural touch has ONE lowering — B3's tangency at a named point, one
  // `tangent-of` with its `at` per side; «צלעות» bounds each to its side. The incircle's closed-form touch
  // point is that lowering's incircle branch (issue-1619-integration.test.ts locks the figure).
  it('the touch list is one touch per side, paired by «בהתאמה»', () => {
    expect(factsOf(['הצלעות AO, BO ו-AB משיקות למעגל בנקודות D, E ו-F בהתאמה']).filter((x) => (x as Fact).t === 'tangent-of')).toEqual([
      // `ring` (ADR-AG-198 Am. 1): the three sides close the ring A–O–B, so a circle this creates is its incircle.
      { t: 'tangent-of', axes: [], lines: [{ kind: 'points', a: 'A', b: 'O', bounded: true }], at: 'D', ring: ['A', 'O', 'B'] },
      { t: 'tangent-of', axes: [], lines: [{ kind: 'points', a: 'B', b: 'O', bounded: true }], at: 'E', ring: ['A', 'O', 'B'] },
      { t: 'tangent-of', axes: [], lines: [{ kind: 'points', a: 'A', b: 'B', bounded: true }], at: 'F', ring: ['A', 'O', 'B'] },
    ]);
    expect(factsOf(['the sides AB, BC and CA touch the circle at D, E and F respectively'])).toEqual(
      factsOf(['הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה']),
    );
  });
});

/** The lock table of #1554 — nine nouns, two directions. */
const NOUNS = ['מרובע', 'טרפז', 'טרפז שווה שוקיים', 'טרפז ישר זווית', 'מקבילית', 'מלבן', 'מעוין', 'ריבוע', 'דלתון'];
const RING = ['A', 'B', 'C', 'D'];
const sides = (q: Record<string, P>) => RING.map((k, i) => dist(q[k], q[RING[(i + 1) % 4]]));
const angles = (q: Record<string, P>) => RING.map((k, i) => angleAt(q[k], q[RING[(i + 3) % 4]], q[RING[(i + 1) % 4]]));
/** What the noun plus the direction FORCES, checked on the drawn ring. */
const FORCED: Record<string, { cyc?: (q: Record<string, P>) => boolean; tan?: (q: Record<string, P>) => boolean }> = {
  טרפז: { cyc: (q) => near(dist(q.A, q.D), dist(q.B, q.C), 1e-4) },
  מקבילית: { cyc: (q) => angles(q).every((a) => near(a, 90, 1e-4)), tan: (q) => sides(q).every((s) => near(s, sides(q)[0], 1e-4)) },
  מלבן: { tan: (q) => sides(q).every((s) => near(s, sides(q)[0], 1e-4)) },
  מעוין: { cyc: (q) => angles(q).every((a) => near(a, 90, 1e-4)) },
  דלתון: { cyc: (q) => near(angles(q)[1], 90, 1e-4) && near(angles(q)[3], 90, 1e-4) },
};

describe('#1554 — every quadrilateral noun, inscribed in a circle and circumscribing one, at 24 seeds', () => {
  it.each(NOUNS.filter((n) => n !== 'טרפז ישר זווית'))('«%s ABCD חסום במעגל»: records, cyclic and whole at every seed', (noun) => {
    const line = `${noun} ABCD חסום במעגל`;
    expect(decideSubmit(line, [], 0)).toMatchObject({ kind: 'record' });
    for (const seed of SEEDS) {
      const d = derive([line], seed);
      expect(whole(d), `seed ${seed}`).toBe(true);
      const c = circleOf(d.figure)!;
      const q = pts(d.figure);
      for (const k of RING) expect(near(dist(q[k], { x: c.cx, y: c.cy }), c.r, 1e-6), `${k} seed ${seed}`).toBe(true);
      const forced = FORCED[noun]?.cyc;
      if (forced) expect(forced(q), `forced shape, seed ${seed}`).toBe(true);
    }
  });

  it.each(NOUNS)('«מעגל חסום ב%s ABCD»: records, tangent to all four sides and whole at every seed', (noun) => {
    const line = `מעגל חסום ב${noun} ABCD`;
    expect(decideSubmit(line, [], 0)).toMatchObject({ kind: 'record' });
    for (const seed of SEEDS) {
      const d = derive([line], seed);
      expect(whole(d), `seed ${seed}`).toBe(true);
      const c = circleOf(d.figure)!;
      const q = pts(d.figure);
      RING.forEach((k, i) => expect(near(lineDist({ x: c.cx, y: c.cy }, q[k], q[RING[(i + 1) % 4]]), c.r, 1e-6), `side ${k} seed ${seed}`).toBe(true));
      const forced = FORCED[noun]?.tan;
      if (forced) expect(forced(q), `forced shape, seed ${seed}`).toBe(true);
    }
  });

  /**
   * A cyclic right trapezoid is a rectangle, which is not a trapezoid. The operator's ruling of 2026-10-01 (on
   * #1554, ADR-AG-198) settled the escalation: the INSCRIPTION SENTENCE is refused, naming both nouns; #1627's
   * draw-with-a-warning stays for givens that force the rectangle later. So the figure is never presented as a
   * valid trapezoid — it is not drawn at all.
   */
  it('«טרפז ישר זווית ABCD חסום במעגל» is refused, naming the noun and the rectangle it would have to be', () => {
    for (const seed of SEEDS) {
      const d = derive(['טרפז ישר זווית ABCD חסום במעגל'], seed);
      expect(d.faults.map((f) => f.code), `seed ${seed}`).toEqual(['inscribed-contradicts-noun']);
    }
  });

  it('the cyclic quadrilateral is as whole as the plain one, and «הציגו תצורה אחרת» moves it', () => {
    const rate = (lines: string[]) => SEEDS.filter((s) => whole(derive(lines, s))).length;
    expect(rate(['מרובע ABCD חסום במעגל'])).toBe(rate(['מרובע ABCD']));
    const c = derive(['מרובע ABCD חסום במעגל'], 0).construction;
    expect(new Set(distinctConfigSeeds(c).map((s) => JSON.stringify(pt(drawableAt(c, s), 'D')))).size).toBeGreaterThan(1);
  });

  it('a circle on a centre and a circle by its equation hold every vertex at every seed', () => {
    for (const line of ['מרובע ABCD חסום במעגל שמרכזו M', 'מרובע ABCD חסום במעגל שמשוואתו (x−2)² + (y+2)² = 100', 'מרובע ABCD חסום במעגל שקוטרו AC']) {
      for (const seed of SEEDS) {
        const d = derive([line], seed);
        expect(whole(d), `${line} seed ${seed}`).toBe(true);
        const c = circleOf(d.figure)!;
        const q = pts(d.figure);
        for (const k of RING) expect(near(dist(q[k], { x: c.cx, y: c.cy }), c.r, 1e-6), `${line} ${k} seed ${seed}`).toBe(true);
      }
    }
  });
});

describe('#1619 B2 — the triangle: acute, the incircle and its touch points, at 24 seeds', () => {
  it('«במעגל חסום משולש חד זוויות ABC»: on the circle and acute at every seed', () => {
    for (const seed of SEEDS) {
      const d = derive(['במעגל חסום משולש חד זוויות ABC'], seed);
      expect(whole(d), `seed ${seed}`).toBe(true);
      const q = pts(d.figure);
      for (const [v, p, r] of [['A', 'B', 'C'], ['B', 'C', 'A'], ['C', 'A', 'B']]) expect(angleAt(q[v], q[p], q[r])).toBeLessThan(90);
    }
  });

  it('the incircle is tangent to all three sides at every seed, and its centre is the incentre «מפגש חוצי הזוויות»', () => {
    for (const seed of SEEDS) {
      const d = derive(['מעגל חסום במשולש ABC', 'K מפגש חוצי הזוויות במשולש ABC'], seed);
      expect(whole(d), `seed ${seed}`).toBe(true);
      const c = circleOf(d.figure)!;
      const q = pts(d.figure);
      for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'A']]) expect(near(lineDist({ x: c.cx, y: c.cy }, q[a], q[b]), c.r, 1e-6)).toBe(true);
      expect(near(q.K.x, c.cx, 1e-9) && near(q.K.y, c.cy, 1e-9)).toBe(true);
    }
  });

  it('the named touch points lie on the circle and on their sides — the incircle, and a circle on a centre', () => {
    for (const host of [['מעגל חסום במשולש ABC'], ['נתון מעגל שמרכזו M', 'משולש ABC']]) {
      for (const seed of SEEDS) {
        const d = derive([...host, 'הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה'], seed);
        expect(whole(d), `${host[0]} seed ${seed}`).toBe(true);
        const c = circleOf(d.figure)!;
        const q = pts(d.figure);
        for (const [t, a, b] of [['D', 'A', 'B'], ['E', 'B', 'C'], ['F', 'C', 'A']]) {
          expect(near(dist(q[t], { x: c.cx, y: c.cy }), c.r, 1e-5), `${t} on the circle, seed ${seed}`).toBe(true);
          expect(near(dist(q[a], q[t]) + dist(q[t], q[b]), dist(q[a], q[b]), 1e-5), `${t} on ${a}${b}, seed ${seed}`).toBe(true);
        }
      }
    }
  });
});

describe('#1619 B2 — refusals keep their meaning', () => {
  const codes = (lines: string[]) => derive(lines, 0).faults.map((f) => [f.index, f.code]);

  it('«חד זוויות» about a right triangle the coordinates pin is refused on the sentence that stated it', () => {
    expect(codes(['משולש חד זוויות ABC', 'A(0,0)', 'B(4,0)', 'C(0,3)'])).toEqual([[0, 'unsatisfiable']]);
  });

  it('a given the incircle rule cannot honour is refused BY NAME, never dropped', () => {
    expect(codes(['מעגל שרדיוסו 2 חסום במשולש ABC'])).toEqual([[0, 'out-of-scope']]);
    // A quadrilateral's incircle centre was refused here only until #1554 built it (ADR-AG-194's "not built" list →
    // ADR-AG-242: the derived `incircle-centre`); it now records — locked in issue-1554-quad-incircle.test.ts.
    expect(codes(['מעגל שמרכזו P חסום במרובע ABCD'])).toEqual([]);
  });

  // Integration (ADR-AG-196): this was refused only because B2's lowering had no way to pull a side tangent to
  // a circle the figure determines. B3's tangency at a point holds for every circle kind, so the sentence now
  // BUILDS — the triangle circumscribes the stated circle (locked in issue-1619-integration.test.ts).
  it('a touch on an equation circle is no longer refused — the sides are pulled tangent', () => {
    expect(codes(['(x-1)^2+(y-1)^2=4', 'משולש ABC', 'הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה'])).toEqual([]);
  });

  it('acuteness is a triangle`s adjective — «מרובע חד זוויות ABCD» is not read', () => {
    const r = parseLine('מרובע חד זוויות ABCD');
    expect(r.ok ? 'ok' : r.code).toBe('not-handled');
  });

  it('the incircle of a four-letter triangle is the noun`s own arity refusal', () => {
    const r = parseLine('מעגל חסום במשולש ABCD');
    expect(r.ok ? 'ok' : r.code).toBe('bad-arity');
  });
});
