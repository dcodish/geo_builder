/**
 * WHICH PRODUCTS `/log-triage` READS — derived from the registry, never written out (#1362).
 *
 * `triage.mjs` used to carry five two-way branches — `app === '2d' ? … : …` for the app list, the
 * remote and local filenames, the classifier, the session replay and the report title — each with a
 * 2-D else-arm. That is the exact shape #1243 fixed in the server's event ROUTER (`server/toolRouting.ts`),
 * reappearing in the tool that consumes what the router writes: a third product's events would either
 * be ignored or read through 2-D's rules. So the list comes from the same place the router's does.
 *
 * **A product with no triage adapter is REPORTED, not skipped.** "No rows" and "no data" were
 * indistinguishable in the old output — that is how analytic sat unread — so a registered product this
 * script cannot triage yet (complex: it posts no usage events at all) gets its own line saying so.
 *
 * Pure and importable, so a lock can hold it; `triage.mjs` itself runs on import and is never imported
 * by the suite.
 */
import { PRODUCT_IDS, eventsFileName } from '../../../server/toolRouting';

/** The products `triage.mjs` has an adapter for (classifier + session replay + report title). */
export const TRIAGE_ADAPTED: readonly string[] = ['2d', '3d', 'analytic'];

export interface TriagePlan {
  /** Products to fetch, classify and replay, in registry order. */
  readonly apps: string[];
  /** Registered products that cannot be triaged yet — each reported as such, never silently absent. */
  readonly silent: string[];
}

/**
 * `--app` → the plan. `all` (the default) is every registered product; `both` is kept as the legacy
 * spelling of 2-D + 3-D so an old command line still means what it meant. A single id must be
 * REGISTERED — an unknown one throws rather than falling back to anything.
 */
export function triagePlan(arg: string): TriagePlan {
  if (arg === 'both') return { apps: ['2d', '3d'], silent: [] };
  const wanted = arg === 'all' ? PRODUCT_IDS : [arg];
  for (const id of wanted) {
    if (!PRODUCT_IDS.includes(id)) throw new Error(`--app ${id}: not a registered product (${PRODUCT_IDS.join(', ')}, all, both)`);
  }
  return {
    apps: wanted.filter((id) => TRIAGE_ADAPTED.includes(id)),
    silent: wanted.filter((id) => !TRIAGE_ADAPTED.includes(id)),
  };
}

/** The production events file for a product — the router's own derivation, so the two cannot differ. */
export const remoteEventsFile = (id: string): string => eventsFileName(id);

/** The local cache file (`logs/`, gitignored) the fetch writes and the report reads. */
export const localEventsFile = (id: string): string => `prod-events-${id}.jsonl`;
