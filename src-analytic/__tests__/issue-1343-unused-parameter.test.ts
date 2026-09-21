/**
 * #1343 (amends ADR-AG-144) — a declared parameter NOTHING uses is never printed as a value.
 *
 * Operator, 2026-09-21, playing PR #1341 T15: *"the (לא בשימוש בשרטוט) is not there"*. Measured, the row
 * printed `m = -3.46` — a sampled value as knowledge — because `figureSignature` signed points and curves
 * only, so every seed of a figure whose parameter nothing drew was ONE configuration to the gate, and one
 * sample read as certainty (the #1282 shape, for the environment).
 *
 * Two chokepoints, not the row: the signature signs the parameters the figure USES, and "used" is decided
 * by objects AND constraints (`usedSymbols`), so a `k` an area given pins is not called unused.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { distinctConfigSeeds, figureSignature, isKnowledge } from '../engine/evaluate';
import { usedSymbols } from '../engine/carriers';
import { anotherConfiguration } from '../app/another';

const knowledgeOf = (lines: string[], sym: string) => {
  const c = derive(lines).construction;
  return isKnowledge(c, (f) => f.env[sym] ?? null);
};

describe('#1343 — a parameter nothing uses is never knowledge', () => {
  const UNUSED = ['נתון הישר l1: y=2x', 'm<0'];

  it('the operator’s two lines: m is not used, and is not knowledge — before: known, value -3.4579', () => {
    const c = derive(UNUSED).construction;
    expect(usedSymbols(c).has('m')).toBe(false);
    // The gate would still answer over one configuration; the row must not ask it, and the ADR records why.
    expect([...usedSymbols(c)]).toEqual([]);
  });

  it('«k הוא פרמטר» alone is declared, unused, and its row is its domain — never a number', () => {
    const c = derive(['k הוא פרמטר']).construction;
    expect(usedSymbols(c).has('k')).toBe(false);
  });

  it('a parameter used only by a CONSTRAINT is used, and pinned by it — «שטח המשולש ABC הוא k» prints k = 9', () => {
    const lines = ['A(0,0)', 'B(6,0)', 'C(0,3)', 'שטח המשולש ABC הוא k'];
    const c = derive(lines).construction;
    expect(usedSymbols(c).has('k')).toBe(true);
    const k = knowledgeOf(lines, 'k');
    expect(k.known && Math.abs(k.value - 9) < 1e-4).toBe(true);
  });

  it('a used, unpinned parameter is NOT knowledge — the bisector’s a moves with the seed', () => {
    const lines = ['A(0,0)', 'B(8a,0)', 'נקודה M', 'MA = MB'];
    expect(knowledgeOf(lines, 'a').known).toBe(false);
    expect(distinctConfigSeeds(derive(lines).construction).length).toBeGreaterThan(1);
  });

  it('a pinned parameter is still knowledge — «N על הישר l3» gives k = 2 (ADR-AG-144 unchanged)', () => {
    const k = knowledgeOf(['k הוא פרמטר', 'נתון הישר l3: (k+1)x+2y-12+5k=0', 'N(-2,4)', 'N על הישר l3'], 'k');
    expect(k.known && Math.abs(k.value - 2) < 1e-4).toBe(true);
  });

  it('the signature carries a USED parameter, so two seeds that differ only in it are two configurations', () => {
    // A stated point whose coordinate carries a parameter: the point moves, and so does `a` — both sign.
    const c = derive(['A(a,0)', 'B(0,0)']).construction;
    const sigs = new Set([0, 1, 2].map((s) => figureSignature(derive(['A(a,0)', 'B(0,0)'], s).figure)));
    expect(sigs.size).toBeGreaterThan(1);
    expect(usedSymbols(c).has('a')).toBe(true);
  });

  it('…and NOT an unused one: «הציגו תצורה אחרת» on the operator’s figure stays honest and finds nothing', () => {
    expect(anotherConfiguration(UNUSED, 0).found).toBe(false);
    const sigs = new Set([0, 1, 2].map((s) => figureSignature(derive(UNUSED, s).figure)));
    expect(sigs.size).toBe(1);
  });

  it('a free direction’s angle never signs — θ and θ + π are one line', () => {
    const lines = ['N(1,2)', 'דרך N עובר ישר l4', 'שיפוע הישר l4 הוא 2'];
    const sigs = new Set([0, 1, 2, 3].map((s) => figureSignature(derive(lines, s).figure)));
    expect(sigs.size).toBe(1);
  });
});
