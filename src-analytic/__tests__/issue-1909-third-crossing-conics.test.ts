/**
 * #1909 — A THIRD CROSSING OF A LINE WITH A PARABOLA OR AN ELLIPSE IT ALREADY CROSSES AT TWO NAMED POINTS IS REFUSED,
 * IN #1893'S SENTENCE WITH THE CURVE'S NOUN (ADR-AG-292).
 *
 * «y^2=4x · A על הפרבולה · C על הפרבולה · AC חותך את הפרבולה בנקודה E» recorded green with E drawn on A or C: a line
 * meets a parabola (an ellipse) at most twice, as it meets a circle, and #1893's arm read only circles. The operator's
 * ruling (2026-10-08): *"Yes, same sentence"* — «AC כבר חותך את הפרבולה ב-A וב-C — לישר אין נקודת חיתוך שלישית עם
 * הפרבולה.», likewise «…האליפסה…». The gate is `maxCrossings('line', kind) === 2`, the Bézout bound #1114 counts by.
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
const NOUN = { parabola: 'הפרבולה', ellipse: 'האליפסה', circle: 'המעגל' } as const;
const HE_TEXT = (line: string, a: string, b: string, curve: keyof typeof NOUN) =>
  `${line} כבר חותך את ${NOUN[curve]} ב-${a} וב-${b} — לישר אין נקודת חיתוך שלישית עם ${NOUN[curve]}.`;

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

const PB = ['y^2=4x', 'A על הפרבולה', 'C על הפרבולה'];
const EL = ['x^2/9+y^2/4=1', 'A על האליפסה', 'C על האליפסה'];
const HIS = [...PB, 'AC חותך את הפרבולה בנקודה E'];
const SEEDS = [0, 1, 2, 3, 4, 5];

describe('#1909 — the issue’s four lines', () => {
  it.each(SEEDS)('seed %i: the last line is refused with the ruled sentence on «הפרבולה»', (seed) => {
    const error = lastRefused(HIS, seed);
    expect(error).toMatchObject({ key: 'third-crossing', line: 'AC', a: 'A', b: 'C', curve: 'parabola' });
    expect(plain(errorText(error, he))).toBe('AC כבר חותך את הפרבולה ב-A וב-C — לישר אין נקודת חיתוך שלישית עם הפרבולה.');
  });

  it.each(SEEDS)('seed %i: the ellipse twin reads «האליפסה»', (seed) => {
    const error = lastRefused([...EL, 'AC חותך את האליפסה בנקודה E'], seed);
    expect(error).toMatchObject({ key: 'third-crossing', curve: 'ellipse' });
    expect(plain(errorText(error, he))).toBe('AC כבר חותך את האליפסה ב-A וב-C — לישר אין נקודת חיתוך שלישית עם האליפסה.');
  });

  it('one fault on the line — never «crossing-already-named» beside it', () => {
    for (const seed of SEEDS) {
      expect(derive(HIS, seed).faults).toEqual([{ index: 3, code: 'third-crossing', detail: HIS[3], line: 'AC', a: 'A', b: 'C', curve: 'parabola' }]);
    }
  });
});

/** Every other row of the plan's table, each with its own letters and noun. */
const ROWS: Array<[string, string[], { line: string; a: string; b: string; curve: 'parabola' | 'ellipse' }]> = [
  ['«הישר AC»', [...PB, 'הישר AC חותך את הפרבולה בנקודה E'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['«המיתר AC»', [...PB, 'המיתר AC חותך את הפרבולה בנקודה E'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['an existing D', [...PB, 'D על הפרבולה', 'AC חותך את הפרבולה בנקודה D'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['«P על AC» then «P על הפרבולה»', [...PB, 'P על AC', 'P על הפרבולה'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['«P על הפרבולה» then «P על AC»', [...PB, 'P על הפרבולה', 'P על AC'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['«P על הישר AC» then «P על הפרבולה»', [...PB, 'P על הישר AC', 'P על הפרבולה'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['«בנקודות A ו-E»', [...PB, 'AC חותך את הפרבולה בנקודות A ו-E'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['«המשך AC» (A and C collapsed before)', [...PB, 'המשך AC חותך את הפרבולה בנקודה E'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['the other order: «C על הפרבולה» is the line refused', ['y^2=4x', 'A על הפרבולה', 'נקודה C', 'AC חותך את הפרבולה בנקודה E', 'C על הפרבולה'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['a named «פרבולה I»', ['נתונה פרבולה I שמשוואתה y^2=2x', 'A על פרבולה I', 'C על פרבולה I', 'AC חותך את פרבולה I בנקודה E'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['«y^2=2px»', ['y^2=2px', 'A על הפרבולה', 'C על הפרבולה', 'AC חותך את הפרבולה בנקודה E'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['coordinates: A(1,2), C(4,4) (was the two-lines wording)', ['y^2=4x', 'A(1,2)', 'C(4,4)', 'AC חותך את הפרבולה בנקודה E'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['coordinates: A(1,2), C on the parabola', ['y^2=4x', 'A(1,2)', 'C על הפרבולה', 'AC חותך את הפרבולה בנקודה E'], { line: 'AC', a: 'A', b: 'C', curve: 'parabola' }],
  ['the ellipse: «הישר AC»', [...EL, 'הישר AC חותך את האליפסה בנקודה E'], { line: 'AC', a: 'A', b: 'C', curve: 'ellipse' }],
  ['the ellipse: «P על AC · P על האליפסה»', [...EL, 'P על AC', 'P על האליפסה'], { line: 'AC', a: 'A', b: 'C', curve: 'ellipse' }],
  ['the ellipse, coordinates: A(3,0), C(0,2)', ['x^2/9+y^2/4=1', 'A(3,0)', 'C(0,2)', 'AC חותך את האליפסה בנקודה E'], { line: 'AC', a: 'A', b: 'C', curve: 'ellipse' }],
  ['the ellipse: A(3,0), C on it', ['x^2/9+y^2/4=1', 'A(3,0)', 'C על האליפסה', 'AC חותך את האליפסה בנקודה E'], { line: 'AC', a: 'A', b: 'C', curve: 'ellipse' }],
];

describe('#1909 — the class: every spelling, every way the two points came to be on the conic', () => {
  it.each(ROWS)('%s — refused with the ruled sentence, its own letters and noun, at seeds 0–5', (_what, lines, want) => {
    for (const seed of SEEDS) {
      const error = lastRefused(lines, seed);
      expect(error).toMatchObject({ key: 'third-crossing', ...want });
      expect(plain(errorText(error, he))).toBe(HE_TEXT(want.line, want.a, want.b, want.curve));
    }
  });
});

describe('#1909 — the controls: a line with a real second crossing keeps it', () => {
  it.each([
    ['a parabola, P(10,0) off it', ['y^2=4x', 'A על הפרבולה', 'P(10,0)', 'AP חותך את הפרבולה בנקודה E']],
    ['a parabola, a free P', ['y^2=4x', 'A על הפרבולה', 'נקודה P', 'הישר AP חותך את הפרבולה בנקודה E']],
    ['an ellipse, P(10,1) off it', ['x^2/9+y^2/4=1', 'A על האליפסה', 'P(10,1)', 'AP חותך את האליפסה בנקודה E']],
    ['the focus is not on the parabola', ['y^2=4x', 'F מוקד הפרבולה', 'A על הפרבולה', 'AF חותך את הפרבולה בנקודה E']],
  ] as Array<[string, string[]]>)('%s: records, E apart from every point, at seeds 0–5', (_what, lines) => {
    for (const seed of SEEDS) recordsApart(lines, 'E', seed);
  });

  it('coordinates: E = (16, −8) on the parabola, (2.1724, 1.3793) on the ellipse', () => {
    const p = ['y^2=4x', 'A(1,2)', 'P(4,0)', 'AP חותך את הפרבולה בנקודה E'];
    recordsApart(p, 'E', 0);
    const e = derive(p, 0).figure.points.find((q) => q.id === 'E')!;
    expect(e.x).toBeCloseTo(16, 3);
    expect(e.y).toBeCloseTo(-8, 3);
    const l = ['x^2/9+y^2/4=1', 'A(3,0)', 'P(0,5)', 'AP חותך את האליפסה בנקודה E'];
    recordsApart(l, 'E', 0);
    const f = derive(l, 0).figure.points.find((q) => q.id === 'E')!;
    expect(f.x).toBeCloseTo(63 / 29, 3);
    expect(f.y).toBeCloseTo(40 / 29, 3);
  });
});

describe('#1909 — the sentence, per curve and locale', () => {
  it.each([
    ['circle', 'AC כבר חותך את המעגל ב-A וב-C — לישר אין נקודת חיתוך שלישית עם המעגל.', 'AC already crosses the circle at A and C — a line has no third crossing with a circle.'],
    ['parabola', 'AC כבר חותך את הפרבולה ב-A וב-C — לישר אין נקודת חיתוך שלישית עם הפרבולה.', 'AC already crosses the parabola at A and C — a line has no third crossing with a parabola.'],
    ['ellipse', 'AC כבר חותך את האליפסה ב-A וב-C — לישר אין נקודת חיתוך שלישית עם האליפסה.', 'AC already crosses the ellipse at A and C — a line has no third crossing with an ellipse.'],
  ] as const)('%s', (curve, heText, enText) => {
    const error: InputError = { key: 'third-crossing', detail: 'AC …', line: 'AC', a: 'A', b: 'C', curve };
    expect(plain(errorText(error, he))).toBe(heText);
    expect(plain(errorText(error, en))).toBe(enText);
  });

  it('a fault with no curve reads as the circle (byte-identical to #1893)', () => {
    const error: InputError = { key: 'third-crossing', detail: 'AC …', line: 'AC', a: 'A', b: 'C' };
    expect(plain(errorText(error, he))).toBe('AC כבר חותך את המעגל ב-A וב-C — לישר אין נקודת חיתוך שלישית עם המעגל.');
  });
});
