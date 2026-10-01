/**
 * #1619 stream B1 (ADR-AG-193), with #1598 — THE CIRCLE'S OWN SENTENCES.
 *
 * The 4-point questions talk about the circle they have: a point on it («A על מעגל M», «המעגל עובר דרך A»),
 * its axis crossings at named points («המעגל חותך את ציר ה-x בנקודות B ו-C», «… את החלק החיובי …», «B היא
 * אחת מנקודות החיתוך …»), its centre named and placed («O – מרכז המעגל», «מרכז המעגל M נמצא בנקודה (4,8)»),
 * the circle «הנתון», its radius against a length, a line through its centre, and its regions («מחוץ
 * למעגל», «על הקשת הקטנה AC»).
 *
 * Every phrasing that is a spelling of an existing sentence lowers to the IDENTICAL facts (`same`, the #1618
 * pattern) — one rule owns each meaning. The new meanings (naming the contextual centre, the centre as an
 * operand, the regions, the radius as a length) are locked on the FIGURE they build, by coordinates, and the
 * new selector over 24 seeds. Refusals keep naming the statement.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { offersOf } from '../engine/crossings';
import { parseLine } from '../parser/parseAnalytic';

/** The facts a line lowers to, without the provenance a rule may stamp on them. */
function factsOf(...lines: string[]): unknown[] {
  return lines.flatMap((l) => {
    const r = parseLine(l);
    if (!r.ok) throw new Error(`${l} → ${r.code}`);
    return r.facts.map((f) => {
      const { src: _src, ...rest } = f as { src?: string };
      return rest;
    });
  });
}
const same = (framed: string, ...canonical: string[]) => expect(factsOf(framed)).toEqual(factsOf(...canonical));

/** The construction a list folds to — for spellings whose facts differ only in ORDER. */
const built = (lines: string[]) => {
  const d = derive(lines, 0);
  expect(d.faults, lines.join(' | ')).toEqual([]);
  return d.construction;
};
const codes = (lines: string[]) => derive(lines, 0).faults.map((f) => f.code);
const pt = (lines: string[], id: string, seed = 0) => {
  const d = derive(lines, seed);
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`${id} not drawn in ${lines.join(' | ')}`);
  return p;
};
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('#1619 B1 — phrasings that ARE an existing sentence lower to its facts', () => {
  it.each([
    // «הנתון» as an adjective on the noun — "the given circle" is the circle.
    ['משוואת המעגל הנתון היא: (x-3)^2+(y+2)^2=25', ['משוואת המעגל היא: (x-3)^2+(y+2)^2=25']],
    ['הנקודה הנתונה A(2,3)', ['הנקודה A(2,3)']],
    // the dash between a name and its description
    ['O – מרכז המעגל', ['O מרכז המעגל']],
    // the converse of a point on the circle
    ['המעגל עובר דרך A', ['A על המעגל']],
    ['המעגל עובר דרך הנקודה A', ['A על המעגל']],
    ['the circle passes through A', ['A על המעגל']],
    ['המעגל עובר דרך ראשית הצירים O', ['O(0,0)', 'O על המעגל']],
    ['מעגל M עובר דרך A', ['A על מעגל M']],
    // a circle named by its centre letter is the contextual marker with that name
    ['A is on circle M', ['A על מעגל M']],
    ['A על המעגל M', ['A על מעגל M']],
    // «אחת מנקודות החיתוך» is the crossing with no ordinal
    ['הנקודה B היא אחת מנקודות החיתוך של המעגל עם ציר ה-y', ['B נקודת החיתוך של המעגל עם ציר ה-y']],
    ['B is one of the intersection points of the circle with the y-axis', ['B נקודת החיתוך של המעגל עם ציר ה-y']],
    // a crossing at a named point
    ['המעגל חותך את ציר ה-x בנקודה A', ['A נקודת החיתוך של המעגל עם ציר ה-x']],
    // two named crossings of a CONTEXTUAL circle: two crossings, no ordinal (the configuration says which)
    ['המעגל חותך את ציר ה-x בנקודות B ו-C', ['B נקודת החיתוך של המעגל עם ציר ה-x', 'C נקודת החיתוך של המעגל עם ציר ה-x']],
    ['והמעגל חותך את ציר ה-x בנקודות B ו-C', ['B נקודת החיתוך של המעגל עם ציר ה-x', 'C נקודת החיתוך של המעגל עם ציר ה-x']],
    // the centre named and placed: the naming, then the sentence about the letter
    ['מרכז המעגל M נמצא על ציר ה-y', ['M מרכז המעגל', 'M נמצא על ציר ה-y']],
    ['נתון כי מרכז המעגל M נמצא בנקודה (4,8)', ['M מרכז המעגל', 'M(4,8)']],
    ['the centre of the circle, M, is on the y-axis', ['M is the centre of the circle', 'M is on the y-axis']],
    ['נתון מעגל שמרכזו M נמצא על החלק החיובי של ציר ה-y', ['נתון מעגל שמרכזו M', 'M על החלק החיובי של ציר ה-y']],
    // a point at coordinates said as a location
    ['M נמצא בנקודה (4,8)', ['M(4,8)']],
    // the textbook's comma before the relative clause is the computed circle's own sentence
    ['בסרטוט שלפניכם מתואר מעגל, העובר דרך הנקודות O, C, A', ['מעגל העובר דרך הנקודות O, C, A']],
    // a shared circle subject, and a point with its places listed
    ['המעגל משיק לציר ה-x וחותך את ציר ה-y בנקודה C', ['המעגל משיק לציר ה-x', 'המעגל חותך את ציר ה-y בנקודה C']],
    ['הנקודה B נמצאת מחוץ למעגל, על החלק החיובי של ציר ה-x', ['B נמצאת מחוץ למעגל', 'B על החלק החיובי של ציר ה-x']],
    // the radius as a length, in both orders and with the segment noun
    ['נתון: אורך הקטע AB שווה לרדיוס המעגל', ['AB שווה לרדיוס המעגל']],
    ['רדיוס המעגל שווה ל-AB', ['AB שווה לרדיוס המעגל']],
    ['AB equals the radius of the circle', ['AB שווה לרדיוס המעגל']],
    // regions, in English
    ['B is outside the circle', ['B נמצאת מחוץ למעגל']],
    ['E is on the minor arc AC', ['E נמצאת על הקשת הקטנה AC']],
  ])('%s', (framed, canonical) => same(framed, ...canonical));

  it('the centre by its ROLE is the same statement as with its letter written in, in both languages', () => {
    const base = ['נתון מעגל שמרכזו M', 'C(1,2)', 'D(4,6)'];
    const withLetter = built([...base, 'M על הישר CD']);
    expect(built([...base, 'CD עובר דרך מרכז המעגל'])).toEqual(withLetter);
    expect(built([...base, 'CD passes through the centre of the circle'])).toEqual(withLetter);
  });

  it('a crossing on a HALF-axis is the crossing plus the half-axis selector «על החלק החיובי» carries', () => {
    const base = ['נתון מעגל שמרכזו M'];
    expect(built([...base, 'המעגל חותך את החלק החיובי של ציר ה-x בנקודה A'])).toEqual(
      built([...base, 'A נקודת החיתוך של המעגל עם ציר ה-x', 'A על החלק החיובי של ציר ה-x']),
    );
  });
});

describe('#1598 — the centre of the circle the figure has, NAMED', () => {
  it('«P מרכז המעגל» on a canonical circle names its centre, and the tool’s O yields (ADR-AG-184 rule 2)', () => {
    const lines = ['x^2+y^2=16', 'P מרכז המעגל'];
    expect(codes(lines)).toEqual([]);
    const d = derive(lines, 0);
    expect(d.figure.points.map((p) => p.id)).toEqual(['P']);
    near(pt(lines, 'P').x, 0);
    near(pt(lines, 'P').y, 0);
  });

  it('«O מרכז המעגל» on a canonical circle is the O the tool would have given — one point, no fault', () => {
    const lines = ['x^2+y^2=16', 'O מרכז המעגל'];
    expect(codes(lines)).toEqual([]);
    expect(derive(lines, 0).figure.points.map((p) => p.id)).toEqual(['O']);
  });

  it('the operator’s T51: O taken elsewhere, the centre named BY ITS EQUATION', () => {
    const lines = ['O(5,5)', 'x^2+y^2=16', 'P מרכז המעגל x^2+y^2=16'];
    expect(codes(lines)).toEqual([]);
    near(pt(lines, 'P').x, 0);
    near(pt(lines, 'O').x, 5);
  });

  it.each([
    ['(x-3)^2+(y-4)^2=25', 'O – מרכז המעגל'],
    ['נתון מעגל שמשוואתו (x-3)^2+(y-4)^2=25', 'P מרכז המעגל'],
    ['(x-3)^2+(y-4)^2=25', 'P היא מרכז המעגל (x-3)^2+(y-4)^2=25'],
    ['(x-3)^2+(y-4)^2=25', 'P מרכז המעגל שמשוואתו (x-3)^2+(y-4)^2=25'],
    ['(x-3)^2+(y-4)^2=25', 'P is the centre of the circle'],
  ])('%s · %s → the centre at (3,4)', (circle, naming) => {
    const lines = [circle, naming];
    expect(codes(lines)).toEqual([]);
    const id = naming.trim()[0];
    near(pt(lines, id).x, 3);
    near(pt(lines, id).y, 4);
  });

  it('an equation no curve has: the circle is stated with its centre named («נתון מעגל P שמשוואתו …»)', () => {
    const lines = ['P מרכז המעגל (x-3)^2+(y-4)^2=25'];
    expect(codes(lines)).toEqual([]);
    near(pt(lines, 'P').x, 3);
    expect(derive(lines, 0).figure.curves).toHaveLength(1);
  });

  it('a COMPUTED circle’s centre is its circumcentre', () => {
    const lines = ['A(0,0)', 'B(4,0)', 'C(0,3)', 'מעגל ABC', 'K מרכז המעגל'];
    expect(codes(lines)).toEqual([]);
    near(pt(lines, 'K').x, 2);
    near(pt(lines, 'K').y, 1.5);
  });

  it('a circle on a centre point: the same letter is known; another letter is refused naming the holder', () => {
    expect(codes(['נתון מעגל שמרכזו M', 'M מרכז המעגל'])).toEqual([]);
    const d = derive(['נתון מעגל שמרכזו M', 'K מרכז המעגל'], 0);
    expect(d.faults.map((f) => [f.code, f.holder])).toEqual([['already-named', 'M']]);
  });

  it('NO circle yet: the sentence states the circle on that centre (the diameter-of precedent)', () => {
    const d = derive(['O – מרכז המעגל'], 0);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.some((o) => o.kind === 'circle-at' && o.centre === 'O')).toBe(true);
  });

  it('two circles and no equation: refused as ambiguous, naming the host kind — never a pick', () => {
    const d = derive(['(x-3)^2+(y-4)^2=25', 'x^2+y^2=1', 'P מרכז המעגל'], 0);
    const f = d.faults.find((x) => x.index === 2);
    expect(f?.code).toBe('ambiguous-shape');
    expect(f?.host?.kind).toBe('circle');
  });

  it.each([
    [['x^2+y^2=16', 'O(5,5)']],
    [['O(5,5)', 'x^2+y^2=16']],
    [['(x-3)^2+(y-4)^2=25']],
    [['נתון מעגל שמשוואתו (x-3)^2+(y-4)^2=25']],
  ])('the anonymous circle offers a centre ring whose sentence builds the centre (%j)', (lines) => {
    const d = derive(lines, 0);
    const ring = offersOf(d.figure, d.construction).find((o) => o.id.startsWith('centre-'));
    expect(ring, 'a centre ring').toBeDefined();
    const after = derive([...lines, ring!.sentence], 0);
    expect(after.faults).toEqual([]);
    const named = after.figure.points.find((p) => Math.hypot(p.x - ring!.x, p.y - ring!.y) < 1e-6);
    expect(named?.id).toBe(ring!.sentence.split(' ')[0]);
    // …and once named, the ring is gone (the "click only names what has no name" ruling).
    expect(offersOf(after.figure, after.construction).some((o) => o.id.startsWith('centre-'))).toBe(false);
  });
});

describe('#1619 B1 — a circle named by its centre letter', () => {
  it('«A על מעגל M» on a circle stated by its centre', () => {
    const lines = ['נתון מעגל שמרכזו M(1,1)', 'רדיוס המעגל הוא 2', 'A על מעגל M'];
    expect(codes(lines)).toEqual([]);
    const a = pt(lines, 'A');
    near(Math.hypot(a.x - 1, a.y - 1), 2);
  });

  it('…and on an EQUATION circle whose centre the student named M (the fourth naming in the one chain)', () => {
    const lines = ['נתון מעגל M שמשוואתו (x-3)^2+(y-4)^2=25', 'A על מעגל M'];
    expect(codes(lines)).toEqual([]);
    const a = pt(lines, 'A');
    near(Math.hypot(a.x - 3, a.y - 4), 5);
  });

  it('a letter that names no circle is refused as the reference it is', () => {
    expect(codes(['נתון מעגל שמרכזו M', 'A על מעגל K'])).toEqual(['unknown-reference']);
  });
});

describe('#1619 B1 — the corpus figures build, by coordinates', () => {
  it('23/5: the centre at (4,8) through the origin; A the OTHER y-axis crossing', () => {
    const lines = [
      'נתון כי מרכז המעגל M נמצא בנקודה (4,8)',
      'המעגל עובר דרך ראשית הצירים O (ראו סרטוט)',
      'הנקודה A היא אחת מנקודות החיתוך של המעגל עם ציר ה-y',
    ];
    expect(codes(lines)).toEqual([]);
    near(pt(lines, 'M').x, 4);
    near(pt(lines, 'M').y, 8);
    const a = pt(lines, 'A');
    near(a.x, 0);
    near(Math.hypot(a.x - 4, a.y - 8), Math.hypot(4, 8), 1e-5);
  });

  it('16/4 as printed lands whole (the circle through O, C, A; A on the positive x-axis; B outside it)', () => {
    const q = (JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8')) as Array<{ id: string; lines: string[] }>).find(
      (x) => x.id === '16/4',
    )!;
    const d = derive(q.lines, 0);
    expect(d.faults).toEqual([]);
    const b = d.figure.points.find((p) => p.id === 'B')!;
    // the circle through (0,0), (4,0), (0,3): centre (2, 1.5), r = 2.5 — B outside it and on the positive x-axis
    expect(Math.hypot(b.x - 2, b.y - 1.5)).toBeGreaterThan(2.5);
    near(b.y, 0);
    expect(b.x).toBeGreaterThan(0);
  });

  it('«אורך הקטע AB שווה לרדיוס המעגל» SOLVES a free radius', () => {
    const lines = ['נתון מעגל שמרכזו M(3,5)', 'A(0,0)', 'B(3,4)', 'נתון: אורך הקטע AB שווה לרדיוס המעגל'];
    expect(codes(lines)).toEqual([]);
    near(derive(lines, 0).figure.env.r_M, 5);
  });

  it('…and is judged against a stated radius', () => {
    expect(codes(['נתון מעגל שמרכזו M(0,0)', 'רדיוס המעגל הוא 2', 'A(0,0)', 'B(3,4)', 'AB שווה לרדיוס המעגל'])).toContain('unsatisfiable');
  });

  it('«CD עובר דרך מרכז המעגל» puts the centre on CD', () => {
    const lines = ['נתון מעגל שמרכזו M', 'C(1,2)', 'D(4,6)', 'ידוע כי CD עובר דרך מרכז המעגל'];
    expect(codes(lines)).toEqual([]);
    const m = pt(lines, 'M');
    near((m.x - 1) * 4 - (m.y - 2) * 3, 0, 1e-5);
  });

  it('«מרכז המעגל נמצא על ציר ה-y» — the centre as the SUBJECT, by its role', () => {
    const lines = ['נתון מעגל שמרכזו M', 'מרכז המעגל נמצא על ציר ה-y'];
    expect(codes(lines)).toEqual([]);
    near(pt(lines, 'M').x, 0);
  });

  it('an UNNAMED centre used as a point is refused quoting the student’s words — never invented', () => {
    const d = derive(['(x-3)^2+(y+2)^2=25', 'C(1,2)', 'D(4,6)', 'CD עובר דרך מרכז המעגל'], 0);
    expect(d.faults.map((f) => [f.code, f.detail])).toEqual([['unknown-reference', 'מרכז המעגל']]);
  });
});

describe('#1619 B1 — two named crossings of a contextual circle are a CONFIGURATION', () => {
  const lines = ['נתון מעגל שמרכזו M', 'המעגל חותך את ציר ה-x בנקודות B ו-C'];

  it('at every one of 24 seeds: B and C on the circle and the axis, two different points, a sane figure', () => {
    let bLeft = 0;
    for (let seed = 0; seed < 24; seed += 1) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const get = (id: string) => d.figure.points.find((p) => p.id === id)!;
      const [m, b, c] = [get('M'), get('B'), get('C')];
      const r = d.figure.env.r_M;
      near(b.y, 0, 1e-6);
      near(c.y, 0, 1e-6);
      near(Math.hypot(b.x - m.x, b.y - m.y), r, 1e-6);
      near(Math.hypot(c.x - m.x, c.y - m.y), r, 1e-6);
      expect(Math.abs(b.x - c.x), `seed ${seed}`).toBeGreaterThan(1e-3);
      // the closed-form other root (ADR-AG-193): no circle of radius 10⁶ through two far crossings
      expect(Math.max(Math.abs(b.x), Math.abs(c.x), r), `seed ${seed}`).toBeLessThan(100);
      if (b.x < c.x) bLeft += 1;
    }
    // which letter takes which root moves with the configuration — never a fixed default (ADR-052)
    expect(bLeft).toBeGreaterThan(0);
    expect(bLeft).toBeLessThan(24);
  });

  it('a circle tangent to the axis has ONE crossing — two letters there are refused, not stacked', () => {
    const d = derive(['נתון מעגל שמרכזו M(2,3)', 'רדיוס המעגל הוא 3', 'המעגל חותך את ציר ה-x בנקודות B ו-C'], 0);
    expect(d.faults.map((f) => f.code)).toContain('unsatisfiable');
  });
});

describe('#1619 B1 — the circle’s REGIONS are selectors (D7 kind 2)', () => {
  const circle = ['נתון מעגל שמרכזו M(0,0)', 'רדיוס המעגל הוא 5'];

  it('a point given outside is judged; one given inside is refused on THAT line', () => {
    expect(codes([...circle, 'B(7,0)', 'הנקודה B נמצאת מחוץ למעגל'])).toEqual([]);
    const d = derive([...circle, 'B(1,0)', 'הנקודה B נמצאת מחוץ למעגל'], 0);
    expect(d.faults.map((f) => [f.code, f.index])).toEqual([['unsatisfiable', 3]]);
    expect(codes([...circle, 'B(1,0)', 'הנקודה B נמצאת בתוך המעגל'])).toEqual([]);
  });

  it('a free point outside the circle consumes no freedom and is drawn outside at every whole seed', () => {
    const lines = [...circle, 'הנקודה B נמצאת מחוץ למעגל'];
    expect(derive(lines, 0).figure.carrierDof).toBe(2);
    let whole = 0;
    for (let seed = 0; seed < 24; seed += 1) {
      const d = derive(lines, seed);
      if (d.faults.length > 0) continue;
      whole += 1;
      const b = d.figure.points.find((p) => p.id === 'B')!;
      expect(Math.hypot(b.x, b.y), `seed ${seed}`).toBeGreaterThan(5);
    }
    expect(whole).toBe(24);
  });

  it('«E על הקשת הקטנה AC»: on the circle, on the minor arc, at every one of 24 seeds', () => {
    const lines = [...circle, 'A(5,0)', 'C(0,5)', 'הנקודה E נמצאת על הקשת הקטנה AC'];
    for (let seed = 0; seed < 24; seed += 1) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const e = d.figure.points.find((p) => p.id === 'E')!;
      near(Math.hypot(e.x, e.y), 5, 1e-6);
      // the minor arc from (5,0) to (0,5) is the first quadrant
      expect(e.x, `seed ${seed}`).toBeGreaterThan(0);
      expect(e.y, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('the MAJOR arc is the other side of the chord', () => {
    const e = pt([...circle, 'A(5,0)', 'C(0,5)', 'E נמצאת על הקשת הגדולה AC'], 'E');
    expect(e.x < 0 || e.y < 0).toBe(true);
  });

  it('an arc puts its ends on the circle — a chord end off it is refused', () => {
    expect(codes([...circle, 'A(1,0)', 'C(0,5)', 'E נמצאת על הקשת הקטנה AC'])).toContain('unsatisfiable');
  });
});

describe('#1619 B1 — refusals keep their meaning', () => {
  it.each([
    // the corpus's 9/5 «רדיוס המעגל שווה ל-5» was `ambiguous-shape` because the circle-introducing lines
    // before it are refused (B2's inscribed form) — with no circle the honest answer is still "which circle?"
    [['רדיוס המעגל שווה ל-5'], 'ambiguous-shape'],
    [['הנקודה B נמצאת מחוץ למעגל'], 'ambiguous-shape'],
    [['A(0,0)', 'B(3,4)', 'AB שווה לרדיוס המעגל'], 'ambiguous-shape'],
    [['נתון מעגל שמרכזו M', 'C(1,2)', 'D(4,6)', 'נתון מעגל שמרכזו K', 'CD עובר דרך מרכז המעגל'], 'ambiguous-shape'],
    [['נתון מעגל שמרכזו M', 'E נמצאת על הקשת הקטנה AA'], 'repeated-vertex'],
  ])('%j → %s', (lines, code) => {
    expect(codes(lines)).toContain(code);
  });
});
