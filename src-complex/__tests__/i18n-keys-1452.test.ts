/**
 * #1452 — every literal `t('…')` key RESOLVES in the complex locale. `const en: typeof he` keeps the two
 * locales in step with each other, but cannot see a key missing from BOTH: the complex undo/redo row
 * called `t('undo')` with no such key and printed «undo» in the Hebrew UI. The shared audit (#1372)
 * already guarded 2-D and 3-D; this is the same net for complex.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { complexI18n } from '../i18n';
import { i18nKeyAudit } from '../../shell/__tests__/fixtures/i18n-keys';

const ROOT = join(__dirname, '..', '..');
const he = complexI18n.getResourceBundle('he', 'translation');
const audit = i18nKeyAudit(ROOT, ['src-complex'], he);

describe('complex i18n — every literal key resolves', () => {
  it('checks a real surface (the guard is not vacuous)', () => {
    expect(audit.checked).toBeGreaterThan(40);
  });

  it('every literal t() key exists in the locale', () => {
    expect(audit.missing, 'a missing key prints itself on screen').toEqual([]);
  });

  /** The detector must be able to FAIL — against an empty locale, everything is missing. */
  it('reports missing keys when they really are missing', () => {
    expect(i18nKeyAudit(ROOT, ['src-complex'], {}).missing.length).toBeGreaterThan(20);
  });
});
