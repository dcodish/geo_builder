/**
 * #2202 ([ADR-W-149](../../docs/06w-decisions-workspace.md#adr-w-149)) — the seven wordings the operator ruled on
 * 2026-10-16 (ballot card 8, rows d2202-d1 … d7) are held ONCE, and every builder shows them.
 *
 * Five of them (d2 share prompt, d4 guide intro, d5 About close, d6 About title, d7 empty-canvas title) are suite
 * text: one key each in `shell/locales`, and each App reads that key at the surface. d3 («השרטוט» in the guide's
 * try hint) stays per builder because its English is not one string yet (#2241), so its four Hebrew values are
 * held equal here. d1 (quote marks) is `quote-style.test.ts`. The per-builder RESOLUTION (each instance merges
 * the suite file) is `<tree>/__tests__/ruled-wordings-2202.test.ts`.
 *
 * The Apps are read as source (the row-parity pattern): shell may not import a product tree.
 */
import { describe, expect, it } from 'vitest';
import { PRODUCTS, productTable, read, suiteTable, type Product } from './fixtures/locale-tables';
import { RULED_SUITE, RULED_TRY_HINT_HE, TRY_HINT_KEY } from './fixtures/ruled-wordings-2202';

const APP: Record<Product, string> = {
  '2d': 'src/App.tsx',
  '3d': 'src3d/App3.tsx',
  complex: 'src-complex/App.tsx',
  analytic: 'src-analytic/App.tsx',
};

/** Where each ruled key is read: the About frame's props, the share-arrived offer, the empty canvas, the guide. */
const SITES: Record<string, RegExp> = {
  'suite.about.title': /about=\{\{[^}]*?\btitle: t\('suite\.about\.title'\)/s,
  'suite.about.close': /about=\{\{[^}]*?\bcloseLabel: t\('suite\.about\.close'\)/s,
  'suite.share.arrived': /<ResumeOffer\s+message=\{t\('suite\.share\.arrived'\)\}/,
  'suite.canvas.emptyTitle': /<QuickChips\s+title=\{t\('suite\.canvas\.emptyTitle'\)\}/,
  'suite.guide.intro': /<ManualScreen[\s\S]*?\{t\('suite\.guide\.intro'\)\}/,
};

/** The per-product keys the five replaced. None may come back: a second copy is how the wordings drifted. */
const RETIRED: Record<Product, string[]> = {
  '2d': ['about.title', 'about.close', 'share.arrived', 'canvas.emptyTitle', 'manualPartial'],
  '3d': ['aboutTitle', 'aboutClose', 'share.arrived', 'emptyTitle', 'manual.intro'],
  complex: ['aboutTitle', 'aboutClose', 'shareArrived', 'emptyTitle', 'manualIntro'],
  analytic: ['aboutTitle', 'aboutClose', 'shareArrived', 'emptyTitle', 'manualIntro'],
};

describe('#2202 — the ruled wordings, held once', () => {
  it('the suite file carries the ruled text, Hebrew and English', () => {
    const he = suiteTable('he');
    const en = suiteTable('en');
    for (const [key, ruled] of Object.entries(RULED_SUITE)) {
      expect(he[key], `he ${key}`).toBe(ruled.he);
      expect(en[key], `en ${key}`).toBe(ruled.en);
    }
  });

  for (const p of PRODUCTS) {
    it(`${p}: the App reads every ruled suite key at its surface`, () => {
      const src = read(APP[p]);
      for (const [key, site] of Object.entries(SITES)) expect(site.test(src), `${APP[p]} does not read ${key} at its surface`).toBe(true);
    });

    it(`${p}: no retired per-product copy is defined or read`, () => {
      const src = read(APP[p]);
      for (const lang of ['he', 'en'] as const) {
        const own = productTable(p, lang);
        for (const k of RETIRED[p]) expect(own[k], `${p} ${lang} still defines ${k}`).toBeUndefined();
      }
      for (const k of RETIRED[p]) expect(src.includes(`t('${k}')`), `${APP[p]} still reads ${k}`).toBe(false);
    });
  }

  it('d3: the guide try hint says «השרטוט» in every builder', () => {
    for (const p of PRODUCTS) expect(productTable(p, 'he')[TRY_HINT_KEY[p]], p).toBe(RULED_TRY_HINT_HE);
  });

  it('analytic keeps its generic «סגור» for the banners and the guide — only the About box moved', () => {
    expect(productTable('analytic', 'he').close).toBe('סגור');
    const src = read(APP.analytic);
    expect(src.match(/dismissLabel=\{t\('close'\)\}/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(/<ManualScreen[\s\S]*?closeLabel=\{t\('close'\)\}/.test(src)).toBe(true);
  });

  it('the site patterns bite: a builder reading its own key fails them', () => {
    const stale = "about={{ label: t('suite.about.label'), title: t('aboutTitle'), closeLabel: t('close') }}";
    expect(SITES['suite.about.title'].test(stale)).toBe(false);
    expect(SITES['suite.about.close'].test(stale)).toBe(false);
    expect(SITES['suite.share.arrived'].test("<ResumeOffer message={t('shareArrived')}")).toBe(false);
  });
});
