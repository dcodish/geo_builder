/**
 * THE 2-D WORK-METER GATE (#2873, [ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 0).
 *
 * Every saved figure in `fixtures/` is walked through the student's actions — re-typing each row, «הציגו תצורה אחרת»,
 * a cold load, an edit, a delete, the background detection — and each action's solver work is held against
 * `work-meter/baseline.jsonl`. An action that does MORE work than its baseline fails; the message says which figure,
 * which action, the numbers, and what to do. The rule, the tolerance (zero) and the re-record are `shell/__tests__/
 * work-gate.ts`'s; the actions are `work-meter/driver2d.ts`'s, the same driver the timing harness runs.
 *
 * One unit is one `evaluateCore` call. The worker's operations go through the App's own client (`geoWork`), and every
 * search runs with NO clock (vitest's MODE 'test'). So this measures the whole search, not the part a browser's
 * 12-second budget lets it finish.
 *
 * THREE HEAPS (#2890, [ADR-829](../../docs/06-decisions.md#adr-829), ADR-W-210 Am. 4). The client is handed one
 * isolated executor per lane (`shell/workerExecutor`): the interactive worker and the detect worker are each a module
 * instance of their own, loaded a second and a third time, and every argument and result passes through
 * `structuredClone`. The page's count is then what a browser's page computes: nothing a worker solved is a memo hit
 * for it, and a result that does not clone fails the walk. In one module instance, as this gate ran until #2890, the
 * page count was a lower bound (ADR-W-210 Am. 1): «הציגו תצורה אחרת» was recorded at 1 396 page units and costs 2.45 M.
 *
 * test-budget: the gate walks all 171 fixtures through every student action (1 327 actions), each figure from cold
 * caches: about 6 min alone, 11 min inside the full suite (ADR-W-210 Am. 1). One file, because the baseline is one file.
 *
 * Re-record: `npm run work:record -- 2d` (docs/08, "The work meter").
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { geoWork, useGeoWorkExecutor } from '@/store/geoWork';
import { replay as pageReplay } from '@/replay/core';
import { executorByLane, isolatedExecutor } from '../../shell/workerExecutor';
import { secondInstance } from '../../shell/__tests__/isolated-ops';
import { createDriver2d } from './work-meter/driver2d';
import { walkFixture2d, walkLines2d, type WalkPlan } from './work-meter/walk2d';
import { SLOW_CORPUS_2D } from './work-meter/slowCorpus2d';
import { firstDifference, openWorkGate, walkOrder, type MeasuredAction } from '../../shell/__tests__/work-gate';

const files = import.meta.glob('./fixtures/*.geo.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const textOf = new Map(Object.entries(files).map(([p, text]) => [p.replace(/^.*\//, ''), text]));
/** `WORK_METER_CORPUS=slow` (`npm run work:check -- 2d --slow`): the open speed issues' sequences instead of the fixtures. */
const SLOW = process.env.WORK_METER_CORPUS === 'slow';
const slowLines = new Map(SLOW_CORPUS_2D.map((q) => [q.id, q.lines]));
const corpus = (SLOW ? [...slowLines.keys()] : [...textOf.keys()]).sort();

const gate = openWorkGate({
  product: '2d',
  title: '2-D',
  unit: 'one evaluateCore call (src/engine/evaluate.ts)',
  dir: join(__dirname, 'work-meter'),
  corpus: SLOW ? 'slow' : 'fixtures',
  perfCommand: (figure) => `node scripts/perf/2d/driver.mjs --only ${SLOW ? 'issue' : 'fixture'}:${figure}`,
});
/** One worker's heap: 2-D's operations as its worker entry serves them, in a module instance of their own. */
const workerHeap = () =>
  secondInstance(async () => {
    const { geoOps, takeCheckpoint } = await import('@/store/geoOps'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    const { clearReplayCaches, replay } = await import('@/replay/core'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    const { readWork } = await import('../../shell/workMeter'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    // a worker's table (the found view's fold crosses), under the suite's clock: none
    return { ops: geoOps({ transplant: true }), clear: clearReplayCaches, units: () => readWork().total, seed: takeCheckpoint, replay };
  });
type Heap = Awaited<ReturnType<typeof workerHeap>>;
let interactive: Heap;
let detect: Heap;

const driver = createDriver2d({
  prefold: (facts, seed) => geoWork.prefold(facts, seed),
  autoResolve: (facts, seed) => geoWork.autoResolve(facts, seed),
  resample: (facts, seed) => geoWork.resample(facts, seed),
  detect: (facts) => geoWork.detect(facts),
  reset: (which) => {
    if (which === 'all') interactive.clear();
    detect.clear();
  },
});
/** Every row re-typed, one press of «הציגו תצורה אחרת». */
const PLAN: WalkPlan = { submits: 'all', presses: 1 };

async function walk(figure: string): Promise<MeasuredAction[]> {
  const actions = SLOW ? await walkLines2d(driver, slowLines.get(figure)!, PLAN) : await walkFixture2d(driver, textOf.get(figure)!, PLAN);
  return actions.map((a) => ({ action: a.action, work: a.rec.work, ms: Number(a.rec.total_ms ?? 0), ...(typeof a.rec.u === 'string' ? { label: a.rec.u } : {}) }));
}

describe('work meter — 2-D: no recorded student action does more solver work than its baseline', () => {
  beforeAll(async () => {
    interactive = await workerHeap();
    detect = await workerHeap();
    // a lock that compared one heap with itself would pass by checking nothing (docs/17 §9)
    expect(interactive.replay, "the interactive worker's engine is not the page's").not.toBe(pageReplay);
    expect(detect.replay, "the detect worker's engine is not the page's").not.toBe(pageReplay);
    expect(detect.replay, 'the two workers are two module instances').not.toBe(interactive.replay);
    useGeoWorkExecutor(
      executorByLane({
        interactive: isolatedExecutor(interactive.ops, { units: interactive.units, seed: interactive.seed }),
        detect: isolatedExecutor(detect.ops, { units: detect.units, seed: detect.seed }),
      }),
    );
  }, 120_000);
  afterAll(() => useGeoWorkExecutor(null));
  for (const figure of walkOrder(corpus).filter(gate.wants)) {
    it(figure, async () => {
      gate.check(figure, await walk(figure));
    }, SLOW ? 7_200_000 : 900_000);
  }

  // The slow corpus is walked once: it is asked for by hand, and its figures are the dearest ones.
  if (!SLOW) {
    // docs/17 §7: a work count's lock runs a figure again, warm and after other figures, and asserts EQUAL WORK.
    it('the counts are reproducible: a second walk of a figure, after every other figure, counts the same', async () => {
      const byCost = gate.walkedByCost();
      const again = [...new Set([byCost[Math.floor(byCost.length * 0.1)], byCost[Math.floor(byCost.length * 0.5)]])].filter(Boolean);
      expect(again.length).toBeGreaterThan(0);
      for (const figure of again) {
        const second = await walk(figure);
        const third = await walk(figure);
        expect(firstDifference(gate.measured(figure)!, second), `«${figure}», walked again after the whole corpus`).toBeNull();
        expect(firstDifference(second, third), `«${figure}», walked twice in a row`).toBeNull();
      }
    }, 900_000);
  }

  it(gate.recording ? 're-records the baseline' : 'the baseline matches the corpus, and the page-lane total has not risen', () => {
    gate.finish(corpus);
  });
});
