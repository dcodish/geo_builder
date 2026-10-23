/**
 * #2222 (ADR-AG-284, operator ruling 2026-10-16) — an ASCII mixed number «5 1/2» is REFUSED, never multiplied.
 *
 * Measured at ef78f15c: juxtaposition read «5 1/2» as 5·1/2 = 2.5 in every numeric slot, silently, and the figure for
 * the wrong value was drawn green; three spellings reached the model instead. The ruling: *"if the user used a symbol
 * of 1/2 so yes - it should be 5.5. otherwise we should reject a 5 1/2 syntax and teach to either use decimal or
 * 5+1/2 or 5*1/2"*. One detector (`engine/expr.findMixedNumber`): the tokenizer refuses the shape, and `parseLine`
 * answers it before every rule and before the model.
 */
import { describe, expect, it } from 'vitest';
import { constValue, evalExpr, findMixedNumber, parseExpr, type Expr } from '../engine/expr';
import { parseLine } from '../parser/parseAnalytic';
import { decideSubmit, reachesFallback } from '../app/submit';
import { runFallback } from '../app/fallback';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { derive } from '../engine/derive';
import bagrut from './fixtures/issue-2222-mixed-number-glyph.analytic.json';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

/** Every slot the issue measured multiplying (or reaching the model), with the mixed number as typed. */
const SLOTS: readonly [string, string][] = [
  ['שיעור ה-y של P הוא 5 1/2', '5 1/2'],
  ['שיעור ה-x של P הוא 2 1/2', '2 1/2'],
  ['A(5 1/2, 3)', '5 1/2'],
  ['A(5 1/2;3)', '5 1/2'],
  ['x = 3 1/2', '3 1/2'],
  ['y = 2 1/2x + 1', '2 1/2'],
  ['רדיוס המעגל הוא 2 1/2', '2 1/2'],
  ['שטח המשולש ABC הוא 12 1/2', '12 1/2'],
  ['Y_p=5 1/2', '5 1/2'],
  ['משולש ABC ששטחו 12 1/2', '12 1/2'],
  ['P = (2 1/2, 1)', '2 1/2'],
  ['x² + y² = 6 1/4', '6 1/4'],
  ['A(5 1 / 2, 3)', '5 1 / 2'],
  ['the y-coordinate of P is 5 1/2', '5 1/2'],
];

describe('#2222 — an ASCII mixed number is refused in every analytic slot, before the model', () => {
  it.each(SLOTS)('«%s» → mixed-number, naming «%s»', (line, text) => {
    const r = parseLine(line);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('mixed-number');
      expect(r.detail).toBe(text);
    }
    const v = decideSubmit(line, [], 0);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') expect(v.error.key).toBe('mixed-number');
    // the refusal is OWNED, so the line never reaches the paid model (which could re-multiply it)
    expect(reachesFallback(v)).toBe(false);
  });

  it('also refused on a figure that already holds the point', () => {
    const v = decideSubmit('שיעור ה-y של P הוא 5 1/2', ['P(1,2)'], 0);
    expect(v.kind === 'refused' && v.error.key).toBe('mixed-number');
  });

  it('a model line carrying one is rejected by the same gate (the fallback re-decides every step)', async () => {
    const out = await runFallback('נקודה P ששיעור ה-y שלה חמש וחצי', [], 0, async () => ({ steps: ['שיעור ה-y של P הוא 5 1/2'] }));
    // #1355 (ADR-AG-279): every rejected outcome carries the model's whole answer (logged with the refusal)
    expect(out).toEqual({ kind: 'rejected', refusedStep: 'שיעור ה-y של P הוא 5 1/2', code: 'mixed-number', answer: ['שיעור ה-y של P הוא 5 1/2'] });
  });

  it('the teaching sentence names the student’s text and the three spellings, Hebrew and English', () => {
    const v = decideSubmit('שיעור ה-y של P הוא 5 1/2', [], 0);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(errorText(v.error, t)).toBe('לא ברור אם «5 1/2» הוא מספר מעורב או מכפלה. כתבו 5.5 (מספר עשרוני) או 5+1/2 למספר המעורב, או 5*1/2 למכפלה.');
    expect(errorText(v.error, tEn)).toBe('«5 1/2» could be a mixed number or a product. Write 5.5 (a decimal) or 5+1/2 for the mixed number, or 5*1/2 for the product.');
  });

  it('a fraction that does not terminate offers no decimal', () => {
    const v = decideSubmit('A(2 1/3, 3)', [], 0);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(errorText(v.error, t)).toBe('לא ברור אם «2 1/3» הוא מספר מעורב או מכפלה. כתבו 2+1/3 למספר המעורב, או 2*1/3 למכפלה.');
  });

  it('after an operator the sum is parenthesised, so it reads the same in place', () => {
    expect(findMixedNumber('y = x - 2 1/2')).toEqual({ text: '2 1/2', decimal: '2.5', sum: '(2+1/2)', product: '2*1/2' });
    expect(findMixedNumber('A(-5 1/2, 3)')).toEqual({ text: '5 1/2', decimal: '5.5', sum: '(5+1/2)', product: '5*1/2' });
    expect(findMixedNumber('A(5 1/2, 3)')).toEqual({ text: '5 1/2', decimal: '5.5', sum: '5+1/2', product: '5*1/2' });
  });

  it('every teaching spelling is one the tool reads, to the intended value', () => {
    for (const src of ['5 1/2', '2 1/3', '6 1/4']) {
      const m = findMixedNumber(src)!;
      const [w, n, d] = src.split(/[\s/]+/).map(Number);
      expect(constValue(m.sum)).toBeCloseTo(w + n / d, 12);
      expect(constValue(m.product)).toBeCloseTo((w * n) / d, 12);
      if (m.decimal) expect(constValue(m.decimal)).toBe(w + n / d);
    }
  });

  it('the tokenizer itself refuses the shape — no reader of a value can multiply it', () => {
    expect(parseExpr('5 1/2')).toBeNull();
    expect(parseExpr('2 1/2x + 1')).toBeNull();
    expect(parseExpr('x - 2 1/2')).toBeNull();
  });
});

describe('#2222 — the twins are unchanged', () => {
  /** The value a coordinate slot recorded, evaluated. */
  const pointX = (line: string): number => {
    const r = parseLine(line);
    if (!r.ok) return NaN;
    const pt = r.facts.find((f) => f.t === 'point') as { x: Expr } | undefined;
    return pt ? evalExpr(pt.x) : NaN;
  };
  const coordY = (line: string): number => {
    const r = parseLine(line);
    if (!r.ok) return NaN;
    const c = r.facts.find((f) => f.t === 'constraint' && (f as { k: { t: string } }).k.t === 'coord') as { k: { y: Expr } } | undefined;
    return c ? evalExpr(c.k.y) : NaN;
  };

  it.each([
    ['5½', 5.5],
    ['5 ½', 5.5],
    ['5¼', 5.25],
    ['5¾', 5.75],
    ['5.5', 5.5],
    ['5+1/2', 5.5],
    ['5*1/2', 2.5],
    ['11/2', 5.5],
  ])('A(%s, 3) reads x = %d', (value, expected) => {
    expect(pointX(`A(${value}, 3)`)).toBe(expected);
  });

  it.each([
    ['5½', 5.5],
    ['5+1/2', 5.5],
    ['5*1/2', 2.5],
    ['5.5', 5.5],
    ['11/2', 5.5],
  ])('«שיעור ה-y של P הוא %s» reads %d — the reported sentence in its unambiguous spellings', (value, expected) => {
    expect(coordY(`שיעור ה-y של P הוא ${value}`)).toBe(expected);
  });

  it('juxtaposition with a symbol is unchanged: 2x, 1/2x, 2 x', () => {
    expect(evalExpr(parseExpr('2x')!, { x: 3 })).toBe(6);
    expect(evalExpr(parseExpr('1/2x')!, { x: 3 })).toBe(1.5);
    expect(evalExpr(parseExpr('2 x')!, { x: 3 })).toBe(6);
    expect(parseLine('y = 1/2x + 1').ok).toBe(true);
  });

  it('⅓ keeps its current verdict (not-handled — no glyph table change under this issue)', () => {
    const r = parseLine('A(5⅓, 3)');
    expect(r.ok === false && r.code).toBe('not-handled');
  });

  it('an indexed name or a decimal before a fraction is not a whole part', () => {
    expect(findMixedNumber('A1 1/2')).toBeNull();
    expect(findMixedNumber('5.5 1/2')).toBeNull();
  });
});

describe('#2222 — the reported bagrut question (fixture), glyph and ASCII', () => {
  const at = (lines: readonly string[], seed: number) => {
    const d = derive(lines, seed);
    const pt = (id: string) => d.figure.points.find((p) => p.id === id)!;
    return { d, pt };
  };

  it('with the glyphs «12½» and «5½» it draws the official answer: B, C = (7;8), (4.5;5.5)', () => {
    for (const seed of [0, 1]) {
      const { d, pt } = at(bagrut.lines, seed);
      expect(d.faults).toEqual([]);
      const bc = [pt('B'), pt('C')].map((p) => [p.x, p.y]).sort((u, v) => v[0] - u[0]);
      expect(bc[0][0]).toBeCloseTo(7, 6);
      expect(bc[0][1]).toBeCloseTo(8, 6);
      expect(bc[1][0]).toBeCloseTo(4.5, 6);
      expect(bc[1][1]).toBeCloseTo(5.5, 6);
      expect(pt('P').y).toBeCloseTo(5.5, 6);
    }
  });

  it('typed «5 1/2» and «12 1/2» in ASCII, each line is refused (never drawn as 2.5 and 6)', () => {
    const ascii = bagrut.lines.map((l) => l.replace('12½', '12 1/2').replace('5½', '5 1/2'));
    const { d } = at(ascii, 0);
    expect(d.faults.map((f) => [f.index, f.code])).toEqual([
      [5, 'mixed-number'],
      [6, 'mixed-number'],
    ]);
  });
});
