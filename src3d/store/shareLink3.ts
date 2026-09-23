/**
 * The 3-D builder's wiring of the share LINK (#1372, extending ADR-W-079 to every builder).
 *
 * `shell/session/link` owns the encoding, the fragment read and the consume; this module is the
 * 3-D half — what goes into a link, where it points, and what arriving with one means.
 *
 * The payload is {@link serializeFigure3ForLink}: the save envelope minus `savedAt`, minified. That
 * omission is about determinism (the same figure must produce the same link twice), not size — the
 * measurement is in that function's docblock.
 *
 * **Opening a link is a LOAD**, through `deserializeFigure3` into `loadFigure` — the same pair the
 * file picker uses — so ADR-3D-087's load audit reports a shared figure exactly as it reports a
 * stale file, and the undo history starts empty because a link arrives with nothing behind it.
 */

import { appBaseUrl, figureLinkUrl, linkFits } from '../../shell/session/link';
import { deserializeFigure3, serializeFigure3ForLink } from './figureFile3';
import { useGeo3 } from './store3';

export type ShareLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'empty' }
  /** Built, measured, and REFUSED — `length` is what it would have been. */
  | { ok: false; reason: 'too-long'; length: number };

/** The link for the current figure, or an honest refusal — measured before it is offered. */
export function shareLinkFor3(): ShareLinkResult {
  const s = useGeo3.getState();
  if (s.facts.length === 0) return { ok: false, reason: 'empty' };
  const name = s.figureName.trim();
  const payload = serializeFigure3ForLink(s.facts, s.seed, name || undefined, s.queries, s.planeDisplay, s.displayMode);
  const url = figureLinkUrl(appBaseUrl(import.meta.env.BASE_URL), payload);
  return linkFits(url) ? { ok: true, url } : { ok: false, reason: 'too-long', length: url.length };
}

/**
 * Open a shared payload through the normal load path. Returns the deserializer's own result, so the
 * caller runs the same audit and the same refusal message the file picker runs.
 */
export function openShared3(payload: string) {
  const r = deserializeFigure3(payload);
  if (!r.ok) return r;
  useGeo3.getState().loadFigure(r.facts, r.seed, r.queries, r.planeDisplay, r.displayMode);
  useGeo3.temporal.getState().clear(); // a link arrives with no earlier session to undo back to
  return r;
}
