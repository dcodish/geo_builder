/**
 * #2874 ([ADR-W-210](../docs/06w-decisions-workspace.md#adr-w-210) invariant 2, phase 1) — THE WORK QUEUE:
 * ONE JOB PER STUDENT ACTION, AND THE WORKING STATE IS COUNTED, NEVER SET.
 *
 * Every builder told the student "I am working" with a flag a call site set and cleared, around the one
 * wait that call site knew about. The engine's own work runs synchronously inside a handler or inside the
 * React render, so the flag could not paint before it, and an exit that forgot to clear it left the tool
 * busy for good (2-D's submit had three owners of one boolean and no `finally`).
 *
 * Here the state is DERIVED. A student action is a job; a job is counted from the moment it is asked for
 * until it has finished and the browser has painted what it produced; the count is released in a
 * `finally`. No call site can leave the tool working, and none can forget to say so.
 *
 * - **Lanes.** A lane is a serial queue: its jobs run one at a time, in the order they were asked for. The
 *   {@link INTERACTIVE} lane is the student's own actions and is what the working indicator shows. A caller
 *   may name other lanes (a model call inside a submit, a search that has its own button); each is counted
 *   on its own and shown where the caller chooses.
 * - **Paint first.** A job is counted, then waits for the browser to paint, and only then
 *   runs: an indicator set in the same task as a synchronous solve never reaches the screen. It stays
 *   counted until the paint that follows its work, because in a builder that solves inside the React
 *   render the heavy part runs AFTER the store update the job made.
 * - **The basis stamp.** A job records what it was started for (the caller's `basis()`: its facts and
 *   seed), read WHEN ITS TURN STARTS (#2890, ADR-W-210 Am. 4), after the jobs it waited behind have run: an action
 *   that waits its turn acts on the figure as it is then, so that is the figure its result may be applied to. A
 *   stamp read when the job was asked for made every job that waited look stale.
 * - **Ordering across lanes** (#2890). A lane may be declared BEHIND another: its jobs are still counted and shown
 *   on their own lane, and each also waits for every job the other lane had been asked for before it. The other
 *   lane does not wait for them. («הציגו תצורה אחרת» has its own button, and still waits its turn.)
 * - **No paint in a test.** `paint` is injected. Where there is no `requestAnimationFrame` (node, the
 *   suite) the default resolves at once, so a job is one promise and the engine and the stores stay as
 *   synchronous as they were.
 *
 * Nothing here knows a builder, a store or a string.
 */

/** The lane of the student's own actions: what the working indicator shows. */
export const INTERACTIVE = 'interactive';

/** Resolves once the browser has painted what was rendered before the call. */
export type Paint = () => Promise<void>;

export interface WorkQueueOptions<B> {
  /** Injected for tests. Default: {@link browserPaint} in a browser, an immediate resolve elsewhere. */
  paint?: Paint;
  /** What a job is started for (the facts and seed on screen at the action). Read once, when the job is asked for. */
  basis?: () => B;
  /** Whether two stamps name the same figure. Default: `Object.is`. */
  sameBasis?: (a: B, b: B) => boolean;
  /** Lane → the lane its jobs take their turn behind (see the header). A `run` may name its own with `behind`. */
  behind?: Readonly<Record<string, string>>;
  /**
   * Called when a job's turn starts, where its stamp is read; what it returns is called when the job is released,
   * after its closing paint. For a measure of one student action WHOLE (a page-lane work ceiling).
   */
  span?: (job: Job<B>) => (() => void) | void;
}

/** What a running job knows about itself. */
export interface Job<B = unknown> {
  readonly lane: string;
  /** The stamp read when the job's turn started; `undefined` when the queue has no `basis`. */
  readonly basis: B | undefined;
  /** The figure the job started on is no longer the current one: something else changed it while this job worked. */
  stale(): boolean;
  /**
   * Work this job started and did not await (a post-commit search) belongs to it: the job is not finished,
   * and the tool is not idle, until `more` settles. Returns `more`, so a caller can still await it.
   */
  join<T>(more: T): T;
  /** Let the browser paint what the job has produced so far (a long job that shows progress). */
  paint(): Promise<void>;
}

export interface RunOptions {
  /** Default {@link INTERACTIVE}. */
  lane?: string;
  /**
   * `false` for a wait NESTED inside a job that has already painted (the model call inside a submit): it is
   * counted on its lane and released in a `finally` like any job, with no paint of its own. Default `true`.
   */
  paint?: boolean;
  /** This job also takes its turn behind the jobs already asked for on that lane. Default: the queue's `behind`. */
  behind?: string;
}

export interface WorkQueue<B = unknown> {
  /**
   * Ask for a job. It is counted at once, runs after every earlier job of its lane, and its count is
   * released in a `finally`: a job that throws rejects this promise and leaves the queue idle.
   */
  run<T>(work: (job: Job<B>) => T | Promise<T>, options?: RunOptions): Promise<T>;
  /**
   * The same, but only when the lane is idle; `null` (nothing asked for) when it is working. The submit
   * seam's rule: Enter is off while the tool works, and the typed line stays in the box (ADR-W-198).
   */
  runIfIdle<T>(work: (job: Job<B>) => T | Promise<T>, options?: RunOptions): Promise<T> | null;
  /** The derived working state of a lane: a job is waiting, running, or waiting for its closing paint. */
  working(lane?: string): boolean;
  /** A job's own work is running right now, in any lane (the basis guard reads this). */
  inJob(): boolean;
  /** Called whenever a lane's count changes. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Resolves when no lane is working. For tests and probes. */
  idle(): Promise<void>;
}

/**
 * Two animation frames: the first runs before the frame that paints what was just rendered, the second
 * after it. A hidden tab paints nothing and fires no frame, so there the wait ends at once (and ends early
 * if the tab is hidden while it waits): a figure opened in a background tab still loads.
 */
export const browserPaint: Paint = () =>
  new Promise<void>((resolve) => {
    if (document.hidden) {
      setTimeout(resolve, 0);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      document.removeEventListener('visibilitychange', onHide);
      resolve();
    };
    const onHide = () => {
      if (document.hidden) finish();
    };
    document.addEventListener('visibilitychange', onHide);
    requestAnimationFrame(() => requestAnimationFrame(finish));
  });

const noPaint: Paint = () => Promise.resolve();
const hasFrames = () => typeof requestAnimationFrame === 'function' && typeof document !== 'undefined';

export function createWorkQueue<B = undefined>(options: WorkQueueOptions<B> = {}): WorkQueue<B> {
  const paint: Paint = options.paint ?? (() => (hasFrames() ? browserPaint() : noPaint()));
  const same = options.sameBasis ?? ((a: B, b: B) => Object.is(a, b));
  const counts = new Map<string, number>();
  const tails = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  let running = 0;

  const count = (lane: string, by: 1 | -1) => {
    counts.set(lane, (counts.get(lane) ?? 0) + by);
    for (const listener of [...listeners]) listener();
  };
  const working = (lane: string = INTERACTIVE) => (counts.get(lane) ?? 0) > 0;

  function run<T>(work: (job: Job<B>) => T | Promise<T>, runOptions: RunOptions = {}): Promise<T> {
    const lane = runOptions.lane ?? INTERACTIVE;
    const shown = runOptions.paint !== false;
    const behind = runOptions.behind ?? options.behind?.[lane];
    count(lane, 1);
    const own = tails.get(lane) ?? Promise.resolve();
    // behind another lane: after every job that lane has been asked for so far (it does not wait for this one)
    const turn: Promise<unknown> = behind !== undefined && behind !== lane ? Promise.all([own, tails.get(behind) ?? Promise.resolve()]) : own;
    const result = turn.then(async () => {
      const joined: unknown[] = [];
      let released: (() => void) | void = undefined;
      try {
        if (shown) await paint();
        // the stamp is read HERE, when the job's turn has come: the jobs it waited behind have changed the figure
        const basis = options.basis?.();
        const job: Job<B> = {
          lane,
          basis,
          stale: () => (options.basis && basis !== undefined ? !same(basis, options.basis()) : false),
          join: (more) => {
            joined.push(more);
            return more;
          },
          paint,
        };
        released = options.span?.(job);
        running++;
        try {
          const out = await work(job);
          // work the job started without awaiting it (a post-commit search) is part of the job
          while (joined.length) await joined.shift();
          return out;
        } finally {
          running--;
          // a joined promise left behind by a throw must not surface later as an unhandled rejection
          for (const left of joined) void Promise.resolve(left).catch(() => {});
        }
      } finally {
        try {
          if (shown) await paint();
          released?.();
        } finally {
          count(lane, -1);
        }
      }
    });
    tails.set(
      lane,
      result.then(
        () => {},
        () => {},
      ),
    );
    return result;
  }

  return {
    run,
    runIfIdle: (work, runOptions) => (working(runOptions?.lane) ? null : run(work, runOptions)),
    working,
    inJob: () => running > 0,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    idle: async () => {
      while ([...counts.values()].some((n) => n > 0)) await Promise.all([...tails.values()]);
    },
  };
}

/** The functions of a table whose keys are listed in `names`, as jobs: same arguments, the result in a promise. */
export type Queued<S, K extends keyof S> = {
  [P in K]: S[P] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never;
};

/**
 * A store's engine-running actions AS JOBS. `names` is the product's own list (its routing registry), so
 * the table is derived from the classification and cannot name an action the registry does not. Each
 * entry reads the action from `state()` when the job RUNS, so it acts on the store as it is then.
 */
export function queuedActions<S, K extends keyof S>(queue: WorkQueue<unknown>, state: () => S, names: readonly K[], options?: QueuedOptions): Queued<S, K> {
  const table = {} as Record<K, (...args: unknown[]) => Promise<unknown>>;
  for (const name of names) {
    table[name] = (...args: unknown[]) =>
      queue.run((job) => {
        const runLocal = () => (state()[name] as (...a: unknown[]) => unknown)(...args);
        return options?.around ? options.around(String(name), args, job, runLocal) : runLocal();
      }, options);
  }
  return table as unknown as Queued<S, K>;
}

export interface QueuedOptions extends RunOptions {
  /**
   * The builder's wrapper of every routed action (#2890): how the action reaches its solver. `runLocal` runs the
   * store's own action on this thread; a builder may call it through its worker client's executor, prime first and
   * then call it, or send the action elsewhere and never call it. With no wrapper an action is `runLocal()`.
   */
  around?: (name: string, args: readonly unknown[], job: Job<unknown>, runLocal: () => unknown) => unknown;
}

/**
 * THE BASIS GUARD: a figure's basis (its facts and seed) changes only inside a job. `onChange` is the
 * product's own subscription to its store, called on every basis change; a change with no job running is
 * a student action that reached the store without the queue, so the tool worked and showed nothing.
 * Returns the unsubscribe. A page arms it in development; a routing lock arms it around the action it drives.
 */
export function watchBasis(queue: WorkQueue<unknown>, onChange: (changed: () => void) => () => void, onFault: () => void): () => void {
  return onChange(() => {
    if (!queue.inJob()) onFault();
  });
}
