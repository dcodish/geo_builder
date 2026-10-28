/**
 * #2553 ([ADR-AG-337](../../docs/06c-decisions-analytic.md#adr-ag-337)) — 2-D's half: A COMMON TANGENT'S KIND WRITTEN AS
 * ITS DEFINITION.
 *
 * Measured at d9494206 through `decideDeterministic2D`, model mocked: «משיק משותף ששני המעגלים נמצאים באותו צד שלו» (the
 * exam's ב, שאלה 6) escalated, while «משיק משותף חיצוני לשני המעגלים» commits. The definition is folded once, at the
 * parser boundary (`src/parser/tangentSide.ts`), into the kind word every common-tangent rule already knows; the analytic
 * builder carries a copy. The kind is asserted HERE from the drawn figure: both centres on one side of the
 * tangent for «באותו צד», on opposite sides for «מצדדים שונים». The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';

const st = () => useGeoStore.getState();

async function submit(line: string) {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, /[a-z]{3}/.test(line) ? 'en' : 'he');
  commitVerdict(v, line);
  return v;
}

/** Are both centres on the same side of AB, at the shown configuration? */
function centresSameSide(): boolean {
  const r = replay(st().facts, st().seed);
  expect(r.lastError).toBeNull();
  expect(r.violations).toEqual([]);
  const [A, B, O, P] = ['A', 'B', 'O', 'P'].map((id) => r.positions.get(id)!);
  const side = (p: { x: number; y: number }) => (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x);
  return side(O) * side(P) > 0;
}

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockImplementation(() => {
    throw new Error('the model must not be called');
  });
});

describe('#2553 — 2-D reads a common tangent’s kind written as its definition', () => {
  const cases: Array<[string, boolean]> = [
    ['משיק משותף ששני המעגלים נמצאים באותו צד שלו', true],
    ['AB משיק משותף ששני המעגלים נמצאים באותו צד שלו', true],
    ['AB משיק משותף שהמעגלים O ו-P נמצאים באותו צד שלו', true],
    ['a common tangent with both circles on the same side of it', true],
    ['משיק משותף ששני המעגלים נמצאים מצדדים שונים שלו', false],
    ['AB משיק משותף ששני המעגלים נמצאים בצדדים שונים שלו', false],
  ];
  it.each(cases)('«%s» commits, the centres on the same side: %s', async (line, same) => {
    st().clear();
    for (const l of ['מעגל O', 'מעגל P']) expect((await submit(l)).kind).toBe('commit');
    expect((await submit(line)).kind).toBe('commit');
    expect(centresSameSide()).toBe(same);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});
