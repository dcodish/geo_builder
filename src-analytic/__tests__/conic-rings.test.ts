/**
 * A CONIC'S CROSSINGS ARE OFFERED TOO (#1096).
 *
 * Operator ruling, 2026-09-16, on T49: *"i dont agree. I think we need to offer the rings in this
 * case too"* — overriding the limit [ADR-AG-054](../../docs/06c-decisions-analytic.md#adr-ag-054)
 * drew and closing what [ADR-AG-049](../../docs/06c-decisions-analytic.md#adr-ag-049) left open.
 *
 * ADR-AG-056 had already found the right boundary for lines: what blocks a sentence is AMBIGUITY,
 * not namelessness. The noun «הפרבולה» is ambiguous between two anonymous parabolas; «הפרבולה
 * y^2=54x» is not. So the ruling extends a principle rather than contradicting one.
 *
 * Two halves are asserted here, and the second is the one that makes the rings honest:
 *   1. the crossings are FOUND — straight × conic, in closed form;
 *   2. the ring you click is the point you get.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { crossingSentence, crossingsOf, freeLetter } from '../engine/crossings';
import { seedShowing } from '../app/another';

const at = (lines: string[]) => {
  const d = derive(lines, 0);
  return { d, crossings: crossingsOf(d.figure, d.construction) };
};

const round = (n: number) => Number(n.toFixed(3));

describe('#1096 — a line crossing a conic offers its rings', () => {
  it('an ELLIPSE — the operator’s own T49 figure', () => {
    const { crossings } = at(['x^2/9+y^2/4=1', 'נתון הישר l1: y=x']);
    expect(crossings).toHaveLength(2);
    expect(crossings.map((k) => [round(k.x), round(k.y)]).sort((a, b) => a[0] - b[0])).toEqual([
      [-1.664, -1.664],
      [1.664, 1.664],
    ]);
    expect(crossings[0].second).toBe('האליפסה x^2/9+y^2/4=1');
  });

  it('a PARABOLA — a horizontal line meets it exactly once, and one ring is offered', () => {
    const { crossings } = at(['y^2=54x', 'נתון הישר l1: y=9']);
    expect(crossings).toHaveLength(1);
    expect([round(crossings[0].x), round(crossings[0].y)]).toEqual([1.5, 9]);
    expect(crossings[0].second).toBe('הפרבולה y^2=54x');
  });

  it('a NAMED circle names itself by its name', () => {
    const { crossings } = at(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', 'נתון הישר l1: y=4']);
    expect(crossings).toHaveLength(2);
    // Not «המעגל מעגל I»: the stored label already carries the noun, and doubling it produced a
    // phrase the grammar refuses — a latent bug that could not surface while circles were excluded
    // from the crossing search, and did the moment they were let in.
    expect(crossings[0].second).toBe('המעגל I');
  });

  it('an ANONYMOUS circle names itself by its equation', () => {
    const { crossings } = at(['(x-3)^2+(y-4)^2=9', 'נתון הישר l1: y=4']);
    expect(crossings).toHaveLength(2);
    expect(crossings[0].second).toBe('המעגל (x-3)^2+(y-4)^2=9');
  });

  it('a line that MISSES offers nothing', () => {
    expect(at(['x^2/9+y^2/4=1', 'נתון הישר l1: y=99']).crossings).toHaveLength(0);
  });

  it('and a TANGENT offers nothing either — deliberately', () => {
    /**
     * A tangency is a real meeting point, but measured, the sentence a ring would offer there does
     * NOT build: the two incidences are degenerate at a touch and the solve returns `unsatisfiable`
     * even while landing on the right point. A ring whose click fails is worse than no ring — the
     * ADR-AG-054 principle, which outranks the ruling to offer more rings (that ruling was about
     * anonymous conics, not about tangency). Filed separately rather than papered over.
     */
    expect(at(['x^2/9+y^2/4=1', 'נתון הישר l1: y=2']).crossings).toHaveLength(0);
  });
});

describe('#1096 — every offered sentence round-trips', () => {
  const CASES = [
    ['x^2/9+y^2/4=1', 'נתון הישר l1: y=x'],
    ['y^2=54x', 'נתון הישר l1: y=9'],
    ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', 'נתון הישר l1: y=4'],
    ['(x-3)^2+(y-4)^2=9', 'נתון הישר l1: y=4'],
  ];

  for (const lines of CASES) {
    it(`builds, and mints no second curve — ${lines[0]}`, () => {
      const { d, crossings } = at(lines);
      const sentence = crossingSentence(crossings[0], freeLetter(d.construction));
      const after = derive([...lines, sentence], 0);
      expect(after.faults).toEqual([]);
      // The assertion that makes "two surfaces, one grammar" true rather than asserted.
      expect(after.figure.curves).toHaveLength(d.figure.curves.length);
      expect(after.figure.points.find((p) => p.id === 'P')).toBeDefined();
    });
  }
});

describe('#1096 — the ring you click is the point you get', () => {
  it('each of an ellipse’s two crossings resolves to ITS OWN point', () => {
    /**
     * Both rings carry the same words, because the sentence names both crossings and ADR-AG-047
     * lists both. Without this, clicking the right-hand ring could land the point on the left one —
     * which would break the contract the rings exist for.
     *
     * The seed chooses which solution is shown FIRST; it invents nothing, and «הציגו תצורה אחרת»
     * still reaches the other.
     */
    const lines = ['x^2/9+y^2/4=1', 'נתון הישר l1: y=x'];
    const { d, crossings } = at(lines);
    expect(crossings).toHaveLength(2);

    for (const ring of crossings) {
      const id = freeLetter(d.construction);
      const next = [...lines, crossingSentence(ring, id)];
      const seed = seedShowing(next, id, ring);
      const p = derive(next, seed).figure.points.find((q) => q.id === id)!;
      expect(Math.hypot(p.x - ring.x, p.y - ring.y)).toBeLessThan(1e-4);
    }
  });

  it('and the two clicks really do choose DIFFERENT configurations', () => {
    // Otherwise the test above would pass trivially by both rings happening to share a seed.
    const lines = ['x^2/9+y^2/4=1', 'נתון הישר l1: y=x'];
    const { d, crossings } = at(lines);
    const id = freeLetter(d.construction);
    const seeds = crossings.map((ring) => seedShowing([...lines, crossingSentence(ring, id)], id, ring));
    expect(new Set(seeds).size).toBe(2);
  });
});
