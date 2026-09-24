/**
 * #1311 (ADR-3D-260) — A STATED LENGTH ON A FREE VECTOR IS A GIVEN THE FIGURE HONOURS.
 *
 * **Operator, 2026-09-21:** *"it refuses. when i first create vector AB and then write the =5 thing it
 * refuses"*. Measured at the base: «וקטור AB» minted A and B as `free3` (six sampled DOF, nothing stated
 * about either), then «אורך AB = 5» / «וקטור AB = 5» / «AB = 5» each came back `claim-refuted` — 5 judged
 * against the ≈2.34 the sampler invented. And the one-line «וקטור AB = 5» on an empty canvas refused
 * `unknown-point: A`.
 *
 * Every row here drives the STORE's real submit path (the #1184 file's rule: a lock on the parser alone
 * guards the half that already worked), and reads what `derive3` / `resolve3` produced.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { verifyClaim } from '../engine/claims';

const st = () => useGeo3.getState();
beforeEach(() => {
  st().clear();
});

const submitAll = (lines: readonly string[]) => {
  for (const l of lines) st().submit(l);
  return { err: st().lastError as { code?: string; id?: string; stated?: string; others?: string[] } | null, facts: st().facts.length };
};

/**
 * Does |ab| = value hold at this configuration — judged by the product's OWN claim verifier, so the lock
 * aims at exactly the predicate the drive aims at (the `onLineHolds3` discipline), never a re-implemented
 * tolerance of its own.
 */
const holds = (seed: number, a: string, b: string, value: number): boolean =>
  verifyClaim({ type: 'length-eq', a, b, value }, derive3(st().facts, seed).construction, seed);

const allOk = (seed: number): boolean => Object.values(derive3(st().facts, seed).status).every((s) => s === 'ok');

describe('#1311 — the operator’s orders all DRIVE |AB| = 5', () => {
  it.each([
    [['וקטור AB', 'אורך AB = 5']],
    [['וקטור AB', 'וקטור AB = 5']],
    [['וקטור AB', 'AB = 5']],
    [['וקטור AB = 5']],
  ])('%j builds, verifies, and holds |AB| = 5 at every configuration', (lines) => {
    const r = submitAll(lines);
    expect(r.err, `${JSON.stringify(lines)} was refused`).toBeNull();
    expect(r.facts).toBe(lines.length);
    for (const seed of [0, 1, 2, 3, 1013]) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(holds(seed, 'A', 'B', 5), `|AB| = 5 at seed ${seed}`).toBe(true);
    }
  });

  /** The one-line form is the SAME statement, so it is the same figure — not merely a figure with |AB| = 5. */
  it('«וקטור AB = 5» on one line gives the same figure as the two-line form', () => {
    submitAll(['וקטור AB = 5']);
    const one = [0, 1, 2].map((s) => derive3(st().facts, s).positions);
    const arrowsOne = derive3(st().facts, 0).construction.arrows;
    st().clear();
    submitAll(['וקטור AB', 'אורך AB = 5']);
    const two = [0, 1, 2].map((s) => derive3(st().facts, s).positions);
    expect(derive3(st().facts, 0).construction.arrows).toEqual(arrowsOne);
    for (let i = 0; i < 3; i++)
      for (const id of ['A', 'B']) {
        expect(two[i].get(id)!.x).toBeCloseTo(one[i].get(id)!.x, 9);
        expect(two[i].get(id)!.y).toBeCloseTo(one[i].get(id)!.y, 9);
        expect(two[i].get(id)!.z).toBeCloseTo(one[i].get(id)!.z, 9);
      }
  });

  /** ADR-052: the stated length is now a given, the DIRECTION never was — it must still move. */
  it('«הציגו תצורה אחרת» resamples: the vector moves and |AB| = 5 still holds', () => {
    submitAll(['וקטור AB', 'אורך AB = 5']);
    const before = st().seed;
    const dirAt = (seed: number) => {
      const p = derive3(st().facts, seed).positions;
      const A = p.get('A')!;
      const B = p.get('B')!;
      return `${(B.x - A.x).toFixed(3)},${(B.y - A.y).toFixed(3)},${(B.z - A.z).toFixed(3)}`;
    };
    const first = dirAt(before);
    st().resample();
    const after = st().seed;
    expect(after).not.toBe(before);
    expect(allOk(after)).toBe(true);
    expect(holds(after, 'A', 'B', 5), `|AB| = 5 at seed ${after}`).toBe(true);
    expect(dirAt(after)).not.toBe(first);
  });
});

describe('#1311 — refusals stay honest', () => {
  /** A second length on the same pair is a conflict BETWEEN GIVENS: name the statement it conflicts with. */
  it('«אורך AB = 5» then «אורך AB = 7» refuses the 7, naming «אורך AB = 5»', () => {
    const r = submitAll(['וקטור AB', 'אורך AB = 5', 'אורך AB = 7']);
    expect(r.err).toMatchObject({ code: 'givens-contradict', stated: 'אורך AB = 7', others: ['אורך AB = 5'] });
    expect(r.facts).toBe(2);
    expect(holds(st().seed, 'A', 'B', 5), `|AB| = 5 at seed ${st().seed}`).toBe(true);
  });

  /** A length the givens FORBID still refutes — the drive honours free DOF, it does not stop checking. */
  it('with A and B placed by coordinates, «אורך AB = 7» is still claim-refuted (|AB| = 5)', () => {
    const r = submitAll(['וקטור AB', 'A(0,0,0)', 'B(3,4,0)', 'אורך AB = 7']);
    expect(r.err).toMatchObject({ code: 'claim-refuted' });
    expect(r.facts).toBe(3);
  });

  /**
   * THE GUARD, the class half: a statement about a free point that NO drive pins is not refuted against
   * the sampler — it names the point. Here the cube's size is already the scale given, so the second
   * length takes the claim lane (#754), and E — minted free by «קטע BE» (#840) — was never positioned.
   */
  it('a length on a free point the drive does not pin says the point is not determined, never «wrong»', () => {
    const r = submitAll(["קובייה ABCDA'B'C'D'", 'אורך AB = 2', 'קטע BE', 'אורך BE = 5']);
    expect(r.err).toMatchObject({ code: 'point-not-determined', id: 'E' });
  });
});

describe('#1311 — the class: every given on free points drives, not only the reported one', () => {
  /** Two independent lengths need the POINTS to move — the gauge's one scale cannot satisfy both. */
  it('three free points, two lengths: both hold at 24 of 24 configurations', () => {
    const r = submitAll(['וקטור AB', 'משולש ABC', 'אורך AB = 5', 'אורך AC = 3']);
    expect(r.err).toBeNull();
    for (let seed = 0; seed < 24; seed++) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(holds(seed, 'A', 'B', 5), `|AB| = 5 at seed ${seed}`).toBe(true);
      expect(holds(seed, 'A', 'C', 3), `|AC| = 3 at seed ${seed}`).toBe(true);
    }
  });

  it('an angle between two free segments drives too', () => {
    const r = submitAll(['וקטור AB', 'משולש ABC', 'הזווית בין AB לבין AC היא 60']);
    expect(r.err).toBeNull();
    const c = derive3(st().facts, st().seed).construction;
    expect(verifyClaim({ type: 'angle-seg-eq', a1: 'A', b1: 'B', a2: 'A', b2: 'C', deg: 60 }, c, st().seed)).toBe(true);
  });

  it('the named-vector spelling «|u| = 5» drives the same pair', () => {
    const r = submitAll(['וקטור AB', 'נסמן: AB = u', '|u| = 5']);
    expect(r.err).toBeNull();
    expect(holds(st().seed, 'A', 'B', 5), `|AB| = 5 at seed ${st().seed}`).toBe(true);
  });

  /**
   * The same carrier beside a solid. «DE» mints E free (#840); before, E only rode the gauge, so
   * «DE=(0,2,0)» was met by ROTATING the whole pyramid and the next given «BA=(6,0,6)» was refused as
   * contradicting it — two satisfiable givens accused of each other. E's coordinates now move instead.
   */
  it('a free point beside a solid: «DE=(0,2,0)» then «BA=(6,0,6)» both hold', () => {
    const r = submitAll(['פירמידה משולשת ABCS', 'SD=(2/3)SB', 'F אמצע SC', 'BC=v', 'SB=u', 'DE', 'DE=(0,2,0)', 'BA=(6,0,6)']);
    expect(r.err).toBeNull();
    expect(allOk(st().seed)).toBe(true);
  });
});
