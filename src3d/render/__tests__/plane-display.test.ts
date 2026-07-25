/**
 * #318 — per-plane patch display: 'full' (the default) keeps the growing,
 * fold-anchored patch that covers every on-plane point (ADR-3D-004 Am.2 /
 * ADR-3D-015); 'face' draws a point-run plane's patch as EXACTLY its defining
 * polygon (the triangle/quad itself), nothing more. Scene-level and DOM-free,
 * following scene3.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../../engine/apply';
import { resolve3 } from '../../engine/evaluate';
import { emptyConstruction3, type Command3, type Construction3 } from '../../engine/types';
import { HOME_CAMERA } from '../camera';
import { buildScene3 } from '../scene3';

const CUBE_IDS = ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"];
const viewport = { width: 640, height: 460 };

function build(...cmds: Command3[]): Construction3 {
  let c = emptyConstruction3();
  for (const cmd of cmds) {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error('apply failed');
    c = r.next;
  }
  return c;
}

type Pt = { x: number; y: number };

/** Shoelace area of a screen polygon. */
const area = (poly: Pt[]): number =>
  Math.abs(poly.reduce((s, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return s + p.x * q.y - q.x * p.y;
  }, 0)) / 2;

/** Strict point-in-convex-polygon by sign consistency (the scene3.test.ts pattern). */
const inside = (pt: Pt, poly: Pt[]): boolean => {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cr = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
    if (Math.abs(cr) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cr);
    else if (Math.sign(cr) !== sign) return false;
  }
  return true;
};

describe('plane patch display (#318)', () => {
  const base = () =>
    build(
      { type: 'solid', kind: 'cube', ids: CUBE_IDS },
      { type: 'plane-through', name: 'ABC', ids: ['A', 'B', 'C'] },
    );

  it("'full' (default): the patch GROWS beyond the defining triangle and covers the 4th coplanar point", () => {
    const c = base();
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    const patch = scene.planes.find((p) => p.name === 'ABC')!;
    expect(patch.corners).toHaveLength(4); // the growing frame is always a quad
    const tri = ['A', 'B', 'C'].map((id) => scene.points.find((p) => p.id === id)!);
    expect(area(patch.corners)).toBeGreaterThan(area(tri) * 1.5);
    // D is coplanar with ABC (the cube base) — the full patch must reach it (ADR-3D-015)
    const d = scene.points.find((p) => p.id === 'D')!;
    expect(inside(d, patch.corners)).toBe(true);
  });

  it("'face': the patch corners ARE the defining points' projections, in order — nothing more", () => {
    const c = base();
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport, 1, { ABC: 'face' });
    const patch = scene.planes.find((p) => p.name === 'ABC')!;
    expect(patch.corners).toHaveLength(3);
    ['A', 'B', 'C'].forEach((id, i) => {
      const pt = scene.points.find((p) => p.id === id)!;
      expect(patch.corners[i].x).toBeCloseTo(pt.x, 9);
      expect(patch.corners[i].y).toBeCloseTo(pt.y, 9);
    });
    // the coplanar D is NOT covered — the face is the stated triangle only
    const d = scene.points.find((p) => p.id === 'D')!;
    expect(inside(d, patch.corners)).toBe(false);
    // the name label sits at the face's centroid (its corners are labelled vertices)
    expect(patch.labelX).toBeCloseTo((patch.corners[0].x + patch.corners[1].x + patch.corners[2].x) / 3, 9);
    expect(patch.labelY).toBeCloseTo((patch.corners[0].y + patch.corners[1].y + patch.corners[2].y) / 3, 9);
  });

  it("a 4-point face keeps the stated ring order (ABB'A')", () => {
    const c = build(
      { type: 'solid', kind: 'cube', ids: CUBE_IDS },
      { type: 'plane-through', name: "ABB'A'", ids: ['A', 'B', "B'", "A'"] },
    );
    const scene = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport, 1, { "ABB'A'": 'face' });
    const patch = scene.planes.find((p) => p.name === "ABB'A'")!;
    expect(patch.corners).toHaveLength(4);
    ['A', 'B', "B'", "A'"].forEach((id, i) => {
      const pt = scene.points.find((p) => p.id === id)!;
      expect(patch.corners[i].x).toBeCloseTo(pt.x, 9);
      expect(patch.corners[i].y).toBeCloseTo(pt.y, 9);
    });
  });

  it("an equation plane has no face — 'face' falls back to the full patch unchanged", () => {
    const e = (k: number, p = 0) => ({ k, p });
    const c = build(
      { type: 'plane3', name: 'π1', plane: { cx: e(0), cy: e(0), cz: e(1), d: e(-3), src: 'z - 3 = 0' } },
      { type: 'point3', id: 'A', x: 2, y: -2, z: 3 },
    );
    const plain = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    const forced = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport, 1, { π1: 'face' });
    expect(forced.planes).toEqual(plain.planes);
  });

  it("'full' output is byte-identical whether planeDisplay is omitted or empty (regression)", () => {
    const c = base();
    const a = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport);
    const b = buildScene3(c, resolve3(c, 0), HOME_CAMERA, viewport, 1, {});
    expect(b).toEqual(a);
  });
});
