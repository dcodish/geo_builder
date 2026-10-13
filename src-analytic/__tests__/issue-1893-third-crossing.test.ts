/**
 * #1893 — A THIRD CROSSING OF A LINE WITH A CIRCLE IT ALREADY CROSSES AT TWO NAMED POINTS IS REFUSED, IN #1834'S
 * RULED SENTENCE (ADR-AG-271).
 *
 * «מעגל O · A על מעגל O · C על מעגל O · AC חותך את המעגל בנקודה E» recorded green with E drawn on A (or C): a line
 * meets a circle at most twice, A and C are those two, so E can only coincide with one of them — two labels on one
 * dot. 2-D refuses every spelling of it. #1834's ruling (2026-10-07): *"any third crossing asked of a line that already
 * has two named points on the circle gets this sentence, with the letters filled in"* —
 * «AC כבר חותך את המעגל ב-A וב-C — לישר אין נקודת חיתוך שלישית עם המעגל.»
 *
 * The arm is structural (`derive.ts`): a point on the line through a and b and on circle K, where a and b are on K by
 * construction (a defining point, a stated incidence) or because nothing can move them and they lie on it. Circles
 * only — a conic's wording is unruled (#1909, #1932), so the parabola and ellipse rows keep today's verdict.
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

/** Every line records, and the named point is not drawn on any other point. */
function recordsApart(lines: string[], id: string, seed: number): void {
  for (let i = 0; i < lines.length; i++) {
    const v = decideSubmit(lines[i], lines.slice(0, i), seed);
    expect(v.kind, `line ${i} «${lines[i]}» at seed ${seed}`).toBe('record');
  }
  const d = derive(lines, seed);
  const p = d.figure.points.find((q) => q.id === id)!;
  expect(p).toBeDefined();
  for (const q of d.figure.points) if (q.id !== id) expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThan(1e-3);
}

const HIS = ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'AC חותך את המעגל בנקודה E'];

describe('#1893 — the operator’s four lines', () => {
  it.each([0, 1, 2, 3, 4, 5])('seed %i: the last line is refused with the ruled sentence, naming AC, A and C', (seed) => {
    const error = lastRefused(HIS, seed);
    expect(error).toMatchObject({ key: 'third-crossing', line: 'AC', a: 'A', b: 'C' });
    expect(plain(errorText(error, he))).toBe('AC כבר חותך את המעגל ב-A וב-C — לישר אין נקודת חיתוך שלישית עם המעגל.');
  });

  it('English reads the same sentence with the same letters', () => {
    const error = lastRefused(HIS, 0);
    expect(plain(errorText(error, en))).toBe('AC already crosses the circle at A and C — a line has no third crossing with a circle.');
  });

  it('one fault on the line — never the two-straights «crossing-already-named» or a failed search beside it', () => {
    for (const seed of [0, 4]) {
      const d = derive(HIS, seed);
      expect(d.faults).toEqual([{ index: 3, code: 'third-crossing', detail: HIS[3], line: 'AC', a: 'A', b: 'C' }]);
    }
  });
});

/** Every other spelling of the same wrong outcome (the plan's table), each with its own letters. */
const ROWS: Array<[string, string[], { line: string; a: string; b: string }]> = [
  ['«הישר AC … המעגל O»', ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'הישר AC חותך את המעגל O בנקודה E'], { line: 'AC', a: 'A', b: 'C' }],
  ['«הישר AC»', ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'הישר AC חותך את המעגל בנקודה E'], { line: 'AC', a: 'A', b: 'C' }],
  ['«המיתר AC»', ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'המיתר AC חותך את המעגל בנקודה E'], { line: 'AC', a: 'A', b: 'C' }],
  ['«המשך AC»', ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'המשך AC חותך את המעגל בנקודה E'], { line: 'AC', a: 'A', b: 'C' }],
  ['«בנקודות A ו-E»', ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'AC חותך את המעגל בנקודות A ו-E'], { line: 'AC', a: 'A', b: 'C' }],
  ['a diameter', ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'AB קוטר', 'AB חותך את המעגל בנקודה E'], { line: 'AB', a: 'A', b: 'B' }],
  ['a point C on AB first', ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על AB', 'AB חותך את המעגל בנקודה E'], { line: 'AB', a: 'A', b: 'B' }],
  ['an existing D', ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'D על מעגל O', 'AC חותך את המעגל בנקודה D'], { line: 'AC', a: 'A', b: 'C' }],
  ['an inscribed triangle', ['משולש ABC חסום במעגל O', 'AB חותך את המעגל בנקודה E'], { line: 'AB', a: 'A', b: 'B' }],
  ['the circle through A, B and C', ['נקודה A', 'נקודה B', 'נקודה C', 'מעגל העובר דרך A, B ו-C', 'AB חותך את המעגל בנקודה E'], { line: 'AB', a: 'A', b: 'B' }],
  ['«P על AC» then «P על מעגל O»', ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'P על AC', 'P על מעגל O'], { line: 'AC', a: 'A', b: 'C' }],
  ['«P על מעגל O» then «P על AC»', ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'P על מעגל O', 'P על AC'], { line: 'AC', a: 'A', b: 'C' }],
  ['«P על הישר AC» then «P על מעגל O»', ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'P על הישר AC', 'P על מעגל O'], { line: 'AC', a: 'A', b: 'C' }],
  ['the other order: «C על מעגל O» is the line refused', ['מעגל O', 'A על מעגל O', 'נקודה C', 'AC חותך את המעגל בנקודה E', 'C על מעגל O'], { line: 'AC', a: 'A', b: 'C' }],
  ['coordinates: A(3,4), C(-3,4)', ['x^2+y^2=25', 'A(3,4)', 'C(-3,4)', 'AC חותך את המעגל בנקודה E'], { line: 'AC', a: 'A', b: 'C' }],
  ['coordinates: A(3,4), C on the circle', ['x^2+y^2=25', 'A(3,4)', 'C על המעגל', 'AC חותך את המעגל בנקודה E'], { line: 'AC', a: 'A', b: 'C' }],
];

describe('#1893 — the class: every spelling, every way the two points came to be on the circle', () => {
  it.each(ROWS)('%s — refused with the ruled sentence and its own letters, at seeds 0–2', (_what, lines, letters) => {
    for (const seed of [0, 1, 2]) {
      const error = lastRefused(lines, seed);
      expect(error).toMatchObject({ key: 'third-crossing', ...letters });
      expect(plain(errorText(error, he))).toBe(`${letters.line} כבר חותך את המעגל ב-${letters.a} וב-${letters.b} — לישר אין נקודת חיתוך שלישית עם המעגל.`);
    }
  });
});

describe('#1893 — the controls: a line with a real second crossing keeps it', () => {
  it.each([
    ['one end on the circle, a free P', ['מעגל O', 'A על מעגל O', 'נקודה P', 'AP חותך את המעגל בנקודה E']],
    ['the same with «הישר AP»', ['מעגל O', 'A על מעגל O', 'נקודה P', 'הישר AP חותך את המעגל בנקודה E']],
  ] as Array<[string, string[]]>)('%s: records, E apart from every point, at seeds 0–5', (_what, lines) => {
    for (let seed = 0; seed < 6; seed++) recordsApart(lines, 'E', seed);
  });

  it('the incircle: its ring vertices are not on it — the crossing records', () => {
    const lines = ['משולש ABC', 'מעגל חסום במשולש ABC', 'AB חותך את המעגל בנקודה E'];
    for (let seed = 0; seed < 3; seed++) recordsApart(lines, 'E', seed);
  });

  it('coordinates: P(10,0) is off the circle — E is the other crossing, (1.9231, 4.6154)', () => {
    const lines = ['x^2+y^2=25', 'A(3,4)', 'P(10,0)', 'AP חותך את המעגל בנקודה E'];
    recordsApart(lines, 'E', 0);
    const e = derive(lines, 0).figure.points.find((q) => q.id === 'E')!;
    expect(e.x).toBeCloseTo(25 / 13, 3);
    expect(e.y).toBeCloseTo(60 / 13, 3);
  });
});

describe('#1893 — scope: a conic chord is not this arm’s (#1909, #1932 — unruled wording)', () => {
  it.each([
    ['the parabola', ['y^2=4x', 'A על הפרבולה', 'C על הפרבולה', 'AC חותך את הפרבולה בנקודה E']],
    ['the ellipse', ['x^2/9+y^2/4=1', 'A על האליפסה', 'C על האליפסה', 'AC חותך את האליפסה בנקודה E']],
  ] as Array<[string, string[]]>)('%s: never refused as a third crossing', (_what, lines) => {
    for (let seed = 0; seed < 6; seed++) {
      expect(derive(lines, seed).faults.filter((f) => f.code === 'third-crossing')).toEqual([]);
    }
  });
});
