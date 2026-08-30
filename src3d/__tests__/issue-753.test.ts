/**
 * #753 (ADR-3D-188) — THE AREA HEAD TAKES ITS SUBJECT NOUN, and the vocabulary stops being two copies.
 *
 * «שטח ABC» answered; «שטח המשולש ABC» did not. The point, length and volume heads all gained their
 * subject noun in #642's sweep and this one could not: the polygon vocabulary lived only in
 * `parser/parse3.ts`, and `engine/queries.ts` may not import from `parser/`. The gates had already
 * drifted THREE times as private copies (#640, #642, the `\w*` suffix gate), so copying the list a
 * fourth time was refused and the hoist filed instead — the operator ruled option 1 on 2026-08-19.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { derive3, useGeo3 } from '../store/store3';
import { answerQuery } from '../engine/queries';
import { DECL_WORDS_HE, POLYGON_HE, SHAPE_SUBJ } from '../lexicon/nouns3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
function build(lines: string[]) {
  reset();
  for (const l of lines) useGeo3.getState().submit(l);
  const st = useGeo3.getState();
  return { c: derive3(st.facts, st.seed).construction, seed: st.seed };
}
/** the operator's 2026-08-29 figure: a framed cube plus the cross-section plane */
const CUBE = ["קובייה ABCDA'B'C'D'", '|AB| = 4', 'A(0,0,0)', 'B(4,0,0)', 'D(0,4,0)', "מישור DBB'D'"];

describe('#753 — the AREA head answers with the noun a student writes', () => {
  beforeEach(reset);

  it.each([
    ['שטח ABC', '8'],
    ['שטח המשולש ABC', '8'],
    ['שטח ABCD', '16'],
    ['שטח המרובע ABCD', '16'],
    ['area ABC', '8'],
    ['area of triangle ABC', '8'],
  ])('«%s» → %s', (q, expected) => {
    const { c, seed } = build(CUBE);
    expect(answerQuery(c, q, seed).answer).toBe(expected);
  });

  /**
   * The 2026-08-29 evidence, and the reason «מישור» is in the gate: the student has just typed
   * «מישור DBB'D'» into the fact list, so repeating that phrasing after «שטח» is the next keystroke.
   */
  it('«שטח מישור DBB\'D\'» answers identically to «שטח DBB\'D\'»', () => {
    const { c, seed } = build(CUBE);
    const bare = answerQuery(c, "שטח DBB'D'", seed).answer;
    expect(bare).not.toBeNull();
    expect(answerQuery(c, "שטח מישור DBB'D'", seed).answer).toBe(bare);
  });

  it('the noun is OPTIONAL, never required — naming the shape is a courtesy', () => {
    const { c, seed } = build(CUBE);
    for (const q of ['שטח ABC', 'area ABC', "שטח DBB'D'"]) expect(answerQuery(c, q, seed).answer, q).not.toBeNull();
  });

  it('a noun that does not name a shape is still not a subject', () => {
    const { c, seed } = build(CUBE);
    expect(answerQuery(c, 'שטח הכלב ABC', seed).answer).toBeNull();
  });
});

describe('#753 — ONE vocabulary, not two copies', () => {
  /**
   * The property the issue is really about. These assert the SEAM rather than a spelling: the parser
   * must read its nouns from the lexicon leaf, and the leaf must import nothing — otherwise `engine/`
   * could not depend on it and the copy would come back.
   */
  it('the lexicon leaf imports NOTHING — that is what lets both layers depend on it', () => {
    const src = readFileSync(join(__dirname, '..', 'lexicon', 'nouns3.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
  });

  it('the parser reads its noun list from the leaf, and keeps no private copy', () => {
    const src = readFileSync(join(__dirname, '..', 'parser', 'parse3.ts'), 'utf8');
    expect(src).toMatch(/from '\.\.\/lexicon\/nouns3'/);
    expect(src).not.toContain("const DECL_WORDS_HE = ["); // the copy is gone, not shadowed
  });

  it('the query lane reads the same leaf', () => {
    const src = readFileSync(join(__dirname, '..', 'engine', 'queries.ts'), 'utf8');
    expect(src).toMatch(/from '\.\.\/lexicon\/nouns3'/);
  });

  it('the polygon words are IN the declaration vocabulary — one list, composed, not two', () => {
    for (const w of POLYGON_HE) expect(DECL_WORDS_HE).toContain(w);
  });

  it('the shape subject gate is optional and matches nothing on its own', () => {
    expect(new RegExp(`^${SHAPE_SUBJ}$`).test('')).toBe(true);
  });
});
