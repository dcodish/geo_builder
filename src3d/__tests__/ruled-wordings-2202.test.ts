/**
 * #2202 ([ADR-W-149](../../docs/06w-decisions-workspace.md#adr-w-149)) — The 3-D builder shows the operator's ruled wordings of
 * 2026-10-16 through its own i18n instance. The assertions are shared
 * (`shell/__tests__/fixtures/ruled-wordings-2202.ts`); the instance is this tree's.
 */
import i18n3d from '../i18n';
import { lockRuledWordings } from '../../shell/__tests__/fixtures/ruled-wordings-2202';

lockRuledWordings('3d', i18n3d);
