/**
 * The SENTENCE a refusal reaches the student as — the one wording of an `InputError`.
 *
 * It lived inside `App.tsx` as a key table plus a parameter helper, where a test could only
 * re-implement it. #1428 (ADR-CX-048) gave a refusal the fold's own `why`, worded by the reading seam
 * (`whyText`), and the sentence the student reads is the thing that lock is about — so it moved here,
 * where the strip, the load audit and the tests all call the same function.
 */
import type { ReservedConstant } from '../model/naming';
import type { Translate } from '../model/why';
import { whyText } from '../replay/scene2';
import type { InputError } from '../store/useComplexStore';

/** Every refusal but the reserved constants, which choose between two sentences below. */
const ERROR_KEY: Record<Exclude<InputError['key'], 'reserved-constant' | 'mixed-number'>, string> = {
  'not-handled': 'errNotHandled',
  // #1919 — the two ruled sentences for a script this tool does not read, 2-D's wording verbatim
  'unread-name': 'errUnreadName',
  'unread-word': 'errUnreadWord',
  'parse-error': 'errParse',
  'duplicate-name': 'errDuplicate',
  'wrong-app': 'errWrongApp',
  'newer-version': 'errNewerVersion',
  'too-large': 'errTooLarge',
  incompatible: 'errIncompatible',
  impossible: 'errImpossible',
  unaccounted: 'errUnaccounted',
  negation: 'errNegation',
  'complex-as-real': 'errComplexAsReal',
  refused: 'errRefused',
  'word-root': 'errWordRoot',
  'glued-i': 'errGluedI',
  // #2247 (ADR-CX-081) — «2 3» asks the glued-`i` question, in its sentence: is this a product? write it explicitly
  'juxtaposed-numbers': 'errGluedI',
  'trig-mismatch': 'errTrigMismatch',
};

/**
 * #1974 (ADR-CX-063) — a reserved constant's refusal, one sentence per constant (the operator's two,
 * 2026-10-10). The shapes differ deliberately: `i` IS a number, so the sentence says what it is; `o`
 * is a POSITION, so it says what it marks and offers the way out. One table, one code path, and the
 * floor guarantees there is no third constant.
 */
const RESERVED_KEY: Record<ReservedConstant, string> = { i: 'errReservedI', o: 'errReservedO' };

/** The locale key a refusal is worded by. */
const keyOf = (e: InputError): string =>
  e.key === 'reserved-constant'
    ? RESERVED_KEY[e.constant]
    : // #2247 (ADR-CX-081) — analytic's two sentences: a decimal is offered only when the fraction terminates
      e.key === 'mixed-number'
      ? e.decimal
        ? 'errMixedNumber'
        : 'errMixedNumberNoDecimal'
      : ERROR_KEY[e.key];

/**
 * An error's interpolation values: its detail, the letter when the error names one (#1405), and the
 * worded reason when the refusal carries the fold's `why` (#1428), and the constant it names (#1974).
 */
const errParams = (e: InputError, t: Translate): Record<string, string> =>
  'constant' in e
    ? { detail: e.detail, constant: e.constant }
    : 'word' in e
    ? { detail: e.detail, word: e.word }
    : 'sum' in e
    ? { detail: e.detail, decimal: e.decimal ?? '', sum: e.sum, product: e.product }
    : 'cos' in e
    ? { detail: e.detail, cos: e.cos, sin: e.sin }
    : 'suggestion' in e
    ? { detail: e.detail, suggestion: e.suggestion }
    : 'letter' in e
    ? { detail: e.detail, letter: e.letter }
    : 'why' in e
      ? { detail: e.detail, reason: whyText(e.why, t) }
      : { detail: e.detail };

export const errorText = (e: InputError, t: Translate): string => t(keyOf(e), errParams(e, t));
