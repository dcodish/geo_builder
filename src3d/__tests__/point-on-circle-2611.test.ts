/**
 * #2611 stage A ([ADR-3D-410](../../docs/06b-decisions-3d.md#adr-3d-410)) — a point stated on a circle RIDES it.
 *
 * Measured at 2142a8d1 through `useGeo3.submit`: «משולש ABC חסום במעגל» · «D על המעגל» was refused `not-on-line D`.
 * `point-on-circle3` only checked that D and the circle exist; the fold's mint pass made D a free point, and the status
 * pass then found it off the circle. The on-line rider's circle twin (`on-circle3`) now places a new D on the circle
 * with one sampled DOF (the angle), an existing FREE D re-homes onto it, and a placed D off the circle stays refused.
 * Stage B (a blank canvas creates the circle) waits on #253: «D על המעגל» alone keeps today's answer here.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { freeDofCount3 } from '../engine/evaluate';

const st = () => useGeo3.getState();
const reset = () => useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never);
const run = (...lines: string[]) => {
  reset();
  for (const l of lines) st().submit(l);
};
const d = (seed = st().seed) => derive3(st().facts, seed);
const allOk = (seed = st().seed) => Object.values(d(seed).status).every((s) => s === 'ok');
/** |P − centre| − r and the out-of-plane offset, against the circle `circle` (default: the only one). */
const offCircle = (id: string, seed: number, circle?: string): number => {
  const r = d(seed).resolved;
  const k = circle ? r.circles3.find((x) => x.id === circle)! : r.circles3[0];
  const p = r.positions.get(id)!;
  const v = { x: p.x - k.center.x, y: p.y - k.center.y, z: p.z - k.center.z };
  const radial = Math.abs(Math.hypot(v.x, v.y, v.z) - k.radius);
  const plane = Math.abs(v.x * k.normal.x + v.y * k.normal.y + v.z * k.normal.z);
  return Math.max(radial, plane);
};
const angleOn = (id: string, seed: number): number => {
  const r = d(seed).resolved;
  const k = r.circles3[0];
  const p = r.positions.get(id)!;
  const v = { x: p.x - k.center.x, y: p.y - k.center.y, z: p.z - k.center.z };
  return Math.atan2(v.x * k.e2.x + v.y * k.e2.y + v.z * k.e2.z, v.x * k.e1.x + v.y * k.e1.y + v.z * k.e1.z);
};
const SEEDS = [0, 1, 2, 3];

beforeEach(reset);

describe('#2611 — a NEW point stated on a circle is placed on it', () => {
  it('the reported line: D lies on the circumcircle at every seed, and its angle is a sampled DOF', () => {
    run('משולש ABC חסום במעגל', 'D על המעגל');
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(2);
    expect(d().construction.points.get('D')).toEqual({ kind: 'on-circle3', circle: 'circle-ABC' });
    for (const s of SEEDS) {
      expect(allOk(s)).toBe(true);
      expect(offCircle('D', s)).toBeLessThan(1e-9);
    }
    const angles = SEEDS.map((s) => angleOn('D', s));
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(0.3); // it moves along the circle, not a fixed spot
  });

  it('the DOF cue counts the angle', () => {
    run('משולש ABC חסום במעגל');
    const before = freeDofCount3(d().construction, d().resolved);
    st().submit('D על המעגל');
    expect(freeDofCount3(d().construction, d().resolved)).toBe(before + 1);
  });

  it('English reads the same', () => {
    run('triangle ABC inscribed in a circle', 'D is on the circle');
    expect(st().lastError).toBeNull();
    for (const s of SEEDS) expect(offCircle('D', s)).toBeLessThan(1e-9);
  });

  it('an incircle and a tangent-line circle carry a rider the same way', () => {
    for (const first of ['מעגל חסום במשולש ABC', 'מעגל A משיק לישר BC בנקודה F']) {
      run(first, 'D על המעגל');
      expect(st().lastError, first).toBeNull();
      for (const s of SEEDS) {
        expect(allOk(s), `${first} @${s}`).toBe(true);
        expect(offCircle('D', s), `${first} @${s}`).toBeLessThan(1e-9);
      }
    }
  });

  it("a cube face's circle: a new E rides it, and a later length on E drives the rider", () => {
    run("קובייה ABCDA'B'C'D'", 'משולש ABC חסום במעגל', 'E על המעגל', 'AE = 1');
    expect(st().lastError).toBeNull();
    for (const s of SEEDS) {
      expect(allOk(s)).toBe(true);
      expect(offCircle('E', s)).toBeLessThan(1e-7);
    }
  });

  it('a stated size after the rider keeps it on the circle (the rider rides the figure with its ring)', () => {
    run('משולש ABC חסום במעגל', 'D על המעגל', 'AB = 2');
    for (const s of SEEDS) {
      expect(allOk(s)).toBe(true);
      expect(offCircle('D', s)).toBeLessThan(1e-9);
    }
  });

  it('a point built from the rider follows it, and adding it does not move D', () => {
    run('משולש ABC חסום במעגל', 'D על המעגל');
    const D0 = d().positions.get('D')!;
    st().submit('M אמצע AD');
    expect(st().lastError).toBeNull();
    const r = d().resolved;
    expect(r.positions.get('D')).toEqual(D0);
    const A = r.positions.get('A')!;
    const M = r.positions.get('M')!;
    expect(Math.hypot(M.x - (A.x + D0.x) / 2, M.y - (A.y + D0.y) / 2, M.z - (A.z + D0.z) / 2)).toBeLessThan(1e-9);
  });
});

describe('#2611 — an EXISTING point stated on a circle', () => {
  it('a free point an earlier line minted re-homes onto the circle, and what was built from it follows', () => {
    run('משולש ABC חסום במעגל', 'M אמצע AD', 'D על המעגל');
    expect(st().lastError).toBeNull();
    expect(d().construction.points.get('D')?.kind).toBe('on-circle3');
    for (const s of SEEDS) {
      expect(allOk(s)).toBe(true);
      expect(offCircle('D', s)).toBeLessThan(1e-9);
      const p = d(s).positions;
      const [A, D, M] = ['A', 'D', 'M'].map((id) => p.get(id)!);
      expect(Math.hypot(M.x - (A.x + D.x) / 2, M.y - (A.y + D.y) / 2, M.z - (A.z + D.z) / 2)).toBeLessThan(1e-9);
    }
  });

  it('a placed point off the circle is still refused: a claim stays a claim', () => {
    run("קובייה ABCDA'B'C'D'", 'משולש ABC חסום במעגל', "A' על המעגל");
    expect(st().lastError).toEqual({ code: 'not-on-line', id: "A'" });
    expect(st().facts).toHaveLength(2);
  });

  it('a placed point ON the circle verifies and keeps its owner', () => {
    run("קובייה ABCDA'B'C'D'", 'משולש ABC חסום במעגל', 'D על המעגל');
    expect(st().lastError).toBeNull();
    expect(d().construction.points.get('D')?.kind).toBe('solid-vertex');
  });

  it('a free point the circle is built from is never re-homed onto it (no cycle)', () => {
    // O is minted free by the first line, then made the centre of a circle: «O על המעגל» must not seat O on its own circle
    run('M אמצע AO', 'מעגל O משיק לישר BC בנקודה F', 'O על המעגל');
    expect(st().lastError).toEqual({ code: 'not-on-line', id: 'O' });
    expect(d().construction.points.get('O')?.kind).toBe('free3');
  });
});

describe('#2611 — what stage A leaves as it was', () => {
  it('two circles: «המעגל» names neither, as today', () => {
    run('משולש ABC חסום במעגל', 'מעגל חסום במשולש ABC', 'D על המעגל');
    expect(st().lastError).toEqual({ code: 'unknown-line', id: 'circle' });
  });

  it('a blank canvas keeps today\'s refusal until #253 (stage B)', () => {
    run('D על המעגל');
    expect(st().lastError).toEqual({ code: 'unknown-line', id: 'circle' });
  });
});
