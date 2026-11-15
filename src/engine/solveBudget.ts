import { meterWork } from '../../shell/workMeter';
import { withWorkLimit } from '../../shell/workLimit';

/**
 * #2893 ([ADR-831](../../docs/06-decisions.md#adr-831), ADR-W-210 phase 4): THERE IS NO CLOCK HERE ANY MORE. Every
 * search is bounded in WORK (the work budget below, in charged units), so the same input stops at the same point on
 * every machine, in the suite as in the browser. What follows is the history of the budget this file began as; the
 * one non-work state it keeps is the indefinite-shape probe's "ladder spent" ({@link withLadderSpent}).
 *
 * Cooperative wall-clock budget for the failure-path recruit ladder (docs/17 §7 — "no unbudgeted
 * sweeps"; issues #59/#41). The old search budgets (`SEARCH_BUDGET_MS`, `SAMPLE_BUDGET_MS`) are checked
 * BETWEEN replays, so one replay whose ladder ran tens of seconds blew straight through them. This
 * budget is consulted INSIDE the ladder — between recruit experiments, lends, and co-drive host seeds —
 * so a sweep candidate abandons a hopeless ladder at ~single-experiment granularity.
 *
 * Scope is deliberate (ADR-281): the store arms it ONLY around VIEW searches — "show another
 * configuration", the auto-resolve config search, the shared detection sampler — where an aborted
 * ladder honestly means "this candidate config found no valid assignment in time" (the search moves on
 * or reports "no other configuration"). The PRIMARY submit fold is never armed: a solvable figure must
 * build, whatever it costs — capping it would refuse valid givens (the docs/17 §6 honesty line), and
 * making that one-time cost non-blocking is #41's Web-Worker layer, not a budget's. Tests never arm it,
 * so engine outcomes stay deterministic and machine-independent.
 *
 * `aborts` counts ladder bail-outs: {@link computeReplay}'s fold cache refuses to memoize a fold whose
 * ladder was cut short (a budget-aborted fold is not THE fold for that content — caching it would pin a
 * degraded figure for every later, unbudgeted replay).
 */
export const solveBudget: { ladderSpent: boolean; aborts: number } = { ladderSpent: false, aborts: 0 };

/** Has the armed budget run out? (Never true when unarmed — the default, and the primary submit fold.) */
export function budgetExceeded(): boolean {
  if (workExceeded()) return true;
  if (!solveBudget.ladderSpent) return false;
  solveBudget.aborts++;
  return true;
}

/**
 * #2480 ([ADR-757](../../docs/06-decisions.md#adr-757)) — run `fn` with the recruit ladder SPENT: every ladder consult
 * answers "over" at once. The indefinite-shape probe asks a question that is true of the drawn figure without the
 * failure path, so it never needs the ladder. It used to be spelled as a clock budget whose deadline was the epoch
 * (`withSolveBudget(0, …)`), which was already deterministic; #2893 (ADR-831) names it, and the clock is gone.
 */
export function withLadderSpent<T>(fn: () => T): T {
  const prev = solveBudget.ladderSpent;
  solveBudget.ladderSpent = true;
  try {
    return fn();
  } finally {
    solveBudget.ladderSpent = prev;
  }
}

/**
 * #1601/#1599 (ADR-558): the WORK budget — the deterministic sibling of the wall clock above. Every
 * `evaluateCore` is one work unit (`work.done`), so a budget of N units stops at the same point on every
 * device and every run: the knowledge pool's verdicts can then never depend on how fast the machine was
 * (the operator's ruling on #1601 — "same input, same answer"). Since #2893 (ADR-831) every search is: the
 * interactive ones, the submit gates and the load's refresh and audit too ({@link withSearchLimit}).
 */
export const work: { done: number; limitAt: number | null; executed: number } = { done: 0, limitAt: null, executed: 0 };

/** One unit of work (called by `evaluateCore`). `executed` counts only the calls actually made — never a charged hit.
 *  #2873 (ADR-W-210): the same executed unit feeds the work meter, which adds the lane and the phase. */
export function countWork(): void {
  work.done++;
  work.executed++;
  meterWork();
  if (frame) frame.own++;
}

/**
 * #1605 ([ADR-582](docs/06-decisions.md#adr-582)) — A MEMO HIT IS CHARGED THE WORK IT SAVED.
 *
 * `work.done` counts `evaluateCore` calls ACTUALLY made, and every memo on the counted path (the replay
 * cache, the fold memo, the `evaluate` / `resolveDriven` / DOF memos) answers a hit for free — so the
 * same input spent fewer counted units on a warm cache, and a work-bounded verdict (ADR-558's knowledge
 * pool) came back incomplete cold and complete warm. The cure is a LEDGER per memo entry:
 *
 * - {@link computeWithCell} computes an entry inside a frame and records its OWN units (the
 *   `evaluateCore` calls made directly, not inside a nested memoized computation) plus the entries it
 *   touched (`deps` — computed or hit).
 * - {@link chargeHit} charges a hit the units its computation would have cost: inside a WORK EPOCH
 *   ({@link withWorkEpoch}; every work budget opens one), each entry is charged at most ONCE — the first
 *   time it is touched, by computing it or by a hit that charges its own units and its not-yet-charged
 *   deps. A computation repeated within an epoch is served free, exactly as a cold run serves the second
 *   touch from the memo it just filled. So the units an epoch counts are the units it would have counted
 *   starting from EMPTY caches: a function of the input alone, whatever warmth it met.
 * - Under an armed budget a hit whose charge would cross the limit is REFUSED (`false`): the caller
 *   recomputes it, so it aborts at the very point a cold run would, and a cut computation is never
 *   memoized (the {@link solveBudget} `aborts` rule).
 *
 * Outside an epoch nothing is charged (no budget reads the counter there) — but the ledger still links,
 * so an entry computed outside any epoch is charged in full when an epoch first touches it.
 */
export interface WorkCell {
  /** `evaluateCore` units this entry's computation made itself (nested memoized computations excluded). */
  own: number;
  /** The memo entries the computation touched — charged with it when the entry is first touched by a hit. */
  deps: WorkCell[];
  /** The epoch this entry was last charged in (0 = never). */
  charged: number;
}
let frame: WorkCell | null = null;
let epochId = 0;
let epochOpen = false;
/** The entries a running computation touched, deduped (the `deps` array is the frozen form). */
const touched = new WeakMap<WorkCell, Set<WorkCell>>();
function link(cell: WorkCell): void {
  if (!frame || frame === cell) return;
  let s = touched.get(frame);
  if (!s) touched.set(frame, (s = new Set()));
  if (!s.has(cell)) {
    s.add(cell);
    frame.deps.push(cell);
  }
}

/** Compute a memo entry's value inside its own ledger frame. */
export function computeWithCell<T>(fn: () => T): { value: T; cell: WorkCell } {
  const parent = frame;
  const cell: WorkCell = { own: 0, deps: [], charged: epochOpen ? epochId : 0 };
  frame = cell;
  let value: T;
  try {
    value = fn();
  } finally {
    frame = parent;
    touched.delete(cell);
  }
  link(cell);
  return { value, cell };
}

/**
 * Charge a memo hit. Returns `false` when an armed work budget cannot afford it — the caller must then
 * recompute (and the recompute aborts where a cold run would). An entry with no ledger (a fold
 * transplanted from the geometry worker) is served free, as before.
 */
export function chargeHit(cell: WorkCell | undefined): boolean {
  if (!cell) return true;
  if (epochOpen && cell.charged !== epochId) {
    const todo: WorkCell[] = [];
    const seen = new Set<WorkCell>();
    const stack = [cell];
    let cost = 0;
    while (stack.length) {
      const c = stack.pop()!;
      if (c.charged === epochId || seen.has(c)) continue;
      seen.add(c);
      todo.push(c);
      cost += c.own;
      for (const d of c.deps) stack.push(d);
    }
    if (work.limitAt !== null && work.done + cost > work.limitAt) return false;
    for (const c of todo) c.charged = epochId;
    work.done += cost;
  }
  link(cell);
  return true;
}

/**
 * #2888 (ADR-827) registered here how to find the ledger cell of every identity memo (`evaluate`, `resolveDriven`, the
 * DOF count), so that a cache could build a fresh object inside an epoch that had already charged one. #2893 (ADR-831)
 * removed that emulation; the registry stays, read by nothing, so the three memos keep one place that names their cells.
 */
const ledgerLookups: ((key: object) => WorkCell | undefined)[] = [];
export function registerLedger(lookup: (key: object) => WorkCell | undefined): void {
  ledgerLookups.push(lookup);
}

/** #1671 (ADR-584): a ledger's total — every `own` in its closure once — the work a transplanted entry
 *  (a fold computed in the geometry worker) is charged on this thread, so a worker-warmed fold costs the
 *  same in a work budget as one this thread computed. */
export function ledgerTotal(cell: WorkCell): number {
  const seen = new Set<WorkCell>();
  const stack = [cell];
  let n = 0;
  while (stack.length) {
    const c = stack.pop()!;
    if (seen.has(c)) continue;
    seen.add(c);
    n += c.own;
    for (const d of c.deps) stack.push(d);
  }
  return n;
}
/** #1671 (ADR-584): a flat ledger of `units` (the transplant side of {@link ledgerTotal}). */
export function flatLedger(units: number): WorkCell {
  return { own: units, deps: [], charged: 0 };
}

/** Run `fn` inside a work epoch (nested calls share the outer one): every memo entry it touches is charged once. */
export function withWorkEpoch<T>(fn: () => T): T {
  if (epochOpen) return fn();
  epochOpen = true;
  epochId++;
  try {
    return fn();
  } finally {
    epochOpen = false;
  }
}

/** #2888 (ADR-827): is a work epoch open — may a work budget be reading the counter now? */
export function inWorkEpoch(): boolean {
  return epochOpen;
}
/**
 * #2893 (ADR-831; it was ADR-827's `clockSpent`): is the code running now under a budget that has NOTHING LEFT — the
 * ladder spent, or an armed work budget with no unit left? It only asks: no abort is counted. `>=`: a search handed a
 * budget of zero examines no candidate, even one a memo would answer in microseconds.
 */
export function budgetSpent(): boolean {
  return solveBudget.ladderSpent || (work.limitAt !== null && work.done >= work.limitAt);
}

/** Has the armed WORK budget run out? Never true when unarmed. Counted as a ladder abort, like the clock. */
export function workExceeded(): boolean {
  const over = (work.limitAt !== null && work.done > work.limitAt) || (executedCap.limitAt !== null && work.executed > executedCap.limitAt);
  if (!over) return false;
  solveBudget.aborts++;
  return true;
}

/**
 * #1675/#1584 ([ADR-583](docs/06-decisions.md#adr-583)) — THE RE-ATTEMPT CAP. A fact the fold already
 * failed is attempted again by the ADR-104 retry, the atomic rebuild, the HOIST re-folds and the drop-one
 * search; each attempt at an infeasible system pays the whole unbudgeted failure ladder again. A re-attempt
 * runs under this cap: `units` EXECUTED `evaluateCore` calls (never charged hits — inside one fold every
 * memo a re-attempt can touch was filled by that same fold, so the executed count is a function of the
 * fold's content alone). Returns whether the cap cut the computation. A cut charged to THIS cap alone is
 * not an abort of the surrounding computation: the cap is part of what the fold IS, the same on every run,
 * so `aborts` is restored and the fold stays memoizable — unless an outer budget (a clock, a work budget,
 * an outer cap) also ran out, which keeps its abort.
 */
export const executedCap: { limitAt: number | null } = { limitAt: null };
export function withExecutedCap<T>(units: number, fn: () => T): { value: T; exhausted: boolean } {
  const prev = executedCap.limitAt;
  const at = work.executed + units;
  executedCap.limitAt = prev === null ? at : Math.min(prev, at);
  const aborts0 = solveBudget.aborts;
  let value: T;
  try {
    value = fn();
  } finally {
    executedCap.limitAt = prev;
  }
  const exhausted = solveBudget.aborts !== aborts0 && work.executed > at;
  const outerRanOut =
    solveBudget.ladderSpent ||
    (work.limitAt !== null && work.done > work.limitAt) ||
    (prev !== null && work.executed > prev);
  if (exhausted && !outerRanOut) solveBudget.aborts = aborts0;
  return { value, exhausted };
}

/** Arm a budget of `units` of work for `fn` (nested arms keep the tighter limit; always restored). */
export function withWorkBudget<T>(units: number, fn: () => T): T {
  return withWorkEpoch(() => {
    const prev = work.limitAt;
    const at = work.done + units;
    work.limitAt = prev === null ? at : Math.min(prev, at);
    try {
      return fn();
    } finally {
      work.limitAt = prev;
    }
  });
}

/**
 * #2893 ([ADR-831](../../docs/06-decisions.md#adr-831), ADR-W-210 phase 4) — A SEARCH UNDER ITS LIMIT. Arms a work
 * budget of `units` (so the solve ladder inside a candidate stops at the same unit too) and opens the shared work limit
 * (`shell/workLimit`) on the same warmth-independent count, `work.done`: the search's loop asks `limitReached()` where
 * it read a clock, and the caller learns whether the limit was reached. A search that reached it without an answer
 * returns "not decided" (`shell/notDecided`), never a verdict.
 */
export function withSearchLimit<T>(units: number, fn: () => T, kind = 'search'): { value: T; reached: boolean; spent: number } {
  const r = withWorkBudget(units, () => withWorkLimit(units, fn, () => work.done));
  const st = (searchLimitStats[kind] ??= { runs: 0, reached: 0, maxSpent: 0 });
  st.runs++;
  if (r.reached) st.reached++;
  st.maxSpent = Math.max(st.maxSpent, r.spent);
  return r;
}
/** #2893 (ADR-831): per search kind, how many searches ran under a limit and how many reached it (the measurement's counter). */
export const searchLimitStats: Record<string, { runs: number; reached: number; maxSpent: number }> = {};

/**
 * #2894 (ADR-W-210 phase 5) — AN EXACT REPEAT IS SERVED, AND CHARGED AS IF IT WERE COMPUTED.
 *
 * Measured over every 2-D fixture and the slow corpus: 44–47 % of the cost evaluations a `nelderMead` call makes are
 * at a point that SAME call has already evaluated, bit for bit (a simplex that has contracted onto one point keeps
 * reflecting and shrinking onto it). `f` is a pure function of `x` for the life of the call, so the value is the one
 * already computed and the descent's path cannot change.
 *
 * What the repeat would have charged is charged again: `work.done`, `work.executed` and the open ledger frame's `own`
 * advance by exactly what the first evaluation advanced them, so every work budget, the re-attempt cap
 * (`withExecutedCap`) and every memo entry's ledger read the same numbers as before. Only the work meter (an executed
 * count of THIS process's solving) sees the evaluation that did not happen. Scoped to one call: the map is the
 * caller's, so nothing is kept between calls or depends on what ran before. A point with a NaN coordinate is never
 * served (NaN has more than one bit pattern).
 */
/** #2893 (ADR-831): off only in the lock that a served repeat counts against a search limit exactly as a computed one. */
export const repeatConfig = { serve: true };
export function servingRepeats<T>(f: (x: number[]) => T): (x: number[]) => T {
  if (!repeatConfig.serve) return f;
  const seen = new Map<string, { value: T; done: number; executed: number; own: number }>();
  return (x) => {
    const key = exactKey(x);
    if (key === null) return f(x);
    const hit = seen.get(key);
    if (hit) {
      work.done += hit.done;
      work.executed += hit.executed;
      if (frame) frame.own += hit.own;
      return hit.value;
    }
    const at = frame;
    const d0 = work.done;
    const e0 = work.executed;
    const o0 = at ? at.own : 0;
    const value = f(x);
    seen.set(key, { value, done: work.done - d0, executed: work.executed - e0, own: at && frame === at ? at.own - o0 : 0 });
    return value;
  };
}

/**
 * #2894 ([ADR-833](../../docs/06-decisions.md#adr-833)) — A WHOLE COMPUTATION THAT WOULD BE RUN AGAIN TO THE SAME
 * RESULT IS SERVED, AND CHARGED AS IF IT WERE RUN. The {@link servingRepeats} discipline, one level up: a driven solve's
 * relaxed pass repeats its convex pass's Nelder–Mead descents call for call (same cost function, same start, same
 * steps), and an anti-collapse retry whose barrier was zero at every point the plain search evaluated is the plain
 * search again. What the run advanced (`work.done`, `work.executed`, the open ledger frame's `own`) is advanced again,
 * so every budget, cap and ledger reads what it read when the computation ran twice.
 *
 * A run is never served past a limit: a run during which an armed limit was crossed (or the ladder was spent) is not
 * {@link ChargedRun.whole}, and a hit whose charge would cross an armed limit is refused ({@link serveRun} returns
 * false), so the caller computes it again and is cut exactly where a computation would be.
 */
export interface ChargedRun<T> {
  value: T;
  done: number;
  executed: number;
  own: number;
  /** no limit was crossed while it ran, so running it again (under the same limits) runs it whole */
  whole: boolean;
}
const overLimit = (): boolean =>
  solveBudget.ladderSpent || (work.limitAt !== null && work.done > work.limitAt) || (executedCap.limitAt !== null && work.executed > executedCap.limitAt);
/** Run `fn` and record what it charged. */
export function measuredRun<T>(fn: () => T): ChargedRun<T> {
  const at = frame;
  const d0 = work.done;
  const e0 = work.executed;
  const o0 = at ? at.own : 0;
  const whole0 = !overLimit();
  const value = fn();
  return { value, done: work.done - d0, executed: work.executed - e0, own: at && frame === at ? at.own - o0 : 0, whole: whole0 && !overLimit() };
}
/** Charge a recorded run as if it ran again; false (nothing charged) when it was cut, serving is off, or the charge
 *  would cross an armed limit — the caller then runs it. */
export function serveRun<T>(run: ChargedRun<T>): boolean {
  if (!repeatConfig.serve || !run.whole || solveBudget.ladderSpent) return false;
  if (work.limitAt !== null && work.done + run.done > work.limitAt) return false;
  if (executedCap.limitAt !== null && work.executed + run.executed > executedCap.limitAt) return false;
  work.done += run.done;
  work.executed += run.executed;
  if (frame) frame.own += run.own;
  return true;
}
/** A memo of whole runs by key, scoped to its caller: a hit is served by {@link serveRun}, a miss (or a refused hit)
 *  runs and is kept when it ran whole. */
export function servedRuns<T>(): (key: string, compute: () => T) => T {
  const seen = new Map<string, ChargedRun<T>>();
  return (key, compute) => {
    const hit = seen.get(key);
    if (hit && serveRun(hit)) return hit.value;
    const run = measuredRun(compute);
    if (run.whole) seen.set(key, run);
    return run.value;
  };
}

/** The exact identity of a point: every coordinate by its shortest round-trip text, −0 kept apart; null with a NaN. */
export function exactKey(x: readonly number[]): string | null {
  let key = '';
  for (const v of x) {
    if (Number.isNaN(v)) return null;
    key += (Object.is(v, -0) ? '-0' : String(v)) + ',';
  }
  return key;
}
