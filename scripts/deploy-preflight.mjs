/**
 * DEPLOY PREFLIGHT — what is actually stale on the server, measured (#1130).
 *
 * The RUNBOOK used to decide the proxy step with a QUESTION: *"did `server/` change?"* That rule is
 * not merely fragile, it is **unsound**, and this script exists because it shipped stale server code
 * twice. The proxy bundle's inputs are far wider than `server/`:
 *
 * ```
 * 26 first-party modules go into dist-server/proxy.mjs
 * 20 of them live OUTSIDE server/ — src/parser/catalog.ts, src3d/parser/catalog3.ts,
 *                                   src-complex/**, src-analytic/** …
 * ```
 *
 * So editing the 2-D catalog changes the proxy, and the old rule answered "no". The failure mode is
 * invisible by construction: the stale artifact keeps working, so nothing surfaces until someone
 * diffs it by hand. A convention that depends on remembering is not a check — the same class as the
 * per-product clear-all list #1107 fixed for the fourth time.
 *
 * **The question becomes a measurement:** does the BUILT artifact differ from the LIVE one? Nothing is
 * inferred from which files a commit touched.
 *
 *   node scripts/deploy-preflight.mjs            # measure against production
 *   node scripts/deploy-preflight.mjs --offline  # build + hash locally, skip the remote reads
 *
 * Exit code is **1 when anything DIFFERS** — not because differing is an error (before a deploy it is
 * the normal state) but so the verdict cannot be skimmed past on the way to the scp commands. The
 * lesson this encodes: evidence produced is not evidence read.
 *
 * **Routes too (#1279, ADR-W-103).** Every `ProxyPass` line in the enabled products' `deploy/apache-*.conf`
 * is probed live (a bodiless GET the proxy answers before any model call — see `preflight-routes.mjs`).
 * A route answering Apache's 404 is BROKEN and fails the run: on 2026-09-20 every hash here was green
 * while `/analytic-builder/api/parse` 404'd, because the conf was never pasted into Plesk.
 *
 * It reads. It never writes to the server, never restarts anything, and never deploys.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, isStale, newestSource, preflightVerdict } from './preflight-targets.mjs';
import { routeRows } from './preflight-routes.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.GEO_DEPLOY_HOST ?? 'root@themathbible.com';
const PROXY_LIVE = '/var/www/geo-proxy/proxy.mjs';

const offline = process.argv.includes('--offline');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Read a file from the server. `null` when it is not there or the host cannot be reached. */
function remote(cmd) {
  if (offline) return null;
  try {
    return execFileSync('ssh', [HOST, cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/**
 * The asset a page actually loads — Vite content-hashes the filename, so the NAME is the content.
 *
 * Comparing the referenced bundle is therefore a real content comparison and needs no file hashing,
 * and it works identically on the local build and on the served page.
 */
function bundleOf(html) {
  const m = html?.match(/src="[^"]*\/(assets\/[^"]+\.js)"/) ?? html?.match(/(assets\/[^"'\s]+\.js)/);
  return m ? m[1] : null;
}

const rows = [];
const add = (what, local, live) => {
  const status = local === null ? 'NOT BUILT' : live === null ? 'UNKNOWN' : local === live ? 'MATCHES live' : 'DIFFERS — push required';
  rows.push({ what, status, local, live });
};

// --- the proxy: always rebuilt, because the build is milliseconds and the rule it replaces was wrong
let proxyLocal = null;
try {
  execFileSync(process.execPath, [resolve(root, 'server', 'build.mjs')], { cwd: root, stdio: 'ignore' });
  const out = resolve(root, 'dist-server', 'proxy.mjs');
  if (existsSync(out)) proxyLocal = sha256(readFileSync(out));
} catch {
  proxyLocal = null;
}
const proxyLiveOut = remote(`sha256sum ${PROXY_LIVE}`);
add('proxy (dist-server/proxy.mjs)', proxyLocal, proxyLiveOut ? proxyLiveOut.split(/\s+/)[0] : null);

// --- the static bundles, one row per product. The staleness rule and the targets live in
// `preflight-targets.mjs` so they can be tested without running this script (#1213).
for (const p of PRODUCTS) {
  const localPath = resolve(root, p.dist, p.page);
  const built = existsSync(localPath) ? statSync(localPath).mtimeMs : 0;
  const what = `${p.name} bundle (${p.dist})`;
  if (isStale(built, newestSource(root, p.src))) {
    rows.push({ what, status: 'STALE BUILD — rebuild before trusting this', local: null, live: null });
    continue;
  }
  const localHtml = built ? readFileSync(localPath, 'utf8') : null;
  add(what, localHtml ? bundleOf(localHtml) : null, bundleOf(remote(`cat ${p.live}`)));
}

/**
 * THE EVENTS SINKS (#1363) — the wiring half the artifact hashes cannot see.
 *
 * Analytic answered 204 in prod while writing NOTHING: the env var was never created, the cwd
 * fallback targeted `/logs`, and the write failure is (rightly) swallowed. Every artifact row was
 * green throughout — a probe of the SINK is the only measurement that catches the class (#903's
 * shape: a product's wiring is a deploy step, and nothing checked it). One probe event per enabled
 * product, posted to its live endpoint, then read back from the server's own files by its sid.
 */
if (!offline) {
  const registry = JSON.parse(readFileSync(resolve(root, 'products.json'), 'utf8'));
  // sid is stored TRUNCATED to 16 chars (eventLog normalise) — keep the probe well under it.
  const probeSid = `pf${Date.now().toString(36)}`;
  const sinks = [];
  for (const p of registry.products.filter((q) => q.enabled)) {
    const url = `https://themathbible.com${p.url}api/log`;
    const body = JSON.stringify({ tool: p.id === '2d' ? undefined : p.id, ev: 'session', sid: probeSid });
    let code = 'ERR';
    try {
      code = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'POST', '-H', 'content-type: application/json', '-d', body, url], { encoding: 'utf8' }).trim();
    } catch { /* unreachable endpoint reads as ERR below */ }
    sinks.push({ id: p.id, code });
  }
  // One server-side read for all probes: which event files carry the sid.
  const landed = remote(`grep -l ${probeSid} /var/www/geo-proxy/events*.jsonl 2>/dev/null`) ?? '';
  for (const s of sinks) {
    const ok = s.code === '204' && landed.length > 0 && (s.id === '2d' ? landed.includes('events.jsonl') : landed.includes(`events-${s.id}`));
    rows.push({
      what: `events sink (${s.id})`,
      status: ok ? 'MATCHES live' : `SINK UNREACHABLE — POST ${s.code}, ${landed ? `landed in: ${landed.split('\n').join(', ')}` : 'nothing written'}`,
      local: null,
      live: null,
    });
  }
}

/** THE ROUTES (#1279) — read from the tracked confs, probed live. Offline has nothing to probe. */
if (!offline) {
  const origin = process.env.GEO_DEPLOY_ORIGIN ?? 'https://themathbible.com';
  for (const r of await routeRows({ root, origin })) rows.push({ ...r, local: null, live: null });
}

const width = Math.max(...rows.map((r) => r.what.length));
console.log(offline ? '\nDEPLOY PREFLIGHT (offline — local artifacts only)\n' : '\nDEPLOY PREFLIGHT\n');
for (const r of rows) {
  console.log(`  ${r.what.padEnd(width)}  ${r.status}`);
  if (r.status.startsWith('DIFFERS')) console.log(`  ${' '.repeat(width)}    local ${r.local}\n  ${' '.repeat(width)}    live  ${r.live}`);
}

// The verdict is a pure function of the rows (`preflightVerdict`), so a lock can call the exact
// decision that sets this exit code (#1279) instead of re-stating it.
const verdict = preflightVerdict(rows, HOST);
for (const line of verdict.lines) console.log(line);
process.exit(verdict.code);
