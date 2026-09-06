/**
 * #902 (ADR-3D-219) — «p = 3» after «C(p²,1,0)» was refused `unknown-symbol`.
 *
 * The class: *the symbol namespace was fragmented across lookups.* `symbol-value` asked the vec-def list
 * and the angle labels and nothing else, while a letter can also be a pivot pin symbol (a coordinate,
 * vector or pair injection, an equation's letter), the algebraic lane's figure parameter, or a NAMED free
 * component («C(p,1,0)», #814). And `symbolPins` was keyed by the vec-def INDEX that introduced the
 * symbol, so even a smarter lookup had nowhere to record a pin on the other kinds. Now the pins are keyed
 * by the symbol's NAME, `symbolOwnersOf` says in one place what a letter denotes, and every owner gets
 * the value.
 *
 * Measured at the pre-fix HEAD (2026-09-06): every "builds" case below returned
 * `{"code":"unknown-symbol","id":<letter>}` — including the degree-1 sibling, which is NOT a pivot
 * symbol at all (a bare letter is a #814 component name), so a power-shaped fix would have left it red.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { freeDofCount3, resolve3 } from '../engine/evaluate';
import { dot3, norm3, sub3 } from '../engine/vec3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);
const err = () => state().lastError;
/** Every accepted fact still verifies (after a refusal `lastError` rightly carries the refusal, so it is not asserted here). */
function expectFactsOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
}
function expectAllOk() {
  expectFactsOk();
  expect(err()).toBeNull();
}
const at = (id: string) => {
  const p = derived().positions.get(id);
  expect(p, id).toBeDefined();
  return p!;
};
const expectPoint = (id: string, x: number, y: number, z: number) => {
  const p = at(id);
  expect(p.x, `${id}.x`).toBeCloseTo(x, 6);
  expect(p.y, `${id}.y`).toBeCloseTo(y, 6);
  expect(p.z, `${id}.z`).toBeCloseTo(z, 6);
};

const BOX = "תיבה ABCDA'B'C'D'";
const CUBE = "קובייה ABCDA'B'C'D'";

describe('#902 — the operator’s rows (all four refused unknown-symbol before)', () => {
  beforeEach(reset);

  it('the exact sequence: box, C(p²,1,0), p=3 — builds and C lands at (9, 1, 0)', () => {
    [BOX, 'C(p²,1,0)', 'p=3'].forEach(submit);
    expectAllOk();
    expectPoint('C', 9, 1, 0);
    expect(derived().resolved.pivot?.pinSymbols?.p).toBe(3);
  });

  it('the degree-1 sibling C(p,1,0) — a NAMED free component, not a power — lands C at (3, 1, 0)', () => {
    [BOX, 'C(p,1,0)', 'p=3'].forEach(submit);
    expectAllOk();
    expectPoint('C', 3, 1, 0);
  });

  it('the spaced form «p = 3» is the same statement', () => {
    [BOX, 'C(p²,1,0)', 'p = 3'].forEach(submit);
    expectAllOk();
    expectPoint('C', 9, 1, 0);
  });

  it('the cube variant', () => {
    [CUBE, 'C(p²,1,0)', 'p=3'].forEach(submit);
    expectAllOk();
    expectPoint('C', 9, 1, 0);
  });
});

describe('#902 — the class: every lane that can own a letter takes the value', () => {
  beforeEach(reset);

  it('a VECTOR injection’s symbol: «u = (k-1,k,3)» then «k = 2» → AB = (1, 2, 3)', () => {
    [BOX, 'נסמן: AB = u', 'u = (k-1,k,3)', 'k = 2'].forEach(submit);
    expectAllOk();
    const ab = sub3(at('B'), at('A'));
    expect([ab.x, ab.y, ab.z].map((v) => +v.toFixed(6))).toEqual([1, 2, 3]);
  });

  it('a PAIR injection’s symbol: «BD = (k,2k,0)» then «k = 1» → BD = (1, 2, 0)', () => {
    [BOX, 'BD = (k,2k,0)', 'k = 1'].forEach(submit);
    expectAllOk();
    const bd = sub3(at('D'), at('B'));
    expect([bd.x, bd.y, bd.z].map((v) => +v.toFixed(6))).toEqual([1, 2, 0]);
  });

  it('an EQUATION’s letter (#815 family): a consistent value is honoured, a contradicting one is refused BY NAME', () => {
    // #801's exam prism: the right-prism structure already pins k = 2; the line is written in k too.
    const PRISM = ["מנסרה ישרה משולשת ABCA'B'C'", "AA'=(k-1,k-7,k+1)", 'AC=(k+1,0,k-3)', 'AB=(k-1,k,3)', 'משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)'];
    PRISM.forEach(submit);
    expectAllOk();
    submit('k = 2');
    expectAllOk();
    expect(derived().resolved.pivot?.pinSymbols?.k).toBe(2);
    const dir = derived().resolved.lines.get('AC')!.dir;
    expect([dir.x, dir.y, dir.z].map((v) => +v.toFixed(6))).toEqual([3, 0, -1]);
    // k = 5 contradicts the prism (AA'·AB = 24 ≠ 0): refused, naming THIS statement, keep-prior
    const n = state().facts.length;
    submit('k = 5');
    expect(state().facts).toHaveLength(n);
    expect(err()).toMatchObject({ code: 'givens-contradict', stated: 'k = 5' });
    expect(derived().resolved.pivot?.pinSymbols?.k).toBe(2);
  });

  it('the FIGURE PARAMETER of a plane equation: «m = 2» pins it — one branch, printed, one DOF fewer', () => {
    submit('מישור π: 3x+my+(m+6)z+4=0');
    expectAllOk();
    const before = derived();
    expect(freeDofCount3(before.construction, before.resolved)).toBe(1); // m is a free sampled DOF
    submit('m = 2');
    expectAllOk();
    const d = derived();
    expect(d.resolved.param).toEqual({ name: 'm', value: 2, roots: [2], branches: [2] });
    expect(freeDofCount3(d.construction, d.resolved)).toBe(0);
    expect(dataView(d.construction, 0).params).toEqual([{ sym: 'm', text: 'm = 2', open: false }]);
  });

  it('the figure parameter of a coord-sym POINT: «M(k,1,3)» then «k = 3» → M = (3, 1, 3)', () => {
    ['M(k,1,3)', 'k = 3'].forEach(submit);
    expectAllOk();
    expectPoint('M', 3, 1, 3);
  });

  it('a named component on ANOTHER axis: «D(3,p,0)» then «p=3» → D = (3, 3, 0)', () => {
    [BOX, 'D(3,p,0)', 'p=3'].forEach(submit);
    expectAllOk();
    expectPoint('D', 3, 3, 0);
  });

  it('a letter with TWO owners (a component name AND a pivot symbol) reaches both', () => {
    [BOX, 'C(p,1,0)', 'D(p²,1,0)', 'p=3'].forEach(submit);
    expectAllOk();
    expect(at('C').x).toBeCloseTo(3, 6);
    expect(at('D').x).toBeCloseTo(9, 6);
  });

  it('«p שלילי» asks the SAME resolver: a two-owner letter’s sign reaches both owners', () => {
    [BOX, 'C(p,1,0)', 'D(p²,1,0)', 'p שלילי'].forEach(submit);
    expectAllOk();
    expect(at('C').x).toBeLessThan(0);
    expect(derived().resolved.pivot?.pinSymbols?.p ?? 0).toBeLessThan(0);
  });

  it('a later value REPLACES the earlier pin (the הציבו semantics, unchanged): p=3 then p=4 → C.x = 16', () => {
    [BOX, 'C(p²,1,0)', 'p=3', 'p=4'].forEach(submit);
    expectAllOk();
    expectPoint('C', 16, 1, 0);
  });
});

describe('#902 — honesty: the value is knowledge, and it is seed-stable', () => {
  beforeEach(reset);

  it('the data panel prints «p = 3» (open before, determined after) and the DOF cue drops by exactly one', () => {
    [BOX, 'C(p²,1,0)'].forEach(submit);
    const before = derived();
    expect(dataView(before.construction, 0).params).toEqual([{ sym: 'p', text: 'p = ?', open: true }]);
    const dofBefore = freeDofCount3(before.construction, before.resolved);
    submit('p=3');
    const after = derived();
    expect(dataView(after.construction, 0).params).toEqual([{ sym: 'p', text: 'p = 3', open: false }]);
    expect(freeDofCount3(after.construction, after.resolved)).toBe(dofBefore - 1);
  });

  it('every seed resolves p to 3 and C to (9, 1, 0) — a pinned symbol never varies with «show another configuration»', () => {
    [BOX, 'C(p²,1,0)', 'p=3'].forEach(submit);
    const c = derived().construction;
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const r = resolve3(c, seed);
      expect(r.pivot?.pinSymbols?.p, `seed ${seed}`).toBe(3);
      const C = r.positions.get('C')!;
      expect(C.x, `seed ${seed}: C.x`).toBeCloseTo(9, 6);
      expect(C.y, `seed ${seed}: C.y`).toBeCloseTo(1, 6);
      expect(C.z, `seed ${seed}: C.z`).toBeCloseTo(0, 6);
    }
  });
});

describe('#902 — refusals (widening a namespace must not turn a real refusal into a silent no-op)', () => {
  beforeEach(reset);

  it('a letter the figure genuinely does not carry still refuses unknown-symbol, and mints nothing', () => {
    submit(BOX);
    const n = state().facts.length;
    submit('q=3');
    expect(state().facts).toHaveLength(n);
    expect(err()).toEqual({ code: 'unknown-symbol', id: 'q' });
  });

  it('a value that contradicts the figure is refused, naming the statement and its partners (keep-prior)', () => {
    [BOX, 'C(p²,1,0)', 'C(4,1,0)'].forEach(submit); // x = p² and x = 4 ⇒ p = ±2
    expectAllOk();
    const n = state().facts.length;
    submit('p=3');
    expect(state().facts).toHaveLength(n);
    expect(err()).toEqual({ code: 'givens-contradict', stated: 'p=3', others: ['C(p²,1,0)', 'C(4,1,0)'] });
    expectPoint('C', 4, 1, 0);
  });

  it('a value the parameter’s geometric givens admit no root for is the honest no-roots, naming the statement', () => {
    ['ישר l x=(-1,5,-11)+t(m-1,5-m,-2)', 'מישור π: 3x+my+(m+6)z+4=0', 'l ⊥ π'].forEach(submit); // pins m = −5
    expectAllOk();
    expect(derived().resolved.param?.value).toBe(-5);
    const n = state().facts.length;
    submit('m = 100');
    expect(state().facts).toHaveLength(n);
    expect(err()).toEqual({ code: 'no-roots', sym: 'm', stated: 'm = 100', others: ['l ⊥ π'] });
    submit('m = -5'); // the consistent value is accepted, and the figure is unchanged
    expectAllOk();
    expect(derived().resolved.param).toEqual({ name: 'm', value: -5, roots: [-5], branches: [-5] });
    // a second value REPLACES the first without changing any count — the contradiction it introduces
    // must still be blamed on the new statement, never on the innocent earlier one
    const n2 = state().facts.length;
    submit('m = 100');
    expect(state().facts).toHaveLength(n2);
    expect(err()).toEqual({ code: 'no-roots', sym: 'm', stated: 'm = 100', others: ['l ⊥ π', 'm = -5'] });
    expectFactsOk(); // the earlier «m = -5» stays green — it was never the statement at fault
  });

  it('a second value on a PIVOT symbol is blamed for its own contradiction (k = 2 then k = 5 on the #801 prism)', () => {
    ["מנסרה ישרה משולשת ABCA'B'C'", "AA'=(k-1,k-7,k+1)", 'AC=(k+1,0,k-3)', 'AB=(k-1,k,3)', 'k = 2'].forEach(submit);
    expectAllOk();
    const n = state().facts.length;
    submit('k = 5');
    expect(state().facts).toHaveLength(n);
    expect(err()).toMatchObject({ code: 'givens-contradict', stated: 'k = 5' });
    expectFactsOk(); // the earlier «k = 2» stays green — it was never the statement at fault
  });
});

describe('#902 — the two routes the re-key could silently break are unchanged', () => {
  beforeEach(reset);

  it('the vec-def route: «SN = k·SC» then «k = 1/2» still places N at the midpoint of SC', () => {
    ['פירמידה ABCDS שבסיסה ריבוע', 'נסמן: AD = u, AB = v, AS = w', 'SN = k·SC', 'k = 1/2'].forEach(submit);
    expectAllOk();
    const S = at('S');
    const C = at('C');
    const N = at('N');
    for (const axis of ['x', 'y', 'z'] as const) expect(N[axis], axis).toBeCloseTo((S[axis] + C[axis]) / 2, 6);
  });

  it('the angle-label route: «∠SAB = α» then «α = 70» still drives the angle to 70° at every seed', () => {
    ['פירמידה SABCD שבסיסה ריבוע', '∠SAB = α', 'α = 70'].forEach(submit);
    expectAllOk();
    const c = derived().construction;
    expect(c.symbolPins).toEqual([]); // an angle label is not a solver symbol — no value pin is recorded
    for (const seed of [0, 1, 2]) {
      const pos = resolve3(c, seed).positions;
      const u = sub3(pos.get('S')!, pos.get('A')!);
      const v = sub3(pos.get('B')!, pos.get('A')!);
      const deg = (Math.acos(dot3(u, v) / (norm3(u) * norm3(v))) * 180) / Math.PI;
      expect(deg, `seed ${seed}`).toBeCloseTo(70, 3);
    }
  });
});
