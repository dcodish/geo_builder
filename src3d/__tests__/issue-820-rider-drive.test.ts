/**
 * #820 (ADR-3D-204) — A STATED RELATION DRIVES THE FREE RIDER, IT DOES NOT JUDGE THE SAMPLE.
 *
 * «K על SB» gives K one free DOF. Every given that then named K was checked against whatever `t` the
 * sampler happened to pick, so «SD מקביל למישור ACK» — satisfiable, at K = the midpoint of SB, and
 * reachable through the plane-first spelling the engine already had — came back `givens-contradict`,
 * naming the student's own correct statements as the conflict.
 *
 * The class these lock: **the answer must not depend on WHICH side of a relation holds the free DOF.**
 * The same figure is reached with the freedom on the PLANE (#487's resolver) and with it on the RIDER,
 * and the relation is not sensitive to where in the fact list it sits (docs/17 M2 law (i)).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { freeDofCount3 } from '../engine/evaluate';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);
const run = (lines: string[]) => { for (const l of lines) submit(l); };

/** The operator's bagrut pyramid. |AD| = |AB| = 5 with AD = (3,p,0) ⇒ p = 4. */
const FIGURE = [
  'פירמידה SABCD שבסיסה מקבילית',
  'המקצוע SA הוא גובה בפירמידה',
  'נסמן: AB = u, AD = v, AS = w',
  'A(0,0,0)',
  'B(0,5,0)',
  'S(0,0,6)',
  'D(3,p,0)',
  '|u| = |v|',
  'p חיובי',
];

/** S(0,0,6), B(0,5,0) — the plane through AC parallel to SD meets SB at its MIDPOINT. */
const expectMidpointK = () => {
  const K = derived().positions.get('K');
  expect(K, 'K must be placed').toBeDefined();
  expect(K!.x).toBeCloseTo(0, 4);
  expect(K!.y).toBeCloseTo(2.5, 4);
  expect(K!.z).toBeCloseTo(3, 4);
};

describe('#820 — the relation DRIVES the rider', () => {
  beforeEach(reset);

  it('«SD מקביל למישור ACK» after «K על SB» builds, and lands K on the midpoint', () => {
    run([...FIGURE, 'K על SB', 'SD מקביל למישור ACK']);
    expect(state().lastError).toBeNull();
    expectMidpointK();
  });

  it('the English mirror builds the same figure', () => {
    run([
      'pyramid SABCD with a parallelogram base',
      'the edge SA is the height of the pyramid',
      'let AB = u, AD = v, AS = w',
      'A(0,0,0)', 'B(0,5,0)', 'S(0,0,6)', 'D(3,p,0)',
      '|u| = |v|', 'p is positive',
      'K on SB',
      'SD is parallel to plane ACK',
    ]);
    expect(state().lastError).toBeNull();
    expectMidpointK();
  });

  /**
   * The carrier mirror — the SAME relation with the freedom on the PLANE instead of the rider. This
   * spelling always worked (#487/#819); it is here because the two must agree, which is the whole
   * claim of this fix: satisfiability is a property of the givens, not of which object is free.
   */
  it('the plane-carrier spelling reaches the same K', () => {
    run([...FIGURE, 'מישור π דרך A ו-C ומקביל ל-SD', 'K נקודת החיתוך של π עם SB']);
    expect(state().lastError).toBeNull();
    expectMidpointK();
  });

  /** docs/17 M2 law (i): a given re-homes obligations wherever it sits in the fact list. */
  it('is insensitive to entry order — the pin givens may follow the relation', () => {
    run([
      'פירמידה SABCD שבסיסה מקבילית',
      'המקצוע SA הוא גובה בפירמידה',
      'נסמן: AB = u, AD = v, AS = w',
      'A(0,0,0)', 'B(0,5,0)', 'S(0,0,6)',
      'K על SB',
      'SD מקביל למישור ACK',
      'D(3,p,0)', '|u| = |v|', 'p חיובי',
    ]);
    expect(state().lastError).toBeNull();
    expectMidpointK();
  });

  it('the DOF cue drops when the relation consumes the rider’s freedom', () => {
    const cue = () => { const d = derived(); return freeDofCount3(d.construction, d.resolved); };
    run(FIGURE);
    expect(cue(), 'the pinned figure is determined').toBe(0);
    submit('K על SB');
    expect(cue(), 'the rider adds one free DOF').toBe(1);
    submit('SD מקביל למישור ACK');
    expect(state().lastError).toBeNull();
    expect(cue(), 'the relation consumed it — a driven rider is not free').toBe(0);
  });

  /**
   * The honesty half. A relation with no admissible `t` must still REFUSE — driving the rider may
   * never become "slide it wherever the residual is smallest". «SB מקביל למישור ACK» asks the host
   * segment to be parallel to a plane through one of its own points: only K off SB could satisfy it.
   */
  it('refuses a relation no position of the rider satisfies', () => {
    run([...FIGURE, 'K על SB', 'SB מקביל למישור ACK']);
    expect(state().lastError).not.toBeNull();
  });

  /**
   * The no-op half — the promise that pays for the lane's cost. A rider NO constraint names keeps its
   * sampled parameter and keeps varying with the seed (ADR-052): it never enters the solve at all.
   */
  it('leaves an unmentioned rider sampled and seed-varying', () => {
    run([...FIGURE, 'K על SB']);
    expect(state().lastError).toBeNull();
    const at = (seed: number) => derive3(state().facts, seed).positions.get('K')!;
    const ys = [0, 1, 2, 3, 4].map((s) => at(s).y);
    expect(new Set(ys.map((y) => y.toFixed(3))).size, 'K must move across seeds').toBeGreaterThan(1);
  });
});
