/**
 * #1454 arm 4 (ADR-788) — the perf lock the operator set with "Compute on ask" (2026-09-27): the ask answer on
 * the heaviest fixture stays within the production worker budget.
 *
 * Heaviest measured over all of `fixtures/`: 572 by the clock, 1771 by counted work. An ask in the app never
 * pays the sweep itself: the crossing detection samples the same pool on every change of the facts, on the
 * same worker lane, so the ask reads it or queues behind it. A cold pool cannot be cut by the clock (ADR-558,
 * the operator's ruling of 2026-09-30: a verdict is a function of the input alone), so that bound is work.
 * Cold wall clock on the operator's PC is in ADR-788.
 */
import { describe, expect, it } from 'vitest';
import { deserializeFigure } from '@/store/figureFile';
import { computeValues, sampleStats, sharedSamples, WORKER_SEARCH_BUDGET_MS, POOL_WORK_CAP } from '@/replay/core';
import { work } from '@/engine/solveBudget';
import { parseValueQuery } from '@/parser/valueQuery';

const files = import.meta.glob('./fixtures/*.geo.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

function factsOfFixture(name: string) {
  const r = deserializeFigure(files[`./fixtures/${name}.geo.json`]);
  if (!r.ok) throw new Error(name);
  return r.file.facts;
}

const ASK = [{ text: 'AB', q: parseValueQuery('AB') }];
/** Another figure's pool evicts the single-entry memo. */
const evictPool = () => sharedSamples(factsOfFixture('inscribe-existing-square-2257'));

describe.each(['issue-572-load-collapse', 'issue-1771-semicircle-three-vertices'])('#1454 — asking on %s', (name) => {
  it('asked behind the detect sweep, as in the app: no new sweep, inside the worker budget', () => {
    sharedSamples(factsOfFixture(name)); // the always-on sweep, which runs on every change of the facts
    const s0 = sampleStats.sweeps;
    const t0 = performance.now();
    const { queryRows } = computeValues(factsOfFixture(name), ASK); // the worker receives a structured clone
    expect(performance.now() - t0).toBeLessThan(WORKER_SEARCH_BUDGET_MS);
    expect(sampleStats.sweeps, 'the ask pays nothing but its own row').toBe(s0);
    expect(queryRows).toHaveLength(1);
  }, 120_000);

  it('asked on a cold pool, its cost is bounded by counted work: the ADR-558 cap, never the clock', () => {
    evictPool();
    const w0 = work.done;
    computeValues(factsOfFixture(name), ASK);
    expect(work.done - w0, 'one job may finish past the cap').toBeLessThan(POOL_WORK_CAP * 1.5);
  }, 120_000);
});
