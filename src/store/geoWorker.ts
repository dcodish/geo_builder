/**
 * #41 ([ADR-290](docs/06-decisions.md#adr-290)) — the geometry WORKER entry. Runs the heavy, pure computations OFF
 * the main thread so the tab never blocks (Chrome's "page unresponsive" class).
 *
 * #2890 ([ADR-829](docs/06-decisions.md#adr-829)): the operations are `geoOps.ts`'s table and the message loop is the
 * shared host's (`shell/workerHost`): one request at a time, progress, the work-meter envelope, and the page's
 * checkpoint (the fold of the figure on screen) taken first after every spawn. This file only says which options a
 * worker's copy of the table has: the generous search budget (issue #87, ADR-296: off the main thread a findable
 * configuration is not lost to the 2.5 s freeze cap) and the transplant (its caches are its own module instance, so
 * a found view's fold crosses the boundary as a structured clone for `primeFoldFor`).
 *
 * Cancellation is by TERMINATION (the client kills and respawns the worker): a JS worker cannot be interrupted
 * mid-computation any other way.
 */
import { WORKER_SEARCH_BUDGET_MS } from '@/replay/core';
import { serveWorker } from '../../shell/workerHost';
import { geoOps, takeCheckpoint } from './geoOps';

serveWorker(geoOps({ searchBudgetMs: WORKER_SEARCH_BUDGET_MS, transplant: true }), { seed: takeCheckpoint });
