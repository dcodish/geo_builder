/**
 * #1671 ([ADR-584](../../../docs/06-decisions.md#adr-584)) — THE SEAT SWEEP FINISHES, SO AN IMPOSSIBLE LINE IS
 * REFUSED ON A RIGHT TRIANGLE WHOSE RIGHT ANGLE THE STUDENT NEVER PLACED.
 *
 * ADR-564 refuses a line whose claim the fold concluded impossible — except on a figure with an UNPINNED
 * right-angle seat, where the verdict is only the current seat's and an unstated seat may still cure it. The
 * gate's seat sweep decides that, under a 1.5 s budget, and it reads one fold per rotated seat: cold, those
 * cost seconds, the sweep gave up, and the line committed red. Measured on 7ed5baa8 through this door:
 * «המיתר AM מקביל ל-DE» (M the midpoint of AB, the triangle inscribed) committed with three red rows.
 * Operator ruling 2026-10-04: make the check fast — the budget is not raised. The submit path now warms the
 * rotated folds off the main thread (the ADR-290 worker prefold) before the dry run, so the sweep pays only
 * per-seed tails and FINISHES; a finished sweep that cured nothing is a proof, and the gate refuses.
 * Every lock counts operations or reads verdicts; none times anything.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { clearReplayCaches, seatSweepStats } from '@/replay/core';
import i18n from '@/i18n';

async function submit(line: string): Promise<{ accepted: boolean; notes: string[] }> {
  const notes: string[] = [];
  let cleared = 0;
  const deps: SubmitDeps = {
    t: (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string,
    locale: 'he',
    ui: { setInputNote: (m) => { if (m) notes.push(m); }, setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => { cleared++; }, setBusy: () => {} },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => String(raw),
  };
  await runSubmit(line, deps);
  return { accepted: cleared === 1, notes };
}

/** The verdict on `line` after `prefix`, and what the gate's seat sweep did for it (counts). */
async function verdict(prefix: string[], line: string) {
  useGeoStore.getState().clear();
  for (const l of prefix) expect((await submit(l)).accepted, `«${l}» is accepted`).toBe(true);
  const before = useGeoStore.getState().facts.length;
  const s0 = { ...seatSweepStats };
  const r = await submit(line);
  const st = useGeoStore.getState();
  return {
    accepted: r.accepted,
    note: r.notes.join(' | ').replace(/[⁦-⁩]/g, ''),
    committed: st.facts.length - before,
    sweep: {
      complete: seatSweepStats.complete - s0.complete,
      cured: seatSweepStats.cured - s0.cured,
      cut: seatSweepStats.cut - s0.cut,
      executed: seatSweepStats.executed - s0.executed,
      charged: seatSweepStats.charged - s0.charged,
    },
  };
}

const INSCRIBED_RIGHT = ['משולש ישר זווית ABC', 'משולש ABC חסום במעגל'];
const MIDPOINT_M = [...INSCRIBED_RIGHT, 'M אמצע AB', 'קטע DE'];

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ commands: [], none: true });
});

describe('#1671 — an impossible line beside an unstated right angle is refused, cold and warm alike', () => {
  it('«המיתר AM מקביל ל-DE» (M the midpoint of AB): refused with the conflict, nothing committed — the sweep FINISHED and cured nothing', async () => {
    clearReplayCaches();
    const cold = await verdict(MIDPOINT_M, 'המיתר AM מקביל ל-DE');
    const warm = await verdict(MIDPOINT_M, 'המיתר AM מקביל ל-DE');
    for (const v of [cold, warm]) {
      expect(v.accepted, `refused (note: ${v.note})`).toBe(false);
      expect(v.committed, 'nothing committed').toBe(0);
      expect(v.note).toMatch(/OM\| = \|OA\| cannot hold/);
      expect(v.sweep, 'the sweep finished — it was never cut by its 1.5 s budget').toMatchObject({ complete: 1, cured: 0, cut: 0 });
    }
    expect(warm.note, 'one verdict').toBe(cold.note);
    expect(llmParseMock, 'a conflict is never escalated').not.toHaveBeenCalled();
  }, 300_000);

  it('the sweep\'s own work is the same cold and warm, and small — its rotated folds were warmed before it', async () => {
    clearReplayCaches();
    const cold = await verdict(MIDPOINT_M, 'המיתר AM מקביל ל-DE');
    const warm = await verdict(MIDPOINT_M, 'המיתר AM מקביל ל-DE');
    expect(warm.sweep.charged, 'the sweep charged work (every memo hit charged, ADR-582), cold = warm').toBe(cold.sweep.charged);
    // tails only: the six seeds of each rotated seat (failing evaluates), no fold — measured 472k executed
    for (const v of [cold, warm]) expect(v.sweep.executed, 'no fold is computed inside the 1.5 s budget').toBeLessThan(600_000);
  }, 300_000);
});

describe('#1671 — a line an unstated seat DOES cure still commits (ADR-564 decision 3)', () => {
  it('«קשת AB = קשת BC» (#546 — the right angle at B satisfies it): committed, cold and warm, the sweep finding the cure', async () => {
    clearReplayCaches();
    for (const pass of ['cold', 'warm']) {
      const v = await verdict(INSCRIBED_RIGHT, 'קשת AB = קשת BC');
      expect(v.accepted, `${pass}: committed (note: ${v.note})`).toBe(true);
      expect(v.sweep, `${pass}: cured inside the budget, never cut`).toMatchObject({ cured: 1, cut: 0 });
    }
  }, 300_000);

  it('the same impossible line on a PINNED seat is refused as before (no sweep)', async () => {
    clearReplayCaches();
    const v = await verdict(['משולש ישר זווית ABC', 'זווית ACB = 90', 'משולש ABC חסום במעגל', 'M אמצע AB', 'קטע DE'], 'המיתר AM מקביל ל-DE');
    expect(v.accepted).toBe(false);
    expect(v.sweep).toMatchObject({ complete: 0, cured: 0, cut: 0 });
  }, 300_000);
});
