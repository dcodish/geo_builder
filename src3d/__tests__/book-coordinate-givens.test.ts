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
import { dataView } from '../engine/dataView';
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
    // S3 (#378) widened this: the utterance is now HANDLED — as a relation between two POINT-RUN
    // planes, which is what it says. The no-theft intent is unchanged and asserted more sharply
    // here than before: `XYZ` must be read as three point labels, never as the coordinate plane,
    // so the lowering is a `plane-rel` over point runs and NEVER a `coord-plane-rel`.
    const r = parse3('המישור ABC מקביל למישור XYZ');
    expect(r).toMatchObject({
      ok: true,
      commands: [{ type: 'plane-rel', rel: 'parallel', a: { kind: 'plane-run', ids: ['A', 'B', 'C'] }, b: { kind: 'plane-run', ids: ['X', 'Y', 'Z'] } }],
    });
    expect(r.ok && r.commands.some((c) => c.type === 'coord-plane-rel')).toBe(false);
  });
});

describe('#324 — Hebrew variant registers (operator: "all kinds of hebrew variants")', () => {
  it('the ב-preposition register + the ה-xy article', () => {
    expect(parse3('הבסיס ABCD מונח במישור המקביל למישור ה-xy')).toMatchObject({
      ok: true,
      commands: [{ type: 'coord-plane-rel', ids: ['A', 'B', 'C', 'D'], axis: 'z', mode: 'share' }],
    });
    expect(parse3('הבסיס ABCD שוכן במישור ה-xy')).toMatchObject({ ok: true, commands: [{ axis: 'z', mode: 'zero' }] });
    expect(parse3('המישור ABC אנכי למישור [xz]')).toMatchObject({ ok: true, commands: [{ axis: 'y', mode: 'perp' }] });
  });
  it('a POLYGON-noun subject also BUILDS the flat polygon (the polygon rule used to drop the clause)', () => {
    expect(parse3('המרובע ABCD מונח במישור [xy]')).toEqual({
      ok: true,
      commands: [
        { type: 'solid', kind: 'polygon4', ids: ['A', 'B', 'C', 'D'] },
        { type: 'coord-plane-rel', ids: ['A', 'B', 'C', 'D'], axis: 'z', mode: 'zero' },
      ],
    });
    expect(parse3('המשולש ABC נמצא במישור xy')).toMatchObject({
      ok: true,
      commands: [{ type: 'solid', kind: 'polygon3' }, { type: 'coord-plane-rel', mode: 'zero' }],
    });
    // a plain polygon with NO coordinate clause stays the polygon rule's — no theft the other way
    expect(parse3('מרובע ABCD')).toMatchObject({ ok: true, commands: [{ type: 'solid', kind: 'polygon4' }] });
  });
  it('the definite bare «הבסיס» (no letters) → ids [] resolved at apply; En mirror', () => {
    expect(parse3('הבסיס מונח במישור המקביל למישור ה-xy')).toMatchObject({
      ok: true,
      commands: [{ type: 'coord-plane-rel', ids: [], axis: 'z', mode: 'share' }],
    });
    expect(parse3('the base lies in a plane parallel to the xy-plane')).toMatchObject({
      ok: true,
      commands: [{ type: 'coord-plane-rel', ids: [], axis: 'z', mode: 'share' }],
    });
  });
});

describe('#325 — parameter sign variants (t > 0 / t < 0 and the word registers)', () => {
  it('comparison and word forms parse', () => {
    expect(parse3('t > 0')).toEqual({ ok: true, commands: [{ type: 'param-sign', sym: 't', positive: true }] });
    expect(parse3('t<0')).toEqual({ ok: true, commands: [{ type: 'param-sign', sym: 't', positive: false }] });
    expect(parse3('הפרמטר t חיובי')).toMatchObject({ ok: true, commands: [{ positive: true }] });
    expect(parse3('t הוא מספר חיובי')).toMatchObject({ ok: true, commands: [{ positive: true }] });
    expect(parse3('the parameter t is positive')).toMatchObject({ ok: true, commands: [{ positive: true }] });
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
    const ts: number[] = [];
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      const B = d.positions.get('B')!;
      expect(B.x, `seed ${seed}: x=2y`).toBeCloseTo(2 * B.y, 3);
      expect(B.z, `seed ${seed}: base rides A's plane`).toBeCloseTo(-3, 3);
      expect(d.resolved.pivot?.pinSymbols?.t, `seed ${seed}: t solved positive`).toBeGreaterThan(0);
      expect(d.resolved.pivot?.pinSymbols?.k, `seed ${seed}: k forced by the parallel given`).toBeCloseTo(-3, 3);
      ts.push(d.resolved.pivot!.pinSymbols!.t);
    }
    // ADR-052 conformance: an OPEN symbol must VARY with the seed — a value the sampler never
    // explores is a default masquerading as determined (the seed-anchor lock, Am. 2)
    expect(Math.max(...ts) - Math.min(...ts)).toBeGreaterThan(1e-3);
  });

  it('the data panel tells the story: «t = ?» (open, hint) and «k = -3» (determined)', () => {
    for (const u of BOOK) submit(u);
    const d = derive3(state().facts, state().seed);
    const params = dataView(d.construction, state().seed).params;
    expect(params).toEqual([
      { sym: 't', text: 't = ?', open: true },
      { sym: 'k', text: 'k = -3', open: false },
    ]);
  });

  it('the book lines survive their punctuation: one-sentence sign tail + trailing periods', () => {
    // the sign clause IN the same utterance is picked up, never silently dropped
    expect(parse3('נתונות הנקודות: B(2t, t, k), A(1, 4, -3). t פרמטר חיובי.')).toMatchObject({
      ok: true,
      commands: [
        { type: 'point3', id: 'B' },
        { type: 'point3', id: 'A' },
        { type: 'param-sign', sym: 't', positive: true },
      ],
    });
    expect(parse3('t פרמטר חיובי.')).toMatchObject({ ok: true, commands: [{ type: 'param-sign' }] });
    expect(parse3('הבסיס ABCD מונח על מישור שמקביל למישור [xy].')).toMatchObject({ ok: true });
    // an OTHER meaningful tail defers the whole utterance (honesty — no silent drop)
    expect(parse3('נתונות הנקודות: A(1, 4, -3) וגם משהו חשוב')).toEqual({ ok: false, reason: 'not-handled' });
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

  it('«t < 0» on the determined figure refuses sign-unsatisfiable (t = 2); «t > 0» passes', () => {
    for (const u of BOOK.slice(0, 3)) submit(u); // without the sign line
    submit('B(4, n, p)'); // determines t = 2
    expect(err()).toBeNull();
    submit('t > 0');
    expect(err()).toBeNull();
    submit('t < 0');
    expect(err()).toEqual({ code: 'sign-unsatisfiable', id: 't' });
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
  it('the bare «הבסיס» resolves to THE solid\'s base ring; with no solid it refuses honestly', () => {
    submit('הבסיס מונח במישור המקביל למישור ה-xy');
    expect(err()).toEqual({ code: 'no-such-solid', id: 'בסיס' });
    reset();
    submit('תיבה');
    submit('הבסיס מונח במישור המקביל למישור ה-xy');
    expect(err()).toBeNull();
    const d = derive3(state().facts, 0);
    const zs = ['A', 'B', 'C', 'D'].map((id) => d.positions.get(id)!.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(1e-6);
  });
});

describe('Am. 3 — a sign given SELECTS among discrete symbol roots (operator screenshot, 2026-07-25)', () => {
  beforeEach(reset);
  // «AB=7» + A(1,4,−3) roots t: (2t−1)² + (t−4)² = 49 ⇒ t = 4 OR t = −1.6 — two exact
  // solutions sharing one gauge. Best-per-mirror kept only one basin, so «t > 0» refused
  // sign-unsatisfiable although the positive root exists (the operator's «מה אני עושה לא בסדר»).
  const SEQ = ['תיבה', 'נתונות הנקודות: A(1, 4, -3), B(2t, t, k)', 'הבסיס ABCD מונח על מישור שמקביל למישור [xy]', 'AB=7'];

  it('«t > 0» selects t = 4 (B = (8, 4, −3)) at every seed instead of refusing', () => {
    for (const u of SEQ) {
      submit(u);
      expect(err(), u).toBeNull();
    }
    submit('t > 0');
    expect(err()).toBeNull();
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      expect(d.resolved.pivot?.pinSymbols?.t, `seed ${seed}`).toBeCloseTo(4, 3);
      const B = d.positions.get('B')!;
      expect(B.x, `seed ${seed}`).toBeCloseTo(8, 2);
      expect(B.y, `seed ${seed}`).toBeCloseTo(4, 2);
      expect(B.z, `seed ${seed}`).toBeCloseTo(-3, 2);
    }
  });

  it('«t < 0» selects the −1.6 root', () => {
    for (const u of SEQ) submit(u);
    submit('t < 0');
    expect(err()).toBeNull();
    const d = derive3(state().facts, state().seed);
    expect(d.resolved.pivot?.pinSymbols?.t).toBeCloseTo(-1.6, 2);
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
