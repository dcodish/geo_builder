/**
 * THE POSITIVE JUNK TEST, ONCE (#1357) — does an utterance carry ANY construction signal at all?
 *
 * ## The defect it exists for
 *
 * Operator, 2026-09-22: *"if someone just bombards my site with gibberish, my llm costs will be high."*
 * Measured: in 2-D, 12 of 12 junk strings reached the paid call, and ten of them had ALREADY been
 * classified `unrelated`. The category was consulted only after the call, to word a nicer message.
 * 3-D had no such category at all, and analytic escalated every `not-handled`.
 *
 * ## Why it is a POSITIVE test
 *
 * A list of junk shapes never ends. The keyword rules missed `12345` and `xkcd 42 zz` because a digit
 * counted as geometry, and `Hello there` because any capital letter counted as a point label. So the
 * question is turned round: *is there anything here that could be geometry?* A sentence with no point
 * label, no relation symbol and no word of the product's vocabulary cannot build, whatever the model
 * answers. It is never worth a call.
 *
 * - **A point label** is an uppercase run that does not continue into a lowercase word: `A`, `AB`,
 *   `A'`, `P1` count; the capital of `Hello` or `Lorem` does not.
 * - **A relation symbol** is one of the mathematical marks every builder reads.
 * - **A digit alone is NOT a signal.** Numbers only mean something next to a label, a word or a symbol.
 *
 * ## Why it is in `shell/`
 *
 * Three builders escalate to the model (2-D, 3-D, analytic), so a product-local predicate would be
 * three copies of one rule. This file knows no product: each caller passes its OWN vocabulary, and each
 * product's catalog net asserts that no line of its catalog scores zero, so the gate cannot brush off a
 * sentence the tool teaches.
 */

/** A point label: an uppercase run (with digits and primes) not continuing into a lowercase word. */
const POINT_LABEL = /(?<![A-Za-z])[A-Z][A-Z0-9'′]*(?![a-z])/u;

/** The relation and geometry marks every builder reads. */
const RELATION_SYMBOL = /[∠°⊥⟂∥√△▲◯=<>≤≥≠±^|·×÷∈]/u;

/**
 * True when `utterance` carries a point label, a relation symbol, or a word of `vocabulary`. False
 * means that nothing in it could be geometry, so the caller answers without paying for the model.
 */
export function hasConstructionSignal(utterance: string, vocabulary: RegExp): boolean {
  const s = utterance.trim();
  if (!s) return false;
  return POINT_LABEL.test(s) || RELATION_SYMBOL.test(s) || vocabulary.test(s);
}
