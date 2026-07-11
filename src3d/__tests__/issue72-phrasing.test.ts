/**
 * #72 (ADR-3D-039): the 3-D phrasing batch from the baseline log-triage (2026-07-11) —
 * five context-verified prod gaps, each a widening of an existing lane:
 *   1. the connect-imperative `נחבר את D'F` → bare segment
 *   2. the diagonal noun `אלכסון BD'` (+ the final-ם slip) → bare segment
 *   3. `חץ A'C` / `הוקטור A'C` — an UNNAMED ink arrow (never a basis member)
 *   4. `אורך AB=BC` — the length marker DISAMBIGUATES the pair=pair ambiguity
 *   5. `אנך יורד מMלבסיס` (the glued prod form) — ⟂ from a point to the base, foot auto-minted
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);
const cmd = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};
type V = { x: number; y: number; z: number };
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const dot = (p: V, q: V) => p.x * q.x + p.y * q.y + p.z * q.z;
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);

describe('#72 — parse: the prod phrasings lower deterministically', () => {
  it("connect-imperative + diagonal noun → bare segment (exact prod: נחבר את D'F, אלכסון BD')", () => {
    expect(cmd("נחבר את D'F")).toMatchObject([{ type: 'segment3', a: "D'", b: 'F' }]);
    expect(cmd("חבר את D'F")).toMatchObject([{ type: 'segment3' }]);
    expect(cmd("אלכסון BD'")).toMatchObject([{ type: 'segment3', a: 'B', b: "D'" }]);
    expect(cmd("אלכסום BD'")).toMatchObject([{ type: 'segment3' }]); // the prod final-ם slip
    expect(cmd("connect D'F")).toMatchObject([{ type: 'segment3' }]);
    expect(cmd("the diagonal BD'")).toMatchObject([{ type: 'segment3' }]);
  });
  it("arrow noun → draw-arrow (exact prod: חץ A'C)", () => {
    expect(cmd("חץ A'C")).toMatchObject([{ type: 'draw-arrow', from: "A'", to: 'C' }]);
    expect(cmd("arrow A'C")).toMatchObject([{ type: 'draw-arrow' }]);
    // the vector WORD stays normalize3-stripped decoration — the established segment reading
    expect(cmd("הוקטור A'C")).toMatchObject([{ type: 'segment3' }]);
  });
  it('אורך AB=BC disambiguates to a LENGTH relation (exact prod)', () => {
    expect(cmd('אורך AB=BC')).toMatchObject([
      { type: 'segment3', a: 'A', b: 'B' },
      { type: 'length-rel', a1: 'A', b1: 'B', rhs: { pair: ['B', 'C'] }, c: 1 },
    ]);
    expect(cmd('length AB = BC')).toMatchObject([{ type: 'segment3' }, { type: 'length-rel' }]);
    // the bare pair=pair stays the honest clarification — the marker is what disambiguates
    expect(parse3('AB=BC')).toMatchObject({ ok: false, reason: 'ambiguous-vector-length' });
  });
  it('אנך יורד מMלבסיס (the glued prod form) → perp-to-base', () => {
    expect(cmd('אנך יורד מMלבסיס')).toMatchObject([{ type: 'perp-to-base', from: 'M' }]);
    expect(cmd('אנך יורד מ-M לבסיס')).toMatchObject([{ type: 'perp-to-base', from: 'M' }]);
    expect(cmd('מ-M מורידים אנך לבסיס')).toMatchObject([{ type: 'perp-to-base', from: 'M' }]);
    expect(cmd('drop a perpendicular from M to the base')).toMatchObject([{ type: 'perp-to-base', from: 'M' }]);
  });
});

describe('#72 — build', () => {
  beforeEach(reset);

  it('the unnamed arrow draws (scene overlay, no label) and never joins the basis', () => {
    submit('קובייה');
    submit("חץ A'C");
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(d.construction.arrows).toEqual([["A'", 'C']]);
    expect(d.construction.vectors.size).toBe(0); // not a named vector — the basis is untouched
    const scene = buildScene3(d.construction, d.resolved, { yaw: 0.6, pitch: 0.42 }, { width: 520, height: 420 });
    const arrow = scene.vectors.find((v) => v.name === '');
    expect(arrow, 'the arrow rides the vector overlay').toBeTruthy();
  });

  it('אורך AB=BC drives a free box toward |AB| = |BC|', () => {
    submit('תיבה');
    submit('אורך AB=BC');
    expect(state().lastError).toBeNull();
    const d = derived();
    const A = d.resolved.positions.get('A')!;
    const B = d.resolved.positions.get('B')!;
    const C = d.resolved.positions.get('C')!;
    expect(nrm(sub(A, B))).toBeCloseTo(nrm(sub(B, C)), 4);
  });

  it('perp-to-base mints a foot ON the base plane with the segment ⟂ it (pyramid apex M)', () => {
    submit('פירמידה MABCD שבסיסה ריבוע');
    submit('אנך יורד מMלבסיס');
    expect(state().lastError).toBeNull();
    const d = derived();
    // the minted foot is the first unused label — E
    const E = d.resolved.positions.get('E')!;
    expect(E, 'foot E minted').toBeTruthy();
    const [A, B, C] = ['A', 'B', 'C'].map((i) => d.resolved.positions.get(i)!);
    const n = {
      x: (B.y - A.y) * (C.z - A.z) - (B.z - A.z) * (C.y - A.y),
      y: (B.z - A.z) * (C.x - A.x) - (B.x - A.x) * (C.z - A.z),
      z: (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x),
    };
    // E on the base plane
    expect(Math.abs(dot(sub(E, A), n)) / (nrm(n) || 1)).toBeLessThan(1e-6);
    // M→E ⟂ the base (parallel to the normal)
    const ME = sub(d.resolved.positions.get('M')!, E);
    expect(Math.abs(dot(ME, n))).toBeCloseTo(nrm(ME) * nrm(n), 4);
    // and the height segment is drawn
    expect(d.construction.segments.some(([a, b]) => (a === 'M' && b === 'E') || (a === 'E' && b === 'M'))).toBe(true);
  });

  it('perp-to-base with no solid refuses honestly', () => {
    submit('M(1,2,3)');
    const before = state().facts.length;
    submit('אנך יורד מ-M לבסיס');
    expect(state().lastError).toMatchObject({ code: 'unknown-plane' });
    expect(state().facts).toHaveLength(before);
  });
});
