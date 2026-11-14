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
 *  - a figure's walk STARTS FROM CLEARED CACHES (`clearSolveCaches3({ readings: true })`), so its counts depend on
 *    nothing walked before it, in any order;
 *  - `load` is the COLD load of the file: a student who opens it in a new session;
 *  - the caches are cleared again, and the rows are then typed in ONE session that stays warm, as a student's does:
 *    `submit#k` runs on the figure of the rows before it, which that session has solved, and the press and the delete
 *    follow in the same session;
 *  - `edit` is the walk's LAST action and has a session of its own (`beforeEdit3`), the same in every builder: a
 *    student who has built rows 1..n changes the last row. The rows before it are solved in the session (in the store
 *    and rendered, unmeasured, at the configuration the figure stood at before the delete); the edited row's content is
 *    not. The edit rewrites the row to its own text, so its count is what the last row costs through the EDIT path.
 *    Rewriting a row the session had already solved counted almost nothing once the keys were content, and sized no
 *    edit;
 *  - one thing is carried from the load into the typed session, as it was when the baseline was first recorded: the
 *    READING of a two-reading segment equation (`readingMemo3`). Clearing it there would make three recorded submits
 *    pay the reading's trial folds (ADR-3D-491 has the numbers), which is a change in what those lines mean and is
 *    not made here.
 * The slow corpus's walk types first: it starts from cleared caches, and its `load` (the saved figure, with the
 * session's own row ids) is made cold by clearing the solve caches before it. Its delete follows in the loaded session
 * and its edit is last, by the same definition.
 */
import { useGeo3, clearSolveCaches3, decideCommands3, type Fact3 } from '../../store/store3';
import { deserializeFigure3 } from '../../store/figureFile3';
import { another3, beforeEdit3, editLast3, loadFacts3, loadText3, metered3, removeFirst3, render3, setFigure3, submitLine3, type ActionRecord3, type Outcome3 } from './driver3';

export interface WalkedAction3 {
  /** The action's name inside its fixture: `load`, `submit#3`, `another#1`, `edit`, `delete`. */
  action: string;
  /** The typed line, for a submit. */
  utterance?: string;
  rec: ActionRecord3;
}

export interface WalkPlan3 {
  /** Which rows are re-typed: every one, only the last, or none. */
  submits: 'all' | 'last' | 'none';
  /** How many times «הציגו תצורה אחרת» is pressed. */
  presses: number;
}

const clean = (fs: Fact3[]): Fact3[] => fs.map((f) => ({ id: f.id, enabled: f.enabled !== false, utterance: f.utterance, cmds: f.cmds }) as Fact3);

export function walkFixture3(text: string, plan: WalkPlan3, onAction?: (action: string) => void): WalkedAction3[] {
  const out: WalkedAction3[] = [];
  const r = deserializeFigure3(text);
  if (!r.ok) return out;
  const run = (action: string, fn: () => Outcome3, utterance?: string): void => {
    onAction?.(action);
    out.push({ action, ...(utterance ? { utterance } : {}), rec: metered3(fn) });
  };
  /** The last action: the edit of the figure as it stood before the delete, in its own session (`beforeEdit3`). */
  const edit = (built: { facts: Fact3[]; seed: ReturnType<typeof useGeo3.getState>['seed'] }): void => {
    onAction?.('edit');
    beforeEdit3(built.facts, built.seed);
    out.push({ action: 'edit', rec: metered3(editLast3) });
  };
  /** A typed row; a row that no longer records is committed from its saved commands, outside the measurement. */
  const submit = (f: Fact3, k: number): void => {
    run(`submit#${k + 1}`, () => submitLine3(f.utterance), f.utterance);
    const last = out[out.length - 1].rec;
    if (last.verdict !== 'record' && last.verdict !== 'retick') {
      const v = decideCommands3(useGeo3.getState(), f.utterance, f.cmds, { twins: false, seedSearch: true });
      if (v.kind === 'record') useGeo3.getState().dispatchVerdict(v);
      last.verdict += '(+saved-cmds)';
    }
  };

  clearSolveCaches3({ readings: true });
  setFigure3([], 0);
  run('load', () => loadText3(text));
  clearSolveCaches3();
  if (plan.submits === 'all') {
    setFigure3([], 0);
    render3();
    r.facts.forEach((f, k) => submit(f, k));
  } else if (plan.submits === 'last') {
    // the figure of the rows before the last, as the student had it on screen
    setFigure3(clean(r.facts.slice(0, -1)), 0);
    render3();
    submit(r.facts[r.facts.length - 1], r.facts.length - 1);
  }
  for (let p = 1; p <= plan.presses; p++) run(`another#${p}`, another3);
  const built = { facts: useGeo3.getState().facts, seed: useGeo3.getState().seed };
  if (built.facts.length > 1) run('delete', removeFirst3);
  if (built.facts.length > 0) edit(built);
  return out;
}

/**
 * A sequence of typed lines (the slow corpus): each line submitted on the figure of the lines before it, then
 * «הציגו תצורה אחרת», the cold load of what a save of the figure writes, an edit of the last row and the delete of the first.
 */
export function walkLines3(lines: readonly string[], plan: WalkPlan3, onAction?: (action: string) => void): WalkedAction3[] {
  const out: WalkedAction3[] = [];
  const run = (action: string, fn: () => Outcome3, utterance?: string): void => {
    onAction?.(action);
    out.push({ action, ...(utterance ? { utterance } : {}), rec: metered3(fn) });
  };
  clearSolveCaches3({ readings: true });
  setFigure3([], 0);
  render3();
  lines.forEach((u, k) => run(`submit#${k + 1}`, () => submitLine3(u), u));
  if (useGeo3.getState().facts.length === 0) return out;
  for (let p = 1; p <= plan.presses; p++) run(`another#${p}`, another3);
  const saved = JSON.stringify(useGeo3.getState().facts);
  clearSolveCaches3();
  run('load', () => loadFacts3(JSON.parse(saved), 0));
  const built = { facts: useGeo3.getState().facts, seed: useGeo3.getState().seed };
  if (built.facts.length > 1) run('delete', removeFirst3);
  onAction?.('edit');
  beforeEdit3(built.facts, built.seed);
  out.push({ action: 'edit', rec: metered3(editLast3) });
  return out;
}
