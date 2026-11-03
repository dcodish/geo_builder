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
 * One account: a value, or a value TAGGED with where it came from (#2646: analytic tags an equation's numbers, so a
 * square or a root may pay only across an equation). A tagged account is paid only by a candidate with its tag.
 */
export type Account = number | { readonly value: number; readonly tag: string };
const accountValue = (a: Account): number => (typeof a === 'number' ? a : a.value);
const accountKey = (a: Account): number | string => (typeof a === 'number' ? quantize(a) : `${a.tag}:${quantize(a.value)}`);

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
  accounts: Iterable<Account>,
  candidates: (item: T) => readonly Account[],
): T[] {
  const left = new Map<number | string, number>();
  for (const a of accounts) {
    if (!Number.isFinite(accountValue(a))) continue;
    const k = accountKey(a);
    left.set(k, (left.get(k) ?? 0) + 1);
  }
  const unpaid: T[] = [];
  for (const item of stated) {
    let paid = false;
    for (const c of candidates(item)) {
      if (!Number.isFinite(accountValue(c))) continue;
      const k = accountKey(c);
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

/**
 * THE RADICAL TERM (#2646, [ADR-AG-384](../../docs/06c-decisions-analytic.md#adr-ag-384); 2-D's ADR-700 grammar, moved
 * here so there is ONE spelling of "a root"). A value term is a plain number, a root, or a coefficient times a root:
 * «5», «√2», «5√2», «5·√2», «√(3/4)», optionally inside one outer pair of parentheses «(5√2)». A value is a term with
 * an optional «/ term»: «2/√3», «√32/5», «3/4». It is ONE occurrence, valued as it evaluates (√2 is 1.414…, never its
 * radicand 2; 5√2 is 7.07…, never a 5 and a 2).
 *
 * {@link RADICAL} is the √ glyph only (2-D's notation: its gate reads the glyph). {@link RADICAL_SPELLED} also reads
 * the spelled forms a typed or model line may carry: «sqrt(2)», «sqrt 2» and LaTeX «\sqrt{2}».
 */
const DEC = String.raw`\d+(?:\.\d+)?`;
export const RADICAL = String.raw`√\s*(?:\(\s*${DEC}(?:\s*\/\s*${DEC})?\s*\)|${DEC})`;
export const RADICAL_SPELLED = String.raw`(?:√|\\sqrt|sqrt)\s*(?:[({]\s*${DEC}(?:\s*\/\s*${DEC})?\s*[)}]|${DEC})`;
/**
 * One value term over a radical spelling: `[coef [*·]] root` or a plain number, optionally inside ONE PAIRED outer
 * parenthesis «(5√2)». Never an unpaired one: in «(√2, 1)» the parenthesis is the coordinate's, and in «(4-0)/(3-0)» the
 * «0)/(3» is two groups, not a fraction.
 */
export const radicalTerm = (rad: string = RADICAL): string => {
  const core = String.raw`(?:(?:${DEC}\s*[*·]?\s*)?${rad}|${DEC})`;
  return String.raw`(?:\(\s*${core}\s*\)|${core})`;
};

const TERM_VALUE = new RegExp(
  String.raw`^(?:(${DEC})\s*[*·]?\s*)?(?:√|\\sqrt|sqrt)\s*(?:[({]\s*(${DEC})(?:\s*\/\s*(${DEC}))?\s*[)}]|(${DEC}))$`,
);

/**
 * The value of one term ({@link radicalTerm}, any spelling): `[coef ·] √ n`, `√(a/b)`, or a plain number, an outer
 * parenthesis pair stripped («√(2)» keeps its own). 2-D's `evalTerm` (ADR-700), unchanged.
 */
export function evalRadicalTerm(raw: string): number {
  const t = raw.trim().replace(/^\(([\s\S]*)\)$/, '$1').trim();
  const r = TERM_VALUE.exec(t);
  if (!r) return parseFloat(t);
  const rn = r[2] ?? r[4];
  const radicand = r[3] !== undefined ? parseFloat(rn!) / parseFloat(r[3]) : parseFloat(rn!);
  return (r[1] ? parseFloat(r[1]) : 1) * Math.sqrt(radicand);
}

/** One number occurrence in a text: as written, its value, and where it starts. A fraction or a root is one occurrence. */
export interface NumberOccurrence {
  raw: string;
  value: number;
  /** where the occurrence starts in the scanned text (blanking preserves positions) */
  at: number;
}

/**
 * The number occurrences of `text`, after the caller's spans are BLANKED (replaced by spaces, so positions
 * and word boundaries survive). The caller blanks what is not a magnitude in its notation: a name's
 * subscript digit, an exponent, a count, a numeral name.
 *
 * UNSIGNED by design: an equation's binary minus has no sign context ((x+2)² states the centre −2), so a
 * sign is never part of an occurrence. A value `term [/ term]` ({@link radicalTerm}, every radical spelling) is ONE
 * occurrence, valued as it evaluates: «3/4» is 0.75, «√2» is 1.414…, «5√2» is 7.07…, «2/√3» is 1.1547… (#2646).
 */
export function scanNumbers(text: string, blank: readonly RegExp[] = []): NumberOccurrence[] {
  let s = text;
  for (const re of blank) s = s.replace(re, (m) => ' '.repeat(m.length));
  const term = radicalTerm(RADICAL_SPELLED);
  const out: NumberOccurrence[] = [];
  for (const m of s.matchAll(new RegExp(String.raw`(${term})(?:\s*\/\s*(${term}))?`, 'g'))) {
    const num = evalRadicalTerm(m[1]);
    const den = m[2] !== undefined ? evalRadicalTerm(m[2]) : 1;
    const value = num / den;
    if (Number.isFinite(value)) out.push({ raw: m[0].replace(/\s+/g, ''), value, at: m.index! });
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

/* ────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * THE PROPERTY-WORD READER (#1906, [ADR-W-144](../../docs/06w-decisions-workspace.md#adr-w-144)).
 *
 * The operator's ruling (2026-10-08): *every shape or role word the student typed must survive into the AI
 * answer's lowering, or the answer is refused*, and a MISSPELT word counts as present when the answer carries
 * the property it plausibly names. So two questions, and this half answers the first: where in the student's
 * line does a property word stand, and which properties may it name? The second (does the answer carry one of
 * them) is each product's, over its own commands.
 *
 * The match, as the plan defined and measured it:
 *  1. FOLD both sides with the product's folds (final letters, doubled vav/yod, case) and PEEL up to two clitic
 *     letters, every way (a stem may begin with a clitic letter: «מלבן» is not «מ» + «לבן»).
 *  2. A token IS the word w when a peeling is w, or w plus one of the closed INFLECTIONS.
 *  3. Otherwise it is a NEAR MISS of w (w at least four letters) when a peeling is one Damerau-Levenshtein edit
 *     from w, unless the product's lexicon READS the token as another word («מקבילים» is «מקביל» + «ים», never a
 *     slip for «מקבילית»). Two edits reach other real words (measured: «מבחוץ», «שווים», «קובייה»), so one is the limit.
 *  4. A phrase of several words («שווה צלעות») matches when each word, adjacent and in order, matches.
 *  5. A near miss may name several properties; the occurrence keeps every candidate, and the product accounts
 *     for it when the answer carries ANY of them.
 *
 * Product-neutral by construction (ADR-W-016): the vocabulary, the folds, the clitics, the inflections and the
 * lexicon test all come from the caller.
 * ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** One vocabulary phrase: its word slots (each slot's spellings, as the product writes them) and what it names. */
export interface PropertyPhrase<P> {
  readonly slots: readonly (readonly string[])[];
  readonly props: readonly P[];
  /** false: only the word itself or an inflection, for a short or common word whose one-edit neighbours are other words */
  readonly nearMiss?: boolean;
}

/** The product's word knowledge the reader needs, every piece of it the caller's own. */
export interface WordReaderSpec {
  /** fold one word (final letters to medial, doubled letters, case) */
  fold(word: string): string;
  /** the clitic letters a word may carry in front (peeled up to two, every way) */
  readonly clitics: string;
  /** the closed inflection set, as typed (folded by `fold` before use) */
  readonly inflections: readonly string[];
  /** does the product's lexicon read this word, as typed, as a word of its own (a stem plus an inflection, or filler)? */
  readsWord(word: string): boolean;
  /** the shortest vocabulary word a near miss may name. Default 4. */
  readonly minNearMiss?: number;
}

/** One property phrase found in the student's line. */
export interface PropertyOccurrence<P> {
  /** the student's own words, as typed */
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** every phrase this occurrence may be, each with the canonical spelling it stands for */
  readonly candidates: readonly { readonly phrase: PropertyPhrase<P>; readonly canonical: string }[];
  /** true when every word is the vocabulary word itself (or an inflection), false for a near miss */
  readonly exact: boolean;
}

/**
 * Damerau-Levenshtein distance (optimal string alignment: insert, delete, substitute, swap two neighbours),
 * stopped early once it exceeds `cap`.
 */
export function editDistance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      rowMin = Math.min(rowMin, v, d[i][0]);
    }
    if (rowMin > cap) return cap + 1;
  }
  return d[a.length][b.length];
}

/** The word tokens of a line: runs of Hebrew or Latin letters. A label run (all capitals) is never a word. */
function wordTokens(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(/[א-ת]+|[A-Za-z]+/g)) {
    if (/^[A-Z]+$/.test(m[0])) continue;
    out.push({ text: m[0], start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** The folded peelings of a token: itself, and with one or two clitic letters taken off the front. */
function peelings(folded: string, clitics: string): string[] {
  const out = [folded];
  if (folded.length > 2 && clitics.includes(folded[0])) {
    out.push(folded.slice(1));
    if (folded.length > 3 && clitics.includes(folded[1])) out.push(folded.slice(2));
  }
  return out;
}

/**
 * Every property phrase the student's line states, exact or one edit off, left to right. A word belongs to one
 * occurrence: the longest phrase that starts at it.
 */
export function propertyWords<P>(text: string, vocabulary: readonly PropertyPhrase<P>[], spec: WordReaderSpec): PropertyOccurrence<P>[] {
  const min = spec.minNearMiss ?? 4;
  const inflections = spec.inflections.map((i) => spec.fold(i));
  const toks = wordTokens(text).map((t) => {
    const variants = peelings(spec.fold(t.text), spec.clitics);
    return { ...t, variants, read: spec.readsWord(t.text) };
  });
  const isWord = (variants: readonly string[], w: string): boolean =>
    variants.some((v) => v === w || inflections.some((i) => v === w + i));
  const folded = vocabulary.map((ph) => ph.slots.map((slot) => slot.map((w) => ({ raw: w, f: spec.fold(w) }))));
  // a token that IS some vocabulary word is never a near miss of another
  const anyExact = toks.map((t) => folded.some((ph) => ph.some((slot) => slot.some((w) => isWord(t.variants, w.f)))));
  /** how token `ti` fills `slot`: the spelling it is, the spelling it is one edit from, or null */
  const fill = (ti: number, slot: readonly { raw: string; f: string }[], near: boolean): { how: 'exact' | 'near'; raw: string } | null => {
    const t = toks[ti];
    for (const w of slot) if (isWord(t.variants, w.f)) return { how: 'exact', raw: w.raw };
    if (!near || anyExact[ti] || t.read) return null;
    for (const w of slot) if (w.f.length >= min && t.variants.some((v) => editDistance(v, w.f, 1) <= 1)) return { how: 'near', raw: w.raw };
    return null;
  };
  const adjacent = (a: number, b: number): boolean => /^[\s\-־]*$/.test(text.slice(toks[a].end, toks[b].start));

  const out: PropertyOccurrence<P>[] = [];
  for (let i = 0; i < toks.length; ) {
    let best: { len: number; exact: boolean; phrase: PropertyPhrase<P>; canonical: string }[] = [];
    vocabulary.forEach((ph, pi) => {
      const slots = folded[pi];
      if (i + slots.length > toks.length) return;
      const words: string[] = [];
      let exact = true;
      for (let j = 0; j < slots.length; j++) {
        if (j > 0 && !adjacent(i + j - 1, i + j)) return;
        const f = fill(i + j, slots[j], ph.nearMiss !== false);
        if (!f) return;
        if (f.how === 'near') exact = false;
        words.push(f.raw);
      }
      const cand = { len: slots.length, exact, phrase: ph, canonical: words.join(' ') };
      if (best.length === 0 || cand.len > best[0].len) best = [cand];
      else if (cand.len === best[0].len) best.push(cand);
    });
    if (best.length === 0) {
      i++;
      continue;
    }
    // an exact reading wins over a near miss of the same length
    const exactOnes = best.filter((b) => b.exact);
    const chosen = exactOnes.length ? exactOnes : best;
    const len = chosen[0].len;
    out.push({
      text: text.slice(toks[i].start, toks[i + len - 1].end),
      start: toks[i].start,
      end: toks[i + len - 1].end,
      candidates: chosen.map((c) => ({ phrase: c.phrase, canonical: c.canonical })),
      exact: exactOnes.length > 0,
    });
    i += len;
  }
  return out;
}

/** `text` with one span replaced: the line as the student would have written it with the word spelt right. */
export function withSpan(text: string, start: number, end: number, replacement: string): string {
  return text.slice(0, start) + replacement + text.slice(end);
}

/**
 * The ONE merge of the word member's items into the other gates' (#1906): a word the student typed is named once.
 * An item that is a whole-word part of a word phrase («מעגל» inside «מעגל חסומ») gives way to the phrase; a word
 * phrase another item already covers («ישר-זויתי» against the older gate's own «ישר-זוית») is not repeated.
 * Returns the word items first, then the others, each in its original order.
 */
export function mergeWordItems(others: readonly string[], words: readonly string[]): string[] {
  const norm = (s: string): string => ` ${s.replace(/[\s\-־]+/g, ' ').trim()} `;
  const wholePart = (part: string, whole: string): boolean => part !== whole && norm(whole).includes(norm(part));
  const keptWords = words.filter(
    (w, i) => words.indexOf(w) === i && !others.some((o) => o === w || o.includes(w) || (w.includes(o) && !wholePart(o, w))),
  );
  const keptOthers = others.filter((o) => !keptWords.some((w) => wholePart(o, w)));
  return [...keptWords, ...keptOthers];
}
