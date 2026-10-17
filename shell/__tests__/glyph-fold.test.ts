/**
 * #1912 ([ADR-3D-329](../../docs/06b-decisions-3d.md#adr-3d-329)) — the shared LOOK-ALIKE GLYPH fold.
 *
 * Each row folds its twin onto the symbol it renders as, and each guard holds: a `<` between two
 * operands is still less-than, a letter-like degree glyph away from a digit is still a letter, and
 * «שורש» with no value after it is left to the rules. The product locks are
 * `src3d/__tests__/issue-1912-glyph-fold.test.ts` and the parity rows `glyph-*-1912`.
 */
import { describe, expect, it } from 'vitest';
import { GLYPH_FOLDS, foldGlyphs } from '../glyphFold';

describe('#1912 — every look-alike glyph folds onto its symbol', () => {
  it('the perpendicular twins', () => {
    expect(foldGlyphs('AC ⟂ AB')).toBe('AC ⊥ AB');
    expect(foldGlyphs('AC⟂AB')).toBe('AC⊥AB');
    expect(foldGlyphs('SA ⟂ ABC')).toBe('SA ⊥ ABC');
    expect(foldGlyphs('AC ⊥ AB')).toBe('AC ⊥ AB'); // the canonical glyph is untouched
  });

  it('the angle twins', () => {
    expect(foldGlyphs('∡ABC = 40°')).toBe('∠ABC = 40°');
    expect(foldGlyphs('∢ABC = 40°')).toBe('∠ABC = 40°');
    expect(foldGlyphs('∢C = 90°')).toBe('∠C = 90°');
    expect(foldGlyphs('∡SAB')).toBe('∠SAB');
  });

  it('the keyboard `<` before a label run is the angle sign', () => {
    expect(foldGlyphs('<ABC = 40°')).toBe('∠ABC = 40°');
    expect(foldGlyphs('<ACB=<BED')).toBe('∠ACB=∠BED');
    expect(foldGlyphs('זווית <A = 30')).toBe('זווית ∠A = 30');
  });

  it('…and between two operands it is still less-than', () => {
    for (const s of ['AB < CD', 'α<β', 'R<r', 'k < 0', '0 < t < 1', '60 < זווית SAB < 90', '∠ABC < A', '5<AB']) {
      expect(foldGlyphs(s), s).toBe(s);
    }
  });

  it('the degree twins', () => {
    expect(foldGlyphs('∠ABC = 40⁰')).toBe('∠ABC = 40°');
    expect(foldGlyphs('∠ABC = 40º')).toBe('∠ABC = 40°');
    expect(foldGlyphs('∠ABC = 40˚')).toBe('∠ABC = 40°');
    expect(foldGlyphs('∠ABC = 40 º')).toBe('∠ABC = 40°');
  });

  it('…and a letter-like degree glyph away from a digit is left alone', () => {
    expect(foldGlyphs('nº ABC')).toBe('nº ABC');
    expect(foldGlyphs('˚AB')).toBe('˚AB');
  });

  it('«שורש» before a value is √', () => {
    expect(foldGlyphs('אורך AB הוא שורש 2')).toBe('אורך AB הוא √2');
    expect(foldGlyphs('AB = שורש(8)')).toBe('AB = √(8)');
    expect(foldGlyphs('|AB| = שורש 2')).toBe('|AB| = √2');
  });

  it('…and «שורש» with no value after it is left to the rules', () => {
    expect(foldGlyphs('שורש של AB')).toBe('שורש של AB');
    expect(foldGlyphs('שורשי המשוואה')).toBe('שורשי המשוואה');
  });

  it('is the identity on a sentence with no look-alike in it', () => {
    for (const s of ['משולש ABC', '∠ABC = 90°', 'AB ∥ CD', 'מעגל O', '']) expect(foldGlyphs(s), s).toBe(s);
  });

  it('every row carries its reason — the table is read, never grown silently (docs/17 §3)', () => {
    expect(GLYPH_FOLDS.length).toBeGreaterThan(0);
    for (const f of GLYPH_FOLDS) expect(f.why.length).toBeGreaterThan(20);
  });
});

/**
 * #2069 ([ADR-W-145](../../docs/06w-decisions-workspace.md#adr-w-145)) — the parallel look-alikes «‖» (U+2016) and
 * «||» fold to ∥ BETWEEN TWO OPERANDS only; every wrapping use of the same bars is untouched.
 */
describe('#2069 — «‖» and «||» are ∥ between two operands, never a wrapper', () => {
  it.each([
    ['AB ‖ CD', 'AB ∥ CD'],
    ['AB‖CD', 'AB∥CD'],
    ['AB || CD', 'AB ∥ CD'],
    ['AB||CD', 'AB∥CD'],
    ["AA' || BB'", "AA' ∥ BB'"],
    ['ℓ1 || ℓ2', 'ℓ1 ∥ ℓ2'],
    ['π1 ‖ π2', 'π1 ∥ π2'],
    ['u ‖ v', 'u ∥ v'],
    ['AB ‖ CD ‖ EF', 'AB ∥ CD ∥ EF'],
  ])('«%s» → «%s»', (line, folded) => {
    expect(foldGlyphs(line)).toBe(folded);
  });

  it.each(['‖u‖ = 5', '‖AB‖ = ‖CD‖', '|AB||CD|', '|AB|·|CD|', '|x|| y', '‖', '||', 'AB ‖', '|| CD'])('«%s» is untouched', (line) => {
    expect(foldGlyphs(line)).toBe(line);
  });
});
