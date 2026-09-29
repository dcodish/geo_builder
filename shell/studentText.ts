/**
 * #1455 (ADR-W-096) — A MESSAGE NAMES ONLY WHAT THE STUDENT CAN SEE.
 *
 * The honesty invariant says an error names the student's statement, never internal state. It had leaked
 * in all four builders, each fixed locally: 2-D `~tanmid-OE` / `@ctr-O`, analytic `curve-anon…` /
 * `circle-Z`, complex `#sz5_N`, and 3-D's English engine nouns («המישור «base» לא הוגדר», «גוף מסוג
 * «pyramid»»). This is the one check, product-free.
 *
 * It judges the VALUES a message interpolates, never the template: a template may quote a worked example
 * («תיבה ABCDA'B'C'D'»), and every leak so far arrived as a value. A value may name:
 *   - anything the student TYPED (case-insensitive: «זווית sdb» makes D the student's own letter);
 *   - any name the FIGURE shows (a vertex the tool lettered, «ℓ», «π1»);
 *   - words the product translated (Hebrew/English prose from its own locale) and numbers.
 * It may not carry an id-shaped token (`~x`, `@x`, `#x`, `kind-Id`), an English word the student did
 * not type (an engine noun), or a capital label that is neither typed nor drawn.
 */

export interface StudentVocabulary {
  /** Everything the student typed in this figure, joined. */
  typed: string;
  /** Every name the figure shows (points, lines, planes, vectors, symbols). */
  names: Iterable<string>;
}

const ID_SHAPED = /[~@#][\p{L}\p{N}_-]+|\b[a-z]+-[\p{L}\p{N}_]+/gu;
const LATIN_WORD = /\b[a-z]{2,}\b/g;
const LABEL_RUN = /\b[A-Z](?:[A-Z0-9'′])*/g;
const LABEL = /[A-Z]\d*['′]*/g;

export function studentFacingViolations(values: readonly string[], vocab: StudentVocabulary): string[] {
  const typed = vocab.typed.toLowerCase();
  const names = new Set(vocab.names);
  const out: string[] = [];
  for (const v of values) {
    for (const m of v.matchAll(ID_SHAPED)) out.push(`id-shaped «${m[0]}» in «${v}»`);
    for (const m of v.matchAll(LATIN_WORD)) if (!typed.includes(m[0])) out.push(`untyped word «${m[0]}» in «${v}»`);
    for (const run of v.matchAll(LABEL_RUN)) {
      for (const l of run[0].matchAll(LABEL)) {
        if (!names.has(l[0]) && !typed.includes(l[0].toLowerCase())) out.push(`unknown label «${l[0]}» in «${v}»`);
      }
    }
  }
  return out;
}
