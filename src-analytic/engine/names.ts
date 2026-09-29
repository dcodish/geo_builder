/**
 * ONE ANSWER TO "WHAT DOES THIS ID CALL ITSELF TO A STUDENT" — and one numeral per curve name
 * (#1514 pre-play, ADR-AG-170 Amendment 1).
 *
 * Two defects of one family lived in hand-written copies of this knowledge:
 *
 *  - **The noun and name** a refusal prints were decided by `refKindOf`/`statedName` in `apply.ts`,
 *    which knew `line-` and `circle-` only. When #1271 let a parabola carry a name, the new
 *    `parabola-I` id fell through both: «P על הפרבולה I» on an empty canvas answered
 *    «הנקודה parabola-I עדיין לא הוגדרה» — the wrong noun AND the raw internal id.
 *  - **The numeral** a curve is named by was turned into an id verbatim at the mint sites
 *    (`circle-1`, `parabola-1`) and through `asRoman` at one reference site (#1429's circle operand),
 *    so «נתון מעגל 1 …» then «P על המעגל 1» referred to a circle that did not exist. Since the
 *    operator's 2026-09-29 ruling (Am. 2) the id keeps the student's notation, «1» and «I» are one
 *    NAME (`numeralKey`), and mixing the two notations is refused (`numeralTwin`).
 *
 * Both are now decided HERE, from one table, and every site asks. A new prefixed kind is one row.
 */
import type { Id } from './types';

/** What a refusal may call an object — the noun family the locale renders (#1179). */
export type RefKind = 'point' | 'line' | 'circle' | 'parabola' | 'ellipse' | 'curve';

/**
 * Every PREFIXED id the parser mints, and what it is to the student. ORDER MATTERS: the longer
 * prefix first, so `circle-at-O` is the circle on the centre O and never «at-O».
 *
 * `named: false` is the anonymous curve: its id is a content hash with no name the student wrote,
 * so there is nothing true to print for it and the id is left alone (the kind-free wording).
 */
const ID_KINDS: ReadonlyArray<{ prefix: string; kind: RefKind; named: boolean }> = [
  { prefix: 'circle-at-', kind: 'circle', named: true },
  { prefix: 'circle-thru-', kind: 'circle', named: true },
  { prefix: 'line-', kind: 'line', named: true },
  { prefix: 'circle-', kind: 'circle', named: true },
  { prefix: 'parabola-', kind: 'parabola', named: true },
  { prefix: 'ellipse-', kind: 'ellipse', named: true },
  { prefix: 'curve-', kind: 'curve', named: false },
];

const rowOf = (id: Id) => ID_KINDS.find((r) => id.startsWith(r.prefix));

/** The kind of object an id names, read from the prefix the parser minted. A bare id is a point. */
export function refKindOf(id: Id): RefKind {
  return rowOf(id)?.kind ?? 'point';
}

/**
 * The name the student WROTE, from the id the parser minted (#1145, #1150): «I» for `circle-I`,
 * «l7» for `line-l7`, «I» for `parabola-I`. CLAUDE.md, *Honesty invariants*: an error names the
 * student's statement, never internal state. The identity on a point id; an anonymous curve's hash
 * is left alone (there is no student name to recover).
 */
export function statedName(id: Id): string {
  const row = rowOf(id);
  return row && row.named ? id.slice(row.prefix.length) : id;
}

/** The curve kinds a student names by a NUMERAL — «ישר 1», «מעגל I», «פרבולה 2», «אליפסה II». */
export type NumeralKind = 'line' | 'circle' | 'parabola' | 'ellipse';

/**
 * THE NUMERAL TABLE — one row per name, its digit and its Roman spelling (operator ruling
 * 2026-09-29, ADR-AG-170 Am. 2). Every numeral token in the grammar is built from it, so every digit
 * a name slot accepts has its Roman twin and vice versa (before: lines took 1–9 but Romans stopped
 * at V; circles took 1–5).
 */
const NUMERALS: ReadonlyArray<readonly [digit: string, roman: string]> = [
  ['1', 'I'], ['2', 'II'], ['3', 'III'], ['4', 'IV'], ['5', 'V'],
  ['6', 'VI'], ['7', 'VII'], ['8', 'VIII'], ['9', 'IX'],
];
const ROMAN_OF_DIGIT: Readonly<Record<string, string>> = Object.fromEntries(NUMERALS);
const DIGIT_OF_ROMAN: Readonly<Record<string, string>> = Object.fromEntries(NUMERALS.map(([d, r]) => [r, d]));

/** The Roman spellings as a regex alternation, LONGEST FIRST (so an unanchored use never stops at «I» of «II»). */
export const ROMAN_ALT = [...NUMERALS].map(([, r]) => r).sort((a, b) => b.length - a.length).join('|');
/** Every numeral spelling — Roman or digit — as a regex alternation. */
export const NUMERAL_ALT = `${ROMAN_ALT}|[1-9]`;
const NUMERAL_RE = new RegExp(`^(?:${NUMERAL_ALT})$`);

export const asRoman = (n: string): string => ROMAN_OF_DIGIT[n] ?? n;
/** Is this token a curve's NUMERAL name («1», «I», «VII») — the one answer every reader asks. */
export const isNumeralName = (token: string): boolean => NUMERAL_RE.test(token);
const isDigitNumeral = (n: string) => n in ROMAN_OF_DIGIT;

/**
 * THE id of a numeral-named curve — minted and referenced through this one function.
 *
 * It keeps the student's OWN notation (`line-1`, `circle-I`): the operator ruled (2026-09-29) that
 * «1» and «I» are the same NAME and that MIXING the two is refused with a note, not silently merged —
 * and a refusal that must say "you wrote I, this figure calls it 1" needs the notation in use kept on
 * the object. Identity across notations is `numeralKey`'s job; the notation is the id's.
 */
export function numeralCurveId(kind: NumeralKind, numeral: string): Id {
  return `${kind}-${numeral}`;
}

/** The notation-free identity of a numeral-named curve id («line-1» and «line-I» → `line-I`); null for any other id. */
export function numeralKey(id: Id): string | null {
  const m = /^(line|circle|parabola|ellipse)-(.+)$/.exec(id);
  if (!m || !NUMERAL_RE.test(m[2])) return null;
  return `${m[1]}-${asRoman(m[2])}`;
}

/**
 * The object already named by the SAME numeral in the OTHER notation — «ישר 1» when the sentence says
 * «ישר I» — or undefined. The one check behind ruling 2, asked wherever a numeral name is minted or
 * fails to resolve.
 */
export function numeralTwin(ids: Iterable<Id>, id: Id): Id | undefined {
  const key = numeralKey(id);
  if (!key) return undefined;
  for (const other of ids) if (other !== id && numeralKey(other) === key) return other;
  return undefined;
}

/** The other notation of a numeral («1» ↔ «I»), for tests and messages. */
export const otherNotation = (n: string): string => (isDigitNumeral(n) ? ROMAN_OF_DIGIT[n] : (DIGIT_OF_ROMAN[n] ?? n));
