/**
 * V1 symbolic-layer tests: expression evaluation, Cramer decomposition, claim
 * verification (multi-seed), centroid, and the closed-form in-span drive —
 * exercised on the actual corpus geometry (2020 prism / 2023 cube).
 */

import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../apply';
import { verifyClaim } from '../claims';
import { checkInSpan, evaluate3 } from '../evaluate';
import { emptyConstruction3, type Claim3, type Command3, type Construction3, type VecExpr } from '../types';
import { decompose3, evalExpr } from '../vecExpr';
import { dist3, norm3, sub3, v3 } from '../vec3';

const CUBE_IDS = ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"];

function build(...cmds: Command3[]): Construction3 {
  let c = emptyConstruction3();
  for (const cmd of cmds) {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(`apply failed: ${JSON.stringify(r.error)}`);
    c = r.next;
  }
  return c;
}

const named = (name: string, coeff = 1) => ({ coeff, atom: { kind: 'named', name } }) as VecExpr[number];
const pair = (from: string, to: string, coeff = 1) => ({ coeff, atom: { kind: 'pair', from, to } }) as VecExpr[number];

const CUBE_BASIS: Command3[] = [
  { type: 'solid', kind: 'cube', ids: CUBE_IDS },
  { type: 'name-vector', name: 'u', from: 'A', to: 'B' },
  { type: 'name-vector', name: 'v', from: 'A', to: 'D' },
  { type: 'name-vector', name: 'w', from: 'A', to: "A'" },
];

describe('decompose3', () => {
  it('recovers coefficients over an orthonormal basis', () => {
    expect(decompose3(v3(2, 3, 4), v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1))).toEqual([2, 3, 4]);
  });
  it('returns null for a dependent (non-basis) triple', () => {
    expect(decompose3(v3(1, 1, 1), v3(1, 0, 0), v3(2, 0, 0), v3(0, 0, 1))).toBeNull();
  });
});

describe('evalExpr on the cube basis', () => {
  it('u + v equals the face diagonal AC', () => {
    const c = build(...CUBE_BASIS);
    const pos = evaluate3(c, 0);
    const sum = evalExpr([named('u'), named('v')], c, pos)!;
    const ac = evalExpr([pair('A', 'C')], c, pos)!;
    expect(norm3(sub3(sum, ac))).toBeCloseTo(0, 12);
  });
});

describe('claims (multi-seed verification)', () => {
  it('2023-Q2 ב: CE = −⅓u − ⅓v + ⅓w holds; a wrong decomposition is refuted', () => {
    const c = build(...CUBE_BASIS, { type: 'centroid3', id: 'E', of: ['B', "C'", 'D'] });
    const good: Claim3 = { type: 'vec-eq', lhs: [pair('C', 'E')], rhs: [named('u', -1 / 3), named('v', -1 / 3), named('w', 1 / 3)] };
    const bad: Claim3 = { type: 'vec-eq', lhs: [pair('C', 'E')], rhs: [named('u', 1 / 3), named('v', -1 / 3), named('w', 1 / 3)] };
    expect(verifyClaim(good, c, 0)).toBe(true);
    expect(verifyClaim(bad, c, 0)).toBe(false);
  });

  it('2023-Q2 א: CA′ ⊥ plane BC′D holds; ⊥ to a face plane it is oblique to is refuted', () => {
    const c = build(...CUBE_BASIS);
    expect(verifyClaim({ type: 'perp-plane', seg: ['C', "A'"], plane: ['B', "C'", 'D'] }, c, 0)).toBe(true);
    expect(verifyClaim({ type: 'perp-plane', seg: ['C', "A'"], plane: ['B', "B'", "C'"] }, c, 0)).toBe(false);
  });

  it('2023-Q2 ב(2): E, C, A′ collinear holds; E, B, A′ is refuted', () => {
    const c = build(...CUBE_BASIS, { type: 'centroid3', id: 'E', of: ['B', "C'", 'D'] });
    expect(verifyClaim({ type: 'collinear3', ids: ['E', 'C', "A'"] }, c, 0)).toBe(true);
    expect(verifyClaim({ type: 'collinear3', ids: ['E', 'B', "A'"] }, c, 0)).toBe(false);
  });

  it('a claim true only by coincidence at one seed is refuted by the sweep (free-dim figure)', () => {
    // On a BOX (free depth/height), u+v+w = AC' always holds (structural) — but a
    // NUMERIC equality like AB = AD only holds if depth happens to be 1. Structural ✓:
    const c = build(
      { type: 'solid', kind: 'box', ids: CUBE_IDS },
      { type: 'name-vector', name: 'u', from: 'A', to: 'B' },
      { type: 'name-vector', name: 'v', from: 'A', to: 'D' },
      { type: 'name-vector', name: 'w', from: 'A', to: "A'" },
    );
    expect(verifyClaim({ type: 'vec-eq', lhs: [named('u'), named('v'), named('w')], rhs: [pair('A', "C'")] }, c, 0)).toBe(true);
    expect(verifyClaim({ type: 'vec-eq', lhs: [pair('A', 'B')], rhs: [pair('A', 'D')] }, c, 0)).toBe(false);
  });
});

describe('the 2020-Q2 prism end-to-end (engine level)', () => {
  const PRISM: Command3[] = [
    { type: 'solid', kind: 'prism3', ids: ['A', 'B', 'C', "A'", "B'", "C'"] },
    { type: 'point-on-segment3', id: 'M', a: "B'", b: "C'", t: 0.5 },
    { type: 'point-on-segment3', id: 'K', a: 'A', b: "A'", t: 2 / 3 },
    { type: 'name-vector', name: 'w', from: 'A', to: "A'" },
    { type: 'name-vector', name: 'v', from: 'K', to: 'C' },
    { type: 'name-vector', name: 'u', from: 'K', to: 'B' },
  ];

  it('א: AM = ½u + ½v + 5/3·w verifies across seeds; the wrong answer is refuted', () => {
    const c = build(...PRISM);
    const good: Claim3 = { type: 'vec-eq', lhs: [pair('A', 'M')], rhs: [named('u', 0.5), named('v', 0.5), named('w', 5 / 3)] };
    const bad: Claim3 = { type: 'vec-eq', lhs: [pair('A', 'M')], rhs: [named('u', 1), named('v', 1), named('w', 1)] };
    expect(verifyClaim(good, c, 0)).toBe(true);
    expect(verifyClaim(bad, c, 0)).toBe(false);
  });

  it('ב: P on AM with KP ∈ span{u,v} lands at t = 2/5 (closed form), for every seed', () => {
    const c = build(...PRISM, { type: 'point-in-span', id: 'P', a: 'A', b: 'M', vecFrom: 'K', span: ['u', 'v'] });
    for (const seed of [0, 1, 7]) {
      const pos = evaluate3(c, seed);
      const t = dist3(pos.get('P')!, pos.get('A')!) / dist3(pos.get('M')!, pos.get('A')!);
      expect(t).toBeCloseTo(2 / 5, 10);
      const def = c.points.get('P')!;
      if (def.kind === 'in-span') expect(checkInSpan(c, 'P', def, pos)).toBe('ok');
    }
    // and the answer claim: KP = ⅕u + ⅕v
    expect(
      verifyClaim({ type: 'vec-eq', lhs: [pair('K', 'P')], rhs: [named('u', 1 / 5), named('v', 1 / 5)] }, c, 0),
    ).toBe(true);
  });

  it('an unsatisfiable span condition is flagged, never silently drawn', () => {
    // On the cube: P on AB with D'P ∈ span{u,v} — the w-coefficient of D'P is −1 for every t.
    const c = build(...CUBE_BASIS, { type: 'point-in-span', id: 'P', a: 'A', b: 'B', vecFrom: "D'", span: ['u', 'v'] });
    const pos = evaluate3(c, 0);
    const def = c.points.get('P')!;
    if (def.kind === 'in-span') expect(checkInSpan(c, 'P', def, pos)).toBe('no-solution');
  });
});

describe('apply validation (V1 commands)', () => {
  it('naming needs existing endpoints, a fresh single-lowercase name', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    expect(applyCommand3(c, { type: 'name-vector', name: 'uv', from: 'A', to: 'B' })).toMatchObject({ ok: false, error: { code: 'bad-name' } });
    expect(applyCommand3(c, { type: 'name-vector', name: 'u', from: 'A', to: 'X' })).toMatchObject({ ok: false, error: { code: 'unknown-point', id: 'X' } });
    const named1 = build(...CUBE_BASIS);
    expect(applyCommand3(named1, { type: 'name-vector', name: 'u', from: 'B', to: 'C' })).toMatchObject({ ok: false, error: { code: 'already-defined', id: 'u' } });
  });

  it('segment3 is idempotent and never duplicates a solid edge', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS }, { type: 'segment3', a: 'C', b: "A'" });
    expect(c.segments).toEqual([['C', "A'"]]);
    const again = applyCommand3(c, { type: 'segment3', a: "A'", b: 'C' });
    expect(again.ok && again.next.segments.length).toBe(1);
    const edge = applyCommand3(c, { type: 'segment3', a: 'A', b: 'B' }); // a cube edge — no aux duplicate
    expect(edge.ok && edge.next.segments.length).toBe(1);
  });

  it('a claim referencing an undeclared vector is refused at apply time', () => {
    const c = build({ type: 'solid', kind: 'cube', ids: CUBE_IDS });
    const r = applyCommand3(c, { type: 'claim', claim: { type: 'vec-eq', lhs: [pair('A', 'C')], rhs: [named('u')] } });
    expect(r).toMatchObject({ ok: false, error: { code: 'unknown-vector', id: 'u' } });
  });

  it('in-span demands a full 3-vector basis', () => {
    const c = build(
      { type: 'solid', kind: 'cube', ids: CUBE_IDS },
      { type: 'name-vector', name: 'u', from: 'A', to: 'B' },
      { type: 'name-vector', name: 'v', from: 'A', to: 'D' },
    );
    const r = applyCommand3(c, { type: 'point-in-span', id: 'P', a: 'A', b: 'C', vecFrom: 'B', span: ['u', 'v'] });
    expect(r).toMatchObject({ ok: false, error: { code: 'need-basis' } });
  });
});
