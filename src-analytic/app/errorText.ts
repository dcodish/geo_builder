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
import type { HostRef } from '../engine/apply';
import { hostKey, rangeText } from './hostKey';
import { EN_SHAPE } from '../engine/shapes';

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

/**
 * Every HOST kind a contextual reference can need (#1432's `HostRef`), exhaustive — so a new host kind
 * cannot reach the refusal without its `errHost.*` keys (locked per kind × arity in the i18n test).
 */
export const HOST_KINDS: Record<HostRef['kind'], true> = { circle: true, parabola: true, ellipse: true, line: true, polygon: true, perpendicular: true };

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
 * The curve a line has no further crossing with (#1909, #1932 — ADR-AG-292): the definite noun «הפרבולה», the
 * indefinite "a parabola" (English's second clause), and the noun after «משיק» — «לפרבולה» / "to the parabola".
 */
type SecondCrossingCurve = 'circle' | 'parabola' | 'ellipse';
const A_NOUN_KEY: Record<SecondCrossingCurve, string> = { circle: 'nounACircle', parabola: 'nounAParabola', ellipse: 'nounAnEllipse' };
const TO_THE_NOUN_KEY: Record<SecondCrossingCurve, string> = { circle: 'nounToTheCircle', parabola: 'nounToTheParabola', ellipse: 'nounToTheEllipse' };

/** The DEFINITE plural — «הישרים» / "the lines" — before a list of names (#1750). */
const THE_PLURAL_KEY: Record<RefKind, string> = {
  point: 'nounThePoints',
  line: 'nounTheLines',
  circle: 'nounTheCircles',
  parabola: 'nounTheParabolas',
  ellipse: 'nounTheEllipses',
  curve: 'nounTheCurves',
};

/**
 * The NEAR-MISS sentence (#1750, ADR-AG-234): «באיור יש את הישרים l1 ו-l2. התכוונתם ל-l1?». The names are the
 * figure's, of the kind the statement expected; the submit decision attached them only after the student's sentence
 * with `suggest` in it recorded.
 */
export function nearMissText(kind: RefKind, near: { suggest: string; existing: readonly string[] }, t: Translate): string {
  const names = near.existing;
  const list =
    names.length === 1
      ? `${t(THE_NOUN_KEY[kind])} ${names[0]}`
      : `${t(THE_PLURAL_KEY[kind])} ${names.slice(0, -1).join(', ')}${t('listAnd')}${names[names.length - 1]}`;
  return t('errNearMiss', { names: list, suggest: near.suggest });
}

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

/** «X, Y ו-Z» — `sep` between all but the last two, `last` before the last (#1963, the locale's own `listAnd`). */
const joinAnd = (items: readonly string[], sep: string, last: string): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(sep)}${last}${items[items.length - 1]}`;

/** A registry noun in English — the first English spelling the table maps onto it (the table is the one source). */
const enNoun = (he: string | undefined): string => (he ? Object.keys(EN_SHAPE).find((k) => EN_SHAPE[k] === he) ?? he : '');

/**
 * #2115 (ADR-AG-299) — the definite noun of a polygon kind (`square`, `n5`…), 2-D's `input.shapeNounDefinite` table:
 * the three trapezoid kinds share «הטרפז», and an arity past the table is «המצולע».
 */
const POLYGON_NOUN_KEY: Readonly<Record<string, string>> = {
  square: 'shapeTheNounSquare',
  rectangle: 'shapeTheNounRectangle',
  rhombus: 'shapeTheNounRhombus',
  parallelogram: 'shapeTheNounParallelogram',
  kite: 'shapeTheNounKite',
  trapezoid: 'shapeTheNounTrapezoid',
  'isosceles-trapezoid': 'shapeTheNounTrapezoid',
  'right-trapezoid': 'shapeTheNounTrapezoid',
  n4: 'shapeTheNounN4',
  n5: 'shapeTheNounN5',
  n6: 'shapeTheNounN6',
  n7: 'shapeTheNounN7',
  n8: 'shapeTheNounN8',
  n9: 'shapeTheNounN9',
  n10: 'shapeTheNounN10',
};
const polygonNounKey = (kind: string | undefined): string => (kind && POLYGON_NOUN_KEY[kind]) || 'shapeTheNounPolygon';

/** 2-D's one-fact-per-line list format (`src/app/unreadParts.ts` `numbered`): «(n) part», two-space separators. */
const numbered = (parts: readonly string[], from = 1): string => parts.map((p, i) => `(${i + from}) ${p}`).join('  ');

/** The sentence a student reads for `error`, in the locale `t` speaks. */
export function errorText(error: InputError, t: Translate): string {
  const kind: RefKind | undefined = 'expected' in error ? error.expected : undefined;
  const host = error.key === 'ambiguous-shape' ? error.host : undefined;
  const candidates = host?.candidates ?? [];
  // The noun a candidate's name follows is the HOST's kind when a host is carried (a curve kind there).
  const nounKind: RefKind = host && host.kind !== 'polygon' ? (host.kind === 'perpendicular' ? 'line' : (host.kind as RefKind)) : (kind ?? 'curve');
  const theNoun = t(THE_NOUN_KEY[nounKind]);
  const key: string = {
    'not-handled': 'errNotHandled',
    'bad-equation': 'errBadEquation',
    'out-of-scope': 'errOutOfScope',
    'proof-target': 'errProofTarget',
    // #1837 (ADR-W-142) — 2-D's ruled degrees sentence, verbatim
    'radian-angle': 'errRadianAngle',
    // #1919 — the operator chose THIS sentence for a name the tool cannot read, in every builder.
    'unread-name': 'errRenameBadName',
    'unread-word': 'errUnreadWord',
    // #2222 (ADR-AG-284) — the operator's three spellings; the decimal only when the fraction terminates
    'mixed-number': error.key === 'mixed-number' && error.decimal ? 'errMixedNumber' : 'errMixedNumberNoDecimal',
    // #1888 / #1889 (ADR-AG-251) — a line that loses a part: its parts listed, or the right angle's two lines taught
    'split-statements': error.key === 'split-statements' && error.teach ? 'errRightAngleVertex' : 'errSplitStatements',
    'reserved-coordinate': 'errReservedCoordinate',
    'bad-arity': 'errBadArity',
    'repeated-vertex': 'errRepeatedVertex',
    'degenerate-role': 'errDegenerateRole',
    'apex-not-a-vertex': 'errApexNotAVertex',
    'bisector-wrong-apex': 'errBisectorWrongApex',
    // #2115 (ADR-AG-299) — 2-D's sentences: the triangle's, with its cevian clause; any other polygon's, naming it
    'bisector-is-side': error.key === 'bisector-is-side' && error.polygonKind !== 'triangle' ? 'errBisectorIsPolygonSide' : 'errBisectorIsSide',
    'length-xy': 'errLengthXY',
    'coordinate-restriction': 'errCoordinateRestriction',
    'ambiguous-cevian': 'errAmbiguousCevian',
    'cevian-no-triangle': 'errCevianNoTriangle',
    'ambiguous-hypotenuse': 'errAmbiguousHypotenuse',
    'ambiguous-no-right-angle': 'errCevianNoRightAngle',
    // #2018 (ADR-AG-298) — 2-D's input.roleSideUnresolved, verbatim
    'ambiguous-role-side': 'errRoleSideUnresolved',
    // #1416 — the operands named when the figure can say them; the straights' wording is for two straights only
    'crossing-already-named': error.key === 'crossing-already-named' && error.operands ? 'errCrossingAlreadyNamedOperands' : 'errCrossingAlreadyNamed',
    'self-crossing': 'errSelfCrossing',
    // #1893 (ADR-AG-271) — #1834's ruled sentence, with the student's letters
    'third-crossing': 'errThirdCrossing',
    // #1924 (ADR-AG-272) — 2-D's errors.tangentNoSecondCrossing, verbatim
    'tangent-no-second-crossing': 'errTangentNoSecondCrossing',
    'llm-busy': 'errLlmBusy',
    'llm-understood-unsupported': 'errLlmUnderstood',
    // #1355 (ADR-AG-279) — the model's answer lost what the student stated, or named what they did not
    'llm-dropped': 'errLlmDropped',
    'llm-invented': 'errLlmInvented',
    'llm-invented-existing': 'errLlmInventedExisting',
    'bad-operand': 'errBadOperand',
    'conflicting-restatement': 'errConflict',
    'name-kind-clash': 'errNameClash',
    // An id with no prefix (and so no kind) falls to the kind-free wording rather than guessing.
    'unknown-reference': kind ? UNKNOWN_REF_KEY[kind] : 'errUnknownRef',
    'kind-mismatch': 'errKindMismatch',
    'does-not-exist': 'errDoesNotExist',
    'ring-contradicts-noun': 'errRingContradictsNoun',
    // #1849 (ADR-AG-247) — the givens flatten a declared polygon: the polygon and both statements named
    'polygon-collapsed': 'errPolygonCollapsed',
    'inscribed-contradicts-noun': 'errInscribedContradictsNoun',
    // #1918 (ADR-AG-252) — the same contradiction in two sentences: 2-D's over-constrained frame, both statements named
    'inscribed-contradicts-declared': 'errInscribedContradictsDeclared',
    // #1926 (ADR-AG-260) — a ring re-declared as a shape its noun excludes: 3-D's sentence (operator ruling 2026-10-08)
    'shape-excluded': 'errShapeExcluded',
    // #1407 — a vertex in SEVERAL shapes gets the three-letter name it needs; in none, the general form.
    // #1445 (ADR-AG-243) — several angles at the vertex: the refusal LISTS them.
    'ambiguous-angle': error.key === 'ambiguous-angle' && (error.options?.length ?? 0) > 1 ? 'errAmbiguousAngleOptions' : error.key === 'ambiguous-angle' && error.example ? 'errAmbiguousAngleArms' : 'errAmbiguousAngle',
    // ONE chooser for "the reference found none / several of its host" (#1432 am. 1 + #1514): the host
    // kind and arity pick the remedy; several NAMED candidates get the sentence that names them. The
    // polygon-noun sites (no host) keep the kite example.
    'ambiguous-shape': host ? hostKey('errHost', host) : 'errAmbiguousShape',
    'out-of-domain': 'errOutOfDomain',
    // Ruling 2026-09-29 — «1» and «I» are one name; mixing the two notations is refused with a note.
    'numeral-notation': 'errNumeralNotation',
    'undistinguished-diagonal': 'errNoPrincipalDiagonal',
    'not-a-diagonal': 'errNotADiagonal',
    // #1737 (ADR-AG-265) — 2-D's sentences: the diagonal claim refuted, the height asked, the shape missing.
    'diagonal-is-side': 'errDiagonalIsSide',
    'diagonal-none-here': 'errDiagonalNoneHere',
    'ambiguous-height': 'errAmbiguousHeight',
    'shape-not-found': 'errShapeNotFound',
    'ambiguous-side': 'errAmbiguousSide',
    'polygon-not-supported': 'errPolygonNotSupported',
    'already-named': 'errAlreadyNamed',
    'alias-taken': 'errAliasTaken',
    // #2054 / #2061 (ADR-AG-277) — 2-D's sentences (ADR-661): the second name, and the same letter's other coefficient
    'name-taken': error.key === 'name-taken' && error.nameKind === 'length'
      ? (error.declared ? 'errLengthNameTaken_vs' : 'errLengthNameTaken')
      : error.key === 'name-taken' && error.declared ? 'errAngleNameTaken_vs' : 'errAngleNameTaken',
    'measure-contradicts': error.key === 'measure-contradicts' && error.declared ? 'errMeasureContradicts' : 'errMeasureContradictsAlone',
    // #2119 (ADR-684) — 2-D's errors.restatedSize, verbatim; with no line to name, the old conflict sentence
    'radius-contradicts': error.key === 'radius-contradicts' && error.declared ? 'errRadiusContradicts' : 'errConflict',
    // #1963 (ADR-AG-296) — the operator's ruled refusal, in 2-D's «X» סותר את «Y» frame (#1868), naming the statements
    'forced-collinear': 'errForcedCollinear',
    // #2390 (ADR-AG-314) — 2-D's input.tangentsExhaustedContained, byte for byte
    'no-common-tangent': 'errNoCommonTangent',
    // #1154 — a rename understood and declined, each naming what the student wrote
    'rename-bad-name': 'errRenameBadName',
    'rename-same': 'errRenameSame',
    'rename-unknown': 'errRenameUnknown',
    'rename-taken': error.key === 'rename-taken' && error.holder ? 'errRenameTaken' : 'errRenameTakenTool',
    'rename-not-typed': 'errRenameNotTyped',
    'rename-unsafe': error.detail ? 'errRenameUnsafe' : 'errRenameUnsafeFigure',
    // #1303 / #1631 — the swap: a bad name and a tool letter with no faithful form read as the rename's do
    'swap-bad-name': 'errRenameBadName',
    'swap-same': 'errSwapSame',
    'swap-unknown': 'errSwapUnknown',
    'swap-not-typed': 'errRenameNotTyped',
    'swap-unsafe': error.detail ? 'errSwapUnsafe' : 'errSwapUnsafeFigure',
    // #1423 — a refusal that restates an existing letter says the LETTER is the problem
    'unsatisfiable': error.key === 'unsatisfiable' && 'reusedId' in error && error.reusedId ? 'errUnsatisfiableReused' : 'errUnsatisfiable',
    // A save file this tool will not open, named by WHICH of the three reasons (#1087).
    'load-foreign': 'errLoadForeign',
    'load-newer': 'errLoadNewer',
    'load-too-large': 'errLoadTooLarge',
    'load-unreadable': 'errLoadUnreadable',
  }[error.key];
  const crossed: SecondCrossingCurve =
    (error.key === 'third-crossing' || error.key === 'tangent-no-second-crossing') && error.curve ? error.curve : 'circle';
  const near = error.key === 'unknown-reference' && error.nearMiss ? ` ${nearMissText(kind ?? 'curve', error.nearMiss, t)}` : '';
  return t(key, {
    detail: error.detail,
    max: MAX_FIGURE_STATEMENTS,
    existing: t(existingKey(error)),
    claimed: t(KIND_NOUN_KEY[kind ?? 'curve']),
    noun: t(KIND_NOUN_KEY[kind ?? 'curve']),
    numNoun: t(NUMERAL_NOUN_KEY[kind ?? 'curve']),
    candidates: candidates.map((n) => `${theNoun} ${n}`).join(', '),
    example: candidates.length > 0
      ? ambiguousCurveExample(error.detail, theNoun, candidates[0])
      : 'example' in error ? (error.example ?? '') : '',
    found: host ? host.found : 0,
    options: error.key === 'ambiguous-angle' && error.options
      ? error.options.map((o) => `∠${o}`).join(', ')
      : error.key === 'ambiguous-height' && error.options
        ? error.options.join(', ')
        : '',
    pair: 'pair' in error ? (error.pair ?? '') : '',
    range: error.key === 'out-of-domain' && error.domain ? rangeText(error.domain, t) : '',
    holder: 'holder' in error ? (error.holder ?? '') : '',
    first: error.key === 'crossing-already-named' && error.operands
      ? error.operands[0]
      : error.key === 'ambiguous-height' && error.options
        ? (error.options[0] ?? '')
        : '',
    second: error.key === 'crossing-already-named' && error.operands ? error.operands[1] : '',
    other: 'other' in error ? error.other : '',
    line: error.key === 'third-crossing' ? (error.line ?? '') : '',
    a: error.key === 'third-crossing' ? (error.a ?? '') : '',
    b: error.key === 'third-crossing' ? (error.b ?? '') : '',
    id: error.key === 'tangent-no-second-crossing' ? (error.id ?? '') : '',
    curve: t(THE_NOUN_KEY[crossed]),
    aCurve: t(A_NOUN_KEY[crossed]),
    toCurve: t(TO_THE_NOUN_KEY[crossed]),
    reusedId: 'reusedId' in error ? (error.reusedId ?? '') : '',
    definedBy: 'definedBy' in error ? (error.definedBy ?? '') : '',
    all: error.key === 'split-statements' ? numbered(error.parts) : '',
    triangle: error.key === 'split-statements' && error.teach ? error.teach.triangle : '',
    angle: error.key === 'split-statements' && error.teach ? error.teach.angle : '',
    // #1947 (ADR-AG-301) — the taught pair is items (1) and (2); the line's further parts continue the SAME list from (3)
    more: error.key === 'split-statements' && error.teach && error.parts.length > 2 ? `  ${numbered(error.parts.slice(2), 3)}` : '',
    // #1554 ruling 1 (ADR-AG-198): the two nouns, in each locale's spelling (the registry key is the Hebrew).
    shapeHe: 'shape' in error ? (error.shape ?? '') : '',
    polygon: 'polygon' in error ? (error.polygon ?? '') : '',
    // #1963: several declaring lines read «X», «Y» ו-«Z» inside the template's own guillemets.
    declared: error.key === 'forced-collinear'
      ? joinAnd(error.declaredLines ?? [], '», «', `»${t('listAnd')}«`)
      : 'declared' in error ? (error.declared ?? '') : '',
    points: error.key === 'forced-collinear' ? joinAnd(error.collinear ?? [], ', ', t('listAnd')) : '',
    forcedHe: 'forced' in error ? (error.forced ?? '') : '',
    shapeEn: 'shape' in error ? enNoun(error.shape) : '',
    forcedEn: 'forced' in error ? enNoun(error.forced) : '',
    actualHe: error.key === 'shape-excluded' ? (error.actual ?? '') : '',
    statedHe: error.key === 'shape-excluded' ? (error.stated ?? '') : '',
    actualEn: error.key === 'shape-excluded' ? enNoun(error.actual) : '',
    statedEn: error.key === 'shape-excluded' ? enNoun(error.stated) : '',
    nameOf: error.key === 'name-taken' ? (error.nameOf ?? '') : '',
    what: error.key === 'measure-contradicts' ? (error.what ?? '') : '',
    labels: error.key === 'llm-dropped' || error.key === 'llm-invented-existing' ? error.labels : '',
    decimal: error.key === 'mixed-number' ? (error.decimal ?? '') : '',
    sum: error.key === 'mixed-number' ? error.sum : '',
    product: error.key === 'mixed-number' ? error.product : '',
    role: error.key === 'ambiguous-role-side' ? t(error.role === 'leg' ? 'roleWordLeg' : 'roleWordBase') : '',
    side: error.key === 'bisector-is-side' ? (error.pair ?? '') : '',
    vertex: error.key === 'bisector-is-side' ? (error.vertex ?? '') : '',
    polygonNoun: error.key === 'bisector-is-side' ? t(polygonNounKey(error.polygonKind)) : '',
  }) + near;
}
