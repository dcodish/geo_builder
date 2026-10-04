/** #1540 (ADR-W-111) — 2-D's half of the catalog subscript sweep; the sweep itself is shared. */
import { examplesOf, subscriptSweepSuite } from '../../../shell/__tests__/fixtures/issue-1540-subscript-sweep';
import { COMMAND_CATALOG } from '../catalog';

subscriptSweepSuite('2-D', examplesOf(COMMAND_CATALOG), 0);
