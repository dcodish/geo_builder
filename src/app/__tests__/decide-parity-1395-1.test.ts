/** #1395 parity shard 1 of 4 — see `decideParity.ts`.  */
import { vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({
  llmParse: (...args: unknown[]) => llmParseMock(...args),
}));

import { parityShard, scenarioCases } from './decideParity';
import { SCENARIOS_1 } from '@/__tests__/scenarios-corpus-1';

parityShard('1', [...scenarioCases(SCENARIOS_1)], llmParseMock);
