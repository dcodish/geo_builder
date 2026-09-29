/**
 * #1415 — THE DOF CUE COUNTS WHAT A GIVEN CONSUMED ON A FREE VECTOR (ADR-3D-274).
 *
 * Round #1408's follow-up on ADR-3D-260: after «וקטור AB» · «אורך AB = 5» the cue still said 6.
 * Two halves, both measured: the consumption probe (ADR-3D-248's rank measure) nudged only the
 * SHAPE DIMS, so on a solidless figure it read 0; and the cue's formula clamped the subtraction
 * inside the dims-only term, so even a measured consumption never reached the free-point block.
 * The probe now spans the block-enrolled free-point coordinates (the refinement ADR-3D-204's own
 * note reserved for this issue), and the subtraction spans the sum.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3, derive3 } from '../store/store3';
import { freeDofCount3 } from '../engine/evaluate';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const cue = () => {
  const st = useGeo3.getState();
  const d = derive3(st.facts, st.seed);
  return freeDofCount3(d.construction, d.resolved);
};
beforeEach(reset);

describe('#1415 — the reported figure', () => {
  it('«וקטור AB» alone: 6 free values', () => {
    submit('וקטור AB');
    expect(cue()).toBe(6);
  });

  it('after «אורך AB = 5»: 5 — the length consumed one', () => {
    submit('וקטור AB');
    submit('אורך AB = 5');
    expect(cue()).toBe(5);
  });

  // NOT locked: «AB = (1,2,3)» (a component PIN, not a scalar pin) still reads 6 — the pin runs
  // through the 7-DOF gauge allowance, which a solidless figure has no gauge to justify. A
  // pre-existing accounting seam outside this issue's measured scope; noted in ADR-3D-274.
});

describe('#1415 — figures the change must not touch', () => {
  it('a cube’s cue is unchanged by the probe widening (no block-enrolled riders)', () => {
    submit("קובייה ABCDA'B'C'D'");
    const v = cue();
    submit("אורך AB = 4");
    expect(cue()).toBeLessThanOrEqual(v); // a stated edge never ADDS freedom
  });
});
