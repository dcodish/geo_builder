/**
 * #2890 ([ADR-W-210](../docs/06w-decisions-workspace.md#adr-w-210) Am. 4, phase 3) — THE WORKER PROTOCOL: what a
 * builder's page and its worker say to each other. Types only; the page's half is `workerClient.ts`, the worker's
 * half is `workerHost.ts`, and `workerExecutor.ts` runs the same operations where there is no `Worker`.
 *
 * - **An operation** is `(args, ctx) => value`, named in the builder's own table. Its arguments and its value are
 *   the builder's, and they must survive `structuredClone`: nothing here reads a field of either.
 * - **One job, several answers.** An operation may send named PARTS before its value (`ctx.part`): a figure before
 *   the knowledge that follows it. It may report progress, and it may YIELD (`ctx.tick`), which is the one way a
 *   worker hears anything while it works: a tick resolves `true` when a newer request is waiting.
 * - **Every `run` carries all its job needs.** No message refers to an earlier one, so a worker can be replaced
 *   between any two jobs. What a fresh worker is handed first is the builder's CHECKPOINT (`seed`): content the page
 *   holds that saves the worker solving it again.
 * - **The meter envelope.** `part`, `done` and `error` carry the solver work the worker charged since the job's
 *   previous message (`shell/workMeter` units), so the page's meter counts an action whole.
 */

/** Page → worker. */
export type ToWorker =
  | { t: 'run'; id: number; op: string; args: unknown }
  /** The builder's checkpoint: the first message a worker gets after every spawn (when the builder has one). */
  | { t: 'seed'; args: unknown }
  /** A request that was posted and is no longer wanted. A worker that has not started it never does. */
  | { t: 'drop'; id: number };

/** Worker → page. */
export type FromWorker =
  /** The worker's module has been evaluated and its operations are being served. */
  | { t: 'ready' }
  | { t: 'progress'; id: number; k: number; n: number }
  | { t: 'part'; id: number; name: string; value: unknown; units: number }
  | { t: 'done'; id: number; value: unknown; units: number }
  | { t: 'error'; id: number; message: string; units: number };

/** What a running operation can say and ask. */
export interface OpContext {
  /** Send a named intermediate result. The job goes on. */
  part(name: string, value: unknown): void;
  /** Report progress: step `k` of about `n`. */
  progress(k: number, n: number): void;
  /**
   * Yield to the message loop. Resolves `true` when a newer request waits behind this one, so a long background
   * operation can give way and keep its caches. An operation that never awaits this runs to its end and can only be
   * stopped by terminating its worker.
   */
  tick(): Promise<boolean>;
}

// `any` on purpose: each operation of a table has its own argument and value, and the table is indexed by name.
export type Op<A = any, R = any> = (args: A, ctx: OpContext) => R | Promise<R>;
export type OpTable = Record<string, Op>;

/** The argument of one operation of a table, and the value it answers with. */
export type ArgsOf<F> = F extends (args: infer A, ...rest: never[]) => unknown ? A : never;
export type ValueOf<F> = F extends (...args: never[]) => infer R ? Awaited<R> : never;

/** What a request rejects with when it was cancelled on purpose: a caller goes quiet, it never shows this. */
export const cancelled = (): Error & { cancelled: true } => Object.assign(new Error('cancelled'), { cancelled: true as const });
/** True when the error is a deliberate cancel. */
export const isCancelled = (err: unknown): boolean => Boolean((err as { cancelled?: boolean } | null | undefined)?.cancelled);
