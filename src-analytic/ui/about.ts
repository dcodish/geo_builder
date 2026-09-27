/**
 * This builder's About DECLARATION (#1477, ADR-W-091) — the parts `shell/frame/about.tsx` renders.
 *
 * The same sections 2-D's About carries (what the tool is, who it is for, step-by-step building, the
 * figure adapting, alternative configurations, draws-not-solves, a «try this» sequence and the
 * credit), adapted to this builder. The §5c lock (`__tests__/about-content-1477.test.ts`) runs every
 * try step through this builder's real submit gate, in order, on an empty canvas.
 */
import type { TFunction } from 'i18next';
import registry from '../../products.json';
import type { AboutContent } from '../../shell/frame/about';

export function aboutContent(t: TFunction): AboutContent {
  const list = (key: string) => t(key, { returnObjects: true }) as unknown as string[];
  return {
    lead: t('aboutLead'),
    points: list('aboutPoints'),
    tryTitle: t('aboutTryTitle'),
    trySteps: list('aboutTrySteps'),
    credit: { by: t('creditBy'), name: t('creditName'), contact: t('creditContact'), email: registry.contact.email },
  };
}
