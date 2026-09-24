/**
 * #1401 (ADR-W-088) — 3-D's half of the fact-row direction lock: `textDir3` through the shared
 * `FactList`, with the row CONTENT rendered by the real `FactRowText3` from `factRowText3`'s string
 * (the #934 / ADR-3D-228 rule that both must be the same text). The facts are plain given rows; the
 * vector branch has its own locks in `vecmath.test.tsx`.
 */
import { factRowDirSuite } from '../../../shell/__tests__/fixtures/fact-row-dir-rows';
import { textDir3 } from '../../i18n/bidi';
import { FactRowText3, factRowText3 } from '../FactRow3';

const fact = (utterance: string) => ({ utterance, cmds: [{ type: 'point' }] });
const none = new Set<string>();

factRowDirSuite((s) => textDir3(factRowText3(fact(s), none)), {
  product: '3-D',
  render: (s) => <FactRowText3 f={fact(s)} vecNames={none} />,
});
