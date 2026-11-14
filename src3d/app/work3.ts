/**
 * #2874 ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 1) — 3-D's WORK QUEUE and its
 * ROUTING REGISTRY.
 *
 * 3-D solves on the page's own thread: the deterministic decision runs in the click's handler and
 * `derive3` runs inside the React render that follows the store update. A flag set in the handler could
 * never paint before either. So every student action that re-solves the figure is one job on
 * {@link work3} (`shell/work`): counted from the click, run only after the working indicator has been
 * painted, and counted until the paint that follows the render its store update triggered.
 *
 * The registry is what makes a NEW action impossible to add without deciding: every function the store
 * exposes is a job ({@link JOB_ACTIONS_3}: it writes the figure's basis, `facts` or `seed`) or free
 * ({@link FREE_ACTIONS_3}, with its reason). `work-routing.test.ts` fails on an unclassified action,
 * on a free action that writes the basis, and on a component that reaches a job action through the store
 * instead of through {@link act3} or {@link jobStore3}.
 */
import { INTERACTIVE, createWorkQueue, queuedActions, watchBasis } from '../../shell/work';
import { redo3, undo3, useGeo3, type Fact3 } from '../store/store3';
import type { Seed3 } from '../engine/components3';
import { historyTarget3, offPageRun3 } from './offPage3';
import type { StoreAction3 } from './ops3';

/** The store fields `derive3` reads: a change to either re-solves the figure. */
export const BASIS_FIELDS_3 = ['facts', 'seed'] as const;

/** What a job is started for: the fact list and the configuration on screen at the action. */
export interface Basis3 {
  facts: Fact3[];
  seed: Seed3;
}

/** The lane of «הציגו תצורה אחרת»: shown on its own button, as 2-D shows it (measured at `main`, 2026-11-13). */
export const ANOTHER = 'another';
/**
 * #2890 ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) Am. 4, ruled): «הציגו תצורה אחרת» pressed while
 * another action runs WAITS ITS TURN and then searches the figure that action left. It is still counted and shown on
 * its own button, and a line entered while a search runs does not wait for the search.
 */
/**
 * #2890 round 2 (ADR-3D-493): the lane of a job that only READS the figure's values: the data panel opened on a
 * standing figure, a question asked. It shows nothing on the submit button (the panel says «בודק…»), and it takes its
 * turn behind the student's actions, so it reads the figure they leave.
 */
export const VALUES = 'values';
const BEHIND = { [ANOTHER]: INTERACTIVE, [VALUES]: INTERACTIVE };

export const work3 = createWorkQueue<Basis3>({
  basis: () => {
    const s = useGeo3.getState();
    return { facts: s.facts, seed: s.seed };
  },
  sameBasis: (a, b) => a.facts === b.facts && a.seed === b.seed,
  behind: BEHIND,
});
/** The lane of the model call a submit makes: nested in the submit's job, it hides the stale notices while the answer is awaited. */
export const MODEL = 'model';

/** The store actions that write the figure's basis: each is reached from a component only as a job. */
export const JOB_ACTIONS_3 = ['submit', 'dispatchVerdict', 'submitSteps', 'toggle', 'remove', 'replaceFact', 'rename', 'swap', 'clear', 'resample', 'loadFigure'] as const;

const DISPLAY = 'a display preference: `derive3` does not read it';

/** The store actions that do NOT write the basis, each with why. */
export const FREE_ACTIONS_3: Readonly<Record<string, string>> = {
  addQuery: 'the ask lane: it reads the figure and never writes its basis',
  removeQuery: 'the ask lane: it reads the figure and never writes its basis',
  togglePlaneDisplay: DISPLAY,
  toggleDisplayMode: DISPLAY,
  toggleDihedralShown: DISPLAY,
  setFigureName: "the figure's name",
  dismissError: 'closes a notice',
  reportLoadError: 'shows a refusal: nothing was loaded',
};

/** The history steps, which live beside the store (zundo's temporal) under these names. Both restore an earlier basis. */
export const HISTORY_ACTIONS_3 = ['undo3', 'redo3'] as const;

/**
 * #2890 round 2 ([ADR-3D-493](../../docs/06b-decisions-3d.md#adr-3d-493)): every routed action is SOLVED OFF THE PAGE
 * first (`offPage3.ts`): 3-D's worker runs it and the page's readers, the page adopts what that solved, and then the
 * store's own action runs here over it. An undo or a redo is run by the worker on the figure it goes back to.
 */
const offPage = (name: string, args: readonly unknown[], runLocal: () => unknown): Promise<unknown> => {
  if (name === 'undo' || name === 'redo') {
    const state = historyTarget3(name);
    return offPageRun3([], runLocal, state ? { state } : {});
  }
  return offPageRun3([{ kind: 'action', name: name as StoreAction3, args: [...args] }], runLocal);
};

/** The job actions AS JOBS: what a component calls. Same arguments; the result arrives in a promise. */
export const act3 = {
  ...queuedActions(work3, () => useGeo3.getState(), JOB_ACTIONS_3, { around: (name, args, _job, runLocal) => offPage(name, args, runLocal) }),
  ...queuedActions(work3, () => ({ undo: undo3, redo: redo3 }), ['undo', 'redo'] as const, { around: (name, args, _job, runLocal) => offPage(name, args, runLocal) }),
};

/**
 * The store, for code that is ALREADY inside a job (the submit's dispatch, a load): a job action called
 * through {@link act3} from inside a job of the same lane would wait for itself. Outside a job the basis
 * guard reports the call.
 */
export const jobStore3 = () => useGeo3.getState();

/** The basis guard's subscription: `changed` is called whenever `facts` or `seed` is replaced. */
export const onBasisChange3 = (changed: () => void) =>
  useGeo3.subscribe((s, prev) => {
    if (s.facts !== prev.facts || s.seed !== prev.seed) changed();
  });

/** Arm the basis guard on the page (development only): a figure that changes outside a job is reported. */
export const armBasisGuard3 = (report: (message: string) => void) =>
  watchBasis(work3, onBasisChange3, () => report('[work] the figure changed outside a job: an action reached the store without the work queue (#2874)'));
