/**
 * V8-c (ADR-3D-020, G7): a symbolic parameter COUPLED to a free solid dim — the D3
 * greenlit numeric path (the symbol becomes an extra pivot unknown, no CAS). The
 * headline deferred exam: 2022 חורף נבצרים Q2 (rhombus prism, F on plane ACD' with
 * D'F = t·D'A + ¼·D'C, DF ⟂ plane ACD'). Closed form: t = ¼, |DD'| = 2.
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
function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], `${f.utterance} → ${JSON.stringify(d.status[f.id])}`).toBe('ok');
  expect(state().lastError).toBeNull();
}
type V = { x: number; y: number; z: number };
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const dot = (p: V, q: V) => p.x * q.x + p.y * q.y + p.z * q.z;
const cross = (p: V, q: V): V => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x });
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);

describe('V8-c — the D3 coupled-symbol parse + solve', () => {
  it('the vec-rel with a symbol coefficient and a primed base point parses', () => {
    const r = parse3("D'F = tD'A + 1/4 D'C");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands[0].type).toBe('vec-rel');
  });
});

describe('GATE — 2022 חורף נבצרים Q2 (rhombus prism, t coupled to the height)', () => {
  beforeEach(reset);

  const build = () => {
    submit("מנסרה ישרה שבסיסה מעוין ABCDA'B'C'D'");
    submit('נסמן: DA = u, DC = v, DD\' = w');
    submit('D בראשית הצירים');
    submit('A על ציר ה-x החיובי');
    submit("D' על ציר ה-z החיובי");
    submit('DC = 4'); // rhombus side (drives the scale)
    submit('זווית ADC = 120'); // base angle
    submit("D'F = tD'A + 1/4 D'C"); // F on the t-family in plane ACD'
    submit("DF ניצב למישור ACD'"); // couples t with the free height
  };

  it('builds; |DD′| solves to 2 and t to ¼ with DF ⟂ plane ACD′', () => {
    build();
    expectAllOk();
    const pos = derived().positions;
    for (const id of ['A', 'C', 'D', "D'", 'F']) expect(pos.has(id), id).toBe(true);
    const A = pos.get('A')!;
    const C = pos.get('C')!;
    const D = pos.get('D')!;
    const Dp = pos.get("D'")!;
    const F = pos.get('F')!;

    // |DD′| = 2 (the height the coupled solve found)
    expect(nrm(sub(Dp, D))).toBeCloseTo(2, 3);

    // t = ¼:  F − D′ = t·(A − D′) + ¼·(C − D′)  ⇒  recover t along (A − D′)
    const da = sub(A, Dp);
    const rest = sub(sub(F, Dp), { x: 0.25 * (C.x - Dp.x), y: 0.25 * (C.y - Dp.y), z: 0.25 * (C.z - Dp.z) });
    expect(dot(rest, da) / dot(da, da)).toBeCloseTo(0.25, 3);

    // DF ⟂ plane ACD′ : DF is parallel to the plane normal ⇒ DF ⟂ two in-plane edges
    const n = cross(sub(C, A), sub(Dp, A));
    const df = sub(F, D);
    expect(Math.abs(dot(df, sub(C, A))) / (nrm(df) * nrm(sub(C, A)))).toBeLessThan(1e-4);
    expect(Math.abs(dot(df, sub(Dp, A))) / (nrm(df) * nrm(sub(Dp, A)))).toBeLessThan(1e-4);
    // and DF is not degenerate
    expect(nrm(df)).toBeGreaterThan(0.1);
    expect(nrm(n)).toBeGreaterThan(0.1);
  });
});
