/**
 * THE COMPLEX-NUMBERS FIXTURE WALK (#2873, ADR-W-210 phase 0) — the student actions the work meter records for one
 * saved session.
 *
 * `submit#k` types the file's k-th line on the figure of the lines before it. Then, on the figure the lines built: one
 * «הציגו תצורה אחרת», the cold load of the saved file itself, the delete of the first line, and an edit of the last line.
 *
 * THE CACHES (#2888, ADR-CX-090). A line's reading is kept by its content and outlives the action, as it does for a
 * student. So the walk states its starting state: it begins from EMPTY memos (`clearComplexCaches`) and then stays
 * warm, exactly as one session would — `submit#k` runs on the figure of the lines before it, which that session has
 * already read. The `load` is a COLD load, the memos emptied again before it: a student who opens a saved file in a
 * new session. The delete follows in that second session, warm from its load.
 *
 * THE EDIT is the walk's last action and has a session of its own (one definition for all four builders, #2888): a
 * student who has built rows 1..n changes the LAST row; the rows before it are solved in the session, the edited row's
 * content is not. Re-typing the last row in the session that had just solved it executed nothing, so the count sized
 * no edit. `editLastRowCx` builds the state: memos emptied, rows 1..n-1 rendered unmeasured, then all n rows put in the
 * store unsolved, then the measured edit of the last row to its own text. It costs about what `submit#n` costs,
 * through the edit path. The rows are the loaded session's, taken before the delete changes it.
 *
 * With these clears a fixture's counts depend on nothing run before it, which the gate's determinism lock asserts.
 */
import { anotherCx, applyLineCx, blankCx, editLastRowCx, loadCx, removeFirstCx, savedFileCx, sessionCx, submitCx, type ActionRecordCx } from './driverCx';
import { clearComplexCaches } from '../../app/deriveLines';

export interface WalkedActionCx {
  /** The action's name inside its fixture: `submit#3`, `another#1`, `load`, `edit`, `delete`. */
  action: string;
  /** The typed line, for a submit. */
  utterance?: string;
  rec: ActionRecordCx;
}

export interface WalkPlanCx {
  /** Which lines are typed: every one, only the last, or none. */
  submits: 'all' | 'last' | 'none';
  /** How many times «הציגו תצורה אחרת» is pressed. */
  presses: number;
}

const norm = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

export function walkFixtureCx(file: { lines?: string[] } | null, lines: readonly string[], plan: WalkPlanCx, onAction?: (action: string) => void): WalkedActionCx[] {
  const out: WalkedActionCx[] = [];
  const run = (action: string, fn: () => ActionRecordCx | null, utterance?: string): void => {
    onAction?.(action);
    const rec = fn();
    if (rec) out.push({ action, ...(utterance ? { utterance } : {}), rec });
  };
  clearComplexCaches();
  const s = blankCx();
  const typed = lines.map(norm);
  typed.forEach((u, k) => {
    if (!u) return;
    const measured = plan.submits === 'all' || (plan.submits === 'last' && k === typed.length - 1);
    if (measured) run(`submit#${k + 1}`, () => submitCx(s, u), u);
    else applyLineCx(s, u);
  });
  if (s.lines.length === 0) return out;
  const seed0 = s.seed;
  for (let p = 1; p <= plan.presses; p++) run(`another#${p}`, () => anotherCx(s, seed0 + p));
  s.seed = seed0;
  const saved = file ?? savedFileCx(s);
  clearComplexCaches();
  run('load', () => loadCx(saved));
  const loaded = sessionCx();
  run('delete', removeFirstCx);
  run('edit', () => editLastRowCx(loaded));
  return out;
}
