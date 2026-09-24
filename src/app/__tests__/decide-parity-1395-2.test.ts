/** #1395 parity shard 2 of 4 — see `decideParity.ts`.  */
import { vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({
  llmParse: (...args: unknown[]) => llmParseMock(...args),
}));

import { parityShard, scenarioCases } from './decideParity';
import { SCENARIOS_2 } from '@/__tests__/scenarios-corpus-2';

parityShard('2', [...scenarioCases(SCENARIOS_2)], llmParseMock);
