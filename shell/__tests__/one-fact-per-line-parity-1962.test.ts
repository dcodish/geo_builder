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
 * **Analytic is NOT listed yet.** The same ruling gives it the teaching it has never had (#1947), and that
 * arm is not built here — see ADR-3D-331's sibling audit. When it lands, its locale joins `SAYS_IT` and
 * this lock holds all three.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
/** BOM-tolerant read — a Windows editor's BOM must not turn into a JSON.parse crash here. */
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '')) as unknown;

const at = (obj: unknown, keys: readonly string[]): unknown => keys.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

/** The right-angle-vertex teaching, per builder: the locale file and the path to the key inside it. */
const SAYS_IT = {
  '2d': { he: 'src/i18n/locales/he.json', en: 'src/i18n/locales/en.json', at: ['input', 'scope', 'right-angle-vertex'] },
  '3d': { he: 'src3d/i18n/locales/he.json', en: 'src3d/i18n/locales/en.json', at: ['err', 'rightAngleVertex'] },
} as const;

/** The key the ADR-611 edit DELETED, per builder — a second message is a second format. */
const RETIRED = {
  '2d': { he: 'src/i18n/locales/he.json', en: 'src/i18n/locales/en.json', at: ['input', 'scope', 'right-angle-vertex-more'] },
  '3d': { he: 'src3d/i18n/locales/he.json', en: 'src3d/i18n/locales/en.json', at: ['err', 'rightAngleVertexMore'] },
} as const;

describe('#1962 — the one-fact-per-line teaching is one sentence in every builder that gives it', () => {
  it('every builder in the list carries the key (the lock is not vacuous)', () => {
    for (const [product, cfg] of Object.entries(SAYS_IT)) {
      for (const lng of ['he', 'en'] as const) {
        expect(typeof at(readJson(cfg[lng]), cfg.at), `${product}/${lng}`).toBe('string');
      }
    }
  });

  it.each(['he', 'en'] as const)('%s: 3-D’s string is 2-D’s, byte for byte', (lng) => {
    const text = (product: keyof typeof SAYS_IT) => at(readJson(SAYS_IT[product][lng]), SAYS_IT[product].at);
    expect(text('3d')).toBe(text('2d'));
  });

  it('it is ONE numbered list from (1) with a {{more}} continuation — never a second list', () => {
    for (const cfg of Object.values(SAYS_IT)) {
      for (const lng of ['he', 'en'] as const) {
        const s = at(readJson(cfg[lng]), cfg.at) as string;
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
  });
});
