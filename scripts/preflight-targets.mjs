/**
 * WHAT THE DEPLOY PREFLIGHT COMPARES, AND WHETHER IT MAY BE TRUSTED (#1130, #1213).
 *
 * Split out of `deploy-preflight.mjs` so these two decisions can be TESTED: importing that script runs
 * the whole preflight, including the ssh reads, which is not something a test may do.
 *
 * ## The staleness rule, and why it exists
 *
 * The proxy is rebuilt on every preflight run (~30 ms), so its comparison is always against current
 * source. The four static bundles are not — the script reads each `dist` directory as it finds it. A
 * `dist` left from an earlier build matches the live one because BOTH are stale, and the verdict then
 * reads `MATCHES` for artifacts that do not match.
 *
 * Measured the day this was found: `dist/index.html` was a day older than `src/app/roleReadings.ts`,
 * the preflight reported MATCHES for all four products while `main` carried an undeployed round, and
 * rebuilding 2-D changed its bundle hash immediately.
 *
 * That is precisely the class ADR-W-058 was written about, reintroduced inside its own tool: **a check
 * whose answer depends on someone having remembered to do something first is not a check.**
 *
 * So a bundle older than any source it is built from is reported STALE and never MATCHES. Staleness
 * rather than an unconditional rebuild: four builds are real time on a script that should stay cheap to
 * run, the RUNBOOK's step 0 already builds, and a guard on the FORGOTTEN build is what was missing.
 */
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const DOCROOT = '/var/www/vhosts/themathbible.com/httpdocs';

/**
 * Each product: where its build lands, what the served page is called, where it lives on prod, and
 * **which trees it is built from** — `shell/` is in every one of them, which is why a change there
 * makes all four stale at once.
 */
export const PRODUCTS = [
  { name: '2-D', dist: 'dist', page: 'index.html', live: `${DOCROOT}/geo-builder/index.html`, src: ['src', 'shell'] },
  { name: '3-D', dist: 'dist-3d', page: '3d.html', live: `${DOCROOT}/3d-builder/index.html`, src: ['src3d', 'shell'] },
  { name: 'complex', dist: 'dist-complex', page: 'complex.html', live: `${DOCROOT}/complex-builder/index.html`, src: ['src-complex', 'shell'] },
  { name: 'analytic', dist: 'dist-analytic', page: 'analytic.html', live: `${DOCROOT}/analytic-builder/index.html`, src: ['src-analytic', 'shell'] },
];

/** Skipped when walking for sources: not shipped, or not an input to the bundle. */
const SKIP_DIR = /^(node_modules|__tests__|dist|dist-.*|coverage|reports)$/;
const IS_SOURCE = /\.(?:tsx?|css|html|json)$/;
const IS_TEST = /\.test\.tsx?$/;

/** The newest modification time among the sources of `dirs`, or 0 when there are none. */
export function newestSource(root, dirs) {
  let newest = 0;
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // a tree that does not exist is not a source of staleness
    }
    for (const e of entries) {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIR.test(e.name)) walk(full);
      } else if (IS_SOURCE.test(e.name) && !IS_TEST.test(e.name)) {
        try {
          newest = Math.max(newest, statSync(full).mtimeMs);
        } catch {
          /* raced with a write; the next run sees it */
        }
      }
    }
  };
  for (const d of dirs) walk(resolve(root, d));
  return newest;
}

/**
 * Was this bundle built BEFORE the source it is built from last changed?
 *
 * `builtMs === 0` means NOT BUILT, which is a different verdict the caller already reports — a missing
 * artifact is not a stale one, and conflating them would tell the operator to rebuild something that
 * has never been built at all.
 */
export function isStale(builtMs, newestSourceMs) {
  return builtMs > 0 && newestSourceMs > builtMs;
}
