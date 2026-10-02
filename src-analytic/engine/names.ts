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

/**
 * A CIRCLE NAMED BY WHAT IT IS TO A RING (#1663, ADR-AG-203) — «המעגל החוסם את המשולש ABC» (the circle through
 * every vertex) and «המעגל החסום במשולש ABC» (the circle tangent to every side). A computed circle has no letter
 * and no equation of its own, so among several circles these descriptions were the only way to name it, and no
 * sentence read them. The frame folds each description to a NAME in the circle-name slot every circle sentence
 * already has («על המעגל _», «מרכז המעגל _», «משיק למעגל _», «מיתר במעגל _», «קוטר במעגל _», …), and M1
 * resolves the name through the one name chain (`circleByName`) against what the figure STATES — the vertices on
 * the circle, the sides tangent to it — never against how the circle happened to be built.
 *
 * The name is spelled the way the data panel already writes these circles (`openCurveText`): «⊙ABC» through the
 * points, «○ABC» inscribed in the ring. Not a letter the student could have typed for a point, so it can never
 * collide with a centre letter or a numeral.
 */
export type DescribedCircle = { role: 'circum' | 'in'; pts: Id[] };
const DESCRIBED_MARK = { circum: '⊙', in: '○' } as const;
const POINT_TOKEN = '[A-Z][0-9₀-₉]?';
/** The regex atom for a described-circle name, for the parser's circle-name slots. */
export const DESCRIBED_CIRCLE_ALT = `[⊙○](?:${POINT_TOKEN}){3,4}`;
const DESCRIBED_RE = new RegExp(`^([⊙○])((?:${POINT_TOKEN}){3,4})$`);
export const describedCircleName = (role: DescribedCircle['role'], pts: readonly Id[]): string =>
  `${DESCRIBED_MARK[role]}${pts.join('')}`;
export function readDescribedCircle(name: string): DescribedCircle | null {
  const m = DESCRIBED_RE.exec(name);
  if (!m) return null;
  return { role: m[1] === '⊙' ? 'circum' : 'in', pts: m[2].match(new RegExp(POINT_TOKEN, 'g')) ?? [] };
}

/**
 * THE id of a named LINE — every line name the grammar reads: a numeral («ישר 1» → `line-1`), a
 * letter name («l3» → `line-l3`) or a two-point run («AB» → `line-AB`) (#1529, ADR-AG-179). For a
 * numeral it is exactly `numeralCurveId('line', n)`; the point is that no site spells the prefix itself,
 * so a guard can hold every curve-name id to this file.
 */
export const lineIdOf = (name: string): Id => numeralCurveId('line', name);

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

/** The line NOUN a numeral-named line is called by, per language — «ישר 1» / «line 1». */
const LINE_NOUN = { he: 'ישר', en: 'line' } as const;
const LINE_NOUN_RE = new RegExp(`^(?:${Object.values(LINE_NOUN).join('|')})\\s+`);

/**
 * How a numeral-named line is CALLED — «ישר 1» / «line 1» — the #1216 circle precedent («מעגל 1»),
 * so the panel row reads the way the exam does and the student's own token still resolves (the id is
 * `line-1`, and every by-name lookup matches the id as well as the name). Lifted from the parser
 * (#1350) so `nameReading` can invert it from the same table.
 */
export const lineNameOf = (token: string, lang: 'he' | 'en'): string =>
  isNumeralName(token) ? `${LINE_NOUN[lang]} ${token}` : token;

/** A line name with its noun stripped — «ישר 3» → «3», «line 3» → «3», «l3» unchanged (#1350). */
export const bareLineName = (name: string): string => name.replace(LINE_NOUN_RE, '');

/**
 * WHAT A LINE'S NAME READS AS TO A STUDENT (#1350, ADR-AG-183) — the notation-free numeral behind it,
 * or null for a name that reads only as itself.
 *
 * The grammar has two naming schemes for one idea: the Latin line letter with an index («l3», «ℓ3») and
 * the exam's numeral («ישר 3», ADR-AG-144). They are different TOKENS — different ids, and every
 * reference resolves to its own line — but a student reads «l3» and «ישר 3» as the same name, because
 * `ℓ` is the conventional letter for a line. So the comparison is made on what the name READS as:
 *
 *   «l3», «ℓ3», «3», «ישר 3», «line 3», «III»  →  `III`   (one reading, the numeral table's key)
 *   «AB», «l», «m3», «k1»                        →  null    (their own names; nothing to confuse)
 *
 * The narrow reading is `lN ⇄ N` by operator ruling (2026-09-22): `l` is the line letter, and `m3` or
 * `k1` read as their own names. A future scheme joins by teaching THIS function, never by a pair table.
 * The numeral half is `asRoman`, the same key `numeralKey` uses — so «1» and «I» read alike here too,
 * although that pair never reaches this question: mixing notations is refused first (`numeralTwin`).
 */
export function nameReading(name: string): string | null {
  const bare = bareLineName(name);
  const lettered = /^[ℓl]([1-9])$/.exec(bare);
  const numeral = lettered ? lettered[1] : isNumeralName(bare) ? bare : null;
  return numeral ? asRoman(numeral) : null;
}
