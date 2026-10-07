/**
 * The apply boundary — the ONE place that decides whether a statement creates something new or
 * says something about what already exists.
 *
 * This is **M1 — existing-id lowering** ([docs/17](../../docs/17-design-rules.md)), and it is here
 * on day one deliberately: [ADR-AG-003](../../docs/06c-decisions-analytic.md#adr-ag-003) records
 * that a bagrut question arrives in SECTIONS, that the fact list accumulates across all of them,
 * and that section ב routinely restates or names what section א established. Without a single
 * apply-boundary decision, every second section of every question is a false conflict — and
 * retrofitting it per parser rule is exactly the drift docs/17 forbids.
 *
 * V0 dispositions are deliberately narrow, but the BOUNDARY is complete: a restatement that agrees
 * is absorbed (no duplicate row, no re-creation), one that disagrees is refused by naming the
 * conflicting STATEMENT rather than internal state. Richer lowerings — a restatement becoming a
 * constraint that drives a free figure — attach to this same function when the constraint layer
 * lands, and nowhere else.
 */
import { fitConic } from './conic';
import { bareLineName, isNumeralName, lineIdOf, nameReading, numeralCurveId, numeralTwin, readDescribedCircle, refKindOf, statedName, type DescribedCircle, type RefKind } from './names';
import { parabolaDirectrix, resolveCurve } from './curves';
import { angleLabelName, isTermPlaceholder, lengthRefs, parseLengthExpr } from './lengths';
import { curveParentsOf, parentsOf, type DerivedRule, type FootLine } from './derived';
import { sameDerivation } from './sameDerivation';
import { constraintCurveRefs, constraintRefs, dirRefs, isAngleRef, sameConstraint, sineAngle, type AngleName, type AngleRef, type Constraint, type Direction, type TangentLineRef } from './solve';
import { displacedAssumption, isGenericNoun, namesOption, normalizeShapeNoun, promisesOneParallelPair, rightAngleAt, ringsNamed, shapeRow } from './shapes';
import { evalExpr, symbolsOf, type Env, type Expr } from './expr';
import { RESERVED_SYMBOLS, radiusSymbol, toolSymbol } from './carriers';
import { drawnPieceOver, isPolygonSide } from './extent';
import { cevianFacts, onBisectorFacts, segmentIdOf, toolFootFacts, toolFootRule } from './cevian';
import {
  CENTRE_SENTINEL,
  CIRCLE_SENTINEL,
  CIRCLE_SLOT_SENTINELS,
  UNBOUNDED,
  EMPTY_CONSTRUCTION,
  inDomain,
  circleDefPoints,
  curveByName,
  diameterCircleId,
  incircleId,
  isPositional,
  namesObject,
  objectById,
  tangentLineId,
  type Construction,
  type Curve,
  type CurveObject,
  type Domain,
  type Fact,
  type Selector,
  type ArcDef,
  type GeoObject,
  type Id,
  type OrderSide,
  type PointObject,
  type PolygonObject,
} from './types';

export type ApplyErrorCode =
  /**
   * A sentence whose MEANING depends on the figure, and the figure gives it none (#1622, ADR-AG-218): «A = 40» is the
   * angle at A only when A is a point of the figure — «R=5» beside a circle with no point R is not understood (#1432
   * am. 1), exactly the verdict a parse failure gives, so the student is told the same thing and the model may try it.
   */
  | 'not-handled'
  /** A restatement that contradicts what the figure already holds. */
  | 'conflicting-restatement'
  /** A name used for two different kinds of object. */
  | 'name-kind-clash'
  /**
   * A statement that refers to a point the figure does not have (#1028).
   *
   * «M אמצע AB» before `A` exists is not a reason to invent `A` — an auto-created vertex would be a
   * position the question never gave ([ADR-052](../../docs/06-decisions.md#adr-052)), and it would
   * silently spend a letter the student is about to use themselves (the ADR-297 class). Refusing
   * here is also what guarantees a parent always precedes its dependent, which is why evaluation
   * needs no topological sort (`carriers.ts` `depsPrecedeDependents`).
   */
  | 'unknown-reference'
  /**
   * A named object that cannot exist in this figure at all (#1058).
   *
   * Distinct from `unsatisfiable`, which is a given the solve could not MEET. This one is a construct
   * whose definition has no answer here — a concave quadrilateral's diagonal meet, three collinear
   * points' circumcentre — in a figure with no freedom left to try elsewhere.
   */
  | 'does-not-exist'
  /**
   * The student PINNED the coordinates, and in that order they do not make the shape they named
   * (#1170) — «A(0,0) B(4,0) C(1,1) D(1,0)» then «מרובע ABCD», where A, D and B are collinear so
   * the "quadrilateral" is a triangle with a spare vertex; or four pinned points written in a
   * bow-tie order, where the ring crosses itself.
   *
   * Distinct from every neighbour above. `unsatisfiable` is a given the solve could not MEET, and
   * there is nothing here the solve failed at — the figure is exactly what was asked for.
   * `does-not-exist` is a construct with no answer in this figure. This one is the NOUN: a shape
   * word promises a ring, and these points are not that ring.
   *
   * It fires only where `reportedDof === 0`. With the polygon-noun preference inside the
   * configuration search (ADR-AG-080), a figure that still has freedom never arrives carrying a
   * ring fault — it found a valid configuration. So this is always about coordinates the student
   * wrote, never about a search that ran out.
   */
  | 'ring-contradicts-noun'
  /**
   * THE GIVENS FORCE A DECLARED POLYGON FLAT (#1849, ADR-AG-247; workspace ruling ADR-W-115). «משולש ABC» ·
   * «AB = 5» · «BC = 3» · «AC = 8»: the three lengths hold only with B on AC, and a flat figure is not a
   * triangle. The line that COMPLETES the collapse is refused, naming the polygon and the sentence that declared
   * it — never «לא נמצאה תצורה», which says the search missed when the givens themselves are what flatten it.
   * Emitted by `derive` only: for a figure with freedom, when the thin-ring arm saw the givens hold on a collapsed
   * ring (`collapsedByGivens`); for a pinned one, when the pinned ring is `degenerate` (a CROSSED pinned ring
   * stays `ring-contradicts-noun`).
   */
  | 'polygon-collapsed'
  /**
   * «זווית B ישרה» where the vertex alone does not name an angle (#1049).
   *
   * A vertex names an angle only when the figure says which two rays meet there. With no shape
   * through the point — or with more than one — the honest answer is to say so and name the
   * format that IS unambiguous («זווית ABC ישרה»), rather than pick a pair of rays and assert a
   * given the student never gave.
   */
  | 'ambiguous-angle'
  /**
   * «שטח הדלתון הוא 24» with no kite in the figure, or with two of them (#1049).
   *
   * The contextual half of `ambiguous-angle`, and the same discipline: a reference that names no
   * single object is answered by saying so, never by picking one.
   */
  | 'ambiguous-shape'
  /**
   * A numeral name written in the OTHER notation from the one the figure already uses — «ישר I» when
   * the line is «ישר 1» (operator ruling 2026-09-29, ADR-AG-170 Am. 2). «1» and «I» are ONE name, so
   * this is never a second object; and it is never silently merged either: the student is asked to
   * keep one notation. `detail` is the numeral they typed, `holder` the one in use, `expected` the kind.
   */
  | 'numeral-notation'
  /**
   * «האלכסון הראשי» in a shape whose noun distinguishes no principal diagonal (#1070).
   *
   * A kite has one — its axis of symmetry is a fact about the figure. A plain quadrilateral, a
   * parallelogram and a rhombus do not, and picking one would assert a distinction the question
   * never made. The message names the endpoints form instead.
   */
  | 'undistinguished-diagonal'
  /**
   * «האלכסונים AB ו-CD» where «מרובע ABCD» makes AB and CD two of its SIDES (#1620, ADR-AG-208). The letters
   * say which segments; the noun says they are diagonals; the figure says they are not — so the sentence is
   * refused, never quietly re-read as the quadrilateral's real diagonals.
   */
  | 'not-a-diagonal'
  /**
   * NAMING SOMETHING THAT ALREADY HAS A NAME (#1153).
   *
   * «P מרכז המעגל I» then «O מרכז המעגל I» minted a SECOND point on top of the first, and a
   * third naming minted a third — three letters stacked on one position, no fault, nothing said.
   * A position carries at most one name, so the second naming is refused and the message names the
   * holder: *"the centre of the circle is already called P"*.
   *
   * Operator ruling, 2026-09-17: refuse and name the holder; renaming is an explicit action the
   * student takes, never a silent substitution.
   */
  | 'already-named'
  /** «נסמן זוית MAC כ-A1» where A1 already names another angle, or a point (#1622 E5, ADR-AG-221) — `holder` is the label. */
  | 'alias-taken'
  /**
   * The two PARSER refusals a construction can also reach at M1 (#1464, #1324), with the parser's own
   * messages: «מעגל AAB» names the same point twice (`repeated-vertex`), and «BD קוטר במעגל I» over a circle
   * known only by its equation is understood but has no centre point to state the midpoint of (`out-of-scope`).
   */
  | 'repeated-vertex'
  | 'out-of-scope'
  /**
   * The cevian parser refusal a cevian resolved at M1 can also reach (#1240, ADR-AG-209): «AB גובה» once the
   * figure says `B` is a vertex of the side the altitude would be drawn to.
   */
  | 'degenerate-role'
  /**
   * «AD גובה» · «גובה לצלע BC» where the figure holds the apex (or the side) in SEVERAL triangles with
   * different targets (#1240, ADR-AG-209) — a question, never a guess (02c R32): the student names the side
   * or the triangle. And `cevian-no-triangle` when it holds it in none: there is no side to draw it to.
   */
  | 'ambiguous-cevian'
  | 'cevian-no-triangle'
  /**
   * «תיכון ליתר» where the figure leaves the right angle open (a right triangle's noun alone) or holds several right
   * triangles — a QUESTION: which side is the hypotenuse (#1222, operator ruling 2026-10-02 on #1620). And
   * `ambiguous-no-right-angle` where no triangle has a right angle at all: there is no hypotenuse.
   */
  | 'ambiguous-hypotenuse'
  | 'ambiguous-no-right-angle'
  /**
   * A STATED value substituted into a symbol whose domain it violates (#1432 amendment 1) — «רדיוס
   * המעגל הוא -3», «שרדיוסו 0». The radius symbol carries `{min: 0, minOpen}` and the substitution
   * used to drop it unchecked, so the circle vanished with no message. Checked at the ONE seam every
   * stated-value substitution passes (`substituteStated`), for any domained symbol; `domain` carries
   * the bound for the locale to word.
   */
  | 'out-of-domain'
  /** A stated given the solve could not satisfy — reported, never drawn as if it held. */
  | 'unsatisfiable'
  /**
   * A DOMAIN stated for a plane coordinate — «y = 2x + 1, x > 0», «x^2 + y^2 = 4, y > 0», «x הוא פרמטר» (#1832,
   * ADR-AG-246). `x` and `y` are the plane's variables (`RESERVED_SYMBOLS`), so a `param` fact naming one declares
   * a parameter nothing reads: the curve's equation keeps them out of the free register, and the line committed with
   * the restriction doing nothing. Refused here, at the one boundary every producer of a `param` fact passes, never
   * silently absorbed. Drawing only the part of a curve where x > 0 is a capability of its own (#1846).
   */
  | 'coordinate-restriction';

/**
 * WHICH OBJECT a contextual reference needed, and how many the figure holds (#1432 amendment 1).
 *
 * `ambiguous-shape` used to carry only the sentence, so every contextual refusal — «רדיוס המעגל הוא
 * 5» with no circle, «F מוקד הפרבולה» with no parabola — taught the kite-area example the message was
 * written for. The host KIND is what picks the remedy (name the circle, draw the parabola first);
 * `need` is 2 for the crossing of two unnamed curves, else 1. Absent for the polygon-noun sites
 * (area, meet), whose kite example is the right remedy.
 */
export interface HostRef {
  /** `perpendicular` (#1620, ADR-AG-207): «האנך» — the one perpendicular dropped from a point in the figure. */
  kind: 'circle' | 'parabola' | 'ellipse' | 'line' | 'polygon' | 'perpendicular';
  found: number;
  need?: number;
  /**
   * How the student can call each object FOUND, when there are several named curves to choose from
   * (#1514 pre-play, merged into this one seam): its name («I», «II») or, unnamed, its equation — both
   * of which the operand resolver reads back — so the refusal names them and shows the student's own
   * sentence with a name in it («P על הפרבולה I»).
   */
  candidates?: string[];
}

export interface ApplyError {
  code: ApplyErrorCode;
  /** The student's own words, so the message can name the STATEMENT and never internal state. */
  detail: string;
  /**
   * For a clash: WHAT the name already holds, as a stable token the locale renders (#1046).
   *
   * «השם כבר משמש עצם מסוג אחר» told the student they had picked a bad name. They had not — `M` is
   * a perfectly good name, already taken by something they themselves defined, and the message
   * sent them to fix the letter instead of showing them the collision. A refusal that misdescribes
   * the problem is worse than one that is merely narrow.
   *
   * A TOKEN, never a sentence: the engine stays language-free, and He/En render it in `App.tsx`.
   */
  existing?: ExistingKind;
  /**
   * WHAT KIND of object the statement expected to find (#1179).
   *
   * #1145 fixed which WORD a refusal quotes (`l7`, not `line-l7`); this is the sentence around it.
   * One point-shaped string served every missing reference, so a student who wrote «הישר l7» was told
   * «הנקודה l7 עדיין לא הוגדרה» — the right word in the wrong sentence, which sends them off to define
   * a POINT called `l7`. #1150's new curve check made that path far easier to reach, which is why it
   * surfaced on the first play.
   *
   * A TOKEN, never a sentence — the same contract `existing` already has (#1046): the engine stays
   * language-free and the locale picks the noun, which matters more in Hebrew than in English because
   * the gender carries through the whole sentence («הנקודה … הוגדרה» vs «הישר … הוגדר»).
   */
  expected?: RefKind;
  /**
   * WHO ALREADY HOLDS the position a naming tried to claim (#1153).
   *
   * The student's own letter for it — «מרכז המעגל כבר נקרא P» — so the refusal SHOWS them the
   * collision instead of telling them their letter was bad. A name, never a sentence: the engine
   * stays language-free and the locale builds the message around it.
   */
  holder?: Id;
  /**
   * The THREE-LETTER name an ambiguous one-letter angle needs (#1407, ADR-AG-158) — «ACB» for «זווית C»
   * when more than two edges meet at C. Read off the first shape through the vertex (else its first two
   * edges), rays sorted, so the student's own line with the letter replaced by this name is a line the tool
   * builds. Absent when FEWER than two edges meet there: there is no pair of rays to teach, and inventing one
   * would be a guess.
   */
  example?: string;
  /**
   * #1445 (ADR-AG-243): every angle a lone vertex could name, three letters each (rays sorted), when it names
   * several — the refusal LISTS them. Absent when there are fewer than two.
   */
  options?: string[];
  /** For `ambiguous-shape`: the kind the reference needed and how many the figure holds (#1432 am. 1). */
  host?: HostRef;
  /** For `out-of-domain`: the bound the stated value violates (#1432 am. 1). */
  domain?: Domain;
}

/** How a found curve can be called in a sentence — its name, or (unnamed) its equation. */
function callable(o: GeoObject): string {
  if (o.kind === 'curve' && o.id.startsWith('curve-')) return o.label.eqSrc ?? '';
  if (o.kind === 'circle-thru' && o.name) return o.name;
  return statedName(o.id);
}

/**
 * THE ONE REFUSAL for a contextual reference that found `found` objects of `kind` where it needed
 * `need` (default 1) — #1432's host seam, which #1514's ambiguous-curve refusal now rides: pass the
 * objects themselves and, when more than one was found, the refusal carries how to CALL each.
 */
function noHost(detail: string, kind: HostRef['kind'], found: number | readonly GeoObject[], need?: number): ApplyError {
  const n = typeof found === 'number' ? found : found.length;
  const candidates = typeof found === 'number' || n < 2 ? [] : found.map(callable).filter((x) => x !== '');
  return {
    code: 'ambiguous-shape',
    detail,
    host: { kind, found: n, ...(need !== undefined ? { need } : {}), ...(candidates.length ? { candidates } : {}) },
  };
}

/**
 * THE ONE SEAM A STATED VALUE PASSES ON ITS WAY INTO A DOMAINED SYMBOL (#1432 amendment 1).
 *
 * A symbol declared with a domain — a circle's free radius `r_O` (> 0), a parameter «a > 0» — may
 * be REPLACED by a value the student states. The replacement is only honest if the value lies in
 * the domain: «רדיוס המעגל הוא -3» substituted −3 for a symbol that promised a positive radius, and
 * the circle vanished from the canvas with no message. So every such substitution asks here first:
 *
 * - a CONSTANT is checked exactly — outside the domain is `out-of-domain`, naming the statement;
 * - a lone PARAMETER («שרדיוסו a») inherits the domain: it is merged into that parameter's own
 *   declaration (the `param` merge «a הוא פרמטר» · «a>0» already uses), and an empty intersection
 *   («a<0» · «שרדיוסו a») is refused — the parameter can then never make the value admissible;
 * - any other parametric expression is judged at the probe environments: admissible at none of
 *   them is refused; admissible at some is accepted, because the domain of `2a` is not a thing this
 *   seam can carry back onto `a` (named in ADR-AG-169 am. 1 as not built).
 *
 * ONE domain predicate (`inDomain`, `types.ts`) serves both judges of a radius: this seam judges a
 * STATED value, so it calls it with the default floor 0 — the exact bound, «0» is not > 0; the
 * solve's judge (`openBoundFloor`, #1504 am. 1) passes the solver resolution, because a SOLVED value
 * parked within it of the bound is the bound. Same predicate, the floor says whose number it is.
 *
 * Returns the construction with the parameter narrowed (or unchanged), or the refusal.
 */
function admitStated(
  c: Construction,
  domain: Domain | undefined,
  value: Expr,
  src: string,
): { ok: true; next: Construction } | { ok: false; error: ApplyError } {
  if (!domain || (domain.min === undefined && domain.max === undefined && !domain.exclude?.length)) return { ok: true, next: c };
  const refuse = { ok: false as const, error: { code: 'out-of-domain' as const, detail: src, domain } };
  const syms = symbolsOf(value).filter((s) => !RESERVED_SYMBOLS.has(s));
  if (syms.length === 0) {
    return inDomain(domain, evalExpr(value, {})) ? { ok: true, next: c } : refuse;
  }
  if (value.kind === 'sym') {
    // The ONE domain merge («a הוא פרמטר» · «a>0»), not a second copy of it.
    const r = applyFact(c, { t: 'param', sym: value.name, domain, src });
    if (!r.ok) return r;
    const merged = r.next.params.find((p) => p.sym === value.name)?.domain;
    const empty =
      merged?.min !== undefined &&
      merged.max !== undefined &&
      (merged.min > merged.max || (merged.min === merged.max && (merged.minOpen || merged.maxOpen)));
    return empty ? refuse : { ok: true, next: r.next };
  }
  const somewhere = PROBE_ENVS.some((env) => inDomain(domain, evalExpr(value, env)));
  return somewhere ? { ok: true, next: c } : refuse;
}

/**
 * The kind of object an id names, read from the prefix the PARSER minted (#1179).
 *
 * Curves are prefixed so that a circle and a point may both be called `I`; points are bare. So the id
 * alone answers this at every refusal site, and no call site has to remember to say — which is what
 * keeps the next site that is handed a curve id from repeating the defect.
 *
 * An ANONYMOUS curve (`curve-<hash>`) gets the kind-free wording: it has no name the student wrote, so
 * there is no noun that would be true.
 */
// The table itself lives in `names.ts` (#1514 pre-play): it knew `line-`/`circle-` only, so a named
// parabola was called a POINT and printed as its raw id. Re-exported so every caller keeps its import.
export { refKindOf, statedName, type RefKind } from './names';

/**
 * The refusal for a numeral name typed in the notation the figure does NOT use (ruling 2026-09-29),
 * or null when `id` has no twin. Asked at the two places a numeral name meets the figure: where it
 * fails to resolve (`unknownRef`) and where it is minted (the top of `applyFact`).
 */
function notationMix(c: Construction, id: Id): ApplyError | null {
  const twin = numeralTwin(c.objects.map((o) => o.id), id);
  return twin ? { code: 'numeral-notation', detail: statedName(id), holder: statedName(twin), expected: refKindOf(id) } : null;
}

/**
 * A line's NAME TOKENS as the student wrote them (#1350): the name in its id («l3» of `line-l3`) and its
 * display name with the line noun stripped («ישר 3» → «3»), so a line narrowed from an anonymous one
 * still answers. Only LINES — «מעגל 3» is a different noun and reads as a different thing — and an
 * anonymous curve's hash is no name at all.
 */
function lineTokens(id: Id, shown: string | undefined, isLine: boolean): string[] {
  if (!isLine) return [];
  const out = new Set<string>();
  if (refKindOf(id) === 'line') out.add(statedName(id));
  if (shown) out.add(bareLineName(shown));
  return [...out];
}
const objectLineTokens = (o: GeoObject): string[] =>
  o.kind === 'line-at'
    ? lineTokens(o.id, o.name, true)
    : o.kind === 'curve'
      ? lineTokens(o.id, o.label.name, refKindOf(o.id) === 'line' || curveKindOf(o) === 'line')
      : [];
const factLineTokens = (f: Fact): string[] =>
  f.t === 'line-at'
    ? lineTokens(f.id, f.name, true)
    : f.t === 'curve'
      ? lineTokens(f.id, f.label.name, refKindOf(f.id) === 'line' || f.curve.kind === 'line' || f.label.kind === 'line')
      : [];

/**
 * THE OTHER LINE THIS NAME READS AS (#1350, ADR-AG-183) — the question beside #1342's `already-named`,
 * one axis over. That one asks *"does the figure hold THIS LINE under another name?"* (identity by
 * content); this asks *"does the figure hold ANOTHER LINE under a name the student reads as this one?"*
 * (identity by reading). The taken-name check compared TOKENS, so «הישר l3» then «הישר 3» recorded two
 * lines both called "3" with nothing said.
 *
 * Answered only for a name NEW to the figure — a name already held is a restatement, which is its own
 * id's business (`known`, a promotion, or `conflicting-restatement`) — and compared through
 * `nameReading`, so no pair gets a rule of its own.
 */
function readingTwin(c: Construction, f: Fact): ApplyNotice | undefined {
  if (f.t !== 'curve' && f.t !== 'line-at') return undefined;
  const incoming = factLineTokens(f);
  const readings = new Set(incoming.map(nameReading).filter((r): r is string => r !== null));
  if (readings.size === 0) return undefined;
  const others = c.objects.filter((o) => o.id !== f.id).map((o) => objectLineTokens(o));
  if (others.some((tokens) => tokens.some((t) => incoming.includes(t)))) return undefined;
  for (const tokens of others) {
    const hit = tokens.find((t) => {
      const r = nameReading(t);
      return r !== null && readings.has(r);
    });
    if (hit) return { code: 'name-reads-as', detail: incoming[0], holder: hit };
  }
  return undefined;
}

/** The one refusal for "the figure has no such thing", naming it the student's way and by its kind. */
function unknownRef(c: Construction, id: Id): ApplyError {
  return notationMix(c, id) ?? { code: 'unknown-reference', detail: statedName(id), expected: refKindOf(id) };
}

/**
 * The figure's DISTINCT EDGES at a vertex — every drawn segment and every shape side through it, one entry per
 * other end (#1407 ruling, 2026-09-27). The port of 2-D's `pointNeighbors` (`src/engine/step.ts`): a side
 * stated twice, by two shapes or by a shape and a segment, is ONE edge, because it is one line on the page.
 * Sorted, so a caller that reads a pair off it gets the ray order the parser gives the three-letter twin.
 */
function edgesAt(c: Construction, v: Id): Id[] {
  const out = new Set<Id>();
  for (const o of c.objects) {
    if (o.kind === 'segment') {
      if (o.a === v && o.b !== v) out.add(o.b);
      else if (o.b === v && o.a !== v) out.add(o.a);
    } else if (o.kind === 'polygon') {
      const ring = o.vertices;
      ring.forEach((p, i) => {
        if (p !== v) return;
        for (const q of [ring[(i - 1 + ring.length) % ring.length], ring[(i + 1) % ring.length]]) {
          if (q !== v) out.add(q);
        }
      });
    }
  }
  return [...out].sort();
}

/**
 * A lone VERTEX resolved to the angle it names in this figure (#1049, #1407) — the ONE resolver behind
 * «זווית B ישרה», «זווית C = 60» and «∠B = ∠C».
 *
 * 2-D's rule (`src/parser/parse.ts`, the bare-vertex angle: `nb.length !== 2` → `ambiguous-angle`), by
 * operator ruling on #1407 (2026-09-27): a lone vertex names an angle exactly when the figure draws TWO
 * distinct edges at it — {@link edgesAt}, the union over every shape and segment. How many SHAPES hold the
 * vertex is not the question: after «משולש ABC» · «מרובע ABCD», B has BA and BC in both, so «זווית B» can
 * only be ∠ABC. With more than two edges (C there: CA, CB, CD) the vertex has several angles, and the
 * refusal names a real one in three letters (`example`): the first shape's angle through the vertex, else
 * the first two edges. With fewer than two there are no arms yet, and it refuses with no example — any pair
 * would be a guess. A name that is already three letters passes through untouched.
 */
function resolveAngleName(
  c: Construction,
  n: AngleName,
  src: string,
): { ok: true; ref: AngleRef; readAs?: ApplyNotice } | { ok: false; error: ApplyError } {
  if (isAngleRef(n)) return { ok: true, ref: n };
  const host = objectById(c, n.v);
  if (!host || !isPositional(host)) return { ok: false, error: unknownRef(c, n.v) };
  const edges = edgesAt(c, n.v);
  if (edges.length === 2) return { ok: true, ref: { v: n.v, a: edges[0], b: edges[1] } };
  const name = (a: Id, b: Id) => `${statedName(a)}${statedName(n.v)}${statedName(b)}`;
  // #1445 (ADR-AG-243, operator ruling 2026-09-27 — 2-D's ADR-590): a vertex of exactly ONE shape names that
  // shape's interior angle, however many segments leave it, and the reading is said aloud (`angle-read-as`).
  // A shape stated twice is one shape; two shapes through the vertex (a sub-triangle too) stay ambiguous.
  const rings = [
    ...new Map(
      (c.objects.filter((g) => g.kind === 'polygon') as PolygonObject[]).map((g) => [[...g.vertices].sort().join('|'), g.vertices] as const),
    ).values(),
  ].filter((r) => r.includes(n.v));
  const ringPair = (ring: readonly Id[]): [Id, Id] => {
    const i = ring.indexOf(n.v);
    const pair = [ring[(i - 1 + ring.length) % ring.length], ring[(i + 1) % ring.length]].sort();
    return [pair[0], pair[1]];
  };
  if (edges.length > 2 && rings.length === 1) {
    const [a, b] = ringPair(rings[0]);
    return { ok: true, ref: { v: n.v, a, b }, readAs: { code: 'angle-read-as', detail: src, holder: name(a, b) } };
  }
  let taught: [Id, Id] | null = null;
  const options: string[] = [];
  if (edges.length > 2) {
    taught = rings.length > 0 ? ringPair(rings[0]) : [edges[0], edges[1]];
    for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) options.push(name(edges[i], edges[j]));
  }
  return {
    ok: false,
    error: {
      code: 'ambiguous-angle',
      detail: src,
      ...(taught ? { example: name(taught[0], taught[1]) } : {}),
      ...(options.length > 1 ? { options } : {}),
    },
  };
}

/** #1445: an outcome that landed carries the lone-vertex reading notice, unless it already carries one. */
function withReadAs(out: ApplyOutcome, ...reads: Array<{ readAs?: ApplyNotice }>): ApplyOutcome {
  const holders = reads.flatMap((r) => (r.readAs ? [r.readAs] : []));
  if (!out.ok || out.notice || holders.length === 0) return out;
  return { ...out, notice: { code: 'angle-read-as', detail: holders[0].detail, holder: holders.map((h) => h.holder).join(', ') } };
}

/** What a name already holds, in terms the student can recognise — see `ApplyError.existing`. */
export type ExistingKind =
  | 'point'
  | 'free'
  | 'segment'
  | 'polygon'
  | `curve:${string}`
  /** A circle stated by its CENTRE rather than by an equation (#1060). */
  | 'circle-at'
  | 'line-at'
  /** A circle COMPUTED from points (#1464). */
  | 'circle-thru'
  /** A drawn arc (#1622 E4). */
  | 'arc'
  | `derived:${string}`;

export function existingKindOf(o: GeoObject): ExistingKind {
  switch (o.kind) {
    case 'curve':
      return `curve:${o.label.kind}`;
    case 'derived':
      return `derived:${o.rule.t}`;
    case 'circle-at':
      return 'circle-at';
    case 'line-at':
      return 'line-at';
    case 'circle-thru':
      return 'circle-thru';
    default:
      return o.kind;
  }
}

/**
 * What a statement DID — the third answer the submit path was missing (#1045).
 *
 * `applyFact` has distinguished "created something" from "said something about what exists" since
 * V0, but as a boolean `absorbed`, and the `true` side covered two genuinely different events:
 *
 *  - **`known`** — the figure already held exactly this. Nothing changed. The student is right and
 *    should be told so, and the line must NOT be recorded: a row that contributed nothing is noise
 *    in the fact list, which is also the save file and the counter's source.
 *  - **`narrowed`** — «a הוא פרמטר» then «a<13». Absorbed into the existing declaration, but it DID
 *    add information, so it is a real given and belongs in the list. Calling this "already known"
 *    would be a lie about the student's own statement.
 *
 * Told apart explicitly rather than by comparing `next` with `c` for reference identity, which
 * happens to work today and would break the first time a no-op branch rebuilt its object.
 */
export type LineEffect = 'created' | 'known' | 'narrowed';

/**
 * SOMETHING THE STUDENT SHOULD BE TOLD ABOUT A STATEMENT THAT LANDED (#1350, ADR-AG-183) — never a
 * refusal: the statement is accepted and this rides along with it.
 *
 * `name-reads-as`: the line just named («הישר 3») reads, to a student, as the name of a DIFFERENT line
 * the figure already holds («l3»). Both are kept — the exam prints both conventions (operator ruling
 * 2026-09-22) — and the student is told they are two lines. `detail` is the new line's name as written,
 * `holder` the existing line's; both are the student's own tokens, never an id.
 */
export interface ApplyNotice {
  /**
   * `angle-read-as` (#1445, ADR-AG-243, operator ruling 2026-09-27): a lone vertex was read as the interior
   * angle of the ONE shape it belongs to, though more than two edges meet there — «זווית B» in △ABC with a
   * cevian at B is ∠ABC, and the student is told so. `detail` is the sentence, `holder` the three letters.
   */
  code: 'name-reads-as' | 'angle-read-as';
  detail: string;
  holder: string;
}

export type ApplyOutcome =
  | { ok: true; next: Construction; effect: LineEffect; notice?: ApplyNotice }
  | { ok: false; error: ApplyError };

/**
 * THE NAME THE STUDENT WROTE, from the id the parser minted (#1145, #1150).
 *
 * Curves get a prefixed id — «מעגל I» becomes `circle-I`, «הישר l7» becomes `line-l7` — so that a
 * circle and a point may both be called `I` without colliding. That prefix is internal, and it was
 * reaching the student: refusing «O מרכז המעגל Z» reported the detail **`circle-Z`**, a word they
 * never typed, and #1150's new curve check would have reported `line-l7` the same way.
 *
 * CLAUDE.md, *Honesty invariants*: **error messages name the conflicting statement, never internal
 * state.** A student told their sentence mentions `circle-Z` will look for `circle-Z` in it.
 *
 * Applied at EVERY `unknown-reference` site rather than at the two that were reported: it is the
 * identity function on an id that carries no prefix — a point is just `A` — so a uniform call cannot
 * be wrong, and the next site to be given a curve id inherits the fix.
 *
 * An ANONYMOUS curve (`curve-<hash>`) is deliberately left alone: there is no student name to
 * recover, and printing the hash's tail would be a different wrong word rather than the right one.
 */
// `statedName` — see `names.ts`, the one table (re-exported above).

/**
 * The object kinds that HAVE a shape — what an `on-curve` or a curve direction may name (#1150).
 *
 * A stated equation, a circle given by its centre, a line built through a point: each resolves to a
 * curve at evaluation, and each is a legitimate carrier. A POINT is not, and neither is a polygon —
 * naming one where a curve belongs is the same mistake as naming a curve that does not exist.
 */
const CURVE_BEARING: ReadonlySet<string> = new Set(['curve', 'circle-at', 'line-at', 'circle-thru']);

/** The probe environment for restatement comparison — see `sameNumbers`. */
const PROBE_ENVS: Env[] = [
  { a: 1.7, b: 2.3, k: 1.3, m: 0.7, n: 2.1, p: 1.9, r: 1.1, t: 2.7 },
  { a: 3.1, b: 1.1, k: 2.9, m: 1.3, n: 0.9, p: 3.3, r: 2.3, t: 1.3 },
];

/**
 * WHAT KIND OF CURVE an object is — one answer for every contextual reference (#1057, #1324).
 *
 * The kind of an ANONYMOUS conic is not declared — it comes from the FIT (02c R6: the noun is optional
 * "because the fit already knows the kind"). So «x²/9 + y²/4 = 1» carries no `curve.kind` at all, and
 * matching on the declaration alone would find no ellipse in a figure that plainly has one. Resolved
 * against a PROBE environment, the same device `sameNumbers` uses: a conic's KIND does not turn on the
 * value of its parameters in any form the corpus writes. A circle stated by its centre or computed from
 * points IS a circle, however it was stated.
 *
 * Lifted out of `on-kind` when «BD קוטר במעגל» needed the same question (#1324): a second copy that read
 * the declaration only missed «(x-3)^2+(y-4)^2=9» — measured — and treated the figure as circle-less.
 */
function curveKindOf(o: GeoObject): string | null {
  if (o.kind === 'circle-at' || o.kind === 'circle-thru') return 'circle';
  // A line CONSTRUCTED through a point is a line, however it was stated (#1501; the `on-curve`
  // M1 arm carried this as a local special case before it lived here).
  if (o.kind === 'line-at') return 'line';
  if (o.kind !== 'curve') return null;
  if (o.curve.kind) return o.curve.kind;
  const probe = resolveCurve(o.curve, PROBE_ENVS[0]);
  return probe.ok ? probe.curve.kind : null;
}

/**
 * THE RULE a circle's CENTRE follows from (#1619 B1) — the one answer to "which point is the centre of this
 * circle", for every way a circle is stated: an equation circle's centre is read off its equation
 * (`circle-centre`), a circle through three points has the circumcentre of the three, a circle on a
 * diameter has the diameter's midpoint. A circle on a centre POINT needs no rule — the point is the centre.
 */
function centreRuleOf(o: GeoObject): DerivedRule | null {
  if (o.kind === 'curve') return { t: 'circle-centre', curve: o.id };
  if (o.kind === 'circle-thru') {
    if (o.def.t === 'through') return { t: 'circumcentre', v: [o.def.pts[0], o.def.pts[1], o.def.pts[2]] };
    if (o.def.t === 'diameter') return { t: 'midpoint', a: o.def.a, b: o.def.b };
    // The incircle (#1619 B2): a triangle's centre is the incentre (the same closed form `incircleCentre`
    // uses); a quadrilateral's is the bisector meet `incircleCentre` draws the circle on (#1554, ADR-AG-242).
    const v = o.def.pts;
    if (v.length === 3) return { t: 'incentre', v: [v[0], v[1], v[2]] };
    return v.length === 4 ? { t: 'incircle-centre', v: [v[0], v[1], v[2], v[3]] } : null;
  }
  return null;
}

/** The POINT the figure already holds at this circle's centre, by its id — null when the centre is unnamed. */
function centreIdOf(c: Construction, o: GeoObject): Id | null {
  if (o.kind === 'circle-at') return o.centre;
  const rule = centreRuleOf(o);
  if (!rule) return null;
  const held = c.objects.find((p) => p.kind === 'derived' && sameDerivation(p.rule, rule));
  return held ? held.id : null;
}

/**
 * THE CIRCLE A NAME DENOTES — one chain for every sentence that names a circle (#1619 B1).
 *
 * The chain was spelled inline four times (`tangent-of`, `radius-of`, `diameter-of`, `tangent-circles`):
 * a numeral id, a centre-letter id, the student's own name. None of the copies knew the fourth way the
 * exam names a circle — by the letter of a centre that was NAMED after the circle was stated («נתון מעגל M
 * שמשוואתו …», «M מרכז המעגל»), so «A על מעגל M» found no circle beside a figure whose circle plainly has
 * centre M. Asked here once, so every reference reaches every naming.
 */
function circleByName(c: Construction, name: string): GeoObject | undefined {
  const described = readDescribedCircle(name);
  if (described) return describedCircle(c, described);
  const direct = objectById(c, numeralCurveId('circle', name)) ?? objectById(c, `circle-at-${name}`) ?? curveByName(c, name);
  if (direct) return direct;
  return c.objects.find((o) => curveKindOf(o) === 'circle' && centreIdOf(c, o) === name);
}

/**
 * THE CIRCLE A RING DESCRIBES (#1663, ADR-AG-203) — «המעגל החוסם את המשולש ABC» is the circle the figure states
 * EVERY vertex on (a defining point of a computed circle, or an incidence — so a triangle inscribed in an equation
 * circle names that circle); «המעגל החסום במשולש ABC» is the computed incircle of that ring, or the circle the
 * figure states tangent to every side of it (the touch sentence's circle, ADR-AG-198). Asked of what the figure
 * STATES, never of the circle's kind, so every way a circle can come to pass through or touch a ring is the same
 * name. None → undefined, and the caller refuses the reference as it refuses any unknown circle name.
 */
function describedCircle(c: Construction, d: DescribedCircle): GeoObject | undefined {
  const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
  if (d.role === 'circum') {
    const onIt = (o: GeoObject, p: Id) =>
      (o.kind === 'circle-thru' && o.def.t !== 'incircle' && circleDefPoints(o.def).includes(p)) ||
      c.constraints.some((k) => k.t === 'on-curve' && k.id === p && k.curve === o.id);
    return circles.find((o) => d.pts.every((p) => onIt(o, p)));
  }
  const ring = ringId(d.pts);
  const sides = d.pts.map((p, i) => [p, d.pts[(i + 1) % d.pts.length]] as const);
  return circles.find(
    (o) =>
      (o.kind === 'circle-thru' && o.def.t === 'incircle' && ringId(o.def.pts) === ring) ||
      sides.every(([a, b]) => statedTangentToSide(c, o.id, a, b)),
  );
}

/**
 * THE CIRCLE A SENTENCE ABOUT «המעגל» BINDS TO (ADR-AG-196, #1633) — the one answer for `the-circle`.
 *
 * A sentence that describes its own circle (`match`: a centre letter, an equation) binds to a circle the
 * figure already holds with that centre or that equation, and otherwise states a new one. A sentence whose
 * subject is only the contextual «המעגל» binds to the figure's ONE circle, states its circle when there is
 * none, and is ambiguous when there are several — never a pick.
 */
function theCircle(
  c: Construction,
  match: { centre: Id } | { eq: Expr } | { inscribed: Id[] } | undefined,
): { t: 'bind'; host: GeoObject } | { t: 'create' } | { t: 'ambiguous'; circles: GeoObject[] } {
  if (match && 'inscribed' in match) {
    // The circle already stated tangent to every side of the ring (ADR-AG-198) — exactly one binds, else create.
    const ring = match.inscribed;
    const sides = ring.map((p, i) => [p, ring[(i + 1) % ring.length]] as const);
    const hosts = c.objects.filter((o) => curveKindOf(o) === 'circle' && sides.every(([a, b]) => statedTangentToSide(c, o.id, a, b)));
    return hosts.length === 1 ? { t: 'bind', host: hosts[0] } : { t: 'create' };
  }
  if (match && 'centre' in match) {
    const host = circleByName(c, match.centre);
    return host && curveKindOf(host) === 'circle' ? { t: 'bind', host } : { t: 'create' };
  }
  if (match) {
    const id = resolveCurveByEq(c, match.eq);
    const host = id ? objectById(c, id) : undefined;
    return host && curveKindOf(host) === 'circle' ? { t: 'bind', host } : { t: 'create' };
  }
  const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
  if (circles.length === 0) return { t: 'create' };
  if (circles.length === 1) return { t: 'bind', host: circles[0] };
  return { t: 'ambiguous', circles };
}

/**
 * Does the figure STATE circle `id` tangent to the side `a`–`b`? The touch lowering's own mark (the radius at the
 * touch point perpendicular to the side, `applyTouchAt`) or the touch-free tangency over that pair (ADR-AG-198).
 */
function statedTangentToSide(c: Construction, id: Id, a: Id, b: Id): boolean {
  const same = (d: Direction) => d.k === 'points' && [d.a, d.b].sort().join() === [a, b].sort().join();
  return c.constraints.some(
    (k) =>
      (k.t === 'relation' && k.rel === 'perpendicular' && k.u.k === 'radius' && k.u.circle === id && same(k.v)) ||
      (k.t === 'tangent-curve' && k.circle === id && k.line.kind === 'points' && same({ k: 'points', a: k.line.a, b: k.line.b })),
  );
}

/**
 * WHICH EXISTING CURVE this equation denotes, if any (#1429 — the ADR-AG-023/#1342 identity
 * class at the operand boundary). Resolved numerically at the probe environments, like every
 * identity question here: two spellings of one equation are one curve, and a parameterised
 * equation matches only a curve that agrees at EVERY probe. Only equation-stated objects can
 * match — a `circle-at`'s equation is wherever the solve put it, which is not an identity.
 */
function resolveCurveByEq(c: Construction, eq: unknown): Id | null {
  if (!eq) return null;
  const close = (v: number, w: number) => Math.abs(v - w) <= 1e-9 * Math.max(1, Math.abs(v), Math.abs(w));
  const same = (a: Record<string, unknown>, b: Record<string, unknown>): boolean =>
    a.kind === b.kind &&
    Object.entries(a).every(([key, v]) => typeof v !== 'number' || (typeof b[key] === 'number' && close(v, b[key] as number)));
  for (const o of c.objects) {
    if (o.kind !== 'curve') continue;
    const match = PROBE_ENVS.every((env) => {
      const mine = resolveCurve({ eq } as typeof o.curve, env);
      const theirs = resolveCurve(o.curve, env);
      return mine.ok && theirs.ok && same(mine.curve as unknown as Record<string, unknown>, theirs.curve as unknown as Record<string, unknown>);
    });
    if (match) return o.id;
  }
  return null;
}

/**
 * Do two expressions denote the same value? Compared NUMERICALLY at several parameter probes
 * rather than structurally, because `2a` and `a+a` are the same given written two ways and a
 * student who restates a fact in different words has not contradicted anything. Two probes make an
 * accidental agreement vanishingly unlikely without pretending to be a symbolic comparison.
 */
function sameNumbers(a: unknown, b: unknown): boolean {
  const ea = a as Parameters<typeof evalExpr>[0];
  const eb = b as Parameters<typeof evalExpr>[0];
  return PROBE_ENVS.every((env) => {
    const va = evalExpr(ea, env);
    const vb = evalExpr(eb, env);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return false;
    return Math.abs(va - vb) <= 1e-9 * Math.max(1, Math.abs(va), Math.abs(vb));
  });
}

/**
 * THE ID GATE — one rule for every object kind, enumerating none of them.
 *
 * For every fact that names an object, `f.t` **is** the kind that fact would create: the `Fact`
 * discriminants minus `param` are exactly the {@link GeoObject} kinds. So "does this name already
 * belong to something else?" is one comparison, and it cannot go stale when a kind is added.
 *
 * It is written this way because the previous version did go stale. Each case asked only about the
 * kinds it happened to know — the point case checked for a curve and nothing else — so when #1028
 * added `derived`, `segment` and `polygon`, a `derived` object was invisible to it. Stating
 * «M מפגש התיכונים במשולש ABC» and then «M(3,c)» produced **two objects called M**, both drawn, with
 * no refusal: the figure had two points with one name, and every later reference to `M` bound to
 * whichever came first. That is [ADR-043](../../docs/06-decisions.md#adr-043)'s hand-listed-kind-sets
 * defect, which `carriers.ts` was built to prevent and which slipped in here because a predicate is
 * not an exhaustive switch.
 */
function priorOf(
  c: Construction,
  f: Fact,
): { same: GeoObject } | { clash: true; prior: GeoObject } | null {
  if (!namesObject(f)) return null;
  const prior = objectById(c, f.id);
  if (!prior) return null;
  // The clash carries the object it collided with, so the refusal can say what the name holds
  // rather than only that the name is taken (#1046).
  return prior.kind === f.t ? { same: prior } : { clash: true, prior };
}

/** A tangent OBJECT (#1619 B3): the line built at a touch point, perpendicular to the radius there. */
const isTangentObject = (o: GeoObject): boolean => o.kind === 'line-at' && o.dir.k === 'radius' && o.perp;

/**
 * THE CIRCLE A NAME MEANS — the `tangent-of`/`diameter-of` chain (a numeral id, a centre-letter id, the
 * student's own name), or the ONE circle in the figure when no name was said. Shared so the tangency
 * family cannot drift (#1619 B3).
 */
function circleNamed(
  c: Construction,
  name: string | undefined,
  src: string,
): { ok: true; o: GeoObject } | { ok: false; error: ApplyError } {
  if (name !== undefined) {
    const o = circleByName(c, name);
    if (!o || curveKindOf(o) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', name)) };
    return { ok: true, o };
  }
  const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
  if (circles.length !== 1) return { ok: false, error: noHost(src, 'circle', circles) };
  return { ok: true, o: circles[0] };
}

/** A name a student writes for a POINT (a capital letter, an optional index) that is not a circle numeral («I», «II»). */
const POINT_LETTER = /^[A-Z][0-9₀-₉]?$/;

/**
 * A NAMED CIRCLE THE FIGURE DOES NOT HAVE YET: THE REFERENCE STATES IT (#1670, ADR-AG-210; operator 2026-10-02 — follow
 * 2-D). «A על המעגל שמרכזו M», «מיתר AB במעגל O», «AB משיק למעגל C», «AC קוטר במעגל O» with no such circle: 2-D states
 * the circle on that centre (a free centre when the letter is new, a free radius — ADR-052) and carries on; so does this.
 * The circle is exactly the one «מעגל M» states (`circle-at-M`, radius symbol `radiusSymbol(M)` > 0), and the fact is then re-applied
 * against it, so every sentence reaches the circle through the one name chain (`circleByName`) as before.
 *
 * `null` = not a name this can state (a numeral, a ring description, a name already holding a non-point) — the caller
 * keeps its refusal. A new letter is stated even beside a circle whose centre has no letter (operator 2026-10-02, #1686):
 * it is a free point until a sentence places it.
 */
function statingNamedCircle(c: Construction, name: string, f: Fact): ApplyOutcome | null {
  /*
   * A RING-DESCRIBED circle the figure does not have (#1622, ADR-AG-217) — «D על המעגל החוסם את המשולש ABC», «המעגל
   * החוסם את משולש ABC חותך את CE בנקודה D»: 2-D builds the circumcircle on demand; so does this, as the computed circle
   * «המעגל החוסם את המשולש ABC» states (`circle-thru` through the three; the incircle for «החסום ב»). Its ring must exist.
   */
  const described = readDescribedCircle(name);
  if (described) {
    const creation: Fact | null =
      described.role === 'circum'
        ? described.pts.length === 3
          ? { t: 'circle-thru', id: `circle-thru-${[...described.pts].sort().join('')}`, def: { t: 'through', pts: [described.pts[0], described.pts[1], described.pts[2]] }, src: f.src }
          : null
        : { t: 'circle-thru', id: incircleId(ringId(described.pts)), def: { t: 'incircle', pts: [...described.pts] }, src: f.src };
    if (!creation) return null;
    const made = applyAll(c, [creation]);
    if (!made.ok) return made;
    const out = applyFact(made.next, f);
    return out.ok ? { ...out, effect: 'created' } : out;
  }
  if (!POINT_LETTER.test(name) || isNumeralName(name)) return null;
  const held = objectById(c, name);
  if (held && !isPositional(held)) return null;
  // Two fresh interchangeable circles: the new letter names one of them, by order (#1688 ruling, ADR-AG-219).
  if (!held) {
    const pick = circleToName(c);
    if (pick?.t === 'name') return namingByOrder(c, pick.host, name, f);
    if (pick?.t === 'ask') return { ok: false, error: noHost(f.src, 'circle', pick.circles) };
  }
  const r = radiusSymbol(name);
  const created = applyAll(c, [
    { t: 'declare', id: name, src: f.src },
    { t: 'param', sym: r, domain: { min: 0, minOpen: true }, src: f.src },
    { t: 'circle-at', id: `circle-at-${name}`, centre: name, r: { kind: 'sym', name: r }, src: f.src },
  ]);
  if (!created.ok) return created;
  const out = applyFact(created.next, f);
  return out.ok ? { ...out, effect: 'created' } : out;
}

/** The same object, no longer hidden (#1622 E4): a hidden circle the student then states is drawn. */
function unhidden(c: Construction, id: Id): Construction {
  return {
    ...c,
    objects: c.objects.map((o): GeoObject => {
      if (o.id !== id) return o;
      if (o.kind === 'circle-at') return { kind: 'circle-at', id: o.id, centre: o.centre, r: o.r };
      if (o.kind === 'circle-thru') return { kind: 'circle-thru', id: o.id, def: o.def, ...(o.name ? { name: o.name } : {}) };
      return o;
    }),
  };
}

/**
 * THE CIRCLE AN ARC SENTENCE MEANS (#1622 E4, ADR-AG-220) — the name chain for a named circle (and the statement of a
 * named circle the figure lacks, ADR-AG-210, which re-applies the fact against it), the ONE circle for the contextual
 * reading; none or several of those is the contextual refusal every circle reference gives.
 */
function arcHost(c: Construction, name: string | undefined, f: Fact): { o: GeoObject } | { outcome: ApplyOutcome } {
  if (name !== undefined) {
    const named = circleByName(c, name);
    if (!named) return { outcome: statingNamedCircle(c, name, f) ?? { ok: false, error: unknownRef(c, numeralCurveId('circle', name)) } };
    if (curveKindOf(named) !== 'circle') return { outcome: { ok: false, error: unknownRef(c, numeralCurveId('circle', name)) } };
    return { o: named };
  }
  const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
  if (circles.length !== 1) return { outcome: { ok: false, error: noHost(f.src, 'circle', circles) } };
  return { o: circles[0] };
}

/** «each of these is ON the circle» — skipping a point the circle already carries (a defining point, a stated incidence, its centre). */
function onCircle(c: Construction, host: GeoObject, ids: readonly Id[], src: string): Fact[] {
  return ids
    .filter((id) => !onCircleAlready(c, host, id) && !(host.kind === 'circle-at' && host.centre === id))
    .map((id): Fact => ({ t: 'constraint', k: { t: 'on-curve', id, curve: host.id }, src }));
}

/** Is `id` ON this circle already — one of the points that define it, or stated on it? (#1670) */
function onCircleAlready(c: Construction, host: GeoObject, id: Id): boolean {
  if (host.kind === 'circle-thru' && circleDefPoints(host.def).includes(id)) return true;
  return c.constraints.some((k) => k.t === 'on-curve' && k.id === id && k.curve === host.id);
}

/**
 * THE CENTRE NAMED BY A RADIUS (#1670, ADR-AG-210; operator 2026-10-02 — follow 2-D). «AB קוטר» · «OB רדיוס»: the circle's
 * centre has no letter, and the radius sentence gives it one — the STUDENT's letter, the end the sentence itself just
 * introduced (no constraint on it, nothing built on it but the drawn radius). It becomes the centre the circle already has
 * (`centreRuleOf` — the diameter's midpoint, an equation circle's `circle-centre`), in place, so the drawn radius keeps its
 * end. `null` when `id` is not such a point or the circle's centre has no closed form (a quadrilateral's incircle).
 */
function nameCentreAs(c: Construction, host: GeoObject, id: Id, src: string): Construction | null {
  const rule = centreRuleOf(host);
  const standing = objectById(c, id);
  if (!rule || standing?.kind !== 'free') return null;
  const mentioned = (v: unknown) => JSON.stringify(v).includes(JSON.stringify(id));
  if (mentioned(c.constraints) || c.objects.some((o) => o.id !== id && o.kind !== 'segment' && mentioned(o))) return null;
  const at = c.objects.findIndex((o) => o.id === id);
  const named = applyFact({ ...c, objects: c.objects.filter((o) => o.id !== id) }, { t: 'derived', id, rule, src });
  if (!named.ok) return null;
  const centre = named.next.objects.find((o) => o.id === id)!;
  const rest = named.next.objects.filter((o) => o.id !== id);
  return { ...named.next, objects: [...rest.slice(0, at), centre, ...rest.slice(at)] };
}

/**
 * A TANGENCY AT A NAMED POINT (#1619 B3, #1430, ADR-AG-195) — «המעגל משיק לציר ה-x בנקודה A», «הישר BC משיק
 * למעגל בנקודה B», «הקטע CD משיק למעגל בנקודה A».
 *
 * Tangent at A ⇔ A is on the circle, A is on the line, and the line is perpendicular to the radius at A —
 * three equations, and they say tangency exactly (a line through a point of a circle, perpendicular to the
 * radius there, meets it nowhere else). Lowered to those three statements, so nothing new is solved: the
 * incidences are the ones «A על המעגל» and «A על הישר BC» carry, and the perpendicularity is the relation
 * «⊥» over the radius DIRECTION. Because the radius is read off the RESOLVED circle, it holds for a circle
 * stated by its equation, by its centre, or computed from points — where the no-point tangency
 * (`tangent-line`, distance = radius) needs a free radius to pull on.
 *
 * A touch point that IS an end of the named line («הישר BC משיק … בנקודה B») is on it already. The
 * SELECTORS the sentence carries (the ends distinct; a bounded noun's `between`, «הקטע CD») are emitted by
 * the parser beside this fact, where `derive` can blame a configuration that fails one on the line.
 */
/**
 * THE CIRCLE A TANGENCY SENTENCE STATES when the figure has none (#1619 ruling b, ADR-AG-198) — its centre
 * UNNAMED. An equation circle `(x−a)² + (y−b)² = r²` whose centre coordinates and radius are the tool's own
 * free symbols (`toolSymbol`): 3 DOF the sentence's touches then consume, sampled and solved like any free
 * vertex, kept out of the parameter rows (the free direction's discipline), the radius positive. It is an
 * ordinary circle from here on — «המעגל» binds to it, «O מרכז המעגל» names its centre through the derived
 * `circle-centre` an equation circle's centre already has (B1), its equation prints once the givens fix it.
 * Only made when there is no circle, so its one id never meets another. A CHORD sentence typed before any circle
 * states the same circle (#1669, ADR-AG-204 — the `on-kind { create }` arm): one creation for both sentences.
 */
const TOUCHED_CIRCLE_ID: Id = 'circle-touched';

/** A ring's canonical polygon id — the smallest rotation of it and of its reverse (the parser's `polygonId`). */
const ringId = (v: readonly Id[]): Id =>
  `poly-${[[...v], [...v].reverse()].flatMap((b) => b.map((_, i) => [...b.slice(i), ...b.slice(0, i)].join(''))).sort()[0]}`;
function touchedCircleFacts(src: string, id: Id = TOUCHED_CIRCLE_ID, radius?: Expr): Fact[] {
  return createdCircleFacts(id, src, false, radius);
}

/**
 * A CIRCLE WHOSE CENTRE HAS NO LETTER, over the tool's own free symbols (ADR-AG-198) — the tangency's created circle,
 * and since #1622 E4 a bare quarter circle's (`hidden`: it carries the arc's ends, and only the arc is drawn). A stated
 * `radius` (#1622 E3, ADR-AG-219 — «מעגל בקוטר 10») takes the radius symbol's place.
 */
function createdCircleFacts(id: Id, src: string, hidden: boolean, radius?: Expr): Fact[] {
  const sym = (part: string): Expr => ({ kind: 'sym', name: toolSymbol(id, part) });
  const sq = (e: Expr): Expr => ({ kind: 'pow', a: e, b: { kind: 'num', value: 2 } });
  const eq: Expr = {
    kind: 'sub',
    a: {
      kind: 'add',
      a: sq({ kind: 'sub', a: { kind: 'sym', name: 'x' }, b: sym('a') }),
      b: sq({ kind: 'sub', a: { kind: 'sym', name: 'y' }, b: sym('b') }),
    },
    b: sq(radius ?? sym('r')),
  };
  return [
    ...(radius ? [] : [{ t: 'param' as const, sym: toolSymbol(id, 'r'), domain: { min: 0, minOpen: true }, src }]),
    { t: 'curve', id, label: { name: '', kind: 'circle' }, curve: { kind: 'circle', eq }, stated: !hidden, src },
  ];
}

/**
 * A CIRCLE A SENTENCE DREW WITH ITS CENTRE UNNAMED (ADR-AG-198, ADR-AG-219) — an equation circle over its own tool
 * symbols (`θ_<id>.a`, `.b`, `.r`): the tangency's created circle, «A על המעגל»'s, and the circles a
 * `circles-about` sentence draws. Asked of the expression, never of the id, so every way of creating one is one kind.
 */
function isCreatedCircle(o: GeoObject): o is CurveObject {
  return o.kind === 'curve' && JSON.stringify(o.curve).includes(`"${toolSymbol(o.id, '')}`);
}

/** A fresh id for a circle a `circles-about` sentence draws: `circle-new<k>`, a pair `circle-pair<k>-1` / `-2` (ADR-AG-219). */
function freshCircleIds(c: Construction, n: number): Id[] {
  const taken = (id: Id) => c.objects.some((o) => o.id === id);
  for (let k = 1; ; k += 1) {
    const ids = n === 2 ? [`circle-pair${k}-1`, `circle-pair${k}-2`] : Array.from({ length: n }, (_, i) => `circle-new${k + i}`);
    if (!ids.some(taken)) return ids;
  }
}

/** A created circle's centre and radius, read off the equation `touchedCircleFacts` writes: (x−a)² + (y−b)² − r². */
function createdParts(o: CurveObject): { a: Expr; b: Expr; r: Expr } | null {
  const eq = o.curve.eq as Expr;
  if (eq.kind !== 'sub' || eq.a.kind !== 'add' || eq.b.kind !== 'pow') return null;
  const [px, py] = [eq.a.a, eq.a.b];
  if (px.kind !== 'pow' || py.kind !== 'pow' || px.a.kind !== 'sub' || py.a.kind !== 'sub') return null;
  return { a: px.a.b, b: py.a.b, r: eq.b.a };
}

/**
 * TWO CIRCLES' STATED POSITION, DRAWN BY CONSTRUCTION (#1622 E3, ADR-AG-219) — «מוכל» (`inside`: `b` strictly inside
 * `a`) and «זרים» (`apart`). Each is a thin region of a random draw once points ride the circles
 * (measured: «מעגל P מוכל בתוך מעגל O» held at 1 seed of 24; «שני מעגלים זרים» · «C על מעגל P» · «D על מעגל O» at none),
 * so the distance between the centres is PARAMETRISED by what the relation allows, and the selector beside it stays
 * the statement:
 *
 * - `inside`: s·(R − r), s ∈ [0, 1); a circle the sentence drew inside takes radius k·R, k ∈ (0, 1);
 * - `apart`: R + r + g, g > 0.
 *
 * «נחתכים» needs none: its two crossings already put both circles through two points, and its `cross` selector only
 * keeps the two circles from being one (measured: parametrising it as well slowed the #1693 sequence tenfold).
 *
 * Two circles on centre POINTS: the centre distance is that length (`length-eq`). A circle the sentence DREW (its
 * centre the tool's symbols): its centre is the other centre plus that distance along the rational direction
 * ((1−m²), 2m)/(1+m²) — or, beside a centre point, that point is placed there from it (`coord`). Every configuration
 * of the relation is one value of the symbols, which are the tool's own, sampled and moved by «הציגו תצורה אחרת» —
 * free, never defaults (ADR-052). Anything else keeps the selector alone (the walk).
 */
function relateCircles(
  c: Construction,
  rel: 'apart' | 'inside',
  aId: Id,
  bId: Id,
  src: string,
): { ok: true; next: Construction } | { ok: false; error: ApplyError } {
  const a = objectById(c, aId);
  const b = objectById(c, bId);
  if (!a || !b || a === b) return { ok: false, error: { code: 'unsatisfiable', detail: src } };
  const sym = (name: string): Expr => ({ kind: 'sym', name });
  const num = (value: number): Expr => ({ kind: 'num', value });
  const add = (x: Expr, y: Expr): Expr => ({ kind: 'add', a: x, b: y });
  const sub = (x: Expr, y: Expr): Expr => ({ kind: 'sub', a: x, b: y });
  const mul = (x: Expr, y: Expr): Expr => ({ kind: 'mul', a: x, b: y });
  const partsOf = (o: GeoObject): { a?: Expr; b?: Expr; r: Expr; centre?: Id } | null => {
    if (o.kind === 'circle-at') return { r: o.r as Expr, centre: o.centre };
    if (o.kind === 'curve') return createdParts(o);
    return null;
  };
  const pa = partsOf(a);
  const pb = partsOf(b);
  if (!pa || !pb || (pa.centre !== undefined && pa.centre === pb.centre)) return { ok: true, next: c };
  const own = (part: string) => toolSymbol(b.id, part);
  const params: Fact[] = [];
  let rB = pb.r;
  const freeR = isCreatedCircle(b) && JSON.stringify(b.curve).includes(`"${own('r')}"`);
  // A circle the sentence drew inside another takes radius k·R: every smaller radius, none rejected.
  if (rel === 'inside' && freeR) {
    rB = mul(sym(own('k')), pa.r);
    params.push({ t: 'param', sym: own('k'), domain: { min: 0, max: 1, minOpen: true, maxOpen: true }, src });
  }
  const s = sym(own('s'));
  let distance: Expr;
  if (rel === 'inside') {
    distance = mul(s, sub(pa.r, rB));
    params.push({ t: 'param', sym: own('s'), domain: { min: 0, max: 1, minOpen: false, maxOpen: true }, src });
  } else {
    distance = add(add(pa.r, rB), sym(own('g')));
    params.push({ t: 'param', sym: own('g'), domain: { min: 0, minOpen: true }, src });
  }
  // Two centre POINTS: the centre distance is a length given.
  if (pa.centre !== undefined && pb.centre !== undefined) {
    const left = parseLengthExpr(`${pa.centre}${pb.centre}`);
    if (!left) return { ok: true, next: c };
    const out = applyAll(c, [...params, { t: 'constraint', k: { t: 'length-eq', left, right: { expr: distance, terms: [] } }, src }]);
    return out.ok ? { ok: true, next: out.next } : out;
  }
  const m = sym(own('m'));
  const mm: Expr = { kind: 'pow', a: m, b: num(2) };
  const den = add(num(1), mm);
  const ux: Expr = { kind: 'div', a: sub(num(1), mm), b: den };
  const uy: Expr = { kind: 'div', a: mul(num(2), m), b: den };
  params.push({ t: 'param', sym: own('m'), domain: UNBOUNDED, src });
  let next: Construction = c;
  const substitute = (name: string, value: Expr) => {
    next = {
      ...next,
      objects: substituteSym(next.objects, name, value),
      constraints: substituteSym(next.constraints, name, value),
      params: next.params.filter((p) => p.sym !== name),
    };
  };
  const extra: Fact[] = [];
  if (isCreatedCircle(b) && pb.a && pb.b) {
    if (rB !== pb.r) substitute(own('r'), rB);
    if (pa.a && pa.b) {
      // A drawn circle beside a drawn circle: its centre is the other's plus the distance.
      substitute(own('a'), add(pa.a, mul(distance, ux)));
      substitute(own('b'), add(pa.b, mul(distance, uy)));
    } else if (pa.centre !== undefined) {
      // Beside a centre POINT: the point is placed at the distance from the drawn centre (the same freedom, moved).
      extra.push({ t: 'constraint', k: { t: 'coord', id: pa.centre, x: sub(pb.a, mul(distance, ux)), y: sub(pb.b, mul(distance, uy)) }, src });
    } else return { ok: true, next: c };
  } else return { ok: true, next: c };
  const out = applyAll(next, [...params, ...extra]);
  return out.ok ? { ok: true, next: out.next } : out;
}

/** The sibling of a circle one sentence drew as a PAIR (`circle-pair<k>-1` ↔ `-2`), or null (ADR-AG-219). */
function pairSiblingOf(id: Id): Id | null {
  const m = /^(circle-pair\d+)-([12])$/.exec(id);
  return m ? `${m[1]}-${m[2] === '1' ? '2' : '1'}` : null;
}

/**
 * ARE TWO CIRCLES INTERCHANGEABLE — does swapping them change no statement of the figure? (#1688 ruling, ADR-AG-219;
 * 2-D's `autosInterchangeable`, ADR-565 decision 7). Every object, constraint, selector and parameter is serialised
 * twice — once with the two circles (and the tool symbols spelled from their ids) swapped — and the two multisets
 * compared. «שני מעגלים נחתכים בנקודות A ו-B» is symmetric (each crossing is on both); «C על מעגל P», a size, or
 * «מוכל» tells them apart.
 */
function interchangeable(c: Construction, a: Id, b: Id): boolean {
  const swap = (text: string) => text.replace(/circle-pair\d+-[12](?=[".])/g, (m) => (m === a ? b : m === b ? a : m));
  const bag = (xs: readonly unknown[], swapped: boolean) =>
    xs.map((x) => (swapped ? swap(JSON.stringify(x)) : JSON.stringify(x))).map(normaliseSymmetric).sort();
  /*
   * The STATEMENTS, not the drawing: the two circles' own equations and the tool's symbols that place them are how the
   * pair is drawn (`relateCircles` puts the second relative to the first), never something the student said.
   */
  const mine = (sym: string) => sym.startsWith(toolSymbol(a, '')) || sym.startsWith(toolSymbol(b, ''));
  const all = [...c.objects.filter((o) => o.id !== a && o.id !== b), ...c.constraints, ...c.selectors, ...c.params.filter((p) => !mine(p.sym))];
  return JSON.stringify(bag(all, false)) === JSON.stringify(bag(all, true));
}

/** A symmetric statement written in one order: `apart` / `cross` between two circles read the same either way round. */
function normaliseSymmetric(text: string): string {
  const m = /^\{"kind":"sign","q":\{"k":"circles","a":"([^"]+)","b":"([^"]+)","rel":"(?:apart|cross)"\}/.exec(text);
  if (!m || m[1] <= m[2]) return text;
  return text.replace(`"a":"${m[1]}","b":"${m[2]}"`, `"a":"${m[2]}","b":"${m[1]}"`);
}

/**
 * WHICH UNNAMED CIRCLE A NEW LETTER NAMES (operator ruling 2026-10-02 on #1688, ADR-AG-219). Two freshly drawn circles
 * that are interchangeable: the first mention of a new letter names the first-drawn one, deterministically, and the
 * next new letter names the other. Circles a statement tells apart are not picked between: the caller asks which.
 *
 * - `name` — the circle the letter names: the first of an interchangeable pair, or the one left unnamed once its
 *   pair sibling was named;
 * - `ask` — two or more circles with unnamed centres and no such answer;
 * - `null` — at most one unnamed circle that is no pair's: the caller keeps its rule (ADR-AG-210 states a new circle).
 */
function circleToName(c: Construction): { t: 'name'; host: GeoObject } | { t: 'ask'; circles: GeoObject[] } | null {
  const unnamed = c.objects.filter((o) => curveKindOf(o) === 'circle' && centreRuleOf(o) !== null && centreIdOf(c, o) === null);
  for (const o of unnamed) {
    const sib = pairSiblingOf(o.id);
    if (!sib || o.id > sib) continue;
    if (unnamed.some((u) => u.id === sib) && interchangeable(c, o.id, sib)) return { t: 'name', host: o };
  }
  for (const o of unnamed) {
    const sib = pairSiblingOf(o.id);
    const sibling = sib ? objectById(c, sib) : undefined;
    if (sibling && centreIdOf(c, sibling) !== null) return { t: 'name', host: o };
  }
  return unnamed.length >= 2 ? { t: 'ask', circles: unnamed } : null;
}

/** Name `host`'s centre `id` (the derivation its centre follows), then re-apply `f` — the naming by order (ADR-AG-219). */
function namingByOrder(c: Construction, host: GeoObject, id: Id, f: Fact): ApplyOutcome {
  const rule = centreRuleOf(host);
  if (!rule) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
  const named = applyFact(c, { t: 'derived', id, rule, src: f.src });
  if (!named.ok) return named;
  if (f.t === 'centre-of') return { ...named, effect: 'created' };
  const out = applyFact(named.next, f);
  return out.ok ? { ...out, effect: 'created' } : out;
}

function applyTouchAt(
  c: Construction,
  host: GeoObject,
  at: Id,
  axes: ReadonlyArray<'x' | 'y'>,
  lines: readonly TangentLineRef[],
  src: string,
): ApplyOutcome {
  if (axes.length + lines.length !== 1) return { ok: false, error: { code: 'out-of-scope', detail: src } };
  /*
   * THE INCIRCLE'S OWN SIDE (#1619 B2, unified at integration — ADR-AG-196): the ring's side touches the
   * incircle BY CONSTRUCTION, so the three statements below would restate a tangency the circle already
   * has, and solve for a point the closed form gives. The touch point is the `side-touch` derived point —
   * the foot of the centre on the side. A point the sentence only just introduced (declared, no constraint
   * on it yet — a selector only filters) IS that point, exactly, as a free vertex given coordinates is anchored; one the
   * figure already constrains gets the foot as a condition (`derived-at`). Any other line touching the
   * incircle is the general lowering.
   */
  const only = lines[0];
  if (host.kind === 'circle-thru' && host.def.t === 'incircle' && only && only.kind === 'points' && at !== only.a && at !== only.b) {
    const ring = host.def.pts;
    const isSide = ring.some((p, i) => [p, ring[(i + 1) % ring.length]].sort().join() === [only.a, only.b].sort().join());
    if (isSide) {
      const touch: Fact = { t: 'derived', id: at, rule: { t: 'side-touch', circle: host.id, a: only.a, b: only.b }, src };
      const standing = objectById(c, at);
      const mentioned = (v: unknown) => JSON.stringify(v).includes(JSON.stringify(at));
      const fresh =
        standing?.kind === 'free' &&
        !mentioned(c.constraints) &&
        !c.objects.some((o) => o.id !== at && mentioned(o));
      return applyFact(fresh ? { ...c, objects: c.objects.filter((o) => o.id !== at) } : c, touch);
    }
  }
  const facts: Fact[] = [{ t: 'constraint', k: { t: 'on-curve', id: at, curve: host.id }, src }];
  let dir: Direction;
  if (axes.length === 1) {
    const axis = axes[0];
    dir = { k: 'axis', axis };
    const onAxis: Constraint = axis === 'x' ? { t: 'on-line', id: at, a: 0, b: 1, c: 0 } : { t: 'on-line', id: at, a: 1, b: 0, c: 0 };
    facts.push({ t: 'constraint', k: onAxis, src });
  } else {
    const line = lines[0];
    if (line.kind === 'curve') {
      dir = { k: 'curve', id: line.id };
      facts.push({ t: 'constraint', k: { t: 'on-curve', id: at, curve: line.id }, src });
    } else {
      dir = { k: 'points', a: line.a, b: line.b };
      if (at !== line.a && at !== line.b) {
        facts.push({ t: 'constraint', k: { t: 'on-line-2pt', id: at, a: line.a, b: line.b, ...(line.bounded ? { bounded: true } : {}) }, src });
      }
    }
  }
  facts.push({ t: 'constraint', k: { t: 'relation', rel: 'perpendicular', u: { k: 'radius', circle: host.id, at }, v: dir }, src });
  return applyAll(c, facts);
}

/**
 * Apply several facts as ONE statement (#1070).
 *
 * The resolved-reference kinds — «זווית B ישרה», «שטח הדלתון הוא 24», «משוואת האלכסון הראשי» —
 * all work the same way: M1 works out what the sentence names, and then the sentence means
 * exactly what the spelled-out form would have meant. Applying the spelled-out FACTS, rather than
 * duplicating what they do, is what guarantees the two phrasings cannot drift apart.
 *
 * The effect is the same rollup `derive` does per line, and for the same reason: a statement that
 * created anything counted, one that only narrowed narrowed, and one whose every part was already
 * known is the only case where dropping the row is honest.
 */
/**
 * A ROLE NOUN'S CLAIM, LOWERED AGAINST THE FIGURE (#1651, #1620 item 2; ADR-AG-200) — the one place `role-of` is
 * resolved, whichever sentence named the piece by its role.
 *
 * - **radius** «הרדיוס MB»: THE circle (one in the figure; none or several is the contextual refusal). The end that
 *   is its centre stays, the other end is ON it. An end that is not the centre when the centre is another named
 *   point contradicts the figure (`conflicting-restatement`); a circle whose centre has no name cannot say which
 *   end is meant (`out-of-scope`, said by name, never a pick).
 * - **leg / base** «השוק BC» / «הבסיס AB» of a trapezoid (a noun promising one parallel pair): a leg is NOT in the
 *   parallel pair, so the other two sides are parallel; a base IS, so it is parallel to its opposite side. Both
 *   are stated relations, so the trapezoid's ASSUMED pair is pinned or displaced by the mechanism #1159 built,
 *   never re-derived; a pair the student already stated the other way is refused (`conflicting-restatement`).
 *   In a triangle a leg is one of the two EQUAL sides (a choice of apex between its two ends, cycled — ADR-052),
 *   and the base of an isosceles triangle is the side opposite its apex.
 * - **hypotenuse** «היתר AC»: the right angle is at the triangle's third vertex — the constraint «זווית B ישרה»
 *   lowers to (`rightAngleAt`), so a right triangle's seat choice collapses by structure.
 *
 * Which polygon: the ones holding a–b as a SIDE where the role means something. One → lowered; several →
 * ambiguous; none → the contextual refusal for a leg or a hypotenuse. A base with no such polygon claims nothing
 * further: «הבסיס CD» names a side (#1281), and only a trapezoid or an isosceles triangle gives «base» a content.
 */
function applyRoleOf(c: Construction, f: Extract<Fact, { t: 'role-of' }>): ApplyOutcome {
  for (const id of [f.a, f.b]) {
    const p = objectById(c, id);
    if (!p || !isPositional(p)) return { ok: false, error: unknownRef(c, id) };
  }
  if (f.a === f.b) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
  const say = (k: Constraint): Fact => ({ t: 'constraint', k, src: f.src });
  if (f.role === 'radius') {
    const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
    if (circles.length !== 1) return { ok: false, error: noHost(f.src, 'circle', circles) };
    const host = circles[0];
    const centre = centreIdOf(c, host);
    if (centre === null) {
      // The centre has no letter: the radius names it with the ONE end not already on the circle (#1670, ADR-AG-210 —
      // 2-D's name-the-centre). A point the sentence just introduced BECOMES the centre, in place (`nameCentreAs`); one
      // that already stands (minted free by «BO = 5», #1686) is PLACED there — the derivation restated about an existing
      // point is its `derived-at` condition, so no second point appears. Both ends off the circle, or neither: refused.
      const off = [f.a, f.b].filter((id) => !onCircleAlready(c, host, id));
      if (off.length !== 1) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      const [id] = off;
      const rule = centreRuleOf(host);
      if (!rule) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      const fresh = nameCentreAs(c, host, id, f.src);
      const placed = fresh ? { ok: true as const, next: fresh } : applyFact(c, { t: 'derived', id, rule, src: f.src });
      if (!placed.ok) return placed;
      const end = id === f.a ? f.b : f.a;
      const out = applyFact(placed.next, say({ t: 'on-curve', id: end, curve: host.id }));
      return out.ok ? { ...out, effect: 'created' } : out;
    }
    if (centre !== f.a && centre !== f.b) return { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
    const end = centre === f.a ? f.b : f.a;
    return applyFact(c, say({ t: 'on-curve', id: end, curve: host.id }));
  }
  const pair = (a: Id, b: Id): Direction => ({ k: 'points', a, b });
  const parallel = (a: Id, b: Id, p: Id, q: Id): Constraint => ({ t: 'relation', rel: 'parallel', u: pair(a, b), v: pair(p, q) });
  const equal = (a: Id, b: Id, p: Id, q: Id): Constraint => ({ t: 'length-eq', left: parseLengthExpr(`${a}${b}`)!, right: parseLengthExpr(`${p}${q}`)! });
  /** The claim on one polygon whose ring holds a–b as the side starting at index i — null when the role means nothing there. */
  const claimOn = (o: Extract<GeoObject, { kind: 'polygon' }>, i: number): { says: Constraint; conflict?: Constraint } | null => {
    const v = o.vertices;
    const n = v.length;
    const at = (k: number) => v[(i + k) % n];
    if (n === 3) {
      const third = at(2);
      if (f.role === 'hypotenuse') return { says: rightAngleAt(third, f.a, f.b) };
      if (f.role === 'leg') return { says: { t: 'choice', options: [equal(f.a, f.b, f.a, third), equal(f.b, f.a, f.b, third)] } };
      return o.noun !== undefined && normalizeShapeNoun(o.noun) === 'משולש שווה שוקיים' ? { says: equal(third, f.a, third, f.b) } : null;
    }
    if (n !== 4 || !promisesOneParallelPair(o.noun) || f.role === 'hypotenuse') return null;
    const own = parallel(at(0), at(1), at(3), at(2));
    const other = parallel(at(1), at(2), at(0), at(3));
    return f.role === 'base' ? { says: own, conflict: other } : { says: other, conflict: own };
  };
  const found: Array<{ o: GeoObject; says: Constraint; conflict?: Constraint }> = [];
  for (const o of c.objects) {
    if (o.kind !== 'polygon') continue;
    const n = o.vertices.length;
    const i = o.vertices.findIndex((p, k) => [p, o.vertices[(k + 1) % n]].sort().join() === [f.a, f.b].sort().join());
    if (i < 0) continue;
    const claim = claimOn(o, i);
    if (claim) found.push({ o, ...claim });
  }
  if (found.length === 0 && f.role === 'base') return { ok: true, effect: 'known', next: c };
  if (found.length !== 1) return { ok: false, error: noHost(f.src, 'polygon', found.map((x) => x.o)) };
  const { says, conflict } = found[0];
  // The other pair already STATED parallel by the student: the role contradicts their own given.
  if (conflict && c.constraints.some((k) => k.t === 'relation' && !k.assumed && sameConstraint(k, conflict))) {
    return { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
  }
  return applyFact(c, say(says));
}

/**
 * Does the figure already put `id` on the line of `u`/`v`? — an incidence it states («D על BC»), or a derived point
 * defined on that pair (its midpoint, the foot of a perpendicular onto it). Read off the construction, never a sample.
 */
function footOnPair(c: Construction, id: Id, u: Id, v: Id): boolean {
  const pair = (a: Id, b: Id) => (a === u && b === v) || (a === v && b === u);
  if (c.constraints.some((k) => k.t === 'on-line-2pt' && k.id === id && pair(k.a, k.b))) return true;
  const o = objectById(c, id);
  if (o?.kind !== 'derived') return false;
  if (o.rule.t === 'midpoint') return pair(o.rule.a, o.rule.b);
  if (o.rule.t === 'foot' && o.rule.onto.k === 'points') return pair(o.rule.onto.a, o.rule.onto.b);
  return false;
}

function applyAll(c: Construction, facts: readonly Fact[]): ApplyOutcome {
  let next = c;
  let effect: LineEffect = 'known';
  for (const f of facts) {
    const out = applyFact(next, f);
    if (!out.ok) return out;
    next = out.next;
    if (out.effect === 'created') effect = 'created';
    else if (out.effect === 'narrowed' && effect !== 'created') effect = 'narrowed';
  }
  return { ok: true, next, effect };
}

/**
 * Which CARRIERS is this point already constrained to lie on?
 *
 * Two constraint kinds put a point on a curve, and both must count (#1114). A line named by two points
 * lowers to `on-line-2pt`, not to `on-curve` — measured on the reported figure, where every crossing
 * carried `on-line-2pt(P, A, B)` beside `on-curve(P, circle-I)`. A first version of this check looked at
 * `on-curve` alone, saw one carrier per point instead of two, and never fired.
 *
 * The `line2pt:` key is synthetic and order-independent, so «the line AB» and «the line BA» are one
 * carrier rather than two.
 */
function carriersOfPoint(c: Construction, id: string): string[] {
  const out: string[] = [];
  for (const k of c.constraints) {
    if (k.t === 'on-curve' && (k as { id: string }).id === id) out.push((k as { curve: string }).curve);
    else if (k.t === 'on-line-2pt' && (k as { id: string }).id === id) {
      const pair = k as { a: string; b: string };
      out.push(`line2pt:${[pair.a, pair.b].sort().join(',')}`);
    }
  }
  return out;
}

/** A carrier's kind — `null` when it is not one this bound knows about. */
function carrierKind(c: Construction, carrier: string): string | null {
  if (carrier.startsWith('line2pt:')) return 'line';
  const o = c.objects.find((x) => x.id === carrier);
  if (!o || o.kind !== 'curve') return null;
  const cu = (o as { curve?: { kind?: string } }).curve;
  return cu?.kind ?? null;
}

/**
 * How many points two curves of these kinds can share — Bézout, capped at what this product draws.
 *
 * `null` means "no useful bound", and then nothing is refused: a bound that is not certain must never
 * turn into a refusal, because refusing a satisfiable figure is the worse defect of the two.
 */
function maxCrossings(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const isConic = (k: string) => k === 'circle' || k === 'ellipse' || k === 'parabola';
  if (a === 'line' && b === 'line') return 1;
  if ((a === 'line' && isConic(b)) || (isConic(a) && b === 'line')) return 2;
  if (isConic(a) && isConic(b)) return 4;
  return null;
}

/**
 * Apply one fact — `applyStatement`'s verdict, plus what the student should be TOLD about a statement
 * that landed (#1350). The notice is decided here, once, for every fact that names a line, because a
 * named line is minted by several arms (a stated equation, a line through a point) and each one's
 * answer is the same question.
 */
export function applyFact(c: Construction, f: Fact): ApplyOutcome {
  const out = applyStatement(c, f);
  if (!out.ok || out.effect === 'known') return out;
  // A POINT NAMED BY AN ANGLE'S LABEL (#1622 E5, ADR-AG-221) — «נסמן זוית BAM כ-A1» then «נקודה A1»: the name is
  // taken, as 2-D answers (`aliasTaken`). Checked here, where every statement that introduces an object lands, so no
  // one way of naming a point can slip past; the label-after-point order is the angle constraint's own check.
  if (out.next.objects.length > c.objects.length) {
    const labels = new Set(out.next.constraints.flatMap((k) => (k.t === 'angle' && k.value.kind === 'sym' ? [angleLabelName(k.value.name)] : [])));
    const taken = out.next.objects.find((o) => labels.has(o.id) && !objectById(c, o.id));
    if (taken) return { ok: false, error: { code: 'alias-taken', detail: f.src, holder: taken.id } };
  }
  const notice = readingTwin(c, f);
  return notice ? { ...out, notice } : out;
}

function applyStatement(c: Construction, f: Fact): ApplyOutcome {
  // NAMING a numeral curve in the other notation («נתון ישר I …» after «ישר 1») — the mint half of
  // ruling 2; the reference half is `unknownRef`. Only a NEW id can mix: restating «ישר 1» is its own id.
  if ((f.t === 'curve' || f.t === 'circle-thru' || f.t === 'line-at') && !objectById(c, f.id)) {
    const mix = notationMix(c, f.id);
    if (mix) return { ok: false, error: mix };
  }
  switch (f.t) {
    case 'param': {
      // A plane coordinate is never a parameter (#1832, ADR-AG-246): its "domain" is a restriction on the curve.
      if (RESERVED_SYMBOLS.has(f.sym)) return { ok: false, error: { code: 'coordinate-restriction', detail: f.src } };
      const prior = c.params.find((p) => p.sym === f.sym);
      if (prior) {
        // A re-declaration NARROWS: «a הוא פרמטר» then «נתון כי a<13» is the corpus's own
        // two-step, not a contradiction. Intersect the domains.
        const merged = {
          sym: f.sym,
          domain: {
            ...prior.domain,
            ...f.domain,
            min: pickTighter(prior.domain.min, f.domain.min, Math.max),
            max: pickTighter(prior.domain.max, f.domain.max, Math.min),
            minOpen: prior.domain.minOpen || f.domain.minOpen,
            maxOpen: prior.domain.maxOpen || f.domain.maxOpen,
            exclude: [...(prior.domain.exclude ?? []), ...(f.domain.exclude ?? [])],
          },
        };
        /**
         * The one absorption that can still ADD something (#1045).
         *
         * «a הוא פרמטר» then «a<13» is absorbed into the existing declaration and the domain is
         * strictly tighter afterwards — that is a real given, it belongs in the fact list, and
         * telling the student "already known" would be false. «a הוא פרמטר חיובי» twice is not.
         * The two are told apart by asking whether the merge changed the domain at all.
         */
        const changed = JSON.stringify(normalizeDomain(merged.domain)) !== JSON.stringify(normalizeDomain(prior.domain));
        return {
          ok: true,
          effect: changed ? 'narrowed' : 'known',
          next: { ...c, params: c.params.map((p) => (p.sym === f.sym ? merged : p)) },
        };
      }
      return { ok: true, effect: 'created', next: { ...c, params: [...c.params, { sym: f.sym, domain: f.domain }] } };
    }

    case 'point': {
      /**
       * ANCHORING a free vertex — M1 lowering, and what makes ENTRY ORDER not matter
       * ([02c R19](../../docs/02c-requirements-analytic.md), the 2-D tool's M2).
       *
       * «משולש ABC» then «A(6,4)» is not a student re-creating `A`; it is them *placing* the `A`
       * they already named. So the coordinates CONSUME the vertex's two degrees of freedom, exactly
       * as if they had been given first — the figure ends the same whichever order the sentences
       * arrive in, which is how every exam paragraph is actually written.
       *
       * It is an exact substitution, not a solve: two coordinates consume two DOF and nothing is
       * left to search for. The object is replaced IN PLACE so it keeps its position in the list,
       * which is what keeps `depsPrecedeDependents` true for anything already referring to it.
       */
      const standing = objectById(c, f.id);
      if (standing && standing.kind === 'free') {
        return {
          ok: true,
          effect: 'created',
          next: {
            ...c,
            objects: c.objects.map((o) =>
              o.id === f.id ? { kind: 'point', id: f.id, x: f.x, y: f.y } : o,
            ),
          },
        };
      }

      /**
       * A COORDINATE STATEMENT about a point that already exists (#1046, #1040).
       *
       * Operator, 2026-09-15: *"how would i be able to say that the x value of M is 3 if it refuses
       * to draw M again. it should know I am referring to the existing M"*.
       *
       * #1038 was right that a second `M` must not be created, and wrong about what the sentence
       * MEANS. The student did not name a different object; they made a statement about this one,
       * which is exactly what M1 is for — a command that would create an object whose id already
       * exists lowers to CONSTRAINTS on the existing object (docs/17 §M1). This function’s own
       * docblock reserved the slot: *"richer lowerings … attach to this same function when the
       * constraint layer lands, and nowhere else."* It has landed.
       *
       * ONE disposition, not two. The issue proposed splitting on determinacy — a CLAIM to verify
       * when the point is determined, a CONSTRAINT to solve when it is not — and the constraint kind
       * covers both: on a determined figure the solve has nothing left to move, the residual stays
       * non-zero, and #1062 reports it as unsatisfiable, naming the statement. That is the verify
       * half for free, with no second mechanism to keep in step with the first.
       *
       * A `free` vertex is NOT this case — it is handled above, by substitution, because two
       * coordinates consume its two degrees of freedom exactly and nothing is left to search for.
       */
      const standingDerived = objectById(c, f.id);
      if (standingDerived && standingDerived.kind === 'derived') {
        return applyFact(c, { t: 'constraint', k: { t: 'coord', id: f.id, x: f.x, y: f.y }, src: f.src });
      }

      const found = priorOf(c, f);
      if (found && 'clash' in found) {
        return {
          ok: false,
          error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(found.prior) },
        };
      }
      const prior = found?.same as PointObject | undefined;
      if (prior) {
        // M1: a statement about an EXISTING point.
        if (sameNumbers(prior.x, f.x) && sameNumbers(prior.y, f.y)) {
          return { ok: true, effect: 'known', next: c }; // agrees — absorbed, no duplicate row
        }
        return { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }
      return {
        ok: true,
        effect: 'created',
        next: { ...c, objects: [...c.objects, { kind: 'point', id: f.id, x: f.x, y: f.y }] },
      };
    }

    case 'curve': {
      /*
       * THE DRAWN LINE BC GETS ITS EQUATION (#1639, ADR-AG-198): «הישר BC» drew the line through B and C (a
       * `line-at` along B→C, `line-2pt`); «משוואת הישר BC היא …» is a statement about THAT line, so the stated
       * curve takes its place under the same id — the sentence's own incidences put B and C on it — never a name
       * clash, and never a second line beside the first.
       */
      const drawnLine = objectById(c, f.id);
      if (
        drawnLine?.kind === 'line-at' &&
        drawnLine.dir.k === 'points' &&
        !drawnLine.perp &&
        f.id === lineIdOf(`${drawnLine.dir.a}${drawnLine.dir.b}`)
      ) {
        const out = applyFact({ ...c, objects: c.objects.filter((o) => o !== drawnLine) }, f);
        if (!out.ok) return out;
        // In the drawn line's PLACE, so whatever was stated after it still follows it (declaration order, ADR-AG-013).
        const objects = out.next.objects.filter((o) => o.id !== f.id);
        objects.splice(c.objects.indexOf(drawnLine), 0, out.next.objects.find((o) => o.id === f.id)!);
        return { ...out, next: { ...out.next, objects } };
      }
      const found = priorOf(c, f);
      if (found && 'clash' in found) {
        return {
          ok: false,
          error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(found.prior) },
        };
      }
      const prior = found?.same as CurveObject | undefined;
      if (prior) {
        /**
         * A kind CLAIMED twice, differently, is a contradiction. A kind not claimed at all is not
         * (#1037): «הישר x-y+2=0» and the bare «x-y+2=0» are the same line stated two ways, and the
         * second one names no family because [02c R6](../../docs/02c-requirements-analytic.md) says
         * it need not. Comparing `undefined` against `'line'` would turn the absence of a claim into
         * a conflicting claim, and the student would be told their own restatement contradicts them.
         *
         * When it IS a contradiction, it names what the id already holds (#1046).
         */
        if (prior.curve.kind && f.curve.kind && prior.curve.kind !== f.curve.kind) {
          return {
            ok: false,
            error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(prior) },
          };
        }
        if (sameCurve(prior.curve, f.curve)) {
          /**
           * PROMOTION (#1076) — the same curve, now stated.
           *
           * «נקודה B על הישר y=x» minted `y=x` as a carrier; «y=x» on its own line is the student
           * asking for the line itself. Because ids are content-derived (ADR-AG-023) these are ONE
           * object, so the second sentence is not a new curve — it is a change of what the first one
           * IS, and the figure visibly gains a line. Answering «כבר ידוע» here would be the #1045
           * mechanism firing on a line that really did something.
           *
           * The promotion is one-way. A stated curve is never demoted by a later carrier mention,
           * because the student already asked to see it and nothing they said withdraws that.
           */
          if (f.stated && !prior.stated) {
            /**
             * THE PROMOTION CARRIES THE LABEL (#1149).
             *
             * `{ ...prior, stated: true }` kept the CARRIER's label and threw away the stated
             * sentence's, so a promoted line lost the `kind` and `eqSrc` the student had just
             * written — and `words()` can name an anonymous curve only by its equation. The result
             * was two identical figures behaving differently: lines stated outright offered their
             * crossing ring, and the same lines reached as carriers first offered none.
             *
             * A promoted carrier must be indistinguishable from a curve stated outright, so the
             * incoming label wins — except for a NAME the prior already holds, which is the
             * student's own and cannot be erased by an anonymous restatement.
             */
            const label = { ...prior.label, ...f.label, name: prior.label.name || f.label.name };
            return {
              ok: true,
              effect: 'created',
              next: {
                ...c,
                objects: c.objects.map((o) => (o.id === f.id ? { ...prior, label, stated: true } : o)),
              },
            };
          }
          return { ok: true, effect: 'known', next: c };
        }
        /**
         * Same id, different equation, and now that ids are content-derived (#1026) that can only
         * mean one thing: a NAMED curve being restated inconsistently — «הישר AC» given twice with
         * two equations. A second anonymous parabola no longer reaches here at all, because it no
         * longer shares an id with the first.
         */
        return { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }
      /**
       * ONE LINE, ONE ROW (#1342) — the CURVE arm of #1153's «one position, one name».
       *
       * `priorOf` compares **ids only**, and an anonymous curve's id is content-derived from its
       * equation TEXT (ADR-AG-023) while a named one's is its name. So one equation stated under two
       * identities was two objects: «נתון הישר 1: 2x-y+8=0» then «נתון הישר 2x-y+8=0» drew two stacked
       * lines, put two rows in the panel, and offered the same line twice in a crossing ring — with no
       * fault. The same for two names, and for the same line written in slope form.
       *
       * `sameCurve` — the equation-identity predicate, probe-environment based — already lived in this
       * file, but was only ever consulted AFTER an id match, to tell a contradiction from a repeat.
       * Nothing asked *"does the figure already hold THIS LINE under another id?"* That question is
       * asked here, once, for every curve, so no rule needs a case of its own.
       *
       * What happens next is decided by what the second statement ADDS — never by which spelling it
       * used:
       *
       *  - **nothing new** ⇒ `known`, absorbed; the submit gate answers «כבר ידוע»;
       *  - **a NAME for an anonymous line** ⇒ `narrowed`: the existing object gains `label.name`.
       *    Its id is deliberately NOT rewritten — constraints already hold it — and `curveByName`
       *    matches `label.name` as well as the id, so every by-name reference resolves;
       *  - **a SECOND name for a named line** ⇒ refused `already-named`, naming the holder. A line has
       *    one name, which is #1153's rule and not a new one.
       *
       * `line-at` (a free line through a point) is deliberately out of scope: it is not an equation,
       * so there is nothing for `sameCurve` to compare.
       */
      /**
       * ONLY A STATED DECLARATION JOINS THE SCAN, and that is a measured boundary, not caution.
       *
       * A CARRIER is not an object the student asked to see — «נקודה P על הישר y=x» mints `y=x` with
       * `stated: false` purely so the membership has something to hold, and **the very next fact of that
       * same line references it by id**. Absorbing it into an existing `l2: y=x` therefore deleted the id
       * P's membership was about, and P stopped existing (measured: #1048's honesty-gate row went red).
       * A carrier is also invisible — not drawn, no panel row, no crossing ring — so it is none of the
       * three things this issue is about. The incoming side is what is tested, because that is the fact
       * whose id may still be referenced; a stated line absorbed INTO a carrier is the #1076 promotion
       * and is safe, since references to a stated line go by name.
       */
      const twin = f.stated
        ? c.objects.find(
            (o): o is CurveObject => o.kind === 'curve' && o.id !== f.id && identicalCurve(o.curve, f.curve),
          )
        : undefined;
      if (twin) {
        const incoming = f.label.name;
        const held = twin.label.name;
        if (incoming && held && incoming !== held) {
          return { ok: false, error: { code: 'already-named', detail: f.src, holder: held } };
        }
        /**
         * The #1149 promotion rule, reached by the other door: a line first minted as a CARRIER and
         * now stated outright (or now named) visibly gains something, so it is not «כבר ידוע». The
         * incoming label wins except for a name the prior already holds — the student's own.
         */
        if ((incoming && !held) || (f.stated && !twin.stated)) {
          const label = { ...twin.label, ...f.label, name: held || incoming };
          return {
            ok: true,
            effect: incoming && !held ? 'narrowed' : 'created',
            next: {
              ...c,
              objects: c.objects.map((o) =>
                o.id === twin.id ? { ...twin, label, stated: twin.stated || f.stated } : o,
              ),
            },
          };
        }
        return { ok: true, effect: 'known', next: c };
      }

      /**
       * THE BARE FORM TAKES THE EXTENT THE OBJECT ALREADY HAS (#1234).
       *
       * «משוואת CE היא x-3y=0» writes no noun, so it says nothing about whether the student means the
       * infinite line or the median they already drew. Measured on the operator's own sequence, it
       * minted `line-CE` BESIDE the existing `seg-CE` — one name, two drawn objects, with
       * `faults: []` — and the spurious crossing rings followed from the twin.
       *
       * The decision belongs HERE and nowhere else: `parseLine(raw)` takes no figure context, so the
       * rule that recognises the sentence structurally cannot know whether `seg-CE` exists. This case
       * already looks the figure up through `priorOf`; asking one more question of it costs nothing.
       *
       * An existing segment over the same two points ⇒ the equation is a CONDITION on that segment,
       * and the line it lies on is an undrawn carrier. Nothing existing ⇒ the line is what the
       * student gets, which is the behaviour this form always had.
       */
      const inheritedStated =
        f.inheritExtent && segmentOverSameEnds(c, f.id) ? false : f.stated;
      return {
        ok: true,
        effect: 'created',
        next: {
          ...c,
          objects: [...c.objects, { kind: 'curve', id: f.id, label: f.label, curve: f.curve, stated: inheritedStated }],
        },
      };
    }

    /**
     * The three REFERENCE kinds (#1028). They share one shape: every id they name must already be a
     * positional object, and the statement is idempotent under M1 when it says the same thing again.
     */
    /**
     * A CONSTRAINT names points and creates none. Like a reference it may not invent one — «שטח
     * המשולש ABC הוא 20» before ABC exists is a statement about nothing.
     */
    case 'constraint': {
      /**
       * AN EQUATION OPERAND RESOLVES TO THE CURVE IT DENOTES (#1429, the ADR-AG-023/#1342
       * identity class). «…עם המעגל (x-3)²+(y-4)²=9» while circle I carries that equation is a
       * reference to CIRCLE I, not a second circle — so an `on-curve` carrying its equation is
       * matched against the figure's equation curves first, minted `stated: false` only when
       * nothing matches, and the spelling fields are stripped so the applied constraint is the
       * same statement however the curve was named. This is also what retires the
       * `curve-anon…` `unknown-reference` leak (#1145's class): the id now always exists.
       */
      if (f.k.t === 'on-curve' && f.k.eqSrc !== undefined) {
        const { eqSrc, eq, ...bare } = f.k;
        const resolved = resolveCurveByEq(c, eq) ?? f.k.curve;
        let host = c;
        if (resolved === f.k.curve && !objectById(c, resolved) && eq) {
          const mint = applyFact(c, {
            t: 'curve',
            id: resolved,
            label: { name: '', eqSrc },
            curve: { eq: eq as Parameters<typeof resolveCurve>[0]['eq'] },
            stated: false,
            src: f.src,
          });
          if (!mint.ok) return mint;
          host = mint.next;
        }
        return applyFact(host, { t: 'constraint', k: { ...bare, curve: resolved }, src: f.src });
      }
      /*
       * AN ANGLE LABEL NAMES ONE ANGLE (#1622 E5, ADR-AG-221; 2-D's ADR-386 `alias-taken`). «נסמן זוית BAM כ-A1» binds the
       * label to the angle as a free parameter of its own (`angleLabelSymbol`). The SAME label on a DIFFERENT angle would
       * read as «∢BAM = ∢MAC» through the shared symbol — an equality nobody stated — and a label that is already a
       * POINT's name is two things under one name. Both are refused naming the label, as 2-D does; restating the same
       * binding is absorbed below like any repeated constraint. Judged BEFORE the references: a clash is the answer
       * whether or not the angle's letters exist yet (2-D asks on «נקודה A1» · «נסמן זוית BAM כ-A1» too).
       */
      if (f.k.t === 'angle' && f.k.value.kind === 'sym' && angleLabelName(f.k.value.name) !== null) {
        const sym = f.k.value.name;
        const label = angleLabelName(sym)!;
        const at = f.k.at;
        const same = (o: AngleName) => isAngleRef(o) && o.v === at.v && [o.a, o.b].sort().join() === [at.a, at.b].sort().join();
        const rebound = c.constraints.some((k) => k.t === 'angle' && k.value.kind === 'sym' && k.value.name === sym && !same(k.at));
        if (rebound || objectById(c, label)) return { ok: false, error: { code: 'alias-taken', detail: f.src, holder: label } };
      }
      const missing = constraintRefs(f.k).find((id) => {
        const o = objectById(c, id);
        return !o || !isPositional(o);
      });
      if (missing !== undefined) {
        return { ok: false, error: unknownRef(c, missing) };
      }
      /**
       * THE FIGURE IS THE AUTHORITY ON A CROSSING'S EXTENT — AS IT STOOD WHEN THE SENTENCE WAS SAID (ADR-AG-135
       * ruling (a), made per-statement by ADR-AG-198, #1640). A crossing on a pair the figure already DRAWS as a
       * piece is on that piece, whatever noun the sentence used; this used to be decided at evaluation over the
       * WHOLE construction, so a piece drawn LATER — a bare «BC» typed to see it — narrowed an earlier «הישר BC»
       * that carries O outside B–C, and the line refused `unsatisfiable`. Decided here, against the figure before
       * this statement, it is a property of the statement: a later piece never re-reads it.
       */
      if (f.k.t === 'on-line-2pt' && f.k.crossing && !f.k.bounded && drawnPieceOver(c, f.k.a, f.k.b)) {
        return applyFact(c, { ...f, k: { ...f.k, bounded: true } });
      }
      /**
       * …AND THE CURVES IT NAMES (#1150). Same rule, the half that was missing.
       *
       * «נקודה D היא חיתוך של l7 ו- l8» on a figure with no `l7` lowered to two `on-curve`
       * constraints, passed this boundary in silence because `constraintRefs` answers only about
       * POINTS, and could not be measured at evaluation — so `D` was drawn as an ordinary free point
       * at a sampled position while the data panel one column over read `D = –`. The canvas asserted
       * a position the panel admitted was undetermined, and the student's defining clause had
       * vanished without a word.
       *
       * The tool already knew how to say this: an ASK naming an object the figure does not have
       * answers «אין בשרטוט …» (#1111). This is the FACT lane finally getting the same check.
       *
       * The detail is the student's own name for the curve — `l7`, never an internal id.
       */
      const missingCurve = constraintCurveRefs(f.k).find((id) => {
        const o = objectById(c, id);
        return !o || !CURVE_BEARING.has(o.kind);
      });
      if (missingCurve !== undefined) {
        return { ok: false, error: unknownRef(c, missingCurve) };
      }
      /**
       * A tangent-LINE must name a LINE (#1501). The residual answers "cannot be judged" for a
       * curve of another kind, and an unjudged constraint is a given that vanished in silence —
       * the same honesty hole #1150 closed for a curve that does not exist. «משיק ל-x^2+y^2=9»
       * is a circle-to-circle tangency, which is its own capability, refused BY NAME until it is
       * built.
       */
      if ((f.k.t === 'tangent-line' || f.k.t === 'tangent-curve') && f.k.line.kind === 'curve') {
        const o = objectById(c, f.k.line.id);
        if (o && curveKindOf(o) !== 'line') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      }
      /**
       * A STATEMENT MEETS THE TOOL'S OWN ASSUMPTION (#1159) — decided before the duplicate absorb,
       * because to the absorb the two look identical, and that is the whole defect.
       *
       * «טרפז ABCD» lowers to an ASSUMED parallel pair. Two things can then happen, and neither is a
       * restatement:
       *
       *  - the student names THAT pair — «AB מקביל ל-CD». The constraint stops being the tool's guess
       *    and becomes their given. Nothing about the figure changes and the freedom does not drop,
       *    which is precisely why the entailment gate called it «already follows» — a sentence that
       *    is false, because it followed from a pair the TOOL picked. It is `narrowed`: the figure is
       *    unchanged and its commitment is not.
       *  - the student names the OTHER pair — «BC מקביל ל-AD». The assumption yields to them. Keeping
       *    both drew a PARALLELOGRAM at every seed, silently, on a figure the student called a
       *    trapezoid.
       *
       * Both pairs STATED is a parallelogram the student asked for, and is left alone: the second
       * statement finds no assumption to displace (the first already pinned it) and records normally.
       */
      if (f.k.t === 'relation' && !f.k.assumed) {
        const pins = c.constraints.findIndex((k) => k.t === 'relation' && k.assumed && sameConstraint(k, f.k));
        if (pins >= 0) {
          const pinned = [...c.constraints];
          pinned[pins] = f.k; // the student's own constraint, with no `assumed` mark
          return { ok: true, effect: 'narrowed', next: { ...c, constraints: pinned } };
        }
        const yields = displacedAssumption(c, f.k);
        if (yields >= 0) {
          const moved = c.constraints.filter((_, i) => i !== yields);
          return { ok: true, effect: 'created', next: { ...c, constraints: [...moved, f.k] } };
        }
      }

      // Restating the same constraint adds nothing — M1's absorb, so a later section of a question
      // may repeat a given without it counting twice against the figure's freedom. Compared by what
      // the constraint SAYS (#1159): «AB ∥ CD» and «AB ∥ DC» are one statement, and used to get two
      // different answers depending on which letter the student wrote first.
      const dup = c.constraints.some((k) => sameConstraint(k, f.k));
      if (dup) return { ok: true, effect: 'known', next: c };

      /**
       * A PAIR OF CURVES HAS ONLY SO MANY CROSSINGS (#1114).
       *
       * «נקודת החיתוך» lowers to two `on-curve` constraints, so naming a third crossing of one
       * line×conic pair is representable — and it used to build. Measured on the reported figure, the
       * damage is worse than a stacked point: naming `R` did not merely put it on top of `P`, it
       * dragged `Q` there too, collapsing three distinct names onto one location.
       *
       *   P(0.92, 1.84)  Q(3.48, 6.96)          ← two crossings, correct
       *   P(0.92, 1.84)  Q(0.92, 1.84)  R(0.92, 1.84)   ← after naming a third
       *
       * **This is a COUNTING argument, not a sampling one**, which is why it is refused here rather
       * than left to the freedom gate in `derive`. A straight meets a conic in at most two points at
       * ANY configuration, with any amount of freedom, so a third such sentence cannot hold under any
       * seed — the "vacuously never" reasoning ADR-AG-008 / #1058 used. No seed search is involved and
       * no satisfiable figure can be wrongly refused, so #1071's general question stays open and
       * `derive`'s `reportedDof === 0` gate is deliberately untouched.
       *
       * The cap comes from the curve KINDS alone, never from their parameters — which is what lets
       * this live at apply time, before anything is evaluated.
       */
      if (f.k.t === 'on-curve' || f.k.t === 'on-line-2pt') {
        const subject = (f.k as { id: string }).id;
        const arriving = f.k.t === 'on-curve'
          ? (f.k as { curve: string }).curve
          : `line2pt:${[(f.k as { a: string }).a, (f.k as { b: string }).b].sort().join(',')}`;
        for (const other of carriersOfPoint(c, subject)) {
          if (other === arriving) continue;
          const cap = maxCrossings(carrierKind(c, other), carrierKind(c, arriving));
          if (cap === null) continue;
          const named = c.objects.filter((o) => {
            if (o.id === subject) return false;
            const on = carriersOfPoint(c, o.id);
            return on.includes(other) && on.includes(arriving);
          }).length;
          if (named >= cap) {
            return { ok: false, error: { code: 'unsatisfiable', detail: f.src } };
          }
        }
      }
      /**
       * The student CONSUMING a discrete degree of freedom (#1049).
       *
       * «משולש ישר-זווית ABC» carries a choice over three seats; «זווית B ישרה» names one of them.
       * Adding it as an ordinary constraint would leave the choice in place, and two seeds out of
       * three would then draw a figure whose right angle sits somewhere else while the student's own
       * sentence says otherwise. So the choice is REPLACED by the option they named — exactly what a
       * coordinate does to a continuous degree of freedom.
       *
       * It reports `narrowed`, not `created`: the constraint count is unchanged and what moved is the
       * freedom, which is the same answer «a<13» gives after «a הוא פרמטר».
       */
      const seat = c.constraints.findIndex(
        (k) => k.t === 'choice' && k.options.some((o) => namesOption(o, f.k)),
      );
      if (seat >= 0) {
        const collapsed = [...c.constraints];
        collapsed[seat] = f.k;
        return { ok: true, effect: 'narrowed', next: { ...c, constraints: collapsed } };
      }
      return { ok: true, effect: 'created', next: { ...c, constraints: [...c.constraints, f.k] } };
    }

    /**
     * «זווית B ישרה» — the vertex alone, resolved against the figure (#1049).
     *
     * `B` names an angle only when the figure says which two rays meet there, so this is the one
     * fact whose constraint is built HERE rather than in the parser. The rays come from the shape
     * that has `B` as a vertex; where there is no such shape, or more than one, the honest answer is
     * to refuse and name the format the student can use instead — never to pick a pair of rays.
     */
    /**
     * «שטח הדלתון הוא 24» — the noun resolved against what the student has drawn (#1049).
     *
     * Exactly the `right-angle` shape: a contextual reference is unambiguous when the figure holds
     * ONE shape of that noun, and a guess otherwise. Refusing the ambiguous case is what makes the
     * unambiguous one safe.
     */
    /**
     * «אלכסוני המרובע נפגשים בנקודה O» — the shape resolved from the figure (#1070).
     *
     * The same contextual resolution as `area-of`, keyed on ARITY rather than on a noun, because
     * the sentence names the construct («האלכסונים») and not the shape. One quadrilateral in the
     * figure makes it unambiguous; none or several makes it a refusal, never a pick.
     */
    case 'meet-of': {
      /*
       * THE DIAGONALS NAMED BY THEIR LETTERS (#1620, ADR-AG-208) — «האלכסונים AC ו-BD נפגשים בנקודה E». A ring of
       * those four vertices is the quadrilateral they are diagonals OF, so they must be its diagonals: «AB ו-CD» in
       * «מרובע ABCD» names two of its sides, and is refused rather than read as the other pair. With no such ring
       * the two named segments stand alone, and their meet is the `diagonals` rule over the named order.
       */
      if (f.named) {
        const named = f.named;
        const key = (a: Id, b: Id) => [a, b].sort().join('');
        const wanted = new Set([key(named[0], named[2]), key(named[1], named[3])]);
        const same = (c.objects.filter((o) => o.kind === 'polygon') as PolygonObject[]).filter(
          (o) => o.vertices.length === 4 && named.every((x) => o.vertices.includes(x)),
        );
        for (const ring of same) {
          const [p, q, r, s] = ring.vertices;
          if (!wanted.has(key(p, r)) || !wanted.has(key(q, s))) {
            return { ok: false, error: { code: 'not-a-diagonal', detail: f.src } };
          }
        }
        return applyFact(c, { t: 'derived', id: f.id, rule: { t: 'diagonals', v: [...named] }, src: f.src });
      }
      /*
       * THE NOUN SELECTS (#1620, ADR-AG-208) — «אלכסוני הטרפז» is the trapezoid's, even beside another quadrilateral,
       * and is refused in a figure with no trapezoid; the generic «המרובע» is any ring of the arity (2-D's verdicts).
       */
      const rings = (ringsNamed(c.objects, f.noun) as PolygonObject[]).filter((o) => o.vertices.length === f.arity);
      if (rings.length !== 1) return { ok: false, error: { code: 'ambiguous-shape', detail: f.src } };
      const v = rings[0].vertices;
      const rule: DerivedRule =
        f.role === 'diagonals'
          ? { t: 'diagonals', v: [v[0], v[1], v[2], v[3]] }
          : ({ t: f.role, v: [v[0], v[1], v[2]] } as DerivedRule);
      const point: Fact = { t: 'derived', id: f.id, rule, src: f.src };
      // #1751 (ADR-AG-241): the verb frame draws the diagonals it names by role — the ring's, now that M1 knows it.
      if (f.draw && f.role === 'diagonals') {
        return applyAll(c, [
          point,
          { t: 'segment', id: segmentIdOf(v[0], v[2]), a: v[0], b: v[2], ref: true, src: f.src },
          { t: 'segment', id: segmentIdOf(v[1], v[3]), a: v[1], b: v[3], ref: true, src: f.src },
        ]);
      }
      return applyFact(c, point);
    }

    /**
     * «משוואת האלכסון הראשי היא y=2x» — the diagonal the NOUN distinguishes (#1070).
     *
     * Only some quadrilaterals have a principal diagonal: a kite does, because its axis of
     * symmetry is a geometric fact about the figure. A plain «מרובע», a parallelogram and a rhombus
     * do not, and there the phrase has no referent — refused by name, because choosing one would
     * assert a distinction the question never made (ADR-052 in vocabulary form).
     *
     * Once resolved it is the ORDINARY line-by-name statement, applied as the facts the spelled-out
     * «משוואת האלכסון AC היא y=2x» would have produced, so ADR-AG-026`s incidences come with it.
     */
    case 'diagonal-eq': {
      const rings = c.objects.filter(
        (o) => o.kind === 'polygon' && !!o.noun && !!shapeRow(o.noun)?.principalDiagonal,
      ) as PolygonObject[];
      if (rings.length !== 1) {
        return { ok: false, error: { code: 'undistinguished-diagonal', detail: f.src } };
      }
      const ring = rings[0];
      const [p, q] = shapeRow(ring.noun!)!.principalDiagonal!(ring.vertices);
      // The SECONDARY diagonal is the other one: the two vertices the principal does not join.
      const [a, b] = f.principal ? [p, q] : ring.vertices.filter((x) => x !== p && x !== q);
      const id = lineIdOf(`${a}${b}`);
      return applyAll(c, [
        // STATED (#1076): the student asked for this diagonal by giving its equation, so it is part
        // of the figure they are drawing, not a carrier minted to hold something else.
        { t: 'curve', id, label: { name: `${a}${b}`, kind: 'line' }, curve: { kind: 'line', eq: f.eq }, stated: true, src: f.src },
        { t: 'declare', id: a, src: f.src },
        { t: 'declare', id: b, src: f.src },
        { t: 'constraint', k: { t: 'on-curve', id: a, curve: id }, src: f.src },
        { t: 'constraint', k: { t: 'on-curve', id: b, curve: id }, src: f.src },
      ]);
    }

    /**
     * A circle on a CENTRE POINT (#1060).
     *
     * The centre must already be a point — the `declare` that precedes this fact makes sure of
     * it — and the circle is an ordinary object from there on. Restating it is absorbed, like
     * every other construction, so «נתון מעגל O» twice is one circle.
     */
    case 'circle-at': {
      const centre = objectById(c, f.centre);
      if (!centre || !isPositional(centre)) {
        return { ok: false, error: unknownRef(c, f.centre) };
      }
      const prior = objectById(c, f.id);
      if (prior) {
        if (prior.kind !== 'circle-at') {
          return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(prior) } };
        }
        // A sector's hidden circle STATED by the student (#1622 E4): the same circle, now drawn.
        if (prior.hidden && !f.hidden) return { ok: true, effect: 'created', next: unhidden(c, f.id) };
        return { ok: true, effect: 'known', next: c };
      }
      return {
        ok: true,
        effect: 'created',
        next: { ...c, objects: [...c.objects, { kind: 'circle-at', id: f.id, centre: f.centre, r: f.r, ...(f.hidden ? { hidden: true as const } : {}) }] },
      };
    }

    /**
     * «דרך P עובר ישר מקביל ל AB» — a line CONSTRUCTED through a point (#1093).
     *
     * Written as the exact parallel of `circle-at` above, because it is one: a positional anchor the
     * figure must already hold, a name-clash check, and an idempotent restatement. What it is NOT is
     * a statement about an existing line — the sentence creates the line, which is why this is an
     * object kind rather than a constraint.
     *
     * The direction's own referents are NOT resolved here. `dirRefs` feeds the dependency walk in
     * `carriers.ts`, and a direction naming something absent surfaces there as the vacancy it is —
     * the same division `circle-at` keeps between its centre (checked here, because the object
     * cannot exist without it) and its radius symbol (resolved at evaluate time).
     */
    case 'line-at': {
      const through = objectById(c, f.through);
      if (!through || !isPositional(through)) {
        return { ok: false, error: unknownRef(c, f.through) };
      }
      const prior = objectById(c, f.id);
      /**
       * «הישר l3 עובר דרך N» — an EXISTING line through a point is an incidence, not a second line (#1281, M1).
       *
       * A free-direction `line-at` states only "this line passes through that point". When the named line
       * already exists — stated by its equation, or built through another point — the sentence is a statement
       * ABOUT it and lowers to the point's incidence: the exam's «ישר 3 עובר דרך הנקודה N», which is what pins
       * the parameter of a line `(k+1)x+2y-12+5k=0`. It used to be refused as a name clash (an equation line)
       * or absorbed as `known` while N was never put on the line (a line-at through another point).
       */
      if (prior && f.dir.k === 'free') {
        const isLine = curveKindOf(prior) === 'line'; // a `line-at` answers 'line' here too (#1501)
        if (isLine) {
          if (prior.kind === 'line-at' && prior.through === f.through) return { ok: true, effect: 'known', next: c };
          return applyFact(c, { t: 'constraint', k: { t: 'on-curve', id: f.through, curve: prior.id }, src: f.src });
        }
      }
      if (prior) {
        if (prior.kind !== 'line-at') {
          return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(prior) } };
        }
        // A carrier line (`drawn: false`) stated AS A LINE is now drawn (#1620, ADR-AG-207) — the same object, upgraded.
        if (prior.drawn === false && f.drawn !== false) {
          const { drawn: _carrier, ...line } = prior;
          return { ok: true, effect: 'narrowed', next: { ...c, objects: c.objects.map((o) => (o.id === f.id ? line : o)) } };
        }
        return { ok: true, effect: 'known', next: c };
      }
      return {
        ok: true,
        effect: 'created',
        next: {
          ...c,
          objects: [
            ...c.objects,
            {
              kind: 'line-at',
              id: f.id,
              through: f.through,
              dir: f.dir,
              perp: f.perp,
              ...(f.name ? { name: f.name } : {}),
              ...(f.drawn === false ? { drawn: false as const } : {}),
            },
          ],
        },
      };
    }

    /**
     * «מעגל ABD» · «נתון מעגל שקוטרו BD» — a circle COMPUTED from points (#1464, #1324, ADR-AG-160).
     *
     * The third constructive curve, with `circle-at`'s and `line-at`'s discipline: every point it is
     * defined from must already exist (never invented — #1028), a name already holding another kind is a
     * clash, and a restatement is absorbed. The points must be DIFFERENT: «מעגל AAB» names no circle, and
     * saying so here names the sentence rather than drawing a vacancy the student cannot explain.
     */
    case 'circle-thru': {
      const pts = circleDefPoints(f.def);
      for (const id of pts) {
        const p = objectById(c, id);
        if (!p || !isPositional(p)) return { ok: false, error: unknownRef(c, id) };
      }
      if (new Set(pts).size !== pts.length) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      const prior = objectById(c, f.id);
      if (prior) {
        if (prior.kind !== 'circle-thru') {
          return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(prior) } };
        }
        // A semicircle's hidden circle STATED by the student (#1622 E4): the same circle, now drawn.
        if (prior.hidden && !f.hidden) return { ok: true, effect: 'created', next: unhidden(c, f.id) };
        return { ok: true, effect: 'known', next: c };
      }
      return {
        ok: true,
        effect: 'created',
        next: {
          ...c,
          objects: [...c.objects, { kind: 'circle-thru', id: f.id, def: f.def, ...(f.name ? { name: f.name } : {}), ...(f.hidden ? { hidden: true as const } : {}) }],
        },
      };
    }

    /**
     * A DRAWN ARC (#1622 E4, ADR-AG-220) — decoration over a circle and two points the figure holds. Never invents
     * them: the sentence that draws an arc states its circle and its ends first. Restating it is absorbed.
     */
    case 'arc': {
      const host = objectById(c, f.def.circle);
      if (!host || curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, f.def.circle) };
      for (const id of [f.def.from, f.def.to, ...[f.def.away, f.def.toward].filter((x): x is Id => x !== undefined)]) {
        const o = objectById(c, id);
        if (!o || !isPositional(o)) return { ok: false, error: unknownRef(c, id) };
      }
      if (f.def.from === f.def.to) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      const prior = objectById(c, f.id);
      if (prior) {
        if (prior.kind !== 'arc') return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(prior) } };
        return { ok: true, effect: 'known', next: c };
      }
      return { ok: true, effect: 'created', next: { ...c, objects: [...c.objects, { kind: 'arc', id: f.id, def: f.def }] } };
    }

    /**
     * «קשת AB = 40 במעגל O» · «⌢{AC} = 60°» · «קשת DE = 2 קשת CE» · «קשת AC + קשת BE = קשת AD + קשת BC במעגל O» — ARC
     * MEASURES (#1622 E4, ADR-AG-220; 2-D's `arcValue`/`arcEquality`/`measureSum`, ADR-116). Which circle: the named
     * one (stated on its centre when the figure lacks it — ADR-AG-210), else the ONE circle (none or several is the
     * contextual refusal). The arc's ends must exist (2-D refuses an unknown end too) and are ON the circle — an arc
     * AB of circle O has its ends on O, so a figure with A off it would draw a given that does not hold. The measure
     * is `arc-sum` over the circle's own centre, so no centre letter is needed.
     */
    case 'arc-of': {
      const ends = [...new Set(f.terms.flatMap((t) => [t.a, t.b]))];
      for (const id of ends) {
        const o = objectById(c, id);
        if (!o || !isPositional(o)) return { ok: false, error: unknownRef(c, id) };
      }
      if (f.terms.some((t) => t.a === t.b)) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      const host = arcHost(c, f.circle, f);
      if ('outcome' in host) return host.outcome;
      return applyAll(c, [
        ...onCircle(c, host.o, ends, f.src),
        { t: 'constraint', k: { t: 'arc-sum', terms: f.terms.map((t) => ({ k: t.k, circle: host.o.id, a: t.a, b: t.b })), value: f.value }, src: f.src },
      ]);
    }

    /**
     * «M אמצע הקשת BC במעגל O» (#1622 E4, ADR-AG-220; 2-D's `arc-midpoint`). The ends and the midpoint are on the
     * circle, the two arcs from the ends to M are equal (`arc-sum`, so no centre letter is needed), and M is on the
     * MINOR arc's side of the chord BC (the `arc-side` region «על הקשת הקטנה» reads) — or the major's, «הקשת הגדולה».
     * The sentence introduces its ends, as 2-D's does: a new end is a free point the circle carries (ADR-052).
     */
    case 'arc-mid': {
      if (f.a === f.b || f.id === f.a || f.id === f.b) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      const host = arcHost(c, f.circle, f);
      if ('outcome' in host) return host.outcome;
      const num = (value: number): Expr => ({ kind: 'num', value });
      const declares = [f.a, f.b, f.id].map((id): Fact => ({ t: 'declare', id, src: f.src }));
      const declared = applyAll(c, declares);
      if (!declared.ok) return declared;
      return applyAll(c, [
        ...declares,
        ...onCircle(declared.next, host.o, [f.a, f.b, f.id], f.src),
        { t: 'selector', sel: { kind: 'distinct', ids: [f.a, f.b] }, src: f.src },
        {
          t: 'constraint',
          k: {
            t: 'arc-sum',
            terms: [
              { k: num(1), circle: host.o.id, a: f.a, b: f.id },
              { k: num(-1), circle: host.o.id, a: f.id, b: f.b },
            ],
            value: num(0),
          },
          src: f.src,
        },
        { t: 'selector', sel: { kind: 'sign', q: { k: 'arc-side', p: f.id, a: f.a, b: f.b, circle: host.o.id }, positive: f.major === true }, src: f.src },
      ]);
    }

    /**
     * «גזרה AOB בזווית 80» · «רבע מעגל» · «רבע מעגל OAB» — a SECTOR (#1622 E4, ADR-AG-220; 2-D's sector and quarter
     * circle). Two radii and the arc between them, the circle itself not drawn (2-D's `hidden`):
     * - with a CENTRE letter, the circle on it — the figure's when it has one (the sector is cut from it), else a
     *   hidden circle stated on that centre with a free radius (ADR-052); the radii are drawn as segments;
     * - with none (the bare quarter circle), a circle of its own whose centre has no letter (the tangency's created
     *   circle, ADR-AG-198, hidden) — the radii are drawn with the arc, since no segment can name the centre.
     * The central angle: a stated value (a reflex one draws the MAJOR arc, as in 2-D); with none, free (ADR-052).
     */
    case 'sector': {
      if (f.a === f.b || f.v === f.a || f.v === f.b) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      const deg = f.value ? evalExpr(f.value, PROBE_ENVS[0]) : null;
      if (deg !== null && !(deg > 0 && deg < 360)) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      const reflex = deg !== null && deg > 180;
      const central: Expr | undefined = f.value && reflex ? { kind: 'sub', a: { kind: 'num', value: 360 }, b: f.value } : f.value;
      const pick: ArcDef['pick'] = reflex ? 'major' : 'minor';
      const ends: Fact[] = [f.a, f.b].map((id): Fact => ({ t: 'declare', id, src: f.src }));
      const segment = (a: Id, b: Id): Fact => ({ t: 'segment', id: `seg-${[a, b].sort().join('')}`, a, b, src: f.src });
      if (f.v === undefined) {
        const id: Id = `circle-sector-${f.a}${f.b}`;
        if (objectById(c, id)) return { ok: true, effect: 'known', next: c };
        const radius = (at: Id): Direction => ({ k: 'radius', circle: id, at });
        // A right sector (the quarter circle) is the radii PERPENDICULAR — the relation the tangent lowering uses;
        // any other angle is the arc's own measure.
        const angle: Fact[] = !central
          ? []
          : deg === 90
            ? [{ t: 'constraint', k: { t: 'relation', rel: 'perpendicular', u: radius(f.a), v: radius(f.b) }, src: f.src }]
            : [{ t: 'constraint', k: { t: 'arc-sum', terms: [{ k: { kind: 'num', value: 1 }, circle: id, a: f.a, b: f.b }], value: central }, src: f.src }];
        return applyAll(c, [
          ...createdCircleFacts(id, f.src, true),
          ...ends,
          { t: 'constraint', k: { t: 'on-curve', id: f.a, curve: id }, src: f.src },
          { t: 'constraint', k: { t: 'on-curve', id: f.b, curve: id }, src: f.src },
          { t: 'selector', sel: { kind: 'distinct', ids: [f.a, f.b] }, src: f.src },
          ...angle,
          { t: 'arc', id: `arc-${f.a}${f.b}`, def: { circle: id, from: f.a, to: f.b, pick, radii: true }, src: f.src },
        ]);
      }
      const v = f.v;
      const lead: Fact[] = [{ t: 'declare', id: v, src: f.src }, ...ends];
      const declared = applyAll(c, lead);
      if (!declared.ok) return declared;
      let host = circleByName(declared.next, v);
      if (host && curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', v)) };
      if (!host) {
        const r = radiusSymbol(v);
        lead.push(
          { t: 'param', sym: r, domain: { min: 0, minOpen: true }, src: f.src },
          { t: 'circle-at', id: `circle-at-${v}`, centre: v, r: { kind: 'sym', name: r }, hidden: true, src: f.src },
        );
        const made = applyAll(c, lead);
        if (!made.ok) return made;
        host = objectById(made.next, `circle-at-${v}`)!;
      }
      const placed = applyAll(c, lead);
      if (!placed.ok) return placed;
      return applyAll(c, [
        ...lead,
        ...onCircle(placed.next, host, [f.a, f.b], f.src),
        { t: 'selector', sel: { kind: 'distinct', ids: [f.a, f.b] }, src: f.src },
        ...(central ? [{ t: 'constraint', k: { t: 'angle', at: { v, a: f.a, b: f.b }, value: central }, src: f.src } as Fact] : []),
        segment(v, f.a),
        segment(v, f.b),
        { t: 'arc', id: `arc-${f.a}${f.b}`, def: { circle: host.id, from: f.a, to: f.b, pick }, src: f.src },
      ]);
    }

    /**
     * «BD קוטר במעגל» — which circle, answered from the construction (#1324; 2-D's `circleOnDiameter` /
     * `diameter` precedence, ported as a decision).
     *
     * - A DEFINING phrase («שקוטרו», «במעגל חדש», "with diameter"), or no circle to attach to: the
     *   sentence CREATES the circle on the diameter — the bagrut opener.
     * - A circle named, or the one circle in the figure: the sentence is ABOUT it (M1). Lowered exactly:
     *   a circle on a centre point → both ends on it and the centre at their midpoint; a circle through
     *   three points two of which are the ends → the right angle at the third (Thales, both directions);
     *   the circle already on this diameter → known. Any other circle (an equation circle, a created one,
     *   any computed circle) → both ends on it, distinct, and AB through its centre (#1665, ADR-AG-203).
     * - Several circles and none named: refused as ambiguous, never a pick.
     */
    case 'diameter-of': {
      for (const id of [f.a, f.b]) {
        const p = objectById(c, id);
        if (!p || !isPositional(p)) return { ok: false, error: unknownRef(c, id) };
      }
      if (f.a === f.b) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      // By the fit, not the declaration (`curveKindOf`): «(x-3)^2+(y-4)^2=9» declares no kind and IS a circle.
      const isCircle = (o: GeoObject) => curveKindOf(o) === 'circle';
      let host: GeoObject | undefined;
      if (f.circle !== undefined) {
        host = circleByName(c, f.circle);
        // A named circle the figure lacks is stated by the reference (#1670, ADR-AG-210).
        if (!host) return statingNamedCircle(c, f.circle, f) ?? { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
        if (!isCircle(host)) return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
      } else if (!f.define) {
        const circles = c.objects.filter(isCircle);
        if (circles.length > 1) return { ok: false, error: noHost(f.src, 'circle', circles) };
        host = circles[0];
      }
      if (!host) {
        const [a, b] = [f.a, f.b];
        return applyFact(c, { t: 'circle-thru', id: diameterCircleId(a, b), def: { t: 'diameter', a, b }, src: f.src });
      }
      const on = (id: Id): Fact => ({ t: 'constraint', k: { t: 'on-curve', id, curve: host!.id }, src: f.src });
      if (host.kind === 'circle-at') {
        return applyAll(c, [
          on(f.a),
          on(f.b),
          { t: 'constraint', k: { t: 'derived-at', id: host.centre, rule: { t: 'midpoint', a: f.a, b: f.b } }, src: f.src },
        ]);
      }
      if (host.kind === 'circle-thru') {
        if (host.def.t === 'diameter') {
          const same = [host.def.a, host.def.b].sort().join() === [f.a, f.b].sort().join();
          if (same) return { ok: true, effect: 'known', next: c };
        } else if (host.def.t === 'through') {
          /**
           * EACH END ON THE CIRCLE, BY DEFINITION OR BY INCIDENCE (#1554 arm 2, #1619 B2). «מרובע ABCD חסום
           * במעגל» defines the circle through A, B, C and puts D on it by an incidence; «BD קוטר במעגל» is then
           * as true a statement as «AC קוטר» — which three vertices the lowering happened to pick must not
           * decide whether the student's sentence is refused. Thales, both directions, with the right angle at
           * a DEFINING point that is neither end (one always exists: three define, two are named).
           */
          const def = host.def.pts;
          const onIt = (p: Id) =>
            def.includes(p) || c.constraints.some((k) => k.t === 'on-curve' && k.id === p && k.curve === host!.id);
          if (onIt(f.a) && onIt(f.b)) {
            const third = def.find((p) => p !== f.a && p !== f.b)!;
            return applyFact(c, { t: 'constraint', k: rightAngleAt(third, f.a, f.b), src: f.src });
          }
        }
      }
      /**
       * EVERY OTHER CIRCLE — an equation circle, the circle a tangency sentence created with its centre unnamed,
       * a computed circle the ends are not defining points of (#1665, ADR-AG-203). A diameter is the chord
       * through the CENTRE, and the centre is the resolved circle's whatever way it was stated — nothing needs
       * its letter. So: both ends on the circle, the two ends different points (a chord has two ends, #1638),
       * and AB along the radius at A — the line through A and B passes through the centre, and with B ≠ A on
       * the circle that makes B the antipode of A. The radius is the direction operand the touch lowering
       * already relates (ADR-AG-195), read off the RESOLVED circle, so this is one lowering for every kind. It
       * was refused `out-of-scope` because the only lowering stated the centre as a POINT (the midpoint), which
       * a circle with no centre letter does not have. (A RADIUS still needs its centre end named — `role-of`.)
       */
      return applyAll(c, [
        on(f.a),
        on(f.b),
        { t: 'selector', sel: { kind: 'distinct', ids: [f.a, f.b] }, src: f.src },
        {
          t: 'constraint',
          k: { t: 'relation', rel: 'parallel', u: { k: 'points', a: f.a, b: f.b }, v: { k: 'radius', circle: host.id, at: f.a } },
          src: f.src,
        },
      ]);
    }

    /**
     * «המעגל משיק לציר ה-x» — the circle resolved from the figure (#1060).
     *
     * The same contextual resolution as `area-of` and `meet-of`: one circle makes it unambiguous,
     * none or several makes it a refusal rather than a pick.
     */
    /**
     * «הנקודה A נמצאת על האליפסה» — the curve resolved by its KIND (#1057).
     *
     * The fourth contextual reference, and the same discipline as the other three: one curve of
     * that kind makes it unambiguous, none or several makes it a refusal. The corpus never puts
     * two conics of a kind in one figure, so refusing costs nothing a real question asks for.
     *
     * A `circle-at` counts as a circle: it IS one, however it was stated.
     */
    case 'on-kind': {
      const point = objectById(c, f.id);
      if (!point || !isPositional(point)) {
        return { ok: false, error: unknownRef(c, f.id) };
      }
      /**
       * The kind of an ANONYMOUS conic is not declared — it comes from the FIT (02c R6: the noun is
       * optional "because the fit already knows the kind"). So «x²/9 + y²/4 = 1» carries no
       * `curve.kind` at all, and matching on the declaration alone would find no ellipse in a figure
       * that plainly has one.
       *
       * Resolved against a PROBE environment, the same device `sameNumbers` uses here: a conic's KIND
       * does not turn on the value of its parameters in any form the corpus writes.
       */
      // «A על מעגל M» (#1619 B1): a NAMED circle resolves through the one name chain, the bare kind to the one.
      if (f.circle !== undefined) {
        const named = circleByName(c, f.circle);
        // A named circle the figure lacks is stated by the reference (#1670, ADR-AG-210): «A על המעגל שמרכזו M».
        if (!named) return statingNamedCircle(c, f.circle, f) ?? { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
        if (curveKindOf(named) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
        return applyFact(c, { t: 'constraint', k: { t: 'on-curve', id: f.id, curve: named.id }, src: f.src });
      }
      /*
       * «האנך» — the one PERPENDICULAR the figure drew (#1620, ADR-AG-207): a `foot` derived point, whose line is the
       * point it is dropped from through the foot. Narrowed by the description when the sentence gives one («האנך
       * שהורידו מנקודה B לציר ה-x»). A reference, never a construction: none or several is the «המשיק» refusal.
       */
      if (f.kind === 'perpendicular') {
        const feet = c.objects.filter(
          (o): o is Extract<GeoObject, { kind: 'derived' }> =>
            o.kind === 'derived' &&
            o.rule.t === 'foot' &&
            (!f.foot || (o.rule.from === f.foot.from && (!f.foot.onto || sameDerivation(o.rule, { t: 'foot', from: f.foot.from, onto: f.foot.onto })))),
        );
        /**
         * NAMED IN FULL, the perpendicular is the OBJECT, not only a pointer to one (#1727, ADR-AG-229 — operator ruling
         * 2026-10-03, amending ADR-AG-207's reference-only rule). One already drawn is the one referred to — a `foot`
         * derived the same way, or an altitude whose foot the student named («AD גובה לצלע BC»: AD ⟂ BC, D on BC) —
         * and never duplicated. With none, the reference BUILDS it as «האנך מ-A ל-BC» does: the foot (its tool letter,
         * `mint`) and the piece from the point to it.
         */
        const full = f.foot?.onto ? f.foot : undefined;
        const named: Id[] =
          full && full.onto?.k === 'points'
            ? c.constraints.flatMap((k) => {
                if (k.t !== 'perpendicular' || k.a !== full.from) return [];
                const pair = full.onto as Extract<FootLine, { k: 'points' }>;
                const onPair = (k.c === pair.a && k.d === pair.b) || (k.c === pair.b && k.d === pair.a);
                const footOn = c.constraints.some(
                  (q) => q.t === 'on-line-2pt' && q.id === k.b && ((q.a === pair.a && q.b === pair.b) || (q.a === pair.b && q.b === pair.a)),
                );
                return onPair && footOn && !feet.some((o) => o.id === k.b) ? [k.b] : [];
              })
            : [];
        if (feet.length + named.length === 0 && full?.onto && full.mint) {
          const built = applyAll(c, [
            { t: 'derived', id: full.mint, rule: { t: 'foot', from: full.from, onto: full.onto }, src: f.src },
            { t: 'segment', id: segmentIdOf(full.from, full.mint), a: full.from, b: full.mint, ref: true, src: f.src },
          ]);
          if (!built.ok) return built;
          const bound = applyFact(built.next, { t: 'constraint', k: { t: 'on-line-2pt', id: f.id, a: full.from, b: full.mint }, src: f.src });
          return bound.ok ? { ...bound, effect: 'created' } : bound;
        }
        if (feet.length + named.length !== 1) return { ok: false, error: noHost(f.src, 'perpendicular', feet.length + named.length) };
        if (named.length === 1) {
          return applyFact(c, { t: 'constraint', k: { t: 'on-line-2pt', id: f.id, a: full!.from, b: named[0] }, src: f.src });
        }
        const foot = feet[0];
        if (foot.rule.t !== 'foot') return { ok: false, error: noHost(f.src, 'perpendicular', 0) };
        return applyFact(c, { t: 'constraint', k: { t: 'on-line-2pt', id: f.id, a: foot.rule.from, b: foot.id }, src: f.src });
      }
      // «המשיק» — the one tangent OBJECT (#1619 B3): a line built at a touch point, never any line.
      const matches = c.objects.filter((o) => (f.kind === 'tangent' ? isTangentObject(o) : curveKindOf(o) === f.kind));
      /*
       * A POINT ON «המעגל» WITH NO CIRCLE: THE SENTENCE STATES IT (#1669 for a chord's end, ADR-AG-204; #1670 for every
       * incidence, ADR-AG-210 — operator 2026-10-02, "analytic should mimic 2d"). The tangency's create path (ADR-AG-198
       * ruling b): the circle with its centre UNNAMED (a later «O מרכז המעגל» names it), a free centre and radius
       * (ADR-052). «A על המעגל» with no circle builds in 2-D, so it does here; a parabola or an ellipse has no such path.
       */
      if (matches.length === 0 && f.kind === 'circle') {
        const created = applyAll(c, touchedCircleFacts(f.src));
        if (!created.ok) return created;
        const bound = applyFact(created.next, { t: 'constraint', k: { t: 'on-curve', id: f.id, curve: TOUCHED_CIRCLE_ID }, src: f.src });
        return bound.ok ? { ...bound, effect: 'created' } : bound;
      }
      if (matches.length !== 1) return { ok: false, error: noHost(f.src, f.kind === 'tangent' ? 'line' : f.kind, matches) };
      return applyFact(c, { t: 'constraint', k: { t: 'on-curve', id: f.id, curve: matches[0].id }, src: f.src });
    }

    /**
     * «O מרכז המעגל» · «P מרכז המעגל x^2+y^2=16» — NAMING the centre (#1598, #1619 B1).
     *
     * Which circle: the one with this equation, else the one circle in the figure. What the name lowers to
     * is decided by HOW that circle was stated, so no sentence needs a case of its own:
     *  - an equation circle → the `circle-centre` derivation «O מרכז המעגל I» already lowers to (#1109),
     *    with its `already-named` and auto-O yield rules unchanged (#1153, ADR-AG-184);
     *  - a circle computed from points → its circumcentre / the diameter's midpoint (`centreRuleOf`);
     *  - a circle on a centre point → that point IS the centre: the same letter is known, another letter is
     *    a second name for one position, refused naming the holder (#1153);
     *  - an equation that matches no curve → the circle is stated with its centre named, exactly as «נתון
     *    מעגל P שמשוואתו …» states it (`create`);
     *  - NO circle at all → the circle on this centre is stated (`create`, «נתון מעגל שמרכזו P») — the
     *    `diameter-of` precedent: a sentence about «המעגל» that finds none introduces it (#1324).
     * Several circles and no equation: refused naming the candidates, never a pick.
     */
    /**
     * A sentence about THE CIRCLE (ADR-AG-196): bound to the circle `theCircle` resolves, its statement is
     * applied with that circle's id written in; with no circle to bind to, the sentence states its own.
     */
    /**
     * A SENTENCE ABOUT ONE OR TWO CIRCLES IT MAY HAVE TO DRAW (#1622 E3, #1693; ADR-AG-219). Each slot resolves to a
     * circle id, in order — a `new` circle drawn with its centre unnamed (two drawn together are a pair, named by
     * order on first mention), a `named` circle through the name chain (named by order on an interchangeable pair,
     * else stated on the letter), `the` circles the figure holds (exactly that many bind, none are drawn, any other
     * count asks) — and the statement is applied with the ids written in.
     */
    case 'circles-about': {
      let cur = c;
      const theCount = f.slots.filter((s) => s.k === 'the').length;
      let bound: Id[] | null = null;
      if (theCount > 0) {
        const circles = cur.objects.filter((o) => curveKindOf(o) === 'circle');
        if (circles.length === theCount) bound = circles.map((o) => o.id);
        else if (circles.length !== 0) return { ok: false, error: noHost(f.src, 'circle', circles, theCount === 2 ? 2 : undefined) };
      }
      const drawn = f.slots.filter((s) => s.k === 'new' || (s.k === 'the' && !bound)).length;
      const fresh = drawn > 0 ? freshCircleIds(cur, drawn) : [];
      const ids: Id[] = [];
      for (const slot of f.slots) {
        if (slot.k === 'the' && bound) {
          ids.push(bound.shift()!);
          continue;
        }
        if (slot.k === 'named') {
          const host = circleByName(cur, slot.name);
          if (host) {
            if (curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(cur, numeralCurveId('circle', slot.name)) };
            ids.push(host.id);
            continue;
          }
          // The circle a letter names, named by order or stated on the letter — `statingNamedCircle` with nothing to re-apply.
          const stated = statingNamedCircle(cur, slot.name, { t: 'circles-about', slots: [], about: [], src: f.src });
          if (!stated) return { ok: false, error: unknownRef(cur, numeralCurveId('circle', slot.name)) };
          if (!stated.ok) return stated;
          cur = stated.next;
          const made = circleByName(cur, slot.name);
          if (!made) return { ok: false, error: unknownRef(cur, numeralCurveId('circle', slot.name)) };
          ids.push(made.id);
          continue;
        }
        const id = fresh.shift()!;
        const created = applyAll(cur, touchedCircleFacts(f.src, id, slot.k === 'new' ? slot.r : undefined));
        if (!created.ok) return created;
        cur = created.next;
        ids.push(id);
      }
      let text = JSON.stringify(f.about);
      ids.forEach((id, i) => {
        text = text.split(CIRCLE_SLOT_SENTINELS[i]).join(id);
      });
      const about = (JSON.parse(text) as Fact[]).map((g) => ({ ...g, src: f.src }));
      // A stated position is drawn by construction, never left to the sampler's luck (ADR-AG-219, `relateCircles`).
      for (const g of about) {
        if (g.t !== 'selector' || g.sel.kind !== 'sign' || g.sel.q.k !== 'circles' || (g.sel.q.rel !== 'inside' && g.sel.q.rel !== 'apart')) continue;
        const placed = relateCircles(cur, g.sel.q.rel, g.sel.q.a, g.sel.q.b, f.src);
        if (!placed.ok) return placed;
        cur = placed.next;
      }
      const out = applyAll(cur, about);
      return out.ok && cur !== c ? { ...out, effect: 'created' } : out;
    }

    case 'the-circle': {
      const bound = theCircle(c, f.match);
      if (bound.t === 'ambiguous') return { ok: false, error: noHost(f.src, 'circle', bound.circles) };
      if (bound.t === 'create') return applyAll(c, f.create);
      const about = JSON.parse(JSON.stringify(f.about).split(CIRCLE_SENTINEL).join(bound.host.id)) as Fact[];
      /*
       * The incircle sentence bound to the circle a touch sentence CREATED (ADR-AG-198): that circle had no
       * definition but its touches — three free symbols the solve had to find — and this sentence says what it
       * is. It becomes the computed incircle under the SAME id, so every touch already stated about it keeps its
       * referent, and its free symbols leave the figure (the closed form replaces a solve, ADR-AG-160's reason).
       */
      const incircle = f.match && 'inscribed' in f.match ? f.create.find((g) => g.t === 'circle-thru' && g.def.t === 'incircle') : undefined;
      if (incircle?.t === 'circle-thru' && bound.host.id === TOUCHED_CIRCLE_ID) {
        const own = (sym: string) => sym.startsWith(toolSymbol(TOUCHED_CIRCLE_ID, ''));
        const defined: Construction = {
          ...c,
          params: c.params.filter((p) => !own(p.sym)),
          objects: c.objects.map((o) => (o.id === TOUCHED_CIRCLE_ID ? { kind: 'circle-thru', id: o.id, def: incircle.def } : o)),
        };
        const out = applyAll(defined, about);
        return out.ok ? { ...out, effect: 'narrowed' } : out;
      }
      return applyAll(c, about);
    }

    /**
     * «משוואת המעגל היא …» about the circle the figure has (#1633, ADR-AG-196). Each kind of circle is
     * pinned through the seam that already owns that part of it — so a conflict is the refusal that seam
     * gives, naming this line, and agreement is `known`.
     */
    case 'circle-eq': {
      const host = objectById(c, f.circleId);
      if (!host || curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, f.circleId) };
      /*
       * THE CIRCLE A SENTENCE CREATED TAKES THE STATED EQUATION (#1669, ADR-AG-204). A chord or tangency sentence typed
       * before any circle stated it with its centre and radius UNKNOWN (the tool's free symbols, ADR-AG-198); «משוואת
       * המעגל היא …» then says what it is. It becomes that equation under the SAME id — every chord end and touch
       * already on it keeps its referent — and its free symbols leave the figure: the incircle sentence's treatment of
       * the same circle (`the-circle`, above). Corpus 11/5 types its chords first and its equation second.
       */
      if (host.kind === 'curve' && host.id === TOUCHED_CIRCLE_ID) {
        const own = (sym: string) => sym.startsWith(toolSymbol(TOUCHED_CIRCLE_ID, ''));
        const defined: Construction = {
          ...c,
          params: c.params.filter((p) => !own(p.sym)),
          objects: c.objects.map((o) => (o.id === TOUCHED_CIRCLE_ID && o.kind === 'curve' ? { ...o, curve: { kind: 'circle', eq: f.eq } } : o)),
        };
        return { ok: true, next: defined, effect: 'narrowed' };
      }
      // An equation circle IS its equation: the same one is known, another is a contradiction.
      if (host.kind === 'curve') {
        return resolveCurveByEq(c, f.eq) === host.id
          ? { ok: true, next: c, effect: 'known' }
          : { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }
      // The stated circle's centre and radius, read at the probes: a value that moves with the parameters
      // is not a constant this boundary can write down (no CAS) — refused by name, never dropped.
      const fits = PROBE_ENVS.map((env) => resolveCurve({ eq: f.eq } as Curve, env));
      const first = fits[0];
      if (!first.ok || first.curve.kind !== 'circle') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      const { cx, cy, r } = first.curve;
      const close = (v: number, w: number) => Math.abs(v - w) <= 1e-9 * Math.max(1, Math.abs(v), Math.abs(w));
      const constant = fits.every(
        (fit) => fit.ok && fit.curve.kind === 'circle' && close(fit.curve.cx, cx) && close(fit.curve.cy, cy) && close(fit.curve.r, r),
      );
      if (!constant) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      // A computed circle follows from solved points this boundary cannot see — refused by name, the
      // `radius-of` rule for the same circles.
      if (host.kind !== 'circle-at') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      const num = (value: number): Expr => ({ kind: 'num', value }) as Expr;
      // A centre the figure already PLACES at constant coordinates is a restatement: equal is known,
      // different is the contradiction, said on this line (not left to the solve to miss).
      const centre = objectById(c, host.centre);
      if (centre && centre.kind === 'point') {
        const at = PROBE_ENVS.map((env) => [evalExpr(centre.x as Parameters<typeof evalExpr>[0], env), evalExpr(centre.y as Parameters<typeof evalExpr>[0], env)]);
        const fixed = at.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && close(x, at[0][0]) && close(y, at[0][1]));
        if (fixed && !(close(at[0][0], cx) && close(at[0][1], cy))) {
          return { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
        }
      }
      return applyAll(c, [
        { t: 'point', id: host.centre, x: num(cx), y: num(cy), src: f.src },
        { t: 'radius-of', circleId: host.id, value: num(r), src: f.src },
      ]);
    }

    case 'centre-of': {
      // No creation the sentence can stand for (the centre letter reads as a circle numeral): refused by
      // name rather than absorbed as though it had said nothing.
      const create = (): ApplyOutcome =>
        f.create ? applyAll(c, f.create) : { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      let host: GeoObject | undefined;
      if (f.circleId !== undefined) {
        host = objectById(c, f.circleId);
        if (!host || curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, f.circleId) };
      } else if (f.circle !== undefined) {
        host = circleByName(c, f.circle);
        if (!host || curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
      } else if (f.eq !== undefined) {
        const id = resolveCurveByEq(c, f.eq);
        if (!id) return create();
        host = objectById(c, id);
        if (host && curveKindOf(host) !== 'circle') {
          return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(host) } };
        }
      } else {
        const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
        if (circles.length === 0) return create();
        if (circles.length > 1) {
          // «O מרכז המעגל» beside two fresh interchangeable circles names one, by order (#1688 ruling, ADR-AG-219).
          const pick = objectById(c, f.id) ? null : circleToName(c);
          if (pick?.t === 'name') return namingByOrder(c, pick.host, f.id, f);
          return { ok: false, error: noHost(f.src, 'circle', circles) };
        }
        host = circles[0];
      }
      if (!host) return { ok: false, error: noHost(f.src, 'circle', 0) };
      if (host.kind === 'circle-at') {
        if (host.centre === f.id) return { ok: true, effect: 'known', next: c };
        return { ok: false, error: { code: 'already-named', detail: f.src, holder: statedName(host.centre) } };
      }
      const rule = centreRuleOf(host);
      if (!rule) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      return applyFact(c, { t: 'derived', id: f.id, rule, src: f.src });
    }

    /**
     * «CD עובר דרך מרכז המעגל» — the centre used as a POINT (#1619 B1). Which point the centre IS is the
     * figure's answer (`centreIdOf`); the sentence's own facts are then applied with that name, so the
     * statement means exactly what it means with the letter written in. An unnamed centre is a point the
     * student has not named yet — refused as the unknown reference it is, quoting their own words.
     */
    case 'via-centre': {
      const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
      if (circles.length !== 1) return { ok: false, error: noHost(f.src, 'circle', circles) };
      const centre = centreIdOf(c, circles[0]);
      if (centre === null) return { ok: false, error: { code: 'unknown-reference', detail: f.phrase, expected: 'point' } };
      const facts = JSON.parse(JSON.stringify(f.facts).split(CENTRE_SENTINEL).join(centre)) as Fact[];
      return applyAll(c, facts.map((g) => ({ ...g, src: f.src })));
    }

    /**
     * «B נמצאת מחוץ למעגל» · «E נמצאת על הקשת הקטנה AC» — a REGION of the circle (#1619 B1).
     *
     * D7 kind 2 ([ADR-AG-005](../../docs/06c-decisions-analytic.md#adr-ag-005)): a region consumes no
     * freedom, so it is a SELECTOR over the configurations — `between`'s kind, never a constraint (which
     * would drop the DOF cue) and never a sampling bound. It is the `sign` selector over the circle's own
     * derived quantity: the power of the point (outside / inside), or the point's side of the chord against
     * the centre's (the minor arc is the side the centre is not on). An ARC also states that its point and
     * the chord's two ends lie ON the circle — «הקשת AC» of a circle has its ends on it — so those
     * incidences come with it, absorbed where they were already given.
     */
    case 'circle-region': {
      let host: GeoObject | undefined;
      if (f.circle !== undefined) {
        host = circleByName(c, f.circle);
        if (!host) return statingNamedCircle(c, f.circle, f) ?? { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
        if (curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
      } else {
        const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
        if (circles.length !== 1) return { ok: false, error: noHost(f.src, 'circle', circles) };
        host = circles[0];
      }
      const circle = host.id;
      if (f.region === 'outside' || f.region === 'inside') {
        return applyAll(c, [
          { t: 'declare', id: f.id, src: f.src },
          { t: 'selector', sel: { kind: 'sign', q: { k: 'power', p: f.id, circle }, positive: f.region === 'outside' }, src: f.src },
        ]);
      }
      const [a, b] = [f.a!, f.b!];
      if (a === b || f.id === a || f.id === b) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      const on = (id: Id): Fact => ({ t: 'constraint', k: { t: 'on-curve', id, curve: circle }, src: f.src });
      return applyAll(c, [
        { t: 'declare', id: f.id, src: f.src },
        on(f.id),
        on(a),
        on(b),
        { t: 'selector', sel: { kind: 'sign', q: { k: 'arc-side', p: f.id, a, b, circle }, positive: f.region === 'major-arc' }, src: f.src },
      ]);
    }

    /**
     * «אורך הקטע AB שווה לרדיוס המעגל» — the radius against a MEASURED length (#1619 B1). The `radius-of`
     * host resolution, then the `length-eq` the sentence means with the circle's own radius on the right: a
     * free radius stays free and is SOLVED by the equation (the radius symbol is in the register), a
     * stated one is a constant, an equation circle's is read at the probes. A computed circle's radius
     * follows from solved points this boundary cannot see — refused by name, as `radius-of` refuses it.
     */
    case 'radius-length': {
      let host: GeoObject | undefined;
      if (f.circle !== undefined) {
        host = circleByName(c, f.circle);
        if (!host || curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
      } else {
        const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
        if (circles.length !== 1) return { ok: false, error: noHost(f.src, 'circle', circles) };
        host = circles[0];
      }
      let r: Expr | null = null;
      if (host.kind === 'circle-at') r = host.r as Expr;
      else if (host.kind === 'curve') {
        const curve = host.curve;
        const radii = PROBE_ENVS.map((env) => {
          const rc = resolveCurve(curve, env);
          return rc.ok && rc.curve.kind === 'circle' ? rc.curve.r : NaN;
        });
        // A radius that moves with the parameters is not a constant this boundary can write down (no CAS).
        if (radii.every(Number.isFinite) && Math.abs(radii[0] - radii[1]) <= 1e-9 * Math.max(1, radii[0])) {
          r = { kind: 'num', value: radii[0] } as Expr;
        }
      }
      if (!r) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      return applyFact(c, { t: 'constraint', k: { t: 'length-eq', left: f.length, right: { expr: r, terms: [] } }, src: f.src });
    }

    case 'crossing-kind': {
      // «E נקודת החיתוך של הישרים» (#1429): WHICH two is the figure's answer — exactly two of the
      // kind lower to the incidences the spelled-out sentence carries; anything else refuses. The
      // `on-kind` rule, one arity up, resolved by the same fit-level kind test.
      const point = objectById(c, f.id);
      if (!point || !isPositional(point)) return { ok: false, error: unknownRef(c, f.id) };
      // «המשיקים נפגשים בנקודה D» (#1620 S7, ADR-AG-213): the TANGENT objects, by the test «המשיק» resolves with.
      const pair = c.objects.filter((o) => (f.kind === 'tangent' ? isTangentObject(o) : curveKindOf(o) === f.kind));
      if (pair.length !== 2) return { ok: false, error: noHost(f.src, f.kind === 'tangent' ? 'line' : f.kind, pair.length, 2) };
      // …and, as 2-D draws that sentence, the piece from each touch point to the crossing.
      const pieces: Fact[] = f.pieces
        ? pair.flatMap((o) => (o.kind === 'line-at' ? [{ t: 'segment' as const, id: segmentIdOf(o.through, f.id), a: o.through, b: f.id, src: f.src }] : []))
        : [];
      return applyAll(c, [
        ...pair.map((o) => ({ t: 'constraint' as const, k: { t: 'on-curve' as const, id: f.id, curve: o.id }, src: f.src })),
        ...pieces,
      ]);
    }

    case 'tangent-of': {
      let host: GeoObject | undefined;
      if (f.circleId !== undefined) {
        host = objectById(c, f.circleId);
        if (!host || curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, f.circleId) };
      } else if (f.circle !== undefined) {
        // The line-first order names its circle — «הישר l1 משיק למעגל M» (#1501). The same lookup
        // chain as `diameter-of`: a numeral id, a centre-letter id, or the student's own name.
        host = circleByName(c, f.circle);
        if (!host) return statingNamedCircle(c, f.circle, f) ?? { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
        if (curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
      } else {
        // By the fit, not the declaration: «המעגל» about an equation circle still finds ITS circle,
        // and the honest answer below is `out-of-scope`, not "which circle?" (#1501).
        const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
        /*
         * NO CIRCLE YET: THE SENTENCE STATES IT (#1619 ruling b, ADR-AG-198 — ADR-AG-196's none → create, extended
         * to the tangency readers). «AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה» typed before any circle is how the
         * exam introduces its circle; the circle is created with its centre UNNAMED (a later «O מרכז המעגל» names
         * it, B1's rule) — no tool-chosen letter. A tangency this lowering cannot honour on such a circle (an axis
         * with no touch point named, which only a centre POINT can carry) keeps the no-circle refusal.
         */
        /*
         * …and when the touch list named EVERY side of one ring as a side (ADR-AG-198 Am. 1), the only circle
         * tangent to all of them at points on them is the ring's INCIRCLE — so it is created closed form (B2's
         * `incircle`, with a quadrilateral's Pitot given), exactly as «במשולש … חסום מעגל» typed first creates it,
         * never as a free circle a joint solve must fit against a free ring (measured: ~400 ms per evaluation).
         */
        if (circles.length === 0 && f.ring && f.at !== undefined) {
          const v = f.ring;
          const id = incircleId(ringId(v));
          const pitot: Fact[] =
            v.length === 4
              ? [{ t: 'constraint', k: { t: 'length-eq', left: parseLengthExpr(`${v[0]}${v[1]}+${v[2]}${v[3]}`)!, right: parseLengthExpr(`${v[1]}${v[2]}+${v[3]}${v[0]}`)! }, src: f.src }]
              : [];
          const created = applyAll(c, [...pitot, { t: 'circle-thru', id, def: { t: 'incircle', pts: v }, src: f.src }]);
          if (!created.ok) return created;
          const bound = applyFact(created.next, { ...f, circleId: id });
          return bound.ok ? { ...bound, effect: 'created' } : bound;
        }
        if (circles.length === 0 && (f.at !== undefined || f.axes.length === 0)) {
          const created = applyAll(c, touchedCircleFacts(f.src));
          if (!created.ok) return created;
          const bound = applyFact(created.next, { ...f, circleId: TOUCHED_CIRCLE_ID });
          return bound.ok ? { ...bound, effect: 'created' } : bound;
        }
        if (circles.length !== 1) return { ok: false, error: noHost(f.src, 'circle', circles) };
        host = circles[0];
      }
      // THE TOUCH POINT NAMED (#1619 B3, ADR-AG-195): any circle — the radius reads the resolved one.
      if (f.at !== undefined) return applyTouchAt(c, host, f.at, f.axes, f.lines ?? [], f.src);
      /**
       * A circle the figure DETERMINES — stated by its equation, or computed from points (#1430 step 1,
       * ADR-AG-195): the distance from ITS centre to the line is ITS radius, both read off the resolved
       * circle (`tangent-curve`), so the freedom consumed is the line's («y=kx+1» pins k). An AXIS has no
       * freedom to give, so a determined circle touching one is a claim this rule does not judge — refused
       * BY NAME (`out-of-scope`), never dropped (the `diameter-of` rule, one case up).
       */
      if (host.kind !== 'circle-at') {
        if (f.axes.length > 0) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
        const circleId = host.id;
        return applyAll(
          c,
          (f.lines ?? []).map((line) => ({ t: 'constraint' as const, k: { t: 'tangent-curve' as const, circle: circleId, line }, src: f.src })),
        );
      }
      const circle = host;
      return applyAll(c, [
        ...f.axes.map((axis) => ({
          t: 'constraint' as const,
          k: { t: 'tangent-axis' as const, centre: circle.centre, r: circle.r, axis },
          src: f.src,
        })),
        ...(f.lines ?? []).map((line) => ({
          t: 'constraint' as const,
          k: { t: 'tangent-line' as const, centre: circle.centre, r: circle.r, line },
          src: f.src,
        })),
      ]);
    }

    /**
     * «המשיק למעגל בנקודה A» — the tangent line as an OBJECT (#1619 B3, ADR-AG-195). The circle is
     * resolved by the `tangent-of` chain; A lies on it, and the line through A is perpendicular to the
     * radius there — a `line-at` on the radius direction turned a quarter, 0 DOF, closed form.
     */
    case 'tangent-line-at': {
      const host = circleNamed(c, f.circle, f.src);
      // A named circle the figure lacks is stated by the reference (#1670, ADR-AG-210): «המשיק למעגל O בנקודה A».
      if (!host.ok && f.circle !== undefined && !circleByName(c, f.circle)) return statingNamedCircle(c, f.circle, f) ?? host;
      if (!host.ok) return host;
      return applyAll(c, [
        { t: 'constraint', k: { t: 'on-curve', id: f.at, curve: host.o.id }, src: f.src },
        { t: 'line-at', id: tangentLineId(f.at), through: f.at, dir: { k: 'radius', circle: host.o.id, at: f.at }, perp: true, src: f.src },
      ]);
    }

    /**
     * «משוואת המשיק היא 4x+3y=40» — WHICH tangent is the figure's answer (#1619 B3): the one tangent object
     * (the equation is then a given about it — the line through its touch point AND tangent there, the
     * same lowering «משוואת המשיק בנקודה A היא …» carries), none (the stated line is tangent to the circle,
     * «הישר … משיק למעגל»), several (refused, never a pick).
     */
    case 'tangent-eq': {
      const tangents = c.objects.filter(isTangentObject);
      if (tangents.length > 1) return { ok: false, error: noHost(f.src, 'line', tangents) };
      const id = f.id;
      if (tangents.length === 1) {
        const t = tangents[0] as Extract<GeoObject, { kind: 'line-at' }>;
        const circleId = t.dir.k === 'radius' ? t.dir.circle : undefined;
        return applyAll(c, [
          { t: 'curve', id, label: { name: '', eqSrc: f.eqSrc }, curve: { eq: f.eq }, stated: false, src: f.src },
          { t: 'tangent-of', axes: [], lines: [{ kind: 'curve', id, label: f.eqSrc }], ...(circleId ? { circleId } : {}), at: t.through, src: f.src },
        ]);
      }
      return applyAll(c, [
        { t: 'curve', id, label: { name: '', eqSrc: f.eqSrc, kind: 'line' }, curve: { kind: 'line', eq: f.eq }, stated: true, src: f.src },
        { t: 'tangent-of', axes: [], lines: [{ kind: 'curve', id, label: f.eqSrc }], ...(f.circle !== undefined ? { circle: f.circle } : {}), src: f.src },
      ]);
    }

    case 'radius-of': {
      // The tangent-of name→circle chain, so the family cannot drift (#1432). A creation sentence
      // («נתון מעגל O שרדיוסו 5») names its own circle by id, so no name lookup can pick another.
      let host: GeoObject | undefined;
      if (f.circleId !== undefined) {
        host = objectById(c, f.circleId);
        if (!host) return { ok: false, error: unknownRef(c, f.circleId) };
      } else if (f.circle !== undefined) {
        host = circleByName(c, f.circle);
        if (!host || curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
      } else {
        const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
        if (circles.length !== 1) return { ok: false, error: noHost(f.src, 'circle', circles) };
        host = circles[0];
      }
      if (host.kind === 'circle-at') {
        const r = host.r as { kind?: string; name?: string };
        if (r && r.kind === 'sym' && r.name) {
          /**
           * The radius was FREE and the student just gave it — the sym is SUBSTITUTED with the
           * stated value and its parameter retired (when nothing else reads it), so the DOF cue
           * drops by exactly the freedom the sentence consumed. A substitution rather than a
           * solver row: the radius is not solved for, it is now a given, and replay reapplies
           * this deterministically (the fold is pure over the fact list).
           *
           * The value passes the symbol's DOMAIN first (am. 1): «רדיוס המעגל הוא -3» is refused
           * naming the statement, where it used to be substituted and the circle silently vanished.
           */
          const sym = r.name;
          const admitted = admitStated(c, c.params.find((p) => p.sym === sym)?.domain, f.value, f.src);
          if (!admitted.ok) return admitted;
          const base = admitted.next;
          /**
           * EVERYWHERE the symbol stands, not only on the circle (am. 1): a tangency stated with the
           * circle («נתון מעגל O משיק לציר ה-x») carries `r_O` in its own constraint, and replacing the
           * radius on the object alone left that constraint solving a different, still-free radius —
           * the circle drawn at r = 5 while the tangency held for some other r.
           */
          const objects = substituteSym(base.objects, sym, f.value);
          const constraints = substituteSym(base.constraints, sym, f.value);
          const restText = JSON.stringify({ objects, constraints });
          const params = restText.includes(`"${sym}"`) ? base.params : base.params.filter((p) => p.sym !== sym);
          return { ok: true, next: { ...base, objects, constraints, params }, effect: 'narrowed' };
        }
        // A radius already carried by the object: a RESTATEMENT, judged at the probes.
        return sameNumbers(host.r, f.value)
          ? { ok: true, next: c, effect: 'known' }
          : { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }
      if (isCreatedCircle(host) && JSON.stringify(host.curve).includes(`"${toolSymbol(host.id, 'r')}"`)) {
        /*
         * A CREATED circle's radius is the tool's free symbol (ADR-AG-198): the student just gave it, so it is pinned
         * exactly as a centred circle's `r_O` is (above) — «A על המעגל» · «רדיוס המעגל הוא 5», «מעגל בקוטר 10» (2-D
         * sets the radius of its unnamed circle; ADR-AG-219).
         */
        const sym = toolSymbol(host.id, 'r');
        const admitted = admitStated(c, c.params.find((p) => p.sym === sym)?.domain, f.value, f.src);
        if (!admitted.ok) return admitted;
        const base = admitted.next;
        const objects = substituteSym(base.objects, sym, f.value);
        const constraints = substituteSym(base.constraints, sym, f.value);
        const restText = JSON.stringify({ objects, constraints });
        const params = restText.includes(`"${sym}"`) ? base.params : base.params.filter((p) => p.sym !== sym);
        return { ok: true, next: { ...base, objects, constraints, params }, effect: 'narrowed' };
      }
      if (host.kind === 'curve') {
        // An equation circle's radius is determined by its equation — the sentence is a claim.
        const agrees = PROBE_ENVS.every((env) => {
          const rc = resolveCurve(host!.kind === 'curve' ? host!.curve : { eq: undefined as never }, env);
          const v = evalExpr(f.value as Parameters<typeof evalExpr>[0], env);
          return rc.ok && rc.curve.kind === 'circle' && Number.isFinite(v) && Math.abs(rc.curve.r - v) <= 1e-9 * Math.max(1, rc.curve.r, Math.abs(v));
        });
        return agrees
          ? { ok: true, next: c, effect: 'known' }
          : { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }
      // A computed circle (circle-thru): its radius follows from solved points, which this
      // boundary cannot see — refused by name, never silently dropped.
      return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
    }

    case 'focus-of': {
      // THE parabola, exactly as «O מרכז המעגל» resolves the circle — the centre's pattern (#1432).
      // On a point that already exists («F(2,0)» first, or «מוקד הפרבולה הוא (2,0)», whose parser
      // mints the point) the derived fact lowers to the `derived-at` constraint (M1): a fixed parabola
      // judges it, a parameterised one is PINNED by it — «y²=2px» with focus (2,0) solves p = 4.
      const parabolas = c.objects.filter((o) => curveKindOf(o) === 'parabola');
      if (parabolas.length !== 1) return { ok: false, error: noHost(f.src, 'parabola', parabolas.length) };
      return applyFact(c, { t: 'derived', id: f.id, rule: { t: 'parabola-focus', curve: parabolas[0].id }, src: f.src });
    }

    case 'directrix-eq': {
      const parabolas = c.objects.filter((o) => curveKindOf(o) === 'parabola');
      if (parabolas.length !== 1) return { ok: false, error: noHost(f.src, 'parabola', parabolas.length) };
      const host = parabolas[0];
      if (host.kind !== 'curve') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      /**
       * The claim is judged LINE AGAINST LINE (am. 1): the parabola's own directrix
       * (`parabolaDirectrix`, the one derivation the ask and the panel print from) against the
       * stated line, as homogeneous triples — proportional means the same line, whatever its
       * orientation, so no branch here assumes the directrix is vertical. Computed per probe: a
       * directrix that MOVES across probes is parameter-dependent — pinning the parameter from the
       * directrix is not built, and the honest answer is a loud refusal, never a false «conflict».
       */
      const own: Array<[number, number, number]> = [];
      let agrees = true;
      for (const env of PROBE_ENVS) {
        const pc = resolveCurve(host.curve, env);
        const gl = resolveCurve({ eq: f.eq }, env);
        if (!pc.ok || pc.curve.kind !== 'parabola' || !gl.ok || gl.curve.kind !== 'line') {
          return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
        }
        const d = parabolaDirectrix(pc.curve);
        if (d.kind !== 'line') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
        own.push([d.a, d.b, d.c]);
        if (!sameLineTriple([d.a, d.b, d.c], [gl.curve.a, gl.curve.b, gl.curve.c])) agrees = false;
      }
      if (!sameLineTriple(own[0], own[1])) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      return agrees
        ? { ok: true, next: c, effect: 'known' }
        : { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
    }

    case 'perimeter-of': {
      /**
       * «היקף המשולש הוא 12» / «ההיקף הוא 12» — the ring resolved from the figure (am. 1), the
       * `area-of` discipline: one matching polygon lowers to the SIDE SUM «AB+BC+CA=12» would carry
       * (the same `length-eq` constraint, so the perimeter is a real given consuming a DOF, and the
       * ask «היקף ABC» — which delegates to that sum — reads it back); anything else refuses naming
       * the host. A generic noun («משולש») matches every ring of its arity; «מצולע» or no noun, any ring.
       */
      const rings = ringsNamed(c.objects, f.noun) as PolygonObject[];
      if (rings.length !== 1) return { ok: false, error: noHost(f.src, 'polygon', rings.length) };
      const v = rings[0].vertices;
      const left = parseLengthExpr(v.map((a, i) => `${a}${v[(i + 1) % v.length]}`).join('+'));
      if (!left) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      return applyFact(c, { t: 'constraint', k: { t: 'length-eq', left, right: { expr: f.value, terms: [] } }, src: f.src });
    }

    case 'tangent-circles': {
      // The same name→circle chain as `tangent-of`/`diameter-of`: a numeral id, a centre-letter
      // id, or the student's own name — one chain, so the family cannot drift (#1504).
      const byName = (name: string): GeoObject | undefined => circleByName(c, name);
      const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
      let a: GeoObject | undefined;
      let b: GeoObject | undefined;
      if (f.a !== undefined) {
        a = byName(f.a);
        if (!a || curveKindOf(a) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.a)) };
      }
      if (f.b !== undefined) {
        b = byName(f.b);
        if (!b || curveKindOf(b) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.b)) };
      }
      if (!a || !b) {
        // The contextual readings: «המעגל משיק למעגל K» means the one OTHER circle; «המעגלים
        // משיקים» means the exactly two. Anything else is a genuine "which circles?".
        const rest = circles.filter((o) => o !== a && o !== b);
        const need = (a ? 0 : 1) + (b ? 0 : 1);
        // The host rides the refusal (#1432 am. 1): one name missing its partner is the circle none/many
        // remedy; «המעגלים משיקים» over the wrong count is the unnamed-PAIR remedy.
        if (rest.length !== need) return { ok: false, error: noHost(f.src, 'circle', rest.length, need === 2 ? 2 : undefined) };
        if (!a) a = rest.shift();
        if (!b) b = rest.shift();
      }
      // A circle is not tangent to itself — one circle named twice (or the contextual reading
      // landing back on the named one) has no configuration.
      if (a === b) return { ok: false, error: { code: 'unsatisfiable', detail: f.src } };
      /**
       * Tangency pins each RADIUS against each CENTRE, so BOTH circles need both to pull on —
       * the `tangent-of` rule, applied twice. An equation circle or a computed `circle-thru` is
       * refused by name (`out-of-scope`), never dropped.
       */
      if (a!.kind !== 'circle-at' || b!.kind !== 'circle-at') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      const mk = (branch: 'external' | 'internal') => ({
        t: 'tangent-circle' as const,
        centre: a!.centre,
        r: a!.r,
        other: b!.centre,
        otherR: b!.r,
        branch,
      });
      // A branch word collapses the choice (the «זווית B ישרה» pattern); without one, BOTH
      // touches are admissible and «הציגו תצורה אחרת» cycles them (ADR-052, #1049).
      const k = f.branch ? mk(f.branch) : { t: 'choice' as const, options: [mk('external'), mk('internal')] };
      // «…בנקודה T» names the touch point — determined by the two circles, so a derived point (amendment 1).
      const touch = f.at
        ? [{ t: 'derived' as const, id: f.at, rule: { t: 'touch-point' as const, a: a!.id, b: b!.id }, src: f.src }]
        : [];
      return applyAll(c, [{ t: 'constraint', k, src: f.src }, ...touch]);
    }

    case 'area-of': {
      // The rings the noun names — `ringsNamed`, the one answer for a contextual shape noun (#1620, ADR-AG-208):
      // «שטח הטרפז» is a right trapezoid's area too, as «אלכסוני הטרפז» are its diagonals.
      const rings = ringsNamed(c.objects, f.noun) as PolygonObject[];
      if (rings.length !== 1) {
        return { ok: false, error: { code: 'ambiguous-shape', detail: f.src } };
      }
      return applyFact(c, { t: 'constraint', k: { t: 'area', ids: rings[0].vertices, value: f.value }, src: f.src });
    }

    /**
     * «שכל קודקודיו מונחים על הצירים» — EVERY VERTEX ON SOME AXIS (#1620 item 3, ADR-AG-208).
     *
     * The ring is the one the sentence refers to («קודקודיו» — its vertices; «קודקודי הטרפז»). Each vertex is on
     * the x-axis or the y-axis and the sentence does not say which, so the statement is ONE discrete choice over
     * the 2ⁿ assignments, each option the conjunction of its n incidences (`all`): a choice per vertex would
     * cycle on one seed index and never mix the axes. Which assignment the figure takes is the seed's preference
     * among the options the other givens leave alive (#1642's `evaluateTryingChoices`), never a guess the tool
     * makes — and an assignment the ring cannot be drawn on (three vertices on one axis) is simply not admitted.
     */
    case 'vertices-on-axes': {
      const rings = ringsNamed(c.objects, f.noun) as PolygonObject[];
      if (rings.length !== 1) return { ok: false, error: noHost(f.src, 'polygon', rings.length) };
      const v = rings[0].vertices;
      const onAxis = (id: Id, axis: 'x' | 'y'): Constraint =>
        axis === 'x' ? { t: 'on-line', id, a: 0, b: 1, c: 0 } : { t: 'on-line', id, a: 1, b: 0, c: 0 };
      const options: Constraint[] = [];
      for (let mask = 0; mask < 1 << v.length; mask += 1) {
        options.push({ t: 'all', of: v.map((id, i) => onAxis(id, (mask >> i) & 1 ? 'y' : 'x')) });
      }
      return applyFact(c, { t: 'constraint', k: { t: 'choice', options }, src: f.src });
    }

    case 'right-angle': {
      const at = resolveAngleName(c, { v: f.id }, f.src);
      if (!at.ok) return at;
      return withReadAs(applyFact(c, { t: 'constraint', k: rightAngleAt(f.id, at.ref.a, at.ref.b), src: f.src }), at);
    }

    /**
     * «זווית C = 60» · «∠B = ∠C» — the `right-angle` resolution with a value (#1407, ADR-AG-158).
     *
     * Each lone vertex goes through the one resolver above, and the line then lowers to exactly the
     * constraint its three-letter twin lowers to in the parser — so «זוית C=200» after «משולש ABC» is the
     * same `unsatisfiable` refusal «זווית ACB = 200» is, never a second meaning of the sentence.
     */
    case 'vertex-angle': {
      if (f.bare) {
        const host = objectById(c, f.left.v);
        if (!host || !isPositional(host)) return { ok: false, error: { code: 'not-handled', detail: f.src } };
      }
      const left = resolveAngleName(c, f.left, f.src);
      if (!left.ok) return left;
      if (f.rhs.t === 'value') {
        // sin (#1719, ADR-AG-227): the lone vertex resolved, the same choice its three-letter twin carries.
        if (f.rhs.measure === 'sin') return withReadAs(applyFact(c, { t: 'constraint', k: sineAngle(left.ref, f.rhs.value), src: f.src }), left);
        const k: Constraint = { t: 'angle', at: left.ref, value: f.rhs.value };
        if (f.rhs.measure) k.measure = f.rhs.measure;
        return withReadAs(applyFact(c, { t: 'constraint', k, src: f.src }), left);
      }
      const right = resolveAngleName(c, f.rhs.of, f.src);
      if (!right.ok) return right;
      return withReadAs(
        applyFact(c, {
          t: 'constraint',
          k: { t: 'angle-ratio', left: left.ref, right: right.ref, k: f.rhs.k },
          src: f.src,
        }),
        left,
        right,
      );
    }

    /**
     * A CEVIAN WHOSE TARGET THE FIGURE DETERMINES (#1240, #1222; ADR-AG-209) — «AD גובה», «תיכון מנקודה A»,
     * «גובה לצלע BC». The triangles of the figure that hold the named apex (or both ends of the named side)
     * are the candidates; one target builds through the one lowering, several ask, none refuses.
     */
    case 'cevian-of': {
      const targets = new Map<string, { apex: Id; u: Id; v: Id }>();
      let openRight = false;
      // Both named («גובה מ-A לצלע BC בנקודה D»): nothing to resolve.
      if (f.apex && f.side) targets.set('named', { apex: f.apex, u: f.side[0], v: f.side[1] });
      for (const o of f.apex && f.side ? [] : c.objects) {
        if (o.kind !== 'polygon' || o.vertices.length !== 3) continue;
        const ring = o.vertices;
        if (f.hypotenuse) {
          // The right angle the figure STATES — a constraint, never the noun's open choice (ADR-052: never assume C).
          const right = ring.filter((v) => {
            const [p, q] = ring.filter((x) => x !== v);
            const k = rightAngleAt(v, p, q);
            return c.constraints.some((g) => g.t !== 'choice' && sameConstraint(g, k));
          });
          if (right.length === 1) {
            const [u, v] = ring.filter((x) => x !== right[0]);
            targets.set(`${right[0]}|${[u, v].sort().join('')}`, { apex: right[0], u, v });
          } else if (right.length === 0 && o.noun && /ישר/.test(o.noun)) openRight = true;
        } else if (f.side) {
          const [u, v] = f.side;
          if (!ring.includes(u) || !ring.includes(v) || u === v) continue;
          const apex = ring.find((x) => x !== u && x !== v)!;
          if (f.apex && f.apex !== apex) continue;
          targets.set(`${apex}|${[u, v].sort().join('')}`, { apex, u, v });
        } else if (f.apex && ring.includes(f.apex)) {
          const [u, v] = ring.filter((x) => x !== f.apex);
          targets.set(`${f.apex}|${[u, v].sort().join('')}`, { apex: f.apex, u, v });
        }
      }
      /*
       * THE FOOT NARROWS THE APEX (#1662, operator ruling 2026-10-03; ADR-AG-222). A cevian named by its two ends («AD
       * גובה», «משוואת התיכון AD היא …») is drawn in the triangle with vertex A whose opposite side CONTAINS D: when the
       * figure already puts D on one candidate's side, the others are not what the sentence names. 2-D reads «AD גובה»
       * after «D על BC» in the same way (measured: it commits). A foot on no candidate's side narrows nothing.
       */
      if (f.apex && !f.side && !f.hypotenuse && targets.size > 1) {
        const onSide = [...targets].filter(([, t]) => footOnPair(c, f.foot, t.u, t.v));
        if (onSide.length > 0) {
          targets.clear();
          for (const [k, t] of onSide) targets.set(k, t);
        }
      }
      if (f.hypotenuse && (openRight ? targets.size === 0 : false)) return { ok: false, error: { code: 'ambiguous-hypotenuse', detail: f.src } };
      if (f.hypotenuse && targets.size === 0) return { ok: false, error: { code: 'ambiguous-no-right-angle', detail: f.src } };
      if (f.hypotenuse && (targets.size > 1 || openRight)) return { ok: false, error: { code: 'ambiguous-hypotenuse', detail: f.src } };
      if (targets.size === 0) return { ok: false, error: { code: 'cevian-no-triangle', detail: f.src } };
      if (targets.size > 1) return { ok: false, error: { code: 'ambiguous-cevian', detail: f.src } };
      const [{ apex, u, v }] = [...targets.values()];
      if (f.foot === apex || f.foot === u || f.foot === v) return { ok: false, error: { code: 'degenerate-role', detail: f.src } };
      if (f.toolFoot && !objectById(c, f.foot)) {
        // The same point derived the same way already has a name (#1153): the cevian runs to IT.
        const rule = toolFootRule(f.role, apex, u, v);
        const same = c.objects.find((o) => o.kind === 'derived' && sameDerivation(o.rule, rule));
        if (same) return applyAll(c, [{ t: 'segment', id: `seg-${[apex, same.id].sort().join('')}`, a: apex, b: same.id, src: f.src }]);
        return applyAll(c, toolFootFacts(f.role, apex, f.foot, u, v, f.src));
      }
      return applyAll(c, cevianFacts(f.role, apex, f.foot, u, v, f.src));
    }

    /**
     * «AD חוצה את הזווית BAC» (#1284, ADR-AG-209) — 2-D's verdict: a `p` the figure does not have yet is the
     * bisector's foot on the line through the angle's ray points; an existing `p` lies on the bisector's ray.
     */
    case 'bisects': {
      const at = resolveAngleName(c, f.at, f.src);
      if (!at.ok) return at;
      for (const id of [at.ref.v, at.ref.a, at.ref.b]) {
        const o = objectById(c, id);
        if (!o || !isPositional(o)) return { ok: false, error: unknownRef(c, id) };
      }
      // «חוצה זווית ABC» on its own: the bisector LINE through the vertex, named by its angle so it is drawn once.
      if (f.p === undefined) {
        const [a, b] = [at.ref.a, at.ref.b].sort();
        return withReadAs(
          applyFact(c, {
            t: 'line-at',
            id: `line-bisector-${a}${at.ref.v}${b}`,
            through: at.ref.v,
            dir: { k: 'bisector', v: at.ref.v, a, b },
            perp: false,
            src: f.src,
          }),
          at,
        );
      }
      if (f.p === at.ref.a || f.p === at.ref.b) return { ok: false, error: { code: 'degenerate-role', detail: f.src } };
      const prior = objectById(c, f.p);
      if (prior && !isPositional(prior)) {
        return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(prior) } };
      }
      return withReadAs(
        applyAll(c, prior ? onBisectorFacts(at.ref, f.p, f.src) : cevianFacts('bisector', at.ref.v, f.p, at.ref.a, at.ref.b, f.src)),
        at,
      );
    }

    /**
     * «הישר BC» — the line through two named points, DRAWN (#1639, ADR-AG-198). A REFERENCE to its points
     * (the sentence that names a line about points it does not introduce fails on them first; the bare
     * «הישר BC» line declares them before this fact). What it adds is decided here, against the figure:
     *  - the line already in the figure — stated by its equation (a carrier is PROMOTED: the student now
     *    asks to see it, the #1076 rule), or drawn — is `known`;
     *  - a piece the figure already draws over the pair (a segment, a polygon side) is the line's drawn
     *    extent — ADR-AG-135's ruling (a), the figure is the authority — so nothing is added;
     *  - otherwise the `line-at` through `a` along `a→b`, named by the pair so a later sentence finds it.
     */
    case 'line-2pt': {
      for (const id of [f.a, f.b]) {
        const p = objectById(c, id);
        if (!p || !isPositional(p)) return { ok: false, error: unknownRef(c, id) };
      }
      if (f.a === f.b) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      const prior = objectById(c, lineIdOf(`${f.a}${f.b}`)) ?? objectById(c, lineIdOf(`${f.b}${f.a}`));
      if (prior?.kind === 'curve') {
        if (prior.stated) return { ok: true, effect: 'known', next: c };
        return { ok: true, effect: 'created', next: { ...c, objects: c.objects.map((o) => (o === prior ? { ...prior, stated: true } : o)) } };
      }
      if (prior?.kind === 'line-at') return { ok: true, effect: 'known', next: c };
      if (prior) return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(prior) } };
      if (drawnPieceOver(c, f.a, f.b)) return { ok: true, effect: 'known', next: c };
      return applyFact(c, {
        t: 'line-at',
        id: lineIdOf(`${f.a}${f.b}`),
        through: f.a,
        dir: { k: 'points', a: f.a, b: f.b },
        perp: false,
        name: `${f.a}${f.b}`,
        src: f.src,
      });
    }

    /**
     * A bare pair's extent in an incidence (#1636, #1640, ADR-AG-198) — inherited from what the figure draws
     * over the pair NOW: a drawn piece puts the point between its ends (the `between` selector «הצלע BC»
     * carries, so a point that cannot lie on the piece is refused on this line); no piece leaves the line.
     */
    case 'extent-of': {
      if (f.id === f.a || f.id === f.b || !drawnPieceOver(c, f.a, f.b)) return { ok: true, effect: 'known', next: c };
      return applyFact(c, { t: 'selector', sel: { kind: 'between', id: f.id, a: f.a, b: f.b }, src: f.src });
    }

    case 'role-of':
      return applyRoleOf(c, f);

    /** Introduce a named but unplaced point; harmless and absorbed if it already exists. */
    case 'declare': {
      const o = objectById(c, f.id);
      if (o) {
        if (isPositional(o)) return { ok: true, effect: 'known', next: c };
        return {
          ok: false,
          error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(o) },
        };
      }
      return { ok: true, effect: 'created', next: { ...c, objects: [...c.objects, { kind: 'free', id: f.id }] } };
    }

    /** A selector names a point and constrains nothing — it filters configurations after the solve. */
    case 'selector': {
      /**
       * Every point the selector names must exist — the subject, and for a `between` selector the two
       * endpoints it is measured against (#1073). A selector that silently judged nothing because one
       * of its points was missing would be a given that vanished.
       */
      const refsOf = (sel: Selector): Id[] =>
        // A choice («משולש קהה זווית», #1708) names every point of every option.
        sel.kind === 'choice'
          ? sel.options.flatMap(refsOf)
          : sel.kind === 'axis-side' || sel.kind === 'crossing-distinct' || sel.kind === 'crossing-nth'
          ? [sel.id]
          : sel.kind === 'distinct' || sel.kind === 'acute'
            ? sel.ids
            : sel.kind === 'sign'
              ? sel.q.k === 'slope'
                ? dirRefs(sel.q.u)
                : sel.q.k === 'power'
                  ? [sel.q.p]
                  : sel.q.k === 'circles' || sel.q.k === 'params'
                    ? []
                    : sel.q.k === 'centres-side'
                      ? [sel.q.p, sel.q.q]
                      : sel.q.k === 'order'
                        ? // Every point either side measures (#1621 D3) — a vertex of an angle, an end of a length.
                          [sel.q.left, sel.q.right].flatMap((o) => (o.t === 'length' ? lengthRefs(o.le) : o.t === 'angle' ? [o.at.v, o.at.a, o.at.b] : []))
                        : [sel.q.p, sel.q.a, sel.q.b]
              : sel.kind === 'coord-compare'
                ? // Both points of «x_B > x_D» must exist (#1462); a value names none.
                  [sel.id, ...('point' in sel.rhs ? [sel.rhs.point] : [])]
                : sel.kind === 'angle-side'
                  ? [sel.id, sel.v, sel.a, sel.b]
                  : sel.kind === 'segments-cross'
                    ? [sel.a, sel.b, sel.c, sel.d]
                    : // #1622 (ADR-AG-217): the subjects and the line; the point and its ring.
                      sel.kind === 'line-side'
                      ? [...sel.ids, sel.a, sel.b]
                      : sel.kind === 'in-polygon'
                        ? [sel.id, ...sel.ring]
                        : [sel.id, sel.a, sel.b];
      const refs = refsOf(f.sel);
      for (const id of refs) {
        const o = objectById(c, id);
        if (!o || !isPositional(o)) {
          return { ok: false, error: unknownRef(c, id) };
        }
      }
      // A sign about a NAMED line refers to a line the figure must have (#1323) — the #1150 rule for
      // the curve half of a reference, applied to the selector that names one.
      if (f.sel.kind === 'sign' && f.sel.q.k === 'slope' && f.sel.q.u.k === 'curve') {
        const o = objectById(c, f.sel.q.u.id);
        if (!o || !CURVE_BEARING.has(o.kind)) return { ok: false, error: unknownRef(c, f.sel.q.u.id) };
      }
      // A circle region names the circle M1 resolved (#1619 B1) — it must still be one.
      if (f.sel.kind === 'sign' && (f.sel.q.k === 'power' || f.sel.q.k === 'arc-side')) {
        const o = objectById(c, f.sel.q.circle);
        if (!o || curveKindOf(o) !== 'circle') return { ok: false, error: unknownRef(c, f.sel.q.circle) };
      }
      // Two circles' position names two circles the figure holds (ADR-AG-219).
      if (f.sel.kind === 'sign' && (f.sel.q.k === 'circles' || f.sel.q.k === 'centres-side')) {
        for (const id of [f.sel.q.a, f.sel.q.b]) {
          const o = objectById(c, id);
          if (!o || curveKindOf(o) !== 'circle') return { ok: false, error: unknownRef(c, id) };
        }
      }
      /*
       * An order between parameters («R > r», ADR-AG-219) compares symbols the figure USES — a radius letter a
       * sentence gave. A symbol nothing reads would be a given about nothing: refused naming it, never kept.
       */
      if (f.sel.kind === 'sign' && f.sel.q.k === 'params') {
        const used = JSON.stringify({ o: c.objects, k: c.constraints });
        const missing = symbolsOf(f.sel.q.e).find((sym) => !used.includes(`"name":"${sym}"`));
        if (missing !== undefined) return { ok: false, error: { code: 'unknown-reference', detail: missing, expected: 'point' } };
      }
      // Compared structurally: the union's members have different shapes, and a field-by-field test
      // would have to be extended by hand for each new kind — the drift ADR-043 names.
      const dup = c.selectors.some((s) => JSON.stringify(s) === JSON.stringify(f.sel));
      if (dup) return { ok: true, effect: 'known', next: c };
      return {
        ok: true,
        effect: 'created',
        next: { ...c, selectors: [...c.selectors, f.sel] },
      };
    }

    case 'derived':
    case 'segment':
    case 'polygon': {
      /**
       * A DERIVATION RESTATED ABOUT A POINT THAT EXISTS IS A CONSTRAINT ON IT (#1320, ADR-AG-144).
       *
       * Operator, 2026-09-21: *"can I define points A and point B and say that point M is [the
       * midpoint]?"* — where M is already the y-axis crossing, which is exactly what the 572 exam needs:
       * M carries TWO roles, and the equality of the two is what fixes the second line's direction.
       *
       * This is #1046's converse. That ruling made «M(3,c)» about an existing derived M a statement
       * rather than a name clash, and built the coordinate direction; the derived direction was left
       * as the clash, on the reading that "M is the centroid" after M exists is a second DEFINITION.
       * The exam says otherwise: stated about an existing point, a derivation is a CONDITION the figure
       * must meet, and refusing it loses a given. So it lowers to `derived-at`, whose residual is the
       * rule's own closed form — for EVERY `DerivedRule`, at the M1 boundary, so no rule has to learn
       * this and the midpoint is not special-cased. A stated point with coordinates gets the same
       * treatment: with nothing left to move, a false restatement is `unsatisfiable`, naming the
       * sentence (#1062's check, the verify half for free).
       *
       * Ordering is preserved, not hidden: the FIRST sentence about M still defines it, and this one
       * constrains it — «M אמצע AB» then «M נקודת החיתוך …» reads the other way and #1113's crossing rule
       * declares M, which is absorbed, then adds its incidences. Either order reaches the same figure.
       */
      if (f.t === 'derived') {
        const standing = objectById(c, f.id);
        // A name the TOOL offers (#1270, ADR-AG-184) never takes a letter that is already held, and is
        // never a condition on its holder: the default yields, and the figure is left as it was (M4).
        if (standing && f.auto) return { ok: true, effect: 'known', next: c };
        // The SAME derivation restated is absorbed, as it always was (#1045) — a condition that repeats
        // the definition adds nothing and must not count as a new given.
        if (standing && standing.kind === 'derived' && sameReference(standing, f)) {
          return { ok: true, effect: 'known', next: c };
        }
        if (standing && isPositional(standing)) {
          return applyFact(c, { t: 'constraint', k: { t: 'derived-at', id: f.id, rule: f.rule }, src: f.src });
        }
      }
      const refs =
        f.t === 'derived' ? parentsOf(f.rule) : f.t === 'segment' ? [f.a, f.b] : f.vertices;

      /**
       * A rule may name a CURVE as its parent (#1059), and that reference is checked here for the
       * same reason the point references are: «מעגל O שמשוואתו …» minting a centre of a circle the
       * figure does not have would be a point defined in terms of nothing.
       */
      for (const curveRef of f.t === 'derived' ? curveParentsOf(f.rule) : []) {
        const o = objectById(c, curveRef);
        // A centre names an equation curve; a touch point names two circles of any construction (#1504), and
        // a side's touch point one circle of any construction (#1619 B2).
        const anyCircle = f.t === 'derived' && (f.rule.t === 'touch-point' || f.rule.t === 'side-touch');
        // A foot is dropped onto any LINE object — stated by its equation, constructed, a tangent (#1620, ADR-AG-207).
        const anyLine = f.t === 'derived' && f.rule.t === 'foot';
        const ok = anyCircle ? !!o && curveKindOf(o) === 'circle' : anyLine ? !!o && curveKindOf(o) === 'line' : !!o && o.kind === 'curve';
        if (!ok) {
          return { ok: false, error: unknownRef(c, curveRef) };
        }
      }

      /**
       * DECLARATION vs REFERENCE — the distinction #1017 turns on, and it is not a softening of
       * #1028's `unknown-reference` refusal.
       *
       * «M אמצע AB» REFERS to `A` and `B`: inventing them would place positions the question never
       * gave ([ADR-052](../../docs/06-decisions.md#adr-052)) and spend letters the student is about
       * to use ([ADR-297](../../docs/06-decisions.md#adr-297)). It still refuses.
       *
       * «משולש ABC» **introduces** `A`, `B` and `C` — that is what a shape noun is for. The honest
       * answer is a vertex with two free degrees of freedom: drawn somewhere, moving under «הציגו
       * תצורה אחרת», counted in the DOF cue. Refusing here would make the student place three points
       * before they could name the triangle, which inverts how every exam sentence is written.
       *
       * **Segments moved to the declaration side** (#1074). They sat with the references on the
       * reading that «הקטע AB» is about points under discussion — and the operator's ruling on
       * «הישר AB» (2026-09-15: *"introduce them with dof"*) settles the general question the other
       * way: NAMING a thing introduces its points, REFERRING to one does not. «הקטע EF» names a
       * segment; «M אמצע AB» refers to two points while naming a third. #1028's refusal is
       * untouched, and the tests that lock it are all midpoint tests, which is the distinction
       * showing through.
       *
       * Refusing here forced a student to place both endpoints before they could name the segment,
       * which inverts how every exam sentence is written — the same argument that made a shape noun
       * introduce its vertices.
       */
      // A segment a sentence draws while REFERRING to its ends (`ref`, #1639) introduces nothing.
      const declares = f.t === 'polygon' || (f.t === 'segment' && !f.ref);
      let base = c;
      for (const id of refs) {
        const o = objectById(base, id);
        if (o && isPositional(o)) continue;
        if (o) {
          return {
            ok: false,
            error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(o) },
          };
        }
        if (!declares) {
          // Named in the student's own words, never as internal state: the message says WHICH point.
          return { ok: false, error: unknownRef(c, id) };
        }
        base = { ...base, objects: [...base.objects, { kind: 'free', id }] };
      }
      c = base;

      /*
       * A SEGMENT OVER A SIDE THE FIGURE ALREADY DRAWS IS THAT SIDE (#1639, ADR-AG-198) — one edge on the page,
       * #1407's `edgesAt` rule. Every sentence that names a pair now draws it, so «AB ∥ CD» in a parallelogram
       * names two sides that are already there: it draws nothing new, and the line is judged on what it states.
       */
      if (f.t === 'segment' && !objectById(c, f.id) && isPolygonSide(c, f.a, f.b)) return { ok: true, effect: 'known', next: c };

      const found = priorOf(c, f);
      if (found && 'clash' in found) {
        return {
          ok: false,
          error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(found.prior) },
        };
      }
      const prior = found?.same;
      if (prior) {
        // M1: restating the same construction is absorbed — no duplicate row, no re-creation. This
        // is what lets a later section of a question name what an earlier one established.
        if (sameReference(prior, f)) {
          /**
           * A restatement may still TELL US WHAT THE RING IS (#1049).
           *
           * «מרובע ABCD» then «דלתון ABCD» is the same ring — the id is identical — and the second
           * sentence is not a duplicate: it says the quadrilateral is a kite, which is what makes
           * «האלכסון הראשי» meaningful later. The constraints the noun carries arrive as their own
           * facts and are absorbed or not on their own merits; this only records the naming.
           *
           * One-way, like every other promotion here: a later «מרובע ABCD» does not un-kite it.
           */
          const moreSpecific =
            f.t === 'polygon' &&
            !!f.noun &&
            !isGenericNoun(f.noun) &&
            prior.kind === 'polygon' &&
            (!prior.noun || isGenericNoun(prior.noun));
          if (moreSpecific) {
            return {
              ok: true,
              effect: 'narrowed',
              next: {
                ...c,
                objects: c.objects.map((o) => (o.id === f.id ? { ...prior, noun: f.noun } : o)),
              },
            };
          }
          return { ok: true, effect: 'known', next: c };
        }
        return { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }

      /**
       * ONE POSITION, ONE NAME (#1153) — the invariant, at the figure rather than in one rule.
       *
       * Measured before this: «P מרכז המעגל I» · «O מרכז המעגל I» · «T מרכז המעגל I» left
       * THREE points stacked at (3,4) with no fault — the class #1113 already reported once and #1126
       * measured again on curves. Putting the check in the centre rule would be the patch shape and
       * would guarantee a fourth occurrence, so it sits where EVERY derived naming is minted: the
       * seven `DerivedRule` kinds (midpoint, centroid, incentre, orthocentre, circumcentre, diagonals,
       * circle-centre) all pass through here.
       *
       * The test is STRUCTURAL, not positional: two objects deriving the same thing the same way ARE
       * the same point, exactly and with no tolerance. That also scopes it correctly — «A(3,4)» and
       * «B(3,4)» are two independent statements that merely coincide, which is a different question
       * and deliberately NOT answered here (see the ADR; escalated to the operator).
       */
      if (f.t === 'derived') {
        const holder = c.objects.find(
          (o) => o.kind === 'derived' && o.id !== f.id && sameDerivation(o.rule, f.rule),
        );
        if (holder) {
          return { ok: false, error: { code: 'already-named', detail: f.src, holder: statedName(holder.id) } };
        }
      }

      const made: GeoObject =
        f.t === 'derived'
          ? { kind: 'derived', id: f.id, rule: f.rule }
          : f.t === 'segment'
            ? { kind: 'segment', id: f.id, a: f.a, b: f.b }
            : { kind: 'polygon', id: f.id, vertices: f.vertices, noun: f.noun };
      return { ok: true, effect: 'created', next: { ...c, objects: [...c.objects, made] } };
    }
  }
}

/**
 * Do an existing reference object and a restating fact say the same thing?
 *
 * The answer differs by kind, and the reason is where the DEFINITION lives:
 *
 *  - a **segment** and a **polygon** carry a canonical id — `seg-` over the sorted endpoints,
 *   `poly-` over the smallest rotation/reflection of the vertex ring — so the id *is* the
 *   definition. Two of them sharing an id are the same figure by construction, and «משולש ABC» /
 *   «משולש ACB» must absorb rather than conflict. A comparison of the raw vertex order here would
 *   reject the same triangle written the other way round;
 *  - a **derived** point's id is the letter the STUDENT chose, which says nothing about the rule, so
 *   `M אמצע AB` and `M אמצע AC` genuinely conflict and the rule has to be compared.
 *
 * Caller has already established that the ids match.
 */
function sameReference(prior: GeoObject, f: Fact): boolean {
  if (prior.kind === 'derived' && f.t === 'derived') {
    return JSON.stringify(prior.rule) === JSON.stringify(f.rule);
  }
  return prior.kind === 'segment' || prior.kind === 'polygon';
}

/** Replace every `{ kind: 'sym', name: sym }` inside `x` with `value` — a structural substitution. */
function substituteSym<T>(x: T, sym: string, value: Expr): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.kind === 'sym' && o.name === sym && Object.keys(o).length === 2) return value;
      return Object.fromEntries(Object.entries(o).map(([k, w]) => [k, walk(w)]));
    }
    return v;
  };
  return walk(x) as T;
}

/** Two lines as homogeneous triples: the same line when the triples are proportional. */
function sameLineTriple(u: [number, number, number], v: [number, number, number]): boolean {
  const nu = Math.hypot(...u);
  const nv = Math.hypot(...v);
  if (nu < 1e-12 || nv < 1e-12) return false;
  const cross = (i: number, j: number) => u[i] * v[j] - u[j] * v[i];
  return Math.max(Math.abs(cross(0, 1)), Math.abs(cross(0, 2)), Math.abs(cross(1, 2))) <= 1e-9 * nu * nv;
}

function pickTighter(
  a: number | undefined,
  b: number | undefined,
  choose: (x: number, y: number) => number,
): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return choose(a, b);
}

/**
 * Two equations describe the same curve when their conic coefficient vectors are PROPORTIONAL —
 * `2x+4y−6=0` and `x+2y−3=0` are one line, and the exam restates in whichever scaling reads best.
 * Compared at parameter probes, like `sameNumbers`, for the same reason.
 */
function sameCurve(a: Curve, b: Curve): boolean {
  // Same rule as the clash above (#1037): two DIFFERENT claimed families are different curves, but
  // an unclaimed family agrees with whatever the other one claimed. Identity is the equation; the
  // kind is an expectation the classifier will settle either way.
  if (a.kind && b.kind && a.kind !== b.kind) return false;
  return PROBE_ENVS.every((env) => {
    const ka = fitConic(a.eq, env);
    const kb = fitConic(b.eq, env);
    if (!ka || !kb) return false;
    const va = [ka.A, ka.B, ka.C, ka.D, ka.E, ka.F];
    const vb = [kb.A, kb.B, kb.C, kb.D, kb.E, kb.F];
    const na = Math.hypot(...va);
    const nb = Math.hypot(...vb);
    if (na < 1e-12 || nb < 1e-12) return false;
    // Proportional up to sign: |cos| between the two coefficient vectors is 1.
    const dot = va.reduce((s, x, i) => s + (x / na) * (vb[i] / nb), 0);
    return Math.abs(Math.abs(dot) - 1) <= 1e-9;
  });
}

/**
 * IS THIS THE SAME CURVE OBJECT? — a STRICTER question than `sameCurve`'s (#1342).
 *
 * `sameCurve` answers *"does the student's restatement contradict what this id already holds?"*, and it
 * is only ever asked of a curve whose id ALREADY matched. Its `|cos|` test is right for that: it is
 * comparing two spellings of one object, so it only has to survive floating-point noise.
 *
 * Scanning the whole figure for a twin is a different question, and `|cos|` is the wrong instrument
 * for it — it is QUADRATIC near 1, so it squashes genuine differences into the noise band. Measured:
 *
 * ```
 *   2x-y+8=0   vs  y=2x+8           0            same line, two spellings
 *   x-y=0      vs  y=x              2.2e-16      same line, machine epsilon
 *   y=x        vs  y=1.000001x      1.25e-13     DIFFERENT lines, 1e-6 apart in slope
 *   y=0        vs  y=0.00001x       5.0e-11      DIFFERENT lines (#1235's own rows)
 * ```
 *
 * Three orders of margin, on a metric that shrinks the thing being measured — and [#1235](https://github.com/dcodish/geo_builder/issues/1235)
 * has already RULED that lines this close are distinct and must offer a crossing ring. So the twin scan
 * compares the NORMALIZED coefficient vectors component by component, resolved for sign, which is
 * LINEAR in the difference: the same pairs then read 1e-16 against 7e-7 and 1e-5 — nine orders of
 * margin instead of three, and #1235's ruling is untouched because `sameCurve` is not modified.
 */
const IDENTICAL_COEF_TOL = 1e-12;

function identicalCurve(a: Curve, b: Curve): boolean {
  if (a.kind && b.kind && a.kind !== b.kind) return false;
  return PROBE_ENVS.every((env) => {
    const ka = fitConic(a.eq, env);
    const kb = fitConic(b.eq, env);
    if (!ka || !kb) return false;
    const va = [ka.A, ka.B, ka.C, ka.D, ka.E, ka.F];
    const vb = [kb.A, kb.B, kb.C, kb.D, kb.E, kb.F];
    const na = Math.hypot(...va);
    const nb = Math.hypot(...vb);
    if (na < 1e-12 || nb < 1e-12) return false;
    const ua = va.map((x) => x / na);
    const ub = vb.map((x) => x / nb);
    // An equation and its negation are one curve, so the sign of the whole vector is free — resolve it
    // from the dominant component rather than trying both and hoping.
    const lead = ua.reduce((best, x, i) => (Math.abs(x) > Math.abs(ua[best]) ? i : best), 0);
    const sign = ua[lead] * ub[lead] < 0 ? -1 : 1;
    return ua.every((x, i) => Math.abs(x - sign * ub[i]) <= IDENTICAL_COEF_TOL);
  });
}

export interface FoldResult {
  construction: Construction;
  /** Per-fact outcome, positionally — the fact list renders refusals in place. */
  errors: Array<ApplyError | null>;
  /**
   * Per-fact EFFECT, positionally — what each statement actually did (#1045).
   *
   * Parallel to  and  wherever that is non-null, so a caller reads exactly one of
   * the two for any fact. Carried out of the fold because the decision belongs to  and
   * every surface that reports it — the fact list, the counter, the notice — must read the same
   * answer rather than each re-deriving one.
   */
  effects: Array<LineEffect | null>;
  /** Per construction constraint, the index of the FACT that added it — see `fold` (#1079). */
  constraintFact: number[];
  /** Per construction selector, the index of the FACT that added it (#1619 B1) — `constraintFact`'s twin. */
  selectorFact: number[];
  /** Per-fact NOTICE, positionally (#1350) — what a statement that landed should tell the student. */
  notices: Array<ApplyNotice | null>;
}

/**
 * The replay fold: facts in, figure-defining construction out. Pure over the ordered list.
 *
 * `groupOf[i]` is the LINE each fact came from (`derive`'s `owner`); a caller with no lines treats
 * every fact as its own line. Two things happen beyond the in-order pass (#1242, ADR-AG-133):
 *
 * 1. **Deferral, to a fixpoint.** A fact that failed at its position is retried against
 *    the completed construction until nothing more lands — «AD גובה לצלע BC» typed before «משולש ABC»
 *    fails only because `B` and `C` do not exist YET, and once the triangle declares them the two
 *    constraints hold exactly as they do in the other order. The 2-D twin is ADR-104, and the operator's
 *    ruling is the same sentence in both products: *the diagram should either respect all input or
 *    refuse to build.* A genuinely unresolvable reference keeps failing and keeps its error.
 *
 *    #1340 (ADR-AG-156, the analytic half of ADR-W-089): the retry takes EVERY failed fact whose
 *    re-apply now succeeds, creating or not. It used to take only the kinds that create nothing (a
 *    `NON_CREATING` list), so «M אמצע AB» typed above «A(0,0)» · «B(4,0)» stayed red while the
 *    crossing typed above its lines built. The list carried ADR-104's stranding limit, which belongs to
 *    the IN-ORDER pass (a creating fact moved later would leave the facts between seeing a figure
 *    without its object); it cannot occur here, because a fact that referenced the new object before
 *    it existed is itself failed and is retried after it, in list order, pass after pass. ADR-AG-013
 *    still holds: an object can only land once every object it references exists, so the construction
 *    stays in dependency order and evaluation still needs no topological sort.
 * 2. **The LINE is the unit of application.** If any fact of a line still fails after the fixpoint,
 *    NONE of that line's facts survive: the fold re-runs without that line, and every one of its facts
 *    carries the line's error. Before this a line lowering to five facts could land three and drop two,
 *    leaving a segment `AD` on the canvas that asserted nothing in a row that read as accepted. Removing
 *    a line can strand a later line that leaned on its partial objects, so this too runs to a fixpoint
 *    (the atomic-group poisoning of the 2-D fold). A clean list pays exactly one pass.
 */
export function fold(facts: readonly Fact[], groupOf?: readonly number[]): FoldResult {
  const group = groupOf ?? facts.map((_, i) => i);
  const excluded = new Map<number, ApplyError>(); // line → the error that faulted it
  for (;;) {
    const r = foldPass(facts, (i) => !excluded.has(group[i]), group);
    let newly = 0;
    r.errors.forEach((e, i) => {
      if (e && !excluded.has(group[i])) {
        excluded.set(group[i], e);
        newly++;
      }
    });
    if (newly === 0) {
      // Every fact of a faulted line carries the line's error, so a per-line rollup sees one refusal
      // and a positional reader sees no fact of that line as having landed.
      facts.forEach((_, i) => {
        const e = excluded.get(group[i]);
        if (e) {
          r.errors[i] = e;
          r.effects[i] = null;
          r.notices[i] = null;
        }
      });
      return r;
    }
  }
}

/** One fold over the facts `include` admits: the in-order pass, then the deferral fixpoint. */
function foldPass(facts: readonly Fact[], include: (i: number) => boolean, group?: readonly number[]): FoldResult {
  let c = EMPTY_CONSTRUCTION;
  const errors: Array<ApplyError | null> = facts.map(() => null);
  const effects: Array<LineEffect | null> = facts.map(() => null);
  const notices: Array<ApplyNotice | null> = facts.map(() => null);
  /**
   * Which FACT put each constraint in the construction (#1079).
   *
   * Recorded HERE, where constraints are applied, rather than read off the parser’s facts — which
   * is what `derive` used to do, and why a constraint synthesised inside `applyFact` could not be
   * blamed on any line. Four sentence kinds build their constraints at M1 because only M1 knows
   * what they refer to («זווית B ישרה», «שטח הדלתון הוא 24», «אלכסוני המרובע נפגשים בנקודה O»,
   * «משוואת האלכסון הראשי»), and every one of them was therefore unreportable: an unsatisfiable
   * given was DETECTED and silently dropped, and the figure was shown contradicting it.
   *
   * Comparing the CONSTRUCTION before and after each fact covers a nested apply without knowing
   * anything about it, so a future resolved reference is attributed with nothing to remember.
   */
  const constraintFact: number[] = [];
  // The same attribution for SELECTORS (#1619 B1): a region («מחוץ למעגל») is a selector M1 builds from a
  // contextual fact, so the line that stated it can only be found from the construction, as for constraints.
  const selectorFact: number[] = [];
  const commit = (i: number, next: Construction, effect: LineEffect, notice?: ApplyNotice) => {
    const before = c.constraints;
    const beforeSel = c.selectors;
    c = next;
    // Appended AND replaced: #1049’s choice collapse swaps a constraint in place, and the
    // replacement belongs to the line that named the seat, not to the line that opened it.
    c.constraints.forEach((k, at) => {
      if (before[at] === k && constraintFact[at] !== undefined) return;
      constraintFact[at] = i;
    });
    c.selectors.forEach((s, at) => {
      if (beforeSel[at] === s && selectorFact[at] !== undefined) return;
      selectorFact[at] = i;
    });
    errors[i] = null;
    effects[i] = effect;
    notices[i] = notice ?? null;
  };
  facts.forEach((f, i) => {
    if (!include(i)) return;
    const out = applyFact(c, f);
    if (out.ok) commit(i, out.next, out.effect, out.notice);
    else errors[i] = out.error;
  });
  // The deferral fixpoint: retry every still-failed fact — creating or not (#1340) — against the construction the
  // later facts completed. Bounded by the fact count; a pass that lands nothing ends it. A fact is not
  // retried against the very construction it last failed on (nothing changed, so nothing can differ).
  const failedOn = new Map<number, Construction>();
  const fixpoint = () => {
    for (let pass = 0; pass < facts.length; pass++) {
      let progressed = false;
      facts.forEach((f, i) => {
        if (!include(i) || !errors[i]) return;
        if (failedOn.get(i) === c) return;
        const out = applyFact(c, f);
        if (out.ok) {
          commit(i, out.next, out.effect, out.notice);
          progressed = true;
        } else {
          errors[i] = out.error;
          failedOn.set(i, c);
        }
      });
      if (!progressed) break;
    }
  };
  fixpoint();
  /*
   * THE LAST RESORT: A BARE RELATION INTRODUCES ITS NEW LETTERS (#1670, ADR-AG-210; operator 2026-10-02 — "accept new
   * letter with same logic the 2d tool has"). Only once nothing else can define them — the in-order pass and the deferral
   * fixpoint have run, so a letter a later line defines («M אמצע AB» typed above «A(0,0)») is still defined there and
   * every figure that built before builds identically. The first still-failing fact (list order) of a form 2-D mints for
   * (`mintedByReference`) gets its missing points as free points (ADR-052: drawn somewhere, moving with the seed), and the
   * fixpoint runs again for the facts that leaned on them. They are minted beside a circle whose centre has no letter too (operator 2026-10-02, #1686: *"create a segment BO where B
   * is where we know it is and O is free. if the user wants it to be the center, he can write next sentance that O is the
   * center"*) — a later «O מרכז המעגל» / «OB רדיוס» places it (`derived-at`, `applyRoleOf`).
   */
  const lineOf = (i: number) => (group ? group[i] : i);
  const tried = new Set<number>();
  for (let guard = 0; guard < facts.length; guard++) {
    let minted = false;
    for (let i = 0; i < facts.length && !minted; i++) {
      if (!include(i) || !errors[i] || tried.has(lineOf(i))) continue;
      const line = lineOf(i);
      tried.add(line);
      // The LINE decides (2-D mints per sentence): every fact of it still failing is a reference to a missing point,
      // and is either a minting form or the piece/selector the sentence draws beside it. «AD גובה לצלע BC» names a
      // SIDE — its `perpendicular` half is no minting form, so B and C stay refused, as in 2-D.
      const failing = facts.map((f, j) => ({ f, j })).filter(({ j }) => include(j) && errors[j] && lineOf(j) === line);
      const allRefs = failing.every(({ j }) => errors[j]!.code === 'unknown-reference' && refKindOf(errors[j]!.detail) === 'point');
      const missing = [...new Set(failing.flatMap(({ f }) => mintedByReference(f)))].filter((id) => !objectById(c, id));
      const formed = failing.every(({ f }) => mintedByReference(f).length > 0 || isMintCompanion(f));
      if (!allRefs || !formed || missing.length === 0 || !failing.every(({ j }) => missing.includes(errors[j]!.detail))) continue;
      let next: Construction = { ...c, objects: [...c.objects, ...missing.map((id): GeoObject => ({ kind: 'free', id }))] };
      // An area LABEL names its region (#1622 E5, ADR-AG-221): the ring is drawn with its new letters, as a noun draws
      // its own — the polygon the area is OF, so its points stay a simple ring the area can be read on.
      let ringsDrawn = true;
      for (const { f } of failing) {
        const ring = areaLabelRing(f);
        if (!ring || objectById(next, polygonIdOf(ring))) continue;
        const out = applyFact(next, { t: 'polygon', id: polygonIdOf(ring), vertices: ring, src: f.src });
        if (!out.ok) {
          ringsDrawn = false;
          break;
        }
        next = out.next;
      }
      if (!ringsDrawn) continue;
      const landed: Array<{ j: number; out: Extract<ApplyOutcome, { ok: true }> }> = [];
      for (const { f, j } of failing) {
        const out = applyFact(next, f);
        if (!out.ok) break;
        landed.push({ j, out });
        next = out.next;
      }
      if (landed.length !== failing.length) continue;
      for (const { j, out } of landed) commit(j, out.next, j === landed[0].j ? 'created' : out.effect, out.notice);
      minted = true;
    }
    if (!minted) break;
    fixpoint();
  }
  return { construction: c, errors, effects, constraintFact, selectorFact, notices };
}

/**
 * What a sentence that mints may carry beside its minting fact (#1670): its named pieces, a selector, a declaration, and a
 * length given about the same letters — «C מחלקת את AB ביחס 3:2» places C ON AB (that mints, as in 2-D) and its ratio
 * rides along, where «AB:BC = 2:3» alone has no minting fact and stays refused, as in 2-D.
 */
const MINT_COMPANIONS: ReadonlySet<Fact['t']> = new Set<Fact['t']>(['segment', 'line-2pt', 'extent-of', 'selector', 'declare']);
const isMintCompanion = (f: Fact): boolean => MINT_COMPANIONS.has(f.t) || (f.t === 'constraint' && f.k.t === 'length-eq');

/** A length side 2-D mints for: a number, or segments ADDED with no coefficient («AB», «AB + BC», «5») — not «2CD», «AB:BC». */
function plainLengthSide(e: Expr): boolean {
  if (!symbolsOf(e).some(isTermPlaceholder)) return true;
  if (e.kind === 'sym') return true;
  return e.kind === 'add' && plainLengthSide(e.a) && plainLengthSide(e.b);
}

/**
 * THE FORMS WHOSE NEW LETTERS ARE MINTED (#1670, ADR-AG-210) — measured on 2-D's `decideDeterministic2D`, which mints a
 * letter wherever its lowering DRAWS a segment through it: «BD⊥AC», «AB∥CD» and every spelling of the two (the pair
 * operands of `relation`); «AB = CD», «AB = 5», «AB + BC = 10» (plain lengths); «זווית ABC = 30» (the arms);
 * «M אמצע AB» (the parents); «E על AB», «AB חותך את CD בנקודה E» (the carrier pair); «AB משיק למעגל C» (the tangent
 * pair). 2-D REFUSES «AB = 2CD», «AB:BC = 2:3», «C מחלקת את AB ביחס 3:2», the angle bisector and a cevian to a side no
 * shape has («AD גובה לצלע BC» — its `perpendicular` half is no minting form), so they keep #1028's refusal here.
 * The ids a fact would mint; `[]` for every other fact. Which LINE mints is decided in `foldPass`, over all its facts.
 */
function mintedByReference(f: Fact): Id[] {
  if (f.t === 'derived') return f.rule.t === 'midpoint' ? [f.rule.a, f.rule.b] : [];
  // An ORDER (#1621 D3, ADR-AG-216) mints as its equality twin does: 2-D draws «AB < BC»'s two segments, «AB ≤ 10»'s
  // one, and «זווית ABC קהה»'s two arms, minting their letters — the plain lengths and the angles, never «2AB < CD».
  if (f.t === 'selector') return f.sel.kind === 'sign' && f.sel.q.k === 'order' ? orderMints(f.sel.q.left, f.sel.q.right) : [];
  if (f.t === 'tangent-of') return (f.lines ?? []).flatMap((l) => (l.kind === 'points' ? [l.a, l.b] : []));
  if (f.t !== 'constraint') return [];
  const k = f.k;
  switch (k.t) {
    case 'relation':
      return k.u.k === 'points' && k.v.k === 'points' ? [k.u.a, k.u.b, k.v.a, k.v.b] : [];
    case 'length-eq': {
      const ring = areaLabelRing(f);
      if (ring) return ring;
      const pairs = [...k.left.terms, ...k.right.terms];
      const plain = pairs.every((t) => t.kind === undefined || t.kind === 'length') && plainLengthSide(k.left.expr) && plainLengthSide(k.right.expr);
      return plain ? lengthRefs(k.left).concat(lengthRefs(k.right)) : [];
    }
    case 'angle':
      return [k.at.v, k.at.a, k.at.b];
    // «זוית AEB שווה לזווית BEC» — two angles' arms, as 2-D draws them (#1622, ADR-AG-218).
    case 'angle-ratio':
      return [k.left, k.right].flatMap((r) => (isAngleRef(r) ? [r.v, r.a, r.b] : []));
    case 'on-line-2pt':
      return [k.a, k.b];
    default:
      return [];
  }
}

/**
 * THE RING AN AREA LABEL NAMES (#1622 E5, ADR-AG-221) — «נסמן את שטח ABCD ב-S», i.e. «שטח ABCD = S»: one area on one
 * side and a lone symbol on the other. 2-D commits that label on an empty canvas (its `measure-area` on a variable,
 * binding when the shape comes) and introduces nothing. Analytic holds no statement about points it does not have, so
 * the label introduces what it names — the quadrilateral ABCD — exactly as «AB = 5» introduces A and B (ADR-AG-210):
 * free vertices (ADR-052) and the ring they are the area of. Only the LABEL: 2-D REFUSES an area VALUE about unknown
 * points («שטח המשולש ABC הוא 13», «S_{XYZ} = S_{ABC}» — measured), so those keep #1028's refusal here.
 */
function areaLabelRing(f: Fact): Id[] | null {
  if (f.t !== 'constraint' || f.k.t !== 'length-eq') return null;
  const { left, right } = f.k;
  const lone = (s: typeof left) => s.terms.length === 0 && s.expr.kind === 'sym' && !isTermPlaceholder(s.expr.name);
  const area = (s: typeof left) => s.terms.length === 1 && s.terms[0].kind === 'area' && s.expr.kind === 'sym';
  const side = area(left) && lone(right) ? left : area(right) && lone(left) ? right : null;
  const term = side?.terms[0];
  return term && term.kind === 'area' ? [...term.ids] : null;
}
const polygonIdOf = (ring: readonly Id[]): Id => `poly-${ring.join('')}`;

/** The letters an order's two sides mint (`mintedByReference`): each side a value, a plain length, or an angle — else none. */
function orderMints(...sides: OrderSide[]): Id[] {
  const ids: Id[] = [];
  for (const o of sides) {
    if (o.t === 'angle') ids.push(o.at.v, o.at.a, o.at.b);
    else if (o.t === 'length') {
      const plain = o.le.terms.every((t) => t.kind === undefined || t.kind === 'length') && plainLengthSide(o.le.expr);
      if (!plain) return [];
      ids.push(...lengthRefs(o.le));
    }
  }
  return ids;
}

/**
 * A domain in comparable form — see the `narrowed` vs `known` decision in `applyFact`.
 *
 * Spelled out rather than comparing the objects directly because the merge builds a fresh object
 * with the same keys in a different order, and `exclude` accumulates duplicates that mean nothing.
 */
function normalizeDomain(d: Domain): Record<string, unknown> {
  return {
    min: d.min ?? null,
    max: d.max ?? null,
    minOpen: d.minOpen ?? false,
    maxOpen: d.maxOpen ?? false,
    exclude: [...new Set(d.exclude ?? [])].sort((a: number, b: number) => a - b),
  };
}

/**
 * Does the figure already hold a SEGMENT over the two points a curve id names (#1234)?
 *
 * `line-CE` and `seg-CE` are different ids by design, so the twin is not a collision the id space
 * catches. The question the bare «משוואת CE היא …» actually asks is whether the student has already
 * given `CE` an extent, and a drawn segment over `C` and `E` is that answer whatever its own id
 * happens to be — so the endpoints are compared, never the string.
 */
function segmentOverSameEnds(c: Construction, curveId: Id): boolean {
  const m = /^line-([A-Z][0-9₀-₉]?)([A-Z][0-9₀-₉]?)$/.exec(curveId);
  if (!m) return false;
  const [, a, b] = m;
  return c.objects.some(
    (o) => o.kind === 'segment' && ((o.a === a && o.b === b) || (o.a === b && o.b === a)),
  );
}
