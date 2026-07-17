/**
 * 3-D session logger. Two sinks share one entry point (`logDebug3`) and one
 * endpoint (`${BASE_URL}api/log`), tagged `tool:'3d'` so it never mixes with the
 * 2-D app — the COPIED sibling of `src/debug/sessionLog.ts` (docs/20 §12: src3d
 * never imports src/):
 *
 *  - DEV: fire-and-forgets the FULL event (incl. heavy figure snapshots) to the
 *    shared Vite dev plugin (`server/logProxy.ts`), which routes `tool:'3d'` to
 *    its OWN file — `logs/debug-log-3d.jsonl`. Purpose: reconstruct a session.
 *  - PROD: emits a LEAN analytics event per user action (a `session` marker once
 *    per page load, then a `submit` per final utterance) to `/3d-builder/api/log`
 *    (`server/eventLog.ts`), which hashes the IP and appends to `events-3d.jsonl`
 *    for the 3-D usage dashboard (`/admin3`). No figure snapshots, no secrets.
 *
 * Best-effort everywhere: never throws, never blocks the app.
 */

const sessionId = Math.random().toString(36).slice(2, 10); // one id per page load, to group a session
let seq = 0;
let sessionAnnounced = false; // PROD: emit the `session` marker exactly once per load

// The build this page is running (git short-hash · date, injected by Vite `define` in vite.config.3d.ts).
// Stamped on every PROD event so the /admin3 dashboard can filter outcomes by release. `typeof` guard so a
// context without the define (test runners) degrades to 'dev' instead of throwing.
const REL = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';

// `import.meta.env.BASE_URL` is `/` in dev and `/3d-builder/` in the production build, so this resolves to
// `/api/log` (dev Vite plugin) or `/3d-builder/api/log` (prod Node proxy) automatically.
const LOG_URL = `${import.meta.env.BASE_URL}api/log`;

function post(body: Record<string, unknown>): void {
  try {
    void fetch(LOG_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool: '3d', ...body }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* logging must never break the app */
  }
}

/**
 * Decide what a `logDebug3` event contributes to PRODUCTION usage analytics: the
 * lean `submit` payload (minus the session-scoped `sid`/`t`/`rel`, which the caller
 * stamps), or `null` when the event is not a user submission we should count.
 *
 * Two kinds are dropped (identical rule to the 2-D `analyticsSubmit`):
 *   - non-`input` kinds — the frequent `kind:'figure'` snapshots are a dev-only
 *     reconstruction trace, never analytics;
 *   - INTERMEDIATE input steps — one submit logs a `not-understood` PARSER step and
 *     then escalates to the LLM, whose outcome is logged separately as the final
 *     result. That intermediate step must NOT become a second `submit`, or the
 *     dashboard double-counts the utterance and shows a phantom gap beside its real
 *     LLM outcome. Pure so the "one submit per submission" rule is unit-tested.
 */
export function analyticsSubmit3(event: Record<string, unknown>): Record<string, unknown> | null {
  // A store INTERACTION (delete / show-another / undo / redo / clear / load) — one lean `action` line so
  // a reported session replays end-to-end, not just the submits (issue #182 — the #84 mirror). `detail`
  // carries only reconstruction data (a fact id, a seed), never a figure snapshot.
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
  // On the LLM path, the committed canonical LINES (what `submitSteps` re-parsed onto the figure) — a
  // `source:llm, result:ok` submit is otherwise opaque, so a reported 3-D session can't be reconstructed
  // (issue #182). Short math text, the same privacy class as the utterance; capped so the sink stays lean.
  const commands =
    event.source === 'llm' && event.commands !== undefined && event.commands !== null
      ? JSON.stringify(event.commands).slice(0, 900)
      : undefined;
  return {
    ev: 'submit',
    utterance: event.utterance,
    locale: event.locale,
    source: event.source,
    result: event.result ?? 'ok', // the happy parser path logs no `result` → treat as ok
    ...(commands ? { commands } : {}),
  };
}

/** Append one 3-D event. DEV → full debug log; PROD → lean usage analytics. */
export function logDebug3(event: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    post({ session: sessionId, seq: seq++, clientTs: new Date().toISOString(), ...event });
    return;
  }
  const lean = analyticsSubmit3(event); // null unless this is a FINAL user submission
  if (!lean) return;
  const t = new Date().toISOString();
  if (!sessionAnnounced) {
    sessionAnnounced = true;
    post({ ev: 'session', sid: sessionId, t, rel: REL });
  }
  post({ ...lean, sid: sessionId, t, rel: REL });
}
