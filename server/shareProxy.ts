/**
 * The share store's DEV host (#1374) — the sibling of `llmProxy`/`logProxy`.
 *
 * Mounts the same handlers the production server mounts (`server/shareStore.ts`), so a share made
 * on the dev server behaves exactly as one made in production. Without this the feature would be
 * untestable until deploy, which is the shape of defect this session already paid for once
 * (#1373 was found in prod because the dev path differed).
 *
 * In dev every builder is served from `/`, so `/g/<id>` sits at the root here too — the same place
 * Apache maps it in production.
 */

import type { Plugin } from 'vite';
import { handleShare, handleSharePage } from './shareStore';
import { serveSafely } from './http';

export function shareProxyPlugin(): Plugin {
  return {
    name: 'geo-share-proxy',
    configureServer(server) {
      // Both inside the one request boundary (#2752, ADR-W-192).
      const logError = (m: string) => server.config.logger.error(m);
      server.middlewares.use(
        '/api/share',
        serveSafely((req, res) => handleShare(req, res), logError),
      );
      server.middlewares.use(
        '/g/',
        serveSafely((req, res) => {
          // Vite strips the mount prefix from `req.url`; the handler reads the id from the tail, so
          // hand it the original path.
          const original = (req as { originalUrl?: string }).originalUrl ?? req.url ?? '';
          return handleSharePage({ ...req, url: original } as typeof req, res, {
            origin: `http://localhost:${server.config.server.port ?? 5173}`,
            // In dev every builder is served from one server at its devUrl (`/`, `/3d.html`, …),
            // not at its production path — the same distinction that bit the share link in #1372.
            dev: true,
          });
        }, logError),
      );
    },
  };
}
