/**
 * 3-D's thin lock on the session OFFER (#1238, ADR-W-068) — the shared checks, this tree's adapter
 * (docs/28 §5c rule 3), plus the property that is 3-D's own: a restored session comes back through
 * `derive3` as the same figure, and its undo history starts empty.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { restoreSession3, sessionPayload3, session3Adapter } from '../store/sessionPersist3';
import { sessionOfferFaults } from '../../shell/__tests__/fixtures/session-offer-rows';
import { installFakeStorage, uninstallFakeStorage } from '../../shell/__tests__/fixtures/fakeStorage';

/** The real submit path — one utterance is one step, as the app commits it. */
function build(utterances: string[]) {
  for (const u of utterances) {
    useGeo3.getState().submit(u);
    if (useGeo3.getState().lastError) throw new Error(`setup failed on «${u}»: ${JSON.stringify(useGeo3.getState().lastError)}`);
  }
}

/** A 2-D save file — must be refused, never half-loaded. */
const FOREIGN = JSON.stringify({ app: 'geo-builder', schemaVersion: 1, seed: 0, facts: [] });

beforeEach(() => {
  installFakeStorage();
  useGeo3.getState().clear();
});
afterEach(() => {
  useGeo3.getState().clear();
  uninstallFakeStorage();
});

describe('#1238 — the 3-D builder conforms to the shared offer contract', () => {
  it('no faults against the cross-product checks', async () => {
    const faults = await sessionOfferFaults({
      adapter: session3Adapter,
      populate: () => build(['תיבה ABCDA1B1C1D1']),
      foreign: FOREIGN,
    });
    expect(faults).toEqual([]);
  });
});

describe('#1238 — a restored session is a LOAD, in this tree', () => {
  it('the figure comes back structurally identical, at the same seed', () => {
    build(['תיבה ABCDA1B1C1D1']);
    const priorCmds = useGeo3.getState().facts.map((f) => f.cmds);
    const priorSeed = useGeo3.getState().seed;
    const before = derive3(useGeo3.getState().facts, priorSeed);
    expect(before.positions.size, 'the setup figure must actually have points').toBeGreaterThan(3);

    const payload = sessionPayload3();
    expect(payload).not.toBeNull();
    useGeo3.getState().clear();
    expect(restoreSession3(payload as string).ok).toBe(true);

    const st = useGeo3.getState();
    expect(st.facts.map((f) => f.cmds)).toEqual(priorCmds);
    expect(st.seed).toBe(priorSeed);
    const after = derive3(st.facts, st.seed);
    expect([...after.positions.keys()].sort()).toEqual([...before.positions.keys()].sort());
  });

  it('the undo history starts EMPTY after a restore', () => {
    build(['תיבה ABCDA1B1C1D1']);
    const payload = sessionPayload3() as string;
    useGeo3.getState().clear();
    restoreSession3(payload);
    expect(useGeo3.temporal.getState().pastStates.length).toBe(0);
  });
});

describe('#1238 — an empty canvas never overwrites the stored session', () => {
  it('a fresh boot state produces no payload at all', () => {
    expect(useGeo3.getState().facts).toEqual([]);
    expect(sessionPayload3()).toBeNull();
  });
});
