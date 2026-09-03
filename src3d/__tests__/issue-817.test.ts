/**
 * #817 (ADR-3D-176) — A COLLAPSED FACE IS NOT A CONFIGURATION, AND NEVER A CRASH.
 *
 * The operator built «פירמידה SABCD שבסיסה מקבילית» + the height + coordinates, got a figure that
 * "looked collapsed to 2-D", pressed «הציגו תצורה אחרת» and the app died. Two faults stacked:
 *
 *  1. The base parallelogram was sampled COLLINEAR — `A(0,0,0) B(0,5,0) C(0,9.74,0) D(0,4.74,0)`, a
 *     zero-area "parallelogram". The general-position gate (`requirements` / `quad-general`) is pushed
 *     only by `recordShape`, i.e. by a STATED quad («ABCD מקבילית»); a solid declaring the same base
 *     through its own noun («שבסיסה מקבילית») registered nothing, so `requirements` was empty — and
 *     `seedForRequirements` then short-circuited, making «show another configuration» a bare `seed + 1`
 *     with no validity check at all. *An enumeration is not a rule.*
 *  2. `auxSegmentHidden` normalized that face's zero normal and threw, turning a bad drawing into a
 *     dead app — on the code path of every resample.
 *
 * Both are fixed here, and both are tested: the preference keeps the drawing honest, the render guard
 * keeps it survivable. The render guard is deliberately exercised against a seed that IS collapsed, so
 * it keeps protecting even if the preference is ever weakened.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { solidFaceCollapsed } from '../engine/evaluate';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);
const render = (seed: number) => {
  const d = derive3(state().facts, seed);
  return buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1, {}, true);
};

/** The operator's exact sequence (dev server, 2026-08-29). */
const SEQ = [
  'פירמידה SABCD שבסיסה מקבילית',
  'המקצוע SA הוא גובה בפירמידה',
  'M אמצע אלכסון BD',
  'נסמן: AB = u, AD = v, AS = w',
  'A(0,0,0)',
  'B(0,5,0)',
  'S(0,0,6)',
];

describe('#817 — «הציגו תצורה אחרת» never lands on a collapsed figure', () => {
  beforeEach(reset);

  it('the operator sequence: the FIRST drawing already has a base with real area', () => {
    SEQ.forEach(submit);
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(solidFaceCollapsed(d.construction, d.positions)).toBe(false);
  });

  it('...and twelve presses of «show another configuration» keep it that way, and never throw', () => {
    SEQ.forEach(submit);
    for (let i = 0; i < 12; i++) {
      useGeo3.getState().resample();
      const d = derived();
      expect(solidFaceCollapsed(d.construction, d.positions), `resample ${i} (seed ${state().seed})`).toBe(false);
      expect(() => render(state().seed), `resample ${i} (seed ${state().seed})`).not.toThrow();
    }
  });

  it('the base is a real parallelogram — AD is not parallel to AB', () => {
    SEQ.forEach(submit);
    const pos = derived().positions;
    const A = pos.get('A')!;
    const B = pos.get('B')!;
    const D = pos.get('D')!;
    const ab = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
    const ad = { x: D.x - A.x, y: D.y - A.y, z: D.z - A.z };
    const cross = Math.hypot(
      ab.y * ad.z - ab.z * ad.y,
      ab.z * ad.x - ab.x * ad.z,
      ab.x * ad.y - ab.y * ad.x,
    );
    const den = Math.hypot(ab.x, ab.y, ab.z) * Math.hypot(ad.x, ad.y, ad.z);
    expect(cross / den).toBeGreaterThan(0.02); // visibly not collinear
  });
});

describe('#817 — the renderer is TOTAL over engine output', () => {
  beforeEach(reset);

  // Seeds 0/1/3/6/11/13 are the ones that produced a collapsed base and threw
  // `normalize3: zero vector` from `auxSegmentHidden`. The renderer must survive them regardless —
  // a bad drawing is fixed upstream, never by crashing — so this stays as defence in depth even now
  // that the solver no longer emits a collapsed configuration at all (see below).
  it('the historically-crashing seeds still render rather than throwing', () => {
    SEQ.forEach(submit);
    for (const seed of [0, 1, 3, 6, 11, 13]) {
      expect(() => render(seed), `seed ${seed}`).not.toThrow();
    }
  });

  /**
   * #872 (ADR-3D-212) STRENGTHENED THIS, and the reversal is deliberate.
   *
   * This used to assert the OPPOSITE — *"at least one of those seeds really is collapsed — otherwise
   * this test proves nothing"* — because #817 decided a collapsed configuration is TOLERATED and the
   * renderer is made total over it. Measured on `main`, all six of these seeds are flat to 1e-14–1e-16
   * of span: real, shipped, silent degeneracies.
   *
   * The flat-collapse arm of `degenerate()` now rejects such a configuration at solve time, so the
   * solver cannot produce one — which is strictly stronger than rendering it safely, and makes the
   * old control unsatisfiable by construction. Asserting the stronger property here keeps a live
   * check rather than deleting the control. The reconciliation of #817's own ADR is tracked
   * separately; this test states today's truth.
   */
  it('#872: none of those seeds is collapsed ANY MORE — the solver cannot emit one', () => {
    SEQ.forEach(submit);
    const collapsed = [0, 1, 3, 6, 11, 13].filter((seed) => {
      const d = derive3(state().facts, seed);
      return solidFaceCollapsed(d.construction, d.positions);
    });
    expect(collapsed, 'a collapsed configuration is no longer reachable').toEqual([]);
  });
});

describe('#817 — the class: EVERY solid declares its base by noun, not by a stated quad', () => {
  beforeEach(reset);

  // None of these register a `quad-general` requirement — the gate reachable only through a stated
  // quad statement. They are exactly the family the crash came from, so they are checked as a family.
  const SOLIDS = [
    'פירמידה SABCD שבסיסה מקבילית',
    'פירמידה שבסיסה מעוין',
    'פירמידה שבסיסה דלתון',
    'פירמידה שבסיסה טרפז',
    'פירמידה שבסיסה מרובע',
    'מנסרה ישרה שבסיסה מקבילית',
    'מקבילון ABCDEFGH',
  ];

  for (const solid of SOLIDS) {
    it(`«${solid}» draws with real faces, and resampling keeps it so`, () => {
      submit(solid);
      expect(state().lastError).toBeNull();
      for (let i = 0; i < 5; i++) {
        const d = derived();
        expect(solidFaceCollapsed(d.construction, d.positions), `seed ${state().seed}`).toBe(false);
        expect(() => render(state().seed), `seed ${state().seed}`).not.toThrow();
        useGeo3.getState().resample();
      }
    });
  }
});

/**
 * #873 — the RECONCILIATION measurement (round #897).
 *
 * #817 (this file) decided a collapsed configuration is TOLERATED: steer away from it, and render it
 * safely if it happens. #872 (ADR-3D-212) took the opposite position one layer earlier — the solver
 * REJECTS a collapsed solid, so it cannot be emitted at all. The two do not contradict in behaviour
 * ("never produced" plus "rendered safely if produced" is belt and braces); what went stale was the
 * RECORD, which still described tolerance as the design position.
 *
 * These two tests are the measurement that settles it, so the claim in ADR-3D-176 Am. 1 is evidence
 * rather than assertion. They are also the reason  is KEPT rather than removed:
 * it answers a different question from  (a collapsed FACE CORNER, versus coincident
 * vertices or a solid that lost its volume), and no reachable case was found in either direction.
 */
describe('#873 — collapse is unreachable from BOTH directions, so tolerance is the second line', () => {
  beforeEach(reset);

  it('the #817 figure no longer reaches a collapsed seed — the steering has nothing to steer', () => {
    for (const u of [
      'פירמידה SABCD שבסיסה מקבילית',
      'המקצוע SA הוא גובה בפירמידה',
      'M אמצע אלכסון BD',
      'נסמן: AB = u, AD = v, AS = w',
      'A(0,0,0)',
      'B(0,5,0)',
      'S(0,0,6)',
    ]) {
      submit(u);
      expect(state().lastError, u).toBeNull();
    }
    // The six seeds #817 named as collapsed, plus neighbours. Before #872 these were flat to ~1e-16.
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 11, 13]) {
      const d = derive3(state().facts, seed);
      expect(solidFaceCollapsed(d.construction, d.positions), `seed ${seed}`).toBe(false);
    }
  });

  it('a collapsed base cannot be STATED either — the injection is refused, never drawn', () => {
    // The other direction: if the solver cannot produce one, can the student inject one? A, B, C
    // collinear on the y-axis would give the base a zero-area corner while the apex keeps the solid
    // its volume — the one shape  (coincident vertices / lost volume) cannot see.
    submit('פירמידה SABCD');
    submit('A(0,0,0)');
    submit('B(0,5,0)');
    expect(state().lastError, 'the honest prefix must land').toBeNull();
    submit('C(0,9,0)'); // collinear with A and B
    expect(state().lastError, 'a stated collapse must be REFUSED, not drawn').not.toBeNull();
    // and the figure that survives is not collapsed
    const d = derived();
    expect(solidFaceCollapsed(d.construction, d.positions)).toBe(false);
  });
});
