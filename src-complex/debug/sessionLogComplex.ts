/**
 * Complex session logger (#1243) — the LAST product with no usage events.
 *
 * Until this file, `src-complex/` emitted nothing: `/log-triage` and the dashboard reported zero
 * complex activity, which is indistinguishable from "no failures" — the ADR-W-077 trap, and the
 * reason the queue's complex priorities were set against data nobody collected.
 *
 * The SHAPING rules are copied from `sessionLogAnalytic.ts` rather than imported — product trees
 * never import each other (`BOUNDARIES.json`). The POSTER is shared: `shell/usageLog.ts`, whose
 * `tool: 'complex'` tag is what files an event under this product (the router refuses an
 * unregistered tag rather than writing it into 2-D's file — ADR-W-077).
 *
 * Best-effort everywhere: never throws, never blocks the app.
 */
import { makeUsagePoster } from '../../shell/usageLog';

/** One id per page load, so a session's events group without anything stored between loads. */
const sessionId = Math.random().toString(36).slice(2, 10);
let seq = 0;

const LOG_URL = `${import.meta.env.BASE_URL}api/log`;

const post = makeUsagePoster({ tool: 'complex', url: LOG_URL });

/** The build this event came from, for the dashboard's release filter. `dev` outside a build. */
const REL = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';

/** One `session` line per page load, announced lazily so a visitor who types nothing is not counted. */
let sessionAnnounced = false;

/**
 * What an event contributes to PRODUCTION analytics: the lean payload, or `null`. The siblings'
 * rule — only FINAL user submissions and actions count; pure, so it is unit-testable.
 */
export function analyticsSubmitComplex(event: Record<string, unknown>): Record<string, unknown> | null {
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
  return {
    ev: 'submit',
    utterance: event.utterance,
    ...(event.locale !== undefined ? { locale: event.locale } : {}),
    source: event.source ?? 'grammar',
    result: event.result ?? 'ok',
  };
}

/** Emit one complex event — the dev trace in DEV, the lean analytics line in PROD. */
export function logComplex(event: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    post({ session: sessionId, seq: seq++, clientTs: new Date().toISOString(), ...event });
    return;
  }
  const lean = analyticsSubmitComplex(event);
  if (!lean) return;
  const t = new Date().toISOString();
  if (!sessionAnnounced) {
    sessionAnnounced = true;
    post({ ev: 'session', sid: sessionId, t, rel: REL });
  }
  post({ ...lean, sid: sessionId, t, rel: REL });
}
