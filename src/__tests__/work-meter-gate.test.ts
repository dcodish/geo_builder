/**
 * THE 2-D WORK-METER GATE (#2873, [ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 0).
 *
 * Every saved figure in `fixtures/` is walked through the student's actions — re-typing each row, «הציגו תצורה אחרת»,
 * a cold load, an edit, a delete, the background detection — and each action's solver work is held against
 * `work-meter/baseline.jsonl`. An action that does MORE work than its baseline fails; the message says which figure,
 * which action, the numbers, and what to do. The rule, the tolerance (zero) and the re-record are `shell/__tests__/
 * work-gate.ts`'s; the actions are `work-meter/driver2d.ts`'s, the same driver the timing harness runs.
 *
 * One unit is one `evaluateCore` call. The worker's operations go through the App's own client (`geoWork`): under
 * node that is its synchronous fallback, which charges the worker lane and runs every search with NO clock (vitest's
 * MODE 'test'). So this measures the whole search, not the part a browser's 12-second budget lets it finish.
 *
 * Re-record: `npm run work:record -- 2d` (docs/08, "The work meter").
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { geoWork } from '@/store/geoWork';
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
const driver = createDriver2d({
  prefold: (facts, seed) => geoWork.prefold(facts, seed),
  autoResolve: (facts, seed) => geoWork.autoResolve(facts, seed),
  resample: (facts, seed) => geoWork.resample(facts, seed),
  detect: (facts) => geoWork.detect(facts),
});
/** Every row re-typed, one press of «הציגו תצורה אחרת». */
const PLAN: WalkPlan = { submits: 'all', presses: 1 };

async function walk(figure: string): Promise<MeasuredAction[]> {
  const actions = SLOW ? await walkLines2d(driver, slowLines.get(figure)!, PLAN) : await walkFixture2d(driver, textOf.get(figure)!, PLAN);
  return actions.map((a) => ({ action: a.action, work: a.rec.work, ms: Number(a.rec.total_ms ?? 0), ...(typeof a.rec.u === 'string' ? { label: a.rec.u } : {}) }));
}

describe('work meter — 2-D: no recorded student action does more solver work than its baseline', () => {
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
