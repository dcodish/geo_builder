/** #1395 parity shard 4 of 4 — see `decideParity.ts`. Carries the saved fixtures too. */
import { vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({
  llmParse: (...args: unknown[]) => llmParseMock(...args),
}));

import { fixtureCases, parityShard, scenarioCases } from './decideParity';
import { SCENARIOS_4 } from '@/__tests__/scenarios-corpus-4';

parityShard('4', [...scenarioCases(SCENARIOS_4), ...fixtureCases()], llmParseMock);
