/**
 * #292: the DOF cue (`freeDofCount3`) must be MONOTONE NON-INCREASING as facts
 * accumulate — a ⊥ / angle constraint removes freedom, it can never add it. The bug:
 * a driving `cos-angle` triggers a pivot solve, and the cue added the whole 7-DOF
 * similarity gauge (`dims + 7 − pinCount`) even though no absolute pins consumed it,
 * so the cue JUMPED UP by 7. Now the free gauge is excluded and the drive is subtracted.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { freeDofCount3 } from '../engine/evaluate';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const dof = () => {
  const s = useGeo3.getState();
  const d = derive3(s.facts, s.seed);
  return freeDofCount3(d.construction, d.resolved);
};

describe('#292 — DOF cue is non-increasing when a ⊥ constraint is added', () => {
  beforeEach(reset);

  it('pyramidPar: naming vectors keeps DOF; u ⊥ v LOWERS it (never +7)', () => {
    submit('פירמידה שבסיסה מקבילית');
    const d0 = dof();
    expect(d0).toBe(5); // parallelogram base (2) + free apex (3)
    submit('AB=u');
    submit('AD=v');
    expect(dof()).toBe(d0); // naming vectors adds no shape constraint
    submit('u ⊥ v');
    const d1 = dof();
    expect(d1).toBeLessThan(d0); // a ⊥ drive REMOVES freedom
    expect(d1).toBe(4); // exactly one base DOF consumed (∠DAB pinned to 90°)
  });

  it('right triangular prism: AB ⊥ AC lowers the DOF, does not raise it', () => {
    submit('מנסרה ישרה משולשת ABC');
    const d0 = dof();
    expect(d0).toBe(3); // two base angles + height
    submit('AB ⊥ AC');
    const d1 = dof();
    expect(d1).toBeLessThan(d0);
    expect(d1).toBe(2);
  });

  it('the cue never increases across a whole sequence', () => {
    const seq = ['פירמידה שבסיסה מקבילית', 'AB=u', 'AD=v', 'AS=w', 'u ⊥ v'];
    let prev = Infinity;
    for (const u of seq) {
      submit(u);
      const cur = dof();
      expect(cur, `after "${u}" DOF=${cur} should be ≤ prev ${prev}`).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });
});
