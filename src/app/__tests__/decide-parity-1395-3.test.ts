/** #1395 parity shard 3 of 4 — see `decideParity.ts`.  */
import { vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({
  llmParse: (...args: unknown[]) => llmParseMock(...args),
}));

import { parityShard, scenarioCases } from './decideParity';
import { SCENARIOS_3 } from '@/__tests__/scenarios-corpus-3';

parityShard('3', [...scenarioCases(SCENARIOS_3)], llmParseMock);
