/**
 * The 2-D builder's About DECLARATION (#1477, ADR-W-091) — the parts `shell/frame/about.tsx` renders.
 *
 * 2-D wrote the full About first (lead, points, «try this», credit); moving it onto the declaration
 * keeps its text byte-identical (`src/__tests__/about-content-1477.test.ts` pins it) and makes it the
 * shape every builder now fills. Used by the frame's About modal AND the first-load intro, so the two
 * can never show different content.
 */
import type { TFunction } from 'i18next';
import registry from '../../products.json';
import type { AboutContent } from '../../shell/frame/about';

export function aboutContent(t: TFunction): AboutContent {
  const list = (key: string) => t(key, { returnObjects: true }) as unknown as string[];
  return {
    lead: t('about.lead'),
    points: list('about.points'),
    tryTitle: t('suite.about.tryTitle'),
    trySteps: list('about.trySteps'),
    credit: { by: t('suite.about.developedBy'), name: t('suite.about.author'), contact: t('suite.about.contact'), email: registry.contact.email },
  };
}
