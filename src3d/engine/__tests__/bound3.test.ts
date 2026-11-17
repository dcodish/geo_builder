/** #1524 (ADR-3D-477) — a letter's stated range: the one interval every sign reader reads. */
import { describe, expect, it } from 'vitest';
import { boundAnchor3, boundEmpty3, boundHolds3, boundReflect3, boundWindow3, foldBounds3, signBound3, type Bound3 } from '../bound3';

const ge = (lo: number): Bound3 => ({ lo, hi: null, loStrict: false, hiStrict: false });
const le = (hi: number): Bound3 => ({ lo: null, hi, loStrict: false, hiStrict: false });
const between = (lo: number, hi: number): Bound3 => ({ lo, hi, loStrict: false, hiStrict: false });

describe('#1524 — boundHolds3', () => {
  it('a sign is the open half-line, with the tolerance the sign readers used', () => {
    expect(boundHolds3(signBound3(true), 1e-8)).toBe(true);
    expect(boundHolds3(signBound3(true), 0)).toBe(false);
    expect(boundHolds3(signBound3(false), -1e-8)).toBe(true);
    expect(boundHolds3(signBound3(false), 0)).toBe(false);
  });
  it('a closed end admits its value; a strict one does not', () => {
    expect(boundHolds3(ge(0), 0)).toBe(true);
    expect(boundHolds3(le(3), 3)).toBe(true);
    expect(boundHolds3({ lo: 2, hi: null, loStrict: true, hiStrict: false }, 2)).toBe(false);
    expect(boundHolds3(between(2, 5), 5.1)).toBe(false);
    expect(boundHolds3(between(2, 5), NaN)).toBe(false);
  });
});

describe('#1524 — folding several statements about one letter', () => {
  it('intersects in order', () => {
    expect(foldBounds3([ge(2), le(5)])).toEqual(between(2, 5));
  });
  it('a statement that would empty the range is left out — the newer one is refused, never the older', () => {
    expect(foldBounds3([ge(2), le(1)])).toEqual(ge(2));
    expect(boundEmpty3(between(3, 2))).toBe(true);
    expect(boundEmpty3({ lo: 2, hi: 2, loStrict: true, hiStrict: false })).toBe(true);
    expect(boundEmpty3(between(2, 2))).toBe(false);
  });
});

describe('#1524 — the sampling window', () => {
  it('a sign reproduces the half-windows every reader drew (bit for bit)', () => {
    expect(boundWindow3(signBound3(true), -3, 3, 0.3)).toEqual([0.3, 3]);
    expect(boundWindow3(signBound3(false), -3, 3, 0.3)).toEqual([-3, -0.3]);
    expect(boundWindow3(signBound3(true), 0.2, 0.8, 0.2)).toEqual([0.2, 0.8]);
    const [l, h] = boundWindow3(signBound3(false), 0.2, 0.8, 0.2);
    expect(l).toBeCloseTo(-0.8, 12);
    expect(h).toBeCloseTo(-0.2, 12);
    expect(boundWindow3(undefined, -3, 3, 0.3)).toEqual([-3, 3]);
  });
  it('a range inside the window narrows it; one outside moves beside the stated end', () => {
    expect(boundWindow3(ge(2), -3, 3, 0.3)).toEqual([2.3, 3]);
    expect(boundWindow3(ge(5), -3, 3, 0.3)).toEqual([5.3, 11.3]);
    expect(boundWindow3(le(-4), -3, 3, 0.3)).toEqual([-10.3, -4.3]);
    expect(boundWindow3(between(2, 5), -3, 3, 0.3)).toEqual([2.3, 3]);
    expect(boundWindow3(between(10, 12), -3, 3, 0.3)).toEqual([10.3, 11.7]);
  });
  it('every window lies inside its range', () => {
    for (const b of [ge(2), le(3), ge(5), le(-4), between(2, 5), between(10, 12), between(0, 0.1), signBound3(true)]) {
      const [l, h] = boundWindow3(b, -3, 3, 0.3);
      expect(boundHolds3(b, l) && boundHolds3(b, h) && l <= h, JSON.stringify(b)).toBe(true);
    }
  });
});

describe('#1524 — the soft anchor and the walk target', () => {
  it('a sign parks at ±(0.4 + |raw|), as before; a range parks inside it', () => {
    expect(boundAnchor3(signBound3(true), -1, 1.6, 0.4)).toBeCloseTo(1.4, 12);
    expect(boundAnchor3(signBound3(false), 1, 1.6, 0.4)).toBeCloseTo(-1.4, 12);
    expect(boundAnchor3(undefined, 0.7, 1.6, 0.4)).toBe(0.7);
    for (const raw of [-1.6, 0, 1.6]) expect(boundHolds3(between(2, 5), boundAnchor3(between(2, 5), raw, 1.6, 0.4))).toBe(true);
  });
  it('a violating value walks to its reflection (−v for a sign), inside the range', () => {
    expect(boundReflect3(signBound3(true), -2)).toBe(2);
    expect(boundReflect3(ge(2), 1)).toBe(3);
    expect(boundHolds3(between(2, 3), boundReflect3(between(2, 3), -10))).toBe(true);
  });
});
