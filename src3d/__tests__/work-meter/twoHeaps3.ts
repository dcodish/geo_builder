/**
 * #2890 ([ADR-3D-492](../../../docs/06b-decisions-3d.md#adr-3d-492) part 2) — TWO HEAPS IN ONE PROCESS, WALKING IN STEP.
 *
 * A worker and a page are two heaps: each has its own store, engine and memos, and what one solved reaches the other
 * only as a cloned message. Under vitest a heap is a module instance (`vi.resetModules()` and fresh imports). W is the
 * solving heap and records a journal (`store/journal3.ts`); P is the page's and adopts it. `stepBoth3` runs ONE step
 * of the meter's walk (`walk3.ts`) in W, passes what W wrote through `structuredClone`, adopts it in P, runs the same
 * step in P, and says what P still solved. When the step renders, the hand-over is in two stages, cut where the
 * driver says the figure ends (`stages3.beforeValues`): P is given the figure's entries, runs the step with its
 * values off, and only then is given the values' entries and reads them.
 *
 * Local to this tree's tests on purpose: it moves onto the shared isolated executor when the shell's worker client
 * lands. The row ids: both heaps must name a new row alike (a worker job is handed the id the page drew). The test
 * file mocks `nanoid` to count from `globalThis[IDS3]`, and `inHeap3` points that at the running heap's own counter.
 */
import { vi } from 'vitest';
import type { WalkStep3 } from './walk3';

export const IDS3 = '__twoHeaps3Ids';

export async function heap3() {
  vi.resetModules();
  const store = await import('../../store/store3');
  const journal = await import('../../store/journal3');
  const walk = await import('./walk3');
  const driver = await import('./driver3');
  const evaluate = await import('../../engine/evaluate');
  const content = await import('../../engine/content3');
  const dataView = await import('../../engine/dataView');
  const meter = await import('../../../shell/workMeter');
  return { store, journal, walk, driver, evaluate, content, dataView, meter, ids: { n: 0 } };
}
export type Heap3 = Awaited<ReturnType<typeof heap3>>;

/** Run `fn` as heap `h`: a row id drawn inside it comes from `h`'s own counter. */
export function inHeap3<T>(h: Heap3, fn: () => T): T {
  (globalThis as unknown as Record<string, unknown>)[IDS3] = h.ids;
  return fn();
}

/**
 * Everything a student can see of a heap's figure: the store's state and, when the step has just RENDERED that state
 * (`rendered`), the derived figure, the DOF count and the panel. Reading those of a state no render has read would
 * solve it here, in both heaps, outside any step: a later step would then find it solved and the lock would pass on
 * work no job had handed over.
 */
export function seen3(h: Heap3, rendered: boolean): string {
  const st = h.store.useGeo3.getState();
  const state = { facts: st.facts.map((f) => [f.id, f.utterance, f.enabled, f.held ?? false]), seed: st.seed, queries: st.queries, lastError: st.lastError, lastNotice: st.lastNotice };
  if (!rendered) return JSON.stringify(state);
  const d = h.store.derive3(st.facts, st.seed);
  const reader = <T,>(fn: () => T): T | string => {
    try {
      return fn();
    } catch (e) {
      return `throw:${String(e)}`;
    }
  };
  return JSON.stringify({
    ...state,
    status: d.status,
    positions: [...d.positions],
    notices: d.notices,
    dof: reader(() => h.evaluate.freeDofCount3(d.construction, d.resolved)),
    panel: reader(() => h.dataView.dataView(d.construction, st.seed)),
  });
}

export interface BothStep3 {
  step: WalkStep3;
  /** the hand-over was in two stages (the step rendered) */
  staged: boolean;
  /** bytes of the journal as it crosses (V8's serialiser, which `structuredClone` uses): the figure stage, the values stage */
  bytes: [figure: number, values: number];
  /** units W solved in the step */
  wUnits: number;
  /** what P still did after adopting: units solved, derives and resolves not answered from a memo, figures solved again for a lazy value */
  p: { units: number; derives: number; resolves: number; solvedAgain: number };
  sameStep: boolean;
  sameView: boolean;
}

type Steps = Generator<WalkStep3, void, void>;
const resolvesOf = (h: Heap3): number => h.evaluate.resolveStats3.uncached + h.evaluate.resolveStats3.images;

/**
 * One step of the walk in both heaps. `rec` is W's recording (`W.journal.recordJournal3()`), `gw` and `gp` the same
 * walk's steps in W and in P. `sizeOf` measures a journal (the caller passes V8's serialiser). `null`: the walk is over.
 */
export function stepBoth3(W: Heap3, P: Heap3, rec: { take(): unknown }, gw: Steps, gp: Steps, sizeOf: (journal: unknown) => number): BothStep3 | null {
  type Journal = Parameters<Heap3['journal']['adoptJournal3']>[0];
  let figure: Journal | null = null;
  let figureBytes = 0;
  W.driver.stages3.beforeValues = () => {
    if (figure) return;
    const taken = rec.take(); // the FIGURE stage, as the worker would post it at this moment
    figureBytes = sizeOf(taken);
    figure = structuredClone(taken) as Journal;
  };
  const w0 = W.meter.readWork().total;
  let sw: IteratorResult<WalkStep3, void>;
  try {
    sw = inHeap3(W, () => gw.next());
  } finally {
    W.driver.stages3.beforeValues = null;
  }
  const wUnits = W.meter.readWork().total - w0;
  const taken = rec.take(); // the VALUES stage; or the whole step, when it did not render
  const restBytes = sizeOf(taken);
  const rest = structuredClone(taken) as Journal;
  if (sw.done) {
    const sp = inHeap3(P, () => gp.next());
    if (!sp.done) throw new Error('the two heaps walk different steps: W is done, P is not');
    return null;
  }

  const u0 = P.meter.readWork().total;
  const d0 = P.store.deriveStats3.uncached;
  const r0 = resolvesOf(P);
  let sp: IteratorResult<WalkStep3, void>;
  // Two stages for a measured action that rendered: it renders last, on the state it left, so its values are that
  // state's. A step between actions may change the store after its render: it is handed over whole, in its two messages.
  const staged = figure !== null && sw.value.rec !== undefined;
  if (figure && !staged) P.journal.adoptJournal3(figure as unknown as Journal);
  if (staged) {
    P.journal.adoptJournal3(figure as unknown as Journal);
    P.driver.stages3.values = false; // the page has not been handed the values yet
    try {
      sp = inHeap3(P, () => gp.next());
    } finally {
      P.driver.stages3.values = true;
    }
    P.journal.adoptJournal3(rest);
    P.driver.renderValues3();
  } else {
    P.journal.adoptJournal3(rest);
    sp = inHeap3(P, () => gp.next());
  }
  const isNewSession = sw.value.action === '(new session)';
  const p = {
    units: P.meter.readWork().total - u0,
    derives: isNewSession ? 0 : P.store.deriveStats3.uncached - d0,
    resolves: isNewSession ? 0 : resolvesOf(P) - r0,
    solvedAgain: P.evaluate.lazyStats3.solvedAgain,
  };
  const sameStep = !sp.done && sp.value.action === sw.value.action && (sp.value.rec?.verdict ?? '') === (sw.value.rec?.verdict ?? '');
  const sameView = seen3(W, staged) === seen3(P, staged);
  rec.take(); // what reading W's view wrote is no job's
  return { step: sw.value, staged, bytes: figure ? [figureBytes, restBytes] : [restBytes, 0], wUnits, p, sameStep, sameView };
}
