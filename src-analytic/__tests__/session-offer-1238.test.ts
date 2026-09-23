/**
 * The analytic builder's thin lock on the session OFFER (#1238, ADR-W-068) — the shared checks,
 * this tree's adapter (docs/28 §5c rule 3), plus the property that is analytic's own: a restored
 * session is AUDITED (#1087), so a stored line that no longer builds is reported rather than
 * dropped in silence.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAnalyticSession } from '../app/loadSession';
import { restoreSessionAn, sessionAnAdapter, sessionPayloadAn } from '../app/sessionPersistAn';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { sessionOfferFaults } from '../../shell/__tests__/fixtures/session-offer-rows';
import { installFakeStorage, uninstallFakeStorage } from '../../shell/__tests__/fixtures/fakeStorage';

/** A 2-D save file — must be refused, never half-loaded. */
const FOREIGN = JSON.stringify({ app: 'geo-builder', schemaVersion: 1, seed: 0, facts: [] });

const build = (lines: string[]) => {
  for (const l of lines) useAnalyticStore.getState().recordLine(l);
};

beforeEach(() => {
  installFakeStorage();
  useAnalyticStore.getState().clearAll();
});
afterEach(() => {
  useAnalyticStore.getState().clearAll();
  uninstallFakeStorage();
});

describe('#1238 — the analytic builder conforms to the shared offer contract', () => {
  it('no faults against the cross-product checks', async () => {
    const faults = await sessionOfferFaults({
      adapter: sessionAnAdapter,
      populate: () => build(['A(0,0)', 'B(4,0)']),
      foreign: FOREIGN,
    });
    expect(faults).toEqual([]);
  });
});

describe('#1238 — a restored session is an AUDITED load, in this tree', () => {
  it('the lines come back in order and the load audit is filled', () => {
    build(['A(0,0)', 'B(4,0)']);
    const priorLines = [...useAnalyticStore.getState().lines];
    const payload = sessionPayloadAn();
    expect(payload).not.toBeNull();

    useAnalyticStore.getState().clearAll();
    expect(restoreSessionAn(payload as string)).toBe(true);
    const st = useAnalyticStore.getState();
    expect(st.lines).toEqual(priorLines);
    // #1087: a restore reports what it could rebuild, exactly as a file load does.
    expect(st.loadAudit?.total).toBe(priorLines.length);
    expect(st.loadAudit?.failed).toEqual([]);
  });

  it('a stored line that no longer builds is NAMED, not dropped', () => {
    build(['A(0,0)', 'שורה שאינה נבנית']);
    const payload = sessionPayloadAn() as string;
    useAnalyticStore.getState().clearAll();
    expect(restoreSessionAn(payload)).toBe(true);
    const st = useAnalyticStore.getState();
    expect(st.lines.length, 'nothing is silently dropped — the line is kept and reported').toBe(2);
    expect(st.loadAudit?.failed.map((f) => f.line)).toContain('שורה שאינה נבנית');
  });

  it('a foreign envelope is refused and the canvas is left alone', () => {
    build(['A(0,0)']);
    expect(restoreSessionAn(FOREIGN)).toBe(false);
    expect(useAnalyticStore.getState().lines).toEqual(['A(0,0)']);
  });
});

describe('#1238 — an empty canvas never overwrites the stored session', () => {
  it('a fresh boot state produces no payload at all', () => {
    expect(useAnalyticStore.getState().lines).toEqual([]);
    expect(sessionPayloadAn()).toBeNull();
  });
});

describe('#1238 — the extracted load core is what BOTH entry points call', () => {
  it('restores an envelope body, takes the caller’s fallback name, and fills the audit', () => {
    const out = loadAnalyticSession({ lines: ['A(0,0)', 'B(4,0)'], seed: 2 }, 'מהקובץ');
    expect(out.lines).toEqual(['A(0,0)', 'B(4,0)']);
    const st = useAnalyticStore.getState();
    expect(st.lines).toEqual(['A(0,0)', 'B(4,0)']);
    expect(st.seed).toBe(2);
    // The FILENAME names a loaded figure (#42); a restored session passes an empty fallback instead.
    expect(st.name).toBe('מהקובץ');
    expect(st.loadAudit?.total).toBe(2);
  });

  it('an envelope whose lines no longer build still restores them, and REPORTS them', () => {
    const out = loadAnalyticSession({ lines: ['A(0,0)', 'שורה שאינה נבנית'] }, '');
    expect(out.failed).toBeGreaterThan(0);
    expect(useAnalyticStore.getState().lines.length).toBe(2);
  });
});
