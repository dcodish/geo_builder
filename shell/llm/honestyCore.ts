/**
 * THE HONESTY ACCOUNTING CORE (#1355, [ADR-AG-280](../../docs/06c-decisions-analytic.md#adr-ag-280)) — the
 * product-neutral algebra the LLM seam's faithfulness gates are made of.
 *
 * ## What it answers
 *
 * A model's decomposition of a student's sentence is committed only after each line re-parses. That proves
 * the lines are WELL-FORMED; it proves nothing about whether they still SAY what the student said. Two
 * questions settle that, and both are accounting:
 *
 * - **Dropped:** every name and every number the student stated must be paid for by something the answer
 *   carries. A name the answer never mentions, or a number nothing in it accounts for, is a given that
 *   would vanish behind a green row.
 * - **Invented:** every name the answer WRITES must be the student's, or (when the caller allows it) the
 *   figure's. A name nobody stated is a given nobody gave.
 *
 * ## Why it is in `shell/`
 *
 * 2-D (`droppedGivenNumbers` / `droppedNewLabels` / `introducedNewLabels`) and 3-D (`honesty3.ts`) each
 * carry a copy of the multiset loop and of the set difference; analytic's would have been the third.
 * `BOUNDARIES.json` already names `shell/llm` as the home of "the honesty-gate battery (#1355)". This file
 * holds only the algebra: no product string, no Hebrew vocabulary, no label pattern (ADR-W-016). What a
 * NAME is and what a NUMBER is in a product stays in that product (`src-analytic/parser/honestyAnalytic.ts`),
 * built from the product's own grammar atoms. Moving the two existing copies onto this core is filed as its
 * own follow-up; this file changes neither sibling.
 *
 * ## The doctrine every function keeps
 *
 * *A false account only suppresses a warning; a false drop breaks a working input.* So accounting is
 * generous (any candidate lowering may pay), and the one strictness that matters is the MULTISET: an
 * account pays for ONE occurrence (2-D #437 — «4*4» with a single 4 in the answer lost a whole given).
 */

/**
 * English function words — never a name in Latin-script text. The article «a» in "a line through A" must
 * not read as the parameter a. 2-D's `EN_FILLER_WORDS`, as a shared constant.
 */
export const LATIN_FILLER: ReadonlySet<string> = new Set([
  'a', 'an', 'to', 'the', 'and', 'of', 'is', 'are', 'at', 'on', 'in', 'with', 'from', 'that', 'so', 'such',
]);

/** Six decimals: the accounting key of a number, so 0.1+0.2 and 0.3 are one account. */
export const quantize = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * THE MULTISET (2-D #437, 3-D #457 — the same loop written twice). Each stated item is paid by the first
 * of its candidate values that still has an unspent account; the account is then SPENT. Returns the stated
 * items nothing paid for, in their original order.
 *
 * `accounts` may repeat a value — that is how two occurrences are paid. A candidate list may hold a value
 * twice; it is still one occurrence and spends one account.
 */
export function spendAccounts<T>(
  stated: readonly T[],
  accounts: Iterable<number>,
  candidates: (item: T) => readonly number[],
): T[] {
  const left = new Map<number, number>();
  for (const a of accounts) {
    if (!Number.isFinite(a)) continue;
    const k = quantize(a);
    left.set(k, (left.get(k) ?? 0) + 1);
  }
  const unpaid: T[] = [];
  for (const item of stated) {
    let paid = false;
    for (const c of candidates(item)) {
      if (!Number.isFinite(c)) continue;
      const k = quantize(c);
      const n = left.get(k) ?? 0;
      if (n > 0) {
        left.set(k, n - 1);
        paid = true;
        break;
      }
    }
    if (!paid) unpaid.push(item);
  }
  return unpaid;
}

/** Inputs to {@link nameAccounting}. Every list is of NAMES as the product tokenises them. */
export interface NameAccountingInput {
  /** The names the student's sentence states, as typed. */
  stated: readonly string[];
  /** The names the model WROTE in its lines (never names a lowering minted — those appear in no line). */
  written: readonly string[];
  /** Further names the answer carries without writing them (its parsed facts). They pay for a stated name only. */
  accounted?: readonly string[];
  /** The names the figure already holds. */
  existing?: ReadonlySet<string>;
  /** An existing name the answer omits is not dropped (2-D's `droppedNewLabels` predicate). Default false. */
  exemptExistingFromDropped?: boolean;
  /** An existing name the answer writes is not invented. Default true (2-D's `introducedNewLabels`). */
  exemptExistingFromInvented?: boolean;
}

/**
 * THE SET DIFFERENCE, both ways. Case-blind on the STATED side (#779): a name the student typed in lowercase
 * and the model echoed in uppercase is the student's own name, in both directions.
 *
 * Returns the stated names nothing accounts for (`dropped`, as the student typed them, first occurrence
 * order, no duplicates) and the written names nobody stated (`invented`, as written, no duplicates).
 */
export function nameAccounting(o: NameAccountingInput): { dropped: string[]; invented: string[] } {
  const fold = (s: string): string => s.toUpperCase();
  const existing = new Set([...(o.existing ?? [])].map((s) => fold(s)));
  const said = new Set([...o.written, ...(o.accounted ?? [])].map((s) => fold(s)));
  const statedSet = new Set(o.stated.map((s) => fold(s)));
  const exemptDropped = o.exemptExistingFromDropped ?? false;
  const exemptInvented = o.exemptExistingFromInvented ?? true;

  const dropped: string[] = [];
  const seenD = new Set<string>();
  for (const s of o.stated) {
    const k = fold(s);
    if (seenD.has(k)) continue;
    seenD.add(k);
    if (said.has(k)) continue;
    if (exemptDropped && existing.has(k)) continue;
    dropped.push(s);
  }

  const invented: string[] = [];
  const seenI = new Set<string>();
  for (const w of o.written) {
    const k = fold(w);
    if (seenI.has(k)) continue;
    seenI.add(k);
    if (statedSet.has(k)) continue;
    if (exemptInvented && existing.has(k)) continue;
    invented.push(w);
  }
  return { dropped, invented };
}

/** One number occurrence in a text: as written, and its value (a fraction `a/b` is one occurrence). */
export interface NumberOccurrence {
  raw: string;
  value: number;
}

/**
 * The number occurrences of `text`, after the caller's spans are BLANKED (replaced by spaces, so positions
 * and word boundaries survive). The caller blanks what is not a magnitude in its notation: a name's
 * subscript digit, an exponent, a count, a numeral name.
 *
 * UNSIGNED by design: an equation's binary minus has no sign context ((x+2)² states the centre −2), so a
 * sign is never part of an occurrence. A fraction `a/b` is one occurrence valued a/b.
 */
export function scanNumbers(text: string, blank: readonly RegExp[] = []): NumberOccurrence[] {
  let s = text;
  for (const re of blank) s = s.replace(re, (m) => ' '.repeat(m.length));
  const out: NumberOccurrence[] = [];
  for (const m of s.matchAll(/\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?/g)) {
    const raw = m[0].replace(/\s+/g, '');
    const [a, b] = raw.split('/');
    const value = b !== undefined ? parseFloat(a) / parseFloat(b) : parseFloat(a);
    if (Number.isFinite(value)) out.push({ raw, value });
  }
  return out;
}

/**
 * The per-line union of two account sources (a line's text and its parsed facts): a value counts as many
 * times as the RICHER source carries it, never the sum — one statement read twice must not pay twice.
 */
export function unionByMax(...sources: readonly (readonly number[])[]): number[] {
  const best = new Map<number, number>();
  for (const src of sources) {
    const here = new Map<number, number>();
    for (const v of src) if (Number.isFinite(v)) here.set(quantize(v), (here.get(quantize(v)) ?? 0) + 1);
    for (const [k, n] of here) best.set(k, Math.max(best.get(k) ?? 0, n));
  }
  const out: number[] = [];
  for (const [k, n] of best) for (let i = 0; i < n; i++) out.push(k);
  return out;
}
