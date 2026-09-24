/**
 * #1401 (ADR-W-088) — the complex builder's half of the fact-row direction lock. Before #1401 every
 * line was `<code dir="ltr">`, so «z1 ברביע הראשון» took an LTR base; the row now follows its content.
 */
import { factRowDirSuite } from '../../../shell/__tests__/fixtures/fact-row-dir-rows';
import { complexBidi } from '../../i18n';

factRowDirSuite(complexBidi.textDir, { product: 'complex', render: (s) => <code>{complexBidi.isolateLtrRuns(s)}</code> });
