/**
 * The scenario corpus LIVES IN ./scenarios-corpus.ts (add new scenarios THERE — see its banner); the
 * end-to-end runner is sharded across scenarios-e2e-*.test.ts and the property oracles live in
 * scenarios-props-*.test.ts (issue #60 — one 940 s sequential file used to bound the suite's wall time).
 * This file keeps the corpus↔docs parity guard so the docs/test-scenarios.md index can never drift.
 */
import { describe, it, expect } from 'vitest';
import { SCENARIOS } from './scenarios-corpus';

/**
 * Scenario-doc parity ([docs/15-hardening-plan.md](../../docs/15-hardening-plan.md) A6 / TST-7, ADR-174).
 * Every scenario in `SCENARIOS` must be indexed in [docs/test-scenarios.md](../../docs/test-scenarios.md)
 * — the operator's human-readable regression audit trail (repo standing rule). The index had drifted ~34
 * behind the code; this guard fails CI if any id is unindexed, so it can never silently drift again.
 */
describe('scenario-doc parity — every scenario is indexed in docs/test-scenarios.md', () => {
  it('no scenario id is missing from the doc', async () => {
    const fs = await import('node:fs');
    const doc = fs.readFileSync('docs/test-scenarios.md', 'utf8');
    // Ids can embed uppercase point labels (e.g. `two-circles-meet-at-A-and-B`), so match [A-Za-z0-9-].
    const docIds = new Set([...doc.matchAll(/`([A-Za-z0-9-]+)`/g)].map((m) => m[1]));
    const missing = [...new Set(SCENARIOS.map((s) => s.id))].filter((id) => !docIds.has(id));
    expect(missing, `add an entry in docs/test-scenarios.md for: ${missing.join(', ')}`).toEqual([]);
  });
});
