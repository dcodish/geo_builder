/**
 * S6 gate (#623): claims are the student's ANSWER, decided exactly.
 *
 * Family F10 appears in five of the eleven sampled exams. What makes these worth having as a first
 * class rather than a numeric spot-check is that they are DECIDED over the exact carriers — true in
 * every configuration or in none — which is what the exam is actually asking.
 */
import { describe, expect, it } from 'vitest';

import { deriveLines } from '../../app/deriveLines';

const verdicts = (...lines: string[]) => deriveLines(lines).claims.map((c) => c.verdict.status);
const only = (...lines: string[]) => deriveLines(lines).claims[0];

describe('a claim is verified, and never moves the figure', () => {
  it('«z ממשי» HOLDS when the givens force a real number', () => {
    expect(verdicts('z = 3', 'z ממשי')).toEqual(['holds']);
    expect(verdicts('z = -2', 'z ממשי')).toEqual(['holds']);
  });

  it('«z מדומה טהור» HOLDS for i and its multiples, and is REFUTED otherwise', () => {
    expect(verdicts('z = 2i', 'z מדומה טהור')).toEqual(['holds']);
    expect(verdicts('z = 3', 'z מדומה טהור')).toEqual(['refuted']);
  });

  it('a wrong claim is REFUTED without disturbing the figure it was made about', () => {
    const d = deriveLines(['z = 3', 'z מדומה טהור']);
    expect(d.claims[0].verdict.status).toBe('refuted');
    // the number is still exactly where the givens put it — the claim did not drive anything
    expect(d.points.find((p) => p.name === 'z')!.exactLabel).toBe('3·cis0°');
  });

  it('THE #607 FIGURE: «z3 מדומה טהור» is refuted, and z3 stays at 135°', () => {
    const d = deriveLines(['z1 ברביע הראשון', 'z1^3 = z3', '-2z1 = conj(z3)', 'z3 מדומה טהור']);
    expect(d.claims[0].verdict.status).toBe('refuted');
    expect(d.points.find((p) => p.name === 'z3')!.exactLabel).toBe('2√2·cis135°');
  });

  it('conjugacy needs BOTH halves — a different magnitude REFUTES it outright', () => {
    expect(verdicts('z1 = 2', 'z2 = 3', 'z1 ו-z2 צמודים')).toEqual(['refuted']);
    expect(verdicts('z1 = 2i', 'z2 = -2i', 'z1 ו-z2 צמודים')).toEqual(['holds']);
  });

  it('an OPAQUE angle makes conjugacy unknown — never refuted, which is the costly direction', () => {
    // 3+4i and 3-4i ARE conjugates, but each carries its own opaque base angle and nothing in the
    // exact core can prove one is the negative of the other. Saying "refuted" would tell a student
    // their correct answer is wrong; saying "unknown" is the truth about what we can decide.
    expect(verdicts('z1 = 3+4i', 'z2 = 3-4i', 'z1 ו-z2 צמודים')).toEqual(['unknown']);
  });

  /**
   * The other side of the same coin: an opaque angle is not automatically an obstacle. «z2 = conj(z1)»
   * propagates the SAME atom negated, so conjugacy is decided outright however unpleasant z1's angle
   * is — no sampling, and true for every configuration.
   */
  it('a DERIVED conjugate is decided exactly, opaque base angle and all', () => {
    expect(verdicts('z1 = 3+4i', 'z2 = conj(z1)', 'z1 ו-z2 צמודים')).toEqual(['holds']);
  });

  it('English mirrors', () => {
    expect(verdicts('z = 2i', 'z is pure imaginary')).toEqual(['holds']);
    expect(verdicts('z = 3', 'z is real')).toEqual(['holds']);
  });
});

describe('UNKNOWN is a first-class answer, not a failure', () => {
  it('a claim about a direction the givens leave free is unanswered, not wrong', () => {
    const c = only('z1 ברביע הראשון', 'z1 ממשי');
    expect(c.verdict.status).toBe('unknown');
    expect(c.verdict.why).toEqual({ code: 'undecided-arg', name: 'z1' });
  });

  it('conjugacy is unknown while either magnitude is still open', () => {
    expect(verdicts('z1 ו-z2 צמודים')).toEqual(['unknown']);
  });

  it('...which is the difference between "you have not finished" and "you are wrong"', () => {
    // the SAME claim becomes decidable once the givens pin the number
    expect(verdicts('z1 ברביע הראשון', 'z1 ממשי')).toEqual(['unknown']);
    expect(verdicts('z1 = 5', 'z1 ממשי')).toEqual(['holds']);
  });
});

describe('the claim is exact, so it holds for EVERY configuration', () => {
  it('z^4 = 16 — every root is checked by the same congruence, not by one drawing', () => {
    // roots at 0/90/180/270; the real claim holds on two of them and is refuted on the others,
    // and which one is on screen is the configuration index, not a tolerance
    // `z` is declared FIRST, so the equation constrains that letter and its four solutions are the
 //  four configurations (ADR-CX-005 mode 2). Without the declaration the line enumerates and `z` is a
 //  reserved name for the whole set, which is a different sentence (ADR-CX-021).
    const statuses = [0, 1, 2, 3].map(
      (i) => deriveLines(['z', 'z^4 = 16', 'z ממשי'], i).claims[0].verdict.status,
    );
    expect(statuses.filter((s) => s === 'holds')).toHaveLength(2);
    expect(statuses.filter((s) => s === 'refuted')).toHaveLength(2);
  });
});
