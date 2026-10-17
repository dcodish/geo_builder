/**
 * #1857 ([ADR-709](../../../docs/06-decisions.md#adr-709)) — THE GATE'S UNSTATED-CHOICE RESCUE IS BOUNDED BY WORK,
 * SO ONE LINE GETS ONE VERDICT ON EVERY MACHINE, COLD OR WARM.
 *
 * On «משולש שווה שוקיים ABC» · «AB = 4», the line «BC = 8» cannot hold at the default apex (AB = AC = 4 would
 * put A, B, C on one line) but holds at another apex (CA = CB = 8). The dry run's choice rescue (`choiceRescue`,
 * ADR-573/593) finds that cure — and it ran under `Date.now() + 1500`. Measured at b0e9dbea through this door:
 * cold, the first candidate's fold (the apex at B, an impossible 4 = 8) cost ~2.1M evaluations (~3 s), the
 * clock ran out before the curing apex was read, and the line was REFUSED as collapsed; warm, the same line
 * committed in ~120 ms. The rescue now runs under a fixed amount of WORK in charged units (every memo hit is
 * charged the work it saved, ADR-582), the seat sweep's ADR-584 shape. Every lock counts operations or reads
 * verdicts; none times anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { choiceRescueConfig, choiceRescueStats, CHOICE_RESCUE_WORK_CAP, clearReplayCaches, findValidConfig } from '@/replay/core';
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

const PREFIX = ['משולש שווה שוקיים ABC', 'AB = 4'];

/** The verdict on `line` after the prefix, what the rescue charged for it, and the drawing the app's
 *  post-commit search (`autoResolve` → `findValidConfig`) lands. */
async function verdict(line: string) {
  useGeoStore.getState().clear();
  for (const l of PREFIX) expect((await submit(l)).accepted, `«${l}» is accepted`).toBe(true);
  const before = useGeoStore.getState().facts.length;
  const s0 = { ...choiceRescueStats };
  const r = await submit(line);
  const st = useGeoStore.getState();
  const found = r.accepted ? findValidConfig(st.facts, st.seed) : null;
  const sides = (() => {
    if (!found) return null;
    const d = replay(found.facts, found.seed);
    if (!found.facts.every((f) => d.status[f.id] === 'ok')) return null;
    const len = (a: string, b: string) => {
      const p = d.positions.get(a)!;
      const q = d.positions.get(b)!;
      return Math.round(Math.hypot(p.x - q.x, p.y - q.y) * 1e3) / 1e3;
    };
    return { AB: len('A', 'B'), AC: len('A', 'C'), BC: len('B', 'C') };
  })();
  return {
    accepted: r.accepted,
    note: r.notes.join(' | ').replace(/[⁦-⁩]/g, ''),
    committed: st.facts.length - before,
    rescue: { rescues: choiceRescueStats.rescues - s0.rescues, cured: choiceRescueStats.cured - s0.cured, charged: choiceRescueStats.charged - s0.charged },
    sides,
  };
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ commands: [], none: true });
  choiceRescueConfig.cap = CHOICE_RESCUE_WORK_CAP;
});
afterEach(() => {
  vi.restoreAllMocks();
  choiceRescueConfig.cap = CHOICE_RESCUE_WORK_CAP;
});

describe('#1857 — «משולש שווה שוקיים ABC · AB = 4 · BC = …» commits, cold = warm', () => {
  for (const [line, want] of [
    ['BC = 8', { AB: 4, AC: 8, BC: 8 }],
    ['BC = 9', { AB: 4, AC: 9, BC: 9 }],
  ] as const) {
    it(`«${line}»: committed cold and warm, the rescue curing it inside its cap with equal charged work; drawn ${want.AB}·${want.AC}·${want.BC}, every row green`, async () => {
      clearReplayCaches();
      const cold = await verdict(line);
      const warm = await verdict(line);
      for (const [pass, v] of [['cold', cold], ['warm', warm]] as const) {
        expect(v.accepted, `${pass}: committed (note: ${v.note})`).toBe(true);
        expect(v.committed, `${pass}: the line's rows committed`).toBeGreaterThan(0);
        expect(v.rescue, `${pass}: one rescue, cured`).toMatchObject({ rescues: 1, cured: 1 });
        expect(v.sides, `${pass}: the post-commit search draws the stated triangle`).toEqual(want);
      }
      expect(warm.rescue.charged, 'charged work (every memo hit charged, ADR-582), cold = warm').toBe(cold.rescue.charged);
      expect(cold.rescue.charged).toBeLessThanOrEqual(CHOICE_RESCUE_WORK_CAP);
      expect(llmParseMock, 'never escalated').not.toHaveBeenCalled();
    }, 300_000);
  }

  it('the verdict does not read the clock: with Date.now racing ahead 10 s per read, «BC = 8» still commits, cold and warm', async () => {
    let t = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 10_000));
    clearReplayCaches();
    for (const pass of ['cold', 'warm']) {
      const v = await verdict('BC = 8');
      expect(v.accepted, `${pass}: committed (note: ${v.note})`).toBe(true);
      expect(v.rescue, `${pass}: cured`).toMatchObject({ rescues: 1, cured: 1 });
    }
  }, 300_000);

  it('the verdict is a function of the work cap: a cap too small to reach the cure refuses, cold and warm alike', async () => {
    choiceRescueConfig.cap = 1_000;
    clearReplayCaches();
    const cold = await verdict('BC = 8');
    const warm = await verdict('BC = 8');
    for (const v of [cold, warm]) {
      expect(v.accepted, 'refused').toBe(false);
      expect(v.committed).toBe(0);
      expect(v.rescue).toMatchObject({ rescues: 1, cured: 0 });
    }
    expect(warm.note, 'one verdict').toBe(cold.note);
    expect(warm.rescue.charged, 'cut at the same point').toBe(cold.rescue.charged);
  }, 300_000);
});
