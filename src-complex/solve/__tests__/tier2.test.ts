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

import { nearestOnSet, solveResiduals } from '../tier2';
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
    expect(d.measures[0].why).toEqual({ code: 'measure-violated', src: 'אורך z1z2 = 99' });
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
  // #1434 (ADR-CX-050): `z2 = 0` is a CLOSED definition, so it places z2 instead of leaving it to the
  // search — the newest statement is the one reported, and the earlier figure is no longer dragged
  it('conflicting givens: the measure is reported violated, and z2 = 0 is not dragged off its value', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 0', 'אורך z1z2 = 99']);
    expect(d.measures[0].status).toBe('violated');
    expect(d.unsatisfied).toEqual(['אורך z1z2 = 99']);
    const z2 = d.points.find((p) => p.name === 'z2')!.z;
    expect(Math.hypot(z2.re, z2.im)).toBeLessThan(1e-9);
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

/**
 * #2801 / #2802 (ADR-CX-101, stages 3b–3c) — a CONTINUUM is drawn at the point of its set nearest the sampled
 * start, so the drawing is a function of (the set, the seed), never of the rows that describe the set.
 */
describe('#2801 — the nearest-point polish (stage 3c)', () => {
  const polar = (x: readonly number[]) => [x[0] * Math.cos((x[1] * Math.PI) / 180), x[0] * Math.sin((x[1] * Math.PI) / 180)];
  const bounds = [{ lo: 1e-6 }, {}];

  it('a LINE: lands on the orthogonal projection of the start, from any point of the line', () => {
    const f = (x: readonly number[]) => [polar(x)[0] - 2];
    for (const y of [-3.5, 0.5, 8]) {
      const r = nearestOnSet(f, polar, [Math.hypot(2, y), (Math.atan2(y, 2) * 180) / Math.PI], [2.96, 152.64], bounds)!;
      const p = polar(r);
      expect(p[0]).toBeCloseTo(2, 9);
      expect(p[1]).toBeCloseTo(2.96 * Math.sin((152.64 * Math.PI) / 180), 8);
    }
  });

  it('a CIRCLE: lands on c + R·(p0 − c)/|p0 − c|', () => {
    const f = (x: readonly number[]) => [Math.hypot(polar(x)[0] - 1, polar(x)[1]) - 2];
    const x0 = [2.96, 140];
    const p0 = polar(x0);
    const ang = Math.atan2(p0[1], p0[0] - 1);
    const start = { re: 1 + 2 * Math.cos(-0.7), im: 2 * Math.sin(-0.7) };
    const r = nearestOnSet(f, polar, [Math.hypot(start.re, start.im), (Math.atan2(start.im, start.re) * 180) / Math.PI], x0, bounds)!;
    expect(polar(r)[0]).toBeCloseTo(1 + 2 * Math.cos(ang), 8);
    expect(polar(r)[1]).toBeCloseTo(2 * Math.sin(ang), 8);
  });

  it('two different residuals of ONE set give the same point (the rows do not matter)', () => {
    const line1 = (x: readonly number[]) => [polar(x)[0] - 2, 0];
    const line2 = (x: readonly number[]) => {
      const [a, b] = polar(x);
      return [Math.hypot(a - 1, b) - Math.hypot(a - 3, b)];
    };
    const both = (x: readonly number[]) => [...line1(x), ...line2(x)];
    const at = (f: (x: readonly number[]) => number[], y: number) =>
      polar(nearestOnSet(f, polar, [Math.hypot(2, y), (Math.atan2(y, 2) * 180) / Math.PI], [2.5, 60], bounds)!);
    const ref = at(line1, 4);
    for (const p of [at(line2, -1), at(both, 7)]) {
      expect(p[0]).toBeCloseTo(ref[0], 9);
      expect(p[1]).toBeCloseTo(ref[1], 9);
    }
  });

  it('a start it cannot keep on the set answers null (the caller keeps the descent\'s endpoint)', () => {
    expect(nearestOnSet(() => [1], polar, [1, 0], [2, 0], bounds)).toBeNull();
  });
});

describe('#2802 — a lone locus is drawn near the view, and moves along it with the configuration', () => {
  it.each(['|z - 1 - i| = |z|', '|z - 1| = 2', 'Re(z^2) = 0', 'Re(z) = 1'])('«%s» at seeds 0–7: |z| ≤ 10', (line) => {
    const zs = [0, 1, 2, 3, 4, 5, 6, 7].map((s) => {
      const d = deriveLines([line], s, s);
      expect(d.configCount, 'drawn from a solve that reached tolerance').toBeGreaterThanOrEqual(1);
      expect(d.unsatisfied).toEqual([]);
      return d.points.find((p) => p.name === 'z')!.z;
    });
    for (const z of zs) expect(Math.hypot(z.re, z.im)).toBeLessThanOrEqual(10);
    expect(new Set(zs.map((z) => `${z.re.toFixed(3)},${z.im.toFixed(3)}`)).size).toBeGreaterThanOrEqual(2);
  });
});

/** #2801 — the class matrix of the deferred family: a restated relation moves nothing, both orders, seeds 0–7. */
describe('#2801 — a restated deferred relation leaves the drawing still', () => {
  it.each([
    ['Re(z) = 2', '|z - 1| = |z - 3|'],
    ['|z - 1| = 2', '|z - 1| = 2'],
    ['|z - 1| = 2', '|1 - z| = 2'],
    ['Re(z) = 1', 'Re(z) = 1'],
  ])('«%s» · «%s»', (a, b) => {
    for (const [first, second] of [[a, b], [b, a]]) {
      for (const s of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const before = deriveLines([first], s, s);
        const after = deriveLines([first, second], s, s);
        expect(after.configCount, 'a continuum, not taken for isolated points').toBe(before.configCount);
        const [z0, z1] = [before, after].map((d) => d.points.find((p) => p.name === 'z')!.z);
        // to the polish's precision, the numeric Jacobian's (~1e-8)
        expect(Math.hypot(z1.re - z0.re, z1.im - z0.im), `${first} · ${second} @ ${s}`).toBeLessThanOrEqual(1e-7);
      }
    }
  });

  it('stage 3b: a residual that holds identically is not a constraint — «arg(z) = 90» · «Re(z^3) = 0» keeps its drawing', () => {
    for (const s of [0, 1, 2, 3]) {
      const a = deriveLines(['arg(z) = 90'], s, s);
      const b = deriveLines(['arg(z) = 90', 'Re(z^3) = 0'], s, s);
      expect(b.configCount).toBe(a.configCount);
      expect(b.points.find((p) => p.name === 'z')!.z.im).toBeCloseTo(a.points.find((p) => p.name === 'z')!.z.im, 9);
    }
  });
});
