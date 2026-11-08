/**
 * The complex builder's wiring of the shared session-offer seam (#1238, ADR-W-068).
 *
 * This tree has the sharpest reason for the seam's shape. #919 (ADR-W-046) removed
 * `src-complex/app/session.ts`, which SILENTLY re-submitted every stored line on each page load —
 * and since the product switcher is a plain link, arriving from another tool was a page load. The
 * operator's ruling then was *"clean canvas always"*; his 2026-09-21 amendment adds an OFFER, and
 * the distinction between the two is the whole point of this file:
 *
 *   - nothing here is called at import time, and nothing here restores on its own;
 *   - the app reads {@link offeredSessionCx} to decide whether to show a banner;
 *   - the lines re-enter through `hydrateSession` — the same call the file picker makes — so a
 *     stored line the parser no longer accepts is NAMED by the load audit, never dropped.
 */

import type { SessionAdapter } from '../../shell/session/adapter';
import type { SessionSpec } from '../../shell/session/persist';
import { clearSession, readSession, writeSession } from '../../shell/session/persist';
import type { CrashSession } from '../../shell/session/crash';
import { crashSessionOf, sliceChanged } from '../../shell/session/crash';
import { hydrateSession } from './submit';
import { useComplexStore } from '../store/useComplexStore';

/** The store's state, as the slice lists below name its fields. */
type ComplexState = ReturnType<typeof useComplexStore.getState>;

/** Namespaced per builder — four tools share one origin in dev. NOT the #919 key: that one is dead,
 *  and reusing it would resurrect prototype sessions into a mechanism with different rules. */
export const SESSION_CX: SessionSpec = { key: 'complex-builder:session' };

/** The current session's payload — the save envelope — or null when there are no lines. */
export function sessionPayloadCx(): string | null {
  const s = useComplexStore.getState();
  if (s.lines.length === 0) return null;
  return JSON.stringify(s.serialize());
}

/** Persist the current session, unless it is empty. */
export function persistSessionCx(now: Date = new Date()): void {
  const payload = sessionPayloadCx();
  if (!payload) return;
  writeSession(SESSION_CX, payload, now);
}

/** The fields whose change writes the session. */
export const SESSION_SLICE_CX = ['lines', 'queries', 'seed', 'freePos', 'name', 'display'] as const satisfies readonly (keyof ComplexState)[];

/** Start mirroring the session to storage. Returns the unsubscribe, for the caller's effect. */
export function startSessionPersistCx(): () => void {
  return useComplexStore.subscribe((s, p) => {
    if (sliceChanged(SESSION_SLICE_CX, s, p)) persistSessionCx();
  });
}

/** What COULD be offered, or null. Reads only — it never touches the store. */
export function offeredSessionCx(now: Date = new Date()) {
  return readSession(SESSION_CX, now);
}

/** «התחל מחדש» — forget the stored session. */
export function forgetSessionCx(): void {
  clearSession(SESSION_CX);
}

/**
 * «המשך» — the stored payload back through `hydrateSession`, which re-parses every line and fills
 * the load audit. False when the payload is not a session this build can read; the store is left
 * as it was.
 */
export function restoreSessionCx(payload: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return false;
  }
  return hydrateSession(parsed);
}

/**
 * #1507 (ADR-W-193) — the crash boundary's hold on this store: «שחזור» comes back with the last
 * figure that drew, and the autosave writes it, so a reload offers that one rather than the state
 * that failed. The rollback restores the persisted slice plus `disabled`, which the undo history
 * tracks, and clears what this builder's undo clears.
 */
export const crashSessionCx: CrashSession<ComplexState> = crashSessionOf(useComplexStore, {
  slice: [...SESSION_SLICE_CX, 'disabled'],
  clear: { lastError: null, lastNote: null },
  persist: () => persistSessionCx(),
});

/** The §5c cross-product subject — the real wiring, exposed as a value so a lock can drive it. */
export const sessionCxAdapter: SessionAdapter = {
  spec: SESSION_CX,
  snapshot: sessionPayloadCx,
  restore: async (payload) => restoreSessionCx(payload),
  isEmpty: () => useComplexStore.getState().lines.length === 0,
  reset: () => useComplexStore.getState().resetSession(),
};
