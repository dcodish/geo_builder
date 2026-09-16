/**
 * CLICKABLE CROSSINGS (#1025), and the label that stopped hiding a coordinate (#1086).
 *
 * Operator, 2026-09-15: *"when a line we draw crosses another line, we need to see the dashed circle
 * allowing us to create that point"*.
 *
 * The design these assert is that a dot offers a SENTENCE: clicking it adds «P נקודת החיתוך של הישר
 * AB עם הישר CD», which is exactly what typing that produces (ADR-AG-048). Two surfaces, one grammar
 * — so a crossing whose objects have no NAME the grammar can use gets no dot at all.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { crossingSentence, crossingsOf, freeLetter } from '../engine/crossings';
import { knownCurve } from '../engine/evaluate';
import { buildScene } from '../render/scene';

const at = (lines: string[]) => {
  const d = derive(lines, 0);
  return { d, crossings: crossingsOf(d.figure, d.construction) };
};

describe('#1025 — a crossing is offered where the student could NAME it', () => {
  it('two segments that cross', () => {
    const { d, crossings } = at(['A(0,0)', 'B(4,4)', 'C(0,4)', 'D(4,0)', 'AB', 'CD']);
    expect(crossings).toHaveLength(1);
    expect([crossings[0].x, crossings[0].y].map((n) => Number(n.toFixed(4)))).toEqual([2, 2]);
    expect(crossingSentence(crossings[0], freeLetter(d.construction))).toBe(
      'P נקודת החיתוך של הישר AB עם הישר CD',
    );
  });

  it('and the sentence it offers really BUILDS that point', () => {
    // The whole design in one assertion: the dot's words are a line the tool already understands.
    const lines = ['A(0,0)', 'B(4,4)', 'C(0,4)', 'D(4,0)', 'AB', 'CD'];
    const { d, crossings } = at(lines);
    const sentence = crossingSentence(crossings[0], freeLetter(d.construction));
    const after = derive([...lines, sentence], 0);
    expect(after.faults).toEqual([]);
    const p = after.figure.points.find((q) => q.id === 'P')!;
    expect([p.x, p.y].map((n) => Number(n.toFixed(4)))).toEqual([2, 2]);
  });

  it('a triangle side and a stated line — and only the side actually crossed', () => {
    const { crossings } = at(['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC', 'נתון הישר l1: y=x']);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].second).toBe('הישר l1');
  });

  it('OVERTURNED by the operator (#1096): an anonymous conic DOES offer its rings', () => {
    /**
     * This assertion used to expect zero, on ADR-AG-054's reasoning that a conic has no name a
     * sentence can use. Operator ruling, 2026-09-16 on T49: *"i dont agree. I think we need to offer
     * the rings in this case too"*.
     *
     * Rewritten rather than deleted, so the record shows the rule CHANGED and why — the boundary was
     * drawn around namelessness when the thing that actually blocks a sentence is ambiguity
     * (ADR-AG-056), and an equation is not ambiguous.
     */
    expect(at(['x^2/9+y^2/4=1', 'נתון הישר l1: y=x']).crossings).toHaveLength(2);
  });

  it('and nothing where a point already stands', () => {
    // Two sides of a triangle meet at a vertex, which is already a point: offering to create it
    // would be the tool suggesting the student repeat themselves.
    const { crossings } = at(['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC']);
    expect(crossings).toHaveLength(0);
  });

  it('reaches the scene, projected, with its sentence intact', () => {
    const lines = ['A(0,0)', 'B(4,4)', 'C(0,4)', 'D(4,0)', 'AB', 'CD'];
    const d = derive(lines, 0);
    const scene = buildScene(d.figure, d.box, 600, 600, {
      crossings: crossingsOf(d.figure, d.construction).map((k) => ({
        id: k.id,
        x: k.x,
        y: k.y,
        sentence: crossingSentence(k, freeLetter(d.construction)),
      })),
    });
    expect(scene.crossings).toHaveLength(1);
    expect(scene.crossings[0].sentence).toContain('נקודת החיתוך');
  });
});

describe('#1086 — the centre mark does not label what a POINT already labels', () => {
  const centreLabel = (lines: string[]) => {
    const d = derive(lines, 0);
    const scene = buildScene(d.figure, d.box, 600, 600, {
      curveKnown: (id) => knownCurve(d.construction, id) !== null,
    });
    return scene.curves[0]?.centre?.label ?? null;
  };

  it('«מעגל O» — the point owns the label, so the mark prints none', () => {
    // Operator: *"the label O hides the x value"*. Both were drawn at one place, overlapping into
    // «O, 5)».
    expect(centreLabel(['נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25'])).toBeNull();
    const d = derive(['נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25'], 0);
    expect(d.figure.points.map((p) => p.id)).toEqual(['O']);
  });

  it('a circle with no named centre still labels its mark', () => {
    expect(centreLabel(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'])).toBe('(3, 4)');
    expect(centreLabel(['(x-3)^2+(y-4)^2=9'])).toBe('(3, 4)');
  });
});

/**
 * #1092 — A LINE GIVEN BY ITS EQUATION NAMES ITSELF.
 *
 * Operator, 2026-09-15 (T34): *"attached image where a line crosses BC and there is no clickable"*.
 * A bare «נתון הישר y=9» drawn across a triangle offered no ring where it visibly crossed two sides,
 * while the same line written «נתון הישר l1: y=9» offered two.
 *
 * ADR-AG-054's limit was right — a ring only where the GRAMMAR can name both objects — and this case
 * was on the wrong side of it. #1057's open question is that the NOUN «הפרבולה» is ambiguous between
 * two anonymous conics; an EQUATION is not ambiguous, it identifies exactly one curve.
 *
 * The resolver was already written and already correct (the on-curve rule mints
 * `curve-${anonIndex(...)}` for this very operand) — `incidenceOn`, which the crossing rule uses,
 * simply never reached it. The tree's most repeated defect: a mechanism with a caller that misses it.
 */
describe('#1092 — an equation is a name the grammar can use', () => {
  const T = ['A(0,0)', 'B(4,12)', 'C(10,2)', 'משולש ABC'];

  /** Every spelling of "this line, by its equation" the grammar accepts. */
  const SPELLINGS = [
    'נתון הישר y=9',
    'y=9',
    'נתון הישר y = 9', // spaced — `anonIndex` strips whitespace before hashing
    'the line y=9',
  ];

  for (const spelling of SPELLINGS) {
    it(`offers both rings for ${JSON.stringify(spelling)}`, () => {
      const { crossings } = at([...T, spelling]);
      expect(crossings).toHaveLength(2);
      // Both rings name the SAME line, by the equation the student actually typed.
      const expected = `הישר ${spelling.replace(/^(?:נתון הישר |the line )/, '')}`;
      expect(crossings.map((k) => k.second)).toEqual([expected, expected]);
      // ...and the other side is the triangle's own sides, not the line again.
      expect(crossings.map((k) => k.first).sort()).toEqual(['הישר AB', 'הישר BC']);
    });

    it(`and its sentence ROUND-TRIPS without minting a second curve — ${JSON.stringify(spelling)}`, () => {
      // The assertion that makes "two surfaces, one grammar" true rather than merely asserted: the
      // words the dot offers re-parse to the SAME content-derived id (ADR-AG-023), so the figure
      // gains a point and NOT a duplicate line.
      const lines = [...T, spelling];
      const { d, crossings } = at(lines);
      const sentence = crossingSentence(crossings[0], freeLetter(d.construction));
      const after = derive([...lines, sentence], 0);
      expect(after.faults).toEqual([]);
      expect(after.figure.curves).toHaveLength(d.figure.curves.length);
      const p = after.figure.points.find((q) => q.id === 'P')!;
      expect([p.x, p.y].map((n) => Number(n.toFixed(4)))).toEqual([3, 9]);
    });
  }

  it('a NAMED line still names itself by its name, not its equation', () => {
    const { crossings } = at([...T, 'נתון הישר l1: y=9']);
    expect(crossings.map((k) => k.second)).toEqual(['הישר l1', 'הישר l1']);
  });

  it('and the conic limit #1092 left in place was lifted by the operator (#1096)', () => {
    // #1092 deliberately stopped at lines, leaving the conic noun to ADR-AG-049's open question.
    // The operator settled it: «האליפסה x^2/9+y^2/4=1» is the noun, and it is unambiguous.
    const { crossings } = at(['x^2/9+y^2/4=1', 'נתון הישר l1: y=x']);
    expect(crossings).toHaveLength(2);
    expect(crossings[0].second).toBe('האליפסה x^2/9+y^2/4=1');
  });

  it('and prose containing an «=» is still refused, not minted into a curve (#1068)', () => {
    const d = derive([...T, 'נתון הישר y=9', 'P נקודת החיתוך של הישר AB עם עם הערך x'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['bad-operand']);
  });
});
