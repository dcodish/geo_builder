/**
 * #1485 — «when we say פאה and בסיס and give letters, only the area of those letters should be
 * colored» (ADR-3D-278, operator ruling 2026-09-27, option A): a plane FIRST named as a face or base
 * draws as its face polygon by default; «המישור» keeps the full default; the panel toggle still
 * switches either way, and the choice survives undo and save/load.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { deserializeFigure3, serializeFigure3 } from '../store/figureFile3';
import { readOperand } from '../parser/operandToken';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, planeDisplay: {} });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

/** Corner count of each drawn plane patch, as the student sees it (3 = the triangular face). */
function drawn(): Record<string, number> {
  const st = state();
  const d = derive3(st.facts, st.seed);
  const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1, st.planeDisplay);
  return Object.fromEntries(scene.planes.map((p) => [p.name, p.corners.length]));
}

beforeEach(reset);

describe('#1485 — the noun sets the default', () => {
  it('his sentence: «הפאה SBC» and «הבסיס ABC» draw as their triangles', () => {
    submit('פירמידה SABC');
    submit('הזווית בין הפאה SBC לבסיס ABC היא 60');
    expect(state().lastError).toBeNull();
    const p = drawn();
    expect(p.SBC).toBe(3);
    expect(p.ABC).toBe(3);
  });

  it('«המישור» keeps the full patch, as today', () => {
    submit('פירמידה SABC');
    submit('הזווית בין המישור SBC למישור ABC היא 60');
    expect(state().lastError).toBeNull();
    const p = drawn();
    expect(p.SBC).toBeGreaterThan(3);
    expect(p.ABC).toBeGreaterThan(3);
  });

  it('English face/base carry the same flag; plane does not', () => {
    expect(readOperand('the face SBC')?.op).toEqual({ kind: 'plane-run', ids: ['S', 'B', 'C'], face: true });
    expect(readOperand('base ABC')?.op).toEqual({ kind: 'plane-run', ids: ['A', 'B', 'C'], face: true });
    expect(readOperand('the plane SBC')?.op).toEqual({ kind: 'plane-run', ids: ['S', 'B', 'C'] });
    expect(readOperand('SBC')?.op).toEqual({ kind: 'plane-run', ids: ['S', 'B', 'C'] });
  });

  it('the first mention decides: «מישור SBC» first stays full; the base named after it is a face', () => {
    submit('פירמידה SABC');
    submit('מישור SBC');
    submit('הזווית בין הפאה SBC לבסיס ABC היא 60');
    const p = drawn();
    expect(p.SBC).toBeGreaterThan(3);
    expect(p.ABC).toBe(3);
  });
});

describe('#1485 — the noun is display, never identity', () => {
  it('«המישור SBC…» after «הפאה SBC…» is the SAME statement: already stated, no second fact', () => {
    submit('פירמידה SABC');
    submit('הזווית בין הפאה SBC לבסיס ABC היא 60');
    submit('הזווית בין המישור SBC למישור ABC היא 60');
    expect(state().facts).toHaveLength(2);
    expect(state().lastNotice).toMatchObject({ code: 'already-stated' });
  });
});

describe('#1485 — the toggle still switches, from the plane’s own default', () => {
  it('face → hidden → full → face, the key deleted on returning to the default; undo and save/load keep the choice', () => {
    submit('פירמידה SABC');
    submit('הזווית בין הפאה SBC לבסיס ABC היא 60');
    const toggle = () => state().togglePlaneDisplay('SBC');

    toggle();
    expect(state().planeDisplay.SBC).toBe('hidden');
    expect(drawn().SBC).toBeUndefined();
    toggle();
    expect(state().planeDisplay.SBC).toBe('full');
    expect(drawn().SBC).toBeGreaterThan(3);

    // save/load carries the explicit 'full' on a face-default plane
    const st = state();
    const r = deserializeFigure3(serializeFigure3(st.facts, st.seed, undefined, st.queries, st.planeDisplay));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.planeDisplay).toEqual({ SBC: 'full' });

    toggle();
    expect(state().planeDisplay.SBC).toBeUndefined(); // back to its default — the face
    expect(drawn().SBC).toBe(3);

    useGeo3.temporal.getState().undo();
    expect(state().planeDisplay.SBC).toBe('full');
  });
});
