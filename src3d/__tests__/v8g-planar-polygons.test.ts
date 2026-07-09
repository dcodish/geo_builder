/**
 * V8-g (ADR-3D-024): the 2-D vector lane (z=0) — planar free-point polygons.
 * Gate: 2010-קיץ Q2 (quadrilateral MKNL + pentagon ABCDE with side-midpoints; the
 * vector identities QP = ½(KM+LN), QP ∥ EA, |QP| = ¼|EA| — pure affine claims that hold
 * for ANY polygon, verified multi-sample). Plus triangle-altitude vectors and cevians.
 *
 * A flat polygon is modelled as a "solid" whose dims are its free vertex coords, so it
 * reuses the dims sampler (free case) and the pivot (metric givens drive it — V8-f pins).
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

// --------------------------------------------------------------------------
describe('V8-g — parsing', () => {
  const cmd = (u: string) => {
    const r = parse3(u);
    if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
    return r.commands;
  };
  it('planar polygons (He + En)', () => {
    expect(cmd('משולש ABC')[0]).toMatchObject({ type: 'solid', kind: 'polygon3', ids: ['A', 'B', 'C'] });
    expect(cmd('מרובע MKNL')[0]).toMatchObject({ type: 'solid', kind: 'polygon4', ids: ['M', 'K', 'N', 'L'] });
    expect(cmd('מחומש ABCDE')[0]).toMatchObject({ type: 'solid', kind: 'polygon5' });
    expect(cmd('quadrilateral ABCD')[0]).toMatchObject({ type: 'solid', kind: 'polygon4' });
    expect(cmd('pentagon ABCDE')[0]).toMatchObject({ type: 'solid', kind: 'polygon5' });
  });
  it('the polygon nouns do NOT steal the 3-D / area / centroid uses', () => {
    expect(cmd('מנסרה ישרה משולשת ABC')[0]).toMatchObject({ type: 'solid', kind: 'prism3' });
    expect(cmd('שטח המשולש ABC = 4.5').at(-1)).toMatchObject({ type: 'claim' });
    expect(cmd("E מפגש התיכונים של משולש BCD").at(-1)).toMatchObject({ type: 'centroid3' });
  });
  it('triangle altitude (He + En)', () => {
    expect(cmd('גובה המשולש לצלע AB הוא CD').at(-1)).toMatchObject({ type: 'altitude-foot', id: 'D', from: 'C', a: 'A', b: 'B' });
    expect(cmd('CD is the altitude to AB').at(-1)).toMatchObject({ type: 'altitude-foot', id: 'D', from: 'C', a: 'A', b: 'B' });
  });
});

// --------------------------------------------------------------------------
// GATE — 2010 קיץ Q2 (plane vectors, quad/pentagon midpoints)
// --------------------------------------------------------------------------
describe('GATE — 2010 קיץ Q2 (quad + pentagon midpoints)', () => {
  beforeEach(reset);

  it('part א: a free quad MKNL, P/Q midpoints of the diagonals ⇒ QP = ½(KM+LN)', () => {
    submit('מרובע MKNL');
    submit('P אמצע האלכסון NM');
    submit('Q אמצע האלכסון KL');
    submit('QP = 1/2 KM + 1/2 LN'); // the vector identity (holds for ANY quad — verified multi-sample)
    expectAllOk();
    const pos = derived().positions;
    for (const id of ['M', 'K', 'N', 'L', 'P', 'Q']) {
      expect(pos.has(id), id).toBe(true);
      expect(Math.abs(pos.get(id)!.z), `${id} planar`).toBeLessThan(1e-9); // the figure is flat
    }
  });

  it('part ב: pentagon ABCDE with side-midpoints ⇒ QP ∥ EA and |QP| = ¼|EA|', () => {
    submit('מחומש ABCDE');
    submit('M אמצע AB');
    submit('K אמצע BC');
    submit('N אמצע CD');
    submit('L אמצע ED');
    submit('P אמצע NM');
    submit('Q אמצע KL');
    submit('נסמן: EA = v, AB = u');
    submit('QP ו-EA מקבילים'); // QP ∥ EA
    submit('|QP| = 1/4|EA|'); // |QP| = ¼|EA|
    submit('QP = 1/2 KM + 1/2 LN'); // still holds
    expectAllOk();
    // independent oracle: QP = ¼·EA exactly, in every drawing
    const pos = derived().positions;
    const QP = sub(pos.get('P')!, pos.get('Q')!);
    const EA = sub(pos.get('A')!, pos.get('E')!);
    expect(nrm(QP)).toBeCloseTo(nrm(EA) / 4, 6);
    expect(Math.abs(dot(QP, EA)) / (nrm(QP) * nrm(EA))).toBeCloseTo(1, 6); // parallel
  });
});

// --------------------------------------------------------------------------
// Triangle altitude vectors + cevians (2014 קיץ ב idiom)
// --------------------------------------------------------------------------
describe('triangle altitude + cevian on a planar triangle', () => {
  beforeEach(reset);

  it('the altitude foot D lands on AB with CD ⟂ AB', () => {
    submit('משולש ABC');
    submit('גובה המשולש לצלע AB הוא CD');
    submit('E על BC כך ש-CE:EB = 3:5');
    expectAllOk();
    const pos = derived().positions;
    const A = pos.get('A')!;
    const B = pos.get('B')!;
    const C = pos.get('C')!;
    const D = pos.get('D')!;
    // CD ⟂ AB
    expect(Math.abs(dot(sub(D, C), sub(B, A))) / (nrm(sub(D, C)) * nrm(sub(B, A)))).toBeLessThan(1e-7);
    // D on line AB
    expect(nrm({ x: (D.y - A.y) * (B.z - A.z) - (D.z - A.z) * (B.y - A.y), y: (D.z - A.z) * (B.x - A.x) - (D.x - A.x) * (B.z - A.z), z: (D.x - A.x) * (B.y - A.y) - (D.y - A.y) * (B.x - A.x) })).toBeLessThan(1e-7);
    // E on BC with CE:EB = 3:5 ⇒ CE/CB = 3/8
    const E = pos.get('E')!;
    expect(nrm(sub(E, C)) / nrm(sub(B, C))).toBeCloseTo(3 / 8, 5);
  });

  it('metric givens DRIVE the free triangle (SAS: |CA|=1, |CB|=2, cos∠ACB=3/4)', () => {
    submit('משולש ABC');
    submit('|CA| = 1');
    submit('|CB| = 2');
    submit('cos∠ACB = 3/4');
    expectAllOk();
    const pos = derived().positions;
    const A = pos.get('A')!;
    const B = pos.get('B')!;
    const C = pos.get('C')!;
    expect(nrm(sub(A, C))).toBeCloseTo(1, 3);
    expect(nrm(sub(B, C))).toBeCloseTo(2, 3);
    expect(dot(sub(A, C), sub(B, C)) / (nrm(sub(A, C)) * nrm(sub(B, C)))).toBeCloseTo(0.75, 3);
  });
});
