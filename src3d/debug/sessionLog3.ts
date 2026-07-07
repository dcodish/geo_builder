/**
 * 3-D session logger (dev only). The COPIED sibling of `src/debug/sessionLog.ts`
 * (docs/20 §12: src3d never imports src/): fire-and-forgets each event to the
 * shared Vite dev plugin at `/api/log` with `tool: '3d'`, which routes it to its
 * OWN file — `logs/debug-log-3d.jsonl` — so 2-D and 3-D traces never mix.
 *
 * Production is a no-op for now: the prod analytics sink listens only at
 * `/geo-builder/api/log` (no `/3d-builder/api/log` route exists yet) — a lean
 * 3-D usage feed is a separate, deliberate step, not a silent side effect.
 *
 * Best-effort everywhere: never throws, never blocks the app.
 */

const sessionId = Math.random().toString(36).slice(2, 10); // one id per page load
let seq = 0;

export function logDebug3(event: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  try {
    void fetch(`${import.meta.env.BASE_URL}api/log`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool: '3d', session: sessionId, seq: seq++, clientTs: new Date().toISOString(), ...event }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* logging must never break the app */
  }
}
