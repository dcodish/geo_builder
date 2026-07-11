/**
 * Issue #52 / ADR-285 — the `= k·segment` proportion form accepts RADICAL coefficients.
 *
 * Operator prod report (2026-07-11): `AB=√2*OD` (OD a radius, the natural textbook form) was not
 * recognized — it escalated to the LLM and failed in prod — while `AB=√2*R` and `AB/OD = √2` both
 * worked. The class: `ratioConstraint`'s coefficient atom was plain-decimal `COEF` while its own
 * sibling `segmentRatio` already read √-aware values through RATVAL — the SAME given parsed in the
 * `/`-form and failed in the `= k·seg` form. Fix: a shared radical-aware coefficient atom (RCOEF —
 * optional √ on a number or fraction, optionally parenthesised) on both sides of `=`, the trailing
 * divisor, and the Hebrew `פי` form. Engine untouched (`set-ratio` takes any numeric k).
 *
 * The operator's utterance in figure context is locked by scenario `ratio-radical-coefficient`.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';

const first = (u: string): AnyCommand => {
  const r = parse(u);
  if (!r.ok) throw new Error(`did not parse: ${u} (${(r as { reason?: string }).reason})`);
  return r.commands[0] as AnyCommand;
};
const ratioK = (u: string): number => {
  const r = parse(u);
  if (!r.ok) throw new Error(`did not parse: ${u}`);
  const c = r.commands.find((x) => x.type === 'set-ratio') as Extract<AnyCommand, { type: 'set-ratio' }> | undefined;
  if (!c) throw new Error(`no set-ratio in: ${u} → ${r.commands.map((x) => x.type).join(', ')}`);
  return c.k;
};

describe('issue #52 — radical coefficients in the proportion form', () => {
  it('√ coefficients parse to set-ratio with the resolved k (every glue/dot/star form)', () => {
    for (const u of ['AB=√2*OD', 'AB = √2·OD', 'AB=√2OD', 'AB = √2 OD']) {
      expect(ratioK(u), u).toBeCloseTo(Math.SQRT2, 9);
    }
    expect(ratioK('AB = (√2/2)CD')).toBeCloseTo(Math.SQRT1_2, 9);
    expect(ratioK('AB = CD/√2')).toBeCloseTo(Math.SQRT1_2, 9); // radical trailing divisor
    expect(ratioK('√2·AB = CD')).toBeCloseTo(Math.SQRT1_2, 9); // LHS coefficient
    expect(ratioK('AB פי √2 מ-OD')).toBeCloseTo(Math.SQRT2, 9); // the Hebrew פי form
  });

  it('plain coefficients are byte-unchanged', () => {
    expect(ratioK('AB = 2*OD')).toBe(2);
    expect(ratioK('AB = CD/2')).toBe(0.5);
    expect(ratioK('2 AB = 3 CD')).toBe(1.5);
    expect(ratioK('AB פי 2 מ-AD')).toBe(2);
  });

  it('no theft: the radius-symbol, concrete-length, equality, and /-ratio forms keep their owners', () => {
    // "AB = √2R" — a single-letter reserved radius symbol, owned by the measure path (k·R).
    expect(first('AB=√2*R').type).toBe('measure-length');
    // "AB = √2" — a concrete length, not a ratio (no second segment).
    expect(first('AB = √2').type).toBe('measure-length');
    // "AB = CD" — the k=1 equality stays with equalSegments.
    const eq = parse('AB = CD');
    expect(eq.ok && eq.commands.some((c) => c.type === 'set-equal')).toBe(true);
    // "EB/AE=√2/2" — the /-form stays with segmentRatio (same k either way).
    expect(ratioK('EB/AE=√2/2')).toBeCloseTo(Math.SQRT1_2, 9);
    // "AB = 5" — a plain distance.
    const d = parse('AB = 5');
    expect(d.ok && d.commands.some((c) => c.type === 'set-distance')).toBe(true);
  });
});
