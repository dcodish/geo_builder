/**
 * The wrap-selection insert core (docs/28 §4a D5): an empty selection IS a caret insert, and the
 * 2-D caret-back cases fall out of `after` — the behaviour that makes wrap-selection strictly
 * subsume caret-insert, asserted rather than claimed.
 */
import { describe, expect, it } from 'vitest';
import { applySymbol, type SymbolSpec } from '../symbols';

const abs: SymbolSpec = { label: '|z|', titleKey: 'symAbs', before: '|', after: '|' };
const conj: SymbolSpec = { label: 'z̄', titleKey: 'symConj', before: 'conj(', after: ')' };
const theta: SymbolSpec = { label: 'θ', titleKey: 'symTheta', before: 'θ' };

describe('applySymbol — the wrap-selection core', () => {
  it('wraps the current selection', () => {
    // select `z1` inside `w = z1` and press |·|
    const r = applySymbol('w = z1', 4, 6, abs);
    expect(r.value).toBe('w = |z1|');
    expect(r.caret).toBe(7); // after the selection, before the closing `|`
  });

  it('an empty selection is a caret insert — the wrap halves land around the caret', () => {
    const r = applySymbol('w = ', 4, 4, conj);
    expect(r.value).toBe('w = conj()');
    expect(r.caret).toBe(9); // between the parens — the 2-D `caretBack` case, subsumed
  });

  it('a plain symbol (no `after`) inserts at the caret', () => {
    const r = applySymbol('z1 = 2cis', 9, 9, theta);
    expect(r.value).toBe('z1 = 2cisθ');
    expect(r.caret).toBe(10);
  });

  it('inserts mid-string without disturbing the tail', () => {
    const r = applySymbol('z1 = 24', 5, 7, abs);
    expect(r.value).toBe('z1 = |24|');
    expect(r.caret).toBe(8);
  });

  it('clamps an out-of-range selection instead of corrupting the value', () => {
    const r = applySymbol('ab', 1, 99, abs);
    expect(r.value).toBe('a|b|');
    const r2 = applySymbol('ab', -3, 1, abs);
    expect(r2.value).toBe('|a|b');
  });

  it('a reversed selection is treated as empty at its start (never a negative slice)', () => {
    const r = applySymbol('abc', 2, 1, abs);
    expect(r.value).toBe('ab||c');
    expect(r.caret).toBe(3);
  });
});
