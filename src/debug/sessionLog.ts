/**
 * Session debug logger (dev only). Fire-and-forgets each event to the dev server's
 * `POST /api/log`, which appends it to `logs/debug-log.jsonl`. Purpose: when the
 * student says "this didn't work right", the file holds every utterance they
 * entered and a snapshot of the resulting fact list + status, so the figure can be
 * reconstructed and the problem reproduced.
 *
 * Best-effort: only runs under the dev server (`import.meta.env.DEV`), never throws,
 * and never blocks the UI. Holds no secrets.
 */

const sessionId = Math.random().toString(36).slice(2, 10); // one id per page load, to group a session
let seq = 0;

/** Append one debug event. No-op in a production build; swallows all errors. */
export function logDebug(event: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  try {
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: sessionId, seq: seq++, clientTs: new Date().toISOString(), ...event }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* logging must never break the app */
  }
}
