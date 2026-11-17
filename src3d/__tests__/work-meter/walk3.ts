/**
 * THE 3-D FIXTURE WALK (#2873, ADR-W-210 phase 0) — the student actions the work meter records for one saved figure.
 *
 * `load` is the cold load of the file. `submit#k` re-types the file's k-th row on the figure of the rows before it (a
 * row the deterministic lane no longer records is committed from its saved commands, unmeasured, so the rest of the
 * file still steps — as the timing harness does). Then one «הציגו תצורה אחרת», the delete of the first row, and an edit
 * of the last row. Since #2890 the walk also drives what it had left out (below): undo and redo, a row unticked and
 * ticked again, the data panel opened, a rename, a swap and the ask lane.
 *
 * THE SESSION THE WALK IS (#2888, [ADR-3D-491](../../../docs/06b-decisions-3d.md#adr-3d-491)). Solved content is keyed by
 * content and outlives the action, so a count depends on what the session solved before it, and the walk says what
 * that is:
 *  - a figure's walk STARTS FROM CLEARED CACHES (`newSession3()`, every heap), so its counts depend on
 *    nothing walked before it, in any order;
 *  - `load` is the COLD load of the file: a student who opens it in a new session;
 *  - the caches are cleared again, and the rows are then typed in ONE session that stays warm, as a student's does:
 *    `submit#k` runs on the figure of the rows before it, which that session has solved, and the press and the delete
 *    follow in the same session;
 *  - `edit` has a session of its own (`beforeEdit3`), the same in every builder: a
 *    student who has built rows 1..n changes the last row. The rows before it are solved in the session (in the store
 *    and rendered, unmeasured, at the configuration the figure stood at before the delete); the edited row's content is
 *    not. The edit rewrites the row to its own text, so its count is what the last row costs through the EDIT path.
 *    Rewriting a row the session had already solved counted almost nothing once the keys were content, and sized no
 *    edit;
 *  - "cleared" is every cache, by the one clear function (`clearSolveCaches3`): a session starts cold in all of them.
 *    The phase 0 walk carried one memo from its load into the typed session (the reading of a two-reading segment
 *    equation), so three recorded submits did not pay the reading's trial folds; they do now (ADR-3D-491 has the
 *    before and after).
 *  - **the actions the walk had left out** (#2890, [ADR-3D-492](../../../docs/06b-decisions-3d.md#adr-3d-492) part 3) are
 *    NEW lines; no line recorded before them depends on them:
 *      · after the delete, in the same session: `undo` (the figure before the delete comes back: the session has it),
 *        `redo`, the delete undone once more (unmeasured), then `untick` of the first row and `retick`;
 *      · after the edit, in a session of their own, THE READERS' SESSION: cleared caches, the built figure shown with
 *        the data panel CLOSED (unmeasured); then `panel` (the panel opened on that standing figure: the values
 *        alone), `rename` (the first point to the first free letter), `swap` (the first two letters), and `ask#k`
 *        (the figure's first point, the segment of its first two, the angle of its first three, those the ask lane
 *        reads). The asks are last because a saved question is answered again by every later render.
 * The slow corpus's walk types first: it starts from cleared caches, and its `load` (the saved figure, with the
 * session's own row ids) is made cold by clearing the solve caches before it. Its delete follows in the loaded session,
 * then its edit and the readers' session, by the same definitions.
 *
 * THE WALK IS A SEQUENCE OF STEPS (#2890, ADR-3D-492). `stepsOfFixture3` and `stepsOfLines3` yield after every step:
 * each measured action, and each thing the walk does between them (a new session, a figure shown, a row committed from
 * its saved commands). `walkFixture3` and `walkLines3` run them to the end and keep the measured ones.
 *
 * #2890 round 2 ([ADR-3D-493](../../../docs/06b-decisions-3d.md#adr-3d-493)): every step goes through the App's own job
 * path (`driver3.ts`), so a step the walk takes between two actions is solved where the student's actions are: in the
 * worker's heap, when the gate hands one. A new session empties every heap (`newSession3`).
 */
import { useGeo3, type Fact3 } from '../../store/store3';
import { deserializeFigure3 } from '../../store/figureFile3';
import {
  another3,
  ask3,
  commitSaved3,
  editLast3,
  loadFacts3,
  loadText3,
  metered3,
  newSession3,
  openPanel3,
  questionsOf3,
  redoStep3,
  removeFirst3,
  renameFirst3,
  setFigure3,
  showBeforeEdit3,
  showFigure3,
  showPanelClosed3,
  submitLine3,
  swapFirstTwo3,
  toggleFirst3,
  undoStep3,
  type ActionRecord3,
  type Outcome3,
} from './driver3';

export interface WalkedAction3 {
  /** The action's name inside its fixture: `load`, `submit#3`, `another#1`, `edit`, `delete`. */
  action: string;
  /** The typed line, for a submit. */
  utterance?: string;
  rec: ActionRecord3;
}

/** One step of a walk: a measured action (`rec`), or what the walk does between two of them (named in brackets). */
export interface WalkStep3 {
  action: string;
  utterance?: string;
  rec?: ActionRecord3;
}

export interface WalkPlan3 {
  /** Which rows are re-typed: every one, only the last, or none. */
  submits: 'all' | 'last' | 'none';
  /** How many times «הציגו תצורה אחרת» is pressed. */
  presses: number;
}

type Seed = ReturnType<typeof useGeo3.getState>['seed'];
type Steps3 = AsyncGenerator<WalkStep3, void, void>;

const clean = (fs: Fact3[]): Fact3[] => fs.map((f) => ({ id: f.id, enabled: f.enabled !== false, utterance: f.utterance, cmds: f.cmds }) as Fact3);

/** A measured action, as a step. */
async function measured(action: string, fn: () => Outcome3 | Promise<Outcome3>, onAction?: (action: string) => void, utterance?: string): Promise<WalkStep3 & { rec: ActionRecord3 }> {
  onAction?.(action);
  return { action, ...(utterance ? { utterance } : {}), rec: await metered3(fn) };
}

/** A new session: every cache cleared, in every heap. Its own step. */
async function* newSession(): Steps3 {
  newSession3();
  yield { action: '(new session)' };
}

/** The edit, in its own session (`beforeEdit3`): the rows before the last shown, then all of them in the store unsolved. */
async function* editSteps(built: { facts: Fact3[]; seed: Seed }, onAction?: (action: string) => void): Steps3 {
  onAction?.('edit');
  yield* newSession();
  await showBeforeEdit3(built.facts, built.seed);
  yield { action: '(rows before the edit)' };
  yield { action: 'edit', rec: await metered3(editLast3) };
}

/** After the delete, in its session: the delete undone and done again, then the first row unticked and ticked again. */
async function* afterDeleteSteps(onAction?: (action: string) => void): Steps3 {
  yield await measured('undo', undoStep3, onAction);
  yield await measured('redo', redoStep3, onAction);
  await undoStep3();
  yield { action: '(the delete undone again)' };
  yield await measured('untick', toggleFirst3, onAction);
  yield await measured('retick', toggleFirst3, onAction);
}

/** The readers' session (see the header): the panel opened on a standing figure, a rename, a swap, the asks. */
async function* readerSteps(built: { facts: Fact3[]; seed: Seed }, onAction?: (action: string) => void): Steps3 {
  yield* newSession();
  await showPanelClosed3(built.facts, built.seed);
  yield { action: '(figure, panel closed)' };
  yield await measured('panel', openPanel3, onAction);
  yield await measured('rename', renameFirst3, onAction);
  yield await measured('swap', swapFirstTwo3, onAction);
  let k = 0;
  for (const q of questionsOf3()) yield await measured(`ask#${++k}`, () => ask3(q), onAction, q);
}

export async function* stepsOfFixture3(text: string, plan: WalkPlan3, onAction?: (action: string) => void): Steps3 {
  const r = deserializeFigure3(text);
  if (!r.ok) return;
  /** A typed row; a row that no longer records is committed from its saved commands, outside the measurement. */
  async function* submit(f: Fact3, k: number): Steps3 {
    const step = await measured(`submit#${k + 1}`, () => submitLine3(f.utterance), onAction, f.utterance);
    const recorded = step.rec.verdict === 'record' || step.rec.verdict === 'retick';
    if (!recorded) step.rec.verdict += '(+saved-cmds)';
    yield step;
    if (recorded) return;
    await commitSaved3(f.utterance, f.cmds);
    yield { action: '(saved commands)' };
  }

  yield* newSession();
  setFigure3([], 0);
  yield await measured('load', () => loadText3(text), onAction);
  yield* newSession();
  if (plan.submits === 'all') {
    await showFigure3([], 0);
    yield { action: '(empty figure)' };
    for (const [k, f] of r.facts.entries()) yield* submit(f, k);
  } else if (plan.submits === 'last') {
    // the figure of the rows before the last, as the student had it on screen
    await showFigure3(clean(r.facts.slice(0, -1)), 0);
    yield { action: '(rows before the last)' };
    yield* submit(r.facts[r.facts.length - 1], r.facts.length - 1);
  }
  for (let p = 1; p <= plan.presses; p++) yield await measured(`another#${p}`, another3, onAction);
  const built = { facts: useGeo3.getState().facts, seed: useGeo3.getState().seed };
  if (built.facts.length > 1) {
    yield await measured('delete', removeFirst3, onAction);
    yield* afterDeleteSteps(onAction);
  }
  if (built.facts.length > 0) {
    yield* editSteps(built, onAction);
    yield* readerSteps(built, onAction);
  }
}

/**
 * A sequence of typed lines (the slow corpus): each line submitted on the figure of the lines before it, then
 * «הציגו תצורה אחרת», the cold load of what a save of the figure writes, an edit of the last row and the delete of the first.
 */
export async function* stepsOfLines3(lines: readonly string[], plan: WalkPlan3, onAction?: (action: string) => void): Steps3 {
  yield* newSession();
  await showFigure3([], 0);
  yield { action: '(empty figure)' };
  for (const [k, u] of lines.entries()) yield await measured(`submit#${k + 1}`, () => submitLine3(u), onAction, u);
  if (useGeo3.getState().facts.length === 0) return;
  for (let p = 1; p <= plan.presses; p++) yield await measured(`another#${p}`, another3, onAction);
  const saved = JSON.stringify(useGeo3.getState().facts);
  yield* newSession();
  yield await measured('load', () => loadFacts3(JSON.parse(saved), 0), onAction);
  const built = { facts: useGeo3.getState().facts, seed: useGeo3.getState().seed };
  if (built.facts.length > 1) {
    yield await measured('delete', removeFirst3, onAction);
    yield* afterDeleteSteps(onAction);
  }
  yield* editSteps(built, onAction);
  yield* readerSteps(built, onAction);
}

/** The measured actions of a walk, in order. */
async function measuredOf(steps: Steps3): Promise<WalkedAction3[]> {
  const out: WalkedAction3[] = [];
  for await (const s of steps) if (s.rec) out.push({ action: s.action, ...(s.utterance ? { utterance: s.utterance } : {}), rec: s.rec });
  return out;
}

export function walkFixture3(text: string, plan: WalkPlan3, onAction?: (action: string) => void): Promise<WalkedAction3[]> {
  return measuredOf(stepsOfFixture3(text, plan, onAction));
}

export function walkLines3(lines: readonly string[], plan: WalkPlan3, onAction?: (action: string) => void): Promise<WalkedAction3[]> {
  return measuredOf(stepsOfLines3(lines, plan, onAction));
}
