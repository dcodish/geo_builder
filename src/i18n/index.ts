import { createProductI18n } from '../../shell/i18n';
import suiteEn from '../../shell/locales/en.json';
import suiteHe from '../../shell/locales/he.json';
import en from './locales/en.json';
import he from './locales/he.json';
import { bidiPostProcessor } from './bidi';

// UI is Hebrew-only (the audience is Israeli high-school students). The shared bootstrap
// (`shell/i18n.ts`, #2201 phase 0) pins `lng: 'he'` with no auto-detect and no language toggle.
// The `en` resource is kept (dormant) so the i18n-parity tests stay meaningful and English *input*
// still parses; tests may still `changeLanguage('en')` explicitly.
//
// BIDI (#464): isolate every LTR technical run in a rendered message, so an RTL sentence cannot
// reverse `|BC| = 10` into `10 = |BC|`. Global on purpose — the defect class was authors not thinking
// about bidi, so a fix that depends on each call site remembering has not fixed the class.
//
// SUITE TEXT (#2201 phase 1, ADR-W-148): the strings every builder shares byte for byte (builder names,
// About credit, guide chrome) live ONCE in shell/locales under `suite.*`, merged under this table.
const i18n = createProductI18n({
  resources: { he: { ...suiteHe, ...he }, en: { ...suiteEn, ...en } },
  postProcessors: [bidiPostProcessor],
});

export default i18n;
