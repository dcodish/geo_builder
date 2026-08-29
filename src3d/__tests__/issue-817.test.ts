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
  // `normalize3: zero vector` from `auxSegmentHidden`. The seed preference now steers away from them,
  // but the renderer must survive them regardless — a bad drawing is fixed upstream, never by crashing.
  it('a seed whose base IS collapsed still renders rather than throwing', () => {
    SEQ.forEach(submit);
    for (const seed of [0, 1, 3, 6, 11, 13]) {
      expect(() => render(seed), `seed ${seed}`).not.toThrow();
    }
  });

  it('at least one of those seeds really is collapsed — otherwise this test proves nothing', () => {
    SEQ.forEach(submit);
    const collapsed = [0, 1, 3, 6, 11, 13].filter((seed) => {
      const d = derive3(state().facts, seed);
      return solidFaceCollapsed(d.construction, d.positions);
    });
    expect(collapsed.length).toBeGreaterThan(0);
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
