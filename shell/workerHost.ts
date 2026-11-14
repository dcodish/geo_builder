/**
 * #2890 ([ADR-W-210](../docs/06w-decisions-workspace.md#adr-w-210) Am. 4, phase 3) — THE WORKER'S HALF of the
 * protocol (`workerProtocol.ts`). A builder's worker entry is one line: `serveWorker(itsOperations, { seed })`.
 *
 * - **One request at a time, in the order received.** A request that arrives while another runs waits; the running
 *   one learns of it through `ctx.tick()`.
 * - **A synchronous operation is answered synchronously**, inside the message's own task, as a worker that calls its
 *   solver directly always did. Only an operation that returns a promise (one that yields) is awaited.
 * - **The meter envelope.** Each `part`, `done` and `error` carries the units this heap's `shell/workMeter` counted
 *   since the job's previous message. In a real worker that meter is the worker's own module instance.
 * - A value that cannot be cloned is the job's ERROR, said by name, never a silent hang: the page's request rejects.
 *
 * Nothing here knows a builder, an operation's name or a field of a result.
 */
import { readWork } from './workMeter';
import type { FromWorker, OpContext, OpTable, ToWorker } from './workerProtocol';

/** The part of a worker's global scope the host uses (a test hands a fake). */
export interface HostScope {
  postMessage(message: FromWorker): void;
  onmessage: ((event: { data: ToWorker }) => void) | null;
}

export interface ServeOptions {
  /** Take the builder's checkpoint (the `seed` message). A checkpoint that throws is ignored: it only ever saves work. */
  seed?: (args: unknown) => void;
  /** The units this heap has counted so far. Default: `shell/workMeter`'s total. */
  units?: () => number;
  /** The scope to serve. Default: the worker's own global scope. */
  scope?: HostScope;
}

const isThenable = (v: unknown): v is PromiseLike<unknown> => typeof (v as { then?: unknown } | null | undefined)?.then === 'function';
const messageOf = (err: unknown): string => String((err as Error | null | undefined)?.message ?? err);

export function serveWorker(ops: OpTable, options: ServeOptions = {}): void {
  const scope = options.scope ?? (self as unknown as HostScope);
  const units = options.units ?? (() => readWork().total);
  const waiting: Extract<ToWorker, { t: 'run' }>[] = [];
  let busy = false;

  /** Run the waiting requests, oldest first. Returns when none waits, or when one has yielded (it resumes this). */
  function pump(): void {
    while (!busy && waiting.length > 0) {
      const request = waiting.shift()!;
      let mark = units();
      const spent = (): number => {
        const now = units();
        const since = now - mark;
        mark = now;
        return since;
      };
      const fail = (err: unknown): void => scope.postMessage({ t: 'error', id: request.id, message: messageOf(err), units: spent() });
      const finish = (value: unknown): void => {
        try {
          scope.postMessage({ t: 'done', id: request.id, value, units: spent() });
        } catch (err) {
          fail(err); // the value does not clone
        }
      };
      const ctx: OpContext = {
        part: (name, value) => scope.postMessage({ t: 'part', id: request.id, name, value, units: spent() }),
        progress: (k, n) => scope.postMessage({ t: 'progress', id: request.id, k, n }),
        tick: () => new Promise<boolean>((resolve) => setTimeout(() => resolve(waiting.length > 0), 0)),
      };
      let out: unknown;
      try {
        const op = ops[request.op];
        if (typeof op !== 'function') throw new Error(`unknown operation: ${request.op}`);
        out = op(request.args, ctx);
      } catch (err) {
        fail(err);
        continue;
      }
      if (!isThenable(out)) {
        finish(out);
        continue;
      }
      busy = true;
      out.then(finish, fail).then(() => {
        busy = false;
        pump();
      });
    }
  }

  scope.onmessage = (event) => {
    const message = event.data;
    if (message.t === 'seed') {
      try {
        options.seed?.(message.args);
      } catch {
        /* a checkpoint is an optimisation: a worker that cannot take it solves for itself */
      }
      return;
    }
    if (message.t === 'drop') {
      const at = waiting.findIndex((r) => r.id === message.id);
      if (at >= 0) waiting.splice(at, 1);
      return;
    }
    waiting.push(message);
    pump();
  };
  scope.postMessage({ t: 'ready' });
}
