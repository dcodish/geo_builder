/**
 * ADR-3D-031: a parametric line NAMED BY A POINT PAIR — the textbook
 * `נתון כי הצגה פרמטרית של הישר AB היא x = (0,7,6) + t(0,2,1)` (operator request
 * 2026-07-09). The pair name lowers to `line3` + an `on-line` per named point;
 * apply is M1-dual (the ADR-3D-015 on-planes shape): a NEW id becomes a free
 * 1-DOF rider ON the line, an EXISTING id becomes a verified membership given.
 * The quick single-letter form `הישר ℓ: x = …` is byte-unchanged.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { freeDofCount3 } from '../engine/evaluate';
import { parse3 } from '../parser/parse3';
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
type V = { x: number; y: number; z: number };
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const cross = (p: V, q: V): V => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x });
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);
const onLine = (p: V, anchor: V, dir: V) => nrm(cross(sub(p, anchor), dir)) <= 1e-7 * Math.max(nrm(sub(p, anchor)) * nrm(dir), 1);

const PAIR_CMDS = [
  { type: 'line3', name: 'AB' },
  { type: 'on-line', id: 'A', line: 'AB' },
  { type: 'on-line', id: 'B', line: 'AB' },
];

describe('ADR-3D-031 — parse: the pair-named parametric line', () => {
  it('the textbook form (the operator-shown sentence)', () => {
    expect(cmd('נתון כי הצגה פרמטרית של הישר AB היא x = (0,7,6) + t(0,2,1)')).toMatchObject(PAIR_CMDS);
  });
  it('משוואת הישר AB היא … (the operator-typed form; no x =)', () => {
    expect(cmd('משוואת הישר AB היא (0,7,6)+t(0,2,1)')).toMatchObject(PAIR_CMDS);
  });
  it('phrasing variants: definite הצגה, colon form, נתון ש glued', () => {
    expect(cmd('ההצגה הפרמטרית של הישר AB היא x = (0,7,6) + t(0,2,1)')).toMatchObject(PAIR_CMDS);
    expect(cmd('הישר AB: x = (0,7,6) + t(0,2,1)')).toMatchObject(PAIR_CMDS);
    expect(cmd('נתון שהצגה פרמטרית של הישר AB היא x = (0,7,6) + t(0,2,1)')).toMatchObject(PAIR_CMDS);
  });
  it('English mirrors', () => {
    expect(cmd('the equation of line AB is (0,7,6) + t(0,2,1)')).toMatchObject(PAIR_CMDS);
    expect(cmd('a parametric representation of line AB is x = (0,7,6)+t(0,2,1)')).toMatchObject(PAIR_CMDS);
  });
  it('primed labels ride along', () => {
    expect(cmd("משוואת הישר A'B היא (0,7,6)+t(0,2,1)")).toMatchObject([
      { type: 'line3', name: "A'B" },
      { type: 'on-line', id: "A'", line: "A'B" },
      { type: 'on-line', id: 'B', line: "A'B" },
    ]);
  });
  it('the quick ℓ form is unchanged (no riders), incl. the widened phrasings', () => {
    expect(cmd('הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)')).toMatchObject([{ type: 'line3', name: 'ℓ', param: 'm' }]);
    expect(cmd('משוואת הישר ℓ היא (0,7,6)+t(0,2,1)')).toMatchObject([{ type: 'line3', name: 'ℓ' }]);
    expect(cmd('משוואת הישר l היא (0,7,6)+t(0,2,1)')).toMatchObject([{ type: 'line3', name: 'ℓ' }]);
  });
});

describe('ADR-3D-031 — build: riders live ON the line', () => {
  beforeEach(reset);

  it('new A,B become free riders on the line; general position; DOF = 2; resample keeps membership', () => {
    submit('נתון כי הצגה פרמטרית של הישר AB היא x = (0,7,6) + t(0,2,1)');
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    const anchor = { x: 0, y: 7, z: 6 };
    const dir = { x: 0, y: 2, z: 1 };
    const A = d.resolved.positions.get('A')!;
    const B = d.resolved.positions.get('B')!;
    expect(onLine(A, anchor, dir)).toBe(true);
    expect(onLine(B, anchor, dir)).toBe(true);
    expect(nrm(sub(A, B))).toBeGreaterThan(1e-6); // distinct riders (general position)
    expect(d.resolved.lines.get('AB')).toBeDefined();
    expect(freeDofCount3(d.construction, d.resolved)).toBe(2);
    // another seed slides the riders but never off the line (ADR-052 free DOF)
    const d1 = derived(1);
    const A1 = d1.resolved.positions.get('A')!;
    expect(onLine(A1, anchor, dir)).toBe(true);
    expect(nrm(sub(A1, A))).toBeGreaterThan(1e-6);
  });

  it('M1: an EXISTING point is a verified membership given', () => {
    submit('A(0,7,6)'); // the anchor itself — on the line
    submit('משוואת הישר AB היא (0,7,6)+t(0,2,1)');
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    expect(d.resolved.positions.get('A')).toMatchObject({ x: 0, y: 7, z: 6 });
    const B = d.resolved.positions.get('B')!;
    expect(onLine(B, { x: 0, y: 7, z: 6 }, { x: 0, y: 2, z: 1 })).toBe(true);
  });

  it('M1 honesty: an existing point OFF the line refuses not-on-line (keep-prior)', () => {
    submit('A(1,1,1)');
    submit('משוואת הישר AB היא (0,7,6)+t(0,2,1)');
    expect(state().lastError).toEqual({ code: 'not-on-line', id: 'A' });
    expect(state().facts).toHaveLength(1); // the bad step never landed
  });
});

describe('ADR-3D-031 Am. — the line equation DRIVES a free solid (operator session, the תיבה exam)', () => {
  beforeEach(reset);

  const anchor = { x: 0, y: 7, z: 6 };
  const dir = { x: 0, y: 2, z: 1 };

  it("the operator's exact sequence: box + face plane + B(0,7,6) + BB' + the AB line equation — A is DRIVEN onto the line", () => {
    submit('תיבה');
    submit("מישור A'B'C'D' הוא x+4y-8z-142=0");
    submit('B(0,7,6)');
    submit("BB'");
    submit('משוואת AB היא (0,7,6)+t(0,2,1)'); // the operator-typed form (no הישר) — deterministic now
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    const A = d.resolved.positions.get('A')!;
    const B = d.resolved.positions.get('B')!;
    expect(nrm(sub(B, anchor))).toBeLessThan(1e-4); // B stays the injected anchor
    expect(onLine(A, anchor, dir)).toBe(true); // the drive flexed the box so A rides the line
    // the box did not degenerate to satisfy the pins
    expect(nrm(sub(A, B))).toBeGreaterThan(0.05);
  });

  it('the exam chain part ב: |AB| = 5√5 + the y-sign given land A at (0,-3,1)', () => {
    submit('תיבה');
    submit("מישור A'B'C'D' הוא x+4y-8z-142=0");
    submit('B(0,7,6)');
    submit('משוואת הישר AB היא x = (0,7,6) + t(0,2,1)');
    submit('אורך המקצוע AB הוא 5√5'); // the copula joins the length separators (ADR-3D-026 class)
    submit('שיעור ה-y של הקודקוד A הוא שלילי'); // the exam wording (הקודקוד + copula)
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    const A = d.resolved.positions.get('A')!;
    expect(A.x).toBeCloseTo(0, 3);
    expect(A.y).toBeCloseTo(-3, 3);
    expect(A.z).toBeCloseTo(1, 3);
  });
});
