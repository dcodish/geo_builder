/**
 * Production LLM-fallback proxy (Phase 7 / Pillar-5 deploy).
 *
 * A standalone Node `http` server that hosts the SAME shared handler the Vite dev
 * plugin uses (`server/parseHandler.ts`), so dev and prod are byte-identical. The
 * `ANTHROPIC_API_KEY` lives ONLY in this process's environment (a root-only
 * systemd `EnvironmentFile`), never in the client bundle.
 *
 * Bundled to a single self-contained `dist-server/proxy.mjs` by `server/build.mjs`
 * and run behind the web server's reverse proxy:
 *   themathbible.com/geo-builder/api/parse  ->  127.0.0.1:8788
 * It matches any path ENDING in `/api/parse`, so it works whether the reverse
 * proxy strips the `/geo-builder` prefix or forwards it intact.
 *
 * Env:
 *   ANTHROPIC_API_KEY  (required for live parsing; absent -> 503 from the handler)
 *   PORT   (default 8788)
 *   HOST   (default 127.0.0.1 — bind to loopback; only the reverse proxy reaches it)
 *   IP_HASH_SALT   (salt for the hashed visitor id on /api/log; absent -> a RANDOM per-boot salt,
 *                   so visitor ids reset on every restart — set a stable secret for continuity)
 *   EVENTS_LOG_PATH (2-D usage-event JSONL; default ./logs/events.jsonl)
 *   EVENTS_3D_LOG_PATH (3-D usage-event JSONL; default ./logs/events-3d.jsonl)
 *   ADMIN_USERNAME / ADMIN_PASSWORD   (the dashboard login — shared by both /admin and /admin3)
 *   ADMIN_COOKIE_SECRET  (signs the admin session cookie)
 *   ADMIN_BASE   (2-D dashboard base path the browser sees; default /geo-builder/admin)
 *   ADMIN_3D_BASE (3-D dashboard base path; default /3d-builder/admin, proxied to the /admin3 tail)
 *   ADMIN_ANALYTIC_BASE (analytic dashboard base path; default /analytic-builder/admin, proxied to the
 *                 /admin-analytic tail — #1362)
 *   MGMT_USERNAME / MGMT_PASSWORD / MGMT_COOKIE_SECRET  (the management console's OWN login — #2868, ADR-W-209;
 *                 never the shared admin password; any missing ⇒ the console is disabled)
 *   MGMT_GITHUB_TOKEN (fine-grained, this repo only: issues + pull requests read/write, contents write)
 *   MGMT_WRITES  (off | dry | on; default off)   MGMT_REF (branch the ops files are read from; default main)
 *   MGMT_BASE    (default /geo-builder/management)   MGMT_STATE (default beside events.jsonl: management-state.json)
 *
 * A `tool:'3d'` tag in a POST /api/log body routes the event to the 3-D file; the 3-D dashboard is
 * served on the /admin3 path tail (Apache maps /3d-builder/admin -> /admin3, since the prefix is stripped).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { handleParse } from './parseHandler';
import { handleLog, events3LogPath, eventsLogPath } from './eventLog';
import { handleAdmin, PROFILE_3D, PROFILE_ANALYTIC } from './admin';
import { eventsLogPathForId } from './toolRouting';
import { handleConfigRead } from './adminConfig';
// #1374: the share store — a short link with a WhatsApp preview. `/g/<id>` is TOP-LEVEL on
// purpose: the operator asked for `themathbible.com/<something short>`, and a preview crawler
// never follows a builder's own prefix.
import { handleShare, handleSharePage } from './shareStore';
import { serveSafely } from './http';
import { handleManagement } from './ops/handler';
import { makeGh } from './ops/github';

const PORT = Number(process.env.PORT ?? 8788);
const HOST = process.env.HOST ?? '127.0.0.1';
const apiKey = process.env.ANTHROPIC_API_KEY;
// The historical committed fallback — kept ONLY so both secrets below can REFUSE it; never used as a salt.
const DEFAULT_SALT = 'geo-builder-default-salt';
// SEC-7 (issue #57): IPs must never be hashed under a committed constant — with a known salt the 16-hex
// visitor id is brute-forcible back to an IPv4. Unset (or set to the legacy default) ⇒ a random per-boot
// salt: hashes stay non-reversible and the service stays up; visitor identity merely resets on restart
// (the same effect as the documented salt rotation).
const ipSalt =
  process.env.IP_HASH_SALT && process.env.IP_HASH_SALT !== DEFAULT_SALT
    ? process.env.IP_HASH_SALT
    : randomBytes(16).toString('hex');
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || '';
// The admin cookie secret must be its OWN dedicated env — NEVER derived from `ipSalt` or the committed
// default (a forged cookie under a known/guessed secret would bypass login, SEC-3). Unset OR set to the
// committed default ⇒ empty ⇒ the dashboard fails closed (handleAdmin's `secure` gate refuses all auth).
const adminCookieSecret =
  process.env.ADMIN_COOKIE_SECRET && process.env.ADMIN_COOKIE_SECRET !== DEFAULT_SALT ? process.env.ADMIN_COOKIE_SECRET : '';
const adminBase = process.env.ADMIN_BASE || '/geo-builder/admin';
// The 3-D dashboard reuses the SAME admin credentials (one operator, one login) but its own base
// path + cookie scope, and reads the 3-D events file. Apache maps `/3d-builder/admin` → the `/admin3`
// tail here (the prefix is stripped at the proxy, so the two dashboards MUST differ by tail, not prefix).
const admin3Base = process.env.ADMIN_3D_BASE || '/3d-builder/admin';
// #1362 — the analytic dashboard, on its own DISTINCT tail for the same reason as /admin3: Apache strips
// the prefix, and a bare /admin would be the 2-D dashboard serving 2-D data under the analytic prefix.
const adminAnalyticBase = process.env.ADMIN_ANALYTIC_BASE || '/analytic-builder/admin';

// #2868 — the management console. Its own credentials: it WRITES to GitHub, so the dashboards' shared
// password (#2762) is shared with other pages, and this one writes. Username + password (operator, 2026-11-13).
const mgmtWrites = (['on', 'dry'] as const).find((m) => m === process.env.MGMT_WRITES) ?? 'off';
const mgmtGh = process.env.MGMT_GITHUB_TOKEN ? makeGh({ token: process.env.MGMT_GITHUB_TOKEN, repo: 'dcodish/geo_builder' }) : null;
const mgmtCookieSecret =
  process.env.MGMT_COOKIE_SECRET && process.env.MGMT_COOKIE_SECRET !== DEFAULT_SALT && process.env.MGMT_COOKIE_SECRET !== adminCookieSecret
    ? process.env.MGMT_COOKIE_SECRET
    : '';

if (!apiKey) {
  console.error('[geo-proxy] WARNING: ANTHROPIC_API_KEY is not set — /api/parse will return 503.');
}
if (!process.env.IP_HASH_SALT || process.env.IP_HASH_SALT === DEFAULT_SALT) {
  console.error(
    '[geo-proxy] WARNING: IP_HASH_SALT is not set (or is the legacy committed default) — using a random per-boot salt; visitor ids reset on every restart. Set a stable secret salt in the environment.',
  );
}
if (!adminPassword || !adminCookieSecret) {
  console.error(
    '[geo-proxy] WARNING: ADMIN_PASSWORD and/or a dedicated ADMIN_COOKIE_SECRET is not set — the /admin dashboard is DISABLED (fail-closed): no login and no cookie will authenticate.',
  );
}

/**
 * The routes. Every handler is RETURNED, never fired and forgotten, so a failure reaches the request
 * boundary (`serveSafely`) and ends only its own request, never the process that serves all four builders
 * (#2752, ADR-W-192).
 */
async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '').split('?')[0];
  if (path === '/healthz') {
    res.statusCode = 200;
    res.end('ok');
    return;
  }
  if (path.endsWith('/api/parse')) {
    return handleParse(req, res, { apiKey });
  }
  if (path.endsWith('/api/log')) {
    // handleLog routes the event to the 2-D or 3-D file by the request body's `tool` tag.
    return handleLog(req, res, { ipSalt });
  }
  // The SHARE page, checked before the api tails: it is the one route that is NOT under a builder
  // prefix, because the link a teacher sends has to be short (#1374).
  if (path.startsWith('/g/')) {
    return handleSharePage(req, res);
  }
  if (path.endsWith('/api/share')) {
    return handleShare(req, res);
  }
  if (path.endsWith('/api/config')) {
    // A3 (#662): the PUBLIC curation read — unauthenticated by design; 204 = "use your static
    // roster" (the degraded path). Config lives beside the events files.
    return handleConfigRead(req, res, { dir: dirname(eventsLogPath()) });
  }
  // #2868: the management console, before every `/admin` tail (its own path, its own login).
  if (path.includes('/management')) {
    return handleManagement(req, res, {
      username: process.env.MGMT_USERNAME || adminUsername,
      password: process.env.MGMT_PASSWORD || '',
      cookieSecret: mgmtCookieSecret,
      base: process.env.MGMT_BASE || '/geo-builder/management',
      gh: mgmtGh,
      writes: mgmtWrites,
      ref: process.env.MGMT_REF || 'main',
      eventLogs: { '2d': eventsLogPath(), '3d': events3LogPath(), analytic: eventsLogPathForId('analytic'), complex: eventsLogPathForId('complex') },
      ipSalt,
      stateFile: process.env.MGMT_STATE || `${dirname(eventsLogPath())}/management-state.json`,
    });
  }
  // #1362: the analytic tail, before `/admin` for the same substring reason as `/admin3` below.
  if (path.includes('/admin-analytic')) {
    return handleAdmin(req, res, {
      username: adminUsername,
      password: adminPassword,
      cookieSecret: adminCookieSecret,
      base: adminAnalyticBase,
      logPath: eventsLogPathForId('analytic') ?? undefined,
      profile: PROFILE_ANALYTIC,
    });
  }
  // The 3-D dashboard tail (`/admin3`) MUST be checked before the 2-D `/admin` — `'/admin3'.includes('/admin')`
  // is true, so 2-D would otherwise swallow it.
  if (path.includes('/admin3')) {
    return handleAdmin(req, res, {
      username: adminUsername,
      password: adminPassword,
      cookieSecret: adminCookieSecret,
      base: admin3Base,
      logPath: events3LogPath(),
      profile: PROFILE_3D,
    });
  }
  if (path.includes('/admin')) {
    return handleAdmin(req, res, {
      username: adminUsername,
      password: adminPassword,
      cookieSecret: adminCookieSecret,
      base: adminBase,
    });
  }
  res.statusCode = 404;
  res.end('not found');
}

const server = createServer(serveSafely(dispatch));

// The last net (#2752, ADR-W-192): a rejection nothing awaited is logged and the process keeps serving.
process.on('unhandledRejection', (reason) => {
  console.error('[geo-proxy] unhandled rejection (kept running):', reason instanceof Error ? (reason.stack ?? reason.message) : reason);
});

server.listen(PORT, HOST, () => {
  console.log(`[geo-proxy] listening on http://${HOST}:${PORT} (POST /api/parse, GET /healthz)`);
});
