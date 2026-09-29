/**
 * #1456 ([ADR-W-101](../../docs/06w-decisions-workspace.md#adr-w-101)) — the complex guide speaks student.
 *
 * Shipped: «נפתרת באלימינציה, לא באיטרציה», «המהלך של §2b», «נפתרת בשכבה הנומרית», and a refusal
 * «הדקדוק לא מזהה את השורה הזו». The shared `guideJargonIn` over this tree's own guide content: every
 * catalog row, the family titles the guide shows as section headings, and the whole locale.
 */
import { describe, expect, it } from 'vitest';
import { guideJargonIn } from '../../shell/frame/ManualScreen';
import { CATALOG } from '../parser/catalog';
import { FAMILY_LABELS } from '../ui/manual';
import { complexI18n } from '../i18n';

const he = complexI18n.getResourceBundle('he', 'translation') as Record<string, unknown>;
const en = complexI18n.getResourceBundle('en', 'translation') as Record<string, unknown>;

describe('#1456 — complex: no developer jargon in the guide or the locale', () => {
  it('has content to lint — otherwise [] proves nothing', () => {
    expect(CATALOG.length).toBeGreaterThan(20);
    expect(he.manualTitle).toBeTruthy();
    expect(en.manualTitle).toBeTruthy();
  });

  it('catalog + section titles + he/en locale: zero hits', () => {
    expect(guideJargonIn({ catalog: CATALOG, sections: FAMILY_LABELS, he, en })).toEqual([]);
  });
});
