/**
 * #2484 ([ADR-3D-388](../../docs/06b-decisions-3d.md#adr-3d-388); operator 2026-10-24: *"user can say הישר AC' מאונך
 * למישור π3 even withou π3 being defined and π3 should be created with dof"*, *"even after i define π3 and then ask it to
 * be perpendicular, it is refused"*; ballot ruling 2026-10-24, e9 = e10 = e11 = A) — a FREE plane is pinned by whatever
 * is stated about it, through the operand seam the free line already reads, and a relation naming a missing π-plane
 * creates it free through #1467's mint pass, with no notice.
 *
 * Measured at `422cda84` (`useGeo3.submit`): on a DECLARED free plane, ⟂ / ∥ / ⊂ a segment, a vector ⟂ / ∥, a segment
 * angle and a named line ⊂ refused `plane-not-determined`; on an UNDECLARED π-plane, every relation except a membership
 * refused `unknown-plane`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

const CUBE = "קובייה ABCDA'B'C'D'";
const st = () => useGeo3.getState();
const run = (...lines: string[]) => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never);
  for (const l of lines) st().submit(l);
};
const d = (seed = 0) => derive3(st().facts, seed);
const planeDof = (seed = 0) => d(seed).resolved.freePlaneDofs.get('π3');
type V = { x: number; y: number; z: number };
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: V) => Math.hypot(a.x, a.y, a.z);
const cosAbs = (a: V, b: V) => Math.abs(dot(a, b)) / (len(a) * len(b));

beforeEach(() => run());

/** [the relation line, the extra lines it needs first, π3's DOF after it] — π3's own DOF, the cue's number. */
const RELATIONS: [string, string[], number][] = [
  ["הישר AC' מאונך למישור π3", [], 1],
  ["AC' ⟂ π3", [], 1],
  ["the line AC' is perpendicular to the plane π3", [], 1],
  ['הישר AB מקביל למישור π3', [], 2],
  ['AB ∥ π3', [], 2],
  ['the line AB is parallel to the plane π3', [], 2],
  ['הישר AB מוכל במישור π3', [], 1],
  ['the line AB lies in the plane π3', [], 1],
  ['u ⟂ π3', ['נסמן: AB = u'], 1],
  ['u ∥ π3', ['נסמן: AB = u'], 2],
  ["הזווית בין הישר AC' למישור π3 היא 30", [], 2],
  ['הישר ℓ מוכל במישור π3', ['הישר ℓ: x=(0,0,0)+t(1,1,1)'], 1],
];

describe('#2484 e9 — every relation that places a DECLARED free plane is accepted, and places it', () => {
  it.each(RELATIONS)('«מישור π3» · «%s» (after %j) builds; π3 keeps %i DOF', (line, pre, dof) => {
    run(CUBE, ...pre, 'מישור π3', line);
    expect(st().lastError).toBeNull();
    expect(Object.values(d().status).every((s) => s === 'ok')).toBe(true);
    expect(planeDof()).toBe(dof);
  });
});

describe('#2484 e10 — a relation naming a MISSING π-plane creates it free, and the relation places it', () => {
  const CREATING: [string, string[], number][] = [
    ...RELATIONS,
    ['המישור π3 מקביל למישור ABC', [], 1],
    ['π3 ∥ ABC', [], 1],
    ['המישור π3 מאונך למישור ABC', [], 2],
    ['π3 ⟂ ABC', [], 2],
    ["הישר AC' חותך את המישור π3 בנקודה M", [], 3],
    ['המרחק בין A למישור π3 הוא 2', [], 2],
    ['ℓ ⟂ π3', ['הישר ℓ: x=(0,0,0)+t(1,1,1)'], 1],
    ['הישר ℓ מקביל למישור π3', ['הישר ℓ: x=(0,0,0)+t(1,1,1)'], 2],
    ['A על המישור π3', [], 2],
  ];
  it.each(CREATING)('«%s» (after %j) on a figure with no π3 builds; π3 has %i DOF, as declared', (line, pre, dof) => {
    run(CUBE, ...pre, line);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(2 + pre.length);
    expect(d().construction.planes.get('π3')?.free).toBe(true);
    expect(planeDof()).toBe(dof);
    run(CUBE, ...pre, 'מישור π3', line);
    expect(planeDof(), 'the same DOF as with «מישור π3» declared first').toBe(dof);
  });

  it('two missing planes in one sentence are both created («π3 ∥ π4»)', () => {
    run(CUBE, 'π3 ∥ π4');
    expect(st().lastError).toBeNull();
    expect([...d().construction.planes.keys()].sort()).toEqual(['π3', 'π4']);
  });

  it('no notice for a created plane (ruling 2026-10-24, e11 = A: the new row is the signal)', () => {
    run(CUBE, "הישר AC' מאונך למישור π3");
    expect(st().lastCreated).toBeNull();
  });

  it('mint-last: a plane declared BELOW binds, and the pass creates nothing', () => {
    run(CUBE, "הישר AC' מאונך למישור π3", 'מישור π3');
    expect(Object.values(d().status)).toEqual(['ok', 'ok', 'ok']);
    expect(planeDof()).toBe(1);
  });

  it('a membership still creates its plane (ADR-3D-124 ruling 1, now through the same pass) — a new rider too', () => {
    run(CUBE, 'M על המישור π3');
    expect(st().lastError).toBeNull();
    expect(d().construction.points.get('M')).toEqual({ kind: 'on-plane', plane: 'π3' });
  });

  it('atomic: a line refused after creating keeps nothing it created, and names its own reason', () => {
    run(CUBE, 'הזווית בין המישור π3 למישור ABC היא 30');
    expect(st().lastError).toMatchObject({ code: 'plane-not-determined', id: 'π3' });
    expect(st().facts).toHaveLength(1);
    expect(d().construction.planes.has('π3')).toBe(false);
  });
});

describe('#2484 — the relation holds at every seed, and what it leaves free moves (ADR-052)', () => {
  it.each([[[CUBE, "הישר AC' מאונך למישור π3"]], [[CUBE, 'מישור π3', "הישר AC' מאונך למישור π3"]]])(
    'the operator’s sequence %j: π3 ⟂ AC′ at 24 seeds, and π3 slides along AC′',
    (lines) => {
      run(...lines);
      const offsets = new Set<string>();
      for (let s = 0; s < 24; s++) {
        const dv = d(s);
        expect(Object.values(dv.status).every((x) => x === 'ok')).toBe(true);
        const pl = dv.resolved.planes.get('π3')!;
        const A = dv.positions.get('A')!;
        const C = dv.positions.get("C'")!;
        expect(1 - cosAbs(pl.n, sub(C, A))).toBeLessThan(1e-9);
        // where π3 crosses AC′, as a fraction of AC′ — the one sampled DOF
        const t = -(dot(pl.n, A) + pl.d) / dot(pl.n, sub(C, A));
        offsets.add(t.toFixed(3));
      }
      expect(offsets.size).toBeGreaterThan(1);
    },
  );

  it('«AB מוכל במישור π3»: A and B lie on π3 at 24 seeds, and π3 turns about AB', () => {
    run(CUBE, 'הישר AB מוכל במישור π3');
    const turns = new Set<string>();
    for (let s = 0; s < 24; s++) {
      const dv = d(s);
      const pl = dv.resolved.planes.get('π3')!;
      for (const id of ['A', 'B']) expect(Math.abs(dot(pl.n, dv.positions.get(id)!) + pl.d) / len(pl.n)).toBeLessThan(1e-9);
      const AD = sub(dv.positions.get('D')!, dv.positions.get('A')!);
      turns.add(cosAbs(pl.n, AD).toFixed(3));
    }
    expect(turns.size).toBeGreaterThan(1);
  });

  it('the stated angle holds at 24 seeds', () => {
    run(CUBE, "הזווית בין הישר AC' למישור π3 היא 30");
    for (let s = 0; s < 24; s++) {
      const dv = d(s);
      const pl = dv.resolved.planes.get('π3')!;
      const u = sub(dv.positions.get("C'")!, dv.positions.get('A')!);
      expect(Math.abs(cosAbs(pl.n, u) - Math.sin(Math.PI / 6))).toBeLessThan(1e-9);
    }
  });
});

describe('#2484 — a later pin adds to what the relation placed', () => {
  // The cube's own placement re-seats when a membership on a free plane is added — measured identically for «מישור π3» ·
  // «A על המישור π3» before this change (the membership enters the placement funnel), so it is not asserted here; what
  // this item owns is that the ⟂ placement survives and the new pin takes the remaining freedom.
  it('after «AC′ ⟂ π3», «A על המישור π3» pins the offset (1 → 0) and π3 stays ⟂ AC′ through A', () => {
    run(CUBE, "הישר AC' מאונך למישור π3");
    st().submit('A על המישור π3');
    expect(st().lastError).toBeNull();
    for (const s of [0, 3, 7]) {
      expect(planeDof(s)).toBe(0);
      const dv = d(s);
      const pl = dv.resolved.planes.get('π3')!;
      const A = dv.positions.get('A')!;
      expect(1 - cosAbs(pl.n, sub(dv.positions.get("C'")!, A))).toBeLessThan(1e-9);
      expect(Math.abs(dot(pl.n, A) + pl.d)).toBeLessThan(1e-9);
    }
  });

  it('the mirror spelling «C′A ⟂ π3» reads the same', () => {
    run(CUBE, "C'A ⟂ π3");
    expect(st().lastError).toBeNull();
    expect(planeDof()).toBe(1);
  });
});
