/**
 * THE DRAWN TANGENT IN A SLOT THAT TAKES A LINE, AND NAMED (#2621 A, [ADR-AG-368](../../docs/06c-decisions-analytic.md#adr-ag-368)).
 * Operator, 2026-10-30: *"now we need to build all capabilities"* (the ellipse book, p4-24 ג). «המשיק למעגל בנקודה A» drew the
 * tangent and the ask lane read it, but no fact rule did: «שיפוע המשיק …» was `bad-operand` and «נסמן את המשיק ב-l»
 * `not-handled` — one noun, two resolvers. Every line slot now reads it through `readTangentNoun`, the one reader.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { errorText, type Translate } from '../app/errorText';
import { analyticI18n } from '../i18n';
import { fmtAnalytic } from '../format';
import p424 from './fixtures/ellipse-book-p4-24c-2621.analytic.json';

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
const lineAts = (lines: readonly string[]) => derive(lines, 0).construction.objects.filter((o) => o.kind === 'line-at');

const CIRCLE = ['נתון מעגל x^2+y^2=25', 'A נקודה על המעגל'];
/** The tangent's slope at the drawn A, read off the figure. */
function tangentSlope(lines: readonly string[], seed: number): number {
  const A = derive(lines, seed).figure.points.find((p) => p.id === 'A')!;
  return -A.x / A.y;
}

describe('#2621 A — the tangent as an operand', () => {
  it('«שיפוע המשיק למעגל בנקודה A הוא …» builds the tangent and pins A, at every seed', () => {
    const lines = [...CIRCLE, 'שיפוע המשיק למעגל בנקודה A הוא -3/4'];
    expect(kinds(lines)).toEqual(['record', 'record', 'record']);
    for (let seed = 0; seed < 8; seed++) expect(tangentSlope(lines, seed)).toBeCloseTo(-3 / 4, 6);
    // One line: the slope sentence restates the tangent it names, never a second.
    expect(lineAts([...CIRCLE, 'המשיק למעגל בנקודה A', 'שיפוע המשיק למעגל בנקודה A הוא -3/4'])).toHaveLength(1);
  });

  it('every spelling reads the same fact as «שיפוע l הוא …» on the named form', () => {
    const named = [...CIRCLE, 'המשיק למעגל בנקודה A', 'נסמן את המשיק ב-l', 'שיפוע l הוא -3/4'];
    const spellings = [
      [...CIRCLE, 'המשיק למעגל בנקודה A', 'שיפוע המשיק למעגל בנקודה A הוא -3/4'],
      [...CIRCLE, 'המשיק למעגל בנקודה A', 'שיפוע המשיק בנקודה A הוא -3/4'],
      [...CIRCLE, 'המשיק למעגל בנקודה A', 'שיפוע המשיק הוא -3/4'],
      [...CIRCLE, 'המשיק למעגל בנקודה A', 'the slope of the tangent at A is -3/4'],
      named,
    ];
    for (const lines of spellings) {
      expect(kinds(lines)).toEqual(lines.map(() => 'record'));
      const slopes = derive(lines, 0).construction.constraints.filter((k) => k.t === 'slope');
      expect(slopes).toHaveLength(1);
      expect(slopes[0]).toMatchObject({ u: { k: 'curve', id: 'tangent-A' } });
      for (let seed = 0; seed < 8; seed++) expect(tangentSlope(lines, seed)).toBeCloseTo(-3 / 4, 6);
    }
  });

  it('∥, ⊥ and the slope sign read the tangent too', () => {
    const base = ['נתון מעגל x^2+y^2=25', 'A(3,4)', 'המשיק למעגל בנקודה A'];
    // The relation draws BC (its operand's own noun, #1639), so the line records; the tangent's direction is the one it copies.
    expect(last([...base, 'B(0,0)', 'C(4,-3)', 'BC מקביל למשיק']).kind).toBe('record');
    expect(last([...base, 'B(1,1)', 'C(5,4)', 'BC מקביל למשיק']).error?.key).toBe('unsatisfiable');
    expect(last([...base, 'שיפוע המשיק שלילי']).kind).toBe('record');
    expect(last([...base, 'שיפוע המשיק חיובי']).kind).toBe('refused');
    expect(last([...base, 'P(0,0)', 'דרך P עובר ישר מקביל למשיק בנקודה A']).kind).toBe('record');
  });

  it('bare «המשיק» with none or two tangents is the «המשיק» reference refusal, never a pick, and names no tool id', () => {
    const none = last(['נתון מעגל x^2+y^2=25', 'שיפוע המשיק הוא 2']);
    expect(none.error?.key).toBe('ambiguous-shape');
    const two = last(['נתון מעגל x^2+y^2=25', 'A(3,4)', 'B(-3,4)', 'המשיק למעגל בנקודה A', 'המשיק למעגל בנקודה B', 'שיפוע המשיק הוא 2']);
    expect(two.error?.key).toBe('ambiguous-shape');
    // Found in round: the candidates listed the tool's ids («הישר tangent-A»); an unnamed tangent has no name to offer.
    expect(text(two)).not.toContain('tangent-');
    expect(text(last(['נתון מעגל x^2+y^2=25', 'A(3,4)', 'B(-3,4)', 'המשיק למעגל בנקודה A', 'המשיק למעגל בנקודה B', 'P על המשיק']))).not.toContain('tangent-');
  });
});

describe('#2621 A — the tangent named', () => {
  const base = ['נתון מעגל x^2+y^2=25', 'A(3,4)', 'המשיק למעגל בנקודה A'];

  it('«נסמן את המשיק ב-l» names the drawn tangent: one line, l resolves to it, the tangent noun still does', () => {
    for (const naming of ['נסמן את המשיק ב-l', 'נסמן את המשיק למעגל בנקודה A ב-l', 'נסמן ב-l את המשיק', 'denote the tangent by l']) {
      const lines = [...base, naming];
      expect(kinds(lines)).toEqual(lines.map(() => 'record'));
      const ats = lineAts(lines);
      expect(ats).toHaveLength(1);
      expect(ats[0]).toMatchObject({ id: 'tangent-A', name: 'l' });
      expect(ask(derive(lines, 0), 'משוואת המשיק למעגל בנקודה A', fmtAnalytic).value).toBe(ask(derive(base, 0), 'משוואת המשיק למעגל בנקודה A', fmtAnalytic).value);
      expect(last([...lines, 'שיפוע l הוא -3/4']).kind).toBe('already-follows');
      expect(last([...lines, 'P על המשיק בנקודה A']).kind).toBe('record');
    }
  });

  it('a second name is refused naming the first, as for every line', () => {
    expect(last([...base, 'נסמן את המשיק ב-l', 'נסמן את המשיק ב-l2']).error?.key).toBe('already-named');
  });

  it('«l הוא המשיק למעגל בנקודה A» / «הישר l משיק למעגל בנקודה A» with no tangent drawn state it, named l', () => {
    for (const s of ['l הוא המשיק למעגל בנקודה A', 'הישר l משיק למעגל בנקודה A', 'l is the tangent to the circle at A']) {
      const lines = ['נתון מעגל x^2+y^2=25', 'A(3,4)', s];
      expect(kinds(lines)).toEqual(['record', 'record', 'record']);
      const ats = lineAts(lines);
      expect(ats).toHaveLength(1);
      expect(ats[0]).toMatchObject({ id: 'tangent-A', name: 'l' });
      expect(last([...lines, 'שיפוע l הוא -3/4']).kind).toBe('already-follows');
    }
  });

  it('…and after the unnamed tangent it is ADR-AG-346\'s refusal, offering the naming sentence that records', () => {
    const v = last([...base, 'l הוא המשיק למעגל בנקודה A']);
    expect(v.error?.key).toBe('line-exists');
    expect(v.error?.offer).toBe('נסמן את המשיק בנקודה A ב-l');
    expect(kinds([...base, 'נסמן את המשיק בנקודה A ב-l'])).toEqual(['record', 'record', 'record', 'record']);
    expect(lineAts([...base, 'הישר l משיק למעגל בנקודה A'])).toHaveLength(1);
  });

  it('a named line the figure has keeps its reading: «הישר l משיק …» is a statement about l', () => {
    const lines = ['נתון מעגל x^2+y^2=25', 'נתון ישר l: 3x+4y=25', 'הישר l משיק למעגל בנקודה A'];
    expect(kinds(lines)).toEqual(['record', 'record', 'record']);
    expect(lineAts(lines)).toHaveLength(0);
  });

  it('the book\'s p4-24 ג: the circle and the ellipse meet at A in the first quadrant, the tangent\'s slope is -16/9', () => {
    expect(kinds(p424.lines)).toEqual(p424.lines.map(() => 'record'));
    for (let seed = 0; seed < 4; seed++) {
      const A = derive(p424.lines, seed).figure.points.find((p) => p.id === 'A')!;
      expect(A.x).toBeCloseTo(3.2, 6);
      expect(A.y).toBeCloseTo(1.8, 6);
    }
  });
});
