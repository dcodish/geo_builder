/**
 * Debug log sink (dev only) — the server side that can write a local file.
 *
 * Mounted into the Vite dev server as `POST /api/log`. The browser can't write to
 * disk, so the client fire-and-forgets each event here and this appends it as one
 * JSON line to `logs/debug-log.jsonl` (under the project root). It lets a session
 * be reconstructed later: every utterance the student enters (incl. ones that
 * failed to parse) and a snapshot of the resulting fact list + per-fact status.
 *
 * Dev-only and best-effort: it never blocks the app, holds no secrets, and the
 * file is gitignored. Not mounted in a production build (it's a dev plugin).
 */

import { type Plugin } from 'vite';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const MAX_BODY = 512_000; // a snapshot of a large figure can be sizeable; cap to be safe

export function logProxyPlugin(): Plugin {
  let logPath = '';
  let logDir = '';
  return {
    name: 'geo-debug-log',
    configResolved(config) {
      logDir = path.resolve(config.root, 'logs');
      logPath = path.join(logDir, 'debug-log.jsonl');
    },
    configureServer(server) {
      server.middlewares.use('/api/log', async (req, res) => {
        const end = (code: number) => {
          res.statusCode = code;
          res.end();
        };
        if (req.method !== 'POST') return end(405);

        let body = '';
        let size = 0;
        for await (const chunk of req) {
          size += (chunk as Buffer).length;
          if (size > MAX_BODY) return end(413);
          body += chunk;
        }
        try {
          const obj = JSON.parse(body) as Record<string, unknown>; // validate it's JSON
          const line = JSON.stringify({ serverTs: new Date().toISOString(), ...obj }) + '\n';
          await mkdir(logDir, { recursive: true });
          await appendFile(logPath, line, 'utf8');
          return end(204);
        } catch {
          return end(400);
        }
      });
    },
  };
}
