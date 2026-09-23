/**
 * The session-storage seam (#1238, ADR-W-068) — `shell/session/persist`.
 *
 * Two families. The OFFER contract: what is stored can be offered back, and what must NOT be
 * offered (a stale session, a record from a future build, a corrupt one) is dropped rather than
 * half-read. And the DEGRADATION contract: every browser-storage failure that actually happens —
 * a private window, blocked site data, an exhausted quota — leaves the builder working, because a
 * boot path that throws is worse than no persistence at all.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SESSION_MAX_AGE_MS, clearSession, readSession, writeSession } from '../session/persist';
import { installFakeStorage, uninstallFakeStorage } from './fixtures/fakeStorage';

const SPEC = { key: 'test:session' };
const PAYLOAD = '{"app":"geo-builder","facts":[]}';
const T0 = new Date('2026-09-23T10:00:00.000Z');
const later = (ms: number) => new Date(T0.getTime() + ms);

afterEach(uninstallFakeStorage);

describe('#1238 — a stored session is OFFERABLE, never auto-restored', () => {
  it('round-trips a payload verbatim, with the time it was written', () => {
    installFakeStorage();
    writeSession(SPEC, PAYLOAD, T0);
    const got = readSession(SPEC, later(1000));
    expect(got?.payload).toBe(PAYLOAD);
    expect(got?.savedAt).toBe(T0.toISOString());
  });

  it('an EMPTY payload is never written — the write policy the offer depends on', () => {
    const store = installFakeStorage();
    writeSession(SPEC, '', T0);
    expect(store.map.size).toBe(0);
  });

  it('a session older than the window is not offered, and is dropped as it is read', () => {
    const store = installFakeStorage();
    writeSession(SPEC, PAYLOAD, T0);
    expect(readSession(SPEC, later(DEFAULT_SESSION_MAX_AGE_MS + 1))).toBeNull();
    expect(store.map.size, 'a stale record is forgotten, not re-read forever').toBe(0);
  });

  it('honours a caller-chosen window', () => {
    installFakeStorage();
    const spec = { key: SPEC.key, maxAgeMs: 60_000 };
    writeSession(spec, PAYLOAD, T0);
    expect(readSession(spec, later(59_000))).not.toBeNull();
    expect(readSession(spec, later(61_000))).toBeNull();
  });

  it('a record from a FUTURE build refuses rather than half-loading', () => {
    const store = installFakeStorage();
    store.map.set(SPEC.key, JSON.stringify({ v: 99, savedAt: T0.toISOString(), payload: PAYLOAD }));
    expect(readSession(SPEC, later(1))).toBeNull();
  });

  it('a corrupt record is dropped, not thrown', () => {
    const store = installFakeStorage();
    store.map.set(SPEC.key, '{ truncated');
    expect(readSession(SPEC, later(1))).toBeNull();
    expect(store.map.size).toBe(0);
  });

  it('a record with a nonsense timestamp is not offered', () => {
    const store = installFakeStorage();
    store.map.set(SPEC.key, JSON.stringify({ v: 1, savedAt: 'whenever', payload: PAYLOAD }));
    expect(readSession(SPEC, later(1))).toBeNull();
  });

  it('a session written in the FUTURE (a clock that moved back) is not offered', () => {
    installFakeStorage();
    writeSession(SPEC, PAYLOAD, later(60_000));
    expect(readSession(SPEC, T0)).toBeNull();
  });

  it('clearSession forgets it — «start fresh» really is fresh', () => {
    installFakeStorage();
    writeSession(SPEC, PAYLOAD, T0);
    clearSession(SPEC);
    expect(readSession(SPEC, later(1))).toBeNull();
  });
});

describe('#1238 — storage failures degrade, they never take the builder down', () => {
  it('no localStorage at all (a private window, or node): read is null, write is a no-op', () => {
    uninstallFakeStorage();
    expect(() => writeSession(SPEC, PAYLOAD, T0)).not.toThrow();
    expect(readSession(SPEC, T0)).toBeNull();
    expect(() => clearSession(SPEC)).not.toThrow();
  });

  it('a quota-exhausted write is swallowed — the figure stays in memory', () => {
    installFakeStorage({ throwOn: ['set'] });
    expect(() => writeSession(SPEC, PAYLOAD, T0)).not.toThrow();
  });

  it('a SecurityError on read means "no stored session", not a white screen', () => {
    installFakeStorage({ throwOn: ['get'] });
    expect(() => readSession(SPEC, T0)).not.toThrow();
    expect(readSession(SPEC, T0)).toBeNull();
  });

  it('a refused removeItem does not throw out of «start fresh»', () => {
    installFakeStorage({ throwOn: ['remove'] });
    expect(() => clearSession(SPEC)).not.toThrow();
  });
});
