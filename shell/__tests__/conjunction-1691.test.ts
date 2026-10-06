/**
 * #1691 (ADR-AG-239) — the shared fold of the spaced «ו-» conjunction, and its minus guard.
 *
 * The cross-builder half (every builder reads the spaced spellings the way it reads «ו-X») is the parity
 * rows `conj-space-*-1691-*` in `fixtures/geo-input-parity.ts`, run by each tree's thin lock through its
 * real submit decision. This file locks the fold itself — above all what it must NOT touch.
 */
import { describe, expect, it } from 'vitest';
import { foldConjunctionSpacing } from '../conjunction';

describe('foldConjunctionSpacing — the spaced conjunction is «ו-X» (#1691)', () => {
  it.each([
    ['AB ו- BC משיקים למעגל', 'AB ו-BC משיקים למעגל'],
    ['AB ו -BC משיקים למעגל', 'AB ו-BC משיקים למעגל'],
    ['AB ו - BC משיקים למעגל', 'AB ו-BC משיקים למעגל'],
    ['AB ו  -  BC', 'AB ו-BC'],
    ['מעגל M משיק לישרים l1 ו- l2', 'מעגל M משיק לישרים l1 ו-l2'],
    ['מעגל M משיק לישרים l1 ו - l2', 'מעגל M משיק לישרים l1 ו-l2'],
    ['מעגל O עובר דרך A ו- משיק לציר x', 'מעגל O עובר דרך A ו-משיק לציר x'],
    ['מעגל O עובר דרך A ו - משיק לציר x', 'מעגל O עובר דרך A ו-משיק לציר x'],
    ['D ו - E אמצעי AB ו - AC', 'D ו-E אמצעי AB ו-AC'],
    ['הנקודות A ו - B(3,4)', 'הנקודות A ו-B(3,4)'],
    ['AB ו־ BC', 'AB ו-BC'], // the maqaf
    ['ו- B על AC', 'ו-B על AC'], // at the start of the text
  ])('«%s» → «%s»', (typed, folded) => {
    expect(foldConjunctionSpacing(typed)).toBe(folded);
  });

  it.each([
    // already canonical
    'AB ו-BC משיקים למעגל',
    'חוצה זוית C וחוצה זוית B נפגשים בנקודה E',
    // THE MINUS GUARD — a hyphen with a space before it may be a sign glued to its operand
    'השורשים הם 2 ו -3',
    'השורשים הם 2 ו - 3',
    'הישרים y = x ו -y = 2x + 1',
    'הישרים y = x ו - y = 2x + 1',
    'ו -2x + y = 0',
    'הערכים a ו -a',
    'הנקודות P ו -(1,2)',
    // a word ending in «ו» is not the conjunction
    'שלו - AB',
    'קו -AB',
    // no conjunction at all
    'y = x - 2',
    'A(2,-3)',
  ])('leaves «%s» exactly as typed', (typed) => {
    expect(foldConjunctionSpacing(typed)).toBe(typed);
  });
});
