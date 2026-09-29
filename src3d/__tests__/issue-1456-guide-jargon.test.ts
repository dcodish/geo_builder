/**
 * #1456 ([ADR-W-101](../../docs/06w-decisions-workspace.md#adr-w-101)) — 3-D's guide speaks student.
 *
 * The shared `guideJargonIn` over 3-D's own guide content: every catalog row, and the whole locale
 * (section titles are `catalog.*` keys there, and the refusals live there too). Its one hit at pickup
 * was an English refusal naming "the solver". `shell/` may never import a product tree, hence this file.
 */
import { describe, expect, it } from 'vitest';
import { guideJargonIn } from '../../shell/frame/ManualScreen';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';

describe('#1456 — 3-D: no developer jargon in the guide or the locale', () => {
  it('has content to lint — otherwise [] proves nothing', () => {
    expect(COMMAND_CATALOG_3D.length).toBeGreaterThan(30);
    expect(he.manual.title).toBeTruthy();
  });

  it('catalog + he/en locale: zero hits', () => {
    expect(guideJargonIn({ catalog: COMMAND_CATALOG_3D, he, en })).toEqual([]);
  });
});
