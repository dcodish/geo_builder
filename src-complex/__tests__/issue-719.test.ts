/**
 * #719 (ADR-CX-035) — AN OUT-OF-DOMAIN MAGNITUDE GIVEN IS REFUSED, NEVER NORMALISED.
 *
 * «|z1| = -5» was ACCEPTED and drawn as «|z1| = 5». The sign was not dropped by the solver — it never
 * reached the solver: `rules.ts` wrapped a magnitude equation's right-hand side in `abs(…)`, which is
 * right for a name or a positive number and silently rewrote the student's statement here.
 *
 * The honesty invariant at stake: *no stated magnitude is ever silently dropped — a given parses to a
 * constraint, escalates, or errors, but never vanishes.*
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { submitLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';

const reset = () => useComplexStore.getState().resetSession();
const err = () => (useComplexStore.getState() as unknown as { lastError: { key: string; detail: string } | null }).lastError;

describe('#719 — a magnitude that is not a positive real is refused, naming the statement', () => {
  beforeEach(reset);

  it('«|z1| = -5» is refused on its own — no other given needed to see it is impossible', () => {
    expect(submitLine('|z1| = -5')).toBe(false);
    expect(err()).toEqual({ key: 'impossible', detail: '|z1| = -5' });
  });

  it('«|z1| = -5» is refused after a value that would have made it look merely redundant', () => {
    // z1 = 3+4i has |z1| = 5, so the old normalisation made «|z1| = -5» read as a TRUE restatement —
    // accepted, drawn, and listed as an ordinary fact. That is the silence the issue reported.
    expect(submitLine('z1 = 3+4i')).toBe(true);
    expect(submitLine('|z1| = -5')).toBe(false);
    expect(err()).toEqual({ key: 'impossible', detail: '|z1| = -5' });
  });

  it('the refusal names the STATEMENT and reaches the always-visible channel, not just the panel', () => {
    // `unsatisfied` is what the strip and the ADR-CX-023 acceptance gate both read (#788's property)
    const d = deriveLines(['|z1| = -5'], 0, 0);
    expect(d.unsatisfied).toContain('|z1| = -5');
  });
});

describe('#719 — the boundaries, stated rather than left to the sign test', () => {
  beforeEach(reset);

  it('«|z1| = 0» is SATISFIABLE and still accepted — z1 sits at the origin', () => {
    expect(submitLine('|z1| = 0')).toBe(true);
    expect(err()).toBeNull();
  });

  it('«|z1| = 5» is byte-identical — the ordinary case is untouched', () => {
    expect(submitLine('|z1| = 5')).toBe(true);
    expect(err()).toBeNull();
    expect(deriveLines(['|z1| = 5'], 0, 0).unsatisfied).toEqual([]);
  });

  it('«|z1| = |z2|» is untouched — an RHS whose magnitude is unknown says nothing about sign', () => {
    expect(submitLine('z1 = 3+4i')).toBe(true);
    expect(submitLine('|z1| = |z2|')).toBe(true);
    expect(err()).toBeNull();
  });

  it('a NEGATIVE ARGUMENT stays legal — this is a magnitude rule, not a sign rule', () => {
    expect(submitLine('arg z1 = -30')).toBe(true);
    expect(err()).toBeNull();
  });
});

describe('#719 — the sibling lanes keep their existing behaviour', () => {
  beforeEach(reset);

  it('«|z1-z2| = -2» keeps refusing through the numeric tier (a non-monomial LHS)', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 1+i', '|z1-z2| = -2'], 0, 0);
    expect(d.unsatisfied.length).toBeGreaterThan(0);
  });

  it.each([
    ['אורך z1z2 = -5', ['z1 = 3+4i', 'z2 = 1+i', 'אורך z1z2 = -5']],
    ['שטח Oz1z2 = -5', ['z1 = 3+4i', 'z2 = 1+i', 'שטח Oz1z2 = -5']],
  ])('«%s» — the MEASURE lanes already refused via #788 and are unchanged', (_label, lines) => {
    expect(deriveLines(lines as string[], 0, 0).unsatisfied.length).toBeGreaterThan(0);
  });
});
