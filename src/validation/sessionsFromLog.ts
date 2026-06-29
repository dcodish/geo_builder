/**
 * Ingest the production usage log (`events.jsonl`, pulled from the server) into replayable sessions.
 *
 * Each line is a `UsageEvent` (see `server/eventLog.ts`): a `session` marker per page load and a
 * `submit` per utterance, grouped by `sid`. We reconstruct, per session, the ORDERED list of
 * utterances the student typed — the input to `replaySession`. Pure parsing of a JSONL string; the
 * file is fetched out-of-band (e.g. `scp root@themathbible.com:/var/www/geo-proxy/events.jsonl .`).
 */

export interface LoggedSession {
  sid: string;
  rel?: string;
  locale?: string;
  /** First server timestamp seen for the session (for sorting / display). */
  startedAt?: string;
  utterances: string[];
  /** The prod-logged outcome per utterance (`source|result`), to diff against the harness's replay. */
  prodOutcomes: string[];
}

interface RawEvent {
  serverTs?: string;
  t?: string;
  sid?: string;
  ev?: string;
  rel?: string;
  locale?: string;
  source?: string;
  result?: string;
  utterance?: string;
}

/** Parse an `events.jsonl` text blob into sessions, ordered by start time (oldest first). */
export function eventsToSessions(jsonl: string): LoggedSession[] {
  const byId = new Map<string, LoggedSession>();
  const order: { sid: string; ts: string }[] = [];

  for (const line of jsonl.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let e: RawEvent;
    try {
      e = JSON.parse(s) as RawEvent;
    } catch {
      continue;
    }
    const sid = e.sid;
    if (!sid) continue;
    const ts = e.t ?? e.serverTs ?? '';
    let sess = byId.get(sid);
    if (!sess) {
      sess = { sid, rel: e.rel, locale: e.locale, startedAt: ts, utterances: [], prodOutcomes: [] };
      byId.set(sid, sess);
      order.push({ sid, ts });
    }
    if (e.ev === 'submit' && typeof e.utterance === 'string') {
      sess.utterances.push(e.utterance);
      sess.prodOutcomes.push(`${e.source ?? '?'}|${e.result ?? 'ok'}`);
      if (e.locale && !sess.locale) sess.locale = e.locale;
      if (e.rel && !sess.rel) sess.rel = e.rel;
    }
  }

  order.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return order.map(({ sid }) => byId.get(sid)!).filter((s) => s.utterances.length > 0);
}

/** A session is "interesting" for triage iff it logged at least one failure outcome in prod. */
export function hasFailure(s: LoggedSession): boolean {
  return s.prodOutcomes.some((o) => /built-nothing|not-understood|weak:/.test(o));
}
