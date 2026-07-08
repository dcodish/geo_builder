/**
 * ADR-3D-015 — plane HIGHLIGHT + point on/above/below a plane, end-to-end through
 * the REAL path (submit → derive3 → scene):
 *  - `מישור BC'D` draws the plane's patch and the patch COVERS the named points;
 *  - 4 named points that aren't coplanar (or 3 collinear ones) are REFUSED — a
 *    best-fit patch through off-plane points would draw a lie (not-coplanar);
 *  - a NEW point named onto a plane is created riding it (2 free DOF, resampled,
 *    never leaves the plane); a stated side (מעל/מתחת) floats it on that side (3 DOF);
 *  - an EXISTING point is a verified given: wrong side / off plane → honest refusal;
 *  - above/below a VERTICAL plane is meaningless → plane-side-undefined.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { freeDofCount3 } from '../engine/evaluate';
import { dot3, norm3 } from '../engine/vec3';
import { HOME_CAMERA } from '../render/camera';
import { buildScene3 } from '../render/scene3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);

function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(state().lastError).toBeNull();
}

/** 2-D point-in-convex-polygon (screen space; affine projection preserves inside-ness). */
function insideQuad(q: { x: number; y: number }, corners: { x: number; y: number }[]): boolean {
  let sign = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const cr = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
    if (Math.abs(cr) < 1e-9) continue;
    const s = Math.sign(cr);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

describe('bare מישור ABC — the plane is highlighted and its patch covers the points', () => {
  beforeEach(reset);

  for (const [name, cube, plane] of [
    ['Hebrew', 'קובייה ABCD', "מישור BC'D"],
    ['English', 'cube ABCD', "plane BC'D"],
  ] as const) {
    it(`${name}: the patch exists and covers B, C', D on screen`, () => {
      submit(cube);
      submit(plane);
      expect(state().facts).toHaveLength(2);
      expectAllOk();
      const d = derived();
      expect(d.resolved.planes.has("BC'D")).toBe(true);
      const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 800, height: 600 });
      const patch = scene.planes.find((p) => p.name === "BC'D");
      expect(patch).toBeDefined();
      for (const id of ['B', "C'", 'D']) {
        const pt = scene.points.find((p) => p.id === id)!;
        expect(insideQuad(pt, patch!.corners), `${id} inside the BC'D patch`).toBe(true);
      }
    });
  }

  it('4 non-coplanar points are refused — never a best-fit patch that lies', () => {
    submit('קובייה ABCD');
    submit("מישור ABCA'"); // A,B,C span z=0; A' is at z=1 — not one plane
    expect(state().facts).toHaveLength(1);
    expect(state().lastError).toEqual({ code: 'not-coplanar', id: "ABCA'" });
  });

  it('3 collinear points do not determine a plane — refused', () => {
    submit('קובייה ABCD');
    submit('M אמצע AB');
    submit('מישור ABM');
    expect(state().facts).toHaveLength(2);
    expect(state().lastError).toEqual({ code: 'not-coplanar', id: 'ABM' });
  });
});

describe('a NEW point named onto a plane rides it (free, resampled, on-plane)', () => {
  beforeEach(reset);

  it("E על המישור BC'D: created ON the plane, +2 free DOF, resample slides it in-plane", () => {
    submit('קובייה ABCD');
    const dofBefore = freeDofCount3(derived().construction, derived().resolved);
    submit("E על המישור BC'D");
    expectAllOk();
    const d0 = derived();
    expect(freeDofCount3(d0.construction, d0.resolved)).toBe(dofBefore + 2);
    const onPlane = (d: ReturnType<typeof derive3>) => {
      const pl = d.resolved.planes.get("BC'D")!;
      const p = d.positions.get('E')!;
      return Math.abs(dot3(pl.n, p) + pl.d) / norm3(pl.n);
    };
    expect(onPlane(d0)).toBeLessThan(1e-9);
    const e0 = d0.positions.get('E')!;
    useGeo3.getState().resample();
    const d1 = derived();
    expect(onPlane(d1)).toBeLessThan(1e-9); // still ON the plane…
    const e1 = d1.positions.get('E')!;
    expect(Math.hypot(e1.x - e0.x, e1.y - e0.y, e1.z - e0.z)).toBeGreaterThan(1e-3); // …somewhere else
    expectAllOk();
  });

  it('stability: adding a later fact never moves E', () => {
    submit('קובייה ABCD');
    submit("E על המישור BC'D");
    const before = derived().positions.get('E')!;
    submit('M אמצע AB');
    expectAllOk();
    const after = derived().positions.get('E')!;
    expect(after).toEqual(before);
  });
});

describe('above / below a plane (מעל / מתחת)', () => {
  beforeEach(reset);

  for (const [name, cube, above, below] of [
    ['Hebrew', 'קובייה ABCD', 'F מעל המישור ABCD', 'G מתחת למישור ABCD'],
    ['English', 'cube ABCD', 'F is above plane ABCD', 'G is below plane ABCD'],
  ] as const) {
    it(`${name}: new points land on the stated side of the base and survive resample`, () => {
      submit(cube);
      submit(above);
      submit(below);
      expectAllOk();
      const d = derived();
      expect(d.positions.get('F')!.z).toBeGreaterThan(1e-9); // base ABCD is z=0, above = +z
      expect(d.positions.get('G')!.z).toBeLessThan(-1e-9);
      useGeo3.getState().resample();
      expectAllOk();
      const d1 = derived();
      expect(d1.positions.get('F')!.z).toBeGreaterThan(1e-9);
      expect(d1.positions.get('G')!.z).toBeLessThan(-1e-9);
    });
  }

  it("an EXISTING point is a verified given: A' above the base holds, below refuses", () => {
    submit('קובייה ABCD');
    submit("A' מעל המישור ABCD");
    expect(state().facts).toHaveLength(2);
    expectAllOk();
    submit("A' מתחת למישור ABCD");
    expect(state().facts).toHaveLength(2); // keep-prior
    expect(state().lastError).toEqual({ code: 'wrong-side-of-plane', id: "A'" });
  });

  it('above/below a VERTICAL plane is meaningless — refused honestly', () => {
    submit('קובייה ABCD');
    submit("E מעל המישור ABB'A'"); // the y=0 face — vertical
    expect(state().facts).toHaveLength(1);
    expect(state().lastError).toEqual({ code: 'plane-side-undefined', id: "ABB'A'" });
  });
});

describe('membership on a point-run plane is a verified given for existing points', () => {
  beforeEach(reset);

  it("B על המישור BC'D holds; A is off it and refuses", () => {
    submit('קובייה ABCD');
    submit("B על המישור BC'D");
    expectAllOk();
    submit("A על המישור BC'D");
    expect(state().facts).toHaveLength(2);
    expect(state().lastError).toEqual({ code: 'not-on-plane', id: 'A' });
  });
});
