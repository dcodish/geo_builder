/**
 * THE lexical atoms (S2.1 of docs/24 — closes the docs/23 G3 generator's supply line).
 *
 * The docs/23 review measured the cost of having no lexical layer: the point-label fragment was
 * re-spelled 342× in parse.ts (163× in parse3.ts), the number grammar existed under three names
 * (`num`/`COEF`/`isNumChunk`), the angle-keyword alternation ~21×, and Hebrew morphology (final
 * kaf, single/double-vav, plurals) was handled per-regex — which is exactly how the recurring
 * "proxy-signal" lexical defect family kept re-opening (ADR-3D-068/069/071, the זוית sweep of
 * ADR-3D-032, the מאונ[ךכ] trap of ADR-3D-035, the נפגש gap of ADR-3D-055). Everywhere a shared
 * atom was introduced (`splitTopLevelTerms`, `LINE_CUT`, `NUMTERM`), the class closed and stayed
 * closed.
 *
 * REGISTRY RULES (docs/17 §3 — this file is a registered chokepoint):
 *  - NEW rules must compose their regexes from these atoms, never re-spell a fragment inline.
 *  - EXISTING inline fragments are swept onto the atoms opportunistically; the ratchet test
 *    (`lexical-ratchet.test.ts`) records the current inline counts and fails on ANY growth, so the
 *    debt can only shrink. (A blind mass regex substitution was deliberately rejected: the atoms
 *    carry NO capture groups precisely so that adopting one never renumbers a rule's captures —
 *    wrap in `(...)` at the use site.)
 *  - Adding an atom or changing an alternation is a parse-behavior change — same scrutiny as a rule.
 *
 * All atoms are SOURCE FRAGMENTS (strings for `new RegExp`) with no capture groups and no anchors.
 */

// ── Labels ────────────────────────────────────────────────────────────────────────────────────────
/** A point-label token: one Latin letter + optional glued digits (`A`, `B2`, `O1`). Case-insensitive
 *  contexts must validate case at the use site (see parse.ts `isUpperLabel`). */
export const LABEL = String.raw`[A-Za-z]\d*`;
/** An explicitly-uppercase label (the student-vertex convention). */
export const ULABEL = String.raw`[A-Z]\d*`;

// ── Numbers ───────────────────────────────────────────────────────────────────────────────────────
/** The one number fragment: optional sign, decimal point allowed. NO capture — wrap at use site.
 *  (parse.ts's legacy `num` aliases `(${NUM})`; `COEF`/`isNumChunk` are its other historical names.)
 *
 *  #975 (ADR-504) — a hyphen glued to a preceding HEBREW letter is the maqaf of a particle («ל-90»,
 *  «מ-5», «ב-», «כ-»), never a minus sign. The sign arm refuses it with a zero-width lookbehind, so
 *  the digits still match and «שווה ל-90» reads +90 without any rule knowing about particles; a
 *  genuine negative (after a space, `=`, `(`, `,`, or at line start) is untouched. Total over every
 *  consumer — the `(?<![A-Za-z])` guard some rules add blocks a LATIN label, not a Hebrew particle. */
export const NUM = String.raw`(?<![א-ת])-?\d+(?:\.\d+)?`;

/** [ADR-635](../../docs/06-decisions.md#adr-635) — the vulgar-fraction spelling lives in `shell/vulgarFractions.ts`
 *  since #2255 ([ADR-W-147](../../docs/06w-decisions-workspace.md#adr-w-147)), where 3-D reads it too; re-exported
 *  so every 2-D import is unchanged. */
export { spellVulgarFractions } from '../../shell/vulgarFractions';

/**
 * #2065 ([ADR-700](../../docs/06-decisions.md#adr-700)) — the SEPARATOR of a two-term ratio «p:q» / «p ל-q» /
 * «p ל q» («אחד ל-2» is the same statement as «1:2»). One atom with two consumers, so they can never disagree:
 * the similarity reader (`statedSimilarityRatio`, value p/q) and the dropped-number gate's pair pass (which
 * accounts the pair whole). Bare alternation, no capture, whitespace included — `${n}${RATIO_SEP}${n}`.
 */
export const RATIO_SEP = String.raw`\s*(?::|ל-?)\s*`;

// ── Word fractions (#1611 ADR-591's tables; one reader since #2040, ADR-636) ─────────────────────
/** Hebrew denominators: singular (numerator 1) and plural (numerator ≥ 2). חצי has no plural in use. */
export const HE_FRACTION_DENOM: readonly { sing: string; plur?: string; q: number }[] = [
  { sing: 'חצי', q: 2 },
  { sing: 'שליש', plur: 'שלישים', q: 3 },
  { sing: 'רבע', plur: 'רבעים', q: 4 },
  { sing: 'חמישית', plur: 'חמישיות', q: 5 },
  { sing: 'שישית', plur: 'שישיות', q: 6 },
  { sing: 'שביעית', plur: 'שביעיות', q: 7 },
  { sing: 'שמינית', plur: 'שמיניות', q: 8 },
  { sing: 'תשיעית', plur: 'תשיעיות', q: 9 },
  { sing: 'עשירית', plur: 'עשיריות', q: 10 },
];
/** Hebrew numerators, both genders (שלושה רבעים / שלוש חמישיות). */
export const HE_FRACTION_NUM: Readonly<Record<string, number>> = {
  'שני': 2, 'שתי': 2, 'שלושה': 3, 'שלוש': 3, 'ארבעה': 4, 'ארבע': 4, 'חמישה': 5, 'חמש': 5,
  'שישה': 6, 'שש': 6, 'שבעה': 7, 'שבע': 7, 'שמונה': 8, 'תשעה': 9, 'תשע': 9,
};
export const EN_FRACTION_DENOM: readonly { sing: string; plur: string; q: number }[] = [
  { sing: 'half', plur: 'halves', q: 2 },
  { sing: 'third', plur: 'thirds', q: 3 },
  { sing: 'quarter', plur: 'quarters', q: 4 },
  { sing: 'fourth', plur: 'fourths', q: 4 },
  { sing: 'fifth', plur: 'fifths', q: 5 },
  { sing: 'sixth', plur: 'sixths', q: 6 },
  { sing: 'seventh', plur: 'sevenths', q: 7 },
  { sing: 'eighth', plur: 'eighths', q: 8 },
  { sing: 'ninth', plur: 'ninths', q: 9 },
  { sing: 'tenth', plur: 'tenths', q: 10 },
];
export const EN_FRACTION_NUM: Readonly<Record<string, number>> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

const altOf = (ws: readonly string[]): string => [...ws].sort((a, b) => b.length - a.length).join('|');
/** «מחצית» (a half) is read as a ratio word (ADR-118) but is not one the fraction teacher proposes. */
const HE_READ_ONLY_DENOM: readonly { sing: string; q: number }[] = [{ sing: 'מחצית', q: 2 }];
const HE_READ_DENOM: readonly { sing: string; plur?: string; q: number }[] = [...HE_FRACTION_DENOM, ...HE_READ_ONLY_DENOM];
const EN_ONE: Readonly<Record<string, number>> = { a: 1, an: 1, one: 1 };
const HE_DENOM_WORDS = altOf(HE_READ_DENOM.flatMap((d) => (d.plur ? [d.sing, d.plur] : [d.sing])));
const EN_DENOM_WORDS = altOf(EN_FRACTION_DENOM.flatMap((d) => [d.sing, d.plur]));
const HE_WORD_FRACTION = new RegExp(
  String.raw`(?<![א-ת])[ולבמכה]{0,2}-?(?:(?<n>${altOf(Object.keys(HE_FRACTION_NUM))})\s+)?(?<d>${HE_DENOM_WORDS})(?![א-ת])`,
);
const EN_WORD_FRACTION = new RegExp(String.raw`\b(?:(?<n>${altOf([...Object.keys(EN_ONE), ...Object.keys(EN_FRACTION_NUM)])})\s+)?(?<d>${EN_DENOM_WORDS})\b`, 'i');

/**
 * #2040 ([ADR-636](../../docs/06-decisions.md#adr-636)) — the first WORD fraction in `s` («רבע», «שלושה רבעים»,
 * «שתי חמישיות», "a third", "three quarters"), read WHOLE: `{ p, q, at, text }`. A numerator word goes with a
 * PLURAL denominator and only with one, so «רבעים» alone or «שלושה רבע» is `'unread'` — a fraction the student
 * wrote that this reader cannot spell exactly, which a caller must decline, never read as a different number.
 * `null` when `s` names no fraction word. The tables are ADR-591's (the fraction teacher reads them too).
 */
export function readWordFraction(s: string): { p: number; q: number; at: number; text: string } | 'unread' | null {
  const he = HE_WORD_FRACTION.exec(s);
  const en = EN_WORD_FRACTION.exec(s);
  const m = he && en ? (he.index <= en.index ? he : en) : (he ?? en);
  if (!m) return null;
  const g = m.groups!;
  const isHe = m === he;
  const d = g.d!.toLowerCase();
  const denom = isHe ? HE_READ_DENOM.find((x) => x.sing === d || x.plur === d)! : EN_FRACTION_DENOM.find((x) => x.sing === d || x.plur === d)!;
  const plural = denom.plur === d;
  const n = g.n === undefined ? undefined : isHe ? HE_FRACTION_NUM[g.n] : (EN_ONE[g.n.toLowerCase()] ?? EN_FRACTION_NUM[g.n.toLowerCase()]);
  if (plural ? n === undefined || n < 2 : n !== undefined && n !== 1) return 'unread';
  return { p: n ?? 1, q: denom.q, at: m.index, text: m[0] };
}

// ── Name glyphs (#1814, ADR-600) ──────────────────────────────────────────────────────────────────
/** The student's name alphabet (Latin + Greek), an index on a name, and `UNGLUED` — where a number may
 *  begin. Shared with analytic through `shell/indexedName` (the third-copy rule): a guard that keeps a value
 *  out of a name composes `UNGLUED`, and is never re-spelled per reader (the Latin-only `(?<![A-Za-z])` of
 *  #267 is how «∠ABC = α1» read as 1°). Only the atoms the grammar consumes are re-exported (#361). */
export { GREEK_LETTER, NAME_LETTER, INDEX, UNGLUED } from '../../shell/indexedName';

// ── Circle roles (ADR-244, #2459 ADR-754) ─────────────────────────────────────────────────────────
/**
 * The ROLE of one circle of a concentric pair, as the student names it: the Hebrew adjective FOLLOWS the
 * circle noun («המעגל החיצוני/הפנימי/הגדול/הקטן»), the English one PRECEDES it ("the outer/inner/larger/smaller
 * circle"). ADJACENCY to the circle noun is required — a bare «חיצוני» also appears in «נקודה חיצונית» (an
 * external POINT). One spelling, read where each role word stands: the parse-boundary alias `resolvePairRoles` (#2464, ADR-760)
 * rewrites every role reference to its circle's letter form before any rule runs. Capture 1 is the adjective.
 */
export const CIRCLE_ROLE_HE = String.raw`מעגל(?:ים)?\s+ה?(חיצוני|פנימי|גדול|קטן)`;
export const CIRCLE_ROLE_EN = String.raw`\b(outer|external|inner|internal|larg(?:er|est)?|small(?:er|est)?|big(?:ger|gest)?)\s+circles?\b`;
/**
 * #2464 ([ADR-760](../../docs/06-decisions.md#adr-760)) — a role as a REFERENCE to ONE circle, with what is glued to it:
 * the Hebrew particle cluster and article («במעגל החיצוני», «למעגל הפנימי», «שבמעגל הגדול», «מעגל פנימי») and the
 * English article. Singular only — the plural «מעגלים …» / "circles" names no one circle. Composed from the role
 * atoms above (no new spelling). HE captures: 1 the particles, 2 the adjective; EN capture 1 the adjective.
 */
export const CIRCLE_ROLE_REF_HE = String.raw`(?<![א-ת])([ושכ]?[לבמ]?)ה?(?!מעגלים)${CIRCLE_ROLE_HE}(?![א-ת])`;
export const CIRCLE_ROLE_REF_EN = String.raw`(?:\bthe\s+)?(?!\S+\s+circles\b)${CIRCLE_ROLE_EN}`;
/** The role a {@link CIRCLE_ROLE_HE} / {@link CIRCLE_ROLE_EN} adjective names. */
export const circleRole = (adj: string): 'outer' | 'inner' =>
  /^(?:פנימי|קטן|inner|internal|small)/i.test(adj) ? 'inner' : 'outer';

// ── A circle by its relation to a polygon (#2545, ADR-768) ─────────────────────────────────────────
/**
 * The two RING relations of a circle, as the adjective after the circle noun. ADR-650's voice trap, side by side:
 * «חוסם» (active: the circle ENCLOSES the polygon) is the CIRCUMSCRIBED circle, «חסום» (passive: it is enclosed IN
 * the polygon) the INSCRIBED one. Capture-free stems; {@link ringRelation} classes a matched word.
 */
export const RING_CIRCUM_HE = String.raw`חוס(?:ם|מת)`;
export const RING_INSCR_HE = String.raw`חסו(?:ם|מה)`;
/**
 * A circle named by its relation to a polygon in ARGUMENT position — behind an operand particle («במעגל החוסם»,
 * «למעגל החסום», «על המעגל החוסם», «שבמעגל …»), never the sentence's subject («המעגל החוסם את … חותך …», «מעגל O
 * חוסם את …» are declarations, owned by their rules). Captures: 1 the particles (kept on a rewrite), 2 the relation.
 * The ring that may follow («את המשולש ABC», «במשולש») is read by `ringRoles.ts` from {@link RING_NOUN_HE}.
 */
export const RING_ROLE_REF_HE = String.raw`(?<![א-ת])((?:ו?ש?[בלמ])|(?:ו?ש?(?:על|של|אל)\s+))ה?מעגל\s+ה(${RING_CIRCUM_HE}|${RING_INSCR_HE})(?![א-ת])`;
/**
 * The English twin, behind a preposition: "of the circumscribed circle", "on the incircle", "in the circle
 * circumscribing …", "to the circle inscribed in …". Captures: 1 the preposition, 2 the whole relation phrase.
 */
export const RING_ROLE_REF_EN = String.raw`(?<![A-Za-z])(of|on|in|to|onto|into|with|from|at|inside)\s+the\s+((?:circumscribed|inscribed)\s+circle|circumcircle|incircle|circle\s+(?:circumscribing|inscribed\s+in|circumscribed\s+(?:about|around)))(?![A-Za-z])`;
/** The polygon nouns a ring tail may carry («את המשולש», "of triangle"): the noun, then its vertex count (0 = any). */
export const RING_NOUN_HE = String.raw`משולש|מרובע|ריבוע|מלבן|מעוין|טרפז|דלתון|מקבילית|מחומש|משושה|מצולע`;
export const RING_NOUN_EN = String.raw`triangle|quadrilateral|quad|square|rectangle|rhombus|trapezoid|trapezium|kite|parallelogram|pentagon|hexagon|polygon`;
/** The relation a {@link RING_ROLE_REF_HE} / {@link RING_ROLE_REF_EN} match names. */
export const ringRelation = (word: string): 'circum' | 'inscribed' => (/חוס|circum/i.test(word) ? 'circum' : 'inscribed');

// ── Keywords (bilingual, morphology handled ONCE)────────────────────────────────────────────────
/** Hebrew kaf in both positional forms — the ADR-3D-035 recorded trap (`מאונ[ךכ]` — a final-ך-only
 *  gate silently rejects the plural `מאונכים`, where kaf is medial). */
export const KAF = String.raw`[כך]`;
/** Hebrew optional inflection on an adjective/participle stem: masc pl (`מקבילים`), fem pl
 *  (`מקבילות`), fem sg (`מאונכת`, `מקבילה`), and the CONSTRUCT state (`חוצי זווית`, `משיקי המעגל`).
 *  Longest-first so a greedy read takes `ים` before `י`; the {@link HE_END} boundary makes the order
 *  immaterial, but it keeps the intent readable. */
export const HE_SUFFIX = String.raw`(?:יים|ים|ות|ה|ת|י)?`;

/**
 * #771 — THE MORPHOLOGICAL BOUNDARY, the thing every Hebrew word pattern in this tree was missing.
 *
 * JavaScript's `\b` is defined over `[A-Za-z0-9_]`, so it is **inert around Hebrew letters**: there
 * is no word boundary anywhere inside — or at either end of — a Hebrew word, and `/\bמקביל\b/`
 * silently never matches at all. Every Hebrew keyword pattern therefore behaves as a bare SUBSTRING
 * test, and a stem that is the prefix of a longer, unrelated word matches inside it.
 *
 * Not hypothetical: the Hebrew for **parallelogram** is `מקבילית`, which contains the Hebrew for
 * **parallel** (`מקביל`), so the ADR-292 verb gate read every parallelogram utterance as *stating a
 * parallel relation* and false-blocked the tool's own correct parses to the paid LLM (#771).
 *
 * Only the TRAILING side is guarded, deliberately: Hebrew clitics (ה/ו/ב/ל/כ/מ/ש) attach at the
 * FRONT of a stem, so `המקביל` / `ולמקביל` are the same word, and a leading guard would create false
 * NEGATIVES — a dropped given going unnoticed, which is the dangerous direction. A stem may be
 * followed by its own inflection ({@link HE_SUFFIX}) and by nothing else Hebrew.
 */
export const HE_END = String.raw`(?![א-ת])`;
/** The English twin. `\b` does work for Latin, but spelling it as a lookahead keeps the two halves of
 *  a bilingual pattern symmetrical — and `parallel` ⊂ `parallelogram` is the same trap in English. */
export const EN_END = String.raw`(?![A-Za-z])`;
/** #2195 ([ADR-738](../../docs/06-decisions.md#adr-738)): the LEADING English boundary — no Latin letter before the word. */
export const EN_START = String.raw`(?<![A-Za-z])`;

/** A Hebrew stem plus its own inflection, bounded: matches the word and its forms, never inside a
 *  longer word. NO capture group — wrap at the use site. */
export const heWord = (stem: string): string => String.raw`(?:${stem})${HE_SUFFIX}${HE_END}`;
/** The English twin. `suffix` is per-word because English derivation is not uniform: `bisect` must
 *  still reach `bisector`, while `parallel` must NOT reach `parallelogram`.
 *
 *  #2195 ([ADR-738](../../docs/06-decisions.md#adr-738)): BOTH sides are guarded. English has no prefix clitics, so
 *  the leading guard {@link EN_START} loses nothing a student writes, and it closes the trap Hebrew cannot have: a
 *  keyword matched INSIDE a longer word («tri**angle**», «rect**angle**», «non**parallel**»), whose leftover letters
 *  («tri») a label reader then took for points the student never named. */
export const enWord = (stem: string, suffix = String.raw`s?`): string => String.raw`${EN_START}(?:${stem})(?:${suffix})${EN_END}`;
/**
 * A bilingual WORD-form keyword — {@link heWord} | {@link enWord}, the shape every atom below uses.
 *
 * The honesty battery's `VERB_GATES` (`parse.ts`) composes through these same helpers, which is what
 * makes #771's class closed rather than its one row fixed: one boundary rule, one place.
 */
export const wordForm = (he: string, en: string, enSuffix = String.raw`s?`): string =>
  String.raw`${heWord(he)}|${enWord(en, enSuffix)}`;

/**
 * #2195 ([ADR-738](../../docs/06-decisions.md#adr-738)) — THE ENGLISH ANGLE NOUN, as a whole word. «tri**angle**»,
 * «rect**angle**», «quadr**angle**» and «**angle**d» contain it; matched inside them, the angle rules read the leftover
 * «tri» / «d» as point labels (∠TRI = 90 on three invented points, green). The leading guard is {@link EN_START}.
 *
 * The case is SPELLED, so a consumer compiles it WITHOUT `/i`: the back guard then refuses a following LOWERCASE
 * letter («angled», «angles» aside — the plural is the suffix) and still admits a glued UPPERCASE label («angleABC = 40»,
 * read before this guard existed and kept). Under `/i` it degrades to {@link EN_END} (any following letter refused) —
 * never to a match inside a word.
 */
export const ANGLE_EN = String.raw`${EN_START}(?:[Aa]ngle|ANGLE)[sS]?(?![a-z])`;
/**
 * The angle noun — the glyph (∢ folds to ∠ at the parser boundary; both are listed so a consumer never depends on
 * the fold), the Hebrew noun as the angle rules have always spelled it (`ה?זוו?ית`: the singular, single- or
 * double-vav — the ADR-3D-032 class: `זוית` keystrokes are as common as the full `זווית`), and the English noun
 * as a WORD ({@link ANGLE_EN}).
 *
 * #2195 ([ADR-738](../../docs/06-decisions.md#adr-738)): every angle-family rule now tests and strips THIS atom. Until
 * then ~15 rules spelled `angle|∠|זוו?ית` inline, unbounded, and the atom (then `wordForm('זו?וי', 'angle')`) was
 * consumed by nothing. Its Hebrew half is the inline spelling, not `heWord`'s, deliberately: `heWord` admits the
 * plural «זוויות», and adopting it would have moved Hebrew readings this fix was not about. Compile WITHOUT `/i`
 * ({@link ANGLE_EN}'s case is spelled).
 */
export const ANGLE_KW = String.raw`(?:∠|∢|ה?זוו?ית|${ANGLE_EN})`;
/**
 * #2234 ([ADR-737](../../docs/06-decisions.md#adr-737)) — the ADJECTIVE "right-angled": «ישר זווית» / «ישר-זווית» /
 * «ישרת זווית» / «ישר הזווית» (either vav spelling), English `right-angled` / `right angled`, and `right` (or
 * `right-angle`) standing before the triangle noun ("right triangle ABC"). NEVER the noun — «זווית ישרה», "a right
 * angle", "right angle at B" state an angle and are read as one; this atom does not match them by construction.
 * Bare alternation, no capture.
 */
export const RIGHT_ANGLED = String.raw`(?:(?<![א-ת])[ו]?ישר[הת]?[-\s]?ה?זוו?ית(?![א-ת])|${EN_START}right[-\s]?angled${EN_END}|${EN_START}right(?:[-\s]?angle)?(?=\s+(?:triangle|△)))`;
/**
 * #2234 ([ADR-737](../../docs/06-decisions.md#adr-737)) — a VERTEX LOCATIVE: «ב-B», «ב B», «בקודקוד B», «ב-קודקוד B»,
 * English "at B", "at vertex B", "at the vertex B". The label is the lexicon's {@link LABEL} (either case — the
 * reader upper-cases it), bounded on the right. Bare alternation, no capture: a reader that needs the letter takes
 * the last label of the match.
 */
export const AT_VERTEX = String.raw`(?:(?<![א-ת])ב-?\s*(?:ה?קודקוד\s*-?\s*)?|${EN_START}at\s+(?:the\s+)?(?:vertex\s+)?)${LABEL}(?![A-Za-z\d])`;
/** Perpendicular (word forms): מאונך/מאונכת/מאונכים/מאונכות + English. Symbol ⟂/⊥ handled where
 *  symbols are read. NOTE `ניצב` is also the NOUN for a right triangle's LEG («הניצב AB»), so a
 *  consumer that must not read a leg as a stated perpendicularity picks its own stems (the honesty
 *  gates do exactly that) rather than taking this atom whole. */
export const PERP_KW = String.raw`(?:${heWord(`מאונ${KAF}`)}|${heWord('ניצב')}|${enWord('perpendicular')})`;
/** Parallel (word forms). The `מקביל` ⊂ `מקבילית` / `parallel` ⊂ `parallelogram` pair is #771's. */
export const PARALLEL_KW = String.raw`(?:${wordForm('מקביל', 'parallel')})`;
/**
 * Meet/cut verbs — THE grammar's alternation, moved here from parse.ts's `INTERSECT_KW` (#361,
 * [ADR-501](docs/06-decisions.md#adr-501)). It carries the ADR-3D-055 lesson in the form the rules actually
 * parse: BOTH nun forms (`נפגש` meet, `פוגש`/`פגש`), both cut families (`חותך` with either kaf, `נחתך`/`נחתכ`
 * for the medial-kaf plurals), the `חיתוך` noun and the `∩` symbol, and the word-bounded English verbs.
 *
 * This file used to carry a SECOND spelling of the same vocabulary (a `heWord`-bounded one) that no rule
 * consumed — vocabulary registered here that the grammar did not parse, the exact defect #361 names. One
 * vocabulary, one home: `parse.ts` compiles this fragment (`rx(MEET_KW)`) and every guard that says
 * "a meeting EVENT owns this phrasing" reads the same atom. Bit-identical to the constant it replaces.
 */
export const MEET_KW = String.raw`intersect|∩|חיתוך|נחתך|נחתכ|נפגש|פוגש|פגש|חות[כך]|\bcuts?\b|\bmeets?\b`;
/**
 * «בהתאמה» / "respectively" — the word that PAIRS a label run with a list in order (#2185,
 * [ADR-735](docs/06-decisions.md#adr-735)). One spelling, bounded both ways: the incidence-list distributor reads it as
 * the pairing, and the clause splitter's operand guard reads «A ו-C בהתאמה» as the closing half of a pairing, never a
 * clause of its own.
 */
export const RESPECTIVELY = String.raw`(?:בהתאמה${HE_END}|respectively${EN_END})`;
/** Tangent (word forms): משיק/משיקים/tangent. */
export const TANGENT_KW = String.raw`(?:${wordForm('משיק', 'tangent')})`;
/** Bisector keyword — the grammar's alternation, moved here from parse.ts's `BISECTOR_KW` (#361, ADR-501):
 *  the bare Hebrew stem `חוצ` reaches חוצה / חוצי / חוצים / חוצות, and English `bisector`. The honesty gate's
 *  VERB form (`חוצה`/`bisects` with the derivation family) is composed separately through {@link heWord} /
 *  {@link enWord} in `VERB_GATES`, where the boundary discipline matters; this is the RULE keyword. */
export const BISECT_KW = String.raw`bisector|חוצ`;

/**
 * The CEVIAN role nouns — altitude, median, angle bisector — as one atom (#1904, ADR-604). ADR-430's construct-noun
 * gate composes them into `CONSTRUCT_NOUNS`, and the honesty battery's role-word member reads them per OCCURRENCE
 * (`src/app/unreadRoles.ts`). Bare alternations: a caller adds its own boundaries and clitics.
 */
export const CEVIAN_NOUNS_HE = String.raw`גובה|גבהי|תיכו[ןנ]|חוצ[הת]?[-\s]?זו?וית`;
export const CEVIAN_NOUNS_EN = String.raw`altitude|height|median|bisect\w*`;

/**
 * THE THROUGH-CLAUSE OPENERS (#2532, [ADR-765](../../docs/06-decisions.md#adr-765)) — the words that open an incidence
 * phrase on a carrier: «[ה|ש|ו]עובר דרך/ב X», bare «דרך X», «במרכז …»; "(that) passes / passing / goes / runs through X",
 * bare "through X". The honesty battery's incidence-phrase member reads them per OCCURRENCE (`src/app/unreadThrough.ts`).
 * The VERB forms are the narrower atom: a bare «דרך» / "through" is also a fronted locative a rule may tolerate
 * («דרך הנקודה C העבירו משיק»), so only the verb opener is ever deleted alone. The `_HE` / `_EN` atoms are bare
 * alternations; `THROUGH_OPEN` / `THROUGH_VERB` carry the boundaries.
 */
export const THROUGH_VERB_HE = String.raw`[ושה]{0,2}עוב(?:ר|רת|רים|רות)\s+(?:דרך|ב-?(?=\S))`;
export const THROUGH_OPEN_HE = String.raw`${THROUGH_VERB_HE}|דרך|במרכז`;
export const THROUGH_VERB_EN = String.raw`(?:(?:that|which)\s+)?(?:pass(?:es|ing)?|go(?:es|ing)?|runs?|running)\s+through`;
export const THROUGH_OPEN_EN = String.raw`(?:(?:that|which)\s+)?(?:(?:pass(?:es|ing)?|go(?:es|ing)?|runs?|running)\s+)?through`;
/** The openers with their boundaries, both locales: no Hebrew letter before a Hebrew opener, no Latin letter around an English one. */
export const THROUGH_OPEN = String.raw`(?:(?<![א-ת])(?:${THROUGH_OPEN_HE})|${EN_START}(?:${THROUGH_OPEN_EN})${EN_END})`;
export const THROUGH_VERB = String.raw`(?:(?<![א-ת])(?:${THROUGH_VERB_HE})|${EN_START}(?:${THROUGH_VERB_EN})${EN_END})`;

/** The Hebrew copula between a subject and its predicate noun — «AM הוא חוצה זווית», «ABC היא …» (#1685/#1999,
 *  [ADR-666](../../docs/06-decisions.md#adr-666)). One atom: `frame.ts` and the cevian subject read it. Bare alternation. */
export const COPULA_HE = String.raw`(?:הוא|היא|הנו|הינו|הינה)`;

/**
 * THE SUBJECT OF A NAMED CEVIAN (#1685/#1999, [ADR-666](../../docs/06-decisions.md#adr-666)): two labels (captured), then
 * an optional copula — «הוא/היא/הינו», English "is" — then an optional article («ה», "the", "a", "an"). One atom for
 * every reader that names its segment before the role word (the bisector's subject and `bisectorLine`'s deferral
 * guard, the altitude's name-first head), so the copula is read in all of them or none. A caller appends the role.
 */
export const CEVIAN_SUBJECT = String.raw`\b(${LABEL})\s*(${LABEL})\b\s*(?:${COPULA_HE}\s+|is\s+)?(?:(?:the|an?)\s+|ה)?`;

// ── Gate-neutral vocabulary (#497 — the fail-closed leftover gate) ───────────────────────────────
/** Hebrew tokens a shape rule may legitimately leave unconsumed: bare connectives/copulas a construct
 *  sentence wraps around its nouns, plus the convexity adjectives a POST-PASS (`withStatedConvexity`),
 *  not the claiming rule, consumes («דלתון קמור»). Everything else that survives a rule's own
 *  vocabulary + labels is CONTENT — unknown words included, which is the point: the gate fails
 *  CLOSED. Growing this list costs an unnecessary LLM escalation; growing the old denylist's gaps
 *  cost a WRONG figure under a green ✓. */
export const NEUTRAL_HE_WORDS = String.raw`של|עם|גם|הוא|היא|זה|זו|כך|אז|אחר(?:ת|ים|ות)?|קמור(?:ה|ים|ות)?|קעור(?:ה|ים|ות)?`;
/** The English twin — FILLER/REQUEST_WORDS (parse.ts) are stripped before the gate tokenizes, so only
 *  the post-pass adjectives and the request/copula words those regexes lack belong here. */
export const NEUTRAL_EN_WORDS = String.raw`convex|concave|sketch|construct|let|be|another|other|whose`;

/** Compile an atom-composed fragment case-insensitively (the parser's convention). */
export const rx = (fragment: string, flags = 'i'): RegExp => new RegExp(fragment, flags);
