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
 */

import { createServer } from 'node:http';
import { handleParse } from './parseHandler';

const PORT = Number(process.env.PORT ?? 8788);
const HOST = process.env.HOST ?? '127.0.0.1';
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.error('[geo-proxy] WARNING: ANTHROPIC_API_KEY is not set — /api/parse will return 503.');
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
  res.statusCode = 404;
  res.end('not found');
});

server.listen(PORT, HOST, () => {
  console.log(`[geo-proxy] listening on http://${HOST}:${PORT} (POST /api/parse, GET /healthz)`);
});
