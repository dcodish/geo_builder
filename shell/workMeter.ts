/**
 * THE WORK METER (#2873, [ADR-W-210](../docs/06w-decisions-workspace.md#adr-w-210) phase 0).
 *
 * Every builder's innermost solving function calls {@link meterWork} once per unit of its own work. A unit is a
 * count, never a time: 2-D one `evaluateCore`, 3-D one residual evaluation of `leastSquares`, analytic one residual
 * evaluation of `solveLM` (and of the rank and the root scan beside it), complex one `foldConstraints`. A unit's
 * cost differs between builders and between figures, so counts are only ever compared against the same action of
 * the same figure (the committed baselines, `work-meter/baseline.jsonl` in each product's tests).
 *
 * Three counts, because invariant 5 of the ADR asks for three:
 *  - `total`    — all the work;
 *  - `page`     — the part charged to the page's UI thread, as against a worker;
 *  - `prePaint` — the part done before the action's figure can paint (decide, commit, the render's derive and its
 *                 readers), as against effects, pool slices and background detection.
 *
 * THE LANE. Inside a real Worker the global scope says so, and nothing there is page work. Everywhere else the
 * lane is `page` unless the caller runs the work through {@link inWorkerLane}: a worker client's synchronous
 * fallback does (2-D's `geoWork`), so under node the work a browser would run off the page is charged off the page.
 *
 * THE PHASE. `prePaint` means something only inside {@link meterAction}: the driver of an action calls
 * `painted()` at the point where the App's figure is on screen. Outside an action every unit counts as pre-paint.
 *
 * No product knowledge and no strings: the caller decides what a unit is. The counters only ever grow, so reading
 * them cannot disturb a second reader; nothing in a product reads them to decide anything.
 */
export interface WorkCounts {
  total: number;
  page: number;
  prePaint: number;
}

const scope = globalThis as { WorkerGlobalScope?: unknown };
/** True in a dedicated/shared/service worker: its global object is an instance of `WorkerGlobalScope`. */
const IN_WORKER_SCOPE = typeof scope.WorkerGlobalScope === 'function' && globalThis instanceof (scope.WorkerGlobalScope as new () => object);

const counts: WorkCounts = { total: 0, page: 0, prePaint: 0 };
let onPage = !IN_WORKER_SCOPE;
let afterPaint = false;

/** Charge `units` of solver work to the current lane and phase. Called from each builder's innermost solving function. */
export function meterWork(units = 1): void {
  counts.total += units;
  if (onPage) counts.page += units;
  if (!afterPaint) counts.prePaint += units;
}

/** The counters as they stand (a copy). */
export function readWork(): WorkCounts {
  return { total: counts.total, page: counts.page, prePaint: counts.prePaint };
}

/** Which lane a unit counted now would be charged to. */
export function workLane(): 'page' | 'worker' {
  return onPage ? 'page' : 'worker';
}

/**
 * Run `fn` with its work charged to the worker lane — for work a browser runs in a Worker and this environment
 * runs in-process (a worker client's synchronous fallback). Synchronous: the lane is restored when `fn` returns
 * or throws, so nothing awaited after it is mischarged.
 */
export function inWorkerLane<T>(fn: () => T): T {
  const was = onPage;
  onPage = false;
  try {
    return fn();
  } finally {
    onPage = was;
  }
}

export interface MeteredAction {
  /** The action's figure is on screen: work from here on is no longer pre-paint. */
  painted(): void;
  /** Work is pre-paint again (a second figure the student waits for inside one action). */
  unpainted(): void;
  /** The work charged since the action began. Ends the action. */
  end(): WorkCounts;
}

/** Begin one student action: the three counts of everything metered until `end()`. Actions do not nest. */
export function meterAction(): MeteredAction {
  const start = readWork();
  afterPaint = false;
  return {
    painted: () => {
      afterPaint = true;
    },
    unpainted: () => {
      afterPaint = false;
    },
    end: () => {
      afterPaint = false;
      return { total: counts.total - start.total, page: counts.page - start.page, prePaint: counts.prePaint - start.prePaint };
    },
  };
}
