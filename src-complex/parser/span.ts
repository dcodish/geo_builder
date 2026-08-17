/**
 * TOTAL SPAN ACCOUNTING — the only honesty mechanism this parser gets.
 *
 * Every significant span of the student's line must be CLAIMED by the winning parse, or the parse is
 * refused and escalated. There is no second mechanism, and there will not be one:
 * [ADR-CX-009](../../docs/06d-decisions-complex.md#adr-cx-009) §2 makes reaching for a `dropped*` gate
 * the tripwire, because the 2-D tree grew **~18** of them — each added after a silent-drop P1, each an
 * enumeration of one category that can be lost — and the family eventually produced defects of its own.
 * 33 closed bugs sit in that theme. The complete mechanism was named in
 * [ADR-250](../../docs/06-decisions.md#adr-250) and is *still* not enforcing there, because it is
 * expensive to retrofit onto a grammar with 134 rules. It is nearly free on a grammar with none.
 *
 * Two properties are load-bearing and are asserted, not assumed:
 *
 *   - **Occurrence-based, not value-based** ([ADR-429](../../docs/06-decisions.md#adr-429)). `ריבוע
 *     במידות 4*4` states two 4s; an accountant that asks "is 4 accounted for?" says yes once and loses
 *     the other. This one matches by POSITION, so two identical tokens are two obligations.
 *   - **Fails CLOSED** ([ADR-435](../../docs/06-decisions.md#adr-435)). Only a listed connective may go
 *     unclaimed; an unknown word is CONTENT. The asymmetry is the whole design: *"growing the neutral
 *     allowlist costs an unneeded escalation; growing the denylist's gaps cost a WRONG figure under a
 *     green ✓."*
 */

import { isDisplayOnly } from './normalize';

export type SpanKind = 'name' | 'number' | 'operator' | 'word' | 'punctuation';

export interface Span {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly kind: SpanKind;
}

/**
 * Words that may be left unclaimed: articles, copulas, conjunctions and the exam's framing verbs.
 *
 * This list is allowed to GROW — each addition costs at most one unnecessary escalation. What is not
 * allowed is a denylist, whose gaps cost a wrong figure. Anything not here is content.
 */
const FILLER = new Set([
  // Hebrew connectives and copulas
  'ו', 'הוא', 'היא', 'הם', 'הן', 'של', 'את', 'עם', 'אשר', 'כי', 'אם', 'גם', 'או',
  'נתון', 'נתונים', 'נתונה', 'ידוע', 'כאשר', 'לכל', 'כך', 'שבו', 'שבה',
  // the exam's LOCATION verbs — «z2 נמצא ברביע השלישי» says no more than «z2 ברביע השלישי»
  'נמצא', 'נמצאת', 'נמצאים', 'נמצאות', 'מונח', 'מונחת',
  // English
  'a', 'an', 'the', 'is', 'are', 'be', 'and', 'or', 'of', 'with', 'that', 'where',
  'given', 'let', 'suppose', 'such', 'to', 'for', 'in', 'on', 'we', 'it',
  'lies', 'lie', 'located', 'situated',
]);

const NAME = /^[A-Za-z][A-Za-z]*\d*$/;

/**
 * Split a NORMALIZED line into the spans an account must cover.
 *
 * Whitespace is not a span. Display-only characters are not spans either — if one survives to here it
 * is a bug in {@link normalize}, not content the student typed, and reporting it as unaccounted would
 * blame the student for our own alphabet gap.
 */
export function tokenize(normalized: string): Span[] {
  const out: Span[] = [];
  // Hebrew runs are ONE word. Without this alternative every Hebrew letter tokenizes separately, and
  // a word could never be claimed or recognised as filler — the accountant would blame the student for
  // each character of their own sentence.
  const re = /\s+|[֐-׿]+|[A-Za-z][A-Za-z]*\d*|\d+(?:\.\d+)?|[<>]=|[=<>+\-*/^|(),]|[^\s]/gu;
  for (const m of normalized.matchAll(re)) {
    const text = m[0];
    const start = m.index ?? 0;
    if (/^\s+$/.test(text)) continue;
    if ([...text].every(isDisplayOnly)) continue;
    out.push({ start, end: start + text.length, text, kind: classify(text) });
  }
  return out;
}

function classify(text: string): SpanKind {
  if (/^[֐-׿]/.test(text)) return 'word';
  if (/^\d/.test(text)) return 'number';
  if (NAME.test(text)) return /^[A-Za-z]/.test(text) && text.length <= 3 ? 'name' : 'word';
  if (/^[=<>+\-*/^|(),]|^[<>]=$/.test(text)) return 'operator';
  if (/^[.,;:!?]$/.test(text)) return 'punctuation';
  return 'word';
}

/** A claimed range, half-open, in the coordinates of the normalized line. */
export interface Claim {
  readonly start: number;
  readonly end: number;
}

export interface Unaccounted {
  readonly span: Span;
  /** why this span had to be claimed — carried into the refusal so it names the student's own text */
  readonly reason: 'content';
}

/**
 * A listed connective is filler whatever KIND the tokenizer guessed.
 *
 * `in` and `the` match the name shape, so keying filler on `kind === 'word'` classified them as names
 * and «z1 in the first quadrant» was refused for its own English. The allowlist is the authority here;
 * the kind is a hint for other consumers.
 */
const isFiller = (s: Span): boolean =>
  s.kind === 'punctuation' || (s.kind !== 'number' && FILLER.has(s.text.toLowerCase()));

/**
 * Which spans the parse failed to claim.
 *
 * A span counts as claimed when a claim covers it ENTIRELY. Partial cover is not cover: a rule that
 * consumed `z1` out of `z10` has not accounted for `z10`, and letting that pass is precisely how a
 * label goes missing under a green ✓.
 */
export function unaccountedSpans(normalized: string, claims: readonly Claim[]): Unaccounted[] {
  const out: Unaccounted[] = [];
  for (const span of tokenize(normalized)) {
    if (isFiller(span)) continue;
    const covered = claims.some((c) => c.start <= span.start && c.end >= span.end);
    if (!covered) out.push({ span, reason: 'content' });
  }
  return out;
}

/** True when the parse accounted for everything the student typed. */
export const fullyAccounted = (normalized: string, claims: readonly Claim[]): boolean =>
  unaccountedSpans(normalized, claims).length === 0;

/** The student-facing list of what was not understood — their own words, in order. */
export const unaccountedText = (normalized: string, claims: readonly Claim[]): string[] =>
  unaccountedSpans(normalized, claims).map((u) => u.span.text);

/** The whole line as one claim — for a rule that genuinely consumes everything. */
export const claimAll = (normalized: string): Claim => ({ start: 0, end: normalized.length });

/** Claim the range a regex match covered. */
export const claimOf = (m: RegExpMatchArray): Claim => ({
  start: m.index ?? 0,
  end: (m.index ?? 0) + m[0].length,
});
