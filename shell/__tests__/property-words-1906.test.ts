/**
 * #1906 ([ADR-W-144](../../docs/06w-decisions-workspace.md#adr-w-144)) — the shared property-word reader, as algebra:
 * the edit distance, the match (fold, peel, inflect, near miss, phrase), the lexicon veto, and the one merge.
 * The vocabulary here is a toy one: the reader owns no vocabulary (ADR-W-016); each tree's lock runs the shared rows
 * (`fixtures/honesty-rows.ts`) through its own.
 */
import { describe, expect, it } from 'vitest';
import { editDistance, mergeWordItems, propertyWords, withSpan, type PropertyPhrase, type WordReaderSpec } from '../llm/honestyCore';

const fold = (w: string): string => w.toLowerCase().replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/וו/g, 'ו').replace(/יי/g, 'י');
const SPEC: WordReaderSpec = {
  fold,
  clitics: 'הב',
  inflections: ['ים', 'ית', 's'],
  readsWord: (w) => ['מקבילים'].includes(w),
};
const VOCAB: PropertyPhrase<string>[] = [
  { slots: [['שווה'], ['צלעות']], props: ['equilateral'] },
  { slots: [['מקבילית']], props: ['parallelogram'] },
  { slots: [['מלבן']], props: ['rectangle'] },
  { slots: [['גובה']], props: ['altitude'] },
  { slots: [['right']], props: ['right'], nearMiss: false },
  { slots: [['isosceles']], props: ['isosceles'] },
];
const read = (s: string) => propertyWords(s, VOCAB, SPEC).map((o) => ({ text: o.text, exact: o.exact, props: o.candidates.flatMap((c) => c.phrase.props) }));

describe('#1906 — the edit distance', () => {
  it.each([
    ['abc', 'abc', 0],
    ['isoceles', 'isosceles', 1], // a deletion
    ['rigth', 'right', 1], // a swap of two neighbours
    ['גובח', 'גובה', 1], // a substitution
    ['abc', 'abcde', 2],
    ['abc', 'xyzuv', 3], // past the cap
  ] as const)('%s ↔ %s = %d', (a, b, d) => {
    expect(editDistance(a, b)).toBe(d);
  });
});

describe('#1906 — the match', () => {
  it('a word, an inflection, a fold and a clitic are the word itself', () => {
    expect(read('המלבן ABCD')).toEqual([{ text: 'המלבן', exact: true, props: ['rectangle'] }]);
    expect(read('מלבנים')).toEqual([{ text: 'מלבנים', exact: true, props: ['rectangle'] }]);
    expect(read('מלבנ ABCD')).toEqual([{ text: 'מלבנ', exact: true, props: ['rectangle'] }]); // final-letter fold
    expect(read('משולש שוה צלעות')).toEqual([{ text: 'שוה צלעות', exact: true, props: ['equilateral'] }]); // «וו» fold
  });
  it('one edit from a word of four letters or more is a near miss, and names the word', () => {
    expect(read('משולש שווה צלעת ABC')).toEqual([{ text: 'שווה צלעת', exact: false, props: ['equilateral'] }]);
    expect(read('AD גובח')).toEqual([{ text: 'גובח', exact: false, props: ['altitude'] }]);
    expect(read('isoceles ABC')).toEqual([{ text: 'isoceles', exact: false, props: ['isosceles'] }]);
  });
  it('a phrase needs its words adjacent and in order', () => {
    expect(read('צלעות שווה')).toEqual([]);
    expect(read('שווה את צלעות')).toEqual([]);
    expect(read('שווה-צלעות')).toEqual([{ text: 'שווה-צלעות', exact: true, props: ['equilateral'] }]);
  });
  it('a word the lexicon reads as itself is never a near miss of another', () => {
    expect(read('AB ו-CD מקבילים')).toEqual([]);
  });
  it('a phrase marked exact-only takes no near miss', () => {
    expect(read('eight')).toEqual([]);
    expect(read('right')).toEqual([{ text: 'right', exact: true, props: ['right'] }]);
  });
  it('two edits is never a match', () => {
    expect(read('גובהח')).toEqual([{ text: 'גובהח', exact: false, props: ['altitude'] }]); // one insertion: one edit
    expect(read('גוביח')).toEqual([]); // a substitution and an insertion: two edits
  });
  it('a label run is never a word', () => {
    expect(read('ABCD')).toEqual([]);
  });
  it('withSpan writes the word spelt right', () => {
    const [o] = propertyWords('משולש שווה צלעת ABC', VOCAB, SPEC);
    expect(withSpan('משולש שווה צלעת ABC', o.start, o.end, o.candidates[0].canonical)).toBe('משולש שווה צלעות ABC');
  });
});

describe('#1906 — the one merge', () => {
  it('a construct noun inside the word phrase gives way to the phrase', () => {
    expect(mergeWordItems(['מעגל'], ['מעגל חסומ'])).toEqual(['מעגל חסומ']);
  });
  it('an older gate naming the same word keeps its own naming', () => {
    expect(mergeWordItems(['ישר-זוית'], ['ישר-זויתי'])).toEqual(['ישר-זוית']);
    expect(mergeWordItems(['שווה צלעות'], ['שווה צלעות'])).toEqual(['שווה צלעות']);
  });
  it('unrelated items are all kept, the words first', () => {
    expect(mergeWordItems(['D', '5'], ['גובה'])).toEqual(['גובה', 'D', '5']);
  });
});
