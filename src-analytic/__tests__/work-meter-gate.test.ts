/**
 * THE ANALYTIC WORK-METER GATE (#2873, [ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 0).
 *
 * Every saved sequence in `fixtures/` (a saved figure, or an entry of a corpus file) is walked through the student's
 * actions — typing each line, «הציגו תצורה אחרת», a cold load, a delete, an edit — and each action's solver work is held
 * against `work-meter/baseline.jsonl`. An action that does MORE work than its baseline fails; the message says which
 * figure, which action, the numbers, and what to do. The rule, the tolerance (zero) and the re-record are
 * `shell/__tests__/work-gate.ts`'s; the actions are `work-meter/driverAnalytic.ts`'s, the same driver the timing
 * harness runs.
 *
 * One unit is one residual evaluation of `solveLM`, of the rank beside it (`jacobianRank`) or of a root scan
 * (`scanRoots`). The analytic tree has no worker, so every unit is page work today — the honest starting point of
 * invariant 1; the part after the paint is the pool and the passive effects.
 *
 * A sequence is walked as SESSIONS (#2888, ADR-AG-476): solved content is kept by content across actions, so the walk
 * empties the store where a session starts (the sequence, its load, and its edit) and an action's count is what it adds
 * to its session. The edit is measured where the rows before it are solved and the edited row is not (the meter's one
 * definition of `edit`, every builder's). `work-meter/walkAnalytic.ts` says exactly where.
 *
 * test-budget: the gate walks all 208 saved sequences through every student action (1 963 actions): about 8 min alone
 * since #2888 (11 min before it, ADR-W-210 Am. 1). One file, because the baseline is one file.
 *
 * Re-record: `npm run work:record -- analytic` (docs/08, "The work meter").
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sequencesOf, walkSequence, type FixtureSequence, type WalkPlanA } from './work-meter/walkAnalytic';
import { SLOW_CORPUS_ANALYTIC } from './work-meter/slowCorpusAnalytic';
import { firstDifference, openWorkGate, walkOrder, type MeasuredAction } from '../../shell/__tests__/work-gate';
import { isolatedExecutor } from '../../shell/workerExecutor';
import { secondInstance } from '../../shell/__tests__/isolated-ops';
import { useDriverExecutor } from './work-meter/driverAnalytic';
import { derive as pageDerive } from '../engine/derive';

const DIR = join(__dirname, 'fixtures');
/** `WORK_METER_CORPUS=slow` (`npm run work:check -- analytic --slow`): the open speed issues' sequences instead of the fixtures. */
const SLOW = process.env.WORK_METER_CORPUS === 'slow';
const sequences = new Map<string, FixtureSequence>(
  (SLOW
    ? SLOW_CORPUS_ANALYTIC.map((q): FixtureSequence => ({ id: q.id, lines: q.lines }))
    : readdirSync(DIR)
        .sort()
        .flatMap((f) => sequencesOf(f, JSON.parse(readFileSync(join(DIR, f), 'utf8'))))
  ).map((s) => [s.id, s]),
);
const corpus = [...sequences.keys()].sort();

const gate = openWorkGate({
  product: 'analytic',
  title: 'analytic',
  unit: 'one residual evaluation of solveLM, jacobianRank or scanRoots (src-analytic/engine/solve.ts, pinRoots.ts)',
  dir: join(__dirname, 'work-meter'),
  corpus: SLOW ? 'slow' : 'fixtures',
  perfCommand: (figure) => `node scripts/perf/analytic/driver.mjs --only "${figure}"`,
});
/** Every line typed, one press of «הציגו תצורה אחרת». */
const PLAN: WalkPlanA = { submits: 'all', presses: 1 };

async function walk(figure: string): Promise<MeasuredAction[]> {
  const s = sequences.get(figure)!;
  return (await walkSequence(s.lines, s.seed, PLAN)).map((a) => ({ action: a.action, work: a.work, ms: a.ph.total, ...(a.utterance ? { label: a.utterance } : {}) }));
}

/**
 * #2890 (ADR-AG-478) — THE WORKER'S HEAP: analytic's operations as its worker entry serves them, in a module instance of
 * their own, every message cloned (`shell`'s isolated executor). The page's part of each action runs in this file's
 * instance, so its `page` count is what a browser's page does.
 */
const workerHeap = () =>
  secondInstance(async () => {
    const { opsAn, takeCheckpointAn } = await import('../app/opsAn'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    const { clearAnalyticCaches, derive } = await import('../engine/derive'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    const { readWork } = await import('../../shell/workMeter'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    return { ops: opsAn, clear: clearAnalyticCaches, units: () => readWork().total, seed: takeCheckpointAn, derive };
  });

describe('work meter — analytic: no recorded student action does more solver work than its baseline', () => {
  beforeAll(async () => {
    const worker = await workerHeap();
    // a lock that compared one heap with itself would pass by checking nothing (docs/17 §9)
    expect(worker.derive, "the worker's engine is not the page's").not.toBe(pageDerive);
    useDriverExecutor({ executor: isolatedExecutor(worker.ops, { units: worker.units, seed: worker.seed }), clear: worker.clear });
  }, 120_000);
  afterAll(() => useDriverExecutor(null));
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
