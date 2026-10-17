/**
 * #1924 — A CROSSING ASKED OF A LINE TANGENT TO THE CIRCLE AT A POINT THE FIGURE ALREADY HAS IS REFUSED, IN 2-D'S
 * SENTENCE (ADR-AG-272).
 *
 * «x^2+y^2=25 · A(3,4) · P(7,1) · AP חותך את המעגל בנקודה E»: AP is the tangent at A, so the only point it shares with
 * the circle is A. It recorded green with E drawn 5·10⁻⁴ from A — two labels on one dot. This issue's ruling: *"refused,
 * as a tangent with no second crossing. 2-D's `errors.tangentNoSecondCrossing` sentence is the template"* — which 2-D
 * shows for «מעגל O · A על מעגל O · מנקודה P משיק נוגע במעגל O בנקודה A · PA חותך את המעגל בנקודה E».
 *
 * The arm (`derive.ts`) reads the tangency two ways: nothing can move and the line only touches the circle at the named
 * point, or the tangency is stated (⊥ the radius at the point, the tangent object, a point on it). Widened to the
 * parabola and the ellipse by #1932 (ADR-AG-292), whose locks live beside this file.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { errorText, type Translate } from '../app/errorText';
import { analyticI18n } from '../i18n';
import type { InputError } from '../store/useAnalyticStore';

const he = analyticI18n.getFixedT('he') as unknown as Translate;
const en = analyticI18n.getFixedT('en') as unknown as Translate;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const HE_TEXT = (id: string) => `לא ניתן למקם את ${id}: הישר משיק למעגל בנקודה אחת בלבד — אין נקודת חיתוך נוספת להמשיך אליה.`;

/** Every line but the last records, and the last is refused — returned. */
function lastRefused(lines: string[], seed: number): InputError {
  for (let i = 0; i < lines.length - 1; i++) {
    const v = decideSubmit(lines[i], lines.slice(0, i), seed);
    expect(v.kind, `line ${i} «${lines[i]}» at seed ${seed}`).toBe('record');
  }
  const v = decideSubmit(lines[lines.length - 1], lines.slice(0, -1), seed);
  expect(v.kind, `«${lines[lines.length - 1]}» at seed ${seed}`).toBe('refused');
  return (v as { error: InputError }).error;
}

function recordsApart(lines: string[], id: string, seed: number): void {
  for (let i = 0; i < lines.length; i++) {
    const v = decideSubmit(lines[i], lines.slice(0, i), seed);
    expect(v.kind, `line ${i} «${lines[i]}» at seed ${seed}`).toBe('record');
  }
  const d = derive(lines, seed);
  const p = d.figure.points.find((q) => q.id === id)!;
  expect(p).toBeDefined();
  for (const q of d.figure.points) if (q.id !== id) expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThan(1e-2);
}

const X = ['x^2+y^2=25', 'A(3,4)', 'P(7,1)'];
const I = ['נתון מעגל I שמשוואתו x^2+y^2=25', 'A(3,4)', 'P(7,1)'];
const FREE = ['מעגל O', 'A על מעגל O', 'נקודה P'];
const FROM_P = ['מעגל O', 'A על מעגל O', 'מנקודה P משיק נוגע במעגל O בנקודה A'];
const HIS = [...X, 'AP חותך את המעגל בנקודה E'];

describe('#1924 — the issue’s four lines', () => {
  it.each([0, 1, 2, 3, 4, 5])('seed %i: the last line is refused with 2-D’s tangent sentence, naming E', (seed) => {
    const error = lastRefused(HIS, seed);
    expect(error).toMatchObject({ key: 'tangent-no-second-crossing', id: 'E' });
    expect(plain(errorText(error, he))).toBe(HE_TEXT('E'));
  });

  it('English reads 2-D’s English sentence', () => {
    expect(plain(errorText(lastRefused(HIS, 0), en))).toBe(
      "Can't place E: the line is tangent to the circle (touches at one point) — there's no second crossing to extend onto.",
    );
  });

  it('one fault on the line', () => {
    expect(derive(HIS, 0).faults).toEqual([{ index: 3, code: 'tangent-no-second-crossing', detail: HIS[3], point: 'E', curve: 'circle' }]);
  });
});

/** Every other spelling of the same wrong outcome (the plan's table). */
const ROWS: Array<[string, string[], string]> = [
  ['«הישר AP»', [...X, 'הישר AP חותך את המעגל בנקודה E'], 'E'],
  ['«PA»', [...X, 'PA חותך את המעגל בנקודה E'], 'E'],
  ['«הקטע AP»', [...X, 'הקטע AP חותך את המעגל בנקודה E'], 'E'],
  ['«E נקודת החיתוך של הישר AP עם המעגל»', [...X, 'E נקודת החיתוך של הישר AP עם המעגל'], 'E'],
  ['«E על AP» · «E על המעגל»', [...X, 'E על AP', 'E על המעגל'], 'E'],
  ['«המשך AP» (was «לא נמצאה תצורה»)', [...X, 'המשך AP חותך את המעגל בנקודה E'], 'E'],
  ['the second crossing on «המעגל I»', [...I, 'E נקודת החיתוך השנייה של הישר AP עם המעגל I'], 'E'],
  ['the first crossing on «המעגל I»', [...I, 'E נקודת החיתוך הראשונה של הישר AP עם המעגל I'], 'E'],
  ['«הישר AP חותך את המעגל I»', [...I, 'הישר AP חותך את המעגל I בנקודה E'], 'E'],
  ['«בנקודות A ו-E» (was «לא נמצאה תצורה»)', [...I, 'הישר AP חותך את המעגל I בנקודות A ו-E'], 'E'],
  ['the tangent object, then B(7,1) on it', ['x^2+y^2=25', 'A(3,4)', 'המשיק למעגל בנקודה A', 'B(7,1)', 'AB חותך את המעגל בנקודה E'], 'E'],
  ['a tangent given by its equation', ['x^2+y^2=25', 'A(3,4)', 'נתון הישר l1: 3x+4y=25', 'הישר l1 חותך את המעגל בנקודה E'], 'E'],
  ['the same, «E נקודת החיתוך»', ['x^2+y^2=25', 'A(3,4)', 'נתון הישר l1: 3x+4y=25', 'E נקודת החיתוך של הישר l1 עם המעגל'], 'E'],
  ['a centre-and-radius circle, the touch at C', ['נתון מעגל שמרכזו M(7,6) ורדיוסו 5', 'C(4,10)', 'B(8,13)', 'BC חותך את המעגל בנקודה E'], 'E'],
  ['unrelated free points first', [...X, 'Z(1,1)', 'נקודה Q', 'AP חותך את המעגל בנקודה E'], 'E'],
  // Free figures, the tangency STATED
  ['«הישר AP משיק למעגל O בנקודה A»', [...FREE, 'הישר AP משיק למעגל O בנקודה A', 'AP חותך את המעגל O בנקודה E'], 'E'],
  ['«AP ⊥ OA»', [...FREE, 'AP ⊥ OA', 'AP חותך את המעגל בנקודה E'], 'E'],
  ['«המשיק למעגל O בנקודה A» and its crossing', ['מעגל O', 'A על מעגל O', 'המשיק למעגל O בנקודה A', 'E נקודת החיתוך של המשיק עם המעגל'], 'E'],
  ['«B על המשיק» · «AB …»', ['מעגל O', 'A על מעגל O', 'המשיק למעגל O בנקודה A', 'B על המשיק', 'AB חותך את המעגל בנקודה E'], 'E'],
  ['coordinates, a free P, the tangency stated', ['x^2+y^2=25', 'A(3,4)', 'נקודה P', 'הישר AP משיק למעגל בנקודה A', 'AP חותך את המעגל בנקודה E'], 'E'],
  ['A on the circle, a free P, the tangency stated', ['x^2+y^2=25', 'A על המעגל', 'נקודה P', 'הישר AP משיק למעגל בנקודה A', 'AP חותך את המעגל בנקודה E'], 'E'],
  // 2-D's own rows: «מנקודה P משיק נוגע במעגל O בנקודה A», then every crossing spelling
  ['2-D: «PA …»', [...FROM_P, 'PA חותך את המעגל בנקודה E'], 'E'],
  ['2-D: «AP חותך את מעגל O»', [...FROM_P, 'AP חותך את מעגל O בנקודה E'], 'E'],
  ['2-D: «הישר PA …»', [...FROM_P, 'הישר PA חותך את המעגל בנקודה E'], 'E'],
  ['2-D: «המשך PA …»', [...FROM_P, 'המשך PA חותך את מעגל O בנקודה E'], 'E'],
  ['2-D: «הקטע PA …»', [...FROM_P, 'הקטע PA חותך את המעגל בנקודה E'], 'E'],
  ['2-D: «E נקודת החיתוך של הישר PA עם המעגל»', [...FROM_P, 'E נקודת החיתוך של הישר PA עם המעגל'], 'E'],
  ['2-D: «E על PA» · «E על מעגל O»', [...FROM_P, 'E על PA', 'E על מעגל O'], 'E'],
  // The other order: the line that completes the tangency is the one refused
  ['the other order: the tangency stated last', [...FREE, 'AP חותך את המעגל בנקודה E', 'הישר AP משיק למעגל O בנקודה A'], 'E'],
];

describe('#1924 — the class: every spelling, every way the line came to be tangent', () => {
  it.each(ROWS)('%s — refused with the sentence, naming its point, at seeds 0–2', (_what, lines, id) => {
    for (const seed of [0, 1, 2]) {
      const error = lastRefused(lines, seed);
      expect(error).toMatchObject({ key: 'tangent-no-second-crossing', id });
      expect(plain(errorText(error, he))).toBe(HE_TEXT(id));
    }
  });
});

describe('#1924 — the controls keep their crossing', () => {
  it('P(10,0): the line crosses again, E = (25/13, 60/13)', () => {
    const lines = ['x^2+y^2=25', 'A(3,4)', 'P(10,0)', 'AP חותך את המעגל בנקודה E'];
    recordsApart(lines, 'E', 0);
    const e = derive(lines, 0).figure.points.find((q) => q.id === 'E')!;
    expect(e.x).toBeCloseTo(25 / 13, 3);
    expect(e.y).toBeCloseTo(60 / 13, 3);
  });

  it('a free P with no tangency: E apart from A at seeds 0–5', () => {
    for (let seed = 0; seed < 6; seed++) recordsApart([...FREE, 'AP חותך את המעגל בנקודה E'], 'E', seed);
  });

  it('#1917’s line through the centre: E is the antipode; «הקטע AP» keeps its refusal', () => {
    recordsApart(['x^2+y^2=25', 'A(3,4)', 'P(0,0)', 'AP חותך את המעגל בנקודה E'], 'E', 0);
    const error = lastRefused(['x^2+y^2=25', 'A(3,4)', 'P(0,0)', 'הקטע AP חותך את המעגל בנקודה E'], 0);
    expect(error.key).toBe('crossing-already-named');
  });
});

describe('#1924 — scope', () => {
  it.each([
    // The parabola and ellipse tangents that stood here are now #1932's (ADR-AG-292, `issue-1932-tangent-conics.test.ts`).
    ['two touching circles (2-D commits its analogue)', ['מעגל I: x^2+y^2=25', 'מעגל II: (x-6)^2+(y-8)^2=25', 'A(3,4)', 'המעגל I חותך את המעגל II בנקודה E']],
  ] as Array<[string, string[]]>)('%s: not this arm’s', (_what, lines) => {
    for (let seed = 0; seed < 3; seed++) {
      expect(derive(lines, seed).faults.filter((f) => f.code === 'tangent-no-second-crossing')).toEqual([]);
    }
  });

  it('T1354 (the tangent axis, plural) stays `unsatisfiable`', () => {
    const lines = ['מעגל O', 'המעגל משיק לציר ה-x', 'המעגל חותך את ציר ה-x בנקודות B ו-C'];
    expect(lastRefused(lines, 0).key).toBe('unsatisfiable');
  });

  it('#1893’s chord keeps `third-crossing`', () => {
    expect(lastRefused(['מעגל O', 'A על מעגל O', 'C על מעגל O', 'AC חותך את המעגל בנקודה E'], 0).key).toBe('third-crossing');
  });
});
