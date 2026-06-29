/**
 * Triage step 1 — REPLAY (slow). Env-gated tool, skipped in the normal suite.
 *
 *   1. pull the prod log:  scp root@themathbible.com:/var/www/geo-proxy/events.jsonl /tmp/events.jsonl
 *   2. run:                EVENTS_FILE=/tmp/events.jsonl OUT_FILE=/tmp/triage-data.jsonl \
 *                            npx vitest run src/validation/__tests__/triageDump.test.ts
 *
 * Replays each FAILING session through the real pipeline and APPENDS one JSON line per session to
 * OUT_FILE (monitorable, survives a kill). Long/coupled sessions (> MAX_STEPS) are emitted as
 * metadata-only rows — their coupled solves are too slow for an interactive pass (a background fix-loop
 * replays them in full). Step 2 (`triageHtml.test.ts`) turns OUT_FILE into the HTML report.
 */
import { it } from 'vitest';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { replaySession } from '../replaySession';
import { eventsToSessions, hasFailure } from '../sessionsFromLog';

const MAX_STEPS = 8;

it.skipIf(!process.env.EVENTS_FILE)('dump triage data', { timeout: 1_800_000 }, () => {
  const OUT = process.env.OUT_FILE!;
  const sessions = eventsToSessions(readFileSync(process.env.EVENTS_FILE!, 'utf8')).filter(hasFailure);
  writeFileSync(OUT, '');
  for (const s of sessions) {
    if (s.utterances.length > MAX_STEPS) {
      appendFileSync(OUT, JSON.stringify({ sid: s.sid, rel: s.rel, locale: s.locale, startedAt: s.startedAt, deferred: s.utterances.length, prodOutcomes: s.prodOutcomes, finalViolations: [], lastError: null, steps: [] }) + '\n');
      continue;
    }
    let rec: Record<string, unknown>;
    try {
      const r = replaySession(s.utterances, { satisfyingSeed: false });
      rec = {
        sid: s.sid, rel: s.rel, locale: s.locale, startedAt: s.startedAt, prodOutcomes: s.prodOutcomes,
        finalViolations: r.final.violations.map((v) => v.message), lastError: r.final.lastError,
        steps: r.steps.map((st) => ({ utterance: st.utterance, category: st.category, outcome: st.outcome, committed: st.committed, alreadyDefined: st.alreadyDefined, detail: st.detail })),
      };
    } catch (e) {
      rec = { sid: s.sid, rel: s.rel, locale: s.locale, startedAt: s.startedAt, threw: (e as Error).message, prodOutcomes: s.prodOutcomes, finalViolations: [], lastError: null, steps: [] };
    }
    appendFileSync(OUT, JSON.stringify(rec) + '\n');
  }
});
