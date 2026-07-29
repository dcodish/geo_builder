import { describe, it, expect } from 'vitest';
import { parse, normalizeUtterance } from '@/parser/parse';

/**
 * Spelling folds at the normalizeUtterance orthography boundary (#389, ADR-405): a plene/defective
 * spelling variant of a known noun must parse IDENTICALLY to the canonical spelling — the fold happens
 * at the one boundary every rule reads, so the whole grammar (and every future rule) inherits it.
 * The class lock is equality-of-parse with the canonical form, not a per-rule assertion.
 */
const ctx = { circles: [] as string[] };
const both = (variant: string, canonical: string) => {
  const v = parse(variant, ctx);
  const c = parse(canonical, ctx);
  expect(c.ok, `canonical must parse: ${canonical}`).toBe(true);
  expect(v, `variant must lower identically: ${variant}`).toEqual(c);
};

describe('plene/defective spelling folds (ADR-405, issue #389)', () => {
  it('the exact prod rows: «מעויין ABHD» and «ABHD מעויין» parse (were LIVE not-handled)', () => {
    expect(parse('מעויין ABHD', ctx).ok).toBe(true);
    expect(parse('ABHD מעויין', ctx).ok).toBe(true);
  });

  it('«מעויין» ≡ «מעוין» in both word orders', () => {
    both('מעויין ABHD', 'מעוין ABHD');
    both('ABHD מעויין', 'ABHD מעוין');
  });

  it('«מעויין» reaches rules beyond the shape macro (area — a different rule inherits the fold)', () => {
    both('שטח המעויין ABCD הוא 20', 'שטח המעוין ABCD הוא 20');
  });

  it('«עפיפון» ≡ «דלתון» in the kite macro', () => {
    both('עפיפון ABCD', 'דלתון ABCD');
  });

  it('«עפיפון» reaches rules that never listed it (inscribe — HALF-supported before the fold)', () => {
    // pre-fix: «מעגל חסום בעפיפון ABCD» missed POLY_WORDS_HE / CONTAINER_NOUNS and mis-lowered,
    // while the kite macro itself accepted the word — the one-rule-of-twenty failure mode.
    both('מעגל חסום בעפיפון ABCD', 'מעגל חסום בדלתון ABCD');
  });

  it('standalone defective «שוה» ≡ «שווה» (isosceles / equilateral shape words)', () => {
    both('משולש שוה שוקיים ABC', 'משולש שווה שוקיים ABC');
    both('משולש שוה צלעות ABC', 'משולש שווה צלעות ABC');
  });

  it('the «שוה» fold is word-bounded — it never fires inside another word', () => {
    expect(normalizeUtterance('AB שוה CD')).toBe('AB שווה CD');
    // a leading/trailing Hebrew letter blocks the fold (it is part of ANOTHER word)
    expect(normalizeUtterance('השוה')).toBe('השוה');
    expect(normalizeUtterance('שוהם')).toBe('שוהם');
  });

  it('canonical spellings are byte-untouched by the folds', () => {
    expect(normalizeUtterance('מעוין ABCD')).toBe('מעוין ABCD');
    expect(normalizeUtterance('דלתון ABCD')).toBe('דלתון ABCD');
    expect(normalizeUtterance('משולש שווה שוקיים ABC')).toBe('משולש שווה שוקיים ABC');
  });
});
