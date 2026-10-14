/**
 * #2101 ([ADR-648](../../../docs/06-decisions.md#adr-648)) — a value given to a circle's radius LETTER sizes the circle.
 *
 * Measured on `main` 939b160a through `decideDeterministic2D` + the gate + `replay`: «מעגל O ברדיוס r · A על מעגל O ·
 * r = 3» committed every row green with the circle at its free default radius 5 (A at distance 5); «שרדיוסו r» and
 * «רדיוס המעגל O הוא r» the same; the value typed first the same; the uppercase «R = 3» escalated. The `radius-symbol`
 * binding lowered to the naming alone, so the `set-var` lowered to nothing. Operator ruling 2026-10-14: «r = 3» sizes
 * the circle; «R = 3» does the same instead of going to the AI.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';

type P = Map<string, { x: number; y: number }>;
const len = (p: P, a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);

/** The real pre-LLM decision for `line` after `prefix` has been committed through the gate. */
async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}

/** Drive the sequence, assert it all commits green and verified, and return the drawn figure. */
function build(lines: string[]) {
  const { facts, refused } = driveThroughGate(lines);
  expect(refused, lines.join(' · ')).toEqual([]);
  const fig = replay(facts, useGeoStore.getState().seed);
  expect(fig.lastError, 'builds').toBeNull();
  expect(fig.violations, 'the verifier is clean').toEqual([]);
  for (const f of facts) expect(fig.status[f.id], f.utterance).toBe('ok');
  return fig;
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2101 — «r = 3» sizes the circle its letter names', () => {
  it('the reported sequence: the circle is drawn with radius 3 and A moves onto it', () => {
    const fig = build(['מעגל O ברדיוס r', 'A על מעגל O', 'r = 3']);
    expect(fig.circles.get('circle-O')!.r).toBeCloseTo(3, 9);
    expect(len(fig.positions, 'O', 'A')).toBeCloseTo(3, 9);
  });

  it.each([
    [['מעגל O ברדיוס r', 'r = 3']],
    [['מעגל O שרדיוסו r', 'r = 3']],
    [['מעגל O', 'רדיוס המעגל O הוא r', 'r = 3']],
    [['r = 3', 'מעגל O ברדיוס r']],
    [['מעגל O ברדיוס R', 'R = 3']],
    [['מעגל O שרדיוסו R', 'R = 3']],
    [['מעגל O ברדיוס r', 'r = 7', 'r = 3']],
  ])('%j → radius 3', (lines) => {
    expect(build(lines).circles.get('circle-O')!.r).toBeCloseTo(3, 9);
  });

  it('a diameter drawn before the value follows the circle: |AB| = 6', () => {
    const fig = build(['מעגל O ברדיוס r', 'AB קוטר במעגל O', 'r = 3']);
    expect(len(fig.positions, 'A', 'B')).toBeCloseTo(6, 9);
  });

  it('the uppercase value commits deterministically — the model is never asked', async () => {
    const v = await decide(['מעגל O ברדיוס R'], 'R = 3');
    expect(v.kind).toBe('commit');
    expect(v.kind === 'commit' && v.commands).toEqual([{ type: 'set-var', name: 'R', value: 3 }]);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('an uppercase letter no circle binds is still a point name: «R = 3» is not read as a value', async () => {
    const v = await decide(['מעגל O ברדיוס r'], 'R = 3');
    expect(v.kind).not.toBe('commit');
  });

  it('without a value the radius stays free (no size is invented)', () => {
    const fig = build(['מעגל O ברדיוס r', 'A על מעגל O']);
    const circle = fig.construction.objects.find((o) => o.id === 'circle-O') as unknown as { radius: { via: string } };
    expect(circle.radius.via).toBe('free');
  });

  it('a value contradicting a stated size is refused with the existing contradiction message, as «רדיוס המעגל O הוא 3» is', async () => {
    const v = await decide(['מעגל O', 'A על מעגל O', 'OA = 4', 'רדיוס המעגל O הוא r'], 'r = 3');
    const twin = await decide(['מעגל O', 'A על מעגל O', 'OA = 4'], 'רדיוס המעגל O הוא 3');
    expect(v.kind).toBe('refuse');
    expect(twin.kind).toBe('refuse');
    expect(v.kind === 'refuse' && v.note).toEqual(twin.kind === 'refuse' && twin.note);
  });
});
