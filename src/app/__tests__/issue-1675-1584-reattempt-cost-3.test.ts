// Shard 3 of 3 of the #1675 / #1584 re-attempt cost locks (issue-1675-1584-reattempt-cost.shard.ts), split for #2736.
import { vi } from 'vitest';
import { reattemptCostShard } from './issue-1675-1584-reattempt-cost.shard';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn() }));

reattemptCostShard(3, 3);
