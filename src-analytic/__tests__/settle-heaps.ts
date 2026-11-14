/**
 * TWO HEAPS IN ONE PROCESS (#2890, [ADR-AG-477](../../docs/06c-decisions-analytic.md#adr-ag-477)) — the test-side stand-in
 * for a worker, until the shared client's isolated executor replaces it.
 *
 * `derive`'s store is one per work-meter lane, and every solver memo hangs off a construction that only the store
 * reaches. So work run in the worker's lane leaves NOTHING the page's lane can read, exactly as a browser's worker
 * leaves nothing in the page's heap. What reaches the page here is what reaches it there: a settled result, through a
 * structured clone, adopted (`engine/settle.ts`).
 */
import { inWorkerLane, readWork } from '../../shell/workMeter';
import { adoptSettled, cloneLoss, settledOf, settling } from '../engine/settle';
import { sequencesOf, type FixtureSequence, type WalkHooks } from './work-meter/walkAnalytic';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Run `fn` in the worker's heap, then hand the page everything it settled: export, clone, adopt. */
export function handOver<T>(fn: () => T): { value: T; loss: string[]; lists: number } {
  const { value, keys } = inWorkerLane(() => settling(fn));
  const message = inWorkerLane(() => settledOf(keys));
  const loss = cloneLoss(message);
  adoptSettled(structuredClone(message));
  return { value, loss, lists: message.lists.length };
}

export interface HandedOver {
  action: string;
  /** What the page's own part of the action cost, after the hand-over: the number that has to be zero. */
  pageUnits: number;
  lists: number;
  loss: string[];
}

/** The walk's hooks for two heaps: every step in the worker, every action handed over, the page's render metered. */
export function twoHeaps(): { hooks: WalkHooks; handed: HandedOver[] } {
  const handed: HandedOver[] = [];
  const hooks: WalkHooks = {
    setup: (fn) => inWorkerLane(fn),
    each: (action, run, page) => {
      const { value, loss, lists } = handOver(run);
      const before = readWork().page;
      page(value);
      handed.push({ action, pageUnits: readWork().page - before, lists, loss });
      return value;
    },
  };
  return { hooks, handed };
}

/**
 * The saved sequences a two-heap lock runs: a spread chosen for what each exercises (a traced locus and its chip, eleven
 * line lists in one hand-over, independent parts, a recorded cevian host, a re-lettered construction, an ellipse the
 * givens make a circle, refusals), cheap enough for the suite. `all` is every saved sequence (minutes: on demand).
 */
export const HEAP_SAMPLE = [
  'answer-in-parameter-q16-2735.analytic.json',
  'exam-2024sB-locus-1138.analytic.json',
  'issue-1973-cevian-host.analytic.json',
  'issue-2222-mixed-number-glyph.analytic.json',
  'issue-2639-order-chain.analytic.json',
  'operator-letters-on-side-2691.analytic.json',
  'ellipse-book-p4-24-2619.analytic.json',
  'exam-2552-q6-pair-joined.analytic.json',
  'minted-name-referred-2848.analytic.json',
  'corpus471.json#13/4',
  'issue-1996-parallelogram-inscribed.analytic.json',
];

export function heapSequences(all: boolean): FixtureSequence[] {
  const dir = join(__dirname, 'fixtures');
  const every = readdirSync(dir)
    .sort()
    .flatMap((f) => sequencesOf(f, JSON.parse(readFileSync(join(dir, f), 'utf8'))));
  return all ? every : every.filter((s) => HEAP_SAMPLE.includes(s.id));
}
