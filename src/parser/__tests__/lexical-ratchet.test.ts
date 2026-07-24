/**
 * The lexical RATCHET (S2.1 of docs/24) — inline re-spellings of the lexical atoms can only go DOWN.
 *
 * docs/23 measured the debt: the point-label fragment inlined 342× in parse.ts / 163× in parse3.ts,
 * the number fragment 31×/24× — and the recurring "proxy-signal" lexical defect family (ADR-3D-068/
 * 069/071, the זוית sweeps, the מאונ[ךכ] trap) is generated exactly by every rule re-deriving token
 * structure from a raw string. The atoms now live in ONE place (`src/parser/lexicon.ts`, a docs/17 §3
 * registered chokepoint). A full mechanical sweep of the existing sites was deliberately NOT done in
 * one night (blind regex substitution can renumber capture groups); instead this ratchet records the
 * exact current counts and fails on ANY growth — so new rules must compose from the atoms, and every
 * sweep that retires inline copies lowers the recorded ceiling (update the constant DOWNWARD only).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');
const parse2 = readFileSync(path.join(root, 'src/parser/parse.ts'), 'utf8');
const parse3 = readFileSync(path.join(root, 'src3d/parser/parse3.ts'), 'utf8');

const count = (src: string, literal: string): number => src.split(literal).length - 1;

// The recorded ceilings (2026-07-24 baselines). LOWER when you sweep; NEVER raise — compose new
// regexes from src/parser/lexicon.ts atoms instead of inlining a fresh fragment.
const CEILINGS = {
  parse2Label: 342, // '[A-Za-z]\d*' in parse.ts
  parse2Num: 31, //    '\d+(?:\.\d+)?' in parse.ts
  parse3Label: 163, // '[A-Z]\d*' in parse3.ts
  parse3Num: 24, //    '\d+(?:\.\d+)?' in parse3.ts
};

describe('lexical ratchet — inline fragment counts must not grow (docs/24 S2.1)', () => {
  it('parse.ts label-token inlines ≤ ceiling', () => {
    expect(count(parse2, String.raw`[A-Za-z]\d*`)).toBeLessThanOrEqual(CEILINGS.parse2Label);
  });
  it('parse.ts number-fragment inlines ≤ ceiling', () => {
    expect(count(parse2, String.raw`\d+(?:\.\d+)?`)).toBeLessThanOrEqual(CEILINGS.parse2Num);
  });
  it('parse3.ts label-token inlines ≤ ceiling', () => {
    expect(count(parse3, String.raw`[A-Z]\d*`)).toBeLessThanOrEqual(CEILINGS.parse3Label);
  });
  it('parse3.ts number-fragment inlines ≤ ceiling', () => {
    expect(count(parse3, String.raw`\d+(?:\.\d+)?`)).toBeLessThanOrEqual(CEILINGS.parse3Num);
  });
  it('non-vacuity: the counters actually see the fragments', () => {
    expect(count(parse2, String.raw`[A-Za-z]\d*`)).toBeGreaterThan(100);
    expect(count(parse3, String.raw`[A-Z]\d*`)).toBeGreaterThan(50);
  });
});
