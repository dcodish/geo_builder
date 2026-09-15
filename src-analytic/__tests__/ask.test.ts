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
import type { NumCurve } from '../engine/types';

const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2));
const describeCurve = (_name: string, c: NumCurve) => `kind:${c.kind}`;
const answer = (lines: string[], question: string) => ask(derive(lines, 0), question, fmt, describeCurve);

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
    expect(answer(['נתון הישר ℓ1: y=2x'], 'משוואת הישר ℓ1').value).toBe('kind:line');
  });

  it('and it never touches the figure', () => {
    // The whole contract of an ask (02c R23): evaluated against the figure and discarded.
    const d = derive(SQUARE_ISH, 0);
    const before = JSON.stringify(d.construction);
    ask(d, 'AB', fmt, describeCurve);
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

  it('a question about something the figure does not have is UNREADABLE, not unanswered', () => {
    expect(answer(SQUARE_ISH, 'XY').unreadable).toBe(true);
    expect(answer(SQUARE_ISH, 'Z').unreadable).toBe(true);
    expect(answer(SQUARE_ISH, 'שלום').unreadable).toBe(true);
    expect(answer(SQUARE_ISH, '').unreadable).toBe(true);
  });
});
