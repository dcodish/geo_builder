/**
 * THE NOUN VOCABULARY — the words this product's Hebrew and English name shapes with.
 *
 * #753 (ADR-3D-188). This module exists because the same gates were maintained in two files and drifted
 * **three times**: #640 (the line noun in `parse3.ts`), #642 (the subject noun in `queries.ts`), and the
 * ASCII-only `\w*` suffix gate found while fixing that one. `engine/queries.ts` cannot import from
 * `parser/` — the layering forbids it — so each copy was fixed alone and the other silently stayed
 * behind. The AREA head was about to become the fourth copy; round #752 stopped and filed this instead.
 *
 * The fix is the layer `BOUNDARIES.json` had already NAMED and left empty: *"Does it name Hebrew/English
 * vocabulary, or map a noun to a shape?  …  No directory carries this layer yet; it is declared so the
 * split is nameable when one does."* This directory is the one that does.
 *
 * **It imports NOTHING.** That is the whole property: a leaf both `parser/` and `engine/` may depend on
 * without either depending on the other. Nothing here lowers a noun to geometry — this module knows only
 * how the words are SPELLED. What a triangle MEANS stays in the layer that builds one.
 *
 * Spelling tolerances are the ones `src3d/CLAUDE.md` records and they are load-bearing: both kaf/nun
 * forms, `זו?וית`'s single and double vav, the optional definite article and prosthetic prefixes, and
 * the FINAL-FORM trap — «ארבעון» ends in a final nun, so a medial-נ stem can never match it (the first
 * draft of this list got that wrong and the tetra corpus caught it).
 */

/** The definite article and the prosthetic prefixes a noun may wear. */
export const HE_PREFIX = String.raw`(?:[ובלכשמה]{1,3})?`;

/** Solid nouns — the three-dimensional bodies. */
export const SOLID_HE = [
  'מנסרה', 'מנסרות', 'פירמיד[הות]+', 'תיב[הות]+', 'קוביי?[הות]+', 'מקבילונ?ים?', 'מקבילון',
  'טטר[אה]?ה?דר(?:ו[ןנ]|ים)?', 'ארבעו[ןנ](?:ים)?',
];

/**
 * FLAT-SHAPE nouns — the polygons, with the adjectival and plural forms a book sentence uses for the
 * same shape («תיבה מלבנית», «מנסרה משולשת»). A gate that knows the noun but not its adjective fails on
 * real input, which is why they are one list rather than two.
 */
export const POLYGON_HE = [
  'משולש(?:ת|ים|ות)?', 'מרובע(?:ת|ים|ות)?', 'ריבוע(?:י[תםי]?|ים)?', 'מלבני(?:ת|ים|ות)?', 'מלבנים', 'מלבן',
  'מעויי?נ(?:ת|ים|ות)?', 'מעויי?ן',
  'מקבילי(?:ת|ות)', 'טרפז(?:ים|ות)?', 'דלתונ?ים?', 'דלתון', 'מחומש(?:ים)?', 'משושה?', 'מצולע(?:ים)?',
];

/** The PLANE noun. Its own export because a plane is not a polygon — #753's 2026-08-29 evidence is a
 *  student asking «שטח מישור DBB'D'» right after typing «מישור DBB'D'» into the fact list. */
export const PLANE_HE = ['מישור'];

/** Qualifiers: rightness, the equal-sides family, the edge family. */
export const QUALIFIER_HE = [
  'ישר(?:ה|ים|ות)?', 'זו?וית', 'זו?ויות', 'שוו?ה', 'שוו[יו]ם', 'צלעות', 'שוקיים', 'מקצועות(?:יו|יה)?',
];

/** The base clause and a solid's own parts. */
export const PART_HE = ['שבסיס[הו]', 'בסיס(?:ה|ו|ים)?', 'קודקוד(?:ה|ו|ים)?', 'פאה', 'פאות'];

/** Every word the DECLARATION family reads — the union, in the order the parser listed them. */
export const DECL_WORDS_HE = [...SOLID_HE, ...POLYGON_HE, ...QUALIFIER_HE, ...PART_HE].join('|');

export const DECL_WORDS_EN = String.raw`prisms?|pyramids?|box(?:es)?|cuboids?|cubes?|parallelepipeds?|tetrahedr(?:on|a)|triangles?|triangular|quadrilaterals?|quads?|squares?|rectangles?|rhombus(?:es)?|parallelograms?|trapez\w*|kites?|pentagons?|hexagons?|polygons?|right|angled|isosceles|equilateral|regular|bases?|edges?|vert(?:ex|ices)|faces?`;

/** The English flat-shape nouns alone — the mirror of {@link POLYGON_HE}, without the qualifiers. */
export const POLYGON_EN = String.raw`triangles?|quadrilaterals?|quads?|squares?|rectangles?|rhombus(?:es)?|parallelograms?|trapez\w*|kites?|pentagons?|hexagons?|polygons?`;
export const PLANE_EN = String.raw`planes?`;

/**
 * A SUBJECT NOUN a student may put in front of the thing they are asking about — «שטח המשולש ABC»,
 * «נפח המנסרה ABCDEF», «area of triangle ABC». Optional by construction: naming the shape is a
 * courtesy, never a requirement, so «שטח ABC» keeps answering exactly as it does today.
 */
export const subjectNoun = (he: string[], en: string): string =>
  String.raw`(?:${HE_PREFIX}(?:${he.join('|')})\s+|(?:the\s+)?(?:${en})\s+(?:of\s+)?)?`;

/** The subject-noun gate for an AREA-like question: a polygon or a plane. */
export const SHAPE_SUBJ = subjectNoun([...POLYGON_HE, ...PLANE_HE], `${POLYGON_EN}|${PLANE_EN}`);
