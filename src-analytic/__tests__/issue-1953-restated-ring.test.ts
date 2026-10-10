/**
 * #1953 ([ADR-AG-259](../../docs/06c-decisions-analytic.md#adr-ag-259)) — A RESTATED RING IS «כבר ידוע» IN EVERY
 * READING, NOT ONLY IN ITS DECLARED SPELLING.
 *
 * Measured on `main` @ e0f4260c through `decideSubmit` (what the App calls): after «ריבוע ABCD», «מרובע ABCD»
 * answered `already-known`, but «מרובע ADCB» / «מרובע BCDA» and «משולש ABC» · «משולש ACB» RECORDED a second row.
 * The polygon itself was absorbed (its id is canonical over the ring's rotations and reversals); the sentence's
 * `distinct` selector was not — it was compared by spelling, so the reordered letters read as a new selector and
 * the line as `created`. Fix: `selectorIdentity` compares a `distinct` selector as the set it is.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';

describe('#1953 — a restated ring answers «כבר ידוע» in analytic, in any reading', () => {
  it.each([
    ['ריבוע ABCD', 'מרובע ADCB'], // the operator's T11 line
    ['ריבוע ABCD', 'מרובע BCDA'],
    ['ריבוע ABCD', 'מרובע ABCD'], // the declared spelling — the unchanged control
    ['משולש ABC', 'משולש ACB'],
    ['מלבן ABCD', 'מלבן ADCB'],
    ['טרפז ABCD', 'טרפז CDAB'],
  ])('«%s» · «%s»', (a, b) => {
    expect(decideSubmit(b, [a], 0).kind).toBe('already-known');
  });

  it('a set of distinct points restated in another order is the same selector', () => {
    expect(decideSubmit('מרובע DCBA', ['מרובע ABCD'], 0).kind).toBe('already-known');
  });

  it('a crossing order is a different ring and is still refused (#1927)', () => {
    const v = decideSubmit('מרובע ACBD', ['ריבוע ABCD'], 0);
    expect(v.kind).toBe('refused');
  });
});
