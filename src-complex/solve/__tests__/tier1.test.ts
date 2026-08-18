/**
 * S2 gate (#619): the tier-1 exact linear solver, and the close of #607.
 *
 * The headline is not "the tests pass" — it is that these systems are solved by ELIMINATION, with no
 * iteration, no tolerance and no convergence question. #607 exists precisely because the prototype
 * iterated: its composed map has a repelling fixpoint, so every sweep diverges and the gate honestly
 * refuses a question the exam expects a student to answer. In log-polar coordinates the same system is
 * linear ([ADR-CX-006](../../../docs/06d-decisions-complex.md#adr-cx-006)).
 */
import { describe, expect, it } from 'vitest';

import { I, abs, conj, div, mul, num, param, pow, ref } from '../../model/expr';
import { rat } from '../../value/rational';
import { format as fmtMod } from '../../value/modulus';
import { branchDegrees, formatBranch, solveTier1 } from '../tier1';
import { argBelow, filterBranches, quadrant } from '../filter';

const R = (n: number, d = 1) => rat(n, d);

describe('#607 — the system the prototype cannot reach', () => {
  // 2023 קיץ מועד ב Q3: a geometric sequence over ℂ with z3 = z1³ and −2·z1 = conj(z3),
  // and z1 in the first quadrant. Satisfiable at z1 = √2·cis45°; the operator's session was REFUSED
  // because z1 <- conj(z1³)/(−2) has a repelling fixpoint.
  const system = [
    { lhs: ref('z3'), rhs: pow(ref('z1'), R(3)), src: 'z1^3 = z3' },
    { lhs: mul(num(R(-2)), ref('z1')), rhs: conj(ref('z3')), src: '-2z1 = conj(z3)' },
  ];

  it('solves in CLOSED FORM: |z1| = √2 exactly, with no iteration', () => {
    const r = solveTier1(system);
    expect(r.inconsistent).toBeNull();
    expect(fmtMod(r.knownModulus.get('z1')!)).toBe('√2');
    expect(fmtMod(r.knownModulus.get('z3')!)).toBe('2√2');
  });

  it('enumerates exactly FOUR configurations — 4·t1 = k − ½', () => {
    const r = solveTier1(system);
    expect(r.branches).toHaveLength(4);
    const degs = r.branches.map((b) => branchDegrees(b, 'z1')).sort((a, c) => a! - c!);
    expect(degs).toEqual([45, 135, 225, 315]);
    // the branch set IS the exam's «כל האפשרויות» — not a feature bolted on afterwards
    expect(r.branchesTruncated).toBe(false);
  });

  it('THE OPERATOR SESSION: the quadrant given prunes to z1 = √2·cis45°', () => {
    const r = solveTier1(system);
    const { kept, emptiedBy } = filterBranches(r.branches, [quadrant('z1', 1)]);
    expect(emptiedBy).toBeNull();
    expect(kept).toHaveLength(1);
    expect(branchDegrees(kept[0], 'z1')).toBe(45);
    expect(branchDegrees(kept[0], 'z3')).toBe(135); // z3 = z1³
    expect(formatBranch(kept[0])).toBe('arg z1 = 45°, arg z3 = 135°');
  });

  it('the figure is fully determined — no free DOF left over', () => {
    const r = solveTier1(system);
    expect(r.freeDof).toEqual([]);
    expect(r.deferred).toEqual([]);
  });
});

describe('branch enumeration IS the exam’s "all the possibilities"', () => {
  it('2024 חורף ג: a geometric sequence with z5 = 2·z1 gives q⁴ = 2 — four ratios', () => {
    // z1 is the first term and z5 the fifth, so q⁴ = z5/z1; the exam states 2|z_A| = |z_M| with a
    // shared argument, which pins the ratio's modulus to 2 and its argument to a quarter of a turn.
    const r = solveTier1([{ lhs: pow(ref('q'), R(4)), rhs: num(R(2)), src: 'q^4 = 2' }]);
    expect(r.inconsistent).toBeNull();
    expect(fmtMod(r.knownModulus.get('q')!)).toBe('⁴√2'); // exam typography since the #702 fix
    expect(r.branches).toHaveLength(4);
    expect(r.branches.map((b) => branchDegrees(b, 'q')).sort((a, c) => a! - c!)).toEqual([0, 90, 180, 270]);
  });

  it('z³ = 8 is the three cube roots, 120° apart', () => {
    const r = solveTier1([{ lhs: pow(ref('z'), R(3)), rhs: num(R(8)) }]);
    expect(fmtMod(r.knownModulus.get('z')!)).toBe('2');
    expect(r.branches.map((b) => branchDegrees(b, 'z')).sort((a, c) => a! - c!)).toEqual([0, 120, 240]);
  });

  it('z⁶ = 1 with a quadrant given selects one root (2023 קיץ א א)', () => {
    const r = solveTier1([{ lhs: pow(ref('z'), R(6)), rhs: num(R(1)) }]);
    expect(r.branches).toHaveLength(6);
    const { kept } = filterBranches(r.branches, [quadrant('z', 4)]);
    expect(kept).toHaveLength(1);
    expect(branchDegrees(kept[0], 'z')).toBe(300);
  });

  it('a whole extra turn is the SAME direction, so it is one branch and not many', () => {
    // z = i states one direction; nothing is multi-valued, so there is exactly one configuration
    const r = solveTier1([{ lhs: ref('z'), rhs: I }]);
    expect(r.branches).toHaveLength(1);
    expect(branchDegrees(r.branches[0], 'z')).toBe(90);
  });
});

describe('modulus relations are linear too — the corpus’s commonest given', () => {
  it('|z1| = 9r and |z2| = 12r, with |z4| = |z2|²/|z1| coming out as 16r', () => {
    const r = solveTier1([
      { lhs: abs(ref('z1')), rhs: mul(num(R(9)), param('r')), src: '|z1| = 9r' },
      { lhs: abs(ref('z2')), rhs: mul(num(R(12)), param('r')), src: '|z2| = 12r' },
      { lhs: ref('z4'), rhs: div(pow(ref('z2'), R(2)), ref('z1')), src: 'z4 = z2^2/z1' },
    ]);
    expect(r.inconsistent).toBeNull();
    expect(fmtMod(r.knownModulus.get('z4')!)).toBe('16r');
  });

  it('a modulus given leaves the ARGUMENT free — under-determination is reported, not invented', () => {
    const r = solveTier1([{ lhs: abs(ref('z')), rhs: num(R(5)) }]);
    expect(fmtMod(r.knownModulus.get('z')!)).toBe('5');
    expect(r.freeDof).toEqual(['arg z']); // |z| is pinned, the direction is not — exactly right
  });

  it('2|z_A| = |z_M| relates two moduli without determining either', () => {
    const r = solveTier1([{ lhs: mul(num(R(2)), abs(ref('zA'))), rhs: abs(ref('zM')) }]);
    expect(r.inconsistent).toBeNull();
    expect(r.knownModulus.size).toBe(0); // a RELATION, not a value — nothing is printable yet
    expect(r.modulus.rank).toBe(1); // ...but one degree of freedom was genuinely removed
  });
});

describe('the free-DOF count is the nullspace dimension, not a heuristic', () => {
  it('an unconstrained number has two degrees of freedom, modulus and argument', () => {
    const r = solveTier1([{ lhs: ref('w'), rhs: ref('w') }]);
    expect([...r.freeDof].sort()).toEqual(['arg w', '|w|']);
  });

  it('each independent equation removes exactly one, and the count is published once', () => {
    const one = solveTier1([{ lhs: abs(ref('z')), rhs: num(R(3)) }]);
    expect(one.freeDof).toEqual(['arg z']);
    const both = solveTier1([
      { lhs: abs(ref('z')), rhs: num(R(3)) },
      { lhs: ref('z'), rhs: mul(num(R(3)), I) },
    ]);
    expect(both.freeDof).toEqual([]);
  });
});

describe('honesty', () => {
  it('a CONTRADICTION is a 0 = c row, found before any numeric work', () => {
    const r = solveTier1([
      { lhs: abs(ref('z')), rhs: num(R(2)), src: '|z| = 2' },
      { lhs: abs(ref('z')), rhs: num(R(3)), src: '|z| = 3' },
    ]);
    expect(r.inconsistent).toBe('modulus');
  });

  it('an argument contradiction is caught on its own system', () => {
    const r = solveTier1([
      { lhs: ref('z'), rhs: num(R(1)), src: 'z = 1' },
      { lhs: ref('z'), rhs: I, src: 'z = i' },
    ]);
    expect(r.inconsistent).toBe('argument');
  });

  it('an equation dependent modulo a WHOLE TURN is consistent, not a contradiction', () => {
    // z^2 = 1 and z^4 = 1 agree; a naive "residual must be exactly zero" would refuse this
    const r = solveTier1([
      { lhs: pow(ref('z'), R(2)), rhs: num(R(1)) },
      { lhs: pow(ref('z'), R(4)), rhs: num(R(1)) },
    ]);
    expect(r.inconsistent).toBeNull();
    expect(r.branches.map((b) => branchDegrees(b, 'z')).sort((a, c) => a! - c!)).toEqual([0, 180]);
  });

  it('a NON-MONOMIAL constraint is deferred to the numeric tier, listed rather than dropped', () => {
    const sum = { lhs: ref('w'), rhs: { t: 'add', l: ref('z1'), r: ref('z2') } as const, src: 'w = z1 + z2' };
    const r = solveTier1([{ lhs: abs(ref('z1')), rhs: num(R(2)) }, sum]);
    expect(r.deferred).toHaveLength(1);
    expect(r.deferred[0].src).toBe('w = z1 + z2');
    // and the monomial half still solved — deferral is routing, not failure
    expect(fmtMod(r.knownModulus.get('z1')!)).toBe('2');
  });

  it('a filter that empties the branch set REFUSES rather than relaxing itself', () => {
    const r = solveTier1([{ lhs: pow(ref('z'), R(2)), rhs: num(R(1)) }]); // 0° and 180°
    const res = filterBranches(r.branches, [quadrant('z', 2)]); // neither is strictly inside Q2
    expect(res.kept).toEqual([]);
    expect(res.emptiedBy).toEqual({ kind: 'quadrant', name: 'z', q: 2 });
  });

  it('an UNDECIDABLE filter keeps the branch and says so — it never prunes on ignorance', () => {
    // arg z is free, so no branch fixes it; the filter cannot decide and must not silently drop it
    const r = solveTier1([{ lhs: abs(ref('z')), rhs: num(R(1)) }]);
    const res = filterBranches(r.branches, [argBelow('z', 45)]);
    expect(res.emptiedBy).toBeNull();
    expect(res.kept.length).toBe(r.branches.length);
  });
});
