/**
 * THE POOL COMPLETES AFTER THE RENDER (#1473, ADR-AG-180 — operator ruling 2026-09-29, option B′).
 *
 * Operator: *"we cannot afford 0.5 s addition"* — and then: the figure draws immediately; while the
 * 24-configuration pool finishes, panel and ask values show «בודק…», never a provisional number.
 *
 * The render path does exactly the synchronous work it did before #1473 (the pool's floor is the distinct
 * walk it always paid); this loop spends the rest in slices of ONE seed each (a seed is one drawable walk,
 * 7–101 ms measured on the heaviest corpus line), YIELDING to the browser between seeds, and asks for a
 * re-render when the pool completes — only if some row actually showed pending, so a figure whose pool was
 * already complete costs nothing.
 *
 * **Yield, never wait for idle** (browser pre-play, round #1559). The first cut scheduled each seed with
 * `requestIdleCallback(…, { timeout: 200 })`. Measured in Chromium (headed and headless) on the 572 exam:
 * the page itself is quiet — 0 animation frames per second, 0 running animations, and an idle callback on
 * the resting page fires in ~11 ms — but once a slice has run, the browser grants NO further idle period
 * while the loop keeps posting work: 20 of 21 slices fired by the 200 ms timeout, so «בודק…» stood for
 * 4.1–4.7 s instead of ~0.5 s. The loop's own slices are the "busy" that starves idle scheduling. The
 * intent was always to yield between seeds (input and paint run in between), not to wait for idleness,
 * so a slice is a plain macrotask: `scheduler.postTask` where the browser has it, else a `MessageChannel`
 * message (not clamped like nested timers), else `setTimeout(0)`.
 *
 * **A figure change abandons the loop.** The pool belongs to one construction (`configurationPool` is
 * keyed on it), and the returned `cancel` is the effect's cleanup: once a line changes, no further seed
 * of the OLD figure is evaluated and its completion never fires — so no stale verdict can land on the new
 * figure, which gets its own pool and its own loop.
 */
import type { ConfigurationPool } from '../engine/evaluate';

/** Where a slice runs. Injected so the lock can drive slices by hand. */
export interface SliceScheduler {
  schedule(run: () => void): unknown;
  cancel(handle: unknown): void;
}

type PostTask = (cb: () => void, opts: { priority: 'user-visible'; signal: AbortSignal }) => Promise<unknown>;

/** One macrotask per slice: `scheduler.postTask`, else a `MessageChannel` message, else `setTimeout(0)`. */
export const yieldScheduler: SliceScheduler = {
  schedule(run) {
    const g = globalThis as { scheduler?: { postTask?: PostTask } };
    if (typeof g.scheduler?.postTask === 'function' && typeof AbortController !== 'undefined') {
      const ctl = new AbortController();
      // An aborted task rejects; that is the cancel, not an error.
      g.scheduler.postTask(run, { priority: 'user-visible', signal: ctl.signal }).catch(() => {});
      return { abort: ctl };
    }
    if (typeof MessageChannel !== 'undefined') {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        run();
      };
      ch.port2.postMessage(null);
      return { port: ch.port1 };
    }
    return { timer: setTimeout(run, 0) };
  },
  cancel(handle) {
    const h = handle as { abort?: AbortController; port?: MessagePort; timer?: ReturnType<typeof setTimeout> } | undefined;
    if (!h) return;
    h.abort?.abort();
    if (h.port) {
      h.port.onmessage = null;
      h.port.close();
    }
    if (h.timer !== undefined) clearTimeout(h.timer);
  },
};

/**
 * Complete `pool` one seed per slice; call `onSettled` once when it is complete and a row was pending.
 * Returns the cancel — the caller's cleanup when the figure changes.
 */
export function completePoolAfterRender(
  pool: ConfigurationPool,
  onSettled: () => void,
  sched: SliceScheduler = yieldScheduler,
): () => void {
  if (pool.complete()) {
    // Completed during the render itself (a walk that was already paid filled it); rows that showed
    // pending before that walk still owe one re-render.
    if (pool.pendingShown) onSettled();
    return () => {};
  }
  let cancelled = false;
  let handle: unknown;
  const slice = () => {
    if (cancelled) return;
    const done = pool.step();
    if (cancelled) return;
    if (done) {
      if (pool.pendingShown) onSettled();
      return;
    }
    handle = sched.schedule(slice);
  };
  handle = sched.schedule(slice);
  return () => {
    cancelled = true;
    sched.cancel(handle);
  };
}
