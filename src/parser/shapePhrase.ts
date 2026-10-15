/**
 * The ONE shape-phrase reader ([ADR-595](../../docs/06-decisions.md#adr-595), #1790).
 *
 * A shape phrase is a polygon NOUN plus the shape-PROPERTY adjectives stated on it — «טרפז ישר זווית»,
 * «משולש שווה שוקיים», "isosceles trapezoid", "right triangle". Before this module 2-D read that phrase in
 * four places: the standalone shape macros (correct), and three private ladders inside the inscription
 * rules (`inscribedPolygon`, `incircle`, `inscribedInPolygon`'s container/inner readers) that had drifted.
 * The inscribed ladder tested «ישר זווית» BEFORE the noun, so «טרפז ישר זווית חסום במעגל» drew a right
 * TRIANGLE; the incircle ladder read the noun only, so «מעגל חסום במשולש ישר זווית ABC» drew a generic one.
 *
 * The rule this reader enforces, for every caller at once:
 *  - **the NOUN decides the arity**; an adjective only MODIFIES the noun. «ישר זווית» is a right triangle
 *    only on «משולש» (or with no noun at all, as the standalone `rightTriangle` reads a bare «ישר זווית»);
 *  - an adjective is CONSUMED only when this (noun, adjective) pair has a lowering. Anything else stays in
 *    `unconsumed`, and the caller's `strip` leaves its words in the sentence — so the leftover gate sees
 *    them and the line escalates instead of committing a figure with the property silently dropped.
 *
 * `lower(ids)` is the STANDALONE lowering, the one the shape macros in parse.ts emit (they call it), so a
 * standalone line and an inscription read one sentence one way. `cyclic` is the analytic `SHAPES` row's
 * `notCyclic` (ADR-AG-198): a right trapezoid inscribed in a circle can only be a rectangle, and a
 * rectangle is not a trapezoid — the 2026-10-01 ruling on #1554 refuses that sentence naming both nouns.
 *
 * The template is 3-D's #424 "ONE vocabulary" (`statedTriShape`) and analytic's shape registry.
 */
import { NOT_CYCLIC, type AnyCommand, type Id } from '@/engine';

/** The polygon nouns, in detection precedence (the order every former private ladder used). */
export type ShapeNoun = 'triangle' | 'square' | 'rectangle' | 'rhombus' | 'kite' | 'trapezoid' | 'parallelogram' | 'quad';
/** The shape-property adjectives a phrase can carry. */
export type ShapeAdj = 'right' | 'isosceles' | 'equilateral';
/** The resolved shape: a noun, or a noun refined by the one adjective it consumed. */
export type ShapeKind =
  | ShapeNoun
  | 'right-triangle'
  | 'isosceles-triangle'
  | 'equilateral-triangle'
  | 'right-trapezoid'
  | 'isosceles-trapezoid';

/** Each noun's words, He/En — the single source; the polygon-noun alternations in parse.ts compose from these. */
export const SHAPE_NOUN_WORDS: Readonly<Record<ShapeNoun, string>> = {
  triangle: 'triangle|משולש',
  square: 'square|ריבוע',
  rectangle: 'rectangle|מלבן',
  rhombus: 'rhombus|מעוין',
  kite: 'kite|דלתון',
  trapezoid: String.raw`trapez\w*|טרפז`,
  parallelogram: 'parallelogram|מקבילית',
  quad: String.raw`quad\w*|מרובע`,
};
const NOUN_ORDER: readonly ShapeNoun[] = ['triangle', 'square', 'rectangle', 'rhombus', 'kite', 'trapezoid', 'parallelogram', 'quad'];

/** Each adjective's words, He/En. «ישר זווית» / «ישר-זווית» / «ישר זוית»; "right", "right-angled". */
export const SHAPE_ADJ_WORDS: Readonly<Record<ShapeAdj, string>> = {
  right: String.raw`ישר[\s-]?זוו?ית|\bright(?:[\s-]?angled?)?\b`,
  isosceles: String.raw`isosceles|שווה[\s-]?שוקיים`,
  equilateral: String.raw`equilateral|שווה[\s-]?צלעות`,
};
const ADJ_ORDER: readonly ShapeAdj[] = ['right', 'equilateral', 'isosceles'];
/** Any shape-property adjective — for a caller that must allow one between a noun and its labels. */
export const SHAPE_ADJ_ANY = Object.values(SHAPE_ADJ_WORDS).join('|');

const ARITY: Readonly<Record<ShapeKind, 3 | 4>> = {
  triangle: 3, 'right-triangle': 3, 'isosceles-triangle': 3, 'equilateral-triangle': 3,
  square: 4, rectangle: 4, rhombus: 4, kite: 4, trapezoid: 4, parallelogram: 4, quad: 4,
  'right-trapezoid': 4, 'isosceles-trapezoid': 4,
};

/** Which adjectives each noun can LOWER (precedence = list order; one adjective per phrase). */
const REFINES: Partial<Record<ShapeNoun, Partial<Record<ShapeAdj, ShapeKind>>>> = {
  triangle: { right: 'right-triangle', equilateral: 'equilateral-triangle', isosceles: 'isosceles-triangle' },
  trapezoid: { right: 'right-trapezoid', isosceles: 'isosceles-trapezoid' },
};

/** A noun no circle can pass around without turning it into another noun (analytic's `notCyclic`) — the engine's
 *  ONE table (#1918, ADR-607: the engine refuses the same pair stated in two lines, so both read it). */
const notCyclic = (kind: ShapeKind): ShapeKind | undefined => NOT_CYCLIC[kind] as ShapeKind | undefined;

/** The standalone lowering of each kind — the commands the shape macros emit (parse.ts calls these). */
export function lowerShape(kind: ShapeKind, v: readonly Id[]): AnyCommand[] {
  const t3 = [v[0], v[1], v[2]] as [Id, Id, Id];
  const q4 = [v[0], v[1], v[2], v[3]] as [Id, Id, Id, Id];
  switch (kind) {
    case 'triangle':
      return [{ type: 'triangle', ids: t3 }];
    case 'right-triangle':
      return [{ type: 'right-triangle', ids: t3 }];
    case 'isosceles-triangle':
      return [{ type: 'shape-variant', shape: 'isosceles', ids: t3, variant: 0 }];
    case 'equilateral-triangle':
      return [
        { type: 'triangle', ids: t3 },
        { type: 'set-equal', a: v[0], b: v[1], c: v[1], d: v[2] }, // |AB| = |BC|
        { type: 'set-equal', a: v[1], b: v[2], c: v[2], d: v[0] }, // |BC| = |CA|
      ];
    case 'square':
    case 'rectangle':
    case 'rhombus':
    case 'parallelogram':
    case 'trapezoid':
      return [{ type: kind, ids: q4 }];
    case 'quad':
      return [{ type: 'quadrilateral', ids: q4 }];
    case 'kite':
      return [{ type: 'shape-variant', shape: 'kite', ids: q4, variant: 0 }];
    case 'right-trapezoid':
      return [
        // `kind` records the declared phrase for the engine's not-cyclic prover (#1918, ADR-607): «ABCD חסום במעגל»
        // on a later line is refused like the one-line sentence. Stamped only where the table says it matters.
        { type: 'trapezoid', ids: q4, ...(notCyclic(kind) ? { kind } : {}) },
        { type: 'set-perpendicular', a: v[0], b: v[3], c: v[0], d: v[1] }, // AD ⟂ AB ⇒ right angles at A and D
      ];
    case 'isosceles-trapezoid':
      return [
        { type: 'trapezoid', ids: q4 },
        { type: 'set-equal', a: v[0], b: v[3], c: v[1], d: v[2], trapezoidLegs: true }, // |AD| = |BC| (the legs; AB ∥ DC assumed)
      ];
  }
}

export interface ShapePhrase {
  /** the noun the phrase states, or null when only an adjective names it (a bare «ישר זווית» → a triangle) */
  readonly noun: ShapeNoun | null;
  /** the resolved shape — the noun refined by the one adjective it consumed */
  readonly kind: ShapeKind;
  /** vertex count: decided by the NOUN */
  readonly arity: 3 | 4;
  /** every adjective the phrase states */
  readonly stated: readonly ShapeAdj[];
  /** the one adjective the phrase lowered (null for a bare noun) */
  readonly consumed: ShapeAdj | null;
  /** the adjectives it could NOT lower on this noun — the caller must escalate, never drop them */
  readonly unconsumed: readonly ShapeAdj[];
  /** removes exactly the words this phrase consumed (the noun's and the consumed adjective's) */
  strip(text: string): string;
  /** the standalone lowering of `kind` over these vertices */
  lower(ids: readonly Id[]): AnyCommand[];
  /** 'yes', or the noun a circle through every vertex would force (the phrase then contradicts «חסום במעגל») */
  readonly cyclic: 'yes' | { readonly forces: ShapeKind };
}

const re = (src: string, flags = 'i') => new RegExp(src, flags);

/**
 * Read the shape phrase of `s`. `s` should hold ONE phrase (a caller with two polygons — a polygon
 * inscribed in a polygon — splits the sentence first). Returns null when `s` names no polygon noun
 * and no adjective.
 */
export function readShapePhrase(s: string): ShapePhrase | null {
  const noun = NOUN_ORDER.find((n) => re(SHAPE_NOUN_WORDS[n]).test(s)) ?? null;
  const stated = ADJ_ORDER.filter((a) => re(SHAPE_ADJ_WORDS[a]).test(s));
  if (!noun && !stated.length) return null;
  // A bare adjective with no noun is a triangle — how the standalone macros read «ישר זווית ABC» / «שווה שוקיים ABC».
  const base: ShapeNoun = noun ?? 'triangle';
  const refines = REFINES[base] ?? {};
  const used = stated.find((a) => refines[a] !== undefined);
  const kind: ShapeKind = used ? refines[used]! : base;
  const unconsumed = stated.filter((a) => a !== used);
  const forces = notCyclic(kind);
  const strip = (text: string): string => {
    let out = text;
    if (noun) out = out.replace(re(SHAPE_NOUN_WORDS[noun], 'gi'), ' ');
    if (used) out = out.replace(re(SHAPE_ADJ_WORDS[used], 'gi'), ' ');
    return out;
  };
  return {
    noun,
    kind,
    arity: ARITY[kind],
    stated,
    consumed: used ?? null,
    unconsumed,
    strip,
    lower: (ids) => lowerShape(kind, ids),
    cyclic: forces ? { forces } : 'yes',
  };
}
