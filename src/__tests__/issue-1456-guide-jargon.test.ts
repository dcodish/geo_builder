/**
 * #1456 ([ADR-W-101](../../docs/06w-decisions-workspace.md#adr-w-101)) — 2-D's guide speaks student.
 *
 * Shipped: the English guide said "(#760)", "(issue #151)", "a free DOF". The rule is the shared
 * `guideJargonIn`; this file hands it 2-D's own guide content — every catalog row (examples and
 * descriptions), the section titles, and the whole locale (the guide's framing lives there, and so does
 * every refusal that points a student at it) — because `shell/` may never import a product tree.
 */
import { describe, expect, it } from 'vitest';
import { guideJargonIn } from '../../shell/frame/ManualScreen';
import { CATEGORY_LABELS, COMMAND_CATALOG } from '../parser/catalog';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';

describe('#1456 — 2-D: no developer jargon in the guide or the locale', () => {
  it('has content to lint — otherwise [] proves nothing', () => {
    expect(COMMAND_CATALOG.length).toBeGreaterThan(50);
    expect(he.manualTitle).toBeTruthy();
  });

  it('catalog + section titles + he/en locale: zero hits', () => {
    expect(guideJargonIn({ catalog: COMMAND_CATALOG, sections: CATEGORY_LABELS, he, en })).toEqual([]);
  });
});
