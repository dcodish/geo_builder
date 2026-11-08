/**
 * Dev-server twin of the prod `GET /api/config` route (A3, #662) — the logProxy pattern: the same
 * `logs/` directory the dev admin dashboard writes its config into is what the builders read, so
 * dev behaves exactly like prod including the degraded path (no config ⇒ 204 ⇒ static roster).
 */
import type { Plugin } from 'vite';
import path from 'node:path';
import { handleConfigRead } from './adminConfig';
import { serveSafely } from './http';

export function configProxyPlugin(): Plugin {
  let dir = '';
  return {
    name: 'geo-config',
    configResolved(config) {
      dir = path.resolve(config.root, 'logs');
    },
    configureServer(server) {
      // Inside the one request boundary (#2752, ADR-W-192).
      server.middlewares.use(
        '/api/config',
        serveSafely(
          (req, res) => handleConfigRead(req, res, { dir }),
          (m) => server.config.logger.error(m),
        ),
      );
    },
  };
}
