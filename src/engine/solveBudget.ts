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
}

/** Has the armed WORK budget run out? Never true when unarmed. Counted as a ladder abort, like the clock. */
export function workExceeded(): boolean {
  if (work.limitAt === null || work.done <= work.limitAt) return false;
  solveBudget.aborts++;
  return true;
}

/** Arm a budget of `units` of work for `fn` (nested arms keep the tighter limit; always restored). */
export function withWorkBudget<T>(units: number, fn: () => T): T {
  const prev = work.limitAt;
  const at = work.done + units;
  work.limitAt = prev === null ? at : Math.min(prev, at);
  try {
    return fn();
  } finally {
    work.limitAt = prev;
  }
}
