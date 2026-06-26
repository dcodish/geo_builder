import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import he from './locales/he.json';

// UI is Hebrew-only (the audience is Israeli high-school students). We pin `lng: 'he'`
// and no longer auto-detect or expose a language toggle. The `en` resource is kept
// (dormant) so the i18n-parity tests stay meaningful and English *input* still parses;
// tests may still `changeLanguage('en')` explicitly.
i18n
  .use(initReactI18next)
  .init({
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
