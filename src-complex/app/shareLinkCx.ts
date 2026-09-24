/**
 * The complex builder's wiring of the share LINK (#1372, extending ADR-W-079 to every builder).
 *
 * `shell/session/link` owns the encoding; this module is the complex half.
 *
 * **NO TRIM, and one field worth naming.** This envelope carries `freePos` — where the student
 * PLACED a free point. It looks like a position and is not one: it is an input, the same kind of
 * thing as a typed line, so FR-SL-4's "replay inputs, not positions" keeps it. Dropping it to save
 * characters would silently move a student's own construction when the link is opened, which is the
 * cardinal sin this feature is otherwise careful about. Everything else (`lines`, `seed`, `view`,
 * `name`, `disabled`, `queries`) is already lean.
 *
 * **Opening a link is a LOAD**, through `hydrateSession` — the same call the file picker makes — so
 * every line is re-parsed on the way in and one the parser no longer accepts is NAMED by the load
 * audit rather than dropped.
 */

import { appBaseUrl, figureLinkUrl, linkFits } from '../../shell/session/link';
import { readEnvelope } from '../../shell/save';
import { COMPLEX_SESSION, hydrateSession } from './submit';
import { useComplexStore } from '../store/useComplexStore';

export type ShareLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'empty' }
  /** Built, measured, and REFUSED — `length` is what it would have been. */
  | { ok: false; reason: 'too-long'; length: number };

/** The link for the current figure, or an honest refusal — measured before it is offered. */
export function shareLinkForComplex(): ShareLinkResult {
  const st = useComplexStore.getState();
  if (st.lines.length === 0) return { ok: false, reason: 'empty' };
  const url = figureLinkUrl(appBaseUrl(import.meta.env.BASE_URL), JSON.stringify(st.serialize()));
  return linkFits(url) ? { ok: true, url } : { ok: false, reason: 'too-long', length: url.length };
}

/**
 * Open a shared payload through the normal audited hydrate. True when it opened; otherwise WHY not —
 * `broken` for anything that is not a session this builder can read, `too-large` for one over the
 * shared statement ceiling (#1379), refused before a line replays. The store is left as it was.
 */
export function openSharedComplex(payload: string): true | 'broken' | 'too-large' {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return 'broken';
  }
  const env = readEnvelope(parsed, COMPLEX_SESSION);
  if (!env.ok) return env.reason === 'too-large' ? 'too-large' : 'broken';
  return hydrateSession(parsed) ? true : 'broken';
}
