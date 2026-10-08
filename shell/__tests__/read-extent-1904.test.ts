/**
 * #1904 (ADR-604, ADR-W-120) — `readWords`, the word class of `shell/readExtent.ts`, on a toy reader: an occurrence is
 * read when DELETING it changes the reading; the same word twice, read together, is a co-reference.
 */
import { describe, expect, it } from 'vitest';
import { readWords, type Reader } from '../readExtent';

/** A toy grammar: it reads the FIRST role word of the line and nothing after it. */
const firstRole: Reader<string> = {
  read: (t) => t.match(/\b(alt|med)\b/)?.[1] ?? null,
  same: (a, b) => a === b,
};
const WORD = /\b(?:the\s+)?(alt|med)\b/g;

describe('readWords — a word whose deletion changes nothing was not read', () => {
  it('flags the second role and only it', () => {
    const r = readWords('AD alt to BC which is also the med', 'alt', firstRole, WORD);
    expect(r.read.map((o) => o.text)).toEqual(['alt']);
    expect(r.unread.map((o) => o.text)).toEqual(['the med']);
  });

  it('the same word twice is a co-reference when deleting both changes the reading', () => {
    const r = readWords('AD med to BC which is also the med', 'med', firstRole, WORD);
    // deleting either alone leaves the other to be read: neither is read alone, both together are
    expect(r.unread).toEqual([]);
    expect(r.exempt.map((o) => o.text)).toEqual(['med', 'the med']);
  });

  it('a builder classes its spellings of one role together', () => {
    const r = readWords('AD alt which is the med', 'alt', firstRole, WORD, () => 'role');
    // «med» is not read, but deleting both «alt» and «med» changes the reading: one class, a co-reference
    expect(r.exempt.map((o) => o.text)).toEqual(['the med']);
  });
});
