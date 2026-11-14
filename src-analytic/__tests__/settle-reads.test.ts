/**
 * #2890 ([ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478)) — AN ADOPTED RESULT READS EXACTLY AS A COMPUTED
 * ONE: what the page shows from the worker's settled result is what the worker's own heap shows.
 *
 * After every line of a saved sequence, as the page runs it: the decision in the worker (`submit`), then the figure
 * (`figure`), then the values (`show`), each through `shell`'s isolated executor over a second module instance
 * (`heapsAn.ts`) and adopted by this file's instance (the page). Then EVERYTHING THE PAGE READS off the figure
 * (`readingAn.ts`) is computed in both heaps and compared as text: at the figure stage (the pool held: what the first
 * paint shows) and at the values stage. A memo that depended on an identity the clone broke, a side table left behind,
 * or a lazy the page turned out to read, shows here as a different row.
 *
 * `SETTLE_READS=all` compares every saved sequence (minutes); the suite compares a sample.
 *
 * test-budget: eleven saved sequences, two full readings of the page in each heap per accepted line.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { heapSequences, workerHeapAn, type WorkerHeapAn } from './heapsAn';
import { reading } from './readingAn';
import { isolatedExecutor, type Executor } from '../../shell/workerExecutor';
import { adoptSettled, type Settled } from '../engine/settle';
import { canonicalSeed } from '../engine/evaluate';
import { clearAnalyticCaches } from '../engine/derive';
import type { BasisAn, Decided, Shown } from '../app/opsAn';
import type { SubmitVerdict } from '../app/submit';

let worker: WorkerHeapAn;
let executor: Executor;
const run = (op: string, args: unknown): Promise<unknown> => executor.run('solve', op, args);
type Basis = BasisAn & { lines: string[]; hosts: Record<number, readonly string[]> };

describe("#2890 — an adopted result reads exactly as the worker's own content does", () => {
  const sequences = heapSequences(process.env.SETTLE_READS === 'all');
  beforeAll(async () => {
    worker = await workerHeapAn();
    executor = isolatedExecutor(worker.ops, { units: worker.units, seed: worker.seed });
  }, 120_000);
  afterAll(() => clearAnalyticCaches());
  /** Readings compared over the whole run: a sequence whose every line is refused has none of its own. */
  let compared = 0;
  for (const s of sequences) {
    it(s.id, async () => {
      clearAnalyticCaches();
      worker.clear();
      let st: Basis = { lines: [], disabled: [], seed: 0, seedNames: {}, hosts: {} };
      const differ: string[] = [];
      for (const [k, line] of s.lines.entries()) {
        const out = (await run('submit', { raw: line, basis: st })) as Decided<SubmitVerdict>;
        adoptSettled(out.settled);
        const v = out.value;
        if (v.kind !== 'record') continue;
        st = {
          ...st,
          lines: [...st.lines, v.line],
          hosts: v.host?.ring ? { ...st.hosts, [st.lines.length]: [...v.host.ring] } : st.hosts,
          seed: v.configuration === undefined ? st.seed : canonicalSeed(v.configuration),
        };
        const inputs = { asks: [], annotations: {} };
        adoptSettled((await run('figure', { basis: st, inputs })) as Settled);
        const heldMine = reading(st.lines, st.seed, st.hosts, 'held');
        const heldTheirs = worker.reading(st.lines, st.seed, st.hosts, 'held');
        adoptSettled(((await run('show', { basis: st, inputs })) as Shown).settled);
        const mine = reading(st.lines, st.seed, st.hosts, 'values');
        const theirs = worker.reading(st.lines, st.seed, st.hosts, 'values');
        compared += 2;
        if (heldMine !== heldTheirs) differ.push(`submit#${k + 1} at the first paint`);
        if (mine !== theirs) differ.push(`submit#${k + 1} with its values`);
      }
      expect(differ, `${s.id}: readings that differ between the worker's content and the adopted clone`).toEqual([]);
    }, 900_000);
  }

  it('the comparison is not vacuous', () => {
    console.log(`settle-reads: ${compared} readings compared over ${sequences.length} sequences`);
    expect(compared).toBeGreaterThan(sequences.length);
  });
});
