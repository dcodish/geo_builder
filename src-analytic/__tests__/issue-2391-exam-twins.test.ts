/**
 * #2391 ([ADR-AG-315](../../docs/06c-decisions-analytic.md#adr-ag-315)) — THE EXAM'S OWN SENTENCES READ AS THEIR CANONICAL
 * TWINS: the class lock.
 *
 * The class: an exam sentence that says a canonical sentence in another ORDER, or with another CONNECTIVE — the centre
 * named after its circle, «שני» or a given-word before a plural subject, a predicate wrapped in «מקיימת», a plural
 * subject distributed over named members, a through-adverbial after the noun. Each form is a REWRITE to its twin's
 * text (`frameAnalytic.ts`), so it cannot lower differently from it (ADR-W-053). Two rows are not text: the centres'
 * distance (the fold knows the letters, B1) and the trailing «דרך» (the construction register, B2).
 *
 * Every row is asserted three ways, on the real path: the FACTS (src stripped) equal the twins' facts, the SUBMIT
 * verdict is the twin's, and the DRAWN FIGURE equals the twins' figure at seeds 0 and 1 — the figure, not only the
 * facts, because a distributed clause landing on the wrong circle would draw a wrong figure without any refusal.
 *
 * Measured before (3cae7f25, `decideSubmit`, model mocked): every exam spelling below was `not-handled`, except row 8's
 * «נתונים …» (not-handled: the given-word's glued «ש-» ate the first letter of «שני») and the found-work rows, which
 * built a tangent FROM a point that is on the circle.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import { orthography } from '../parser/frameAnalytic';
import { parseLine } from '../parser/parseAnalytic';

const I = 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9';
const II = 'נתון מעגל II שמשוואתו (x+5)^2+(y-2)^2=1';
const Q1_HEAD = [I, 'K מרכז המעגל I', II, 'L מרכז המעגל II', 'הנקודה A נמצאת על מעגל I, והנקודה B נמצאת על מעגל II.'];
const Q1_TANGENTS = [...Q1_HEAD, 'המשיק למעגל I בנקודה A', 'המשיק למעגל II בנקודה B'];
const Q1_M = [...Q1_TANGENTS, 'המשיקים נפגשים בנקודה M'];
const PAIR = ['a הוא פרמטר חיובי', 'נתון מעגל שמרכזו M(a,0) ורדיוסו r', 'נתון מעגל שמרכזו N(13,0) ורדיוסו 2r'];
const Q3 = ['מעגל שמרכזו M(8,-3) משיק לישר 4x+3y+2=0 בנקודה A'];
const Q3_N2 = [...Q3, 'נתון מעגל שמרכזו N₂ ורדיוסו 10', 'מעגל N₂ משיק למעגל M בנקודה A'];

interface Row {
  row: string;
  needs: string[];
  exam: string;
  twins: string[];
  /** B1's fact is the role reference M1 resolves, so its facts are not the twin's — only the fold and the figure are. */
  factsDiffer?: true;
}

const ROWS: Row[] = [
  // Row 1 — A1: the circle and its centre in one sentence.
  { row: '1', needs: [], exam: 'נתון מעגל I שמשוואתו (x − 3)² + (y − 4)² = 9 , ומרכזו בנקודה K .', twins: ['נתון מעגל I שמשוואתו (x − 3)² + (y − 4)² = 9', 'K מרכז המעגל I'] },
  { row: '1', needs: [], exam: 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9 ומרכזו K', twins: [I, 'K מרכז המעגל I'] },
  { row: '1', needs: [], exam: 'נתון מעגל I שמרכזו K ומשוואתו (x-3)^2+(y-4)^2=9', twins: [I, 'K מרכז המעגל I'] },
  { row: '1', needs: [], exam: 'circle I with equation (x-3)^2+(y-4)^2=9 and centre K', twins: ['circle I: (x-3)^2+(y-4)^2=9', 'K is the centre of circle I'] },
  { row: '1', needs: [], exam: 'circle I with centre K and equation (x-3)^2+(y-4)^2=9', twins: ['circle I: (x-3)^2+(y-4)^2=9', 'K is the centre of circle I'] },
  // Row 2 — A3: the centre named after its circle.
  ...['מרכז המעגל I הוא K', 'מרכז המעגל I בנקודה K', 'מרכז מעגל I הוא הנקודה K', 'מרכזו של המעגל I הוא K', 'המרכז של מעגל I הוא K'].map(
    (exam): Row => ({ row: '2', needs: [I], exam, twins: ['K מרכז המעגל I'] }),
  ),
  { row: '2', needs: [I], exam: 'the centre of circle I is K', twins: ['K is the centre of circle I'] },
  { row: '2', needs: [I], exam: 'the center of circle I is the point K', twins: ['K is the centre of circle I'] },
  // Row 3 — A4: two namings paired «בהתאמה».
  ...['K ו-L הם מרכזי המעגלים I ו-II בהתאמה', 'K ו-L מרכזי המעגלים I ו-II בהתאמה', 'מרכזי המעגלים I ו-II הם K ו-L בהתאמה'].map(
    (exam): Row => ({ row: '3', needs: [I, II], exam, twins: ['K מרכז המעגל I', 'L מרכז המעגל II'] }),
  ),
  { row: '3', needs: [I, II], exam: 'K and L are the centres of circles I and II respectively', twins: ['K is the centre of circle I', 'L is the centre of circle II'] },
  // Row 6 — A5: «שני» before the plural tangents.
  ...['שני המשיקים נחתכים בנקודה M.', 'שני המשיקים נפגשים בנקודה M'].map((exam): Row => ({ row: '6', needs: Q1_TANGENTS, exam, twins: ['המשיקים נפגשים בנקודה M'] })),
  ...['the two tangents meet at M', 'the two tangents intersect at M'].map((exam): Row => ({ row: '6', needs: Q1_TANGENTS, exam, twins: ['the tangents meet at M'] })),
  // Row 7 — A6: «X מקיימת S» is S, about the point X (which it names, as «נקודה M» does).
  ...['M מקיימת MA = MB', 'הנקודה M מקיימת MA = MB', 'M satisfies MA = MB'].map((exam): Row => ({ row: '7', needs: Q1_M, exam, twins: ['נקודה M', 'MA = MB'] })),
  // Row 8 — A5: the given-word before «שני מעגלים», and the English verb "touch".
  { row: '8', needs: PAIR, exam: 'נתונים שני מעגלים המשיקים זה לזה מבחוץ', twins: ['המעגלים משיקים מבחוץ'] },
  { row: '8', needs: PAIR, exam: 'the two circles touch each other externally', twins: ['the two circles are externally tangent'] },
  // Row 10 — A2: a circle with no name, named by its centre and stated by its equation.
  { row: '10', needs: [], exam: 'מרכזו של המעגל האחד הוא בנקודה M ומשוואתו היא (x − a)² + y² = r²', twins: ['M מרכז המעגל (x − a)² + y² = r²'] },
  { row: '10', needs: [], exam: 'מרכזו של המעגל האחד הוא בנקודה M ומשוואתו היא (x − a)² + y² = r², a הוא פרמטר חיובי.', twins: ['M מרכז המעגל (x − a)² + y² = r²', 'a הוא פרמטר חיובי'] },
  { row: '10', needs: [], exam: 'מרכזו של המעגל האחר הוא בנקודה N ומשוואתו היא (x − 13)² + y² = r²', twins: ['N מרכז המעגל (x − 13)² + y² = r²'] },
  { row: '10', needs: [], exam: 'נתון מעגל שמרכזו M ומשוואתו (x-a)^2+y^2=r^2', twins: ['M מרכז המעגל (x-a)^2+y^2=r^2'] },
  // Row 11 — B1: the measure between the centres. The segment spelling draws the segment (it names it); the distance
  // spelling names nothing (operator ruling 2026-10-02, ADR-AG-200), so its twin is the distance sentence.
  ...['אורכו של הקטע המחבר את מרכזי המעגלים הוא 9', 'אורך הקטע המחבר את מרכזי המעגלים הוא 9', 'the length of the segment joining the centres is 9', 'the segment joining the centres of the circles is 9'].map(
    (exam): Row => ({ row: '11', needs: PAIR, exam, twins: ['MN = 9'], factsDiffer: true }),
  ),
  ...['המרחק בין מרכזי המעגלים הוא 9', 'the distance between the centres of the circles is 9', 'the distance between the centres is 9'].map(
    (exam): Row => ({ row: '11', needs: PAIR, exam, twins: ['המרחק בין M ל-N הוא 9'], factsDiffer: true }),
  ),
  // Row 12 — A7: the plural subject distributed over its named members.
  {
    row: '12',
    needs: Q3,
    exam: 'שני מעגלים שמרכזיהם בנקודות N₁ ו-N₂ והרדיוס של כל אחד מהם הוא 10 , משיקים למעגל M בנקודה A',
    twins: ['נתון מעגל שמרכזו N₁ ורדיוסו 10', 'מעגל N₁ משיקים למעגל M בנקודה A', 'נתון מעגל שמרכזו N₂ ורדיוסו 10', 'מעגל N₂ משיקים למעגל M בנקודה A'],
  },
  {
    row: '12',
    needs: Q3,
    exam: 'שני מעגלים שמרכזיהם בנקודות N1 ו-N2 ורדיוס כל אחד מהם 10 משיקים למעגל M בנקודה A',
    twins: ['נתון מעגל שמרכזו N1 ורדיוסו 10', 'מעגל N1 משיקים למעגל M בנקודה A', 'נתון מעגל שמרכזו N2 ורדיוסו 10', 'מעגל N2 משיקים למעגל M בנקודה A'],
  },
  {
    row: '12',
    needs: Q3,
    exam: 'two circles centred N1 and N2, each of radius 10, are tangent to circle M at A',
    twins: ['circle centred at N1 with radius 10', 'circle N1 is tangent to circle M at A', 'circle centred at N2 with radius 10', 'circle N2 is tangent to circle M at A'],
  },
  // Row 13 — A9: an underscored index is the glyph the exam prints.
  ...['נתון מעגל שמרכזו N_2 ורדיוסו 10', 'נתון מעגל שמרכזו N_{2} ורדיוסו 10'].map((exam): Row => ({ row: '13', needs: Q3, exam, twins: ['נתון מעגל שמרכזו N₂ ורדיוסו 10'] })),
  // Row 14 — A8: «קוטר המעגל M» is «קוטר במעגל M».
  { row: '14', needs: Q3_N2, exam: 'הקטע N₂A הוא קוטר המעגל M', twins: ['הקטע N₂A הוא קוטר במעגל M'] },
  { row: '14', needs: Q3_N2, exam: 'N₂A קוטר של המעגל M', twins: ['N₂A קוטר במעגל M'] },
  // Found work on #2391 — a tangent THROUGH a point the figure puts ON the circle is the tangent AT that point.
  { row: 'found', needs: Q1_HEAD, exam: 'דרך הנקודה A עובר משיק למעגל I', twins: ['המשיק למעגל I בנקודה A'], factsDiffer: true },
  { row: 'found', needs: Q1_HEAD, exam: 'the tangent to circle I through A', twins: ['המשיק למעגל I בנקודה A'], factsDiffer: true },
];

const stripSrc = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (k, x) => (k === 'src' ? undefined : x)));
const factsOf = (line: string) => {
  const r = parseLine(line);
  if (!r.ok) throw new Error(`«${line}» did not parse: ${r.code}`);
  return stripSrc(r.facts);
};
/** The drawn figure, as a comparable snapshot: every point where it is, every segment's ends, every curve's kind. */
const snapshot = (lines: readonly string[], seed: number) => {
  const d = derive(lines, seed);
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    faults: d.faults.map((f) => f.code),
    points: Object.fromEntries(d.figure.points.map((p) => [p.id, [r(p.x), r(p.y)]])),
    segments: d.figure.segments.map((s) => [s.a, s.b].map((p) => `${r(p.x)},${r(p.y)}`).sort().join('|')).sort(),
    curves: d.figure.curves.map((c) => `${c.curve.kind}`).sort(),
    unsatisfied: d.figure.unsatisfied.length,
  };
};

describe('#2391 — every exam spelling reads as its canonical twin (facts, verdict, figure)', () => {
  it.each(ROWS.map((r) => [`row ${r.row}: ${r.exam}`, r] as const))('%s', (_, r) => {
    if (!r.factsDiffer) expect(factsOf(r.exam)).toEqual(r.twins.flatMap(factsOf));
    // The verdict: the twins record one by one, and the exam line records where they did.
    let held = [...r.needs];
    for (const t of r.twins) {
      // «נקודה M» about a point the figure has is already known — the naming adds nothing, as the exam's subject does not
      expect(['record', 'already-known'], `twin «${t}»`).toContain(decideSubmit(t, held, 0).kind);
      held = [...held, t];
    }
    expect(decideSubmit(r.exam, r.needs, 0).kind).toBe('record');
    for (const seed of [0, 1]) expect(snapshot([...r.needs, r.exam], seed)).toEqual(snapshot([...r.needs, ...r.twins], seed));
  });
});

describe('#2391 B2 — the trailing through-adverbial is taught as the tangent at that point', () => {
  const pre = Q1_HEAD;
  it.each([
    ['מעבירים משיק למעגל I דרך הנקודה A ומשיק למעגל II דרך הנקודה B.', 'המשיק למעגל I בנקודה A; המשיק למעגל II בנקודה B'],
    ['מעבירים משיק למעגל I דרך הנקודה A', 'המשיק למעגל I בנקודה A'],
    ['העבירו משיק למעגל I דרך הנקודה A', 'המשיק למעגל I בנקודה A'],
    ['מעבירים משיק למעגל I בנקודה A ומשיק למעגל II בנקודה B', 'המשיק למעגל I בנקודה A; המשיק למעגל II בנקודה B'],
    ['מעבירים משיקים למעגלים I ו-II בנקודות A ו-B בהתאמה', 'המשיק למעגל I בנקודה A; המשיק למעגל II בנקודה B'],
    // the adverbial BEFORE the verb — the register's existing reading, unchanged
    ['דרך הנקודה A העבירו משיק למעגל I', 'המשיק למעגל I בנקודה A'],
  ])('«%s» teaches «%s», and the taught line records on the next Enter (seeds 0 and 1)', (exam, canonical) => {
    const v = decideSubmit(exam, pre, 0);
    expect(v).toMatchObject({ kind: 'teach', canonical });
    for (const seed of [0, 1]) expect(decideSubmit(canonical, pre, seed).kind).toBe('record');
  });

  it('the taught pair builds the same figure as the two canonical lines', () => {
    for (const seed of [0, 1]) {
      expect(snapshot([...pre, 'המשיק למעגל I בנקודה A; המשיק למעגל II בנקודה B'], seed)).toEqual(snapshot(Q1_TANGENTS, seed));
    }
  });
});

describe('#2391 found work — a tangent through a point ON the circle is the tangent at that point', () => {
  it.each(['דרך הנקודה A עובר משיק למעגל I', 'the tangent to circle I through A'])('«%s»: the two tangents then meet at M, and M’s locus has its equation', (t) => {
    const lines = [...Q1_HEAD, t, t.startsWith('the') ? 'the tangent to circle II through B' : 'דרך הנקודה B עובר משיק למעגל II'];
    expect(decideSubmit('המשיקים נפגשים בנקודה M', lines, 0).kind).toBe('record');
    const d = derive([...lines, 'המשיקים נפגשים בנקודה M', 'MA = MB'], 0);
    expect(d.faults).toEqual([]);
    expect(ask(d, 'המקום הגיאומטרי של M', fmtAnalytic).value).toBe('line · 4x + y + 3 = 0');
  });

  it('control — through a point OFF the circle it is still the tangent FROM it (two roots, a free direction)', () => {
    const lines = ['נתון מעגל x^2+y^2=25', 'P(10,0)', 'דרך P עובר משיק למעגל'];
    expect(decideSubmit(lines[2], lines.slice(0, 2), 0).kind).toBe('record');
    const d = derive(lines, 0);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.some((o) => o.kind === 'line-at' && o.id === 'tangent-P')).toBe(false);
  });
});

describe('#2391 — controls: what the rewrites must NOT read', () => {
  it('«M מקיימת AB = KL» does not mention M, so it is not this sentence (M is never dropped)', () => {
    expect(parseLine('M מקיימת AB = KL')).toMatchObject({ ok: false, code: 'not-handled' });
  });

  it('«מרכז המעגל I הוא K» with no circle I is refused as its twin is', () => {
    const exam = decideSubmit('מרכז המעגל I הוא K', [], 0);
    const twin = decideSubmit('K מרכז המעגל I', [], 0);
    expect(twin.kind).toBe('refused');
    expect(exam.kind).toBe('refused');
    if (exam.kind !== 'refused' || twin.kind !== 'refused') return;
    expect(exam.error.key).toBe(twin.error.key);
  });

  it('the centres’ distance over three circles is refused as «which circles?», never a pick', () => {
    const v = decideSubmit('המרחק בין מרכזי המעגלים הוא 9', [...PAIR, 'נתון מעגל שמרכזו P ורדיוסו 1'], 0);
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'ambiguous-shape' } });
  });

  it('the centres’ distance between two NAMED circles takes the named pair', () => {
    const lines = [...PAIR, 'נתון מעגל שמרכזו P ורדיוסו 1'];
    for (const seed of [0, 1]) expect(snapshot([...lines, 'המרחק בין מרכזי המעגלים M ו-N הוא 9'], seed)).toEqual(snapshot([...lines, 'המרחק בין M ל-N הוא 9'], seed));
  });

  it('A9 never touches a lowercase base, a letter index or the area notation', () => {
    expect(orthography('x_B > 3')).toBe('x_B > 3');
    expect(orthography('r_M = 4')).toBe('r_M = 4');
    expect(orthography('S_ABC = 12')).toBe('שטח ABC = 12');
    expect(orthography('N_2A = 5')).toBe('N₂A = 5');
  });

  it('«מעגל II» is a circle’s name, never the point I', () => {
    const f = JSON.stringify(factsOf('K ו-L מרכזי המעגלים I ו-II בהתאמה'));
    expect(f).toContain('circle-II');
    expect(f).not.toContain('"id":"I"');
  });

  it('the given-word keeps its glued «ש-» before anything that is not a cardinal', () => {
    expect(factsOf('נתון שהישר AB מקביל ל-CD')).toEqual(factsOf('הישר AB מקביל ל-CD'));
    expect(factsOf('נתונים שני מעגלים המשיקים זה לזה מבחוץ')).toEqual(factsOf('שני מעגלים המשיקים זה לזה מבחוץ'));
  });

  it('the twin of an empty-canvas «נתונים שני מעגלים …» is refused alike (introducing the pair is #2397)', () => {
    expect(decideSubmit('נתונים שני מעגלים המשיקים זה לזה מבחוץ', [], 0)).toMatchObject({ kind: 'refused', error: { key: 'ambiguous-shape' } });
    expect(decideSubmit('המעגלים משיקים מבחוץ', [], 0)).toMatchObject({ kind: 'refused', error: { key: 'ambiguous-shape' } });
  });
});
