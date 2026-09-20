/**
 * #1260 — THE TWO TREES THAT WIDEN A LENGTH GIVEN'S CONNECTIVE MUST MEAN THE SAME THING BY «IS».
 *
 * 2-D decides whether a length sentence is an equality with `LENGTH_COPULA` (ADR-524 Am. 1, the
 * inverted guard that closed a P1); analytic does the same with `COPULA_WORDS` (#1260, the port).
 * The mechanism is deliberately duplicated rather than shared: the `lexicon` layer's cross-product
 * sharing is recorded UNDECIDED in `BOUNDARIES.json` (ADR-W-003), and `shell/` may not import a
 * product tree in any case (ADR-W-016 rule 2).
 *
 * Duplication without a net is how the trees drift, and #1260's own issue names the cost: *"two trees
 * with two notions of what a copula is, is how the next P1 arrives."* This is the net.
 *
 * **It reads each tree's real definition out of its source and runs it**, rather than restating the
 * vocabulary here — a lock that reproduces the decision it guards stays green through the change that
 * breaks it (#1102/#1118). The word list below is only the PROBE; which words are copulas is answered
 * by the patterns themselves.
 *
 * The two are not textually identical and are not meant to be. 2-D's connective may be EMPTY (it
 * locates the value positionally inside a verbose length phrase) while analytic's is what splits the
 * sentence in two, so it is required. That difference is asserted, not smoothed over.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
/** BOM-tolerant read — a Windows editor's BOM must not turn into a parse crash here. */
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');

/** 2-D: `const LENGTH_COPULA = new RegExp(String.raw`…`);` — the whole connective, optional. */
function twoDConnective(): (conn: string) => boolean {
  const src = read('src/parser/parse.ts');
  const m = /const LENGTH_COPULA = new RegExp\(String\.raw`([^`]+)`\)/.exec(src);
  expect(m, 'src/parser/parse.ts no longer defines LENGTH_COPULA as a String.raw regexp').not.toBeNull();
  const re = new RegExp(m![1]);
  return (conn) => re.test(conn);
}

/** analytic: `const COPULA_WORDS = '…';` — the alternation of words, without the `=` or the spacing. */
function analyticWord(): (word: string) => boolean {
  const src = read('src-analytic/parser/parseAnalytic.ts');
  const m = /const COPULA_WORDS = '([^']+)';/.exec(src);
  expect(
    m,
    'src-analytic/parser/parseAnalytic.ts no longer defines COPULA_WORDS as a single-quoted string',
  ).not.toBeNull();
  // The source is a TS string literal, so `\\s` in the file is `\s` in the value.
  const re = new RegExp(`^(?:${m![1].replace(/\\\\/g, '\\')})$`);
  return (word) => re.test(word);
}

/**
 * THE PROBE. Each row is a connective a student might write between a length and its value. Whether
 * it is a copula is decided by the two patterns, never here — the rows carry no expectation of their
 * own, only the requirement that the two trees agree.
 */
const CONNECTIVES = [
  'הוא',
  'היא',
  'הם',
  'הן',
  'שווה',
  'שווה ל',
  // bounds — the #1248 P1's own rows, which must be copulas in NEITHER tree
  'גדול מ',
  'קטן מ',
  'לפחות',
  'לכל היותר',
  'פי',
  'יחס',
];

describe('#1260 — 2-D and analytic agree on what "is" means', () => {
  const twoD = twoDConnective();
  const analytic = analyticWord();

  it.each(CONNECTIVES)('«%s» is a copula in both trees or in neither', (conn) => {
    // 2-D reads the whole connective (leading/trailing space and punctuation are part of its pattern);
    // analytic reads the word alone, its spacing supplied by the rule that embeds it.
    expect(twoD(` ${conn} `)).toBe(analytic(conn));
  });

  it('the bound words are copulas in NEITHER tree — #1248 stated as a property, not a row count', () => {
    for (const bound of ['גדול מ', 'קטן מ', 'לפחות', 'לכל היותר', 'פי', 'יחס']) {
      expect(twoD(` ${bound} `), `2-D read «${bound}» as a copula`).toBe(false);
      expect(analytic(bound), `analytic read «${bound}» as a copula`).toBe(false);
    }
  });

  it('the difference that IS intended: 2-D admits an empty connective and analytic does not', () => {
    expect(twoD(' ')).toBe(true);
    expect(analytic('')).toBe(false);
  });
});
