/**
 * Renderer math tests — pure and DOM-free (docs/20 §9): the camera frame, the
 * hidden-edge classification (the textbook dashed-edge look is V0's headline
 * renderer feature), the viewport fit, and label typography.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../../engine/apply';
import { evaluate3 } from '../../engine/evaluate';
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
    const scene = buildScene3(c, evaluate3(c, 0), HOME_CAMERA, viewport);
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
    const scene = buildScene3(c, evaluate3(c, 0), HOME_CAMERA, viewport);
    const firstSolid = scene.edges.findIndex((e) => !e.hidden);
    expect(scene.edges.slice(0, firstSolid).every((e) => e.hidden)).toBe(true);
    expect(scene.edges.slice(firstSolid).every((e) => !e.hidden)).toBe(true);
  });

  it('an on-segment point appears with its label', () => {
    const c = build(
      { type: 'solid', kind: 'cube', ids: CUBE_IDS },
      { type: 'point-on-segment3', id: 'M', a: 'B', b: "B'", t: 0.5 },
    );
    const scene = buildScene3(c, evaluate3(c, 0), HOME_CAMERA, viewport);
    expect(scene.points.map((p) => p.id)).toContain('M');
  });

  it('auxiliary segments: interior diagonal + hidden-face diagonal dashed, front-face diagonal solid (2023 cube)', () => {
    const c = build(
      { type: 'solid', kind: 'cube', ids: CUBE_IDS },
      { type: 'segment3', a: 'C', b: "A'" }, // space diagonal — interior
      { type: 'segment3', a: 'B', b: 'D' }, // bottom-face diagonal — hidden face at home
      { type: 'segment3', a: 'B', b: "C'" }, // front-face diagonal — visible at home
    );
    const scene = buildScene3(c, evaluate3(c, 0), HOME_CAMERA, viewport);
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
    const scene = buildScene3(c, evaluate3(c, 0), HOME_CAMERA, viewport);
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
    const scene = buildScene3(c, evaluate3(c, 0), HOME_CAMERA, viewport);
    expect(scene.vectors.find((v) => v.name === 'q')!.hidden).toBe(true);
  });

  it('labels render the prime typographically: A′ not A\'', () => {
    expect(displayLabel("A'")).toBe('A′');
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    const scene = buildScene3(c, evaluate3(c, 0), HOME_CAMERA, viewport);
    expect(scene.points.map((p) => p.label)).toContain('D′');
  });
});
