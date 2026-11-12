/**
 * #2823 ([ADR-W-208](../../docs/06w-decisions-workspace.md#adr-w-208)) — THE VOCABULARY OF THE CERTAIN LABEL SLOTS.
 *
 * The words before which only a point's name can stand, as regex sources, for `shell/labelCase` to compose: the point
 * and vertex nouns (S1), the polygon nouns with the length of the vertex run each one names and the words that may
 * stand between them (S2), the midpoint frame (S3, #1523 / ADR-3D-287's spelling, which 3-D's `midpoint` rule reads
 * too), the angle word (S4) and the givens word before a coordinate head (S5). Words only; the reading is the shell's.
 */

/** The Hebrew letters, for a character class. */
export const HE_LETTERS = 'א-ת';
/** A Hebrew word's clitic prefixes (ו, ב, ל, מ, ש, כ) and the article, at a word start. */
export const CLITIC = String.raw`(?<![א-ת])[ובלמשכ]{0,2}ה?`;
/** S1 — a point noun or a vertex noun. */
export const POINT_NOUN_HE = String.raw`${CLITIC}(?:נקוד(?:ה|ות)|קודקוד(?:ים)?)`;
export const POINT_NOUN_EN = String.raw`\b(?:[Pp]oints?|[Vv]ert(?:ex|ices))`;
/** The joint of a list of labels: «,», «ו-», "and". */
export const LIST_JOINT = String.raw`(?:,|ו-?|\band\b)`;

/** S2 — the polygon nouns, with the length of the vertex run each one names (null: three or more). */
export const SHAPES: readonly (readonly [string, number | null])[] = [
  ['משולש', 3], ['ריבוע', 4], ['מלבן', 4], ['מעוין', 4], ['מקבילית', 4], ['טרפז', 4], ['דלתון', 4], ['מרובע', 4],
  ['מחומש', 5], ['משושה', 6], ['מתומן', 8], ['מצולע', null],
  ['triangle', 3], ['square', 4], ['rectangle', 4], ['rhombus', 4], ['parallelogram', 4], ['trapezoid', 4], ['trapezium', 4], ['kite', 4], ['quadrilateral', 4],
  ['pentagon', 5], ['hexagon', 6], ['octagon', 8], ['polygon', null],
];
/** The words that may stand between a shape noun and its run («משולש ישר-זווית abc»). */
export const SHAPE_MOD = String.raw`(?:ישר[- ]?זווית|ישר[- ]?זוית|שווה[- ]?שוקיים|שווה[- ]?צלעות|משוכלל|קמור|right(?:[- ]angled)?|isosceles|equilateral|regular|convex|scalene)`;

/**
 * S3 — the MIDPOINT frame (#1523, ADR-3D-287), spelled once. `(?!י)` keeps «אנך אמצעי» / «קטע אמצעים» out (#330).
 *  - `MID_COPULA_HE` / `MID_HE`: «X [היא|הוא] [נקודת] [ה]אמצע …»
 *  - `MID_EN`: "X is the midpoint of …" / "X is the middle (point) of …"
 */
export const MID_COPULA_HE = String.raw`(?:(?:הוא|היא)\s+)?`;
export const MID_HE = String.raw`(?:ה?נקודת\s+)?ה?אמצע(?!י)`;
export const MID_EN = String.raw`[Mm]id(?:dle(?:\s+point)?|point)`;
/** The optional point noun before a midpoint's subject («הנקודה x אמצע SA»). */
export const SUBJECT_NOUN_HE = String.raw`(?:ה?נקודה\s+)?`;

/** S4 — the angle word. */
export const ANGLE_WORD_HE = String.raw`${CLITIC}זו?וית`;

/** S5 — the givens word at a sentence start, and the «ו» joint before a further coordinate head. */
export const GIVEN_HE = String.raw`(?:נתונ(?:ה|ות)\s+)?`;
export const AND_HE = String.raw`(?<![א-ת])ו-?`;
