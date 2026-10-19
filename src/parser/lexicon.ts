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

import { UNGLUED } from '../../shell/indexedName';

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

/**
 * [ADR-632](../../docs/06-decisions.md#adr-632) (#172), made total by [ADR-635](../../docs/06-decisions.md#adr-635)
 * (#2008) — a Unicode VULGAR-FRACTION glyph spelled as the digits the number readers understand. A glyph carries
 * no digit, so every reader that looks for a number found none and fell back to its default: «שטח EFGH = ¼ משטח
 * ABCD» committed ratio 1, green, and «∠A = 22½°» drew 22°. Applied ONCE, at the parser boundary
 * (`normalizeUtterance`), so every rule AND every honesty gate reads the digits — a glyph some reader still drops
 * is then a dropped number that escalates, never a value that vanishes.
 *
 *  - the WHOLE Unicode block (½ ⅓ ⅔ ¼ ¾ ⅕ ⅖ ⅗ ⅘ ⅙ ⅚ ⅐ ⅛ ⅜ ⅝ ⅞ ⅑ ⅒);
 *  - a MIXED number («2½», «2 ½», «22½°») is ONE number: the exact decimal when the fraction terminates
 *    («2½» → `2.5`), else the improper fraction («2⅓» → `7/3`) — analytic's «10½» = 10.5 precedent, made total;
 *  - a lone glyph is `a/b` (the ADR-632 spelling), parenthesised under a root («√½» → `√(1/2)`, never `(√1)/2`)
 *    and kept apart from a glued letter or digit on either side;
 *  - a glyph multiplying a root moves below it («½√3» → `√3/2`, «¾√3» → `3√3/4`): the number grammar reads `1/2√3` as 1/(2√3).
 */
const VULGAR: Record<string, readonly [number, number]> = {
  '½': [1, 2], '⅓': [1, 3], '⅔': [2, 3], '¼': [1, 4], '¾': [3, 4], '⅕': [1, 5], '⅖': [2, 5], '⅗': [3, 5], '⅘': [4, 5],
  '⅙': [1, 6], '⅚': [5, 6], '⅐': [1, 7], '⅛': [1, 8], '⅜': [3, 8], '⅝': [5, 8], '⅞': [7, 8], '⅑': [1, 9], '⅒': [1, 10],
};
const VULGAR_GLYPH = `[${Object.keys(VULGAR).join('')}]`;
/** A fraction whose denominator has no prime factor but 2 and 5 has an exact decimal. */
const terminates = (d: number): boolean => {
  let x = d;
  for (const p of [2, 5]) while (x % p === 0) x /= p;
  return x === 1;
};
const MIXED_FRACTION = new RegExp(String.raw`${UNGLUED}(\d+) ?(${VULGAR_GLYPH})`, 'g');
const RADICAL_TIMES_FRACTION = new RegExp(String.raw`(${VULGAR_GLYPH})\s*[*·]?\s*√\s*(\([^()]*\)|\d+(?:\.\d+)?)`, 'g');
const LONE_FRACTION = new RegExp(String.raw`(√\s*)?(${VULGAR_GLYPH})`, 'g');
export const spellVulgarFractions = (s: string): string =>
  s
    .replace(MIXED_FRACTION, (_m, whole: string, g: string) => {
      const [n, d] = VULGAR[g];
      const w = parseInt(whole, 10);
      return terminates(d) ? String(w + n / d) : `${w * d + n}/${d}`;
    })
    // a glyph COEFFICIENT of a radical: «½√3» is √3/2, so it is spelled «√3/2» — never «1/2√3», which the
    // number grammar (ADR-298) rightly reads as 1/(2√3)
    .replace(RADICAL_TIMES_FRACTION, (_m, g: string, radicand: string) => {
      const [n, d] = VULGAR[g];
      return `${n === 1 ? '' : n}√${radicand}/${d}`;
    })
    .replace(LONE_FRACTION, (_m, root: string | undefined, g: string, at: number, all: string) => {
      const [n, d] = VULGAR[g];
      if (root) return `${root}(${n}/${d})`;
      const before = /[\p{L}\d.]/u.test(all[at - 1] ?? '') ? ' ' : '';
      const after = /[\d.]/.test(all[at + 1] ?? '') ? ' ' : '';
      return `${before}${n}/${d}${after}`;
    });

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

// ── Keywords (bilingual, morphology handled ONCE) ────────────────────────────────────────────────
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

/** A Hebrew stem plus its own inflection, bounded: matches the word and its forms, never inside a
 *  longer word. NO capture group — wrap at the use site. */
export const heWord = (stem: string): string => String.raw`(?:${stem})${HE_SUFFIX}${HE_END}`;
/** The English twin. `suffix` is per-word because English derivation is not uniform: `bisect` must
 *  still reach `bisector`, while `parallel` must NOT reach `parallelogram`. */
export const enWord = (stem: string, suffix = String.raw`s?`): string => String.raw`(?:${stem})(?:${suffix})${EN_END}`;
/**
 * A bilingual WORD-form keyword — {@link heWord} | {@link enWord}, the shape every atom below uses.
 *
 * The honesty battery's `VERB_GATES` (`parse.ts`) composes through these same helpers, which is what
 * makes #771's class closed rather than its one row fixed: one boundary rule, one place.
 */
export const wordForm = (he: string, en: string, enSuffix = String.raw`s?`): string =>
  String.raw`${heWord(he)}|${enWord(en, enSuffix)}`;

/** The angle noun — single-vav and double-vav spellings (the ADR-3D-032 class: `זוית` keystrokes are
 *  as common as the full `זווית`), plus the symbol and the English word. The stem stops before the
 *  ת so {@link HE_SUFFIX} supplies both the singular (`זווית`) and the plural (`זוויות`). */
export const ANGLE_KW = String.raw`(?:∠|${wordForm(String.raw`זו?וי`, 'angle')})`;
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
