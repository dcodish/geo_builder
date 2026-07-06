/**
 * V2 engine tests — the algebraic lane on the 2022-Q2 oracles (worked by hand):
 * roots a = ±1; membership selects a = −1; B = (2,−2,3); ℓ: x = (0,−5,3)+t(1,0,0);
 * C = (2,−5,3); |AB| = 3; area(ABC) = 4.5.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../apply';
import { verifyClaim } from '../claims';
import { paramRoots, resolve3 } from '../evaluate';
import { emptyConstruction3, type Command3, type Construction3, type LinExpr } from '../types';

const e = (k: number, p = 0): LinExpr => ({ k, p });

const CHAIN: Command3[] = [
  { type: 'plane3', name: 'π1', plane: { cx: e(0), cy: e(0), cz: e(1), d: e(-3), src: 'z - 3 = 0' } },
  { type: 'plane3', name: 'π2', plane: { cx: e(0), cy: e(0, 1), cz: e(1), d: e(-8), src: 'ay + z - 8 = 0' }, param: 'a' },
  { type: 'plane-angle', p1: 'π1', p2: 'π2', deg: 45 },
  { type: 'point3', id: 'A', x: 2, y: -2, z: 6 },
  { type: 'on-planes', id: 'A', plane: 'any' },
  { type: 'foot-on-plane', id: 'B', from: 'A', plane: 'π1' },
  { type: 'plane-plane-line', name: 'ℓ', p1: 'π1', p2: 'π2' },
  { type: 'foot-on-line', id: 'C', from: 'B', line: 'ℓ' },
];

function build(cmds: Command3[]): Construction3 {
  let c = emptyConstruction3();
  for (const cmd of cmds) {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(`apply failed: ${JSON.stringify(r.error)}`);
    c = r.next;
  }
  return c;
}

describe('parameter roots (45° between the planes)', () => {
  it('finds exactly a = ±1', () => {
    const c = build(CHAIN.slice(0, 3));
    expect(paramRoots(c)).toEqual([-1, 1]);
  });

  it('an impossible angle has no roots', () => {
    const c = build([
      ...CHAIN.slice(0, 2),
      { type: 'plane-angle', p1: 'π1', p2: 'π2', deg: 95 }, // plane angles are ≤ 90° by definition
    ]);
    expect(paramRoots(c)).toEqual([]);
  });
});

describe('branch selection', () => {
  it('the membership given ("A on one of the planes") SELECTS a = −1, at every seed', () => {
    const c = build(CHAIN);
    for (const seed of [0, 1, 5]) {
      expect(resolve3(c, seed).param?.value).toBe(-1);
    }
  });

  it('without the membership, the seed cycles the branches ("show another configuration")', () => {
    const c = build(CHAIN.filter((cmd) => cmd.type !== 'on-planes'));
    expect(resolve3(c, 0).param?.value).toBe(-1);
    expect(resolve3(c, 1).param?.value).toBe(1);
  });

  it('an unpinned parameter is a FREE sampled DOF (ADR-052), varied by the seed', () => {
    const c = build(CHAIN.slice(0, 2)); // planes only, no angle given
    const v0 = resolve3(c, 0).param!.value;
    const v1 = resolve3(c, 1).param!.value;
    expect(v0).not.toBe(v1);
  });
});

describe('the constructive chain (closed-form oracles)', () => {
  it('foot B, line ℓ, foot C land exactly on the hand-worked values', () => {
    const c = build(CHAIN);
    const r = resolve3(c, 0);
    expect(r.positions.get('B')).toEqual({ x: 2, y: -2, z: 3 });
    expect(r.positions.get('C')).toEqual({ x: 2, y: -5, z: 3 });
    const ln = r.lines.get('ℓ')!;
    expect(Math.abs(ln.dir.x)).toBeCloseTo(1, 12);
    expect(ln.dir.y).toBeCloseTo(0, 12);
    expect(ln.dir.z).toBeCloseTo(0, 12);
    expect(ln.anchor).toEqual({ x: 0, y: -5, z: 3 });
  });

  it('the answers verify: |AB| = 3, area(ABC) = 4.5 — and wrong values refute', () => {
    const c = build(CHAIN);
    expect(verifyClaim({ type: 'length-eq', a: 'A', b: 'B', value: 3 }, c, 0)).toBe(true);
    expect(verifyClaim({ type: 'length-eq', a: 'A', b: 'B', value: 2 }, c, 0)).toBe(false);
    expect(verifyClaim({ type: 'area-eq', ids: ['A', 'B', 'C'], value: 4.5 }, c, 0)).toBe(true);
    expect(verifyClaim({ type: 'area-eq', ids: ['A', 'B', 'C'], value: 5 }, c, 0)).toBe(false);
  });
});

describe('apply validation (V2)', () => {
  it('a second distinct parameter letter is refused (one per figure)', () => {
    const c = build(CHAIN.slice(0, 2));
    const r = applyCommand3(c, {
      type: 'plane3',
      name: 'π3',
      plane: { cx: e(0, 1), cy: e(0), cz: e(1), d: e(0), src: 'bx + z = 0' },
      param: 'b',
    });
    expect(r).toMatchObject({ ok: false, error: { code: 'two-params' } });
  });

  it('feet/lines demand existing planes and points', () => {
    const c = build(CHAIN.slice(0, 4));
    expect(applyCommand3(c, { type: 'foot-on-plane', id: 'B', from: 'A', plane: 'π9' })).toMatchObject({
      ok: false,
      error: { code: 'unknown-plane', id: 'π9' },
    });
    expect(applyCommand3(c, { type: 'foot-on-line', id: 'C', from: 'A', line: 'ℓ' })).toMatchObject({
      ok: false,
      error: { code: 'unknown-line', id: 'ℓ' },
    });
  });
});
