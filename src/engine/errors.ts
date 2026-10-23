/**
 * #2201 phase 3a ([ADR-756](../../docs/06-decisions.md#adr-756)) — THE 2-D ENGINE'S ERROR BANK.
 *
 * Every refusal the 2-D engine (and the replay fold above it) can produce is ONE variant of {@link EngineError}: a
 * `code` plus typed fields. The wire — the status string a fact carries through `replay`, the store, the worker, the
 * debug log and the usage events — is still the English sentence it always was, and it is produced HERE and nowhere
 * else ({@link engineErrorDebugText}); {@link parseEngineError} is its one inverse. The display layer
 * (`src/i18n/humanizeError.ts`) parses the wire back into the variant and words it with `switch (e.code)`, so:
 *
 *  - rewording an engine sentence is one edit in this file, and the round-trip lock (`engine-error-total.test.ts`)
 *    fails if the formatter and the parser stop agreeing — a reworded sentence can no longer drop the student to the
 *    floor in silence (the four "gaps" of #2201: 2-D was the only builder whose message contract was prose);
 *  - every value a message interpolates has a declared KIND ({@link PARAM_KINDS}) — an object `Id` (never
 *    pre-stripped), a `Composite` of the student's letters (an angle, a segment, a point list), a constraint
 *    `Fragment` (`describeConstraint` output), a `Num`, or a `Key` (a fixed engine word the display layer maps to a
 *    translation key). Phase 3b's provenance check reads the kinds (ADR-W-130 Am. 1).
 *
 * The transport stays a string on purpose: `FactStatus` is a string in ~50 test files, the fold reads its own
 * attribution tails (`[vs #i]`) off it, and saved figures and the worker carry it. The codec makes the string a
 * SERIALISATION of the variant rather than the contract itself. The engine stays pure: no i18n here.
 */
import type { Id } from './types';

/** A value that NAMES an object of the construction — a point, a circle or a line id, verbatim (never stripped). */
export type ObjectId = Id;
/** Text composed of point letters the engine joined (an angle `∠ABC`, a segment `AB`, a ring `ABCD`). */
export type Composite = string;
/** A constraint described by `describeConstraint` (or a side statement), as the wire carries it. */
export type Fragment = string;
/** A number as the emitter formatted it (`9`, `200°`, `2a` — a measure label). */
export type Num = string;

export type EngineError =
  | { code: 'reserved-radius-ambiguous'; letter: string; circles: Id[]; sized: boolean }
  | { code: 'metric-impossible'; a: ObjectId; b: ObjectId; value: Num; sum: Num; via: ObjectId[] }
  | { code: 'angle-sum-impossible'; polygon: Composite; sum: Num; bound: Num; angles: Fragment }
  | { code: 'measure-out-of-range'; given: Fragment; measure: 'angle' | 'length' }
  | { code: 'bound-impossible'; value: Fragment; bound: Fragment }
  | { code: 'obtuse-side-impossible'; vertex: ObjectId; deg: Num; hyp: Composite; hypVal: Num; leg: Composite; legVal: Num }
  | { code: 'unknown-circle'; center: string }
  | { code: 'unresolved-deps'; ids: ObjectId[] }
  | { code: 'undefined-points'; ids: ObjectId[] }
  | { code: 'non-finite' }
  | { code: 'unknown-point'; what: Fragment }
  | { code: 'polygon-collapsed'; vertices: ObjectId[]; corner?: ObjectId[]; what?: Fragment }
  | { code: 'not-cyclic'; shape: string; ring: Composite; forced: string }
  | { code: 'diagonal-height'; diagonal: Composite; shape: string; ring: Composite }
  | { code: 'collinear-circle'; points: ObjectId[] }
  | { code: 'circumcircle-collinear'; id: ObjectId; a: ObjectId; b: ObjectId; c: ObjectId }
  | { code: 'shape-excluded'; actual: string; stated: string }
  | { code: 'name-taken'; measure: 'angle' | 'segment'; name: Composite; symbol: Num }
  | { code: 'equal-nested'; circle: ObjectId; relation: 'contained' | 'int-tangent' | 'concentric' }
  | { code: 'tangents-exhausted'; pair: Composite; kind: 'external' | 'internal' | 'any'; position: 'int-tangent' | 'ext-tangent' | 'contained' }
  | { code: 'restated-size'; circle: ObjectId; value: Num }
  | { code: 'over-constrained'; what: Fragment }
  | { code: 'over-constrained-unnamed' }
  | { code: 'not-determined'; who?: ObjectId[]; what: Fragment }
  | { code: 'third-crossing'; id: ObjectId; a: ObjectId; b: ObjectId; circle: ObjectId }
  | { code: 'tangent-no-second-crossing'; id: ObjectId; line: string; circle: ObjectId; touch: ObjectId }
  | { code: 'toward-at-centre'; id: ObjectId; toward: ObjectId; circle: ObjectId }
  | { code: 'cannot-place-on-segment'; id: ObjectId; seg: Composite; what: Fragment }
  | { code: 'tangent-at-centre'; circle: ObjectId }
  | { code: 'circles-dont-meet'; id: ObjectId; c1: ObjectId; c2: ObjectId }
  | { code: 'circles-tangent-only'; id: ObjectId; c1: ObjectId; c2: ObjectId; avoid: ObjectId }
  | { code: 'line-misses-circle'; id: ObjectId; line: ObjectId; circle: ObjectId }
  | { code: 'distance-circles-miss'; id: ObjectId }
  | { code: 'lines-parallel'; id: ObjectId; l1: string; l2: string }
  | { code: 'perp-foot-coincide'; seg: Composite }
  | { code: 'line-points-coincide'; line: ObjectId; a: ObjectId; b: ObjectId }
  | { code: 'bisect-opposite'; angle: Composite }
  | { code: 'radius-not-positive'; circle: ObjectId }
  | { code: 'radius-point-at-centre'; circle: ObjectId }
  | { code: 'same-spot'; a: ObjectId; b: ObjectId }
  | { code: 'diagonal-is-side'; pair: Composite; shape: Composite }
  | { code: 'diagonal-none'; pair: Composite; shape: Composite }
  | { code: 'already-defined'; id: ObjectId }
  | { code: 'tangent-needs-fixed-radius' }
  | { code: 'no-longer-available'; ids: ObjectId[] }
  | { code: 'muted-row-owns'; ids: ObjectId[]; row: string }
  | { code: 'unbound-variable'; name: string }
  | { code: 'unenforceable-relation'; names: string[] }
  | { code: 'cant-build-yet'; role: string; ring: Composite }
  | { code: 'degenerate-segment'; rel: '⟂' | '∥'; seg: Composite }
  | { code: 'degenerate-length'; seg: Composite }
  | { code: 'degenerate-angle'; angle: Composite }
  | { code: 'degenerate-collinear'; id: ObjectId }
  /** text that is no variant's serialisation (a message from outside the bank) — the display layer's floor */
  | { code: 'raw'; text: string };

export type EngineErrorCode = EngineError['code'];
export type ErrorOf<C extends EngineErrorCode> = Extract<EngineError, { code: C }>;

/**
 * The KIND of every field of every variant — what phase 3b's provenance check reads. Total by construction: a new
 * variant without its kinds, or a field without one, fails `tsc`.
 *   - `id` / `ids`: names an object of the construction;
 *   - `composite`: point letters the engine joined;
 *   - `fragment`: a described constraint or statement;
 *   - `num`: a number or measure label;
 *   - `key`: a fixed engine word (a shape kind, a relation, a role) the display layer maps — never shown as-is;
 *   - `text`: free text the student wrote (a row's own utterance) or a raw message.
 */
export type ParamKind = 'id' | 'ids' | 'composite' | 'fragment' | 'num' | 'key' | 'text';
type Fields<E> = Exclude<keyof E, 'code'>;
export const PARAM_KINDS: { [C in EngineErrorCode]: { [F in Fields<ErrorOf<C>>]-?: ParamKind } } = {
  'reserved-radius-ambiguous': { letter: 'num', circles: 'ids', sized: 'key' },
  'metric-impossible': { a: 'id', b: 'id', value: 'num', sum: 'num', via: 'ids' },
  'angle-sum-impossible': { polygon: 'composite', sum: 'num', bound: 'num', angles: 'fragment' },
  'measure-out-of-range': { given: 'fragment', measure: 'key' },
  'bound-impossible': { value: 'fragment', bound: 'fragment' },
  'obtuse-side-impossible': { vertex: 'id', deg: 'num', hyp: 'composite', hypVal: 'num', leg: 'composite', legVal: 'num' },
  'unknown-circle': { center: 'text' },
  'unresolved-deps': { ids: 'ids' },
  'undefined-points': { ids: 'ids' },
  'non-finite': {},
  'unknown-point': { what: 'fragment' },
  'polygon-collapsed': { vertices: 'ids', corner: 'ids', what: 'fragment' },
  'not-cyclic': { shape: 'key', ring: 'composite', forced: 'key' },
  'diagonal-height': { diagonal: 'composite', shape: 'key', ring: 'composite' },
  'collinear-circle': { points: 'ids' },
  'circumcircle-collinear': { id: 'id', a: 'id', b: 'id', c: 'id' },
  'shape-excluded': { actual: 'key', stated: 'key' },
  'name-taken': { measure: 'key', name: 'composite', symbol: 'num' },
  'equal-nested': { circle: 'id', relation: 'key' },
  'tangents-exhausted': { pair: 'composite', kind: 'key', position: 'key' },
  'restated-size': { circle: 'id', value: 'num' },
  'over-constrained': { what: 'fragment' },
  'over-constrained-unnamed': {},
  'not-determined': { who: 'ids', what: 'fragment' },
  'third-crossing': { id: 'id', a: 'id', b: 'id', circle: 'id' },
  'tangent-no-second-crossing': { id: 'id', line: 'text', circle: 'id', touch: 'id' },
  'toward-at-centre': { id: 'id', toward: 'id', circle: 'id' },
  'cannot-place-on-segment': { id: 'id', seg: 'composite', what: 'fragment' },
  'tangent-at-centre': { circle: 'id' },
  'circles-dont-meet': { id: 'id', c1: 'id', c2: 'id' },
  'circles-tangent-only': { id: 'id', c1: 'id', c2: 'id', avoid: 'id' },
  'line-misses-circle': { id: 'id', line: 'id', circle: 'id' },
  'distance-circles-miss': { id: 'id' },
  'lines-parallel': { id: 'id', l1: 'text', l2: 'text' },
  'perp-foot-coincide': { seg: 'composite' },
  'line-points-coincide': { line: 'id', a: 'id', b: 'id' },
  'bisect-opposite': { angle: 'composite' },
  'radius-not-positive': { circle: 'id' },
  'radius-point-at-centre': { circle: 'id' },
  'same-spot': { a: 'id', b: 'id' },
  'diagonal-is-side': { pair: 'composite', shape: 'composite' },
  'diagonal-none': { pair: 'composite', shape: 'composite' },
  'already-defined': { id: 'id' },
  'tangent-needs-fixed-radius': {},
  'no-longer-available': { ids: 'ids' },
  'muted-row-owns': { ids: 'ids', row: 'text' },
  'unbound-variable': { name: 'num' },
  'unenforceable-relation': { names: 'num' },
  'cant-build-yet': { role: 'key', ring: 'composite' },
  'degenerate-segment': { rel: 'key', seg: 'composite' },
  'degenerate-length': { seg: 'composite' },
  'degenerate-angle': { angle: 'composite' },
  'degenerate-collinear': { id: 'id' },
  raw: { text: 'text' },
};

const EMDASH = '—';
const list = (ids: readonly string[]) => ids.join(', ');

/**
 * THE wire text of a variant — the English sentence the debug log and the usage events record, byte-identical to
 * what each emission site produced before phase 3a. Every emission site in `src/engine` and `src/replay` calls this;
 * `engine-error-total.test.ts` forbids a template-literal error anywhere else.
 */
export function engineErrorDebugText(e: EngineError): string {
  switch (e.code) {
    case 'reserved-radius-ambiguous':
      return `reserved radius ambiguous: ${e.letter} names no one circle of ${list(e.circles)} (${e.sized ? 'stated sizes' : 'circles'})`;
    case 'metric-impossible':
      return `impossible: |${e.a}${e.b}| = ${e.value} exceeds ${e.sum}, the distance from ${e.a} to ${e.b} via ${list(e.via)}`;
    case 'angle-sum-impossible':
      return `impossible: the angles of ${e.polygon} sum to ${e.sum}, exceeding ${e.bound}: ${e.angles}`;
    case 'measure-out-of-range':
      return e.measure === 'angle' ? `impossible: ${e.given} ${EMDASH} an angle measures between 0° and 180°` : `impossible: ${e.given} ${EMDASH} a length is never negative`;
    case 'bound-impossible':
      return `impossible: ${e.value} contradicts ${e.bound}`;
    case 'obtuse-side-impossible':
      return `impossible: the angle at ${e.vertex} is ${e.deg}°, so |${e.hyp}| must be the longest side, but |${e.hyp}| = ${e.hypVal} and |${e.leg}| = ${e.legVal}`;
    case 'unknown-circle':
      return `circle '${e.center}' is not defined`;
    case 'unresolved-deps':
      return `unresolved dependencies for: ${list(e.ids)}`;
    case 'undefined-points':
      return `undefined point: ${list(e.ids)}`;
    case 'non-finite':
      return 'non-finite position computed';
    case 'unknown-point':
      return `${e.what} references an unknown point`;
    case 'polygon-collapsed':
      return `collapsed: polygon ${list(e.vertices)} would be flat${e.corner ? ` at ${list(e.corner)}` : ''}${e.what ? ` ${EMDASH} ${e.what} cannot hold` : ''}`;
    case 'not-cyclic':
      return `over-constrained: a circle through the vertices of ${e.shape} ${e.ring} forces a ${e.forced} cannot hold`;
    case 'diagonal-height':
      return `over-constrained: diagonal ${e.diagonal} of ${e.shape} ${e.ring} is perpendicular to no side cannot hold`;
    case 'collinear-circle':
      return `over-constrained: a circle through ${list(e.points)} on one line cannot hold`;
    case 'circumcircle-collinear':
      return `cannot construct ${e.id}: ${e.a}, ${e.b}, ${e.c} are collinear (no circumscribed circle)`;
    case 'shape-excluded':
      return `shape-excluded: the figure is already known to be a ${e.actual}, so it is not a ${e.stated}`;
    case 'name-taken':
      return `name-taken: ${e.measure} ${e.name} is already named ${e.symbol}`;
    case 'equal-nested':
      return `over-constrained: equal circles ${e.circle} nested ${e.relation} cannot hold`;
    case 'tangents-exhausted':
      return `tangents-exhausted: common tangent ${e.pair} of kind ${e.kind} on ${e.position} circles`;
    case 'restated-size':
      return `over-constrained: radius of ${e.circle} = ${e.value} cannot hold`;
    case 'over-constrained':
      return `over-constrained: ${e.what} cannot hold`;
    case 'over-constrained-unnamed':
      return 'over-constrained';
    case 'not-determined':
      return e.who
        ? `not determined: ${list(e.who)} ${e.who.length > 1 ? 'are' : 'is'} still free, so ${e.what} cannot be judged in this configuration`
        : `not determined: ${e.what} cannot be judged in this configuration`;
    case 'third-crossing':
      return `cannot place ${e.id}: line ${e.a}${e.b} already crosses circle ${e.circle} at ${e.a} and ${e.b} ${EMDASH} a line has no third crossing with a circle`;
    case 'tangent-no-second-crossing':
      return `cannot place ${e.id}: line ${e.line} is tangent to circle ${e.circle} at ${e.touch} ${EMDASH} it has no second crossing to extend onto`;
    case 'toward-at-centre':
      return `cannot place ${e.id}: ${e.toward} is at the centre of ${e.circle}`;
    case 'cannot-place-on-segment':
      return `cannot place ${e.id} on segment ${e.seg} so that ${e.what}`;
    case 'tangent-at-centre':
      return `cannot take a tangent at the centre of ${e.circle}`;
    case 'circles-dont-meet':
      return `cannot construct ${e.id}: circles ${e.c1} and ${e.c2} do not meet`;
    case 'circles-tangent-only':
      return `cannot construct ${e.id}: circles ${e.c1} and ${e.c2} meet only at ${e.avoid} (they are tangent)`;
    case 'line-misses-circle':
      return `cannot construct ${e.id}: line ${e.line} does not meet circle ${e.circle}`;
    case 'distance-circles-miss':
      return `cannot construct ${e.id}: the two distance circles do not intersect`;
    case 'lines-parallel':
      return `cannot construct ${e.id}: lines ${e.l1} and ${e.l2} are parallel`;
    case 'perp-foot-coincide':
      return `cannot drop a perpendicular to ${e.seg}: they coincide`;
    case 'line-points-coincide':
      return `cannot build line ${e.line}: ${e.a} and ${e.b} coincide`;
    case 'bisect-opposite':
      return `cannot bisect ${e.angle}: the rays are opposite`;
    case 'radius-not-positive':
      return `circle ${e.circle}: radius must be positive`;
    case 'radius-point-at-centre':
      return `circle ${e.circle}: the point on it coincides with the centre`;
    case 'same-spot':
      return `${e.a} and ${e.b} would be at the same point`;
    case 'diagonal-is-side':
      return `${e.pair} is not a diagonal of ${e.shape} ${EMDASH} it is a side`;
    case 'diagonal-none':
      return `${e.pair} is not a diagonal ${EMDASH} ${e.shape} has no diagonals`;
    case 'already-defined':
      return `'${e.id}' is already defined ${EMDASH} it can't be redefined as something different`;
    case 'tangent-needs-fixed-radius':
      return 'tangent circles need a fixed radius (a radius-through-a-point circle is not supported yet)';
    case 'no-longer-available':
      return `can't build: ${list(e.ids)} is no longer available (an earlier step it relies on was removed or failed)`;
    case 'muted-row-owns':
      return `can't build: ${list(e.ids)} belong to the unticked row «${e.row}» ${EMDASH} tick it again or delete it`;
    case 'unbound-variable':
      return `variable ${e.name} is not defined by any statement (the step that defined it was removed, muted or failed)`;
    case 'unenforceable-relation':
      return `relation on ${list(e.names)} cannot be enforced (a letter is used in a form this statement cannot follow)`;
    case 'cant-build-yet':
      return `can't build yet: no ${e.role} is declared in triangle ${e.ring} at this point`;
    case 'degenerate-segment':
      return `${e.rel} needs two distinct points on each side ${EMDASH} "${e.seg}" is a single point, not a segment`;
    case 'degenerate-length':
      return `a length needs two distinct points ${EMDASH} "${e.seg}" is a single point, not a segment`;
    case 'degenerate-angle':
      return `an angle needs three distinct points ${EMDASH} "${e.angle}" repeats its vertex`;
    case 'degenerate-collinear':
      return `collinear points must be distinct ${EMDASH} "${e.id}" is named twice`;
    case 'raw':
      return e.text;
  }
}

/**
 * The fold's ATTRIBUTION tail (#943 half B, ADR-508): ` [vs #<fact index>]` naming the earlier statement a refusal
 * conflicts with. It is appended to a status after the engine produced it and is not part of any variant; the
 * variants the display layer reads it on parse it into `vs`.
 */
const TAIL = String.raw`(?: \[vs #(\d+)\])?`;
/** The fold tags a refusal with the earlier statement it conflicts with — the one writer of the tail. */
export const withAttribution = (wire: string, factIndex: number): string => `${wire} [vs #${factIndex}]`;
const tailOf = (m: RegExpMatchArray): { vs?: number } => (m[m.length - 1] !== undefined ? { vs: Number(m[m.length - 1]) } : {});

const ids = (s: string): Id[] => s.split(', ');
const G = (m: RegExpMatchArray, i: number) => m[i];

/** A parsed wire: the variant, and the fold's `[vs #i]` tail when its variant reads one. */
export type ParsedEngineError = EngineError & { vs?: number };

/**
 * The inverse of {@link engineErrorDebugText}, one regex per variant, tried in this order (a shape whose text could
 * begin another's comes first). Over the RAW wire — no id is stripped before parsing, so an `ObjectId` field carries
 * the construction's own id (`circle-O`, `tanaux-OP`, `~A`).
 *
 * Phase 3a moved these from `humanizeError.ts` VERBATIM (the order, each anchor, the tail each one accepted), so a
 * wire string reaches the variant the old pattern table reached and the student reads the same sentence (the
 * `humanize-golden.json` lock). That includes the four shapes matched by PREFIX (`tangent circles need…`, `can't
 * build: … is no longer available`, `variable … is not defined…`, `relation on … cannot be enforced`), which read
 * through a fold tail. The variants no old pattern matched sit at the END, so none takes a string an old pattern took.
 */
const PARSERS: readonly [RegExp, (m: RegExpMatchArray) => ParsedEngineError][] = [
  [/^reserved radius ambiguous: ([Rr]) names no one circle of (.+) \((stated sizes|circles)\)$/, (m) => ({ code: 'reserved-radius-ambiguous', letter: G(m, 1), circles: ids(G(m, 2)), sized: m[3] === 'stated sizes' })],
  [/^impossible: \|(\S+?)\| = (\S+) exceeds (\S+), the distance from (\S+) to (\S+) via (.*)$/, (m) => ({ code: 'metric-impossible', a: G(m, 4), b: G(m, 5), value: G(m, 2), sum: G(m, 3), via: ids(G(m, 6)) })],
  [/^impossible: the angles of (\S+) sum to (\S+), exceeding (\S+): (.*)$/, (m) => ({ code: 'angle-sum-impossible', polygon: G(m, 1), sum: G(m, 2), bound: G(m, 3), angles: G(m, 4) })],
  [new RegExp(`^impossible: (.+) ${EMDASH} (an angle measures between 0° and 180°|a length is never negative)$`), (m) => ({ code: 'measure-out-of-range', given: G(m, 1), measure: m[2].startsWith('an angle') ? 'angle' : 'length' })],
  [/^impossible: (.+) contradicts (.+)$/, (m) => ({ code: 'bound-impossible', value: G(m, 1), bound: G(m, 2) })],
  [/^impossible: the angle at (\S+) is (\S+)°, so \|(\S+?)\| must be the longest side, but \|\S+?\| = (\S+) and \|(\S+?)\| = (\S+)$/, (m) => ({ code: 'obtuse-side-impossible', vertex: G(m, 1), deg: G(m, 2), hyp: G(m, 3), hypVal: G(m, 4), leg: G(m, 5), legVal: G(m, 6) })],
  [/^circle '(.+)' is not defined$/, (m) => ({ code: 'unknown-circle', center: G(m, 1) })],
  [/^unresolved dependencies for: (.+)$/, (m) => ({ code: 'unresolved-deps', ids: ids(G(m, 1)) })],
  [/^undefined point: (.+)$/, (m) => ({ code: 'undefined-points', ids: ids(G(m, 1)) })],
  [/^non-finite position computed$/, () => ({ code: 'non-finite' })],
  [/^(.+) references an unknown point$/, (m) => ({ code: 'unknown-point', what: G(m, 1) })],
  [new RegExp(`^collapsed: polygon (.+?) would be flat(?: at (.+?))?(?: ${EMDASH} (.+) cannot hold)?${TAIL}$`), (m) => ({ code: 'polygon-collapsed', vertices: ids(G(m, 1)), ...(m[2] !== undefined ? { corner: ids(m[2]) } : {}), ...(m[3] !== undefined ? { what: m[3] } : {}), ...tailOf(m) })],
  [new RegExp(String.raw`^over-constrained: a circle through the vertices of (\S+) (\S+) forces a (\S+) cannot hold${TAIL}$`), (m) => ({ code: 'not-cyclic', shape: G(m, 1), ring: G(m, 2), forced: G(m, 3), ...tailOf(m) })],
  [new RegExp(String.raw`^over-constrained: diagonal (\S+) of (\S+) (\S+) is perpendicular to no side cannot hold${TAIL}$`), (m) => ({ code: 'diagonal-height', diagonal: G(m, 1), shape: G(m, 2), ring: G(m, 3), ...tailOf(m) })],
  [new RegExp(String.raw`^over-constrained: a circle through ([^,\s]+), ([^,\s]+), ([^,\s]+) on one line cannot hold${TAIL}$`), (m) => ({ code: 'collinear-circle', points: [G(m, 1), G(m, 2), G(m, 3)], ...tailOf(m) })],
  [/^cannot construct (\S+): ([^,\s]+), ([^,\s]+), ([^,\s]+) are collinear \(no circumscribed circle\)$/, (m) => ({ code: 'circumcircle-collinear', id: G(m, 1), a: G(m, 2), b: G(m, 3), c: G(m, 4) })],
  [/^shape-excluded: the figure is already known to be a (\S+), so it is not a (\S+)$/, (m) => ({ code: 'shape-excluded', actual: G(m, 1), stated: G(m, 2) })],
  [new RegExp(String.raw`^name-taken: (angle|segment) (\S+) is already named (.+?)${TAIL}$`), (m) => ({ code: 'name-taken', measure: m[1] as 'angle' | 'segment', name: G(m, 2), symbol: G(m, 3), ...tailOf(m) })],
  [new RegExp(String.raw`^over-constrained: equal circles (\S+) nested (contained|int-tangent|concentric) cannot hold${TAIL}$`), (m) => ({ code: 'equal-nested', circle: G(m, 1), relation: m[2] as 'contained' | 'int-tangent' | 'concentric', ...tailOf(m) })],
  [/^tangents-exhausted: common tangent (\S+) of kind (external|internal|any) on (int-tangent|ext-tangent|contained) circles$/, (m) => ({ code: 'tangents-exhausted', pair: G(m, 1), kind: m[2] as 'external' | 'internal' | 'any', position: m[3] as 'int-tangent' | 'ext-tangent' | 'contained' })],
  [new RegExp(String.raw`^over-constrained: radius of (\S+) = (.+) cannot hold${TAIL}$`), (m) => ({ code: 'restated-size', circle: G(m, 1), value: G(m, 2), ...tailOf(m) })],
  [new RegExp(String.raw`^over-constrained: (.+) cannot hold${TAIL}$`), (m) => ({ code: 'over-constrained', what: G(m, 1), ...tailOf(m) })],
  [/^not determined: (.+) (?:is|are) still free, so (.+) cannot be judged in this configuration$/, (m) => ({ code: 'not-determined', who: ids(G(m, 1)), what: G(m, 2) })],
  [/^not determined: (.+) cannot be judged in this configuration$/, (m) => ({ code: 'not-determined', what: G(m, 1) })],
  [new RegExp(String.raw`^cannot place (\S+): line \S+ already crosses circle (\S+) at (\S+) and (\S+) ${EMDASH} a line has no third crossing with a circle$`), (m) => ({ code: 'third-crossing', id: G(m, 1), a: G(m, 3), b: G(m, 4), circle: G(m, 2) })],
  [new RegExp(`^cannot place (\\S+): line (.+) is tangent to circle (.+) at (.+) ${EMDASH} it has no second crossing to extend onto$`), (m) => ({ code: 'tangent-no-second-crossing', id: G(m, 1), line: G(m, 2), circle: G(m, 3), touch: G(m, 4) })],
  [/^cannot place (\S+): (\S+) is at the centre of (\S+)$/, (m) => ({ code: 'toward-at-centre', id: G(m, 1), toward: G(m, 2), circle: G(m, 3) })],
  [/^cannot place (\S+) on segment (\S+) so that (.+)$/, (m) => ({ code: 'cannot-place-on-segment', id: G(m, 1), seg: G(m, 2), what: G(m, 3) })],
  [/^cannot take a tangent at the centre of (\S+)$/, (m) => ({ code: 'tangent-at-centre', circle: G(m, 1) })],
  [/^cannot construct (\S+): circles (\S+) and (\S+) do not meet$/, (m) => ({ code: 'circles-dont-meet', id: G(m, 1), c1: G(m, 2), c2: G(m, 3) })],
  [/^(\S+) and (\S+) would be at the same point$/, (m) => ({ code: 'same-spot', a: G(m, 1), b: G(m, 2) })],
  [new RegExp(`^(\\S+) is not a diagonal of (\\S+) ${EMDASH} it is a side$`), (m) => ({ code: 'diagonal-is-side', pair: G(m, 1), shape: G(m, 2) })],
  [new RegExp(`^(\\S+) is not a diagonal ${EMDASH} (\\S+) has no diagonals$`), (m) => ({ code: 'diagonal-none', pair: G(m, 1), shape: G(m, 2) })],
  [new RegExp(`^'(.+)' is already defined ${EMDASH} it can't be redefined as something different$`), (m) => ({ code: 'already-defined', id: G(m, 1) })],
  [/^tangent circles need a fixed radius/, () => ({ code: 'tangent-needs-fixed-radius' })],
  [/^can't build: (.+) is no longer available/, (m) => ({ code: 'no-longer-available', ids: ids(G(m, 1)) })],
  [new RegExp(`^can't build: (.+) belong to the unticked row «(.+)» ${EMDASH} tick it again or delete it$`), (m) => ({ code: 'muted-row-owns', ids: ids(G(m, 1)), row: G(m, 2) })],
  [/^variable (\S+) is not defined by any statement/, (m) => ({ code: 'unbound-variable', name: G(m, 1) })],
  [/^relation on (.+) cannot be enforced/, (m) => ({ code: 'unenforceable-relation', names: ids(G(m, 1)) })],
  [new RegExp(`^(⟂|∥) needs two distinct points on each side ${EMDASH} "(.+)" is a single point, not a segment$`), (m) => ({ code: 'degenerate-segment', rel: m[1] as '⟂' | '∥', seg: G(m, 2) })],
  [new RegExp(`^an angle needs three distinct points ${EMDASH} "(.+)" repeats its vertex$`), (m) => ({ code: 'degenerate-angle', angle: G(m, 1) })],
  [new RegExp(`^collinear points must be distinct ${EMDASH} "(.+)" is named twice$`), (m) => ({ code: 'degenerate-collinear', id: G(m, 1) })],
  // ── the variants no humanised pattern ever read (the floor, before and after 3a) ──
  [/^over-constrained$/, () => ({ code: 'over-constrained-unnamed' })],
  [/^cannot construct (\S+): circles (\S+) and (\S+) meet only at (\S+) \(they are tangent\)$/, (m) => ({ code: 'circles-tangent-only', id: G(m, 1), c1: G(m, 2), c2: G(m, 3), avoid: G(m, 4) })],
  [/^cannot construct (\S+): line (\S+) does not meet circle (\S+)$/, (m) => ({ code: 'line-misses-circle', id: G(m, 1), line: G(m, 2), circle: G(m, 3) })],
  [/^cannot construct (\S+): the two distance circles do not intersect$/, (m) => ({ code: 'distance-circles-miss', id: G(m, 1) })],
  [/^cannot construct (\S+): lines (\S+) and (\S+) are parallel$/, (m) => ({ code: 'lines-parallel', id: G(m, 1), l1: G(m, 2), l2: G(m, 3) })],
  [/^cannot drop a perpendicular to (\S+): they coincide$/, (m) => ({ code: 'perp-foot-coincide', seg: G(m, 1) })],
  [/^cannot build line (\S+): (\S+) and (\S+) coincide$/, (m) => ({ code: 'line-points-coincide', line: G(m, 1), a: G(m, 2), b: G(m, 3) })],
  [/^cannot bisect (\S+): the rays are opposite$/, (m) => ({ code: 'bisect-opposite', angle: G(m, 1) })],
  [/^circle (\S+): radius must be positive$/, (m) => ({ code: 'radius-not-positive', circle: G(m, 1) })],
  [/^circle (\S+): the point on it coincides with the centre$/, (m) => ({ code: 'radius-point-at-centre', circle: G(m, 1) })],
  [/^can't build yet: no (\S+) is declared in triangle (\S+) at this point$/, (m) => ({ code: 'cant-build-yet', role: G(m, 1), ring: G(m, 2) })],
  [new RegExp(`^a length needs two distinct points ${EMDASH} "(.+)" is a single point, not a segment$`), (m) => ({ code: 'degenerate-length', seg: G(m, 1) })],
];

/**
 * The wire text → its variant ({@link engineErrorDebugText}'s inverse). Text no parser recognises — a message from
 * outside the bank, or a variant the fold tagged where its old pattern read no tail — is `raw` (the floor).
 */
export function parseEngineError(text: string): ParsedEngineError {
  const s = text.trim();
  for (const [re, build] of PARSERS) {
    const m = s.match(re);
    if (m) return build(m);
  }
  return { code: 'raw', text: s };
}
