/**
 * #1613 — a vector from a known point to a new one CREATES the new point (operator 2026-09-30: *"yes, we should create B in
 * such a case"*). Built by #1467's create-everywhere pass (ADR-3D-382); this file locks the operator's exact sequences in
 * fix round #2665, through the store's real submit path. The build + drift net is `fixtures3/vector-creates-head-*-1613`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

const st = () => useGeo3.getState();
const reset = () => useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never);
const run = (...lines: string[]) => {
  reset();
  for (const l of lines) st().submit(l);
};
/** What the «נוצרה נקודה חדשה» notice names, when it belongs to the last line. */
const shown = () => {
  const n = st().lastCreated;
  return n && st().facts[st().facts.length - 1]?.id === n.factId ? [...n.ids].sort() : null;
};
const at = (id: string, seed = 0) => {
  const p = derive3(st().facts, seed).positions.get(id)!;
  return [p.x, p.y, p.z];
};
const allOk = (seed = 0) => Object.values(derive3(st().facts, seed).status).every((s) => s === 'ok');

beforeEach(reset);

describe('#1613 — «A(0,0,0)» · «AB = (1,2,3)» creates B', () => {
  it('B is created at A + (1,2,3), and the notice names B', () => {
    run('A(0,0,0)', 'AB = (1,2,3)');
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(2);
    expect(allOk()).toBe(true);
    at('B').forEach((v, i) => expect(v).toBeCloseTo([1, 2, 3][i], 5)); // solver tolerance: B is placed by the drive, not by a closed form
    expect(shown()).toEqual(['B']);
  });

  it('the notice ✕ removes the line, and B with it', () => {
    run('A(0,0,0)', 'AB = (1,2,3)');
    st().remove(st().lastCreated!.factId);
    expect(st().facts).toHaveLength(1);
    expect(derive3(st().facts, 0).construction.points.has('B')).toBe(false);
  });
});

describe('#1613 — the «נתון:» form with a single symbol k', () => {
  const LINES = ['A(0,0,0)', 'נתון: AB = (k-1, k, 3), AC = (k+1, 0, k-3)'] as const;

  it('B and C are created, carrying k, and the notice names both', () => {
    run(...LINES);
    expect(st().lastError).toBeNull();
    expect(allOk()).toBe(true);
    expect(shown()).toEqual(['B', 'C']);
    for (const seed of [0, 1]) {
      const [bx, by, bz] = at('B', seed);
      const [cx, cy, cz] = at('C', seed);
      const k = by; // AB = (k-1, k, 3) from A = O
      expect(bx).toBeCloseTo(k - 1, 5);
      expect(bz).toBeCloseTo(3, 5);
      expect(cx).toBeCloseTo(k + 1, 5);
      expect(cy).toBeCloseTo(0, 5);
      expect(cz).toBeCloseTo(k - 3, 5);
    }
  });

  it('k stays open: it differs between configurations', () => {
    run(...LINES);
    expect(Math.abs(at('B', 0)[1] - at('B', 1)[1])).toBeGreaterThan(1e-6);
  });
});
