/**
 * #938 (ADR-484) — RE-ENTERING THE SAME LINE MUST GIVE THE SAME FIGURE, AND A BROKEN SEED IS
 * REPLACED RATHER THAN SHOWN.
 *
 * Operator, 2026-09-08, session `gdqn7w0n`: *"at first run the square was drawn in the triangle
 * correctly. pressing show another config, took me through cases … next i delete the square line and
 * tried to re-enter it and now its refused although the same line was there a second ago."*
 *
 * MEASURED, not inferred. `['משולש ABC', 'זוית B ישרה', 'ריבוע DEFG חסום במשולש ABC']` replayed at
 * 200 seeds: **197 build, 3 refuse — seeds 4, 37, 139**. At a refusing seed the evaluate fails, so
 * `positions` is EMPTY, `violations` is empty (nothing to verify), and every fact row still read
 * `ok` — the panel said "all clear" about a drawing with nothing in it.
 *
 * TWO defects compose, and the second is the one the plan for this issue did not name:
 *
 *  1. `remove` / `removeGroup` dropped the fact and never touched `seed`, so the configuration the
 *     student had cycled to survived the delete and the re-typed line replayed there. Fixed by the
 *     operator's ruling — a structural edit resets the seed.
 *  2. The satisfying-seed search in `commitCommands` / `replaceGroup` was gated on
 *     `fig.lastError === null` — armed for a figure that builds and looks bad, DISARMED for a figure
 *     that does not build at all. The tool sat on one of the 3 broken seeds while 197 worked.
 *
 * The undo carve-out has its own test below and it is the one a naive reading of the ruling gets
 * wrong: undo restores a STATE, so it must put back the seed the delete cleared, or undo stops being
 * the inverse of the action it undoes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeoStore, replay, groupKey } from '@/store/geoStore';
import { parse } from '@/parser';
import { ctxOf } from '../../__tests__/scenario-pipeline';

const SEQ = ['משולש ABC', 'זוית B ישרה', 'ריבוע DEFG חסום במשולש ABC'];
/** A seed measured to refuse this fact list — one of exactly three in 0..199. */
const BROKEN_SEED = 4;

function submit(u: string) {
  const r = parse(u, ctxOf(useGeoStore.getState().facts));
  if (!r.ok) throw new Error(`parse failed for «${u}»`);
  useGeoStore.getState().executeMany(r.commands, u);
}

const build = () => {
  useGeoStore.setState({ facts: [], seed: 0 });
  useGeoStore.temporal.getState().clear();
  for (const u of SEQ) submit(u);
};

const fig = () => {
  const st = useGeoStore.getState();
  return replay(st.facts, st.seed);
};

beforeEach(() => {
  useGeoStore.setState({ facts: [], seed: 0, selectedId: null });
  useGeoStore.temporal.getState().clear();
});

describe('#938 — the operator’s report', () => {
  it('the seed is REAL hidden state: seed 4 refuses a fact list 197 of 200 seeds draw', () => {
    build();
    const facts = useGeoStore.getState().facts;
    const refusing = [];
    for (let s = 0; s < 200; s++) if (replay(facts, s).lastError !== null) refusing.push(s);
    // The premise of the whole issue. If this ever changes, the numbers in this file are stale and the
    // fix should be re-measured rather than the constant edited.
    expect(refusing).toEqual([4, 37, 139]);
  }, 300000);

  it('delete the square, re-enter the identical line → the SAME outcome as the first time', () => {
    build();
    expect(fig().lastError).toBeNull();

    useGeoStore.setState({ seed: BROKEN_SEED }); // what ~18 «הצג תצורה אחרת» presses reached
    expect(fig().lastError).not.toBeNull();

    const st = useGeoStore.getState();
    useGeoStore.getState().removeGroup(groupKey(st.facts[st.facts.length - 1]));
    expect(useGeoStore.getState().seed).toBe(0); // the ruling: a structural edit resets the seed

    submit(SEQ[2]);
    expect(fig().lastError).toBeNull(); // «the same line was there a second ago» — and now it is
  }, 300000);

  /**
   * The issue's third clause — *"a step that placed nothing may not report `ok`"* — is NOT implemented,
   * and this is the measurement that says why. Its premise was that the panel reads "all clear" beside
   * an empty figure. It does not: the OWNING row carries the error and the banner is red. Only the
   * innocent rows stay green, which is [ADR-398](../../../docs/06-decisions.md#adr-398) working as
   * ruled — *"the square is innocent"*, *"no blanket reddening"*, locked in
   * `replay/__tests__/status-attribution.test.ts`. Reddening every row would destroy the one thing the
   * panel is for: pointing at the line that failed.
   */
  it('a broken seed is never "all clear": the banner is red and the OWNING row carries it', () => {
    build();
    const facts = useGeoStore.getState().facts;
    const broken = replay(facts, BROKEN_SEED);
    expect(broken.positions.size).toBe(0); // the figure does not exist at this seed
    expect(broken.lastError).not.toBeNull();
    const red = facts.filter((f) => f.enabled && broken.status[f.id] !== 'ok');
    expect(red.length).toBeGreaterThan(0); // somebody is blamed — the panel is not silent
    expect(red.every((f) => broken.status[f.id] === broken.lastError)).toBe(true); // and it agrees with the banner
    // ADR-398's precision, asserted the same way round: this is NOT a blanket reddening.
    expect(red.length).toBeLessThan(facts.filter((f) => f.enabled).length);
  }, 300000);

  it('appending a fact at a broken seed SEARCHES for a working one instead of showing the break', () => {
    // Defect 2 on its own, with no delete involved: the guard that skipped the search is what made a
    // broken view survive every later action.
    build();
    useGeoStore.setState({ seed: BROKEN_SEED });
    expect(fig().lastError).not.toBeNull();

    submit('נקודה H על AB');
    expect(useGeoStore.getState().seed).not.toBe(BROKEN_SEED);
    expect(fig().lastError).toBeNull();
  }, 300000);
});

describe('#938 — what a structural edit is, and what it is not', () => {
  it('undo of a delete restores the seed the delete cleared — undo is the INVERSE', () => {
    build();
    useGeoStore.setState({ seed: BROKEN_SEED });
    const before = { facts: useGeoStore.getState().facts, seed: useGeoStore.getState().seed };

    const st = useGeoStore.getState();
    useGeoStore.getState().removeGroup(groupKey(st.facts[st.facts.length - 1]));
    expect(useGeoStore.getState().seed).toBe(0);

    useGeoStore.temporal.getState().undo();
    // Byte-identical to before the delete — the facts AND the configuration they were seen at.
    expect(useGeoStore.getState().facts).toEqual(before.facts);
    expect(useGeoStore.getState().seed).toBe(before.seed);
  }, 300000);

  it('toggling a step off resets the seed — it changes what replays', () => {
    build();
    useGeoStore.setState({ seed: 7 });
    const st = useGeoStore.getState();
    useGeoStore.getState().setGroupEnabled(groupKey(st.facts[st.facts.length - 1]), false);
    expect(useGeoStore.getState().seed).toBe(0);
  }, 300000);

  it('renaming does NOT reset the seed — relabelling is not a change to the construction', () => {
    build();
    useGeoStore.setState({ seed: 7 });
    useGeoStore.getState().setFigureName('בגרות 35582');
    expect(useGeoStore.getState().seed).toBe(7);
  }, 300000);
});
