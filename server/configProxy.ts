/**
 * Dev-server twin of the prod `GET /api/config` route (A3, #662) — the logProxy pattern: the same
 * `logs/` directory the dev admin dashboard writes its config into is what the builders read, so
 * dev behaves exactly like prod including the degraded path (no config ⇒ 204 ⇒ static roster).
 */
import type { Plugin } from 'vite';
import path from 'node:path';
import { handleConfigRead } from './adminConfig';

export function configProxyPlugin(): Plugin {
  let dir = '';
  return {
    name: 'geo-config',
    configResolved(config) {
      dir = path.resolve(config.root, 'logs');
    },
    configureServer(server) {
      server.middlewares.use('/api/config', (req, res) => {
        void handleConfigRead(req, res, { dir });
      });
    },
  };
}
