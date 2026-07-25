/**
 * Issue #332 (ADR-3D-084): a symbol-pin root that COLLAPSES the driven segment is a
 * VACUOUS zero, not a solution. Prod session `4vx34b8y` (2026-07-25): `EM = k·CM` makes
 * the direction of EM fixed (∝ CM), so `EM ∥ plane BSC` has no non-degenerate k — its only
 * zero-crossing is the collapse k≈0 where E lands exactly on M. The normalised ∥-residual
 * reads 0 there (a zero vector is trivially parallel to anything), so the old root-finder
 * pinned k≈0, placed E≡M, and committed the row GREEN. The honest outcome is a refusal
 * (no non-degenerate root ⇒ E unpositioned ⇒ store `no-solution`, keep-prior). The 3-D
 * analogue of the 2-D anti-collapse / general-position principle (ADR-238 / ADR-253).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { dist3 } from '../engine/vec3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);

// The exact prod sequence (session 4vx34b8y). The two LLM steps use the logged canonical
// commands the mocked LLM would emit (`P מפגש תיכונים במשולש SAB` → `P מפגש התיכונים…`;
// `EM מקביל ל BSC` → `EM מקביל למישור BSC`) — both parse deterministically here.
const SEQ = [
  'פירמידה SABC',
  'P מפגש התיכונים של משולש SAB',
  'CS=w', 'CB=v', 'CA=u',
  'AM=t*AB',
  '|w|=2', '|u|=1', '|v|=1',
  '∠SCB=α', '∠BCA=α', '∠SCA=α',
  '0<α<90',
  'AB⊥PM',
  'EM=k*CM',
  'מישור BCS',
];
const IMPOSSIBLE = 'EM מקביל למישור BSC';

describe('#332 — symbol-pin anti-collapse guard', () => {
  beforeEach(reset);

  it('the prod sequence builds up to the impossible ∥, which is REFUSED (never E≡M green)', () => {
    SEQ.forEach(submit);
    // everything up to the impossible relation builds and verifies
    expect(state().facts).toHaveLength(SEQ.length);
    const before = derived();
    for (const f of state().facts) expect(before.status[f.id], f.utterance).toBe('ok');
    // E was placed with k free (general position) — E is NOT already on top of M
    expect(dist3(before.positions.get('E')!, before.positions.get('M')!)).toBeGreaterThan(1e-3);

    // the impossible parallel: refused (keep-prior), the fact is not added
    submit(IMPOSSIBLE);
    expect(state().facts).toHaveLength(SEQ.length); // NOT committed
    expect(state().lastError?.code).toBe('no-solution');

    // the kept figure still has E off M (no silent collapse)
    const after = derived();
    expect(dist3(after.positions.get('E')!, after.positions.get('M')!)).toBeGreaterThan(1e-3);
  });

  it('is stable across "show another configuration" (the collapse root is never chosen)', () => {
    SEQ.forEach(submit);
    submit(IMPOSSIBLE);
    expect(state().lastError?.code).toBe('no-solution');
    for (let i = 0; i < 4; i++) {
      useGeo3.getState().resample();
      const d = derived();
      expect(dist3(d.positions.get('E')!, d.positions.get('M')!)).toBeGreaterThan(1e-3);
    }
  });
});
