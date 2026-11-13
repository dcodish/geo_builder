/**
 * THE 3-D FIXTURE WALK (#2873, ADR-W-210 phase 0) — the student actions the work meter records for one saved figure.
 *
 * `load` is the cold load of the file. `submit#k` re-types the file's k-th row on the figure of the rows before it (a
 * row the deterministic lane no longer records is committed from its saved commands, unmeasured, so the rest of the
 * file still steps — as the timing harness does). Then one «הציגו תצורה אחרת», an edit of the last row to its own text,
 * and the delete of the first row. 3-D keeps its memos on the fact array, and every fixture brings fresh arrays, so a
 * fixture's counts depend on nothing run before it.
 */
import { useGeo3, decideCommands3, type Fact3 } from '../../store/store3';
import { deserializeFigure3 } from '../../store/figureFile3';
import { another3, editLast3, loadFacts3, loadText3, metered3, removeFirst3, render3, setFigure3, submitLine3, type ActionRecord3, type Outcome3 } from './driver3';

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

  setFigure3([], 0);
  run('load', () => loadText3(text));
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
  if (useGeo3.getState().facts.length > 0) run('edit', editLast3);
  if (useGeo3.getState().facts.length > 1) run('delete', removeFirst3);
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
  setFigure3([], 0);
  render3();
  lines.forEach((u, k) => run(`submit#${k + 1}`, () => submitLine3(u), u));
  if (useGeo3.getState().facts.length === 0) return out;
  for (let p = 1; p <= plan.presses; p++) run(`another#${p}`, another3);
  const saved = JSON.stringify(useGeo3.getState().facts);
  run('load', () => loadFacts3(JSON.parse(saved), 0));
  run('edit', editLast3);
  if (useGeo3.getState().facts.length > 1) run('delete', removeFirst3);
  return out;
}
