/** #1540 (ADR-W-111) — complex's half of the catalog subscript sweep; the sweep itself is shared. */
import { examplesOf, subscriptSweepSuite } from '../../../shell/__tests__/fixtures/issue-1540-subscript-sweep';
import { CATALOG } from '../catalog';

subscriptSweepSuite('complex', examplesOf(CATALOG), 0);
