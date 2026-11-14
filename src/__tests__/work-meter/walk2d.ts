/**
 * THE 2-D FIXTURE WALK (#2873, ADR-W-210 phase 0) — the student actions the work meter records for one saved figure.
 *
 * `load` is the cold load of the file. `submit#k` re-types the file's k-th row on the figure of the rows before it (a
 * row the deterministic lane does not read is followed by its saved commands, as the timing harness does). Then, on
 * the loaded figure: one «הציגו תצורה אחרת», the delete of the first row, the undo of that delete, the first row turned
 * off (#2890: `undo` and `toggle` are student actions the walk did not drive), and the background detection sweep of the
 * loaded figure. Each fixture starts from cold caches, so its counts depend on nothing run before it.
 *
 * `edit` IS THE LAST ACTION, AND HAS ONE DEFINITION IN EVERY BUILDER (#2888, ADR-W-210 phase 2): a student who has
 * built rows 1..n changes the LAST row. The rows before it are solved in the session and the edited row's content is
 * not (`Driver2d.editLastRow`: a new session, rows 1..n-1 on screen unmeasured, all n rows in the store unsolved, then
 * the edit of the last row to its own text). Re-typing a row whose content the session has already solved counts
 * almost nothing once caches are keyed by content, and says nothing of what an edit costs. The n rows are the loaded
 * figure's, at its saved seed.
 *
 * Where the walk measured the old edit (after the press, before the delete) the last row is still re-typed,
 * UNMEASURED: `delete` and `detect` run in the session that re-type leaves, so they count exactly what they did.
 */
import { groupKey, type Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import type { ActionRecord, Driver2d } from './driver2d';

export interface WalkedAction {
  /** The action's name inside its fixture: `load`, `submit#3`, `another#1`, `edit`, `delete`, `undo`, `toggle`, `detect`. */
  action: string;
  rec: ActionRecord;
}

export interface WalkPlan {
  /** Which rows are re-typed: every one, only the last, or none. */
  submits: 'all' | 'last' | 'none';
  /** How many times «הציגו תצורה אחרת» is pressed. */
  presses: number;
}

interface Group {
  key: string;
  facts: Fact[];
}

function groupsOf(facts: Fact[]): Group[] {
  const groups: Group[] = [];
  for (const f of facts) {
    const key = groupKey(f);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.facts.push(f);
    else groups.push({ key, facts: [f] });
  }
  return groups;
}

export async function walkFixture2d(driver: Driver2d, text: string, plan: WalkPlan, onAction?: (action: string) => void): Promise<WalkedAction[]> {
  const out: WalkedAction[] = [];
  const file = JSON.parse(text) as { facts?: Fact[]; seed?: number; locale?: string };
  const facts = file.facts ?? [];
  const locale = file.locale === 'en' ? 'en' : 'he';
  const groups = groupsOf(facts);
  const run = async (action: string, fn: () => Promise<ActionRecord | null>): Promise<void> => {
    onAction?.(action);
    const rec = await fn();
    if (rec) out.push({ action, rec });
  };
  const submit = (g: Group) => driver.submit(g.facts[0].utterance ?? '', locale, g.facts.map((f) => f.cmd as AnyCommand));

  driver.reset();
  if (plan.submits === 'all') {
    for (let k = 0; k < groups.length; k++) await run(`submit#${k + 1}`, () => submit(groups[k]));
  } else if (plan.submits === 'last' && groups.length > 0) {
    const last = groups[groups.length - 1];
    driver.show({ facts: facts.slice(0, facts.length - last.facts.length), seed: 0 });
    await run(`submit#${groups.length}`, () => submit(last));
  }
  await onLoaded(driver, text, plan, run);
  return out;
}

type Run = (action: string, fn: () => Promise<ActionRecord | null>) => Promise<void>;

/** The cold load of a saved figure, and the actions made on the loaded figure. */
async function onLoaded(driver: Driver2d, text: string, plan: WalkPlan, run: Run): Promise<void> {
  await run('load', () => driver.load(text));
  const whole = driver.figure();
  const loaded = whole.facts;
  for (let p = 1; p <= plan.presses; p++) {
    let only = false;
    await run(`another#${p}`, async () => {
      const rec = await driver.another();
      only = rec.outcome === 'only-config';
      return rec;
    });
    if (only) break;
  }
  await driver.edit(); // unmeasured: the session `delete` and `detect` have always run in (see the header)
  let deleted = false;
  await run('delete', async () => {
    const rec = await driver.remove();
    deleted = rec !== null;
    return rec;
  });
  // the undo puts the loaded session's figure back, by reference; the toggle then acts on that figure
  if (deleted) await run('undo', () => driver.undo());
  await run('toggle', () => driver.toggle());
  await run('detect', () => driver.detect(loaded));
  await run('edit', () => driver.editLastRow(whole));
}

/**
 * A sequence of typed Hebrew lines (the slow corpus): each line submitted on the figure of the lines before it,
 * then the figure they built is saved and walked as a fixture is — cold load, press, edit, delete, detection.
 */
export async function walkLines2d(driver: Driver2d, lines: readonly string[], plan: WalkPlan, onAction?: (action: string) => void): Promise<WalkedAction[]> {
  const out: WalkedAction[] = [];
  const run: Run = async (action, fn) => {
    onAction?.(action);
    const rec = await fn();
    if (rec) out.push({ action, rec });
  };
  driver.reset();
  for (let k = 0; k < lines.length; k++) await run(`submit#${k + 1}`, () => driver.submit(lines[k], 'he'));
  if (driver.figure().facts.length > 0) await onLoaded(driver, driver.saved(), plan, run);
  return out;
}
