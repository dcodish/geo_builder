/**
 * WHICH FILE AN EVENT BELONGS IN — one lookup, derived from the product registry (#1243).
 *
 * ## The defect
 *
 * `eventLog.ts` routed production usage events with a boolean:
 *
 * ```ts
 * const is3d = payload?.tool === '3d';
 * const file = is3d ? events3LogPath() : eventsLogPath();   // everything else -> 2-D
 * ```
 *
 * Two products, one branch, and **the else-arm was 2-D**. So the moment a third product posted an
 * event it would land in 2-D's file and corrupt 2-D's numbers rather than appearing as its own —
 * silently, because a wrong destination looks exactly like a right one from the client side.
 *
 * The class (docs/17): *a capability parameterised for two products and then hard-branched, so
 * product three inherits the default arm instead of failing loudly.* The shared server's contract is
 * `tool:`-parameterised by design (CLAUDE.md: *"parameterized by `tool:` — never forked per
 * product"*), and this is where the parameterisation was written as a boolean.
 *
 * ## The precedent was already in the repo
 *
 * `server/logProxy.ts` — the DEV debug trace, one file over — hit this exact defect and fixed it
 * properly: a lookup, an unknown tag rejected rather than defaulted, and an absent tag meaning 2-D.
 * Its docblock says so. The production sink simply never got the same treatment. This module is that
 * fix, plus the one thing `logProxy` still lacks: the table is **derived from `products.json`** rather
 * than written out by hand, so adding builder N+1 cannot leave a stale literal behind.
 *
 * ## The two conventions that must not change
 *
 * - **An ABSENT tag is 2-D.** The 2-D client has never tagged its events and does not need to start;
 *   every tool added since tags itself. Same rule as `logProxy` and as `parseHandler`.
 * - **2-D's filenames have no suffix.** `events.jsonl` / `EVENTS_LOG_PATH`, not `events-2d.jsonl`.
 *   Those files exist in production with real data in them.
 */
import path from 'node:path';
import registry from '../products.json';

/** Every registered product id, in registry order. The one source; nothing here restates it. */
export const PRODUCT_IDS: string[] = (registry.products as { id?: string }[])
  .filter((p): p is { id: string } => typeof p.id === 'string')
  .map((p) => p.id);

/** The tag an untagged event is treated as — 2-D, which predates the tag. */
export const DEFAULT_TOOL = '2d';

/**
 * The events filename for a product id. 2-D keeps its historical unsuffixed name; everything else is
 * `events-<id>.jsonl`, which is what 3-D already uses (`events-3d.jsonl`) — so this derivation
 * reproduces the two live filenames exactly rather than renaming production data.
 */
export function eventsFileName(id: string): string {
  return id === DEFAULT_TOOL ? 'events.jsonl' : `events-${id}.jsonl`;
}

/**
 * The environment variable that overrides a product's events path.
 *
 * 2-D is `EVENTS_LOG_PATH` and 3-D is `EVENTS_3D_LOG_PATH` — both already set in deployed
 * environments, so the derivation must yield those exact names and not `EVENTS_2D_LOG_PATH`.
 */
export function eventsEnvVar(id: string): string {
  return id === DEFAULT_TOOL ? 'EVENTS_LOG_PATH' : `EVENTS_${id.toUpperCase()}_LOG_PATH`;
}

/**
 * The absolute events-log path for one product id, or `null` when the id is not registered.
 *
 * `null` is the whole point: the caller must REFUSE an unknown tag rather than fall back to a file
 * that belongs to someone else. A registered product can never be null — the totality lock asserts it.
 */
export function eventsLogPathForId(id: string): string | null {
  if (!PRODUCT_IDS.includes(id)) return null;
  return process.env[eventsEnvVar(id)] || path.resolve(process.cwd(), 'logs', eventsFileName(id));
}

/**
 * Resolve the file for one event's `tool` tag.
 *
 * - absent/null → 2-D (the historical convention)
 * - a registered id → that product's file
 * - anything else → `null`, and the caller answers 400
 */
export function eventsLogPathForTool(tool: unknown): string | null {
  if (tool === undefined || tool === null) return eventsLogPathForId(DEFAULT_TOOL);
  return typeof tool === 'string' ? eventsLogPathForId(tool) : null;
}
