/**
 * THE ANALYTIC FIXTURE WALK (#2873, ADR-W-210 phase 0) — the student actions the work meter records for one saved
 * sequence of lines.
 *
 * `submit#k` types the k-th line on the settled figure of the lines before it. Then, on the figure the lines built: one
 * «הציגו תצורה אחרת», the cold load of the saved file (its own seed when it has one), the delete of the first line, and
 * an edit of the last line.
 *
 * ONE SEQUENCE IS THREE SESSIONS (#2888, ADR-AG-476). `derive` keeps solved content by content and the store outlives the
 * action, so the walk says where a session starts, and a count is "what this action adds to its session":
 *  1. THE SESSION THAT TYPES THE LINES. The store is emptied first (`newSession`), and each action runs on what the
 *     earlier ones solved, as the page does: `submit#k` on the figure of the lines before it, «הציגו תצורה אחרת» on the
 *     figure the lines built.
 *  2. THE LOADED SESSION. A load is a session of its own (`doLoad` empties the store: a saved file opened in a new tab),
 *     and the delete runs in it.
 *  3. THE EDIT'S SESSION — the meter's one definition of `edit`, the same in every builder: **a student who has built rows
 *     1..n changes the LAST row; the rows before it are solved in the session, the edited row's content is not.** A cache
 *     keyed by content cannot forget one row, so the walk builds that state (`beforeLastRowEdit`): a new session, rows
 *     1..n−1 on screen and settled (unmeasured), then all n rows as the session's lines with nothing of the n-row figure
 *     solved. The edit re-types the last row to its own text through the edit path, so it costs about what `submit#n`
 *     costs. It is the walk's LAST action, so the load and the delete mean what they meant.
 *  4. WHAT THE WALK LEFT OUT UNTIL #2890 (ADR-AG-477), in the edit's session, continued: after the edit, so that no earlier
 *     action finds anything it did not find before, and on the figure the edit left on screen (shown unmeasured first,
 *     which costs nothing unless the edit was refused). Then `ask` (the questions the figure's own menus offer, pressed one after another; they stay asked, so every later
 *     render answers them again, as the page does), `toggle#1` (the first row ticked off), `toggle#2` (ticked on again),
 *     `undo` (back to the row ticked off), `redo`, and `rename` (the first point takes a free letter).
 * A sequence's counts depend on nothing run before it.
 *
 * SINCE #2890 (ADR-AG-478) every solve of an action runs in the driver's EXECUTOR (`useDriverExecutor`): the gate hands a
 * second module instance, so the page's part of each action is measured as a browser's page.
 */
import type { Seed } from '../../engine/evaluate';
import { beforeLastRowEdit, doAnother, doAsk, doDelete, doEdit, doLoad, doRename, doShow, doSubmit, doToggle, newSession, settledState, shownSession, stateOf, type Phases, type State } from './driverAnalytic';
import type { WorkCounts } from '../../../shell/workMeter';

export interface WalkedActionA {
  /** The action's name inside its sequence: `submit#3`, `another#1`, `load`, `edit`, `delete`. */
  action: string;
  /** The typed line, for a submit. */
  utterance?: string;
  ph: Phases;
  work: WorkCounts;
}

export interface WalkPlanA {
  /** Which lines are typed: every one, only the last (on the settled figure of the others), or none. */
  submits: 'all' | 'last' | 'none';
  /** How many times «הציגו תצורה אחרת» is pressed. */
  presses: number;
}

/** What one action returned: its phases, its counts and the figure it left (null: the figure did not change). */
interface Ran {
  ph: Phases;
  work: WorkCounts;
  next: State | null;
}

export async function walkSequence(lines: readonly string[], saveSeed: Seed | undefined, plan: WalkPlanA, onAction?: (action: string) => void): Promise<WalkedActionA[]> {
  const out: WalkedActionA[] = [];
  const run = async (action: string, fn: () => Promise<Ran>, utterance?: string): Promise<State | null> => {
    onAction?.(action);
    const r = await fn();
    out.push({ action, ...(utterance ? { utterance } : {}), ph: r.ph, work: r.work });
    return r.next;
  };

  newSession();
  let st = await settledState([], 0, {});
  if (plan.submits === 'all') {
    for (const [k, line] of lines.entries()) {
      const at = st;
      st = (await run(`submit#${k + 1}`, () => doSubmit(at, line), line)) ?? st;
    }
  } else {
    const typed = plan.submits === 'last' ? 1 : 0;
    st = await settledState(lines.slice(0, lines.length - typed), 0, {});
    const at = st;
    if (typed) st = (await run(`submit#${lines.length}`, () => doSubmit(at, lines[lines.length - 1]), lines[lines.length - 1])) ?? st;
  }
  if (!st.lines.length) return out;
  const built = st;
  // show another
  let s2 = built;
  for (let p = 1; p <= plan.presses; p++) {
    const from = s2;
    const n = await run(`another#${p}`, () => doAnother(from));
    if (!n) break;
    s2 = n;
  }
  // the saved file, loaded cold (its own saved seed when it has one, else the configuration on screen)
  const seed = saveSeed ?? built.seed;
  await run('load', () => doLoad(built.lines, seed, built.hosts));
  if (built.lines.length > 1) await run('delete', () => doDelete(built, 0));
  // the last row edited, in a session that has solved the rows before it and not this one
  const editing = await beforeLastRowEdit(built);
  const edited = (await run('edit', () => doEdit(editing, editing.lines.length - 1, editing.lines[editing.lines.length - 1]))) ?? built;
  // what the walk left out (#2890): the questions, a row ticked off and on, undo, redo, a letter renamed
  let sess = stateOf(edited.lines, edited.seed, edited.hosts);
  await shownSession(sess); // the figure the edit left on screen; solved here only when the edit was refused
  const asking = sess;
  sess = (await run('ask', () => doAsk(asking))) ?? sess;
  const ticking = sess;
  const off = await run('toggle#1', () => doToggle(ticking, 0));
  if (off) {
    const on = await run('toggle#2', () => doToggle(off, 0));
    if (on) {
      await run('undo', () => doShow(off));
      await run('redo', () => doShow(on));
      sess = on;
    }
  }
  const renaming = sess;
  await run('rename', () => doRename(renaming));
  return out;
}

/** One sequence of a fixture file: a saved figure is one, a corpus array is one per entry. */
export interface FixtureSequence {
  /** `<file>` for a saved figure, `<file>#<entry id>` for a corpus entry. */
  id: string;
  lines: string[];
  seed?: Seed;
}

export function sequencesOf(file: string, json: unknown): FixtureSequence[] {
  const usable = (ls: unknown): string[] => (Array.isArray(ls) ? ls.filter((l): l is string => typeof l === 'string' && l.trim() !== '') : []);
  if (Array.isArray(json)) return json.map((e: { id?: string; lines: string[] }, i) => ({ id: `${file}#${e.id ?? i}`, lines: usable(e.lines) })).filter((s) => s.lines.length > 0);
  const j = json as { lines?: string[]; seed?: Seed };
  const lines = usable(j.lines);
  return lines.length ? [{ id: file, lines, seed: j.seed }] : [];
}
