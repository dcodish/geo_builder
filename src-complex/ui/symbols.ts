/**
 * The symbol palette — the characters this tool OFFERS the student, declared once as a MODULE.
 *
 * The #482 discipline arriving in the third builder: living inline in the JSX is how a palette
 * drifts from the bidi run alphabet and from the grammar. The SHAPE is the shared
 * `shell/symbols` contract (wrap-selection insert, docs/28 §4a D5); the DATA is this product's
 * own — the operator's #525 ruling: only relevant symbols appear per tool, and the complex set
 * diverges most.
 *
 * Wrapping symbols enclose the current selection; plain symbols insert at the caret. Everything
 * offered must PARSE — locked by `__tests__/symbols-module.test.ts`, which drives every entry
 * through the real grammar (the #511 rule: a builder must never offer a glyph it refuses in
 * every position).
 */
import type { SymbolSpec } from '../../shell/symbols';

export const SYMBOLS: readonly SymbolSpec[] = [
  { label: 'z̄', titleKey: 'symConj', before: 'conj(', after: ')' },
  { label: '|z|', titleKey: 'symAbs', before: '|', after: '|' },
  { label: '1/z', titleKey: 'symInv', before: '1/(', after: ')' },
  { label: 'Re', titleKey: 'symRe', before: 're(', after: ')' },
  { label: 'Im', titleKey: 'symIm', before: 'im(', after: ')' },
  { label: 'cis', titleKey: 'symCis', before: 'cis ' },
  { label: 'i', titleKey: 'symI', before: 'i' },
  { label: '°', titleKey: 'symDeg', before: '°' },
  { label: 'xⁿ', titleKey: 'symPow', before: '^' },
  { label: '·', titleKey: 'symMul', before: '*' },
  { label: 'θ', titleKey: 'symTheta', before: 'θ' },
  { label: 'α', titleKey: 'symAlpha', before: 'α' },
  { label: 'β', titleKey: 'symBeta', before: 'β' },
];
