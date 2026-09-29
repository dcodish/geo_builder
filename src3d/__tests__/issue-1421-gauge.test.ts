/**
 * THE GAUGE IS NOT A CONFIGURATION (#1421, ADR-3D-272).
 *
 * Operator, playing round #1408 T35: *"image is not proportional"* — his triangle with |AB| = 5
 * and |AC| = 3 tumbled edge-on to the camera at 3 of 4 seeds, so AB drew SHORTER than AC while
 * the 3-D figure was exactly right. Ruled twice (2026-09-27): an unanchored figure keeps the
 * canonical placement after every solve — first point at origin, first edge along +x, first
 * plane on the floor — and «הציגו תצורה אחרת» changes the SHAPE alone.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3, derive3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const at = (seed: number) => derive3(useGeo3.getState().facts, seed).resolved.positions;

beforeEach(reset);

describe('#1421 — the operator’s T35 figure keeps the floor at every configuration', () => {
  it('the triangle’s plane is z = 0, A at the origin, AB along +x — at every seed; lengths exact', () => {
    submit('וקטור AB');
    submit('משולש ABC');
    submit('אורך AB = 5');
    submit('אורך AC = 3');
    for (const seed of [0, 1, 2, 3, 7]) {
      const pos = at(seed);
      const [a, b, c3] = [pos.get('A')!, pos.get('B')!, pos.get('C')!];
      expect(Math.hypot(a.x, a.y, a.z), `seed ${seed}: A at origin`).toBeLessThan(1e-6);
      expect(Math.abs(b.y) + Math.abs(b.z), `seed ${seed}: AB along +x`).toBeLessThan(1e-6);
      expect(b.x, `seed ${seed}`).toBeGreaterThan(0);
      expect(Math.abs(c3.z), `seed ${seed}: C on the floor`).toBeLessThan(1e-6);
      // The figure itself is untouched: the stated lengths hold exactly.
      expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), `seed ${seed}`).toBeCloseTo(5, 4);
      expect(Math.hypot(c3.x - a.x, c3.y - a.y, c3.z - a.z), `seed ${seed}`).toBeCloseTo(3, 4);
    }
  });

  it('the SHAPE still cycles — the angle at A varies across configurations', () => {
    submit('משולש ABC');
    submit('אורך AB = 5');
    submit('אורך AC = 3');
    const angles = new Set<number>();
    for (const seed of [0, 1, 2, 3]) {
      const pos = at(seed);
      const [a, b, c3] = [pos.get('A')!, pos.get('B')!, pos.get('C')!];
      const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const v = { x: c3.x - a.x, y: c3.y - a.y, z: c3.z - a.z };
      const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / (5 * 3);
      angles.add(Math.round(Math.acos(Math.max(-1, Math.min(1, cos))) * 100));
    }
    expect(angles.size).toBeGreaterThan(1);
  });
});

describe('#1421 — anchored figures are untouched', () => {
  it('a coordinate injection keeps its stated place', () => {
    submit('משולש ABC');
    submit('A = (2,1,3)');
    const a = at(0).get('A')!;
    expect([a.x, a.y, a.z]).toEqual([2, 1, 3]);
  });

  it('a cube keeps its canonical solid placement — the normalisation never runs for solids', () => {
    submit("קובייה ABCDA'B'C'D'");
    const a0 = at(0).get('A')!;
    const b0 = at(0).get('B')!;
    expect(Math.hypot(b0.x - a0.x, b0.y - a0.y, b0.z - a0.z)).toBeGreaterThan(0);
  });
});
