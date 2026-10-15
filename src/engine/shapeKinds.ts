/**
 * Which declared shape PHRASES no circle can pass around ([ADR-595](../../docs/06-decisions.md#adr-595),
 * [ADR-607](../../docs/06-decisions.md#adr-607)) — the ONE table, analytic's `SHAPES[…].notCyclic` (ADR-AG-198).
 *
 * A right trapezoid inscribed in a circle can only be a rectangle (a cyclic trapezoid is isosceles, and an
 * isosceles trapezoid with a right angle has four), and a rectangle is not a trapezoid — the 2026-10-01 ruling on
 * #1554. The parser's shape-phrase reader (`parser/shapePhrase.ts`) reads it to refuse the one-line sentence
 * («טרפז ישר זווית ABCD חסום במעגל»); the engine reads it to refuse the same pair stated in two lines, in either
 * order (`cyclicFeasibility.ts`, the 2026-10-08 ruling on #1918). It lives in the engine because the engine may
 * not import the parser, and both must answer from one table.
 */
export const NOT_CYCLIC: Readonly<Record<string, string>> = { 'right-trapezoid': 'rectangle' };

/**
 * THE QUADRILATERAL HIERARCHY — which shape nouns a declared noun already IMPLIES
 * ([ADR-619](../../docs/06-decisions.md#adr-619)), 2-D's twin of 3-D's `QUAD_IMPLIES` (ADR-3D-158) and of
 * analytic's `SHAPES`-derived `nounsExclude` (ADR-AG-260).
 *
 * `QUAD_IMPLIES[x]` is every noun a genuine `x` also answers to. A square IS a rectangle, a rhombus, a
 * parallelogram and a kite; a rectangle IS a parallelogram; and everything is a quadrilateral. The TRAPEZOID
 * rows follow the Israeli-curriculum EXCLUSIVE reading — exactly one pair of parallel sides, the reading
 * `shapeConstraints` and ADR-157 already assume — so a parallelogram is deliberately NOT a trapezoid here,
 * and an isosceles or right trapezoid IS a trapezoid.
 *
 * Keyed by the kinds 2-D stamps on a polygon's `declaredAs` plus the two refined trapezoid phrases a
 * `trapezoid` command carries in `kind` — so one table answers both "what is this ring already known to be"
 * and "what does this line say it is".
 */
export type QuadKind =
  | 'square' | 'rectangle' | 'rhombus' | 'parallelogram' | 'kite'
  | 'trapezoid' | 'isosceles-trapezoid' | 'right-trapezoid'
  | 'quadrilateral';

export const QUAD_IMPLIES: Readonly<Record<QuadKind, readonly QuadKind[]>> = {
  square: ['square', 'rectangle', 'rhombus', 'parallelogram', 'kite', 'quadrilateral'],
  rectangle: ['rectangle', 'parallelogram', 'quadrilateral'],
  rhombus: ['rhombus', 'parallelogram', 'kite', 'quadrilateral'],
  parallelogram: ['parallelogram', 'quadrilateral'],
  kite: ['kite', 'quadrilateral'],
  'isosceles-trapezoid': ['isosceles-trapezoid', 'trapezoid', 'quadrilateral'],
  'right-trapezoid': ['right-trapezoid', 'trapezoid', 'quadrilateral'],
  trapezoid: ['trapezoid', 'quadrilateral'],
  quadrilateral: ['quadrilateral'],
};

/** Is a genuine `have` also a `want`? (`quadrilateral` is implied by everything; every kind implies itself.) */
export const quadImplies = (have: QuadKind, want: QuadKind): boolean => QUAD_IMPLIES[have].includes(want);

/**
 * Does a genuine `have` stay a `want` when the ring is read FROM ANY VERTEX IN EITHER DIRECTION (#1988)?
 *
 * The implication above is about shape CLASSES; a restatement is about a sentence, and two nouns name a
 * specific pair of SIDES rather than the whole ring:
 *  - a **trapezoid** names one pair of opposite sides as the parallel one («טרפז BCDA» says BC ∥ DA, not
 *    AB ∥ CD — ADR-506), so it never survives an arbitrary reading;
 *  - a **kite** names one diagonal as its axis — but the only kinds that imply `kite` without BEING one are
 *    the rhombus and the square (read off the table below, and asserted by the #1988 guard test), and those
 *    have four equal sides, so they are kites about either diagonal and every reading holds.
 * Every other noun is symmetric under the quadrilateral's whole dihedral group (`RING_SYMMETRIC`, apply.ts).
 */
export const quadImpliesInEveryReading = (have: QuadKind, want: QuadKind): boolean =>
  quadImplies(have, want) && !QUAD_IMPLIES[want].includes('trapezoid') && (want !== 'kite' || QUAD_IMPLIES[have].includes('rhombus'));

/**
 * TWO NOUNS NO QUADRILATERAL CAN CARRY AT ONCE (#1985, [ADR-619](../../docs/06-decisions.md#adr-619)) —
 * derived from the table above, never a list of pairs: there is no kind that implies both. Under the
 * exclusive trapezoid reading the trapezoid family meets no member of the parallelogram family and no kite
 * (a kite with a parallel pair is a rhombus). Symmetric.
 *
 * NOT the same question as "neither implies the other": a rectangle and a rhombus exclude nothing — the
 * square implies both — so «מלבן ABCD» · «מעוין ABCD» is not this refusal (it stays ADR-157's, until a
 * ruling says otherwise). 3-D's `quadsDisjoint` and analytic's `nounsExclude` are the same predicate.
 */
export const quadsExclude = (x: QuadKind, y: QuadKind): boolean =>
  !(Object.keys(QUAD_IMPLIES) as QuadKind[]).some((k) => quadImplies(k, x) && quadImplies(k, y));

/**
 * #1993 / #1914 ([ADR-656](../../docs/06-decisions.md#adr-656)) — THE MOST GENERAL KIND THAT IS BOTH, derived from
 * the table: «מלבן» and «מעוין» meet in «ריבוע», «מקבילית» and «דלתון» in «מעוין». Null when no quadrilateral
 * carries both (`quadsExclude`) or the answer is not unique.
 */
export function quadMeet(x: QuadKind, y: QuadKind): QuadKind | null {
  const both = (Object.keys(QUAD_IMPLIES) as QuadKind[]).filter((k) => quadImplies(k, x) && quadImplies(k, y));
  const top = both.filter((k) => both.every((o) => quadImplies(o, k)));
  return top.length === 1 ? top[0] : null;
}

/**
 * #1993 / #1914 ([ADR-656](../../docs/06-decisions.md#adr-656)) — WHAT A SECOND NOUN DOES TO A RING ALREADY DECLARED,
 * three-valued over the one table (ADR-619 read it two-valued, so a pair that is neither fell to the engine's
 * «כבר מוגדרת»):
 * - `implies` — the declared noun already says it (a square is a rectangle): a restatement, «כבר קיים»;
 * - `narrows` — the stated noun is a special kind of the declared one («מקבילית» → «מלבן», «מרובע» → anything):
 *   the ring takes it (the operator's 2026-10-08 ruling on #1914, *"Yes, any narrowing refines"*);
 * - `siblings` — neither implies the other but one kind is both (rectangle and rhombus — a square): the ring
 *   becomes that kind (the 2026-10-11 ruling on #1993);
 * - `excludes` — no quadrilateral is both (the trapezoid family against the parallelogram family or the kite):
 *   ADR-619's refusal.
 */
export type QuadRelation = 'implies' | 'narrows' | 'siblings' | 'excludes';
export function quadRelation(declared: QuadKind, stated: QuadKind): QuadRelation {
  if (quadImplies(declared, stated)) return 'implies';
  if (quadImplies(stated, declared)) return 'narrows';
  return quadMeet(declared, stated) ? 'siblings' : 'excludes';
}

/** The kind a ring declared `declared` becomes when `stated` is said of it too (null when they exclude). */
export const quadAfter = (declared: QuadKind, stated: QuadKind): QuadKind | null => quadMeet(declared, stated);
