/**
 * LLM-fallback proxy (Phase 7) — the DEV host of the shared handler.
 *
 * Mounts the shared `handleParse` (`server/parseHandler.ts`) into the Vite dev
 * server as `POST /api/parse`. The browser never sees the key (it lives in
 * `ANTHROPIC_API_KEY` on this Node process); the client only talks to this proxy.
 * The same handler runs in production via `server/standalone.ts`, so dev and prod
 * behave identically.
 */

import { loadEnv, type Plugin } from 'vite';
import { handleParse } from './parseHandler';

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
      server.middlewares.use('/api/parse', (req, res) =>
        handleParse(req, res, { apiKey, logError: (m) => server.config.logger.error(m) }),
      );
    },
  };
}
