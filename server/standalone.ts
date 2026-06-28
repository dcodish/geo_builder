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
 *   EVENTS_LOG_PATH (usage-event JSONL; default ./logs/events.jsonl)
 *   ADMIN_USERNAME / ADMIN_PASSWORD   (the /admin dashboard login)
 *   ADMIN_COOKIE_SECRET  (signs the admin session cookie)
 *   ADMIN_BASE   (public base path the browser sees; default /geo-builder/admin)
 */

import { createServer } from 'node:http';
import { handleParse } from './parseHandler';
import { handleLog } from './eventLog';
import { handleAdmin } from './admin';

const PORT = Number(process.env.PORT ?? 8788);
const HOST = process.env.HOST ?? '127.0.0.1';
const apiKey = process.env.ANTHROPIC_API_KEY;
const ipSalt = process.env.IP_HASH_SALT || 'geo-builder-default-salt';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const adminCookieSecret = process.env.ADMIN_COOKIE_SECRET || ipSalt;
const adminBase = process.env.ADMIN_BASE || '/geo-builder/admin';

if (!apiKey) {
  console.error('[geo-proxy] WARNING: ANTHROPIC_API_KEY is not set — /api/parse will return 503.');
}
if (!adminPassword) {
  console.error('[geo-proxy] WARNING: ADMIN_PASSWORD is not set — the /admin dashboard is effectively locked.');
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
    void handleLog(req, res, { ipSalt });
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
