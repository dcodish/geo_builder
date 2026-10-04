/** #1540 (ADR-W-111) — 3-D's half of the catalog subscript sweep; the sweep itself is shared. */
import { examplesOf, subscriptSweepSuite } from '../../../shell/__tests__/fixtures/issue-1540-subscript-sweep';
import { COMMAND_CATALOG_3D } from '../catalog3';

subscriptSweepSuite('3-D', examplesOf(COMMAND_CATALOG_3D), 2);
