/**
 * The analytic builder's wiring of the share LINK (#1372, extending ADR-W-079 to every builder).
 *
 * The operator hit this directly: he had an analytic session — «עבודת סוכות - שאלה 4», 13 lines —
 * and could not send it, because #1189's phase 1 wired the link into 2-D alone.
 *
 * `shell/session/link` owns the encoding, the fragment read and the consume; this module is the
 * analytic half — what goes into a link, where it points, and what arriving with one means.
 *
 * **NO TRIM HERE, deliberately.** 2-D strips fact ids and its archive header because its envelope is
 * fat with them. Analytic's envelope is `lines[] + seed + name` — measured at 346 characters for the
 * operator's own 13-line session, encoding to a 407-character URL against a 2,000 cap. There is
 * nothing to remove but whitespace, and inventing a second format to save nothing is how two formats
 * start drifting.
 *
 * **Opening a link is a LOAD**, through `loadAnalyticSession` — the same call the file picker makes —
 * so a shared figure is audited (#1087) exactly as a stale file is: a line that no longer builds is
 * reported, never dropped in silence.
 */

import { appBaseUrl, figureLinkUrl, linkFits } from '../../shell/session/link';
import { readEnvelope } from '../../shell/save';
import { loadAnalyticSession } from './loadSession';
import { ANALYTIC_ENVELOPE, useAnalyticStore } from '../store/useAnalyticStore';

export type ShareLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'empty' }
  /** Built, measured, and REFUSED — `length` is what it would have been. */
  | { ok: false; reason: 'too-long'; length: number };

/**
 * The link for the current figure, or an honest refusal.
 *
 * The measurement is the point: a URL that some client truncates opens as a figure missing its last
 * lines, and the student has no way to see that anything is gone.
 */
export function shareLinkForAnalytic(): ShareLinkResult {
  const st = useAnalyticStore.getState();
  if (st.lines.length === 0) return { ok: false, reason: 'empty' };
  const url = figureLinkUrl(appBaseUrl(import.meta.env.BASE_URL), JSON.stringify(st.serialize()));
  return linkFits(url) ? { ok: true, url } : { ok: false, reason: 'too-long', length: url.length };
}

/**
 * Open a shared payload through the envelope check and the normal load path. True when it opened;
 * otherwise WHY not — `broken` when it is not a session this builder can read (another tool's link,
 * a future version), `too-large` over the shared statement ceiling (#1379), refused before a line
 * replays. The store is left exactly as it was.
 */
export function openSharedAnalytic(payload: string): true | 'broken' | 'too-large' {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return 'broken';
  }
  const env = readEnvelope(parsed, ANALYTIC_ENVELOPE);
  if (!env.ok) return env.reason === 'too-large' ? 'too-large' : 'broken';
  // A link has no filename to name the figure from, so the envelope's own name is all there is.
  loadAnalyticSession(env.data, '');
  return true;
}
