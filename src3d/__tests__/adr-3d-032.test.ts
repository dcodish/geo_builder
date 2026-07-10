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
    expect(cmd('M(k,1,3)')).toEqual([{ type: 'point3', id: 'M', x: null, y: 1, z: 3, syms: ['k', null, null] }]);
    expect(cmd('נתונה נקודה M(k,1,3), k הוא פרמטר חיובי')).toEqual([
      { type: 'point3', id: 'M', x: null, y: 1, z: 3, syms: ['k', null, null] },
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
    expect(panel.planes).toContain("ABB'A': x = (0, -3, 1) + t·(0, 10, 5) + s·(2, 8, -16)");
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
    expect(state().lastError).toEqual({ code: 'no-roots' });
  });
});
