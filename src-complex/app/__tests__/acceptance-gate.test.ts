/**
 * THE ACCEPTANCE GATE — *a new statement must never break an earlier one* (ADR-276, ADR-CX-023).
 *
 * Under `?engine=v2` this doctrine was held by nothing: #658 made `addLine` return as soon as the
 * grammar could read a line, and the prototype's gate sat below that return. So a v2 session accepted
 * `|z1| = 5` and then `|z1| = 7` and drew a figure satisfying neither.
 *
 * These drive `submitLine` — the entry point the input box uses — rather than `acceptLine` directly,
 * except where the point IS the gate's purity. A test that calls the gate cannot catch a submit path
 * that stops calling it, and that is the specific defect this tree keeps paying for (#658, #686).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useComplexStore } from '../../store/useComplexStore';
import { acceptLine, submitLine } from '../submit';
import { deriveLines } from '../deriveLines';

const store = () => useComplexStore.getState();

beforeEach(() => {
  store().clearAll();
  store().setEngine('v2');
});

const figure = () => deriveLines(store().lines, store().seed, store().seed);

describe('a contradicting statement is refused, and the refusal NAMES the earlier one', () => {
  it.each([
    ['|z1| = 5', '|z1| = 7'],
    ['arg z1 = 30', 'arg z1 = 60'],
    ['z1 = 3+4i', '|z1| = 7'],
    ['z1 = 3+4i', 'z1 = 5'],
    ['arg z1 = 30', 'z1 ברביע השני'],
    ['z1 = 1+i', 'arg z1 < 30'],
  ])('«%s» then «%s»', (first, second) => {
    expect(submitLine(first)).toBe(true);
    expect(submitLine(second)).toBe(false);
    expect(store().lastError).toEqual({ key: 'incompatible', detail: first });
    // keep-prior: nothing landed, and the figure is still the one the first statement described
    expect(store().lines).toEqual([first]);
    expect(figure().contradiction).toBeNull();
    expect(figure().emptiedBy).toBeNull();
  });

  /**
   * The middle line is the culprit, not the immediately preceding one — the gate searches for which
   * earlier statement, removed, lets the new one in, rather than blaming whatever came last.
   */
  it('names the statement it actually conflicts with, not the most recent line', () => {
    ['|z1| = 5', 'z2 = 1+i', 'arg z2 = 45'].forEach((l) => expect(submitLine(l)).toBe(true));
    expect(submitLine('|z1| = 9')).toBe(false);
    expect(store().lastError).toEqual({ key: 'incompatible', detail: '|z1| = 5' });
  });
});

describe('a statement that cannot hold at ALL quotes the student, never internal state', () => {
  /**
   * There is no earlier line to name: O is the origin by construction. `incompatible` with an empty
   * detail would have printed *"cannot hold together with: «»"* — an error message about internal
   * state wearing a statement's clothes, which this product's honesty invariant forbids outright.
   */
  it('«o = 1+i» — the origin cannot be moved', () => {
    expect(submitLine('o = 1+i')).toBe(false);
    expect(store().lastError).toEqual({ key: 'impossible', detail: 'o = 1+i' });
    expect(store().lines).toEqual([]);
  });
});

describe("a CLAIM is the student's answer — it lands and is marked, never refused", () => {
  it.each([
    ['z1 = 3+4i', 'z1 מדומה טהור'],
    ['z1 = 2cis30', 'z2 = 3cis(-30)', 'z1 ו-z2 צמודים זה לזה'],
  ])('a false claim over determined numbers still lands (%s …)', (...lines) => {
    lines.forEach((l) => expect(submitLine(l)).toBe(true));
    expect(store().lines).toEqual(lines);
    const d = figure();
    expect(d.claims).toHaveLength(1);
    expect(d.claims[0].verdict.status).not.toBe('holds');
  });

  /**
   * The line between the two readings, and it is not arbitrary: `arg z1 < 30` is a GIVEN — a
   * `BranchFilter` — so an empty configuration set is LADDER-CX stage 2's `bound-unsatisfiable` and is
   * refused rather than drawn. «z1 מדומה טהור» is an ASSERTION and is verified. The prototype had no
   * claim families at all and read the inequality as a check it could fail with a ✗; drawing z₁ at 45°
   * while the student stated `< 30` violates a given, so v2's stricter reading is the honest one.
   */
  it('an inequality is a GIVEN, so it refuses where a claim would be marked ✗', () => {
    expect(submitLine('z1 = 1+i')).toBe(true);
    expect(submitLine('z1 מדומה טהור')).toBe(true); // a claim: lands, marked ✗
    expect(submitLine('arg z1 < 30')).toBe(false); // a given: refused
    expect(store().lastError?.key).toBe('incompatible');
  });
});

describe('only a NEWLY broken signal refuses', () => {
  /**
   * The doctrine is about damage the new line causes. A figure that already carries an unsatisfiable
   * given must keep accepting statements, or one bad line would wedge the whole session.
   */
  it('a figure that is already broken still accepts a further, unrelated statement', () => {
    expect(submitLine('|z1| = 5')).toBe(true);
    // force the session into a broken state the gate cannot have prevented: the store records the
    // line directly, bypassing the gate exactly as a stale saved session could
    useComplexStore.setState({ lines: ['|z1| = 5', '|z1| = 7'] });
    expect(figure().contradiction).not.toBeNull();
    expect(submitLine('z2 = 1+i')).toBe(true);
    expect(store().lines).toEqual(['|z1| = 5', '|z1| = 7', 'z2 = 1+i']);
  });
});

describe('the corpus is not disturbed — the §2b capstone builds line by line', () => {
  const SETUP = ['arg z1 - arg z2 = 90', '|z1| = 9r', '|z2| = 12r', 'z2 ברביע הראשון', 'arg z2 < 45'];

  it('every given of the setup is accepted, in order', () => {
    SETUP.forEach((l) => expect(submitLine(l), `refused «${l}»`).toBe(true));
    expect(store().lines).toEqual(SETUP);
    expect(figure().contradiction).toBeNull();
  });

  it('part א still answers 15r through the gate', () => {
    [...SETUP, '|z1-z2|'].forEach((l) => expect(submitLine(l)).toBe(true));
    expect(figure().knowledge[0].value).toBe('15r');
  });

  it('part ב — the area given pins the angle and the perimeter answers', () => {
    [
      ...SETUP,
      '|z3| = 20r',
      'arg z3 + arg z2 = 0',
      'המרובע Oz1z2z3',
      'שטח Oz1z2z3 הוא 150r^2',
      'היקף Oz1z2z3',
    ].forEach((l) => expect(submitLine(l), `refused «${l}»`).toBe(true));
    expect(store().lines).toHaveLength(10);
  });

  it('a restatement that AGREES is not a contradiction', () => {
    expect(submitLine('z1 = 3+4i')).toBe(true);
    expect(submitLine('|z1| = 5')).toBe(true); // ADR-CX-009 §1: a second mention is a given
    expect(store().lines).toEqual(['z1 = 3+4i', '|z1| = 5']);
  });
});

describe('the gate is PURE over (lines, raw, seed)', () => {
  /**
   * Pure because the config search must be able to answer "does it hold in another drawing?" without
   * mutating the session to find out — the prototype's own mini config-search, which exists here for
   * the numeric tier: a relation the sampler could not satisfy at one seed may be satisfiable at
   * another, and refusing the student's line over a sample would be the ADR-052 sin inverted.
   */
  it('reports the configuration it accepted in, and touches nothing', () => {
    const before = JSON.stringify(store().lines);
    const v = acceptLine(['z1 = 3+4i'], 'z2 = 1+i', 0);
    expect(v.ok).toBe(true);
    if (v.ok) expect(typeof v.seed).toBe('number');
    expect(JSON.stringify(store().lines)).toBe(before);
  });

  it('an accepted line records the seed the gate found', () => {
    expect(submitLine('z1 = 3+4i')).toBe(true);
    expect(store().seed).toBe(0);
    expect(store().lastError).toBeNull();
  });
});

describe('the prototype path is not routed through here', () => {
  /**
   * A v2 line reaching the store's `addLine` would bypass the gate silently. It throws instead — the
   * ADR-CX-009 rule that a default which is wrong when the caller forgets is a seam to remove, not a
   * convenience to keep.
   */
  it('the store refuses to decide a v2 line', () => {
    expect(() => store().addLine('z1 = 3+4i')).toThrow(/app\/submit/);
  });

  it('and still owns the prototype submit path unchanged', () => {
    store().setEngine('proto');
    expect(submitLine('z1 = 3+4i')).toBe(true);
    expect(store().facts).toHaveLength(1);
  });
});
