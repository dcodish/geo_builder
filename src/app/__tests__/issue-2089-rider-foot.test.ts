/**
 * #2089 ([ADR-728](../../../docs/06-decisions.md#adr-728)) — «מרובע ABCD» · «E על CD» · «AE גובה» / «AE גובה לצלע CD» /
 * «AE ⟂ CD»: the point the student placed wins — E stays strictly inside CD and the quadrilateral yields so AE ⟂ CD.
 *
 * Operator ruling 2026-10-14 (card `d14b-found-accept`, A): *"the point the student placed wins … The quadrilateral
 * yields, and E is not dropped onto D silently"*, the same for «AE גובה לצלע CD» and «AE ⟂ CD».
 *
 * Measured on `main` 688dfb96 through the student's path (the submit gate, then the store's post-commit `autoResolve`,
 * which the app runs after every commit): the two foot spellings already land at seed 2 with E inside CD (|ED| = 0.53)
 * — the committed seed 0 has E on D, `pointsDistinct` rejects it, and the config search moves on; «AE ⟂ CD» (and
 * «AE מאונך ל-CD», «CD ⟂ EA») was refused «cannot place E on segment CD so that AE ⟂ CD». The ⟂ spellings now take
 * the foot placement's own path when the ⟂ form has no figure, so all spellings draw the same figure at every seed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';

const PREFIX = ['מרובע ABCD', 'E על CD'];
const SPELLINGS = ['AE גובה', 'AE גובה לצלע CD', 'AE ⟂ CD', 'AE מאונך ל-CD', 'CD ⟂ EA'];
type P = { x: number; y: number };
const d = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);

/** The student's path: every line through the gate, then the app's post-commit `autoResolve`. */
function play(line: string) {
  const { facts, refused } = driveThroughGate([...PREFIX, line]);
  useGeoStore.getState().autoResolve();
  const st = useGeoStore.getState();
  return { facts, refused, seed: st.seed, fig: replay(st.facts, st.seed) };
}

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2089 — a height to the side the rider was placed on keeps the rider inside it', () => {
  it.each(SPELLINGS)('«%s»: builds, and the shown figure has E strictly inside CD with AE ⟂ CD', (line) => {
    const { refused, fig } = play(line);
    expect(refused).toEqual([]);
    expect(fig.lastError).toBeNull();
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    expect(fig.violations).toEqual([]);
    expect(fig.coincidences).toEqual([]);
    const [A, C, D, E] = ['A', 'C', 'D', 'E'].map((id) => fig.positions.get(id)!);
    const cd = d(C, D);
    expect(d(E, D)).toBeGreaterThan(0.02 * cd);
    expect(d(E, C)).toBeGreaterThan(0.02 * cd);
    expect(Math.abs(d(C, E) + d(E, D) - cd)).toBeLessThan(1e-6);
    expect(Math.abs((A.x - E.x) * (C.x - D.x) + (A.y - E.y) * (C.y - D.y))).toBeLessThan(1e-6);
  });

  it('one statement, one figure: every ⟂ spelling draws what «AE גובה לצלע CD» draws, at every seed 0–23', () => {
    const foot = driveThroughGate([...PREFIX, 'AE גובה לצלע CD']).facts;
    for (const line of ['AE ⟂ CD', 'AE מאונך ל-CD', 'CD ⟂ EA']) {
      const perp = driveThroughGate([...PREFIX, line]).facts;
      for (let s = 0; s < 24; s++) {
        const a = replay(foot, s), b = replay(perp, s);
        for (const id of ['A', 'B', 'C', 'D', 'E']) expect(d(a.positions.get(id)!, b.positions.get(id)!), `${line} seed ${s} ${id}`).toBeLessThan(1e-9);
      }
    }
  });

  it('stability: at the committed seed the quadrilateral yields through A alone — B, C, D do not move', () => {
    const before = replay(driveThroughGate(PREFIX).facts, 0).positions;
    const after = replay(driveThroughGate([...PREFIX, 'AE ⟂ CD']).facts, 0).positions;
    for (const id of ['B', 'C', 'D']) expect(d(before.get(id)!, after.get(id)!), id).toBeLessThan(1e-9);
  });

  it('unchanged: where the ⟂ form builds on its own it keeps its own solve («משולש ABC» · «D על BC» · «AD ⟂ BC»)', () => {
    const { facts, refused } = driveThroughGate(['משולש ABC', 'D על BC', 'AD ⟂ BC']);
    expect(refused).toEqual([]);
    const fig = replay(facts, 0);
    expect(fig.construction.objects.some((o) => o.id === '~D')).toBe(false);
    // the ⟂ form's own lowering: the rider becomes on-segment-solved, carrying the perpendicular
    const rider = fig.construction.objects.find((o) => o.id === 'D') as { kind: string; constraint?: { type: string } } | undefined;
    expect([rider?.kind, rider?.constraint?.type]).toEqual(['on-segment-solved', 'perpendicular']);
  });

  it('unchanged refusal: a ⟂ from a point of the line itself («DE ⟂ CD») is still refused', () => {
    const { refused } = driveThroughGate([...PREFIX, 'DE ⟂ CD']);
    expect(refused.map((r) => r.utterance)).toEqual(['DE ⟂ CD']);
  });
});
