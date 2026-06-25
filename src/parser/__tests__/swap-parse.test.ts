/**
 * parseSwap (ADR-122): "swap C and D" / "החלף בין C ל-D" route to the store's swap, distinct from
 * rename. Critically, the `swap` keyword was REMOVED from parseRename (it used to be there, so
 * "swap C and D" became rename(C,D) → "target taken" error).
 */
import { describe, it, expect } from 'vitest';
import { parseSwap, parseRename } from '@/parser';

describe('parseSwap', () => {
  it('English "swap C and D"', () => expect(parseSwap('swap C and D')).toEqual({ a: 'C', b: 'D' }));
  it('English "swap C with D"', () => expect(parseSwap('swap C with D')).toEqual({ a: 'C', b: 'D' }));
  it('English "swap C ↔ D"', () => expect(parseSwap('swap C ↔ D')).toEqual({ a: 'C', b: 'D' }));
  it('Hebrew "החלף בין C ל-D"', () => expect(parseSwap('החלף בין C ל-D')).toEqual({ a: 'C', b: 'D' }));
  it('Hebrew "החלף בין C ו-D"', () => expect(parseSwap('החלף בין C ו-D')).toEqual({ a: 'C', b: 'D' }));
  it('Hebrew "החלף בין C לבין D"', () => expect(parseSwap('החלף בין C לבין D')).toEqual({ a: 'C', b: 'D' }));

  it('a plain rename is NOT a swap', () => {
    expect(parseSwap('rename C to E')).toBeNull();
    expect(parseSwap('שנה שם C ל-E')).toBeNull();
  });
  it('same label is not a swap', () => expect(parseSwap('swap C and C')).toBeNull());
});

describe('parseRename no longer swallows "swap"', () => {
  it('"swap C and D" is NOT a rename (it would have been rename(C,D) → target-taken)', () => {
    expect(parseRename('swap C and D')).toBeNull();
  });
  it('the Hebrew swap "החלף בין C ל-D" is NOT a rename', () => {
    expect(parseRename('החלף בין C ל-D')).toBeNull();
  });
  it('but the replace-style rename "החלף C ב-D" still renames', () => {
    expect(parseRename('החלף C ב-D')).toEqual({ from: 'C', to: 'D' });
  });
});
