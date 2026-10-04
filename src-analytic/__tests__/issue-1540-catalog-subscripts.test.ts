/** #1540 (ADR-W-111) — analytic's half of the catalog subscript sweep; the sweep itself is shared. */
import { examplesOf, subscriptSweepSuite } from '../../shell/__tests__/fixtures/issue-1540-subscript-sweep';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';

subscriptSweepSuite('analytic', examplesOf(COMMAND_CATALOG_ANALYTIC), 8);
