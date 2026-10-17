/**
 * #1962 ([ADR-3D-331](../../docs/06b-decisions-3d.md#adr-3d-331)) — ONE WORDING for the one-fact-per-line
 * advice, in every builder that gives it.
 *
 * The operator ruled the numbering on 2-D on 2026-10-09 ([ADR-611](../../docs/06-decisions.md#adr-611),
 * #1957) and then, asked again as [ADR-W-122](../../docs/06w-decisions-workspace.md) requires rather than
 * inherited, ruled on 2026-10-10 that it is ported: *option A — port it to 3-D and analytic.* So the
 * message is ONE numbered list from (1) with the taught pair as items (1) and (2), everywhere.
 *
 * Two copies of one sentence is how the two drift — 3-D's copy sat one ADR behind for two days, which is
 * #1962. This is the net. It reads each tree's REAL locale file off disk (the `row-parity` /
 * `length-copula-parity` pattern): `shell/` may not import a product tree, and a product tree may not
 * import another (`BOUNDARIES.json`).
 *
 * **Analytic joined in #1947** ([ADR-AG-301](../../docs/06c-decisions-analytic.md#adr-ag-301)). Its locale is a
 * TypeScript module (`src-analytic/i18n/index.ts`, `he` then `en`), not JSON, so its key is read off disk by
 * source text: the key appears exactly twice, once per locale, in that order, as a single-quoted literal with no
 * escapes. Reading the source rather than importing it keeps `shell/` from importing a product tree.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
/** BOM-tolerant read — a Windows editor's BOM must not turn into a JSON.parse crash here. */
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '')) as unknown;

const at = (obj: unknown, keys: readonly string[]): unknown => keys.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

/** Analytic's locale module: every `  <key>: '<text>',` literal of `key`, in file order (the `he` block, then `en`). */
const ANALYTIC_I18N = 'src-analytic/i18n/index.ts';
const analyticLiterals = (key: string): string[] => {
  const src = fs.readFileSync(path.join(ROOT, ANALYTIC_I18N), 'utf8');
  return [...src.matchAll(new RegExp(String.raw`^\s*${key}:\s*'([^'\\]*)',\s*$`, 'gm'))].map((m) => m[1]);
};
const analyticText = (key: string, lng: 'he' | 'en'): string | undefined => {
  const all = analyticLiterals(key);
  return all.length === 2 ? all[lng === 'he' ? 0 : 1] : undefined;
};

/** The right-angle-vertex teaching, per builder: the locale file and the path to the key inside it. */
const SAYS_IT = {
  '2d': { he: 'src/i18n/locales/he.json', en: 'src/i18n/locales/en.json', at: ['input', 'scope', 'right-angle-vertex'] },
  '3d': { he: 'src3d/i18n/locales/he.json', en: 'src3d/i18n/locales/en.json', at: ['err', 'rightAngleVertex'] },
} as const;

/** The teaching's text in `product`'s `lng` locale, read off disk. */
const textOf = (product: keyof typeof SAYS_IT | 'analytic', lng: 'he' | 'en'): unknown =>
  product === 'analytic' ? analyticText('errRightAngleVertex', lng) : at(readJson(SAYS_IT[product][lng]), SAYS_IT[product].at);

/** The key the ADR-611 edit DELETED, per builder — a second message is a second format. */
const RETIRED = {
  '2d': { he: 'src/i18n/locales/he.json', en: 'src/i18n/locales/en.json', at: ['input', 'scope', 'right-angle-vertex-more'] },
  '3d': { he: 'src3d/i18n/locales/he.json', en: 'src3d/i18n/locales/en.json', at: ['err', 'rightAngleVertexMore'] },
} as const;

describe('#1962 — the one-fact-per-line teaching is one sentence in every builder that gives it', () => {
  it('every builder in the list carries the key (the lock is not vacuous)', () => {
    for (const product of [...Object.keys(SAYS_IT), 'analytic'] as const) {
      for (const lng of ['he', 'en'] as const) {
        expect(typeof textOf(product as keyof typeof SAYS_IT | 'analytic', lng), `${product}/${lng}`).toBe('string');
      }
    }
    // analytic: one literal per locale — a third copy would be a second message
    expect(analyticLiterals('errRightAngleVertex')).toHaveLength(2);
  });

  it.each(['he', 'en'] as const)('%s: 3-D’s string is 2-D’s, byte for byte', (lng) => {
    expect(textOf('3d', lng)).toBe(textOf('2d', lng));
  });

  it.each(['he', 'en'] as const)('%s: analytic’s string is 2-D’s, byte for byte (#1947)', (lng) => {
    expect(textOf('analytic', lng)).toBe(textOf('2d', lng));
  });

  it('it is ONE numbered list from (1) with a {{more}} continuation — never a second list', () => {
    for (const product of [...Object.keys(SAYS_IT), 'analytic'] as const) {
      for (const lng of ['he', 'en'] as const) {
        const s = textOf(product as keyof typeof SAYS_IT | 'analytic', lng) as string;
        expect(s).toContain('(1)');
        expect(s).toContain('(2)');
        expect(s).toContain('{{more}}');
        expect(s).not.toContain('{{rest}}');
        expect(s).not.toContain('ואחר כך');
      }
    }
  });

  it('no builder keeps a SECOND key for the same message', () => {
    for (const [product, cfg] of Object.entries(RETIRED)) {
      for (const lng of ['he', 'en'] as const) {
        expect(at(readJson(cfg[lng]), cfg.at), `${product}/${lng}`).toBeUndefined();
      }
    }
    expect(fs.readFileSync(path.join(ROOT, ANALYTIC_I18N), 'utf8'), 'analytic').not.toMatch(/errRightAngleVertexMore/);
  });
});
