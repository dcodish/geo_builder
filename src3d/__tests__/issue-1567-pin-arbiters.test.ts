/**
 * #1567 (ADR-3D-285) — a length, an angle, a length ratio or a ⊥/∥-to-plane given on a figure that carries a
 * sphere or cone of UNSTATED size is judged, never a green row over a figure that contradicts it.
 *
 * Four sites in `apply.ts` chose "pin" OR "claim" on `freeDims(c) > 0`. `freeDims` counts a revolution's
 * unstated radius/height, and the pivot never drives a revolution — so «|AB| = 5» beside |AB| = 2 became a
 * scalar pin nothing read, with no claim beside it. The fix records the pin's ARBITER beside it (`given: true`,
 * the #1560 `recordPinGiven` seam), judged by `holdsAt`'s claim-level placed-figure rule (ADR-3D-284).
 *
 * Operator ruling 2026-09-29 (option A): «|SO| = 4» on a cone whose height was never stated is refused now;
 * the drive ("a stated length sets the revolution's size") is the separate feature #1569.
 *
 * Every verdict goes through `decideSubmit3`, the real submit decision.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { applyCommand3 } from '../engine/apply';
import { claimSeeds } from '../engine/claims';
import { emptyConstruction3, type Claim3, type Command3, type Construction3 } from '../engine/types';

type St = { facts: Fact3[]; seed: number };

function build(lines: readonly string[]): St {
  let st: St = { facts: [], seed: 0 };
  for (const l of lines) {
    const v = decideSubmit3(st, l);
    if (v.kind !== 'record') throw new Error(`setup line «${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}

const lenAt = (facts: Fact3[], a: string, b: string, seed: number): number => {
  const pos = derive3(facts, seed).positions;
  const p = pos.get(a);
  const q = pos.get(b);
  if (!p || !q) throw new Error(`no ${a}/${b}`);
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
};

/**
 * Whole sequences (setup + the line under test), written as literal arrays so the #1394 parity harvest and the
 * #1560/#1567 invariant below both see them. The last line is the one judged.
 */
const REFUSED: [string, string[]][] = [
  ['R1 a length beside a sphere of unstated size', ['A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)', 'כדור', '|AB| = 5']],
  ['R2 a length ratio beside a sphere', ['A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)', 'כדור', '|AB| = 3|AD|']],
  ['R3 a vertex angle beside a sphere', ['A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)', 'כדור', 'הזווית BAD היא 40']],
  ['R4 a segment ⊥ plane beside a sphere', ['A(0,0,0)', 'B(2,0,0)', 'C(0,2,0)', 'D(0,0,2)', 'E(1,1,0)', 'כדור', 'AE ⊥ BCD']],
  ['R5 a segment ∥ plane beside a sphere', ['A(0,0,0)', 'B(2,0,0)', 'C(0,2,0)', 'D(0,0,2)', 'E(1,1,1)', 'כדור', 'AE ∥ BCD']],
  ['R6 the axis of a cone whose height was never stated', ['חרוט שקודקודו S ומרכז בסיסו O', '|SO| = 4']],
  ['R7 the same, the radius stated and the height not', ['חרוט שקודקודו S ומרכז בסיסו O, רדיוסו 5', '|SO| = 4']],
  ['R8 a length in English beside a sphere', ['A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)', 'sphere', '|AB| = 5']],
  // the vertex angle is 135°; the angle between the LINES is 45° — a vertex angle is judged as a vertex angle
  ['R9 an acute vertex angle where the vertex angle is obtuse', ['A(0,0,0)', 'B(1,0,0)', 'D(-1,1,0)', 'כדור', 'הזווית BAD היא 45']],
];

/** The same statements, TRUE of the figure: they stay green. */
const GREEN: [string, string[]][] = [
  ['G1 a true length beside a sphere', ['A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)', 'כדור', '|AB| = 2']],
  ['G2 a true ratio beside a sphere', ['A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)', 'כדור', '|AB| = |AD|']],
  ['G3 a true angle beside a sphere', ['A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)', 'כדור', 'הזווית BAD היא 90']],
  ['G4 a true ⊥ beside a sphere', ['A(0,0,0)', 'B(2,0,0)', 'C(0,2,0)', 'D(0,0,2)', 'E(1,1,1)', 'כדור', 'AE ⊥ BCD']],
  ['G5 a true ∥ beside a sphere', ['A(0,0,0)', 'B(2,0,0)', 'C(0,2,0)', 'D(0,0,2)', 'E(1,-1,0)', 'כדור', 'AE ∥ BCD']],
  ['G6 a true OBTUSE vertex angle beside a sphere', ['A(0,0,0)', 'B(1,0,0)', 'D(-1,1,0)', 'כדור', 'הזווית BAD היא 135']],
];

/** The controls the issue names: they already refused, and still do. */
const CONTROLS: [string, string[]][] = [
  ['C1 the radius stated', ['A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)', 'כדור שמרכזו O ורדיוסו 3', '|AB| = 5']],
  ['C2 no sphere at all', ['A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)', '|AB| = 5']],
  ['C3 the ratio form that already carried its claim', ['A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)', 'כדור', 'AB:AD = 3:1']],
];

/** A length on a solid still DRIVES the solid — with and without a free-size sphere beside it. */
const DRIVES: [string, string[]][] = [
  ['D1 a cube', ["קובייה ABCDA'B'C'D'", '|AB| = 5']],
  ['D2 a cube and a sphere of unstated size', ["קובייה ABCDA'B'C'D'", 'כדור', '|AB| = 5']],
  ['D3 a box and a sphere of unstated size', ["תיבה ABCDA'B'C'D'", 'כדור', '|AB| = 5']],
];

describe('#1567 — a false given beside a sphere or cone of unstated size is refused (claim-refuted)', () => {
  for (const [title, seq] of REFUSED) {
    it(`${title}: «${seq[seq.length - 1]}»`, () => {
      const st = build(seq.slice(0, -1));
      const v = decideSubmit3(st, seq[seq.length - 1]);
      expect(v.kind).toBe('refused');
      if (v.kind === 'refused') expect(v.error.code).toBe('claim-refuted');
    });
  }

  it('the refusal is the truth: the figure does not carry the stated value at any verification seed', () => {
    const r1 = build(REFUSED[0][1].slice(0, -1));
    for (const s of claimSeeds(0)) expect(lenAt(r1.facts, 'A', 'B', s)).toBeCloseTo(2, 9);
    for (const seq of [REFUSED[5][1], REFUSED[6][1]]) {
      const cone = build(seq.slice(0, -1));
      for (const s of claimSeeds(0)) expect(Math.abs(lenAt(cone.facts, 'S', 'O', s) - 4)).toBeGreaterThan(0.1);
    }
  });
});

describe('#1567 — the same statements, true of the figure, stay green', () => {
  for (const [title, seq] of GREEN) {
    it(`${title}: «${seq[seq.length - 1]}» records ok`, () => {
      const v = decideSubmit3(build(seq.slice(0, -1)), seq[seq.length - 1]);
      expect(v.kind).toBe('record');
      if (v.kind === 'record') expect(derive3(v.facts, v.seed).status[v.fact.id]).toBe('ok');
    });
  }
});

describe('#1567 — the controls stay as they were', () => {
  for (const [title, seq] of CONTROLS) {
    it(`${title}: «${seq[seq.length - 1]}» still refuses claim-refuted`, () => {
      const v = decideSubmit3(build(seq.slice(0, -1)), seq[seq.length - 1]);
      expect(v.kind === 'refused' && v.error.code).toBe('claim-refuted');
    });
  }
  for (const [title, seq] of DRIVES) {
    it(`${title}: «|AB| = 5» records ok and the solid carries it at every verification seed`, () => {
      const v = decideSubmit3(build(seq.slice(0, -1)), seq[seq.length - 1]);
      expect(v.kind).toBe('record');
      if (v.kind !== 'record') return;
      expect(derive3(v.facts, v.seed).status[v.fact.id]).toBe('ok');
      for (const s of claimSeeds(v.seed)) expect(lenAt(v.facts, 'A', 'B', s)).toBeCloseTo(5, 4);
    });
  }
});

describe('#1567 — structural: each of the four pin sites records its arbiter beside the pin', () => {
  const fold = (lines: readonly string[]): Construction3 => {
    let c = emptyConstruction3();
    for (const f of build(lines).facts) for (const cmd of f.cmds) {
      const r = applyCommand3(c, cmd);
      if (!r.ok) throw new Error(`fold: ${JSON.stringify(r.error)}`);
      c = r.next;
    }
    return c;
  };
  const added = (c: Construction3, cmd: Command3): { claims: Claim3[]; pins: string[] } => {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return { claims: r.next.claims.slice(c.claims.length), pins: r.next.scalarPins.slice(c.scalarPins.length).map((p) => p.kind) };
  };
  const c = fold(['A(0,0,0)', 'B(2,0,0)', 'C(0,2,0)', 'D(0,0,2)', 'כדור']);

  it('length → a `length` pin and a given `length-eq`', () => {
    expect(added(c, { type: 'claim', claim: { type: 'length-eq', a: 'A', b: 'B', value: 5 } })).toEqual({
      pins: ['length'], claims: [{ type: 'length-eq', a: 'A', b: 'B', value: 5, given: true }],
    });
  });
  it('a vertex angle → a `vangle` pin and a given SIGNED `cos-angle-eq` over its two rays (the quantity the pin drives)', () => {
    const claim = { type: 'angle-seg-eq', a1: 'A', b1: 'B', a2: 'A', b2: 'D', deg: 120 } as const;
    expect(added(c, { type: 'claim', claim })).toEqual({
      pins: ['vangle'],
      claims: [{ type: 'cos-angle-eq', u: { kind: 'pair', from: 'A', to: 'B' }, v: { kind: 'pair', from: 'A', to: 'D' }, cos: Math.cos((120 * Math.PI) / 180), given: true }],
    });
  });
  it('an angle between disjoint segments → a `seg-angle` pin and a given `angle-seg-eq`', () => {
    const claim = { type: 'angle-seg-eq', a1: 'A', b1: 'B', a2: 'C', b2: 'D', deg: 40 } as const;
    expect(added(c, { type: 'claim', claim })).toEqual({ pins: ['seg-angle'], claims: [{ ...claim, given: true }] });
  });
  it('a length ratio → a `length-rel` pin and a given `length-rel`', () => {
    expect(added(c, { type: 'length-rel', a1: 'A', b1: 'B', rhs: { pair: ['A', 'D'] }, c: 3 }).claims).toEqual([
      { type: 'length-rel', a1: 'A', b1: 'B', a2: 'A', b2: 'D', c: 3, given: true },
    ]);
  });
  it('⊥ / ∥ to a plane → the seg-plane pin and a given `perp-plane` / `par-plane`', () => {
    expect(added(c, { type: 'seg-plane-rel', rel: 'perp', a: 'A', b: 'B', plane: ['B', 'C', 'D'] }).claims).toEqual([
      { type: 'perp-plane', seg: ['A', 'B'], plane: ['B', 'C', 'D'], given: true },
    ]);
    expect(added(c, { type: 'seg-plane-rel', rel: 'parallel', a: 'A', b: 'B', plane: ['B', 'C', 'D'] }).claims).toEqual([
      { type: 'par-plane', seg: ['A', 'B'], plane: ['B', 'C', 'D'], given: true },
    ]);
  });
});
