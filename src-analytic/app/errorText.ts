/**
 * The refusal TEXT for an `InputError` — the one place a refusal becomes a sentence (#1514 pre-play).
 *
 * It lived inline in `App.tsx`, so the only way a test could check what a student READS was to
 * re-spell the key table (which `issue-1180-1179` had to do) — a lock that reproduces the decision it
 * guards stays green through the change that breaks it. Extracted so the lock calls the same function
 * the page renders with, and so the per-kind tables below are typed exhaustive over `RefKind`: a new
 * curve kind cannot reach a refusal without a noun, which is how «הנקודה parabola-I» happened.
 */
import { MAX_FIGURE_STATEMENTS } from '../../shell/save';
import type { RefKind } from '../engine/names';
import type { InputError } from '../store/useAnalyticStore';

/** The slice of i18next's `t` this needs — a key and its interpolation values, back a string. */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * The locale key describing WHAT a clashing name already holds (#1046).
 *
 * The engine hands over a token (`derived:centroid`, `curve:ellipse`) and never a sentence, so the
 * description is rendered here, in the student's language, from the construct's own corpus noun.
 * An unrecognised token falls back to the generic noun rather than printing itself: a message
 * leaking `derived:centroid` at a student would be internal state, which the honesty invariants
 * forbid outright.
 */
export function existingKey(error: InputError): string {
  const token = 'existing' in error ? error.existing : undefined;
  const byToken: Record<string, string> = {
    point: 'kindPoint',
    free: 'kindFree',
    segment: 'kindSegment',
    polygon: 'kindPolygon',
    'curve:line': 'kindLine',
    'curve:circle': 'kindCircle',
    'curve:parabola': 'kindParabola',
    'curve:ellipse': 'kindEllipse',
    // The constructive curves are a circle and a line to the student, however they were stated (#1464).
    'circle-at': 'kindCircle',
    'circle-thru': 'kindCircle',
    'line-at': 'kindLine',
    'derived:midpoint': 'kindMidpoint',
    'derived:centroid': 'kindCentroid',
    'derived:incentre': 'kindIncentre',
    'derived:orthocentre': 'kindOrthocentre',
    'derived:circumcentre': 'kindCircumcentre',
    'derived:diagonals': 'kindDiagonalMeet',
  };
  return (token && byToken[token]) || 'kindObject';
}

/**
 * #1179 — the noun of an unknown reference follows the KIND the statement expected. Exhaustive over
 * `RefKind`: before #1514's pre-play a parabola id had no row here AND no prefix in `refKindOf`, and
 * was reported as a missing POINT called «parabola-I».
 */
const UNKNOWN_REF_KEY: Record<RefKind, string> = {
  point: 'errUnknownRefPoint',
  line: 'errUnknownRefLine',
  circle: 'errUnknownRefCircle',
  parabola: 'errUnknownRefParabola',
  ellipse: 'errUnknownRefEllipse',
  curve: 'errUnknownRef',
};

/** The bare noun of a kind — «פרבולה» / "a parabola" — for sentences that name a family. */
const KIND_NOUN_KEY: Record<RefKind, string> = {
  point: 'kindPoint',
  line: 'kindLine',
  circle: 'kindCircle',
  parabola: 'kindParabola',
  ellipse: 'kindEllipse',
  curve: 'kindObject',
};

/** The BARE noun a numeral follows — «ישר 1», "line 1" (ruling 2026-09-29's note). */
const NUMERAL_NOUN_KEY: Record<RefKind, string> = {
  point: 'numNounPoint',
  line: 'numNounLine',
  circle: 'numNounCircle',
  parabola: 'numNounParabola',
  ellipse: 'numNounEllipse',
  curve: 'numNounCurve',
};

/** The DEFINITE noun as a student writes it before a name — «הפרבולה» / "the parabola". */
const THE_NOUN_KEY: Record<RefKind, string> = {
  point: 'nounThePoint',
  line: 'nounTheLine',
  circle: 'nounTheCircle',
  parabola: 'nounTheParabola',
  ellipse: 'nounTheEllipse',
  curve: 'nounTheCurve',
};

/**
 * The remedy for a curve named by its noun alone (#1514 pre-play): the student's OWN sentence with the
 * first candidate's name after the noun — «P על הפרבולה» → «P על הפרבולה I». When the sentence does
 * not carry the noun in the form the locale spells it, the bare reference («הפרבולה I») is the example.
 */
export function ambiguousCurveExample(detail: string, theNoun: string, name: string): string {
  const at = detail.indexOf(theNoun);
  if (at < 0) return `${theNoun} ${name}`;
  const end = at + theNoun.length;
  return `${detail.slice(0, end)} ${name}${detail.slice(end)}`;
}

/** The sentence a student reads for `error`, in the locale `t` speaks. */
export function errorText(error: InputError, t: Translate): string {
  const kind: RefKind | undefined = 'expected' in error ? error.expected : undefined;
  const candidates = error.key === 'ambiguous-curve' ? (error.candidates ?? []) : [];
  const theNoun = t(THE_NOUN_KEY[kind ?? 'curve']);
  const key: string = {
    'not-handled': 'errNotHandled',
    'bad-equation': 'errBadEquation',
    'out-of-scope': 'errOutOfScope',
    'reserved-coordinate': 'errReservedCoordinate',
    'bad-arity': 'errBadArity',
    'repeated-vertex': 'errRepeatedVertex',
    'degenerate-role': 'errDegenerateRole',
    'apex-not-a-vertex': 'errApexNotAVertex',
    'crossing-already-named': 'errCrossingAlreadyNamed',
    'self-crossing': 'errSelfCrossing',
    'llm-busy': 'errLlmBusy',
    'llm-understood-unsupported': 'errLlmUnderstood',
    'bad-operand': 'errBadOperand',
    'conflicting-restatement': 'errConflict',
    'name-kind-clash': 'errNameClash',
    // An id with no prefix (and so no kind) falls to the kind-free wording rather than guessing.
    'unknown-reference': kind ? UNKNOWN_REF_KEY[kind] : 'errUnknownRef',
    'kind-mismatch': 'errKindMismatch',
    'does-not-exist': 'errDoesNotExist',
    'ring-contradicts-noun': 'errRingContradictsNoun',
    // #1407 — a vertex in SEVERAL shapes gets the three-letter name it needs; in none, the general form.
    'ambiguous-angle': error.key === 'ambiguous-angle' && error.example ? 'errAmbiguousAngleArms' : 'errAmbiguousAngle',
    'ambiguous-shape': 'errAmbiguousShape',
    // #1514 pre-play — a CURVE by its noun alone: several candidates are named, none is said so.
    'ambiguous-curve': candidates.length > 0 ? 'errAmbiguousCurve' : 'errNoSuchCurve',
    // Ruling 2026-09-29 — «1» and «I» are one name; mixing the two notations is refused with a note.
    'numeral-notation': 'errNumeralNotation',
    'undistinguished-diagonal': 'errNoPrincipalDiagonal',
    'already-named': 'errAlreadyNamed',
    // #1423 — a refusal that restates an existing letter says the LETTER is the problem
    'unsatisfiable': error.key === 'unsatisfiable' && 'reusedId' in error && error.reusedId ? 'errUnsatisfiableReused' : 'errUnsatisfiable',
    // A save file this tool will not open, named by WHICH of the three reasons (#1087).
    'load-foreign': 'errLoadForeign',
    'load-newer': 'errLoadNewer',
    'load-too-large': 'errLoadTooLarge',
    'load-unreadable': 'errLoadUnreadable',
  }[error.key];
  return t(key, {
    detail: error.detail,
    max: MAX_FIGURE_STATEMENTS,
    existing: t(existingKey(error)),
    claimed: t(KIND_NOUN_KEY[kind ?? 'curve']),
    noun: t(KIND_NOUN_KEY[kind ?? 'curve']),
    numNoun: t(NUMERAL_NOUN_KEY[kind ?? 'curve']),
    candidates: candidates.map((n) => `${theNoun} ${n}`).join(', '),
    example: error.key === 'ambiguous-curve'
      ? (candidates.length > 0 ? ambiguousCurveExample(error.detail, theNoun, candidates[0]) : '')
      : 'example' in error ? (error.example ?? '') : '',
    holder: 'holder' in error ? (error.holder ?? '') : '',
    reusedId: 'reusedId' in error ? (error.reusedId ?? '') : '',
    definedBy: 'definedBy' in error ? (error.definedBy ?? '') : '',
  });
}
