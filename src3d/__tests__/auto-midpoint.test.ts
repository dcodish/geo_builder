/**
 * #225 (ADR-3D-048): the UN-named midpoint — `אמצע BB'` on a cube (prod session t0n3ktkt)
 * creates an auto-labeled midpoint of the edge, the 3-D mirror of the 2-D #184 rule.
 * The label is picked at APPLY (parse3 is context-free): first free letter, M preferred.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);
type V = { x: number; y: number; z: number };
const dist = (p: V, q: V) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

describe('ADR-3D-048 — un-named אמצע (auto-labeled midpoint)', () => {
  beforeEach(reset);

  it("parses to midpoint-auto (He + En)", () => {
    expect(parse3("אמצע BB'")).toMatchObject({ ok: true, commands: [{ type: 'midpoint-auto', a: 'B', b: "B'" }] });
    expect(parse3("midpoint of BB'")).toMatchObject({ ok: true, commands: [{ type: 'midpoint-auto', a: 'B', b: "B'" }] });
  });

  it('the exact prod sequence: cube then «אמצע BB\'» — M lands at the edge midpoint', () => {
    submit('קובייה ABCD');
    submit("אמצע BB'");
    expect(state().lastError).toBeNull();
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    const pos = d.positions;
    expect(pos.get('M')).toBeDefined(); // first free letter, M preferred
    expect(dist(pos.get('M')!, pos.get('B')!)).toBeCloseTo(dist(pos.get('M')!, pos.get("B'")!), 9);
  });

  it('a taken M falls through to the next free letter', () => {
    submit('קובייה ABCD');
    submit("M אמצע AA'"); // the NAMED form claims M first
    submit("אמצע BB'");
    expect(state().lastError).toBeNull();
    const d = derived();
    const pos = d.positions;
    expect(pos.get('N')).toBeDefined(); // M taken → N
    expect(dist(pos.get('N')!, pos.get('B')!)).toBeCloseTo(dist(pos.get('N')!, pos.get("B'")!), 9);
  });

  it('the NAMED form is byte-unchanged', () => {
    expect(parse3("M אמצע BB'")).toMatchObject({ ok: true, commands: [{ type: 'point-on-segment3', id: 'M', a: 'B', b: "B'", t: 0.5 }] });
  });

  it('unknown endpoints refuse honestly', () => {
    submit('קובייה ABCD');
    submit('אמצע XY');
    expect(state().lastError).toMatchObject({ code: 'unknown-point' });
  });
});
