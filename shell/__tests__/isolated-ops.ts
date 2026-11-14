/**
 * #2890 ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) Am. 4) — A SECOND MODULE INSTANCE, for a test
 * that needs what a browser has: a worker's heap that shares nothing with the page's.
 *
 * Under node a builder's page code and its worker code are one module instance, so they share every memo, every
 * counter and every object identity, and a test cannot see what crosses a worker boundary. `secondInstance(load)`
 * forgets the module registry and runs `load`, whose dynamic imports then build a FRESH instance of everything they
 * reach: its own caches, its own `shell/workMeter`. The modules the test file imported statically are untouched: they
 * are the page. Hand the loaded operations to `isolatedExecutor` (`shell/workerExecutor`), which clones every
 * message, and a walk runs as a browser runs it.
 *
 * Call it before the walk starts (a `beforeAll`), once per heap. `load` must import everything the heap needs, in one
 * go: an import made later, from another call, would build yet another instance.
 */
import { vi } from 'vitest';

export async function secondInstance<T>(load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return load();
}
