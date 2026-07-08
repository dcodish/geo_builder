/**
 * V8-f (ADR-3D-023): vector-relation givens — the legacy-572 gaps G6/G9/G10/G11.
 *  - G6 (2013-חורף, 2014-קיץ-ב): the cosine of the angle between two named vectors OR at a
 *    vertex is a GIVEN (`cos∠ACB = 3/4`, `קוסינוס הזווית בין הוקטורים w ו-u הוא √35/10`).
 *  - G9 (2012-קיץ-ב): a chain of equal dot products `u·v = v·w = u·w`.
 *  - G10 (2016-קיץ): a vector making EQUAL ANGLES with two vectors.
 *  - G11 (2015-קיץ): a 3-D angle bisector `OD חוצה-זווית AOC` defining a point on a segment.
 *
 * Each relation DRIVES a free-dim solid (a similarity-invariant scalar pin) or, on a
 * determined figure, VERIFIES as a claim (the M1 shape). The bisector point is a
 * closed-form 1-DOF root-find (no solver / no CAS — the D3 boundary holds).
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
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);
const cosOf = (p: V, q: V) => dot(p, q) / (nrm(p) * nrm(q));

// --------------------------------------------------------------------------
// Parsing (He + En) — every new form lowers to the intended command
// --------------------------------------------------------------------------
describe('V8-f — parsing', () => {
  const cmd = (u: string) => {
    const r = parse3(u);
    if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
    return r.commands;
  };

  it('G6 cos between named vectors (He + En)', () => {
    expect(cmd('קוסינוס הזווית בין הוקטורים u ו-w הוא √35/10')[0]).toMatchObject({ type: 'cos-angle', cos: Math.sqrt(35) / 10 });
    expect(cmd('the cosine of the angle between u and w is √35/10')[0]).toMatchObject({ type: 'cos-angle' });
    expect(cmd('cos(u,v) = 0.5')[0]).toMatchObject({ type: 'cos-angle', cos: 0.5 });
  });

  it('G6 cos at a vertex → pair operands + drawn arms', () => {
    const c = cmd('cos∠ACB = 3/4');
    expect(c.at(-1)).toMatchObject({ type: 'cos-angle', cos: 0.75, u: { kind: 'pair', from: 'C', to: 'A' }, v: { kind: 'pair', from: 'C', to: 'B' } });
    expect(cmd('קוסינוס הזווית ACB = 3/4').at(-1)).toMatchObject({ type: 'cos-angle', cos: 0.75 });
  });

  it('G9 chained equal dot products', () => {
    const c = cmd('u·v = v·w = u·w')[0];
    expect(c.type).toBe('dot-eq-chain');
    if (c.type === 'dot-eq-chain') expect(c.ops).toHaveLength(3);
    // a numeric RHS is NOT this rule (it stays a dot-given)
    expect(cmd('u·v = 24')[0].type).toBe('dot-given');
  });

  it('G10 equal angles (He + En)', () => {
    expect(cmd('AE יוצר זוויות שוות עם AB ו-AD')[0]).toMatchObject({ type: 'angle-eq', base: { kind: 'pair', from: 'A', to: 'E' } });
    expect(cmd('AE makes equal angles with AB and AD')[0]).toMatchObject({ type: 'angle-eq' });
  });

  it('G11 bisector point (He + En)', () => {
    expect(cmd('D על AC כך ש-OD חוצה-זווית AOC')[0]).toMatchObject({ type: 'bisector-point', id: 'D', a: 'A', b: 'C', apex: 'O' });
    expect(cmd('D on AC such that OD bisects angle AOC')[0]).toMatchObject({ type: 'bisector-point', apex: 'O' });
  });
});

// --------------------------------------------------------------------------
// G6 — the cosine given DRIVES a free-dim solid
// --------------------------------------------------------------------------
describe('GATE G6 — cos between named vectors drives the figure (2013-חורף idiom)', () => {
  beforeEach(reset);
  it('cos(u,v) = 1/2 reshapes the tetra so the angle is 60°', () => {
    submit('פירמידה ABCD');
    submit('נסמן: AB = u, AC = v, AD = w');
    submit('קוסינוס הזווית בין הוקטורים u ו-v הוא 1/2');
    expectAllOk();
    const pos = derived().positions;
    const A = pos.get('A')!;
    expect(cosOf(sub(pos.get('B')!, A), sub(pos.get('C')!, A))).toBeCloseTo(0.5, 4);
  });
});

// --------------------------------------------------------------------------
// G9 — a chain of equal dot products (2012 קיץ ב, apex-first pyramid SABC)
// --------------------------------------------------------------------------
describe('GATE G9 — u·v = v·w = u·w on a right pyramid SABC', () => {
  beforeEach(reset);
  it('the three edge-vector dot products come out equal', () => {
    submit('פירמידה ישרה SABC');
    submit('נסמן: SA = u, SB = v, SC = w');
    submit('u·v = v·w = u·w');
    expectAllOk();
    const pos = derived().positions;
    const S = pos.get('S')!;
    const u = sub(pos.get('A')!, S);
    const v = sub(pos.get('B')!, S);
    const w = sub(pos.get('C')!, S);
    expect(dot(u, v)).toBeCloseTo(dot(v, w), 3);
    expect(dot(v, w)).toBeCloseTo(dot(u, w), 3);
  });
});

// --------------------------------------------------------------------------
// G10 — a vector making equal angles with two vectors (2016 קיץ)
// --------------------------------------------------------------------------
describe('GATE G10 — AE makes equal angles with AB and AD', () => {
  beforeEach(reset);
  it('cos(AE,AB) = cos(AE,AD) in the solved figure', () => {
    submit('בפירמידה ABCDE שבסיסה ריבוע');
    submit('נסמן: AB = u, AD = v, AE = w');
    submit('AE יוצר זוויות שוות עם AB ו-AD');
    expectAllOk();
    const pos = derived().positions;
    const A = pos.get('A')!;
    const ae = sub(pos.get('E')!, A);
    const ab = sub(pos.get('B')!, A);
    const ad = sub(pos.get('D')!, A);
    expect(cosOf(ae, ab)).toBeCloseTo(cosOf(ae, ad), 4);
  });
});

// --------------------------------------------------------------------------
// G11 — the 3-D angle bisector point (2015 קיץ)
// --------------------------------------------------------------------------
describe('GATE G11 — D on AC such that OD bisects ∠AOC', () => {
  beforeEach(reset);
  it('D lands on the segment and OD bisects the angle (bisector-theorem ratio)', () => {
    submit('O(0,0,0)');
    submit('A(8,0,0)');
    submit('C(0,0,6)');
    submit('D על AC כך ש-OD חוצה-זווית AOC');
    expectAllOk();
    const pos = derived().positions;
    const O = pos.get('O')!;
    const A = pos.get('A')!;
    const C = pos.get('C')!;
    const D = pos.get('D')!;
    // OD bisects ∠AOC ⇔ equal angles to OA and OC
    expect(cosOf(sub(D, O), sub(A, O))).toBeCloseTo(cosOf(sub(D, O), sub(C, O)), 5);
    // D on segment AC, and by the bisector theorem AD:DC = |OA|:|OC| = 8:6 ⇒ t = 4/7 from A
    const t = nrm(sub(D, A)) / nrm(sub(C, A));
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    expect(t).toBeCloseTo(8 / 14, 4);
  });

  it('verifies as a claim on a determined figure (G6/G9/G10 verify path)', () => {
    reset();
    submit('O(0,0,0)');
    submit('A(2,0,0)');
    submit('B(0,3,0)');
    submit('cos∠AOB = 0'); // OA ⟂ OB — a determined figure ⇒ verified claim
    expectAllOk();
  });
});
