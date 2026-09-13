// #434 (ADR-509) — corpus lock shard 2 of 4; see determined-prints-shared.ts.
import { lockShard } from './determined-prints-shared';

lockShard(new URL('./determined-prints-2.snapshot.json', import.meta.url));
