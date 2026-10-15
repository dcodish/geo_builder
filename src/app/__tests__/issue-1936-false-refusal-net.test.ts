/**
 * #1936 ([ADR-658](../../../docs/06-decisions.md#adr-658)) — THE FALSE-REFUSAL NET for the widened angle-sum prover.
 *
 * Both operator rulings (2026-10-09, 2026-10-10) name one risk: the refusal must fire on a contradiction NO LATER
 * GIVEN CAN CLEAR, which is narrower than "unsatisfied now", because 2-D's deferral machinery exists for the rows
 * that do clear later. The prover now reads every spelling of a stated angle and refuses stated angles that leave
 * an unstated one no room (`kind: 'no-room'`). This net folds every scenario of the 2-D corpus and every saved
 * fixture through the REAL fold (so every step is judged against its real prefix, at LADDER stage 0) and records
 * every call the prover answers `no-room`. The verdict may fire only on the listed class rows; the exercised
 * counter proves the sweep looked (an empty sweep passes by checking nothing — docs/17 §9).
 */
import { describe, expect, it, vi } from 'vitest';

const noRoom: { at: string; polygon: string; angles: string }[] = [];
let calls = 0;
let current = '';
vi.mock('@/engine/metricFeasibility', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/engine/metricFeasibility')>();
  return {
    ...real,
    angleSumImpossibility: (...a: Parameters<typeof real.angleSumImpossibility>) => {
      calls++;
      const m = real.angleSumImpossibility(...a);
      if (m?.kind === 'no-room') noRoom.push({ at: current, polygon: m.polygon.join(''), angles: m.angles.map((x) => `${x.ray1}${x.vertex}${x.ray2}=${x.value}`).join(',') });
      return m;
    },
  };
});
vi.mock('@/parser/llm', () => ({ llmParse: async () => ({ built: [], dropped: [] }) }));

import { SCENARIOS } from '../../__tests__/scenarios-corpus';
import { scenarioFacts } from '../../__tests__/scenarios-harness';
import { deserializeFigure } from '@/store/figureFile';
import { replay } from '@/replay/core';

const fixtures = import.meta.glob('../../__tests__/fixtures/*.geo.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

/** Rows whose FOLDED facts may meet the verdict. Empty: the class's own scenario drives its refused line through
 *  the gate in `check` (a refused line never becomes a fact), so no committed step of the corpus is a member. */
const CLASS_ROWS = new Set<string>();

describe('#1936 — the no-room verdict fires only on the class, across the whole corpus and every fixture', () => {
  it('every scenario and fixture folds; the prover is exercised > 1000 times; no-room fires only on class rows', () => {
    for (const sc of SCENARIOS) {
      current = `scenario:${sc.id}`;
      replay(scenarioFacts(sc), 0);
    }
    for (const [path, raw] of Object.entries(fixtures)) {
      current = `fixture:${path.split('/').pop()}`;
      const loaded = deserializeFigure(raw);
      if (!loaded.ok) continue;
      replay(loaded.file.facts, loaded.file.seed);
    }
    console.log(`#1936 net: ${calls} prover calls; no-room at ${JSON.stringify(noRoom)}`);
    const outside = noRoom.filter((h) => !CLASS_ROWS.has(h.at.replace(/^scenario:/, '')));
    expect(outside, 'the no-room verdict fired outside the class').toEqual([]);
    expect(calls, 'the sweep exercised the prover').toBeGreaterThan(1000);
  }, 1_800_000);
});
