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

/**
 * WHICH FILE EACH TOOL'S TRACE LANDS IN — a registry, not a branch (#1300).
 *
 * This was `obj.tool === '3d' ? debug-log-3d.jsonl : debug-log.jsonl`, which is the shape
 * [ADR-W-003](../docs/06w-decisions-workspace.md) names: *"branching on product identity inside a shared
 * module is a fork wearing a shared file's name"*. It was right for two products and wrong the moment a
 * third arrived — but the reason it had to change rather than grow a third arm is the ELSE, not the style:
 *
 * **2-D was the fallback, so an unrecognised tool's events were appended to `debug-log.jsonl`** — the file
 * `src/__tests__/scenarios-corpus-*.ts`, `src/theorems/audit.ts` and the log-triage skill all read as
 * genuine 2-D user data. A new product posting a tool name this file did not know would have quietly
 * poisoned the 2-D corpus with sentences from a different grammar, and nothing would have reported it.
 *
 * So an unknown tool is now REJECTED (400) and written nowhere. Logging is best-effort on the client, so a
 * rejection costs a dropped line and never an app failure — cheap, next to a corpus nobody can trust.
 *
 * `complex` is here although that tree has no client yet: the entry costs one line, and its absence is
 * exactly what would make the fifth product repeat this.
 */
const TOOL_LOGS: Record<string, string> = {
  '2d': 'debug-log.jsonl',
  '3d': 'debug-log-3d.jsonl',
  analytic: 'debug-log-analytic.jsonl',
  complex: 'debug-log-complex.jsonl',
};

/**
 * The file for one event's `tool` tag, or `null` when the tag is unknown.
 *
 * ABSENT means 2-D, and that is a deliberate back-compat case rather than a default: `src/debug/sessionLog.ts`
 * has never tagged its events and does not need to start. Every tool added since tags itself.
 *
 * Exported so its lock CALLS it (ADR-W-053) — a test that re-implemented this mapping would agree with the
 * very `else` this fix removed.
 */
export function logFileFor(tool: unknown): string | null {
  if (tool === undefined || tool === null) return TOOL_LOGS['2d'];
  return typeof tool === 'string' ? (TOOL_LOGS[tool] ?? null) : null;
}

export function logProxyPlugin(): Plugin {
  let logDir = '';
  return {
    name: 'geo-debug-log',
    configResolved(config) {
      logDir = path.resolve(config.root, 'logs');
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
          // Each tool tags its events and gets its OWN file, so traces never mix. An unknown tag is
          // refused rather than defaulted — see TOOL_LOGS.
          const file = logFileFor(obj.tool);
          if (!file) return end(400);
          const line = JSON.stringify({ serverTs: new Date().toISOString(), ...obj }) + '\n';
          await mkdir(logDir, { recursive: true });
          await appendFile(path.join(logDir, file), line, 'utf8');
          return end(204);
        } catch {
          return end(400);
        }
      });
    },
  };
}
