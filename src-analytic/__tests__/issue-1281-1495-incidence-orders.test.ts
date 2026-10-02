/**
 * INCIDENCE IN EVERY ORDER AND OVER EVERY OPERAND (#1281, #1495 — ADR-AG-164).
 *
 * Operator, 2026-09-20: «הבסיס CD נמצא על ישר העובר דרך הנקודה (-3,7)» — *"I'm trying to find a way to input
 * this and cannot"*; and the same day, «ישר 3 עובר דרך נקודה N», the sentence that pins k. Operator, 2026-09-27:
 * *"הצלע BC נמצאת על הישר y=x-4 is not supported?"*. One relation had one spelling: «P על …», with a point
 * NAME as its subject. The fix normalises the other spellings into the sentences the grammar reads, so the
 * locks assert IDENTICAL fact lists (ADR-W-053: a lock calls the decision, it does not re-derive geometry).
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';
import { derive } from '../engine/derive';

/** The parsed facts without their source text — what the two spellings must agree on. */
const factsOf = (line: string) => {
  const r = parseLine(line);
  if (!r.ok) throw new Error(`${line}: ${r.code}`);
  return r.facts.map((f) => ({ ...f, src: '' }));
};
const pt = (lines: string[], id: string) => {
  const p = derive(lines, 0).figure.points.find((q) => q.id === id);
  return p ? [Number(p.x.toFixed(3)) + 0, Number(p.y.toFixed(3)) + 0] : null;
};

describe('#1495 — a SIDE as the subject lowers to exactly the side-equation sentence', () => {
  it.each([
    ['הצלע BC נמצאת על הישר y=x-4', 'משוואת הצלע BC היא y=x-4'], // the operator's
    ['BC נמצאת על הישר y=x-4', 'משוואת הצלע BC היא y=x-4'],
    ['הקטע BC נמצא על הישר y=x-4', 'משוואת הקטע BC היא y=x-4'],
    ['הצלע BC מונחת על הישר y=x-4', 'משוואת הצלע BC היא y=x-4'], // the exam's «מונחת»
    ['האלכסון BD מונח על הישר y=x', 'משוואת האלכסון BD היא y=x'], // the kite's own sentence
    ['the side BC lies on the line y=x-4', 'משוואת הצלע BC היא y=x-4'],
  ])('«%s» ≡ «%s»', (a, b) => expect(factsOf(a)).toEqual(factsOf(b)));

  /*
   * The converse names its subject pair, so it DRAWS it (#1639, ADR-AG-198) — by its noun: «הישר CD» the line, a
   * bare «CD» the segment. And a bare «CD» is no longer rewritten as «הישר CD» (#1636): it is «P על CD», whose
   * extent M1 inherits from the figure.
   */
  const line = { t: 'line-2pt', a: 'C', b: 'D', src: '' };
  const segment = { t: 'segment', id: 'seg-CD', a: 'C', b: 'D', ref: true, src: '' };
  it.each([
    ['הישר CD עובר דרך P', 'P על הישר CD', line],
    ['הישר CD מכיל את P', 'P על הישר CD', line],
    ['the line CD passes through P', 'P על הישר CD', line],
    ['CD עובר דרך P', 'P על CD', segment],
  ] as const)('«%s» ≡ «%s» + the piece it names', (a, b, piece) => expect(factsOf(a)).toEqual([...factsOf(b), piece]));

  it('the operator’s line builds, with B and C on the line at every configuration', () => {
    const d = derive(['משולש ABC', 'הצלע BC נמצאת על הישר y=x-4'], 0);
    expect(d.faults).toEqual([]);
    for (const seed of [0, 1, 2, 3]) {
      const f = derive(['משולש ABC', 'הצלע BC נמצאת על הישר y=x-4'], seed).figure;
      for (const id of ['B', 'C']) {
        const p = f.points.find((q) => q.id === id)!;
        expect(p.y - (p.x - 4)).toBeCloseTo(0, 6);
      }
    }
  });

  it('on a NAMED line: both ends go on it, and no second curve is minted', () => {
    const d = derive(['נתון הישר l1: y=x-4', 'משולש ABC', 'הצלע BC נמצאת על הישר l1'], 0);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.filter((o) => o.kind === 'curve')).toHaveLength(1);
    expect(d.construction.constraints.filter((k) => k.t === 'on-curve').map((k) => (k as { id: string }).id).sort()).toEqual(['B', 'C']);
  });

  it('a side ON A CIRCLE is a CHORD since #1619 B3 (ruling 4 on #1616 lifted the out-of-scope refusal)', () => {
    // This lock used to assert `out-of-scope`. The operator ruled chords in (#1616 ruling 4: "Chord: yes"),
    // so the side lowers to exactly what the spelled-out sentences carry — both ends on the curve, the side drawn.
    expect(factsOf('הצלע BC נמצאת על המעגל x^2+y^2=9')).toEqual([
      ...factsOf('B על המעגל x^2+y^2=9'),
      ...factsOf('C על המעגל x^2+y^2=9'),
      ...factsOf('הצלע BC'),
    ]);
    const d = derive(['משולש ABC', 'הצלע BC נמצאת על המעגל x^2+y^2=9'], 0);
    expect(d.faults).toEqual([]);
    for (const id of ['B', 'C']) {
      const p = d.figure.points.find((q) => q.id === id)!;
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(3, 6);
    }
  });

  it('regression guard: a POINT subject is unchanged — one incidence', () => {
    const f = factsOf('B נמצאת על הישר y=x-4');
    expect(f.filter((x) => x.t === 'constraint')).toHaveLength(1);
  });
});

describe('#1281 — the converse word order, a coordinate operand, and «בסיס»', () => {
  it.each([
    ['הישר l3 עובר דרך הנקודה N', 'דרך N עובר ישר l3'],
    ['הישר l3 עובר בנקודה N', 'דרך N עובר ישר l3'],
    ['ישר 3 עובר דרך הנקודה N', 'דרך N עובר ישר 3'], // the operator's
  ])('«%s» ≡ «%s»', (a, b) => expect(factsOf(a)).toEqual(factsOf(b)));

  it('the operator’s second exam: «ישר 3 עובר דרך הנקודה N» PINS k (it was a name clash)', () => {
    const d = derive(
      ['נתון הישר 1: 2x-y+8=0', 'נתון הישר 2: x+3y-10=0', 'N נקודת החיתוך של הישר 1 עם הישר 2', 'k הוא פרמטר', 'נתון הישר 3: (k+1)x+2y-12+5k=0', 'ישר 3 עובר דרך הנקודה N'],
      0,
    );
    expect(d.faults).toEqual([]);
    expect(d.figure.env.k).toBeCloseTo(2, 6);
  });

  it('M1: a line built through one point, then stated through another, puts the second point ON it', () => {
    const d = derive(['M(0,0)', 'N(2,3)', 'דרך M עובר ישר l4', 'הישר l4 עובר דרך N'], 0);
    expect(d.faults).toEqual([]);
    expect(d.construction.constraints.some((k) => k.t === 'on-curve' && k.id === 'N' && k.curve === 'line-l4')).toBe(true);
  });

  it('the operator’s exam sentence builds, the point named P₁ and the row saying so', () => {
    const d = derive(['טרפז ABCD', 'הבסיס CD נמצא על ישר העובר דרך הנקודה (-3,7)'], 0);
    expect(d.faults).toEqual([]);
    expect(d.minted).toEqual([{ index: 1, id: 'P₁' }]);
    expect(pt(['טרפז ABCD', 'הבסיס CD נמצא על ישר העובר דרך הנקודה (-3,7)'], 'P₁')).toEqual([-3, 7]);
  });

  it('a coordinate operand and a named operand draw the same figure', () => {
    const named = ['טרפז ABCD', 'נתונה הנקודה P(-3,7)', 'P על הישר CD'];
    const coord = ['טרפז ABCD', 'הנקודה (-3,7) על הישר CD'];
    for (const id of ['A', 'B', 'C', 'D']) expect(pt(coord, id)).toEqual(pt(named, id));
  });

  it('minting: the same coordinates are one point, a new one takes the next name, a stated letter wins', () => {
    const d = derive(['נתונה הנקודה (-3,7)', 'נתונה הנקודה (1,2)', 'הנקודה (-3,7) על הישר y=-x+4'], 0);
    expect(d.faults).toEqual([]);
    expect(d.minted).toEqual([
      { index: 0, id: 'P₁' },
      { index: 1, id: 'P₂' },
    ]);
    const own = derive(['A(-3,7)', 'C(0,0)', 'הישר CD עובר דרך הנקודה (-3,7)', 'נקודה D'], 0);
    expect(own.minted).toEqual([]);
    expect(own.construction.constraints.some((k) => k.t === 'on-line-2pt' && k.id === 'A')).toBe(true);
  });

  it('a minted name can be referred to — «P₁» is a point name', () => {
    const d = derive(['נתונה הנקודה (-3,7)', 'B(1,1)', 'הקטע P₁B'], 0);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.some((o) => o.kind === 'segment')).toBe(true);
  });

  it('«הבסיס CD» names the side, as «הצלע CD» does', () => {
    expect(factsOf('הבסיס CD')).toEqual(factsOf('הצלע CD'));
  });

  it('refusal: a point slot that is neither a name nor a coordinate is not claimed, and names the statement', () => {
    const d = derive(['C(0,0)', 'D(1,1)', 'הישר CD עובר דרך הבית'], 0);
    expect(d.faults.map((f) => [f.index, f.code, f.detail])).toEqual([[2, 'not-handled', 'הישר CD עובר דרך הבית']]);
  });
});
