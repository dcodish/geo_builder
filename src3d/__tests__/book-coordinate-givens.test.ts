/**
 * #324 + #325 + #326 (ADR-3D-079) — the operator's book snippet (2026-07-25), entered verbatim:
 *
 *   «הבסיס ABCD מונח על מישור שמקביל למישור [xy].
 *    נתונות הנקודות: B(2t, t, k), A(1, 4, -3). t פרמטר חיובי.»
 *
 *  - #324: a ring's relation to a COORDINATE plane/axis (`coord-plane-rel`) — pivot residuals
 *    on a free figure, a verified claim on a determined one (the ADR-3D-030 pattern).
 *  - #325: affine SYMBOLIC point components (`B(2t, t, k)`) — each distinct symbol is an extra
 *    pivot unknown, OPEN until data determines it (`x_B = 2·y_B` holds at every seed while t roams).
 *  - #326: the injection-list prefix reads the book register («נתונות הנקודות:», bare «הנקודות»).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { parse3 } from '../parser/parse3';
import { freeDofCount3 } from '../engine/evaluate';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const err = () => state().lastError;

describe('#324 — parse: ring ∥/⟂/on a coordinate plane or axis', () => {
  it('the book form: «הבסיס ABCD מונח על מישור שמקביל למישור [xy]» → share z', () => {
    expect(parse3('הבסיס ABCD מונח על מישור שמקביל למישור [xy]')).toEqual({
      ok: true,
      commands: [{ type: 'coord-plane-rel', ids: ['A', 'B', 'C', 'D'], axis: 'z', mode: 'share' }],
    });
  });
  it('lies ON the coordinate plane → zero; ⟂ → perp; axis forms map dually', () => {
    expect(parse3('הבסיס ABCD מונח על המישור [xy]')).toMatchObject({ ok: true, commands: [{ axis: 'z', mode: 'zero' }] });
    expect(parse3('המישור ABC מאונך למישור [xz]')).toMatchObject({ ok: true, commands: [{ axis: 'y', mode: 'perp' }] });
    expect(parse3('המישור ABC מקביל לציר ה-z')).toMatchObject({ ok: true, commands: [{ axis: 'z', mode: 'perp' }] });
    expect(parse3('המישור ABC מאונך לציר ה-x')).toMatchObject({ ok: true, commands: [{ axis: 'x', mode: 'share' }] });
  });
  it('En mirrors', () => {
    expect(parse3('base ABCD lies on a plane parallel to the xy-plane')).toMatchObject({
      ok: true,
      commands: [{ type: 'coord-plane-rel', axis: 'z', mode: 'share' }],
    });
    expect(parse3('plane ABC is perpendicular to the xz-plane')).toMatchObject({ ok: true, commands: [{ axis: 'y', mode: 'perp' }] });
    expect(parse3('plane ABC is parallel to the z-axis')).toMatchObject({ ok: true, commands: [{ axis: 'z', mode: 'perp' }] });
  });
  it('NO THEFT: uppercase letters are point labels, not coordinate planes', () => {
    expect(parse3('המישור ABC מקביל למישור XYZ')).toEqual({ ok: false, reason: 'not-handled' });
  });
});

describe('#325 — parse: affine symbolic components', () => {
  it('B(2t, t, k) — coefficients and two open symbols', () => {
    expect(parse3('B(2t, t, k)')).toEqual({
      ok: true,
      commands: [{
        type: 'point3', id: 'B', x: null, y: null, z: null,
        syms: ['t', 't', 'k'],
        symExprs: [{ sym: 't', k: 2, c: 0 }, { sym: 't', k: 1, c: 0 }, { sym: 'k', k: 1, c: 0 }],
      }],
    });
  });
  it('a single-symbol coefficient now parses too: M(2k, 1, 3)', () => {
    expect(parse3('M(2k, 1, 3)')).toMatchObject({
      ok: true,
      commands: [{ type: 'point3', id: 'M', symExprs: [{ sym: 'k', k: 2, c: 0 }, null, null] }],
    });
  });
  it('an affine offset: N(t+1, 2t-3, 0)', () => {
    expect(parse3('N(t+1, 2t-3, 0)')).toMatchObject({
      ok: true,
      commands: [{ symExprs: [{ sym: 't', k: 1, c: 1 }, { sym: 't', k: 2, c: -3 }, null] }],
    });
  });
});

describe('#326 — the injection-list prefix reads the book register', () => {
  it('«נתונות הנקודות: …» and bare «הנקודות …» parse like «נתון: …»', () => {
    const expected = parse3('נתון: A(1, 4, -3), B(2, 1, -3)');
    expect(expected.ok).toBe(true);
    expect(parse3('נתונות הנקודות: A(1, 4, -3), B(2, 1, -3)')).toEqual(expected);
    expect(parse3('הנקודות A(1, 4, -3), B(2, 1, -3)')).toEqual(expected);
    expect(parse3('given the points: A(1, 4, -3), B(2, 1, -3)')).toEqual(expected);
  });
});

describe('the book snippet end-to-end (box figure)', () => {
  beforeEach(reset);
  const BOOK = [
    'תיבה',
    'נתונות הנקודות: A(1, 4, -3), B(2t, t, k)',
    'הבסיס ABCD מונח על מישור שמקביל למישור [xy]',
    't פרמטר חיובי',
  ];

  it('builds clean; x_B = 2·y_B and z_B = −3 at every seed while t stays OPEN', () => {
    for (const u of BOOK) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      const B = d.positions.get('B')!;
      expect(B.x, `seed ${seed}: x=2y`).toBeCloseTo(2 * B.y, 3);
      expect(B.z, `seed ${seed}: base rides A's plane`).toBeCloseTo(-3, 3);
      expect(d.resolved.pivot?.pinSymbols?.t, `seed ${seed}: t solved positive`).toBeGreaterThan(0);
      expect(d.resolved.pivot?.pinSymbols?.k, `seed ${seed}: k forced by the parallel given`).toBeCloseTo(-3, 3);
    }
  });

  it('«more data» determines the symbols: x_B = 4 lands B = (4, 2, −3) and t = 2 at every seed', () => {
    for (const u of BOOK) submit(u);
    submit('B(4, n, p)'); // the V4 partial-pin register: only the numeric component constrains
    expect(err()).toBeNull();
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      const B = d.positions.get('B')!;
      expect(B.x, `seed ${seed}`).toBeCloseTo(4, 4);
      expect(B.y, `seed ${seed}`).toBeCloseTo(2, 4);
      expect(B.z, `seed ${seed}`).toBeCloseTo(-3, 4);
      expect(d.resolved.pivot?.pinSymbols?.t, `seed ${seed}`).toBeCloseTo(2, 4);
    }
  });

  it('the DOF cue accounts symbols as open unknowns (net one constraint per shared-symbol pin)', () => {
    for (const u of BOOK) submit(u);
    const d = derive3(state().facts, state().seed);
    expect(freeDofCount3(d.construction, d.resolved)).toBeGreaterThan(0); // t (and box dims) still open
  });
});

describe('#324 — verify on a DETERMINED figure (the claim is the arbiter)', () => {
  beforeEach(reset);
  it('a FALSE parallel/on statement refuses claim-refuted (keep-prior); a TRUE one passes', () => {
    for (const u of ['A(0,0,2)', 'B(1,0,2)', 'C(1,1,2)', 'D(0,1,2)']) submit(u);
    submit('המישור ABCD מקביל למישור [xy]');
    expect(err()).toBeNull(); // shared z = 2 → true
    submit('המישור ABCD מונח על המישור [xy]');
    expect(err()).toEqual({ code: 'claim-refuted' }); // z = 2 ≠ 0 → refused
    reset();
    for (const u of ['A(0,0,0)', 'B(1,0,0)', 'C(1,1,1)', 'D(0,1,1)']) submit(u);
    submit('המישור ABCD מקביל למישור [xy]');
    expect(err()).toEqual({ code: 'claim-refuted' }); // z varies → refused
  });
});

describe('#324 — the statement alone DRIVES a free figure', () => {
  beforeEach(reset);
  it('«הבסיס ABCD מונח על מישור שמקביל למישור [xy]» on a bare box: base exactly horizontal', () => {
    submit('תיבה');
    submit('הבסיס ABCD מונח על מישור שמקביל למישור [xy]');
    expect(err()).toBeNull();
    for (const seed of [0, 1]) {
      const d = derive3(state().facts, seed);
      const zs = ['A', 'B', 'C', 'D'].map((id) => d.positions.get(id)!.z);
      expect(Math.max(...zs) - Math.min(...zs), `seed ${seed}`).toBeLessThan(1e-6);
    }
  });
});

describe('guards', () => {
  beforeEach(reset);
  it('a pin symbol clashing with the coord-sym figure parameter refuses two-params', () => {
    submit('נתונה נקודה M(k,1,3), k הוא פרמטר חיובי'); // coord-sym: k is THE figure parameter
    expect(err()).toBeNull();
    submit('תיבה');
    submit('B(2k, k, 1)'); // the same letter as a PIN symbol — two mechanisms, refused
    expect(err()).toEqual({ code: 'two-params' });
  });
  it('a NEW point with two distinct symbols stays the honest refusal (needs a figure to ride)', () => {
    submit('B(2t, t, k)');
    expect(err()).toEqual({ code: 'symbolic-new-point', id: 'B' });
  });
});
