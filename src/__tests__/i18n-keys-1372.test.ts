/**
 * 2-D: every literal `t('…')` key RESOLVES in the locale (#1372/#1373).
 *
 * The he⇄en parity guard compares the two locales with each other and therefore cannot see a key
 * missing from BOTH. That gap is not hypothetical: while wiring the share link into 3-D a banner
 * shipped `t('load.dismiss')`, a key that never existed in either locale. `tsc` cannot see it — the
 * argument is just a string — and the student-facing result is a raw dotted key printed where a
 * sentence belongs. 2-D gets the same net as its sibling.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import he from '../i18n/locales/he.json';
import { i18nKeyAudit } from '../../shell/__tests__/fixtures/i18n-keys';

const ROOT = join(__dirname, '..', '..');
const audit = i18nKeyAudit(ROOT, ['src'], he);

describe('2-D i18n — every literal key resolves', () => {
  it('checks a real surface (the guard is not vacuous)', () => {
    expect(audit.checked).toBeGreaterThan(100);
  });

  it('every literal t() key exists in the locale', () => {
    expect(audit.missing, 'a missing key prints itself on screen').toEqual([]);
  });

  /** The detector must be able to FAIL — against an empty locale, everything is missing. */
  it('reports missing keys when they really are missing', () => {
    expect(i18nKeyAudit(ROOT, ['src'], {}).missing.length).toBeGreaterThan(50);
  });
});
