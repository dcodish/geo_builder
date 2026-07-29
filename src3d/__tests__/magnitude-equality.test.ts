/**
 * #393 + #335 (ADR-3D-107): magnitude equality over vector EXPRESSIONS, chained.
 *
 * `|u|=|v|=1`, `|u|=|v|=|w|` (valueless), `|w+u|=|w-u|`, `|2w+3v|=|3v-2w|`,
 * `|AB+AC|=|AB-AC|`, radical coefficients — all deterministic (the class used to fall
 * to the LLM, which expanded the algebra unreliably and carried a silent-wrong-green
 * tail). M1 at apply: drives a free-dim figure, verifies a determined one; simple
 * unit-coefficient atoms NORMALIZE onto the existing owners (vec-mag / length-eq /
 * length-rel), so no form has two semantics.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { scalePinned } from '../engine/solve3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const cmd = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};
type V = { x: number; y: number; z: number };
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const add = (p: V, q: V): V => ({ x: p.x + q.x, y: p.y + q.y, z: p.z + q.z });
const scale = (p: V, k: number): V => ({ x: k * p.x, y: k * p.y, z: k * p.z });
const dot = (p: V, q: V) => p.x * q.x + p.y * q.y + p.z * q.z;
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);
const seeds = () => [state().seed, state().seed + 1, state().seed + 2];
const vecOf = (pos: Map<string, V>, from: string, to: string) => sub(pos.get(to)!, pos.get(from)!);

describe('parsing (#393/#335) — chains, expressions, coefficients', () => {
  it('chained with a value: |u|=|v|=1 → two mag-val commands (each |·| pinned to 1)', () => {
    expect(cmd('|u|=|v|=1')).toMatchObject([
      { type: 'mag-val', e: [{ coeff: 1, atom: { kind: 'named', name: 'u' } }], value: 1 },
      { type: 'mag-val', e: [{ coeff: 1, atom: { kind: 'named', name: 'v' } }], value: 1 },
    ]);
  });
  it('three-way with a value: |u|=|v|=|w|=1 → three mag-val', () => {
    expect(cmd('|u|=|v|=|w|=1').filter((c) => c.type === 'mag-val')).toHaveLength(3);
  });
  it('a value in ANY link position reads as the common value: |u|=1=|v| ≡ |u|=|v|=1', () => {
    expect(cmd('|u|=1=|v|')).toEqual(cmd('|u|=|v|=1'));
  });
  it('valueless chain: |u|=|v|=|w| → adjacent mag-rel pairs (c=1)', () => {
    expect(cmd('|u|=|v|=|w|').filter((c) => c.type === 'mag-rel')).toMatchObject([
      { e1: [{ atom: { name: 'u' } }], e2: [{ atom: { name: 'v' } }], c: 1 },
      { e1: [{ atom: { name: 'v' } }], e2: [{ atom: { name: 'w' } }], c: 1 },
    ]);
  });
  it('expression magnitudes: |w+u| = |w-u| (the exact prod #335 pair)', () => {
    expect(cmd('|w+u| = |w-u|')).toMatchObject([
      { type: 'mag-rel', e1: [{ coeff: 1, atom: { name: 'w' } }, { coeff: 1, atom: { name: 'u' } }], e2: [{ coeff: 1 }, { coeff: -1 }], c: 1 },
    ]);
    expect(cmd('|2w+3v|=|3v-2w|')).toMatchObject([{ type: 'mag-rel', c: 1 }]);
  });
  it('pair atoms + auxiliary segments: |AB+AC|=|AB-AC| draws AB and AC', () => {
    const cs = cmd('|AB+AC|=|AB-AC|');
    expect(cs.filter((c) => c.type === 'segment3')).toMatchObject([
      { a: 'A', b: 'B' }, { a: 'A', b: 'C' }, { a: 'A', b: 'B' }, { a: 'A', b: 'C' },
    ]);
    expect(cs.at(-1)).toMatchObject({ type: 'mag-rel', c: 1 });
  });
  it('coefficients: √2|u| = |v| and 2|u| = 6, Hebrew שווה ל separator', () => {
    expect(cmd('√2|u| = |v|')).toMatchObject([{ type: 'mag-rel', e1: [{ atom: { name: 'u' } }], c: 1 / Math.SQRT2 }]);
    expect(cmd('2|u| = 6')).toMatchObject([{ type: 'mag-val', e: [{ atom: { name: 'u' } }], value: 3 }]);
    expect(cmd('|u| שווה ל-|v|')).toMatchObject([{ type: 'mag-rel', c: 1 }]);
  });
  it('honest rejections: contradictory values, symbolic coefficients', () => {
    expect(parse3('|u|=1=2').ok).toBe(false);
    expect(parse3('|(1-t)u| = |v|').ok).toBe(false); // a SYMBOL is the #301 boundary — never half-read
  });
  it('no theft: every lengthRel-owned form is byte-identical', () => {
    expect(cmd('|w| = 2')).toEqual([{ type: 'vec-mag', name: 'w', value: 2 }]);
    expect(cmd('|AS| = 12')).toMatchObject([{ type: 'segment3' }, { type: 'claim', claim: { type: 'length-eq', value: 12 } }]);
    expect(cmd('|AS| = |AB|')).toMatchObject([{ type: 'segment3' }, { type: 'length-rel', a1: 'A', b1: 'S', rhs: { pair: ['A', 'B'] } }]);
    expect(cmd('|EN| = (√6/4)·|w|')).toMatchObject([{ type: 'segment3' }, { type: 'length-rel', rhs: { vec: 'w' } }]);
  });
});

describe('drive (#393) — a free box flexes to the stated magnitudes at EVERY seed', () => {
  beforeEach(reset);
  const nameBoxVectors = () => {
    submit("תיבה ABCDA'B'C'D'");
    submit("נסמן: AB=u, AD=v, AA'=w");
    expect(state().lastError).toBeNull();
  };

  it('|u|=|v|=1 pins both magnitudes to 1 (an absolute size — the scale is pinned)', () => {
    nameBoxVectors();
    submit('|u|=|v|=1');
    expect(state().lastError).toBeNull();
    for (const seed of seeds()) {
      const pos = derive3(state().facts, seed).positions;
      expect(nrm(vecOf(pos, 'A', 'B')), `|u| at seed ${seed}`).toBeCloseTo(1, 5);
      expect(nrm(vecOf(pos, 'A', 'D')), `|v| at seed ${seed}`).toBeCloseTo(1, 5);
    }
  });

  it('three-way |u|=|v|=|w|=1 → a unit cube at every seed', () => {
    nameBoxVectors();
    submit('|u|=|v|=|w|=1');
    expect(state().lastError).toBeNull();
    for (const seed of seeds()) {
      const pos = derive3(state().facts, seed).positions;
      for (const [f, t] of [['A', 'B'], ['A', 'D'], ['A', "A'"]] as const) {
        expect(nrm(vecOf(pos, f, t)), `${f}${t} at seed ${seed}`).toBeCloseTo(1, 5);
      }
    }
  });

  it('valueless |u|=|v|=|w| equalizes at every seed WITHOUT pinning the scale (ADR-052/ADR-3D-054)', () => {
    nameBoxVectors();
    submit('|u|=|v|=|w|');
    expect(state().lastError).toBeNull();
    for (const seed of seeds()) {
      const pos = derive3(state().facts, seed).positions;
      const [lu, lv, lw] = [nrm(vecOf(pos, 'A', 'B')), nrm(vecOf(pos, 'A', 'D')), nrm(vecOf(pos, 'A', "A'"))];
      expect(lv, `|v|=|u| at seed ${seed}`).toBeCloseTo(lu, 5);
      expect(lw, `|w|=|u| at seed ${seed}`).toBeCloseTo(lu, 5);
    }
    // a valueless chain is a RATIO — the size stays gauge, so the data panel must not
    // print |u| = 1 (the frozen unit) as if it were given; the numeric chain above DOES pin.
    const { construction } = derive3(state().facts, state().seed);
    expect(scalePinned(construction), 'ratio-only chain leaves the scale free').toBe(false);
  });
});

describe('drive (#335) — expression magnitudes force the relation, not a special case', () => {
  beforeEach(reset);
  const nameParVectors = () => {
    submit('מקבילון ABCDEFGH');
    submit('נסמן: AB=u, AD=v, AE=w');
    expect(state().lastError).toBeNull();
  };

  it('|w+u|=|w-u| drives w·u = 0 at every seed (the prod pair that "worked" only via the LLM)', () => {
    nameParVectors();
    submit('|w+u|=|w-u|');
    expect(state().lastError).toBeNull();
    for (const seed of seeds()) {
      const pos = derive3(state().facts, seed).positions;
      const u = vecOf(pos, 'A', 'B');
      const w = vecOf(pos, 'A', 'E');
      expect(Math.abs(dot(w, u)) / (nrm(w) * nrm(u)), `cos(w,u) at seed ${seed}`).toBeLessThan(1e-5);
      expect(Math.abs(nrm(add(w, u)) - nrm(sub(w, u))), `the stated relation itself at seed ${seed}`).toBeLessThan(1e-5 * nrm(add(w, u)));
    }
  });

  it('|2w+3v|=|3v-2w| drives w·v = 0 (the sibling the LLM got WRONG)', () => {
    nameParVectors();
    submit('|2w+3v|=|3v-2w|');
    expect(state().lastError).toBeNull();
    for (const seed of seeds()) {
      const pos = derive3(state().facts, seed).positions;
      const v = vecOf(pos, 'A', 'D');
      const w = vecOf(pos, 'A', 'E');
      expect(Math.abs(dot(w, v)) / (nrm(w) * nrm(v)), `cos(w,v) at seed ${seed}`).toBeLessThan(1e-5);
    }
  });

  it('a genuinely non-⊥ case |u+2v|=|u+3v| holds WITHOUT forcing perpendicularity (no special-casing)', () => {
    nameParVectors();
    submit('|u+2v|=|u+3v|');
    expect(state().lastError).toBeNull();
    for (const seed of seeds()) {
      const pos = derive3(state().facts, seed).positions;
      const u = vecOf(pos, 'A', 'B');
      const v = vecOf(pos, 'A', 'D');
      const lhs = nrm(add(u, scale(v, 2)));
      const rhs = nrm(add(u, scale(v, 3)));
      expect(Math.abs(lhs - rhs), `relation at seed ${seed}`).toBeLessThan(1e-5 * Math.max(lhs, 1));
      // |u+2v|=|u+3v| ⟺ 2u·v = −5|v|² — decisively NOT perpendicular
      expect(Math.abs(dot(u, v)) / (nrm(u) * nrm(v)), `u·v must NOT be 0 at seed ${seed}`).toBeGreaterThan(0.01);
    }
  });

  it('pair atoms drive too: |AB+AC|=|AB-AC| on a free tetra forces AB ⊥ AC', () => {
    submit('פירמידה משולשת ABCD');
    submit('|AB+AC|=|AB-AC|');
    expect(state().lastError).toBeNull();
    for (const seed of seeds()) {
      const pos = derive3(state().facts, seed).positions;
      const ab = vecOf(pos, 'A', 'B');
      const ac = vecOf(pos, 'A', 'C');
      expect(Math.abs(dot(ab, ac)) / (nrm(ab) * nrm(ac)), `cos at seed ${seed}`).toBeLessThan(1e-5);
    }
  });

  it('radical coefficient: √2|u| = |v| drives the ratio', () => {
    nameParVectors();
    submit('√2|u| = |v|');
    expect(state().lastError).toBeNull();
    for (const seed of seeds()) {
      const pos = derive3(state().facts, seed).positions;
      expect(nrm(vecOf(pos, 'A', 'D')) / nrm(vecOf(pos, 'A', 'B')), `|v|/|u| at seed ${seed}`).toBeCloseTo(Math.SQRT2, 5);
    }
  });
});

describe('verify (M1) — a determined figure checks the claim, false refuses keep-prior', () => {
  beforeEach(reset);

  it('true claim verifies; false claim refuses claim-refuted and keeps the figure', () => {
    submit('A(0,0,0)');
    submit('B(2,0,0)');
    submit('D(0,3,0)');
    expect(state().lastError).toBeNull();
    submit('|AB+AD| = |AB-AD|'); // (2,3,0) vs (2,−3,0) — equal norms ✓ (AB ⊥ AD)
    expect(state().lastError).toBeNull();
    const n = state().facts.length;
    submit('|AB+AD| = 3|AB-AD|'); // √13 = 3√13 — false
    expect(state().lastError?.code).toBe('claim-refuted');
    expect(state().facts.length, 'keep-prior: the false claim never lands').toBe(n);
  });

  it('|u|=|v| on a determined figure verifies through the named vectors', () => {
    submit('A(0,0,0)');
    submit('B(1,2,2)'); // |AB| = 3
    submit('C(3,0,0)'); // |AC| = 3
    submit('נסמן: AB=u, AC=v');
    expect(state().lastError).toBeNull();
    submit('|u|=|v|');
    expect(state().lastError).toBeNull();
    const n = state().facts.length;
    submit('|u|=2|v|');
    expect(state().lastError?.code).toBe('claim-refuted');
    expect(state().facts.length).toBe(n);
  });
});
