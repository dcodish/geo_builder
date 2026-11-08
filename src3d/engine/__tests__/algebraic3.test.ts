/**
 * V2 engine tests — the algebraic lane on the 2022-Q2 oracles (worked by hand):
 * roots a = ±1; membership selects a = −1; B = (2,−2,3); ℓ: x = (0,−5,3)+t(1,0,0);
 * C = (2,−5,3); |AB| = 3; area(ABC) = 4.5.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../apply';
import { CLAIM_RESIDUALS3, claimResidual3, verifyClaim } from '../claims';
import { paramRoots, resolve3 } from '../evaluate';
import { emptyConstruction3, type Claim3, type Command3, type Construction3, type LinExpr } from '../types';

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

/**
 * #1896 (ADR-3D-433) — A SCALAR GIVEN ON A COORD-SYM POINT PINS THE PARAMETER, whatever arm records it.
 *
 * «A(0,0,0) · B(k-1,k,3) · C(k+1,0,k-3) · AB ⊥ AC» was refused «בדקו את החישוב» though k = 2 and k = −5 satisfy it:
 * ADR-3D-032 routed three claim kinds, from the `claim` arm only, and `pinParam` kept three hand-written residuals. The
 * one recorder (`recordClaim3`) asks `pinsCoordParam3` of every claim before any drive, and the root-find solves the
 * verifier's own residual (`CLAIM_RESIDUALS3`). These call the reducer, the resolver and the verifier; the operator's
 * sequence is the fixture `coord-sym-perp-1896.geo3.json`.
 */
describe('#1896 — every scalar given on a coord-sym point pins the parameter (ADR-3D-433)', () => {
  const A: Command3 = { type: 'point3', id: 'A', x: 0, y: 0, z: 0 };
  const B = { type: 'point3', id: 'B', x: null, y: null, z: 3, syms: ['k', 'k', null], symExprs: [{ terms: [{ sym: 'k', k: 1 }], c: -1 }, { terms: [{ sym: 'k', k: 1 }], c: 0 }, null], srcs: ['k-1', 'k', '3'] } as Command3;
  const C = { type: 'point3', id: 'C', x: null, y: 0, z: null, syms: ['k', null, 'k'], symExprs: [{ terms: [{ sym: 'k', k: 1 }], c: 1 }, null, { terms: [{ sym: 'k', k: 1 }], c: -3 }], srcs: ['k+1', '0', 'k-3'] } as Command3;
  const D: Command3 = { type: 'point3', id: 'D', x: 1, y: 2, z: 0 };
  const FIG = [A, B, C, D];
  const pair = (from: string, to: string) => ({ kind: 'pair' as const, from, to });
  const PERP = { type: 'cos-angle', u: pair('A', 'B'), v: pair('A', 'C'), cos: 0 } as Command3;
  const RATIO: Command3 = { type: 'claim', claim: { type: 'length-ratio', a1: 'A', b1: 'B', a2: 'A', b2: 'C', p: 1, q: 2 } };
  const SEEDS = Array.from({ length: 24 }, (_, s) => s);

  it('the report: «AB ⊥ AC» is a parameter given, k ∈ {−5, 2}, both drawn across the seeds, AB·AC = 0 at every one', () => {
    const c = build([...FIG, PERP]);
    expect(c.paramGivens.map((g) => g.type)).toEqual(['cos-angle-eq']);
    expect(c.claims).toContain(c.paramGivens[0]); // the same object: the claim stays the arbiter
    expect(c.scalarPins).toEqual([]);
    const ks = new Set<number>();
    for (const s of SEEDS) {
      const r = resolve3(c, s);
      expect(r.param?.roots).toEqual([-5, 2]);
      ks.add(r.param!.value);
      const [a, b, cc] = ['A', 'B', 'C'].map((id) => r.positions.get(id)!);
      expect((b.x - a.x) * (cc.x - a.x) + (b.y - a.y) * (cc.y - a.y) + (b.z - a.z) * (cc.z - a.z)).toBeCloseTo(0, 12);
    }
    expect([...ks].sort((x, y) => x - y)).toEqual([-5, 2]);
    expect(resolve3(c, 0).param!.value).not.toBe(resolve3(c, 1).param!.value); // «הציגו תצורה אחרת» switches
    expect(verifyClaim(c.paramGivens[0], c, 0)).toBe(true);
  });

  it('a sign given selects: «k > 0» first leaves one configuration, k = 2', () => {
    const c = build([...FIG, { type: 'param-sign', sym: 'k', positive: true } as Command3, PERP]);
    for (const s of SEEDS) expect(resolve3(c, s).param?.branches).toEqual([2]);
  });

  /** The census: every arm that records a scalar claim, on the coord-sym figure — each lands in `paramGivens`, no pivot pin. */
  const ARMS: [string, Command3[], string][] = [
    ['«AB ⊥ AC» (cos-angle)', [PERP], 'cos-angle-eq'],
    ['«AB = 5» (claim)', [{ type: 'claim', claim: { type: 'length-eq', a: 'A', b: 'B', value: 5 } }], 'length-eq'],
    ['«שטח המשולש ABC = 10» (claim)', [{ type: 'claim', claim: { type: 'area-eq', ids: ['A', 'B', 'C'], value: 10 } }], 'area-eq'],
    ['«AB : AC = 1 : 2» (claim)', [RATIO], 'length-ratio'],
    ['«זווית BAC = 90» (claim)', [{ type: 'claim', claim: { type: 'vertex-angle-eq', vertex: 'A', p: 'B', q: 'C', deg: 90 } }], 'vertex-angle-eq'],
    ['«הזווית בין AB לבין AC היא 90» (claim)', [{ type: 'claim', claim: { type: 'angle-seg-eq', a1: 'A', b1: 'B', a2: 'A', b2: 'C', deg: 90 } }], 'angle-seg-eq'],
    ['«|AB + AC| = 5» (mag-val)', [{ type: 'mag-val', e: [{ coeff: 1, atom: pair('A', 'B') }, { coeff: 1, atom: pair('A', 'C') }], value: 5 } as Command3], 'mag-val'],
    ['«|AB + AC| = 2|AB|» (mag-rel)', [{ type: 'mag-rel', e1: [{ coeff: 1, atom: pair('A', 'B') }, { coeff: 1, atom: pair('A', 'C') }], e2: [{ coeff: 1, atom: pair('A', 'B') }], c: 2 } as Command3], 'mag-rel'],
    ['«∠BAC = ∠BAD» (angle-pair-eq)', [{ type: 'angle-pair-eq', a: pair('A', 'B'), b: pair('A', 'C'), c: pair('A', 'B'), d: pair('A', 'D') } as Command3], 'cos-eq'],
    ['«הזווית בין הישר AB למישור ACD היא 30» (line-plane-angle)', [{ type: 'line-plane-angle', a: 'A', b: 'B', plane: ['A', 'C', 'D'], deg: 30 } as Command3], 'line-plane-angle'],
    ['«אורך AB שווה לאורך AC» (length-rel)', [{ type: 'length-rel', a1: 'A', b1: 'B', rhs: { pair: ['A', 'C'] }, c: 1 } as Command3], 'length-rel'],
    ['«AB מקביל למישור ACD» (seg-plane-rel)', [{ type: 'seg-plane-rel', rel: 'parallel', a: 'A', b: 'B', plane: ['A', 'C', 'D'] } as Command3], 'par-plane'],
  ];
  for (const [label, cmds, kind] of ARMS) {
    it(`the census: ${label} is a parameter given`, () => {
      const c = build([...FIG, ...cmds]);
      expect(c.paramGivens.map((g) => g.type)).toEqual([kind]);
      expect(c.claims).toContain(c.paramGivens[0]);
      expect(c.scalarPins).toEqual([]);
    });
  }

  it('a kind that is not one scalar equation is never routed: «AB ⊥ ACD» stays the claim it was', () => {
    const c = build([...FIG, { type: 'seg-plane-rel', rel: 'perp', a: 'A', b: 'B', plane: ['A', 'C', 'D'] } as Command3]);
    expect(c.paramGivens).toEqual([]);
    expect(c.claims.map((g) => g.type)).toContain('perp-plane');
  });

  it('the twins are unchanged: «זווית BAC = 90» and the line angle give the same roots, «AB = 5» its own', () => {
    const twins: Claim3[] = [
      { type: 'vertex-angle-eq', vertex: 'A', p: 'B', q: 'C', deg: 90 },
      { type: 'angle-seg-eq', a1: 'A', b1: 'B', a2: 'A', b2: 'C', deg: 90 },
    ];
    for (const claim of twins) expect(resolve3(build([...FIG, { type: 'claim', claim }]), 0).param?.roots).toEqual([-5, 2]);
    const len = resolve3(build([...FIG, { type: 'claim', claim: { type: 'length-eq', a: 'A', b: 'B', value: 5 } }]), 0).param!;
    expect(len.roots.map((k) => +k.toFixed(9))).toEqual([-2.283882181, 3.283882181]); // 2k² − 2k + 10 = 25
  });

  it('an area with roots records it: «שטח המשולש ABC = 10» holds at the drawn values', () => {
    const c = build([...FIG, { type: 'claim', claim: { type: 'area-eq', ids: ['A', 'B', 'C'], value: 10 } }]);
    expect(resolve3(c, 0).param?.roots.length).toBe(2);
    expect(verifyClaim(c.claims[c.claims.length - 1], c, 0)).toBe(true);
  });

  it('no k works: no roots (the store refuses `no-roots`, naming the statement)', () => {
    const flatB = { type: 'point3', id: 'B', x: null, y: 1, z: 0, syms: ['k', null, null], symExprs: [{ terms: [{ sym: 'k', k: 1 }], c: 0 }, null, null], srcs: ['k', '1', '0'] } as Command3;
    const flatC = { type: 'point3', id: 'C', x: null, y: 2, z: 0, syms: ['k', null, null], symExprs: [{ terms: [{ sym: 'k', k: 1 }], c: 0 }, null, null], srcs: ['k', '2', '0'] } as Command3;
    expect(resolve3(build([A, flatB, flatC, PERP]), 0).param?.roots).toEqual([]);
    const perpB = { type: 'cos-angle', u: pair('A', 'B'), v: pair('B', 'C'), cos: 0 } as Command3; // −k² + 5k − 20
    expect(resolve3(build([...FIG, perpB]), 0).param?.roots).toEqual([]);
    expect(resolve3(build([...FIG, RATIO]), 0).param?.roots).toEqual([]); // 6k² − 4k + 30
  });

  it('a STATED k is the only candidate (ADR-3D-219 in this lane too): k = 2 holds, k = 3 contradicts, in either order', () => {
    const k = (value: number) => ({ type: 'symbol-value', symbol: 'k', value }) as Command3;
    const ANGLE: Command3 = { type: 'claim', claim: { type: 'vertex-angle-eq', vertex: 'A', p: 'B', q: 'C', deg: 90 } };
    expect(resolve3(build([...FIG, k(2), PERP]), 1).param?.roots).toEqual([2]);
    for (const given of [PERP, ANGLE]) {
      expect(resolve3(build([...FIG, k(3), given]), 0).param?.roots).toEqual([]);
      expect(resolve3(build([...FIG, given, k(3)]), 0).param?.roots).toEqual([]);
    }
  });
});

describe('#1896 — one residual per scalar claim kind (CLAIM_RESIDUALS3)', () => {
  it('every kind has a residual or a stated reason it is not one scalar equation', () => {
    for (const [kind, entry] of Object.entries(CLAIM_RESIDUALS3)) {
      const e = entry as { residual?: unknown; excluded?: string };
      expect('residual' in e !== 'excluded' in e, kind).toBe(true);
      if (e.excluded !== undefined) expect(e.excluded.length, kind).toBeGreaterThan(10);
    }
  });

  it('the verifier is the residual: verifyClaim agrees with |r| ≤ tol, true and false values alike', () => {
    const c = build(CHAIN);
    const pos = resolve3(c, 0).positions;
    const claims: Claim3[] = [
      { type: 'length-eq', a: 'A', b: 'B', value: 3 },
      { type: 'length-eq', a: 'A', b: 'B', value: 2 },
      { type: 'area-eq', ids: ['A', 'B', 'C'], value: 4.5 },
      { type: 'area-eq', ids: ['A', 'B', 'C'], value: 5 },
      { type: 'vertex-angle-eq', vertex: 'B', p: 'A', q: 'C', deg: 90 },
      { type: 'vertex-angle-eq', vertex: 'B', p: 'A', q: 'C', deg: 60 },
      { type: 'length-ratio', a1: 'A', b1: 'B', a2: 'B', b2: 'C', p: 1, q: 1 },
      { type: 'cos-angle-eq', u: { kind: 'pair', from: 'B', to: 'A' }, v: { kind: 'pair', from: 'B', to: 'C' }, cos: 0 },
    ];
    for (const claim of claims) {
      const res = claimResidual3(claim, c, pos);
      expect(res, claim.type).not.toBeNull();
      expect(verifyClaim(claim, c, 0), JSON.stringify(claim)).toBe(Math.abs(res!.r) <= res!.tol);
    }
  });
});
