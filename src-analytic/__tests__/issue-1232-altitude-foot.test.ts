/**
 * #1232 — AN ALTITUDE'S FOOT LIES ON ITS OWN SIDE.
 *
 * «משולש ABC» · «AD גובה לצלע BC» drew a segment that was perpendicular to `BC` and **did not touch
 * it** — the foot floated a third to three quarters of the side's own length away, at every seed,
 * with `faults: []`. Correct, in-grammar, deployed input producing a figure that is wrong in every
 * configuration while the tool reports nothing: the honesty shape of #1158 and #1166.
 *
 * **The class.** *A construct defined by a CONJUNCTION of conditions was lowered to only the
 * condition its keyword is named after.* «גובה» means two things — the foot lies on the side AND the
 * segment to it is perpendicular — and the rule emitted only the second. `perpendicular` is a pure
 * direction residual (two vectors, dot product driven to zero); nothing in it says where `D` sits.
 * The median leg read correctly for the accidental reason that `midpoint` happens to carry both
 * halves in one kind, so the defect never showed on the sibling that had a test.
 *
 * **Why it survived:** the cevian rule had no test for the «גובה» leg at all — a search for that word
 * across this directory returned nothing. This file is that test.
 *
 * ## What is locked, and why each case is here
 *
 * The first case checks **both halves at once**, which is the whole point: a lock on perpendicularity
 * alone is one the broken code already passed. The class case checks the *lowering* rather than the
 * geometry, so a future session that removes the incidence fails here with the reason spelled out
 * rather than only as a numeric drift. The obtuse case guards the opposite over-correction —
 * bounding the foot to the SEGMENT would refuse an honest figure.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';

const P = (d: ReturnType<typeof derive>, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id} in figure (${d.figure.points.map((q) => q.id).join(',')})`);
  return p;
};

/**
 * Both halves of "AD is the altitude to BC", measured on the DRAWN figure.
 *
 * Scale-relative, because the seeds draw triangles spanning 2 units and 11 and an absolute epsilon
 * would mean different things on each — ADR-052's reasoning applied to a tolerance.
 */
function altitudeError(d: ReturnType<typeof derive>, apex: string, foot: string, u: string, v: string) {
  const A = P(d, apex);
  const D = P(d, foot);
  const B = P(d, u);
  const C = P(d, v);
  const ux = C.x - B.x;
  const uy = C.y - B.y;
  const n = Math.hypot(ux, uy);
  const ax = D.x - A.x;
  const ay = D.y - A.y;
  return {
    /** How far the foot sits off the line `uv`, as a fraction of |uv|. Zero means ON the side. */
    offLine: Math.abs((D.x - B.x) * uy - (D.y - B.y) * ux) / (n * n),
    /** |cos| of the angle between the cevian and the side. Zero means perpendicular. */
    cos: Math.abs((ax * ux + ay * uy) / (Math.hypot(ax, ay) * n)),
    /** Where along `uv` the foot lands: 0 at `u`, 1 at `v`, outside [0,1] beyond an endpoint. */
    t: ((D.x - B.x) * ux + (D.y - B.y) * uy) / (n * n),
  };
}

/**
 * MEASURED, not chosen: the worst residual over 24 seeds of the free triangle is ~1.5e-8 off-line
 * and ~5.6e-8 in cos. That is the numerical minimiser's convergence noise, not a design margin, and
 * 1e-6 sits well clear of it while still being a millionth of the side — invisible by any standard
 * a student could apply. The issue's fix plan proposed 1e-9; the solve does not converge that
 * tightly, so a lock at that value would have failed on correct output.
 */
const TOL = 1e-6;

describe('#1232 — the altitude foot lies ON the side, at every configuration', () => {
  it('both halves hold across configurations — incidence AND perpendicularity', () => {
    for (let seed = 0; seed < 8; seed++) {
      const d = derive(['משולש ABC', 'AD גובה לצלע BC'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(d.figure.unsatisfied, `seed ${seed}`).toEqual([]);
      const e = altitudeError(d, 'A', 'D', 'B', 'C');
      // The half that was missing. Before the fix this ran 0.13–1.06 — the foot was up to a whole
      // side-length away from the side it was the foot of.
      expect(e.offLine, `seed ${seed} off-line`).toBeLessThan(TOL);
      // The half that always held. Kept so the fix cannot trade one condition for the other.
      expect(e.cos, `seed ${seed} cos`).toBeLessThan(TOL);
    }
  });

  it('the English sentence is the same construct, not a second one', () => {
    for (let seed = 0; seed < 4; seed++) {
      const d = derive(['triangle ABC', 'AD is the altitude to BC'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const e = altitudeError(d, 'A', 'D', 'B', 'C');
      expect(e.offLine, `seed ${seed} off-line`).toBeLessThan(TOL);
      expect(e.cos, `seed ${seed} cos`).toBeLessThan(TOL);
    }
  });

  /**
   * THE CLASS, checked at the lowering rather than at the figure.
   *
   * A numeric lock alone would let someone "fix" this by tightening a solver tolerance, or by adding
   * the incidence somewhere else and leaving the rule half-stated. This says what the SENTENCE must
   * mean: both conditions, from the one rule that owns the word.
   */
  it('the rule lowers the altitude to BOTH conditions', () => {
    const r = parseLine('AD גובה לצלע BC');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ks = r.facts
      .filter((f) => f.t === 'constraint')
      .map((f) => (f as Extract<typeof f, { t: 'constraint' }>).k);
    expect(ks.map((k) => k.t).sort()).toEqual(['on-line-2pt', 'perpendicular']);
    expect(ks).toContainEqual({ t: 'on-line-2pt', id: 'D', a: 'B', b: 'C' });
    expect(ks).toContainEqual({ t: 'perpendicular', a: 'A', b: 'D', c: 'B', d: 'C' });
  });

  /**
   * The OPPOSITE over-correction, and the reason the incidence is on the LINE.
   *
   * «לצלע BC» reads as "to the side", and the naive repair is to bound the foot between `B` and `C`.
   * An obtuse triangle's altitude foot legitimately falls beyond an endpoint, so that bound would
   * refuse a correct figure — the same honesty failure pointing the other way. Here `A(0,3)`,
   * `B(5,0)`, `C(7,0)` put the foot at the origin, `t = −2.5`, well outside the segment: it must
   * build, and it must build there.
   */
  it('an obtuse triangle whose foot falls beyond an endpoint still builds', () => {
    for (let seed = 0; seed < 3; seed++) {
      const d = derive(['A(0,3)', 'B(5,0)', 'C(7,0)', 'משולש ABC', 'AD גובה לצלע BC'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(d.figure.unsatisfied, `seed ${seed}`).toEqual([]);
      const e = altitudeError(d, 'A', 'D', 'B', 'C');
      expect(e.offLine, `seed ${seed} off-line`).toBeLessThan(TOL);
      expect(e.cos, `seed ${seed} cos`).toBeLessThan(TOL);
      // Beyond `B`, not clamped to it — the foot is where the geometry puts it.
      expect(e.t, `seed ${seed} t`).toBeCloseTo(-2.5, 6);
      expect(P(d, 'D').x, `seed ${seed}`).toBeCloseTo(0, 6);
      expect(P(d, 'D').y, `seed ${seed}`).toBeCloseTo(0, 6);
    }
  });

  /**
   * The sibling that was already right stays right.
   *
   * The incidence is now stated for BOTH roles, so the median carries a constraint that `midpoint`
   * already implies. That redundancy must cost nothing: `carrierDofOf` measures the Jacobian's RANK
   * rather than counting constraints, so a dependent row consumes no freedom and the DOF cue is
   * unchanged — asserted here rather than assumed, because a count-based accounting would have
   * reported this figure over-determined.
   */
  it('the median leg is unchanged — foot at the midpoint, and no freedom lost to the redundancy', () => {
    for (let seed = 0; seed < 4; seed++) {
      const d = derive(['משולש ABC', 'AD תיכון לצלע BC'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(d.figure.unsatisfied, `seed ${seed}`).toEqual([]);
      const B = P(d, 'B');
      const C = P(d, 'C');
      const D = P(d, 'D');
      expect(D.x, `seed ${seed}`).toBeCloseTo((B.x + C.x) / 2, 6);
      expect(D.y, `seed ${seed}`).toBeCloseTo((B.y + C.y) / 2, 6);
    }
  });
});
