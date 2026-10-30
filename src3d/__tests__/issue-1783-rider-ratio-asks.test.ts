/**
 * #1783 (ADR-3D-391, Am. 1) — «AD = 3BD» on a rider is never refuted as the student's arithmetic.
 *
 * «משולש ABC · D על AB · AD = 3BD»: read as vectors, D would sit at 1.5·AB, off its segment; read as lengths,
 * D sits at ¾. #748 ruled the tool must not pick between two readings that disagree, and that stands. What was
 * wrong was the register: the halves shape answered «הטענה לא מתקיימת — בדקו את החישוב», accusing the student,
 * while the whole-host shape («AB = 4DA», vector D at −¼) silently built at ¼ as lengths. One rider family read
 * direction in one shape and not in the other.
 *
 * Now (the operator's rule of 2026-10-30, PR #2605, which replaces card 11's "ask" here): *"if only one can be true,
 * we will assume this is the case"*. Where the vector reading cannot place D and the length reading can, the line
 * builds as lengths (T36, T38); where both agree it builds (T39). A MARKED statement is a vector and keeps its honest
 * refutation (ADR-3D-250).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

const st = () => useGeo3.getState();
const TRI = 'משולש ABC';
beforeEach(() => st().clear());

const run = (lines: string[]) => {
  st().clear();
  lines.forEach((l) => st().submit(l));
  return { err: st().lastError as { code: string } | null, facts: st().facts.length };
};
const tOf = (x: string, a: string, b: string) => {
  const pos = derive3(st().facts, st().seed).positions;
  const d = (p: string, q: string) => {
    const P = pos.get(p)!;
    const Q = pos.get(q)!;
    return Math.hypot(Q.x - P.x, Q.y - P.y, Q.z - P.z);
  };
  return d(a, x) / d(a, b);
};

describe('#1783 — a rider coefficient whose vector reading fails is read as lengths', () => {
  it.each([
    ['AD = 3BD', 0.75],
    ['AD = 3·BD', 0.75],
    ['AD = 3*BD', 0.75],
    // the swapped sides lower to the same relation, «AD = 3·BD» (Am. 1: it was lowered with the reciprocal)
    ['3BD = AD', 0.75],
    ['AD = 0.5BD', 1 / 3],
    ['BD = 3AD', 0.25],
    // T38: the whole-host shape, as vectors D at −¼
    ['AB = 4DA', 0.25],
  ])('«%s» builds D where the length reading puts it, without a question', (line, t) => {
    const { err, facts } = run([TRI, 'D על AB', line]);
    expect(err).toBeNull();
    expect(facts).toBe(3);
    expect(tOf('D', 'A', 'B')).toBeCloseTo(t, 6);
  });

  it('the English spelling builds the same', () => {
    expect(run(['triangle ABC', 'D on AB', 'AD = 3BD']).err).toBeNull();
    expect(tOf('D', 'A', 'B')).toBeCloseTo(0.75, 6);
  });

  it.each([
    ['AD = 3DB', 0.75],
    ['DB = 3AD', 0.25],
    ['AB = 4AD', 0.25],
    ['|AD| = 3|BD|', 0.75],
    ['אורך AD = 3 אורך BD', 0.75],
    ['AD:DB = 3:1', 0.75],
  ])('«%s» still builds (its readings agree, or it is a length)', (line, t) => {
    const { err } = run([TRI, 'D על AB', line]);
    expect(err).toBeNull();
    expect(tOf('D', 'A', 'B')).toBeCloseTo(t, 6);
  });

  it.each([['וקטור AD = 3 וקטור BD'], ['AB⃗ = 4DA⃗']])('a MARKED «%s» is a vector, and a false one is refuted', (line) => {
    expect(run([TRI, 'D על AB', line]).err?.code).toBe('claim-refuted');
  });
});
