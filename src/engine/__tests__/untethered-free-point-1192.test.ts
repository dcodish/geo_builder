/**
 * #1192 (ADR-526) — an untethered free point's DISTANCE from the figure is sampled, in the figure's
 * own units.
 *
 * Operator report, playing PR #1010's T34: *"the point D is stuck inside the circle and no other
 * option shows it outside."* Measured, it was worse than a preference — the reach was **4.326 for a
 * stated radius of 1, of 5 and of 50**. Whether the student was told "D is inside the circle" or
 * "D is outside" was decided by a constant unrelated to anything they wrote, and «הציגו תצורה אחרת»
 * could never reach the other answer. Both readings are admissible; the tool committed to one and
 * hid the other, which is [ADR-052](../../../docs/06-decisions.md#adr-052)'s cardinal sin.
 *
 * Root cause: `applySeed` SPINS the free cluster about its centroid and jitters it, so only a free
 * point's DIRECTION was ever sampled; its radial distance kept whatever its default put it at, and
 * the jitter width came from the free points' own spread — itself a default.
 *
 * THE ASSERTIONS ARE REACHABILITY AND RATIOS, NEVER COORDINATES. A test pinned to coordinates would
 * lock in a placement the student never stated, which is the defect this fixes.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { replay } from '@/store/geoStore';

const SEEDS = 24;

/** |DO| at each of the first `SEEDS` configurations. */
const distances = (steps: string[]): number[] => {
  const facts = factsOf(steps);
  const out: number[] = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    const fig = replay(facts, seed);
    const D = fig.positions.get('D');
    const O = fig.positions.get('O');
    if (D && O) out.push(Math.hypot(D.x - O.x, D.y - O.y));
  }
  return out;
};

const circleOfRadius = (r: number): string[] => [`מעגל שמרכזו O שרדיוסו ${r}`, 'נקודה D'];

describe('ADR-526 — an unstated distance is sampled, not decided by a constant (#1192)', () => {
  /**
   * The lock that matters: BOTH answers are reachable, at every stated radius. Before the fix this
   * read 0 outside at r = 5 and r = 50, and 0 inside at r = 1 — the student could never see the
   * other one.
   */
  it.each([1, 5, 50])('with a stated radius of %i, D is offered both inside and outside', (r) => {
    const ds = distances(circleOfRadius(r));
    expect(ds.length, 'the figure builds at every sampled configuration').toBeGreaterThan(0);
    expect(ds.some((d) => d < r), `some configuration puts D inside r=${r}`).toBe(true);
    expect(ds.some((d) => d > r), `some configuration puts D outside r=${r}`).toBe(true);
  });

  /**
   * The placement SCALES with the stated figure — asserted as a ratio between two figures, never as
   * coordinates. The defect's signature was that this ratio was exactly 1.
   */
  it('the reach grows with the stated figure, roughly in proportion', () => {
    const reach = (r: number): number => Math.max(...distances(circleOfRadius(r)));
    const small = reach(5);
    const large = reach(50);
    expect(large / small, 'a ten-times-larger figure is explored roughly ten times as widely').toBeGreaterThan(5);
    // and the pre-fix signature — an identical reach whatever the student stated — is gone
    expect(Math.abs(large - small)).toBeGreaterThan(1);
  });

  /**
   * A STATED region is a given and must NOT become samplable. This is the guard that keeps the fix
   * from turning an honest constraint into a coin flip — and it holds structurally, because a point
   * a constraint names is no longer untethered.
   */
  it('a stated «D בתוך המעגל» keeps D inside at every configuration', () => {
    const ds = distances([...circleOfRadius(5), 'D בתוך המעגל']);
    expect(ds.length).toBeGreaterThan(0);
    expect(ds.every((d) => d < 5)).toBe(true);
  });

  it('a stated «D מחוץ למעגל» keeps D outside at every configuration', () => {
    const ds = distances([...circleOfRadius(5), 'D מחוץ למעגל']);
    expect(ds.length).toBeGreaterThan(0);
    expect(ds.every((d) => d > 5)).toBe(true);
  });

  /**
   * The rescaling is confined to points nothing else refers to. A polygon's vertices are tethered by
   * the polygon, so the triangle keeps being sampled the way it always was — this fix must not turn
   * every figure's size into a per-seed lottery.
   */
  it('a polygon vertex is not treated as untethered', () => {
    const facts = factsOf(['משולש ABC']);
    const side = (seed: number): number => {
      const fig = replay(facts, seed);
      const A = fig.positions.get('A')!;
      const B = fig.positions.get('B')!;
      return Math.hypot(A.x - B.x, A.y - B.y);
    };
    const lens = Array.from({ length: SEEDS }, (_, s) => side(s));
    // the triangle still varies (it has free DOFs) but stays within the spin/jitter band it always
    // had — an untethered rescale would range it over more than an order of magnitude
    expect(Math.max(...lens) / Math.min(...lens)).toBeLessThan(4);
  });

  /** Seed 0 is the drawing the student first sees, and it is deliberately untouched. */
  it('the default configuration is unchanged', () => {
    const fig = replay(factsOf(circleOfRadius(5)), 0);
    const D = fig.positions.get('D')!;
    expect([D.x, D.y]).toEqual([3, 2]);
  });
});
