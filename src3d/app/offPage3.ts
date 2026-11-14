/**
 * #2890 round 2 ([ADR-3D-493](../../docs/06b-decisions-3d.md#adr-3d-493); ADR-W-210 phase 3, invariant 1) — 3-D's PAGE
 * DOES NOT SOLVE. Every action that changes or reads the figure is solved by 3-D's worker first (`ops3.ts`); the page
 * adopts what the worker wrote into the content-keyed memos (`store/journal3.ts`) and then runs its OWN, unchanged
 * action and readers, in which every solve is a memo hit.
 *
 *   const h = await offPage3([{ kind: 'action', name: 'remove', args: [id] }]);   // the worker solves; the figure's journal is adopted
 *   useGeo3.getState().remove(id);                                               // the page's own action: no solve
 *   h.after();                                                                   // the values follow (the data panel)
 *
 * - **The transport** is the shared client (`shell/workerClient`): one worker, started with the page
 *   ({@link startWork3}); a crashed or replaced worker is handed the figure on screen (`heldJournal3`).
 * - **Two messages a job**: the figure's journal (a part), then the values' journal (the value). The figure is drawn
 *   when its own journal is in; the values follow (operator, 2026-11-14: *"Figure first, both tools"*). So that a
 *   fast action is not drawn in two steps, the page waits for the values while the student would not see a wait: up
 *   to {@link WORKING_SHOWN_AFTER_MS} from the job's start, the shell's one threshold. Past it, the figure is drawn and
 *   the data panel says «בודק…» until its values arrive ({@link useValues3}).
 * - **The new rows' ids** are drawn here and sent with the job (`store/rowIds3.ts`): both heaps name a row alike.
 * - **The basis.** A job is solved for the store as it is when it is posted. If something else changed the figure
 *   before the page's action runs (an action of another lane), the job is posted again for the figure as it is now.
 *   What arrives for a figure the student has left is adopted anyway (it is keyed by content: useless, never wrong)
 *   and is never marked ready for the figure on screen.
 * - **Where there is no `Worker`** (node, the suites, an old browser) nothing is posted: the page's own action solves,
 *   as it always did, and the values are never pending. The work-meter gate hands an executor over a second module
 *   instance ({@link useWork3Executor}), as a browser's worker heap is.
 * - **The meter.** The units the worker reports with the figure's journal are before the paint; those with the
 *   values' journal are after it.
 */
import { useSyncExternalStore } from 'react';
import { createWorkerClient, type WorkerLike } from '../../shell/workerClient';
import type { Executor } from '../../shell/workerExecutor';
import { meterRemote } from '../../shell/workMeter';
import { WORKING_SHOWN_AFTER_MS } from '../../shell/frame/WorkingMark';
import { useGeo3, type Fact3 } from '../store/store3';
import { adoptJournal3, heldJournal3, type Journal3 } from '../store/journal3';
import { drawRowIds3, useRowIds3 } from '../store/rowIds3';
import type { Seed3 } from '../engine/components3';
import type { Ops3, StoreAction3, StoreData3, Step3 } from './ops3';

const SOLVE = 'solve';
const spawn = (): WorkerLike => new Worker(new URL('./worker3.ts', import.meta.url), { type: 'module' });

/** Where there is no worker: nothing is posted, and the page's own action solves. */
const onThePage: Executor = { run: () => Promise.resolve(null) };
let executor: Executor = onThePage;

/** The requests in flight, oldest first, and whether each has delivered its figure (the meter's phase). */
const inFlight: { figured: boolean }[] = [];

const client = createWorkerClient<Ops3>({
  lanes: { [SOLVE]: { spawn, prePaint: true } },
  executor: { run: (lane, op, args, hooks) => executor.run(lane, op, args, hooks), seed: (lane, args) => executor.seed?.(lane, args) },
  seed: () => {
    const { facts, seed } = useGeo3.getState();
    return facts.length > 0 ? heldJournal3(facts, seed) : null;
  },
  // the figure's units are before the paint, the values' after it (one worker serves the requests in order)
  meter: (units, prePaint) => meterRemote(units, prePaint && !(inFlight[0]?.figured ?? false)),
});

/** Start 3-D's worker with the page (`main.tsx`), so its chunk downloads beside the page's own. */
export function startWork3(): void {
  client.start();
}

/** Test seam: what serves the jobs where there is no `Worker`. `null`: nothing (the page solves). */
export function useWork3Executor(next: Executor | null): void {
  executor = next ?? onThePage;
}

/** Are 3-D's jobs solved off the page here? */
export const offPage3Active = (): boolean => client.remote(SOLVE) || executor !== onThePage;

/** Is the data panel open? The page says so; a job reads the values only then, as App3 does. */
let panelOpen = true;
export function setPanelOpen3(open: boolean): void {
  panelOpen = open;
}

/* ── which values are in hand, for which figure ── */

export interface Values3 {
  /** the figure the values are for */
  facts: Fact3[];
  seed: Seed3;
  /** the data panel's values are in hand */
  panel: boolean;
  /** the saved questions whose answers are in hand */
  queries: readonly string[];
}
let ready: Values3 | null = null;
/** The figure whose values are on their way, and when its job started (the threshold counts from there). */
let pending: { facts: Fact3[]; seed: Seed3; since: number } | null = null;
const listeners = new Set<() => void>();
let version = 0;
const changed = (): void => {
  version++;
  for (const l of [...listeners]) l();
};
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export interface ValuesView3 {
  /** the data panel's rows may be read (their solves are in hand) */
  panel: boolean;
  /** this saved question's answer may be read */
  answered(question: string): boolean;
  /** the values are on their way for this figure; how long ago its job started, in ms */
  pendingFor: number | null;
}

/** What may be read of the figure `(facts, seed)` now. Where jobs are not off the page, everything. */
export function values3(facts: readonly Fact3[], seed: Seed3): ValuesView3 {
  if (!offPage3Active()) return { panel: true, answered: () => true, pendingFor: null };
  const mine = ready !== null && ready.facts === facts && ready.seed === seed ? ready : null;
  const waiting = pending !== null && pending.facts === facts && pending.seed === seed ? now() - pending.since : null;
  return { panel: mine?.panel ?? false, answered: (q) => mine?.queries.includes(q) ?? false, pendingFor: waiting };
}

/** The same, for a React component: re-read whenever values arrive. */
export function useValues3(facts: readonly Fact3[], seed: Seed3): ValuesView3 {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => version, // a server render (the suites' renderToString) reads the same store
  );
  return values3(facts, seed);
}

/* ── a job ── */

export interface OffPage3 {
  /** Call right after the page's own action has run: the values follow for the figure it left. */
  after(): void;
  /** Settles when the values of that figure are in hand (at once where nothing is off the page). */
  readonly settled: Promise<void>;
}
const NOTHING: OffPage3 = { after: () => {}, settled: Promise.resolve() };
/** The values of the latest job's figure: settles when they are in hand. */
let latest: Promise<void> = Promise.resolve();
/** Settles when the values of the latest job are in hand (a reader that did not keep the job's handle waits here). */
export const latestValues3 = (): Promise<void> => latest;

const storeData = (): StoreData3 => {
  const s = useGeo3.getState();
  return { facts: s.facts, seed: s.seed, queries: s.queries, planeDisplay: s.planeDisplay, displayMode: s.displayMode, dihedralShown: s.dihedralShown };
};

/** Resolves with the value if it settles within `ms`, else with `undefined`. */
function within<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  if (ms <= 0) return Promise.race([p, Promise.resolve(undefined)]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), ms)))]).finally(() => clearTimeout(timer));
}

/** How many times a job is posted again because the figure changed under it before the page could run it. */
const REPOSTS = 2;

/**
 * Solve `steps` off the page and adopt the figure's journal. On return the page runs its own action (with the row ids
 * the worker used installed) and then calls `after()`. `state` overrides the store's data the job is run on (an undo
 * runs on the figure it goes back to).
 */
export async function offPage3(steps: Step3[], opts: { state?: Partial<StoreData3>; startedAt?: number; panel?: boolean } = {}): Promise<OffPage3> {
  if (!offPage3Active()) return NOTHING;
  const startedAt = opts.startedAt ?? now();
  const panel = opts.panel ?? panelOpen;
  for (let attempt = 0; ; attempt++) {
    const stamp = useGeo3.getState();
    const ids = drawRowIds3();
    const entry = { figured: false };
    inFlight.push(entry);
    const got: { figure: Journal3 | null } = { figure: null };
    let figureIn!: () => void;
    const figure = new Promise<void>((r) => (figureIn = r));
    const done: Promise<Journal3 | null> = client
      .run(SOLVE, 'act', { state: { ...storeData(), ...opts.state }, steps, ids, panel }, {
        onPart: (_name, value) => {
          entry.figured = true;
          got.figure = value as Journal3;
          figureIn();
        },
      })
      .then((v) => (v ?? null) as Journal3 | null, () => null) // a job that failed: the page solves for itself
      .finally(() => inFlight.splice(inFlight.indexOf(entry), 1));
    await Promise.race([figure, done]);
    if (got.figure) adoptJournal3(got.figure);
    // the values, while the student would not see the wait (the shell's threshold, from the job's start)
    const early = await within(done, startedAt + WORKING_SHOWN_AFTER_MS - now());
    if (early) adoptJournal3(early);
    const at = useGeo3.getState();
    if ((at.facts !== stamp.facts || at.seed !== stamp.seed) && attempt < REPOSTS) continue; // solved for a figure that is gone
    useRowIds3(ids);
    let settle!: () => void;
    const settled = new Promise<void>((r) => (settle = r));
    latest = settled;
    return {
      settled,
      after() {
        useRowIds3([]);
        const s = useGeo3.getState();
        const basis = { facts: s.facts, seed: s.seed };
        const mark = (): void => {
          const t = useGeo3.getState();
          if (t.facts === basis.facts && t.seed === basis.seed) {
            ready = { ...basis, panel, queries: [...t.queries] };
            if (pending?.facts === basis.facts && pending.seed === basis.seed) pending = null;
            changed();
          }
          settle();
        };
        if (early !== undefined) {
          mark();
          return;
        }
        pending = { ...basis, since: startedAt };
        changed();
        void done.then((values) => {
          if (values) adoptJournal3(values);
          mark();
        });
      },
    };
  }
}

/** A store action as a job runs it: solved off the page, then the store's own action over what was solved. */
export async function offPageRun3<T>(steps: Step3[], runLocal: () => T, opts: { state?: Partial<StoreData3>; startedAt?: number } = {}): Promise<T> {
  const h = await offPage3(steps, opts);
  try {
    return runLocal();
  } finally {
    h.after();
  }
}

/** One store action, by name. */
export const offPageAction3 = <T>(name: StoreAction3, args: unknown[], runLocal: () => T): Promise<T> => offPageRun3([{ kind: 'action', name, args }], runLocal);

/** The figure an undo or a redo goes back to (zundo's next entry), or undefined when there is none. */
export function historyTarget3(which: 'undo' | 'redo'): Partial<StoreData3> | undefined {
  const t = useGeo3.temporal.getState();
  const list = which === 'undo' ? t.pastStates : t.futureStates;
  const next = list[list.length - 1];
  return next ? (next as Partial<StoreData3>) : undefined;
}
