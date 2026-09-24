/**
 * #1357 — the shared positive junk test (`shell/llm/constructionSignal.ts`), on its own.
 *
 * The product locks (`junk-before-llm-1357.test.ts` in 2-D, 3-D and analytic) prove each seam asks it and
 * that no catalog line scores zero. This file pins what a SIGNAL is, so a product vocabulary cannot be
 * blamed for a change in the shared rule.
 */
import { describe, expect, it } from 'vitest';
import { hasConstructionSignal } from '../llm/constructionSignal';

const NONE = /(?!)/; // a vocabulary that matches nothing: only labels and symbols count

describe('#1357 — what counts as a construction signal', () => {
  it.each(['A', 'AB', "A'", 'P1', 'משולש ABC', 'point D on AB'])('a POINT LABEL: «%s»', (s) => {
    expect(hasConstructionSignal(s, NONE)).toBe(true);
  });

  it.each(['x = 5', '∠ = 30', 'a ⊥ b', 'r^2', '|z|'])('a RELATION SYMBOL: «%s»', (s) => {
    expect(hasConstructionSignal(s, NONE)).toBe(true);
  });

  it('a word of the caller\'s vocabulary', () => {
    expect(hasConstructionSignal('זווית ישרה', /זו?וי/)).toBe(true);
    expect(hasConstructionSignal('זווית ישרה', NONE)).toBe(false);
  });

  it.each(['12345', 'xkcd 42 zz', 'Hello there', 'Lorem Ipsum', 'hello there friend', 'שלום מה נשמע', '!!!!', '....', ''])(
    'NOT a signal: «%s» — a digit alone, the capital of a word, punctuation, free text',
    (s) => {
      expect(hasConstructionSignal(s, NONE)).toBe(false);
    },
  );
});
