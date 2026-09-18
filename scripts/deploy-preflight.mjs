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
 * It reads. It never writes to the server, never restarts anything, and never deploys.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, isStale, newestSource } from './preflight-targets.mjs';

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

const width = Math.max(...rows.map((r) => r.what.length));
console.log(offline ? '\nDEPLOY PREFLIGHT (offline — local artifacts only)\n' : '\nDEPLOY PREFLIGHT\n');
for (const r of rows) {
  console.log(`  ${r.what.padEnd(width)}  ${r.status}`);
  if (r.status.startsWith('DIFFERS')) console.log(`  ${' '.repeat(width)}    local ${r.local}\n  ${' '.repeat(width)}    live  ${r.live}`);
}

const differs = rows.filter((r) => r.status.startsWith('DIFFERS'));
const unbuilt = rows.filter((r) => r.status === 'NOT BUILT');
const unknown = rows.filter((r) => r.status === 'UNKNOWN');
const stale = rows.filter((r) => r.status.startsWith('STALE'));
console.log('');
if (unbuilt.length) console.log(`  ${unbuilt.length} artifact(s) NOT BUILT — build them before reading this verdict.`);
if (stale.length) console.log(`  ${stale.length} artifact(s) built BEFORE their own source changed — they cannot be compared. Build, then re-run.`);
if (unknown.length) console.log(`  ${unknown.length} artifact(s) could not be read from ${HOST} — verdict incomplete.`);
if (differs.length) {
  console.log(`  ${differs.length} artifact(s) DIFFER from live. Push exactly these; leave the rest alone.\n`);
  process.exit(1);
}
if (unbuilt.length || unknown.length || stale.length) {
  console.log('  Nothing measured as stale, but the measurement is incomplete — do not read this as "all current".\n');
  process.exit(1);
}
console.log('  Everything live matches what this tree builds. Nothing to push.\n');
