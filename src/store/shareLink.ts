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

import { appBaseUrl, consumeFragment, figureLinkUrl, linkFits, payloadInHash } from '../../shell/session/link';
import { figureStateOf, serializeFigureForLink } from './figureFile';
import type { FigureLoadOpts, FigureLoadOutcome } from './figureLoad';
import { loadFigureText } from './figureLoad';
import type { GeoState } from './geoStore';
import { useGeoStore } from './geoStore';

/**
 * Where this build lives. The base is the caller's (`import.meta.env.BASE_URL`, trailing slash
 * included) and never hardcoded — the same code serves `/` in dev and `/geo-builder/` in
 * production, and a link pointing at the wrong base would 404 for every student who tapped it.
 * The origin half is `shell/`'s, since all four builders ask it the same way (#1372).
 */
const appBase = () => appBaseUrl(import.meta.env.BASE_URL);

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

/** The payload a page was opened with, or null. The decode is `shell/session/link`'s: four builders
 *  ask the same question (#1372), so there is one implementation of the answer. */
export const sharedPayloadIn = payloadInHash;

/** Open a shared payload: the normal load path, with no session behind it. */
export function openSharedFigure(payload: string, opts: FigureLoadOpts = {}): Promise<FigureLoadOutcome> {
  return loadFigureText(payload, { ...opts, resetHistory: true });
}

/** Drop the fragment once read — `shell/`'s, for the same reason as the decode. */
export const consumeShareFragment = consumeFragment;
