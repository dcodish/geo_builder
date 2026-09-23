/**
 * 2-D's wiring of the shared session-offer seam (#1238, ADR-W-068).
 *
 * `shell/session/persist` owns the storage and the staleness window and knows nothing about any
 * product; this module is the 2-D half: what a session's payload IS (the save envelope, byte for
 * byte — never a second format), when it is written, and what restoring one means (a load through
 * {@link loadFigureText}, so the ADR-242 audit and the ADR-232 re-lowering apply to a restored
 * session exactly as they apply to a stale file).
 *
 * **Nothing here runs at import time and nothing restores by itself.** ADR-W-046's *"a builder
 * opens EMPTY"* is unchanged: the app reads {@link offeredSession} to decide whether to OFFER, and
 * the figure enters the session only on the student's tap.
 *
 * The write policy has one rule that is load-bearing: **an empty session is never written.** A
 * builder opens empty, so a persister that mirrored its boot state would erase the very session it
 * exists to offer, a few milliseconds before the student could see the banner. Stored sessions are
 * forgotten two ways only — «התחל מחדש» ({@link forgetSession}) and the staleness window.
 */

import type { SessionAdapter } from '../../shell/session/adapter';
import type { SessionSpec } from '../../shell/session/persist';
import { clearSession, readSession, writeSession } from '../../shell/session/persist';
import type { FigureLoadOpts, FigureLoadOutcome } from './figureLoad';
import { loadFigureText } from './figureLoad';
import { figureStateOf, serializeFigure } from './figureFile';
import type { GeoState } from './geoStore';
import { useGeoStore } from './geoStore';

/** This product's key. Namespaced per builder — four tools share one origin in dev. */
export const GEO_SESSION: SessionSpec = { key: 'geo-builder:session' };

/**
 * The session's payload — the SAME text the save button writes to `.geo.json` — or null when there
 * is nothing worth offering (an empty fact list).
 *
 * `locale` is deliberately omitted: it is informational in the file and a load never switches the
 * UI language, so carrying it would only add a field that means nothing on this path. The figure's
 * NAME is kept, because a restored session has no filename to take it from.
 */
export function sessionPayload(state: GeoState = useGeoStore.getState()): string | null {
  if (state.facts.length === 0) return null;
  const name = state.figureName.trim();
  return serializeFigure(figureStateOf(state), {
    savedAt: new Date().toISOString(),
    ...(name ? { name } : {}),
  });
}

/** Persist the current session, unless it is empty. */
export function persistSession(state: GeoState = useGeoStore.getState(), now: Date = new Date()): void {
  const payload = sessionPayload(state);
  if (!payload) return;
  writeSession(GEO_SESSION, payload, now);
}

/**
 * The fields the payload is made of. A zustand listener fires on every state change — selection,
 * the busy flag, a detection result — and re-serializing the whole figure on each of those would
 * put a JSON encode in front of every interaction. Reference equality over the persisted slice is
 * enough, because every store action replaces the arrays/objects it changes.
 */
const SLICE = [
  'facts',
  'seed',
  'queries',
  'hidden',
  'segStyle',
  'hiddenCircles',
  'showMeasures',
  'showCenters',
  'displayMode',
  'figureName',
] as const satisfies readonly (keyof GeoState)[];

function sliceChanged(a: GeoState, b: GeoState): boolean {
  return SLICE.some((k) => a[k] !== b[k]);
}

/** Start mirroring the session to storage. Returns the unsubscribe, for the caller's effect. */
export function startSessionPersist(): () => void {
  return useGeoStore.subscribe((state, prev) => {
    if (sliceChanged(state, prev)) persistSession(state);
  });
}

/** What could be offered, or null. Reads only — it never touches the store. */
export function offeredSession(now: Date = new Date()) {
  return readSession(GEO_SESSION, now);
}

/** «התחל מחדש» — forget the stored session. */
export function forgetSession(): void {
  clearSession(GEO_SESSION);
}

/**
 * «המשך» — load the stored payload through the normal load path, then drop the undo history: a
 * restore is a LOAD, not a replay of the student's keystrokes, so there is no earlier session for
 * undo to go back to (the plan's lock (f)).
 */
export async function restoreSession(payload: string, opts: FigureLoadOpts = {}): Promise<FigureLoadOutcome> {
  return loadFigureText(payload, { ...opts, resetHistory: true });
}

/** The §5c cross-product subject — the real wiring, exposed as a value so a lock can drive it. */
export const geoSessionAdapter: SessionAdapter = {
  spec: GEO_SESSION,
  snapshot: () => sessionPayload(),
  restore: async (payload) => (await restoreSession(payload)).ok,
  isEmpty: () => useGeoStore.getState().facts.length === 0,
  reset: () => useGeoStore.getState().clear(),
};
