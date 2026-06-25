import { describe, it, expect } from 'vitest';
import { parse } from '@/parser/parse';

/**
 * Area subscript notation S_{ABC} / S_ABC normalises to the glued compact form SABC (ADR-121),
 * so the textbook form a student actually writes (and the S_{} toolbar button inserts) is accepted
 * everywhere the area rule (ADR-118) reads SABC. The glued form keeps working unchanged.
 */
const ctx = { circles: [] as string[] };
const area = (u: string) => {
  const r = parse(u, ctx);
  return r.ok ? r.commands : null;
};

describe('area subscript notation (ADR-121)', () => {
  it('S_{ABC} = 13 → measure-area on A,B,C', () => {
    expect(area('S_{ABC} = 13')).toEqual([{ type: 'measure-area', ids: ['A', 'B', 'C'], expr: { value: 13 } }]);
  });

  it('S_ABC = 13 (no braces) → same', () => {
    expect(area('S_ABC = 13')).toEqual([{ type: 'measure-area', ids: ['A', 'B', 'C'], expr: { value: 13 } }]);
  });

  it('SABC = 13 (glued, legacy) still works', () => {
    expect(area('SABC = 13')).toEqual([{ type: 'measure-area', ids: ['A', 'B', 'C'], expr: { value: 13 } }]);
  });

  it('S_{ABCD} = 20 → quad', () => {
    expect(area('S_{ABCD} = 20')).toEqual([{ type: 'measure-area', ids: ['A', 'B', 'C', 'D'], expr: { value: 20 } }]);
  });

  it('ratio S_{ABC}/S_{DEF} = 3/4 → set-area-ratio k=0.75', () => {
    expect(area('S_{ABC}/S_{DEF} = 3/4')).toEqual([
      { type: 'set-area-ratio', ids1: ['A', 'B', 'C'], ids2: ['D', 'E', 'F'], k: 0.75 },
    ]);
  });

  it('label S_{ABC} = S → measure-area var S', () => {
    expect(area('S_{ABC} = S')).toEqual([{ type: 'measure-area', ids: ['A', 'B', 'C'], expr: { coef: 1, var: 'S' } }]);
  });

  it('the empty template S_{} = 13 is not-handled (incomplete, until vertices are typed)', () => {
    expect(area('S_{} = 13')).toBeNull();
  });

  it('safe scoping: S_{AB} (only 2 labels — not a polygon) is not treated as an area', () => {
    expect(area('S_{AB} = 13')).toBeNull();
  });

  it('safe scoping: a normal segment length AB = 6 is untouched', () => {
    expect(area('AB = 6')).toEqual([
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'set-distance', a: 'A', b: 'B', value: 6 },
    ]);
  });

  // A ratio with a COEFFICIENT glued to the 2nd area marker — "S_{ACD}=4S_{NCE}" — used to fail
  // (operator session id4dn4a2): both the area-ref regex and the subscript normalizer required a word
  // boundary before S, which the digit "4" breaks (digit↔S is no \b). Fixed with `(?<![A-Za-z])`.
  const ratioK4 = [
    { type: 'set-area-ratio', ids1: ['A', 'C', 'D'], ids2: ['N', 'C', 'E'], k: 4 },
  ];
  it('S_{ACD}=4S_{NCE} (coefficient glued to the subscript marker)', () => {
    expect(area('S_{ACD}=4S_{NCE}')).toEqual(ratioK4);
  });
  it('SACD=4SNCE (glued, no subscript)', () => {
    expect(area('SACD=4SNCE')).toEqual(ratioK4);
  });
  it('S_{ACD}=4 S_{NCE} (with a space) still works', () => {
    expect(area('S_{ACD}=4 S_{NCE}')).toEqual(ratioK4);
  });
});
