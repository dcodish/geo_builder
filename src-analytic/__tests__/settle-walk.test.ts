/**
 * #2890 ([ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478); ADR-W-210 invariant 1) — THE TWO-HEAP WALK: with
 * every solve of every action in the worker's heap and handed over, THE PAGE SOLVES NOTHING.
 *
 * The work meter's own walk of a saved sequence (`work-meter/walkAnalytic.ts`), with its operations served by `shell`'s
 * isolated executor over a second module instance of `app/opsAn.ts` (`heapsAn.ts`): every message cloned, the units
 * returned in the envelope. Per action: the page's lane counts ZERO units, and no message the worker sends would lose
 * anything in a structured clone (`engine/settle.ts` `cloneLoss`, on every part and every value).
 *
 * `SETTLE_WALK=all` walks every saved sequence (about ten minutes); the suite walks a sample. The gate itself walks every
 * sequence the same way and holds its counts against the baseline.
 *
 * test-budget: eleven saved sequences, each walked once through every recorded action.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { walkSequence, type WalkPlanA } from './work-meter/walkAnalytic';
import { useDriverExecutor } from './work-meter/driverAnalytic';
import { heapSequences, workerHeapAn } from './heapsAn';
import { isolatedExecutor } from '../../shell/workerExecutor';
import type { OpContext, OpTable } from '../../shell/workerProtocol';
import { cloneLoss } from '../engine/settle';
import { derive as pageDerive } from '../engine/derive';

const PLAN: WalkPlanA = { submits: 'all', presses: 1 };
const losses: string[] = [];
let sent = 0;
/** The worker's table, with every part and every value it sends checked for what a clone would lose. */
function checked(ops: OpTable): OpTable {
  const check = (where: string, v: unknown): void => {
    sent += 1;
    for (const l of cloneLoss(v)) losses.push(`${where}: ${l}`);
  };
  return Object.fromEntries(
    Object.entries(ops).map(([name, f]) => [
      name,
      (args: unknown, ctx: OpContext) => {
        const out = f(args, {
          ...ctx,
          part: (part, value) => {
            check(`${name}/${part}`, value);
            ctx.part(part, value);
          },
        });
        if (out && typeof (out as Promise<unknown>).then === 'function') {
          return (out as Promise<unknown>).then((v) => {
            check(name, v);
            return v;
          });
        }
        check(name, out);
        return out;
      },
    ]),
  );
}

describe('#2890 — a settled result adopted by the page leaves the page nothing to solve', () => {
  const sequences = heapSequences(process.env.SETTLE_WALK === 'all');
  beforeAll(async () => {
    const worker = await workerHeapAn();
    expect(worker.derive, "the worker's engine is not the page's").not.toBe(pageDerive);
    useDriverExecutor({ executor: isolatedExecutor(checked(worker.ops), { units: worker.units, seed: worker.seed }), clear: worker.clear });
  }, 120_000);
  afterAll(() => useDriverExecutor(null));
  it('the sample is there', () => expect(sequences.length).toBeGreaterThanOrEqual(11));

  for (const s of sequences) {
    it(s.id, async () => {
      losses.length = 0;
      sent = 0;
      const walked = await walkSequence(s.lines, s.seed, PLAN);
      expect(walked.length).toBeGreaterThan(0);
      expect(sent, 'the worker answered').toBeGreaterThan(0);
      expect(losses, 'every message survives its clone whole').toEqual([]);
      expect(walked.filter((a) => a.work.page !== 0).map((a) => `${a.action}: ${a.work.page} units on the page`), 'the page solves nothing').toEqual([]);
    }, 900_000);
  }
});
