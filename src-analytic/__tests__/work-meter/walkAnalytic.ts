/**
 * THE ANALYTIC FIXTURE WALK (#2873, ADR-W-210 phase 0) — the student actions the work meter records for one saved
 * sequence of lines.
 *
 * `submit#k` types the k-th line on the settled figure of the lines before it. Then, on the figure the lines built: one
 * «הציגו תצורה אחרת», the cold load of the saved file (its own seed when it has one), an edit of the last line to its
 * own text, and the delete of the first line. The analytic engine keeps its caches on the construction, and `derive`
 * builds a new one each time, so a sequence's counts depend on nothing run before it.
 */
import type { Seed } from '../../engine/evaluate';
import { doAnother, doDelete, doEdit, doLoad, doSubmit, settledState, type Phases, type State } from './driverAnalytic';
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

export function walkSequence(lines: readonly string[], saveSeed: Seed | undefined, plan: WalkPlanA, onAction?: (action: string) => void): WalkedActionA[] {
  const out: WalkedActionA[] = [];
  const run = <T extends { ph: Phases; work: WorkCounts; next: State | null }>(action: string, fn: () => T, utterance?: string): State | null => {
    onAction?.(action);
    const r = fn();
    out.push({ action, ...(utterance ? { utterance } : {}), ph: r.ph, work: r.work });
    return r.next;
  };

  let st = settledState([], 0, {});
  if (plan.submits === 'all') {
    lines.forEach((line, k) => {
      st = run(`submit#${k + 1}`, () => doSubmit(st, line), line) ?? st;
    });
  } else {
    const typed = plan.submits === 'last' ? 1 : 0;
    st = settledState(lines.slice(0, lines.length - typed), 0, {});
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
  run('edit', () => doEdit(st, st.lines.length - 1, st.lines[st.lines.length - 1]));
  if (st.lines.length > 1) run('delete', () => doDelete(st, 0));
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
