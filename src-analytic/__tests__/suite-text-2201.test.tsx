/**
 * #2201 phase 1 ([ADR-W-148](../../docs/06w-decisions-workspace.md#adr-w-148)) — The analytic builder's builder strip, About credit and
 * guide chrome read exactly as before the suite text moved to `shell/locales`. The assertions are shared
 * (`shell/__tests__/fixtures/suite-text-rows.tsx`); the instance is this tree's.
 */
import registry from '../../products.json';
import { analyticI18n } from '../i18n';
import { lockSuiteText } from '../../shell/__tests__/fixtures/suite-text-rows';

lockSuiteText('analytic', analyticI18n, registry);
