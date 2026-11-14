/**
 * #2890 ([ADR-W-210](../docs/06w-decisions-workspace.md#adr-w-210) Am. 4, phase 3) — THE EXECUTORS: a builder's
 * operations run where there is no `Worker`. A worker client (`workerClient.ts`) is handed one; which one is the
 * builder's choice, because the builders differ.
 *
 * | Executor | The op table lives in | Units are charged to | Arguments and values | Used by |
 * |---|---|---|---|---|
 * | {@link sameInstanceExecutor} | this module instance | the WORKER lane (`inWorkerLane`) | by reference | every suite; a browser with no `Worker` |
 * | {@link pageLaneExecutor} | this module instance | the PAGE lane | by reference | a builder that stays on the page's thread (complex), under {@link pageLaneCeiling} |
 * | {@link isolatedExecutor} | a SECOND module instance | that instance's own meter, returned in the envelope | `structuredClone`, both ways | the work-meter gates: what a browser's separate heaps do |
 *
 * An operation is called exactly as the worker's host calls it (`workerHost.ts`): `(args, ctx)`. Here nothing newer
 * can be waiting, so `ctx.tick()` resolves `false` without leaving the task.
 *
 * Nothing here knows a builder, an operation's name or a field of a result.
 */
import { holdWorkerLane, readWork } from './workMeter';
import type { OpContext, OpTable } from './workerProtocol';

/** What a caller hears while one operation runs. */
export interface RunHooks {
  onProgress?(k: number, n: number): void;
  onPart?(name: string, value: unknown): void;
  /** Units counted in another heap (the meter envelope). Never called for work this heap's own meter counted. */
  onUnits?(units: number): void;
}

export interface Executor {
  run(lane: string, op: string, args: unknown, hooks?: RunHooks): Promise<unknown>;
  /** Hand the builder's checkpoint to the heap that serves `lane`. Absent where that heap is this one. */
  seed?(lane: string, args: unknown): void;
}

const isThenable = (v: unknown): v is PromiseLike<unknown> => typeof (v as { then?: unknown } | null | undefined)?.then === 'function';

function call(ops: OpTable, op: string, args: unknown, hooks: RunHooks | undefined): unknown {
  const fn = ops[op];
  if (typeof fn !== 'function') throw new Error(`unknown operation: ${op}`);
  const ctx: OpContext = {
    part: (name, value) => hooks?.onPart?.(name, value),
    progress: (k, n) => hooks?.onProgress?.(k, n),
    tick: () => Promise.resolve(false),
  };
  return fn(args, ctx);
}

/**
 * The same functions, in this module instance, charged to the worker lane: under node this is the work a browser
 * sends to its worker. A synchronous operation is over when this returns, as a store or an engine called directly is.
 */
export function sameInstanceExecutor(ops: OpTable): Executor {
  return {
    run(_lane, op, args, hooks) {
      const release = holdWorkerLane();
      let out: unknown;
      try {
        out = call(ops, op, args, hooks);
      } catch (err) {
        release();
        return Promise.reject(err);
      }
      if (!isThenable(out)) {
        release();
        return Promise.resolve(out);
      }
      // an operation that yields: the lane is the worker's until it settles (its ticks leave nothing else in)
      return Promise.resolve(out).finally(release);
    },
  };
}

/** The same functions, on the page's own thread and lane: a builder whose solving is cheap enough to stay there. */
export function pageLaneExecutor(ops: OpTable): Executor {
  return {
    run(_lane, op, args, hooks) {
      try {
        return Promise.resolve(call(ops, op, args, hooks));
      } catch (err) {
        return Promise.reject(err);
      }
    },
  };
}

export interface IsolatedOptions {
  /** The units the OTHER module instance has counted so far (its own `shell/workMeter`). */
  units: () => number;
  /** That instance's checkpoint handler, as its worker entry would pass to `serveWorker`. */
  seed?: (args: unknown) => void;
}

/**
 * The op table of a SECOND module instance (the caller loads it: `shell/__tests__/isolated-ops.ts`), served as a
 * browser's worker is: every argument, part and value passes through `structuredClone`, and the units that instance
 * counted come back in the envelope. A value that does not clone rejects the request.
 */
export function isolatedExecutor(ops: OpTable, options: IsolatedOptions): Executor {
  return {
    run(_lane, op, args, hooks) {
      let mark = options.units();
      const spent = (): void => {
        const now = options.units();
        if (now !== mark) hooks?.onUnits?.(now - mark);
        mark = now;
      };
      const across: RunHooks = {
        onProgress: (k, n) => hooks?.onProgress?.(k, n),
        onPart: (name, value) => {
          spent();
          hooks?.onPart?.(name, structuredClone(value));
        },
      };
      const settle = (value: unknown): unknown => {
        spent();
        return structuredClone(value);
      };
      // what crosses a real boundary is the error's message, never the object
      const fail = (err: unknown): never => {
        spent();
        throw new Error(String((err as Error | null | undefined)?.message ?? err));
      };
      try {
        const out = call(ops, op, structuredClone(args), across);
        if (isThenable(out)) return Promise.resolve(out).then(settle, fail);
        return Promise.resolve(settle(out));
      } catch (err) {
        try {
          return fail(err);
        } catch (crossed) {
          return Promise.reject(crossed);
        }
      }
    },
    seed(_lane, args) {
      options.seed?.(structuredClone(args));
    },
  };
}

/** One executor per lane: a builder whose lanes are separate heaps (an interactive worker, a background one). */
export function executorByLane(lanes: Record<string, Executor>): Executor {
  const of = (lane: string): Executor => {
    const executor = lanes[lane];
    if (!executor) throw new Error(`no executor for the lane «${lane}»`);
    return executor;
  };
  return {
    run: (lane, op, args, hooks) => of(lane).run(lane, op, args, hooks),
    seed: (lane, args) => of(lane).seed?.(lane, args),
  };
}

export interface CeilingOptions {
  /** The most page-lane units one student action may charge. */
  ceiling: number;
  /** An action went over. Nothing is cut: the action has already finished. The builder says where this is reported. */
  onOver(over: { lane: string; units: number; ceiling: number }): void;
  /** The page-lane units counted so far. Default: `shell/workMeter`'s `page`. */
  units?: () => number;
}

/**
 * THE WORK CEILING of a builder that solves on the page's thread (ADR-W-210 invariant 1's stated exception). It is a
 * SPAN of the work queue (`createWorkQueue({ span })`): it reads the page lane when a job's turn starts and again
 * when the job is released, after the paint that shows its result, so it counts the WHOLE action, the render it
 * causes included. An action over the ceiling is reported, never cut: the work is done by then, and stopping a
 * solve honestly needs the "not decided" outcome of phase 4.
 */
export function pageLaneCeiling(options: CeilingOptions): (job: { lane: string }) => () => void {
  const units = options.units ?? (() => readWork().page);
  return (job) => {
    const start = units();
    return () => {
      const spent = units() - start;
      if (spent > options.ceiling) options.onOver({ lane: job.lane, units: spent, ceiling: options.ceiling });
    };
  };
}
