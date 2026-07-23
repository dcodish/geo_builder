/**
 * V8-a (ADR-3D-018): apex-FIRST solid naming made first-class + the "intersection of
 * the diagonals" point (G3). Legacy 572 exams routinely name the apex first (SABCD,
 * EABCD, OBCD) and reference `מפגש האלכסונים של הבסיס/הפאה`.
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
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(state().lastError).toBeNull();
}
const idsOf = (u: string): string[] => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`did not parse: ${u}`);
  return (r.commands[0] as { ids: string[] }).ids;
};

describe('V8-a — apex-first naming is reordered to [base…, apex]', () => {
  it('quad base, apex first: SABCD → base ABCD, apex S (last)', () => {
    expect(idsOf('פירמידה SABCD שבסיסה ריבוע')).toEqual(['A', 'B', 'C', 'D', 'S']);
    expect(idsOf('pyramid SABCD with a square base')).toEqual(['A', 'B', 'C', 'D', 'S']);
    expect(idsOf('פירמידה EABCD שבסיסה ריבוע')).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('explicit named base fixes the apex even when the base run is not consecutive (OBCDE → apex E)', () => {
    // 2019-חורף: base OBCD (a square), apex E — O is in the base, not the apex
    expect(idsOf('פירמידה OBCDE שבסיסה OBCD ריבוע')).toEqual(['O', 'B', 'C', 'D', 'E']);
  });

  it('triangular base, apex first: SABC → base ABC, apex S', () => {
    expect(idsOf('פירמידה ישרה SABC')).toEqual(['A', 'B', 'C', 'S']);
    expect(idsOf('פירמידה OBCD')).toEqual(['B', 'C', 'D', 'O']); // 2017-חורף corner tetra, apex O
  });

  it('REGRESSION: apex-last naming is untouched', () => {
    expect(idsOf('פירמידה ישרה ABCDS שבסיסה ריבוע')).toEqual(['A', 'B', 'C', 'D', 'S']);
    expect(idsOf('פירמידה ABCDS')).toEqual(['A', 'B', 'C', 'D', 'S']); // pyramid4gr default
    expect(idsOf('פירמידה ABCD')).toEqual(['A', 'B', 'C', 'D']); // general tetra unchanged
    expect(idsOf('פירמידה ABCDT')).toEqual(['A', 'B', 'C', 'D', 'T']); // 2012-חורף, apex T last
  });

  it('an apex-first pyramid BUILDS with S as the apex (off the base plane)', () => {
    reset();
    submit('פירמידה ישרה SABCD שבסיסה ריבוע');
    expectAllOk();
    const pos = derived().positions;
    for (const id of ['A', 'B', 'C', 'D', 'S']) expect(pos.has(id)).toBe(true);
    // S is the apex: it is NOT coplanar with the base ABCD
    const [A, B, C, S] = ['A', 'B', 'C', 'S'].map((i) => pos.get(i)!);
    const u = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
    const v = { x: C.x - A.x, y: C.y - A.y, z: C.z - A.z };
    const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
    const d = (S.x - A.x) * n.x + (S.y - A.y) * n.y + (S.z - A.z) * n.z;
    expect(Math.abs(d)).toBeGreaterThan(0.1); // apex genuinely off the base plane
  });
});

describe('V8-a — intersection of the diagonals (G3)', () => {
  beforeEach(reset);

  const mid = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => ({
    x: (p.x + q.x) / 2,
    y: (p.y + q.y) / 2,
    z: (p.z + q.z) / 2,
  });

  it('named face: O = intersection of the diagonals of face ABCD (= midpoint of AC)', () => {
    submit('קובייה ABCDA\'B\'C\'D\'');
    submit('O מפגש האלכסונים של הפאה ABCD');
    expectAllOk();
    const pos = derived().positions;
    const O = pos.get('O')!;
    const m = mid(pos.get('A')!, pos.get('C')!);
    expect(O.x).toBeCloseTo(m.x, 9);
    expect(O.y).toBeCloseTo(m.y, 9);
    expect(O.z).toBeCloseTo(m.z, 9);
    // and equally the midpoint of the OTHER diagonal BD (parallelogram)
    const m2 = mid(pos.get('B')!, pos.get('D')!);
    expect(O.x).toBeCloseTo(m2.x, 9);
  });

  it('the base sentinel: O = intersection of the base diagonals (single solid)', () => {
    submit('קובייה');
    submit('O נקודת חיתוך אלכסוני הבסיס');
    expectAllOk();
    const pos = derived().positions;
    const O = pos.get('O')!;
    const m = mid(pos.get('A')!, pos.get('C')!);
    expect(O.x).toBeCloseTo(m.x, 9);
    expect(O.y).toBeCloseTo(m.y, 9);
    expect(O.z).toBeCloseTo(m.z, 9);
  });

  it('two explicit diagonals: O = intersection of diagonal AC with diagonal BD', () => {
    submit('קובייה');
    submit('O נקודת החיתוך של אלכסון AC עם אלכסון BD');
    expectAllOk();
    const pos = derived().positions;
    const O = pos.get('O')!;
    const m = mid(pos.get('A')!, pos.get('C')!);
    expect(O.x).toBeCloseTo(m.x, 9);
  });

  it('English mirror + face on the TOP face', () => {
    submit("box ABCDA'B'C'D'");
    submit("G is the intersection of the diagonals of face A'B'C'D'");
    expectAllOk();
    const pos = derived().positions;
    const G = pos.get('G')!;
    const m = mid(pos.get("A'")!, pos.get("C'")!);
    expect(G.x).toBeCloseTo(m.x, 9);
    expect(G.y).toBeCloseTo(m.y, 9);
    expect(G.z).toBeCloseTo(m.z, 9);
  });

  // #284 (ADR-3D-055) — the crossing named LAST («…נפגשים בנקודה O») + the «נפגש» verb.
  // The operator narrowed it exactly: «נחתכים» worked, «נפגשים» didn't.
  it('point-LAST: «אלכסוני הריבוע נפגשים בנקודה O» (the operator\'s exact utterance)', () => {
    submit('קובייה');
    submit('אלכסוני הריבוע נפגשים בנקודה O');
    expectAllOk();
    const pos = derived().positions;
    const O = pos.get('O')!;
    const m = mid(pos.get('A')!, pos.get('C')!);
    expect(O.x).toBeCloseTo(m.x, 9);
    expect(O.y).toBeCloseTo(m.y, 9);
    expect(O.z).toBeCloseTo(m.z, 9);
  });

  it('«נחתכים» still works (the form that already did)', () => {
    submit('קובייה');
    submit('אלכסוני הריבוע נחתכים בנקודה O');
    expectAllOk();
    const O = derived().positions.get('O')!;
    const m = mid(derived().positions.get('A')!, derived().positions.get('C')!);
    expect(O.x).toBeCloseTo(m.x, 9);
  });

  it('point-LAST with explicit vertices binds the CROSSING, not the first label (no silent mis-bind)', () => {
    // «diagonals of ABCD meet at O» used to build id=A, face=[B,C,D,O] — a wrong figure, silently.
    submit("box ABCDA'B'C'D'");
    submit('diagonals of ABCD meet at O');
    expectAllOk();
    const pos = derived().positions;
    const O = pos.get('O')!;
    const m = mid(pos.get('A')!, pos.get('C')!);
    expect(O.x).toBeCloseTo(m.x, 9);
    expect(O.y).toBeCloseTo(m.y, 9);
    expect(O.z).toBeCloseTo(m.z, 9);
  });

  it('the base sentinel refuses honestly with no single solid', () => {
    submit('O נקודת חיתוך אלכסוני הבסיס');
    expect(state().facts).toHaveLength(0);
    expect(state().lastError).toEqual({ code: 'unknown-plane', id: 'base' });
  });
});
