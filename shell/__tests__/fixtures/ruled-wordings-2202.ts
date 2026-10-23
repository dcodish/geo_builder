/**
 * #2202 ([ADR-W-149](../../../docs/06w-decisions-workspace.md#adr-w-149)) — the operator's seven wording rulings of
 * 2026-10-16 (ballot card 8, rows d2202-d1 … d7), as the shared half of a four-builder lock.
 *
 * `RULED_SUITE` is the anchor: the ruled Hebrew, verbatim, and as English the existing English twin of the
 * builder whose Hebrew was ruled (the plan's derivation). d3, the guide's try hint, joined them with #2241
 * ([ADR-W-150](../../../docs/06w-decisions-workspace.md#adr-w-150)) once its English became one string. `lockRuledWordings`
 * resolves every ruled key through ONE builder's own i18n instance — the instance its App renders with — so a
 * builder that stops merging the suite file, or shadows a key, fails here in that builder's tree.
 *
 * Shell may not import a product tree (ADR-W-016 rule 2), so each tree calls this from
 * `<tree>/__tests__/ruled-wordings-2202.test.ts`. Test-only: nothing here is imported by runtime code.
 */
import type { i18n as I18n } from 'i18next';
import { describe, expect, it } from 'vitest';

export type SuiteProduct = '2d' | '3d' | 'complex' | 'analytic';

/** d2, d3, d4, d5, d6, d7 — one key each in `shell/locales`, read by every builder. */
export const RULED_SUITE: Record<string, { he: string; en: string }> = {
  // d2 — singular address: «מה שבנית»
  'suite.share.arrived': {
    he: 'הקישור שפתחתם מכיל שרטוט. לפתוח אותו במקום מה שבנית?',
    en: 'The link you opened contains a figure. Open it instead of what you built?',
  },
  // d3 — «השרטוט» in the guide's try hint; the English is analytic's, the ruled builder's twin (#2241, ADR-W-150)
  'suite.guide.try': {
    he: 'לחצו כדי לנסות — הדוגמה תיבנה על השרטוט',
    en: 'Click to try — the example will be built on the figure',
  },
  // d4 — 3-D's full guide intro, in every tool
  'suite.guide.intro': {
    he: 'זהו מדריך חלקי — מוצגות דוגמאות מייצגות בלבד, כדי להראות אילו מיני משפטים אפשר להקליד. לחצו על דוגמה כדי לראות אותה נבנית, או נסחו חופשי — אם הכלי לא הבין, נסו ניסוח אחר; משפטים שאינם נתמכים נאספים ונבחנים על ידי צוות הפרויקט לקראת תמיכה עתידית.',
    en: "This is a partial guide — only representative examples are shown, so you can see what sorts of sentences can be typed. Click one to watch it build, or phrase freely — if the tool didn't understand, try different wording; unsupported sentences are collected and reviewed by the project team for future support.",
  },
  // d5 — the About box's close button
  'suite.about.close': { he: 'הבנתי — אפשר להתחיל', en: "Got it — let's start" },
  // d6 — the About box's title
  'suite.about.title': { he: 'על הכלי', en: 'About this tool' },
  // d7 — the empty canvas's title
  'suite.canvas.emptyTitle': { he: 'מה בונים היום?', en: 'What are we building today?' },
};

/** Bidi isolates are a render detail of each product's post-processor, not text. */
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

export function lockRuledWordings(product: SuiteProduct, instance: I18n): void {
  describe(`#2202 — ${product} shows the seven ruled wordings`, () => {
    for (const lng of ['he', 'en'] as const) {
      it(`${lng}: share prompt, guide try hint and intro, About title and close, empty-canvas title`, () => {
        const t = instance.getFixedT(lng);
        for (const [key, ruled] of Object.entries(RULED_SUITE)) expect(plain(t(key)), `${product} ${lng} ${key}`).toBe(ruled[lng]);
      });
    }

    it('the reader is not vacuous: a missing key shows as the raw key', () => {
      expect(instance.getFixedT('he')('suite.share.nope')).toBe('suite.share.nope');
    });
  });
}
