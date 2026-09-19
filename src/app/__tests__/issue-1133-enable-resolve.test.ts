/**
 * #1133 — RE-ENABLING A GIVEN SEARCHES FOR A CONFIGURATION THAT HONOURS IT.
 *
 * A student unticks a given and ticks it back. The requirement returns, the seed is reset to 0
 * (ADR-484), and nothing searched — so the figure could sit there violating a given that the list
 * shows as holding. That is the honesty class this product exists to avoid, reached not by a wrong
 * parse but by a checkbox.
 *
 * Measured on «משולש ABC» · «גובה AD במשולש ABC» · «AB = 10» · «AD = 7», through the REAL submit path
 * (so the figure starts where the app would leave it):
 *
 * ```
 * after the build    seed 3   meetsRequirements: true    <- the submit's own search found seed 3
 * disable the given  seed 0   meetsRequirements: true       (fewer requirements to meet)
 * re-enable it       seed 0   meetsRequirements: FALSE   <- the defect
 * ```
 *
 * **Re-enabling is not like deleting.** `removeGroup` is exempt from the search because deletion only
 * relaxes; re-enabling ADDS a requirement back, which is the direction a submit goes — and submits have
 * always searched. The two look like one "toggling" concern and behave like opposites, which is exactly
 * what an un-enumerated inventory hides (#1132).
 *
 * Per the lesson recorded in `issue-1041-edit-resolve.test.ts`: **drive the production adapter and
 * inject the dep.** A test that flips the store directly proves the store contract, not the wiring —
 * and the wiring is what was missing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...args: unknown[]) => llmParseMock(...args) }));

import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { findValidConfig, meetsRequirements } from '@/replay/core';
import { runSetGroupEnabled, runToggleFact } from '@/app/editPipeline';
import { runSubmit, type SubmitDeps } from '@/app/submitPipeline';

const LINES = ['משולש ABC', 'גובה AD במשולש ABC', 'AB = 10', 'AD = 7'];
const st = () => useGeoStore.getState();

/** The App's real post-commit search, as `App.tsx` binds it. */
let resolveCalls = 0;
const resolveAfterCommit = () => {
  resolveCalls++;
  const s = st();
  // `runViewResolve`'s own early return: a figure that already holds costs nothing.
  if (meetsRequirements(s.facts, s.seed)) return;
  const found = findValidConfig(s.facts, s.seed);
  if (!found) return;
  st().applyView({ facts: found.facts, seed: found.seed });
};
const deps = { resolveAfterCommit };

function submitDeps(): SubmitDeps {
  return {
    t: (key) => key,
    locale: 'he',
    ui: {
      setInputNote: () => {},
      setRenameNote: () => {},
      setLlmDropped: () => {},
      clearText: () => {},
      setBusy: () => {},
    },
    view: () => {
      const s = st();
      const d = replay(s.facts, s.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit,
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
}

async function buildFigure() {
  for (const u of LINES) await runSubmit(u, submitDeps());
}

beforeEach(() => {
  st().clear();
  resolveCalls = 0;
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ ok: false, reason: 'test: no live calls' });
});

describe('#1133 — the enable seams launch the post-commit search', () => {
  it('the fixture still STRANDS — the figure is one whose seed 0 does not satisfy it', async () => {
    /**
     * Asserted first, and about the fixture rather than the fix: the trigger is narrow (it bites only
     * where seed 0 happens to be one of the few unsatisfiable configurations), so a lock aimed at it
     * must prove its own case is still a case. Without this, the test below could pass forever on a
     * figure that stopped stranding.
     */
    await buildFigure();
    expect(st().seed, 'the submit had to search, so seed 0 does not satisfy this figure').not.toBe(0);
    expect(meetsRequirements(st().facts, 0)).toBe(false);
  });

  it('disable then re-enable leaves a figure that MEETS its requirements', async () => {
    await buildFigure();
    const key = groupKey(st().facts[st().facts.length - 1]);
    runSetGroupEnabled(key, false, deps);
    runSetGroupEnabled(key, true, deps);
    // The given is ticked; the figure must honour it.
    expect(meetsRequirements(st().facts, st().seed)).toBe(true);
    expect(st().facts.every((f) => f.enabled)).toBe(true);
  });

  it('DISABLING costs nothing — the search is launched, and returns at its own early exit', async () => {
    /**
     * The trigger is deliberately NOT conditioned on "only when re-enabling". `runViewResolve` already
     * early-returns when `meetsRequirements` holds, and a second copy of that test at the call site is
     * the precise shape that caused #1041. So what is asserted is that the seam CALLS, and that a
     * disable changes no configuration.
     */
    await buildFigure();
    const key = groupKey(st().facts[st().facts.length - 1]);
    const before = st().seed;
    resolveCalls = 0;
    runSetGroupEnabled(key, false, deps);
    expect(resolveCalls, 'the seam calls unconditionally').toBe(1);
    // Relaxing cannot break the figure, so nothing was re-searched away from.
    expect(meetsRequirements(st().facts, st().seed)).toBe(true);
    expect(st().seed === 0 || st().seed === before).toBe(true);
  });

  it('the SINGLE-fact toggle is armed the same way', async () => {
    await buildFigure();
    const last = st().facts[st().facts.length - 1];
    runToggleFact(last.id, deps);
    runToggleFact(last.id, deps);
    expect(st().facts.every((f) => f.enabled)).toBe(true);
    expect(meetsRequirements(st().facts, st().seed)).toBe(true);
  });

  it('the store action ALONE still strands — so this lock is testing the wiring', async () => {
    /**
     * The counterpart of the #1041 lesson: flipping the store directly must still leave the figure
     * broken. If this ever passes, the search moved back inside the store and these seams stopped
     * being the thing under test.
     */
    await buildFigure();
    const key = groupKey(st().facts[st().facts.length - 1]);
    st().setGroupEnabled(key, false);
    st().setGroupEnabled(key, true);
    expect(meetsRequirements(st().facts, st().seed)).toBe(false);
  });
});
