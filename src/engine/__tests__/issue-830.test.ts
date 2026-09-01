/**
 * #830 — a SATISFIABLE circle crossing was refused: «AC חותכת את המעגל בנקודה D» reported
 * «over-constrained: A–D–C in order on a line cannot hold» on a figure where that order is FORCED
 * (A outside the circle, C inside ⇒ segment AC crosses exactly once, strictly between them).
 *
 * Root cause (NOT the recruiter — the free DOFs were reachable all along): the crossing is SELECTED
 * before it is constrained, and the selection was wrong. The parser sets `avoid: A` from the line's
 * named endpoint, and `otherCrossing` applied its "keep the root FARTHEST from avoid" rule without
 * checking the precondition its own contract states — *that `avoid` is one of the crossings*. With A
 * outside the circle it is not a crossing at all, so the rule degenerated into "the root farthest from
 * an arbitrary point" and placed D BEYOND C (t = 1.905 along A→C), violating the very order the same
 * command asserts. The order then argued with the selection through the joint solve, traded away the
 * tangency, and the ladder finally reported the order as impossible.
 *
 * Two locks, matching the two halves of the fix:
 *   1. `otherCrossing` ignores an `avoid` that is not among the crossings (the unit precondition).
 *   2. A stated `order [X, id, Y]` drives the SELECTION via the existing `onSegment` mechanism, so the
 *      root is picked on the stated side instead of being picked blind (the end-to-end lock).
 */
import { describe, it, expect } from 'vitest';
import { otherCrossing } from '../evaluate';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { replay } from '../../store/geoStore';
import type { Vec } from '../types';

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

describe('#830 — otherCrossing enforces its own precondition', () => {
  const near: Vec = { x: 1, y: 0 };
  const far: Vec = { x: 9, y: 0 };
  const sols = [near, far];

  it('an `avoid` that IS one of the crossings still keeps the OTHER one (the genuine case)', () => {
    // the secant runs through a known on-circle endpoint: that root must not be re-minted
    expect(otherCrossing(sols, [], { x: 1, y: 0 }, 0)).toEqual(far);
  });

  it('an `avoid` that is NOT a crossing is IGNORED — it must not select by distance', () => {
    // A sits outside the circle, far from both roots: the farthest-from rule is meaningless here and
    // used to hand back `far`, placing D beyond the segment it was asserted to lie inside.
    const outside: Vec = { x: -50, y: 0 };
    expect(otherCrossing(sols, [], outside, 0), 'falls through to the branch pick, not "farthest"').toEqual(near);
    expect(otherCrossing(sols, [], outside, 1), 'branch still cycles the roots').toEqual(far);
  });

  it('an absent `avoid` is unchanged (branch pick)', () => {
    expect(otherCrossing(sols, [], undefined, 0)).toEqual(near);
    expect(otherCrossing(sols, [], undefined, 1)).toEqual(far);
  });
});

describe("#830 — the operator's figure builds, with D strictly between A and C", () => {
  // The bisected minimal repro from the issue. Every proper subset built before the fix; the
  // conjunction did not.
  const SEQ = [
    'משולש ABC',
    'מעגל',
    'AB משיקה למעגל בנקודה B',
    'AB=AC',
    'C בתוך המעגל',
    'AC חותכת את המעגל בנקודה D',
  ];

  it('builds, and D is ON segment AC — not beyond C (was: «A–D–C in order cannot hold»)', () => {
    const facts = factsOf(SEQ);
    const { positions } = replay(facts);
    const A = positions.get('A')!;
    const C = positions.get('C')!;
    const D = positions.get('D')!;
    expect(D, 'D was constructed').toBeDefined();

    const dx = C.x - A.x;
    const dy = C.y - A.y;
    const L2 = dx * dx + dy * dy;
    const t = ((D.x - A.x) * dx + (D.y - A.y) * dy) / L2;
    const offLine = Math.abs((D.x - A.x) * dy - (D.y - A.y) * dx) / Math.sqrt(L2);

    expect(offLine / Math.sqrt(L2), 'D is on line AC').toBeLessThan(1e-6);
    expect(t, 'A–D–C: D is past A').toBeGreaterThan(0);
    expect(t, 'A–D–C: D is before C — the root beyond C (t≈1.9) was the bug').toBeLessThan(1);
  });

  it('the geometry that FORCES the order really holds: A outside, C inside, tangency exact', () => {
    const facts = factsOf(SEQ);
    const { positions, circles } = replay(facts);
    const O = positions.get('@ctr-O')!;
    const r = circles.get('circle-O')!.r;
    expect(dist(positions.get('A')!, O) / r, 'A is OUTSIDE the circle').toBeGreaterThan(1);
    expect(dist(positions.get('C')!, O) / r, 'C is INSIDE the circle').toBeLessThan(1);
    expect(dist(positions.get('B')!, O) / r, 'B is ON the circle (the tangency point)').toBeCloseTo(1, 3);
  });

  it('holds across seeds — not a lucky default (was: 0 of 40 seeds built it)', () => {
    const facts = factsOf(SEQ);
    let built = 0;
    let ordered = 0;
    for (let seed = 0; seed < 40; seed++) {
      const { positions } = replay(facts, seed);
      const A = positions.get('A');
      const C = positions.get('C');
      const D = positions.get('D');
      if (!A || !C || !D) continue; // seed 17 fails on the PREFIX alone — a separate, pre-existing defect
      built++;
      const dx = C.x - A.x;
      const dy = C.y - A.y;
      const t = ((D.x - A.x) * dx + (D.y - A.y) * dy) / (dx * dx + dy * dy);
      if (t > 0 && t < 1) ordered++;
    }
    expect(built, 'the figure builds at essentially every seed').toBeGreaterThanOrEqual(39);
    expect(ordered, 'and D is between A and C at EVERY seed that builds').toBe(built);
  });
});
