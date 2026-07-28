/**
 * #379 (ADR-3D-101): the LANDING FUNNEL — gauge-component freedom is classified per component from the
 * residual families present, never by a per-path boolean proxy.
 *
 * Found by design review of the relations program (docs/26 v2 §4), verified by probe before filing. Both
 * doors built `lastError: null` and drew ℓ1 through vertex A at EVERY seed (dist = 0.0000):
 *   (a) a pair injection pins direction+scale but never translation — the pivot rooted translation at
 *       the origin, and `pivot !== null` / `positionPinned` read that as "placed";
 *   (b) a similarity-invariant scalar pin runs the pivot with the gauge FROZEN — frozen is not solved,
 *       yet both proxies treated it as placed (and `rotationSolved = pivot !== null` never re-sampled a
 *       rotation nothing had constrained).
 *
 * Fourth and fifth bypass of the ADR-3D-095 guard in one day (#372, #375 Am. 1, these). The class: a
 * boolean proxy standing in for "which gauge components did the solve actually determine?".
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import type { Vec3 } from '../engine/vec3';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

const distToLine = (p: Vec3, anchor: Vec3, dir: Vec3): number => {
  const ap = { x: p.x - anchor.x, y: p.y - anchor.y, z: p.z - anchor.z };
  const dd = dir.x * dir.x + dir.y * dir.y + dir.z * dir.z;
  const t = (ap.x * dir.x + ap.y * dir.y + ap.z * dir.z) / dd;
  return Math.hypot(ap.x - t * dir.x, ap.y - t * dir.y, ap.z - t * dir.z);
};

const LINE = 'l1:x=(0,0,0)+t(m,2m,3m)';

describe('#379 — the landing funnel', () => {
  beforeEach(() => state().clear());

  it('door (a): a PAIR injection leaves translation free — it is sampled, the injection survives, the line clears', () => {
    submit('פירמידה משולשת');
    submit(LINE);
    submit('AB = (1,2,3)');
    expect(state().lastError).toBeNull();

    const seen: string[] = [];
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const d = derive3(state().facts, seed);
      const pos = d.resolved.positions;
      const ln = d.resolved.lines.get('ℓ1')!;
      for (const id of ['A', 'B', 'C', 'D']) {
        expect(distToLine(pos.get(id)!, ln.anchor, ln.dir), `${id} clears ℓ1 at seed ${seed}`).toBeGreaterThan(0.15);
      }
      // the INJECTION is translation-invariant and must survive the sampling exactly
      const A = pos.get('A')!;
      const B = pos.get('B')!;
      expect(B.x - A.x, `AB.x at seed ${seed}`).toBeCloseTo(1, 6);
      expect(B.y - A.y, `AB.y at seed ${seed}`).toBeCloseTo(2, 6);
      expect(B.z - A.z, `AB.z at seed ${seed}`).toBeCloseTo(3, 6);
      seen.push(`${A.x.toFixed(3)},${A.y.toFixed(3)},${A.z.toFixed(3)}`);
    }
    expect(new Set(seen).size, 'translation genuinely varies across configurations').toBeGreaterThan(3);
    // pre-fix: A=(0,0,0) and dist(A,ℓ1)=0.0000 at every seed
    expect(seen.every((s) => s === '0.000,0.000,0.000')).toBe(false);
  });

  it('door (b): an INVARIANT scalar pin freezes nothing the funnel must keep — full rigid motion is sampled, the angle survives', () => {
    submit('פירמידה משולשת');
    submit(LINE);
    submit('זווית BAC = 60');
    expect(state().lastError).toBeNull();

    const dirs: string[] = [];
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const d = derive3(state().facts, seed);
      const pos = d.resolved.positions;
      const ln = d.resolved.lines.get('ℓ1')!;
      for (const id of ['A', 'B', 'C', 'D']) {
        expect(distToLine(pos.get(id)!, ln.anchor, ln.dir), `${id} clears ℓ1 at seed ${seed}`).toBeGreaterThan(0.15);
      }
      // the DRIVEN angle is rigid-motion-invariant and must hold exactly after sampling
      const [A, B, C] = ['A', 'B', 'C'].map((id) => pos.get(id)!);
      const u = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
      const v = { x: C.x - A.x, y: C.y - A.y, z: C.z - A.z };
      const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / (Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z));
      expect((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI, `∠BAC at seed ${seed}`).toBeCloseTo(60, 4);
      // door (c): rotation was FROZEN, not solved — it must now vary across seeds
      const n = Math.hypot(u.x, u.y, u.z);
      dirs.push(`${(u.x / n).toFixed(2)},${(u.y / n).toFixed(2)},${(u.z / n).toFixed(2)}`);
    }
    expect(new Set(dirs).size, 'rotation genuinely varies across configurations (door c)').toBeGreaterThan(3);
  });

  it('a POINT-pinned figure is untouched — both components read pinned, nothing is sampled', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit(LINE);
    submit('A(1,2,3)');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 3]) {
      const A = derive3(state().facts, seed).resolved.positions.get('A')!;
      expect(A.x, `A.x pinned at seed ${seed}`).toBeCloseTo(1, 5);
      expect(A.y).toBeCloseTo(2, 5);
      expect(A.z).toBeCloseTo(3, 5);
    }
  });

  it('the #375 Am. 1 behaviour is preserved: a ⟂ drive keeps its orientation, translation still samples', () => {
    submit('פירמידה משולשת');
    submit(LINE);
    submit('l1 מאונך למישור ACD');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 2, 4]) {
      const d = derive3(state().facts, seed);
      const pos = d.resolved.positions;
      const ln = d.resolved.lines.get('ℓ1')!;
      // the drive's relation holds…
      const [A, C, D] = ['A', 'C', 'D'].map((id) => pos.get(id)!);
      const e1 = { x: C.x - A.x, y: C.y - A.y, z: C.z - A.z };
      const e2 = { x: D.x - A.x, y: D.y - A.y, z: D.z - A.z };
      const n = { x: e1.y * e2.z - e1.z * e2.y, y: e1.z * e2.x - e1.x * e2.z, z: e1.x * e2.y - e1.y * e2.x };
      const nn = Math.hypot(n.x, n.y, n.z);
      const dn = Math.hypot(ln.dir.x, ln.dir.y, ln.dir.z);
      const cx = { x: n.y * ln.dir.z - n.z * ln.dir.y, y: n.z * ln.dir.x - n.x * ln.dir.z, z: n.x * ln.dir.y - n.y * ln.dir.x };
      expect(Math.hypot(cx.x, cx.y, cx.z) / (nn * dn), `⟂ holds at seed ${seed}`).toBeLessThan(1e-3);
      // …and no vertex sits on the line
      for (const id of ['A', 'B', 'C', 'D']) {
        expect(distToLine(pos.get(id)!, ln.anchor, ln.dir), `${id} clears at seed ${seed}`).toBeGreaterThan(0.15);
      }
    }
  });
});
