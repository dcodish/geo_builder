/**
 * #882 — every query-row NOTE has a message, in both locales.
 *
 * The operator saw the raw key **`values.q.pending`** on the נתונים panel: #741 introduced a fifth note
 * as an inline literal (`note: 'pending' as const`) with no locale entry, and nothing could catch it.
 * TypeScript could not — the note was a fresh string literal, not a member of a union it had to satisfy —
 * and no test asked whether the strings a render site can emit actually exist.
 *
 * So the fix is structural, not a missing line: {@link QUERY_NOTES} is now a runtime list with the
 * `QueryNote` type derived from it, and this file walks that list against both locale files. A new note
 * cannot ship without its Hebrew and English, because the list it must join is the same list this test
 * iterates.
 *
 * The sibling net for ENGINE error strings is `humanize-error.test.ts`; this is the same discipline one
 * surface over. Together they cover the two places a user-facing string is built from a code value.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUERY_NOTES } from '@/engine/valuesPanel';

const LOCALES = join(__dirname, '..', 'locales');
/** BOM-tolerant read — a Windows editor's BOM must not turn into a JSON.parse crash here. */
const load = (lang: string): Record<string, Record<string, string>> =>
  JSON.parse(readFileSync(join(LOCALES, `${lang}.json`), 'utf8').replace(/^﻿/, ''));

const he = load('he');
const en = load('en');

describe('#882 — every query note has a message in both locales', () => {
  it('the note list is not empty (the guard is not vacuous)', () => {
    expect(QUERY_NOTES.length).toBeGreaterThanOrEqual(5);
    expect(QUERY_NOTES).toContain('pending'); // the note that shipped without a string
  });

  it.each(QUERY_NOTES)('«%s» has a Hebrew message', (note) => {
    const text = he.values?.[`q.${note}`];
    expect(text, `values.q.${note} missing from he.json — the panel would print the raw key`).toBeTruthy();
    expect(text, `values.q.${note} must be Hebrew, not a placeholder`).toMatch(/[֐-׿]/);
  });

  it.each(QUERY_NOTES)('«%s» has an English message', (note) => {
    const text = en.values?.[`q.${note}`];
    expect(text, `values.q.${note} missing from en.json`).toBeTruthy();
    expect(text).not.toMatch(/^values\.q\./); // never the key echoed back as its own value
  });

  it('no locale carries a q.* message the code can never emit (the reverse drift)', () => {
    const known = new Set<string>(QUERY_NOTES.map((n) => `q.${n}`));
    for (const [lang, bundle] of [['he', he], ['en', en]] as const) {
      const orphans = Object.keys(bundle.values ?? {}).filter((k) => k.startsWith('q.') && !known.has(k));
      expect(orphans, `${lang}.json carries q.* messages no QueryNote produces: ${orphans.join(', ')}`).toEqual([]);
    }
  });
});
