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
 *  - Anything that does NOT match a known shape falls through UNCHANGED, so a new or
 *    unrecognised engine message is never *worse* than the current raw text.
 *  - The symbolic constraint fragment (`|AC| = 9`, `∠DOE = 2·∠COE`, `E, D, O collinear`)
 *    is kept as-is inside the translated wrapper — it is locale-neutral and readable to
 *    an Israeli student, exactly as the verifier messages (`figure.v.constraint`) already
 *    embed `describeConstraint` output.
 *
 * Keep the patterns in sync with the error sites catalogued in the engine; the unit
 * test (`__tests__/humanize-error.test.ts`) asserts every current shape is covered.
 */

import { formatMeasure } from '@/format';

/** The subset of i18next's `t` we need — a key plus interpolation params → string. */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

const EMDASH = '—'; // — , used literally in two engine messages

/**
 * Turn INTERNAL object ids + raw floats into student-facing text (#200, ADR-393). Engine errors embed
 * implementation ids the student never saw — `circle-O`, `sec-KE`, `chord-CA`, the anonymous scaffold
 * `~A`/`~radw-circle-P`/`@ctr-O`, and 16-digit floats. Run FIRST, so both the matched-pattern params and
 * the fall-through string are clean:
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
 */
const DESC_WORDS: [RegExp, string][] = [
  [/\bcoincides with its constructed target\b/g, 'errors.desc.coincidesTarget'],
  [/\bcoincides with\b/g, 'errors.desc.coincidesWith'],
  [/\bin order on a line\b/g, 'errors.desc.inOrderOnALine'],
  [/\bconcyclic\b/g, 'errors.desc.concyclic'],
  [/\bcollinear\b/g, 'errors.desc.collinear'],
  [/\barea\(/g, 'errors.desc.areaOf'],
  [/\bperimeter\(/g, 'errors.desc.perimeterOf'],
];

/** Replace every English word of the constraint vocabulary with its translation. Pure; unknown text passes through. */
export function translateConstraintWords(s: string, t: Translate): string {
  let out = s;
  for (const [re, key] of DESC_WORDS) out = out.replace(re, () => t(key));
  return out;
}

/**
 * The same pass over an i18n params bag — for the verifier's messages, which carry a `describeConstraint`
 * fragment in `params.desc` and are rendered directly with `t(messageKey, params)` rather than through
 * {@link humanizeError}. Values that contain no fragment vocabulary come back identical.
 */
export function translateParams(params: Record<string, string> | undefined, t: Translate): Record<string, string> | undefined {
  if (!params) return params;
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, translateConstraintWords(v, t)]));
}

/** One mapping: a regex over the raw error and how to build the translation from its groups. */
interface Pattern {
  re: RegExp;
  key: string;
  /** Pick the key from the match when one shape has several wordings (see the metric-impossibility entry). */
  keyOf?: (m: RegExpMatchArray) => string;
  /** Map the regex match groups to interpolation params for the i18n key. */
  params?: (m: RegExpMatchArray) => Record<string, string>;
}

// Order matters only where one pattern's text is a prefix of another's; each regex below is
// anchored and specific enough that the first match is the right one.
const PATTERNS: Pattern[] = [
  // metricFeasibility.ts (#420, ADR-417) — `impossible: |AC| = 9 exceeds 8, the distance from A to C via B`
  //
  // TWO wordings, because the message must state the geometry that actually applies. With exactly one
  // intermediate point the figure is a TRIANGLE and the curriculum's own sentence is the right one
  // («סכום שתי צלעות תמיד גדול מהצלע השלישית», operator 2026-07-29) — and the two sides can be named from
  // a, b and the intermediate. With a longer cycle (a pinned quadrilateral) that sentence would be false,
  // so the general principle is stated instead: a straight segment is shorter than any other path between
  // its endpoints.
  {
    re: /^impossible: \|(\S+?)\| = (\S+) exceeds (\S+), the distance from (\S+) to (\S+) via (.*)$/,
    key: 'errors.metricImpossible',
    keyOf: (m) => (m[6].includes(',') ? 'errors.metricImpossiblePath' : 'errors.metricImpossibleTriangle'),
    params: (m) => ({
      seg: m[1],
      value: m[2],
      sum: m[3],
      a: m[4],
      b: m[5],
      via: m[6],
      sides: `|${m[4]}${m[6]}| + |${m[6]}${m[5]}|`,
    }),
  },
  // step.ts danglingCircleError (#186) — `circle 'O2' is not defined`
  { re: /^circle '(.+)' is not defined$/, key: 'errors.unknownCircle', params: (m) => ({ center: m[1] }) },

  // evaluate.ts:851 — `unresolved dependencies for: A, B, circle-O`
  { re: /^unresolved dependencies for: (.+)$/, key: 'errors.unresolvedDeps', params: (m) => ({ ids: m[1] }) },

  // evaluate.ts:855 — `non-finite position computed`
  { re: /^non-finite position computed$/, key: 'errors.nonFinite' },

  // evaluate.ts:887 — `|AB| = |AD| references an unknown point`
  { re: /^(.+) references an unknown point$/, key: 'errors.unknownPoint', params: (m) => ({ what: m[1] }) },

  // evaluate.ts:891 — `over-constrained: |AC| = 9 cannot hold`
  { re: /^over-constrained: (.+) cannot hold$/, key: 'errors.overConstrained', params: (m) => ({ what: m[1] }) },

  // replay/core.ts (#855, ADR-476) — the SAMPLED-VALUE degradation of the row above. The conflict is with
  // a placement the tool invented, so the message must not read as «your given contradicts an earlier
  // one»; it says which objects are still free and points at "show another configuration".
  {
    re: /^not determined: (.+) (?:is|are) still free, so (.+) cannot be judged in this configuration$/,
    key: 'errors.notDeterminedHere',
    params: (m) => ({ who: m[1], what: m[2] }),
  },
  { re: /^not determined: (.+) cannot be judged in this configuration$/, key: 'errors.notDeterminedHereBare', params: (m) => ({ what: m[1] }) },

  // evaluate.ts:1183 — `cannot place E: line line-CA is tangent to circle circle-O at A — it has no second crossing to extend onto`
  {
    re: new RegExp(`^cannot place (\\S+): line .+ is tangent to circle .+ at .+ ${EMDASH} it has no second crossing to extend onto$`),
    key: 'errors.tangentNoSecondCrossing',
    params: (m) => ({ id: m[1] }),
  },

  // evaluate.ts:1211 — `cannot place E: B is at the centre of circle-O`
  { re: /^cannot place (\S+): (\S+) is at the centre of (\S+)$/, key: 'errors.towardAtCentre', params: (m) => ({ id: m[1], toward: m[2] }) },

  // evaluate.ts:1077 — `cannot place F on segment AB so that |AC| = 9`
  { re: /^cannot place (\S+) on segment (\S+) so that (.+)$/, key: 'errors.cannotPlaceOnSegment', params: (m) => ({ id: m[1], seg: m[2], what: m[3] }) },

  // evaluate.ts:959 — `cannot take a tangent at the centre of circle-O`
  { re: /^cannot take a tangent at the centre of (\S+)$/, key: 'errors.tangentAtCentre', params: (m) => ({ circle: m[1] }) },

  // evaluate.ts:1195 — `cannot construct A: circles circle-O and circle-P do not meet`
  { re: /^cannot construct (\S+): circles (\S+) and (\S+) do not meet$/, key: 'errors.circlesDontMeet', params: (m) => ({ id: m[1], c1: m[2], c2: m[3] }) },

  // step.ts:167 — `C and E would be at the same point`
  { re: /^(\S+) and (\S+) would be at the same point$/, key: 'errors.sameSpot', params: (m) => ({ a: m[1], b: m[2] }) },

  // step.ts:91 — `'O' is already defined — it can't be redefined as something different`
  { re: new RegExp(`^'(.+)' is already defined ${EMDASH} it can't be redefined as something different$`), key: 'errors.alreadyDefined', params: (m) => ({ id: m[1] }) },

  // step.ts:112 — `tangent circles need a fixed radius (a radius-through-a-point circle is not supported yet)`
  { re: /^tangent circles need a fixed radius/, key: 'errors.tangentNeedsFixedRadius' },

  // geoStore.ts:190 — `can't build: D is no longer available (an earlier step it relies on was removed or failed)`
  { re: /^can't build: (.+) is no longer available/, key: 'errors.noLongerAvailable', params: (m) => ({ ids: m[1] }) },

  // step.ts degenerateConstraintError (ADR-202) — `⟂ needs two distinct points on each side — "BB" is a single point, not a segment`
  {
    re: new RegExp(`^(⟂|∥) needs two distinct points on each side ${EMDASH} "(.+)" is a single point, not a segment$`),
    key: 'errors.degenerateSegment',
    params: (m) => ({ rel: m[1], seg: m[2] }),
  },
  // step.ts degenerateConstraintError (ADR-202 Am.) — `an angle needs three distinct points — "∠ABB" repeats its vertex`
  { re: new RegExp(`^an angle needs three distinct points ${EMDASH} "(.+)" repeats its vertex$`), key: 'errors.degenerateAngle', params: (m) => ({ angle: m[1] }) },
  // step.ts degenerateConstraintError (ADR-202 Am.) — `collinear points must be distinct — "A" is named twice`
  { re: new RegExp(`^collinear points must be distinct ${EMDASH} "(.+)" is named twice$`), key: 'errors.degenerateCollinear', params: (m) => ({ id: m[1] }) },
];

/**
 * Translate a raw engine error to a student-facing message. Returns the raw string
 * unchanged when no known shape matches (so it is never worse than the current text).
 */
export function humanizeError(raw: string | null | undefined, t: Translate): string {
  if (!raw) return '';
  // Sanitize FIRST (#200): the patterns then match a clean string and every extracted param (`circle: m[1]`)
  // is already the student's letter — no internal id can reach the message, matched or fall-through.
  const s = sanitizeIds(raw.trim());
  for (const p of PATTERNS) {
    const m = s.match(p.re);
    if (!m) continue;
    const params = p.params?.(m);
    // Translate the constraint vocabulary AFTER matching, never before: several wrapper patterns key on
    // the very same English words («collinear points must be distinct …»), so translating first would
    // stop them matching. Every param goes through the pass — it only touches known fragment words, so a
    // non-fragment param (a circle letter, an id) is untouched.
    const translated = params
      ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, translateConstraintWords(v, t)]))
      : undefined;
    return t(p.keyOf ? p.keyOf(m) : p.key, translated);
  }
  // No known shape — still translate the vocabulary, so an unmatched message is never worse and never
  // leaks an English word we already know how to say.
  return translateConstraintWords(s, t);
}
