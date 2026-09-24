/**
 * #1401 (ADR-W-088) — 2-D's half of the fact-row direction lock: its REAL `textDir`, through the shared
 * `FactList`. 2-D is the tree the content rule came from (#118); until #1401 it applied it in its own
 * `rows={…}` callback, which is why the other builders could forget to.
 */
import { factRowDirSuite } from '../../../shell/__tests__/fixtures/fact-row-dir-rows';
import { textDir } from '@/i18n/bidi';

factRowDirSuite(textDir, { product: '2-D' });
