/**
 * LLM-fallback proxy (Phase 7) — the DEV host of the shared handler.
 *
 * Mounts the shared `handleParse` (`server/parseHandler.ts`) into the Vite dev
 * server as `POST /api/parse`. The browser never sees the key (it lives in
 * `ANTHROPIC_API_KEY` on this Node process); the client only talks to this proxy.
 * The same handler runs in production via `server/standalone.ts`, so dev and prod
 * behave identically.
 */

import type { IncomingHttpHeaders } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { handleParse } from './parseHandler';

/**
 * #1955 (ADR-W-127) — is this request from a HEADLESS browser? CLAUDE.md rule 2: only the operator
 * authorises a live model call, and a headless browser has no operator at it — it is a script (a
 * pre-play, the visual smoke, a session's ad-hoc probe). Chromium's headless shell names itself in
 * the User-Agent and in the `sec-ch-ua` brand list ("HeadlessChrome"); the operator's own browser
 * never does. The scripts' contract is the stub in `scripts/lib/browser-harness.mjs`; this is the
 * backstop for a probe that bypasses it (the 2026-10-09 incident was such a probe).
 */
export function isHeadlessCaller(headers: IncomingHttpHeaders): boolean {
  const ua = String(headers['user-agent'] ?? '');
  const brands = String(headers['sec-ch-ua'] ?? '');
  return /HeadlessChrome/i.test(ua) || /HeadlessChrome/i.test(brands);
}

export function llmProxyPlugin(): Plugin {
  // Resolved from `.env`/`.env.local` (or the shell) at config time. `loadEnv`
  // with an empty prefix reads non-VITE vars for server use only — they are NOT
  // exposed to the client bundle.
  let apiKey: string | undefined;
  return {
    name: 'geo-llm-proxy',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '');
      apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    },
    configureServer(server) {
      server.middlewares.use('/api/parse', (req, res) => {
        // DEV HOST ONLY (#1955): a headless caller is answered as a keyless server — 503, which every
        // client reads as "the deterministic refusal stands" — before the handler can dispatch.
        // Production (`standalone.ts`) is unchanged: there the caller is a student.
        if (apiKey && isHeadlessCaller(req.headers)) {
          server.config.logger.warn('[geo-llm-proxy] refused a model call from a headless browser (rule 2, ADR-W-127)');
          res.statusCode = 503;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'no-api-key' }));
          return;
        }
        return handleParse(req, res, { apiKey, logError: (m) => server.config.logger.error(m) });
      });
    },
  };
}
