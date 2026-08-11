/**
 * ADR-3D-138 (#508) — a stated DISTANCE pins a free plane's offset, and no free plane can produce a
 * false accusation.
 *
 * Reported from the #500 fix session as the adjacent check that issue's plan called for:
 *
 *   פירמידה משולשת ABCD
 *   מישור π2                       → free plane declared (#487)
 *   המרחק בין A למישור π2 הוא 5    → ✗ claim-refuted, the fact NOT committed
 *
 * `claim-refuted` told the student their stated distance was WRONG. Nothing was wrong with it: the
 * plane simply had a sampled offset that nothing had tried to move, and the missing pin was the reason
 * for the accusation. `resolveFreePlane` honoured exactly two pin sources — memberships and ∥/⟂
 * relations — the list of kinds that existed when #487 landed (docs/17: an enumeration is not a rule).
 *
 * Two halves, and the second is what closes the CLASS:
 *  1. a distance from a known point pins the OFFSET exactly (`d = −n·p ± value`, the sign a branch);
 *  2. a claim about a plane whose relevant DOF is still SAMPLED can never be refuted — it degrades to
 *     the honest `plane-not-determined`. So a constraint kind the resolver does not yet pin costs a
 *     refusal, never a false accusation.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { dot3, norm3 } from '../engine/vec3';

const state = () => useGeo3.getState();
const submit = (u: string) => state().submit(u);
const build = (utts: string[]) => {
  state().clear();
  for (const u of utts) submit(u);
};
const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];

/** The SIGNED distance from a point to the resolved plane, in the plane's own normal direction. */
const signedDist = (seed: number, id: string, plane = 'π2'): number => {
  const d = derive3(state().facts, seed);
  const pl = d.resolved.planes.get(plane)!;
  const p = d.resolved.positions.get(id)!;
  return (dot3(pl.n, p) + pl.d) / norm3(pl.n);
};

const FIGURE = ['פירמידה משולשת ABCD', 'מישור π2'];

beforeEach(() => state().clear());

describe('#508 — the reported sequence builds, instead of being told it is wrong', () => {
  it('the distance COMMITS (no claim-refuted) and holds exactly, at every seed', () => {
    build([...FIGURE, 'המרחק בין A למישור π2 הוא 5']);
    expect(state().lastError).toBeNull();
    expect(state().facts).toHaveLength(3);
    for (const seed of SEEDS) expect(Math.abs(signedDist(seed, 'A')), `seed ${seed}`).toBeCloseTo(5, 6);
  });

  it('the OFFSET is now pinned and the ORIENTATION is still free — the DOF cue says so', () => {
    build([...FIGURE, 'המרחק בין A למישור π2 הוא 5']);
    // 3 free DOFs (normal 2 + offset 1) minus the pinned offset
    for (const seed of SEEDS) expect(derive3(state().facts, seed).resolved.freePlaneDofs.get('π2')).toBe(2);
  });

  it('WHICH SIDE is a sampled branch, not a silent default — "show another configuration" flips it', () => {
    build([...FIGURE, 'המרחק בין A למישור π2 הוא 5']);
    const sides = new Set(SEEDS.map((s) => Math.sign(signedDist(s, 'A'))));
    expect(sides, 'both sides of A must be reachable').toEqual(new Set([-1, 1]));
  });

  it('the plane still RESAMPLES its orientation (the distance pins the offset, not the normal)', () => {
    build([...FIGURE, 'המרחק בין A למישור π2 הוא 5']);
    const normals = SEEDS.map((s) => {
      const n = derive3(state().facts, s).resolved.planes.get('π2')!.n;
      return `${n.x.toFixed(3)},${n.y.toFixed(3)},${n.z.toFixed(3)}`;
    });
    expect(new Set(normals).size, 'the unstated orientation is a free DOF (ADR-052)').toBeGreaterThan(4);
  });

  it('a figure with no solid pins identically — the mechanism is the plane’s, not the solid’s', () => {
    build(['A(0,0,0)', 'מישור π2', 'המרחק בין A למישור π2 הוא 5']);
    expect(state().lastError).toBeNull();
    for (const seed of SEEDS) expect(Math.abs(signedDist(seed, 'A')), `seed ${seed}`).toBeCloseTo(5, 6);
  });
});

describe('#508 — the class: a free plane never produces a FALSE ACCUSATION', () => {
  it('a claim about a still-sampled plane reads plane-not-determined, never claim-refuted', () => {
    // the second distance is real information this resolver does not yet pin (it would constrain the
    // NORMAL). It must not be reported as the student's error — it is the tool's gap.
    build([...FIGURE, 'המרחק בין A למישור π2 הוא 5', 'המרחק בין B למישור π2 הוא 5']);
    expect(state().lastError).toEqual({ code: 'plane-not-determined', id: 'π2' });
  });

  it('a DETERMINED plane keeps the ordinary verify register — the guard did not swallow real refutations', () => {
    // three memberships determine π2 outright (dof 0); a distance that then genuinely fails is refuted
    build(['A(0,0,0)', 'B(1,0,0)', 'C(0,1,0)', 'מישור π2', 'A על המישור π2', 'B על המישור π2', 'C על המישור π2']);
    expect(state().lastError).toBeNull();
    expect(derive3(state().facts, 0).resolved.freePlaneDofs.get('π2')).toBe(0);
    const n = state().facts.length;
    submit('המרחק בין A למישור π2 הוא 5'); // A is ON the plane — the distance is 0, so this is false
    expect(state().facts).toHaveLength(n); // keep-prior
    expect(state().lastError?.code).toBe('claim-refuted');
  });
});

describe('#508 — nothing that already worked moved', () => {
  it('an UNPINNED free plane still samples all three DOFs and resamples', () => {
    build(FIGURE);
    for (const seed of SEEDS) expect(derive3(state().facts, seed).resolved.freePlaneDofs.get('π2')).toBe(3);
    const ds = new Set(SEEDS.map((s) => derive3(state().facts, s).resolved.planes.get('π2')!.d.toFixed(4)));
    expect(ds.size).toBeGreaterThan(4);
  });

  it('a MEMBERSHIP still pins the offset exactly (the established lane, unchanged)', () => {
    build([...FIGURE, 'A על המישור π2']);
    expect(state().lastError).toBeNull();
    for (const seed of SEEDS) expect(signedDist(seed, 'A'), `seed ${seed}`).toBeCloseTo(0, 6);
  });
});
