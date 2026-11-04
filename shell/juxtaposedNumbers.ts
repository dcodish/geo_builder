/**
 * TWO NUMBERS WITH ONLY WHITESPACE BETWEEN THEM (#2286, [ADR-AG-397](../docs/06c-decisions-analytic.md#adr-ag-397)) —
 * the one detector every builder asks before its grammar and before the model.
 *
 * An expression reader that takes implicit multiplication read «2 3» as 2·3 = 6 in every slot a number is read in, so
 * «A(2 3, 1)» drew A at (6, 1), green, for a value the student never stated (analytic; complex until ADR-CX-081). As
 * written the text is AMBIGUOUS: a decimal (2.3), one number with a stray space (23), or a product. Two shapes:
 *
 * - **a mixed number** — an integer, whitespace, a fraction «2 1/2» (#2222, ADR-AG-284; complex #2247). Its teaching
 *   sentence and spellings are analytic's (`MixedNumber`).
 * - **a bare pair** — any other number, whitespace, number «2 3», «2.5 3» (#2247 for complex; #2286 for analytic, and
 *   for 2-D and 3-D, operator ruling 2026-11-03: *"Refuse it, naming the line, in every builder"*).
 *
 * A NUMBER is a digit run, optionally with a decimal tail, that stands alone: a letter, digit, `_` or `.` before it
 * makes it a name's index («A1 3», «l1 2») or a decimal's tail, so it is not one. A number next to anything else —
 * «2x», «2 x», «2 √3», «2 (x+1)», «2, 3», «2*3» — is not this shape.
 *
 * Pure, product-free, returns no strings a student reads: each builder words the refusal from its own seam (the
 * sentence is the suite key `suite.refusal.juxtaposedNumbers`). Moved here from analytic's `engine/expr.ts` and
 * complex's `parser/exprParse.ts`, which held two copies kept equal by a text lock; 2-D and 3-D could import neither.
 */

/** An integer, whitespace, then a fraction — «5 1/2», «2 1 / 2». A letter glued after the denominator does not rescue it. */
export const MIXED_NUMBER_RE = /(?<![A-Za-z0-9_.])(\d+)\s+(\d+)\s*[/⁄]\s*(\d+)(?![\d.])/;

/** A standalone number, whitespace, a number — «2 3», «2.5 3». */
export const JUXTAPOSED_NUMBERS_RE = /(?<![A-Za-z0-9_.])(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/;

/** What a refused mixed number teaches: the student's text and its three unambiguous spellings. */
export interface MixedNumber {
  /** the student's own text, as typed — «5 1/2» */
  readonly text: string;
  /** the mixed number as a decimal — `5.5`; absent when the fraction does not terminate («2 1/3») */
  readonly decimal?: string;
  /** the mixed number as a sum — `5+1/2`, parenthesised after an operator so it reads the same in place («x-(5+1/2)») */
  readonly sum: string;
  /** the product reading — `5*1/2` */
  readonly product: string;
}

/** What a refused bare pair teaches: the student's text and the readings it could have meant. */
export interface NumberPair {
  /** the student's own text, as typed — «2 3» */
  readonly text: string;
  /** where the text starts in the string the caller passed */
  readonly index: number;
  /** the two numbers as typed — `2`, `3` */
  readonly a: string;
  readonly b: string;
  /** the decimal reading `2.3` and the one-number reading `23` — only when both are whole numbers */
  readonly decimal?: string;
  readonly joined?: string;
  /** the explicit product as typed, `2*3` */
  readonly product: string;
  /** the product's value, `6` — the spelling a builder whose grammar reads no `*` teaches */
  readonly value: string;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The first ASCII mixed number in `src`, or null. */
export function findMixedNumber(src: string): MixedNumber | null {
  const m = MIXED_NUMBER_RE.exec(src);
  if (!m) return null;
  const [whole, num, den] = [m[1], m[2], m[3]];
  let d = Number(den) / gcd(Number(num), Number(den));
  while (d > 1 && d % 2 === 0) d /= 2;
  while (d > 1 && d % 5 === 0) d /= 5;
  const terminates = Number(den) > 0 && d === 1;
  const afterOperator = /[-−*·×/⁄^]\s*$/.test(src.slice(0, m.index));
  const sum = `${whole}+${num}/${den}`;
  return {
    text: m[0],
    ...(terminates ? { decimal: String(Number(whole) + Number(num) / Number(den)) } : {}),
    sum: afterOperator ? `(${sum})` : sum,
    product: `${whole}*${num}/${den}`,
  };
}

function pairOf(m: RegExpExecArray | RegExpMatchArray): NumberPair {
  const [a, b] = [m[1], m[2]];
  const whole = !a.includes('.') && !b.includes('.');
  // the value is printed as a student would write it: no binary-float tail («0.1 3» is 0.3, never 0.30000000000000004)
  const value = String(Number((Number(a) * Number(b)).toPrecision(12)));
  return { text: m[0], index: m.index ?? 0, a, b, ...(whole ? { decimal: `${a}.${b}`, joined: `${a}${b}` } : {}), product: `${a}*${b}`, value };
}

/**
 * The first BARE pair in `src` — one that is not the start of a mixed number — or null. 2-D and 3-D ask this one:
 * the mixed number is #2248's to rule for them, so «AB = 2 1/2» keeps its own path there.
 */
export function findNumberPair(src: string): NumberPair | null {
  const mixed = new RegExp(MIXED_NUMBER_RE.source, 'y');
  for (const m of src.matchAll(new RegExp(JUXTAPOSED_NUMBERS_RE.source, 'g'))) {
    mixed.lastIndex = m.index ?? 0;
    if (mixed.test(src)) continue;
    return pairOf(m);
  }
  return null;
}

/** Either shape — the mixed number first, so «2 1/2» keeps its own teaching sentence wherever it appears in the line. */
export type JuxtaposedNumbers = ({ readonly kind: 'mixed' } & MixedNumber) | ({ readonly kind: 'numbers' } & NumberPair);

/** The first pair of side-by-side numbers in `src`, or null. The detector analytic's and complex's lexers and line gates share. */
export function findJuxtaposedNumbers(src: string): JuxtaposedNumbers | null {
  const mixed = findMixedNumber(src);
  if (mixed) return { kind: 'mixed', ...mixed };
  const n = JUXTAPOSED_NUMBERS_RE.exec(src);
  return n ? { kind: 'numbers', ...pairOf(n) } : null;
}

/**
 * The line with every number–space–number written as the explicit product (`2 3` → `2*3`), or null when it has none —
 * the clarification a submit seam offers for a bare pair, after parsing it (a taught remedy must drive — #1156).
 */
export function juxtaposedNumbersSpelledOut(line: string): string | null {
  const all = new RegExp(JUXTAPOSED_NUMBERS_RE.source, 'g');
  let out = line;
  let prev = '';
  // a run «2 3 4» needs two passes: the second pair starts where the first one's last number ends
  while (out !== prev) {
    prev = out;
    out = out.replace(all, '$1*$2');
  }
  return out === line ? null : out;
}

/**
 * WHAT A REFUSED BARE PAIR TEACHES, read back (#1156: a taught spelling is one the next Enter reads). `reads` is the
 * builder's own grammar over a whole line. Each reading is put IN PLACE of the pair and kept only when the line reads:
 *
 * - `readings` — the pair is one number: the decimal `2.3` and the one-number `23` (when both are whole) and the
 *   product, spelled `2*3` where the grammar reads it, else as its value `6`;
 * - `comma` — no single number fits the slot but two do («A(2 3)», a point with its comma missing): `2, 3`;
 * - when neither reads (the line has a second problem) the `readings` sentence still names the ambiguity.
 */
export type PairTeaching =
  | { readonly kind: 'readings'; readonly decimal?: string; readonly joined?: string; readonly product: string }
  | { readonly kind: 'comma'; readonly comma: string };

export function teachPair(
  line: string,
  pair: NumberPair,
  reads: (line: string) => boolean,
  /** `'value'` for a grammar that reads no `*` where its bare parser cannot say so (2-D: its submit gate escalates it) */
  product: 'read-back' | 'value' = 'read-back',
): PairTeaching {
  const at = (s: string) => line.slice(0, pair.index) + s + line.slice(pair.index + pair.text.length);
  const readings = (): PairTeaching => ({
    kind: 'readings',
    ...(pair.decimal ? { decimal: pair.decimal, joined: pair.joined } : {}),
    product: product === 'read-back' && reads(at(pair.product)) ? pair.product : pair.value,
  });
  if (reads(at(pair.value))) return readings();
  const comma = `${pair.a}, ${pair.b}`;
  if (reads(at(comma))) return { kind: 'comma', comma };
  return readings();
}
