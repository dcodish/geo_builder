/**
 * THE FORM CORPUS — every utterance the grammar must read, and what each one means.
 *
 * This began as S7's hard gate ([#624](https://github.com/dcodish/geo_builder/issues/624),
 * ADR-CX-019): each form was run through BOTH grammars, and a form the prototype read and v2 did not
 * was a failure here rather than a note in a document. That measurement is what found the eight
 * capabilities S7 rebuilt, then #680's solution set, then #690 and #691.
 *
 * The prototype is now deleted, and with it the `parseLine` half of every case
 * ([ADR-CX-027](../../../docs/06d-decisions-complex.md#adr-cx-027)). The parity QUESTION is answered
 * once and cannot be asked again — there is nothing left to be at parity with — but the LIST is not
 * about the prototype and never was: it is the corpus of utterances a student types, collected by
 * measurement rather than by invention, and it catches a grammar regression on its own.
 */
import { describe, expect, it } from 'vitest';

import { parseLineV2 } from '../rules';
import { deriveLines } from '../../app/deriveLines';

/** Every form the corpus and the retired prototype's suite exercise, one representative each. */
const PROTOTYPE_FORMS: readonly string[] = [
  'z1 = 3+4i',
  'z2 = 2cis150',
  'z1 מספר מרוכב',
  'w = הצמוד של z1',
  'w = conj(z1)',
  'w = ההופכי של z1',
  'w = 1/(z1)',
  '|z1-z2|',
  'z1*z2',
  'w = re(z1)',
  'im(z1)',
  'w = החלק הממשי של z1',
  'z = rcis(theta)',
  'z1 = 2cis(θ)',
  'z^3 = 8',
  'z1^3 = z3',
  '-2z1 = conj(z3)',
  '|z1| = 9r',
  '|z1| = 2|z2|',
  'arg z1 - arg z2 = 90',
  'arg z2 < 45',
  // The PARENTHESISED spellings. The list above sampled only the bare ones, and that hole hid a real
  // gap: `arg(z1) < 30` is what the prototype's own #606 case types, the prototype reads it, and v2
  // returned `not-handled` — a capability the cutover would have deleted. Fixed at the orthography
  // chokepoint (ADR-CX-023), so every argument rule gained it at once rather than four patterns each
  // growing an optional paren.
  'arg(z1) < 30',
  'arg(z1) = 45',
  'arg(z1) - arg(z2) = 90',
  'z1 ברביע הראשון',
  // The other placements of the same three words. The list above sampled one word order, and that hole
  // hid three more: «נמצא» is a framing verb the accountant blamed the student for, and the
  // keyword-first order is what RTL typing produces (#599 — its regression coverage lived only in the
  // prototype). A rule that fixes a word order refuses half the register, which is this rule's own
  // ADR-3D-145 note read one level up.
  'z2 נמצא ברביע השלישי',
  'ברביע הראשון z2',
  'z3 in the second quadrant',
  'z4 quadrant 4',
  // The generic polar form, SPACED — the spelling the exam prints. Only the unspaced one was covered,
  // and the spaced one fell through to the expression grammar, which lexed `rcis` as a single name.
  'z1 = r cis θ',
  'w = r cis 45',
  'z = rcis(β)',
  'המרובע Oz1z2z3',
  'שטח Oz1z2z3 הוא 150r^2',
  'z1, z2, z3 סדרה הנדסית',
  'z1*conj(z1) + z2*conj(z2) = 25',
];

describe('the form corpus: every one of these still parses', () => {
  it.each(PROTOTYPE_FORMS)('«%s»', (line) => {
    expect(parseLineV2(line).ok, `the grammar stopped reading «${line}»`).toBe(true);
  });

  it('is not vacuous', () => {
    expect(PROTOTYPE_FORMS.length).toBeGreaterThan(30);
  });
});

describe('F4 inequalities are branch SELECTORS, not drivers', () => {
  it('«arg z2 < 45» keeps the sampled direction inside the window', () => {
    const d = deriveLines(['z2', 'arg z2 < 45']);
    const z2 = d.points.find((p) => p.name === 'z2')!;
    expect(z2.argumentDeg).toBeLessThan(45);
  });

  it('a two-sided window bounds both ends', () => {
    const d = deriveLines(['z1', '90 < arg z1 < 180']);
    const z1 = d.points.find((p) => p.name === 'z1')!;
    expect(z1.argumentDeg).toBeGreaterThan(90);
    expect(z1.argumentDeg).toBeLessThan(180);
  });

  /**
   * `z` is declared FIRST, so «z³ = 8» constrains that letter and its three roots are its three
   * configurations (ADR-CX-005 mode 2) — which is the branch set this property is about. Without the
   * declaration the same line ENUMERATES, `z` becomes a reserved name for the whole solution set, and
   * a window on `arg z` is a different sentence: see `solution-sets.test.ts`, where it is refused.
   */
  it('it PRUNES an enumerated branch set rather than moving a forced value (#651)', () => {
    // the three cube roots of 8 sit at 0°, 120°, 240°: only one is in (90°, 180°)
    const d = deriveLines(['z', 'z^3 = 8', '90 < arg z < 180']);
    expect(d.configCount).toBe(1);
    expect(d.points[0].reading).toBe('z = 2·cis120°');
  });
});

describe('the projections are real, and no longer an invented parameter', () => {
  /**
   * `im(z1)` lexed as the NAME `im` times `z1` — a stated projection silently became a product with an
   * invented real parameter. Same defect the TOKEN comment records for `2cis150`.
   */
  it('«im(z1)» is the imaginary part, not a product', () => {
    const d = deriveLines(['z1 = 3+4i', 'im(z1)']);
    expect(d.knowledge[0].value).toBe('4');
    expect(d.points.map((p) => p.name)).toEqual(['z1']); // no phantom `im` number
  });

  it('«re(z1)» reads the real part, and defines a number when named', () => {
    const d = deriveLines(['z1 = 3+4i', 'w = re(z1)']);
    const w = d.points.find((p) => p.name === 'w')!;
    expect(w.z.re).toBeCloseTo(3, 9);
    expect(w.z.im).toBeCloseTo(0, 9);
  });

  it('the Hebrew spelling is the same operation', () => {
    const he = deriveLines(['z1 = 3+4i', 'w = החלק הממשי של z1']);
    const fn = deriveLines(['z1 = 3+4i', 'w = re(z1)']);
    expect(he.points.map((p) => p.reading)).toEqual(fn.points.map((p) => p.reading));
  });
});

describe('a bare expression is a QUESTION, answered by the knowledge rule', () => {
  it('«|z1-z2|» over a determined figure answers', () => {
    expect(deriveLines(['z1 = 3+4i', 'z2 = 3', '|z1-z2|']).knowledge[0].value).toBe('4');
  });

  it('«|z1-z2|» over the capstone answers IN THE UNIT — the prototype panel’s job, done honestly', () => {
    const d = deriveLines(['|z1| = 9r', '|z2| = 12r', 'arg z1 - arg z2 = 90', '|z1-z2|']);
    expect(d.knowledge[0].value).toBe('15r');
  });

  it('and withholds a value the givens do not force, saying why', () => {
    const d = deriveLines(['z1 = 3', 'z2', '|z1-z2|']);
    expect(d.knowledge[0].value).toBeNull();
    expect(d.knowledge[0].why).not.toBe('');
  });

  it('a bare expression states nothing — it declares its names and constrains nothing', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 1', '|z1-z2|']);
    expect(d.unsatisfied).toEqual([]);
    expect(d.undecided).toEqual([]);
  });
});

describe('the spelled-out declaration and the symbolic polar form', () => {
  it('«z1 ו-z2 מספרים מרוכבים» declares both', () => {
    const d = deriveLines(['z1 ו-z2 מספרים מרוכבים']);
    expect(d.points.map((p) => p.name).sort()).toEqual(['z1', 'z2']);
  });

  it('«z1 = 2cis(θ)» states the MAGNITUDE and leaves the direction free', () => {
    const d = deriveLines(['z1 = 2cis(θ)']);
    const z1 = d.points[0];
    expect(Math.hypot(z1.z.re, z1.z.im)).toBeCloseTo(2, 6);
    expect(d.freeDof.some((f) => f.includes('arg'))).toBe(true);
  });

  /**
   * Each half of `<mod> cis <ang>` may be symbolic, and the SHAPE decides what is stated — never more
   * than was stated ([ADR-052](../../../docs/06-decisions.md#adr-052)).
   */
  it('«w = r cis 45» states the DIRECTION and leaves the magnitude free — the mirror case', () => {
    const d = deriveLines(['w = r cis 45']);
    expect(d.points[0].argumentDeg).toBeCloseTo(45, 6);
    expect(d.freeDof).toContain('|w|');
    expect(d.freeDof.some((f) => f.includes('arg'))).toBe(false);
  });

  it('«z1 = r cis θ» states NOTHING but the name — both halves stay free', () => {
    const d = deriveLines(['z1 = r cis θ']);
    expect(d.points.map((p) => p.name)).toEqual(['z1']);
    expect(d.freeDof).toEqual(expect.arrayContaining(['|z1|', 'arg z1']));
    // and it invents no parameter: `rcis` lexed as one name is what the old reading produced
    expect(d.freeDof.filter((f) => /cis|theta/i.test(f))).toEqual([]);
  });

  it('a numeric pair stays a LITERAL — the expression grammar reads it exactly', () => {
    const d = deriveLines(['z1 = 2cis150']);
    expect(d.points[0].argumentDeg).toBeCloseTo(150, 6);
    expect(d.freeDof).toEqual([]);
  });
});

describe('a magnitude may not silently equal a COMPLEX number', () => {
  it('«|z1| = 9w» is refused — it is not re-read as «|z1| = 9|w|» with a phantom w', () => {
    expect(parseLineV2('|z1| = 9w').ok).toBe(false);
    const d = deriveLines(['|z1| = 9w']);
    expect(d.points).toEqual([]);
    expect(d.untranslated).toHaveLength(1);
  });

  it('…while the forms that ARE magnitudes keep working', () => {
    for (const line of ['|z1| = 9r', '|z1| = 2|z2|', '|z1| = 2', '|z1| = |z2|']) {
      expect(parseLineV2(line).ok, line).toBe(true);
      expect(deriveLines([line]).untranslated, line).toEqual([]);
    }
  });

  /**
   * The third reading of the same shape. A bare NAME opposite the bars is a DEFINITION, and it states
   * the number completely — argument included. Lowering it modulus-only left the direction free to be
   * sampled, which is half a given dropped in silence.
   */
  it('«w1 = |z1|» DEFINES a real number — both halves, not just the magnitude', () => {
    const d = deriveLines(['z1 = 3+4i', 'w1 = |z1|']);
    const w1 = d.points.find((p) => p.name === 'w1')!;
    expect(w1.z.re).toBeCloseTo(5, 6);
    expect(w1.z.im).toBeCloseTo(0, 6);
    expect(d.freeDof).toEqual([]);
  });

  it('…and a magnitude RELATION still leaves the direction free, as ADR-052 requires', () => {
    const d = deriveLines(['|z1| = 5']);
    expect(Math.hypot(d.points[0].z.re, d.points[0].z.im)).toBeCloseTo(5, 6);
    expect(d.freeDof).toContain('arg z1');
  });
});

describe('a quadrant given reads in every word order the register has', () => {
  it.each([
    ['z1 ברביע הראשון', 1],
    ['z2 נמצא ברביע השלישי', 3],
    ['ברביע הראשון z2', 1],
    ['z3 in the second quadrant', 2],
    ['z4 quadrant 4', 4],
  ])('«%s» folds the direction into quadrant %i', (line, q) => {
    const d = deriveLines([line], 0, 0);
    const deg = d.points[0].argumentDeg;
    expect(deg).toBeGreaterThan((q - 1) * 90);
    expect(deg).toBeLessThan(q * 90);
    expect(d.untranslated).toEqual([]);
  });
});
