/**
 * #1481 (ADR-CX-057) — the tier-1 argument leftover is THREE-valued.
 *
 * A `0 = c` row whose constant carries atoms used to be a contradiction outright, which assumed every
 * atom independent of every other. Over CERTIFIED atoms (the Gaussian-prime basis) that is a theorem;
 * over an OPAQUE atom it is decided numerically at the atom's fixed degrees, and a residue it cannot
 * tell from zero is reported as undecided — never as a contradiction.
 */
import { describe, expect, it } from 'vitest';

import { ref, val } from '../../model/expr';
import { fromAtom } from '../../value/angle';
import { one as modOne } from '../../value/modulus';
import { rat } from '../../value/rational';
import { exact, fromCartesian } from '../../value/value';
import { solveTier1 } from '../tier1';

const lit = (re: number, im: number) => val(fromCartesian(rat(re), rat(im)).value);
const unitAt = (atom: string) => val(exact(modOne(), fromAtom(atom)));

describe('certified atoms: the leftover is decided exactly', () => {
  it('a certified nonzero leftover is inconsistent — 2+3i is not 3+2i (same modulus √13)', () => {
    const r = solveTier1([
      { lhs: ref('z1'), rhs: lit(2, 3), src: 'z1 = 2+3i' },
      { lhs: ref('z1'), rhs: lit(3, 2), src: 'z1 = 3+2i' },
    ]);
    expect(r.inconsistent).toBe('argument');
    expect(r.undecided).toEqual([]);
  });

  it('a TRUE relation between literals cancels: z1·z2 = −13 for 2+3i, −2+3i', () => {
    const r = solveTier1([
      { lhs: ref('z1'), rhs: lit(2, 3), src: 'z1 = 2+3i' },
      { lhs: ref('z2'), rhs: lit(-2, 3), src: 'z2 = -2+3i' },
      { lhs: { t: 'mul', l: ref('z1'), r: ref('z2') }, rhs: lit(-13, 0), src: 'z1*z2 = -13' },
    ]);
    expect(r.inconsistent).toBeNull();
    expect(r.undecided).toEqual([]);
  });
});

describe('opaque atoms: numeric when decisive, undecided otherwise', () => {
  const pair = (deg1: number, deg2: number) =>
    solveTier1(
      [
        { lhs: ref('z1'), rhs: unitAt('θ'), src: 'z1 = cis θ' },
        { lhs: ref('z1'), rhs: unitAt('φ'), src: 'z1 = cis φ' },
      ],
      new Set(),
      new Map([
        ['θ', deg1],
        ['φ', deg2],
      ]),
    );

  it('an opaque leftover that is clearly nonzero is inconsistent', () => {
    expect(pair(40, 50).inconsistent).toBe('argument');
  });

  it('an opaque turn-unknown ≈ whole is UNDECIDED, naming the statement it reduced — never inconsistent', () => {
    // the integrality half: the second row pins its turn-unknown to θ − φ, which cannot be told from 0
    const r = pair(40, 40);
    expect(r.inconsistent).toBeNull();
    expect(r.undecided).toEqual(['z1 = cis φ']);
  });

  it('an opaque `0 = c` row ≈ 0 goes to undecidedRows with its provenance — the leftover half', () => {
    // a PRINCIPAL constant row has no turn-unknown to absorb it, so it survives elimination as `0 = c`
    const r = solveTier1(
      [{ lhs: unitAt('θ'), rhs: unitAt('φ'), src: 'cis θ = cis φ', principal: true }],
      new Set(),
      new Map([
        ['θ', 40],
        ['φ', 40],
      ]),
    );
    expect(r.inconsistent).toBeNull();
    expect(r.argument.leftover).toEqual([]);
    expect(r.argument.undecidedRows).toHaveLength(1);
    expect(r.argument.undecidedRows[0].srcs).toEqual(['cis θ = cis φ']);
    expect(r.undecided).toEqual(['cis θ = cis φ']);
  });

  it('an UNBOUND opaque atom is undecided, not a contradiction', () => {
    const r = solveTier1([
      { lhs: ref('z1'), rhs: unitAt('θ'), src: 'z1 = cis θ' },
      { lhs: ref('z1'), rhs: unitAt('φ'), src: 'z1 = cis φ' },
    ]);
    expect(r.inconsistent).toBeNull();
    expect(r.undecided.length).toBeGreaterThan(0);
  });
});
