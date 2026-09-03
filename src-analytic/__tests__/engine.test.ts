/**
 * The engine's core contracts. These are the tests that would catch the failures the plan named as
 * this product's predictable ones: a value printed that is really one sample's
 * ([ADR-052](../../docs/06-decisions.md#adr-052)), a domain treated as a branch selector (D7), and
 * a non-canonical conic mis-drawn instead of refused (docs/19 §2a).
 */
import { describe, expect, it } from 'vitest';
import { classify, fitConic } from '../engine/conic';
import { isOn, polylines, residual, resolveCurve, ellipseFoci, parabolaFocus } from '../engine/curves';
import { evaluate, isKnowledge, sampleParam, viewBox } from '../engine/evaluate';
import { constValue, evalExpr, parseExpr, symbolsOf } from '../engine/expr';
import { applyFact, fold } from '../engine/apply';
import { derive } from '../engine/derive';
import { inDomain, type Construction, type Fact } from '../engine/types';
import { equationExpr, parseLine } from '../parser/parseAnalytic';

const eq = (s: string) => {
  const e = equationExpr(s);
  if (!e) throw new Error(`not an equation: ${s}`);
  return e;
};

describe('expr — the numeric layer', () => {
  it('reads juxtaposition as multiplication, the way the exam writes it', () => {
    expect(evalExpr(parseExpr('2a')!, { a: 5 })).toBe(10);
    expect(evalExpr(parseExpr('25k^2')!, { k: 2 })).toBe(100);
    expect(evalExpr(parseExpr('2ax')!, { a: 3, x: 4 })).toBe(24);
  });

  it('binds √ tighter than multiplication: 4√5 is 4·√5, not √20', () => {
    expect(evalExpr(parseExpr('4√5')!, {})).toBeCloseTo(4 * Math.sqrt(5), 12);
  });

  it('normalizes the typeset forms a student cannot type', () => {
    expect(constValue('(3−1)²')).toBe(4); // U+2212 minus and a superscript
    expect(constValue('sqrt(9)')).toBe(3);
  });

  it('refuses malformed input rather than reading part of it', () => {
    expect(parseExpr('2 +')).toBeNull();
    expect(parseExpr('2 $ 3')).toBeNull();
    expect(parseExpr('(1+2')).toBeNull();
  });

  it('reports a missing symbol as NaN, never as a guessed zero', () => {
    expect(evalExpr(parseExpr('a+1')!, {})).toBeNaN();
    expect(symbolsOf(parseExpr('x^2/25k^2')!)).toEqual(['x', 'k']);
  });
});

describe('conic — the exact fit and the canonicity gate', () => {
  it('reads three spellings of one circle identically', () => {
    const forms = ['(x-3)^2+(y-4)^2=9', 'x^2+y^2-6x-8y+16=0', 'x^2-6x+y^2-8y+16=0'];
    for (const f of forms) {
      const r = classify(fitConic(eq(f), {})!);
      expect(r.ok).toBe(true);
      if (r.ok && r.curve.kind === 'circle') {
        expect(r.curve.cx).toBeCloseTo(3, 9);
        expect(r.curve.cy).toBeCloseTo(4, 9);
        expect(r.curve.r).toBeCloseTo(3, 9);
      } else throw new Error('not a circle');
    }
  });

  it('reads the canonical parabola y^2=2px', () => {
    const r = classify(fitConic(eq('y^2=54x'), {})!);
    expect(r.ok && r.curve.kind === 'parabola' && r.curve.p).toBeCloseTo(27, 9);
  });

  it('reads the canonical ellipse and orients its foci by the LONGER axis', () => {
    const wide = classify(fitConic(eq('x^2/25+y^2/9=1'), {})!);
    expect(wide.ok && wide.curve.kind === 'ellipse').toBe(true);
    if (wide.ok && wide.curve.kind === 'ellipse') {
      const [f1, f2] = ellipseFoci(wide.curve);
      expect(f1.x).toBeCloseTo(4, 9);
      expect(f1.y).toBe(0);
      expect(f2.x).toBeCloseTo(-4, 9);
    }
    // Foci on the y-axis when the major axis is vertical — the case a hard-coded a²−b² gets wrong.
    const tall = classify(fitConic(eq('x^2/9+y^2/25=1'), {})!);
    if (tall.ok && tall.curve.kind === 'ellipse') {
      const [f1] = ellipseFoci(tall.curve);
      expect(f1.x).toBe(0);
      expect(f1.y).toBeCloseTo(4, 9);
    } else throw new Error('not an ellipse');
  });

  it('REFUSES what twenty exams never contain, by name', () => {
    expect(classify(fitConic(eq('xy=1'), {})!)).toEqual({ ok: false, reason: 'rotated' });
    expect(classify(fitConic(eq('x^2/9-y^2/16=1'), {})!)).toEqual({ ok: false, reason: 'hyperbola' });
    // A translated ellipse: understood, and out of scope.
    expect(classify(fitConic(eq('(x-2)^2/9+y^2/16=1'), {})!)).toEqual({
      ok: false,
      reason: 'translated-conic',
    });
    // A parabola off the axis is the same refusal, not a mis-drawn canonical one.
    expect(classify(fitConic(eq('(y-1)^2=4x'), {})!)).toEqual({ ok: false, reason: 'translated-conic' });
  });

  it('carries a parameter through the fit', () => {
    const c = { kind: 'circle' as const, eq: eq('(x-a)^2+y^2=r^2') };
    const r = resolveCurve(c, { a: 5, r: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.curve.kind).toBe('circle');
      if (r.curve.kind === 'circle') {
        expect(r.curve.cx).toBeCloseTo(5, 9);
        expect(r.curve.r).toBeCloseTo(2, 9);
      }
    }
  });
});

describe('curves — residuals and drawing', () => {
  it('uses the true point–line distance', () => {
    const l = { kind: 'line' as const, a: 3, b: 4, c: 0 };
    expect(residual(l, 0, 0)).toBe(0);
    expect(residual(l, 4, 3)).toBeCloseTo(24 / 5, 9); // |12+12|/5
  });

  it('draws both arms of a parabola', () => {
    const pl = polylines({ kind: 'parabola', p: 2 }, { minX: -10, minY: -10, maxX: 10, maxY: 10 });
    const ys = pl[0].map(([, y]) => y);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(0);
    expect(pl[0].every(([x, y]) => isOn({ kind: 'parabola', p: 2 }, x, y, 1e-9))).toBe(true);
  });

  it('clips a line to the window instead of guessing a length', () => {
    const seg = polylines({ kind: 'line', a: 0, b: 1, c: 0 }, { minX: -5, minY: -5, maxX: 5, maxY: 5 });
    expect(seg).toHaveLength(1);
    expect(seg[0]).toHaveLength(2);
  });

  it('knows a canonical parabola s focus', () => {
    expect(parabolaFocus({ kind: 'parabola', p: 6 })).toEqual({ x: 3, y: 0 });
  });
});

describe('parameters — D7 kind 1 is a DOMAIN, not a constraint', () => {
  it('never samples outside the domain, at any seed', () => {
    const d = { min: 0, minOpen: true };
    for (let s = 0; s < 200; s += 1) expect(inDomain(d, sampleParam(d, s, 1))).toBe(true);
  });

  it('respects an open interval on both ends', () => {
    const d = { min: 0, minOpen: true, max: 6, maxOpen: true };
    for (let s = 0; s < 200; s += 1) {
      const v = sampleParam(d, s, 1);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(6);
    }
  });

  it('steps over an excluded value', () => {
    const d = { exclude: [0] };
    for (let s = 0; s < 200; s += 1) expect(sampleParam(d, s, 1)).not.toBe(0);
  });

  it('RESAMPLES with the seed — an unpinned parameter is a free DOF, never a default (ADR-052)', () => {
    const facts = lines(['a הוא פרמטר חיובי', 'A(-9a,0)']);
    const { construction } = fold(facts);
    const a0 = evaluate(construction, 0).points[0].x;
    const a1 = evaluate(construction, 1).points[0].x;
    expect(a0).not.toBeCloseTo(a1, 6);
  });
});

describe('knowledge — the gate that now carries the whole honesty boundary', () => {
  const withParam = fold(lines(['a הוא פרמטר חיובי', 'A(-9a,0)', 'B(3,4)'])).construction;

  it('refuses to call a parameter-dependent coordinate knowledge', () => {
    const k = isKnowledge(withParam, (f) => f.points.find((p) => p.id === 'A')?.x ?? null);
    expect(k.known).toBe(false);
  });

  it('calls a pinned coordinate knowledge, and reports its value', () => {
    const k = isKnowledge(withParam, (f) => f.points.find((p) => p.id === 'B')?.y ?? null);
    expect(k).toEqual({ known: true, value: 4 });
  });
});

describe('apply — the M1 boundary, on day one (ADR-AG-003)', () => {
  it('absorbs a restatement that agrees, without a duplicate row', () => {
    const first = fold(lines(['A(2,6)'])).construction;
    const again = parseLine('נתונה הנקודה A(2,6)');
    if (!again.ok) throw new Error('should parse');
    const out = applyFact(first, again.facts[0]);
    expect(out.ok && out.absorbed).toBe(true);
    expect(out.ok && out.next.points).toHaveLength(1);
  });

  it('absorbs a restatement written differently but meaning the same', () => {
    const first = fold(lines(['a הוא פרמטר', 'A(2a,0)'])).construction;
    const again = parseLine('A(a+a,0)');
    if (!again.ok) throw new Error('should parse');
    expect(applyFact(first, again.facts[0]).ok).toBe(true);
  });

  it('refuses a restatement that disagrees, naming the STATEMENT', () => {
    const first = fold(lines(['A(2,6)'])).construction;
    const other = parseLine('A(2,7)');
    if (!other.ok) throw new Error('should parse');
    const out = applyFact(first, other.facts[0]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe('conflicting-restatement');
      expect(out.error.detail).toBe('A(2,7)');
    }
  });

  it('sees one line written at two scalings as one line', () => {
    const first = fold(lines(['הישר l1: x+2y-3=0'])).construction;
    const again = parseLine('הישר l1: 2x+4y-6=0');
    if (!again.ok) throw new Error('should parse');
    expect(applyFact(first, again.facts[0]).ok).toBe(true);
  });

  it('narrows a parameter domain rather than treating the second given as a conflict', () => {
    const c = fold(lines(['a הוא פרמטר חיובי', 'a < 13'])).construction;
    expect(c.params).toHaveLength(1);
    expect(c.params[0].domain.min).toBe(0);
    expect(c.params[0].domain.max).toBe(13);
  });

  it('refuses a SECOND ellipse — the anonymous conics are one per figure (D6)', () => {
    const c = fold(lines(['נתונה אליפסה שמשוואתה x^2/9+y^2/16=1'])).construction;
    const second = parseLine('נתונה אליפסה שמשוואתה x^2/25+y^2/4=1');
    if (!second.ok) throw new Error('should parse');
    const out = applyFact(c, second.facts[0]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('conic-slot-taken');
  });
});

describe('view — the window the figure is drawn in', () => {
  it('is isotropic, so a circle never draws as an ellipse', () => {
    const c = fold(lines(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'])).construction;
    const b = viewBox(evaluate(c, 0));
    expect(b.maxX - b.minX).toBeCloseTo(b.maxY - b.minY, 9);
  });

  it('always contains the origin — the axes are the subject here', () => {
    const c = fold(lines(['נתון מעגל I שמשוואתו (x-30)^2+(y-30)^2=1'])).construction;
    const b = viewBox(evaluate(c, 0));
    expect(b.minX).toBeLessThanOrEqual(0);
    expect(b.minY).toBeLessThanOrEqual(0);
  });
});

/**
 * #896 — a non-canonical conic is REFUSED BY NAME, never silently dropped.
 *
 * `src-analytic/CLAUDE.md` states the contract: "No hyperbola, no rotated conic, no translated
 * conic … `engine/conic.ts` refuses each **by name**." The classifier always did. What was missing
 * was the WIRE: `resolveCurve` collapsed `ClassifyResult` to `NumCurve | null`, so the reason died
 * one line after it was computed, `evaluate` could only record an id, and `derive` had nothing to
 * report. The line committed, drew nothing and said nothing — a stated given vanishing, which the
 * root CLAUDE.md names as the thing this product may never do.
 *
 * The rows below are the measured table from the issue. The control matters as much as the
 * refusals: over-reporting would be the opposite defect.
 */
describe('#896 — a non-canonical conic is refused by name, not dropped', () => {
  const only = (src: string) => {
    const d = derive([src]);
    return { faults: d.faults, drawn: d.figure.curves.length, vacant: d.figure.vacant };
  };

  it('a TRANSLATED parabola is refused on its own line', () => {
    const r = only('נתונה פרבולה שמשוואתה (y-2)^2=8(x-1)');
    expect(r.drawn).toBe(0);
    expect(r.vacant.map((v) => v.reason)).toEqual(['translated-conic']);
    expect(r.faults).toEqual([
      { index: 0, code: 'out-of-scope', detail: 'נתונה פרבולה שמשוואתה (y-2)^2=8(x-1)' },
    ]);
  });

  it('a ROTATED conic is refused', () => {
    const r = only('נתונה אליפסה שמשוואתה x^2+xy+y^2=1');
    expect(r.drawn).toBe(0);
    expect(r.vacant.map((v) => v.reason)).toEqual(['rotated']);
    expect(r.faults.map((f) => f.code)).toEqual(['out-of-scope']);
  });

  it('a TRANSLATED ellipse is refused', () => {
    const r = only('נתונה אליפסה שמשוואתה (x-1)^2/9+y^2/16=1');
    expect(r.drawn).toBe(0);
    expect(r.faults.map((f) => f.code)).toEqual(['out-of-scope']);
  });

  it('THE CONTROL: a canonical conic still draws, with no fault', () => {
    const r = only('נתונה פרבולה קנונית שמשוואתה y^2=54x');
    expect(r.drawn).toBe(1);
    expect(r.faults).toEqual([]);
    expect(r.vacant).toEqual([]);
  });

  it('the refusal is blamed on the LINE THAT WROTE IT, not the last line typed', () => {
    const d = derive([
      'נתונה הנקודה A(2,6)',
      'נתונה אליפסה שמשוואתה x^2+xy+y^2=1',
      'נתון הישר l1: y=x',
    ]);
    expect(d.faults.map((f) => f.index)).toEqual([1]);
    // the honest lines still land — one refusal does not poison the figure
    expect(d.figure.points).toHaveLength(1);
    expect(d.figure.curves).toHaveLength(1);
  });

  it('a genuinely VACANT curve is NOT a fault — an empty circle at this parameter value', () => {
    // r² = −1 has no circle at this sample. The type calls that "not an error", the domain filter
    // needs to observe it, and reporting it as a refusal would be the opposite defect.
    const c = fold(lines(['משוואת המעגל x^2+y^2+1=0'])).construction;
    const f = evaluate(c, 0);
    expect(f.curves).toHaveLength(0);
    expect(f.vacant.map((v) => v.reason)).toEqual(['vacant']);
    expect(derive(['משוואת המעגל x^2+y^2+1=0']).faults).toEqual([]);
  });
});

// --- helpers -------------------------------------------------------------

function lines(src: string[]): Fact[] {
  const out: Fact[] = [];
  for (const s of src) {
    const r = parseLine(s);
    if (!r.ok) throw new Error(`did not parse: ${s} (${r.code})`);
    out.push(...r.facts);
  }
  return out;
}

export type _Construction = Construction;
