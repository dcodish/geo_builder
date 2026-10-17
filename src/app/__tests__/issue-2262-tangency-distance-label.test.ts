/**
 * #2262 ([ADR-693](../../../docs/06-decisions.md#adr-693)) — THE LABEL PASS PRINTS ONLY STATED MAGNITUDES. Over two
 * stated radii, `circles-tangent` pins the centre distance r₁ ± r₂ to build the tangency; that distance is the engine's
 * construction, not the student's statement, and it was printed as a measure label.
 *
 * Measured on the #2239 tip (35b7a5ec) through `decideDeterministic2D` + the store, model mocked:
 *   «שני מעגלים משיקים ברדיוס 5»                                          → label @ctr-O–@ctr-P «10» (the report)
 *   «מעגל O ברדיוס 5» · «מעגל P ברדיוס 5» · «המעגלים O ו-P משיקים»       → label O–P «10»
 *   the internal twin (5, 2) → «3»; «…משיקים בנקודה X» → «10»
 *   «OP = 10» before or after the tangency → «10» (stated — must stay); crossing / free radii → none
 *
 * Operator 2026-10-16 (round #2245 T18): «the number 10 is the length between OP but no one asked for it and it should
 * not show».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { computeValuesPanel } from '@/engine/valuesPanel';

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function build(lines: string[]) {
  useGeoStore.getState().clear();
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
    expect(v.kind, line).toBe('commit');
    if (v.kind === 'commit') for (const c of v.commands) useGeoStore.getState().execute(c, line, `g${st.facts.length}`);
  }
  const st = useGeoStore.getState();
  const fig = replay(st.facts, st.seed);
  expect(fig.lastError).toBeNull();
  for (const f of st.facts) expect(fig.status[f.id], f.utterance).toBe('ok');
  return fig;
}
const lengthLabels = (fig: ReturnType<typeof replay>) => fig.labels.lengths.map((l) => `${l.a}-${l.b}:${l.text}`);

describe('#2262 — a tangency\'s derived centre distance is never printed', () => {
  it.each([
    [['שני מעגלים משיקים ברדיוס 5']], // the operator's line, verbatim
    [['מעגל O ברדיוס 5', 'מעגל P ברדיוס 5', 'המעגלים O ו-P משיקים']],
    [['מעגל O ברדיוס 5', 'מעגל P ברדיוס 2', 'המעגלים O ו-P משיקים מבפנים']], // the internal twin (no «3»)
    [['מעגל O ברדיוס 5', 'מעגל P ברדיוס 5', 'המעגלים O ו-P משיקים בנקודה X']],
    [['מעגל O ברדיוס 5', 'מעגל P ברדיוס 3', 'מעגל P משיק למעגל O']],
  ])('%j → no length label', async (lines) => {
    const fig = await build(lines);
    expect(lengthLabels(fig)).toEqual([]);
    // the tangency still holds — the distance is solved and verified like any other
    expect(fig.violations).toEqual([]);
  });

  it('the derived distance is not marked «נתון» in the values panel either', async () => {
    const fig = await build(['מעגל O ברדיוס 5', 'מעגל P ברדיוס 5', 'המעגלים O ו-P משיקים']);
    const panel = computeValuesPanel([fig.construction], [fig.positions], [fig.circles]);
    const op = panel.rows.filter((r) => r.kind === 'length' && [...r.ids].sort().join('') === 'OP');
    for (const r of op) expect(r.stated, 'OP is not a given').toBe(false);
  });
});

describe('#2262 — unchanged: a STATED centre distance still prints', () => {
  it.each([
    [['מעגל O ברדיוס 5', 'מעגל P ברדיוס 5', 'OP = 10', 'המעגלים O ו-P משיקים']],
    [['מעגל O ברדיוס 5', 'מעגל P ברדיוס 5', 'המעגלים O ו-P משיקים', 'OP = 10']],
  ])('%j → «10» on OP', async (lines) => {
    const fig = await build(lines);
    expect(lengthLabels(fig)).toEqual(['O-P:10']);
  });

  it('crossing circles and free-radius tangent circles print nothing (as before)', async () => {
    expect(lengthLabels(await build(['מעגל O ברדיוס 5', 'מעגל P ברדיוס 3', 'המעגלים O ו-P נחתכים']))).toEqual([]);
    expect(lengthLabels(await build(['שני מעגלים משיקים']))).toEqual([]);
  });

  it('the model is never called', async () => {
    await build(['שני מעגלים משיקים ברדיוס 5']);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});
