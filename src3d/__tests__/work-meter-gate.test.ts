/**
 * THE 3-D WORK-METER GATE (#2873, [ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 0).
 *
 * Every saved figure in `fixtures3/` is walked through the student's actions — a cold load, re-typing each row,
 * «הציגו תצורה אחרת», a delete, undo and redo, a row unticked and ticked, an edit, the data panel opened, a rename, a
 * swap and the ask lane (#2890) — and each action's solver work is held against `work-meter/baseline.jsonl`. An
 * action that does MORE work than its baseline fails; the message says which figure, which action, the numbers, and
 * what to do. The rule, the tolerance (zero) and the re-record are `shell/__tests__/work-gate.ts`'s; the actions are
 * `work-meter/driver3.ts`'s, the same driver the timing harness runs.
 *
 * One unit is one residual evaluation of `leastSquares`.
 *
 * TWO HEAPS (#2890 round 2, [ADR-3D-493](../../docs/06b-decisions-3d.md#adr-3d-493), ADR-W-210 invariant 1). The App's
 * jobs are solved by 3-D's worker (`app/offPage3.ts`). Here the worker is a SECOND module instance of its operations
 * (`app/ops3.ts`), served by the shell's `isolatedExecutor`, which clones every message as a browser does. The page is
 * this file's own instance: it adopts each job's journal and runs its own action and readers, so its `page` count is
 * what a browser's page solves (zero, and the baseline says so), `total` is the worker's work, and `prePaint` is the
 * part of it before the figure (the values follow it).
 *
 * #2888 (ADR-3D-491): solved content outlives the action, so each figure's walk starts from cleared caches and then
 * stays warm, as one student session does (`work-meter/walk3.ts` says exactly where). That is what keeps a count
 * independent of the figures walked before it, which the reproducibility lock below still asserts.
 *
 * test-budget: the gate walks all 176 fixtures through every student action (2 914 actions since #2890; 1 266 before):
 * about 9 min alone (5 min before the walk gained its ten actions, ADR-3D-492 part 3). One file, because the baseline
 * is one file.
 *
 * Re-record: `npm run work:record -- 3d` (docs/08, "The work meter").
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { walkFixture3, walkLines3, type WalkPlan3 } from './work-meter/walk3';
import { SLOW_CORPUS_3D } from './work-meter/slowCorpus3';
import { figureContent3 } from '../engine/evaluate';
import { firstDifference, openWorkGate, walkOrder, type MeasuredAction } from '../../shell/__tests__/work-gate';
import { isolatedExecutor } from '../../shell/workerExecutor';
import { secondInstance } from '../../shell/__tests__/isolated-ops';
import { useWork3Executor } from '../app/offPage3';
import { sessionHooks3 } from './work-meter/driver3';

const DIR = join(__dirname, '..', '..', 'fixtures3');
/** `WORK_METER_CORPUS=slow` (`npm run work:check -- 3d --slow`): the open speed issues' sequences instead of the fixtures. */
const SLOW = process.env.WORK_METER_CORPUS === 'slow';
const slowLines = new Map(SLOW_CORPUS_3D.map((q) => [q.id, q.lines]));
const corpus = (SLOW ? [...slowLines.keys()] : readdirSync(DIR).filter((f) => f.endsWith('.geo3.json'))).sort();

const gate = openWorkGate({
  product: '3d',
  title: '3-D',
  unit: 'one residual evaluation of leastSquares (src3d/engine/solve3.ts)',
  dir: join(__dirname, 'work-meter'),
  corpus: SLOW ? 'slow' : 'fixtures',
  perfCommand: (figure) => `node scripts/perf/3d/drive3.mjs --only "${SLOW ? 'issue' : 'fx'}:${figure}"`,
});
/** Every row re-typed, one press of «הציגו תצורה אחרת». */
const PLAN: WalkPlan3 = { submits: 'all', presses: 1 };

/** The worker's heap: 3-D's operations as its worker entry serves them, in a module instance of their own. */
const workerHeap = () =>
  secondInstance(async () => {
    const { ops3, takeCheckpoint3 } = await import('../app/ops3'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    const { clearSolveCaches3 } = await import('../store/store3'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    const { figureContent3: content } = await import('../engine/evaluate'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    const { readWork } = await import('../../shell/workMeter'); // load-in-body-ok: a worker's heap is a second module instance, loaded from the beforeAll below
    return { ops: ops3(), clear: clearSolveCaches3, content, units: () => readWork().total, seed: takeCheckpoint3 };
  });
let worker: Awaited<ReturnType<typeof workerHeap>>;
beforeAll(async () => {
  worker = await workerHeap();
  useWork3Executor(isolatedExecutor(worker.ops, { units: worker.units, seed: worker.seed }));
  sessionHooks3.clearOthers = worker.clear;
});
afterAll(() => {
  useWork3Executor(null);
  sessionHooks3.clearOthers = null;
});

async function walk(figure: string): Promise<MeasuredAction[]> {
  const actions = SLOW ? await walkLines3(slowLines.get(figure)!, PLAN) : await walkFixture3(readFileSync(join(DIR, figure), 'utf8'), PLAN);
  return actions.map((a) => ({ action: a.action, work: a.rec.work, ms: a.rec.ms, ...(a.utterance ? { label: a.utterance } : {}) }));
}

describe('work meter — 3-D: no recorded student action does more solver work than its baseline', () => {
  for (const figure of walkOrder(corpus).filter(gate.wants)) {
    it(figure, async () => {
      const walked = await walk(figure);
      // #2888: a construction that stands for its content was never altered after it was solved (every figure's session), in either heap
      expect(figureContent3.changed().length, 'a construction was altered after it was taken as its content').toBe(0);
      expect(worker.content.changed().length, "the worker's heap: a construction was altered after it was taken as its content").toBe(0);
      gate.check(figure, walked);
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
