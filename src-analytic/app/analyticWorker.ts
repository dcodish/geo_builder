/**
 * THE ANALYTIC WORKER (#2890, [ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478); ADR-W-210 phase 3): every
 * solve of this builder, off the page's thread. The operations are `opsAn.ts`'s table; the message loop is the shared
 * host's (`shell/workerHost`: one request at a time, the parts, the ticks, the work-meter envelope); the checkpoint a
 * fresh worker is handed first is the page's own settled store, adopted (`takeCheckpointAn`), so a worker replaced
 * after a crash solves nothing the page already holds.
 */
import { serveWorker } from '../../shell/workerHost';
import { opsAn, takeCheckpointAn } from './opsAn';

serveWorker(opsAn, { seed: takeCheckpointAn });
