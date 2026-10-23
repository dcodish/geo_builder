/**
 * #2201 phase 1 ([ADR-W-148](../../../docs/06w-decisions-workspace.md#adr-w-148)), lock (d) — moving the suite text
 * into `shell/locales` changed NOTHING a student reads. The shared half of a four-builder lock.
 *
 * Each builder resolves `products.json`'s `labelKey`s through its OWN i18n instance and hands the names to the
 * shared `ProductSwitcher` (the App code path: `label: t(p.labelKey)`). `lockSuiteText` renders that strip in
 * Hebrew and English and compares it with the strip measured before the move (base 5daeaa8d). The other moved
 * strings (About credit, «try this» title, guide chrome, the header titles that read a builder name) are compared
 * the same way, through the key each builder now reads.
 *
 * The ASSERTIONS live here and the CALLS in each tree (`__tests__/suite-text-2201.test.tsx` in `src`, `src3d`,
 * `src-complex`, `src-analytic`), because `shell/` may never import a product tree (ADR-W-016 rule 2) and
 * `server/` may not import `shell/` (BOUNDARIES.json). Test-only: nothing here is imported by runtime code.
 *
 * The golden is TODAY's text, including analytic's English "Solid Geometry" for 3-D: that name is not
 * byte-identical across builders, so it stayed per product and is a wording question, not this move's.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import type { i18n as I18n } from 'i18next';
import { describe, expect, it } from 'vitest';
import { ProductSwitcher } from '../../frame/Switcher';

export type SuiteProduct = '2d' | '3d' | 'complex' | 'analytic';
const LANGS = ['he', 'en'] as const;
type Lang = (typeof LANGS)[number];

/** The registry shape this lock reads — the caller passes `products.json` (shell does not import it). */
export interface Registry {
  products: { id: string; labelKey: string; icon?: string; devUrl: string; enabled: boolean }[];
}

/** The four names each builder's strip showed at the base, in registry order (2d, 3d, complex, analytic). */
const HE = ['הנדסת המישור', 'הנדסת המרחב', 'מספרים מרוכבים', 'גאומטריה אנליטית'];
const EN = ['Plane Geometry', 'Space Geometry', 'Complex Numbers', 'Analytic Geometry'];
const STRIP_BEFORE: Record<SuiteProduct, Record<Lang, string[]>> = {
  '2d': { he: HE, en: EN },
  '3d': { he: HE, en: EN },
  complex: { he: HE, en: EN },
  analytic: { he: HE, en: ['Plane Geometry', 'Solid Geometry', 'Complex Numbers', 'Analytic Geometry'] },
};

/** Every other moved string, as each builder showed it at the base — the same in all four. */
const MOVED_BEFORE: Record<string, Record<Lang, string>> = {
  'suite.about.label': { he: 'אודות', en: 'About' },
  'suite.about.tryTitle': { he: 'הזינו את נתוני השאלה כפי שמופיעים בשאלה:', en: 'Enter the given data exactly as it appears in the question:' },
  'suite.about.developedBy': { he: 'פותח על־ידי', en: 'Developed by' },
  'suite.about.author': { he: 'ד"ר דוד קודיש', en: 'Dr. David Codish' },
  'suite.about.contact': { he: 'לשאלות', en: 'Questions' },
  'suite.guide.button': { he: 'מדריך', en: 'Guide' },
  'suite.guide.more': {
    he: '…ואלו רק דוגמאות — לכלי יש כאן פקודות נוספות, לא רק ניסוחים אחרים של אלו',
    en: '…and these are only examples — the tool has more COMMANDS here, not just other phrasings of these',
  },
  'suite.guide.showAll': { he: 'הצג הכול', en: 'Show all' },
  'suite.guide.showLess': { he: 'הצג פחות', en: 'Show fewer' },
};

/** The header titles that now read a builder-name key (3-D keeps its own `title`): unchanged text, one owner. */
const TITLE_BEFORE: Partial<Record<SuiteProduct, { key: string } & Record<Lang, string>>> = {
  '2d': { key: 'suite.product.2d', he: 'הנדסת המישור', en: 'Plane Geometry' },
  complex: { key: 'suite.product.complex', he: 'מספרים מרוכבים', en: 'Complex Numbers' },
  analytic: { key: 'suite.product.analytic', he: 'גאומטריה אנליטית', en: 'Analytic Geometry' },
};

/** Bidi isolates are a render detail of each product's post-processor, not text. */
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

/** The names the shared strip renders for this builder, icons stripped, in DOM order. */
export function renderedStrip(instance: I18n, registry: Registry, lng: Lang, activeId: string): string[] {
  const t = instance.getFixedT(lng);
  const roster = registry.products
    .filter((p) => p.enabled)
    .map((p) => ({ id: p.id, label: t(p.labelKey), url: p.devUrl, icon: p.icon }));
  const html = renderToStaticMarkup(<ProductSwitcher roster={roster} activeId={activeId} />);
  const icons = registry.products.map((p) => p.icon).filter((i): i is string => !!i);
  return [...html.matchAll(/>([^<>]+)<\/(?:a|span)>/g)].map((m) => {
    const text = plain(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    const icon = icons.find((i) => text.startsWith(`${i} `));
    return icon ? text.slice(icon.length + 1) : text;
  });
}

export function lockSuiteText(product: SuiteProduct, instance: I18n, registry: Registry): void {
  describe(`#2201 phase 1 (d) — ${product} shows the same suite text as before the move`, () => {
    for (const lng of LANGS) {
      it(`${lng}: the builder strip names the four builders as before`, () => {
        expect(renderedStrip(instance, registry, lng, product)).toEqual(STRIP_BEFORE[product][lng]);
      });

      it(`${lng}: the About credit, «try» title, guide chrome and header title read as before`, () => {
        const t = instance.getFixedT(lng);
        for (const [key, before] of Object.entries(MOVED_BEFORE)) expect(plain(t(key)), `${lng} ${key}`).toBe(before[lng]);
        const title = TITLE_BEFORE[product];
        if (title) expect(plain(t(title.key)), `${lng} title`).toBe(title[lng]);
      });
    }

    it('the reader is not vacuous: four segments, and a missing key shows as the raw key', () => {
      expect(renderedStrip(instance, registry, 'he', product)).toHaveLength(4);
      expect(instance.getFixedT('he')('suite.product.nope')).toBe('suite.product.nope');
    });
  });
}
