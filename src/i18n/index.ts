import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import he from './locales/he.json';
import { bidiPostProcessor } from './bidi';

// UI is Hebrew-only (the audience is Israeli high-school students). We pin `lng: 'he'`
// and no longer auto-detect or expose a language toggle. The `en` resource is kept
// (dormant) so the i18n-parity tests stay meaningful and English *input* still parses;
// tests may still `changeLanguage('en')` explicitly.
i18n
  .use(initReactI18next)
  // BIDI (#464): isolate every LTR technical run in a rendered message, so an RTL sentence cannot
  // reverse `|BC| = 10` into `10 = |BC|`. Global on purpose — the defect class was authors not thinking
  // about bidi, so a fix that depends on each call site remembering has not fixed the class.
  .use(bidiPostProcessor)
  .init({
    postProcess: ['bidiIsolate'],
    resources: {
      en: { translation: en },
      he: { translation: he },
    },
    lng: 'he',
    fallbackLng: 'he',
    supportedLngs: ['he', 'en'],
    interpolation: { escapeValue: false },
  });

export default i18n;
