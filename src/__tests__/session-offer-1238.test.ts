/**
 * 2-D's thin lock on the session OFFER (#1238, ADR-W-068) — the shared checks, this tree's adapter
 * (docs/28 §5c rule 3).
 *
 * Plus the two properties that are 2-D's own: a restored session is a LOAD (so it comes back
 * through `replay` as the same figure, not as stored coordinates — there are none), and the undo
 * history starts EMPTY, because a restore is not a replay of the student's keystrokes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildParseCtx, parse } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';
import { geoSessionAdapter, restoreSession, sessionPayload } from '@/store/sessionPersist';
import { sessionOfferFaults } from '../../shell/__tests__/fixtures/session-offer-rows';
import { installFakeStorage, uninstallFakeStorage } from '../../shell/__tests__/fixtures/fakeStorage';

const ctxOf = () => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return buildParseCtx(d.construction, d.positions);
};

function build(utterances: string[]) {
  for (const u of utterances) {
    const r = parse(u, ctxOf());
    if (!r.ok) throw new Error(`setup failed on «${u}»: ${JSON.stringify(r)}`);
    // executeMany, not execute-per-command: one utterance is ONE step with one group id, and the
    // group is what the load path reads to re-lower a step as a unit (loadAudit.stepsOf). Committing
    // the commands separately would make each one its own step and is not what the app does.
    useGeoStore.getState().executeMany(r.commands, u);
  }
}

/** Another builder's save file — must be refused, never half-loaded. */
const FOREIGN = JSON.stringify({ app: '3d-builder', schemaVersion: 1, seed: 0, facts: [] });

beforeEach(() => {
  installFakeStorage();
  useGeoStore.getState().clear();
});
afterEach(() => {
  useGeoStore.getState().clear();
  uninstallFakeStorage();
});

describe('#1238 — the 2-D builder conforms to the shared offer contract', () => {
  it('no faults against the cross-product checks', async () => {
    const faults = await sessionOfferFaults({
      adapter: geoSessionAdapter,
      populate: () => build(['משולש ABC']),
      foreign: FOREIGN,
    });
    expect(faults).toEqual([]);
  });
});

describe('#1238 — a restored session is a LOAD, in this tree', () => {
  it('the figure comes back structurally identical — through replay, never as stored positions', async () => {
    build(['ריבוע ABCD', 'נקודה G על AD']);
    const priorCmds = useGeoStore.getState().facts.map((f) => f.cmd);
    const priorSeed = useGeoStore.getState().seed;
    const before = replay(useGeoStore.getState().facts, priorSeed);
    expect(before.positions.size, 'the setup figure must actually have points').toBeGreaterThan(3);
    const payload = sessionPayload();
    expect(payload).not.toBeNull();

    useGeoStore.getState().clear();
    const outcome = await restoreSession(payload as string);
    expect(outcome.ok).toBe(true);

    const st = useGeoStore.getState();
    const after = replay(st.facts, st.seed);
    expect(st.facts.map((f) => f.cmd)).toEqual(priorCmds);
    expect([...after.positions.keys()].sort()).toEqual([...before.positions.keys()].sort());
    for (const [id, p0] of before.positions) {
      const p1 = after.positions.get(id)!;
      expect(p1.x).toBeCloseTo(p0.x, 9);
      expect(p1.y).toBeCloseTo(p0.y, 9);
    }
    // The seed rides with the payload, so the student comes back to the configuration they left.
    expect(st.seed).toBe(priorSeed);
  });

  it('the undo history starts EMPTY after a restore — there is no earlier session to go back to', async () => {
    build(['משולש ABC']);
    const payload = sessionPayload() as string;
    useGeoStore.getState().clear();
    await restoreSession(payload);
    expect(useGeoStore.temporal.getState().pastStates.length).toBe(0);
  });

  it('a FILE load keeps its history — one undo still returns the session that was open before', async () => {
    build(['משולש ABC']);
    const payload = sessionPayload() as string;
    build(['ריבוע KLMN']);
    const { loadFigureText } = await import('@/store/figureLoad');
    const before = useGeoStore.temporal.getState().pastStates.length;
    await loadFigureText(payload); // no resetHistory — the file-picker path
    expect(useGeoStore.temporal.getState().pastStates.length).toBeGreaterThan(before - 1);
    useGeoStore.temporal.getState().undo();
    expect(useGeoStore.getState().facts.some((f) => f.utterance === 'ריבוע KLMN')).toBe(true);
  });
});

describe('#1238 — an empty canvas never overwrites the stored session', () => {
  it('a fresh boot state produces no payload at all', () => {
    expect(useGeoStore.getState().facts).toEqual([]);
    expect(sessionPayload()).toBeNull();
  });
});
