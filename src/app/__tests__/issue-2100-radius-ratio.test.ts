/**
 * #2100 ([ADR-649](../../../docs/06-decisions.md#adr-649)) — a ratio between two radii is a RELATION, never a size.
 *
 * Measured on `main` 939b160a through `decideDeterministic2D` + the gate + `replay`: after «מעגל O» · «מעגל P»,
 * «רדיוס מעגל O גדול פי 2 מרדיוס מעגל P» committed `set-radius O = 2` (O drawn at radius 2, P free 3.6, green) — in
 * both word orders, with «קטן» (the inversion lost) and with «פי 3»; after «מעגל O ברדיוס 4» it was the false
 * «כבר קיים» no-op. `setRadius` read the factor as O's radius. Operator ruling 2026-10-14: it holds r_O = 2·r_P,
 * both sizes otherwise free; «קטן פי 2» gives half; over «מעגל O ברדיוס 4» it sizes P to 2.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { firstSatisfyingSeed, searchAnotherView } from '@/replay/core';
import { driveThroughGate } from '../../__tests__/submit-gate';

/** The real pre-LLM decision for `line` after `prefix` has been committed through the gate. */
async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}

/** Drive the sequence, assert it all commits green and verified, and return the facts and the drawn radii. */
function build(lines: string[]) {
  const { facts, refused } = driveThroughGate(lines);
  expect(refused, lines.join(' · ')).toEqual([]);
  const fig = replay(facts, useGeoStore.getState().seed);
  expect(fig.lastError, 'builds').toBeNull();
  expect(fig.violations, 'the verifier is clean').toEqual([]);
  for (const f of facts) expect(fig.status[f.id], f.utterance).toBe('ok');
  return { facts, rO: fig.circles.get('circle-O')!.r, rP: fig.circles.get('circle-P')!.r };
}

const TWO = ['מעגל O', 'מעגל P'];

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2100 — «רדיוס מעגל O גדול פי 2 מרדיוס מעגל P» holds r_O = 2·r_P', () => {
  it.each([
    ['רדיוס מעגל O גדול פי 2 מרדיוס מעגל P', 2],
    ['רדיוס מעגל O גדול מרדיוס מעגל P פי 2', 2],
    ['רדיוס מעגל O קטן פי 2 מרדיוס מעגל P', 0.5],
    ['רדיוס מעגל O קטן מרדיוס מעגל P פי 2', 0.5],
    ['רדיוס מעגל O גדול פי 3 מרדיוס מעגל P', 3],
    ['רדיוס המעגל O גדול פי 3 מרדיוס המעגל P', 3],
    ['רדיוס מעגל O גדול פי 1.5 מרדיוס מעגל P', 1.5],
    ['the radius of circle O is 2 times the radius of circle P', 2],
  ])('«%s» → r_O / r_P = %d, drawn and verified, read deterministically', async (line, k) => {
    const v = await decide(TWO, line);
    expect(v.kind).toBe('commit');
    expect(v.kind === 'commit' && v.commands.map((c) => c.type)).toEqual(['set-radius-ratio']);
    const { rO, rP } = build([...TWO, line]);
    expect(rO / rP).toBeCloseTo(k, 5);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('both sizes stay free: «הציגו תצורה אחרת» changes them and keeps the ratio (ADR-052)', () => {
    const { facts, rO } = build([...TWO, 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P']);
    let cur = { facts, seed: firstSatisfyingSeed(facts) };
    const sizes = new Set<string>([rO.toFixed(3)]);
    for (let i = 0; i < 3; i++) {
      const next = searchAnotherView(cur.facts, cur.seed, undefined, Number.POSITIVE_INFINITY);
      expect(next, 'another view exists').not.toBeNull();
      cur = next!;
      const c = replay(cur.facts, cur.seed).circles;
      expect(c.get('circle-O')!.r / c.get('circle-P')!.r).toBeCloseTo(2, 5);
      sizes.add(c.get('circle-O')!.r.toFixed(3));
    }
    expect(sizes.size, 'the free size is resampled').toBeGreaterThan(1);
  });

  it('after «מעגל O ברדיוס 4» it sizes P to 2 — never «כבר קיים»', async () => {
    const v = await decide(['מעגל O ברדיוס 4', 'מעגל P'], 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P');
    expect(v.kind).toBe('commit');
    const { rO, rP } = build(['מעגל O ברדיוס 4', 'מעגל P', 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P']);
    expect(rO).toBeCloseTo(4, 5);
    expect(rP).toBeCloseTo(2, 5);
  });

  it('a stated comparand sizes the other circle: P = 3 → O = 6', () => {
    const { rO, rP } = build(['מעגל O', 'מעגל P ברדיוס 3', 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P']);
    expect(rP).toBeCloseTo(3, 5);
    expect(rO).toBeCloseTo(6, 5);
  });

  it('the ratio typed first, the size after: O = 4 → P = 2', () => {
    const { rO, rP } = build([...TWO, 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P', 'מעגל O ברדיוס 4']);
    expect(rO).toBeCloseTo(4, 5);
    expect(rP).toBeCloseTo(2, 5);
  });

  it('a ratio two stated radii contradict is refused with the existing contradiction message, as «R = 2r» is', async () => {
    const v = await decide(['מעגל O ברדיוס 4', 'מעגל P ברדיוס 3'], 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P');
    expect(v.kind).toBe('refuse');
    expect(v.kind === 'refuse' && v.category).toBe('conflict');
    const twin = await decide(['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r', 'R = 4', 'r = 3'], 'R = 2r');
    expect(twin.kind).toBe('refuse');
    expect(v.kind === 'refuse' && v.note).toEqual(twin.kind === 'refuse' && twin.note);
  });

  it('unchanged: a ratio to a circle the figure does not have is not read here', async () => {
    expect((await decide(['מעגל O'], 'רדיוס מעגל O גדול פי 2 מרדיוס מעגל P')).kind).toBe('escalate');
  });
  // Re-based by #2149 (ADR-671, operator ruling 2026-10-16 card 6: «רדיוס מעגל O שווה לרדיוס מעגל P» becomes a real
  // given): «שווה» with no factor is now the ratio's equality branch, k = 1 — it escalated before the ruling.
  it('«שווה» with no factor is the equality, k = 1 (#2149)', async () => {
    const v = await decide(TWO, 'רדיוס מעגל O שווה לרדיוס מעגל P');
    expect(v.kind === 'commit' && v.commands).toEqual([{ type: 'set-radius-ratio', c1: 'circle-O', c2: 'circle-P', k: 1 }]);
  });

  it('a plain size statement still sizes its circle', async () => {
    const v = await decide(TWO, 'רדיוס מעגל O הוא 3');
    expect(v.kind === 'commit' && v.commands).toEqual([{ type: 'set-radius', circle: 'circle-O', value: 3 }]);
  });
});
