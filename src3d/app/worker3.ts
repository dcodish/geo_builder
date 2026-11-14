/**
 * #2890 round 2 ([ADR-3D-493](../../docs/06b-decisions-3d.md#adr-3d-493)) — 3-D's WORKER ENTRY. The operations are
 * `ops3.ts`'s table and the message loop is the shared host's (`shell/workerHost`): one request at a time, the parts,
 * the work-meter envelope, and the page's checkpoint taken first after every spawn. This heap has its own store,
 * engine and memos; what it solves reaches the page only as a cloned journal.
 */
import { serveWorker } from '../../shell/workerHost';
import { ops3, takeCheckpoint3 } from './ops3';

serveWorker(ops3(), { seed: takeCheckpoint3 });
