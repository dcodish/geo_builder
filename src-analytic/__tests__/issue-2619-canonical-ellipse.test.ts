/**
 * THE CANONICAL CURVE STATED WITH NO EQUATION, AND THE MAJOR-AXIS CLAUSE (#2619 parts A and B,
 * [ADR-AG-354](../../docs/06c-decisions-analytic.md#adr-ag-354)). Operator, 2026-10-30: *"now we need to build all
 * capabilities"*; Q1 → A: «נתונה אליפסה קנונית» carries the book's letters, x²/a² + y²/b² = 1 (x² + y² = R² for a
 * canonical circle), shown in the givens list. Parts C and D (a curve introduced inside a relation; the through-list
 * and «היא») are #2619's remainder, not this item.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { paramRegister } from '../engine/carriers';
import { fmtAnalytic } from '../format';
import p18 from './fixtures/ellipse-book-p1-8-2616.analytic.json';
import p211 from './fixtures/ellipse-book-p2-11-2616.analytic.json';

function submit(lines: readonly string[]): Array<{ kind: string; key?: string }> {
  const accepted: string[] = [];
  return lines.map((line) => {
    const v = decideSubmit(line, accepted, 0) as { kind: string; error?: { key: string } };
    if (v.kind === 'record') accepted.push(line);
    return { kind: v.kind, key: v.error?.key };
  });
}
const last = (lines: readonly string[]) => submit(lines).at(-1)!;
const ellipseOf = (lines: readonly string[], seed = 0) => {
  const c = derive(lines, seed).figure.curves.find((q) => q.curve.kind === 'ellipse')?.curve;
  return c && c.kind === 'ellipse' ? c : null;
};
const curveObject = (lines: readonly string[]) => derive(lines, 0).construction.objects.find((o) => o.kind === 'curve');

describe('#2619 A — the canonical ellipse with no equation', () => {
  it.each([
    ['נתונה אליפסה קנונית'],
    ['אליפסה קנונית'],
    ['נתונה האליפסה הקנונית'],
    ['נתונה אליפסה שציריה הם צירי השיעורים'],
    ['a canonical ellipse'],
    ['an ellipse whose axes are the coordinate axes'],
  ])('«%s» records an ellipse x²/a² + y²/b² = 1, its sizes free and positive and moving between seeds', (line) => {
    expect(last([line]).kind).toBe('record');
    const o = curveObject([line]);
    expect(o && o.kind === 'curve' ? o.label.eqSrc : null).toBe('x^2/a^2+y^2/b^2=1');
    const d = derive([line], 0);
    for (const sym of ['a', 'b']) expect(paramRegister(d.construction).find((p) => p.sym === sym)?.domain.min).toBe(0);
    const sizes = new Set([0, 1, 2].map((seed) => ellipseOf([line], seed)!.a.toFixed(3)));
    expect(sizes.size).toBeGreaterThan(1);
  });

  it('a letter the figure already uses is replaced by the next free one', () => {
    const lines = ['A(a,0)', 'נתונה אליפסה קנונית'];
    expect(submit(lines).map((v) => v.kind)).toEqual(['record', 'record']);
    const o = curveObject(lines);
    expect(o && o.kind === 'curve' ? o.label.eqSrc : null).toBe('x^2/c^2+y^2/b^2=1');
  });

  it.each([['נתון מעגל קנוני'], ['נתון מעגל שמרכזו בראשית הצירים'], ['נתון מעגל שמרכזו בנקודה (0,0)'], ['a canonical circle']])(
    '«%s» records a circle on the origin with a free radius',
    (line) => {
      expect(last([line]).kind).toBe('record');
      const c = derive([line], 0).figure.curves.find((q) => q.curve.kind === 'circle')?.curve;
      expect(c && c.kind === 'circle' ? [c.cx, c.cy] : null).toEqual([0, 0]);
    },
  );
});

describe('#2619 B — the major-axis clause constrains the SEMI-AXES, never the signed letters', () => {
  it.each([
    ['נתונה אליפסה קנונית שהציר הגדול שלה על ציר ה-x', 'x'],
    ['נתונה אליפסה קנונית שהציר הגדול שלה הוא על ציר ה-y', 'y'],
    ['נתונה אליפסה שהציר הגדול שלה הוא על ציר ה-y', 'y'],
    ['נתונה אליפסה קנונית b²x²+a²y²=a²b² שהציר הגדול שלה על ציר ה-x', 'x'],
    ['נתונה אליפסה קנונית שהציר הקטן שלה על ציר ה-x', 'y'],
    ['a canonical ellipse whose major axis is on the y-axis', 'y'],
  ] as const)('«%s» keeps the major axis on %s at seeds 0–7', (line, axis) => {
    expect(last([line]).kind).toBe('record');
    for (let seed = 0; seed < 8; seed++) {
      const e = ellipseOf([line], seed)!;
      expect(axis === 'x' ? e.a > e.b : e.b > e.a, `seed ${seed}`).toBe(true);
    }
  });

  it('as its own sentence — «הציר הגדול של האליפסה נמצא על ציר ה-y» — after a parameterised ellipse', () => {
    const lines = ['נתונה אליפסה שמשוואתה x^2/a^2+y^2/b^2=1', 'הציר הגדול של האליפסה נמצא על ציר ה-y'];
    expect(submit(lines).map((v) => v.kind)).toEqual(['record', 'record']);
    for (let seed = 0; seed < 8; seed++) expect(ellipseOf(lines, seed)!.b > ellipseOf(lines, seed)!.a).toBe(true);
  });

  it('on a fixed ellipse: the true axis is accepted, the other refused naming the statement', () => {
    expect(last(['נתונה אליפסה שמשוואתה x^2/25+y^2/9=1', 'הציר הגדול של האליפסה על ציר ה-x']).kind).not.toBe('refused');
    expect(last(['נתונה אליפסה שמשוואתה x^2/25+y^2/9=1', 'הציר הגדול של האליפסה על ציר ה-y']).key).toBe('unsatisfiable');
  });

  it('p1-8 and p2-11, one point per sentence (the through-list is part D): the book\'s equations', () => {
    expect(submit(p18.lines).map((v) => v.kind)).toEqual(p18.lines.map(() => 'record'));
    expect(ask(derive(p18.lines, 0), 'משוואת האליפסה', fmtAnalytic).value).toBe('x²/12 + y²/8 = 1');
    expect(submit(p211.lines).map((v) => v.kind)).toEqual(p211.lines.map(() => 'record'));
    expect(ask(derive(p211.lines, 0), 'משוואת האליפסה', fmtAnalytic).value).toBe('x²/20 + y²/40 = 1');
  });
});
