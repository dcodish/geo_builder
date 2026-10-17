/**
 * #2217 ([ADR-691](../../../docs/06-decisions.md#adr-691)) — `autosInterchangeable` reads an EQUALITY of two lengths (a
 * `ratio` with k = 1 and no offset) as unordered; any other ratio, and a stated size, still tell the pair apart.
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import { factsOf } from '@/__tests__/scenario-pipeline';
import type { Construction } from '@/engine';

const figureOf = (lines: string[]) => replay(factsOf(lines), 0);
const interchangeable = (construction: Construction, positions: ReturnType<typeof replay>['positions']) =>
  buildParseCtx(construction, positions).autosInterchangeable;

describe('#2217 — the equality is unordered', () => {
  it.each(['שני מעגלים משיקים ברדיוסים שווים', 'שני מעגלים זרים ברדיוסים שווים', 'שני מעגלים משיקים ששטחם שווה'])('«%s» → interchangeable', (line) => {
    const f = figureOf([line]);
    expect(f.construction.constraints.some((k) => k.type === 'ratio' && k.k === 1)).toBe(true);
    expect(interchangeable(f.construction, f.positions)).toBe(true);
  });

  it('the same pair with k = 2 is NOT interchangeable (r_O = 2·r_P is not r_P = 2·r_O)', () => {
    const f = figureOf(['שני מעגלים משיקים ברדיוסים שווים']);
    const constraints = f.construction.constraints.map((k) => (k.type === 'ratio' ? { ...k, k: 2 } : k));
    expect(interchangeable({ ...f.construction, constraints }, f.positions)).toBe(false);
  });

  it('a k = 1 ratio with an offset is NOT interchangeable (|ab| = |cd| + 2 is ordered)', () => {
    const f = figureOf(['שני מעגלים משיקים ברדיוסים שווים']);
    const constraints = f.construction.constraints.map((k) => (k.type === 'ratio' ? { ...k, add: 2 } : k));
    expect(interchangeable({ ...f.construction, constraints }, f.positions)).toBe(false);
  });

  it('a stated radius on one circle still tells them apart (unchanged)', () => {
    const f = figureOf(['שני מעגלים משיקים', 'רדיוס מעגל O הוא 5']);
    expect(interchangeable(f.construction, f.positions)).toBe(false);
  });

  it('the pair without the equality stays interchangeable (unchanged)', () => {
    const f = figureOf(['שני מעגלים משיקים']);
    expect(interchangeable(f.construction, f.positions)).toBe(true);
  });
});
