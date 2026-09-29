/**
 * #1456 ([ADR-W-101](../../docs/06w-decisions-workspace.md#adr-w-101)) — the analytic guide speaks student.
 *
 * Clean at pickup («פרבולה קנונית» is the curriculum's own term, and the rule does not flag it). The
 * shared `guideJargonIn` over this tree's own guide content — every catalog row and the whole locale
 * (the section titles are `manual*` keys there) — so the first leak fails here, not in a review of prod.
 */
import { describe, expect, it } from 'vitest';
import { guideJargonIn } from '../../shell/frame/ManualScreen';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { analyticI18n } from '../i18n';

const he = analyticI18n.getResourceBundle('he', 'translation') as Record<string, unknown>;
const en = analyticI18n.getResourceBundle('en', 'translation') as Record<string, unknown>;

describe('#1456 — analytic: no developer jargon in the guide or the locale', () => {
  it('has content to lint — otherwise [] proves nothing', () => {
    expect(COMMAND_CATALOG_ANALYTIC.length).toBeGreaterThan(20);
    expect(he.manualTitle).toBeTruthy();
    expect(en.manualTitle).toBeTruthy();
  });

  it('catalog + he/en locale: zero hits', () => {
    expect(guideJargonIn({ catalog: COMMAND_CATALOG_ANALYTIC, he, en })).toEqual([]);
  });
});
