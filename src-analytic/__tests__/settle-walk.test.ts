/**
 * #2890 ([ADR-AG-477](../../docs/06c-decisions-analytic.md#adr-ag-477); ADR-W-210 invariant 1) — THE TWO-HEAP WALK: with
 * every action solved in a worker's heap and handed over, THE PAGE SOLVES NOTHING.
 *
 * The work meter's own walk of a saved sequence (`work-meter/walkAnalytic.ts`: every line typed, «הציגו תצורה אחרת», a
 * load, a delete, an edit, the questions, a row ticked off and on, undo, redo, a rename), run as phase 3 will run it:
 *   1. each action in the WORKER's lane, on the worker's own store, exactly as the committed driver runs it today;
 *   2. the line lists it touched handed over as a settled result (`engine/settle.ts`): exported, checked for anything a
 *      clone would lose, passed through `structuredClone`, adopted by the page's store;
 *   3. the page's own part (the commit's re-render and everything after it: `shownState` / `shownSession`) in the PAGE's
 *      lane, under the meter.
 * Three assertions per action: the worker did exactly the work the committed baseline records (so this is the same walk,
 * not a cheaper one); the message loses nothing in the clone; the page's lane counted ZERO units.
 *
 * It is this tree's own until the shared client lands: `settle-heaps.ts` then gives way to the isolated executor, and the
 * gate itself walks this way. `SETTLE_WALK=all` runs every saved sequence (about ten minutes); the suite runs a sample.
 *
 * test-budget: eleven saved sequences, each walked once through every recorded action.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { walkSequence, type WalkPlanA } from './work-meter/walkAnalytic';
import { heapSequences, twoHeaps } from './settle-heaps';

const PLAN: WalkPlanA = { submits: 'all', presses: 1 };
const baseline = new Map<string, number>();
for (const line of readFileSync(join(__dirname, 'work-meter', 'baseline.jsonl'), 'utf8').split('\n')) {
  if (!line.startsWith('{"k"')) continue;
  const row = JSON.parse(line) as { k: string; total: number };
  baseline.set(row.k, row.total);
}

describe('#2890 — a settled result adopted by the page leaves the page nothing to solve', () => {
  const sequences = heapSequences(process.env.SETTLE_WALK === 'all');
  it('the sample is there', () => expect(sequences.length).toBeGreaterThanOrEqual(11));

  for (const s of sequences) {
    it(s.id, () => {
      const { hooks, handed } = twoHeaps();
      const walked = walkSequence(s.lines, s.seed, PLAN, undefined, hooks);
      expect(walked.length).toBe(handed.length);
      // the worker ran the recorded walk: the same solver work as the committed baseline, action by action
      expect(
        walked.filter((a) => baseline.get(`${s.id}|${a.action}`) !== a.work.total).map((a) => `${a.action}: worker ${a.work.total}, baseline ${baseline.get(`${s.id}|${a.action}`)}`),
        'the worker lane does the work the baseline records',
      ).toEqual([]);
      expect(walked.filter((a) => a.work.page !== 0).map((a) => a.action), 'none of the action itself is charged to the page').toEqual([]);
      // nothing is lost in the clone
      expect(handed.filter((h) => h.loss.length > 0).map((h) => `${h.action}: ${h.loss.join('; ')}`), 'every message survives its clone whole').toEqual([]);
      // and the page, rendering from what it adopted, solves nothing
      expect(handed.filter((h) => h.pageUnits !== 0).map((h) => `${h.action}: ${h.pageUnits} units on the page`), 'the page solves nothing').toEqual([]);
    }, 900_000);
  }
});
