/**
 * The SENTENCE a refusal reaches the student as — the one wording of an `InputError`.
 *
 * It lived inside `App.tsx` as a key table plus a parameter helper, where a test could only
 * re-implement it. #1428 (ADR-CX-048) gave a refusal the fold's own `why`, worded by the reading seam
 * (`whyText`), and the sentence the student reads is the thing that lock is about — so it moved here,
 * where the strip, the load audit and the tests all call the same function.
 */
import type { Translate } from '../model/why';
import { whyText } from '../replay/scene2';
import type { InputError } from '../store/useComplexStore';

const ERROR_KEY: Record<InputError['key'], string> = {
  'not-handled': 'errNotHandled',
  'parse-error': 'errParse',
  'duplicate-name': 'errDuplicate',
  'wrong-app': 'errWrongApp',
  'newer-version': 'errNewerVersion',
  'too-large': 'errTooLarge',
  incompatible: 'errIncompatible',
  impossible: 'errImpossible',
  unaccounted: 'errUnaccounted',
  'complex-as-real': 'errComplexAsReal',
  refused: 'errRefused',
  'word-root': 'errWordRoot',
  'glued-i': 'errGluedI',
  'trig-mismatch': 'errTrigMismatch',
};

/**
 * An error's interpolation values: its detail, the letter when the error names one (#1405), and the
 * worded reason when the refusal carries the fold's `why` (#1428).
 */
const errParams = (e: InputError, t: Translate): Record<string, string> =>
  'cos' in e
    ? { detail: e.detail, cos: e.cos, sin: e.sin }
    : 'suggestion' in e
    ? { detail: e.detail, suggestion: e.suggestion }
    : 'letter' in e
    ? { detail: e.detail, letter: e.letter }
    : 'why' in e
      ? { detail: e.detail, reason: whyText(e.why, t) }
      : { detail: e.detail };

export const errorText = (e: InputError, t: Translate): string => t(ERROR_KEY[e.key], errParams(e, t));
