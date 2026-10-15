/**
 * Harness unit tests (Option A). Proves `replaySession` reproduces a real production session and
 * classifies each step into the actionable triage buckets — using the exact utterances from the live
 * `events.jsonl` session `z0t3i7m1` (2026-06-29 10:43), which the dashboard flat-list made look like
 * "a basic square wasn't understood".
 */

import { describe, it, expect } from 'vitest';
import { replaySession } from '../replaySession';
import { eventsToSessions, hasFailure } from '../sessionsFromLog';

describe('replaySession — production session z0t3i7m1', () => {
  it('classifies "square ABCD after parallelogram ABCD": the first refines the ring (ADR-656), the repeat is an empty collision, not a parser failure', () => {
    const r = replaySession([
      'מקבילית ABCD', // parallelogram → A,B,C,D now exist
      'שני מעגלים נחתכים', // two intersecting circles
      'ריבוע ABCD', // square ABCD — a noun that NARROWS the parallelogram refines the ring (#1914 ruling, ADR-656)
      'ריבוע ABCD', // again — now a restatement: builds nothing
    ]);

    // The parallelogram, the two circles and the narrowing square build.
    for (const i of [0, 1, 2]) expect(r.steps[i].category, `step ${i}`).toBe('ok');
    expect(r.steps[2].committed).toBe(true);

    // The repeat is NOT a parser failure — it parses fine and collides with the existing ABCD.
    expect(r.steps[3].category).toBe('empty');
    expect(r.steps[3].committed).toBe(false);
    expect(r.steps[3].alreadyDefined).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D']));
  });
});

describe('replaySession — parse context is not missing `parallels` (ADR-171 drift fix)', () => {
  it('classifies a trapezoid-altitude utterance as parsed, not a coverage-gap', () => {
    // Before the shared `buildParseCtx`, the harness's own `ctxFrom` omitted `parallels`, so the
    // altitude rule (ADR-169) could not resolve the opposite base and "CE גובה בטרפז" fell through to
    // `coverage-gap` — a FALSE gap the shipped app never has. The step must now commit.
    const r = replaySession([
      'טרפז ABCD ישר זווית', // right trapezoid — AB ∥ DC, so ctx.parallels is non-empty
      'CE גובה בטרפז', // the height from C drops to the opposite parallel base AB
    ]);
    expect(r.steps[0].category).toBe('ok');
    expect(r.steps[1].category, 'trapezoid altitude must parse, not read as a coverage gap').not.toBe('coverage-gap');
    expect(r.steps[1].committed).toBe(true);
  });
});

describe('eventsToSessions — log ingest', () => {
  it('groups submit lines by sid in order and flags failing sessions', () => {
    const jsonl = [
      JSON.stringify({ ev: 'session', sid: 's1', t: '2026-06-29T10:00:00Z', rel: 'r1' }),
      JSON.stringify({ ev: 'submit', sid: 's1', t: '2026-06-29T10:00:01Z', utterance: 'ריבוע ABCD', source: 'parser', result: 'ok', locale: 'he' }),
      JSON.stringify({ ev: 'submit', sid: 's2', t: '2026-06-29T09:59:00Z', utterance: 'מעגל O', source: 'llm', result: 'built-nothing', locale: 'he' }),
      JSON.stringify({ ev: 'submit', sid: 's1', t: '2026-06-29T10:00:02Z', utterance: 'AC אלכסון', source: 'parser', result: 'ok', locale: 'he' }),
    ].join('\n');

    const sessions = eventsToSessions(jsonl);
    expect(sessions.map((s) => s.sid)).toEqual(['s2', 's1']); // oldest first
    const s1 = sessions.find((s) => s.sid === 's1')!;
    expect(s1.utterances).toEqual(['ריבוע ABCD', 'AC אלכסון']);
    expect(hasFailure(s1)).toBe(false);
    expect(hasFailure(sessions.find((s) => s.sid === 's2')!)).toBe(true);
  });
});
