/**
 * #904 Phase 4 — key parity for the 3-D locales.
 *
 * The 2-D app has had this since `phase3.test.ts`; the 3-D app never did. Both locales happened to
 * agree (203/203 when the audit measured them on 2026-09-05), so this is a latent gap being closed
 * rather than a live defect — but nothing was holding it, and a key present in one locale only is
 * invisible until a student switches language and sees a raw key printed in the UI.
 *
 * The complex and analytic trees get the same guarantee structurally instead: their resources are TS
 * objects with `const en: typeof he`, so a missing key is a compile error. That is stronger, and it is
 * available to them because their locales are code; these are JSON, so a test is the equivalent.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { i18nKeyAudit } from '../../shell/__tests__/fixtures/i18n-keys';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';

/** Every leaf path, so a nested key cannot hide a mismatch behind a matching parent. */
const paths = (obj: unknown, prefix = ''): string[] => {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    paths(v, prefix ? `${prefix}.${k}` : k),
  );
};

describe('3-D i18n — key parity (he ⇄ en)', () => {
  it('reads non-empty locales (the guard is not vacuous)', () => {
    expect(paths(he).length).toBeGreaterThan(50);
  });

  it('has identical key sets in both locales', () => {
    const hePaths = paths(he).sort();
    const enPaths = paths(en).sort();
    expect(
      hePaths.filter((k) => !enPaths.includes(k)),
      'keys in he.json with no en.json counterpart — English would print the raw key',
    ).toEqual([]);
    expect(
      enPaths.filter((k) => !hePaths.includes(k)),
      'keys in en.json with no he.json counterpart — Hebrew, the DEFAULT locale, would print the raw key',
    ).toEqual([]);
  });
});

/**
 * #1372/#1373 — and every literal `t('…')` key actually RESOLVES.
 *
 * Parity above compares the two locales with each other; it cannot see a key missing from BOTH. That
 * is not hypothetical: this suite was extended the day a banner shipped `t('load.dismiss')`, a key
 * that never existed, which `tsc` cannot catch and which reaches a student as a raw dotted string
 * where a sentence belongs.
 */
describe('3-D i18n — every literal key resolves', () => {
  const audit = i18nKeyAudit(join(__dirname, '..', '..'), ['src3d'], he);

  it('checks a real surface (the guard is not vacuous)', () => {
    expect(audit.checked).toBeGreaterThan(100);
  });

  it('every literal t() key exists in the locale', () => {
    expect(audit.missing, 'a missing key prints itself on screen').toEqual([]);
  });

  /** The detector must be able to FAIL — an empty locale means every key is missing. */
  it('reports missing keys when they really are missing', () => {
    const blind = i18nKeyAudit(join(__dirname, '..', '..'), ['src3d'], {});
    expect(blind.missing.length).toBeGreaterThan(50);
  });
});
