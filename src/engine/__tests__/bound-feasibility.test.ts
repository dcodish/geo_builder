/**
 * #1335 ([ADR-540](../../../docs/06-decisions.md#adr-540)) — A BOUND AND A PINNED VALUE OF THE SAME
 * MEASURE THAT EXCLUDE EACH OTHER ARE A PROVEN CONTRADICTION, NEVER A PENDING FIGURE.
 *
 * Found validating round #1332's play sheet (T24). «משולש ABC» · «BC > 10» · «BC = 4» read as PENDING
 * — «הנתון נרשם אך לא משפיע בינתיים», "add the remaining givens" — for a pair of statements no later
 * given can reconcile. `constraintIsPending` asks whether the residual MOVES across seeds; on a free
 * triangle it does, and that is not whether it can reach zero.
 *
 * The third prover beside ADR-417's metric one and ADR-538's angle-sum one, with the same one-way
 * soundness: a violation proves impossibility, passing proves nothing.
 */
import { describe, expect, it } from 'vitest';
import { boundImpossibility, boundImpossibilityError } from '../metricFeasibility';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { replay } from '@/replay/core';
import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import type { Constraint } from '../types';

const t: Translate = (k, o) => i18n.t(k, o) as string;
const dist = (a: string, b: string, value: number): Constraint => ({ type: 'distance', a, b, value });
const lenB = (a: string, b: string, c: Partial<Constraint> = {}): Constraint =>
  ({ type: 'length-bound', a, b, ...c }) as Constraint;
const ang = (ray1: string, vertex: string, ray2: string, value: number, arcOf?: string): Constraint =>
  ({ type: 'angle', vertex, ray1, ray2, value, ...(arcOf ? { arcOf } : {}) }) as Constraint;
const angB = (ray1: string, vertex: string, ray2: string, c: Partial<Constraint> = {}): Constraint =>
  ({ type: 'angle-bound', vertex, ray1, ray2, ...c }) as Constraint;

describe('boundImpossibility — the pure prover', () => {
  it('the reported member: a length bound above a pinned length, naming both statements', () => {
    const m = boundImpossibility([lenB('B', 'C', { min: 10 }), dist('B', 'C', 4)]);
    expect(m).not.toBeNull();
    expect(boundImpossibilityError(m!)).toBe('impossible: |BC| = 4 contradicts |BC| > 10');
  });

  /**
   * The constraint list carries no order, so the two statement orders are ONE case by construction —
   * which is the point of proving it here rather than at the submit seam.
   */
  it('the order the student typed makes no difference', () => {
    expect(boundImpossibility([dist('B', 'C', 4), lenB('B', 'C', { min: 10 })])).not.toBeNull();
    expect(boundImpossibility([lenB('C', 'B', { min: 10 }), dist('B', 'C', 4)])).not.toBeNull();
  });

  it('the angle member is the same prover, not a second one', () => {
    const m = boundImpossibility([angB('A', 'B', 'C', { min: 100 }), ang('A', 'B', 'C', 40)]);
    expect(boundImpossibilityError(m!)).toBe('impossible: ∠ABC = 40° contradicts ∠ABC > 100°');
    // the ray order the student wrote does not matter — ∠ABC and ∠CBA are one angle
    expect(boundImpossibility([angB('C', 'B', 'A', { min: 100 }), ang('A', 'B', 'C', 40)])).not.toBeNull();
  });

  it('an upper bound and a two-sided range are members too', () => {
    expect(boundImpossibilityError(boundImpossibility([lenB('B', 'C', { max: 3 }), dist('B', 'C', 9)])!)).toBe(
      'impossible: |BC| = 9 contradicts |BC| < 3',
    );
    expect(boundImpossibilityError(boundImpossibility([lenB('B', 'C', { min: 4, max: 8 }), dist('B', 'C', 20)])!)).toBe(
      'impossible: |BC| = 20 contradicts 4 < |BC| < 8',
    );
  });

  /**
   * STRICTNESS IS THE WHOLE OF WHAT A STUDENT CAN SAY NEXT (#1265, ADR-529). These two rows are the
   * reason the prover cannot simply compare against the bound: one of them is a figure.
   */
  it('«BC ≥ 10» · «BC = 10» is a FIGURE; «BC > 10» · «BC = 10» is not', () => {
    expect(boundImpossibility([lenB('B', 'C', { min: 10, minStrict: false }), dist('B', 'C', 10)])).toBeNull();
    expect(boundImpossibility([lenB('B', 'C', { min: 10 }), dist('B', 'C', 10)])).not.toBeNull();
    expect(boundImpossibility([lenB('B', 'C', { max: 10, maxStrict: false }), dist('B', 'C', 10)])).toBeNull();
  });

  it('passing proves nothing: a value INSIDE its bound says nothing at all', () => {
    expect(boundImpossibility([lenB('B', 'C', { min: 10 }), dist('B', 'C', 40)])).toBeNull();
    expect(boundImpossibility([lenB('B', 'C', { min: 4, max: 8 }), dist('B', 'C', 6)])).toBeNull();
    // a bound with no stated value of that measure, and a value with no bound
    expect(boundImpossibility([lenB('B', 'C', { min: 10 })])).toBeNull();
    expect(boundImpossibility([dist('B', 'C', 4)])).toBeNull();
  });

  it('a bound and a value about DIFFERENT measures never meet', () => {
    expect(boundImpossibility([lenB('A', 'B', { min: 10 }), dist('B', 'C', 4)])).toBeNull();
    expect(boundImpossibility([angB('A', 'B', 'C', { min: 100 }), ang('B', 'C', 'A', 40)])).toBeNull();
  });

  /** An arc measure lives on a circle, not at a vertex — the ADR-538 exclusion, for the same reason. */
  it('an ARC measure is not the angle a vertex bound is about', () => {
    expect(boundImpossibility([angB('A', 'B', 'C', { min: 100 }), ang('A', 'B', 'C', 40, 'circle-B')])).toBeNull();
  });

  it('the student reads it in Hebrew, naming both of their own statements', () => {
    const msg = humanizeError('impossible: |BC| = 4 contradicts |BC| > 10', t);
    expect(msg).toContain('|BC| = 4');
    expect(msg).toContain('|BC| > 10');
    expect(msg).not.toContain('impossible:');
  });
});

describe('end to end — the reported sequence through the real parse → replay path', () => {
  const run = (lines: string[]) => replay(factsOf(lines as never));

  it('«BC > 10» · «BC = 4» is a hard refusal naming both givens, never pending', () => {
    const fig = run(['משולש ABC', 'BC > 10', 'BC = 4']);
    expect(fig.lastError).toBe('impossible: |BC| = 4 contradicts |BC| > 10');
    expect(fig.pending).toBe(false);
  });

  it('the reverse order is the same refusal — one message for one contradiction', () => {
    const fig = run(['משולש ABC', 'BC = 4', 'BC > 10']);
    expect(fig.lastError).toBe('impossible: |BC| = 4 contradicts |BC| > 10');
    expect(fig.pending).toBe(false);
  });

  it('the wordy spelling (ADR-539) is the same statement and gets the same verdict', () => {
    const fig = run(['משולש ABC', 'אורך הקטע BC גדול מ-10', 'BC = 4']);
    expect(fig.lastError).toBe('impossible: |BC| = 4 contradicts |BC| > 10');
    expect(fig.pending).toBe(false);
  });

  it('the angle member, end to end', () => {
    const fig = run(['משולש ABC', '∠ABC > 100', '∠ABC = 40']);
    expect(fig.lastError).toBe('impossible: ∠ABC = 40° contradicts ∠ABC > 100°');
    expect(fig.pending).toBe(false);
  });

  it('#1265 still builds: «BC ≥ 10» · «BC = 10» is a real figure', () => {
    const fig = run(['משולש ABC', 'BC >= 10', 'BC = 10']);
    expect(fig.lastError).toBeNull();
    expect(fig.pending).toBe(false);
  });

  it('a value inside its bound still builds', () => {
    const fig = run(['משולש ABC', 'BC > 10', 'BC = 40']);
    expect(fig.lastError).toBeNull();
    expect(fig.pending).toBe(false);
  });
});
