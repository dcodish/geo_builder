/**
 * The 3-D tool's OWN i18next instance (docs/20 §12 rule 2: its own locale files,
 * never editing the 2-D app's he.json/en.json). The shared bootstrap (`shell/i18n.ts`,
 * #2201 phase 0) gives every builder its own instance — important in the shared vitest
 * process. Hebrew-only UI, same policy as the 2-D tool; `en` kept for parity tests and
 * because English *input* parses.
 */

import { createProductI18n } from '../../shell/i18n';
import suiteEn from '../../shell/locales/en.json';
import suiteHe from '../../shell/locales/he.json';
import en from './locales/en.json';
import he from './locales/he.json';
import { bidiPostProcessor3 } from './bidi';

// BIDI (#468, the 3-D half of #464): isolate every LTR technical run in a rendered message, so an RTL
// sentence cannot reverse `|BC| = 10` into `10 = |BC|`. Global on purpose — the defect class is authors
// not thinking about bidi, so a fix that depends on each call site remembering has not closed it.
//
// SUITE TEXT (#2201 phase 1, ADR-W-148): the strings every builder shares byte for byte live ONCE in
// shell/locales under `suite.*`, merged under this table.
const i18n3d = createProductI18n({
  resources: { he: { ...suiteHe, ...he }, en: { ...suiteEn, ...en } },
  postProcessors: [bidiPostProcessor3],
});

export default i18n3d;
