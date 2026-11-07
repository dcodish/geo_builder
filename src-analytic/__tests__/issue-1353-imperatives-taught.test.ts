/**
 * #1353 — non-canonical input is taught, never silently accepted (ADR-W-030). The body lives in
 * `issue-1353-imperatives-taught.shard.ts`.
 *
 * Shard 1 of 3, split for #2736 (siblings: issue-1353-imperatives-taught-2 and -3.test.ts).
 */
import { registerShard } from './issue-1353-imperatives-taught.shard';

registerShard(1, 3);
