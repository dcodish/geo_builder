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
export type ShapeNoun3 = QuadNoun3 | 'triangle' | 'pentagon' | 'hexagon';
/** The shape-property adjectives. #1891: «משוכלל» / "regular" joins them, so it is never dropped. */
export type ShapeAdj3 = 'right' | 'isosceles' | 'equilateral' | 'regular';

/** Each quad noun's words (Hebrew, English), in the precedence the one quad vocabulary has always used. */
const QUAD_NOUN_WORDS: ReadonlyArray<readonly [QuadNoun3, string, string]> = [
  ['square', 'ריבוע', 'square'],
  ['rectangle', 'מלבן', String.raw`rectang\w*`],
  ['rhombus', 'מעויי?ן', 'rhombus'],
  ['parallelogram', 'מקבילית', 'parallelogram'],
  ['kite', 'דלתון', 'kite'],
  ['trapezoid', 'טרפז', String.raw`trapez\w*`],
  ['quad', 'מרובע', 'quadrilateral'],
];
/** The regexes `statedQuadBase` used, built from the words above (the same reading). */
const QUAD_NOUN_RE: ReadonlyArray<readonly [QuadNoun3, RegExp, RegExp]> = QUAD_NOUN_WORDS.map(
  ([noun, he, en]) => [noun, new RegExp(he), new RegExp(String.raw`\b${en}\b`, 'i')] as const,
);
/**
 * #2069 ([ADR-3D-369](../../docs/06b-decisions-3d.md#adr-3d-369)): the triangle SIGN before a label run («△ABC»,
 * «▲ABC», «△ ABC») is the triangle noun, as 2-D reads it (`triShape(/triangle|משולש|[△▲]/…)`). A sign with no
 * label run after it is not a noun. Every reader of this vocabulary (the declaration, the shape phrase, the
 * polygon arity) gets it at once.
 */
const TRIANGLE_RE = /משולש|\btriangle\b|[△▲](?=\s*[A-Z])/i;
/** Does `s` state the triangle noun, in any of its spellings (#2069)? */
export const isTriangleNoun3 = (s: string): boolean => TRIANGLE_RE.test(s);
const PENTAGON_RE = /מחומש|\bpentagon\b/i;
const HEXAGON_RE = /משושה|\bhexagon\b/i;
const GENERIC_POLY_RE = /מצולע|\bpolygon\b/i;

/**
 * #1891 (ADR-3D-311) — THE polygon-noun alternation an inscription sentence can name, one per language: the
 * triangle, every quad noun, the pentagon, the hexagon and the generic «מצולע» / polygon. Built from the
 * noun words above, so the inscription's container marker and the shape-phrase reader cannot drift apart
 * again: `parse3`'s private copy lacked «מחומש», and «מעגל חסום במחומש ABCDE» drew the circle through the
 * vertices (ADR-245's lesson, a noun missing from one list builds the CONVERSE figure).
 */
export const POLY_NOUN_HE3 = ['משולש', ...QUAD_NOUN_WORDS.map(([, he]) => he), 'מחומש', 'משושה', 'מצולע'].join('|');
export const POLY_NOUN_EN3 = ['triangle', ...QUAD_NOUN_WORDS.map(([, , en]) => en), String.raw`quads?`, 'pentagon', 'hexagon', 'polygon'].join('|');

/** The quad noun a sentence states, or null — THE one quad vocabulary (#305/#587). */
export function quadNoun3(s: string): QuadNoun3 | null {
  for (const [noun, he, en] of QUAD_NOUN_RE) if (he.test(s) || en.test(s)) return noun;
  return null;
}

/**
 * #1891 — the vertex count the polygon NOUN of `s` names: 3–6, `'any'` for the generic «מצולע» / polygon
 * (its label run decides), or null when no polygon noun is stated.
 */
export function statedPolygonArity3(s: string): number | 'any' | null {
  if (quadNoun3(s)) return 4;
  if (TRIANGLE_RE.test(s)) return 3;
  if (PENTAGON_RE.test(s)) return 5;
  if (HEXAGON_RE.test(s)) return 6;
  return GENERIC_POLY_RE.test(s) ? 'any' : null;
}

/** The English polygon nouns an adjective may stand before (used to bind the English «right»). */
const EN_POLY = String.raw`triangles?|trapez\w*|quadrilaterals?|quads?|squares?|rectangles?|rhombus(?:es)?|parallelograms?|kites?|pentagons?|hexagons?|polygons?`;
/** The Hebrew flat-polygon nouns as whole words, with the article / prefixes — what a «משוכלל» may follow. */
const HE_POLY_WORD = String.raw`(?<![א-ת])[ובלכשמה]{0,3}(?:${POLY_NOUN_HE3})(?![א-ת])`;

/**
 * Each adjective's words, He/En. «ישר זווית» in every spelling the tree admits (`זו?וית`, a hyphen or
 * none). English "right" counts as a SHAPE adjective only when it modifies a polygon noun — "right
 * prism" / "right pyramid" are a solid's own rightness, never the base's (#435).
 */
export const SHAPE_ADJ_WORDS3: Readonly<Record<ShapeAdj3, string>> = {
  right: String.raw`ישר\s*[-\s]?\s*זו?וית|\bright[-\s]?angled\b|\bright\b(?=[-\s]+(?:${EN_POLY})\b)`,
  isosceles: String.raw`שווה[\s-]?שוקיים|\bisosceles\b`,
  equilateral: String.raw`שווה[\s-]?צלעות|כל\s+מקצועותיה\s+שוו|\bequilateral\b`,
  // #1891: «משוכלל» / "regular" on a FLAT polygon only: after the Hebrew noun (a label run may sit between),
  // before the English one. "regular tetrahedron" and "regular (square) pyramid" state a SOLID's own
  // regularity, never the base's (the "right prism" rule, #435), so an English noun that heads a solid is
  // excluded, and «פירמידה משוכללת» is not a polygon's.
  regular: String.raw`(?<=${HE_POLY_WORD}\s+(?:[A-Z]\d*'?(?:\s*,?\s*[A-Z]\d*'?)*\s+)?)ה?משוכלל(?:ת|ים|ות)?(?![א-ת])|\bregular\b(?=[-\s]+(?:${EN_POLY})\b(?![-\s]+(?:pyramids?|prisms?)\b))`,
};

const ADJ_ORDER: readonly ShapeAdj3[] = ['right', 'equilateral', 'isosceles', 'regular'];

/** Which adjectives each noun can LOWER. A trapezoid takes ONE (a right isosceles trapezoid is a rectangle). */
const REFINES: Partial<Record<ShapeNoun3, { readonly adjs: readonly ShapeAdj3[]; readonly max: number }>> = {
  triangle: { adjs: ['right', 'equilateral', 'isosceles'], max: 3 },
  trapezoid: { adjs: ['right', 'isosceles'], max: 1 },
  // #1891: a regular quadrilateral IS a square, so on a square the word is a tautology with nothing to lower.
  // Everywhere else «משוכלל» is UNCONSUMED (3-D draws no regular triangle or pentagon): the caller declines
  // (FR-SP-15), and `droppedShapeAdjective3` watches the word on every seam.
  square: { adjs: ['regular'], max: 1 },
};

/** A phrase no circle can pass around without turning it into another noun (analytic's `notCyclic`). */
const NOT_CYCLIC: Readonly<Record<string, { readonly shape: string; readonly forced: string }>> = {
  'trapezoid:right': { shape: 'rightTrapezoid', forced: 'rectangle' },
};

/**
 * #1918 (ADR-3D-313) — THE one "no circle passes around it" lookup, for a noun and ONE adjective it carries.
 * `readShapePhrase3` asks it of a sentence that states both the phrase and its circle; the engine asks it of a
 * ring DECLARED with that phrase on one line and inscribed on another (either order). One table, two readers,
 * so the one-line and two-line forms cannot drift apart. Null when a circle may pass around the phrase.
 */
export function notCyclic3(noun: ShapeNoun3 | null, adj: ShapeAdj3 | undefined): { readonly shape: string; readonly forced: string } | null {
  if (!noun || !adj) return null;
  return NOT_CYCLIC[`${noun}:${adj}`] ?? null;
}

export interface ShapePhrase3 {
  /** the noun the phrase states (null: only adjectives — a bare «ישר זווית» reads as a triangle) */
  readonly noun: ShapeNoun3 | null;
  /** vertex count, decided by the NOUN (a bare adjective is a triangle's) */
  readonly arity: 3 | 4 | 5 | 6;
  /** every adjective the sentence states */
  readonly stated: readonly ShapeAdj3[];
  /** the adjectives this noun lowers */
  readonly consumed: readonly ShapeAdj3[];
  /** the adjectives it can NOT lower on this noun — the caller declines, never drops them */
  readonly unconsumed: readonly ShapeAdj3[];
  /** 'yes', or the shape a circle through every vertex would force (the sentence then contradicts itself) */
  readonly cyclic: 'yes' | { readonly shape: string; readonly forced: string };
  /**
   * #1902 (ADR-3D-312): `text` with exactly the words this phrase READ removed (its noun, and the adjectives
   * it consumed), each replaced by `mark` (default a space). An unconsumed adjective stays. 2-D's
   * `ShapePhrase.strip` (ADR-595), this lexicon's third copy.
   */
  strip(text: string, mark?: string): string;
}

/** Each noun's own words, as a global regex for {@link ShapePhrase3.strip}. */
const NOUN_SPAN: Readonly<Record<ShapeNoun3, RegExp>> = {
  ...(Object.fromEntries(QUAD_NOUN_WORDS.map(([n, he, en]) => [n, new RegExp(String.raw`${he}|\b${en}\b`, 'gi')])) as Record<QuadNoun3, RegExp>),
  triangle: new RegExp(TRIANGLE_RE.source, 'gi'),
  pentagon: new RegExp(PENTAGON_RE.source, 'gi'),
  hexagon: new RegExp(HEXAGON_RE.source, 'gi'),
};

/**
 * Read the shape phrase of `s` (ONE polygon phrase per sentence — the inscription and declaration rules).
 * Null when `s` names no polygon noun and no adjective.
 */
export function readShapePhrase3(s: string): ShapePhrase3 | null {
  // quad nouns first — the one-vocabulary precedence (`statedTriShape` defers to a stated quad noun)
  const noun: ShapeNoun3 | null =
    quadNoun3(s) ?? (TRIANGLE_RE.test(s) ? 'triangle' : PENTAGON_RE.test(s) ? 'pentagon' : HEXAGON_RE.test(s) ? 'hexagon' : null);
  const stated = ADJ_ORDER.filter((a) => new RegExp(SHAPE_ADJ_WORDS3[a], 'i').test(s));
  if (!noun && !stated.length) return null;
  const base: ShapeNoun3 = noun ?? 'triangle';
  const refines = REFINES[base];
  const consumed = refines ? stated.filter((a) => refines.adjs.includes(a)).slice(0, refines.max) : [];
  const unconsumed = stated.filter((a) => !consumed.includes(a));
  const arity: 3 | 4 | 5 | 6 = base === 'triangle' ? 3 : base === 'pentagon' ? 5 : base === 'hexagon' ? 6 : 4;
  const forces = consumed.map((a) => notCyclic3(base, a)).find((x) => x !== null);
  const strip = (text: string, mark = ' '): string => {
    // the adjectives first: «משוכלל» is read only where its noun stands before it (a lookbehind)
    let out = text;
    for (const a of consumed) out = out.replace(new RegExp(SHAPE_ADJ_WORDS3[a], 'gi'), mark);
    return noun ? out.replace(NOUN_SPAN[noun], mark) : out;
  };
  return { noun, arity, stated, consumed, unconsumed, cyclic: forces ?? 'yes', strip };
}

/**
 * #2235 ([ADR-3D-351](../../docs/06b-decisions-3d.md#adr-3d-351)) — how a shape noun is introduced. The 3-D copy of
 * the PATTERN of 2-D's ADR-654 / #2205 reader (`src/parser/shapePhrase.ts` `shapeNounSpan`; copied, never imported:
 * BOUNDARIES.json). `definite` («המשולש», «שהמשולש», «והמשולש», "the triangle") refers to the figure's shape;
 * `prefixed` (a ב/ל/כ/מ prefix, «במשולש») hides the article in unpointed text; `indefinite` («משולש», «ומשולש»,
 * "a triangle") is a new shape.
 */
export type ShapeArticle3 = 'definite' | 'prefixed' | 'indefinite';

/** The first flat-polygon noun of a sentence: where its word ends, its arity, and its article. */
export interface ShapeNounSpan3 {
  /** the index just past the noun's word — where a vertex run naming it goes («המשולש| ישר זווית») */
  readonly end: number;
  readonly arity: 3 | 4 | 5 | 6;
  readonly article: ShapeArticle3;
}

/** "the", then any shape adjectives, right before the English noun (2-D's `EN_DEFINITE`). */
const EN_DEFINITE3 = /\bthe\s+(?:(?:right(?:[\s-]?angled?)?|isosceles|equilateral|regular)\s+)*$/i;

/** Each flat-polygon noun's words (Hebrew, English) with its arity — built from the vocabulary above. */
const NOUN_WORDS_ARITY3: ReadonlyArray<readonly [string, string, 3 | 4 | 5 | 6]> = [
  ['משולש', 'triangle', 3],
  ...QUAD_NOUN_WORDS.map(([, he, en]) => [he, en, 4] as const),
  ['מחומש', 'pentagon', 5],
  ['משושה', 'hexagon', 6],
];

/**
 * The FIRST flat-polygon noun occurrence of `s` (any noun of the one vocabulary), or null. A Hebrew preposition prefix
 * (ב/ל/כ/מ) → `prefixed`; the conjunction ו and the relative ש carry no article, so «ומשולש» stays `indefinite` while
 * «שהמשולש» / «והמשולש» are `definite`. English "the" (shape adjectives allowed between) → `definite`.
 */
export function shapeNounSpan3(s: string): ShapeNounSpan3 | null {
  let best: { at: number; end: number; arity: 3 | 4 | 5 | 6; article: ShapeArticle3 } | null = null;
  for (const [he, en, arity] of NOUN_WORDS_ARITY3) {
    const h = new RegExp(String.raw`(?:^|[^א-ת])([א-ת]*?)(?:${he})[א-ת]*`).exec(s);
    if (h && (!best || h.index < best.at)) {
      const glued = h[1].replace(/^[וש]+/, '');
      best = { at: h.index, end: h.index + h[0].length, arity, article: glued === 'ה' ? 'definite' : glued ? 'prefixed' : 'indefinite' };
    }
    const e = new RegExp(String.raw`\b(?:${en})\w*`, 'i').exec(s);
    if (e && (!best || e.index < best.at)) {
      best = { at: e.index, end: e.index + e[0].length, arity, article: EN_DEFINITE3.test(s.slice(0, e.index)) ? 'definite' : 'indefinite' };
    }
  }
  return best && { end: best.end, arity: best.arity, article: best.article };
}

/** The article of the first flat-polygon noun in `s` (`indefinite` when there is none — 2-D's rule). */
export const shapeNounArticle3 = (s: string): ShapeArticle3 => shapeNounSpan3(s)?.article ?? 'indefinite';

/**
 * #2235 — the taught remedy of an ambiguous definite noun: the student's own sentence with `letters` written right
 * after the noun («המשולש ישר זווית» → «המשולש ABC ישר זווית»), 2-D's #2205 `example`. It must itself be a sentence the
 * tool records (docs/17 §9: a taught remedy is a grammar claim) — locked in `issue-2235-shape-ref.test.ts`.
 */
export function definiteShapeExample3(sentence: string, letters: string): string {
  const s = sentence.trim();
  const span = shapeNounSpan3(s);
  return span ? `${s.slice(0, span.end)} ${letters}${s.slice(span.end)}`.trim() : s;
}
