/**
 * V8-d (ADR-3D-021, G4): the legacy-572 solid family — an equilateral-triangle-base
 * right prism (`prism3e`, 2013-קיץ-ב, 2018-חורף) and pyramid (`pyramid3e`, 2014-קיץ,
 * 2012-קיץ-ב), and a free-apex parallelogram-base pyramid (`pyramidPar`, 2012-חורף,
 * 2013-קיץ). Oblique parallelepiped + orthoscheme are noted as remaining G4 items.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);
const kindOf = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`did not parse: ${u}`);
  return (r.commands[0] as { kind: string; ids: string[] });
};
type V = { x: number; y: number; z: number };
const d = (p: V, q: V) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });

describe('V8-d — parse', () => {
  it('equilateral prism / pyramid, and parallelogram pyramid (He + En, apex-first)', () => {
    expect(kindOf('מנסרה ישרה שבסיסה משולש שווה צלעות').kind).toBe('prism3e');
    expect(kindOf('right prism with an equilateral triangle base').kind).toBe('prism3e');
    expect(kindOf("מנסרה ישרה ABCA'B'C' שבסיסה משולש שווה-צלעות").kind).toBe('prism3e');
    expect(kindOf('פירמידה ישרה שבסיסה משולש שווה צלעות').kind).toBe('pyramid3e');
    expect(kindOf('פירמידה ישרה SABC שבסיסה משולש שווה צלעות')).toEqual({ type: 'solid', kind: 'pyramid3e', ids: ['A', 'B', 'C', 'S'] });
    expect(kindOf('פירמידה SABCD שבסיסה מקבילית')).toEqual({ type: 'solid', kind: 'pyramidPar', ids: ['A', 'B', 'C', 'D', 'S'] });
    expect(kindOf('pyramid SABCD with a parallelogram base').kind).toBe('pyramidPar');
  });
  it('a plain triangular prism/pyramid is unchanged (not equilateral)', () => {
    expect(kindOf('מנסרה ישרה משולשת ABC').kind).toBe('prism3');
    expect(kindOf('פירמידה ישרה SABC').kind).toBe('pyramid3');
  });
});

describe('V8-d — build', () => {
  beforeEach(reset);

  it('the equilateral prism has an equilateral base and straight verticals', () => {
    submit("מנסרה ישרה ABCA'B'C' שבסיסה משולש שווה צלעות");
    expect(state().lastError).toBeNull();
    const p = derived().positions;
    const [A, B, C] = ['A', 'B', 'C'].map((i) => p.get(i)!);
    expect(d(A, B)).toBeCloseTo(d(B, C), 6);
    expect(d(B, C)).toBeCloseTo(d(C, A), 6);
    // A→A' is vertical and equals B→B'
    expect(d(A, p.get("A'")!)).toBeCloseTo(d(B, p.get("B'")!), 6);
  });

  it('the equilateral pyramid: equilateral base, apex above the centroid (equal lateral edges)', () => {
    submit('פירמידה ישרה SABC שבסיסה משולש שווה צלעות');
    expect(state().lastError).toBeNull();
    const p = derived().positions;
    const [A, B, C, S] = ['A', 'B', 'C', 'S'].map((i) => p.get(i)!);
    expect(d(A, B)).toBeCloseTo(d(B, C), 6);
    expect(d(B, C)).toBeCloseTo(d(C, A), 6);
    // a RIGHT pyramid: the lateral edges are equal
    expect(d(S, A)).toBeCloseTo(d(S, B), 6);
    expect(d(S, B)).toBeCloseTo(d(S, C), 6);
  });

  it('the parallelogram pyramid: base is a parallelogram (AB ∥ DC, AD ∥ BC), apex free', () => {
    submit('פירמידה SABCD שבסיסה מקבילית');
    expect(state().lastError).toBeNull();
    const p = derived().positions;
    const [A, B, C, D, S] = ['A', 'B', 'C', 'D', 'S'].map((i) => p.get(i)!);
    // opposite sides equal as vectors ⇒ parallelogram
    expect(sub(B, A).x).toBeCloseTo(sub(C, D).x, 6);
    expect(sub(B, A).y).toBeCloseTo(sub(C, D).y, 6);
    expect(sub(D, A).x).toBeCloseTo(sub(C, B).x, 6);
    expect(sub(D, A).y).toBeCloseTo(sub(C, B).y, 6);
    // apex genuinely off the base plane
    expect(Math.abs(S.z - A.z)).toBeGreaterThan(0.1);
  });
});
