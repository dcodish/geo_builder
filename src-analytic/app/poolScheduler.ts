/**
 * THE POOL COMPLETES AFTER THE RENDER (#1473, ADR-AG-180 — operator ruling 2026-09-29, option B′).
 *
 * Operator: *"we cannot afford 0.5 s addition"* — and then: the figure draws immediately; while the
 * 24-configuration pool finishes, panel and ask values show «בודק…», never a provisional number.
 *
 * The render path does exactly the synchronous work it did before #1473 (the pool's floor is the distinct
 * walk it always paid); this loop spends the rest in idle slices of ONE seed each (a seed is one
 * drawable walk, 7–101 ms measured on the heaviest corpus line), and asks for a re-render when the pool
 * completes — only if some row actually showed pending, so a figure whose pool was already complete
 * costs nothing.
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

type IdleWindow = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (h: number) => void;
};

/** `requestIdleCallback` where the browser has it (with a timeout, so a busy page still progresses), else a macrotask. */
export const idleScheduler: SliceScheduler = {
  schedule(run) {
    const w = (typeof window !== 'undefined' ? window : undefined) as IdleWindow | undefined;
    if (w?.requestIdleCallback) return { idle: w.requestIdleCallback(run, { timeout: 200 }) };
    return { timer: setTimeout(run, 0) };
  },
  cancel(handle) {
    const h = handle as { idle?: number; timer?: ReturnType<typeof setTimeout> } | undefined;
    if (!h) return;
    const w = (typeof window !== 'undefined' ? window : undefined) as IdleWindow | undefined;
    if (h.idle !== undefined) w?.cancelIdleCallback?.(h.idle);
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
  sched: SliceScheduler = idleScheduler,
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
