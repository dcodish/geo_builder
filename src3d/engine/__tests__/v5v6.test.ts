/**
 * V5+V6 engine tests: the right pyramid (equal lateral edges), lines through
 * points cutting point-planes (the 2019 oracle K=(2,4,2)), revolution solids
 * (free vs stated sizes), and the volume / lateral-area claims (r=5,h=12 cone:
 * ℓ=13, M=65π, V=100π; sphere R=3: V=36π=M).
 */

import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../apply';
import { verifyClaim } from '../claims';
import { resolve3 } from '../evaluate';
import { emptyConstruction3, type Command3, type Construction3 } from '../types';
import { dist3 } from '../vec3';

function build(cmds: Command3[]): Construction3 {
  let c = emptyConstruction3();
  for (const cmd of cmds) {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(`apply failed: ${JSON.stringify(r.error)}`);
    c = r.next;
  }
  return c;
}

describe('right pyramid (V5)', () => {
  it('pyramid4: apex above the square centre — equal lateral edges; height is a free DOF', () => {
    const c = build([{ type: 'solid', kind: 'pyramid4', ids: ['A', 'B', 'C', 'D', 'S'] }]);
    const pos = resolve3(c, 0).positions;
    const S = pos.get('S')!;
    const laterals = ['A', 'B', 'C', 'D'].map((id) => dist3(pos.get(id)!, S));
    for (const l of laterals) expect(l).toBeCloseTo(laterals[0], 10);
    const h0 = S.z;
    expect(resolve3(c, 1).positions.get('S')!.z).not.toBeCloseTo(h0, 4);
  });

  it('pyramid3: apex above the circumcentre — equal lateral edges over a free base triangle', () => {
    const c = build([{ type: 'solid', kind: 'pyramid3', ids: ['A', 'B', 'C', 'S'] }]);
    const pos = resolve3(c, 3).positions;
    const S = pos.get('S')!;
    const laterals = ['A', 'B', 'C'].map((id) => dist3(pos.get(id)!, S));
    for (const l of laterals) expect(l).toBeCloseTo(laterals[0], 8);
  });
});

describe('line through two points cutting a point-plane (V5 — the 2019 cube)', () => {
  it("K = ℓ(A'C) ∩ plane(BC'D) lands exactly at the hand-worked point", () => {
    const c = build([
      { type: 'solid', kind: 'cube', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] },
      { type: 'point3', id: 'B', x: 0, y: 0, z: 0 },
      { type: 'point3', id: 'A', x: 6, y: 0, z: 0 },
      { type: 'point3', id: 'C', x: 0, y: 6, z: 0 },
      { type: 'sign-given', id: "B'", axis: 'z', positive: true },
      { type: 'line-through', name: "A'C", a: "A'", b: 'C' },
      { type: 'plane-through', name: "BC'D", ids: ['B', "C'", 'D'] },
      { type: 'line-plane-point', id: 'K', line: "A'C", plane: "BC'D" },
    ]);
    const r = resolve3(c, 0);
    const K = r.positions.get('K')!;
    expect(K.x).toBeCloseTo(2, 4);
    expect(K.y).toBeCloseTo(4, 4);
    expect(K.z).toBeCloseTo(2, 4);
    // the 2019 answers as claims: the ratio A'K : A'C = 2 : 3 and the ⊥ angle
    expect(verifyClaim({ type: 'length-ratio', a1: "A'", b1: 'K', a2: "A'", b2: 'C', p: 2, q: 3 }, c, 0)).toBe(true);
    expect(verifyClaim({ type: 'angle-seg-eq', a1: "A'", b1: 'C', a2: 'B', b2: "C'", deg: 90 }, c, 0)).toBe(true);
    expect(verifyClaim({ type: 'angle-seg-eq', a1: "A'", b1: 'C', a2: 'B', b2: "C'", deg: 60 }, c, 0)).toBe(false);
  });
});

describe('solids of revolution (V6)', () => {
  it('unstated sizes are FREE sampled DOFs; stated ones pin', () => {
    const free = build([{ type: 'revolution', kind: 'cone', center: 'O', apex: 'S' }]);
    const h = (seed: number) => resolve3(free, seed).revolutions[0].h;
    expect(h(0)).not.toBeCloseTo(h(1), 4);
    const pinned = build([{ type: 'revolution', kind: 'cone', center: 'O', apex: 'S', radius: 5, height: 12 }]);
    expect(resolve3(pinned, 0).revolutions[0]).toMatchObject({ r: 5, h: 12 });
    expect(resolve3(pinned, 5).revolutions[0]).toMatchObject({ r: 5, h: 12 });
    expect(dist3(resolve3(pinned, 0).positions.get('S')!, resolve3(pinned, 0).positions.get('O')!)).toBeCloseTo(12, 10);
  });

  it('cone r=5 h=12: V=100π and M=65π verify; wrong values refuse', () => {
    const c = build([{ type: 'revolution', kind: 'cone', center: 'O', apex: 'S', radius: 5, height: 12 }]);
    expect(verifyClaim({ type: 'volume-eq', solid: 'cone', value: 100 * Math.PI }, c, 0)).toBe(true);
    expect(verifyClaim({ type: 'volume-eq', solid: 'cone', value: 99 * Math.PI }, c, 0)).toBe(false);
    expect(verifyClaim({ type: 'lateral-area-eq', solid: 'cone', value: 65 * Math.PI }, c, 0)).toBe(true);
  });

  it('sphere R=3: V = 36π = surface area; cylinder r=3 h=7: V=63π, M=42π', () => {
    const sph = build([{ type: 'revolution', kind: 'sphere', center: 'O', radius: 3 }]);
    expect(verifyClaim({ type: 'volume-eq', solid: 'sphere', value: 36 * Math.PI }, sph, 0)).toBe(true);
    expect(verifyClaim({ type: 'lateral-area-eq', solid: 'sphere', value: 36 * Math.PI }, sph, 0)).toBe(true);
    const cyl = build([{ type: 'revolution', kind: 'cylinder', center: 'O', radius: 3, height: 7 }]);
    expect(verifyClaim({ type: 'volume-eq', solid: 'cylinder', value: 63 * Math.PI }, cyl, 0)).toBe(true);
    expect(verifyClaim({ type: 'lateral-area-eq', solid: 'cylinder', value: 42 * Math.PI }, cyl, 0)).toBe(true);
  });

  it('a size claim on an unstated-size solid refuses at APPLY (free-size-claim); a missing solid refuses too', () => {
    const free = build([{ type: 'revolution', kind: 'cone', center: 'O', apex: 'S' }]);
    const r1 = applyCommand3(free, { type: 'claim', claim: { type: 'volume-eq', solid: 'cone', value: 1 } });
    expect(r1).toMatchObject({ ok: false, error: { code: 'free-size-claim' } });
    const r2 = applyCommand3(free, { type: 'claim', claim: { type: 'volume-eq', solid: 'sphere', value: 1 } });
    expect(r2).toMatchObject({ ok: false, error: { code: 'no-such-solid' } });
  });
});
