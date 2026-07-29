/**
 * The 3-D panel bundle (ADR-3D-108): #384 (plane-pair + stated-distance rows in the data
 * panel), #396 (redundancy notice for absolute×absolute relations), #395 (plane display
 * cycle full → face → hidden). All from the operator's PR #390/#391 play session findings.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { deserializeFigure3, serializeFigure3 } from '../store/figureFile3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, planeDisplay: {}, queries: [] });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);
const panel = () => dataView(derived().construction, state().seed);

describe('#384 — the data panel reports plane pairs (stated or holding)', () => {
  beforeEach(reset);

  it("«המישור ABC מקביל למישור A'B'C'» on a box (play test 3) → a parallel row", () => {
    submit("תיבה ABCDA'B'C'D'");
    submit("המישור ABC מקביל למישור A'B'C'");
    expect(state().lastError).toBeNull();
    expect(panel().mutual).toContainEqual({ a: 'ABC', b: "A'B'C'", rel: 'parallel' });
  });

  it('«המישור ABC מאונך למישור ABD» on a tetra (driven, play test 1) → a perpendicular row', () => {
    submit('פירמידה משולשת ABCD');
    submit('המישור ABC מאונך למישור ABD');
    expect(state().lastError).toBeNull();
    expect(panel().mutual).toContainEqual({ a: 'ABC', b: 'ABD', rel: 'perpendicular' });
  });

  it('two GENERIC planes get NO row — plain "intersecting" between planes is noise, not knowledge', () => {
    submit('פירמידה משולשת ABCD');
    submit('מישור ABC');
    submit('מישור ABD');
    expect(state().lastError).toBeNull();
    const rows = panel().mutual.filter((m) => (m.a === 'ABC' && m.b === 'ABD') || (m.a === 'ABD' && m.b === 'ABC'));
    expect(rows).toEqual([]);
  });
});

describe('#384 — the data panel reports stated distances', () => {
  beforeEach(reset);

  it('«המרחק בין D למישור ABC הוא 6» (play test 8) → d(D, ABC) = 6', () => {
    submit('פירמידה משולשת ABCD');
    submit('המרחק בין D למישור ABC הוא 6');
    expect(state().lastError).toBeNull();
    expect(panel().relations).toContain('d(D, ABC) = 6');
  });

  it('«המרחק בין AB לבין CD הוא 3» (skew, play test 10) → d(AB, CD) = 3', () => {
    submit('פירמידה משולשת ABCD');
    submit('המרחק בין AB לבין CD הוא 3');
    expect(state().lastError).toBeNull();
    expect(panel().relations).toContain('d(AB, CD) = 3');
  });
});

describe('#396 — a relation between two ABSOLUTE objects gets the redundancy notice', () => {
  beforeEach(reset);

  it('«π1 ניצב ל-π2» over two equation planes (play test 5) → notice naming both', () => {
    submit('המישור π1: z = 0');
    submit('המישור π2: x = 0');
    submit('π1 ניצב ל-π2');
    expect(state().lastError).toBeNull();
    expect(derived().notices).toContainEqual({ kind: 'redundant-relation', a: 'π1', b: 'π2' });
  });

  it('a relation over FIGURE objects (the verify register) never notices', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit("המישור ABC מקביל למישור A'B'C'");
    expect(state().lastError).toBeNull();
    expect(derived().notices.filter((n) => n.kind === 'redundant-relation')).toEqual([]);
  });

  it('a ⟂ that PINS the figure parameter (the 2024-Q2 shape) never notices — it was information', () => {
    submit('הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)');
    submit('המישור π1: x + y - z = 0');
    submit('הישר ℓ ניצב למישור π1');
    expect(state().lastError).toBeNull();
    expect(derived().notices.filter((n) => n.kind === 'redundant-relation')).toEqual([]);
  });
});

describe('#395 — the plane display cycle + persistence', () => {
  beforeEach(reset);

  it('togglePlaneDisplay cycles full → face → hidden → full (absent)', () => {
    const toggle = () => useGeo3.getState().togglePlaneDisplay('ABC');
    expect(state().planeDisplay['ABC']).toBeUndefined();
    toggle();
    expect(state().planeDisplay['ABC']).toBe('face');
    toggle();
    expect(state().planeDisplay['ABC']).toBe('hidden');
    toggle();
    expect(state().planeDisplay['ABC']).toBeUndefined(); // back to the default, key DELETED
  });

  it("'hidden' round-trips through save/load", () => {
    submit('פירמידה משולשת ABCD');
    submit('מישור ABC');
    useGeo3.getState().togglePlaneDisplay('ABC');
    useGeo3.getState().togglePlaneDisplay('ABC'); // → hidden
    const file = serializeFigure3(state().facts, state().seed, undefined, [], state().planeDisplay);
    const r = deserializeFigure3(file);
    if (!r.ok) throw new Error('load failed');
    expect(r.planeDisplay).toEqual({ ABC: 'hidden' });
  });
});
