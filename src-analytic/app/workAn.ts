/**
 * #2874 ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 1) — the analytic builder's
 * WORK QUEUE and its ROUTING REGISTRY.
 *
 * The analytic builder solves on the page's own thread: the submit decision and «הציגו תצורה אחרת» run in
 * the click's handler, and `derive` runs inside the React render that follows every store update. A flag
 * set in the handler could never paint before either. So every student action that re-solves the figure
 * is one job on {@link workAn} (`shell/work`): counted from the click, run only after the working
 * indicator has been painted, and counted until the paint that follows the render its store update
 * triggered.
 *
 * The registry is what makes a NEW action impossible to add without deciding: every function the store
 * exposes is a job ({@link JOB_ACTIONS_AN}: it writes the figure's basis — the lines, which of them are
 * muted, the configuration and its names, the hosts) or free ({@link FREE_ACTIONS_AN}, with its reason).
 * `work-routing.test.ts` fails on an unclassified action, on a free action that writes the basis, and
 * on a component that reaches a job action through the store instead of through {@link actAn} or
 * {@link jobStoreAn}.
 */
import { INTERACTIVE, createWorkQueue, queuedActions, watchBasis } from '../../shell/work';
import { useAnalyticStore } from '../store/useAnalyticStore';

type State = ReturnType<typeof useAnalyticStore.getState>;

/** The store fields `derive` reads: a change to any of them re-solves the figure. */
export const BASIS_FIELDS_AN = ['lines', 'disabled', 'seed', 'seedNames', 'hosts'] as const;

/** What a job is started for: the basis fields as they were at the action. */
export type BasisAn = Pick<State, (typeof BASIS_FIELDS_AN)[number]>;

const basisOf = (s: State): BasisAn => ({ lines: s.lines, disabled: s.disabled, seed: s.seed, seedNames: s.seedNames, hosts: s.hosts });
const sameBasis = (a: BasisAn, b: BasisAn) => BASIS_FIELDS_AN.every((k) => a[k] === b[k]);

/** The lane of «הציגו תצורה אחרת»: shown on its own button, as 2-D shows it (measured at `main`, 2026-11-13). */
export const ANOTHER = 'another';
/**
 * #2890 ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) Am. 4, ruled): «הציגו תצורה אחרת» pressed while
 * another action runs WAITS ITS TURN and then searches the figure that action left. It is still counted and shown on
 * its own button, and a line entered while a search runs does not wait for the search.
 */
const BEHIND = { [ANOTHER]: INTERACTIVE };

export const workAn = createWorkQueue<BasisAn>({ basis: () => basisOf(useAnalyticStore.getState()), sameBasis, behind: BEHIND });
/** The lane of the model call a submit makes, nested in the submit's job. */
export const MODEL = 'model';

/** The store actions that write the figure's basis: each is reached from a component only as a job. */
export const JOB_ACTIONS_AN = [
  'recordLine',
  'recordLlmLines',
  'removeLine',
  'replaceLine',
  'setDisabled',
  'applyRename',
  'applySwap',
  'clearAll',
  'goToSeed',
  'undo',
  'redo',
  'restore',
] as const;

const DISPLAY = 'a display choice: `derive` does not read it';
const NOTE = 'a message or a label: nothing is solved';

/** The store actions that do NOT write the basis, each with why. */
export const FREE_ACTIONS_AN: Readonly<Record<string, string>> = {
  toggleSegHidden: DISPLAY,
  toggleSegDashed: DISPLAY,
  toggleCurveHidden: DISPLAY,
  toggleCurveDashed: DISPLAY,
  setAnnotations: DISPLAY,
  setDisplay: DISPLAY,
  setQueries: 'the ask lane: it reads the figure, never writes its basis, and shows its own pending state',
  setError: NOTE,
  setNotice: NOTE,
  setName: NOTE,
  setLoadAudit: NOTE,
  serialize: 'reads the session for a save: nothing is written',
};

/** The job actions AS JOBS: what a component calls. Same arguments; the result arrives in a promise. */
export const actAn = queuedActions(workAn, () => useAnalyticStore.getState(), JOB_ACTIONS_AN);

/**
 * The store, for code that is ALREADY inside a job (the submit's commit, a load): a job action called
 * through {@link actAn} from inside a job of the same lane would wait for itself. Outside a job the basis
 * guard reports the call.
 */
export const jobStoreAn = () => useAnalyticStore.getState();

/** The basis guard's subscription: `changed` is called whenever a basis field is replaced. */
export const onBasisChangeAn = (changed: () => void) =>
  useAnalyticStore.subscribe((s, prev) => {
    if (!sameBasis(basisOf(s), basisOf(prev))) changed();
  });

/** Arm the basis guard on the page (development only): a figure that changes outside a job is reported. */
export const armBasisGuardAn = (report: (message: string) => void) =>
  watchBasis(workAn, onBasisChangeAn, () => report('[work] the figure changed outside a job: an action reached the store without the work queue (#2874)'));
