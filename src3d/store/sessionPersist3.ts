/**
 * 3-D's wiring of the shared session-offer seam (#1238, ADR-W-068) — the sibling of
 * `src/store/sessionPersist.ts`, over this tool's own save envelope and load path.
 *
 * The shape is the shell's (`shell/session/persist`, `shell/session/adapter`); what is 3-D's is
 * what a payload contains (`serializeFigure3`), what restoring means (`deserializeFigure3` into
 * `loadFigure`, the same call the file picker makes — so ADR-3D-087's load audit reports a restored
 * session exactly as it reports a stale file), and what "empty" means here.
 *
 * Nothing runs at import time and nothing restores by itself: ADR-W-046's *"a builder opens
 * EMPTY"* holds, and the figure enters the session only when the student taps «המשך».
 */

import type { SessionAdapter } from '../../shell/session/adapter';
import type { SessionSpec } from '../../shell/session/persist';
import { clearSession, readSession, writeSession } from '../../shell/session/persist';
import { deserializeFigure3, serializeFigure3 } from './figureFile3';
import { useGeo3 } from './store3';

/** This product's key — namespaced per builder, since four tools share one origin in dev. */
export const SESSION_3D: SessionSpec = { key: '3d-builder:session' };

/** The current session's payload, or null when the figure is empty (never persisted — see adapter). */
export function sessionPayload3(): string | null {
  const s = useGeo3.getState();
  if (s.facts.length === 0) return null;
  const name = s.figureName.trim();
  return serializeFigure3(s.facts, s.seed, name || undefined, s.queries, s.planeDisplay, s.displayMode);
}

/** Persist the current session, unless it is empty. */
export function persistSession3(now: Date = new Date()): void {
  const payload = sessionPayload3();
  if (!payload) return;
  writeSession(SESSION_3D, payload, now);
}

/**
 * The persisted slice. A zustand listener fires on every change — selection, a panel result — and
 * re-serializing the figure on each would put a JSON encode in front of every interaction;
 * reference equality is enough, because each action replaces what it changes.
 */
export function startSessionPersist3(): () => void {
  return useGeo3.subscribe((s, p) => {
    if (
      s.facts !== p.facts ||
      s.seed !== p.seed ||
      s.queries !== p.queries ||
      s.planeDisplay !== p.planeDisplay ||
      s.displayMode !== p.displayMode ||
      s.figureName !== p.figureName
    )
      persistSession3();
  });
}

/** What COULD be offered, or null. Reads only — it never touches the store. */
export function offeredSession3(now: Date = new Date()) {
  return readSession(SESSION_3D, now);
}

/** «התחל מחדש» — forget the stored session. */
export function forgetSession3(): void {
  clearSession(SESSION_3D);
}

/**
 * «המשך» — the stored payload through the normal load path. Returns the deserializer's result so
 * the caller can run the same audit and the same refusal message the file picker runs.
 */
export function restoreSession3(payload: string) {
  const r = deserializeFigure3(payload);
  if (!r.ok) return r;
  useGeo3.getState().loadFigure(r.facts, r.seed, r.queries, r.planeDisplay, r.displayMode);
  // A restore is a load, not a replay of the student's keystrokes: there is no session behind it
  // for undo to return to.
  useGeo3.temporal.getState().clear();
  return r;
}

/** The §5c cross-product subject — the real wiring, exposed as a value so a lock can drive it. */
export const session3Adapter: SessionAdapter = {
  spec: SESSION_3D,
  snapshot: sessionPayload3,
  restore: async (payload) => restoreSession3(payload).ok,
  isEmpty: () => useGeo3.getState().facts.length === 0,
  reset: () => useGeo3.getState().clear(),
};
