/**
 * 2-D's wiring of the share LINK (#1189, ADR-W-079).
 *
 * `shell/session/link` owns the encoding and knows no product; this module is the 2-D half — what
 * goes into a link (the trimmed save envelope, `serializeFigureForLink`), where the link points
 * (this build's base path), and what arriving with one means.
 *
 * **Opening a link is a LOAD**, through `loadFigureText` like every other way a figure enters the
 * session, so a shared figure gets the same refusals, the same ADR-232 re-lowering and the same
 * ADR-242 audit as a file. The history is reset because a link arrives with nothing behind it.
 */

import { decodeFigurePayload, figureLinkUrl, linkFits } from '../../shell/session/link';
import { figureStateOf, serializeFigureForLink } from './figureFile';
import type { FigureLoadOpts, FigureLoadOutcome } from './figureLoad';
import { loadFigureText } from './figureLoad';
import type { GeoState } from './geoStore';
import { useGeoStore } from './geoStore';

/**
 * Where this build lives — `/` in dev, `/geo-builder/` in production (`import.meta.env.BASE_URL`,
 * which carries a trailing slash). Never hardcoded: the same code serves both, and a link that
 * pointed at the wrong base would 404 for every student who tapped it.
 */
function appBase(): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${import.meta.env.BASE_URL}`;
}

export type ShareLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'empty' }
  /** Built, measured, and REFUSED — `length` is what it would have been. */
  | { ok: false; reason: 'too-long'; length: number };

/**
 * The link for the current figure, or an honest refusal.
 *
 * The measurement is the point: a URL that some client truncates would open as a figure missing its
 * last statements, and the student would have no way to know. Refusing names a limit; a truncated
 * link silently drops what the teacher stated.
 */
export function shareLinkFor(state: GeoState = useGeoStore.getState()): ShareLinkResult {
  if (state.facts.length === 0) return { ok: false, reason: 'empty' };
  const name = state.figureName.trim();
  const payload = serializeFigureForLink(figureStateOf(state), name ? { name } : {});
  const url = figureLinkUrl(appBase(), payload);
  return linkFits(url) ? { ok: true, url } : { ok: false, reason: 'too-long', length: url.length };
}

/**
 * The payload a page was opened with, or null when the URL carries none. Null is also what a
 * MALFORMED fragment returns — the caller distinguishes them by whether there was a fragment at
 * all, because "you followed a broken link" and "you opened the app normally" are different
 * messages.
 */
export function sharedPayloadIn(hash: string): string | null {
  return hash ? decodeFigurePayload(hash) : null;
}

/** Open a shared payload: the normal load path, with no session behind it. */
export function openSharedFigure(payload: string, opts: FigureLoadOpts = {}): Promise<FigureLoadOutcome> {
  return loadFigureText(payload, { ...opts, resetHistory: true });
}

/**
 * Consume the fragment once it has been read.
 *
 * Without this, a refresh — or the session persistence restoring the student's LATER edits — would
 * sit behind a URL that still says "open this original figure", and the next reload would quietly
 * throw away their work. The link delivers the figure once; after that the session is the student's.
 */
export function consumeShareFragment(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  } catch {
    /* a sandboxed history is not a reason to fail the load that just succeeded */
  }
}
