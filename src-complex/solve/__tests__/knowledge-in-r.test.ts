/**
 * S6 (#623) — «הביעו באמצעות r», and the quantified claims (F12).
 *
 * Two things the corpus asks constantly and the knowledge gate as it stood had to refuse:
 *
 *   1. **A measure expressed in a parameter.** The figure genuinely has a free degree of freedom, so no
 *      NUMBER is knowledge — and yet `15r` is knowledge, exactly, and is the answer the exam wants.
 *      `r` is not an unknown of the figure, it is its unit.
 *   2. **A claim about every power at once**, or about the least one. «לכל n טבעי w^(4n) ממשי» is not a
 *      property any finite set of drawings has; it is a congruence, and the exact core decides it.
 */
import { describe, expect, it } from 'vitest';

import { deriveLines } from '../../app/deriveLines';

const rowFor = (lines: string[], label: string) => {
  const d = deriveLines(lines);
  const row = d.knowledge.find((k) => k.label.includes(label));
  expect(row, `no knowledge row for «${label}»`).toBeDefined();
  return row!;
};

describe('a measure over a shape-fixed figure is knowledge, expressed in the unit', () => {
  /** docs/27 §2b א: |Z₁| = 9r, |Z₂| = 12r, arg Z₁ − arg Z₂ = 90° ⇒ |Z₁Z₂| = 15r, the 9-12-15 triangle. */
  it('«אורך z1z2» over the capstone givens is 15r', () => {
    const row = rowFor(['|z1| = 9r', '|z2| = 12r', 'arg z1 - arg z2 = 90', 'אורך z1z2'], 'אורך');
    expect(row.value).toBe('15r');
  });

  it('an AREA comes out in r², because an area is homogeneous of degree two', () => {
    const row = rowFor(['|z1| = 9r', '|z2| = 12r', 'arg z1 - arg z2 = 90', 'שטח Oz1z2'], 'שטח');
    expect(row.value).toBe('54r²'); // ½·9r·12r
  });

  it('a PERIMETER is degree one, like a length', () => {
    const row = rowFor(
      ['|z1| = 9r', '|z2| = 12r', 'arg z1 - arg z2 = 90', 'היקף המשולש Oz1z2'],
      'היקף',
    );
    expect(row.value).toBe('36r'); // 9r + 12r + 15r
  });

  /**
   * The conservative direction, and the point of checking rather than assuming.
   *
   * «z1 = 3» pins an absolute size, so `r` is a genuine unknown here rather than the figure's unit:
   * scaling the figure no longer produces a valid configuration, and the length really is undetermined.
   */
  it('a figure with a pinned size prints NOTHING — r is an unknown there, not a unit', () => {
    const row = rowFor(['z1 = 3', 'z2', '|z2| = 4r', 'אורך z1z2'], 'אורך');
    expect(row.value).toBeNull();
    expect(row.why).not.toBe('');
  });

  /** With no parameter at all, a shape fixed up to rotation still determines the number itself. */
  it('a figure free only up to ROTATION still knows its lengths', () => {
    const row = rowFor(['|z1| = 9', '|z2| = 12', 'arg z1 - arg z2 = 90', 'אורך z1z2'], 'אורך');
    expect(row.value).toBe('15');
  });

  it('two free parameters are not a unit — nothing is printed rather than a guess', () => {
    const row = rowFor(['|z1| = 9r', '|z2| = 12d', 'arg z1 - arg z2 = 90', 'אורך z1z2'], 'אורך');
    expect(row.value).toBeNull();
  });
});

describe('F12 — a claim about every power, decided by congruence', () => {
  it.each([
    ['לכל n טבעי, w^(4n) ממשי', 'holds'],
    ['for every natural n, w^(4n) is real', 'holds'],
    ['w^(4n) is real for every natural n', 'holds'],
    // w = cis45°: w² = cis90° is pure imaginary, so «real for every n» is false at n = 1
    ['לכל n טבעי, w^(2n) ממשי', 'refuted'],
    ['לכל n טבעי, w^(2n) מדומה טהור', 'refuted'],
  ])('«%s» → %s', (line, status) => {
    const d = deriveLines(['w = 1cis45', line]);
    expect(d.claims).toHaveLength(1);
    expect(d.claims[0].verdict.status).toBe(status);
  });

  it('a for-all claim holds for EVERY n, not for the sampled ones — cis36° and w^(10n)', () => {
    const d = deriveLines(['w = 1cis36', 'לכל n טבעי, w^(10n) ממשי']);
    expect(d.claims[0].verdict.status).toBe('holds');
  });

  it('an argument with no closed form is UNKNOWN, never refuted', () => {
    // 53.13° is not a rational part of a turn: the question is undecidable, and refusing a true claim
    // would tell a student their correct answer is wrong
    const d = deriveLines(['w = 3+4i', 'לכל n טבעי, w^(4n) ממשי']);
    expect(d.claims[0].verdict.status).toBe('unknown');
  });
});

describe('F12 — the minimal n: the student answers, the tool checks', () => {
  it('confirms the least n', () => {
    const d = deriveLines(['w = 1cis45', 'ה-n המינימלי שעבורו w^n מדומה טהור הוא 2']);
    expect(d.claims[0].verdict.status).toBe('holds');
  });

  it('refuses an n that WORKS but is not the least — and names the least one', () => {
    // n = 6 does make w⁶ = cis270° pure imaginary; it is simply not minimal
    const d = deriveLines(['w = 1cis45', 'ה-n המינימלי שעבורו w^n מדומה טהור הוא 6']);
    expect(d.claims[0].verdict.status).toBe('refuted');
    expect(d.claims[0].verdict.why).toContain('2');
  });

  it('reads the English form too', () => {
    const d = deriveLines(['w = 1cis45', 'the minimal n for which w^n is pure imaginary is 2']);
    expect(d.claims[0].verdict.status).toBe('holds');
  });

  it('«w^n ממשי» — the least n for a 45° number is 4', () => {
    const d = deriveLines(['w = 1cis45', 'ה-n המינימלי שעבורו w^n ממשי הוא 4']);
    expect(d.claims[0].verdict.status).toBe('holds');
  });
});

/**
 * The cycle button reads ONE published answer (ADR-CX-020, operator ruling 2026-08-17).
 *
 * «Show another configuration» walks the branch set and resamples what is free. When there is neither
 * a second configuration nor a free degree of freedom, it cannot change the picture — and a button that
 * visibly does nothing tells a student their figure might be wrong when it is simply determined.
 */
describe('canCycle — is there another drawing to show?', () => {
  it('a fully determined figure has nothing to cycle', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 2cis150']);
    expect(d.configCount).toBe(1);
    expect(d.freeDof).toEqual([]);
    expect(d.canCycle).toBe(false);
  });

  /**
   * The several DRAWINGS of one letter, not the several solutions of an equation: an enumeration is one
   * configuration containing n points and has nothing to cycle, which is ADR-CX-020 and ADR-CX-021
   * agreeing. Declaring `z` first makes the equation constrain it, and then there genuinely are three.
   */
  it('a constrained letter with several solutions can cycle', () => {
    const d = deriveLines(['z', 'z^3 = 8']);
    expect(d.configCount).toBe(3);
    expect(d.canCycle).toBe(true);
  });

  it('a free number can cycle — resampling IS another drawing', () => {
    expect(deriveLines(['z1 = 3', 'z2']).canCycle).toBe(true);
  });

  it('a free PARAMETER counts too: «|z1| = 9r» is one shape at many sizes', () => {
    expect(deriveLines(['|z1| = 9r']).canCycle).toBe(true);
  });

  it('a measure that consumes the last freedom turns it off', () => {
    const open = deriveLines(['z1 = 3+4i', 'z2', '|z2| = 2']);
    expect(open.canCycle).toBe(true);
    const closed = deriveLines(['z1 = 3+4i', 'z2 = 3']);
    expect(closed.canCycle).toBe(false);
  });
});
