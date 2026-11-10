/**
 * THE ASK LANE (#1027).
 *
 * Operator, 2026-09-15: *"data panel should have a data entry option to query sizes and equations"*,
 * and 02c R23–R27 specified it long before: two surfaces, one grammar.
 *
 * The "one grammar" half is what these assert hardest — a thing is askable BECAUSE it was sayable,
 * so neither surface grows a vocabulary the other does not have.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask, figureIsOpen } from '../app/ask';

const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2));
const answer = (lines: string[], question: string) => ask(derive(lines, 0), question, fmt);

const SQUARE_ISH = ['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC'];

describe('#1027 — the panel answers a question, and changes nothing', () => {
  it('a LENGTH the figure determines', () => {
    expect(answer(SQUARE_ISH, 'AB').value).toBe('4');
    expect(answer(SQUARE_ISH, 'BC').value).toBe('5');
  });

  it('an AREA, through the same grammar as «שטח ABC גדול פי 3…»', () => {
    expect(answer(SQUARE_ISH, 'שטח ABC').value).toBe('6');
    expect(answer(SQUARE_ISH, 'שטח המשולש ABC').value).toBe('6');
  });

  it('an EXPRESSION over measures, because that is what the grammar already parses', () => {
    // Askable because it was sayable. Neither surface has a vocabulary of its own.
    expect(answer(SQUARE_ISH, 'AB + BC').value).toBe('9');
    expect(answer(SQUARE_ISH, '2AB').value).toBe('8');
  });

  it('a POINT’s coordinates', () => {
    expect(answer(SQUARE_ISH, 'B').value).toBe('(4, 0)');
  });

  it('a CURVE’s equation', () => {
    /**
     * It asserted `kind:line` until #1212 — the output of the STUB this file injected, not an
     * equation at all. The formatter is imported now, so the case named "a curve's equation"
     * finally checks one.
     */
    expect(answer(['נתון הישר ℓ1: y=2x'], 'משוואת הישר ℓ1').value).toBe('-2x + y = 0');
  });

  it('and it never touches the figure', () => {
    // The whole contract of an ask (02c R23): evaluated against the figure and discarded.
    const d = derive(SQUARE_ISH, 0);
    const before = JSON.stringify(d.construction);
    ask(d, 'AB', fmt);
    expect(JSON.stringify(d.construction)).toBe(before);
  });
});

describe('#1027 — an answer passes the same honesty gate as a row', () => {
  it('a length the givens have NOT fixed has no value', () => {
    const a = answer(['משולש ABC'], 'AB');
    expect(a.value).toBeNull();
    expect(a.unreadable).toBeUndefined();
  });

  it('and the figure’s openness is what decides HOW that is worded', () => {
    // "Not determined yet" and "cannot be computed" are different situations, and a student who is
    // told the wrong one goes looking in the wrong place.
    expect(figureIsOpen(derive(['משולש ABC'], 0))).toBe(true);
    expect(figureIsOpen(derive(SQUARE_ISH, 0))).toBe(false);
  });

  it('a question about something the figure does not have is NAMED, not called incomprehensible (#1111)', () => {
    /**
     * This case asserted the opposite until #1111, and the operator is why it changed: «מרחק של C
     * מ-AB» on a figure with no C answered *I did not understand the question*, when the sentence was
     * understood perfectly and it was the FIGURE that had no C. A student told their sentence is
     * unreadable rewrites the sentence for ever.
     *
     * So "the figure does not have it" and "I could not read it" are now two answers, and the first
     * one carries the letter. What remains UNREADABLE is what genuinely is.
     */
    expect(answer(SQUARE_ISH, 'XY').missing).toEqual({ name: 'X', kind: 'point' });
    expect(answer(SQUARE_ISH, 'Z').missing).toEqual({ name: 'Z', kind: 'point' });
    expect(answer(SQUARE_ISH, 'XY').unreadable).toBeFalsy();

    expect(answer(SQUARE_ISH, 'שלום').unreadable).toBe(true);
    expect(answer(SQUARE_ISH, '').unreadable).toBe(true);
    expect(answer(SQUARE_ISH, 'שלום').missing).toBeUndefined();
  });
});

/** #2735 (ADR-AG-458, option C 2026-11-09): the question box answers in the letter where the panel does. */
describe('#2735 — the question box answers in the parameter', () => {
  const Q16 = ['x²/(25k²) + y²/(16k²) = 1', 'k > 0', 'F הוא המוקד הימני של האליפסה', 'E היא נקודת החיתוך של האליפסה עם החלק החיובי של ציר ה-x', 'נתון מעגל שמרכזו F', 'המעגל עובר דרך E'];
  it.each([
    ['מהם שיעורי F?', '(3k, 0)'],
    ['הביעו באמצעות k את שיעורי הנקודה F', '(3k, 0)'],
    ['הביעו באמצעות k את משוואת המעגל', '(x − 3k)² + y² = (2k)²'],
    ['FE', '2k'],
  ])('«%s» → «%s»', (q, value) => {
    expect(answer(Q16, q).value).toBe(value);
  });

  it('with no sign on k, |AB| = 2√5·|k| is not one monomial and prints no form; with k > 0 it reads', () => {
    expect(answer(['A(2k,0)', 'B(0,4k)'], 'AB').value).toBeNull();
    expect(answer(['k > 0', 'A(2k,0)', 'B(0,4k)'], 'AB').value).toBe('4.47k'); // this file's own formatter; the page's prints 2√5k
  });

  it('a conic the givens fix only in k answers its roles in k: focus, directrix, foci, radius, axis', () => {
    const P = ['נתונה הפרבולה y^2 = 8kx'];
    expect(answer(P, 'שיעורי המוקד').value).toBe('(2k, 0)');
    expect(answer(P, 'הביעו באמצעות k את משוואת מדריך הפרבולה').value).toBe('x = -2k');
    const E = ['x²/(25k²) + y²/(16k²) = 1', 'k > 0', 'נתון מעגל שמרכזו (3k,0) ורדיוסו 2k'];
    expect(answer(E, 'שיעורי המוקדים').value).toBe('(3k, 0), (-3k, 0)');
    expect(answer(E, 'אורך הרדיוס').value).toBe('2k');
    expect(answer(E, 'אורך הציר הראשי').value).toBe('10k');
  });

  it('a DETERMINED figure has no parameter: its letters are unknowns the givens pin, never answered in (round #2822)', () => {
    // the book's p2-15: three ellipses, a and b pinned to three roots — never «x²/a² + y²/b² = 1»
    const lines = ['נתונה אליפסה שציריה הם צירי השיעורים', 'F1 ו-F2 מוקדי האליפסה', 'נתון ישר l המקביל לציר ה-x', 'הישר l חותך את האליפסה בנקודות A ו-B', 'AB=8', 'AF1=6', 'AF2=10'];
    expect(answer(lines, 'משוואת האליפסה').value ?? '').not.toMatch(/a²|b²/);
  });

  it('«הביעו באמצעות k את שיעורי הנקודות F1 ו-F2» answers each focus', () => {
    const a = answer(['x²/144 + y²/(144 − 4k²) = 1', '0 < k < 6', 'F1 הוא המוקד הימני של האליפסה', 'F2 הוא המוקד השמאלי של האליפסה'], 'הביעו באמצעות k את שיעורי הנקודות F1 ו-F2');
    expect(a.parts?.map((p) => p.value)).toEqual(['(2k, 0)', '(-2k, 0)']);
  });
});
