/**
 * S4 part 1 (#621): the parser's two disciplines, before rule one exists.
 *
 * Both are here now precisely because they are cheap now and were not retrofittable later — the 2-D
 * tree's orthography fix took five ADRs and its span accountant is still not enforcing after ~18
 * `dropped*` gates (ADR-CX-009 §2 and §4).
 */
import { describe, expect, it } from 'vitest';

import { isDisplayOnly, normalize, transformNames } from '../normalize';
import { claimAll, fullyAccounted, tokenize, unaccountedText, type Claim } from '../span';

describe('the orthography chokepoint', () => {
  it('THE EXAM PASTE: Z₁Z₂³Z₄ and z1*z2^3*z4 are the same utterance (ADR-CX-003 P2)', () => {
    expect(normalize('Z₁Z₂³Z₄')).toBe(normalize('Z1*Z2^3*Z4'));
  });

  it('strips the invisible controls a Hebrew line with LTR maths collects', () => {
    const dirty = '‫z1^3 = z3‬';
    expect(normalize(dirty)).toBe('z1^3 = z3');
    expect([...dirty].some(isDisplayOnly)).toBe(true);
  });

  it('a subscript run ENDS a name — Z₁Z₄ is a product, never the identifier z1z4', () => {
    expect(normalize('Z₁Z₄')).toBe('Z1*Z4');
    expect(normalize('Z₁')).toBe('Z1');
  });

  it('carries the exam’s other typography: · × − ÷ ° and the conjugate overline', () => {
    expect(normalize('2·z1')).toBe('2*z1');
    expect(normalize('2×z1')).toBe('2*z1');
    expect(normalize('−2z1')).toBe('-2z1');
    expect(normalize('45°')).toBe('45');
    expect(normalize('z̄')).toBe('conj(z)');
    expect(normalize('z̄1')).toBe('conj(z1)');
  });

  it('is idempotent — normalizing twice changes nothing', () => {
    for (const s of ['Z₁Z₂³Z₄', '−2·z1 = conj(z3)', '  z1   ברביע   הראשון ', '45°']) {
      expect(normalize(normalize(s))).toBe(normalize(s));
    }
  });

  it('the transform list is readable as a contract', () => {
    expect(transformNames()).toContain('strip invisible bidi controls');
    expect(transformNames().length).toBeGreaterThan(8);
  });
});

describe('span accounting — the only honesty mechanism', () => {
  const claims = (...rs: [number, number][]): Claim[] => rs.map(([start, end]) => ({ start, end }));

  it('a fully-claimed line accounts', () => {
    const s = normalize('z1^3 = z3');
    expect(fullyAccounted(s, [claimAll(s)])).toBe(true);
  });

  it('THE SILENT DROP: an unclaimed name is reported in the student’s own words', () => {
    const s = normalize('z1^3 = z3');
    // a rule that claimed only the left-hand side
    expect(unaccountedText(s, claims([0, 5]))).toEqual(['=', 'z3']);
  });

  it('OCCURRENCE-BASED, not value-based (ADR-429): two 4s are two obligations', () => {
    const s = normalize('4 * 4');
    // claiming the first 4 only must NOT satisfy the second
    expect(unaccountedText(s, claims([0, 1]))).toEqual(['*', '4']);
  });

  it('PARTIAL cover is not cover — claiming z1 out of z10 leaves z10 unaccounted', () => {
    const s = normalize('z10');
    expect(unaccountedText(s, claims([0, 2]))).toEqual(['z10']);
  });

  it('FAILS CLOSED (ADR-435): an unknown word is CONTENT, not filler', () => {
    const s = normalize('z1 מקבילית');
    expect(unaccountedText(s, claims([0, 2]))).toEqual(['מקבילית']);
  });

  it('...while listed connectives may go unclaimed, which is what keeps the cost one escalation', () => {
    const s = normalize('נתון כי z1');
    expect(unaccountedText(s, claims([s.length - 2, s.length]))).toEqual([]);
  });

  it('a display-only character is never blamed on the student', () => {
    // if one survived normalization that is OUR bug; it must not surface as an unparsed word
    const spans = tokenize('z1 ‎ z3');
    expect(spans.map((t) => t.text)).toEqual(['z1', 'z3']);
  });

  it('classifies the spans a rule will need to claim', () => {
    const s = normalize('|z1| = 9r');
    expect(tokenize(s).map((t) => `${t.kind}:${t.text}`)).toEqual([
      'operator:|',
      'name:z1',
      'operator:|',
      'operator:=',
      'number:9',
      'name:r',
    ]);
  });

  it('spans carry positions, so a refusal can point at the text', () => {
    const s = normalize('z1^3 = z3');
    const t = tokenize(s);
    expect(s.slice(t[0].start, t[0].end)).toBe('z1');
    expect(t.every((x) => s.slice(x.start, x.end) === x.text)).toBe(true);
  });
});
