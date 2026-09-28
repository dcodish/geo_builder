/**
 * THE EVENTS SINK CANNOT TARGET THE FILESYSTEM ROOT, AND EVERY PRODUCT COLLECTS (#1363 + #1243).
 *
 * Measured on prod: analytic events answered 204 and wrote NOTHING — no env var, a
 * `process.cwd()` fallback under systemd's default cwd `/` targeting `/logs`, and the write
 * failure (rightly) swallowed. `/log-triage` read "no analytic activity", indistinguishable from
 * "no failures" — the ADR-W-077 trap. And `src-complex/` emitted no usage events at all, the last
 * product with zero collection.
 */
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { eventsLogPathForId } from '../toolRouting';
import { analyticsSubmitComplex } from '../../src-complex/debug/sessionLogComplex';

describe('#1363 — the fallback path is beside the code, never the cwd', () => {
  const saved = process.env.EVENTS_ANALYTIC_LOG_PATH;
  afterEach(() => {
    if (saved === undefined) delete process.env.EVENTS_ANALYTIC_LOG_PATH;
    else process.env.EVENTS_ANALYTIC_LOG_PATH = saved;
  });

  it('with no env var, the analytic path resolves beside the module — a missing env line still collects', () => {
    delete process.env.EVENTS_ANALYTIC_LOG_PATH;
    const p = eventsLogPathForId('analytic')!;
    // NOT the cwd-rooted path that became `/logs/…` under systemd (cwd `/`), the measured defect.
    expect(p).not.toBe(path.resolve(process.cwd(), 'logs', 'events-analytic.jsonl'));
    expect(p.endsWith('events-analytic.jsonl')).toBe(true);
    expect(path.isAbsolute(p)).toBe(true);
  });

  it('the env var still wins when present', () => {
    process.env.EVENTS_ANALYTIC_LOG_PATH = '/var/www/geo-proxy/events-analytic.jsonl';
    expect(eventsLogPathForId('analytic')).toBe('/var/www/geo-proxy/events-analytic.jsonl');
  });
});

describe('#1243 — complex emits, with the siblings’ one-submit-per-submission rule', () => {
  it('a final input is one lean submit; intermediates and figure snapshots are none', () => {
    expect(
      analyticsSubmitComplex({ kind: 'input', utterance: 'z1 = 3+4i', locale: 'he', result: 'ok' }),
    ).toEqual({ ev: 'submit', utterance: 'z1 = 3+4i', locale: 'he', source: 'grammar', result: 'ok' });
    expect(analyticsSubmitComplex({ kind: 'input', utterance: 'x', intermediate: true })).toBeNull();
    expect(analyticsSubmitComplex({ kind: 'figure', data: 'heavy' })).toBeNull();
  });

  it('a refusal is counted with its result — a queue prioritised against silence was the defect', () => {
    const lean = analyticsSubmitComplex({ kind: 'input', utterance: 'משהו', result: 'not-handled' });
    expect(lean).toMatchObject({ ev: 'submit', result: 'not-handled' });
  });
});
