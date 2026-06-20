/**
 * `otherCrossing` (Wave 3 / R8) — the shared "keep the crossing that ISN'T the known point" primitive,
 * extracted from the line∩circle `avoid` one-off so circle∩circle can share it. Property-style: across
 * many configurations it must (a) never return the avoided point, (b) return the fresh root farthest
 * from it, (c) return null when no fresh root exists (tangent / coincident). Geometric, not positional.
 */
import { describe, it, expect } from 'vitest';
import { otherCrossing, bySide } from '@/engine';
import type { Vec } from '@/engine';

const d = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

describe('otherCrossing', () => {
  it('returns the fresh crossing farthest from the avoided point', () => {
    const A: Vec = { x: 0, y: 0 };
    const B: Vec = { x: 10, y: 0 };
    // sols = {A, B}; A is placed and avoided → keep B regardless of order.
    expect(otherCrossing([A, B], [A], A, 0)).toEqual(B);
    expect(otherCrossing([B, A], [A], A, 0)).toEqual(B); // order-independent (the whole point of R8)
  });

  it('never returns a point coinciding with an already-placed one', () => {
    const A: Vec = { x: 1, y: 2 };
    const B: Vec = { x: -3, y: 4 };
    const got = otherCrossing([A, B], [A], A, 1);
    expect(got).not.toBeNull();
    expect(d(got!, A)).toBeGreaterThan(1e-6); // it's B, not A
  });

  it('null when no fresh root remains (tangent: only the avoided point) ', () => {
    const A: Vec = { x: 5, y: 5 };
    expect(otherCrossing([A], [A], A, 0)).toBeNull(); // tangent — sole crossing is the avoided point
    expect(otherCrossing([A, { x: 5 + 1e-12, y: 5 }], [A], A, 0)).toBeNull(); // both within LEN_EPS of A
  });

  it('property: over many random pairs, picks the farther-from-avoid fresh root', () => {
    // Deterministic pseudo-random (no Math.random in the engine, but a test may use it via a fixed seed).
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 20 - 10;
    for (let i = 0; i < 200; i++) {
      const avoid: Vec = { x: rnd(), y: rnd() };
      const other: Vec = { x: rnd(), y: rnd() };
      if (d(avoid, other) < 0.5) continue; // skip near-coincident (would be filtered as not-fresh)
      const got = otherCrossing([avoid, other], [avoid], avoid, 0);
      expect(got).toEqual(other); // the only fresh root, and it's the farther one
    }
  });

  it('falls back to the branch index when the avoided position is unknown (pre-R8 line∩circle path)', () => {
    const P: Vec = { x: 1, y: 1 };
    const Q: Vec = { x: 2, y: 2 };
    expect(otherCrossing([P, Q], [], undefined, 0)).toEqual(P);
    expect(otherCrossing([P, Q], [], undefined, 1)).toEqual(Q);
  });
});

describe('bySide — stable geometric branch ordering (R8 step 2)', () => {
  const anchor: Vec = { x: 0, y: 0 };
  const dir: Vec = { x: 1, y: 0 }; // +x
  const A: Vec = { x: -3, y: 0 }; // −side
  const B: Vec = { x: 5, y: 0 }; //  +side

  it('orders crossings by signed position along dir (− side first)', () => {
    expect(bySide([A, B], anchor, dir)).toEqual([A, B]);
  });
  it('is INDEPENDENT of the input array order (the whole point — geometric, not positional)', () => {
    expect(bySide([B, A], anchor, dir)).toEqual([A, B]); // same result whichever order the solver returned
    expect(bySide([A, B], anchor, dir)[0]).toEqual(bySide([B, A], anchor, dir)[0]);
  });
  it('selecting branch 0 picks the same physical point regardless of solver root order', () => {
    const pick = (sols: Vec[]) => bySide(sols, anchor, dir)[0 % sols.length];
    expect(pick([A, B])).toEqual(pick([B, A]));
  });
});
