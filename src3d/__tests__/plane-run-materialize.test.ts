/**
 * #584 (ADR-3D-148) — a statement that references an EXPLICIT point-run plane materialises it:
 * the run lands in `pointPlanes`, so the renderer draws its patch (fold/extent/seam logic) and the
 * fact row carries the full/face/hidden display cycle — whatever command shape carried the
 * reference. The rule existed since #383/ADR-3D-109 but lived as a per-case copied block, and the
 * CLAIM carriers (plane-eq, coord-plane-rel, line-plane-angle) were missed — the operator found it
 * playing round #582: «המישור ABS: x=0» drew no plane and offered no toggle.
 *
 * Boundary kept deliberately: the bare «הבסיס» coord-frame form names no plane (the solid's base is
 * already visible as its face), and seg-plane-rel stays ring-edges-only per #380.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { applyCommand3 } from '../engine/apply';
import { emptyConstruction3, type Construction3 } from '../engine/types';
import { parse3 } from '../parser/parse3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);

describe('#584 — the operator chain: «המישור ABS: x=0» materialises the ABS plane', () => {
  beforeEach(reset);

  it('the exact play chain builds green, the run lands in pointPlanes, the patch resolves', () => {
    [
      'פירמידה ABCDS שבסיסה ריבוע',
      'המקצוע AS הוא גובה בפירמידה',
      'נסמן: AD = u, AB = v, AS = w',
      'נתון: A(0,0,0), B(0,12,0)',
      'המישור ABS: x=0',
    ].forEach(submit);
    expect(state().lastError).toBeNull();
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(d.construction.pointPlanes.get('ABS')).toEqual(['A', 'B', 'S']);
    expect(d.resolved.planes.has('ABS'), 'the patch has a resolved plane to draw').toBe(true);
  });

  it('idempotent beside an existing «המישור ABS» plane-through — one entry, everything green', () => {
    ['פירמידה ABCDS שבסיסה ריבוע', 'המישור ABS', 'נתון: A(0,0,0), B(0,12,0)', 'המישור ABS: x=0'].forEach(submit);
    expect(state().lastError).toBeNull();
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    expect(d.construction.pointPlanes.get('ABS')).toEqual(['A', 'B', 'S']);
  });
});

describe('#584 — the class: every explicit-run carrier materialises', () => {
  beforeEach(reset);

  it('coord-plane-rel: «המישור ABC מקביל למישור xy»', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    submit('המישור ABC מקביל למישור xy');
    expect(state().lastError).toBeNull();
    expect(derived().construction.pointPlanes.get('ABC')).toEqual(['A', 'B', 'C']);
  });

  it('line-plane-angle: «הזווית בין הישר SA למישור ABC היא 30»', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    submit('הזווית בין הישר SA למישור ABC היא 30');
    expect(state().lastError).toBeNull();
    expect(derived().construction.pointPlanes.get('ABC')).toEqual(['A', 'B', 'C']);
  });

  it('the bare «הבסיס» coord-frame form stays UN-materialised (it names no plane)', () => {
    const p = parse3('פירמידה ABCD');
    expect(p.ok).toBe(true);
    let c: Construction3 = emptyConstruction3();
    if (p.ok) for (const cmd of p.commands) { const r = applyCommand3(c, cmd); if (r.ok) c = r.next; }
    const r = applyCommand3(c, { type: 'coord-plane-rel', ids: [], axis: 'z', mode: 'share' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.next.pointPlanes.size, 'no plane materialised for the bare base').toBe(0);
  });
});
