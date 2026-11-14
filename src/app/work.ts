/**
 * #2874 ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 1) — 2-D's WORK QUEUE and its
 * ROUTING REGISTRY.
 *
 * Every student action that re-solves the figure is one job on {@link work} (`shell/work`): the working
 * indicator is the queue's derived state, painted before the engine runs and released in a `finally`. This
 * replaces the `busyRef` + `thinking` pair the submit, the load and the post-commit search each set and
 * cleared.
 *
 * The registry below is what makes a NEW action impossible to add without deciding: every function the
 * store exposes is either a job ({@link JOB_ACTIONS}: it writes the figure's basis, `facts` or `seed`, so
 * the fold re-runs) or free ({@link FREE_ACTIONS}, with its reason). `work-routing.test.ts` fails on
 * an unclassified action, on a free action that writes the basis, and on a component that reaches a job
 * action through the store instead of through {@link act} or {@link jobStore}.
 */
import { INTERACTIVE, createWorkQueue, queuedActions, watchBasis } from '../../shell/work';
import { useGeoStore, type Fact } from '@/store/geoStore';

/** The store fields the fold reads: a change to either re-solves the figure. */
export const BASIS_FIELDS = ['facts', 'seed'] as const;

/** What a job is started for: the fact list and the configuration on screen at the action. */
export interface Basis2D {
  facts: Fact[];
  seed: number;
}

/**
 * The lane of «הציגו תצורה אחרת». 2-D's search runs in the geometry worker and shows on its OWN button
 * (measured at `main`, 2026-11-13: that button reads «חושב…» and the submit button does not change), so
 * it is counted on its own lane and the box stays open while it runs.
 */
export const ANOTHER = 'another';
/**
 * #2890 ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) Am. 4, ruled): «הציגו תצורה אחרת» pressed while
 * another action runs WAITS ITS TURN and then searches the figure that action left. It is still counted and shown on
 * its own button, and a line entered while a search runs does not wait for the search.
 */
const BEHIND = { [ANOTHER]: INTERACTIVE };

export const work = createWorkQueue<Basis2D>({
  basis: () => {
    const s = useGeoStore.getState();
    return { facts: s.facts, seed: s.seed };
  },
  sameBasis: (a, b) => a.facts === b.facts && a.seed === b.seed,
  behind: BEHIND,
});

/** The store actions that write the figure's basis: each is reached from a component only as a job. */
export const JOB_ACTIONS = [
  'execute',
  'executeMany',
  'undo',
  'redo',
  'update',
  'toggle',
  'remove',
  'setGroupEnabled',
  'removeGroup',
  'replaceGroup',
  'cycleAlt',
  'cycleVariant',
  'resample',
  'autoResolve',
  'applyView',
  'rename',
  'nameCentre',
  'reletterHidden',
  'promote',
  'swap',
  'merge',
  'clear',
  'loadFigure',
] as const;

const PANEL = 'a panel or ask lane: it reads the figure, never writes its basis, and shows its own pending state';
const DISPLAY = 'a display preference: the fold does not read it';

/** The store actions that do NOT write the basis, each with why. */
export const FREE_ACTIONS: Readonly<Record<string, string>> = {
  select: 'the highlighted row',
  setFigureName: "the figure's name",
  viewRelations: PANEL,
  clearRelations: PANEL,
  viewValues: PANEL,
  clearValues: PANEL,
  addQuery: PANEL,
  removeQuery: PANEL,
  answerAsks: PANEL,
  detectShapes: PANEL,
  clearShapes: PANEL,
  detectCrossings: PANEL,
  setShowMeasures: DISPLAY,
  setShowCenters: DISPLAY,
  toggleHidden: DISPLAY,
  toggleSegHidden: DISPLAY,
  toggleSegDashed: DISPLAY,
  toggleCircleHidden: DISPLAY,
  toggleDisplayMode: DISPLAY,
};

/** The job actions AS JOBS: what a component calls. Same arguments; the result arrives in a promise. */
export const act = queuedActions(work, () => useGeoStore.getState(), JOB_ACTIONS);

/**
 * The store, for code that is ALREADY inside a job (a pipeline's closure, the post-commit search's
 * `applyView`): a job action called through {@link act} from inside a job of the same lane would wait for
 * itself. Outside a job the basis guard reports the call.
 */
export const jobStore = () => useGeoStore.getState();

/** The basis guard's subscription: `changed` is called whenever `facts` or `seed` is replaced. */
export const onBasisChange = (changed: () => void) =>
  useGeoStore.subscribe((s, prev) => {
    if (s.facts !== prev.facts || s.seed !== prev.seed) changed();
  });

/** Arm the basis guard on the page (development only): a figure that changes outside a job is reported. */
export const armBasisGuard = (report: (message: string) => void) =>
  watchBasis(work, onBasisChange, () => report('[work] the figure changed outside a job: an action reached the store without the work queue (#2874)'));
