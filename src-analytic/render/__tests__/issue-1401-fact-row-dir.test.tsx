/**
 * #1401 (ADR-W-088) — analytic's half of the fact-row direction lock: the operator's reported tool.
 * «∠ABC = ∠ACB» rendered as «ABC = ∠ACB∠» because the row passed no direction and inherited RTL.
 */
import { factRowDirSuite } from '../../../shell/__tests__/fixtures/fact-row-dir-rows';
import { MathText } from '../../../shell/math';
import { analyticBidi } from '../../i18n';

factRowDirSuite(analyticBidi.textDir, {
  product: 'analytic',
  render: (s) => <MathText text={analyticBidi.isolateLtrRuns(s)} />,
});
