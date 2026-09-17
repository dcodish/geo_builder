/**
 * #1109 — a circle's centre can be NAMED, by clicking it or by typing the sentence.
 *
 * Operator, playing T10/T12: *"when a center of a circle is defined by the equation, it should be
 * clickable so user can assign the center with a letter"*. The `+` mark has been drawn since #1024 and
 * was inert; a **crossing** in the same figure was clickable and minted a letter, so the affordance
 * existed and the most interesting point on a circle did not have it.
 *
 * ## The ruling this builds
 *
 * *"the click only names what doesn't have a name"* (2026-09-16). Two halves, both asserted:
 *
 *  - **It NAMES — it never asserts.** No constraint, no degree of freedom. A label is not a given.
 *  - **It is offered only where a name is MISSING**, and disappears once one exists.
 *
 * ## The grammar was the whole of the work, and that was measured
 *
 * The issue warned the missing sentence was *"probably the larger part"*. Measured: none of six
 * spellings parsed — but the ENGINE half already existed. `circle-centre` has been a `DerivedRule`
 * since #1059/#1060, the one whose parent is a curve rather than a set of points. So this is a parser
 * rule emitting an existing fact, not a second kind of centre-point (which would be ADR-AG-023's
 * divergence).
 *
 * ## Siblings, decided out loud
 *
 * A parabola's FOCUS and an ellipse's CENTRE are the same question and are **not** in this slice: neither
 * has a `DerivedRule`, so each is new engine work rather than a spelling. Circle-only, per the issue's
 * own step 5.
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';
import { derive } from '../engine/derive';
import { centresOf, freeLetter } from '../engine/crossings';

const CIRCLE = 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9';
const offers = (lines: string[]) => {
  const d = derive(lines, 0);
  return centresOf(d.figure, freeLetter(d.construction));
};

describe('#1109 — the sentence, in every spelling', () => {
  it('parses in Hebrew and English', () => {
    for (const l of [
      'O מרכז המעגל I',
      'O הוא מרכז המעגל I',
      'נקודה O מרכז המעגל I',
      'O מרכז מעגל I',
      'O is the centre of circle I',
      'O is the center of circle I',
    ]) {
      expect(parseLine(l).ok, l).toBe(true);
    }
  });

  it('names the point the circle already determines', () => {
    const d = derive([CIRCLE, 'O מרכז המעגל I'], 0);
    expect(d.faults).toHaveLength(0);
    const o = d.figure.points.find((p) => p.id === 'O');
    expect(o).toBeDefined();
    expect(o!.x).toBeCloseTo(3, 9);
    expect(o!.y).toBeCloseTo(4, 9);
  });

  it('commits NO constraint and NO degree of freedom — the ruling', () => {
    /**
     * The half that matters most. On «נתון מעגל O משיק לציר x» the centre has freedom, and a click that
     * committed a sentence would be different from one that merely labels. It labels.
     */
    const before = derive([CIRCLE], 0);
    const after = derive([CIRCLE, 'O מרכז המעגל I'], 0);
    expect(after.construction.constraints.length).toBe(before.construction.constraints.length);
    expect(after.figure.carrierDof).toBe(before.figure.carrierDof);
  });

  it('an unknown circle is refused, never invented', () => {
    expect(derive([CIRCLE, 'O מרכז המעגל Z'], 0).faults).toHaveLength(1);
  });
});

describe('#1109 — the click is offered only where there is no name', () => {
  it('a named circle with an unnamed centre offers one', () => {
    const o = offers([CIRCLE]);
    expect(o).toHaveLength(1);
    expect(o[0].x).toBeCloseTo(3, 9);
    expect(o[0].y).toBeCloseTo(4, 9);
  });

  it('and stops offering once the centre HAS a name — the ruling, from the other side', () => {
    expect(offers([CIRCLE, 'O מרכז המעגל I'])).toEqual([]);
  });

  it('a point already sitting there counts as named, whatever route put it there', () => {
    expect(offers([CIRCLE, 'P(3,4)'])).toEqual([]);
  });

  it('an ANONYMOUS circle is not offered — its sentence could not round-trip', () => {
    /**
     * There is no «המעגל ‹name›» to write, and ADR-AG-054's rule is that a ring whose click fails is
     * worse than no ring.
     */
    expect(offers(['(x-1)^2+(y-1)^2=4'])).toEqual([]);
  });

  it('a figure with no circle offers nothing', () => {
    expect(offers(['נתון הישר l1: y=2x'])).toEqual([]);
  });
});

describe('#1109 — the offered sentence ROUND-TRIPS', () => {
  it('what the click commits is what the parser reads back', () => {
    /**
     * ADR-AG-048's «two surfaces, one grammar». This assertion earned its place immediately: the first
     * build composed the sentence from `label.name`, which is the whole noun phrase («מעגל I», not «I»),
     * and offered «P מרכז המעגל מעגל I» — which does not parse. Nothing else would have caught it.
     */
    const d = derive([CIRCLE], 0);
    const [offer] = centresOf(d.figure, freeLetter(d.construction));
    expect(offer).toBeDefined();

    const after = derive([CIRCLE, offer.sentence], 0);
    expect(after.faults, offer.sentence).toHaveLength(0);

    const named = after.figure.points.find((p) => p.id === offer.sentence.charAt(0));
    expect(named).toBeDefined();
    expect(named!.x).toBeCloseTo(offer.x, 9);
    expect(named!.y).toBeCloseTo(offer.y, 9);

    // …and the offer is gone afterwards, so a second click cannot double-name it.
    expect(centresOf(after.figure, freeLetter(after.construction))).toEqual([]);
  });

  it('the letter comes from freeLetter, so it never collides', () => {
    const d = derive([CIRCLE, 'A(0,0)', 'B(1,1)'], 0);
    const [offer] = centresOf(d.figure, freeLetter(d.construction));
    expect(offer).toBeDefined();
    expect(['A', 'B']).not.toContain(offer.sentence.charAt(0));
  });
});
