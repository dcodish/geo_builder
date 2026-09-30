/**
 * #364 ([ADR-510](../../../docs/06-decisions.md#adr-510)) — the submit/edit seed auto-advance is OFF the UI
 * thread: facts commit at the student's current seed, the post-commit resolve owns the search.
 *
 * The operator's ruling (2026-09-11): "accept the flash". Before, `commitCommands` / `replaceGroup` ran
 * `firstSatisfyingSeed` synchronously under a 2.5 s budget whenever the appended step left the view
 * violating a requirement — the last budgeted sweep on the main thread (ADR-401's ratchet recorded it).
 * Now the commit is the facts alone; the violating configuration may paint for one frame; the worker's
 * `autoResolve` (whose first tier IS `firstSatisfyingSeed`, sweeping from the CURRENT seed) applies the
 * valid view under a paused history, so one undo still removes the whole action.
 *
 * The measured case is #938's: `SEQ` refuses at seed 4 (one of three in 0..199). The plan's other named
 * figure (#157's trapezoid-midsegment) builds clean at seed 0 on every step — measured; no resolve fires
 * and nothing freezes — so it is not a lock here.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeoStore, meetsRequirements, findValidConfig, replay } from '@/store/geoStore';
import { runViewResolve } from '@/app/resolveView';
import { geoWork, isCancelled } from '@/store/geoWork';
import { parse } from '@/parser';
import { ctxOf } from '../../__tests__/scenario-pipeline';

const SEQ = ['משולש ABC', 'זוית B ישרה', 'ריבוע DEFG חסום במשולש ABC'];
/** Measured to refuse this fact list (#938): one of exactly three seeds in 0..199. */
const BROKEN_SEED = 4;

function submit(u: string) {
  const r = parse(u, ctxOf(useGeoStore.getState().facts));
  if (!r.ok) throw new Error(`parse failed for «${u}»`);
  useGeoStore.getState().executeMany(r.commands, u);
}
const build = () => {
  for (const u of SEQ) submit(u);
};
const state = () => useGeoStore.getState();
const past = () => useGeoStore.temporal.getState().pastStates.length;

/** The App's `resolveAfterCommit`, shape for shape (App.tsx): the worker search, then `applyView` under a
 *  PAUSED history so the rewrite merges into the commit's own entry. */
async function resolveAfterCommit(): Promise<void> {
  await runViewResolve({
    getState: () => state(),
    meetsRequirements,
    autoResolve: (facts, seed) => geoWork.autoResolve(facts, seed),
    applyView: (found) => {
      const temporal = useGeoStore.temporal.getState();
      temporal.pause();
      try {
        state().applyView({ facts: found.facts, seed: found.seed });
      } finally {
        temporal.resume();
      }
    },
    setPending: () => {},
    onExhausted: () => {
      throw new Error('exhausted');
    },
    isCancelled,
  });
}

beforeEach(() => {
  useGeoStore.setState({ facts: [], seed: 0, selectedId: null });
  useGeoStore.temporal.getState().clear();
});

describe('#364 — the commit is the facts alone; the resolve is a separate, off-thread step', () => {
  it('appending at a broken seed COMMITS at that seed — the flash the operator accepted', () => {
    build();
    useGeoStore.setState({ seed: BROKEN_SEED });
    submit('נקודה H על AB');
    expect(state().seed, 'no synchronous search moved the seed').toBe(BROKEN_SEED);
    expect(replay(state().facts, state().seed).lastError, 'the committed view is the violating one, for a frame').not.toBeNull();
  });

  it('the post-commit resolve lands the first valid seed AT OR AFTER the current one (M2: the view in hand is preferred)', async () => {
    build();
    useGeoStore.setState({ seed: BROKEN_SEED });
    submit('נקודה H על AB');
    await resolveAfterCommit();
    const { facts, seed } = state();
    expect(meetsRequirements(facts, seed), 'resolved to a valid configuration').toBe(true);
    expect(seed, 'swept upward from the current seed, never from 0').toBeGreaterThanOrEqual(BROKEN_SEED);
    for (let s = BROKEN_SEED; s < seed; s++) expect(meetsRequirements(facts, s), `seed ${s} was skipped although valid`).toBe(false);
  }, 300_000);

  it('the resolve merges into the commit’s history entry: one undo removes the fact AND restores the seed', async () => {
    build();
    useGeoStore.setState({ seed: BROKEN_SEED });
    const before = { n: state().facts.length, past: past() };
    submit('נקודה H על AB');
    expect(past(), 'the commit is one entry').toBe(before.past + 1);
    await resolveAfterCommit();
    expect(past(), 'the resolve adds NO entry').toBe(before.past + 1);
    expect(state().seed).not.toBe(BROKEN_SEED);
    useGeoStore.temporal.getState().undo();
    expect(state().facts.length, 'undo removed the appended fact').toBe(before.n);
    expect(state().seed, 'and restored the seed it was appended at').toBe(BROKEN_SEED);
  }, 300_000);

  it('a clean append pays nothing: no resolve, no seed change', async () => {
    build();
    const seed = state().seed;
    submit('נקודה H על AB');
    expect(meetsRequirements(state().facts, seed)).toBe(true);
    await resolveAfterCommit();
    expect(state().seed).toBe(seed);
  });

  it('the store’s own autoResolve sweeps from the current seed too (the synchronous path the harness drives)', () => {
    build();
    useGeoStore.setState({ seed: BROKEN_SEED });
    submit('נקודה H על AB');
    expect(state().autoResolve()).toBe(true);
    expect(state().seed).toBeGreaterThanOrEqual(BROKEN_SEED);
    expect(findValidConfig(state().facts, BROKEN_SEED)?.seed, 'the same answer findValidConfig gives from that seed').toBe(state().seed);
  }, 300_000);

  it('the ✎ edit path: the seed resets to 0 (ADR-484) and NO synchronous search runs; the resolve covers it the same way', async () => {
    build();
    useGeoStore.setState({ seed: BROKEN_SEED });
    const key = state().facts[state().facts.length - 1].group ?? state().facts[state().facts.length - 1].id;
    const r = parse(SEQ[2], ctxOf(state().facts.slice(0, -1)));
    if (!r.ok) throw new Error('parse');
    // an edited group: same statement re-lowered; the store must commit at seed 0 without searching
    state().replaceGroup(key, r.commands, SEQ[2]);
    expect(state().seed).toBe(0);
    await resolveAfterCommit();
    expect(meetsRequirements(state().facts, state().seed)).toBe(true);
  }, 300_000);
});
