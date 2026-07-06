/**
 * Store tests: replay-derived figure, keep-prior-on-error, toggle auto-drop
 * (reversible), undo/redo, resample. Mirrors the 2-D phase-3 gate.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dist3 } from '../../engine/vec3';
import { derive3, redo3, undo3, useGeo3 } from '../store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}

const derived = () => {
  const s = useGeo3.getState();
  return derive3(s.facts, s.seed);
};

describe('store3', () => {
  beforeEach(reset);

  it('submit a cube → one fact, eight positioned points', () => {
    useGeo3.getState().submit('קובייה ABCD');
    expect(useGeo3.getState().facts).toHaveLength(1);
    expect(useGeo3.getState().lastError).toBeNull();
    expect(derived().positions.size).toBe(8);
  });

  it('a midpoint fact lands ON the midpoint', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submit("M אמצע BB'");
    const pos = derived().positions;
    expect(dist3(pos.get('M')!, pos.get('B')!)).toBeCloseTo(dist3(pos.get('M')!, pos.get("B'")!), 12);
  });

  it('keep-prior on error: a conflicting fact is NOT added and the error surfaces', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submit('קובייה ABCD');
    expect(useGeo3.getState().facts).toHaveLength(1);
    expect(useGeo3.getState().lastError).toEqual({ code: 'already-defined', id: 'A' });
  });

  it('not-understood input surfaces without touching the facts', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submit('דבר שאיננו נתמך כלל');
    expect(useGeo3.getState().facts).toHaveLength(1);
    expect(useGeo3.getState().lastError).toEqual({ code: 'not-understood' });
  });

  it('toggle off auto-drops dependents (flagged, reversible)', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submit("M אמצע BB'");
    const [cube, mid] = useGeo3.getState().facts;
    useGeo3.getState().toggle(cube.id);
    let d = derived();
    expect(d.status[cube.id]).toBe('disabled');
    expect(d.status[mid.id]).toEqual({ code: 'unknown-point', id: 'B' });
    expect(d.positions.size).toBe(0);
    useGeo3.getState().toggle(cube.id); // reversible
    d = derived();
    expect(d.status[mid.id]).toBe('ok');
    expect(d.positions.size).toBe(9);
  });

  it('remove and clear', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submit("M אמצע BB'");
    useGeo3.getState().remove(useGeo3.getState().facts[1].id);
    expect(useGeo3.getState().facts).toHaveLength(1);
    useGeo3.getState().clear();
    expect(useGeo3.getState().facts).toHaveLength(0);
  });

  it('undo / redo travel the fact list', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submit("M אמצע BB'");
    undo3();
    expect(useGeo3.getState().facts).toHaveLength(1);
    redo3();
    expect(useGeo3.getState().facts).toHaveLength(2);
  });

  it('"show another configuration" resamples free DOFs (box depth changes), stated facts hold', () => {
    useGeo3.getState().submit("תיבה ABCDA'B'C'D'");
    useGeo3.getState().submit("M אמצע BB'");
    const before = derived().positions;
    const depthBefore = dist3(before.get('A')!, before.get('D')!);
    useGeo3.getState().resample();
    const after = derived().positions;
    expect(dist3(after.get('A')!, after.get('D')!)).not.toBeCloseTo(depthBefore, 4);
    // the midpoint given still holds in the new configuration
    expect(dist3(after.get('M')!, after.get('B')!)).toBeCloseTo(dist3(after.get('M')!, after.get("B'")!), 12);
  });
});
