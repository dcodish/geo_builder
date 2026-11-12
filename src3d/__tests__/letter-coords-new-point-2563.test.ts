/**
 * #2563 (ADR-3D-489) — A NEW POINT WITH LETTER COORDINATES. «N(k,p,3)» after «B(2t, t, k)» was refused
 * `symbolic-new-point`: the coordinate lowering admitted letters on an EXISTING point only. Now every lettered new point
 * that is not ADR-3D-032's one-letter coord-sym is a `sym-coord` point over the pin-symbol pool: k is the same unknown as
 * B's, p a new open letter at its seed anchor. Through the store (`submit` → `derive3`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { freeDofCount3 } from '../engine/evaluate';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const err = () => useGeo3.getState().lastError;
const build = (lines: string[]) => {
  for (const l of lines) {
    submit(l);
    expect(err(), l).toBeNull();
  }
};
const at = (seed: number) => derive3(useGeo3.getState().facts, seed);
const dof = (seed = 0) => {
  const d = at(seed);
  return freeDofCount3(d.construction, d.resolved);
};
const allOk = (seed: number) => Object.values(at(seed).status).every((x) => x === 'ok');
const SEEDS = [0, 1, 2, 3, 4, 5];
const OP = ['פירמידה SABCD', 'B(2t, t, k)', 'N(k,p,3)'];

beforeEach(reset);

describe('#2563 — «N(k,p,3)»: a new point with letter coordinates', () => {
  it('the operator’s sequence builds: N.z = 3, N.x = B.z, p varies with the seed', () => {
    build(OP);
    const ps: number[] = [];
    for (const s of SEEDS) {
      const d = at(s);
      expect(allOk(s), `seed ${s}`).toBe(true);
      const N = d.positions.get('N')!, B = d.positions.get('B')!;
      expect(N.z).toBeCloseTo(3, 9);
      expect(N.x, `seed ${s}`).toBeCloseTo(B.z, 6);
      ps.push(N.y);
    }
    expect(Math.max(...ps) - Math.min(...ps)).toBeGreaterThan(0.1); // ADR-052: a free letter is sampled
  });

  it('the DOF cue counts the new open letter: one more than before N', () => {
    build(OP.slice(0, 2));
    const before = dof();
    build(OP.slice(2));
    expect(dof()).toBe(before + 1);
  });

  it('stability: adding N moves neither B nor the pyramid at a fixed seed', () => {
    build(OP.slice(0, 2));
    const before = at(0).positions;
    build(OP.slice(2));
    const after = at(0).positions;
    for (const id of ['S', 'A', 'B', 'C', 'D']) {
      const p = before.get(id)!, q = after.get(id)!;
      expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), id).toBeLessThan(1e-9);
    }
  });

  it('the order permutation: N before B gives the same k', () => {
    build(['פירמידה SABCD', 'N(k,p,3)', 'B(2t, t, k)']);
    for (const s of [0, 1, 2]) {
      const d = at(s);
      expect(d.positions.get('N')!.x).toBeCloseTo(d.positions.get('B')!.z, 6);
    }
  });

  it('a letter first written bare («B(k,1,2)») is the same unknown', () => {
    build(['פירמידה SABCD', 'B(k,1,2)', 'N(k,p,3)']);
    for (const s of [0, 1, 2]) {
      const d = at(s);
      expect(d.positions.get('N')!.x).toBeCloseTo(d.positions.get('B')!.x, 6);
    }
  });

  it('«N(k,2,3)» after «B(2t,t,k)» routes to the pool (no two-params)', () => {
    build(['פירמידה SABCD', 'B(2t, t, k)', 'N(k,2,3)']);
    const d = at(0);
    expect(d.positions.get('N')!.x).toBeCloseTo(d.positions.get('B')!.z, 6);
    expect(d.positions.get('N')!.y).toBeCloseTo(2, 9);
  });

  it('«k = 1» values both B.z and N.x', () => {
    build([...OP, 'k = 1']);
    for (const s of [0, 1]) {
      const d = at(s);
      expect(d.positions.get('B')!.z).toBeCloseTo(1, 6);
      expect(d.positions.get('N')!.x).toBeCloseTo(1, 6);
    }
  });

  it('a blank «N(k,p,3)» builds with two free letters (DOF 2), N moving with the seed', () => {
    build(['N(k,p,3)']);
    expect(dof()).toBe(2);
    expect(at(0).positions.get('N')!.z).toBeCloseTo(3, 9);
    expect(at(0).positions.get('N')!.x).not.toBeCloseTo(at(1).positions.get('N')!.x, 3);
  });

  it('a blank «B(2t, t, k)» builds: B.x = 2·B.y', () => {
    build(['B(2t, t, k)']);
    for (const s of [0, 1]) {
      const B = at(s).positions.get('B')!;
      expect(B.x).toBeCloseTo(2 * B.y, 9);
    }
  });

  it('a coordinate given on the new point determines its letters; a false one is refused', () => {
    build(['N(k,p,3)', 'N(1,2,3)']);
    expect(at(0).positions.get('N')).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(dof()).toBe(0);
    reset();
    build(['N(k,p,3)']);
    submit('N(1,2,4)');
    expect(err()).toEqual({ code: 'claim-refuted' });
  });

  it('a letter a typed point determines places the new point (no pivot)', () => {
    build(['B(1,2,3)', 'B(k,2,3)', 'N(k,p,3)']);
    for (const s of SEEDS) {
      expect(allOk(s), `seed ${s}`).toBe(true);
      expect(at(s).positions.get('N')!.x, `seed ${s}`).toBeCloseTo(1, 9);
    }
  });

  it('the figure parameter of a coord-sym point cannot be shared: «M(k,1,3)» then «N(k,p,3)» is two-params (#801)', () => {
    build(['M(k,1,3)']);
    submit('N(k,p,3)');
    expect(err()).toEqual({ code: 'two-params' });
  });

  it('on a solid, a given naming N drives its letters: «אורך NS = 5»', () => {
    build([...OP, 'אורך NS = 5']);
    for (const s of [0, 1]) {
      const d = at(s);
      const N = d.positions.get('N')!, S = d.positions.get('S')!, B = d.positions.get('B')!;
      expect(Math.hypot(N.x - S.x, N.y - S.y, N.z - S.z)).toBeCloseTo(5, 4);
      expect(N.x).toBeCloseTo(B.z, 6);
    }
  });
});
