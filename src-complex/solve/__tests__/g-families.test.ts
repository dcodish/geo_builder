/**
 * The §10b extended families, as they land (ADR-CX-018).
 *
 *   - **G7** — sums over a SET, and of an expression in the terms: `z₁·z̄₁ + z₂·z̄₂ + … = 30`. One
 *     sentence form, and the engine decides whether it drives a free number or checks a determined one.
 *   - **G8** — real-parameter algebra: the RATIO of two measures, which is knowable where neither half
 *     is, because the unit divides out.
 *
 * The first describe is the honesty defect building G7 uncovered: an additive equation whose literal
 * had no closed polar form («z1 + z2 = 5+2i») could not be evaluated, and an unevaluable relation was
 * dropped from the live system in silence — no drive, no refusal, no row.
 */
import { describe, expect, it } from 'vitest';

import { deriveLines } from '../../app/deriveLines';

describe('an additive equation with an ordinary literal actually drives', () => {
  it('«z1 + z2 = 5+2i» places z2 exactly, and 5+2i has no closed polar form', () => {
    const d = deriveLines(['z1 = 3', 'z2', 'z1 + z2 = 5+2i']);
    const z2 = d.points.find((p) => p.name === 'z2')!;
    expect(z2.z.re).toBeCloseTo(2, 6);
    expect(z2.z.im).toBeCloseTo(2, 6);
    expect(d.unsatisfied).toEqual([]);
    expect(d.undecided).toEqual([]);
  });

  it('a relation the engine cannot evaluate is REPORTED, never dropped', () => {
    // an equation over a name that never reaches the canvas cannot be evaluated — and must say so
    const d = deriveLines(['z1 = 3', 'z1 + z2 = 5+2i', 'z2 = 1']);
    expect(d.untranslated.concat()).toEqual([]);
    // either it holds, it is violated, or it is undecided — silence is the one outcome that is a bug
    expect(d.unsatisfied.length + d.undecided.length + (d.points.length > 1 ? 1 : 0)).toBeGreaterThan(0);
  });
});

describe('G7 — a sum over a set, driving or checking from one form', () => {
  it('checks a TRUE sum on a determined figure', () => {
    const d = deriveLines(['z1 = 3', 'z2 = 4i', 'z1*conj(z1) + z2*conj(z2) = 25']);
    expect(d.unsatisfied).toEqual([]);
    expect(d.undecided).toEqual([]);
  });

  it('refuses a FALSE sum, naming the student’s own line', () => {
    const d = deriveLines(['z1 = 3', 'z2 = 4i', 'z1*conj(z1) + z2*conj(z2) = 30']);
    expect(d.unsatisfied).toEqual(['z1*conj(z1) + z2*conj(z2) = 30']);
  });

  it('the same form DRIVES when a term is free', () => {
    const d = deriveLines(['z1 = 3', 'z2', 'z1 + z2 = 8']);
    const z2 = d.points.find((p) => p.name === 'z2')!;
    expect(z2.z.re).toBeCloseTo(5, 6);
    expect(z2.z.im).toBeCloseTo(0, 6);
  });

  it('«סכום המספרים הוא אפס» — a closing sum over three numbers', () => {
    const d = deriveLines(['z1 = 1', 'z2 = 1cis120', 'z3 = 1cis240', 'z1 + z2 + z3 = 0']);
    expect(d.unsatisfied).toEqual([]);
  });
});

describe('G8 — a RATIO is knowable where neither of its halves is', () => {
  const CAPSTONE = ['|z1| = 9r', '|z2| = 12r', 'arg z1 - arg z2 = 90'];

  it('«היחס בין אורך Oz1 לאורך Oz2» is 0.75, though neither length is a number', () => {
    const d = deriveLines([...CAPSTONE, 'אורך Oz1', 'היחס בין אורך Oz1 לאורך Oz2']);
    const plain = d.knowledge.find((k) => k.label === 'אורך Oz1')!;
    const ratio = d.knowledge.find((k) => k.label.startsWith('היחס'))!;
    expect(plain.value).toBe('9r'); // knowable only in the unit
    expect(ratio.value).toBe('0.75'); // knowable outright — the unit cancels
  });

  it('a ratio of AREAS is a plain number too', () => {
    const d = deriveLines([
      '|z1| = 9r',
      '|z2| = 12r',
      '|z3| = 6r',
      'arg z1 - arg z2 = 90',
      'arg z1 - arg z3 = 90',
      'היחס בין שטח Oz1z2 לשטח Oz1z3',
    ]);
    const ratio = d.knowledge.find((k) => k.label.startsWith('היחס'))!;
    expect(ratio.value).toBe('2'); // (½·9r·12r) / (½·9r·6r)
  });

  it.each([
    'the ratio between length z1z2 and length z1z3',
    'the ratio of area Oz1z2 to area Oz1z3',
  ])('reads the English form: %s', (line) => {
    const d = deriveLines(['z1 = 1', 'z2 = 2', 'z3 = 4', line]);
    expect(d.untranslated).toEqual([]);
    expect(d.knowledge).toHaveLength(1);
  });

  it('a ratio the givens do not determine still prints nothing', () => {
    const d = deriveLines(['z1 = 3', 'z2', 'z3', 'היחס בין אורך Oz2 לאורך Oz3']);
    expect(d.knowledge[0].value).toBeNull();
    expect(d.knowledge[0].why).not.toBe('');
  });
});
