/**
 * #2201 phase 1 ([ADR-W-148](../../docs/06w-decisions-workspace.md#adr-w-148)) — 2-D's builder strip, About credit and
 * guide chrome read exactly as before the suite text moved to `shell/locales`. The assertions are shared
 * (`shell/__tests__/fixtures/suite-text-rows.tsx`); the instance is this tree's.
 */
import registry from '../../products.json';
import i18n from '../i18n';
import { lockSuiteText } from '../../shell/__tests__/fixtures/suite-text-rows';

lockSuiteText('2d', i18n, registry);
