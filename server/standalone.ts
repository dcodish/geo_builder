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
 *   IP_HASH_SALT   (salt for the hashed visitor id on /api/log; absent -> a default)
 *   EVENTS_LOG_PATH (2-D usage-event JSONL; default ./logs/events.jsonl)
 *   EVENTS_3D_LOG_PATH (3-D usage-event JSONL; default ./logs/events-3d.jsonl)
 *   ADMIN_USERNAME / ADMIN_PASSWORD   (the dashboard login — shared by both /admin and /admin3)
 *   ADMIN_COOKIE_SECRET  (signs the admin session cookie)
 *   ADMIN_BASE   (2-D dashboard base path the browser sees; default /geo-builder/admin)
 *   ADMIN_3D_BASE (3-D dashboard base path; default /3d-builder/admin, proxied to the /admin3 tail)
 *
 * A `tool:'3d'` tag in a POST /api/log body routes the event to the 3-D file; the 3-D dashboard is
 * served on the /admin3 path tail (Apache maps /3d-builder/admin -> /admin3, since the prefix is stripped).
 */

import { createServer } from 'node:http';
import { handleParse } from './parseHandler';
import { handleLog, events3LogPath } from './eventLog';
import { handleAdmin, PROFILE_3D } from './admin';

const PORT = Number(process.env.PORT ?? 8788);
const HOST = process.env.HOST ?? '127.0.0.1';
const apiKey = process.env.ANTHROPIC_API_KEY;
const DEFAULT_SALT = 'geo-builder-default-salt';
const ipSalt = process.env.IP_HASH_SALT || DEFAULT_SALT;
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

if (!apiKey) {
  console.error('[geo-proxy] WARNING: ANTHROPIC_API_KEY is not set — /api/parse will return 503.');
}
if (!adminPassword || !adminCookieSecret) {
  console.error(
    '[geo-proxy] WARNING: ADMIN_PASSWORD and/or a dedicated ADMIN_COOKIE_SECRET is not set — the /admin dashboard is DISABLED (fail-closed): no login and no cookie will authenticate.',
  );
}

const server = createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0];
  if (path === '/healthz') {
    res.statusCode = 200;
    res.end('ok');
    return;
  }
  if (path.endsWith('/api/parse')) {
    void handleParse(req, res, { apiKey });
    return;
  }
  if (path.endsWith('/api/log')) {
    // handleLog routes the event to the 2-D or 3-D file by the request body's `tool` tag.
    void handleLog(req, res, { ipSalt });
    return;
  }
  // The 3-D dashboard tail (`/admin3`) MUST be checked before the 2-D `/admin` — `'/admin3'.includes('/admin')`
  // is true, so 2-D would otherwise swallow it.
  if (path.includes('/admin3')) {
    void handleAdmin(req, res, {
      username: adminUsername,
      password: adminPassword,
      cookieSecret: adminCookieSecret,
      base: admin3Base,
      logPath: events3LogPath(),
      profile: PROFILE_3D,
    });
    return;
  }
  if (path.includes('/admin')) {
    void handleAdmin(req, res, {
      username: adminUsername,
      password: adminPassword,
      cookieSecret: adminCookieSecret,
      base: adminBase,
    });
    return;
  }
  res.statusCode = 404;
  res.end('not found');
});

server.listen(PORT, HOST, () => {
  console.log(`[geo-proxy] listening on http://${HOST}:${PORT} (POST /api/parse, GET /healthz)`);
});
