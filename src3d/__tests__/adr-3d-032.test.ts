/**
 * ADR-3D-032 — the תיבה exam's parts ג+ד (operator dev-test, 2026-07-09):
 *   (1) a named point-run plane surfaces its DERIVED equation in the data panel —
 *       standard form (`ABB'A': 20x - y + 2z - 5 = 0`, what the exam asks to find)
 *       + a parametric form — gated by the multi-sample knowledge discipline
 *       (an under-determined plane prints nothing);
 *   (2) `M(k,1,3)` — a NEW point with ONE symbolic coordinate is a coord-sym point
 *       (k = the figure parameter, a sampled free DOF), `k הוא פרמטר חיובי` selects
 *       the branch, and the angle given `גודל הזווית שבין הישר AB ובין הישר AM הוא 60`
 *       PINS k by a post-pivot 1-DOF root-find → k = 2√15 (the book's part-ד answer).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { parse3 } from '../parser/parse3';
import { HOME_CAMERA } from '../render/camera';
import { buildScene3 } from '../render/scene3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);
const cmd = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};

/** The exam's established base (ADR-3D-031 Am.): box + face plane + B + line AB + |AB| + sign. */
const BASE = [
  'תיבה',
  "מישור A'B'C'D' הוא x+4y-8z-142=0",
  'B(0,7,6)',
  'משוואת הישר AB היא x = (0,7,6) + t(0,2,1)',
  'אורך המקצוע AB הוא 5√5',
  'שיעור ה-y של הקודקוד A שלילי',
];

describe('ADR-3D-032 — parse', () => {
  it('M(k,1,3) keeps the symbol; the appositive sign clause rides; standalone param-sign', () => {
    // #2077 (ADR-3D-368): + `srcs`, the typed text — display only
    expect(cmd('M(k,1,3)')).toEqual([{ type: 'point3', id: 'M', x: null, y: 1, z: 3, syms: ['k', null, null], srcs: ['k', '1', '3'] }]);
    expect(cmd('נתונה נקודה M(k,1,3), k הוא פרמטר חיובי')).toEqual([
      { type: 'point3', id: 'M', x: null, y: 1, z: 3, syms: ['k', null, null], srcs: ['k', '1', '3'] },
      { type: 'param-sign', sym: 'k', positive: true },
    ]);
    expect(cmd('point M(k,1,3), k is a positive parameter')).toHaveLength(2);
    expect(cmd('k הוא פרמטר חיובי')).toEqual([{ type: 'param-sign', sym: 'k', positive: true }]);
    expect(cmd('k is a positive parameter')).toEqual([{ type: 'param-sign', sym: 'k', positive: true }]);
    // Am. 2 — the operator's separate-input forms: bare verbal + the inequality
    const pos = [{ type: 'param-sign', sym: 'k', positive: true }];
    expect(cmd('k חיובי')).toEqual(pos);
    expect(cmd('k הוא חיובי')).toEqual(pos);
    expect(cmd('k>0')).toEqual(pos);
    expect(cmd('k > 0')).toEqual(pos);
    expect(cmd('k is positive')).toEqual(pos);
    expect(cmd('k < 0')).toEqual([{ type: 'param-sign', sym: 'k', positive: false }]);
    expect(cmd('M(k,1,3), k>0')).toHaveLength(2); // the appositive tail takes the same family
  });
  it('the exam angle wording parses (גודל…שבין הישר…ובין הישר…)', () => {
    expect(cmd('גודל הזווית שבין הישר AB ובין הישר AM הוא 60')).toMatchObject([
      { type: 'segment3', a: 'A', b: 'B' },
      { type: 'segment3', a: 'A', b: 'M' },
      { type: 'claim', claim: { type: 'angle-seg-eq', a1: 'A', b1: 'B', a2: 'A', b2: 'M', deg: 60 } },
    ]);
    expect(cmd('the angle between line AB and line AM is 60')).toHaveLength(3);
    // the operator's exact keystrokes (Am.): the זוית spelling + the bare ו connector
    expect(cmd('הזוית בין AB ו AM היא 60')).toMatchObject([
      { type: 'segment3', a: 'A', b: 'B' },
      { type: 'segment3', a: 'A', b: 'M' },
      { type: 'claim', claim: { type: 'angle-seg-eq', a1: 'A', b1: 'B', a2: 'A', b2: 'M', deg: 60 } },
    ]);
  });
});

describe('ADR-3D-032 — the data panel derives a forced plane equation (part ג)', () => {
  beforeEach(reset);

  it("מישור ABB'A' on the determined figure prints standard + parametric forms", () => {
    for (const u of BASE) submit(u);
    submit("מישור ABB'A'");
    expect(state().lastError).toBeNull();
    const panel = dataView(derived().construction, state().seed);
    expect(panel.planes).toContain("ABB'A': 20x - y + 2z - 5 = 0");
    // #823: the parametric form is written against the plane's own symbol. This figure has TWO planes
    // (A'B'C'D' is π1, and prints only its standard form), so ABB'A' is π2 — the number follows the
    // figure's plane enumeration, not the order in which parametric rows happen to be printable.
    expect(panel.planes).toContain("ABB'A': π2 = (0, -3, 1) + t·(0, 10, 5) + s·(2, 8, -16)");
  });

  it('an UNDER-determined plane prints nothing (the multi-sample knowledge gate)', () => {
    submit('תיבה');
    submit('מישור ABCD');
    const panel = dataView(derived().construction, state().seed);
    expect(panel.planes).toEqual([]); // a free box's face plane varies with the sample
  });
});

describe('ADR-3D-032 — M(k,1,3): the coord-sym point (part ד)', () => {
  beforeEach(reset);

  it('unpinned k is a sampled free DOF honouring the stated sign; resample slides M', () => {
    for (const u of BASE) submit(u);
    // the operator's flow: M defined alone, the sign in a SEPARATE input (`k>0`)
    submit('נתונה נקודה M(k,1,3)');
    submit('k>0');
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    const M = d.resolved.positions.get('M')!;
    expect(M.x).toBeGreaterThan(0); // the sign constrains the sample
    expect(M.y).toBeCloseTo(1, 9);
    expect(M.z).toBeCloseTo(3, 9);
    const M1 = derived(1).resolved.positions.get('M')!;
    expect(Math.abs(M1.x - M.x)).toBeGreaterThan(1e-6); // free DOF — the sample varies
  });

  it('the 60° angle given PINS k = 2√15 (the book answer); the sign given selects the branch', () => {
    for (const u of BASE) submit(u);
    submit('נתונה נקודה M(k,1,3), k הוא פרמטר חיובי');
    submit('גודל הזווית שבין הישר AB ובין הישר AM הוא 60');
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    expect(d.resolved.param?.value).toBeCloseTo(2 * Math.sqrt(15), 4);
    expect(d.resolved.param?.roots).toHaveLength(2); // ±2√15 — the sign given picked +
    const M = d.resolved.positions.get('M')!;
    expect(M.x).toBeCloseTo(2 * Math.sqrt(15), 4);
  });

  it('the STATED angle draws an arc + value on the canvas (Am. — operator: "I would like to see the angle")', () => {
    for (const u of BASE) submit(u);
    submit('נתונה נקודה M(k,1,3), k הוא פרמטר חיובי');
    submit('הזוית בין AB ו AM היא 60'); // the exact keystrokes
    expect(state().lastError).toBeNull();
    const d = derived();
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1);
    expect(scene.angles.some((a) => a.text === '60°')).toBe(true);
  });

  it('honest refusals: a sign on an unknown symbol; an impossible angle → no-roots', () => {
    submit('k הוא פרמטר חיובי'); // no k anywhere yet
    expect(state().lastError).toEqual({ code: 'unknown-symbol', id: 'k' });
    for (const u of BASE) submit(u);
    submit('נתונה נקודה M(k,1,3)');
    const n = state().facts.length;
    // |AM| ≥ dist(A, the x-through-(?,1,3) line) — 1 is unreachably small
    submit('אורך המקצוע AM הוא 1');
    expect(state().facts).toHaveLength(n); // keep-prior
    // #492 (ADR-3D-134): the refusal carries WHICH parameter has no value and WHICH statement it
    // refuses — the message says so instead of blaming the student's arithmetic.
    expect(state().lastError).toEqual({ code: 'no-roots', sym: 'k', stated: 'אורך המקצוע AM הוא 1', others: [] });
  });
});

/**
 * #1524 (ADR-3D-477) — A RANGE ON A LETTER, the sign's sibling: «t ≥ 0» (the sign that allows zero), «k ≤ 3», «2 ≤ k ≤ 5»,
 * «k גדול מ-2». Before: every one of these was "not understood"; only the strict sign at zero read.
 */
describe('#1524 — a parameter range: parse', () => {
  const bound = (sym: string, lo: number | null, hi: number | null, loStrict = false, hiStrict = false) => [
    { type: 'param-bound', sym, lo, hi, loStrict, hiStrict },
  ];
  it.each([
    ['t ≥ 0', bound('t', 0, null)],
    ['t >= 0', bound('t', 0, null)],
    ['t ≤ 0', bound('t', null, 0)],
    ['k ≤ 3', bound('k', null, 3)],
    ['k <= 3', bound('k', null, 3)],
    ['k > 2', bound('k', 2, null, true)],
    ['2 < k', bound('k', 2, null, true)],
    ['k ≥ -1.5', bound('k', -1.5, null)],
    ['2 ≤ k ≤ 5', bound('k', 2, 5)],
    ['5 > k > 2', bound('k', 2, 5, true, true)],
    ['k גדול מ-2', bound('k', 2, null, true)],
    ['k גדול או שווה ל-2', bound('k', 2, null)],
    ['k קטן מ-3', bound('k', null, 3, false, true)],
    ['k קטן או שווה ל 3', bound('k', null, 3)],
    ['k לפחות 2', bound('k', 2, null)],
    ['k לכל היותר 3', bound('k', null, 3)],
    ['הפרמטר k הוא מספר גדול מ-2', bound('k', 2, null, true)],
    ['k is at least 2', bound('k', 2, null)],
    ['k is at most 3', bound('k', null, 3)],
    ['the parameter k is greater than or equal to 2', bound('k', 2, null)],
    ['k is less than 3', bound('k', null, 3, false, true)],
  ])('«%s» reads as the range', (u, want) => {
    expect(cmd(u)).toEqual(want);
  });

  it('a strict end at 0, alone, IS the sign — one command whichever way it is spelled', () => {
    expect(cmd('k גדול מ-0')).toEqual([{ type: 'param-sign', sym: 'k', positive: true }]);
    expect(cmd('0 > k')).toEqual([{ type: 'param-sign', sym: 'k', positive: false }]);
  });

  it('the appositive range clause rides the point, like the sign', () => {
    expect(cmd('נתונה נקודה M(k,1,3), k ≥ 0')).toEqual([
      { type: 'point3', id: 'M', x: null, y: 1, z: 3, syms: ['k', null, null], srcs: ['k', '1', '3'] },
      { type: 'param-bound', sym: 'k', lo: 0, hi: null, loStrict: false, hiStrict: false },
    ]);
  });

  it('no theft: a capital pair, a coordinate letter and a mixed chain are not a parameter range', () => {
    for (const u of ['AB > 3', 'x > 0', '2 < k > 5']) expect(parse3(u).ok, u).toBe(false);
    // a two-sided bound around a NON-reserved letter stays the #394 angle-label register's guidance
    expect(parse3('60 < a < 90').ok).toBe(false);
    expect(cmd('60 < t < 90')).toEqual([{ type: 'param-bound', sym: 't', lo: 60, hi: 90, loStrict: true, hiStrict: true }]);
  });
});

describe('#1524 — a parameter range: the figure', () => {
  beforeEach(reset);

  it('a free letter is drawn inside its range at every configuration, beside or far from the default window', () => {
    for (const [u, lo, hi] of [['k ≥ 2', 2, Infinity], ['2 ≤ k ≤ 5', 2, 5], ['k ≥ 5', 5, Infinity], ['k ≤ -4', -Infinity, -4]] as const) {
      reset();
      for (const b of BASE) submit(b);
      submit('נתונה נקודה M(k,1,3)');
      submit(u);
      expect(state().lastError, u).toBeNull();
      const xs = [0, 1, 2, 3].map((sd) => {
        const d = derived(sd);
        expect(Object.values(d.status).every((s) => s === 'ok'), u).toBe(true);
        return d.resolved.positions.get('M')!.x;
      });
      for (const x of xs) expect(x >= lo && x <= hi, `${u}: ${x}`).toBe(true);
      expect(new Set(xs.map((x) => x.toFixed(6))).size, `${u}: still a free DOF`).toBeGreaterThan(1);
    }
  });

  it('a determined letter keeps the root in its range: «k ≥ 0» takes +2√15, «k ≤ 0» takes −2√15', () => {
    for (const [u, want] of [['k ≥ 0', 2 * Math.sqrt(15)], ['k ≤ 0', -2 * Math.sqrt(15)]] as const) {
      reset();
      for (const b of BASE) submit(b);
      submit(`נתונה נקודה M(k,1,3), ${u}`);
      submit('גודל הזווית שבין הישר AB ובין הישר AM הוא 60');
      expect(state().lastError, u).toBeNull();
      for (const sd of [0, 1]) expect(derived(sd).resolved.param?.value, u).toBeCloseTo(want, 4);
    }
  });

  it('REFUSAL: a range no root lies in is refused, naming it; the figure is unchanged', () => {
    for (const b of BASE) submit(b);
    submit('נתונה נקודה M(k,1,3)');
    submit('גודל הזווית שבין הישר AB ובין הישר AM הוא 60');
    const before = state().facts.length;
    submit('k ≥ 8');
    expect(state().lastError).toEqual({ code: 'param-bound-unsatisfiable', id: 'k' });
    expect(state().facts.length).toBe(before);
  });

  it('REFUSAL: a range that contradicts an earlier one refuses the NEWER statement', () => {
    for (const b of BASE) submit(b);
    submit('נתונה נקודה M(k,1,3)');
    submit('k ≥ 2');
    submit('k ≤ 1');
    expect(state().lastError).toEqual({ code: 'param-bound-unsatisfiable', id: 'k' });
    const d = derived();
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    expect(d.resolved.positions.get('M')!.x).toBeGreaterThanOrEqual(2);
  });

  it('REFUSAL: a range on a letter the figure does not carry is the honest unknown-symbol', () => {
    submit('q ≥ 2');
    expect(state().lastError).toEqual({ code: 'unknown-symbol', id: 'q' });
  });

  it('a pin symbol is anchored inside its range («B(2t,t,1) · t ≥ 3»)', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('B(2t,t,1)');
    submit('t ≥ 3');
    expect(state().lastError).toBeNull();
    for (const sd of [0, 1, 2]) {
      const d = derived(sd);
      expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
      expect(d.resolved.pivot?.pinSymbols?.t).toBeGreaterThanOrEqual(3);
    }
  });
});
