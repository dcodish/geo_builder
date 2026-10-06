/**
 * #1675 + #1584 ([ADR-583](../../../docs/06-decisions.md#adr-583)) — A REFUSAL COSTS ABOUT ONE FAILED SOLVE,
 * NOT SIX.
 *
 * Measured on origin/main 7ed5baa8 through this very door (`runSubmit`, the model mocked — standing rule 2):
 * «המיתר AB מקביל ל-CD» on a midpoint B took 9.58M evaluateCore calls to refuse (six attempts at the same
 * doomed solve), «היתר AC = 5» 2.23M, «רבע מעגל CAB» 8.72M. Three multipliers, three arms:
 *  1. without a ≥4-gon the convex-first solve and its relaxed fallback are the same solve — run it once;
 *  2. an attempt whose SOLVE SIGNATURE did not change since it failed is answered from the fold's failure memo;
 *  3. every remaining RE-attempt runs under a deterministic executed-work cap and, when cut, reports the
 *     fact's first failure verbatim.
 * Every verdict is unchanged; every lock counts operations, never time.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { work, withWorkEpoch } from '@/engine/solveBudget';
import { clearReplayCaches, dryRunOutcome, reattemptConfig, reattemptStats, REATTEMPT_WORK_CAP } from '@/replay/core';
import { deserializeFigure } from '@/store/figureFile';
import { parse, buildParseCtx } from '@/parser';
import i18n from '@/i18n';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { SCENARIOS_4 } from '@/__tests__/scenarios-corpus-4';

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

const clean = (notes: string[]) => notes.join(' | ').replace(/[⁦-⁩]/g, '');

/** The submit's EXECUTED evaluateCore calls (charged hits excluded) and its verdict, on a fresh figure. */
async function measure(prefix: string[], line: string): Promise<{ executed: number; accepted: boolean; note: string }> {
  useGeoStore.getState().clear();
  for (const l of prefix) expect((await submit(l)).accepted, `«${l}» is accepted`).toBe(true);
  const e0 = work.executed;
  const r = await submit(line);
  return { executed: work.executed - e0, accepted: r.accepted, note: clean(r.notes) };
}

const MIDPOINT_B = ['מעגל O', 'A על המעגל', 'B אמצע OA', 'קטע CD'];
const RIGHT_AT_C = ['משולש ABC', 'זווית C = 90'];
const RIGHT_15_10 = ['ABC משולש ישר זוית', 'AC=15', 'BC=10'];

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ commands: [], none: true });
  reattemptConfig.cap = REATTEMPT_WORK_CAP;
  reattemptConfig.memo = true;
});

describe('#1675 — the operator\'s refusals cost one failed solve, not six (executed work, cold then warm)', () => {
  it('«המיתר AB מקביל ל-CD» on a midpoint B: ≤ 2.0M executed (was 9.58M), the same refusal', async () => {
    clearReplayCaches();
    const cold = await measure(MIDPOINT_B, 'המיתר AB מקביל ל-CD');
    const warm = await measure(MIDPOINT_B, 'המיתר AB מקביל ל-CD');
    expect(cold.accepted).toBe(false);
    expect(cold.note).toMatch(/OB.*cannot hold \[vs #2\]/);
    expect(warm.note).toBe(cold.note);
    expect(cold.executed, 'cold').toBeLessThanOrEqual(2_000_000);
    expect(warm.executed, 'warm').toBeLessThanOrEqual(cold.executed);
  }, 240_000);

  it('«היתר AC = 5» on a triangle right-angled at C: ≤ 0.8M executed (was 2.23M), the same refusal', async () => {
    clearReplayCaches();
    const cold = await measure(RIGHT_AT_C, 'היתר AC = 5');
    const warm = await measure(RIGHT_AT_C, 'היתר AC = 5');
    expect(cold.accepted).toBe(false);
    expect(cold.note).toMatch(/ABC = 90° cannot hold \[vs #1\]/);
    expect(warm.note).toBe(cold.note);
    expect(cold.executed).toBeLessThanOrEqual(800_000);
  }, 240_000);
});

describe('#1584 — the refusals the round measured, bounded', () => {
  it('«רבע מעגל CAB»: ≤ 3.1M executed (was 8.72M), the same refusal', async () => {
    clearReplayCaches();
    const cold = await measure(RIGHT_15_10, 'רבע מעגל CAB');
    const warm = await measure(RIGHT_15_10, 'רבע מעגל CAB');
    expect(cold.accepted).toBe(false);
    expect(cold.note).toMatch(/AC\| = 15 cannot hold \[vs #3\]/);
    expect(warm.note).toBe(cold.note);
    // The plan aimed at ~2.5M; the re-attempt cap cannot sit below the most expensive SUCCESSFUL re-attempt the
    // calibration sweep measured (511k), so two cut re-attempts at 750k each remain (ADR-583, measured 3.03M).
    expect(cold.executed).toBeLessThanOrEqual(3_100_000);
  }, 240_000);

  /**
   * #1771 (ADR-589): the operator's line is no longer a refusal — the three vertices are read ON the semicircle
   * and the figure picks the diameter (AB, the right angle at C), so it BUILDS, and at the cost of one dry run.
   * The refusal this row used to bound is kept by the line on the same figure that cannot build: the stated
   * diameter BC (A cannot see BC at 90° when AC = 15 > BC = 10) — stated, so never re-read.
   */
  it('«חצי מעגל ABC»: builds now (#1771) — bounded, and its refusing neighbour stays bounded', async () => {
    clearReplayCaches();
    const built = await measure(RIGHT_15_10, 'חצי מעגל ABC');
    expect(built.accepted).toBe(true);
    expect(built.executed).toBeLessThanOrEqual(1_500_000); // measured 0.42M — the probe-best reading is the first dry run
    clearReplayCaches();
    const stated = await measure(RIGHT_15_10, 'חצי מעגל שקוטרו BC העובר דרך A');
    expect(stated.accepted).toBe(false);
    expect(stated.note).toMatch(/cannot hold/);
    expect(stated.executed).toBeLessThanOrEqual(12_000_000); // measured 8.78M — an explicit diameter is never re-read
  }, 600_000);

  it('«α = 50» still commits, still names itself (ADR-554), bounded', async () => {
    clearReplayCaches();
    const r = await measure(['משולש ABC', 'AB=4', 'זווית ABC = α', 'זווית ACB = 30', 'AC = 6'], 'α = 50');
    expect(r.accepted).toBe(true);
    const st = useGeoStore.getState();
    const d = replay(st.facts, st.seed);
    expect(Object.values(d.status).filter((s) => s !== 'ok').every((s) => /AC\| = 6 cannot hold \[vs #9\]/.test(String(s)))).toBe(true);
    expect(r.executed).toBeLessThanOrEqual(1_500_000);
  }, 240_000);
});

describe('#1675 — the charged work of a dry run is the same cold and warm (#1605)', () => {
  it('the chord dry run: one work epoch cold, one warm — equal charged units, same outcome', async () => {
    clearReplayCaches();
    useGeoStore.getState().clear();
    for (const l of MIDPOINT_B) await submit(l);
    const facts = useGeoStore.getState().facts;
    const ctx = (() => { const d = replay(facts); return buildParseCtx(d.construction, d.positions); })();
    const p = parse('המיתר AB מקביל ל-CD', ctx);
    if (!p.ok) throw new Error('parses');
    const charged = () => withWorkEpoch(() => {
      const d0 = work.done;
      const o = dryRunOutcome(facts, p.commands, 0);
      return { units: work.done - d0, o };
    });
    const cold = charged();
    const warm = charged();
    expect(warm.o).toEqual(cold.o);
    expect(warm.units, 'a warm dry run is charged what the cold one cost').toBe(cold.units);
  }, 240_000);
});

describe('#1675 — the re-attempt cap reports the first failure verbatim', () => {
  it('a cap too small for any re-attempt changes no verdict and no wording', async () => {
    clearReplayCaches();
    reattemptConfig.cap = 1_000;
    const before = reattemptStats.exhausted;
    const capped = await measure(MIDPOINT_B, 'המיתר AB מקביל ל-CD');
    expect(reattemptStats.exhausted - before, 'the cap fired').toBeGreaterThan(0);
    reattemptConfig.cap = REATTEMPT_WORK_CAP;
    clearReplayCaches();
    const normal = await measure(MIDPOINT_B, 'המיתר AB מקביל ל-CD');
    expect(capped.accepted).toBe(normal.accepted);
    expect(capped.note).toBe(normal.note);
  }, 240_000);
});

/**
 * The failure memo answers an attempt from an earlier failure whose solve signature is the same. That is an
 * equivalence claim, so it is checked as one: every saved fixture, and the measured red figures, replayed
 * with the memo and without it, give the same status on every row.
 */
describe('#1675 — the signature skip changes no status (differential, memo on vs off)', () => {
  const files = import.meta.glob('../../__tests__/fixtures/*.geo.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
  const statuses = (facts: Fact[]) => {
    clearReplayCaches();
    const d = replay(facts.map((f) => ({ ...f })), 0);
    return facts.map((f) => d.status[f.id]);
  };
  it('the fixtures and the committed red figures: identical statuses with and without the memo', async () => {
    const lists: [string, Fact[]][] = Object.entries(files).map(([name, raw]) => {
      const fig = deserializeFigure(raw);
      if (!fig.ok) throw new Error(`${name} loads`);
      return [name, fig.file.facts];
    });
    // red figures (committed through the store, the refused line appended as the app's ADR-104 park would)
    for (const [name, prefix, line] of [
      ['alpha', ['משולש ABC', 'AB=4', 'זווית ABC = α', 'זווית ACB = 30', 'AC = 6'], 'α = 50'],
    ] as const) {
      useGeoStore.getState().clear();
      for (const l of [...prefix, line]) await submit(l);
      lists.push([name, useGeoStore.getState().facts]);
    }
    // the operator's refused lines, committed red (the parse→fact path with no door)
    for (const [name, prefix, line] of [
      ['chord', MIDPOINT_B, 'המיתר AB מקביל ל-CD'],
      ['hypotenuse', RIGHT_AT_C, 'היתר AC = 5'],
      ['quarter', RIGHT_15_10, 'רבע מעגל CAB'],
    ] as const) lists.push([name, factsOf([...prefix, line])]);
    // the last corpus chunk's conflict / refusal / deferral scenarios — where failed facts are re-attempted
    const RED = /conflict|contradict|refus|over-constrained|names|impossible|blame|other-side|deferr|pending|sizes-last|1411/;
    for (const sc of SCENARIOS_4.filter((x) => RED.test(x.id))) lists.push([sc.id, factsOf(sc.steps, sc.refusedSteps)]);
    const hits0 = reattemptStats.memoHits;
    for (const [name, facts] of lists) {
      reattemptConfig.memo = false;
      const off = statuses(facts);
      reattemptConfig.memo = true;
      const on = statuses(facts);
      expect(on, name).toEqual(off);
    }
    expect(reattemptStats.memoHits - hits0, 'the memo was exercised (not a vacuous pass)').toBeGreaterThan(0);
  }, 900_000);
});
