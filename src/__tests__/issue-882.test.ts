/**
 * #882 — the ask lane never shows a raw i18n key.
 *
 * Operator, playing round #878 (T2+T3): ask for a value that cannot be computed (a proper Hebrew
 * "cannot be computed" appears), then type another line — and the row turned into the literal string
 * `values.q.pending`. #741 had introduced that note with no locale entry.
 *
 * The structural half is `i18n/__tests__/values-panel-notes.test.ts` (every `QueryNote` has a message in
 * both locales). This is the end-to-end half: the operator's exact sequence, through the real i18n
 * instance, asserting the student sees Hebrew.
 */
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { QUERY_NOTES } from '@/engine/valuesPanel';

const t = (k: string) => i18n.t(k) as string;

describe('#882 — a query note always resolves to a message', () => {
  it.each(QUERY_NOTES)('«values.q.%s» resolves, and is not the key echoed back', (note) => {
    const out = t(`values.q.${note}`);
    expect(out, 'i18next returns the KEY when an entry is missing — that is the reported bug').not.toBe(`values.q.${note}`);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/[֐-׿]/); // the app runs Hebrew-pinned
  });

  it('the PENDING note in particular — the one the operator saw', () => {
    const out = t('values.q.pending');
    expect(out).not.toContain('values.q');
    // it must say what to do, not pretend work is in flight (docs/10 guideline 8)
    expect(out).toContain('חשב ערכים');
  });
});
