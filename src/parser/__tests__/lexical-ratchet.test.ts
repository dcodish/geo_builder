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
import { ANGLE_KW, EN_START, enWord } from '../lexicon';

const root = path.resolve(__dirname, '../../..');
const parse2 = readFileSync(path.join(root, 'src/parser/parse.ts'), 'utf8');
const parse3 = readFileSync(path.join(root, 'src3d/parser/parse3.ts'), 'utf8');

const count = (src: string, literal: string): number => src.split(literal).length - 1;

// The recorded ceilings (2026-07-24 baselines). LOWER when you sweep; NEVER raise — compose new
// regexes from src/parser/lexicon.ts atoms instead of inlining a fresh fragment.
const CEILINGS = {
  // #1790 (ADR-595): the inscription rules read their shape through src/parser/shapePhrase.ts and the incircle's
  // circumscribes pattern composes the LABEL atom — lowered to the measured count (342 → 334, earlier drift included).
  // #1814 (ADR-600): the number gate's subscript blank composes NAME_LETTER (shell/indexedName) — 334 → 333.
  parse2Label: 333, // '[A-Za-z]\d*' in parse.ts
  // #2065 (ADR-700): the two-term ratio patterns share one `UDEC` spelling — 31 → 30.
  parse2Num: 30, //    '\d+(?:\.\d+)?' in parse.ts
  parse3Label: 163, // '[A-Z]\d*' in parse3.ts
  // #513 (ADR-3D-135) swept parse3's number fragment onto the new `UNUM` atom while widening the
  // radicand: 24 → 14. The ratchet worked exactly as designed — it caught the fix inlining fresh
  // copies, and the fix composed from an atom instead.
  parse3Num: 13, //    '\d+(?:\.\d+)?' in parse3.ts
  // #2008 (ADR-635): the LEGACY decimal coefficient atom `COEF` stops at a slash — «1/2∠B» read 2, «בקוטר 3/2» read 3.
  // Every slot that reads a stated coefficient composes the shared NUMEXPR atom (ADR-298) instead; the sweep took
  // the uses 33 → 22 (the NUMTERM atom itself is five of them). The sites left REQUIRE the next token right after
  // the number (a π, a letter, a √, `$`), so a quotient fails to match and escalates — it is never truncated.
  parse2Coef: 22, // '${COEF}' in parse.ts
  // #2195 (ADR-738): the angle-family rules test and strip the lexicon's bounded ANGLE_KW; the unbounded inline
  // English noun matched inside «tri**angle**» / «**angle**d» and handed «tri» / «d» to the label reader. 18 → 4 (a doc
  // comment, a coefficient finder that reads no label, a copula rewrite, and a gate's atom classifier).
  parse2AngleInline: 4, // 'angle|∠' in parse.ts
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
  it('parse.ts legacy-decimal COEF uses ≤ ceiling (#2008 — a coefficient slot reads NUMEXPR)', () => {
    expect(count(parse2, '${COEF}')).toBeLessThanOrEqual(CEILINGS.parse2Coef);
    expect(count(parse2, '${COEF}')).toBeGreaterThan(0);
  });
  it('parse.ts inline angle-noun alternations ≤ ceiling (#2195 — compose ANGLE_KW)', () => {
    expect(count(parse2, 'angle|∠')).toBeLessThanOrEqual(CEILINGS.parse2AngleInline);
  });
  it('#2195: an English keyword atom is bounded on BOTH sides (enWord carries the leading guard)', () => {
    expect(enWord('parallel').startsWith(EN_START)).toBe(true);
    expect(ANGLE_KW).toContain(EN_START);
  });
  it('non-vacuity: the counters actually see the fragments', () => {
    expect(count(parse2, String.raw`[A-Za-z]\d*`)).toBeGreaterThan(100);
    expect(count(parse3, String.raw`[A-Z]\d*`)).toBeGreaterThan(50);
  });
});
