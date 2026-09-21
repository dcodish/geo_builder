/**
 * #1321 — an unknown letter run in a VALUE SLOT is not a product of free symbols.
 *
 * `שיפוע הישר l1 הוא tan(30)` on `y=2x` built GREEN: `tan` was read as `t·a·n`, three symbols the
 * student never wrote, and because the parameter register takes its parameters from what
 * expressions USE (#1014) they became free DOF that could drive the residual to zero. The slope of
 * `y=2x` is 2 and `tan 30° = 0.577`, so a correct tool must refuse — and the control proves the
 * tool CAN refuse: `sqrt(3)` is a real token, is measured, and comes back `unsatisfiable`.
 *
 * The lock is on the CLASS, not on `tan`: no list of function names appears in the fix or here.
 * The two rules are about the RUN — #1068's already-ruled word test (SPACE-DELIMITED, ≥3 letters),
 * now applied at the tokenizer instead of only at the bare-equation branch, plus ≥2 letters applied
 * to `(` for the form a space cannot delimit. So the next function nobody thought of (`arctan`,
 * `ln`, `log`) is caught by the same measurement, and `2abc` stays the legal product #1068 ruled it.
 */
import { describe, it, expect } from 'vitest';
import { derive } from '../engine/derive';
import { parseExpr } from '../engine/expr';
import { parseLengthExpr } from '../engine/lengths';

const FIXED_LINE = 'נתון הישר l1: y=2x';

describe('#1321 — an unknown letter run in a value slot is refused, never absorbed', () => {
  it('the reported case: «tan(30)» is refused instead of building green', () => {
    const d = derive([FIXED_LINE, 'שיפוע הישר l1 הוא tan(30)'], 0);

    expect(d.outcomes).toEqual(['created', 'faulted']);
    expect(d.faults).toHaveLength(1);
    // The refusal names the student's own text, never internal state.
    expect(d.faults[0]?.detail).toContain('tan(30)');
  });

  it('the members the report did not name are the same class — the paren-free and the other names', () => {
    for (const value of ['tan 30', 'sin(30)', 'cos 45', 'log(100)', 'arctan(2)', 'ln(5)']) {
      const d = derive([FIXED_LINE, `שיפוע הישר l1 הוא ${value}`], 0);
      expect(d.outcomes, value).toEqual(['created', 'faulted']);
    }
  });

  it('the control still MEASURES and refuses on the arithmetic — √3 ≠ 2', () => {
    const d = derive([FIXED_LINE, 'שיפוע הישר l1 הוא sqrt(3)'], 0);

    expect(d.outcomes).toEqual(['created', 'faulted']);
    expect(d.faults[0]?.code).toBe('unsatisfiable');
  });

  it('a TRUE slope still builds — the fix refuses unknown words, not values', () => {
    const d = derive([FIXED_LINE, 'שיפוע הישר l1 הוא 2'], 0);

    expect(d.outcomes).toEqual(['created', 'created']);
    expect(d.faults).toEqual([]);
  });

  /**
   * The negative control that makes the rule a rule and not a name list: juxtaposition is the
   * reason this parser is hand-written, and the exam's own notation must survive untouched.
   */
  it('the exam notation juxtaposition still parses', () => {
    for (const src of ['2a', '2ax', '25k^2', '4√5', 'ab', 'k+1', '2x', 'k(x+1)', '(k+1)x', '2π']) {
      expect(parseExpr(src), src).not.toBeNull();
    }
  });

  it('a word — space-delimited ≥3 letters, or ≥2 applied to a paren — is not an expression', () => {
    for (const src of ['tan(30)', 'tan 30', 'abc', 'ln(x)', 'xy(3)']) {
      expect(parseExpr(src), src).toBeNull();
    }
  });
});

/**
 * The same class, found BY this fix in the catalog's own English row (#1321, measured 2026-09-21).
 *
 * `the distance between A and B = 10` left `the ` unconsumed — the measure noun spelled Hebrew's
 * article (`ה?מרחק`) and not English's — so the remainder reached `parseExpr` and was multiplied as
 * juxtaposed parameters: `t·h·e·|AB| = 10`, three phantom free symbols against the real distance
 * term. Satisfiable at any length. The catalog lock asserts each row PARSES, so it was green the
 * whole time; only a tokenizer that refuses words could surface it.
 */
describe('#1321 — the English measure noun carries its article, so no phantom symbols survive it', () => {
  const dist = (line: string): number => {
    const d = derive(['A(0,0)', 'נקודה B', line], 0);
    expect(d.faults, line).toEqual([]);
    const pts = d.figure.points;
    const a = pts.find((p) => p.id === 'A')!;
    const b = pts.find((p) => p.id === 'B')!;
    return Math.hypot(b.x - a.x, b.y - a.y);
  };

  it('the catalog F19 row PINS the distance in both languages — not just parses', () => {
    expect(dist('the distance between A and B = 10')).toBeCloseTo(10, 6);
    expect(dist('המרחק בין A ל-B = 10')).toBeCloseTo(10, 6);
  });

  it('the two languages lower to the SAME length expression', () => {
    const en = parseLengthExpr('the distance between A and B');
    const he = parseLengthExpr('המרחק בין A ל-B');

    expect(en).not.toBeNull();
    expect(en).toEqual(he);
  });
});
