/**
 * #117 — right prisms over more bases (parallelogram / general quad / square / regular pentagon+hexagon)
 * and the oblique parallelepiped (מקבילון). Each slots into the existing dims-sampler + pivot with no new
 * solver code; topology is the generic 2n-vertex prism ring.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import { dist3, sub3 } from '../engine/vec3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const derived = () => derive3(useGeo3.getState().facts, useGeo3.getState().seed);
const kindOf = (u: string) => {
  const r = parse3(u);
  return r.ok ? (r.commands[0] as { kind?: string }).kind : `NOTOK:${(r as { reason: string }).reason}`;
};
const cross = (a: { x: number; y: number; z: number }, b: typeof a) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const parallel = (u: { x: number; y: number; z: number }, v: typeof u) => {
  const c = cross(u, v);
  return Math.hypot(c.x, c.y, c.z) < 1e-9;
};

describe('#117 — right-prism base dispatch (parser)', () => {
  it('each base noun routes to its solid kind (He + En)', () => {
    expect(kindOf('מנסרה ישרה שבסיסה מקבילית')).toBe('prism4');
    expect(kindOf('right prism with a parallelogram base')).toBe('prism4');
    expect(kindOf('מנסרה ישרה שבסיסה מרובע')).toBe('prism4g');
    expect(kindOf('מנסרה ישרה שבסיסה ריבוע')).toBe('prism4sq');
    expect(kindOf('right prism with a square base')).toBe('prism4sq');
    expect(kindOf('מנסרה ישרה שבסיסה מלבן')).toBe('box');
    expect(kindOf('מנסרה ישרה שבסיסה מחומש')).toBe('prismReg5');
    expect(kindOf('right prism with a hexagon base')).toBe('prismReg6');
  });
  it('regressions: triangle + rhombus bases are unchanged; bare מנסרה ישרה still refuses', () => {
    expect(kindOf('מנסרה ישרה משולשת')).toBe('prism3');
    expect(kindOf("מנסרה ישרה שווה צלעות ABCA'B'C'")).toBe('prism3e');
    expect(kindOf('מנסרה ישרה שבסיסה מעוין')).toBe('prism4r');
    expect(parse3('מנסרה ישרה').ok).toBe(false); // no base noun, no labels → honest ADR-052 refusal
  });
  it('מקבילון / parallelepiped parses (oblique named solid)', () => {
    expect(kindOf('מקבילון')).toBe('parallelepiped');
    expect(kindOf('parallelepiped ABCDEFGH')).toBe('parallelepiped');
  });
});

describe('#117 — build geometry', () => {
  beforeEach(reset);
  const at = (id: string) => derived().positions.get(id)!;

  it('a square-base right prism: base ABCD is a unit square, top straight up', () => {
    submit("מנסרה ישרה שבסיסה ריבוע ABCDA'B'C'D'");
    expect(useGeo3.getState().lastError).toBeNull();
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map(at);
    expect(dist3(A, B)).toBeCloseTo(dist3(B, C), 9); // equal sides
    expect(dist3(A, B)).toBeCloseTo(dist3(C, D), 9);
    // AB ⟂ AD (a square corner)
    const ab = sub3(B, A), ad = sub3(D, A);
    expect(ab.x * ad.x + ab.y * ad.y + ab.z * ad.z).toBeCloseTo(0, 9);
    // A' is A translated straight up (only z differs)
    const Ap = at("A'");
    expect(Ap.x).toBeCloseTo(A.x, 9);
    expect(Ap.y).toBeCloseTo(A.y, 9);
    expect(Ap.z).toBeGreaterThan(A.z + 0.1);
  });

  it('a parallelogram-base right prism: opposite base edges are parallel', () => {
    submit("מנסרה ישרה שבסיסה מקבילית ABCDA'B'C'D'");
    expect(useGeo3.getState().lastError).toBeNull();
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map(at);
    expect(parallel(sub3(B, A), sub3(C, D))).toBe(true); // AB ∥ DC
    expect(parallel(sub3(D, A), sub3(C, B))).toBe(true); // AD ∥ BC
  });

  it('a parallelepiped is oblique: the top ring is the base translated by ONE lateral vector', () => {
    submit("מקבילון ABCDA'B'C'D'");
    expect(useGeo3.getState().lastError).toBeNull();
    const w = sub3(at("A'"), at('A'));
    for (const v of ['B', 'C', 'D']) {
      const wv = sub3(at(`${v}'`), at(v));
      expect(wv.x).toBeCloseTo(w.x, 9); // every vertical edge is the SAME vector w
      expect(wv.y).toBeCloseTo(w.y, 9);
      expect(wv.z).toBeCloseTo(w.z, 9);
    }
  });
});
