/**
 * #1966 ([ADR-665](../../../docs/06-decisions.md#adr-665)) — a foot the student already placed on a side outranks the
 * base the tool assumed.
 *
 * Measured on `main` b0ef3240 through `decideDeterministic2D`: «טרפז ABCD · E על BC · AE גובה» committed the foot
 * onto DC, and the figure drew E = C = (2.25, 4.41) with `coincidences [[C, E]]`; «E על AD · BE גובה» drew E = D.
 * Operator ruling 2026-10-10 (confirmed): "E stays on BC where they put it … 2d should follow analytics behavior".
 * Root cause: the altitude asked the ring's parallel base BEFORE the foot narrowing. Fix: `footNarrowedSide` first.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';

async function decide(prefix: string[], line: string) {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}
async function foot(prefix: string[], line: string): Promise<string> {
  const v = await decide(prefix, line);
  if (v.kind !== 'commit') return v.kind;
  const f = v.commands.find((c) => c.type === 'foot') as { id: string; from: string; a: string; b: string } | undefined;
  return f ? `${f.id} from ${f.from} onto ${[f.a, f.b].sort().join('')}` : 'no-foot';
}
const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe("#1966 — the placed foot, then the ring's parallel base, then the first opposite side", () => {
  it.each([
    [['טרפז ABCD', 'E על BC'], 'AE גובה', 'E from A onto BC'],
    [['טרפז ABCD', 'E על AD'], 'BE גובה', 'E from B onto AD'],
    [['טרפז שווה שוקיים ABCD', 'E על BC'], 'AE גובה', 'E from A onto BC'],
    [['טרפז ישר זווית ABCD', 'E על BC'], 'AE גובה', 'E from A onto BC'],
    // controls, unchanged
    [['טרפז ABCD'], 'AE גובה', 'E from A onto CD'],
    [['טרפז ABCD', 'E על DC'], 'AE גובה', 'E from A onto CD'],
    [['טרפז ABCD', 'E על BC'], 'גובה מ-A', 'F from A onto CD'],
    [['טרפז ABCD', 'E על BC'], 'AE גובה לצלע BC', 'E from A onto BC'],
    [['מרובע ABCD', 'E על BC'], 'AE גובה', 'E from A onto BC'],
  ])('%j · «%s» → %s', async (prefix, line, want) => {
    expect(await foot(prefix, line)).toBe(want);
  });

  it('the reported figure keeps E on BC, never on C, with AE ⟂ BC — the same figure as «AE גובה לצלע BC»', () => {
    useGeoStore.getState().clear();
    const a = driveThroughGate(['טרפז ABCD', 'E על BC', 'AE גובה']);
    useGeoStore.getState().clear();
    const b = driveThroughGate(['טרפז ABCD', 'E על BC', 'AE גובה לצלע BC']);
    expect(a.refused).toEqual([]);
    const fa = replay(a.facts, 0), fb = replay(b.facts, 0);
    expect(fa.lastError).toBeNull();
    expect(fa.violations).toEqual([]);
    expect(fa.coincidences).toEqual([]);
    const [A, B, C, E] = ['A', 'B', 'C', 'E'].map((id) => fa.positions.get(id)!);
    expect(d(E, C)).toBeGreaterThan(1e-3);
    expect(Math.abs(d(B, E) + d(E, C) - d(B, C))).toBeLessThan(1e-6);
    expect(Math.abs((A.x - E.x) * (B.x - C.x) + (A.y - E.y) * (B.y - C.y))).toBeLessThan(1e-6);
    for (const id of ['A', 'B', 'C', 'D', 'E']) expect(d(fa.positions.get(id)!, fb.positions.get(id)!)).toBeLessThan(1e-9);
  });

  it('apex B: «E על AD · BE גובה» keeps E inside AD, never on D', () => {
    useGeoStore.getState().clear();
    const { facts, refused } = driveThroughGate(['טרפז ABCD', 'E על AD', 'BE גובה']);
    expect(refused).toEqual([]);
    const fig = replay(facts, 0);
    expect(fig.lastError).toBeNull();
    const [A, D, E] = ['A', 'D', 'E'].map((id) => fig.positions.get(id)!);
    expect(d(E, D)).toBeGreaterThan(1e-3);
    expect(Math.abs(d(A, E) + d(E, D) - d(A, D))).toBeLessThan(1e-6);
  });

  it('a triangle the sentence itself names still decides the side over a placed foot elsewhere', async () => {
    expect(await foot(['משולש ABD', 'E על BD', 'משולש ABC'], 'AE גובה במשולש ABC')).toBe('E from A onto BC');
  });
});
