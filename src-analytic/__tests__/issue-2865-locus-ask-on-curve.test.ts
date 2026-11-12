/**
 * #2865 ([ADR-AG-477](../../docs/06c-decisions-analytic.md#adr-ag-477)) — ASKING THE LOCUS OF A POINT ON A GIVEN CURVE
 * ANSWERS THAT ITS LOCUS IS THE CURVE ITSELF.
 *
 * Since #2849 (ADR-AG-472) a point stated on a curve that holds still has no «הצג מקום גאומטרי» chip, but the typed
 * «המקום הגיאומטרי של A» still answered «…מציגים בכפתור «הצג מקום גאומטרי» שליד הנקודה…», pointing at a button that is
 * not there. Operator, 2026-11-12 (Rulings Inbox, option (b)): answer «A נמצאת על האליפסה — המקום הגאומטרי שלה הוא העקום
 * עצמו.», the curve named as the givens name it.
 *
 * pipeline-lock: the regression is the WORDED ANSWER of the ask lane (`decideSubmit` → `derive` → `askSettled` → the row's
 * sentence). The figure built green before the fix too, so the fixtures net (which asserts only that a figure builds)
 * cannot see it.
 */
import { describe, expect, it } from 'vitest';
import { askSettled, type Answer } from '../app/ask';
import { carrierText, type Translate } from '../app/errorText';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import { analyticI18n } from '../i18n';

const he = analyticI18n.getFixedT('he') as unknown as Translate;
const en = analyticI18n.getFixedT('en') as unknown as Translate;
/** The i18n layer isolates every LTR run (the bidi wiring); the words are what is locked here. */
const plain = (s: string | null) => s && s.replace(/[⁦-⁩]/g, '');

function asked(lines: readonly string[], question: string, seed = 0): Answer {
  const held: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, held, seed);
    expect(v.kind, `«${line}» at seed ${seed}`).toBe('record');
    held.push(v.kind === 'record' ? v.line : line);
  }
  return askSettled(derive(held, seed), question, fmtAnalytic);
}

/** The row's sentence, as `App.tsx`'s `answerBody` words an `onCarrier` answer. */
const worded = (a: Answer, t: Translate) =>
  plain(a.onCarrier ? t('askLocusIsCarrier', { point: a.onCarrier.point, curve: carrierText(a.onCarrier.carrier, t) }) : null);

const CHORD = ['x^2+2y^2=16', 'AB מיתר באליפסה'];

describe("#2865 — the operator's figure", () => {
  it.each([0, 1, 2])('seed %i: «המקום הגיאומטרי של A» → A is on the ellipse, its locus is the curve itself', (seed) => {
    const a = asked(CHORD, 'המקום הגיאומטרי של A', seed);
    expect(a.chipOnly).toBeUndefined();
    expect(worded(a, he)).toBe('A נמצאת על האליפסה — המקום הגאומטרי שלה הוא העקום עצמו.');
    expect(worded(a, en)).toBe('A lies on the ellipse — its locus is the curve itself.');
  });

  it('B, the other end, the same', () => {
    expect(worded(asked(CHORD, 'המקום הגיאומטרי של B'), he)).toBe('B נמצאת על האליפסה — המקום הגאומטרי שלה הוא העקום עצמו.');
  });

  it('a named circle and a line by its equation are named as the givens name them', () => {
    expect(worded(asked(['נתון מעגל I שמשוואתו x^2+y^2=4', 'M על המעגל I'], 'המקום הגיאומטרי של M'), he)).toBe(
      'M נמצאת על המעגל I — המקום הגאומטרי שלה הוא העקום עצמו.',
    );
    expect(worded(asked(['y=x', 'P על הישר y=x'], 'המקום הגיאומטרי של P'), he)).toBe('P נמצאת על הישר y=x — המקום הגאומטרי שלה הוא העקום עצמו.');
  });

  it('a free point keeps the pointer; the bisector point keeps its pointer to its chip', () => {
    expect(asked(['נקודה P'], 'המקום הגיאומטרי של P').chipOnly).toBe(true);
    expect(asked(['A(0,0)', 'B(4,0)', 'נקודה M', 'MA = MB'], 'המקום הגיאומטרי של M').chipOnly).toBe(true);
  });
});
