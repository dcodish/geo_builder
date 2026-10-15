/**
 * THE SENTENCE FRAME — 2-D's copy of analytic's frame chokepoint (#1676, [ADR-630](../../docs/06-decisions.md#adr-630)).
 *
 * An exam prints its givens inside a textbook frame: «בסרטוט שלפניך מתואר משולש ABC», «O – מרכז המעגל», «המרובע
 * ABCD הוא טרפז (AB ∥ CD)», «המרובע ABCD מלבן». Each is a sentence whose GEOMETRY 2-D already reads in its canonical
 * spelling («משולש ABC», «O מרכז המעגל», «טרפז ABCD (AB ∥ CD)», «מלבן ABCD»), refused for the wrapper around it —
 * and a wrapper a rule was not taught misses every rule at once. Analytic closed the class at ONE boundary
 * (`src-analytic/parser/frameAnalytic.ts`, #1618, ADR-AG-187); this is the same shape for the families those rows
 * print, copied, never imported (BOUNDARIES.json — product trees never import each other). It is the second copy;
 * 3-D's need is parked (#1679, #1888), so a third copy moves the pure part to `shell/`.
 *
 * Pure TEXT → TEXT. It runs inside `normalizeUtterance`, the one boundary every rule AND every honesty gate reads,
 * so a framed line is the canonical sentence for all of them: what the frame removes is never a "dropped" word.
 * Every rewrite is anchored on the whole line and yields a sentence 2-D already reads; anything else is left as
 * typed. The line STORED is always the one the student typed.
 */
import { SHAPE_NOUN_WORDS, readShapePhrase, type ShapeNoun } from './shapePhrase';
import { COPULA_HE } from './lexicon'; // #1999 (ADR-666): the one copula atom

/** The figure, as the exam refers to it — «הסרטוט», «בציור שלפניכם», «האיור». */
const FIGURE = String.raw`(?:ה)?(?:ציור|סרטוט|שרטוט|איור)(?:\s+ש?לפני(?:ך|כם|כן))?`;

/**
 * The wrapper: what states nothing and comes off the line.
 * - «בסרטוט שלפניך מתואר משולש ABC» — the figure that introduces the sentence.
 * - «O – מרכז המעגל», «O - מרכז המעגל» — a dash between a name and its description: «O מרכז המעגל».
 */
const UNWRAP: ReadonlyArray<[RegExp, string]> = [
  [new RegExp(String.raw`^ב${FIGURE}\s+(?:מתוא(?:ר|רת|רים|רות)\s+)?(?=\S)`), ''],
  [/^([A-Z]\d*)\s+[–—-]\s+(?=[א-ת])/, '$1 '],
];

/** One letter-run subject: three or four vertex labels. */
const LETTERS = String.raw`((?:[A-Z]\d*){3,4})`;
const NOUN_HE = String.raw`(?:משולש|ריבוע|מלבן|מעוין|דלתון|טרפז|מקבילית|מרובע)`;
const NOUN_EN = String.raw`(?:triangle|square|rectangle|rhombus|kite|trapezoid|trapezium|parallelogram|quadrilateral)`;

/** «… (AB ∥ CD)» at the end of the line, set off by a space: the head, and the parenthetical as typed. */
function trailingParen(s: string): { head: string; paren: string } {
  if (!s.endsWith(')')) return { head: s, paren: '' };
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    if (s[i] === ')') depth += 1;
    if (s[i] === '(') depth -= 1;
    if (depth === 0) return i > 0 && s[i - 1] === ' ' ? { head: s.slice(0, i).trim(), paren: ` ${s.slice(i)}` } : { head: s, paren: '' };
  }
  return { head: s, paren: '' };
}

const nounOf = (word: string | undefined): ShapeNoun | null => {
  if (!word) return null;
  const n = (Object.keys(SHAPE_NOUN_WORDS) as ShapeNoun[]).find((k) => new RegExp(`^(?:${SHAPE_NOUN_WORDS[k]})$`, 'i').test(word));
  return n ?? null;
};

/**
 * THE SHAPE AS A PREDICATE — «המרובע ABCD הוא טרפז», «המרובע ABCD מלבן», «המרובע ABCO הוא טרפז ישר זווית», "the
 * quadrilateral ABCD is a trapezoid" — is the same fact as the noun-first form («טרפז ABCD»), and that is the
 * sentence it is read as (analytic's `shapeClauses`). The predicate must be a WHOLE shape phrase the one phrase
 * reader (`readShapePhrase`, ADR-595) lowers with nothing left over; a subject noun is the predicate's own noun or
 * the generic «מרובע» it narrows (four letters), or it completes a bare adjective («המשולש ABC הוא ישר זווית»). The
 * copula may be dropped only when the subject noun is there. Anything else — an unknown word, a noun that does not
 * fit the letters — is not this frame, and the line is left as typed.
 */
function shapePredicate(line: string): string | null {
  const { head, paren } = trailingParen(line);
  const he =
    new RegExp(String.raw`^(?:ה?(${NOUN_HE})\s+)?${LETTERS}\s+${COPULA_HE}\s+(.+)$`).exec(head) ??
    new RegExp(String.raw`^ה?(${NOUN_HE})\s+${LETTERS}\s+(?!${COPULA_HE}\s)(.+)$`).exec(head);
  // No /i: under it the uppercase label run would read a lowercase word as letters (the #779 convention).
  const en = he ? null : new RegExp(String.raw`^(?:[Tt]he\s+)?(?:(${NOUN_EN})\s+)?${LETTERS}\s+is\s+(?:a|an)\s+(.+)$`).exec(head);
  const m = he ?? en;
  if (!m) return null;
  const [, subjectWord, letters, predicate] = m;
  const subject = nounOf(subjectWord);
  const own = readShapePhrase(predicate);
  // A bare adjective takes the subject noun («המשולש ABC הוא ישר זווית» → «משולש ישר זווית ABC»).
  const phraseText = own && !own.noun && subjectWord ? `${subjectWord} ${predicate}` : predicate;
  const phrase = own && !own.noun && subjectWord ? readShapePhrase(phraseText) : own;
  if (!phrase || !phrase.noun || phrase.unconsumed.length) return null;
  if (phrase.strip(phraseText).trim() !== '') return null; // the predicate is the phrase and nothing more
  const count = letters.match(/[A-Z]\d*/g)?.length ?? 0;
  if (count !== phrase.arity) return null;
  if (subject && subject !== phrase.noun && !(subject === 'quad' && phrase.arity === 4)) return null;
  return `${phraseText.trim()} ${letters}${paren}`;
}

/** The exam's frame, read off one (already orthographic) line: the canonical sentence, or the line unchanged. */
export function readFrame(s: string): string {
  let out = s;
  for (const [from, to] of UNWRAP) out = out.replace(from, to);
  return shapePredicate(out) ?? out;
}
