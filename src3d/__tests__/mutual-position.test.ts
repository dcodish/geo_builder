/**
 * S4 (#378) — the shared mutual-position classifier.
 *
 * Pure geometry, no figure: this is the one predicate the claim checker, the drive residual, the
 * data panel and the requirement gate all read, so it is tested on its own terms first. The cases
 * that matter are the BOUNDARY ones — coplanar-but-missing (the bounded reading) and the
 * bounded/unbounded split, which is where "do these actually meet?" is decided.
 */

import { describe, expect, it } from 'vitest';
import { mutualDeviation, mutualHolds, mutualPosition, type MutualSide } from '../engine/operands';
import { sub3, v3 } from '../engine/vec3';

/** A side from two endpoints. */
const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, bounded = true): MutualSide => ({
  geom: { point: v3(ax, ay, az), dir: sub3(v3(bx, by, bz), v3(ax, ay, az)) },
  bounded,
});

describe('mutualPosition — the total classification', () => {
  it('the diagonals of a unit square INTERSECT', () => {
    expect(mutualPosition(seg(0, 0, 0, 1, 1, 0), seg(1, 0, 0, 0, 1, 0))).toBe('intersecting');
  });

  it('opposite sides of a square are PARALLEL', () => {
    expect(mutualPosition(seg(0, 0, 0, 1, 0, 0), seg(0, 1, 0, 1, 1, 0))).toBe('parallel');
  });

  it('the same line twice is COINCIDENT, not parallel', () => {
    expect(mutualPosition(seg(0, 0, 0, 2, 0, 0), seg(3, 0, 0, 5, 0, 0))).toBe('coincident');
  });

  it('a cube edge and a non-meeting face diagonal are SKEW', () => {
    // AB along +x at z=0; a segment on the top face going +y — no common point, not parallel
    expect(mutualPosition(seg(0, 0, 0, 1, 0, 0), seg(0, 0, 1, 0, 1, 1))).toBe('skew');
  });

  it('null when a direction is degenerate', () => {
    expect(mutualPosition(seg(0, 0, 0, 0, 0, 0), seg(1, 0, 0, 2, 0, 0))).toBeNull();
  });
});

describe('the BOUNDED reading — «נחתכים» is about the segments, not their continuations', () => {
  // Coplanar (both in z=0) and non-parallel, but the crossing sits at x=5 — far off both segments.
  const s1 = seg(0, 0, 0, 1, 0, 0);
  const s2 = seg(5, 1, 0, 5.1, 1.1, 0);

  it('their LINES intersect — that is a fact about the lines, extents aside', () => {
    expect(mutualPosition(s1, s2)).toBe('intersecting');
  });

  it('but the STATEMENT «they intersect» is FALSE for the segments — the crossing is off both', () => {
    expect(mutualHolds('intersecting', s1, s2)).toBe(false);
  });

  it('and they are NOT skew either — skew means non-coplanar, and these are coplanar', () => {
    // the trap this guards: reporting "skew" for two coplanar segments that merely miss would
    // assert a false property of the drawing (and made an impossible given build silently)
    expect(mutualHolds('skew', s1, s2)).toBe(false);
  });

  it('with UNBOUNDED sides (named lines) the statement is TRUE', () => {
    expect(mutualHolds('intersecting', { ...s1, bounded: false }, { ...s2, bounded: false })).toBe(true);
  });

  it('one bounded side is enough to make the statement false', () => {
    expect(mutualHolds('intersecting', s1, { ...s2, bounded: false })).toBe(false);
  });

  it('a genuine crossing within both segments holds', () => {
    expect(mutualHolds('intersecting', seg(0, 0, 0, 1, 1, 0), seg(1, 0, 0, 0, 1, 0))).toBe(true);
  });

  it('non-coplanar segments ARE skew, whatever their extents', () => {
    expect(mutualHolds('skew', seg(0, 0, 0, 1, 0, 0), seg(0, 0, 1, 0, 1, 1))).toBe(true);
  });
});

describe('mutualDeviation — the drive residual agrees with the verdict', () => {
  it('is ~0 exactly when the closed relation holds', () => {
    const crossing = [seg(0, 0, 0, 1, 1, 0), seg(1, 0, 0, 0, 1, 0)] as const;
    expect(mutualDeviation('intersecting', ...crossing)!).toBeLessThan(1e-12);

    const par = [seg(0, 0, 0, 1, 0, 0), seg(0, 1, 0, 1, 1, 0)] as const;
    expect(mutualDeviation('parallel', ...par)!).toBeLessThan(1e-12);

    const same = [seg(0, 0, 0, 2, 0, 0), seg(3, 0, 0, 5, 0, 0)] as const;
    expect(mutualDeviation('coincident', ...same)!).toBeLessThan(1e-12);
  });

  it('is positive when it does not', () => {
    const skew = [seg(0, 0, 0, 1, 0, 0), seg(0, 0, 1, 0, 1, 1)] as const;
    expect(mutualDeviation('intersecting', ...skew)!).toBeGreaterThan(1e-3);
    expect(mutualDeviation('parallel', ...skew)!).toBeGreaterThan(1e-3);
  });

  it('is SCALE-FREE — the same figure ten times larger has the same residual', () => {
    const small = [seg(0, 0, 0, 1, 0, 0), seg(0, 0, 1, 0, 1, 1)] as const;
    const big = [seg(0, 0, 0, 10, 0, 0), seg(0, 0, 10, 0, 10, 10)] as const;
    expect(mutualDeviation('intersecting', ...big)!).toBeCloseTo(mutualDeviation('intersecting', ...small)!, 12);
  });
});
