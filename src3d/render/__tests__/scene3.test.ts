/**
 * Renderer math tests — pure and DOM-free (docs/20 §9): the camera frame, the
 * hidden-edge classification (the textbook dashed-edge look is V0's headline
 * renderer feature), the viewport fit, and label typography.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../../engine/apply';
import { evaluate3, resolve3 } from '../../engine/evaluate';
import { emptyConstruction3, type Command3, type Construction3 } from '../../engine/types';
import { v3 } from '../../engine/vec3';
import { cameraFrame, HOME_CAMERA, project3 } from '../camera';
import { buildScene3, displayLabel, hiddenEdgeKeys } from '../scene3';

const CUBE_IDS = ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"];

function build(...cmds: Command3[]): Construction3 {
  let c = emptyConstruction3();
  for (const cmd of cmds) {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error('apply failed');
    c = r.next;
  }
  return c;
}

describe('camera', () => {
  it('yaw 0 / pitch 0 looks down the x axis: right = +y, up = +z', () => {
    const f = cameraFrame({ yaw: 0, pitch: 0 });
    expect(f.eye.x).toBeCloseTo(1, 12);
    expect(f.right.y).toBeCloseTo(1, 12);
    expect(f.up.z).toBeCloseTo(1, 12);
    const q = project3(v3(0, 2, 3), f);
    expect(q.x).toBeCloseTo(2, 12);
    expect(q.y).toBeCloseTo(3, 12);
    expect(q.depth).toBeCloseTo(0, 12);
  });

  it('depth grows toward the camera', () => {
    const f = cameraFrame(HOME_CAMERA);
    const near = project3(v3(f.eye.x, f.eye.y, f.eye.z), f).depth;
    const far = project3(v3(-f.eye.x, -f.eye.y, -f.eye.z), f).depth;
    expect(near).toBeGreaterThan(far);
  });
});

describe('hidden-edge classification (cube at the home camera)', () => {
  it('exactly the 3 edges meeting at the farthest vertex are hidden — the textbook look', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    const pos = evaluate3(c, 0);
    const hidden = hiddenEdgeKeys(c, pos, HOME_CAMERA);
    // home camera (yaw −60°, pitch 20°) → D = (0,1,0) is the far vertex
    expect(hidden).toEqual(new Set(['A|D', 'C|D', "D|D'"]));
  });

  it('every edge is hidden from SOME orbit angle, none from all (sanity sweep)', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    const pos = evaluate3(c, 0);
    const everHidden = new Set<string>();
    const alwaysHidden = new Map<string, boolean>();
    for (let i = 0; i < 12; i++) {
      const cam = { yaw: (i * Math.PI) / 6 + 0.13, pitch: i % 2 ? 0.35 : -0.35 };
      const hidden = hiddenEdgeKeys(c, pos, cam);
      expect(hidden.size).toBe(3); // generic view of a cube: always exactly 3 hidden edges
      hidden.forEach((k) => everHidden.add(k));
      for (const [a, b] of c.solids[0].edges) {
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        alwaysHidden.set(k, (alwaysHidden.get(k) ?? true) && hidden.has(k));
      }
    }
    expect(everHidden.size).toBe(12);
    expect([...alwaysHidden.values()].every((v) => !v)).toBe(true);
  });
});

describe('buildScene3', () => {
  const viewport = { width: 640, height: 460 };

  it('cube → 8 labelled points + 12 edges (3 dashed), all inside the viewport', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    expect(scene.points).toHaveLength(8);
    expect(scene.edges).toHaveLength(12);
    expect(scene.edges.filter((e) => e.hidden)).toHaveLength(3);
    for (const p of scene.points) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(viewport.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(viewport.height);
    }
  });

  it('dashed edges are emitted FIRST so solid edges paint over them at crossings', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    const firstSolid = scene.edges.findIndex((e) => !e.hidden);
    expect(scene.edges.slice(0, firstSolid).every((e) => e.hidden)).toBe(true);
    expect(scene.edges.slice(firstSolid).every((e) => !e.hidden)).toBe(true);
  });

  it('an on-segment point appears with its label', () => {
    const c = build(
      { type: 'solid', kind: 'cube', ids: CUBE_IDS },
      { type: 'point-on-segment3', id: 'M', a: 'B', b: "B'", t: 0.5 },
    );
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    expect(scene.points.map((p) => p.id)).toContain('M');
  });

  it('auxiliary segments: interior diagonal + hidden-face diagonal dashed, front-face diagonal solid (2023 cube)', () => {
    const c = build(
      { type: 'solid', kind: 'cube', ids: CUBE_IDS },
      { type: 'segment3', a: 'C', b: "A'" }, // space diagonal — interior
      { type: 'segment3', a: 'B', b: 'D' }, // bottom-face diagonal — hidden face at home
      { type: 'segment3', a: 'B', b: "C'" }, // front-face diagonal — visible at home
    );
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    const byId = new Map(scene.edges.map((e) => [e.id, e.hidden]));
    expect(byId.get("seg-A'|C")).toBe(true);
    expect(byId.get('seg-B|D')).toBe(true);
    expect(byId.get("seg-B|C'")).toBe(false);
  });

  it('named vectors: tail at `from`, ARROWHEAD AT the `to` point, label beside the midpoint (ADR-3D-003 Am.)', () => {
    const c = build(
      { type: 'solid', kind: 'cube', ids: CUBE_IDS },
      { type: 'name-vector', name: 'u', from: 'A', to: 'B' },
      { type: 'name-vector', name: 'w', from: 'A', to: "A'" },
    );
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    expect(scene.vectors.map((v) => v.name).sort()).toEqual(['u', 'w']);
    const w = scene.vectors.find((v) => v.name === 'w')!;
    const a = scene.points.find((p) => p.id === 'A')!;
    const a2 = scene.points.find((p) => p.id === "A'")!;
    // for w = AA′: the overlay runs A → A′ and its HEAD coordinates ARE A′'s
    expect({ x: w.x1, y: w.y1 }).toEqual({ x: a.x, y: a.y });
    expect({ x: w.x2, y: w.y2 }).toEqual({ x: a2.x, y: a2.y });
    // the arrowhead's rotation points from tail to head
    const dir = { x: Math.cos((w.angleDeg * Math.PI) / 180), y: Math.sin((w.angleDeg * Math.PI) / 180) };
    expect(dir.x * (a2.x - a.x) + dir.y * (a2.y - a.y)).toBeGreaterThan(0);
    // AA' is a VISIBLE edge at the home camera → the coloured overlay stays solid
    expect(w.hidden).toBe(false);
    // label inside the viewport
    expect(w.labelX).toBeGreaterThan(0);
    expect(w.labelY).toBeGreaterThan(0);
  });

  it('a named vector riding a hidden carrier dashes its overlay too (depth cue kept)', () => {
    const c = build(
      { type: 'solid', kind: 'cube', ids: CUBE_IDS },
      { type: 'segment3', a: 'C', b: "A'" },
      { type: 'name-vector', name: 'q', from: 'C', to: "A'" }, // the interior space diagonal
    );
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    expect(scene.vectors.find((v) => v.name === 'q')!.hidden).toBe(true);
  });

  it('the algebraic overlay (2022 chain): 3 axes, 2 plane patches, ℓ echoed in parametric form, 2 ⟂ marks', () => {
    const e = (k: number, p = 0) => ({ k, p });
    const c = build(
      { type: 'plane3', name: 'π1', plane: { cx: e(0), cy: e(0), cz: e(1), d: e(-3), src: 'z - 3 = 0' } },
      { type: 'plane3', name: 'π2', plane: { cx: e(0), cy: e(0, 1), cz: e(1), d: e(-8), src: 'ay + z - 8 = 0' }, param: 'a' },
      { type: 'plane-angle', p1: 'π1', p2: 'π2', deg: 45 },
      { type: 'point3', id: 'A', x: 2, y: -2, z: 6 },
      { type: 'on-planes', id: 'A', plane: 'any' },
      { type: 'foot-on-plane', id: 'B', from: 'A', plane: 'π1' },
      { type: 'plane-plane-line', name: 'ℓ', p1: 'π1', p2: 'π2' },
      { type: 'foot-on-line', id: 'C', from: 'B', line: 'ℓ' },
    );
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    expect(scene.axes.map((a) => a.axis)).toEqual(['x', 'y', 'z']);
    expect(scene.planes.map((p) => p.name)).toEqual(['π1', 'π2']);
    expect(scene.planes.every((p) => p.corners.length === 4)).toBe(true);
    expect(scene.lines).toHaveLength(1);
    expect(scene.lines[0].form).toBe('ℓ: x = (0, -5, 3) + t·(1, 0, 0)');
    expect(scene.marks).toHaveLength(2); // the ⟂ knees at B and at C
    expect(scene.seams).toHaveLength(0); // ℓ is NAMED — the drawn line replaces the implicit seam
    expect(scene.angles).toHaveLength(1); // the stated 45° dihedral arc
    expect(scene.angles[0].text).toBe('45°');
    // everything sits inside the viewport (the fit includes the overlay)
    for (const p of scene.planes.flatMap((pl) => pl.corners)) {
      expect(p.x).toBeGreaterThan(-1);
      expect(p.x).toBeLessThan(viewport.width + 1);
      expect(p.y).toBeGreaterThan(-1);
      expect(p.y).toBeLessThan(viewport.height + 1);
    }
    // a lane-G figure gets NO overlay
    const cube = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    const gScene = buildScene3(cube, resolve3(cube, 0), HOME_CAMERA, viewport);
    expect(gScene.axes).toHaveLength(0);
    expect(gScene.planes).toHaveLength(0);
  });

  it('a plane\'s patch COVERS every point lying on it (A on π2; the feet B, C on π1)', () => {
    const e = (k: number, p = 0) => ({ k, p });
    const c = build(
      { type: 'plane3', name: 'π1', plane: { cx: e(0), cy: e(0), cz: e(1), d: e(-3), src: 'z - 3 = 0' } },
      { type: 'plane3', name: 'π2', plane: { cx: e(0), cy: e(0, 1), cz: e(1), d: e(-8), src: 'ay + z - 8 = 0' }, param: 'a' },
      { type: 'plane-angle', p1: 'π1', p2: 'π2', deg: 45 },
      { type: 'point3', id: 'A', x: 2, y: -2, z: 6 },
      { type: 'on-planes', id: 'A', plane: 'any' },
      { type: 'foot-on-plane', id: 'B', from: 'A', plane: 'π1' },
      { type: 'plane-plane-line', name: 'ℓ', p1: 'π1', p2: 'π2' },
      { type: 'foot-on-line', id: 'C', from: 'B', line: 'ℓ' },
    );
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    const insideQuad = (pt: { x: number; y: number }, quad: { x: number; y: number }[]): boolean => {
      let sign = 0;
      for (let i = 0; i < 4; i++) {
        const a = quad[i];
        const b = quad[(i + 1) % 4];
        const cr = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
        if (Math.abs(cr) < 1e-9) continue;
        if (sign === 0) sign = Math.sign(cr);
        else if (Math.sign(cr) !== sign) return false;
      }
      return true;
    };
    const patch = (name: string) => scene.planes.find((p) => p.name === name)!.corners;
    const point = (id: string) => scene.points.find((p) => p.id === id)!;
    expect(insideQuad(point('A'), patch('π2'))).toBe(true); // A lies on π2 (a = −1) — the patch must reach it
    expect(insideQuad(point('B'), patch('π1'))).toBe(true);
    expect(insideQuad(point('C'), patch('π1'))).toBe(true);
    expect(insideQuad(point('C'), patch('π2'))).toBe(true); // C is on ℓ — on BOTH planes
    expect(insideQuad(point('A'), patch('π1'))).toBe(false); // and A is NOT on π1 — no blind inflation
  });

  it('intersecting planes VISIBLY cross: shared patch focus on the fold, an implicit seam, the stated angle arc (the operator screenshot state)', () => {
    const e = (k: number, p = 0) => ({ k, p });
    // exactly the reported state: two planes + the 45° given, NO named ℓ, NO points yet
    const c = build(
      { type: 'plane3', name: 'π1', plane: { cx: e(0), cy: e(0), cz: e(1), d: e(-3), src: 'z - 3 = 0' } },
      { type: 'plane3', name: 'π2', plane: { cx: e(0), cy: e(0, 1), cz: e(1), d: e(-8), src: 'ay + z - 8 = 0' }, param: 'a' },
      { type: 'plane-angle', p1: 'π1', p2: 'π2', deg: 45 },
    );
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    // both patches are centred on the SAME focus point on the fold — the crossing is guaranteed on screen
    const centerOf = (corners: { x: number; y: number }[]) => ({
      x: corners.reduce((s, p) => s + p.x, 0) / corners.length,
      y: corners.reduce((s, p) => s + p.y, 0) / corners.length,
    });
    const c1 = centerOf(scene.planes[0].corners);
    const c2 = centerOf(scene.planes[1].corners);
    expect(c1.x).toBeCloseTo(c2.x, 6);
    expect(c1.y).toBeCloseTo(c2.y, 6);
    // the fold is drawn even though ℓ was never named
    expect(scene.seams).toHaveLength(1);
    // and the stated 45° is marked with an arc + value at the seam
    expect(scene.angles).toHaveLength(1);
    expect(scene.angles[0].text).toBe('45°');
    expect(scene.angles[0].pts.length).toBeGreaterThan(8);
  });

  it('labels render the prime typographically: A′ not A\'', () => {
    expect(displayLabel("A'")).toBe('A′');
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    expect(scene.points.map((p) => p.label)).toContain('D′');
  });
});
