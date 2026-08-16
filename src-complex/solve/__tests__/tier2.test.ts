/**
 * TIER 2 — the numeric residue, and F7 measures riding on it.
 *
 * The interesting assertions here are not "the minimiser converges". They are:
 *
 *   - a measure DRIVES when the figure has a free degree of freedom, and CHECKS when it does not,
 *     from one sentence form (docs/27 §10 P1);
 *   - what tier 2 did to the free-DOF count is reported, because a cue that still shows tier 1's
 *     nullspace after a given has consumed a direction is lying;
 *   - a relation that could not be satisfied is REPORTED (stage 3e), never rounded to zero.
 */
import { describe, expect, it } from 'vitest';

import { solveResiduals } from '../tier2';
import { deriveLines } from '../../app/deriveLines';

describe('the minimiser itself', () => {
  it('solves a 1-D root and reports it solved', () => {
    const r = solveResiduals((x) => [x[0] * x[0] - 4], [1.2], { bounds: [{ lo: 0 }] });
    expect(r.solved).toBe(true);
    expect(r.x[0]).toBeCloseTo(2, 6);
  });

  /** «כל האפשרויות» over one free degree of freedom is a root-finding question. */
  it('finds the OTHER roots of a 1-D residual, nearest first', () => {
    const r = solveResiduals((x) => [x[0] * x[0] - 4], [1.2], { bounds: [{ lo: -10, hi: 10 }] });
    expect(r.x[0]).toBeCloseTo(2, 6);
    expect(r.alternatives[0][0]).toBeCloseTo(-2, 5);
  });

  it('solves a 2-D system', () => {
    const r = solveResiduals((x) => [x[0] + x[1] - 5, x[0] - x[1] - 1], [0, 0]);
    expect(r.solved).toBe(true);
    expect(r.x[0]).toBeCloseTo(3, 6);
    expect(r.x[1]).toBeCloseTo(2, 6);
  });

  /** An unsatisfiable system must say so rather than return its least-bad guess as a success. */
  it('reports an unsatisfiable system as unsolved', () => {
    const r = solveResiduals((x) => [x[0] * x[0] + 1], [1]);
    expect(r.solved).toBe(false);
  });

  it('respects bounds — a free direction inside a quadrant stays inside it', () => {
    const r = solveResiduals((x) => [x[0] - 400], [10], { bounds: [{ lo: 0, hi: 90 }] });
    expect(r.x[0]).toBeLessThanOrEqual(90);
    expect(r.solved).toBe(false); // and it does not pretend the bound was satisfiable
  });

  it('a zero-dimensional system is evaluated, not searched', () => {
    expect(solveResiduals(() => [0], []).solved).toBe(true);
    expect(solveResiduals(() => [1], []).solved).toBe(false);
  });
});

describe('F7 — a measure DRIVES when there is a degree of freedom for it', () => {
  /** A length given pins the free direction of z2 so the distance comes out as stated. */
  it('«אורך z1z2 = 5» moves the free point until the distance holds', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2', 'אורך z1z2 = 5']);
    expect(d.measures[0].status).toBe('holds');
    const z1 = d.points.find((p) => p.name === 'z1')!;
    const z2 = d.points.find((p) => p.name === 'z2')!;
    expect(Math.hypot(z1.z.re - z2.z.re, z1.z.im - z2.z.im)).toBeCloseTo(5, 6);
  });

  it('an AREA given drives a free direction — the §2b move', () => {
    const d = deriveLines(['z1 = 4', 'z2', '|z2| = 3', 'שטח Oz1z2 = 6']);
    expect(d.measures[0].status).toBe('holds');
  });

  it('a PERIMETER given is satisfied by the figure it drove', () => {
    const d = deriveLines(['z1 = 3', 'z2', '|z2| = 4', 'היקף Oz1z2 = 12']);
    expect(d.measures[0].status).toBe('holds');
  });
});

describe('F7 — the SAME sentence CHECKS when the figure is already determined', () => {
  it('confirms a true measure on a fully determined figure', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 3', 'אורך z1z2 = 4']);
    expect(d.measures[0].status).toBe('holds');
    expect(d.drivenDof).toBe(0); // nothing was free, so nothing was driven
  });

  /**
   * The honesty case, and the reason stage 3e exists: a determined figure that does NOT satisfy the
   * stated measure must say so. Quietly drawing it anyway under a green tick is the one outcome this
   * product cannot ship.
   */
  it('refuses to pretend: a FALSE measure on a determined figure is reported violated', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 3', 'אורך z1z2 = 99']);
    expect(d.measures[0].status).toBe('violated');
    expect(d.measures[0].why).toContain('99');
  });
});

describe('F7 — the free-DOF cue tells the truth after tier 2', () => {
  /**
   * Tier 1's nullspace dimension is the freedom BEFORE stage 3. Once a measure consumes a direction,
   * reporting the tier-1 count would tell a student the figure can still move in a direction their own
   * given has just pinned.
   */
  it('a driving measure is counted as consuming a degree of freedom', () => {
    const free = deriveLines(['z1 = 3+4i', 'z2', '|z2| = 2']);
    expect(free.freeDof.length).toBeGreaterThan(0);
    expect(free.drivenDof).toBe(0);

    const driven = deriveLines(['z1 = 3+4i', 'z2', '|z2| = 2', 'אורך z1z2 = 4']);
    expect(driven.drivenDof).toBe(1);
  });
});

describe('F7 — parsing', () => {
  it.each([
    'אורך z1z2 = 15r',
    'שטח Oz1z2z3 הוא 150r^2',
    'היקף המרובע Oz1z2z3 = 60r',
    'length z1z2 = 15r',
    'area of quadrilateral Oz1z2z3 is 150r^2',
    'perimeter Oz1z2z3 = 60r',
  ])('reads «%s»', (line) => {
    const d = deriveLines([line]);
    expect(d.untranslated).toEqual([]);
    expect(d.measures).toHaveLength(1);
  });

  /** A parameter-expression right-hand side is the corpus's «הביעו באמצעות r» register. */
  it('a measure in a real parameter is satisfied by choosing the parameter', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 3', 'אורך z1z2 = 5r']);
    expect(d.measures[0].status).toBe('holds'); // r is free, so r = 4/5 satisfies it
  });

  it('refuses a length over three points — the noun means two', () => {
    const d = deriveLines(['אורך Oz1z2 = 5']);
    expect(d.measures).toEqual([]);
    expect(d.untranslated).toHaveLength(1);
  });
});

describe('an arithmetic sequence now SOLVES, through the same tier', () => {
  /** F9's additive half, deferred by tier 1 (ADR-CX-011), picked up here. */
  it('«z1, z2, z3 סדרה חשבונית» places the middle term', () => {
    const d = deriveLines(['z1 = 1', 'z3 = 5', 'z1, z2, z3 סדרה חשבונית']);
    const z2 = d.points.find((p) => p.name === 'z2')!;
    expect(z2.z.re).toBeCloseTo(3, 5);
    expect(z2.z.im).toBeCloseTo(0, 5);
    expect(d.unsatisfied).toEqual([]);
  });

  /**
   * CONFLICTING GIVENS: nothing is lost silently, but the blame is not yet placed.
   *
   * «z2 = 0» and «אורך z1z2 = 99» cannot both hold. The minimiser lands between them, and the backstop
   * reports BOTH as unsatisfied — no given vanishes under a green figure, which is the property that
   * matters most.
   *
   * What is NOT built yet is stage 3d, the obligation-preservation gate: the right behaviour is to
   * refuse the student's NEWEST statement and keep the earlier figure intact, rather than let a new
   * given drag an established point off its stated value. `z2` moving away from 0 here is a collateral
   * casualty, and LADDER-CX stage 3d/`cx3:refuse` records it as pending rather than done.
   */
  it('conflicting givens: BOTH are reported, and neither disappears', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 0', 'אורך z1z2 = 99']);
    expect(d.measures[0].status).toBe('violated');
    expect(d.unsatisfied).toContain('z2 = 0');
  });

  /**
   * A drawn point has a DIRECTION, not a winding.
   *
   * The free angle coordinate is unbounded, so the minimiser is free to travel many turns to reach a
   * solution — and it does. The figure was correct and the label read «z₂ ≈ 3·cis-190440°» for a number
   * sitting on the positive real axis: arithmetically true, and useless to a student. The exact
   * carriers keep the winding (`smallestPower` solves over it); the plotted point does not.
   */
  it('a solved direction is reported inside one turn', () => {
    const d = deriveLines(['z1 = 1', 'z3 = 5', 'z1, z2, z3 סדרה חשבונית']);
    for (const p of d.points) {
      expect(p.argumentDeg).toBeGreaterThanOrEqual(0);
      expect(p.argumentDeg).toBeLessThan(360);
    }
  });

  it('an unsatisfiable deferred relation is REPORTED, never silently ignored', () => {
    // z2 is pinned to a value the arithmetic relation cannot accept
    const d = deriveLines(['z1 = 1', 'z2 = 10i', 'z3 = 5', 'z1, z2, z3 סדרה חשבונית']);
    expect(d.unsatisfied).toHaveLength(1);
    expect(d.unsatisfied[0]).toContain('חשבונית');
  });
});
