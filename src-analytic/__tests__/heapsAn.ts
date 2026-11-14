/**
 * #2890 ([ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478); ADR-W-210 Am. 4) — THE ANALYTIC WORKER'S HEAP, for a
 * test: the operations its worker entry serves (`app/opsAn.ts`), loaded as a second module instance
 * (`shell/__tests__/isolated-ops`), with what a test reads of that heap besides. Hand `ops` to `shell`'s isolated executor
 * (every message cloned, the units returned in the envelope) and the walk runs as a browser runs it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { secondInstance } from '../../shell/__tests__/isolated-ops';
import { sequencesOf, type FixtureSequence } from './work-meter/walkAnalytic';

export const workerHeapAn = () =>
  secondInstance(async () => {
    const { opsAn, takeCheckpointAn } = await import('../app/opsAn'); // load-in-body-ok: a worker's heap is a second module instance, loaded from a beforeAll
    const { clearAnalyticCaches, derive } = await import('../engine/derive'); // load-in-body-ok: a worker's heap is a second module instance, loaded from a beforeAll
    const { readWork } = await import('../../shell/workMeter'); // load-in-body-ok: a worker's heap is a second module instance, loaded from a beforeAll
    const { reading } = await import('./readingAn'); // load-in-body-ok: a worker's heap is a second module instance, loaded from a beforeAll
    return { ops: opsAn, seed: takeCheckpointAn, clear: clearAnalyticCaches, derive, units: () => readWork().total, reading };
  });
export type WorkerHeapAn = Awaited<ReturnType<typeof workerHeapAn>>;

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
