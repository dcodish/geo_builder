/**
 * Session logger. Two distinct sinks share one entry point (`logDebug`) and one
 * endpoint (`${BASE_URL}api/log`):
 *
 *  - DEV: fire-and-forgets the FULL event (incl. heavy figure snapshots) to the
 *    Vite dev plugin (`server/logProxy.ts`), which appends it to
 *    `logs/debug-log.jsonl`. Purpose: reconstruct a figure when "this didn't work
 *    right". Unchanged from before.
 *  - PROD: emits a LEAN analytics event per user action (a `session` marker once
 *    per page load, then a `submit` per utterance) to the production proxy's
 *    `/geo-builder/api/log` sink (`server/eventLog.ts`), which hashes the IP and
 *    appends to `events.jsonl` for the admin usage dashboard. No figure snapshots
 *    (too large/frequent), no secrets, no raw text beyond the utterance itself.
 *
 * Best-effort everywhere: never throws, never blocks the UI.
 */

const sessionId = Math.random().toString(36).slice(2, 10); // one id per page load, to group a session
let seq = 0;
let sessionAnnounced = false; // PROD: emit the `session` marker exactly once per load

// The build this page is running (git short-hash · date, injected by Vite `define`). Stamped on every
// PROD event so the admin dashboard can filter outcomes by release (ADR-146/ADR-148 follow-up) — `typeof`
// guard so a context without the define (some test runners) degrades to 'dev' instead of throwing.
const REL = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';

// `import.meta.env.BASE_URL` is `/` in dev and `/geo-builder/` in the production
// build, so this resolves to `/api/log` (dev Vite plugin) or `/geo-builder/api/log`
// (prod Node proxy) automatically — the same way the `/api/parse` fetch does.
const LOG_URL = `${import.meta.env.BASE_URL}api/log`;

function post(body: Record<string, unknown>): void {
  try {
    void fetch(LOG_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* logging must never break the app */
  }
}

/**
 * Decide what a `logDebug` event contributes to PRODUCTION usage analytics: the
 * lean `submit` payload (minus the session-scoped `sid`/`t`/`rel`, which the caller
 * stamps), or `null` when the event is not a user submission we should count.
 *
 * Two kinds are dropped:
 *   - non-`input` kinds — the frequent `kind:'figure'` snapshots are a dev-only
 *     reconstruction trace, never analytics;
 *   - INTERMEDIATE input steps — one user submit can log MORE than one `kind:'input'`
 *     step: when the grammar parses only PARTIALLY (or builds nothing) it logs a
 *     `weak` diagnostic step and then escalates to the LLM, whose outcome is logged
 *     SEPARATELY as the submission's final result. That intermediate step belongs in
 *     the DEV debug trace but must NOT become a second `submit`, or the dashboard
 *     double-counts the utterance and shows a phantom "weak / dropped" row beside its
 *     real LLM outcome. Pure so the "one submit per submission" rule is unit-tested.
 */
export function analyticsSubmit(event: Record<string, unknown>): Record<string, unknown> | null {
  // A store INTERACTION (edit / slider / show-another / delete) — one lean `action` line so a reported
  // session replays end-to-end, not just the submits (issue #84). `detail` carries only the reconstruction
  // data (a step key, a circle+value, a seed), never a figure snapshot.
  if (event.kind === 'action') {
    return {
      ev: 'action',
      action: event.action,
      ...(event.detail !== undefined ? { detail: event.detail } : {}),
      ...(event.result !== undefined ? { result: event.result } : {}),
    };
  }
  if (event.kind !== 'input') return null;
  if (event.intermediate) return null;
  // On the LLM path, the committed canonical COMMANDS (what actually landed on the figure) — a
  // `source:llm, result:ok` submit is otherwise opaque, so a reported session can't be reconstructed
  // (issue #84). Short text, same privacy class as the utterance; capped so the sink stays lean.
  const commands =
    event.source === 'llm' && event.commands !== undefined ? JSON.stringify(event.commands).slice(0, 900) : undefined;
  return {
    ev: 'submit',
    utterance: event.utterance,
    locale: event.locale,
    source: event.source,
    result: event.result ?? 'ok', // the happy parser path logs no `result` → treat as ok
    ...(commands ? { commands } : {}),
  };
}

/** Append one event. DEV → full debug log; PROD → lean usage analytics. */
export function logDebug(event: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    post({ session: sessionId, seq: seq++, clientTs: new Date().toISOString(), ...event });
    return;
  }
  const lean = analyticsSubmit(event); // null unless this is a FINAL user submission
  if (!lean) return;
  const t = new Date().toISOString();
  if (!sessionAnnounced) {
    sessionAnnounced = true;
    post({ ev: 'session', sid: sessionId, t, rel: REL });
  }
  post({ ...lean, sid: sessionId, t, rel: REL });
}
