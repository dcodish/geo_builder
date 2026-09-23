/**
 * Session persistence — the OFFER seam (#1238, ADR-W-068, amending ADR-W-046).
 *
 * ADR-W-046 ruled *"a builder opens EMPTY; durable work is an explicit save to a file"*, after the
 * complex prototype silently re-submitted a stored session on every page load. That rule stands
 * here, unreversed: **nothing in this module is read at boot to populate a store.** What it adds is
 * the operator's 2026-09-21 amendment — *"offer to continue, never restore silently"*: a builder
 * still opens empty, and if a recent unsaved session exists the app frame OFFERS it, one tap to
 * continue and one to start fresh.
 *
 * Two properties make this safe to share across four products that agree on nothing else:
 *
 *  - **The payload is the product's OWN save-envelope text** — the same string its save button
 *    writes to a `.json` file. This module never parses it, never validates it, and holds no
 *    product knowledge (ADR-W-016 rule 2). Restoring is therefore LOADING: the caller feeds the
 *    payload through the load path it already has, so a stored statement the parser no longer
 *    produces is named by the load audit (ADR-242) rather than silently dropped, and the honesty
 *    invariant is inherited rather than re-implemented.
 *  - **Every accessor is wrapped.** `localStorage` throws in a private window, with site data
 *    blocked, and on quota exhaustion; a builder whose boot path throws is worse than a builder
 *    with no persistence, so every failure here degrades to "no stored session".
 *
 * The caller owns the WRITE POLICY, and one rule of it matters enough to state here: an EMPTY
 * session is never written and never clears what is stored. A builder opens empty by design, so a
 * persister that mirrored the empty boot state would erase the session it is meant to offer,
 * before the student could ever see the banner. Stored sessions die two ways only — the student
 * chooses «start fresh» ({@link clearSession}), or the staleness window expires on read.
 */

/** A stored session, as {@link readSession} hands it back. */
export interface StoredSession {
  /** When the payload was last written (ISO). Callers date the offer with it. */
  savedAt: string;
  /** The product's own save-envelope text, verbatim — feed it to the product's load path. */
  payload: string;
}

/** Per-product wiring. `key` is the caller's — `shell/` names no product. */
export interface SessionSpec {
  /** The `localStorage` key this product stores its session under. */
  key: string;
  /**
   * How long a session stays offerable. Past it, {@link readSession} returns null and drops the
   * record: a student returning next week wants a clean canvas, not last week's figure.
   * Default 24 h — a design default, not a ruling.
   */
  maxAgeMs?: number;
}

/** 24 hours — the default staleness window (see {@link SessionSpec.maxAgeMs}). */
export const DEFAULT_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The stored record's shape. `v` guards against a future format, exactly as the save file does. */
const RECORD_VERSION = 1;

/** `localStorage` or null — absent in tests and Node, throwing when site data is blocked. */
function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    return s ?? null;
  } catch {
    return null; // a SecurityError on the ACCESS itself (blocked site data)
  }
}

/**
 * Persist a session. `payload` is the product's save-envelope text and is stored verbatim.
 *
 * Silently does nothing when the payload is empty (the caller's "never write an empty session"
 * rule, which this enforces too rather than trusting), and when storage is unavailable or full —
 * a figure that cannot be persisted is not a figure that should stop building.
 */
export function writeSession(spec: SessionSpec, payload: string, now: Date = new Date()): void {
  if (!payload) return;
  const s = storage();
  if (!s) return;
  try {
    s.setItem(spec.key, JSON.stringify({ v: RECORD_VERSION, savedAt: now.toISOString(), payload }));
  } catch {
    // Quota exhausted, or a private-window write refused. The session stays in memory.
  }
}

/**
 * The stored session, or null when there is nothing offerable: no record, an unreadable or foreign
 * record, a record from a newer app, an empty payload, or one older than the staleness window.
 *
 * **This does not restore anything.** It reports what COULD be offered; the caller shows the offer
 * and only loads on the student's tap. A stale record is dropped as it is read, so the storage does
 * not accumulate figures nobody will ever be offered.
 */
export function readSession(spec: SessionSpec, now: Date = new Date()): StoredSession | null {
  const s = storage();
  if (!s) return null;
  let raw: string | null;
  try {
    raw = s.getItem(spec.key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let rec: unknown;
  try {
    rec = JSON.parse(raw);
  } catch {
    clearSession(spec); // not ours, or truncated — drop it rather than re-reading it forever
    return null;
  }
  if (typeof rec !== 'object' || rec === null || Array.isArray(rec)) return null;
  const r = rec as Record<string, unknown>;
  // A record written by a NEWER app refuses, the save envelope's discipline: better no offer than
  // a payload this build cannot honestly read back.
  if (r.v !== RECORD_VERSION) return null;
  if (typeof r.payload !== 'string' || !r.payload) return null;
  if (typeof r.savedAt !== 'string') return null;

  const age = now.getTime() - new Date(r.savedAt).getTime();
  const maxAge = spec.maxAgeMs ?? DEFAULT_SESSION_MAX_AGE_MS;
  if (!Number.isFinite(age) || age < 0 || age > maxAge) {
    clearSession(spec);
    return null;
  }
  return { savedAt: r.savedAt, payload: r.payload };
}

/** Forget the stored session — «start fresh», and the only deliberate way one dies. */
export function clearSession(spec: SessionSpec): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(spec.key);
  } catch {
    /* nothing to do — the offer is already dismissed in memory */
  }
}
