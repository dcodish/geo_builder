/**
 * #528 (ADR-3D-206) — A SECOND DISTANCE TO A FREE PLANE PINS ITS NORMAL.
 *
 * #508 pinned the free plane's OFFSET from the first stated distance and left the rest to be "verified
 * downstream" — which, against a normal nothing had tried to move, means refused `plane-not-determined`.
 * So «המרחק בין A למישור π2 הוא 5» built and the very next «המרחק בין B למישור π2 הוא 5» was turned
 * away, though it is real information: two equal distances say the plane is parallel to AB or separates
 * A and B symmetrically.
 *
 * These lock the fit and its accounting: what the distances determine is honoured exactly, what they
 * leave open stays SAMPLED and reachable by «show another configuration» (ADR-052), and the DOF the cue
 * prints is the DOF the sampler varies (ADR-3D-124).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

const st = () => useGeo3.getState();
const run = (...lines: string[]) => {
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, l).toBeNull();
  }
};
const plane = (seed = st().seed) => {
  const d = derive3(st().facts, seed);
  const pl = d.resolved.planes.get('π2') as { n: { x: number; y: number; z: number }; d: number } | undefined;
  return {
    dof: d.resolved.freePlaneDofs.get('π2'),
    n: pl?.n,
    distTo: (id: string) => {
      const p = d.positions.get(id);
      if (!p || !pl) return NaN;
      return Math.abs(pl.n.x * p.x + pl.n.y * p.y + pl.n.z * p.z + pl.d) / Math.hypot(pl.n.x, pl.n.y, pl.n.z);
    },
  };
};

describe('#528 — a second distance is USED, not refused', () => {
  beforeEach(() => st().clear());

  it("the issue's exact sequence builds, and BOTH distances hold exactly", () => {
    run('פירמידה משולשת ABCD', 'מישור π2', 'המרחק בין A למישור π2 הוא 5', 'המרחק בין B למישור π2 הוא 5');
    const p = plane();
    expect(p.distTo('A')).toBeCloseTo(5, 6);
    expect(p.distTo('B')).toBeCloseTo(5, 6);
  });

  it('the English mirror builds the same way', () => {
    run('triangular pyramid ABCD', 'plane π2', 'the distance between A and plane π2 is 5', 'the distance between B and plane π2 is 5');
    const p = plane();
    expect(p.distTo('A')).toBeCloseTo(5, 6);
    expect(p.distTo('B')).toBeCloseTo(5, 6);
  });

  /** The accounting: 3 DOF free → offset pinned (2) → normal on a cone, spin free (1) → determined (0). */
  it('the free-plane DOF count follows what each given actually pins', () => {
    run('פירמידה משולשת ABCD', 'A(0,0,0)', 'B(10,0,0)', 'C(0,10,0)', 'מישור π2');
    expect(plane().dof, 'nothing stated yet — normal 2 + offset 1').toBe(3);
    run('המרחק בין A למישור π2 הוא 5');
    expect(plane().dof, '#508: the offset is pinned, the normal is not').toBe(2);
    run('המרחק בין B למישור π2 הוא 5');
    expect(plane().dof, '#528: the normal is on a cone — only the spin is left').toBe(1);
    run('המרחק בין C למישור π2 הוא 5');
    expect(plane().dof, 'a third distance determines it up to branches').toBe(0);
  });

  it('a determined figure honours all THREE distances exactly', () => {
    run(
      'פירמידה משולשת ABCD', 'A(0,0,0)', 'B(10,0,0)', 'C(0,10,0)', 'מישור π2',
      'המרחק בין A למישור π2 הוא 5', 'המרחק בין B למישור π2 הוא 5', 'המרחק בין C למישור π2 הוא 5',
    );
    const p = plane();
    for (const id of ['A', 'B', 'C']) expect(p.distTo(id), id).toBeCloseTo(5, 6);
  });

  /** ADR-052: the spin the givens do not state must MOVE with the seed, not park on a default. */
  it('the leftover spin is sampled — «show another configuration» walks the family', () => {
    run('פירמידה משולשת ABCD', 'מישור π2', 'המרחק בין A למישור π2 הוא 5', 'המרחק בין B למישור π2 הוא 5');
    const seen = new Set<string>();
    for (let seed = 0; seed < 6; seed++) {
      const p = plane(seed);
      expect(p.distTo('A'), `seed ${seed} keeps the given`).toBeCloseTo(5, 6);
      expect(p.distTo('B'), `seed ${seed} keeps the given`).toBeCloseTo(5, 6);
      seen.add(`${p.n?.x.toFixed(3)},${p.n?.y.toFixed(3)},${p.n?.z.toFixed(3)}`);
    }
    expect(seen.size, 'the normal must vary across seeds').toBeGreaterThan(1);
  });

  it('#508 unchanged: one distance still pins only the offset', () => {
    run('פירמידה משולשת ABCD', 'מישור π2', 'המרחק בין A למישור π2 הוא 5');
    const p = plane();
    expect(p.distTo('A')).toBeCloseTo(5, 6);
    expect(p.dof, 'the normal keeps its two free DOFs').toBe(2);
  });

  /**
   * The honesty half. A pair no plane can satisfy (A and B one apart, at distances 1 and 9) must NOT
   * produce a plane that quietly misses one of them. It is refused — and refused with #508's class
   * guard, which says "pin this plane first" rather than accusing the student's givens.
   */
  it('an unsatisfiable pair refuses instead of drawing a plane that misses a given', () => {
    run('פירמידה משולשת ABCD', 'A(0,0,0)', 'B(1,0,0)', 'מישור π2', 'המרחק בין A למישור π2 הוא 1');
    st().submit('המרחק בין B למישור π2 הוא 9');
    expect(st().lastError).not.toBeNull();
    expect(plane().distTo('A'), 'the figure that stands still honours the given it accepted').toBeCloseTo(1, 6);
  });
});
