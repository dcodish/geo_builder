/**
 * #821 (ADR-3D-177 Am. 1) — a plane the student NAMES in a ∥ relation is DRAWN, exactly as for ⟂.
 *
 * Operator ruling, 2026-08-30: «if we reference a plane like we say plane ACD is parallel to AB or
 * just ACD||AB, we should draw ACD. the user has the option of disabling it through the input panel so
 * this is no problem even if he didnt want it highlighted». The honesty invariant — everything the
 * student stated is visible on the figure — applied to the ∥ side, which used to commit a plane it
 * named and draw nothing of it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

const ringEdges = (u: string): string[] => {
  const p = parse3(u);
  if (!p.ok) throw new Error(`parse failed: ${u}`);
  return p.commands.filter((c) => c.type === 'segment3').map((c) => (c.type === 'segment3' ? `${c.a}${c.b}` : ''));
};
const rel = (u: string) => {
  const p = parse3(u);
  if (!p.ok) throw new Error(`parse failed: ${u}`);
  return p.commands.find((c) => c.type === 'seg-plane-rel');
};

describe('#821 — ∥ draws the named plane’s ring, as ⟂ does', () => {
  it('the operator’s two phrasings: «AB מקביל למישור ACD» and «ACD||AB» draw the triangle', () => {
    expect(ringEdges('AB מקביל למישור ACD')).toEqual(['AC', 'CD', 'DA']);
    expect(ringEdges('ACD||AB')).toEqual(['AC', 'CD', 'DA']);
    expect(ringEdges('מישור ACD מקביל ל-AB')).toEqual(['AC', 'CD', 'DA']);
  });

  it('the MATRIX: relation × arity × order × notation × locale — the ring is always drawn', () => {
    const cases = [
      'AB מקביל למישור ACD', 'AB מאונך למישור ACD', "AB ∥ ACD", "AB ⊥ ACD", 'ACD ∥ AB', 'ACD ⊥ AB',
      "AB מקביל למישור BCC'B'", "AB מאונך למישור BCC'B'", "BCC'B' ∥ AB",
      'AB is parallel to plane ACD', 'AB is perpendicular to plane ACD', 'plane ACD is parallel to AB',
    ];
    for (const u of cases) {
      const r = rel(u);
      expect(r, u).toBeDefined();
      const ring = r && r.type === 'seg-plane-rel' ? r.plane : [];
      expect(ringEdges(u), u).toHaveLength(ring.length);
      expect(ringEdges(u).length, u).toBeGreaterThanOrEqual(3);
    }
  });

  it('the «בסיס» sentinel stays undrawn for both (no run to draw — the solid resolves it)', () => {
    expect(ringEdges('AS מקביל לבסיס')).toEqual([]);
    expect(ringEdges('AS ניצב לבסיס')).toEqual([]);
  });

  it('end to end: the pyramid with «SB מקביל למישור ACD» shows the ACD triangle on the figure', () => {
    reset();
    ['פירמידה SABCD', 'SB מקביל למישור ACD'].forEach(submit);
    expect(state().lastError).toBeNull();
    const c = derive3(state().facts, state().seed).construction;
    const has = (a: string, b: string) => c.segments.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    expect(has('A', 'C') && has('C', 'D') && has('D', 'A'), 'the named plane is visible').toBe(true);
  });

  beforeEach(reset);
});
