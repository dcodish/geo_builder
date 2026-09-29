/**
 * #1436 — AN ASK ANSWER IS EXACT WHERE THE OPERANDS CARRY IT, AND HONEST (≈) WHERE IT IS NOT.
 *
 * External review of prod: «|z₁−z₂| … fixed at 2√2» printed «= 2.83» — a rounded decimal under an
 * `=`. Operator rulings (2026-09-27, #1436 + #1460 «exact only (today)»): an answer recognised
 * exact prints in exact form ALONE (`|z1-z2|` → 2√2, no decimal beside it); otherwise the decimal
 * with `≈`. The exact lane is bounded Gaussian-rational arithmetic (no CAS): sums, differences,
 * products, quotients and small integer powers of exactly-carried Gaussian rationals, with `|…|`
 * spelled by the ONE modulus formatter. The ≈ floor is decided at the answer composers themselves
 * (`numAnswer`/`cxAnswer`), the same rule the stage-5d readings follow.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { askRowsOf } from '../app/askLane';
import { deriveLines } from '../app/deriveLines';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().clearAll());

/** One ask against one figure, through the real pipeline. */
const ask = (lines: string[], q: string) => {
  const d = deriveLines(lines, 0, 0, [q]);
  return askRowsOf([q], d.knowledge)[0].row!;
};

describe('#1436 — the reported case and the exact lane', () => {
  it('the reviewer’s own figure: «|z1-z2|» answers 2√2 exactly — never «= 2.83»', () => {
    const row = ask(['z1 = 1+i', 'z2 = -1-i'], '|z1-z2|');
    expect(row.value).toBe('2√2');
    expect(row.approx).toBeFalsy();
  });

  it('«z1 = 1+i, z2 = 2+3i»: |z1 - z2| = √5', () => {
    const row = ask(['z1 = 1+i', 'z2 = 2+3i'], '|z1-z2|');
    expect(row.value).toBe('√5');
    expect(row.approx).toBeFalsy();
  });

  it('a complex-valued answer is exact through the one cartesian composer: z1-z2 = -1-2i', () => {
    const row = ask(['z1 = 1+i', 'z2 = 2+3i'], 'z1-z2');
    expect(row.value).toBe('-1-2i');
    expect(row.approx).toBeFalsy();
  });

  it('products and quotients stay in the field: z1·z2 and z1/z2 answer exactly', () => {
    expect(ask(['z1 = 1+i', 'z2 = 2+3i'], 'z1*z2').value).toBe('-1+5i');
    const q = ask(['z1 = 1+i', 'z2 = 1-i'], 'z1/z2');
    expect(q.value).toBe('i');
    expect(q.approx).toBeFalsy();
  });

  it('an integer answer keeps its plain spelling with =: |z1| for z1 = 3+4i is 5', () => {
    const row = ask(['z1 = 3+4i'], '|z1|');
    expect(row.value).toBe('5');
    expect(row.approx).toBeFalsy();
  });
});

describe('#1436 — the ≈ honesty floor', () => {
  it('an irrational value the exact lane cannot carry prints its decimal WITH approx', () => {
    // 2·cis20°: cos 20° has no radical form — the answer is honest about being rounded
    const row = ask(['z1 = 2cis20'], 'Re(z1)');
    expect(row.value).not.toBeNull();
    expect(row.approx).toBe(true);
  });

  it('an exact rational answers as the exact fraction, with =', () => {
    const row = ask(['z1 = 2.5'], 'Re(z1)');
    expect(row.value).toBe('5/2');
    expect(row.approx).toBeFalsy();
  });
});
