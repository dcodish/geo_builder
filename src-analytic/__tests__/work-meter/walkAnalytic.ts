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
 * THE HOOKS ({@link WalkHooks}) let a test run the same walk across two heaps: `setup` wraps what the walk prepares
 * unmeasured, and `each` wraps every action and is handed what the PAGE renders after it. By default both do nothing.
 */
import type { Seed } from '../../engine/evaluate';
import { beforeLastRowEdit, doAnother, doAsk, doDelete, doEdit, doLoad, doRename, doShow, doSubmit, doToggle, newSession, sessionOf, settledState, shownSession, shownState, type Phases, type Session, type State } from './driverAnalytic';
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
interface Ran<N> {
  ph: Phases;
  work: WorkCounts;
  next: N | null;
}

/**
 * How a caller runs the walk's steps. The gate uses neither. A two-heap walk (`settle-walk.test.ts`) runs `setup` and
 * every action in the worker's lane and, after each action, renders `page()` in the page's lane.
 */
export interface WalkHooks {
  /** Wraps what the walk prepares unmeasured (the empty figure, the edit's session, the last session's figure). */
  setup?<T>(fn: () => T): T;
  /** Wraps one measured action. `page` renders what the page shows after it (nothing when the figure did not change). */
  each?<R extends Ran<unknown>>(action: string, run: () => R, page: (r: R) => void): R;
}

export function walkSequence(lines: readonly string[], saveSeed: Seed | undefined, plan: WalkPlanA, onAction?: (action: string) => void, hooks: WalkHooks = {}): WalkedActionA[] {
  const out: WalkedActionA[] = [];
  const setup = <T,>(fn: () => T): T => (hooks.setup ? hooks.setup(fn) : fn());
  const ran = <R extends Ran<unknown>>(action: string, fn: () => R, page: (r: R) => void, utterance?: string): R => {
    onAction?.(action);
    const r = hooks.each ? hooks.each(action, fn, page) : fn();
    out.push({ action, ...(utterance ? { utterance } : {}), ph: r.ph, work: r.work });
    return r;
  };
  const pageOfState = (r: Ran<State>): void => {
    if (r.next) shownState(r.next.lines, r.next.seed, r.next.hosts);
  };
  const pageOfSession = (r: Ran<Session>): void => {
    if (r.next) shownSession(r.next);
  };
  const run = (action: string, fn: () => Ran<State>, utterance?: string): State | null => ran(action, fn, pageOfState, utterance).next;
  const act = (action: string, fn: () => Ran<Session>): Session | null => ran(action, fn, pageOfSession).next;

  setup(() => newSession());
  let st = setup(() => settledState([], 0, {}));
  if (plan.submits === 'all') {
    lines.forEach((line, k) => {
      st = run(`submit#${k + 1}`, () => doSubmit(st, line), line) ?? st;
    });
  } else {
    const typed = plan.submits === 'last' ? 1 : 0;
    st = setup(() => settledState(lines.slice(0, lines.length - typed), 0, {}));
    if (typed) st = run(`submit#${lines.length}`, () => doSubmit(st, lines[lines.length - 1]), lines[lines.length - 1]) ?? st;
  }
  if (!st.lines.length) return out;
  // show another
  let s2 = st;
  for (let p = 1; p <= plan.presses; p++) {
    const n = run(`another#${p}`, () => doAnother(s2));
    if (!n) break;
    s2 = n;
  }
  // the saved file, loaded cold (its own saved seed when it has one, else the configuration on screen)
  const seed = saveSeed ?? st.seed;
  run('load', () => doLoad(st.lines, seed, st.hosts));
  if (st.lines.length > 1) run('delete', () => doDelete(st, 0));
  // the last row edited, in a session that has solved the rows before it and not this one
  const editing = setup(() => beforeLastRowEdit(st));
  const edited = run('edit', () => doEdit(editing, editing.lines.length - 1, editing.lines[editing.lines.length - 1])) ?? st;
  // what the walk left out (#2890): the questions, a row ticked off and on, undo, redo, a letter renamed
  let sess = sessionOf(edited.lines, edited.seed, edited.hosts);
  setup(() => shownSession(sess)); // the figure the edit left on screen; solved here only when the edit was refused
  sess = act('ask', () => doAsk(sess)) ?? sess;
  const off = act('toggle#1', () => doToggle(sess, 0));
  if (off) {
    const on = act('toggle#2', () => doToggle(off, 0));
    if (on) {
      act('undo', () => doShow(off));
      act('redo', () => doShow(on));
      sess = on;
    }
  }
  act('rename', () => doRename(sess));
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
