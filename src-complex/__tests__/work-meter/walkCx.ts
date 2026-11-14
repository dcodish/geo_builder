/**
 * THE COMPLEX-NUMBERS FIXTURE WALK (#2873, ADR-W-210 phase 0) — the student actions the work meter records for one
 * saved session.
 *
 * `submit#k` types the file's k-th line on the figure of the lines before it. Then, on the figure the lines built: one
 * «הציגו תצורה אחרת», the cold load of the saved file itself, an edit of the last line to its own text, and the delete of
 * the first line.
 *
 * THE CACHES (#2888, ADR-CX-090). A line's reading is kept by its content and outlives the action, as it does for a
 * student. So the walk states its starting state: it begins from EMPTY memos (`clearComplexCaches`) and then stays
 * warm, exactly as one session would — `submit#k` runs on the figure of the lines before it, which that session has
 * already read. The `load` is a COLD load, the memos emptied again before it: a student who opens a saved file in a
 * new session. The edit and the delete follow in that second session, warm from its load. With both clears a
 * fixture's counts depend on nothing run before it, which the gate's determinism lock asserts.
 */
import { anotherCx, applyLineCx, blankCx, editLastCx, loadCx, removeFirstCx, savedFileCx, submitCx, type ActionRecordCx } from './driverCx';
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
  run('edit', editLastCx);
  run('delete', removeFirstCx);
  return out;
}
