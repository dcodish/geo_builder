/**
 * The analytic builder's wiring of the shared session-offer seam (#1238, ADR-W-068).
 *
 * Same shape as its three siblings: the payload is this tool's save envelope, restoring is a load
 * through {@link loadAnalyticSession} (so the #1087 audit reports a restored session exactly as it
 * reports a stale file), and nothing here restores by itself — the app reads
 * {@link offeredSessionAn} to decide whether to OFFER, and the student decides.
 */

import type { SessionAdapter } from '../../shell/session/adapter';
import type { SessionSpec } from '../../shell/session/persist';
import { clearSession, readSession, writeSession } from '../../shell/session/persist';
import { readEnvelope } from '../../shell/save';
import { loadAnalyticSession } from './loadSession';
import { ANALYTIC_ENVELOPE, useAnalyticStore } from '../store/useAnalyticStore';

/** Namespaced per builder — four tools share one origin in dev. */
export const SESSION_AN: SessionSpec = { key: 'analytic-builder:session' };

/** The current session's payload — the save envelope — or null when there are no lines. */
export function sessionPayloadAn(): string | null {
  const s = useAnalyticStore.getState();
  if (s.lines.length === 0) return null;
  return JSON.stringify(s.serialize());
}

/** Persist the current session, unless it is empty. */
export function persistSessionAn(now: Date = new Date()): void {
  const payload = sessionPayloadAn();
  if (!payload) return;
  writeSession(SESSION_AN, payload, now);
}

/** Start mirroring the session to storage. Returns the unsubscribe, for the caller's effect. */
export function startSessionPersistAn(): () => void {
  return useAnalyticStore.subscribe((s, p) => {
    if (s.lines !== p.lines || s.queries !== p.queries || s.seed !== p.seed || s.name !== p.name) persistSessionAn();
  });
}

/** What COULD be offered, or null. Reads only — it never touches the store. */
export function offeredSessionAn(now: Date = new Date()) {
  return readSession(SESSION_AN, now);
}

/** «התחל מחדש» — forget the stored session. */
export function forgetSessionAn(): void {
  clearSession(SESSION_AN);
}

/**
 * «המשך» — the stored payload through the envelope check and the normal load path. False when it
 * is not a session this build can read; the store is left as it was.
 */
export function restoreSessionAn(payload: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return false;
  }
  const env = readEnvelope(parsed, ANALYTIC_ENVELOPE);
  if (!env.ok) return false;
  loadAnalyticSession(env.data, '');
  return true;
}

/** The §5c cross-product subject — the real wiring, exposed as a value so a lock can drive it. */
export const sessionAnAdapter: SessionAdapter = {
  spec: SESSION_AN,
  snapshot: sessionPayloadAn,
  restore: async (payload) => restoreSessionAn(payload),
  isEmpty: () => useAnalyticStore.getState().lines.length === 0,
  reset: () => useAnalyticStore.getState().clearAll(),
};
