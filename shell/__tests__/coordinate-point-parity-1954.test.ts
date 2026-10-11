/**
 * #1954 ([ADR-3D-330](../../docs/06b-decisions-3d.md#adr-3d-330)) — ONE WORDING FOR "A COORDINATE POINT
 * BELONGS TO THE ANALYTIC BUILDER", in every builder that says it.
 *
 * Operator report, 2026-10-09: *"on 3d tool, when i enter A(0,0) I get an error. I should be sent to the
 * analytics tool."* 2-D has said exactly that since ADR-553 (#1245); 3-D now says it too, and under
 * ADR-W-118 B1 the status wording for a plane sentence follows 2-D. Two copies of one sentence is how
 * the two drift, so this is the net.
 *
 * It reads each tree's REAL locale file off disk (the `row-parity` / `length-copula-parity` pattern):
 * `shell/` may not import a product tree, and a product tree may not import another
 * (`BOUNDARIES.json`), so the comparison is made here, on the shipped strings.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
/** BOM-tolerant read — a Windows editor's BOM must not turn into a JSON.parse crash here. */
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '')) as Record<string, never>;

/** The one message, per builder: the locale file and the path to the key inside it. */
const SAYS_IT = {
  '2d': { he: 'src/i18n/locales/he.json', en: 'src/i18n/locales/en.json', at: ['input', 'scope', 'coordinate-point'] },
  '3d': { he: 'src3d/i18n/locales/he.json', en: 'src3d/i18n/locales/en.json', at: ['scope', 'coordinate-point'] },
} as const;

const at = (obj: unknown, keys: readonly string[]): unknown => keys.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

describe('#1954 — the coordinate-point pointer is one sentence in every builder that says it', () => {
  it('every builder in the list actually carries the key (the lock is not vacuous)', () => {
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

  it('it names the analytic builder through the shared switcher label, never a hard-coded name', () => {
    for (const cfg of Object.values(SAYS_IT)) {
      for (const lng of ['he', 'en'] as const) {
        expect(at(readJson(cfg[lng]), cfg.at) as unknown as string).toContain('$t(switcherAnalytic)');
      }
    }
  });
});
