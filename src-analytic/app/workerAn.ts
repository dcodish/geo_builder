/**
 * THE ANALYTIC PAGE'S WORKER CLIENT (#2890, [ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478); ADR-W-210
 * phase 3): the page never solves.
 *
 * Every solve is an operation of `opsAn.ts`, run by the analytic worker (`analyticWorker.ts`) through the shared client
 * (`shell/workerClient`), or in process where there is no `Worker` (node, the suites, an old browser). What an
 * operation solved comes back as a SETTLED result and is adopted into the page's own store (`engine/settle.ts`), so the
 * page's synchronous readers (`App.tsx`'s render) find every answer already there.
 *
 * - **Decisions** ({@link decideAn}): the verdict, after the page has adopted what the decision solved.
 * - **Figures** ({@link showFigure}): a figure FIRST, its values after (operator ruling, 2026-11-14). The page knows,
 *   per figure, which stage it holds ({@link figureStage}): `figure` (draw it, every value pending) or `values`. A
 *   figure being shown is asked for once, however many renders want it; an answer that arrives for a figure the page
 *   has left is adopted all the same (it is content-keyed, so an undo back to it is a lookup) and only its re-render
 *   is spent.
 * - **The checkpoint**: a worker spawned after a crash or a cancel is handed the page's whole settled store, so it
 *   solves nothing the page already holds.
 *
 * No React here; `App.tsx` subscribes ({@link subscribeAn}).
 */
import { createWorkerClient, type WorkerLike } from '../../shell/workerClient';
import { sameInstanceExecutor, type Executor } from '../../shell/workerExecutor';
import { inWorkerLane } from '../../shell/workMeter';
import { configurationKey } from '../engine/evaluate';
import { heldLineListKeys, lineListKey, lineListOf } from '../engine/derive';
import { adoptSettled, settledOf, type Settled } from '../engine/settle';
import { activeLinesOf, opsAn, pinsOf, type BasisAn, type Decided, type OpsAn, type ShowArgs, type Shown } from './opsAn';
import type { ReaderInputs } from './figureReaders';

/** The one lane: one worker, so every solve shares one heap of caches. */
export const SOLVE = 'solve';

const spawn = (): WorkerLike => new Worker(new URL('./analyticWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

const inProcess: Executor = sameInstanceExecutor(opsAn);
let executor: Executor = inProcess;

/** Test seam: what runs the operations where there is no `Worker` (the work-meter gate hands an isolated heap). */
export function useAnExecutor(next: Executor | null): void {
  executor = next ?? inProcess;
}

/** The checkpoint for a fresh worker: what the page holds, settled. */
function checkpoint(): Settled | null {
  const keys = heldLineListKeys();
  return keys.length > 0 ? settledOf(keys) : null;
}

const client = createWorkerClient<OpsAn>({
  lanes: { [SOLVE]: { spawn, prePaint: true } },
  executor: { run: (lane, op, args, hooks) => executor.run(lane, op, args, hooks), seed: (lane, args) => executor.seed?.(lane, args) },
  seed: checkpoint,
});

/** Start the worker with the page (`main.tsx`), so its chunk downloads beside the page's own assets. */
export function startAnalyticWork(): void {
  client.start();
}

/** A real worker serves the operations (false in node, and after a lane fell back). */
export const workerServes = (): boolean => client.remote(SOLVE);

// ------------------------------------------------------------------ adoption, and who is told
let version = 0;
const listeners = new Set<() => void>();
/** A counter that grows with every adoption: a render keyed on it derives again and reads what was adopted. */
export const adoptedVersion = (): number => version;
export function subscribeAn(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function adopt(settled: Settled): void {
  adoptSettled(settled);
  version += 1;
  for (const listener of [...listeners]) listener();
}

/** Run one decision of `opsAn` off the page, adopt what it solved, answer its verdict. */
export async function decideAn<K extends Exclude<keyof OpsAn, 'show' | 'figure'>>(op: K, args: Parameters<OpsAn[K]>[0]): Promise<ReturnType<OpsAn[K]> extends Decided<infer V> ? V : never> {
  const out = (await client.run(SOLVE, op, args as never)) as Decided<unknown>;
  adopt(out.settled);
  return out.value as never;
}

// ------------------------------------------------------------------ figures, first, and their values
type Stage = 'figure' | 'values';
/** One figure as the page asks for it: the basis it is of, and what its readers are asked with. */
export interface FigureRequest {
  basis: BasisAn;
  inputs: ReaderInputs;
}
const listKeyOf = (b: BasisAn): string => lineListKey(activeLinesOf(b), b.seedNames, pinsOf(b));
/** A figure: its line list and its configuration. The readers' other inputs never change what is solved for the panel. */
const figureKeyOf = (b: BasisAn): string => JSON.stringify([listKeyOf(b), configurationKey(b.seed)]);
const questionKeyOf = (b: BasisAn, q: Question): string => JSON.stringify([figureKeyOf(b), q.sentence, q.via ?? null]);
const requestKeyOf = (r: FigureRequest): string => JSON.stringify([figureKeyOf(r.basis), r.inputs.asks.map((q) => [q.sentence, q.via ?? null])]);
type Question = ReaderInputs['asks'][number];

/** The figures whose figure stage the page holds, whose values it holds, and the questions answered on a figure. */
const figures = new Set<string>();
const values = new Set<string>();
const answered = new Set<string>();
const inFlight = new Map<string, { figure: Promise<void>; values: Promise<void> }>();

/**
 * Which stage of this figure the page holds. Nothing when its line list is no longer in the page's store (dropped by
 * the store's bound): a stage the page cannot read is not held.
 */
export function figureStage(basis: BasisAn): Stage | null {
  if (activeLinesOf(basis).length === 0) return 'values'; // the empty figure: nothing to solve
  if (!lineListOf(listKeyOf(basis))) return null;
  if (values.has(figureKeyOf(basis))) return 'values';
  return figures.has(figureKeyOf(basis)) ? 'figure' : null;
}

/** Is this question's answer on this figure held? A question is a value: until then its row is pending. */
export function isAnswered(basis: BasisAn, q: Question): boolean {
  return figureStage(basis) === 'values' && answered.has(questionKeyOf(basis, q));
}

/** Does the page still owe this request a visit to the worker: its values, or one of its questions? */
export function owesValues(r: FigureRequest): boolean {
  return figureStage(r.basis) !== 'values' || r.inputs.asks.some((q) => !answered.has(questionKeyOf(r.basis, q)));
}

/**
 * Ask for a figure and its values. `figure` resolves when the figure is adopted (draw it), `values` when its values
 * are, or when the worker gave way to a newer request before they were complete (the page then asks again while it
 * still shows that figure). A request already in flight is shared.
 */
export function showFigure(r: FigureRequest): { figure: Promise<void>; values: Promise<void> } {
  const key = requestKeyOf(r);
  const running = inFlight.get(key);
  if (running) return running;
  if (!owesValues(r)) return { figure: Promise.resolve(), values: Promise.resolve() };
  let figureDone!: () => void;
  const figure = new Promise<void>((resolve) => (figureDone = resolve));
  const args: ShowArgs = { basis: r.basis, inputs: r.inputs, ticks: client.remote(SOLVE) };
  const onPart = (name: string, value: unknown): void => {
    if (name !== 'figure') return;
    adopt(value as Settled);
    figures.add(figureKeyOf(r.basis));
    figureDone();
  };
  const done = client
    .run(SOLVE, 'show', args, { onPart })
    .then((shown: Shown) => {
      figures.add(figureKeyOf(r.basis));
      if (shown.complete) {
        values.add(figureKeyOf(r.basis));
        for (const q of r.inputs.asks) answered.add(questionKeyOf(r.basis, q));
      }
      adopt(shown.settled);
    })
    .catch((err) => {
      if (!client.isCancelled(err)) throw err;
    })
    .finally(() => {
      inFlight.delete(key);
      figureDone();
    });
  const entry = { figure, values: done };
  inFlight.set(key, entry);
  return entry;
}

/**
 * Where no worker serves (node, the suites, an old browser): the figure stage now, in this task, so the first render
 * of a figure draws it (its values follow from {@link showFigure}, as they do from a worker). Charged to the worker
 * lane: it is the work a browser's worker does.
 */
export function figureNow(r: FigureRequest): void {
  if (figureStage(r.basis) !== null) return;
  const settled = inWorkerLane(() => opsAn.figure({ basis: r.basis, inputs: r.inputs }));
  adoptSettled(settled);
  figures.add(figureKeyOf(r.basis));
}

/** Test-only: forget which stages the page holds (`clearAnalyticCaches` empties the store they describe). */
export function forgetFiguresAn(): void {
  figures.clear();
  values.clear();
  answered.clear();
  inFlight.clear();
}
