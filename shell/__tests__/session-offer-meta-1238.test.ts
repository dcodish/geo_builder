/**
 * The META-lock for the session-offer checks (#1238, docs/28 §5c rule 5).
 *
 * The four per-tree locks all call `sessionOfferFaults`, so a check that silently stops checking
 * turns four green tests into four that prove nothing. This runs the SAME function against
 * deliberately broken builders and asserts each fault is actually caught — including the one the
 * whole feature rests on, a builder that persists its empty boot state and so erases the session
 * it was about to offer.
 */
import { describe, expect, it } from 'vitest';
import type { SessionAdapter } from '../session/adapter';
import { sessionOfferFaults, type SessionOfferSubject } from './fixtures/session-offer-rows';

type Bug = 'persists-empty' | 'accepts-anything' | 'restore-is-a-no-op' | 'reset-is-a-no-op';

/** A miniature builder whose session is a list of lines — enough to exercise every row. */
function stub(bug?: Bug): SessionOfferSubject {
  let lines: string[] = [];
  const adapter: SessionAdapter = {
    spec: { key: 'stub:session' },
    snapshot: () => (bug === 'persists-empty' || lines.length > 0 ? JSON.stringify(lines) : null),
    restore: async (payload) => {
      if (bug === 'accepts-anything') {
        lines = ['whatever'];
        return true;
      }
      if (bug === 'restore-is-a-no-op') return true;
      try {
        const parsed: unknown = JSON.parse(payload);
        if (!Array.isArray(parsed) || parsed.length === 0) return false;
        lines = parsed.map(String);
        return true;
      } catch {
        return false;
      }
    },
    isEmpty: () => lines.length === 0,
    reset: () => {
      if (bug !== 'reset-is-a-no-op') lines = [];
    },
  };
  return { adapter, populate: () => void (lines = ['z = 1 + i']), foreign: JSON.stringify({ app: 'another-builder' }) };
}

describe('#1238 — the shared offer checks really check', () => {
  it('a conforming builder reports no faults', async () => {
    expect(await sessionOfferFaults(stub())).toEqual([]);
  });

  it('CATCHES a builder that persists its empty boot state (it would erase the offer)', async () => {
    const faults = await sessionOfferFaults(stub('persists-empty'));
    expect(faults.join(' | ')).toMatch(/EMPTY session produced a payload/);
  });

  it('CATCHES a builder that accepts a foreign or corrupt payload', async () => {
    const faults = await sessionOfferFaults(stub('accepts-anything'));
    expect(faults.join(' | ')).toMatch(/was ACCEPTED as a session/);
  });

  it('CATCHES a restore that claims success and loads nothing', async () => {
    const faults = await sessionOfferFaults(stub('restore-is-a-no-op'));
    expect(faults.join(' | ')).toMatch(/left the session empty/);
  });

  it('CATCHES a «start fresh» that does not clear', async () => {
    const faults = await sessionOfferFaults(stub('reset-is-a-no-op'));
    expect(faults.join(' | ')).toMatch(/after a populated session did not clear it/);
  });
});
