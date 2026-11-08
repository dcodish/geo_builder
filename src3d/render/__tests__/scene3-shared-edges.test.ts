/**
 * #2490 (ADR-3D-434) — the renderer when two solids SHARE vertices: a pyramid bound on a cube's face.
 *
 * A shared edge is one line of ink (never two scene edges with one id), the face both solids carry is inside their
 * union and decides no edge's dashing, and an apex standing INSIDE the cube draws its lateral edges dashed — the
 * cube's body hides them, the textbook convention every solid edge follows.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../../engine/apply';
import { resolve3 } from '../../engine/evaluate';
import { emptyConstruction3, type Command3, type Construction3 } from '../../engine/types';
import { HOME_CAMERA } from '../camera';
import { buildScene3, hiddenEdgeKeys } from '../scene3';

const CUBE: Command3 = { type: 'solid', kind: 'cube', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] };
const PYRAMID: Command3 = { type: 'solid', kind: 'pyramid4gr', ids: ['A', 'B', 'C', 'D', 'S'] };

function build(...cmds: Command3[]): Construction3 {
  let c = emptyConstruction3();
  for (const cmd of cmds) {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    c = r.next;
  }
  return c;
}

/** Is the apex inside the cube at this seed (on the cube's side of the shared face ABCD)? */
const apexInside = (c: Construction3, seed: number): boolean => {
  const p = resolve3(c, seed).positions;
  const [A, S, A1] = [p.get('A')!, p.get('S')!, p.get("A'")!];
  const up = { x: A1.x - A.x, y: A1.y - A.y, z: A1.z - A.z };
  return up.x * (S.x - A.x) + up.y * (S.y - A.y) + up.z * (S.z - A.z) > 0;
};

describe('#2490 — solids that share a face', () => {
  const c = build(CUBE, PYRAMID);

  it('a shared edge is drawn once: 12 cube edges + 4 lateral edges, every id distinct', () => {
    const r = resolve3(c, 0);
    const scene = buildScene3(c, r, HOME_CAMERA, { width: 600, height: 400 });
    const solidEdges = scene.edges.filter((e) => e.id.startsWith('edge-'));
    expect(solidEdges).toHaveLength(16);
    expect(new Set(solidEdges.map((e) => e.id)).size).toBe(16);
  });

  it('an apex inside the cube draws its lateral edges dashed; outside, the face it stands on decides nothing', () => {
    const inside = Array.from({ length: 24 }, (_, s) => s).filter((s) => apexInside(c, s));
    const outside = Array.from({ length: 24 }, (_, s) => s).filter((s) => !apexInside(c, s));
    expect(inside.length).toBeGreaterThan(0);
    expect(outside.length).toBeGreaterThan(0);
    for (const seed of inside) {
      const hidden = hiddenEdgeKeys(c, resolve3(c, seed).positions, HOME_CAMERA);
      for (const v of ['A', 'B', 'C', 'D']) expect(hidden.has(`${v}|S`)).toBe(true);
    }
    // outside: the lone pyramid's own visibility — at least one lateral edge faces the camera from every view
    for (const seed of outside.slice(0, 4)) {
      const hidden = hiddenEdgeKeys(c, resolve3(c, seed).positions, HOME_CAMERA);
      expect(['A', 'B', 'C', 'D'].some((v) => !hidden.has(`${v}|S`))).toBe(true);
    }
  });

  it('is total over a bound apex its degenerate ring left unplaced (the store refuses that line; a preview must not throw)', () => {
    const line = emptyConstruction3();
    line.points.set('A', { kind: 'coord', x: 0, y: 0, z: 0 });
    line.points.set('B', { kind: 'coord', x: 1, y: 0, z: 0 });
    line.points.set('C', { kind: 'coord', x: 2, y: 0, z: 0 });
    const r = applyCommand3(line, { type: 'solid', kind: 'tetra', ids: ['A', 'B', 'C', 'S'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const res = resolve3(r.next, 0);
    expect(res.positions.has('S')).toBe(false);
    expect(() => buildScene3(r.next, res, HOME_CAMERA, { width: 600, height: 400 })).not.toThrow();
  });

  it('solids that share no vertex dash exactly as before (each solid its own faces)', () => {
    const lone = build(CUBE);
    const two = build(CUBE, { type: 'solid', kind: 'pyramid4gr', ids: ['E', 'F', 'G', 'H', 'S'] });
    const cubeKeys = (h: Set<string>) => [...h].filter((k) => !/[EFGHS]/.test(k)).sort();
    for (const seed of [0, 5]) {
      expect(cubeKeys(hiddenEdgeKeys(two, resolve3(two, seed).positions, HOME_CAMERA))).toEqual(
        cubeKeys(hiddenEdgeKeys(lone, resolve3(lone, seed).positions, HOME_CAMERA)),
      );
    }
  });
});
