/**
 * A DIAGONAL IS AN OBJECT, and a concurrency point has a VERB (#1070).
 *
 * Operator, 2026-09-15:
 *
 *   > trying to say אלכסוני המרובע נפגשים בנקודה O - not supported
 *   > for a דלתון - i want to be able to say משוואת האלכסון הראשי or האלכסון המשני and give the equation
 *   > what i said about a kite should be true for other quads
 *
 * The last line is the one that decided the design, and it holds in ONE direction: every
 * quadrilateral has two diagonals as objects; only some have a *principal* one.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';

const codes = (lines: string[]) => derive(lines, 0).faults.map((f) => f.code);
const ids = (lines: string[]) => derive(lines, 0).construction.objects.map((o) => o.id);

describe('#1070 — the same fact, whichever way the corpus writes it', () => {
  it('«אלכסוני המרובע ABCD נפגשים בנקודה O» builds the SAME figure as the noun phrase', () => {
    // A sentence and a noun phrase saying one thing. Compared as constructions rather than as
    // parses, because what must agree is the figure, not the route to it.
    const verb = derive(['מרובע ABCD', 'אלכסוני המרובע ABCD נפגשים בנקודה O'], 0);
    const noun = derive(['מרובע ABCD', 'O מפגש האלכסונים במרובע ABCD'], 0);
    expect(verb.faults).toEqual([]);
    expect(JSON.stringify(verb.construction.objects.map((o) => o.id))).toBe(
      JSON.stringify(noun.construction.objects.map((o) => o.id)),
    );
  });

  it('carries the other concurrency points with it — one alternation, not three rules', () => {
    expect(codes(['משולש ABC', 'התיכונים נפגשים בנקודה M'])).toEqual([]);
    expect(codes(['משולש ABC', 'הגבהים נפגשים בנקודה H'])).toEqual([]);
    expect(codes(['משולש ABC', 'חוצי הזוויות נפגשים בנקודה I'])).toEqual([]);
  });

  it('accepts the CONSTRUCT state, which is the only form the verb sentence ever shows', () => {
    // «האלכסונים» standing alone becomes «אלכסוני המרובע» in front of the shape. The table was
    // written from the noun-phrase form, which only ever sees the free state.
    expect(codes(['מרובע ABCD', 'אלכסוני המרובע נפגשים בנקודה O'])).toEqual([]);
    expect(codes(['משולש ABC', 'תיכוני המשולש נפגשים בנקודה M'])).toEqual([]);
  });

  it('resolves «האלכסונים נפגשים בנקודה O» against the one quadrilateral in the figure', () => {
    expect(codes(['מרובע ABCD', 'האלכסונים נפגשים בנקודה O'])).toEqual([]);
    // …and refuses when there is no such shape, rather than inventing one.
    expect(codes(['אלכסוני המרובע נפגשים בנקודה O'])).toEqual(['ambiguous-shape']);
  });
});

describe('#1070 — «האלכסון AC» is the line AC', () => {
  it('behaves exactly as «הישר AC», incidences included', () => {
    const diag = derive(['מרובע ABCD', 'משוואת האלכסון AC היא y=2x'], 0);
    const line = derive(['מרובע ABCD', 'משוואת הישר AC היא y=2x'], 0);
    expect(diag.faults).toEqual([]);
    expect(JSON.stringify(diag.construction)).toBe(JSON.stringify(line.construction));
  });

  it('so the vertices really do lie on it (ADR-AG-026, inherited rather than re-derived)', () => {
    const d = derive(['מרובע ABCD', 'משוואת האלכסון AC היא y=2x'], 0);
    for (const id of ['A', 'C']) {
      const p = d.figure.points.find((q) => q.id === id)!;
      expect(p.y).toBeCloseTo(2 * p.x, 6);
    }
  });
});

describe('#1070 — only some shapes HAVE a principal diagonal', () => {
  /**
   * The modelling decision. In a kite «האלכסון הראשי» is the axis of symmetry — the diagonal joining
   * the two vertices where the equal sides meet — which is a geometric FACT about the figure. In a
   * plain quadrilateral, a parallelogram or a rhombus the phrase has no referent, and choosing one
   * would assert a distinction the question never made (ADR-052 in vocabulary form).
   */
  it('a kite resolves both of them, to the two different diagonals', () => {
    expect(ids(['דלתון ABCD', 'משוואת האלכסון הראשי היא y=2x'])).toContain('line-AC');
    expect(ids(['דלתון ABCD', 'משוואת האלכסון המשני היא y=-x'])).toContain('line-BD');
  });

  it('and the principal one is the AXIS OF SYMMETRY, verified from the placed points', () => {
    // Not from the vertex order: `AC` is principal because |AB|=|AD| and |CB|=|CD| make it the axis,
    // which is what the registry row says and what the figure must show.
    const d = derive(['דלתון ABCD'], 0);
    const p = Object.fromEntries(d.figure.points.map((q) => [q.id, q]));
    const len = (a: string, b: string) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
    expect(len('A', 'B')).toBeCloseTo(len('A', 'D'), 5);
    expect(len('C', 'B')).toBeCloseTo(len('C', 'D'), 5);
  });

  it('refuses BY NAME where the noun distinguishes nothing', () => {
    expect(codes(['מרובע ABCD', 'משוואת האלכסון הראשי היא y=2x'])).toEqual([
      'undistinguished-diagonal',
    ]);
    expect(codes(['מקבילית ABCD', 'משוואת האלכסון הראשי היא y=2x'])).toEqual([
      'undistinguished-diagonal',
    ]);
    // A rhombus has unequal diagonals, but its NOUN does not say which is which — so it refuses too.
    expect(codes(['מעוין ABCD', 'משוואת האלכסון הראשי היא y=2x'])).toEqual([
      'undistinguished-diagonal',
    ]);
  });

  it('keeps working when the kite was named in a second sentence', () => {
    // «מרובע ABCD» then «דלתון ABCD» is one ring that learned what it is (#1049) — and that is what
    // makes the principal diagonal resolvable here.
    expect(ids(['מרובע ABCD', 'דלתון ABCD', 'משוואת האלכסון הראשי היא y=2x'])).toContain('line-AC');
  });
});

describe('#1070 — the arity check reads the registry, not a fifth list of nouns', () => {
  it('checks a noun the old list had never heard of', () => {
    // The hand-written list knew only משולש and מרובע, so a kite`s vertex count was unchecked.
    expect(codes(['G מפגש האלכסונים בדלתון ABC'])).toEqual(['bad-arity']);
    expect(codes(['M מפגש התיכונים בדלתון ABCD'])).toEqual(['bad-arity']);
  });

  it('and still accepts the two it did know', () => {
    // The shape is stated first: a concurrency point REFERS to its vertices, and a reference may
    // not invent them (ADR-AG-013) — which is why the bad-arity cases above need no figure and
    // these do.
    expect(codes(['מרובע ABCD', 'G מפגש האלכסונים במרובע ABCD'])).toEqual([]);
    expect(codes(['משולש ABC', 'M מפגש התיכונים במשולש ABC'])).toEqual([]);
  });
});
