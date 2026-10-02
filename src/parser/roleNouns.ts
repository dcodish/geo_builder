/**
 * #1661 ([ADR-563](../../docs/06-decisions.md#adr-563)) — THE ROLE-NOUN REGISTRY.
 *
 * A role noun names a piece AND says what the piece is: «המיתר BC» is the segment BC *and* the claim
 * that B and C lie on the circle; «הקוטר BC» adds that BC passes through the centre; «היתר AB» says
 * the angle opposite AB is right. The grammar has many rules that tolerate such a noun in front of a
 * pair (the relation rules' `CARRIER_PRE`, the meet rules' fillers, the length rules' lenient strip, …)
 * and each rule re-spelled its own subset of the nouns. Whichever rule won the first-match race decided
 * whether the claim survived — and a relation rule, which only understands plain segments, dropped it.
 *
 * So the vocabulary lives here ONCE, and {@link roleOperands} reads, from the utterance's own words,
 * which pair each role noun is attached to. `parse.ts`'s `withRoleClaims` post-pass lowers every operand
 * this returns, after whichever rule won — so no rule can read the noun and drop what it asserts: the
 * claim is stated, or the sentence is refused. The analytic Builder's sibling registry is
 * `STRAIGHT_NOUNS` (ADR-AG-200); the trees share no code (BOUNDARIES.json), only the semantics.
 *
 * Lexical layer only: no geometry, no context. Pure over the string.
 */
import { LABEL, ULABEL } from './lexicon';

/** What a role noun asserts about its pair. Lowered in `parse.ts` (`withRoleClaims`). */
export type RoleNoun = 'chord' | 'diameter' | 'radius' | 'tangent' | 'leg' | 'base' | 'hypotenuse';

interface RoleRow {
  role: RoleNoun;
  /** Hebrew stem (singular) and plural, matched as WHOLE words (clitic prefixes allowed, see {@link HE_PRE}). */
  he: string;
  hePlural?: string;
  en: string;
  enPlural?: string;
  /**
   * Whether the PREDICATE order «XY מיתר» / "XY is a chord" also binds. Only for the circle roles, whose
   * predicate sentences 2-D reads (`chord`, `diameter`); «BC בסיס» is an orientation wish (#352), «AB
   * משיק» is the segment-tangency rule's own sentence, and «AB היתר» is not 2-D grammar.
   */
  labelsFirst: boolean;
}

/**
 * The registry. Order matters only for readability — every row is matched as a whole word, so «מיתר»
 * (chord) is never read as «יתר» (hypotenuse) with a «מ» clitic: «מ» is admitted only before «ה»
 * ({@link HE_PRE}).
 *
 * Not here, on purpose: «תיכון» / «גובה» (median / altitude) — 2-D's cevian rules own those sentences
 * and a cevian named as an operand («התיכון AD = 5») is not grammar today (it escalates); «ניצב» (a
 * right triangle's leg) — no 2-D sentence reads it as an operand.
 */
export const ROLE_NOUNS: readonly RoleRow[] = [
  { role: 'chord', he: 'מיתר', hePlural: 'מיתרים', en: 'chord', enPlural: 'chords', labelsFirst: true },
  { role: 'diameter', he: 'קוטר', hePlural: 'קוטרים', en: 'diameter', enPlural: 'diameters', labelsFirst: true },
  { role: 'radius', he: 'רדיוס', hePlural: 'רדיוסים', en: 'radius', enPlural: 'radii', labelsFirst: false },
  { role: 'tangent', he: 'משיק', en: 'tangent', labelsFirst: false },
  { role: 'leg', he: 'שוק', en: 'leg', labelsFirst: false },
  { role: 'base', he: 'בסיס', en: 'base', labelsFirst: false },
  { role: 'hypotenuse', he: 'יתר', en: 'hypotenuse', labelsFirst: false },
];

/** Hebrew clitics in front of a role noun: «ו»/«ש», then «ל»/«ב»/«כ» or «מ» (only before «ה» — so «מיתר»
 *  is never «מ+יתר»), then the article «ה». */
const HE_PRE = String.raw`(?<![א-ת])(?:[וש])?(?:[לבכ]|מ(?=ה))?ה?`;
const HE_END = String.raw`(?![א-ת])`;
/** One Hebrew-side pair («BC», «B C», «A1B1») and the English-side pair (uppercase only, so "is"/"as"
 *  after an English noun is never read as two labels). Bounded on both sides so «ABC» never yields «BC». */
const pairOf = (label: string): string => String.raw`(?<![A-Za-z\d])(${label})\s*(${label})(?![A-Za-z\d])`;
const HE_PAIR = pairOf(LABEL);
const EN_PAIR = pairOf(ULABEL);
/** A list joiner between pairs: «AB ו-CD», «AB, CD», "AB and CD". */
const HE_JOIN = String.raw`\s*(?:,\s*|\s+ו-?\s*|\s*ו-\s*)`;
const EN_JOIN = String.raw`\s*(?:,\s*(?:and\s+)?|\s+and\s+)`;

export interface RoleOperand {
  role: RoleNoun;
  a: string;
  b: string;
  /** The noun as the student typed it (with its clitics) — what a refusal quotes back. */
  noun: string;
}

const up = (x: string): string => x.toUpperCase();

/** Every pair in a list starting at the head of `tail` («AB ו-CD …»), bounded by `pair` / `join`. */
function pairList(tail: string, pair: string, join: string): [string, string][] {
  const out: [string, string][] = [];
  const first = new RegExp(String.raw`^\s*${pair}`).exec(tail);
  if (!first) return out;
  out.push([up(first[1]), up(first[2])]);
  let rest = tail.slice(first[0].length);
  for (;;) {
    const m = new RegExp(String.raw`^${join}${pair}`).exec(rest);
    if (!m) break;
    out.push([up(m[1]), up(m[2])]);
    rest = rest.slice(m[0].length);
  }
  return out;
}

/** Every pair in a list ENDING at the tail of `head` («AB ו-CD» before «מיתרים»). */
function pairListBefore(head: string, pair: string, join: string): [string, string][] {
  const m = new RegExp(String.raw`(${pair.replace(/\((?!\?)/g, '(?:')}(?:${join}${pair.replace(/\((?!\?)/g, '(?:')})*)\s*$`).exec(head);
  if (!m) return [];
  return pairList(m[1], pair, join);
}

/**
 * The role operands an utterance states: each role noun from {@link ROLE_NOUNS} together with the pair(s)
 * the WORDS attach it to — «<noun> XY» (and a plural list «המיתרים AB ו-CD»), plus, for rows with
 * `labelsFirst`, the predicate «XY <noun>» / «AB ו-CD מיתרים» / "XY is a chord". A noun with no adjacent
 * pair («קוטר המעגל», «הקוטר היוצא מ-F», «מעגל בקוטר 10») binds nothing — the rule that owns that sentence
 * models its own semantics. Deduplicated per (role, unordered pair).
 */
export function roleOperands(s: string): RoleOperand[] {
  const out: RoleOperand[] = [];
  const seen = new Set<string>();
  const push = (role: RoleNoun, noun: string, [a, b]: [string, string]): void => {
    const key = `${role}:${[a, b].sort().join('|')}`;
    if (a === b || seen.has(key)) return;
    seen.add(key);
    out.push({ role, a, b, noun: noun.trim() });
  };
  for (const row of ROLE_NOUNS) {
    const heNoun = row.hePlural ? `(?:${row.hePlural}|${row.he})` : row.he;
    const enNoun = row.enPlural ? `(?:${row.enPlural}|${row.en})` : row.en;
    const forms: { noun: RegExp; pair: string; join: string; copula: string }[] = [
      { noun: new RegExp(String.raw`${HE_PRE}${heNoun}${HE_END}`, 'g'), pair: HE_PAIR, join: HE_JOIN, copula: String.raw`(?:\s+(?:הוא|היא|הם|הן))?` },
      { noun: new RegExp(String.raw`(?<![A-Za-z])(?:the\s+|a\s+)?${enNoun}(?![A-Za-z])`, 'gi'), pair: EN_PAIR, join: EN_JOIN, copula: String.raw`(?:\s+(?:is|are)(?:\s+(?:a|the))?)?` },
    ];
    for (const f of forms) {
      for (const m of s.matchAll(f.noun)) {
        const at = m.index ?? 0;
        for (const p of pairList(s.slice(at + m[0].length), f.pair, f.join)) push(row.role, m[0], p);
        if (row.labelsFirst) {
          const head = s.slice(0, at).replace(new RegExp(`${f.copula}\\s*$`, 'i'), '');
          for (const p of pairListBefore(head, f.pair, f.join)) push(row.role, m[0], p);
        }
      }
    }
  }
  return out;
}
