/**
 * THE 3-D FIXTURE WALK (#2873, ADR-W-210 phase 0) — the student actions the work meter records for one saved figure.
 *
 * `load` is the cold load of the file. `submit#k` re-types the file's k-th row on the figure of the rows before it (a
 * row the deterministic lane no longer records is committed from its saved commands, unmeasured, so the rest of the
 * file still steps — as the timing harness does). Then one «הציגו תצורה אחרת», the delete of the first row, and an edit
 * of the last row.
 *
 * THE SESSION THE WALK IS (#2888, [ADR-3D-491](../../../docs/06b-decisions-3d.md#adr-3d-491)). Solved content is keyed by
 * content and outlives the action, so a count depends on what the session solved before it, and the walk says what
 * that is:
 *  - a figure's walk STARTS FROM CLEARED CACHES (`clearSolveCaches3()`), so its counts depend on
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
 * The slow corpus's walk types first: it starts from cleared caches, and its `load` (the saved figure, with the
 * session's own row ids) is made cold by clearing the solve caches before it. Its delete follows in the loaded session
 * and its edit is last, by the same definition.
 *
 * THE WALK IS A SEQUENCE OF STEPS (#2890, [ADR-3D-492](../../../docs/06b-decisions-3d.md#adr-3d-492)). `stepsOfFixture3`
 * and `stepsOfLines3` yield after every step: each measured action, and each thing the walk does between them (a new
 * session, a figure put in the store and shown, a row committed from its saved commands). `walkFixture3` and
 * `walkLines3` run them to the end and keep the measured ones, as before. The steps exist so that TWO heaps can walk
 * in step (`twoHeaps3.ts`): one runs a step, what it wrote crosses, the other adopts it and runs the same step. A new
 * session is a step of its own for that reason: the second heap must clear BEFORE it adopts the next step's entries.
 */
import { useGeo3, clearSolveCaches3, decideCommands3, type Fact3 } from '../../store/store3';
import { deserializeFigure3 } from '../../store/figureFile3';
import { another3, editLast3, loadFacts3, loadText3, metered3, removeFirst3, render3, setFigure3, showBeforeEdit3, submitLine3, type ActionRecord3, type Outcome3 } from './driver3';

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
type Steps3 = Generator<WalkStep3, void, void>;

const clean = (fs: Fact3[]): Fact3[] => fs.map((f) => ({ id: f.id, enabled: f.enabled !== false, utterance: f.utterance, cmds: f.cmds }) as Fact3);

/** A measured action, as a step. */
function measured(action: string, fn: () => Outcome3, onAction?: (action: string) => void, utterance?: string): WalkStep3 & { rec: ActionRecord3 } {
  onAction?.(action);
  return { action, ...(utterance ? { utterance } : {}), rec: metered3(fn) };
}

/** A new session: every cache cleared. Its own step (see the header). */
function* newSession(): Steps3 {
  clearSolveCaches3();
  yield { action: '(new session)' };
}

/** The edit, in its own session (`beforeEdit3`): the rows before the last shown, then all of them in the store unsolved. */
function* editSteps(built: { facts: Fact3[]; seed: Seed }, onAction?: (action: string) => void): Steps3 {
  onAction?.('edit');
  yield* newSession();
  showBeforeEdit3(built.facts, built.seed);
  yield { action: '(rows before the edit)' };
  yield { action: 'edit', rec: metered3(editLast3) };
}

export function* stepsOfFixture3(text: string, plan: WalkPlan3, onAction?: (action: string) => void): Steps3 {
  const r = deserializeFigure3(text);
  if (!r.ok) return;
  /** A typed row; a row that no longer records is committed from its saved commands, outside the measurement. */
  function* submit(f: Fact3, k: number): Steps3 {
    const step = measured(`submit#${k + 1}`, () => submitLine3(f.utterance), onAction, f.utterance);
    const recorded = step.rec.verdict === 'record' || step.rec.verdict === 'retick';
    if (!recorded) step.rec.verdict += '(+saved-cmds)';
    yield step;
    if (recorded) return;
    const v = decideCommands3(useGeo3.getState(), f.utterance, f.cmds, { twins: false, seedSearch: true });
    if (v.kind === 'record') useGeo3.getState().dispatchVerdict(v);
    yield { action: '(saved commands)' };
  }

  yield* newSession();
  setFigure3([], 0);
  yield measured('load', () => loadText3(text), onAction);
  yield* newSession();
  if (plan.submits === 'all') {
    setFigure3([], 0);
    render3();
    yield { action: '(empty figure)' };
    for (const [k, f] of r.facts.entries()) yield* submit(f, k);
  } else if (plan.submits === 'last') {
    // the figure of the rows before the last, as the student had it on screen
    setFigure3(clean(r.facts.slice(0, -1)), 0);
    render3();
    yield { action: '(rows before the last)' };
    yield* submit(r.facts[r.facts.length - 1], r.facts.length - 1);
  }
  for (let p = 1; p <= plan.presses; p++) yield measured(`another#${p}`, another3, onAction);
  const built = { facts: useGeo3.getState().facts, seed: useGeo3.getState().seed };
  if (built.facts.length > 1) yield measured('delete', removeFirst3, onAction);
  if (built.facts.length > 0) yield* editSteps(built, onAction);
}

/**
 * A sequence of typed lines (the slow corpus): each line submitted on the figure of the lines before it, then
 * «הציגו תצורה אחרת», the cold load of what a save of the figure writes, an edit of the last row and the delete of the first.
 */
export function* stepsOfLines3(lines: readonly string[], plan: WalkPlan3, onAction?: (action: string) => void): Steps3 {
  yield* newSession();
  setFigure3([], 0);
  render3();
  yield { action: '(empty figure)' };
  for (const [k, u] of lines.entries()) yield measured(`submit#${k + 1}`, () => submitLine3(u), onAction, u);
  if (useGeo3.getState().facts.length === 0) return;
  for (let p = 1; p <= plan.presses; p++) yield measured(`another#${p}`, another3, onAction);
  const saved = JSON.stringify(useGeo3.getState().facts);
  yield* newSession();
  yield measured('load', () => loadFacts3(JSON.parse(saved), 0), onAction);
  const built = { facts: useGeo3.getState().facts, seed: useGeo3.getState().seed };
  if (built.facts.length > 1) yield measured('delete', removeFirst3, onAction);
  yield* editSteps(built, onAction);
}

/** The measured actions of a walk, in order. */
const measuredOf = (steps: Steps3): WalkedAction3[] => {
  const out: WalkedAction3[] = [];
  for (const s of steps) if (s.rec) out.push({ action: s.action, ...(s.utterance ? { utterance: s.utterance } : {}), rec: s.rec });
  return out;
};

export function walkFixture3(text: string, plan: WalkPlan3, onAction?: (action: string) => void): WalkedAction3[] {
  return measuredOf(stepsOfFixture3(text, plan, onAction));
}

export function walkLines3(lines: readonly string[], plan: WalkPlan3, onAction?: (action: string) => void): WalkedAction3[] {
  return measuredOf(stepsOfLines3(lines, plan, onAction));
}
