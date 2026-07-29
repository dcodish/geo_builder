/**
 * #397 + #395 (ADR-3D-108): the stated-distance WITNESS (the closest-point segment, its
 * value, its knee) and the 'hidden' plane display. Scene-level and DOM-free.
 * #398's tokenizer/notation fixes are locked in vecmath.test.tsx / notation.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../../engine/apply';
import { distanceBetween, distanceWitness, type OperandGeom } from '../../engine/operands';
import { resolve3 } from '../../engine/evaluate';
import { emptyConstruction3, type Command3, type Construction3 } from '../../engine/types';
import { dist3, v3 } from '../../engine/vec3';
import { HOME_CAMERA } from '../camera';
import { buildScene3 } from '../scene3';

const viewport = { width: 640, height: 460 };

function build(...cmds: Command3[]): Construction3 {
  let c = emptyConstruction3();
  for (const cmd of cmds) {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(`apply failed: ${JSON.stringify(r.error)}`);
    c = r.next;
  }
  return c;
}

describe('#397 — distanceWitness realises distanceBetween on every curriculum case', () => {
  const cases: [string, OperandGeom, OperandGeom][] = [
    ['point × plane', { point: v3(1, 2, 5) }, { normal: v3(0, 0, 2), d: -2 }],
    ['point × line', { point: v3(3, 4, 0) }, { point: v3(0, 0, 0), dir: v3(1, 0, 0) }],
    ['skew lines', { point: v3(0, 0, 0), dir: v3(1, 0, 0) }, { point: v3(0, 2, 3), dir: v3(0, 1, 1) }],
    ['parallel planes', { point: v3(0, 0, 0), normal: v3(0, 0, 1), d: 0 }, { normal: v3(0, 0, 3), d: -12 }],
    ['parallel lines', { point: v3(0, 0, 0), dir: v3(1, 0, 0) }, { point: v3(0, 5, 0), dir: v3(2, 0, 0) }],
  ];
  for (const [name, a, b] of cases) {
    it(name, () => {
      const w = distanceWitness(a, b);
      const d = distanceBetween(a, b);
      expect(w, 'a witness exists where a gap exists').not.toBeNull();
      expect(d).not.toBeNull();
      expect(dist3(w![0], w![1]), '|witness| = the distance itself').toBeCloseTo(d!, 9);
    });
  }
  it('met objects have no witness (a crossing line × plane)', () => {
    expect(distanceWitness({ point: v3(0, 0, 0), dir: v3(0, 0, 1) }, { normal: v3(0, 0, 1), d: -4 })).toBeNull();
  });
});

describe('#397 — the scene draws the witness (and only when shown)', () => {
  const withDistance = (): Construction3 =>
    build(
      { type: 'solid', kind: 'tetra', ids: ['A', 'B', 'C', 'D'] } as Command3,
      { type: 'distance-rel', a: { kind: 'point', id: 'D' }, b: { kind: 'plane-run', ids: ['A', 'B', 'C'] }, value: 6 } as Command3,
    );

  it('one dashed witness carrying the stated value, plus a knee at the foot', () => {
    const c = withDistance();
    const resolved = resolve3(c, 0);
    const scene = buildScene3(c, resolved, HOME_CAMERA, viewport, 1, {});
    expect(scene.witnesses).toHaveLength(1);
    expect(scene.witnesses[0].text).toBe('6');
    const off = buildScene3(c, resolved, HOME_CAMERA, viewport, 1, {}, false);
    expect(off.witnesses).toHaveLength(0);
    // the ⟂ knee at the foot rides the standard marks pipeline
    expect(scene.marks.length).toBeGreaterThan(off.marks.length);
  });
});

describe('#395 — a hidden plane draws no patch and no seam', () => {
  const twoPlanes = (): Construction3 =>
    build(
      { type: 'solid', kind: 'tetra', ids: ['A', 'B', 'C', 'D'] } as Command3,
      { type: 'plane-through', name: 'ABC', ids: ['A', 'B', 'C'] } as Command3,
      { type: 'plane-through', name: 'ABD', ids: ['A', 'B', 'D'] } as Command3,
    );

  it('default: both patches + their fold seam; hidden: the patch and its seams disappear', () => {
    const c = twoPlanes();
    const resolved = resolve3(c, 0);
    const full = buildScene3(c, resolved, HOME_CAMERA, viewport, 1, {});
    expect(full.planes.map((p) => p.name).sort()).toEqual(['ABC', 'ABD']);
    expect(full.seams.length).toBeGreaterThan(0);
    const hid = buildScene3(c, resolved, HOME_CAMERA, viewport, 1, { ABC: 'hidden' });
    expect(hid.planes.map((p) => p.name)).toEqual(['ABD']);
    expect(hid.seams).toHaveLength(0); // the only pair involved the hidden plane
  });
});
