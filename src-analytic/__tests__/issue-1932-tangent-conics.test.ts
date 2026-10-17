/**
 * #1932 — A CROSSING ASKED OF A LINE TANGENT TO A PARABOLA OR AN ELLIPSE AT A POINT THE FIGURE ALREADY HAS IS REFUSED,
 * IN #1924'S SENTENCE WITH THE CURVE'S NOUN (ADR-AG-292).
 *
 * «y^2=4x · A(1,2) · P(-1,0) · AP חותך את הפרבולה בנקודה E»: AP is the tangent at A, so it meets the parabola only there,
 * and the descent stopped near the double root — E drawn 5·10⁻⁴ from A, green. The operator's ruling (2026-10-08):
 * «לא ניתן למקם את E: הישר משיק לפרבולה בנקודה אחת בלבד — אין נקודת חיתוך נוספת להמשיך אליה.», likewise «…לאליפסה…».
 *
 * Three widenings of #1924's arm: the gate (`maxCrossings('line', kind) === 2`), TANGENCY read off the quadratic the
 * line leaves in the conic (so the line parallel to a parabola's axis, which meets it once without touching, is never a
 * touch), and "cannot move" read as the LINE's own freedom (a point riding a fixed tangent leaves the line fixed).
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
const TO = { parabola: 'לפרבולה', ellipse: 'לאליפסה', circle: 'למעגל' } as const;
const HE_TEXT = (id: string, curve: keyof typeof TO) =>
  `לא ניתן למקם את ${id}: הישר משיק ${TO[curve]} בנקודה אחת בלבד — אין נקודת חיתוך נוספת להמשיך אליה.`;

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

const X = ['y^2=4x', 'A(1,2)', 'P(-1,0)'];
const HIS = [...X, 'AP חותך את הפרבולה בנקודה E'];
const SEEDS = [0, 1, 2, 3, 4, 5];

describe('#1932 — the issue’s four lines', () => {
  it.each(SEEDS)('seed %i: the last line is refused with the tangent sentence on the parabola, naming E', (seed) => {
    const error = lastRefused(HIS, seed);
    expect(error).toMatchObject({ key: 'tangent-no-second-crossing', id: 'E', curve: 'parabola' });
    expect(plain(errorText(error, he))).toBe('לא ניתן למקם את E: הישר משיק לפרבולה בנקודה אחת בלבד — אין נקודת חיתוך נוספת להמשיך אליה.');
  });

  it.each(SEEDS)('seed %i: the ellipse twin reads «לאליפסה»', (seed) => {
    const error = lastRefused(['x^2/9+y^2/4=1', 'A(3,0)', 'P(3,5)', 'AP חותך את האליפסה בנקודה E'], seed);
    expect(error).toMatchObject({ key: 'tangent-no-second-crossing', id: 'E', curve: 'ellipse' });
    expect(plain(errorText(error, he))).toBe(HE_TEXT('E', 'ellipse'));
  });

  it('one fault on the line', () => {
    expect(derive(HIS, 0).faults).toEqual([{ index: 3, code: 'tangent-no-second-crossing', detail: HIS[3], point: 'E', curve: 'parabola' }]);
  });
});

/** Every other measured spelling (the plan's table). */
const ROWS: Array<[string, string[], 'parabola' | 'ellipse' | 'circle']> = [
  ['«הישר AP»', [...X, 'הישר AP חותך את הפרבולה בנקודה E'], 'parabola'],
  ['«PA»', [...X, 'PA חותך את הפרבולה בנקודה E'], 'parabola'],
  ['«הקטע AP»', [...X, 'הקטע AP חותך את הפרבולה בנקודה E'], 'parabola'],
  ['«E נקודת החיתוך של הישר AP עם הפרבולה»', [...X, 'E נקודת החיתוך של הישר AP עם הפרבולה'], 'parabola'],
  ['«E על AP» · «E על הפרבולה»', [...X, 'E על AP', 'E על הפרבולה'], 'parabola'],
  ['«E על הפרבולה» · «E על AP»', [...X, 'E על הפרבולה', 'E על AP'], 'parabola'],
  ['«המשך AP» (was «לא נמצאה תצורה»)', [...X, 'המשך AP חותך את הפרבולה בנקודה E'], 'parabola'],
  ['«בנקודות A ו-E» (was «לא נמצאה תצורה»)', [...X, 'הישר AP חותך את הפרבולה בנקודות A ו-E'], 'parabola'],
  ['a named «פרבולה I»', ['נתונה פרבולה I שמשוואתה y^2=4x', 'A(1,2)', 'P(-1,0)', 'הישר AP חותך את פרבולה I בנקודה E'], 'parabola'],
  ['the tangent by its equation', ['y^2=4x', 'A(1,2)', 'נתון הישר l1: y=x+1', 'הישר l1 חותך את הפרבולה בנקודה E'], 'parabola'],
  ['an unrelated «נקודה Q» first', ['y^2=4x', 'A(1,2)', 'נקודה Q', 'P(-1,0)', 'AP חותך את הפרבולה בנקודה E'], 'parabola'],
  ['P free on the tangent', ['y^2=4x', 'A(1,2)', 'נתון הישר l1: y=x+1', 'P על הישר l1', 'AP חותך את הפרבולה בנקודה E'], 'parabola'],
  ['the other order: «P(-1,0)» is the line refused', ['y^2=4x', 'A(1,2)', 'הישר AP חותך את הפרבולה בנקודה E', 'P(-1,0)'], 'parabola'],
  ['the ellipse: «הישר AP»', ['x^2/9+y^2/4=1', 'A(3,0)', 'P(3,5)', 'הישר AP חותך את האליפסה בנקודה E'], 'ellipse'],
  ['the ellipse: «E על AP · E על האליפסה»', ['x^2/9+y^2/4=1', 'A(3,0)', 'P(3,5)', 'E על AP', 'E על האליפסה'], 'ellipse'],
  ['the ellipse: a horizontal tangent, A(0,2), P(5,2)', ['x^2/9+y^2/4=1', 'A(0,2)', 'P(5,2)', 'AP חותך את האליפסה בנקודה E'], 'ellipse'],
  ['the circle: P free on the tangent l1', ['x^2+y^2=25', 'A(3,4)', 'נתון הישר l1: 3x+4y=25', 'P על הישר l1', 'AP חותך את המעגל בנקודה E'], 'circle'],
];

describe('#1932 — the class: every spelling, refused with its own noun', () => {
  it.each(ROWS)('%s — at seeds 0–5', (_what, lines, curve) => {
    for (const seed of SEEDS) {
      const error = lastRefused(lines, seed);
      expect(error).toMatchObject({ key: 'tangent-no-second-crossing', id: 'E', curve });
      expect(plain(errorText(error, he))).toBe(HE_TEXT('E', curve));
    }
  });
});

describe('#1932 — the controls', () => {
  it('a secant keeps its crossing: P(4,0) gives E = (16, −8); the ellipse with P(0,5) gives (63/29, 40/29)', () => {
    const p = ['y^2=4x', 'A(1,2)', 'P(4,0)', 'AP חותך את הפרבולה בנקודה E'];
    recordsApart(p, 'E', 0);
    const e = derive(p, 0).figure.points.find((q) => q.id === 'E')!;
    expect(e.x).toBeCloseTo(16, 3);
    expect(e.y).toBeCloseTo(-8, 3);
    const l = ['x^2/9+y^2/4=1', 'A(3,0)', 'P(0,5)', 'AP חותך את האליפסה בנקודה E'];
    recordsApart(l, 'E', 0);
  });

  it('the line parallel to the axis meets the parabola once WITHOUT touching it — never the tangent sentence', () => {
    for (const seed of SEEDS) {
      const lines = ['y^2=4x', 'A(1,2)', 'P(5,2)', 'AP חותך את הפרבולה בנקודה E'];
      expect(derive(lines, seed).faults.filter((f) => f.code === 'tangent-no-second-crossing')).toEqual([]);
      expect(lastRefused(lines, seed).key).toBe('crossing-already-named');
    }
  });

  it('a free point on a parabola with a free P keeps its crossing', () => {
    for (const seed of SEEDS) recordsApart(['y^2=4x', 'A על הפרבולה', 'נקודה P', 'AP חותך את הפרבולה בנקודה E'], 'E', seed);
  });

  it('#1909’s chord keeps `third-crossing`', () => {
    expect(lastRefused(['y^2=4x', 'A על הפרבולה', 'C על הפרבולה', 'AC חותך את הפרבולה בנקודה E'], 0).key).toBe('third-crossing');
  });
});

describe('#1932 — the sentence, per curve and locale', () => {
  it.each([
    ['circle', "Can't place E: the line is tangent to the circle (touches at one point) — there's no second crossing to extend onto."],
    ['parabola', "Can't place E: the line is tangent to the parabola (touches at one point) — there's no second crossing to extend onto."],
    ['ellipse', "Can't place E: the line is tangent to the ellipse (touches at one point) — there's no second crossing to extend onto."],
  ] as const)('%s', (curve, enText) => {
    const error: InputError = { key: 'tangent-no-second-crossing', detail: 'AP …', id: 'E', curve };
    expect(plain(errorText(error, he))).toBe(HE_TEXT('E', curve));
    expect(plain(errorText(error, en))).toBe(enText);
  });
});
