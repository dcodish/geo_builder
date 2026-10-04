/**
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
export const solveBudget: { deadlineAt: number | null; aborts: number } = { deadlineAt: null, aborts: 0 };

/** Has the armed budget run out? (Never true when unarmed — the default, and always under tests.) */
export function budgetExceeded(): boolean {
  if (workExceeded()) return true;
  if (solveBudget.deadlineAt === null || Date.now() <= solveBudget.deadlineAt) return false;
  solveBudget.aborts++;
  return true;
}

/** Arm the ladder budget for `fn` (nested arms keep the tighter deadline; always restored). */
export function withSolveBudget<T>(deadlineAt: number, fn: () => T): T {
  const prev = solveBudget.deadlineAt;
  solveBudget.deadlineAt = prev === null ? deadlineAt : Math.min(prev, deadlineAt);
  try {
    return fn();
  } finally {
    solveBudget.deadlineAt = prev;
  }
}

/**
 * #1601/#1599 (ADR-558): the WORK budget — the deterministic sibling of the wall clock above. Every
 * `evaluateCore` is one work unit (`work.done`), so a budget of N units stops at the same point on every
 * device and every run: the knowledge pool's verdicts can then never depend on how fast the machine was
 * (the operator's ruling on #1601 — "same input, same answer"). The interactive searches keep the wall
 * clock; only the knowledge pool is bounded this way.
 */
export const work: { done: number; limitAt: number | null } = { done: 0, limitAt: null };

/** One unit of work (called by `evaluateCore`). */
export function countWork(): void {
  work.done++;
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

/** Has the armed WORK budget run out? Never true when unarmed. Counted as a ladder abort, like the clock. */
export function workExceeded(): boolean {
  if (work.limitAt === null || work.done <= work.limitAt) return false;
  solveBudget.aborts++;
  return true;
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
