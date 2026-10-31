/**
 * «היא עוברת דרך הנקודה …» — THE BOOK'S PRONOUN AS THE SUBJECT OF THE THROUGH-SENTENCE (#2619 part D,
 * [ADR-AG-362](../../docs/06c-decisions-analytic.md#adr-ag-362)). Operator, 2026-10-30: *"now we need to build all
 * capabilities"*. «היא» is the figure's ONE feminine curve (an ellipse or a parabola); none or several is the refusal
 * the noun gets there. ONE point per row ([ADR-W-167](../../docs/06w-decisions-workspace.md#adr-w-167)): the book's
 * «… דרך הנקודות (3,√2) ו-(√6,-2)» and the curve introduced inside a relation (part C) are compound lines, not built.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { errorText, type Translate } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { fmtAnalytic } from '../format';
import p18 from './fixtures/ellipse-book-p1-8-2619.analytic.json';
import p211 from './fixtures/ellipse-book-p2-11-2619.analytic.json';
import p424 from './fixtures/ellipse-book-p4-24-2619.analytic.json';

const he = analyticI18n.getFixedT('he') as unknown as Translate;
type V = { kind: string; error?: { key: string } & Record<string, unknown> };

function submit(lines: readonly string[]): V[] {
  const accepted: string[] = [];
  return lines.map((line) => {
    const v = decideSubmit(line, accepted, 0) as V;
    if (v.kind === 'record') accepted.push(line);
    return v;
  });
}
const kinds = (lines: readonly string[]) => submit(lines).map((v) => v.kind);
const last = (lines: readonly string[]) => submit(lines).at(-1)!;
const text = (v: V) => errorText(v.error as never, he).replace(/[⁦-⁩]/g, '');

describe('#2619 D — «היא» is the figure\'s one ellipse or parabola', () => {
  it('p1-8 in the book\'s words, one point per row, answers x²/12 + y²/8 = 1', () => {
    expect(kinds(p18.lines)).toEqual(p18.lines.map(() => 'record'));
    expect(ask(derive(p18.lines, 0), 'משוואת האליפסה', fmtAnalytic).value).toBe('x²/12 + y²/8 = 1');
  });

  it('p2-11 in the book\'s words, one point per row, answers x²/20 + y²/40 = 1', () => {
    expect(kinds(p211.lines)).toEqual(p211.lines.map(() => 'record'));
    expect(ask(derive(p211.lines, 0), 'משוואת האליפסה', fmtAnalytic).value).toBe('x²/20 + y²/40 = 1');
  });

  it('the pronoun and the noun state the same figure', () => {
    const noun = ['נתונה אליפסה קנונית', 'האליפסה עוברת דרך הנקודה (3,1)'];
    const pron = ['נתונה אליפסה קנונית', 'היא עוברת דרך הנקודה (3,1)'];
    for (let seed = 0; seed < 4; seed++) {
      const e = (lines: string[]) => derive(lines, seed).figure.curves.find((q) => q.curve.kind === 'ellipse')!.curve as { a: number; b: number };
      expect(e(pron).a).toBeCloseTo(e(noun).a, 9);
      expect(e(pron).b).toBeCloseTo(e(noun).b, 9);
    }
  });

  it('a lettered point and a parabola read too', () => {
    expect(kinds(['A(2,4)', 'נתונה אליפסה קנונית', 'היא עוברת דרך A'])).toEqual(['record', 'record', 'record']);
    expect(kinds(['נתונה פרבולה שמשוואתה y^2=2px', 'היא עוברת דרך הנקודה (2,4)'])).toEqual(['record', 'record']);
    expect(ask(derive(['נתונה פרבולה שמשוואתה y^2=2px', 'היא עוברת דרך הנקודה (2,4)'], 0), 'משוואת הפרבולה', fmtAnalytic).value).toBe('y² = 8x');
  });

  it('a circle is not «היא»: the ellipse beside it is the one meant', () => {
    expect(kinds(['נתון מעגל קנוני', 'נתונה אליפסה קנונית', 'היא עוברת דרך הנקודה (3,1)'])).toEqual(['record', 'record', 'record']);
  });

  it('with no ellipse or parabola it is refused as «האליפסה» is there', () => {
    const v = last(['נתון מעגל קנוני', 'היא עוברת דרך הנקודה (3,4)']);
    expect(v.kind).toBe('refused');
    expect(text(v)).toBe(text(last(['נתון מעגל קנוני', 'האליפסה עוברת דרך הנקודה (3,4)'])).replace('האליפסה עוברת', 'היא עוברת'));
  });

  it('with two ellipses it is refused as «האליפסה» is there, naming both', () => {
    const v = last(['נתונה אליפסה שמשוואתה x^2/16+y^2/9=1', 'נתונה אליפסה שמשוואתה x^2/25+y^2/9=1', 'היא עוברת דרך הנקודה (3,1)']);
    expect(v.kind).toBe('refused');
    expect(v.error?.key).toBe('ambiguous-shape');
    expect(text(v)).toContain('האליפסה x^2/16+y^2/9=1, האליפסה x^2/25+y^2/9=1');
  });

  it('with an ellipse and a parabola it is refused, each named by its own noun', () => {
    const v = last(['נתונה אליפסה שמשוואתה x^2/16+y^2/9=1', 'נתונה פרבולה שמשוואתה y^2=8x', 'היא עוברת דרך הנקודה (3,1)']);
    expect(v.error?.key).toBe('ambiguous-shape');
    expect(text(v)).toContain('האליפסה x^2/16+y^2/9=1, הפרבולה y^2=8x');
  });
});

describe('ADR-W-167 — the compound lines stay unread; their one-given rows build', () => {
  it.each([
    ['היא עוברת דרך הנקודות (3,√2) ו-(√6,-2)'],
    ['האליפסה עוברת דרך הנקודות (3,√2) ו-(√6,-2)'],
  ])('«%s» (two points in one line) is not read', (line) => {
    expect(last(['נתונה אליפסה קנונית', line]).error?.key).toBe('not-handled');
  });

  it.each([
    [['הנקודה (3,1) נמצאת על אליפסה שציריה הם צירי השיעורים'], ['נתונה אליפסה שציריה הם צירי השיעורים', 'הנקודה (3,1) נמצאת על האליפסה']],
    [['הנקודה (5/3,2) נמצאת על אליפסה קנונית שהציר הגדול שלה הוא על ציר ה-y'], ['נתונה אליפסה קנונית', 'הציר הגדול של האליפסה על ציר ה-y', 'הנקודה (5/3,2) נמצאת על האליפסה']],
    [['B(0,3)', 'D(0,-3)', 'נתונה אליפסה קנונית שעוברת דרך B ו-D'], ['B(0,3)', 'D(0,-3)', 'נתונה אליפסה קנונית', 'האליפסה עוברת דרך B', 'היא עוברת דרך D']],
  ])('%j is not read; its rows %j are', (compound, rows) => {
    expect(last(compound).error?.key).toBe('not-handled');
    for (const v of submit(rows)) expect(['record', 'already-follows']).toContain(v.kind);
  });

  it('p4-24 ג: the canonical circle and its crossing with the ellipse, one given per row', () => {
    expect(last(['נתונה אליפסה שמשוואתה x^2/16+y^2/9=1', 'מעגל קנוני חותך את האליפסה בנקודה A שנמצאת ברביע הראשון']).error?.key).toBe('not-handled');
    expect(kinds(p424.lines)).toEqual(p424.lines.map(() => 'record'));
  });
});
