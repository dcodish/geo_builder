/**
 * #2489 part B ([ADR-3D-383](../../docs/06b-decisions-3d.md#adr-3d-383), ADR-W-163; operator 2026-10-24, T45 «קובייה
 * ABCD» · «הישר k מאונך למישור ABC»: *"the tool needs to create the line if its referenced with dof"*; ruling
 * 2026-10-24, card e20 = A: no notice for a created line) — a line named with its noun before it exists is created
 * exactly as its declaration «ישר k» creates it, by #1467's mint pass, in every relation that names a line.
 *
 * Measured at the #1467 tip (stacked): every relation below refused `unknown-line k` (m, ℓ for the crossing and the
 * distance too); with «ישר k» declared first, the same relations read DOF 2/2/2/3/4.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { freeDofCount3 } from '../engine/evaluate';

const st = () => useGeo3.getState();
const run = (...lines: string[]) => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never);
  for (const l of lines) st().submit(l);
};
const d = (seed = 0) => derive3(st().facts, seed);
const dof = () => freeDofCount3(d().construction, d().resolved);

beforeEach(() => run());

describe('#2489 T45 — a line named with its noun is created free, as «ישר k» declares it', () => {
  const ROWS: [string, number][] = [
    ['הישר k מאונך למישור ABC', 2],
    ['the line k is perpendicular to the plane ABC', 2],
    ['הישר k מקביל ל-AB', 2],
    ['A על הישר k', 2],
    ['הזווית בין הישר k למישור ABC היא 30', 3],
    ['הישר k חותך את המישור ABC בנקודה M', 4],
    ['הישר ℓ חותך את המישור ABC בנקודה M', 4],
    ['הישר m מאונך למישור ABC', 2],
    ['הישר d מאונך למישור ABC', 2],
  ];
  it.each(ROWS)('«קובייה ABCD» · «%s» builds, and its DOF is the declared line\'s (%i)', (line, n) => {
    run('קובייה ABCD', line);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(2);
    expect(dof()).toBe(n);
    run('קובייה ABCD', `ישר ${/ℓ/.test(line) ? 'ℓ' : /הישר ([a-z])/.exec(line)?.[1] ?? 'k'}`, line);
    expect(dof(), 'the same DOF as with «ישר …» declared first').toBe(n);
  });

  it('two new lines in one sentence are both created (DOF 6)', () => {
    run('קובייה ABCD', 'הישר k מקביל לישר m');
    expect(st().lastError).toBeNull();
    expect([...d().construction.lines.keys()].sort()).toEqual(['k', 'm']);
    expect(dof()).toBe(6);
  });

  it('the created line holds its relation at five seeds, and moves (ADR-052)', () => {
    run('קובייה ABCD', 'הישר k מאונך למישור ABC');
    const dirs = new Set<string>();
    for (const s of [0, 1, 2, 3, 4]) {
      const dv = d(s);
      const r = dv.resolved;
      const k = r.lines.get('k')!;
      const [A, B, C] = ['A', 'B', 'C'].map((id) => dv.positions.get(id)!);
      const u = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
      const v = { x: C.x - A.x, y: C.y - A.y, z: C.z - A.z };
      const dot = (p: typeof u, q: typeof u) => p.x * q.x + p.y * q.y + p.z * q.z;
      expect(Math.abs(dot(k.dir, u)) / Math.hypot(u.x, u.y, u.z)).toBeLessThan(1e-7);
      expect(Math.abs(dot(k.dir, v)) / Math.hypot(v.x, v.y, v.z)).toBeLessThan(1e-7);
      dirs.add(`${k.anchor.x.toFixed(3)},${k.anchor.y.toFixed(3)}`);
    }
    expect(dirs.size).toBeGreaterThan(1);
  });

  it('no notice for a created line (ruling 2026-10-24, card e20 = A)', () => {
    run('קובייה ABCD', 'הישר k מאונך למישור ABC');
    expect(st().lastCreated).toBeNull();
  });

  it('mint-last: a line declared BELOW binds, and nothing is created', () => {
    run('קובייה ABCD', 'הישר k מאונך למישור ABC', 'ישר k');
    expect(Object.values(d().status)).toEqual(['ok', 'ok', 'ok']);
    expect(d().created).toEqual({});
  });

  it('a clash is the declaration\'s own refusal: «נסמן: AB = u» · «הישר u …» is refused, as «ישר u» is', () => {
    run('קובייה ABCD', 'נסמן: AB = u', 'הישר u מאונך למישור ABC');
    expect(st().facts).toHaveLength(2);
    const created = st().lastError;
    run('קובייה ABCD', 'נסמן: AB = u', 'ישר u');
    expect(created).toEqual(st().lastError);
  });

  it('a distance to a free line keeps the declared line\'s verdict (refused `line-not-determined`), never «define it first»', () => {
    run('קובייה ABCD', 'המרחק בין A לישר k הוא 3');
    expect(st().lastError).toEqual({ code: 'line-not-determined', id: 'k' });
    expect(d().construction.lines.has('k'), 'a refused line keeps nothing it created').toBe(false);
    run('קובייה ABCD', 'ישר k', 'המרחק בין A לישר k הוא 3');
    expect(st().lastError).toEqual({ code: 'line-not-determined', id: 'k' });
  });

  it('a circle reported through the line code is never made a line («A נמצאת על המעגל»)', () => {
    run('קובייה ABCD', 'A נמצאת על המעגל');
    expect(st().facts).toHaveLength(1);
    expect(d().construction.lines.size).toBe(0);
  });

  it('a bare lowercase letter is still a vector, not a line («k מאונך למישור ABC»)', () => {
    run('קובייה ABCD', 'k מאונך למישור ABC');
    expect(st().lastError?.code).toBe('unknown-vector');
  });
});
