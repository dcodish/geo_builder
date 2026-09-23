/**
 * The complex builder's thin lock on the session OFFER (#1238, ADR-W-068) — the shared checks, this
 * tree's adapter (docs/28 §5c rule 3).
 *
 * This tree is where the rule came from: #919 removed `src-complex/app/session.ts`, which
 * re-submitted every stored line on each page load, and ADR-W-046 ruled "clean canvas always". The
 * companion lock `no-session-restore-919.test.ts` still asserts that nothing restores at BOOT; this
 * one asserts that what the student can now ask for actually works.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { submitLine } from '../app/submit';
import { restoreSessionCx, sessionCxAdapter, sessionPayloadCx } from '../app/sessionPersistCx';
import { useComplexStore } from '../store/useComplexStore';
import { sessionOfferFaults } from '../../shell/__tests__/fixtures/session-offer-rows';
import { installFakeStorage, uninstallFakeStorage } from '../../shell/__tests__/fixtures/fakeStorage';

/** A 2-D save file — must be refused, never half-loaded. */
const FOREIGN = JSON.stringify({ app: 'geo-builder', schemaVersion: 1, seed: 0, facts: [] });

function build(lines: string[]) {
  for (const l of lines) if (!submitLine(l)) throw new Error(`setup failed on «${l}»`);
}

beforeEach(() => {
  installFakeStorage();
  useComplexStore.getState().resetSession();
});
afterEach(() => {
  useComplexStore.getState().resetSession();
  uninstallFakeStorage();
});

describe('#1238 — the complex builder conforms to the shared offer contract', () => {
  it('no faults against the cross-product checks', async () => {
    const faults = await sessionOfferFaults({
      adapter: sessionCxAdapter,
      populate: () => build(['z1 = 3 + 4i']),
      foreign: FOREIGN,
    });
    expect(faults).toEqual([]);
  });
});

describe('#1238 — a restored session is an AUDITED load, in this tree', () => {
  it('the lines come back in order, through the real hydrate', () => {
    build(['z1 = 3 + 4i', 'z2 = 1 - 2i']);
    const priorLines = [...useComplexStore.getState().lines];
    expect(priorLines.length, 'the setup must actually have lines').toBe(2);

    const payload = sessionPayloadCx();
    expect(payload).not.toBeNull();
    useComplexStore.getState().resetSession();
    expect(restoreSessionCx(payload as string)).toBe(true);
    expect(useComplexStore.getState().lines).toEqual(priorLines);
  });

  it('a foreign envelope is refused and the canvas is left alone', () => {
    build(['z1 = 3 + 4i']);
    expect(restoreSessionCx(FOREIGN)).toBe(false);
    expect(useComplexStore.getState().lines).toEqual(['z1 = 3 + 4i']);
  });
});

describe('#1238 — an empty canvas never overwrites the stored session', () => {
  it('a fresh boot state produces no payload at all', () => {
    expect(useComplexStore.getState().lines).toEqual([]);
    expect(sessionPayloadCx()).toBeNull();
  });
});
