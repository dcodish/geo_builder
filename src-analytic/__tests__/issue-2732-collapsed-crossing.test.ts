/**
 * #2732 ([ADR-AG-427](../../docs/06c-decisions-analytic.md#adr-ag-427)) — A CROSSING PAIR COLLAPSED ONTO ONE ROOT IS
 * NEVER A CONFIGURATION.
 *
 * «נתונה אליפסה שמשוואתה x^2/4+y^2/3=1 · הישר x=-1 חותך את האליפסה בנקודות A ו-B · A מעל B», asked «A», answered
 * «(-1, -3/2) או [(-1, 3/2)]», and «AB» «0 או 3». In 11 of the 24 pool configurations A and B sat on one root, and the
 * judge admitted them: "apart" and "strictly above" were measured against the spread of the solved points alone, which
 * shrinks with the pair. The ruler now includes the figure's curves (`spanOf`).
 *
 * The judge's ruling on the operator's behalf, 2026-11-08 (`scripts/judgments/ledger.json` `2732`): *"Two crossings
 * named in one sentence are two different points. A configuration that puts both letters on one crossing breaks the
 * givens, and is never evidence for an answer."*
 *
 * pipeline-lock: the regression is an ANSWER of the ask lane, read over the admitted knowledge pool (`derive` → pool →
 * `askSettled`). The figure built green before the fix too, so the fixtures net (which asserts only that a figure
 * builds) cannot see it; each row here asserts the answer a student reads.
 */
import { describe, expect, it } from 'vitest';
import { askSettled } from '../app/ask';
import { errorText, type Translate } from '../app/errorText';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import { analyticI18n } from '../i18n';
import type { InputError } from '../store/useAnalyticStore';
import operator from './fixtures/ellipse-above-2732.analytic.json';

const he = analyticI18n.getFixedT('he') as unknown as Translate;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

/** Every line through the real door, as the student's Enter records it; then each question through the ask lane. */
function answers(lines: readonly string[], questions: readonly string[], seed = 0): Record<string, string | null> {
  const held: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, held, seed);
    expect(v.kind, `«${line}» at seed ${seed}`).toBe('record');
    held.push(v.kind === 'record' ? v.line : line);
  }
  const d = derive(held, seed);
  expect(d.faults).toEqual([]);
  return Object.fromEntries(questions.map((q) => [q, askSettled(d, q, fmtAnalytic).value]));
}

/** Every line but the last records, and the last is refused — returned. */
function lastRefused(lines: readonly string[], seed = 0): InputError {
  for (let i = 0; i < lines.length - 1; i += 1) expect(decideSubmit(lines[i], lines.slice(0, i), seed).kind).toBe('record');
  const v = decideSubmit(lines[lines.length - 1], lines.slice(0, -1), seed);
  expect(v.kind, `«${lines[lines.length - 1]}»`).toBe('refused');
  return (v as { error: InputError }).error;
}

const ELLIPSE = 'נתונה אליפסה שמשוואתה x^2/4+y^2/3=1';
const AT_X_MINUS_1 = 'הישר x=-1 חותך את האליפסה בנקודות A ו-B';
const AT_Y_1 = 'הישר y=1 חותך את האליפסה בנקודות A ו-B';

describe('#2732 — the operator’s lines (fixture)', () => {
  it.each([0, 1, 2])('seed %i: «A» and «B» are the one stated point each, «AB» is 3', (seed) => {
    expect(answers(operator.lines, ['A', 'B', 'AB'], seed)).toEqual({ A: '(-1, 3/2)', B: '(-1, -3/2)', AB: '3' });
  });

  it('«y_A > y_B» reads the same', () => {
    expect(answers([ELLIPSE, AT_X_MINUS_1, 'y_A > y_B'], ['A', 'B'])).toEqual({ A: '(-1, 3/2)', B: '(-1, -3/2)' });
  });

  it('English reads the same', () => {
    const lines = ['ellipse x^2/4+y^2/3=1', 'the line x=-1 cuts the ellipse at points A and B', 'A is above B'];
    expect(answers(lines, ['A', 'B'])).toEqual({ A: '(-1, 3/2)', B: '(-1, -3/2)' });
  });

  it('the parabola: «A מעל B» answers A = (1, 2)', () => {
    const lines = ['y^2=4x', 'הישר x=1 חותך את הפרבולה בנקודות A ו-B', 'A מעל B'];
    expect(answers(lines, ['A', 'B'])).toEqual({ A: '(1, 2)', B: '(1, -2)' });
  });
});

describe('#2732 — the class: every position word, carrier and surface gives one answer', () => {
  it('«A מימין ל-B» on y=1', () => {
    expect(answers([ELLIPSE, AT_Y_1, 'A מימין ל-B'], ['A', 'B'])).toEqual({ A: '(2√6/3, 1)', B: '(-2√6/3, 1)' });
  });

  it('«x_A < x_B» on y=1', () => {
    expect(answers([ELLIPSE, AT_Y_1, 'x_A < x_B'], ['A', 'B'])).toEqual({ A: '(-2√6/3, 1)', B: '(2√6/3, 1)' });
  });

  it('«A ברביע הראשון»: B is the other crossing', () => {
    const lines = [ELLIPSE, 'הישר x=1 חותך את האליפסה בנקודות A ו-B', 'A ברביע הראשון'];
    expect(answers(lines, ['A', 'B'])).toEqual({ A: '(1, 3/2)', B: '(1, -3/2)' });
  });

  it('no order word: «AB» is 3, not «0 או 3»', () => {
    expect(answers([ELLIPSE, AT_X_MINUS_1], ['AB'])).toEqual({ AB: '3' });
  });

  it('the y-axis crossings: «AB» is 2√3', () => {
    expect(answers([ELLIPSE, 'ציר ה-y חותך את האליפסה בנקודות A ו-B', 'A מעל B'], ['A', 'AB'])).toEqual({ A: '(0, √3)', AB: '2√3' });
  });

  it('a parabola with y=x−1: «AB» is 8 and «שיפוע AB» answers its one slope', () => {
    expect(answers(['y^2=4x', 'הישר y=x-1 חותך את הפרבולה בנקודות A ו-B'], ['AB', 'שיפוע AB'])).toEqual({ AB: '8', 'שיפוע AB': '1' });
  });

  it('«M אמצע AB» on y²=4x with x=1 answers (1, 0)', () => {
    expect(answers(['y^2=4x', 'הישר x=1 חותך את הפרבולה בנקודות A ו-B', 'M אמצע AB'], ['M'])).toEqual({ M: '(1, 0)' });
  });

  it('«M אמצע AB» on the operator’s ellipse answers (-1, 0)', () => {
    expect(answers([...operator.lines, 'M אמצע AB'], ['M'])).toEqual({ M: '(-1, 0)' });
  });

  it('an off-origin circle', () => {
    const lines = ['(x-1)^2+(y-2)^2=9', 'הישר x=1 חותך את המעגל בנקודות A ו-B', 'A מעל B'];
    expect(answers(lines, ['A', 'B'])).toEqual({ A: '(1, 5)', B: '(1, -1)' });
  });
});

describe('#2732 — a line that touches the curve once names no two crossings', () => {
  const NO_CONFIGURATION = (s: string) => `לא נמצאה תצורה שבה מתקיים: «${s}»`;

  it('«הישר x=0 חותך את הפרבולה בנקודות K ו-L» is refused, as its circle twin is', () => {
    const line = 'הישר x=0 חותך את הפרבולה בנקודות K ו-L';
    const error = lastRefused(['y^2=4x', line]);
    expect(error).toMatchObject({ key: 'unsatisfiable' });
    expect(plain(errorText(error, he))).toContain(NO_CONFIGURATION(line));
  });

  it('control — the circle twin «הישר y=5 חותך את המעגל בנקודות K ו-L» is refused the same way', () => {
    const line = 'הישר y=5 חותך את המעגל בנקודות K ו-L';
    const error = lastRefused(['x^2+y^2=25', line]);
    expect(error).toMatchObject({ key: 'unsatisfiable' });
    expect(plain(errorText(error, he))).toContain(NO_CONFIGURATION(line));
  });
});

describe('#2732 — controls that were right stay right', () => {
  it('x²+y²=25: the centre kept the old ruler honest', () => {
    const lines = ['x^2+y^2=25', 'הישר x=3 חותך את המעגל בנקודות A ו-B', 'A מעל B'];
    expect(answers(lines, ['A', 'B', 'AB'])).toEqual({ A: '(3, 4)', B: '(3, -4)', AB: '8' });
  });

  it('two crossing circles', () => {
    const lines = ['נתון מעגל O שמשוואתו x^2+y^2=25', 'נתון מעגל P שמשוואתו (x-6)^2+y^2=25', 'המעגלים O ו-P נחתכים בנקודות A ו-B', 'A מעל B'];
    expect(answers(lines, ['A', 'B', 'AB'])).toEqual({ A: '(3, 4)', B: '(3, -4)', AB: '8' });
  });

  it('the reported figure with an unrelated P(5,5)', () => {
    expect(answers([...operator.lines, 'P(5,5)'], ['A', 'B'])).toEqual({ A: '(-1, 3/2)', B: '(-1, -3/2)' });
  });

  it('«p > 0»: p is free, so the crossing is honestly not known', () => {
    const lines = ['y^2=4px', 'p > 0', 'הישר x=1 חותך את הפרבולה בנקודות A ו-B', 'A מעל B'];
    expect(answers(lines, ['A', 'B'])).toEqual({ A: '(1, y_A)', B: '(1, y_B)' });
  });

  it('#1526: a coincidence the givens force (no distinct selector) still builds, Y on V', () => {
    expect(answers(['V(0,0)', 'X(4,0)', 'Y נמצאת על הישר y=x', 'שיעור ה-x של Y הוא 0'], ['Y'])).toEqual({ Y: '(0, 0)' });
  });
});
