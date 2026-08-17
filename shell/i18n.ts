/**
 * The product i18n bootstrap — the ~25 lines that were written three times (docs/28 §1a), once.
 *
 * Every builder gets its OWN i18next instance (the ADR-3D-001 §9 rule: sibling instances must not
 * clobber each other — important in the shared vitest process and on any page that ever hosts two
 * builders). The policy knobs are the settled ones every product converged on: Hebrew UI default,
 * Hebrew fallback, `he`/`en` supported (English kept because English INPUT parses and the parity
 * tests need it), no HTML escaping (the strings carry math, not markup).
 *
 * The RESOURCES and any post-processors (bidi isolation, `shell/bidi.ts`) are the caller's — this
 * module holds no strings and knows no product.
 */
import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

export interface ProductI18nOptions {
  /** The product's translation objects (inline or imported from its locale files). */
  resources: { he: Record<string, unknown>; en: Record<string, unknown> };
  /** Post-processors to register and enable, e.g. `makeBidi(...).postProcessor('bidiIsolateCx')`. */
  postProcessors?: Array<{ type: 'postProcessor'; name: string; process: (value: string) => string }>;
}

export function createProductI18n({ resources, postProcessors = [] }: ProductI18nOptions): i18n {
  const instance = i18next.createInstance();
  instance.use(initReactI18next);
  for (const p of postProcessors) instance.use(p);
  void instance.init({
    ...(postProcessors.length > 0 ? { postProcess: postProcessors.map((p) => p.name) } : {}),
    resources: {
      he: { translation: resources.he },
      en: { translation: resources.en },
    },
    lng: 'he',
    fallbackLng: 'he',
    supportedLngs: ['he', 'en'],
    interpolation: { escapeValue: false },
  });
  return instance;
}
