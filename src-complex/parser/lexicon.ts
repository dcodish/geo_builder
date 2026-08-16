/**
 * THE LEXICAL ATOMS — every rule composes from these, and no rule spells a fragment inline.
 *
 * [ADR-CX-009](../../docs/06d-decisions-complex.md#adr-cx-009) §4 makes this a day-one file for a
 * measured reason: 2-D's `parse.ts` spells the point-label fragment **342 times** and the number
 * grammar exists under three names, the Hebrew final-kaf trap fired **at least three times after being
 * recorded as a trap**, and when the atoms finally shipped there, #361 stayed open because *nothing
 * consumes them*. A half-migration is its own debt. So the ratchet below starts at **zero**: this
 * grammar has never had an inline fragment and the test makes sure it never acquires one.
 *
 * Two Hebrew rules the sibling trees paid for, applied here from the start:
 *
 *   - **A final letter is not the medial one.** `כ`/`ך`, `מ`/`ם`, `נ`/`ן`, `פ`/`ף`, `צ`/`ץ` — a rule
 *     that spells only one spelling silently rejects half the register (ADR-3D-035, then ADR-182,
 *     ADR-294, ADR-403, ADR-435 #4).
 *   - **Prefixes are optional and stack.** The definite article and the conjunctions (`ו`, `ב`, `ל`,
 *     `כ`, `ש`, `מ`, `ה`) attach to the noun, so `ברביע` and `רביע` and `הרביע` are one word to a rule.
 *
 * Atoms carry **no capture groups**, so adopting one never renumbers a rule's own captures.
 */

/** A complex-number or parameter name: a letter, optional letters, optional digits. */
export const NAME = String.raw`[A-Za-z][A-Za-z]*\d*`;

/** A signed decimal. One spelling, used everywhere a magnitude can appear. */
export const NUM = String.raw`-?\d+(?:\.\d+)?`;

/** A rational or integer exponent, as the normalized form writes it. */
export const EXP = String.raw`-?\d+(?:/\d+)?`;

/** Optional stacked Hebrew prefixes: the article and the common conjunctions. */
export const HE_PREFIX = String.raw`[ובלכשמה]{0,3}`;

/** Kaf, medial or final — the trap that fired three times after being written down. */
export const KAF = String.raw`[כך]`;
/** Mem, medial or final. */
export const MEM = String.raw`[מם]`;
/** Nun, medial or final. */
export const NUN = String.raw`[נן]`;
/** Pe, medial or final — «היקף» ends in one, and spelling it with {@link KAF} refused the word. */
export const PE = String.raw`[פף]`;
/** Tsadi, medial or final. */
export const TSADI = String.raw`[צץ]`;

/** Hebrew gender/number suffixes, all optional. */
export const HE_SUFFIX = String.raw`(?:ים|ות|ה|ת)?`;

// --- domain vocabulary, bilingual, each spelled ONCE ------------------------

/** «רביע» / «quadrant», with prefixes and both spellings of the ordinals. */
export const QUADRANT_KW = String.raw`(?:${HE_PREFIX}רביע|quadrant)`;

/**
 * The ordinals the exam uses for quadrants, first to fourth.
 *
 * «ראשון» is spelled with the {@link NUN} atom rather than a literal final nun. In «ברביע הראשון» the
 * nun IS word-final, so a literal `ן` looks correct — but the same ordinal appears inflected as
 * «הראשונים» («שני האיברים הראשונים», F9), where it is medial. That is the final-letter trap this file
 * opens by warning about, and it fired here: the sequence rule matched every fragment of its sentence
 * except the one ordinal, for exactly this reason.
 */
export const ORDINALS: readonly (readonly [RegExp, 1 | 2 | 3 | 4])[] = [
  [new RegExp(String.raw`(?:ה?ראשו${NUN}|first|1)`, 'u'), 1],
  [/(?:ה?שני|second|2)/u, 2],
  [/(?:ה?שלישי|third|3)/u, 3],
  [/(?:ה?רביעי|fourth|4)/u, 4],
];

/** «ארגומנט» / «זווית» / `arg` — the argument of a number. */
export const ARG_KW = String.raw`(?:${HE_PREFIX}ארגומנט|${HE_PREFIX}זו?וית|arg)`;

/** «ערך מוחלט» / «גודל» / `abs` — spoken forms of the modulus; `|z|` is handled by the operator. */
export const ABS_KW = String.raw`(?:${HE_PREFIX}ערך ${HE_PREFIX}מוחלט|${HE_PREFIX}גודל|abs)`;

/** «מספר מרוכב» / «complex number» — the declaration noun. */
export const COMPLEX_KW = String.raw`(?:${HE_PREFIX}${MEM}ספר${HE_SUFFIX} ${HE_PREFIX}${MEM}רוכב${HE_SUFFIX}|complex numbers?)`;

/** «ממשי» — real. */
export const REAL_KW = String.raw`(?:${HE_PREFIX}${MEM}${MEM}שי${HE_SUFFIX}|real)`;

/** «מדומה טהור» — pure imaginary. */
export const IMAGINARY_KW = String.raw`(?:${HE_PREFIX}${MEM}דומה(?: ${HE_PREFIX}טהור${HE_SUFFIX})?|pure imaginary|imaginary)`;

/** «צמוד» — conjugate. */
export const CONJUGATE_KW = String.raw`(?:${HE_PREFIX}צמוד${HE_SUFFIX}|conjugates?)`;

/** «ו-» / «and» — the conjunction joining two named numbers. */
export const AND_KW = String.raw`(?:ו-?|and)`;

/** The English indefinite article and the `of` that precedes a noun phrase, all optional. */
export const OF_A = String.raw`(?:of\s+)?(?:an?\s+)?(?:the\s+)?`;

/** English counting words before a plural noun: «the first **two** terms». */
export const EN_COUNT = String.raw`(?:two|three|four|five)`;

// --- F6: objects on the plane -----------------------------------------------

/**
 * A POINT RUN — the exam's way of naming a figure: `OZ₁Z₂Z₃`, `Z₁Z₂`.
 *
 * `o` is in the alternation because the origin is always a point of the plane; the rest are the
 * z/w-family names ([ADR-CX-004](../../docs/06d-decisions-complex.md#adr-cx-004)). A run is NOT the
 * `NAME` class: `z1z2` is two points, and `NAME` would read it as one identifier — which is exactly
 * why it needs its own atom rather than a reuse.
 *
 * The optional `*` is what makes a PASTED figure work. `Z₁Z₂` normalizes to `z1*z2` (a subscript run
 * ends a name, so the orthography chokepoint inserts the product), so after a shape keyword the
 * separator must be tolerated — «הקטע Z₁Z₂» and «הקטע z1z2» are the same statement.
 */
export const RUN_ATOM = String.raw`(?:o|[zw]\d*)`;
export const RUN = String.raw`(?:${RUN_ATOM}(?:\s*\*?\s*${RUN_ATOM})+)`;
/** The same run with NO separator permitted — a bare line, where `z1*z2` means the product instead. */
export const RUN_GLUED = String.raw`(?:${RUN_ATOM}{2,})`;

/** «קטע» / «segment». */
export const SEGMENT_KW = String.raw`(?:${HE_PREFIX}קטע|segment)`;

/** «משולש» / «triangle». */
export const TRIANGLE_KW = String.raw`(?:${HE_PREFIX}${MEM}שולש|triangle)`;

/** «מרובע» / «quadrilateral». */
export const QUADRILATERAL_KW = String.raw`(?:${HE_PREFIX}${MEM}רובע|quadrilateral)`;

/** «מצולע» / «polygon» — any arity. */
export const POLYGON_KW = String.raw`(?:${HE_PREFIX}${MEM}צולע|polygon)`;

/** «מעגל» / «circle». */
export const CIRCLE_KW = String.raw`(?:${HE_PREFIX}${MEM}עגל|circle)`;

/** «חוסם» / «circumscribed» — the circle through a polygon's vertices. */
export const CIRCUMSCRIBED_KW = String.raw`(?:${HE_PREFIX}חוס${MEM}${HE_SUFFIX}|circumscribed|circumscribing)`;

/** «מרכז» / «centre» — both spellings of the English, which students and textbooks split on. */
export const CENTER_KW = String.raw`(?:${HE_PREFIX}${MEM}רכז${HE_SUFFIX}ו?|cent(?:re|er))`;

/** «רדיוס» / «radius». */
export const RADIUS_KW = String.raw`(?:${HE_PREFIX}רדיוס${HE_SUFFIX}ו?|radius)`;

/** «את» / «of» — the accusative particle a circumscription phrase takes. */
export const ACCUSATIVE_KW = String.raw`(?:את\s+|of\s+)?`;

/**
 * «with» / «whose» — English only, and deliberately so.
 *
 * Hebrew attaches the same sense as the prefix «ש» («שמרכזו»), which {@link HE_PREFIX} already carries
 * into every noun atom. Spelling a separate Hebrew word here would be a second way to say something
 * the prefix class handles, and the two would drift.
 */
export const WITH_KW = String.raw`(?:with\s+|whose\s+)?`;

// --- F7: measures -----------------------------------------------------------

/** «אורך» / «length» — the distance between two numbers. */
export const LENGTH_KW = String.raw`(?:${HE_PREFIX}אורך|length|distance)`;

/** «היקף» / «perimeter». */
export const PERIMETER_KW = String.raw`(?:${HE_PREFIX}היק${PE}|perimeter)`;

/** «שטח» / «area». */
export const AREA_KW = String.raw`(?:${HE_PREFIX}שטח|area)`;

/**
 * What equates a measure to its value: «=», «הוא», «is».
 *
 * REQUIRED, unlike {@link COPULA_KW}, which is optional by design. A measure sentence with no equating
 * word is «שטח OZ₁Z₂Z₃» — a request to *display* the area, not a statement about it — and letting the
 * separator be optional would silently turn the one into the other.
 */
export const EQUATES_KW = String.raw`(?:=|${HE_PREFIX}הוא|${HE_PREFIX}היא|is|equals)`;

// --- F9: sequences over ℂ ---------------------------------------------------

/** «סדרה» / «sequence». */
export const SEQUENCE_KW = String.raw`(?:${HE_PREFIX}סדרה|sequence)`;

/** «הנדסית» / «geometric» — the multiplicative sequence, the one the exact tier solves. */
export const GEOMETRIC_KW = String.raw`(?:${HE_PREFIX}הנדסית|geometric)`;

/** «חשבונית» / «arithmetic» — additive, and therefore the numeric tier's business. */
export const ARITHMETIC_KW = String.raw`(?:${HE_PREFIX}חשבונית|arithmetic)`;

/** «איבר» / «term», singular, with the article and prefixes. */
export const TERM_KW = String.raw`(?:${HE_PREFIX}איבר|term)`;

/** «איברים» / «terms», plural. */
export const TERMS_KW = String.raw`(?:${HE_PREFIX}איברים|terms)`;

/**
 * «שבה» / «where» — the relative pronoun that introduces the term the sequence is defined by.
 *
 * Both Hebrew genders, because the exam writes «סדרה הנדסית **שבה** האיבר השלישי» and a student may
 * well write «שבו»; refusing one spelling of a pronoun would be the final-kaf class in another dress.
 */
export const WHERE_KW = String.raw`(?:${HE_PREFIX}ש?בה|${HE_PREFIX}ש?בו|where|in which)`;

/**
 * Hebrew counting words used before a plural noun: «שני האיברים», «שלושת האיברים».
 *
 * Both the free and construct states (שני/שניים, שלושה/שלושת), because the exam uses the construct
 * form before a definite noun and a student typing from memory may use either.
 */
export const HE_COUNT = String.raw`(?:שני|שניים|שתי|שתיים|שלושה|שלושת|ארבעה|ארבעת|חמישה|חמשת)`;

/**
 * The ORDINALS that name a term's position, first to tenth — a wider ladder than the quadrant one,
 * which stops at four because there are four quadrants. `שישי`/`ששי` are both spelled: one is the
 * standard orthography and the other is what students type.
 */
export const TERM_ORDINALS: readonly (readonly [RegExp, number])[] = [
  [new RegExp(String.raw`(?:ה?ראשו${NUN}|first|1)`, 'u'), 1],
  [/(?:ה?שני|second|2)/u, 2],
  [/(?:ה?שלישי|third|3)/u, 3],
  [/(?:ה?רביעי|fourth|4)/u, 4],
  [/(?:ה?חמישי|fifth|5)/u, 5],
  [/(?:ה?שי?שי|sixth|6)/u, 6],
  [/(?:ה?שביעי|seventh|7)/u, 7],
  [/(?:ה?שמיני|eighth|8)/u, 8],
  [/(?:ה?תשיעי|ninth|9)/u, 9],
  [/(?:ה?עשירי|tenth|10)/u, 10],
];

/** The ordinal alternation as a claimable fragment, for a rule that must match one inline. */
export const ORDINAL_ANY = String.raw`(?:${TERM_ORDINALS.map(([re]) => re.source).join('|')})`;

/** «ראשון» / «first» on its own — the one ordinal that appears fixed inside a phrase. */
export const FIRST_ORD = TERM_ORDINALS[0][0].source;

/**
 * «שני האיברים הראשונים» / «the first two terms» — the phrase that opens the corpus sentence.
 *
 * Carried as ONE atom because the two languages order it differently: Hebrew is count → noun →
 * ordinal, English is ordinal → count → noun. A rule that spelled one order would refuse the other,
 * which is ADR-3D-145's class. The ordinal is FIXED at «first» rather than captured — no exam says
 * "the second two terms", and leaving it variable would put two ordinals in one sentence for the
 * reader (and the rule) to tell apart.
 *
 * No capture groups, so adopting it never renumbers a rule's own.
 */
export const FIRST_TERMS_PHRASE = String.raw`(?:(?:${HE_COUNT}\s+)?${TERMS_KW}\s+${FIRST_ORD}${HE_SUFFIX}|${FIRST_ORD}\s+${EN_COUNT}\s+${TERMS_KW})`;

/**
 * «הוא» / «היא» / «הם» / «הן» / `is` / `are` — the optional copula before a predicate.
 *
 * The PLURAL forms are here because a family whose subject is two numbers reaches for them by nature:
 * «z1 ו-z2 **הם** שני האיברים הראשונים», «z1, z2, z3 **are** a geometric sequence». Spelling only the
 * singular would refuse every multi-subject sentence in the grammar — the same shape as spelling only
 * one Hebrew word order.
 */
export const COPULA_KW = String.raw`(?:הוא\s+|היא\s+|הם\s+|הן\s+|is\s+|are\s+)?`;

/** Build a case-insensitive, unicode-aware regex from atoms. */
export const rx = (fragment: string, flags = 'iu'): RegExp => new RegExp(fragment, flags);

/**
 * The atoms a ratchet test counts, so "did a rule inline a fragment?" is measurable.
 * Adding an atom here is free; inlining its text in a rule is what the ratchet refuses.
 */
export const ATOM_SOURCES: Readonly<Record<string, string>> = {
  NAME,
  NUM,
  EXP,
  HE_PREFIX,
  KAF,
  MEM,
  NUN,
  PE,
  TSADI,
  HE_SUFFIX,
  QUADRANT_KW,
  ARG_KW,
  ABS_KW,
  COMPLEX_KW,
  REAL_KW,
  IMAGINARY_KW,
  CONJUGATE_KW,
  AND_KW,
  COPULA_KW,
  SEQUENCE_KW,
  GEOMETRIC_KW,
  ARITHMETIC_KW,
  TERM_KW,
  TERMS_KW,
  WHERE_KW,
  HE_COUNT,
  EN_COUNT,
  OF_A,
  ORDINAL_ANY,
  FIRST_ORD,
  FIRST_TERMS_PHRASE,
  RUN_ATOM,
  RUN,
  RUN_GLUED,
  SEGMENT_KW,
  TRIANGLE_KW,
  QUADRILATERAL_KW,
  POLYGON_KW,
  CIRCLE_KW,
  CIRCUMSCRIBED_KW,
  CENTER_KW,
  RADIUS_KW,
  ACCUSATIVE_KW,
  WITH_KW,
  LENGTH_KW,
  PERIMETER_KW,
  AREA_KW,
  EQUATES_KW,
};
