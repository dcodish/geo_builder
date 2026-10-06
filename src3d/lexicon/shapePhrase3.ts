/**
 * THE SHAPE-PHRASE VOCABULARY — a polygon NOUN and the shape-PROPERTY adjectives stated on it
 * (#1792, ADR-3D-307; the 3-D port of 2-D's ADR-595 reader).
 *
 * A shape phrase is «טרפז ישר זווית», «משולש שווה שוקיים», "isosceles trapezoid", "right triangle". Before
 * this module 3-D read the NOUN through one vocabulary (`statedQuadBase`, #305/#587) and the ADJECTIVE
 * through a triangle-only one (`statedTriShape`, #424/#435). A quad's adjective was read nowhere except
 * the pyramid base's isosceles trapezoid, so «טרפז ישר זווית ABCD» and every inscription of a quad with an
 * adjective was a dropped given — the reader below is where the noun and its adjective meet.
 *
 * The rule, for every caller at once:
 *  - **the NOUN decides the arity**; an adjective only refines it;
 *  - an adjective is CONSUMED only where this (noun, adjective) pair has a lowering in `parse3`
 *    (triangle × {right, isosceles, equilateral}; trapezoid × {right, isosceles}). Anything else is
 *    UNCONSUMED, and a caller must decline (escalate) rather than drop it;
 *  - `cyclic` names the noun a circle through every vertex would FORCE when the phrase cannot be
 *    inscribed as itself: a right trapezoid in a circle is a rectangle, and a rectangle is not a
 *    trapezoid (the operator's 2026-10-01 ruling on #1554).
 *
 * **It imports NOTHING** — the `lexicon` layer's property (see `nouns3.ts`). It knows how the words are
 * SPELLED and which pairs exist; what a right trapezoid MEANS (its constraints) stays in `parse3.ts`.
 *
 * Third copy, recorded (docs/17 §2 tripwire 8): 2-D has `src/parser/shapePhrase.ts` and analytic its
 * `SHAPES` registry. `BOUNDARIES.json` leaves "whether the lexicon layer is shared across products"
 * undecided, so this lives in the product's own `lexicon/` and the ADR names the open question.
 */

/** The quad nouns, in the precedence the one quad vocabulary has always used (specific → generic). */
export type QuadNoun3 = 'square' | 'rectangle' | 'rhombus' | 'parallelogram' | 'kite' | 'trapezoid' | 'quad';
/** Every polygon noun a phrase can name. */
export type ShapeNoun3 = QuadNoun3 | 'triangle' | 'pentagon';
/** The shape-property adjectives. */
export type ShapeAdj3 = 'right' | 'isosceles' | 'equilateral';

/** Each quad noun's words — the regexes `statedQuadBase` used, unchanged (byte-identical reading). */
const QUAD_NOUN_RE: ReadonlyArray<readonly [QuadNoun3, RegExp, RegExp]> = [
  ['square', /ריבוע/, /\bsquare\b/i],
  ['rectangle', /מלבן/, /\brectang/i],
  ['rhombus', /מעויי?ן/, /\brhombus\b/i],
  ['parallelogram', /מקבילית/, /\bparallelogram\b/i],
  ['kite', /דלתון/, /\bkite\b/i],
  ['trapezoid', /טרפז/, /\btrapez/i],
  ['quad', /מרובע/, /\bquadrilateral\b/i],
];
const TRIANGLE_RE = /משולש|\btriangle\b/i;
const PENTAGON_RE = /מחומש|\bpentagon\b/i;

/** The quad noun a sentence states, or null — THE one quad vocabulary (#305/#587). */
export function quadNoun3(s: string): QuadNoun3 | null {
  for (const [noun, he, en] of QUAD_NOUN_RE) if (he.test(s) || en.test(s)) return noun;
  return null;
}

/** The English polygon nouns an adjective may stand before (used to bind the English «right»). */
const EN_POLY = String.raw`triangles?|trapez\w*|quadrilaterals?|quads?|squares?|rectangles?|rhombus(?:es)?|parallelograms?|kites?|pentagons?|polygons?`;

/**
 * Each adjective's words, He/En. «ישר זווית» in every spelling the tree admits (`זו?וית`, a hyphen or
 * none). English "right" counts as a SHAPE adjective only when it modifies a polygon noun — "right
 * prism" / "right pyramid" are a solid's own rightness, never the base's (#435).
 */
export const SHAPE_ADJ_WORDS3: Readonly<Record<ShapeAdj3, string>> = {
  right: String.raw`ישר\s*[-\s]?\s*זו?וית|\bright[-\s]?angled\b|\bright\b(?=[-\s]+(?:${EN_POLY})\b)`,
  isosceles: String.raw`שווה[\s-]?שוקיים|\bisosceles\b`,
  equilateral: String.raw`שווה[\s-]?צלעות|כל\s+מקצועותיה\s+שוו|\bequilateral\b`,
};
/** Any English shape adjective, for a container marker that must allow one before its noun ("in right triangle"). */
export const SHAPE_ADJ_EN_ANY3 = String.raw`right(?:[-\s]?angled)?|isosceles|equilateral`;

const ADJ_ORDER: readonly ShapeAdj3[] = ['right', 'equilateral', 'isosceles'];

/** Which adjectives each noun can LOWER. A trapezoid takes ONE (a right isosceles trapezoid is a rectangle). */
const REFINES: Partial<Record<ShapeNoun3, { readonly adjs: readonly ShapeAdj3[]; readonly max: number }>> = {
  triangle: { adjs: ['right', 'equilateral', 'isosceles'], max: 3 },
  trapezoid: { adjs: ['right', 'isosceles'], max: 1 },
};

/** A phrase no circle can pass around without turning it into another noun (analytic's `notCyclic`). */
const NOT_CYCLIC: Readonly<Record<string, { readonly shape: string; readonly forced: string }>> = {
  'trapezoid:right': { shape: 'rightTrapezoid', forced: 'rectangle' },
};

export interface ShapePhrase3 {
  /** the noun the phrase states (null: only adjectives — a bare «ישר זווית» reads as a triangle) */
  readonly noun: ShapeNoun3 | null;
  /** vertex count, decided by the NOUN (a bare adjective is a triangle's) */
  readonly arity: 3 | 4 | 5;
  /** every adjective the sentence states */
  readonly stated: readonly ShapeAdj3[];
  /** the adjectives this noun lowers */
  readonly consumed: readonly ShapeAdj3[];
  /** the adjectives it can NOT lower on this noun — the caller declines, never drops them */
  readonly unconsumed: readonly ShapeAdj3[];
  /** 'yes', or the shape a circle through every vertex would force (the sentence then contradicts itself) */
  readonly cyclic: 'yes' | { readonly shape: string; readonly forced: string };
}

/**
 * Read the shape phrase of `s` (ONE polygon phrase per sentence — the inscription and declaration rules).
 * Null when `s` names no polygon noun and no adjective.
 */
export function readShapePhrase3(s: string): ShapePhrase3 | null {
  // quad nouns first — the one-vocabulary precedence (`statedTriShape` defers to a stated quad noun)
  const noun: ShapeNoun3 | null = quadNoun3(s) ?? (TRIANGLE_RE.test(s) ? 'triangle' : PENTAGON_RE.test(s) ? 'pentagon' : null);
  const stated = ADJ_ORDER.filter((a) => new RegExp(SHAPE_ADJ_WORDS3[a], 'i').test(s));
  if (!noun && !stated.length) return null;
  const base: ShapeNoun3 = noun ?? 'triangle';
  const refines = REFINES[base];
  const consumed = refines ? stated.filter((a) => refines.adjs.includes(a)).slice(0, refines.max) : [];
  const unconsumed = stated.filter((a) => !consumed.includes(a));
  const arity: 3 | 4 | 5 = base === 'triangle' ? 3 : base === 'pentagon' ? 5 : 4;
  const forces = consumed.map((a) => NOT_CYCLIC[`${base}:${a}`]).find((x) => x !== undefined);
  return { noun, arity, stated, consumed, unconsumed, cyclic: forces ?? 'yes' };
}
