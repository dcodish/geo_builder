/**
 * The 3-D tool's OWN i18next instance (docs/20 §12 rule 2: its own locale files,
 * never editing the 2-D app's he.json/en.json). `createInstance` keeps it fully
 * separate from the 2-D app's singleton — important in the shared vitest process.
 * Hebrew-only UI, same policy as the 2-D tool; `en` kept for parity tests and
 * because English *input* parses.
 */

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import he from './locales/he.json';
import { bidiPostProcessor3 } from './bidi';

const i18n3d = i18next.createInstance();

// BIDI (#468, the 3-D half of #464): isolate every LTR technical run in a rendered message, so an RTL
// sentence cannot reverse `|BC| = 10` into `10 = |BC|`. Global on purpose — the defect class is authors
// not thinking about bidi, so a fix that depends on each call site remembering has not closed it.
i18n3d.use(initReactI18next).use(bidiPostProcessor3).init({
  postProcess: ['bidiIsolate3'],
  resources: {
    en: { translation: en },
    he: { translation: he },
  },
  lng: 'he',
  fallbackLng: 'he',
  supportedLngs: ['he', 'en'],
  interpolation: { escapeValue: false },
});

export default i18n3d;
