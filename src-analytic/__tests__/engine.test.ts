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
import { decideSubmit } from '../app/submit';
import { inDomain, pointsOf, type Construction, type Fact } from '../engine/types';
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
    expect(out.ok && out.effect).toBe('known');
    expect(out.ok && pointsOf(out.next)).toHaveLength(1);
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

  /**
   * SUPERSEDED by #1026 / [ADR-AG-018]. This case used to assert the opposite — that a second
   * ellipse is refused, "the anonymous conics are one per figure (D6)". That was never a decision
   * about figures: both anonymous ellipses were minted with the fixed id `ellipse`, so the second
   * collided with the first on its NAME, and `conicSlotTaken` dressed the collision up as a policy.
   * The ids are content-derived now, so there is no collision and nothing to refuse.
   */
  it('accepts a SECOND ellipse — two different equations are two different curves (#1026)', () => {
    const c = fold(lines(['נתונה אליפסה שמשוואתה x^2/9+y^2/16=1'])).construction;
    const second = parseLine('נתונה אליפסה שמשוואתה x^2/25+y^2/4=1');
    if (!second.ok) throw new Error('should parse');
    const out = applyFact(c, second.facts[0]);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.next.objects).toHaveLength(2);
  });

  it('still absorbs the SAME conic restated — the M1 absorb rides on the content id', () => {
    // The property the content id has to preserve: a question's section ב re-stating section א's
    // given is one object, not two. Without this the absorb silently stops working and every
    // restated conic draws twice.
    const c = fold(lines(['נתונה פרבולה שמשוואתה y^2=54x'])).construction;
    const again = parseLine('נתונה פרבולה שמשוואתה y^2=54x');
    if (!again.ok) throw new Error('should parse');
    const out = applyFact(c, again.facts[0]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.effect).toBe('known');
      expect(out.next.objects).toHaveLength(1);
    }
  });

  it('a parabola and an ellipse and a second of each all coexist', () => {
    const c = fold(
      lines([
        'נתונה פרבולה שמשוואתה y^2=4x',
        'נתונה פרבולה שמשוואתה y^2=8x',
        'נתונה אליפסה שמשוואתה x^2/9+y^2/16=1',
        'נתונה אליפסה שמשוואתה x^2/25+y^2/4=1',
      ]),
    );
    expect(c.errors.every((e) => e === null)).toBe(true);
    expect(c.construction.objects).toHaveLength(4);
    // Four distinct ids, derived from four distinct equations.
    expect(new Set(c.construction.objects.map((o) => o.id)).size).toBe(4);
  });

  it('an unnamed curve carries an EMPTY name, so no id can reach the panel (#1026)', () => {
    // The panel prints `c.label.name`; an id leaking into it would be internal state on screen.
    const c = fold(lines(['נתונה פרבולה שמשוואתה y^2=4x', 'משוואת המעגל x^2+y^2-2x=0'])).construction;
    for (const o of c.objects) {
      if (o.kind === 'curve') expect(o.label.name).toBe('');
    }
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
    /**
     * ADR-AG-008's rule, tested **within its own scope** (#1058).
     *
     * The rule is about a figure that still has freedom: an empty circle *at this parameter value*,
     * where another value gives a real one. This case used a circle with NO parameter (`x²+y²+1=0`),
     * where "at this value" is vacuous — the same conflation #1058 identified, and the version below
     * is what the rule actually says. The evaluation-level assertions are unchanged; only the
     * `derive` one needed a figure the rule applies to.
     */
    const c = fold(lines(['משוואת המעגל x^2+y^2+1=0'])).construction;
    const f = evaluate(c, 0);
    expect(f.curves).toHaveLength(0);
    expect(f.vacant.map((v) => v.reason)).toEqual(['vacant']);

    // A circle that is empty for a<0 and real for a>0: the figure can move, so silence is right and
    // «הציגו תצורה אחרת» can reach a configuration where it exists.
    const free = derive(['a הוא פרמטר', 'משוואת המעגל x^2+y^2-a=0']);
    expect(free.figure.carrierDof + free.construction.params.length).toBeGreaterThan(0);
    expect(free.faults).toEqual([]);
  });

  it('but a curve that can NEVER exist is reported — the predicate (#1058)', () => {
    // `x²+y²+1=0` carries no parameter, so there is no other configuration to reach. Staying silent
    // tells the student nothing about a curve they wrote.
    expect(derive(['משוואת המעגל x^2+y^2+1=0']).faults.map((f) => f.code)).toEqual(['does-not-exist']);
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

/**
 * The #1026 ↔ #1037 reconciliation (round #1056).
 *
 * The two fixes met at the id: #1026 gave anonymous conics a content-derived id, #1037 ruled that an
 * anonymous curve is identified by its EQUATION and put unnamed lines and circles in one `curve-`
 * namespace. Landing them separately would have left conics in their own — so «נתונה פרבולה שמשוואתה
 * y^2=54x» and the bare «y^2=54x» would be two objects for one parabola, which is precisely the
 * duplication #1037 had just removed for lines. Asserted here because it is a property of the two
 * TOGETHER and neither branch's own suite could see it.
 */
describe('anonymous curves share ONE namespace, whichever phrasing minted them', () => {
  it('reads the noun form and the bare form of a parabola as one object', () => {
    const d = derive(['נתונה פרבולה שמשוואתה y^2=54x', 'y^2=54x'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves).toHaveLength(1);
  });

  it('reads the noun form and the bare form of an ellipse as one object', () => {
    const d = derive(['נתונה אליפסה שמשוואתה x^2/9+y^2/16=1', 'x^2/9+y^2/16=1'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves).toHaveLength(1);
  });

  it('still keeps two DIFFERENT conics apart — the #1026 property survives the unification', () => {
    const d = derive(['נתונה פרבולה שמשוואתה y^2=4x', 'y^2=8x'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves).toHaveLength(2);
  });

  it('mints every unnamed curve in the same namespace, and no named one', () => {
    const d = derive([
      'נתונה פרבולה שמשוואתה y^2=4x',
      'נתונה אליפסה שמשוואתה x^2/9+y^2/16=1',
      'הישר y=2x+1',
      'משוואת המעגל x^2+y^2-2x=0',
      'נתון הישר l1: y=x',
      'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9',
    ], 0);
    expect(d.faults).toEqual([]);
    const ids = d.figure.curves.map((c) => c.id);
    expect(ids.filter((i) => i.startsWith('curve-'))).toHaveLength(4);
    expect(ids).toContain('line-l1');
    expect(ids).toContain('circle-I');
  });
});

/**
 * The THIRD outcome — #1045, from the operator's T21: *"the second time should say this is already
 * known and not enter it twice."*
 *
 * The engine was always right: `applyFact` answered "absorbed" and produced no duplicate object.
 * Nothing READ the answer, so the UI recorded the line anyway — the student's statement appeared
 * twice, the counter said «4 נתונים» for three givens, and the tool said nothing. Same shape as
 * #1020: a mechanism that exists, correct, with one of its callers never asking.
 *
 * These assert the per-LINE outcome, because that is the thing the submit path reads.
 */
describe('#1045 — a line that added nothing says so, and is not recorded', () => {
  const outcomes = (lines: string[]) => derive(lines, 0).outcomes;

  it('marks an exact restatement KNOWN rather than created', () => {
    expect(outcomes(['A(8,1)', 'B(-2,-5)', 'M אמצע AB', 'M אמצע AB'])).toEqual([
      'created',
      'created',
      'created',
      'known',
    ]);
  });

  it('marks a restated point, curve and constraint known too — the rule is not per-kind', () => {
    expect(outcomes(['A(3,4)', 'A(3,4)'])).toEqual(['created', 'known']);
    expect(outcomes(['הישר l1: y=x', 'הישר l1: y=x'])).toEqual(['created', 'known']);
    expect(outcomes(['משולש ABC', 'שטח המשולש ABC הוא 7', 'שטח המשולש ABC הוא 7'])).toEqual([
      'created',
      'created',
      'known',
    ]);
  });

  it('a restatement in DIFFERENT words is still known — identity is the value, not the spelling', () => {
    // `sameNumbers` probes numerically, so `2` and `1+1` are one given written two ways.
    expect(outcomes(['A(2,6)', 'נתונה הנקודה A(2,6)'])).toEqual(['created', 'known']);
  });

  it('NARROWING is not "already known" — it added information and belongs in the list', () => {
    // The distinction the issue asked for. «a הוא פרמטר» then «a<13» is absorbed into the existing
    // declaration, but the domain is strictly tighter afterwards; calling it "already known" would
    // be false about the student's own statement.
    expect(outcomes(['a הוא פרמטר', 'a < 13'])).toEqual(['created', 'narrowed']);
    expect(outcomes(['a הוא פרמטר', 'a הוא פרמטר חיובי'])).toEqual(['created', 'narrowed']);
  });

  it('but re-declaring the SAME domain is known', () => {
    expect(outcomes(['a הוא פרמטר חיובי', 'a הוא פרמטר חיובי'])).toEqual(['created', 'known']);
  });

  it('a multi-fact line is never called known on the strength of one repeated fact', () => {
    // «AD תיכון לצלע BC» lowers to four facts; declaring A and D again is absorbed, but the
    // constraint and the segment are new, so the LINE contributed.
    const o = outcomes(['A(0,0)', 'B(6,0)', 'C(0,6)', 'AD תיכון לצלע BC']);
    expect(o[3]).toBe('created');
  });

  it('a faulted line is faulted, whatever else it did', () => {
    expect(outcomes(['A(3,4)', 'A(9,9)'])).toEqual(['created', 'faulted']);
    expect(outcomes(['גללי בללי'])).toEqual(['faulted']);
  });

  it('every line gets exactly one outcome, positionally', () => {
    const lines = ['A(0,0)', 'B(6,0)', 'C(0,6)', 'משולש ABC', 'משולש ABC', 'גללי'];
    const o = outcomes(lines);
    expect(o).toHaveLength(lines.length);
    expect(o[4]).toBe('known');
    expect(o[5]).toBe('faulted');
  });
});

/**
 * #1065 — a known LENGTH becomes visible, on the right surface.
 *
 * The operator, playing PR #1064: *"we should have 10 show on the AB line since this is a given and
 * not calculated. data panel doesnt show that AB=10"* and *"data panel doesnt show AC value (10)
 * after i write AB=10 and AB=AC"*.
 *
 * The engine was already right — `isKnowledge` returned 10 for `|AB|` and correctly refused to call
 * `|AC|` known until «AB = AC» arrived. Nothing printed either. #1020's shape for the third time in
 * this product: a mechanism that exists, is correct, and has no caller.
 *
 * Their two sentences split along ADR-AG-016's own rule — the canvas shows the QUESTION, the data
 * panel shows the ANSWER — and their wording drew the line themselves: *"since this is a given and
 * not calculated."* So the cases below assert WHICH SURFACE, not merely that a number exists.
 */
describe('#1065 — a stated length labels the segment; a derived one does not', () => {
  const pinned = (lines: string[]) =>
    derive(lines, 0).figure.segments.filter((s) => s.pinnedLength !== undefined).map((s) => s.ends.join(''));

  const lengthOf = (d: ReturnType<typeof derive>, a: string, b: string) =>
    isKnowledge(d.construction, (f) => {
      const p = f.points.find((q) => q.id === a);
      const q = f.points.find((r) => r.id === b);
      return p && q ? Math.hypot(q.x - p.x, q.y - p.y) : null;
    });

  it('labels the segment the student pinned, and only that one', () => {
    expect(pinned(['משולש ABC', 'AB = 10'])).toEqual(['AB']);
  });

  it('does NOT label a length the tool derived — the operator’s own distinction', () => {
    // «AB = AC» makes CA knowable, and it is an ANSWER. It belongs in the panel, not on the figure.
    const d = derive(['משולש ABC', 'AB = 10', 'AB = AC'], 0);
    expect(pinned(['משולש ABC', 'AB = 10', 'AB = AC'])).toEqual(['AB']);
    expect(lengthOf(d, 'C', 'A').known).toBe(true);
  });

  it('the panel value is there for both — stated and derived', () => {
    const d = derive(['משולש ABC', 'AB = 10', 'AB = AC'], 0);
    const ab = lengthOf(d, 'A', 'B');
    const ca = lengthOf(d, 'C', 'A');
    expect(ab.known && Math.round(ab.value)).toBe(10);
    expect(ca.known && Math.round(ca.value)).toBe(10);
  });

  it('a fully placed triangle labels nothing — every length there is derived', () => {
    expect(pinned(['A(0,0)', 'B(6,0)', 'C(0,8)', 'משולש ABC'])).toEqual([]);
    const d = derive(['A(0,0)', 'B(6,0)', 'C(0,8)', 'משולש ABC'], 0);
    expect(lengthOf(d, 'B', 'C').known).toBe(true); // …but the panel still has 10
  });

  it('a length pinned to a FREE PARAMETER is not a label — #1020’s gate', () => {
    /**
     * «AB = a» is a given and is NOT a number. The first draft of this feature printed `3.46` on the
     * segment — one seed's sample asserted as fact — because the caller hardcoded the knowledge flag.
     * The gate is the same one `provenanceOf` uses for coordinates: no free symbols in the value.
     */
    expect(pinned(['a הוא פרמטר', 'משולש ABC', 'AB = a'])).toEqual([]);
  });

  it('a relation between two lengths pins NEITHER on its own', () => {
    // «AB = AC» relates them; whichever becomes known does so through the other, which is derivation.
    expect(pinned(['משולש ABC', 'AB = AC'])).toEqual([]);
  });

  it('every drawn segment knows whose endpoints it has', () => {
    const d = derive(['משולש ABC'], 0);
    expect(d.figure.segments.map((s) => s.ends.join('')).sort()).toEqual(['AB', 'BC', 'CA']);
  });
});

/**
 * #1063 — a given the figure ALREADY ENTAILS says so, and adds no row.
 *
 * The operator, playing #1062's own fix: *"B11 says area is 6 but that is already known at this point
 * so we should say this is known. B on x-axis should also fall into the already known category."*
 *
 * #1045 catches a RESTATEMENT — the same fact twice, decided structurally in `applyFact`. This is the
 * larger notion: «שטח המשולש ABC הוא 6» on a determined triangle was never stated before, it is simply
 * true and already settled. B11 and B12 were written as the GUARDS proving #1062 had not overreached,
 * and they showed the opposite gap: #1062 makes the tool notice a given is false, this is it noticing
 * a given is redundant.
 *
 * The decision lives in the submit path because it needs the figure BEFORE and AFTER, which
 * `applyFact` cannot see — it judges one fact against one construction.
 *
 * **These cases CALL that decision; they used to reproduce it (#1102).** The reproduction is why this
 * lock stayed green while the feature was dead in the app for a day: #1076 added an earlier-returning
 * arm to the real submit path, the copy here never grew one, and so it went on testing a submit path
 * that no longer existed. A test that re-implements its subject can only ever agree with itself.
 */
describe('#1063 — a given that adds nothing is said, not recorded', () => {
  /**
   * The REAL submit decision, named in this test's own vocabulary.
   *
   * Every branch below is `decideSubmit`'s; nothing here re-derives a verdict. If the app's submit
   * path changes shape, these names stop resolving and this file fails to compile — which is the
   * point, and the opposite of what the previous reproduction did.
   */
  const verdict = (before: string[], line: string): string => {
    const v = decideSubmit(line, before, 0);
    switch (v.kind) {
      case 'refused': return `refused:${v.error.key}`;
      case 'already-known': return 'restated';
      case 'already-follows': return 'entailed';
      case 'record': return 'recorded';
      case 'ignored': return 'ignored';
      // #1353 — an imperative wrapper teaches instead of committing. None of the cases below is
      // wrapped, so reaching this here would itself be the finding.
      case 'teach': return `teach:${v.canonical}`;
    }
  };

  const PINNED = ['A(0,0)', 'B(4,0)', 'C(0,3)'];

  it('says so for a given the determined figure already satisfies', () => {
    expect(verdict(PINNED, 'B נמצא על ציר ה-x')).toBe('entailed'); // the operator's B12
    expect(verdict(PINNED, 'AB מאונך ל-AC')).toBe('entailed');
    expect(verdict(PINNED, 'AB מקביל לציר ה-x')).toBe('entailed');
  });

  it('and for the AREA once the shape it names is already there (#1080 narrowed this)', () => {
    /**
     * The operator's B11, with one line added — and the addition is the point.
     *
     * «שטח המשולש ABC הוא 6» over three pinned points used to add nothing, and said so. Since #1080
     * it also DRAWS the triangle it names (the operator: *"the triangle should be drawn as the user
     * mentions and refers to it"*), so the line changes the figure and is recorded — correctly, and
     * it is the entailment test doing its job rather than failing it: what it asks is whether the
     * figure GAINED anything, and now it did.
     *
     * Where the shape is already stated, nothing is gained and the answer is unchanged.
     */
    expect(verdict([...PINNED, 'משולש ABC'], 'שטח המשולש ABC הוא 6')).toBe('entailed');
    expect(verdict(PINNED, 'שטח המשולש ABC הוא 6')).toBe('recorded');
    // …and the figure it recorded really is the triangle.
    expect(derive([...PINNED, 'שטח המשולש ABC הוא 6'], 0).figure.segments).toHaveLength(3);
  });

  it('still REFUSES the same sentences when they are false', () => {
    expect(verdict(PINNED, 'שטח המשולש ABC הוא 999')).toBe('refused:unsatisfiable');
    expect(verdict(PINNED, 'C נמצא על ציר ה-x')).toBe('refused:unsatisfiable');
  });

  it('records a given that is true HERE but not NECESSARILY — the counter-case', () => {
    /**
     * The reason "the residual is zero" is not enough. On a free triangle «AB מקביל לציר x» is
     * satisfied at seed 0 only because the sampler put it there; the constraint is real and removes a
     * degree of freedom. Calling it "already known" would silently discard a stated given, which is
     * the defect this product exists to avoid.
     */
    expect(verdict(['משולש ABC'], 'AB מקביל לציר ה-x')).toBe('recorded');
    expect(verdict(['משולש ABC'], 'שטח המשולש ABC הוא 6')).toBe('recorded');
    expect(verdict(['A(0,0)', 'משולש ABC'], 'B נמצא על ציר ה-x')).toBe('recorded');
  });

  it('never swallows a line that brings something NEW', () => {
    // The test is on what the construction GAINED, not on the sentence's fact kinds — which is what
    // makes the absorbed `declare` in «B נמצא על ציר ה-x» above come out right.
    expect(verdict(PINNED, 'D(9,9)')).toBe('recorded');
    expect(verdict(PINNED, 'הקטע AB')).toBe('recorded');
    expect(verdict(PINNED, 'k הוא פרמטר')).toBe('recorded');
    expect(verdict([...PINNED, 'משולש ABC'], 'D על הצלע BC')).toBe('recorded');
  });

  it('leaves #1045 alone: a structural restatement is still "restated"', () => {
    expect(verdict([...PINNED, 'שטח המשולש ABC הוא 6'], 'שטח המשולש ABC הוא 6')).toBe('restated');
  });

  /**
   * #1102 — the three sentences the operator reported, which this feature was BUILT for and which
   * were silently recorded for a day because #1076's arm returned first.
   *
   * They are here rather than in a new file because the bug was never in the entailment test itself:
   * it was that something else answered before it. Only a case driven through the whole decision can
   * see that, which is exactly what the reproduced helper above could not do.
   */
  it('#1102 — the reported sentences reach the entailment test at all', () => {
    expect(verdict(['A(0,0)', 'B(4,0)'], 'AB = 4')).toBe('entailed');
    expect(verdict([...PINNED, 'משולש ABC'], 'שטח המשולש ABC הוא 6')).toBe('entailed');
    expect(verdict([...PINNED, 'משולש ABC'], 'B נמצא על ציר ה-x')).toBe('entailed');
  });

  /**
   * The guard in the other direction — #1076 must not regress.
   *
   * A PROMOTION («y=x» when a point was already declared on that carrier) states no constraint and
   * genuinely changes the canvas, so it is recorded with no notice. This pair is what forbids
   * "fixing" #1102 by simply deleting the promotion arm: both classes report the line outcome
   * `created` and both leave `gained` at zero, so only the constraint count separates them.
   */
  it('#1076 does not regress — a promotion is recorded, never called entailed', () => {
    expect(verdict(['נקודה B על הישר y=x'], 'נתון הישר l1: y=x')).toBe('recorded');
    expect(verdict(['נקודה B על הישר y=x'], 'y=x')).toBe('recorded');
  });
});
