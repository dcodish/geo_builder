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
 *    so «נתון מעגל 1 …» then «P על המעגל 1» referred to a circle that did not exist.
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

/** The curve kinds a student names by a NUMERAL — «מעגל I», «פרבולה 2», «אליפסה II». */
export type NumeralKind = 'circle' | 'parabola' | 'ellipse';

/**
 * «1» and «I» are ONE name (ADR-AG-168's circle policy, the #1257 plan's arm A, widened here to every
 * numeral-named curve): the exam writes either, and a student who declares «פרבולה 1» and later
 * says «הפרבולה I» means the same parabola. The canonical form is the Roman numeral; the LABEL keeps
 * the student's own spelling, so the panel still prints what they typed.
 */
const ROMAN_OF_DIGIT: Readonly<Record<string, string>> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V' };
export const asRoman = (n: string): string => ROMAN_OF_DIGIT[n] ?? n;

/** THE id of a numeral-named curve — minted and referenced through this one function. */
export function numeralCurveId(kind: NumeralKind, numeral: string): Id {
  return `${kind}-${asRoman(numeral)}`;
}
