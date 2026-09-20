/**
 * #1184 — A VECTOR MAY START A FIGURE, AND «וקטור AB» IS A VECTOR.
 *
 * **Operator, 2026-09-18:** *"on 3d tool, i cannot create a simple vector AB. on first classes of the
 * subject this is required."*
 *
 * Measured on an empty canvas before this — which is what the first lesson of the vectors unit actually
 * is — **no vector lane built at all**: «וקטור AB», «חץ AB», `arrow AB`, «נסמן: AB = u» every one
 * `unknown-point: A`. And once the points DID exist, «וקטור AB» drew a plain SEGMENT: no arrowhead, no
 * direction, never in the basis. The student said "vector"; the tool drew a segment and said nothing.
 *
 * ## Why this file BUILDS and does not stop at the parse
 *
 * `parse3-v4.test.ts` has a passing test for «נתון: v = (10,-5,0)» and its own ADR — and that sentence
 * has never built. The lock guarded the half that worked. Every row here therefore drives the store's
 * real submit path and asserts what came out of `derive3`, not what the parser emitted.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

const st = () => useGeo3.getState();
beforeEach(() => {
  st().clear();
});

/** Submit each line through the real path and read the CONSTRUCTION back. */
const build = (lines: readonly string[]) => {
  for (const l of lines) st().submit(l);
  const c = derive3(st().facts, st().seed).construction;
  return {
    err: st().lastError as { code?: string; id?: string } | null,
    facts: st().facts.length,
    arrows: c.arrows.map((a) => a.join('')),
    segments: c.segments.map((s) => s.join('')),
    vectors: [...c.vectors.keys()],
    points: [...c.points.keys()].sort(),
  };
};

describe('#1184 — a vector on an EMPTY canvas', () => {
  it.each(['וקטור AB', 'חץ AB', 'arrow AB'])('«%s» builds, and draws an ARROW', (line) => {
    const r = build([line]);
    expect(r.err, `«${line}» was refused`).toBeNull();
    expect(r.arrows).toEqual(['AB']);
    expect(r.points).toEqual(['A', 'B']);
  });

  /**
   * THE FIRST LESSON, end to end: draw the vector, then name it. The naming lane is unchanged — it needs
   * existing points, and that is exactly what the line before it now provides.
   */
  it('«וקטור AB» then «נסמן: AB = u» puts u in the basis', () => {
    const r = build(['וקטור AB', 'נסמן: AB = u']);
    expect(r.err).toBeNull();
    expect(r.arrows).toEqual(['AB']);
    expect(r.vectors).toEqual(['u']);
    expect(r.facts).toBe(2);
  });

  /**
   * The endpoints are FREE, not placed at some default (ADR-052). Asserted as the figure MOVING between
   * configurations rather than as a coordinate, which would be asserting the very default that is
   * forbidden.
   */
  it('the minted endpoints are free — the arrow moves on «הציגו תצורה אחרת»', () => {
    st().submit('וקטור AB');
    const at = (seed: number) => {
      const p = derive3(st().facts, seed).positions;
      const A = p.get('A')!;
      const B = p.get('B')!;
      return `${(B.x - A.x).toFixed(4)},${(B.y - A.y).toFixed(4)},${(B.z - A.z).toFixed(4)}`;
    };
    const seen = new Set([0, 1, 2, 3, 4, 5].map(at));
    expect(seen.size, 'the vector is the same at every configuration — it was not free').toBeGreaterThan(1);
  });
});

/**
 * THE TYPO GUARD, which is the thing this change must not cost.
 *
 * The both-fresh refusal exists so «קטע QZ» — a mistyped pair with two unknown ends — names the label
 * the student got wrong instead of silently inventing two points. It is preserved exactly where it was
 * designed to work: an empty canvas has nothing to have mistyped against, but the moment ANY figure
 * exists the guard is as it was.
 */
describe('#1184 — the typo guard is untouched once a figure exists', () => {
  it('«קטע QZ» after a point is still refused, naming Q', () => {
    const r = build(['נקודה P(0,0,0)', 'קטע QZ']);
    expect(r.err).toMatchObject({ code: 'unknown-point', id: 'Q' });
  });

  it('«חץ QZ» after a point is refused too — the relaxation is the EMPTY canvas, not the arrow', () => {
    const r = build(['נקודה P(0,0,0)', 'חץ QZ']);
    expect(r.err).toMatchObject({ code: 'unknown-point', id: 'Q' });
  });

  /**
   * And the bare-segment lane keeps its own refusal on an empty canvas, deliberately. Widening it too was
   * built and measured: it moves #601 («קטע AB» then «דלתון ABCD» stops being a declaration and takes the
   * completion arm with two unknowns) and #978 («אלכסון AB» before any solid stops being refused although
   * no solid exists for it to be a diagonal of). Those lanes feed rules that ask *which points already
   * exist*; an arrow feeds none. Asserted so the scope is a decision on the record, not an omission.
   */
  it('«קטע AB» on an empty canvas is still refused — the widening is the ARROW lane only', () => {
    const r = build(['קטע AB']);
    expect(r.err).toMatchObject({ code: 'unknown-point' });
  });
});

/**
 * ARM 3 — the vector WORD is a real arrow, on a solid as well as on an empty canvas.
 *
 * This changes shipped behaviour: «הוקטור A'C» on a cube drew a segment before. The operator was asked
 * directly, shown that cost, and chose the arrow (2026-09-18).
 */
describe('#1184 — the vector word draws an arrow, everywhere', () => {
  const CUBE = "קובייה ABCDA'B'C'D'";

  it('«הוקטור A’C» on a cube is an arrow, not a segment', () => {
    const r = build([CUBE, "הוקטור A'C"]);
    expect(r.err).toBeNull();
    expect(r.arrows).toEqual(["A'C"]);
  });

  it('an explicit arrow marks the same thing the word does (#1183’s one marking)', () => {
    expect(build([CUBE, "A'C⃗"]).arrows).toEqual(["A'C"]);
  });

  /**
   * A DIAGONAL claim wins: «אלכסון AC» asserts a role in the solid, which is not a vector statement, so a
   * marked line that also claims a diagonal keeps the segment lane rather than dropping the claim.
   */
  it('a diagonal claim keeps the segment lane even when the line is vector-marked', () => {
    const r = build([CUBE, 'וקטור אלכסון AC']);
    expect(r.err).toBeNull();
    expect(r.arrows).toEqual([]);
    expect(r.segments).toContain('AC');
  });

  /** And an unmarked pair is still a plain segment — the word is what changes the reading. */
  it('«קטע AC» on the same cube is still a segment', () => {
    const r = build([CUBE, 'קטע AC']);
    expect(r.arrows).toEqual([]);
    expect(r.segments).toContain('AC');
  });
});
