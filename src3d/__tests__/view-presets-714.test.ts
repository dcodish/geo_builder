/**
 * #714 — named view presets: the ALIGN half that orbit does not give.
 *
 * Operator (2026-08-17): *"2-D has the rotate and align options. 3-D doesn't — maybe it should."*
 * docs/28 §4a D7 recorded the viewport controls as differing BY NATURE (2-D pan/zoom/rotate/flips vs
 * 3-D orbit/pan/zoom/reset, #533) — orbit already gives free rotation; what it does not give is
 * snapping to a canonical orientation, which is what a student reproducing a textbook figure wants.
 *
 * The presets are asserted on the FRAME they produce, not on the numbers they are written as: a
 * preset is only useful if "front" really does look at the xz plane. That also means the test keeps
 * holding if the angles are ever re-expressed.
 */
import { describe, expect, it } from 'vitest';
import { HOME_CAMERA, MAX_PITCH, VIEW_PRESETS, VIEW_PRESET_ORDER, cameraFrame, project3 } from '../render/camera';
import { v3 } from '../engine/vec3';

const X = v3(1, 0, 0);
const Y = v3(0, 1, 0);
const Z = v3(0, 0, 1);
const close = (a: number, b: number, tol = 1e-9): void => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('#714 — each preset is the view it claims to be', () => {
  it('FRONT looks at the xz plane: x runs right, z runs up, y is depth', () => {
    const f = cameraFrame(VIEW_PRESETS.front);
    close(project3(X, f).x, 1); // +x to the right
    close(project3(X, f).y, 0);
    close(project3(Z, f).y, 1); // +z up
    close(project3(Z, f).x, 0);
    close(project3(Y, f).x, 0); // y contributes no screen extent — it IS the viewing direction
    close(project3(Y, f).y, 0);
  });

  it('SIDE looks at the yz plane: y runs right, z runs up, x is depth', () => {
    const f = cameraFrame(VIEW_PRESETS.side);
    close(project3(Y, f).x, 1);
    close(project3(Z, f).y, 1);
    close(project3(X, f).x, 0);
    close(project3(X, f).y, 0);
  });

  it('TOP looks nearly straight down — and stays a VALID frame', () => {
    // Straight down (pitch 90°) degenerates: `right` would be the cross product of two parallel
    // vectors. The preset is clamped to the same MAX_PITCH the UI imposes on dragging, so it is a
    // camera the student could have reached by hand rather than a special case.
    expect(VIEW_PRESETS.top.pitch).toBe(MAX_PITCH);
    const f = cameraFrame(VIEW_PRESETS.top);
    close(f.eye.z, Math.sin(MAX_PITCH));
    expect(f.eye.z, 'looking down from high above').toBeGreaterThan(0.99);
    for (const v of [f.right, f.up, f.eye]) close(Math.hypot(v.x, v.y, v.z), 1, 1e-9); // orthonormal
    // the ground plane is what you see: x and y both carry screen extent, z almost none
    expect(Math.abs(project3(Z, f).x) + Math.abs(project3(Z, f).y)).toBeLessThan(0.1);
  });

  it('ISO is true isometric — all three axes equally foreshortened', () => {
    const f = cameraFrame(VIEW_PRESETS.iso);
    const len = (v: typeof X) => Math.hypot(project3(v, f).x, project3(v, f).y);
    close(len(X), len(Y), 1e-9);
    close(len(Y), len(Z), 1e-9);
    // …which is the property that DEFINES isometric, and is exactly why it is not HOME
    expect(VIEW_PRESETS.iso).not.toEqual(HOME_CAMERA);
  });
});

describe('#714 — the preset set is well-formed', () => {
  it('every preset is offered, exactly once, and none exceeds the orbit clamp', () => {
    expect([...VIEW_PRESET_ORDER].sort()).toEqual(Object.keys(VIEW_PRESETS).sort());
    expect(new Set(VIEW_PRESET_ORDER).size).toBe(VIEW_PRESET_ORDER.length);
    for (const k of VIEW_PRESET_ORDER) {
      expect(Math.abs(VIEW_PRESETS[k].pitch), `${k} within the orbit clamp`).toBeLessThanOrEqual(MAX_PITCH);
    }
  });

  it('the presets are DISTINCT views — a preset that duplicates another is a dead button', () => {
    const frames = VIEW_PRESET_ORDER.map((k) => cameraFrame(VIEW_PRESETS[k]).eye);
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        const dot = frames[i].x * frames[j].x + frames[i].y * frames[j].y + frames[i].z * frames[j].z;
        expect(dot, `${VIEW_PRESET_ORDER[i]} vs ${VIEW_PRESET_ORDER[j]}`).toBeLessThan(0.99);
      }
    }
  });
});
