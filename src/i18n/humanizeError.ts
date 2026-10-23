/**
 * Turn a raw engine error string into a clear, student-facing message.
 *
 * The engine (`evaluate.ts`, `step.ts`, `apply.ts`, `geoStore.ts`) emits precise but
 * *technical English* diagnostics — written for us, not for a 17-year-old (e.g.
 * "over-constrained: |AC| = 9 cannot hold"). Those strings are surfaced verbatim in
 * the error banner and the broken-step tooltip. This is the one humanising layer: it
 * pattern-matches each known error SHAPE, pulls out the dynamic parts (point names,
 * the constraint description, values), and returns a translated explanation.
 *
 * Design (deliberately zero-risk to the engine):
 *  - It is a PURE UI-layer consumer — the engine keeps emitting exactly what it does
 *    today. No engine error model is restructured.
 *  - Anything that does NOT match a known shape renders the FLOOR sentence (`errors.floor`, #2028,
 *    ADR-W-130): «משהו השתבש בבניית השורה הזאת…». Engine text is never shown raw in English and never
 *    spliced into a mixed-language line (the operator's ruling of 2026-10-13). So does a matched shape
 *    whose engine-derived value still carries an engine token after {@link sanitizeIds}
 *    (`shell/studentText` `hasEngineToken`). The raw string stays where it is recorded (the debug log,
 *    the usage events), so a floor case is still diagnosable.
 *  - The symbolic constraint fragment (`|AC| = 9`, `∠DOE = 2·∠COE`, `E, D, O collinear`)
 *    is kept as-is inside the translated wrapper — it is locale-neutral and readable to
 *    an Israeli student, exactly as the verifier messages (`figure.v.constraint`) already
 *    embed `describeConstraint` output.
 *
 * Keep the patterns in sync with the error sites catalogued in the engine; the unit
 * test (`__tests__/humanize-error.test.ts`) asserts every current shape is covered.
 */

import { formatMeasure } from '@/format';
import { hasEngineToken, labelsIn, numbersIn, type StudentVocabulary } from '../../shell/studentText';
import { PARAM_KINDS, parseEngineError, type EngineError, type ParamKind } from '@/engine/errors';
import type { CircleRef } from '@/engine';
import { circleTokenResolver, wordCircleSlots, type CircleRefs } from './circleText';

/**
 * #2305 ([ADR-755](../../docs/06-decisions.md#adr-755)): a circle's TEXT TOKEN (its id, or the letters {@link sanitizeIds}
 * leaves of it) → its reference, so a circle slot is worded through `circleText`. Absent ⇒ every circle keeps its letter.
 */
export type CircleResolver = (token: string) => CircleRef | undefined;
const NO_CIRCLES: CircleResolver = () => undefined;
/** The resolver for a figure's `circleRefs` — what a caller holding the construction passes to {@link explainError}. */
export const circleResolver = (refs: CircleRefs | undefined): CircleResolver => circleTokenResolver(refs, sanitizeIds);

/**
 * #197 Am. 8 — THE tangents-exhausted sentence for a pair's mutual position and the asked kind (disjoint 4, externally
 * tangent 3, intersecting 2, internally tangent 1, contained 0). One mapping for both seats that refuse a common tangent
 * beyond what the pair has: the parser's deterministic refusal (`decideDeterministic`) and, since #2428
 * ([ADR-741](../../docs/06-decisions.md#adr-741)), the engine's stage-0 guard (`commonTangentCapacityError`).
 */
export function tangentsExhaustedKey(kind: 'external' | 'internal' | 'any', position?: 'disjoint' | 'ext-tangent' | 'intersecting' | 'int-tangent' | 'contained', hint?: 'at-touch'): string {
  return hint === 'at-touch' ? 'input.tangentsExhaustedTouch'
    : position === 'contained' ? 'input.tangentsExhaustedContained'
    : position === 'int-tangent' ? (kind === 'internal' ? 'input.tangentsExhaustedNoInternal' : 'input.tangentsExhaustedIntTangent')
    : position === 'intersecting' ? (kind === 'internal' ? 'input.tangentsExhaustedNoInternal' : 'input.tangentsExhaustedIntersecting')
    : position === 'ext-tangent' ? (kind === 'external' ? 'input.tangentsExhaustedExternal' : kind === 'internal' ? 'input.tangentsExhaustedTouchTaken' : 'input.tangentsExhaustedExtTangent')
    : kind === 'external' ? 'input.tangentsExhaustedExternal'
    : kind === 'internal' ? 'input.tangentsExhaustedInternal'
    : 'input.tangentsExhaustedAny';
}

/** The subset of i18next's `t` we need — a key plus interpolation params → string. */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;


/**
 * Turn INTERNAL object ids + raw floats into student-facing text (#200, ADR-393). Engine errors embed
 * implementation ids the student never saw — `circle-O`, `sec-KE`, `chord-CA`, the anonymous scaffold
 * `~A`/`~radw-circle-P`/`@ctr-O`, and 16-digit floats. Run FIRST, so both the matched-pattern params and
 * the match itself are clean (an unmatched message renders the floor sentence, #2028):
 *   - a long float → display precision (the #164 shared formatter);
 *   - a named-object id → the student's LETTERS (`circle-O` → `O`, `sec-KE` → `KE`, `@ctr-O` → `O`);
 *   - an anonymous `~`-scaffold (a helper point the student never named) → a generic ⟨…⟩ placeholder — its
 *     raw id is meaningless to the student (naming the STEP that made it needs the figure, out of scope here).
 */
export function sanitizeIds(s: string): string {
  return s
    .replace(/-?\d+\.\d{3,}/g, (m) => formatMeasure(parseFloat(m))) // 1.0583005… → 1.06
    .replace(/~[A-Za-z0-9'-]+/g, '⟨…⟩') // anonymous scaffold points/witnesses — suppress (before prefix-strip)
    .replace(/@ctr-([A-Za-z0-9']+)/g, '$1') // an anonymous centre token → its circle's letter
    .replace(/\b(?:tanaux|circle|chord|perp|line|arc|poly|seg|bis|sec|tan|foot|mid)-([A-Za-z][A-Za-z0-9']*)/g, '$1'); // circle-O → O
}

/**
 * Translate the WORDS a constraint description can contain (#413).
 *
 * `describeConstraint` emits two kinds of fragment. Most are locale-neutral symbols a 17-year-old in
 * Israel reads unchanged — `|AC| = 9`, `∠DOE = 2·∠COE`, `AB ∥ CD`, `AB ⟂ CD` — and this module's design
 * deliberately keeps those as-is. But a handful are English WORDS, and those reached the student inside a
 * Hebrew sentence: «לא ניתן: הנתון **H, C, D collinear** סותר נתון קודם» (operator screenshot,
 * 2026-07-29). The engine cannot translate them itself — it is pure and must not import i18n (the
 * `engine ← replay ← store` layering) — so the fragment's vocabulary is translated HERE, at the one
 * humanising layer, the same place the wrapper sentence is already translated.
 *
 * The list below is the COMPLETE vocabulary `describeConstraint` can produce; `humanize-error.test.ts`
 * holds a compile-time-exhaustive fixture (a `Record` over every `Constraint['type']`) and asserts no
 * multi-letter lowercase Latin run survives this pass — so a new constraint kind whose description
 * introduces a new word fails the build or the test rather than leaking silently.
 *
 * Longest-first: `coincides with its constructed target` must be tried before `coincides with`.
 *
 * An entry may name the PARAMS its capture groups fill (#2112, ADR-698): `radius(O)` → «רדיוס מעגל O», the circle's
 * letter interpolated into the word, since Hebrew puts the noun phrase around it. Since #2305 (ADR-755) every such param
 * is a CIRCLE SLOT, worded through `circleText` («רדיוס המעגל הפנימי» for one of a concentric pair).
 */
const DESC_WORDS: [RegExp, string, string[]?][] = [
  [/\bradius\(([^()]+)\)/g, 'errors.desc.radiusOf', ['circle']],
  [/\bcoincides with its constructed target\b/g, 'errors.desc.coincidesTarget'],
  [/\bcoincides with\b/g, 'errors.desc.coincidesWith'],
  [/\bin order on a line\b/g, 'errors.desc.inOrderOnALine'],
  [/\bconcyclic\b/g, 'errors.desc.concyclic'],
  [/\bcollinear\b/g, 'errors.desc.collinear'],
  [/\barea\(/g, 'errors.desc.areaOf'],
  [/\bperimeter\(/g, 'errors.desc.perimeterOf'],
];

/**
 * #1470 ([ADR-549](../../docs/06-decisions.md#adr-549)) — the vocabulary of the SIDE STATEMENTS
 * `sideImpossibility` names (`E on circle O`, `E outside triangle ABC`, `C, D on different sides of AB`).
 * Its wire message is the ADR-540 `impossible: X contradicts Y` shape, and both halves are the student's
 * own statements — so, like a constraint description, they are translated here, word group by word group,
 * and the same #413 property holds: no English word survives (`humanize-error.test.ts`). Longest-first
 * where one phrase could begin another.
 */
const STATEMENT_WORDS: [RegExp, string, string[]?][] = [
  // #2305 (ADR-755): a circle statement captures the circle's token as a CIRCLE SLOT — «על המעגל הפנימי», not «על המעגל O-2».
  [/\bis the centre of circle (\S+)/g, 'errors.stmt.centreOfCircle', ['circle']],
  [/\bis the midpoint of\b/g, 'errors.stmt.midpointOf'],
  [/\bis a vertex of\b/g, 'errors.stmt.vertexOf'],
  [/\bon different sides of\b/g, 'errors.stmt.differentSidesOf'],
  [/\bon the same side of\b/g, 'errors.stmt.sameSideOf'],
  [/\boutside circle (\S+)/g, 'errors.stmt.outsideCircle', ['circle']],
  [/\binside circle (\S+)/g, 'errors.stmt.insideCircle', ['circle']],
  [/\bon circle (\S+)/g, 'errors.stmt.onCircle', ['circle']],
  [/\boutside triangle\b/g, 'errors.stmt.outsideTriangle'],
  [/\binside triangle\b/g, 'errors.stmt.insideTriangle'],
  [/\boutside polygon\b/g, 'errors.stmt.outsidePolygon'],
  [/\binside polygon\b/g, 'errors.stmt.insidePolygon'],
  [/\bon segment\b/g, 'errors.stmt.onSegment'],
  [/\bon line\b/g, 'errors.stmt.onLine'],
];

/** Replace every English word of the constraint (and side-statement) vocabulary with its translation. Pure; unknown text passes through.
 *  `circles` (#2305) words each captured circle slot; without it every circle keeps its letter. */
export function translateConstraintWords(s: string, t: Translate, circles: CircleResolver = NO_CIRCLES): string {
  let out = s;
  const slotted = (names: string[] | undefined, g: string[]) => {
    if (!names) return undefined;
    const ps = Object.fromEntries(names.map((n, i) => [n, g[i + 1]]));
    return wordCircleSlots(ps, names, (slot) => circles(ps[slot]), t);
  };
  for (const [re, key, names] of DESC_WORDS) out = out.replace(re, (...g: string[]) => t(key, slotted(names, g)));
  // A statement phrase is a FRAGMENT of the sentence the caller renders: no bidi pass of its own (circleText's rule),
  // so the sentence's single pass still isolates its letters (#464 — an isolate in a fragment switches the outer pass off).
  for (const [re, key, names] of STATEMENT_WORDS) out = out.replace(re, (...g: string[]) => t(key, { ...slotted(names, g), applyPostProcessor: false }));
  return out;
}

/**
 * The same pass over an i18n params bag — for the verifier's messages, which carry a `describeConstraint`
 * fragment in `params.desc` and are rendered directly with `t(messageKey, params)` rather than through
 * {@link humanizeError}. Values that contain no fragment vocabulary come back identical.
 */
export function translateParams(params: Record<string, string> | undefined, t: Translate, circles: CircleResolver = NO_CIRCLES): Record<string, string> | undefined {
  if (!params) return params;
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, translateConstraintWords(v, t, circles)]));
}

/**
 * #2201 phase 3a ([ADR-756](../../docs/06-decisions.md#adr-756)) — ONE WORDING of an engine refusal: its key (the
 * representative one, and every key a variant can pick), and how it treats the student's own sentences. The table is
 * the static half the ratchets read; {@link wordingOf}'s `switch (e.code)` is the dynamic half that picks a wording
 * and fills its params from the variant's fields. Before phase 3a both halves were one regex table over the engine's
 * English (`PATTERNS`); the regexes now live with the engine that writes the sentence (`src/engine/errors.ts`).
 */
export interface Wording {
  key: string;
  /** Every key the variant can pick, when it picks among several (read by the ratchets). */
  keys?: readonly string[];
  /**
   * #943 — this refusal's honest SUBJECT is the student's own sentence, not the engine fragment.
   *
   * The rule, not a list: a template earns the flag when a student reading it cannot tell WHICH of
   * their sentences was rejected — because the subject is a lowered-constraint fragment («D coincides
   * with its constructed target») or there is no subject at all («I couldn't compute a final
   * position»). A template whose subject is already a letter the student typed (`alreadyDefined`'s
   * `{{id}}`, `cannotPlaceOnSegment`'s `{{id}}`/`{{seg}}`, `sameSpot`'s `{{a}}`/`{{b}}`) identifies
   * itself and does NOT take the flag — see the ADR for the full audit.
   *
   * When set AND a sentence is supplied, {@link humanizeError} renders the `_said` variant of the key,
   * which makes the sentence the subject and demotes the engine fragment to a reason clause. With no
   * sentence available the base key renders exactly as it does today.
   */
  saysSubject?: true;
  /**
   * #943 half B ([ADR-508](../../docs/06-decisions.md#adr-508)) — this refusal can also name the OTHER
   * side: the earlier given the statement conflicts with. The fold appends a structured `[vs #<index>]`
   * tail to the status when a single earlier statement's removal restores feasibility; the display
   * layer resolves the index to that statement's words (`otherUtteranceForError`) and hands it here as
   * `other`. With both a sentence and an other, the `_said_vs` variant renders («X» סותר את «Y»); with
   * no other, the `_said` variant renders exactly as before — the fold names none when several givens
   * are jointly at fault, and the wording must not pretend otherwise.
   */
  namesOther?: true;
  /**
   * #2023 ([ADR-661](../../docs/06-decisions.md#adr-661)) — this refusal names the EARLIER LINE but not the refused
   * sentence: its own subject (the angle or segment, in the student's letters) already identifies itself, as
   * `shapeExcluded`'s does, so it is not the «X» סותר את «Y» frame `namesOther` stands for. With an `other`, the `_vs`
   * variant renders (`{{other}}` only); without one, the base key. Kept apart from `namesOther` so the #943 ratchet —
   * every `_said_vs` quotes BOTH statements — stays exact, and its own ratchet (`OTHER_LINE_KEYS`) holds `{{other}}`.
   */
  namesOtherLine?: true;
  /**
   * #2177 ([ADR-733](../../docs/06-decisions.md#adr-733)) — the sentence already ends with its ONE next step (#1995 3b:
   * name the statement, give one next step), so {@link explainError} does not append the generic retry hint after it —
   * the rule the floor sentence already follows (#2028).
   */
  nextStep?: true;
  /**
   * #2305 ([ADR-755](../../docs/06-decisions.md#adr-755)) — the params that name ONE circle (its token: the id, or what
   * {@link sanitizeIds} leaves of it). Each is worded through `circleText` — the template takes the noun phrase
   * (`{{circle}}` «מעגל O», `{{circleThe}}` «המעגל O», `{{circleTo}}` «למעגל O»; slots `c1`+`c2` also give `{{circlePair}}`) — so
   * one of a concentric pair reads «המעגל הפנימי». Only a DECLARED slot resolves: a point letter is never renamed.
   */
  circleParams?: readonly string[];
}

/** The wording table — one entry per sentence family the student can read. Exported for the coverage gate (#983). */
export const WORDINGS = {
  // lower.ts reservedAmbiguity (#2177, ADR-733): names the circles and the one next step, never a pick.
  reservedRadius: { key: 'errors.reservedRadiusAmbiguous', keys: ['errors.reservedRadiusAmbiguousSized', 'errors.reservedRadiusAmbiguous'], saysSubject: true, nextStep: true },
  // metricFeasibility.ts (#420, ADR-417): TWO wordings — the curriculum's triangle sentence («סכום שתי צלעות תמיד גדול
  // מהצלע השלישית», operator 2026-07-29) for one intermediate point, the straight-segment principle for a longer cycle.
  metric: { key: 'errors.metricImpossible', keys: ['errors.metricImpossibleTriangle', 'errors.metricImpossiblePath'] },
  // metricFeasibility.ts (#1329, ADR-538): the triangle's 180° sentence, or a longer ring's own bound.
  angleSum: { key: 'errors.angleSumImpossible', keys: ['errors.angleSumImpossibleTriangle', 'errors.angleSumImpossiblePolygon'] },
  // metricFeasibility.ts (#1712, ADR-587): a stated measure outside its range — the statement is the student's own.
  outOfRange: { key: 'errors.angleOutOfRange', keys: ['errors.angleOutOfRange', 'errors.lengthNegative'] },
  // metricFeasibility.ts (#1335, ADR-540) and sideFeasibility.ts (#1470, ADR-549): both halves are the student's own.
  bound: { key: 'errors.boundImpossible' },
  // metricFeasibility.ts (#1441): the hypotenuse («היתר») at 90°, the longest-side principle for an obtuse angle.
  hypotenuse: { key: 'errors.hypotenuseImpossible', keys: ['errors.hypotenuseImpossible', 'errors.obtuseSideImpossible'] },
  unknownCircle: { key: 'errors.unknownCircle' }, // step.ts danglingCircleError (#186)
  unresolvedDeps: { key: 'errors.unresolvedDeps' },
  undefinedPoints: { key: 'errors.undefinedPoints' }, // #1411 (ADR-577): the absent operands, never the row's own new point
  nonFinite: { key: 'errors.nonFinite', saysSubject: true },
  unknownPoint: { key: 'errors.unknownPoint', saysSubject: true },
  // step.ts collapsedPolygonError (#2085 item 2, ADR-643): a straight corner of a pentagon or more — the n-gon would
  // become an (n−1)-gon, the two nouns from one table in the locale (operator ruling 2026-10-14).
  polygonCorner: { key: 'errors.polygonCornerStraight', saysSubject: true },
  // step.ts collapsedPolygonError (#1849, ADR-602; #2064 B2): the line contradicts «משולש ABC», because a flat line is
  // not a triangle (operator ruling 2026-10-07) — the noun is the polygon's own, counted from the vertex list.
  polygonFlat: { key: 'errors.polygonFlatTriangle', keys: ['errors.polygonFlatTriangle', 'errors.polygonFlatQuad', 'errors.polygonFlatPolygon'], saysSubject: true, namesOther: true },
  // the over-constrained frame (the #1868 ruled «X» סותר את «Y») with a ruled REASON sentence: cyclicFeasibility.ts
  // (#1918 ADR-607; #2099 ADR-651), heightFeasibility.ts (#2117 ADR-718), radiusFeasibility.ts (#2239 ADR-692, #2206
  // ADR-713).
  overConstrainedReason: { key: 'errors.overConstrained', saysSubject: true, namesOther: true },
  // evaluate.ts circumcentre backstop (#2099, ADR-651): the same frame and reason, but the fold names no other side for it
  circumcircleReason: { key: 'errors.overConstrained', saysSubject: true },
  // apply.ts shapeExclusionError (#1985, ADR-619): the figure's own noun and the stated one — it identifies itself.
  shapeExcluded: { key: 'errors.shapeExcluded' },
  // replay/core.ts (#2023, ADR-661): the operator's verbatim «כבר יש שם» sentences (2026-10-13).
  nameTaken: { key: 'errors.angleNameTaken', keys: ['errors.angleNameTaken', 'errors.lengthNameTaken'], namesOtherLine: true },
  // radiusFeasibility.ts commonTangentCapacityError (#2428, ADR-741): the parser's own tangents-exhausted sentences.
  tangentsExhausted: { key: 'input.tangentsExhaustedIntTangent', keys: ['input.tangentsExhaustedIntTangent', 'input.tangentsExhaustedNoInternal', 'input.tangentsExhaustedTouchTaken', 'input.tangentsExhaustedContained'] },
  // lower.ts letterSystem (#2165 + #2119, ADR-681): the over-constrained frame WITHOUT a reason clause (2026-10-15).
  restatedSize: { key: 'errors.restatedSize', saysSubject: true, namesOther: true, circleParams: ['circle'] },
  // evaluate.ts — `over-constrained: |AC| = 9 cannot hold`, with the fold's optional `[vs #i]` (#943 half B)
  overConstrained: { key: 'errors.overConstrained', saysSubject: true, namesOther: true },
  // replay/core.ts (#855, ADR-476): the SAMPLED-VALUE degradation — the conflict is with a placement the tool invented.
  notDetermined: { key: 'errors.notDeterminedHere' },
  notDeterminedBare: { key: 'errors.notDeterminedHereBare' },
  thirdCrossing: { key: 'errors.thirdCrossing' }, // #1834 (ADR-729): the line by its two crossings' letters
  tangentNoSecondCrossing: { key: 'errors.tangentNoSecondCrossing' },
  towardAtCentre: { key: 'errors.towardAtCentre' },
  cannotPlaceOnSegment: { key: 'errors.cannotPlaceOnSegment' },
  tangentAtCentre: { key: 'errors.tangentAtCentre', circleParams: ['circle'] },
  circlesDontMeet: { key: 'errors.circlesDontMeet', circleParams: ['c1', 'c2'] },
  sameSpot: { key: 'errors.sameSpot' },
  // step.ts — #966 (ADR-499): naming a SIDE, and naming a diagonal of a shape that has none.
  diagonalIsSide: { key: 'errors.diagonalIsSide' },
  diagonalNone: { key: 'errors.diagonalNoneHere' },
  alreadyDefined: { key: 'errors.alreadyDefined' },
  tangentNeedsFixedRadius: { key: 'errors.tangentNeedsFixedRadius' },
  noLongerAvailable: { key: 'errors.noLongerAvailable' },
  // core.ts (#1748 ADR-578; #1994 ADR-667, ruled 2026-10-11): names the ROW and the action, never the reserved points.
  mutedRowOwns: { key: 'errors.mutedRowOwns' },
  unboundVariable: { key: 'errors.unboundVariable' }, // core.ts (#926)
  unenforceableRelation: { key: 'errors.unenforceableRelation' }, // core.ts (#1658, ADR-562)
  // step.ts degenerateConstraintError (ADR-202 + Am.) — the whole NaN-by-id class
  degenerateSegment: { key: 'errors.degenerateSegment' },
  degenerateAngle: { key: 'errors.degenerateAngle' },
  degenerateCollinear: { key: 'errors.degenerateCollinear' },
} as const satisfies Record<string, Wording>;
export type WordingId = keyof typeof WORDINGS;

/** A wording chosen for one variant: which one, the key it renders, and the params from the variant's fields. */
export interface Worded {
  wording: WordingId;
  key: string;
  params?: Record<string, string>;
  /**
   * #1918 (ADR-607) — a param that is itself a TRANSLATED sentence: `key` rendered with each of `params` resolved as
   * a translation key. Lets a refusal reuse a ruled frame (`errors.overConstrained_said_vs`) with a ruled reason
   * clause, instead of a second copy of the frame. `letters` (#2099, ADR-651) are params interpolated AS-IS — the
   * student's own point letters, which are not translation keys.
   */
  nested?: Record<string, { key: string; params: Record<string, string>; letters?: Record<string, string> }>;
  /**
   * #1985 ([ADR-619](../../docs/06-decisions.md#adr-619)) — a param that is a WORD the engine names in English
   * and the student must read in Hebrew (a shape noun). Each value is a translation KEY, resolved with `t`, so
   * the noun comes from the one place the app already names shapes (`shapes.name.*`) instead of a second list.
   */
  paramKeys?: Record<string, string>;
}

const one = (wording: WordingId, rest: Omit<Worded, 'wording' | 'key'> & { key?: string } = {}): Worded => ({ wording, key: rest.key ?? WORDINGS[wording].key, ...rest });
const joined = (ids: readonly string[]) => ids.join(', ');

/**
 * THE SWITCH: a parsed engine refusal → its wording and params, or `null` for the floor (a variant no ruled sentence
 * says honestly — before phase 3a those were the strings no pattern matched). Total over {@link EngineError}: a new
 * variant without an arm fails `tsc` at the `never` below (`engine-error-total.test.ts` asserts it too).
 */
export function wordingOf(e: EngineError): Worded | null {
  switch (e.code) {
    case 'reserved-radius-ambiguous':
      return one('reservedRadius', { key: e.sized ? 'errors.reservedRadiusAmbiguousSized' : 'errors.reservedRadiusAmbiguous', params: { letter: e.letter, circles: joined(e.circles), next: e.circles[e.circles.length - 1] } });
    case 'metric-impossible': {
      const via = joined(e.via);
      return one('metric', { key: e.via.length > 1 ? 'errors.metricImpossiblePath' : 'errors.metricImpossibleTriangle', params: { seg: `${e.a}${e.b}`, value: e.value, sum: e.sum, a: e.a, b: e.b, via, sides: `|${e.a}${via}| + |${via}${e.b}|` } });
    }
    case 'angle-sum-impossible':
      return one('angleSum', { key: e.bound === '180°' ? 'errors.angleSumImpossibleTriangle' : 'errors.angleSumImpossiblePolygon', params: { poly: e.polygon, sum: e.sum, bound: e.bound, angles: e.angles } });
    case 'measure-out-of-range':
      return one('outOfRange', { key: e.measure === 'angle' ? 'errors.angleOutOfRange' : 'errors.lengthNegative', params: { given: e.given } });
    case 'bound-impossible':
      return one('bound', { params: { value: e.value, bound: e.bound } });
    case 'obtuse-side-impossible':
      return one('hypotenuse', { key: e.deg === '90' ? 'errors.hypotenuseImpossible' : 'errors.obtuseSideImpossible', params: { v: e.vertex, deg: e.deg, hyp: e.hyp, hypVal: e.hypVal, leg: e.leg, legVal: e.legVal } });
    case 'unknown-circle':
      return one('unknownCircle', { params: { center: e.center } });
    case 'unresolved-deps':
      return one('unresolvedDeps', { params: { ids: joined(e.ids) } });
    case 'undefined-points':
      return one('undefinedPoints', { params: { ids: joined(e.ids) } });
    case 'non-finite':
      return one('nonFinite');
    case 'unknown-point':
      return one('unknownPoint', { params: { what: e.what } });
    case 'polygon-collapsed': {
      const n = e.vertices.length;
      const poly = e.vertices.join('');
      // #2064 B2: a straight corner of a quadrilateral keeps the flat sentence, with its three vertices as the points
      if (e.corner && n >= 5 && n <= 12)
        return one('polygonCorner', { params: { poly, points: joined(e.corner), what: e.what ?? '' }, paramKeys: { polyNoun: `errors.ngonDefinite.${n}`, lessNoun: `errors.ngonIndefinite.${n - 1}` } });
      return one('polygonFlat', { key: n === 3 ? 'errors.polygonFlatTriangle' : n === 4 ? 'errors.polygonFlatQuad' : 'errors.polygonFlatPolygon', params: { poly, points: joined(e.corner ?? e.vertices), what: e.what ?? '' } });
    }
    case 'not-cyclic':
      return one('overConstrainedReason', { nested: { what: { key: 'errors.notCyclicReason', params: { shape: `input.shapeNoun.${e.shape}`, forced: `input.shapeNoun.${e.forced}` } } } });
    case 'diagonal-height':
      return one('overConstrainedReason', { nested: { what: { key: 'errors.diagonalNoSideReason', params: { shape: `input.shapeNounDefinite.${e.shape}` }, letters: { d: e.diagonal } } } });
    case 'collinear-circle': {
      const [a, b, c] = e.points;
      return one('overConstrainedReason', { nested: { what: { key: 'errors.collinearCircleReason', params: {}, letters: { a, b, c } } } });
    }
    case 'circumcircle-collinear':
      // the NUMERIC backstop behind the structural prover above: the same ruled reason; the fold names no other side
      return one('circumcircleReason', { nested: { what: { key: 'errors.collinearCircleReason', params: {}, letters: { a: e.a, b: e.b, c: e.c } } } });
    case 'shape-excluded':
      return one('shapeExcluded', { paramKeys: { actual: `input.shapeNoun.${e.actual}`, stated: `input.shapeNoun.${e.stated}` } });
    case 'name-taken':
      return one('nameTaken', { key: e.measure === 'angle' ? 'errors.angleNameTaken' : 'errors.lengthNameTaken', params: { name: e.name, symbol: e.symbol } });
    case 'equal-nested':
      return one('overConstrainedReason', { nested: { what: { key: `errors.equalNestedReason.${e.relation}`, params: {} } } });
    case 'tangents-exhausted':
      return one('tangentsExhausted', { key: tangentsExhaustedKey(e.kind, e.position) });
    case 'restated-size':
      return one('restatedSize', { params: { circle: e.circle, value: e.value } });
    case 'over-constrained':
      return one('overConstrained', { params: { what: e.what } });
    case 'not-determined':
      return e.who ? one('notDetermined', { params: { who: joined(e.who), what: e.what } }) : one('notDeterminedBare', { params: { what: e.what } });
    case 'third-crossing':
      // the point being placed is not named (it may be an internal id); the line is the two crossings' own letters
      return one('thirdCrossing', { params: { line: `${e.a}${e.b}`, a: e.a, b: e.b } });
    case 'tangent-no-second-crossing':
      return one('tangentNoSecondCrossing', { params: { id: e.id } });
    case 'toward-at-centre':
      return one('towardAtCentre', { params: { id: e.id, toward: e.toward } });
    case 'cannot-place-on-segment':
      return one('cannotPlaceOnSegment', { params: { id: e.id, seg: e.seg, what: e.what } });
    case 'tangent-at-centre':
      return one('tangentAtCentre', { params: { circle: e.circle } });
    case 'circles-dont-meet':
      return one('circlesDontMeet', { params: { id: e.id, c1: e.c1, c2: e.c2 } });
    case 'same-spot':
      return one('sameSpot', { params: { a: e.a, b: e.b } });
    case 'diagonal-is-side':
      return one('diagonalIsSide', { params: { pair: e.pair, shape: e.shape } });
    case 'diagonal-none':
      return one('diagonalNone', { params: { pair: e.pair, shape: e.shape } });
    case 'already-defined':
      return one('alreadyDefined', { params: { id: e.id } });
    case 'tangent-needs-fixed-radius':
      return one('tangentNeedsFixedRadius');
    case 'no-longer-available':
      return one('noLongerAvailable', { params: { ids: joined(e.ids) } });
    case 'muted-row-owns':
      // #1994 (ADR-667): the refusal names the ROW and the action — the point list is dropped
      return one('mutedRowOwns', { params: { row: e.row } });
    case 'unbound-variable':
      return one('unboundVariable', { params: { name: e.name } });
    case 'unenforceable-relation':
      return one('unenforceableRelation', { params: { names: joined(e.names) } });
    case 'degenerate-segment':
      return one('degenerateSegment', { params: { rel: e.rel, seg: e.seg } });
    case 'degenerate-angle':
      return one('degenerateAngle', { params: { angle: e.angle } });
    case 'degenerate-collinear':
      return one('degenerateCollinear', { params: { id: e.id } });
    // No ruled sentence says these honestly (none ever had one): the floor (#2028, ADR-W-130).
    case 'over-constrained-unnamed':
    case 'circles-tangent-only':
    case 'line-misses-circle':
    case 'distance-circles-miss':
    case 'lines-parallel':
    case 'perp-foot-coincide':
    case 'line-points-coincide':
    case 'bisect-opposite':
    case 'radius-not-positive':
    case 'radius-point-at-centre':
    case 'cant-build-yet':
    case 'degenerate-length':
    case 'raw':
      return null;
    default: {
      const unhandled: never = e;
      return unhandled;
    }
  }
}

const flagged = (f: keyof Wording) => Object.values(WORDINGS as Record<string, Wording>).filter((w) => w[f]);
/**
 * The refusal keys whose honest SUBJECT is the student's own sentence (#943) — DERIVED from
 * {@link Wording.saysSubject}, never re-listed. Exported for the ratchet in
 * `__tests__/humanize-error-said.test.ts`, which asserts each one has a `_said` variant in BOTH
 * locales: flagging a new template without writing its strings then fails the suite instead of
 * rendering a raw i18n key at a student.
 */
export const SAID_SUBJECT_KEYS: readonly string[] = [...new Set(flagged('saysSubject').map((w) => w.key))];
/** #943 half B: the keys that can name the OTHER side — each must have a `_said_vs` variant in both locales (the same ratchet). */
export const OTHER_SUBJECT_KEYS: readonly string[] = [...new Set(flagged('namesOther').map((w) => w.key))];
/** #2023 (ADR-661): the keys that name the earlier LINE only — each must have a `_vs` variant carrying `{{other}}` (every key the wording can pick). */
export const OTHER_LINE_KEYS: readonly string[] = [...new Set(flagged('namesOtherLine').flatMap((w) => w.keys ?? [w.key]))];

/** #2028 (ADR-W-130): what {@link humanizeErrorOutcome} produced — the text, and whether it is the floor sentence. */
export interface Humanized {
  text: string;
  /** True when no ruled message could say this honestly: no variant has a wording, or a value carried an engine token. */
  floor: boolean;
  /** True when the message gives its own next step (a wording's `nextStep`, #2177): no retry hint follows it. */
  nextStep?: boolean;
}

/**
 * Translate a raw engine error to a student-facing message. `said` is the student's refused sentence;
 * `other` (#943 half B) the earlier statement it conflicts with, when the fold could name one — both are
 * arguments, never looked up here (ADR-228 Am.6). Returns the text only; {@link humanizeErrorOutcome} says
 * whether it is the floor. `vocab` (#2201 phase 3b) is the figure's — what the student can see and typed
 * (`app/studentVocabulary`); with it every shown value is checked by provenance, without it the text is phase 3a's.
 */
export function humanizeError(raw: string | null | undefined, t: Translate, said?: string, other?: string, circles?: CircleResolver, vocab?: StudentVocabulary): string {
  return humanizeErrorOutcome(raw, t, said, other, circles, vocab).text;
}

/**
 * The display seam's one wording of a refusal (#2028, ADR-W-130): the humanised message, then the
 * «אפשר לנסות סדר אחר…» hint (ADR-228 Am.6) — except after the floor sentence, which already gives its own
 * next step and is ruled as the whole message. Both the banner and the submit pipeline render through this.
 */
export function explainError(raw: string | null | undefined, t: Translate, said?: string, other?: string, circles?: CircleResolver, vocab?: StudentVocabulary): string {
  const { text, floor, nextStep } = humanizeErrorOutcome(raw, t, said, other, circles, vocab);
  return text && !floor && !nextStep ? `${text} ${t('errors.retryHint')}` : text;
}

/** {@link humanizeError}, reporting whether the result is the floor sentence (#2028). */
export function humanizeErrorOutcome(raw: string | null | undefined, t: Translate, said?: string, other?: string, circles: CircleResolver = NO_CIRCLES, vocab?: StudentVocabulary): Humanized {
  if (!raw) return { text: '', floor: false };
  const floor: Humanized = { text: t('errors.floor'), floor: true };
  // Parse the RAW wire into its variant (phase 3a): the engine's own inverse, over its own text — no regex here.
  const e = parseEngineError(raw);
  let worded = wordingOf(e);
  if (!worded) return floor;
  // #2201 phase 3b (ADR-W-130 Am. 1): with the figure's vocabulary, every value the message would SHOW is checked by
  // provenance — the floor, or (c′) the missing point names in place of the engine's arithmetic.
  if (vocab) {
    const checked = provenance(e, worded, vocab, t, said, other);
    if (!checked) return floor;
    worded = checked;
  }
  return render(worded, t, said, other, circles) ?? floor;
}

/** A wording with its params, rendered: the frame the student's sentences pick, or `null` when a value carries an engine token. */
function render(worded: Worded, t: Translate, said: string | undefined, other: string | undefined, circles: CircleResolver): Humanized | null {
  const w: Wording = WORDINGS[worded.wording];
  // Then sanitize each VALUE (#200): every extracted param (`circle: circle-O`) becomes the student's letter, and a
  // token sanitizeIds does not know sends the message to the floor (#2028).
  const params = worded.params && Object.fromEntries(Object.entries(worded.params).map(([k, v]) => [k, sanitizeIds(v)]));
  const nested = worded.nested && Object.fromEntries(Object.entries(worded.nested).map(([k, n]) => [k, { ...n, ...(n.letters ? { letters: Object.fromEntries(Object.entries(n.letters).map(([lk, lv]) => [lk, sanitizeIds(lv)])) } : {}) }]));
  // #2028 (ADR-W-130): a value the ENGINE handed over (never `said`/`other`, the student's own sentences)
  // that still carries an engine token — an anonymous touch point `@f-AB`, a `kind-Id` sanitizeIds does not
  // know — cannot be shown, so the ruled frame around it cannot be either.
  const engineValues = [...Object.values(params ?? {}), ...Object.values(nested ?? {}).flatMap((n) => Object.values(n.letters ?? {}))];
  if (engineValues.some(hasEngineToken)) return null;
  // Translate the constraint vocabulary AFTER parsing, never before: the engine's own sentences key on the very
  // same English words («collinear points must be distinct …»). Every param goes through the pass — it only touches
  // known fragment words, so a non-fragment param (a circle letter, an id) is untouched.
  const paramKeys = worded.paramKeys;
  const translatedRaw =
    params || nested || paramKeys
      ? {
          ...(params ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, translateConstraintWords(v, t, circles)])) : {}),
          // #1918: a sentence param — its own key, each inner param a translation key
          ...(nested ? Object.fromEntries(Object.entries(nested).map(([k, n]) => [k, t(n.key, { ...Object.fromEntries(Object.entries(n.params).map(([pk, pv]) => [pk, t(pv)])), ...n.letters })])) : {}),
          // #1985: a WORD param — the value is a translation key (a shape noun)
          ...(paramKeys ? Object.fromEntries(Object.entries(paramKeys).map(([k, v]) => [k, t(v)])) : {}),
        }
      : undefined;
  // #2305 (ADR-755): the declared circle slots, worded through circleText (a role, or today's letter).
  const translated = translatedRaw && w.circleParams ? wordCircleSlots(translatedRaw, w.circleParams, (k) => circles(translatedRaw[k]), t) : translatedRaw;
  const key = worded.key;
  // #943: the student's own sentence becomes the SUBJECT where the template's own subject cannot
  // identify which statement was refused. Still a pure mapping (ADR-228 Am.6) — the sentence is an
  // argument, not something this layer looks up. A missing/blank `said` renders the base key, which
  // is byte-identical to today, so a fact with no recorded utterance never yields an empty «».
  const sub = said?.trim();
  const oth = other?.trim();
  const done = (text: string): Humanized => ({ text, floor: false, ...(w.nextStep ? { nextStep: true } : {}) });
  // #943 half B: both sides known ⇒ the sentence AND the earlier given it contradicts are the subject.
  if (w.namesOther && sub && oth) return done(t(`${key}_said_vs`, { ...translated, said: sub, other: oth }));
  if (w.namesOtherLine && oth) return done(t(`${key}_vs`, { ...translated, other: oth }));
  if (w.saysSubject && sub) return done(t(`${key}_said`, { ...translated, said: sub }));
  return done(t(key, translated));
}

// ── #2201 phase 3b: provenance at the switch ──────────────────────────────────────────────────────────────────────
const SENTINEL = /(\d+)/g;
const FORMAT_CONTROLS = /[⁦-⁩‎‏]/g;
const COEFFICIENT = /(\d+(?:\.\d+)?)·/g;

/**
 * The fields of `e` the chosen frame actually SHOWS. Each value of a field the check judges is replaced by a sentinel,
 * the variant is worded again (the same arm, the same params) and rendered with the REAL key and frame; a field whose
 * sentinel reaches the text is shown. A field the frame drops (`muted-row-owns`' point list, the `_said_vs` frame's
 * fragment of a collapsed polygon) is never judged: the student does not read it.
 */
function shownFields(e: EngineError, worded: Worded, t: Translate, said: string | undefined, other: string | undefined): Set<string> {
  const kinds = PARAM_KINDS[e.code] as Record<string, ParamKind>;
  const owner: string[] = [];
  const mark = (field: string) => `${owner.push(field) - 1}`;
  const marked: Record<string, unknown> = { ...e };
  for (const [f, k] of Object.entries(kinds)) {
    const v = (e as unknown as Record<string, unknown>)[f];
    if (v === undefined || k === 'key') continue;
    marked[f] = Array.isArray(v) ? v.map(() => mark(f)) : typeof v === 'string' ? mark(f) : v;
  }
  const again = wordingOf(marked as unknown as EngineError);
  const out = new Set<string>();
  if (!again) return out;
  const text = render({ ...again, key: worded.key, wording: worded.wording }, t, said, other, NO_CIRCLES)?.text ?? '';
  for (const m of text.replace(FORMAT_CONTROLS, '').matchAll(SENTINEL)) out.add(owner[Number(m[1])]);
  return out;
}

/**
 * THE PROVENANCE CHECK (ADR-W-130 Am. 1). Every value the message shows is judged by where it came from, never by its
 * shape alone:
 *   (a) an `id` names an object the student can see under that name, or a label they typed — a hidden scaffold
 *       (`tanaux-…`) or a minted point nobody typed or saw (#2151's T) fails, and so does an id whose letters are not a
 *       name (a mint suffix, «O-2», #2461); a declared circle slot passes when the circle is drawn (it is worded by role);
 *   (b) a `composite` angle with a repeated vertex («∠AAB») passes only if the student's sentences contain it (#2345);
 *   (c) a `fragment`'s coefficients («0.5·», «1·») must be numbers the sentences spell, and its labels drawn or typed.
 * (b) and (c) judge only when a sentence is known. A failure is the floor (`null`) — except (c′), the operator's d20
 * ruling (2026-10-23, answer A): the unknown-point sentence is TRUE about the figure, so it keeps its frame and the
 * bracket names the missing point(s) instead of the engine's arithmetic, each one a label the student typed.
 */
function provenance(e: EngineError, worded: Worded, vocab: StudentVocabulary, t: Translate, said: string | undefined, other: string | undefined): Worded | null {
  const sentences = [said, other].filter((x): x is string => !!x?.trim()).join(' ');
  const typedLabels = new Set(labelsIn(`${vocab.typed} ${sentences}`));
  const names = new Set(vocab.names);
  const shown = new Set(vocab.shownIds ?? []);
  const hidden = new Set(vocab.hiddenIds ?? []);
  const spelled = new Set(numbersIn(sentences));
  const w: Wording = WORDINGS[worded.wording];
  const kinds = PARAM_KINDS[e.code] as Record<string, ParamKind>;
  const fields = e as unknown as Record<string, unknown>;
  const idOk = (v: string, circleSlot: boolean): boolean => {
    if (hidden.has(v)) return false;
    if (circleSlot && shown.has(v)) return true;
    const d = sanitizeIds(v);
    return names.has(d) || typedLabels.has(d);
  };
  const failed: { field: string; check: 'a' | 'b' | 'c' }[] = [];
  for (const f of shownFields(e, worded, t, said, other)) {
    const v = fields[f];
    const values = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string');
    switch (kinds[f]) {
      case 'id':
      case 'ids':
        if (values.some((x) => !idOk(x, !!w.circleParams?.includes(f)))) failed.push({ field: f, check: 'a' });
        break;
      case 'composite':
        if (!sentences) break;
        for (const x of values) {
          const ls = labelsIn(x);
          if (x.includes('∠') && ls.length === 3 && (ls[0] === ls[1] || ls[1] === ls[2]) && !sentences.includes(ls.join(''))) failed.push({ field: f, check: 'b' });
        }
        break;
      case 'fragment':
        if (!sentences) break;
        for (const x of values) {
          const untypedCoefficient = [...x.matchAll(COEFFICIENT)].some((m) => !spelled.has(m[1]));
          const unseenLabel = labelsIn(sanitizeIds(x)).some((l) => !names.has(l) && !typedLabels.has(l));
          if (untypedCoefficient || unseenLabel) failed.push({ field: f, check: 'c' });
        }
        break;
      default:
        break;
    }
  }
  if (!failed.length) return worded;
  // (c′) the unknown-point frame is a true sentence: keep it, and name the missing points (each typed by the student)
  if (e.code === 'unknown-point' && failed.every((x) => x.check === 'c')) {
    const missing = [...new Set(labelsIn(sanitizeIds(e.what)).filter((l) => !names.has(l)))];
    if (missing.length && missing.every((l) => typedLabels.has(l))) return { ...worded, params: { what: missing.join(', ') } };
  }
  return null;
}
