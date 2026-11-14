/**
 * #2874 ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 1) — the complex builder's
 * WORK QUEUE and its ROUTING REGISTRY.
 *
 * Complex's fold is exact and costs milliseconds, so it stays on the page's own thread (ADR-W-210's stated
 * exception), UNDER A WORK CEILING (#2890, [ADR-CX-091](../../docs/06d-decisions-complex.md#adr-cx-091)): one student
 * action may charge at most {@link CEILING_CX} units to the page. Its routed store actions run through the shared
 * page-lane executor (`shell/workerExecutor`), and every job is measured whole, the render it causes included. An
 * action over the ceiling is reported and never cut: nothing can stop an exact fold honestly before phase 4.
 *
 * It still tells the student it is working the way every builder does: each student action
 * that re-folds the figure is one job on {@link workCx} (`shell/work`), counted from the click, run after
 * the working indicator has been painted, and released in a `finally`. The longest real case is loading a
 * file at the line cap (about a second).
 *
 * The registry is what makes a NEW action impossible to add without deciding: every function the store
 * exposes is a job ({@link JOB_ACTIONS_CX}: it writes the figure's basis — the lines, which of them are
 * muted, the configuration) or free ({@link FREE_ACTIONS_CX}, with its reason).
 * `work-routing.test.ts` fails on an unclassified action, on a free action that writes the basis, and
 * on a component that reaches a job action through the store instead of through {@link actCx} or
 * {@link jobStoreCx}.
 */
import { INTERACTIVE, createWorkQueue, queuedActions, watchBasis } from '../../shell/work';
import { pageLaneCeiling, pageLaneExecutor } from '../../shell/workerExecutor';
import { useComplexStore } from '../store/useComplexStore';

type State = ReturnType<typeof useComplexStore.getState>;

/** The store fields the fold reads: a change to any of them re-folds the figure. */
export const BASIS_FIELDS_CX = ['lines', 'disabled', 'seed'] as const;

/** What a job is started for: the basis fields as they were at the action. */
export type BasisCx = Pick<State, (typeof BASIS_FIELDS_CX)[number]>;

const basisOf = (s: State): BasisCx => ({ lines: s.lines, disabled: s.disabled, seed: s.seed });
const sameBasis = (a: BasisCx, b: BasisCx) => BASIS_FIELDS_CX.every((k) => a[k] === b[k]);

/** The executor's one lane: the page's own thread. */
const PAGE = 'page';
/** The lane of «הציגו תצורה אחרת»: shown on its own button, as 2-D shows it (measured at `main`, 2026-11-13). */
export const ANOTHER = 'another';
/**
 * #2890 ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) Am. 4, ruled): «הציגו תצורה אחרת» pressed while
 * another action runs WAITS ITS TURN and then searches the figure that action left. It is still counted and shown on
 * its own button, and a line entered while a search runs does not wait for the search.
 */
const BEHIND = { [ANOTHER]: INTERACTIVE };

/**
 * THE WORK CEILING, in complex's unit (one executed line read or one exact solve, ADR-CX-090): the most one student
 * action may charge to the page's thread. The dearest recorded action charges 26 (a load); the one loop that grows
 * with the figure, the gate's differential blame on a refused line, makes two folds per earlier line. The work-meter
 * gate fails a recorded action above it; on the page an action above it is reported ({@link armCeilingCx}).
 */
export const CEILING_CX = 256;

let reportOver: ((message: string) => void) | null = null;
/** Report an action over the ceiling on the page (development only, as the basis guard is armed). */
export const armCeilingCx = (report: (message: string) => void): void => {
  reportOver = report;
};
/** One job, whole: from its turn to its release after the paint that shows its result. */
const ceiling = pageLaneCeiling({
  ceiling: CEILING_CX,
  onOver: ({ lane, units }) => reportOver?.(`[work] an action on the «${lane}» lane charged ${units} units to the page; complex's ceiling is ${CEILING_CX} (#2890, ADR-CX-091)`),
});

export const workCx = createWorkQueue<BasisCx>({ basis: () => basisOf(useComplexStore.getState()), sameBasis, behind: BEHIND, span: ceiling });

/** The store actions that write the figure's basis: each is reached from a component only as a job. */
export const JOB_ACTIONS_CX = [
  'recordLine',
  'recordDisabledLine',
  'replaceLine',
  'removeLine',
  'setDisabledIdx',
  'nextConfig',
  'clearAll',
  'undo',
  'redo',
  'resetSession',
  'restoreView',
] as const;

const VIEW = 'a view choice: the fold does not read it';
const NOTE = 'a message or a label: nothing is folded';

/** The store actions that do NOT write the basis, each with why. */
export const FREE_ACTIONS_CX: Readonly<Record<string, string>> = {
  addQuery: 'the ask lane: it reads the figure and never writes its basis',
  removeQuery: 'the ask lane: it reads the figure and never writes its basis',
  setName: NOTE,
  toggleDisplay: VIEW,
  setDisplay: VIEW,
  setFree: 'a drag of a free point: it moves with the pointer, frame by frame, and is never a job',
  setView: VIEW,
  clearError: NOTE,
  setError: NOTE,
  setLoadAudit: NOTE,
  serialize: 'reads the session for a save: nothing is written',
};

/**
 * Complex's operations are its store's job actions as they are, run on the page's own lane: no worker, no clone,
 * the same store and the same order of effects. This is the routing every builder's actions have (a worker client's
 * executor); here the executor is the page-lane one.
 */
const pageLane = pageLaneExecutor(
  Object.fromEntries(JOB_ACTIONS_CX.map((name) => [name, (args: readonly unknown[]) => (useComplexStore.getState()[name] as (...a: unknown[]) => unknown)(...args)])),
);

/** The job actions AS JOBS: what a component calls. Same arguments; the result arrives in a promise. */
export const actCx = queuedActions(workCx, () => useComplexStore.getState(), JOB_ACTIONS_CX, {
  around: (name, args) => pageLane.run(PAGE, name, args),
});

/**
 * The store, for code that is ALREADY inside a job: a job action called through {@link actCx} from inside
 * a job of the same lane would wait for itself. Outside a job the basis guard reports the call.
 */
export const jobStoreCx = () => useComplexStore.getState();

/** The basis guard's subscription: `changed` is called whenever a basis field is replaced. */
export const onBasisChangeCx = (changed: () => void) =>
  useComplexStore.subscribe((s, prev) => {
    if (!sameBasis(basisOf(s), basisOf(prev))) changed();
  });

/** Arm the basis guard on the page (development only): a figure that changes outside a job is reported. */
export const armBasisGuardCx = (report: (message: string) => void) =>
  watchBasis(workCx, onBasisChangeCx, () => report('[work] the figure changed outside a job: an action reached the store without the work queue (#2874)'));
