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
import { FAMILIES_OF, positionOfCircles, type PairPosition } from './commonTangents';
import { angleLabelName, isTermPlaceholder, lengthRefs, parseLengthExpr, type LengthExpr, type MeasureTerm, type RoleEnd } from './lengths';
import { curveParentsOf, parentsOf, sameEllipseRole, type DerivedRule, type EllipseRole, type FootLine } from './derived';
import { sameDerivation } from './sameDerivation';
import { isHelperId } from './toolLetters';
import { constraintCurveRefs, constraintRefs, dirCurveRefs, dirRefs, isAngleRef, resolveChoices, sameConstraint, sineAngle, type AngleName, type AngleRef, type CircleSide, type Constraint, type Direction, type TangentLineRef } from './solve';
import { displacedAssumption, isGenericNoun, namesOption, normalizeShapeNoun, nounOfKind, nounsExclude, quadKindOf, promisesOneParallelPair, rightAngleAt, ringsNamed, sameStatementUnder, shapeRow } from './shapes';
import { evalExpr, symbolsOf, type Env, type Expr } from './expr';
import { declaredKindOf, kindImpliesInEveryReading, kindRelation, type NarrowKind } from '../../shell/narrowing';
import { measureRestatement } from './statedMeasures';
import { RADIUS_CAPITALS, RESERVED_SYMBOLS, emptyDomain, paramRegister, positivePart, radiusSymbol, sizeContradiction, sizeLetters, toolSymbol, usedSymbols, directionSymbol } from './carriers';
import { drawnPieceOver, isPolygonSide } from './extent';
import { cevianFacts, measureFacts, onBisectorFacts, segmentIdOf, toolFootFacts, toolFootRule } from './cevian';
import { followObjects, isoscelesKeys, roleVertexOf } from './roles';
import {
  CENTRE_SENTINEL,
  ELLIPSE_ROLE_SENTINELS,
  CENTRES_SENTINELS,
  ROLE_SIDE_SENTINELS,
  CIRCLE_SENTINEL,
  CIRCLE_SLOT_SENTINELS,
  UNBOUNDED,
  EMPTY_CONSTRUCTION,
  inDomain,
  circleDefPoints,
  curveByName,
  factsWithin,
  diameterCircleId,
  incircleId,
  isPositional,
  namesObject,
  objectById,
  tangentLineId,
  type ConicHost,
  type Construction,
  type Curve,
  type CurveObject,
  type Domain,
  type EqOperand,
  type Fact,
  type Selector,
  type ArcDef,
  type GeoObject,
  type Id,
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
   * A HEIGHT STATED AS A MAGNITUDE ON A SHAPE WITH SEVERAL HEIGHTS (#1737, ADR-AG-265; 2-D's ADR-575) — «גובה המשולש
   * 4», «גובה המקבילית הוא 4»: which one is the student's to say (ADR-052), so it is ASKED, `options` the sentences
   * that each build, carrying the student's own connective and value.
   */
  | 'ambiguous-height'
  /** «גובה הטרפז 4» in a figure with no trapezoid (#1737, ADR-AG-265; 2-D's `shape-not-found`) — `shape` the noun. */
  | 'shape-not-found'
  /**
   * «האלכסון AB …» where AB is a SIDE of the polygon holding both letters (#1737, ADR-AG-265; 2-D's ADR-569 check),
   * or of a triangle, which has no diagonals — `polygon` the ring, `pair` the letters.
   */
  | 'diagonal-is-side'
  | 'diagonal-none-here'
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
   * A NOUN NO CIRCLE PASSES AROUND, AND AN INSCRIPTION, IN TWO SENTENCES (#1918, ADR-AG-252; operator ruling
   * 2026-10-08 "Refuse in both"). «טרפז ישר זווית ABCD» · «ABCD חסום במעגל», in either order: the second statement is
   * refused naming both — the one-sentence form's refusal (`inscribed-contradicts-noun`, ADR-AG-198) reached across
   * sentences. `shape`/`forced` are registry keys (`notCyclic`), `ring` the polygon's id; `derive` adds the other
   * sentence.
   */
  | 'inscribed-contradicts-declared'
  /**
   * A RING RE-DECLARED AS A SHAPE ITS NOUN EXCLUDES (#1926, ADR-AG-260; ported from 2-D's ADR-157, the wording 3-D's
   * #1918 ships): «מקבילית ABCD» · «טרפז ABCD», in either order. `actual` is the ring's noun, `stated` the refused
   * line's — both registry keys. Decided by `nounsExclude`, never a listed pair.
   */
  | 'shape-excluded'
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
  /**
   * A LINE THE FIGURE ALREADY DRAWS, RESTATED UNDER A NEW NAME (#2584, ADR-AG-346; operator ruling 2026-10-27, T32: *"it
   * should refuse to draw second line and say that already exists and offer to rename the line"*). `twin` is the drawn
   * line, `lineName` the name the student typed; the submit path names the row that drew it and offers the naming sentence.
   */
  | 'line-exists'
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
   * #2115 (ADR-AG-299; 2-D's ADR-643 §4) — a bisector named by a SIDE of a declared polygon at the angle's vertex
   * («משולש ABC» · «AB חוצה זווית»): `pair` is the side as typed, `vertex` the angle's vertex, `polygonKind` the host.
   */
  | 'bisector-is-side'
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
   * «תיכון לבסיס» / «גובה לשוק» where no single polygon gives the role a side (#2018, ADR-AG-298): a plain triangle,
   * an equilateral one, a trapezoid (2-D reads the role on a triangle only), none, or several. 2-D's `clarify`
   * (`input.roleSideUnresolved`), its sentence verbatim; `role` carries which role, for the locale to word.
   */
  | 'ambiguous-role-side'
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
  | 'coordinate-restriction'
  /** #2054 (ADR-AG-277): a second letter for an angle or a segment that already has one — `holder` is the first letter, `nameOf` the target as the line spells it. */
  | 'name-taken'
  /** #2061 (ADR-AG-277): the same letter with another coefficient for an angle or segment, or (#2105, ADR-AG-295) two different numbers — `what` is 2-D's reason clause. */
  | 'measure-contradicts'
  /** #2119 (ADR-684): a second, different radius for a circle whose radius a line already stated — `circle` is its id;
   *  `derive` names the line that sized it (2-D's ruled sentence, no reason clause). */
  | 'radius-contradicts'
  /** #2390 (ADR-AG-314): «כל המשיקים המשותפים» about a circle inside the other — 2-D's `tangentsExhaustedContained`. */
  | 'no-common-tangent'
  /**
   * #2388 (ADR-AG-307; operator ruling 2026-10-20, *"Detect the clash and refuse, naming both readings"*): the radius
   * capital `R` is a point AND the radius parameter in one figure. `holder` is the letter; `reading` is the reading the
   * figure held FIRST (`point` or `radius`); `derive` names the line that introduced it (`declared`).
   */
  | 'radius-letter-taken';

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
  /** For `inscribed-contradicts-declared` (#1918): the declared noun, the noun a circle would force, and the ring. */
  shape?: string;
  forced?: string;
  ring?: Id;
  /** For `shape-excluded` (#1926): the noun the ring is known as, and the noun the refused line stated (registry keys). */
  actual?: string;
  stated?: string;
  /** For `diagonal-is-side` / `diagonal-none-here` (#1737): the ring holding the pair, and the pair, as written. */
  polygon?: string;
  pair?: string;
  /** For `ambiguous-role-side` (#2018): the role the sentence named. */
  role?: 'base' | 'leg';
  /** For `name-taken` (#2054): the target as the refused line spells it (`ABC`, `AB`), and whether it is an angle or a segment. */
  nameOf?: string;
  nameKind?: 'angle' | 'length';
  /** For `measure-contradicts` (#2061): the refused measure, as 2-D's reason clause renders it («∠ABC = 3α»). */
  what?: string;
  /** For `name-taken` / `measure-contradicts`: the EARLIER constraint the line restates — `derive` maps it to its line. */
  against?: Constraint;
  /** For `radius-contradicts` (#2119): the circle whose stated radius the line contradicts. */
  circle?: Id;
  /** For `radius-letter-taken` (#2388): which reading of the letter the figure held first. */
  reading?: 'point' | 'radius';
  /** For `bisector-is-side` (#2115): the angle's vertex, and the host polygon's kind (`triangle`, `square`, `n4`, `n5`…). */
  vertex?: Id;
  polygonKind?: string;
  /** For `already-named` (#2584, ADR-AG-346): the holder is a LINE's name, so the message calls it a line. */
  holderKind?: 'line';
  /** For `line-exists` (#2584, ADR-AG-346): the drawn line, and the name the restatement gave it. */
  twin?: Id;
  lineName?: string;
}

/**
 * THE ONE VERDICT ON A LINE STATED AGAIN (#2584, ADR-AG-346). A sentence that builds a line the figure already holds — by
 * the same equation (`identicalCurve`) or the same construction (a `line-at` through the same point along the same
 * direction) — is judged by what it ADDS, never by its spelling, so both arms of `applyStatement` ask here:
 *
 * - no new name, or the line's own ⇒ `known` (2-D's «זה כבר קיים באיור»);
 * - a name over the TOOL's l-number ⇒ `rename` (#2425 Q3, ruled 2026-10-20, re-ruled 2026-10-27: *"it should rename
 *   the line but not create another line"*);
 * - a second name for a line the student named ⇒ `already-named`, naming the holder (#1164: *"it should refuse"*);
 * - a name for a DRAWN line that has none ⇒ `line-exists`: refused, with the naming sentence offered (T32, 2026-10-27);
 * - a name for a CARRIER (undrawn) ⇒ `rename`: the #1149 promotion, the line is drawn under the name.
 */
export type RestatedLine = 'known' | 'rename' | 'already-named' | 'line-exists';
export function restatedLine(held: string | undefined, tool: boolean, drawn: boolean, incoming: string | undefined): RestatedLine {
  if (!incoming || incoming === held) return 'known';
  if (held) return tool ? 'rename' : 'already-named';
  return drawn ? 'line-exists' : 'rename';
}

/** The figure's drawn `line-at` that IS this construction — the same point, the same direction, the same turn. */
function lineAtTwin(c: Construction, f: { through: Id; dir: Direction; perp: boolean }): Extract<GeoObject, { kind: 'line-at' }> | undefined {
  if (f.dir.k === 'free') return undefined; // a free direction is never the same construction twice
  const key = JSON.stringify(f.dir);
  return c.objects.find(
    (o): o is Extract<GeoObject, { kind: 'line-at' }> =>
      o.kind === 'line-at' && o.through === f.through && o.perp === f.perp && JSON.stringify(o.dir) === key && o.drawn !== false,
  );
}

/** How a found curve can be called in a sentence — its name, or (unnamed) its equation. */
function callable(o: GeoObject): string {
  if (o.kind === 'curve' && o.id.startsWith('curve-')) return o.label.eqSrc ?? '';
  if (o.kind === 'circle-thru' && o.name) return o.name;
  // A line built through a point (#1138): its name, or nothing a student could type for an unnamed one.
  if (o.kind === 'line-at') return o.name ?? (o.id.startsWith('curve-') ? '' : statedName(o.id));
  return statedName(o.id);
}

/** A line built through a point PARALLEL to a stated direction (#1138): «דרך E עובר ישר מקביל לציר ה-x». */
function isParallelLine(o: GeoObject): boolean {
  return o.kind === 'line-at' && !o.perp && o.dir.k !== 'free';
}

/** A PERPENDICULAR BISECTOR (#1138): a perpendicular line-at through the midpoint of the pair it is perpendicular to. */
function isPerpBisector(c: Construction, o: GeoObject): boolean {
  if (o.kind !== 'line-at' || !o.perp || o.dir.k !== 'points') return false;
  const { a, b } = o.dir;
  const mid = objectById(c, o.through);
  return !!mid && mid.kind === 'derived' && mid.rule.t === 'midpoint' && ((mid.rule.a === a && mid.rule.b === b) || (mid.rule.a === b && mid.rule.b === a));
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
    return merged && emptyDomain(merged) ? refuse : { ok: true, next: r.next };
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
 * #2115 ([ADR-AG-299](../../docs/06c-decisions-analytic.md#adr-ag-299); 2-D's `polygonSideHost`, ADR-643 §4) — the KIND
 * of a declared polygon whose ring has `a` and `b` as consecutive vertices: `triangle` for any three-ring, a named
 * quadrilateral's kind, else `n<arity>`. `third` (the angle's other arm) prefers a ring that holds it; else the first
 * ring in declaration order. Structure only — never coordinates. `null`: the pair is no polygon's side.
 */
const NAMED_QUAD_KINDS: ReadonlySet<string> = new Set(['square', 'rectangle', 'rhombus', 'parallelogram', 'kite', 'trapezoid', 'isosceles-trapezoid', 'right-trapezoid']);
function polygonSideKind(c: Construction, a: Id, b: Id, third: Id | null): string | null {
  let best: string | null = null;
  for (const o of c.objects) {
    if (o.kind !== 'polygon') continue;
    const ring = o.vertices;
    const i = ring.indexOf(a);
    if (i < 0 || (ring[(i + 1) % ring.length] !== b && ring[(i + ring.length - 1) % ring.length] !== b)) continue;
    const q = o.noun ? shapeRow(o.noun)?.kind : undefined;
    const kind = ring.length === 3 ? 'triangle' : ring.length === 4 && q && NAMED_QUAD_KINDS.has(q) ? q : `n${ring.length}`;
    if (third === null || ring.includes(third)) return kind;
    best ??= kind;
  }
  return best;
}

/** The side refusal (#2115): the segment as the student typed it, the angle's vertex, the host's kind. */
function bisectorIsSide(f: Extract<Fact, { t: 'bisects' }>, vertex: Id, polygonKind: string): ApplyError {
  const pair = (f.seg ?? [vertex, f.p!]).join('');
  return { code: 'bisector-is-side', detail: f.src, pair, vertex, polygonKind };
}

/**
 * A bisector whose far end `p` is an ARM of the angle it bisects — a zero angle, never a bisector. When a declared
 * polygon holds the pair as a side, 2-D's side sentence (#2115); else the generic `degenerate-role` (#1231), as before.
 */
function bisectorOnArm(c: Construction, f: Extract<Fact, { t: 'bisects' }>, at: AngleRef): { ok: false; error: ApplyError } {
  const kind = polygonSideKind(c, at.v, f.p!, f.p === at.a ? at.b : at.a);
  return { ok: false, error: kind ? bisectorIsSide(f, at.v, kind) : { code: 'degenerate-role', detail: f.src } };
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
    // A common tangent is a line the figure built (#2390): its clash reads as the constructed line's.
    case 'common-tangent':
      return 'line-at';
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
  /**
   * `restates` (#2169, ADR-W-131): a shape noun the ring's own nouns already IMPLY («ריבוע ABCD» · «דלתון ABCD») — the
   * fold takes the rest of that sentence's noun definition as already held, so the whole line is «already known».
   *
   * `touchByOnLine` (#2418, ADR-AG-321): a common tangent was lowered at the circles' touch point ONLY because a line the
   * fold told it of (`onLine`) puts the touch point on it — not one of its letters, not the figure, not the pair's
   * position. The fold then records that line's own statement as `narrowed`, never `known`: it re-decided the tangent.
   */
  /*
   * `createdCircle` (#2552 D9, ADR-AG-344): the fact stated a NEW circle on this centre letter («X מרכז מעגל» with every
   * circle's centre lettered). The fold carries it per fact; the submit path turns it into the created-circle notice.
   */
  | { ok: true; next: Construction; effect: LineEffect; notice?: ApplyNotice; restates?: true; touchByOnLine?: true; createdCircle?: Id }
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
const CURVE_BEARING: ReadonlySet<string> = new Set(['curve', 'circle-at', 'line-at', 'circle-thru', 'common-tangent']);

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
export function curveKindOf(o: GeoObject): string | null {
  if (o.kind === 'circle-at' || o.kind === 'circle-thru') return 'circle';
  // A line CONSTRUCTED through a point is a line, however it was stated (#1501; the `on-curve`
  // M1 arm carried this as a local special case before it lived here).
  if (o.kind === 'line-at' || o.kind === 'common-tangent') return 'line';
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
/**
 * THE TWO CIRCLES A SENTENCE SPEAKS OF — named (by the one name chain, `circleByName`), or the figure's own: «המעגל משיק
 * למעגל K» is the one OTHER circle, «המעגלים משיקים» / «מרכזי המעגלים» the exactly two. Anything else is a genuine "which
 * circles?", refused with the host count (#1432 am. 1). Written once (#2391, ADR-AG-315) for `tangent-circles` and
 * `centres-distance`, so the two readings of «the two circles» cannot drift.
 */
function circlePairOf(
  c: Construction,
  nameA: string | undefined,
  nameB: string | undefined,
  src: string,
): { ok: true; pair: [GeoObject, GeoObject] } | { ok: false; error: ApplyError } {
  const named = (name: string): GeoObject | { error: ApplyError } => {
    const o = circleByName(c, name);
    return o && curveKindOf(o) === 'circle' ? o : { error: unknownRef(c, numeralCurveId('circle', name)) };
  };
  let a: GeoObject | undefined;
  let b: GeoObject | undefined;
  if (nameA !== undefined) {
    const r = named(nameA);
    if ('error' in r) return { ok: false, error: r.error };
    a = r;
  }
  if (nameB !== undefined) {
    const r = named(nameB);
    if ('error' in r) return { ok: false, error: r.error };
    b = r;
  }
  if (!a || !b) {
    const rest = c.objects.filter((o) => curveKindOf(o) === 'circle' && o !== a && o !== b);
    const need = (a ? 0 : 1) + (b ? 0 : 1);
    // One name missing its partner is the circle none/many remedy; the unnamed pair over the wrong count is the PAIR's.
    if (rest.length !== need) return { ok: false, error: noHost(src, 'circle', rest.length, need === 2 ? 2 : undefined) };
    if (!a) a = rest.shift();
    if (!b) b = rest.shift();
  }
  return { ok: true, pair: [a!, b!] };
}

export function centreIdOf(c: Construction, o: GeoObject): Id | null {
  if (o.kind === 'circle-at') return o.centre;
  const rule = centreRuleOf(o);
  if (!rule) return null;
  const held = c.objects.find((p) => p.kind === 'derived' && sameDerivation(p.rule, rule));
  return held ? held.id : null;
}

/**
 * TWO CIRCLES WHOSE CENTRES COINCIDE FOR EVERY VALUE OF THE PARAMETERS (#2387, ADR-AG-306) — the structural form of
 * "concentric" for a circle-to-circle touch with an equation side. Each centre is read at the probe environments: an
 * equation circle's off its resolved curve, a centred circle's off its centre point when that point is stated by
 * coordinates. A centre that is a free or derived point can move, so the pair is not structurally concentric (the
 * residual's open floor keeps them apart instead). Probes a curve cannot be resolved at are skipped; none resolved is
 * "cannot say" (false).
 */
function centresAlwaysCoincide(c: Construction, a: GeoObject, b: GeoObject): boolean {
  const centreAt = (o: GeoObject, env: Env): { x: number; y: number } | null | 'moves' => {
    if (o.kind === 'curve') {
      const r = resolveCurve(o.curve, env);
      return r.ok && r.curve.kind === 'circle' ? { x: r.curve.cx, y: r.curve.cy } : null;
    }
    if (o.kind === 'circle-at') {
      const p = objectById(c, o.centre);
      if (!p || p.kind !== 'point') return 'moves';
      const x = evalExpr(p.x, env);
      const y = evalExpr(p.y, env);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }
    return 'moves';
  };
  let judged = 0;
  for (const env of PROBE_ENVS) {
    const p = centreAt(a, env);
    const q = centreAt(b, env);
    if (p === 'moves' || q === 'moves') return false;
    if (!p || !q) continue;
    if (Math.hypot(p.x - q.x, p.y - q.y) > 1e-9 * Math.max(1, Math.abs(p.x), Math.abs(p.y))) return false;
    judged++;
  }
  return judged > 0;
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
export function circleByName(c: Construction, name: string): GeoObject | undefined {
  const described = readDescribedCircle(name);
  if (described) return describedCircle(c, described);
  const direct = objectById(c, numeralCurveId('circle', name)) ?? objectById(c, `circle-at-${name}`) ?? curveByName(c, name);
  if (direct) return direct;
  return c.objects.find((o) => curveKindOf(o) === 'circle' && centreIdOf(c, o) === name);
}

/**
 * IS `p` ON THIS CURVE BY CONSTRUCTION — in every configuration, whatever moves (#1893, ADR-AG-271)? A defining point
 * of a computed circle (never an incircle's: its points are the ring it touches, not points on it), or a point the
 * figure STATES on it by an incidence. The one answer for "the figure says this point is on that curve"; the
 * circumcircle a ring describes (#1663) and the third-crossing arm (`derive.ts`) both read it. Deliberately not
 * `onCircleAlready` below, which counts an incircle's ring vertices for its own purpose (skipping a restatement).
 */
export function onCurveByConstruction(c: Construction, curve: GeoObject, p: Id): boolean {
  return (
    (curve.kind === 'circle-thru' && curve.def.t !== 'incircle' && circleDefPoints(curve.def).includes(p)) ||
    c.constraints.some((k) => k.t === 'on-curve' && k.id === p && k.curve === curve.id)
  );
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
  /*
   * #2545 (ADR-AG-335): the LETTERLESS reference («DE מיתר במעגל החוסם») — the ring is the figure's one polygon (of the
   * typed noun's size), and the described circle binds only when it is the figure's ONE circle: which circle a bare
   * relation names beside another is the operator's question (#2560), as in 2-D (ADR-768).
   */
  if (d.pts.length === 0) {
    const rings = c.objects.filter((o): o is Extract<GeoObject, { kind: 'polygon' }> => o.kind === 'polygon' && (!d.arity || o.vertices.length === d.arity));
    if (rings.length !== 1 || circles.length !== 1) return undefined;
    const hit = describedCircle(c, { role: d.role, pts: [...rings[0].vertices] });
    return hit === circles[0] ? hit : undefined;
  }
  if (d.role === 'circum') return circles.find((o) => d.pts.every((p) => onCurveByConstruction(c, o, p)));
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
 * A CURVE OPERAND GIVEN BY ITS EQUATION, RESOLVED TO THE OBJECT IT DENOTES (#2432, [ADR-AG-318](../../docs/06c-decisions-analytic.md#adr-ag-318)).
 *
 * The one place an equation written inside another sentence becomes a curve. The parser only reads it (`EqOperand`);
 * here, against the figure:
 *  1. **The figure's own curve with that equation IS the operand** (`resolveCurveByEq`): a named `l`, a declared
 *     `נתון ישר <eq>`, a carrier. A `stated` role promotes a carrier it finds (the #1076/#1149 path, the label kept).
 *  2. **Otherwise the curve is minted** under the operand's content id: drawn for `stated`, a carrier for `carrier`
 *     (ADR-AG-032, unchanged). A stated mint still meets the twin scan (#1342), which may absorb it into a line the
 *     probe identity did not match (a scaled spelling) — the operand is then the line that absorbed it.
 *
 * Before this, the `tangent-eq` arm and the parser's tangency readers minted a `curve` fact and then referred to
 * it by id; when the twin scan absorbed the mint the reference dangled, and the student read `curve-anon…`.
 * `minted` says the figure changed, so the statement that carries the operand is never «כבר ידוע» for it.
 */
function equationOperand(
  c: Construction,
  op: EqOperand,
  src: string,
): { ok: true; next: Construction; id: Id; minted: boolean } | { ok: false; error: ApplyError } {
  const curve: Curve = { ...(op.line ? { kind: 'line' as const } : {}), eq: op.eq as Curve['eq'] };
  const label = { name: '', eqSrc: op.eqSrc, ...(op.line ? { kind: 'line' as const } : {}) };
  const found = resolveCurveByEq(c, op.eq);
  if (found !== null) {
    const held = objectById(c, found) as CurveObject;
    if (op.role !== 'stated' || held.stated) return { ok: true, next: c, id: found, minted: false };
    const promoted = applyFact(c, { t: 'curve', id: found, label, curve: { ...curve, ...held.curve }, stated: true, src });
    return promoted.ok ? { ok: true, next: promoted.next, id: found, minted: promoted.next !== c } : promoted;
  }
  const mint = applyFact(c, { t: 'curve', id: op.id, label, curve, stated: op.role === 'stated', src });
  if (!mint.ok) return mint;
  if (objectById(mint.next, op.id)) return { ok: true, next: mint.next, id: op.id, minted: mint.next !== c };
  const twin = mint.next.objects.find((o): o is CurveObject => o.kind === 'curve' && identicalCurve(o.curve, curve));
  return twin ? { ok: true, next: mint.next, id: twin.id, minted: mint.next !== c } : { ok: false, error: { code: 'not-handled', detail: src } };
}

/** A direction written as a line's EQUATION, not yet resolved (#2429, ADR-AG-328). */
type EqDirection = Extract<Direction, { k: 'curve' }> & { eqSrc: string; eq: unknown };
const isEqDirection = (d: Direction): d is EqDirection => d.k === 'curve' && d.eqSrc !== undefined && d.eq !== undefined;

/**
 * A LINE OPERAND GIVEN BY ITS EQUATION, in a slot that takes a line (#2429, [ADR-AG-328](../../docs/06c-decisions-analytic.md#adr-ag-328))
 * — a relation's direction («הישר AB מקביל לישר 2x-y+3=0», «הישר 4x+y+3=0 מאונך ל-KL»), the direction a line through
 * a point copies («ישר דרך A מקביל לישר y=2x»), the line of a distance given («המרחק של A מהישר 3x+4y=25 הוא 5»).
 * The sentence is ABOUT that line, so its role is `stated`: the figure's own line with that equation, or one minted
 * drawn and named with the next free l-number (ADR-AG-319) — through the one resolver, `equationOperand` (ADR-AG-318).
 */
function lineOperand(c: Construction, op: { id: Id; eqSrc: string; eq: unknown }, src: string) {
  return equationOperand(c, { kind: 'eq', id: op.id, label: op.eqSrc, eqSrc: op.eqSrc, eq: op.eq as Expr, role: 'stated', line: true }, src);
}

/** A statement that minted its operand line changed the figure, so it is never «כבר ידוע» for it. */
const mintedEffect = (out: ApplyOutcome, minted: boolean): ApplyOutcome =>
  out.ok && minted && out.effect === 'known' ? { ...out, effect: 'created' } : out;

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
const isTangentObject = (o: GeoObject): boolean => o.kind === 'line-at' && (o.dir.k === 'radius' || o.dir.k === 'normal') && o.perp;

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

/**
 * THE CURVE A RELATION IS ABOUT (#2618, ADR-AG-355) — the one resolver every chord, diameter, tangent and inscribed
 * sentence reaches for its host. With no conic named it is the circle chain above, unchanged (`circleNamed`); with
 * one («באליפסה», «לפרבולה») it is the figure's ONE curve of that kind, by the fit (`curveKindOf`), and none or
 * several is the contextual refusal for that kind (`noHost`) — the corpus never draws two of either (D6).
 */
function curveHost(
  c: Construction,
  host: ConicHost | undefined,
  name: string | undefined,
  src: string,
): { ok: true; o: GeoObject } | { ok: false; error: ApplyError } {
  if (!host) return circleNamed(c, name, src);
  const found = c.objects.filter((o) => curveKindOf(o) === host);
  if (found.length !== 1) return { ok: false, error: noHost(src, host, found) };
  return { ok: true, o: found[0] };
}

/**
 * WHAT A TANGENT AT `at` IS PERPENDICULAR TO, on `host` (#2618, ADR-AG-355): the radius on a circle — the direction
 * every circle lowering has always carried, so a circle figure is unchanged — and the conic's normal otherwise.
 */
const touchNormal = (host: GeoObject, at: Id): Direction =>
  curveKindOf(host) === 'circle' ? { k: 'radius', circle: host.id, at } : { k: 'normal', curve: host.id, at };

/**
 * THE ONE PLACE A CIRCLE ON A CENTRE IS CREATED WITH A FREE RADIUS (#2382, ADR-AG-305): the object and its radius
 * parameter `radiusSymbol(centre)` > 0, in one step. Every mint site — a sentence that names a circle by its centre
 * (`circle-at` with no `r`), a reference that states the circle it names (`statingNamedCircle`, #1670), a sector's hidden
 * circle — reaches it through that fact, so no third copy of «param + circle» can mint a radius the circle does not read.
 */
function stateCircleOn(c: Construction, centre: Id, id: Id, src: string, hidden?: true): ApplyOutcome {
  const sym = radiusSymbol(centre);
  const withParam = applyFact(c, { t: 'param', sym, domain: { min: 0, minOpen: true }, src });
  if (!withParam.ok) return withParam;
  const circle: GeoObject = { kind: 'circle-at', id, centre, r: { kind: 'sym', name: sym }, ...(hidden ? { hidden: true as const } : {}) };
  return { ok: true, effect: 'created', next: { ...withParam.next, objects: [...withParam.next.objects, circle] } };
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
  // #2545 (ADR-AG-335): a letterless reference names no ring to build on — creating it is #2560's question
  if (described && described.pts.length === 0) return null;
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
  // The circle on that centre, its radius minted where it is created (`stateCircleOn`, #2382) — never a second copy here.
  const created = applyAll(c, [
    { t: 'declare', id: name, src: f.src },
    { t: 'circle-at', id: `circle-at-${name}`, centre: name, src: f.src },
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
 * A STANDARD-FORM CIRCLE EQUATION'S CENTRE AND RADIUS, READ STRUCTURALLY (#2397, ADR-AG-322) — `createdParts`
 * generalised to what a student writes: (x − p)², x², (x + p)², (p + x)², the same in y, either order, and a right
 * side s² or a non-negative number (its square root). Anything else is `null`: no CAS (CLAUDE.md hard boundary 2) — a
 * caller that needs the parts then reads a constant circle at the probes, or keeps its existing answer.
 */
function standardCircleParts(eq: Expr): { a: Expr; b: Expr; r: Expr } | null {
  if (eq.kind !== 'sub' || eq.a.kind !== 'add') return null;
  const free = (e: Expr) => !symbolsOf(e).some((n) => n === 'x' || n === 'y');
  const square = (e: Expr): Expr | null => (e.kind === 'pow' && e.b.kind === 'num' && e.b.value === 2 ? e.a : null);
  const shift = (e: Expr, v: 'x' | 'y'): Expr | null => {
    const base = square(e);
    if (!base) return null;
    if (base.kind === 'sym' && base.name === v) return { kind: 'num', value: 0 };
    if (base.kind === 'sub' && base.a.kind === 'sym' && base.a.name === v && free(base.b)) return base.b;
    if (base.kind === 'add' && base.a.kind === 'sym' && base.a.name === v && free(base.b)) return { kind: 'neg', a: base.b };
    if (base.kind === 'add' && base.b.kind === 'sym' && base.b.name === v && free(base.a)) return { kind: 'neg', a: base.a };
    return null;
  };
  const [u, w] = [eq.a.a, eq.a.b];
  const a = shift(u, 'x') ?? shift(w, 'x');
  const b = shift(u, 'y') ?? shift(w, 'y');
  if (!a || !b) return null;
  if (!free(eq.b)) return null;
  const r = square(eq.b) ?? (eq.b.kind === 'num' && eq.b.value >= 0 ? ({ kind: 'num', value: Math.sqrt(eq.b.value) } as Expr) : null);
  return r ? { a, b, r } : null;
}

/**
 * A DRAWN CIRCLE TAKES A STATED EQUATION (#2397, ADR-AG-322; ADR-AG-204 generalised) — «שני מעגלים» · «מרכזו של המעגל
 * האחד … ומשוואתו …», «נתון מעגל» · «משוואת המעגל היא …», a touch's circle · its equation. The circle keeps its id and
 * its place (every relation stated about it refers to it by id, so the relation holds of the described circle); its
 * equation becomes the stated one; its own free symbols leave the figure.
 *
 * PARTS ALREADY SPOKEN FOR ARE CARRIED, NEVER DROPPED. A part of the old equation that is not the circle's own bare
 * symbol was put there by a statement — the radius by `radius-of`, the centre or radius of a placed «זרים / מוכל» pair
 * by `relateCircles` — and is re-stated about the described circle through the seam that owns it: a constant radius as
 * `radius-of` (a conflict is its existing `conflicting-restatement`), a radius in the figure's symbols as the
 * `param-rel` it now is, the centre as a `coord` on its centre point. The circle's own bare symbols that still occur
 * elsewhere (a sibling placed relative to it) are substituted by the stated centre and radius.
 *
 * `null` when the description cannot be carried without a CAS — the parts are needed and the stated equation is
 * neither in standard form nor a constant circle, or a placed centre has no point to state it on — and the caller keeps
 * its existing answer. Nothing is ever carried wrong.
 */
function describeDrawnCircle(c: Construction, host: CurveObject, eq: Expr, src: string): ApplyOutcome | null {
  const old = createdParts(host);
  if (!old) return null;
  const own = (part: string) => toolSymbol(host.id, part);
  const bare = (e: Expr, part: string) => e.kind === 'sym' && e.name === own(part);
  const spoken = { a: !bare(old.a, 'a'), b: !bare(old.b, 'b'), r: !bare(old.r, 'r') };
  const restText = JSON.stringify({ objects: c.objects.filter((o) => o.id !== host.id), constraints: c.constraints, selectors: c.selectors });
  const usedElsewhere = ['a', 'b', 'r'].some((part) => restText.includes(`"${own(part)}"`));
  let stated = standardCircleParts(eq);
  if (!stated && (spoken.a || spoken.b || spoken.r || usedElsewhere)) {
    // A circle with constant centre and radius needs no algebra: its parts are read at the probes.
    const fits = PROBE_ENVS.map((env) => resolveCurve({ eq } as Curve, env));
    const first = fits[0];
    if (!first.ok || first.curve.kind !== 'circle') return null;
    const { cx, cy, r } = first.curve;
    const close = (v: number, w: number) => Math.abs(v - w) <= 1e-9 * Math.max(1, Math.abs(v), Math.abs(w));
    const constant = fits.every((fit) => fit.ok && fit.curve.kind === 'circle' && close(fit.curve.cx, cx) && close(fit.curve.cy, cy) && close(fit.curve.r, r));
    if (!constant) return null;
    stated = { a: { kind: 'num', value: cx }, b: { kind: 'num', value: cy }, r: { kind: 'num', value: r } };
  }
  const centre = spoken.a || spoken.b ? centreIdOf(c, host) : null;
  if ((spoken.a || spoken.b) && centre === null) return null;
  let next: Construction = { ...c, objects: c.objects.map((o) => (o.id === host.id ? { ...host, curve: { kind: 'circle', eq } } : o)) };
  let carried = { a: old.a, b: old.b, r: old.r };
  if (stated) {
    // The circle's own bare symbols, wherever they still stand, become the stated parts.
    for (const part of ['a', 'b', 'r'] as const) {
      if (spoken[part]) continue;
      // The host already carries the stated equation, which names none of the tool's symbols.
      const bound = bindSymbol(next, own(part), stated[part], src, { admit: false });
      if (!bound.ok) return bound;
      next = bound.next;
    }
    carried = readBound(next, carried);
  }
  const carriedFacts: Fact[] = [];
  if (spoken.r) {
    const at = PROBE_ENVS.map((env) => evalExpr(carried.r as Parameters<typeof evalExpr>[0], env));
    const constant = at.every((v) => Number.isFinite(v) && v === at[0]);
    carriedFacts.push(
      constant || !stated
        ? { t: 'radius-of', circleId: host.id, value: carried.r, src }
        : { t: 'constraint', k: { t: 'param-rel', left: carried.r, right: stated.r }, src },
    );
  }
  if (spoken.a || spoken.b) {
    carriedFacts.push({ t: 'constraint', k: { t: 'coord', id: centre!, ...(spoken.a ? { x: carried.a } : {}), ...(spoken.b ? { y: carried.b } : {}) }, src });
  }
  // Its own symbols leave the figure — every one nothing reads any more (a placement's g, m, s, k stay while a carried part reads them).
  const readText = JSON.stringify({ objects: next.objects, constraints: next.constraints, selectors: next.selectors, carriedFacts });
  next = { ...next, params: next.params.filter((p) => !p.sym.startsWith(own('')) || readText.includes(`"${p.sym}"`)) };
  const out = applyAll(next, carriedFacts);
  if (!out.ok) return out.error.code === 'radius-contradicts' ? { ok: false, error: { code: 'conflicting-restatement', detail: src } } : out;
  return { ok: true, next: out.next, effect: 'narrowed' };
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
  // The tool's own symbol replaced by the relation's construction — through the one binding seam (#2521).
  let failed: ApplyError | null = null;
  const substitute = (name: string, value: Expr) => {
    if (failed) return;
    const bound = bindSymbol(next, name, value, src, { admit: false });
    if (bound.ok) next = bound.next;
    else failed = bound.error;
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
  if (failed) return { ok: false, error: failed };
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

/**
 * A SYMMETRIC STATEMENT WRITTEN IN ONE ORDER — the relations between two circles that say the same thing either way round
 * (ADR-AG-219; #2397, ADR-AG-322 adds the tangency):
 *  - `apart` / `cross` (a `circles` sign selector);
 *  - an EXTERNAL tangency (`tangent-circle`, branch `external`): each circle touches the other from outside;
 *  - a tangency of UNSTATED kind (the `choice` of both branches): neither order is said;
 *  - the circles' common point (the `touch-point` derived rule).
 * An INTERNAL tangency is not symmetric: it tells the circles apart, one inside the other (2-D's `autosInterchangeable`
 * asks there too). Read structurally — a semantic property of the relation, never a list of sentences.
 */
function normaliseSymmetric(text: string): string {
  const pairOf = (a: unknown, b: unknown): [unknown, unknown] => (JSON.stringify(a) <= JSON.stringify(b) ? [a, b] : [b, a]);
  const tangency = (k: Record<string, unknown>): Record<string, unknown> => {
    const [a, b] = pairOf(k.a, k.b);
    return { ...k, a, b };
  };
  const isTangency = (k: unknown, branch?: string): boolean =>
    !!k && typeof k === 'object' && (k as { t?: unknown }).t === 'tangent-circle' && (branch === undefined || (k as { branch?: unknown }).branch === branch);
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
  if (v.kind === 'sign' && v.q && typeof v.q === 'object') {
    const q = v.q as Record<string, unknown>;
    if (q.k === 'circles' && (q.rel === 'apart' || q.rel === 'cross')) {
      const [a, b] = pairOf(q.a, q.b);
      return JSON.stringify({ ...v, q: { ...q, a, b } });
    }
    return text;
  }
  if (isTangency(v, 'external')) return JSON.stringify(tangency(v));
  if (v.t === 'choice' && Array.isArray(v.options) && v.options.length === 2 && v.options.every((o) => isTangency(o))) {
    const branches = (v.options as Array<{ branch?: unknown }>).map((o) => o.branch).sort().join();
    if (branches === 'external,internal') return JSON.stringify({ ...v, options: (v.options as Array<Record<string, unknown>>).map(tangency) });
    return text;
  }
  if (v.kind === 'derived' && v.rule && typeof v.rule === 'object' && (v.rule as { t?: unknown }).t === 'touch-point') {
    return JSON.stringify({ ...v, rule: tangency(v.rule as Record<string, unknown>) });
  }
  return text;
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
  // ⊥ the radius on a circle, ⊥ the normal on an ellipse or a parabola (#2618, ADR-AG-355) — one lowering per curve.
  facts.push({ t: 'constraint', k: { t: 'relation', rel: 'perpendicular', u: touchNormal(host, at), v: dir }, src });
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
  /*
   * «האלכסון AC» CLAIMS AC IS A DIAGONAL (#1737, ADR-AG-265; 2-D's ADR-569 check, measured at `403efe66`). Against the
   * polygons holding both letters: a diagonal of any of them holds; a SIDE of a quadrilateral, or any pair of a
   * triangle (which has no diagonals), is refused naming the pair and the ring. No such polygon claims nothing yet.
   */
  if (f.role === 'diagonal') {
    const holders = c.objects.filter((o): o is PolygonObject => o.kind === 'polygon' && o.vertices.includes(f.a) && o.vertices.includes(f.b));
    const isDiagonal = (r: readonly Id[]): boolean => {
      const n = r.length;
      const d = (r.indexOf(f.a) - r.indexOf(f.b) + n) % n;
      return n >= 4 && d !== 1 && d !== n - 1;
    };
    if (holders.length === 0 || holders.some((o) => isDiagonal(o.vertices))) return { ok: true, effect: 'known', next: c };
    const ring = holders[0].vertices;
    return {
      ok: false,
      error: { code: ring.length < 4 ? 'diagonal-none-here' : 'diagonal-is-side', detail: f.src, polygon: ring.join(''), pair: `${f.a}${f.b}` },
    };
  }
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
      if (f.role === 'leg') return { says: { t: 'choice', options: [equal(f.a, f.b, f.a, third), equal(f.a, f.b, f.b, third)] } };
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

/** One unordered pair of vertices, as a comparable key. */
const edgeKey = (e: readonly [Id, Id]): string => [e[0], e[1]].sort().join('|');
const sameEdge = (a: readonly [Id, Id], b: readonly [Id, Id]): boolean => edgeKey(a) === edgeKey(b);

/**
 * THE SIDES OF A RING THAT LIE OPPOSITE `apex` (#1945, [ADR-AG-253](../../docs/06c-decisions-analytic.md#adr-ag-253)).
 *
 * The real EDGES of the ring that do not touch the apex — the bases a height from it can drop onto. A triangle
 * yields exactly one; a quadrilateral or an n-gon yields several, all of them genuine heights. Only ring edges are
 * walked, so a DIAGONAL can never come out of this: a height drops to a side, never across the figure (2-D reached
 * the same rule from the same complaint, [ADR-263](../../docs/06-decisions.md#adr-263)'s `oppositePolygonEdges` —
 * a ported ruling, not shared code).
 */
const oppositeRingEdges = (ring: readonly Id[], apex: Id): [Id, Id][] => {
  const out: [Id, Id][] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a === apex || b === apex) continue; // an edge touching the apex is adjacent, not opposite
    if (out.some((e) => sameEdge(e, [a, b]))) continue;
    out.push([a, b]);
  }
  return out;
};

/**
 * THE PARALLEL BASE A TRAPEZOID'S HEIGHT DROPS ONTO (#1945; 2-D's [ADR-169](../../docs/06-decisions.md#adr-169)).
 *
 * Among the ring's OWN parallel pairs — both operands edges of this ring, the trapezoid's assumed seat (#1159)
 * included — the partner of the edge that carries the apex. Exactly one such base ⇒ it is the one the height
 * means; none (a triangle, a kite, a plain quadrilateral) or several (a parallelogram's two pairs) ⇒ null, and
 * the caller falls back to the ring's first opposite side. 2-D reads the same preference from its global parse
 * context; read here off the apex's own ring, which is what keeps a stated parallel ELSEWHERE in the figure from
 * pulling a triangle's height off its opposite side (measured at `8e0debff`: 2-D's does — reported as found work).
 */
function ringParallelBase(c: Construction, ring: readonly Id[], apex: Id, opposite: readonly [Id, Id][]): [Id, Id] | null {
  const ringEdge = (e: readonly [Id, Id]): boolean =>
    ring.some((x, i) => sameEdge([x, ring[(i + 1) % ring.length]], e));
  const cands: [Id, Id][] = [];
  for (const k of c.constraints) {
    if (k.t !== 'relation' || k.rel !== 'parallel' || k.u.k !== 'points' || k.v.k !== 'points') continue;
    const e1: [Id, Id] = [k.u.a, k.u.b];
    const e2: [Id, Id] = [k.v.a, k.v.b];
    if (!ringEdge(e1) || !ringEdge(e2)) continue;
    const in1 = e1.includes(apex);
    const in2 = e2.includes(apex);
    if (in1 === in2) continue; // the apex on both (degenerate) or on neither (a leg apex) — not this pair's base
    const other = in1 ? e2 : e1;
    if (!opposite.some((e) => sameEdge(e, other))) continue;
    if (!cands.some((e) => sameEdge(e, other))) cands.push(other);
  }
  return cands.length === 1 ? cands[0] : null;
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

/** The point the figure STATES the two circles touch at («המעגלים משיקים בנקודה T») — its `touch-point`; `null` if none. */
function touchPointOf(c: Construction, c1: Id, c2: Id): Id | null {
  const o = c.objects.find(
    (q) => q.kind === 'derived' && q.rule.t === 'touch-point' && ((q.rule.a === c1 && q.rule.b === c2) || (q.rule.a === c2 && q.rule.b === c1)),
  );
  return o ? o.id : null;
}

/**
 * THE FIGURE'S LINE THROUGH a AND b (#2392, ADR-AG-313) — a `line-at` along a→b through one of them (whatever name it
 * carries), or the line object named by the pair («הישר AB», «הישר AB: …»). Read off the construction, never a sample.
 */
function lineOverPair(c: Construction, a: Id, b: Id): GeoObject | undefined {
  const pair = (u: Id, v: Id) => (u === a && v === b) || (u === b && v === a);
  return c.objects.find(
    (o) =>
      (o.kind === 'line-at' && !o.perp && o.dir.k === 'points' && pair(o.dir.a, o.dir.b) && (o.through === a || o.through === b)) ||
      ((o.kind === 'line-at' || o.kind === 'curve') && (o.id === lineIdOf(`${a}${b}`) || o.id === lineIdOf(`${b}${a}`))),
  );
}

/**
 * HOW TWO CIRCLES SIT, AS THE FIGURE STATES IT (#2390, ADR-AG-314) — the one question «כל המשיקים המשותפים» asks
 * before it knows how many tangents to draw. Read off the construction, never a sample:
 *  - a position the student STATED: «שני מעגלים זרים» / «נחתכים» / «מוכל» (the `circles` selectors), «… משיקים
 *    מבחוץ / מבפנים» (a `tangent-circle` with its branch); two circles on one centre are one inside the other;
 *  - else two DETERMINED circles (constant centre and radius at every probe): their measured position;
 *  - else `null`: the givens do not settle it («שני מעגלים», «המעגלים משיקים» with no מבחוץ / מבפנים), and the
 *    sentence is not decided here.
 */
function pairPositionOf(c: Construction, c1: Id, c2: Id): PairPosition | null {
  const pair = (a: Id, b: Id) => (a === c1 && b === c2) || (a === c2 && b === c1);
  for (const s of c.selectors) {
    if (s.kind !== 'sign' || s.q.k !== 'circles' || !s.positive || !pair(s.q.a, s.q.b)) continue;
    if (s.q.rel === 'apart' || s.q.rel === 'cross' || s.q.rel === 'inside') return s.q.rel;
  }
  const o1 = objectById(c, c1);
  const o2 = objectById(c, c2);
  if (!o1 || !o2) return null;
  if (o1.kind === 'circle-at' && o2.kind === 'circle-at') {
    if (o1.centre === o2.centre) return 'inside';
    for (const k of c.constraints) {
      if (k.t === 'tangent-circle' && sidesAre(k.a, k.b, o1, c1, o2, c2)) return k.branch === 'external' ? 'ext-tangent' : 'int-tangent';
    }
  }
  const at = PROBE_ENVS.map((env) => [circleAtProbe(c, o1, env), circleAtProbe(c, o2, env)] as const);
  const [p0, q0] = at[0];
  if (!p0 || !q0) return null;
  const same = (u: NumCircle | null, v: NumCircle) =>
    !!u && [u.cx - v.cx, u.cy - v.cy, u.r - v.r].every((d) => Math.abs(d) <= 1e-9 * Math.max(1, Math.abs(v.cx), Math.abs(v.cy), v.r));
  if (!at.every(([p, q]) => same(p, p0) && same(q, q0))) return null;
  return positionOfCircles(p0, q0);
}

/**
 * Is a `tangent-circle`'s pair of sides (#2387, ADR-AG-306: a centre with its radius, or a circle by id) exactly these two
 * circles, in either order? A side names a centre-and-radius circle by its centre point, an equation circle by its id.
 */
function sidesAre(a: CircleSide, b: CircleSide, o1: GeoObject, c1: Id, o2: GeoObject, c2: Id): boolean {
  const is = (s: CircleSide, o: GeoObject, id: Id) => ('centre' in s ? o.kind === 'circle-at' && s.centre === o.centre : s.circle === id);
  return (is(a, o1, c1) && is(b, o2, c2)) || (is(a, o2, c2) && is(b, o1, c1));
}

/** Does the figure STATE the two circles tangent — with or without its kind (a `tangent-circle`, or the choice of both)? */
function statedTangent(c: Construction, c1: Id, c2: Id): boolean {
  const o1 = objectById(c, c1);
  const o2 = objectById(c, c2);
  if (o1?.kind !== 'circle-at' || o2?.kind !== 'circle-at') return false;
  const ours = (k: Constraint): boolean =>
    k.t === 'tangent-circle'
      ? sidesAre(k.a, k.b, o1, c1, o2, c2)
      : k.t === 'choice' && k.options.length > 0 && k.options.every(ours);
  return c.constraints.some(ours);
}

type NumCircle = { kind: 'circle'; cx: number; cy: number; r: number };

/** A circle's numbers at a probe, when they are read off its own statement (a centre given by coordinates, an equation). */
function circleAtProbe(c: Construction, o: GeoObject, env: Env): NumCircle | null {
  if (o.kind === 'curve') {
    const res = resolveCurve(o.curve, env);
    return res.ok && res.curve.kind === 'circle' ? res.curve : null;
  }
  if (o.kind !== 'circle-at') return null;
  const centre = objectById(c, o.centre);
  if (!centre || centre.kind !== 'point') return null;
  const [cx, cy, r] = [evalExpr(centre.x as Expr, env), evalExpr(centre.y as Expr, env), evalExpr(o.r as Expr, env)];
  return [cx, cy, r].every(Number.isFinite) && r > 0 ? { kind: 'circle', cx, cy, r } : null;
}

/**
 * The next `n` FREE line names l1, l2, … (#2390's ruled pattern, ADR-AG-314): a numeral is taken when any line the
 * construction holds already reads as it in any notation («l3», «ℓ3», «ישר 3», «III» are one name — `nameReading`).
 */
function freeLineNames(c: Construction, n: number): string[] {
  const taken = new Set<string>();
  for (const o of c.objects) {
    if (curveKindOf(o) !== 'line') continue;
    const own = o.kind === 'line-at' || o.kind === 'common-tangent' ? o.name : o.kind === 'curve' ? o.label.name : undefined;
    for (const name of [own, statedName(o.id)]) {
      const reading = name ? nameReading(name) : null;
      if (reading) taken.add(reading);
    }
  }
  const out: string[] = [];
  for (let k = 1; out.length < n; k++) {
    const name = `l${k}`;
    if (!taken.has(nameReading(name)!) && !objectById(c, lineIdOf(name))) out.push(name);
  }
  return out;
}

/**
 * A DRAWN LINE THE STUDENT DID NOT NAME TAKES THE NEXT FREE l-NUMBER (#2425, [ADR-AG-319](../../docs/06c-decisions-analytic.md#adr-ag-319);
 * operator 2026-10-20: *"i want the line to also be drawn and named with l1 or l2 or whatever number is free"*, and Q4:
 * «נתון ישר <eq>» too). Given at M1, the one place with figure context, when the line becomes stated — minted stated,
 * or a carrier promoted — and marked `auto`, so a name the student gives the same line later replaces it (Q3). The id is
 * never rewritten (the narrowing rule): the name rides the label, and `resolveLineRefs` (ADR-AG-317) makes every slot
 * read it. Allocated in fold order, so undo, the seed and «הציגו תצורה אחרת» never renumber a line.
 */
function toolNamed(c: Construction, o: CurveObject): CurveObject {
  if (!o.stated || o.label.name !== '' || curveKindOf(o) !== 'line') return o;
  return { ...o, label: { ...o.label, name: freeLineNames(c, 1)[0], auto: true } };
}

/** `value` with every string equal to `from` replaced by `to`, structurally — an object's references re-pointed. */
function replaceId<T>(value: T, from: Id, to: Id): T {
  if (value === from) return to as T;
  if (Array.isArray(value)) return value.map((v) => replaceId(v, from, to)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, replaceId(v, from, to)])) as T;
  }
  return value;
}

/**
 * A HEIGHT STATED AS A MAGNITUDE, RESOLVED AGAINST THE FIGURE (#1737, ADR-AG-265) — 2-D's `shapeHeight` (ADR-575),
 * measured at `403efe66`, read here at M1 because this parser is context-free.
 *
 * - The candidates: the polygons the noun names (a triangle noun: any three-vertex ring), narrowed by the letters;
 *   with no noun, every polygon. None → `shape-not-found` (a sentence with no noun → `not-handled`), except that a
 *   trapezoid named by letters NONE of which the figure has is introduced first (2-D's #1720). Several → `not-handled`.
 * - A triangle → ASK which height: the sides opposite each vertex, in ring order.
 * - A parallelogram, or a trapezoid whose figure holds two parallel pairs → ASK: the heights from the first vertex to
 *   the two sides opposite it.
 * - A trapezoid with ONE parallel pair (its assumed pair, or the pair the student stated, #1159) → the height from the
 *   ring vertex before the pair's first edge in ring order, onto that edge (2-D's seat): the cevian «הגובה מ-D לצלע
 *   AB» («הגובה מ-A לצלע BC» once BC ∥ AD is stated) with its tool-named foot and the stated measure. Every such segment has the same length, so the
 *   vertex is gauge, never an unstated given.
 * - Any other quadrilateral → `not-handled` (2-D leaves it to the old path).
 */
function applyHeightOf(c: Construction, f: Extract<Fact, { t: 'height-of' }>): ApplyOutcome {
  const unread: ApplyOutcome = { ok: false, error: { code: 'not-handled', detail: f.src } };
  const polys = c.objects.filter((o): o is PolygonObject => o.kind === 'polygon');
  let cands = f.noun === 'משולש' ? polys.filter((o) => o.vertices.length === 3) : f.noun ? (ringsNamed(polys, f.noun) as PolygonObject[]) : polys;
  const ring0 = f.ring;
  if (ring0) cands = cands.filter((o) => o.vertices.length === ring0.length && ring0.every((v) => o.vertices.includes(v)));
  if (cands.length === 0) {
    if (f.declare && ring0 && !ring0.some((id) => objectById(c, id))) {
      const introduced = applyAll(c, f.declare);
      if (!introduced.ok) return introduced;
      const rest = applyHeightOf(introduced.next, { ...f, declare: undefined });
      return rest.ok ? { ...rest, effect: 'created' } : rest;
    }
    return f.noun ? { ok: false, error: { code: 'shape-not-found', detail: f.src, shape: f.noun } } : unread;
  }
  if (cands.length > 1) return unread;
  const host = cands[0];
  const ring = host.vertices;
  const phrase = (apex: Id | null, side: readonly Id[]): string =>
    f.en ? `the height ${apex ? `from ${apex} ` : ''}to side ${side[0]}${side[1]}` : `הגובה ${apex ? `מ-${apex} ` : ''}לצלע ${side[0]}${side[1]}`;
  const option = (apex: Id | null, side: readonly Id[]): string => (f.en ? `${phrase(apex, side)} is ${f.said}` : `${phrase(apex, side)}${f.said}`);
  const ask = (options: string[]): ApplyOutcome => ({ ok: false, error: { code: 'ambiguous-height', detail: f.src, options } });
  if (ring.length === 3) return ask([[ring[1], ring[2]], [ring[0], ring[2]], [ring[0], ring[1]]].map((sd) => option(null, sd)));
  if (ring.length !== 4) return unread;
  const ringEdge = (e: readonly [Id, Id]): boolean => ring.some((x, i) => sameEdge([x, ring[(i + 1) % ring.length]], e));
  const bases: Array<[[Id, Id], [Id, Id]]> = [];
  for (const k of c.constraints) {
    if (k.t !== 'relation' || k.rel !== 'parallel' || k.u.k !== 'points' || k.v.k !== 'points') continue;
    const e1: [Id, Id] = [k.u.a, k.u.b];
    const e2: [Id, Id] = [k.v.a, k.v.b];
    if (!ringEdge(e1) || !ringEdge(e2) || sameEdge(e1, e2)) continue;
    if (bases.some(([p, q]) => (sameEdge(p, e1) && sameEdge(q, e2)) || (sameEdge(p, e2) && sameEdge(q, e1)))) continue;
    bases.push([e1, e2]);
  }
  const trapezoid = ringsNamed([host], 'טרפז').length === 1;
  const parallelogram = host.noun !== undefined && normalizeShapeNoun(host.noun) === 'מקבילית';
  if (parallelogram || (trapezoid && bases.length === 2)) return ask([option(ring[0], [ring[2], ring[3]]), option(ring[0], [ring[1], ring[2]])]);
  if (!trapezoid || bases.length !== 1) return unread;
  // The base is the FIRST ring edge in the pair, the apex the vertex before it — 2-D's seat (measured at `403efe66`:
  // AB ∥ DC → from D onto AB; a stated BC ∥ AD → from A onto BC).
  const i = ring.findIndex((x, k) => bases[0].some((e) => sameEdge(e, [x, ring[(k + 1) % 4]])));
  if (i < 0) return unread;
  const apex = ring[(i + 3) % 4];
  return applyFact(c, { t: 'cevian-of', role: 'altitude', apex, side: [ring[i], ring[(i + 1) % 4]], foot: f.foot, toolFoot: true, measure: f.measure, src: f.src });
}

/**
 * A SIDE NAMED BY ITS ROLE ALONE, RESOLVED AGAINST THE FIGURE (#1807, ADR-AG-266).
 *
 * Which polygon: the ones where the role has a content — an isosceles triangle's base or leg (its noun's apex
 * choice), a right triangle's hypotenuse (its seat choice, or any triangle's stated right angle), a trapezoid's base
 * or leg (its one parallel pair). None or several → the contextual refusal (`noHost`), which names the sentence:
 * a parallelogram and a plain triangle have no base (operator ruling 2026-10-06, #1807).
 *
 * Which side, read off the polygon's EXISTING structure, never a new pick:
 * - SETTLED (the student stated the equal pair or the right angle) → the one side, and the sentence is applied
 *   exactly as its lettered twin («משוואת הבסיס BC …»), its role claim included;
 * - OPEN (the noun's choice still stands) → the statement is attached to EVERY option of that choice, in place
 *   (`all(option, the statement on that option's side)`): one cycle, and the side on the line can never disagree
 *   with the drawn apex (ADR-052 — an unstated choice is a degree of freedom, never refused, never a fixed pick);
 * - a trapezoid's two bases (or legs), or an isosceles triangle's two legs once its apex is settled → a new choice
 *   between them, the trapezoid's pair stated by the role's own claim (#1159).
 * The sentence's line is drawn once, anonymous: in an open figure no pair of letters names it.
 */
function applyRoleSide(c: Construction, f: Extract<Fact, { t: 'role-side' }>): ApplyOutcome {
  const [s1, s2] = ROLE_SIDE_SENTINELS;
  const cevian = f.facts.length === 1 && f.facts[0].t === 'cevian-of' ? f.facts[0] : null;
  if (cevian) return f.role === 'hypotenuse' ? { ok: false, error: { code: 'not-handled', detail: f.src } } : applyRoleCevian(c, f.role, cevian, f.src);
  type Option = { side: [Id, Id]; with?: Constraint };
  type Reading = { poly: PolygonObject; options: Option[]; seat?: number; trapezoid?: true };
  const sideOf = (ring: readonly Id[], i: number): [Id, Id] => {
    const rest = ring.filter((_, k) => k !== i);
    return [rest[0], rest[1]];
  };
  /** The noun's choice (or what is left of it) over `keys` — the seat holding it, else the keys stated outright. */
  const seatOver = (keys: readonly Constraint[]): { seat: number; opts: Array<{ with: Constraint; i: number }> } | { fixed: number[] } => {
    const idxOf = (o: Constraint): number => keys.findIndex((k) => sameConstraint(o, k) || (o.t === 'all' && o.of.some((x) => sameConstraint(x, k))));
    const seat = c.constraints.findIndex((k) => k.t === 'choice' && k.options.length > 0 && k.options.every((o) => idxOf(o) >= 0));
    const held = seat >= 0 ? c.constraints[seat] : undefined;
    if (held && held.t === 'choice') return { seat, opts: held.options.map((o) => ({ with: o, i: idxOf(o) })) };
    return { fixed: keys.flatMap((k, i) => (c.constraints.some((x) => x.t !== 'choice' && sameConstraint(x, k)) ? [i] : [])) };
  };
  const readingOf = (o: PolygonObject): Reading | null => {
    const ring = o.vertices;
    const noun = o.noun ? normalizeShapeNoun(o.noun) : '';
    if (ring.length === 3) {
      let keys: Constraint[];
      if (f.role === 'hypotenuse') keys = [rightAngleAt(ring[0], ring[1], ring[2]), rightAngleAt(ring[1], ring[0], ring[2]), rightAngleAt(ring[2], ring[0], ring[1])];
      else if (noun === 'משולש שווה שוקיים') keys = isoscelesKeys(ring);
      else return null;
      const sidesAt = (i: number): Array<[Id, Id]> =>
        f.role === 'leg' ? sideOf(ring, i).map((x): [Id, Id] => [ring[i], x]) : [sideOf(ring, i)];
      const s = seatOver(keys);
      if ('seat' in s) return { poly: o, seat: s.seat, options: s.opts.flatMap(({ with: w, i }) => sidesAt(i).map((side) => ({ side, with: w }))) };
      if (s.fixed.length === 0) return null;
      return { poly: o, options: s.fixed.flatMap((i) => sidesAt(i).map((side) => ({ side }))) };
    }
    if (ring.length !== 4 || f.role === 'hypotenuse' || ringsNamed([o], 'טרפז').length !== 1) return null;
    const edges = ring.map((x, i): [Id, Id] => [x, ring[(i + 1) % 4]]);
    const pairs = c.constraints.flatMap((k): Array<[[Id, Id], [Id, Id]]> => {
      if (k.t !== 'relation' || k.rel !== 'parallel' || k.u.k !== 'points' || k.v.k !== 'points') return [];
      const u: [Id, Id] = [k.u.a, k.u.b];
      const v: [Id, Id] = [k.v.a, k.v.b];
      const e1 = edges.find((e) => sameEdge(e, u));
      const e2 = edges.find((e) => sameEdge(e, v));
      return e1 && e2 && !sameEdge(e1, e2) ? [[e1, e2]] : [];
    });
    const distinct = pairs.filter((p, i) => pairs.findIndex((q) => sameEdge(q[0], p[0]) || sameEdge(q[1], p[0])) === i);
    if (distinct.length !== 1) return null;
    const [e1, e2] = distinct[0];
    const sides = f.role === 'base' ? [e1, e2] : edges.filter((e) => !sameEdge(e, e1) && !sameEdge(e, e2));
    return { poly: o, trapezoid: true, options: sides.map((side) => ({ side })) };
  };
  const readings = c.objects.flatMap((o) => (o.kind === 'polygon' ? [readingOf(o)] : [])).filter((r): r is Reading => r !== null);
  if (readings.length !== 1) return { ok: false, error: noHost(f.src, 'polygon', readings.map((r) => r.poly)) };
  const { options, seat, trapezoid } = readings[0];
  const onSide = <T>(x: T, [u, v]: readonly [Id, Id]): T => JSON.parse(JSON.stringify(x).split(s1).join(u).split(s2).join(v)) as T;
  // SETTLED: the sentence as its lettered twin, claim and all.
  if (options.length === 1 && seat === undefined) return applyAll(c, onSide(f.facts, options[0].side));
  // OPEN: the statement's line once, anonymous; its conditions on the side, per option.
  const mentions = (x: unknown) => JSON.stringify(x).includes(s1) || JSON.stringify(x).includes(s2);
  const once: Fact[] = [];
  const per: Constraint[] = [];
  const renamed = new Map<string, string>();
  for (const g of f.facts) {
    if (!mentions(g)) {
      once.push(g);
      continue;
    }
    if (g.t === 'curve') {
      const id = `curve-${f.role}-${anonOf(g.curve)}`;
      renamed.set(g.id, id);
      once.push({ ...g, id, label: { name: '', ...(g.label.kind ? { kind: g.label.kind } : {}) } });
      continue;
    }
    // The ring's own vertices and sides are already drawn; the role's claim is each option's, except a trapezoid's
    // pair, which every option shares and the claim states once (#1159).
    if (g.t === 'declare' || g.t === 'segment') continue;
    if (g.t === 'role-of') {
      if (trapezoid) once.push(onSide(g, options[0].side));
      continue;
    }
    if (g.t !== 'constraint') return { ok: false, error: { code: 'not-handled', detail: f.src } };
    per.push(g.k);
  }
  const rename = <T>(x: T): T => {
    let text = JSON.stringify(x);
    for (const [from, to] of renamed) text = text.split(JSON.stringify(from)).join(JSON.stringify(to));
    return JSON.parse(text) as T;
  };
  const choice: Constraint = {
    t: 'choice',
    options: options.map(({ side, with: w }) => {
      const of = [...(w ? (w.t === 'all' ? w.of : [w]) : []), ...per.map((k) => onSide(rename(k), side))];
      return of.length === 1 ? of[0] : { t: 'all', of };
    }),
  };
  const drawn = applyAll(c, once);
  if (!drawn.ok) return drawn;
  if (seat === undefined) {
    const out = applyFact(drawn.next, { t: 'constraint', k: choice, src: f.src });
    return out.ok ? { ...out, effect: 'created' } : out;
  }
  const constraints = [...drawn.next.constraints];
  constraints[seat] = choice;
  return { ok: true, effect: 'created', next: { ...drawn.next, constraints } };
}

/**
 * A CEVIAN TO A SIDE NAMED BY ITS ROLE (#2018, ADR-AG-298) — «תיכון לבסיס», «גובה לשוק», "the median to the base".
 *
 * Operator, #1807 (2026-10-06): *"תיכון לבסיס should be allowed and it should change with other configs"*. 2-D's
 * reading (ADR-596), measured at HEAD through `decideDeterministic2D`: the role is read on an ISOSCELES triangle only;
 * the base is the side opposite the apex, a leg a side through it, and a second leg cevian of the same kind takes
 * the other leg (a third adds nothing). The cevian `g` arrives written over {@link ROLE_SIDE_SENTINELS}.
 *
 * - No single isosceles triangle (a plain or equilateral triangle, a trapezoid, none, several) → 2-D's question,
 *   `ambiguous-role-side`. A plain triangle has no base (operator ruling 2026-10-13 on #2018).
 * - SETTLED apex (a stated equal pair) → the lettered twin, exactly («תיכון לצלע BC»), so the figure is the one the
 *   letters draw and nothing rotates.
 * - OPEN apex (the noun's choice) → the derived foot and the segment from the apex, built at the letters of the
 *   option the choice takes at choice seed 0 and BOUND to the role (`follows`); `resolvedAt` re-letters them per
 *   configuration. The choice itself is untouched — the objects are 0-DOF and add no constraint, so adding the line
 *   never moves the triangle. The segment's id is role-anonymous: no fixed pair of letters names it.
 */
function applyRoleCevian(c: Construction, role: 'base' | 'leg', g: Extract<Fact, { t: 'cevian-of' }>, src: string): ApplyOutcome {
  const [s1, s2] = ROLE_SIDE_SENTINELS;
  const ask: ApplyOutcome = { ok: false, error: { code: 'ambiguous-role-side', detail: src, role } };
  const hosts = c.objects.filter(
    (o): o is PolygonObject => o.kind === 'polygon' && o.vertices.length === 3 && o.noun !== undefined && normalizeShapeNoun(o.noun) === 'משולש שווה שוקיים',
  );
  if (hosts.length !== 1) return ask;
  const ring = hosts[0].vertices as [Id, Id, Id];
  const stated = roleVertexOf(c.constraints, ring, role);
  const atSeed0 = resolveChoices(c.constraints, 0);
  const apexes = stated.length > 0 ? stated : roleVertexOf(atSeed0, ring, role);
  if (apexes.length !== 1) return ask; // equal on every side: no one base
  const apex = apexes[0];
  const [p, q] = ring.filter((x) => x !== apex);
  const sides: Array<[Id, Id]> = role === 'base' ? [[p, q]] : [[apex, p], [apex, q]];
  const kind = g.role;
  /** The derivation a cevian of this kind to side `uv` gives its foot — the opposite vertex is its apex. */
  const ruleFor = ([u, v]: [Id, Id]) => toolFootRule(kind, ring.find((x) => x !== u && x !== v)!, u, v);
  const onSide = <T>(x: T, [u, v]: readonly [Id, Id]): T => JSON.parse(JSON.stringify(x).split(s1).join(u).split(s2).join(v)) as T;
  // The figure's objects at the letters `apex` was read at (seed 0's configuration): a bound cevian is compared there.
  const shown = followObjects(c.objects, atSeed0);
  if (stated.length === 1) {
    // A leg not yet holding a cevian of this kind (2-D's #805 pick), else the first: the twin then reuses it.
    const free = sides.find((sd) => !shown.some((o) => o.kind === 'derived' && sameDerivation(o.rule, ruleFor(sd))));
    return applyFact(c, onSide(g, free ?? sides[0]));
  }
  // OPEN. Which sides already carry a bound cevian of this kind.
  if (g.measure) return { ok: false, error: { code: 'not-handled', detail: src } };
  const taken = (sd: [Id, Id]) =>
    shown.some((o) => o.kind === 'derived' && o.follows?.role === role && sameDerivation(o.rule, ruleFor(sd)));
  const side = sides.find((sd) => !taken(sd));
  if (!side) return { ok: true, effect: 'known', next: c };
  const from = ring.find((x) => x !== side[0] && x !== side[1])!;
  const follows = { role, ring: [...ring] as [Id, Id, Id], at: apex };
  const facts = toolFootFacts(kind, from, g.foot, side[0], side[1], src).map((h): Fact =>
    h.t === 'derived' ? { ...h, follows } : h.t === 'segment' ? { ...h, id: `seg-${role}-${anonOf([kind, g.foot, ring])}`, follows } : h,
  );
  return applyAll(c, facts);
}

/** A stable, content-derived suffix for the anonymous line a role sentence draws — the same line, the same id. */
function anonOf(curve: unknown): string {
  const s = JSON.stringify(curve);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function applyAll(c: Construction, facts: readonly Fact[]): ApplyOutcome {
  let next = c;
  let effect: LineEffect = 'known';
  let touchByOnLine = false;
  for (const f of facts) {
    const out = applyFact(next, f);
    if (!out.ok) return out;
    next = out.next;
    if (out.effect === 'created') effect = 'created';
    else if (out.effect === 'narrowed' && effect !== 'created') effect = 'narrowed';
    if (out.touchByOnLine) touchByOnLine = true;
  }
  return { ok: true, next, effect, ...(touchByOnLine ? { touchByOnLine: true as const } : {}) };
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
export function maxCrossings(a: string | null, b: string | null): number | null {
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
/**
 * A LINE REFERRED TO BY ITS NAME IS THE LINE THAT CARRIES THE NAME (#2431, [ADR-AG-317](../../docs/06c-decisions-analytic.md#adr-ag-317)).
 *
 * The parser is context-free, so «הישר l1» in a slot that takes a line reaches M1 as the id `lineIdOf('l1')`. A line
 * that got its name by RESTATEMENT («נתון ישר 4x+y+3=0», then «נתון הישר l1: 4x+y+3=0» — the #1342 narrowing), or
 * from the tool (ADR-AG-314), keeps its content-derived id: only its label carries the name, and the id is never
 * rewritten because constraints already hold it. So every slot that looks a line up BY ID — ∥/⊥, «על», tangency,
 * slope, crossings, position words, a line through a point — found nothing, while the by-name slots (a distance)
 * found the line. One reading of one name, per slot.
 *
 * Resolved here, once, for every fact that reaches the boundary: each line-id reference (never the id the fact
 * itself introduces) that names no object, while a LINE carries that name, is re-pointed at that line. A reference
 * to a line that does not exist is left as it is, so its slot refuses it `unknown-reference`, naming what was typed.
 */
function resolveLineRefs(c: Construction, f: Fact): Fact {
  const own = 'id' in f ? f.id : undefined;
  const moves = new Map<Id, Id>();
  const scan = (v: unknown): void => {
    if (typeof v === 'string') {
      if (v === own || moves.has(v) || refKindOf(v) !== 'line' || objectById(c, v)) return;
      const named = curveByName(c, statedName(v));
      if (named && named.id !== v && curveKindOf(named) === 'line') moves.set(v, named.id);
    } else if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(scan);
  };
  for (const [k, v] of Object.entries(f)) if (k !== 'id' && k !== 'src') scan(v);
  if (moves.size === 0) return f;
  let out = f;
  for (const [from, to] of moves) out = replaceId(out, from, to);
  return own === undefined ? out : ({ ...out, id: own } as Fact);
}

export function applyFact(c: Construction, f0: Fact): ApplyOutcome {
  /*
   * A BOUND LETTER READS ITS VALUE (#2521, ADR-AG-332), in every fact and both orders: «רדיוס מעגל P הוא 9» · «R > r»
   * is «R > 9»; «R = 2r» is «R = 18»; a domain stated for the bound letter itself is a claim about its value.
   */
  const boundValue = f0.t === 'param' ? c.bound?.[f0.sym] : undefined;
  if (f0.t === 'param' && boundValue !== undefined) return judgeBoundParam(c, f0, boundValue);
  const f = resolveLineRefs(c, readBound(c, f0));
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
  /*
   * ONE NAME, ONE THING (#2388, ADR-AG-307): the radius capital R names a point OR the radius parameter, never both. Asked
   * of the CONSTRUCTION, here where every statement lands, so every naming path is covered in both orders: a point, a
   * polygon vertex, a centre, a crossing — and an equation, a radius, a length «AB = 1.6R», a relation.
   */
  const clash = radiusLetterClash(c, out.next);
  if (clash) return { ok: false, error: { code: 'radius-letter-taken', detail: f.src, holder: clash.letter, reading: clash.first } };
  /*
   * A LETTER THAT STANDS FOR A SIZE IS POSITIVE (#2419, ADR-AG-323). Asked of the CONSTRUCTION, here where every
   * statement lands, so every family and both orders are one question: «a < 0» · «AB = a» and «AB = a» · «a < 0» are
   * the same contradiction, refused naming the statement that completed it, as «a < 0» · «שרדיוסו a» already is.
   */
  if (sizeContradiction(out.next) !== null) {
    return { ok: false, error: { code: 'out-of-domain', detail: f.src, domain: positivePart({}) } };
  }
  // A declaration a letter's size role already implies («r > 0» after «x²+y²=r²») adds nothing: already known.
  if (f.t === 'param' && sizeLetters(c).has(f.sym) && sameRegisterDomain(c, out.next, f.sym)) return { ok: true, effect: 'known', next: c };
  const notice = readingTwin(c, f);
  return notice ? { ...out, notice } : out;
}

/** The register gives `sym` the same domain before and after (the role-implied one, #2419). */
function sameRegisterDomain(before: Construction, after: Construction, sym: string): boolean {
  const d = (k: Construction) => paramRegister(k).find((p) => p.sym === sym)?.domain;
  const a = d(before);
  const b = d(after);
  return !!a && !!b && JSON.stringify(normalizeDomain(a)) === JSON.stringify(normalizeDomain(b));
}

/** Which readings the figure gives a radius capital: a positional object by that id, and a symbol something reads. */
export function letterReadings(c: Construction, letter: string): { point: boolean; radius: boolean } {
  const o = objectById(c, letter);
  const point = !!o && isPositional(o);
  return { point, radius: usedSymbols(c).has(letter) };
}

/** The clash a statement introduced: the letter, and the reading the figure held before it (`null` = none). */
function radiusLetterClash(before: Construction, after: Construction): { letter: string; first: 'point' | 'radius' } | null {
  for (const letter of RADIUS_CAPITALS) {
    const o = objectById(after, letter);
    if (!o || !isPositional(o)) continue; // the cheap test first: most figures have no point R
    const now = letterReadings(after, letter);
    if (!now.radius) continue;
    const was = letterReadings(before, letter);
    if (was.point && was.radius) continue; // not this statement's doing
    return { letter, first: was.radius ? 'radius' : 'point' };
  }
  return null;
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
      // A curve whose letters are the tool's (#2619, ADR-AG-354): a letter the figure already uses is renamed to the next
      // free one, in the equation and in the label that shows it, before anything else reads the curve.
      if (f.fresh) return applyFact(c, freshLetters(c, f));
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
            const promoted = toolNamed(c, { ...prior, label, stated: true });
            return {
              ok: true,
              effect: 'created',
              next: {
                ...c,
                objects: c.objects.map((o) => (o.id === f.id ? promoted : o)),
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
        const isLine = curveKindOf(twin) === 'line';
        // One verdict for every line spelling (#2584, ADR-AG-346); a circle or a conic keeps the naming it always had.
        const verdict = restatedLine(held || undefined, !!twin.label.auto, isLine && twin.stated, incoming || undefined);
        if (verdict === 'line-exists') {
          return { ok: false, error: { code: 'line-exists', detail: f.src, twin: twin.id, lineName: incoming } };
        }
        // The TOOL's l-number yields to the student's own name for the same line (#2425 Q3, ADR-AG-319).
        if (verdict === 'rename' && held) {
          const { auto: _tool, ...own } = twin.label;
          const label = { ...own, ...f.label, name: incoming };
          return {
            ok: true,
            effect: 'narrowed',
            next: { ...c, objects: c.objects.map((o) => (o.id === twin.id ? { ...twin, label, stated: twin.stated || f.stated } : o)) },
          };
        }
        if (verdict === 'already-named') {
          return { ok: false, error: { code: 'already-named', detail: f.src, holder: held, ...(isLine ? { holderKind: 'line' as const } : {}) } };
        }
        /**
         * The #1149 promotion rule, reached by the other door: a line first minted as a CARRIER and
         * now stated outright (or now named) visibly gains something, so it is not «כבר ידוע». The
         * incoming label wins except for a name the prior already holds — the student's own.
         */
        if ((incoming && !held) || (f.stated && !twin.stated)) {
          const label = { ...twin.label, ...f.label, name: held || incoming };
          // The student's name is his own, never the tool's (a held tool name is kept only when he gave none).
          if (incoming && !held) delete label.auto;
          const merged = toolNamed(c, { ...twin, label, stated: twin.stated || f.stated });
          return {
            ok: true,
            effect: incoming && !held ? 'narrowed' : 'created',
            next: {
              ...c,
              objects: c.objects.map((o) => (o.id === twin.id ? merged : o)),
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
      /*
       * A NAME ANOTHER CURVE ALREADY CARRIES (#2425, ADR-AG-319): «נתון הישר l1: <eq>» where l1 is the label of a different
       * line — named by restatement (#1342) or by the tool — would draw a second «l1». It is the same restatement as
       * «הישר l1» given twice with two equations, and refused the same way.
       */
      if (f.label.name) {
        const holder = curveByName(c, f.label.name);
        if (holder && holder.id !== f.id) return { ok: false, error: { code: 'conflicting-restatement', detail: f.src } };
      }
      const made = toolNamed(c, { kind: 'curve', id: f.id, label: f.label, curve: f.curve, stated: inheritedStated });
      return {
        ok: true,
        effect: 'created',
        next: {
          ...c,
          objects: [...c.objects, made],
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
      /*
       * A RELATION BETWEEN PARAMETERS IS ABOUT THE FIGURE'S OWN SYMBOLS (#2388, ADR-AG-307). «R = 2r» relates symbols the
       * figure already uses; a letter nothing uses would be a new symbol the relation invents (#1432's «r=5» concern), so
       * the line keeps HEAD's verdict, `not-handled` — the LLM seam, nothing new shown.
       */
      if (f.k.t === 'param-rel') {
        const used = usedSymbols(c);
        if ([...symbolsOf(f.k.left), ...symbolsOf(f.k.right)].some((s) => !used.has(s))) return { ok: false, error: { code: 'not-handled', detail: f.src } };
        /*
         * A ONE-SYMBOL PIN LINEAR IN ITS LETTER («a = 6», «2a = 12», «c = √10», «p = 4») is a VALUE for that letter
         * (#2617, ADR-AG-353): it goes through the one binding seam (ADR-AG-332) — substituted everywhere, recorded in
         * `bound`, its domain checked — exactly as «רדיוס המעגל הוא 5» binds a free radius. A non-linear one («a^2=36»)
         * stays a `param-rel` in the joint solve, so each root is an option and a declared domain filters them
         * (ADR-AG-303). Linearity is read at numeric probes (no CAS, ADR-AG-001 D1).
         */
        const pin = onePinValue(f.k.left, f.k.right);
        if (pin) {
          const bound = bindSymbol(c, pin.sym, pin.value, f.src);
          return bound.ok ? { ok: true, next: bound.next, effect: 'narrowed' } : bound;
        }
      }
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
        const { eqSrc, eq, stated, ...bare } = f.k;
        if (!eq) return applyFact(c, { t: 'constraint', k: bare, src: f.src });
        /*
         * The one equation-operand resolver (#2432, ADR-AG-318). A point placed on an equation holds a CARRIER (ADR-AG-032,
         * the #2423 ruling); a sentence ABOUT the curve («הישר <eq> עובר דרך A», #2425 Q1) states it.
         */
        const role = stated ? 'stated' : 'carrier';
        const op = equationOperand(c, { kind: 'eq', id: f.k.curve, label: eqSrc, eqSrc, eq: eq as Expr, role }, f.src);
        if (!op.ok) return op;
        return applyFact(op.next, { t: 'constraint', k: { ...bare, curve: op.id }, src: f.src });
      }
      /*
       * A RELATION WITH A LINE GIVEN BY ITS EQUATION (#2429, ADR-AG-328), as subject or object: each such operand is
       * resolved in written order (so a second new line is l2), and the relation is then the same statement the named
       * spelling makes.
       */
      /*
       * A SLOPE GIVEN TO A LINE GIVEN BY ITS EQUATION (ADR-AG-328 Am. 1, ruling 2026-10-22) is the same one-operand
       * shape: «שיפוע הישר y=mx+1 הוא 2» resolves the line, then states the slope of that line, which pins m.
       */
      if ((f.k.t === 'relation' && (isEqDirection(f.k.u) || isEqDirection(f.k.v))) || (f.k.t === 'slope' && isEqDirection(f.k.u))) {
        let cur = c;
        let minted = false;
        const dirs: Direction[] = [];
        for (const d of f.k.t === 'relation' ? [f.k.u, f.k.v] : [f.k.u]) {
          if (!isEqDirection(d)) {
            dirs.push(d);
            continue;
          }
          const op = lineOperand(cur, d, f.src);
          if (!op.ok) return op;
          cur = op.next;
          minted ||= op.minted;
          dirs.push({ k: 'curve', id: op.id });
        }
        const k: Constraint = f.k.t === 'relation' ? { ...f.k, u: dirs[0], v: dirs[1] } : { ...f.k, u: dirs[0] };
        return mintedEffect(applyFact(cur, { ...f, k }), minted);
      }
      /*
       * A DISTANCE GIVEN TO A LINE GIVEN BY ITS EQUATION (#2429, ADR-AG-328): the term's line is resolved like any line
       * operand, and the term then holds that curve's id (`curve`), its equation stripped.
       */
      if (f.k.t === 'length-eq' && [...f.k.left.terms, ...f.k.right.terms].some((t) => t.kind === 'point-line' && t.eq !== undefined)) {
        let cur = c;
        let minted = false;
        const sides: LengthExpr[] = [];
        for (const le of [f.k.left, f.k.right]) {
          const terms: MeasureTerm[] = [];
          for (const t of le.terms) {
            if (t.kind !== 'point-line' || t.eq === undefined || t.curve === undefined) {
              terms.push(t);
              continue;
            }
            const op = lineOperand(cur, { id: t.curve, eqSrc: t.line, eq: t.eq }, f.src);
            if (!op.ok) return op;
            cur = op.next;
            minted ||= op.minted;
            const { eq: _eq, ...term } = t;
            terms.push({ ...term, curve: op.id });
          }
          sides.push({ ...le, terms });
        }
        return mintedEffect(applyFact(cur, { ...f, k: { ...f.k, left: sides[0], right: sides[1] } }), minted);
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
      /*
       * A SECOND NAME, OR ANOTHER COEFFICIENT, FOR A STATED ANGLE OR SEGMENT (#2054, #2061; ADR-AG-277 — 2-D's ADR-661).
       * «זוית B=α» · «זוית ABC=β» and «AB=a» · «AB=c» were recorded with both letters (the solve equated two free
       * parameters and the canvas showed the later one); «∠ABC=2α» · «∠ABC=3α» met α = 0 and was refused for whatever
       * the figure happened to hold (a flat triangle, a failed search, or nothing). One predicate (`measureRestatement`,
       * statedMeasures.ts), judged before the absorb so the same statement twice is still `known`; `against` is the
       * earlier constraint, which `derive` turns into its line.
       */
      const restated = measureRestatement(c, f.k);
      if (restated)
        return {
          ok: false,
          error: restated.kind === 'name-taken'
            ? { code: 'name-taken', detail: f.src, holder: restated.holder, nameOf: restated.name, nameKind: f.k.t === 'angle' ? 'angle' : 'length', against: restated.earlier }
            : { code: 'measure-contradicts', detail: f.src, what: restated.what, against: restated.earlier },
        };
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
      /**
       * …and a statement that is ONE PART of some options NARROWS the choice to them (#1864, ADR-AG-267; #1807,
       * ADR-AG-266 — two streams of round #1998 built this one lowering, converged here at integration).
       *
       * An option may be several statements at once (`all`): «שכל קודקודיו מונחים על הצירים» chooses an axis for
       * every vertex in one option, and «משוואת הבסיס היא …» on an open isosceles attaches its line to every apex
       * option. A statement that is PART of some options — «A על ציר ה-x», a later «AB = AC» — is the student
       * consuming part of the discrete freedom, so the options that do not contain it are dropped. When exactly one
       * option survives, the choice collapses to that WHOLE option (never to the statement alone, which would drop
       * the rest of the option, e.g. the base line); otherwise the narrowed choice keeps its slot, so what is still
       * open stays attributed to the sentence that opened it. A statement EVERY option shares narrows nothing.
       */
      const partOf = (o: Constraint): boolean => o.t === 'all' && o.of.some((m) => namesOption(m, f.k));
      const narrows = c.constraints.findIndex((k) => {
        if (k.t !== 'choice') return false;
        const kept = k.options.filter(partOf).length;
        return kept > 0 && kept < k.options.length;
      });
      if (narrows >= 0) {
        const open = c.constraints[narrows] as Extract<Constraint, { t: 'choice' }>;
        const kept = open.options.filter(partOf);
        const narrowed = [...c.constraints];
        narrowed[narrows] = kept.length === 1 ? kept[0] : { t: 'choice', options: kept };
        return { ok: true, effect: 'narrowed', next: { ...c, constraints: narrowed } };
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
      /**
       * «THE CIRCLE ON M» — A REFERENCE BEFORE IT IS A CREATION (#2382, ADR-AG-305). A sentence that names a circle by its
       * centre letter («מעגל N משיק למעגל M», «נתון מעגל M» restated, «מעגל M משיק לציר ה-x») carries this fact with no
       * radius: when the figure already has a circle on that centre — by id, or through the one name chain, which knows a
       * centre named after its circle («M מרכז מעגל I») — the sentence is about THAT circle and creates nothing (M1). Only a
       * centre with no circle gets one, its radius minted in the same step. The relations the sentence carries then read
       * that circle's own centre and radius, so a stated radius is never re-declared as a phantom free parameter.
       */
      if (f.r === undefined) {
        const held = objectById(c, f.id) ?? circleByName(c, f.centre);
        if (held && curveKindOf(held) === 'circle') {
          // A sector's hidden circle STATED by the student (#1622 E4): the same circle, now drawn.
          if (held.kind === 'circle-at' && held.hidden && !f.hidden) return { ok: true, effect: 'created', next: unhidden(c, held.id) };
          return { ok: true, effect: 'known', next: c };
        }
        if (held && held.id === f.id) return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(held) } };
        return stateCircleOn(c, f.centre, f.id, f.src, f.hidden);
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
      // The copied direction may be a line given by its EQUATION (#2429, ADR-AG-328): resolved first, then the same line.
      if (isEqDirection(f.dir)) {
        const op = lineOperand(c, f.dir, f.src);
        if (!op.ok) return op;
        return mintedEffect(applyFact(op.next, { ...f, dir: { k: 'curve', id: op.id } }), op.minted);
      }
      const through = objectById(c, f.through);
      if (!through || !isPositional(through)) {
        return { ok: false, error: unknownRef(c, f.through) };
      }
      /*
       * THE DIRECTION MUST NAME SOMETHING THE FIGURE HAS (#2431, ADR-AG-317). «ישר דרך A מקביל לישר l1» on a figure
       * with no l1 used to be CREATED, with a `dir` pointing at nothing: the row recorded with no fault and nothing was
       * drawn — a stated construction that vanished. The same references a relation's operand is held to (#1150).
       */
      const missingDir =
        dirRefs(f.dir).find((id) => {
          const o = objectById(c, id);
          return !o || !isPositional(o);
        }) ??
        dirCurveRefs(f.dir).find((id) => {
          const o = objectById(c, id);
          return !o || !CURVE_BEARING.has(o.kind);
        });
      if (missingDir !== undefined) return { ok: false, error: unknownRef(c, missingDir) };
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
      /*
       * THE SAME CONSTRUCTION, NAMED OR NOT, IS ONE LINE (#1138, ADR-AG-341; its rename-in-place withdrawn by #2584,
       * ADR-AG-346). A line through a point with a stated direction is identified by what builds it (ADR-AG-023). Stated
       * again, it is `restatedLine`'s verdict, the equation arm's: the unnamed restatement is known; «l2 הוא האנך
       * האמצעי ל-EK» after the unnamed «האנך האמצעי לקטע EK» is refused `line-exists` (the submit path offers «נסמן את
       * האנך האמצעי ל-EK ב-l2»); a second name is `already-named`. Never a second, coincident line.
       */
      const twin = lineAtTwin(c, f);
      if (twin && !f.name) return { ok: true, effect: 'known', next: c };
      if (twin && f.drawn !== false) {
        const verdict = restatedLine(twin.name, false, true, f.name);
        if (verdict === 'known') return { ok: true, effect: 'known', next: c };
        if (verdict === 'already-named') return { ok: false, error: { code: 'already-named', detail: f.src, holder: twin.name, holderKind: 'line' } };
        return { ok: false, error: { code: 'line-exists', detail: f.src, twin: twin.id, lineName: f.name } };
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
        lead.push({ t: 'circle-at', id: `circle-at-${v}`, centre: v, hidden: true, src: f.src });
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
      if (f.host) {
        // «AB קוטר באליפסה» (#2618, ADR-AG-355; operator ruling 2026-10-30, Q3): the chord through the ellipse's
        // centre — the general lowering below, whose ray from the centre the resolved ellipse supplies.
        const conic = curveHost(c, f.host, undefined, f.src);
        if (!conic.ok) return conic;
        host = conic.o;
      } else if (f.circle !== undefined) {
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
      /*
       * «הישר המקביל», «האנך האמצעי» — the one auxiliary line of that ROLE (#1138, ADR-AG-341). Read off the construction:
       * a parallel is a `line-at` that is not perpendicular and copies a stated direction; a perpendicular bisector is a
       * perpendicular `line-at` through the midpoint of the very pair it is perpendicular to.
       */
      if (f.kind === 'parallel' || f.kind === 'perp-bisector') {
        // A NAME narrows it («הישר l1 המקביל»): the one parallel line of that name.
        const lines = c.objects.filter(
          (o) =>
            o.kind === 'line-at' &&
            o.drawn !== false &&
            (f.kind === 'parallel' ? isParallelLine(o) : isPerpBisector(c, o)) &&
            (f.line === undefined || o.name === f.line || o.id === lineIdOf(f.line)),
        );
        // Several bisectors are refused by count: the taught remedy names a line, and «הישר <name>» is the sentence that reads.
        if (lines.length !== 1) return { ok: false, error: noHost(f.src, 'line', f.kind === 'parallel' ? lines : lines.length) };
        return applyFact(c, { t: 'constraint', k: { t: 'on-curve', id: f.id, curve: lines[0].id }, src: f.src });
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
      /*
       * #2397 (ADR-AG-322): EVERY CIRCLE THE TOOL DREW — asked of the expression (`isCreatedCircle`, ADR-AG-219), never of
       * the id. A pair «שני מעגלים» drew, «נתון מעגל»'s, the touch's: each takes the stated equation the same way, and
       * what a statement already said about it is carried, never dropped (`describeDrawnCircle`).
       */
      if (isCreatedCircle(host)) {
        const described = describeDrawnCircle(c, host, f.eq, f.src);
        if (described) return described;
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
      const lowered = applyAll(c, [
        { t: 'point', id: host.centre, x: num(cx), y: num(cy), src: f.src },
        { t: 'radius-of', circleId: host.id, value: num(r), src: f.src },
      ]);
      // #2119 (ADR-684): an EQUATION against a stated radius keeps its conflict sentence, in both orders — the ruled
      // radius sentence is for a radius sentence (the equation-first order meets the curve arm's errConflict)
      return !lowered.ok && lowered.error.code === 'radius-contradicts' ? { ok: false, error: { code: 'conflicting-restatement', detail: f.src } } : lowered;
    }

    case 'centre-of': {
      // No creation the sentence can stand for (the centre letter reads as a circle numeral): refused by
      // name rather than absorbed as though it had said nothing.
      const create = (): ApplyOutcome =>
        f.create ? applyAll(c, f.create) : { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      let host: GeoObject | undefined;
      /*
       * «מרכז המעגל הראשון / השני הוא X(a,b)» (#2552, ADR-AG-336) — circle 1 or 2 of the pair the figure drew, in the
       * order the pair sentence introduced them. The member whose centre is still unnamed is named X (`namingByOrder`, as
       * «X מרכז מעגל» names by order); two drawn pairs with that member unnamed ask which. A member whose centre is X
       * already is known; one lettered otherwise is the existing «already named» refusal. No drawn pair: the sentence
       * reads as it does without the ordinal.
       */
      if (f.ordinal !== undefined) {
        const members = c.objects.filter((o) => curveKindOf(o) === 'circle' && new RegExp(`^circle-pair\\d+-${f.ordinal}$`).test(o.id));
        if (members.some((o) => centreIdOf(c, o) === f.id)) return { ok: true, effect: 'known', next: c };
        const open = members.filter((o) => centreRuleOf(o) !== null && centreIdOf(c, o) === null);
        if (open.length > 1) return { ok: false, error: noHost(f.src, 'circle', open) };
        if (open.length === 1 && !objectById(c, f.id)) return namingByOrder(c, open[0], f.id, f);
        const named = members.length === 1 ? centreIdOf(c, members[0]) : null;
        if (open.length === 0 && named !== null) return { ok: false, error: { code: 'already-named', detail: f.src, holder: statedName(named) } };
      }
      if (f.circleId !== undefined) {
        host = objectById(c, f.circleId);
        if (!host || curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, f.circleId) };
      } else if (f.circle !== undefined) {
        host = circleByName(c, f.circle);
        if (!host || curveKindOf(host) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circle)) };
      } else if (f.eq !== undefined) {
        const id = resolveCurveByEq(c, f.eq);
        /*
         * «מרכזו של המעגל האחד הוא בנקודה M ומשוואתו היא …» (#2397, ADR-AG-322) — one of the pair the figure drew: the
         * first of an interchangeable pair (or the one whose sibling is named, «האחר») has its centre named M by order
         * (ADR-AG-219), then takes the equation (`describeDrawnCircle`). A pair a statement tells apart asks which. No
         * drawn circle: the circle is created, as the sentence without the ordinal creates it.
         */
        if (!id && f.ofPair && !objectById(c, f.id)) {
          const pick = circleToName(c);
          if (pick?.t === 'ask') return { ok: false, error: noHost(f.src, 'circle', pick.circles) };
          if (pick?.t === 'name') {
            const named = namingByOrder(c, pick.host, f.id, f);
            if (!named.ok) return named;
            const described = applyFact(named.next, { t: 'circle-eq', circleId: pick.host.id, eq: f.eq, src: f.src });
            return described.ok ? { ...described, effect: 'created' } : described;
          }
        }
        if (!id) return create();
        host = objectById(c, id);
        if (host && curveKindOf(host) !== 'circle') {
          return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(host) } };
        }
      } else {
        const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
        if (circles.length === 0) return create();
        /*
         * «X מרכז מעגל» — A circle (#2552 D9, ADR-AG-344; operator ruling D9 = A, 2026-10-26). Once every circle on the
         * figure has a centre letter, and none of them is X, no circle is left for the sentence to name: it states a new
         * circle centred at X: the sentence's own creation («נתון מעגל שמרכזו X», the lowering an empty figure takes, whose
         * circle-on-a-centre is `stateCircleOn`'s, as #1670's `statingNamedCircle` states it), and says so (`createdCircle`
         * → «נוצר מעגל חדש שמרכזו X …»). While a centre is unnamed it names that one, exactly as «המעגל» does; the definite
         * form never creates.
         */
        if (f.indefinite && circles.every((o) => centreIdOf(c, o) !== null) && !circles.some((o) => centreIdOf(c, o) === f.id)) {
          const stated = create();
          return stated.ok ? { ...stated, effect: 'created', createdCircle: f.id } : stated;
        }
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
      /*
       * A LINE GIVEN BY ITS EQUATION is resolved before anything reads the lines (#2432, ADR-AG-318): the figure's own
       * line with that equation, or a curve minted in the operand's role. The tangency below then reads only ids.
       */
      if (f.lines?.some((l) => l.kind === 'eq')) {
        let cur = c;
        let minted = false;
        const lines: TangentLineRef[] = [];
        for (const l of f.lines) {
          if (l.kind !== 'eq') {
            lines.push(l);
            continue;
          }
          const op = equationOperand(cur, l, f.src);
          if (!op.ok) return op;
          cur = op.next;
          minted ||= op.minted;
          lines.push({ kind: 'curve', id: op.id, label: l.label });
        }
        const out = applyFact(cur, { ...f, lines });
        return out.ok && minted && out.effect === 'known' ? { ...out, effect: 'created' } : out;
      }
      const tangentLines = (f.lines ?? []) as TangentLineRef[];
      let host: GeoObject | undefined;
      if (f.circleId !== undefined) {
        host = objectById(c, f.circleId);
        // A host M1 itself resolved: a circle, or the ellipse / parabola a tangent object was built on (#2618).
        const k = host ? curveKindOf(host) : null;
        if (!host || (k !== 'circle' && k !== 'ellipse' && k !== 'parabola')) return { ok: false, error: unknownRef(c, f.circleId) };
      } else if (f.host) {
        // «הישר … משיק לאליפסה / לפרבולה» (#2618, ADR-AG-355): the figure's one conic of that kind.
        const conic = curveHost(c, f.host, undefined, f.src);
        if (!conic.ok) return conic;
        host = conic.o;
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
      if (f.at !== undefined) return applyTouchAt(c, host, f.at, f.axes, tangentLines, f.src);
      /**
       * A circle the figure DETERMINES — stated by its equation, or computed from points (#1430 step 1,
       * ADR-AG-195): the distance from ITS centre to the line is ITS radius, both read off the resolved
       * circle (`tangent-curve`), so the freedom consumed is the line's («y=kx+1» pins k). An AXIS has no
       * freedom to give, so a determined circle touching one is a claim this rule does not judge — refused
       * BY NAME (`out-of-scope`), never dropped (the `diameter-of` rule, one case up).
       */
      /*
       * …and an ELLIPSE or a PARABOLA (#2618, ADR-AG-355): the same `tangent-curve`, whose row on a conic is the double
       * root of the line's substitution (`conicTangencyRows`); an axis is refused by name, as on a determined circle.
       */
      if (host.kind !== 'circle-at') {
        if (f.axes.length > 0) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
        const circleId = host.id;
        return applyAll(
          c,
          tangentLines.map((line) => ({ t: 'constraint' as const, k: { t: 'tangent-curve' as const, circle: circleId, line }, src: f.src })),
        );
      }
      const circle = host;
      return applyAll(c, [
        ...f.axes.map((axis) => ({
          t: 'constraint' as const,
          k: { t: 'tangent-axis' as const, centre: circle.centre, r: circle.r, axis },
          src: f.src,
        })),
        ...tangentLines.map((line) => ({
          t: 'constraint' as const,
          k: { t: 'tangent-line' as const, centre: circle.centre, r: circle.r, line },
          src: f.src,
        })),
      ]);
    }

    /**
     * A COMMON TANGENT'S TOUCHES, DECIDED AGAINST THE FIGURE (#2385, ADR-AG-312). The line ab is tangent to both
     * circles. A common tangent through the circles' common point T can only be the tangent AT T (a line through a
     * point of a circle, tangent to it, touches it there), and there its two touches coincide. So when the figure
     * already puts the circles' stated touch point on ab («T על AB», or T one of the letters), the line is lowered as
     * the tangent to the first circle at T, the at-form's lowering («… בנקודה T»), which the second circle shares.
     * Otherwise `a` touches the first circle and `b` the second, as every common tangent was lowered before.
     *
     * THE COMMON TANGENT IS A LINE (#2392, #2390 §3, ADR-AG-313): it is drawn as the `line-at` through a along a→b —
     * the object the at-form's «הישר CD» is — named by the sentence («הישר l …») or by its pair, so it is listed with
     * its equation row. A line the figure already has over the pair is that line (named now, when the sentence names
     * it); a name the figure already holds as a line is that line, and the touches are stated on it.
     */
    case 'common-tangent': {
      const [c1, c2] = f.circles;
      if (f.name !== undefined) {
        const held = curveByName(c, f.name);
        if (held && curveKindOf(held) !== 'line') return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(held) } };
        if (held) {
          const on: TangentLineRef = { kind: 'curve', id: held.id, label: f.name };
          return applyAll(c, [
            { t: 'tangent-of', axes: [], lines: [on], circleId: c1, at: f.a, src: f.src },
            { t: 'tangent-of', axes: [], lines: [on], circleId: c2, at: f.b, src: f.src },
          ]);
        }
      }
      const line: TangentLineRef = { kind: 'points', a: f.a, b: f.b };
      const touch = touchPointOf(c, c1, c2);
      /*
       * THE PAIR HAS ONLY THE TOUCH TANGENT (#2418, ADR-AG-321): circles touching from inside have one common tangent, the
       * line through their common point; circles touching from outside have one INTERNAL common tangent, the same line.
       * Either way the two-touch lowering has no configuration in any order, so the line is the tangent at the stated
       * touch point — how the pair sits read off the figure as stated (`pairPositionOf`, ADR-AG-314), 2-D's capacity exit.
       */
      const position = touch !== null ? pairPositionOf(c, c1, c2) : null;
      const onlyTouch = (position === 'int-tangent' && f.kind !== 'internal') || (position === 'ext-tangent' && f.kind === 'internal');
      const figureSays = touch !== null && (touch === f.a || touch === f.b || onlyTouch || footOnPair(c, touch, f.a, f.b));
      const linesSay = touch !== null && !figureSays && f.onLine?.includes(touch) === true;
      const touches: Fact[] =
        figureSays || linesSay
          ? [{ t: 'tangent-of', axes: [], lines: [line], circleId: c1, at: touch!, src: f.src }]
          : [
              { t: 'tangent-of', axes: [], lines: [line], circleId: c1, at: f.a, src: f.src },
              { t: 'tangent-of', axes: [], lines: [line], circleId: c2, at: f.b, src: f.src },
            ];
      const touched = applyAll(c, touches);
      if (!touched.ok) return touched;
      const drawn = applyFact(touched.next, { t: 'name-line', a: f.a, b: f.b, name: f.name ?? `${f.a}${f.b}`, src: f.src });
      return drawn.ok ? { ...drawn, effect: 'created', ...(linesSay ? { touchByOnLine: true as const } : {}) } : drawn;
    }

    /**
     * «כל המשיקים המשותפים לשני המעגלים» — EVERY COMMON TANGENT OF THE PAIR (#2390, ADR-AG-314). How the pair sits is
     * read off the figure as the student stated it (`pairPositionOf`): 4 for circles apart, 3 for externally tangent,
     * 2 for crossing, 1 for internally tangent; a circle inside the other has none (2-D's refusal); a pair the givens
     * leave unsettled is not this sentence's to decide (the model's, as before). Each is a `common-tangent` object,
     * named by the student or the next free l1, l2, … in family order — external first.
     */
    case 'common-tangents':
    case 'common-touch-tangent': {
      const [c1, c2] = f.circles;
      const position = pairPositionOf(c, c1, c2);
      // The touch tangent needs only that the circles TOUCH: «המעגלים משיקים (בנקודה T)» with no מבחוץ / מבפנים is
      // tangent either way, and either way has the one tangent at the common point.
      const touching = position === 'ext-tangent' || position === 'int-tangent' || statedTangent(c, c1, c2);
      if (f.t === 'common-touch-tangent' && !touching) return { ok: false, error: { code: 'not-handled', detail: f.src } };
      if (f.t === 'common-tangents' && position === null) return { ok: false, error: { code: 'not-handled', detail: f.src } };
      if (position === 'inside') return { ok: false, error: { code: 'no-common-tangent', detail: f.src } };
      const families = f.t === 'common-touch-tangent' ? (['touch'] as const) : FAMILIES_OF[position!];
      const given = f.t === 'common-tangents' ? f.names : f.name !== undefined ? [f.name] : undefined;
      if (given && given.length !== families.length) return { ok: false, error: { code: 'unsatisfiable', detail: f.src } };
      const names = given ?? freeLineNames(c, families.length);
      let next = c;
      for (let i = 0; i < families.length; i++) {
        const id = lineIdOf(names[i]);
        const held = curveByName(next, names[i]) ?? objectById(next, id);
        if (held) {
          // The same tangent stated again is known; any other holder of the name is the clash the figure already says.
          if (held.kind === 'common-tangent' && held.family === families[i] && held.circles.join() === f.circles.join()) continue;
          return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(held) } };
        }
        next = { ...next, objects: [...next.objects, { kind: 'common-tangent', id, circles: [c1, c2], family: families[i], name: names[i] }] };
      }
      return { ok: true, next, effect: next === c ? 'known' : 'created' };
    }

    /**
     * «נסמן את הישר PQ ב-l» — THE LINE THROUGH TWO POINTS TAKES A NAME (#2392, ADR-AG-313). The figure's line over the
     * pair (`lineOverPair`) is RE-NAMED: its id becomes the name's (`lineIdOf`), so «הישר l …» finds it as every named
     * line is found, and every reference to the old id follows it. Only the segment, or nothing, over the pair: the
     * `line-at` through a along a→b is drawn under that name (the common tangent's own line comes here too). A line
     * that already carries a student name other than its letters, or a name the figure holds as another object, is
     * the existing clash refusal.
     */
    case 'name-line': {
      for (const id of [f.a, f.b]) {
        const p = objectById(c, id);
        if (!p || !isPositional(p)) return { ok: false, error: unknownRef(c, id) };
      }
      if (f.a === f.b) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      const id = lineIdOf(f.name);
      const prior = lineOverPair(c, f.a, f.b);
      const holder = curveByName(c, f.name) ?? objectById(c, id);
      if (holder && holder !== prior) return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(holder) } };
      if (!prior) {
        return applyFact(c, { t: 'line-at', id, through: f.a, dir: { k: 'points', a: f.a, b: f.b }, perp: false, name: f.name, src: f.src });
      }
      const letters = (n: string | undefined) => n === undefined || n === '' || n === `${f.a}${f.b}` || n === `${f.b}${f.a}`;
      const own = prior.kind === 'line-at' ? prior.name : prior.kind === 'curve' ? prior.label.name : undefined;
      if (prior.id === id && own === f.name) return { ok: true, effect: 'known', next: c };
      if (!letters(own)) return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(prior) } };
      const renamed: GeoObject =
        prior.kind === 'line-at' ? { ...prior, id, name: f.name } : prior.kind === 'curve' ? { ...prior, id, label: { ...prior.label, name: f.name } } : prior;
      if (renamed === prior) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      const next: Construction = {
        ...c,
        objects: c.objects.map((o) => (o === prior ? renamed : replaceId(o, prior.id, id))),
        constraints: c.constraints.map((k) => replaceId(k, prior.id, id)),
        selectors: c.selectors.map((s) => replaceId(s, prior.id, id)),
      };
      return { ok: true, effect: 'narrowed', next };
    }

    /**
     * «נסמן את האנך האמצעי ל-EK ב-l2» — A LINE NAMED BY ITS DESCRIPTION (#2584, ADR-AG-346), the sentence the `line-exists`
     * refusal offers. The description builds the line, or restates the one the figure draws (its `line-at` arm: known);
     * the figure's line that IS that construction then takes the name exactly as `name-line` gives one: its id becomes
     * the name's, and every reference follows it. Naming gives a name only to what has none (#1109): a line the student
     * named is `already-named`, a name another object holds is the clash.
     */
    case 'name-line-object': {
      const built = applyAll(c, f.operand.map((g) => ({ ...g, src: f.src }) as Fact));
      if (!built.ok) return built;
      const lineAt = f.operand.find((g): g is Extract<Fact, { t: 'line-at' }> => g.t === 'line-at');
      const target = objectById(built.next, f.line) ?? (lineAt ? lineAtTwin(built.next, lineAt) : undefined);
      if (!target || target.kind !== 'line-at') return { ok: false, error: { code: 'not-handled', detail: f.src } };
      const id = lineIdOf(f.name);
      if (target.name === f.name) return built.effect === 'known' ? { ok: true, effect: 'known', next: c } : built;
      if (target.name) return { ok: false, error: { code: 'already-named', detail: f.src, holder: target.name, holderKind: 'line' } };
      const holder = curveByName(built.next, f.name) ?? objectById(built.next, id);
      if (holder && holder !== target) return { ok: false, error: { code: 'name-kind-clash', detail: f.src, existing: existingKindOf(holder) } };
      const n = built.next;
      return {
        ok: true,
        effect: built.effect === 'created' ? 'created' : 'narrowed',
        next: {
          ...n,
          objects: n.objects.map((o) => (o === target ? { ...target, id, name: f.name } : replaceId(o, target.id, id))),
          constraints: n.constraints.map((k) => replaceId(k, target.id, id)),
          selectors: n.selectors.map((s) => replaceId(s, target.id, id)),
        },
      };
    }

    /**
     * «המשיק למעגל בנקודה A» — the tangent line as an OBJECT (#1619 B3, ADR-AG-195). The circle is
     * resolved by the `tangent-of` chain; A lies on it, and the line through A is perpendicular to the
     * radius there — a `line-at` on the radius direction turned a quarter, 0 DOF, closed form.
     */
    case 'tangent-line-at': {
      // The curve resolver (#2618, ADR-AG-355): the circle chain, or the figure's one ellipse / parabola.
      const host = curveHost(c, f.host, f.circle, f.src);
      // A named circle the figure lacks is stated by the reference (#1670, ADR-AG-210): «המשיק למעגל O בנקודה A».
      if (!host.ok && f.circle !== undefined && !circleByName(c, f.circle)) return statingNamedCircle(c, f.circle, f) ?? host;
      if (!host.ok) return host;
      return applyAll(c, [
        { t: 'constraint', k: { t: 'on-curve', id: f.at, curve: host.o.id }, src: f.src },
        { t: 'line-at', id: tangentLineId(f.at), through: f.at, dir: touchNormal(host.o, f.at), perp: true, src: f.src },
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
      /*
       * The stated line is an EQUATION OPERAND (#2432, ADR-AG-318): when the figure already holds a line with that
       * equation, the tangent IS that line. With a tangent object it is a carrier of the object's equation (one line is
       * never drawn twice, ADR-AG-195); with none it is the line the sentence states, drawn.
       */
      const operand = (role: EqOperand['role']): EqOperand => ({
        kind: 'eq',
        id: f.id,
        label: f.eqSrc,
        eqSrc: f.eqSrc,
        eq: f.eq,
        role,
        ...(role === 'stated' ? { line: true as const } : {}),
      });
      if (tangents.length === 1) {
        const t = tangents[0] as Extract<GeoObject, { kind: 'line-at' }>;
        const circleId = t.dir.k === 'radius' ? t.dir.circle : t.dir.k === 'normal' ? t.dir.curve : undefined;
        return applyFact(c, { t: 'tangent-of', axes: [], lines: [operand('carrier')], ...(circleId ? { circleId } : {}), at: t.through, src: f.src });
      }
      return applyFact(c, { t: 'tangent-of', axes: [], lines: [operand('stated')], ...(f.circle !== undefined ? { circle: f.circle } : {}), ...(f.host ? { host: f.host } : {}), src: f.src });
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
          /**
           * EVERYWHERE the symbol stands, not only on the circle (am. 1): a tangency stated with the
           * circle («נתון מעגל O משיק לציר ה-x») carries `r_O` in its own constraint, and replacing the
           * radius on the object alone left that constraint solving a different, still-free radius —
           * the circle drawn at r = 5 while the tangency held for some other r. And a relation over the LETTER («R > r»,
           * before or after) reads the value too: the binding seam (#2521, ADR-AG-332).
           */
          const bound = bindSymbol(c, sym, f.value, f.src);
          return bound.ok ? { ok: true, next: bound.next, effect: 'narrowed' } : bound;
        }
        // A radius already carried by the object: a RESTATEMENT, judged at the probes. A different one is refused in 2-D's
        // ruled sentence naming the line that sized the circle (#2119, ADR-684 — operator ruling 2026-10-15, every builder).
        return sameNumbers(host.r, f.value)
          ? { ok: true, next: c, effect: 'known' }
          : { ok: false, error: { code: 'radius-contradicts', detail: f.src, circle: host.id } };
      }
      if (isCreatedCircle(host) && JSON.stringify(host.curve).includes(`"${toolSymbol(host.id, 'r')}"`)) {
        /*
         * A CREATED circle's radius is the tool's free symbol (ADR-AG-198): the student just gave it, so it is pinned
         * exactly as a centred circle's `r_O` is (above) — «A על המעגל» · «רדיוס המעגל הוא 5», «מעגל בקוטר 10» (2-D
         * sets the radius of its unnamed circle; ADR-AG-219).
         */
        const bound = bindSymbol(c, toolSymbol(host.id, 'r'), f.value, f.src);
        return bound.ok ? { ok: true, next: bound.next, effect: 'narrowed' } : bound;
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
      // THE ELLIPSE the same way (#2616, ADR-AG-353): a sentence naming no host means the figure's one conic with a focus.
      const kinds: readonly string[] = f.host ? [f.host] : ['parabola', 'ellipse'];
      const hosts = c.objects.filter((o) => kinds.includes(curveKindOf(o) ?? ''));
      if (hosts.length !== 1) {
        const kind = f.host ?? (hosts.length > 0 && hosts.every((o) => curveKindOf(o) === 'ellipse') ? 'ellipse' : 'parabola');
        return { ok: false, error: noHost(f.src, kind, hosts.length) };
      }
      const host = hosts[0];
      if (curveKindOf(host) === 'ellipse') {
        // A side word names the end of the MAJOR axis AND asserts which axis that is (docs/17 §3b law 1); no side is a
        // choice of the two foci (02c R14), cycled by «הציגו תצורה אחרת».
        const which: Array<0 | 1> = f.side ? [f.side === 'right' || f.side === 'top' ? 0 : 1] : [0, 1];
        const axis = f.side ? (f.side === 'right' || f.side === 'left' ? 'x' : 'y') : undefined;
        return nameEllipseRole(c, f.id, host.id, which.map((w) => ({ k: 'focus' as const, which: w })), axis, f.src);
      }
      // A parabola has one focus; a side word about it names nothing the figure can check.
      if (f.side) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      return applyFact(c, { t: 'derived', id: f.id, rule: { t: 'parabola-focus', curve: host.id }, src: f.src });
    }

    /**
     * «F1 ו-F2 מוקדי האליפסה» · «מוקדי האליפסה הם A ו-C» (#2616, ADR-AG-353) — both foci of THE ellipse named. Which letter
     * is which focus the sentence does not say: a choice of the two orders (02c R14), each option both `derived-at`s.
     */
    case 'foci-of': {
      const [p, q] = f.ids;
      if (p === q) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      const host = theEllipse(c, f.src);
      if (!host.ok) return host;
      const at = (id: Id, which: 0 | 1): Constraint => ({ t: 'derived-at', id, rule: { t: 'ellipse-point', curve: host.id, role: { k: 'focus', which } } });
      return applyAll(c, [
        { t: 'declare', id: p, src: f.src },
        { t: 'declare', id: q, src: f.src },
        { t: 'constraint', k: { t: 'choice', options: [{ t: 'all', of: [at(p, 0), at(q, 1)] }, { t: 'all', of: [at(p, 1), at(q, 0)] }] }, src: f.src },
      ]);
    }

    /**
     * «A הקודקוד הימני של האליפסה» · «A הוא הקצה הימני של הציר הגדול» · «A קודקוד האליפסה» (#2616, ADR-AG-353). A side
     * names the vertex; a side on a named axis also asserts that axis's direction; no side is a choice (02c R14).
     */
    case 'vertex-of': {
      const host = theEllipse(c, f.src);
      if (!host.ok) return host;
      if (f.side) {
        const horizontal = f.side === 'right' || f.side === 'left';
        const axis = f.axis === undefined ? undefined : (f.axis === 'major') === horizontal ? 'x' : 'y';
        return nameEllipseRole(c, f.id, host.id, [{ k: 'vertex', side: f.side }], axis, f.src);
      }
      const roles: EllipseRole[] = f.axis
        ? ([0, 1] as const).map((which) => ({ k: f.axis === 'major' ? ('major-end' as const) : ('minor-end' as const), which }))
        : (['right', 'left', 'top', 'bottom'] as const).map((side) => ({ k: 'vertex' as const, side }));
      return nameEllipseRole(c, f.id, host.id, roles, undefined, f.src);
    }

    /**
     * A SENTENCE WITH AN ELLIPSE'S ROLE POINTS AS OPERANDS (#2616/#2617, ADR-AG-353) — the `via-centre` substitution one
     * conic over. THE ellipse (the host refusal for none or several); each sentinel becomes the letter of the point that
     * already holds that role, or — unlettered — the role itself inside the measure (`ellipse-dist`): the stated
     * distance is a real given, and nothing new is drawn (operator ruling 2026-10-30, Q1 → A). A side word's major-axis
     * direction is recorded; with none stated anywhere, a parameterised ellipse's size leaves the direction an open
     * choice, x first (02c R14, ADR-052).
     */
    case 'via-ellipse-role': {
      const host = theEllipse(c, f.src);
      if (!host.ok) return host;
      let text = JSON.stringify(f.facts);
      const open = new Map<string, EllipseRole>();
      f.roles.forEach((use, i) => {
        const s = ELLIPSE_ROLE_SENTINELS[i];
        const holder = c.objects.find(
          (o) => o.kind === 'derived' && o.rule.t === 'ellipse-point' && o.rule.curve === host.id && sameEllipseRole(o.rule.role, use.role),
        );
        if (holder) text = text.split(s).join(holder.id);
        else open.set(s, use.role);
      });
      const mentionsOpen = (v: unknown): boolean => open.size > 0 && [...open.keys()].some((s) => JSON.stringify(v).includes(s));
      const end = (id: Id): RoleEnd => (open.has(id) ? { role: open.get(id)! } : { p: id });
      const lowerTerms = (le: LengthExpr): LengthExpr => ({
        ...le,
        terms: le.terms.map((t) =>
          (t.kind === undefined || t.kind === 'length') && (open.has(t.a) || open.has(t.b)) ? { kind: 'ellipse-dist' as const, u: end(t.a), v: end(t.b), curve: host.id } : t,
        ),
      });
      const facts = (JSON.parse(text) as Fact[])
        // An unlettered role point is not drawn: no segment to it, no point declared for it.
        .filter((g) => !((g.t === 'segment' || g.t === 'declare') && mentionsOpen(g)))
        .map((g): Fact => (g.t === 'constraint' && g.k.t === 'length-eq' ? { ...g, k: { ...g.k, left: lowerTerms(g.k.left), right: lowerTerms(g.k.right) } } : g));
      // A role used anywhere but a distance has no letter to stand on — the unknown reference it is, in the student's words.
      if (facts.some(mentionsOpen)) return { ok: false, error: { code: 'unknown-reference', detail: f.phrase, expected: 'point' } };
      const axes = [...new Set(f.roles.flatMap((u) => (u.axis ? [u.axis] : [])))];
      const sels: Fact[] = axes.map((axis) => ({ t: 'selector', sel: { kind: 'major-axis', curve: host.id, axis }, src: f.src }));
      const out = applyAll(c, [...facts, ...sels]);
      if (!out.ok || axes.length > 0) return out;
      return withOpenOrientation(out, host.id);
    }

    /** «שהציר הגדול שלה על ציר ה-y» (#2619, ADR-AG-354) — THE ellipse's major-axis direction, as its selector. */
    case 'major-axis-of': {
      const host = theEllipse(c, f.src);
      if (!host.ok) return host;
      return applyFact(c, { t: 'selector', sel: { kind: 'major-axis', curve: host.id, axis: f.axis }, src: f.src });
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

    /**
     * «אורכו של הקטע המחבר את מרכזי המעגלים הוא 9» (#2391 B1, ADR-AG-315) — the two circles by the one pair resolver
     * (`tangent-circles`' own), and the lettered twin applied with their centres written in. A circle whose centre has no
     * letter (an equation circle nobody named the centre of) is refused as `via-centre` refuses «מרכז המעגל», by phrase.
     */
    case 'centres-distance': {
      const pair = circlePairOf(c, f.circles?.[0], f.circles?.[1], f.src);
      if (!pair.ok) return pair;
      const [a, b] = pair.pair;
      if (a === b) return { ok: false, error: { code: 'unsatisfiable', detail: f.src } };
      const centres = [centreIdOf(c, a), centreIdOf(c, b)];
      if (centres.some((x) => x === null)) return { ok: false, error: { code: 'unknown-reference', detail: 'מרכזי המעגלים', expected: 'point' } };
      const [z1, z2] = CENTRES_SENTINELS;
      const text = JSON.stringify(f.facts).split(z1).join(centres[0]!).split(z2).join(centres[1]!);
      return applyAll(c, (JSON.parse(text) as Fact[]).map((g) => ({ ...g, src: f.src })));
    }

    /**
     * «דרך הנקודה A עובר משיק למעגל I» (#2391, ADR-AG-315) — through a point the figure puts ON that circle
     * (`onCurveByConstruction`, the one answer), the tangent is the one AT the point: «המשיק למעגל I בנקודה A», its
     * object and its 0-DOF closed form. Any other point keeps the from-point construction (#1430), whose two tangents
     * are the solve's two roots.
     */
    case 'tangent-through': {
      const kind = f.host ?? 'circle';
      const circles = c.objects.filter((o) => curveKindOf(o) === kind);
      const host = f.circle !== undefined ? circleByName(c, f.circle) : circles.length === 1 ? circles[0] : undefined;
      if (host && curveKindOf(host) === kind && onCurveByConstruction(c, host, f.at)) {
        return applyFact(c, { t: 'tangent-line-at', at: f.at, ...(f.circle !== undefined ? { circle: f.circle } : {}), ...(f.host ? { host: f.host } : {}), src: f.src });
      }
      return applyAll(c, f.facts);
    }

    /**
     * A CIRCLE AND A CONIC (#2618 PR 2, ADR-AG-360 / ADR-AG-361). The circle arrives resolved (`circles-about` wrote its
     * id over the slot: bound, stated on its letter, or drawn); the conic is the figure's one of that kind (`curveHost`).
     */
    case 'circle-conic': {
      const circle = objectById(c, f.circle);
      if (!circle || curveKindOf(circle) !== 'circle') return { ok: false, error: unknownRef(c, f.circle) };
      const conic = curveHost(c, f.host, undefined, f.src);
      if (!conic.ok) return conic;
      /*
       * THE TOUCH POINTS NAMED — «… בנקודה B», «… בנקודות B ו-D»: each point on both curves, the circle's radius there
       * parallel to the conic's normal there (three rows `applyTouchAt` already reads, `touchNormal` on each curve). A
       * point the figure already puts on a curve is not restated on it.
       */
      if (f.ats) {
        const facts: Fact[] = f.ats.flatMap((at): Fact[] => [
          ...[circle, conic.o].flatMap((o): Fact[] => (onCurveByConstruction(c, o, at) ? [] : [{ t: 'constraint', k: { t: 'on-curve', id: at, curve: o.id }, src: f.src }])),
          { t: 'constraint', k: { t: 'relation', rel: 'parallel', u: touchNormal(circle, at), v: touchNormal(conic.o, at) }, src: f.src },
        ]);
        return applyAll(c, facts);
      }
      // The circle as a side of the relation — `tangent-circles`' reading: a centre point and its radius, or an equation.
      const side: CircleSide | null = circle.kind === 'circle-at' ? { centre: circle.centre, r: circle.r } : circle.kind === 'curve' ? { circle: circle.id } : null;
      if (!side) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      // The concentric circle is the ellipse's alone (ruling Q1); the parser reads it about no other conic.
      if (f.fit && f.host !== 'ellipse') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      /*
       * The touch parameter is the tool's own `θ_` symbol (ADR-AG-198's family: free, never a parameter row) spelled with
       * no part, as a free line's direction is: it is an angle-like parameter on the conic, not a part of a created shape,
       * so the created-shape fit (#1647) does not read it and the sampler draws it in angle units.
       */
      const rel: Extract<Constraint, { t: 'circle-conic' }>['rel'] = f.fit
        ? { k: f.fit }
        : { k: 'touch', s: { kind: 'sym', name: directionSymbol(`${circle.id}~touch~${conic.o.id}`) } };
      return applyFact(c, { t: 'constraint', k: { t: 'circle-conic', circle: side, curve: conic.o.id, rel }, src: f.src });
    }

    case 'tangent-circles': {
      const byId = f.circles?.map((id) => objectById(c, id));
      const pair: ReturnType<typeof circlePairOf> = byId
        ? byId.every((o) => o && curveKindOf(o) === 'circle')
          ? { ok: true, pair: [byId[0]!, byId[1]!] }
          : { ok: false, error: unknownRef(c, f.circles![byId[0] ? 1 : 0]) }
        : circlePairOf(c, f.a, f.b, f.src);
      if (!pair.ok) return pair;
      const [a, b] = pair.pair;
      // A circle is not tangent to itself — one circle named twice (or the contextual reading
      // landing back on the named one) has no configuration.
      if (a === b) return { ok: false, error: { code: 'unsatisfiable', detail: f.src } };
      /**
       * EACH SIDE IS A CIRCLE REFERENCE (#2387, ADR-AG-306; supersedes ADR-AG-167's "both circles arrive as
       * `circle-at`"). A circle on a centre point gives its point and radius; a circle stated by its EQUATION gives
       * itself, and the residual reads its centre and radius off the resolved curve — `tangent-curve`'s reading
       * (ADR-AG-195), so «(x−a)²+y²=r²» touching «(x−13)²+y²=(2r)²» is what pins a and r. A computed `circle-thru`
       * is refused by name (`out-of-scope`), never dropped: not asked.
       */
      const sideOf = (o: GeoObject): CircleSide | null =>
        o.kind === 'circle-at' ? { centre: o.centre, r: o.r } : o.kind === 'curve' ? { circle: o.id } : null;
      const sa = sideOf(a!);
      const sb = sideOf(b!);
      if (!sa || !sb) return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
      // Concentric circles are never tangent (operator 2026-09-29, ADR-AG-167 Am. 1 (5)) — judged STRUCTURALLY when a
      // side is an equation circle, whose centre no solve can move apart unless its parameters do.
      if (('circle' in sa || 'circle' in sb) && centresAlwaysCoincide(c, a!, b!)) return { ok: false, error: { code: 'unsatisfiable', detail: f.src } };
      const mk = (branch: 'external' | 'internal') => ({ t: 'tangent-circle' as const, a: sa, b: sb, branch });
      // A branch word collapses the choice (the «זווית B ישרה» pattern); without one, BOTH
      // touches are admissible and «הציגו תצורה אחרת» cycles them (ADR-052, #1049).
      const k = f.branch ? mk(f.branch) : { t: 'choice' as const, options: [mk('external'), mk('internal')] };
      // «…בנקודה T» names the touch point — determined by the two circles, so a derived point (amendment 1).
      const touch = f.at
        ? [{ t: 'derived' as const, id: f.at, rule: { t: 'touch-point' as const, a: a!.id, b: b!.id }, src: f.src }]
        : [];
      return applyAll(c, [{ t: 'constraint', k, src: f.src }, ...touch]);
    }

    /**
     * «היחס בין אורכי הרדיוסים של המעגלים (M ו-N) הוא p:q» (#2388, ADR-AG-307) — which circles, answered here: named ones
     * through the one name chain (ordered as written, r(a) = k·r(b)); «המעגלים» unnamed is the figure's exactly two
     * (the `tangent-circles` contextual reading), whose ORDER the sentence does not state, so it is a `choice` over both
     * orders (R14, ADR-052), cycled by «הציגו תצורה אחרת» until a given such as «r < R» picks one.
     */
    case 'radius-ratio': {
      let pair: [GeoObject, GeoObject];
      if (f.circles) {
        const [a, b] = f.circles.map((n) => circleByName(c, n));
        if (!a || curveKindOf(a) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circles[0])) };
        if (!b || curveKindOf(b) !== 'circle') return { ok: false, error: unknownRef(c, numeralCurveId('circle', f.circles[1])) };
        if (a === b) return { ok: false, error: { code: 'unsatisfiable', detail: f.src } };
        pair = [a, b];
      } else {
        const circles = c.objects.filter((o) => curveKindOf(o) === 'circle');
        if (circles.length !== 2) return { ok: false, error: noHost(f.src, 'circle', circles.length, 2) };
        pair = [circles[0], circles[1]];
      }
      const ratio = (a: GeoObject, b: GeoObject): Constraint => ({ t: 'radius-ratio', a: a.id, b: b.id, k: f.k });
      const k: Constraint = f.circles ? ratio(pair[0], pair[1]) : { t: 'choice', options: [ratio(pair[0], pair[1]), ratio(pair[1], pair[0])] };
      return applyFact(c, { t: 'constraint', k, src: f.src });
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
      // «זווית A קהה» (#1864, ADR-AG-267): the lone vertex resolved, the same selector its three-letter twin lowers to.
      if (f.rhs.t === 'order') {
        const sel: Selector = {
          kind: 'sign',
          q: { k: 'order', left: { t: 'angle', at: left.ref }, right: { t: 'value', value: { kind: 'num', value: 90 } } },
          positive: f.rhs.positive,
        };
        return withReadAs(applyFact(c, { t: 'selector', sel, src: f.src }), left);
      }
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
     * «גובה לצלע BC». The shapes of the figure that hold the named apex (or the triangles holding both ends of
     * the named side) are the candidates; one target builds through the one lowering, several ask, none refuses.
     *
     * A HEIGHT'S HOST IS ANY RING WITH A SIDE OPPOSITE THE APEX (#1945, ADR-AG-253) — a trapezoid, a
     * parallelogram, a rectangle, a rhombus, a square, a kite, a plain quadrilateral, an n-gon — not a triangle
     * alone. «טרפז ABCD» · «AE גובה» is a height the figure determines, and refusing it as `cevian-no-triangle`
     * reported "there is no triangle" about a sentence that never needed one. The MEDIAN is NOT widened with it:
     * 2-D hosts the height on any ring (its ADR-263 draw-one steer) and defers the median there (measured at
     * `8e0debff` through `parse` + `buildParseCtx`), so «AE תיכון» on a quadrilateral keeps its refusal.
     */
    case 'cevian-of': {
      /*
       * #1999 (ADR-AG-278) — WHICH END IS THE VERTEX, decided by the figure (2-D's `cevianEnds`, ADR-666): the end that is
       * the third vertex of a figure triangle on the stated side — or, with no side, a vertex of a figure polygon — is
       * the apex. Only when the written first letter does not qualify and the second does are they swapped, so every
       * vertex-first sentence, and every sentence whose letters name no vertex, resolves exactly as before.
       */
      if (f.either && f.apex) {
        const isVertex = (id: Id): boolean =>
          c.objects.some(
            (o) =>
              o.kind === 'polygon' &&
              o.vertices.includes(id) &&
              (f.side ? o.vertices.length === 3 && !f.side.includes(id) && f.side.every((s) => o.vertices.includes(s)) : true),
          );
        if (!isVertex(f.apex) && isVertex(f.foot)) {
          const { either: _either, ...asWritten } = f;
          return applyFact(c, { ...asWritten, apex: f.foot, foot: f.apex });
        }
      }
      const targets = new Map<string, { apex: Id; u: Id; v: Id }>();
      let openRight = false;
      // Both named («גובה מ-A לצלע BC בנקודה D»): nothing to resolve.
      if (f.apex && f.side) targets.set('named', { apex: f.apex, u: f.side[0], v: f.side[1] });
      /** A height named from its apex, which any ring can host; every other cevian resolves in a triangle. */
      const ringHost = f.role === 'altitude' && f.apex !== undefined && !f.side && !f.hypotenuse;
      /** Per shape holding the apex: its opposite sides, as a signature — two shapes that disagree are an ask. */
      const shapes = new Map<string, string>();
      /** Every candidate side, deduped, in declaration order — the union 2-D's `cevianShapeEdges` draws one from. */
      const union: [Id, Id][] = [];
      let parallelBase: [Id, Id] | null = null;
      for (const o of f.apex && f.side ? [] : c.objects) {
        if (o.kind !== 'polygon' || o.vertices.length < 3) continue;
        if (o.vertices.length !== 3 && !ringHost) continue;
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
          const own = oppositeRingEdges(ring, f.apex);
          if (own.length === 0) continue; // a ring that gives the apex no opposite side hosts no height
          if (!ringHost) {
            const [u, v] = own[0];
            targets.set(`${f.apex}|${[u, v].sort().join('')}`, { apex: f.apex, u, v });
            continue;
          }
          shapes.set([...ring].sort().join(''), own.map(edgeKey).sort().join(','));
          for (const e of own) if (!union.some((x) => sameEdge(x, e))) union.push(e);
          parallelBase ??= ringParallelBase(c, ring, f.apex, own);
        }
      }
      /*
       * WHICH OF THE CANDIDATE SIDES THE HEIGHT MEANS (#1945, ADR-AG-253) — 2-D's resolution, ported, in its order
       * of authority (each step measured at `8e0debff` through `parse` + `buildParseCtx` over `replay`):
       *  1. THE FOOT NARROWS IT (#1662, operator ruling 2026-10-03; ADR-AG-222) — when the figure already puts the
       *     named foot on one candidate side, the others are not what the sentence names. Kept AHEAD of the
       *     trapezoid's base, because this tree's ruling reads the student's own incidence and the base below is
       *     only the noun's assumption (#1159), which yields to what they state. (2-D orders these the other way;
       *     the one sequence that separates them — «טרפז ABCD» · «E על BC» · «AE גובה» — draws E on top of C there.)
       *  2. THE TRAPEZOID'S PARALLEL BASE (2-D's ADR-169) — a height drops onto the base opposite the one its apex
       *     sits on, so «טרפז ABCD» · «AE גובה» lands on DC, not on BC.
       *  3. ONE SHAPE'S SEVERAL HEIGHTS: DRAW ONE (2-D's ADR-263 operator steer) — a parallelogram's height from A
       *     is genuinely ambiguous but real, so the ring's FIRST opposite side (BC after «מקבילית ABCD») is drawn
       *     rather than refused. Two SHAPES that give the apex different sides are two different statements, and
       *     those ask (#1684 / ADR-AG-209's `ambiguous-cevian`): «מרובע ABCD» · «משולש ABC» · «AE גובה» asks.
       * Every other cevian keeps the triangle-only resolution, and the foot narrows between triangles as before.
       */
      if (ringHost) {
        const onFoot = union.filter((e) => footOnPair(c, f.foot, e[0], e[1]));
        const pick = onFoot.length === 1 ? onFoot[0] : parallelBase ?? (new Set(shapes.values()).size > 1 ? 'ask' : union[0]);
        if (pick === 'ask') return { ok: false, error: { code: 'ambiguous-cevian', detail: f.src } };
        if (pick) targets.set(`${f.apex}|${edgeKey(pick)}`, { apex: f.apex!, u: pick[0], v: pick[1] });
      } else if (f.apex && !f.side && !f.hypotenuse && targets.size > 1) {
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
      /** The length the sentence stated for this cevian (#1737, ADR-AG-265), on the segment it draws. */
      const measured = (foot: Id): Fact[] => (f.measure ? measureFacts(f.measure, apex, foot) : []);
      if (f.toolFoot && !objectById(c, f.foot)) {
        // The same point derived the same way already has a name (#1153): the cevian runs to IT.
        const rule = toolFootRule(f.role, apex, u, v);
        const same = c.objects.find((o) => o.kind === 'derived' && !o.follows && sameDerivation(o.rule, rule));
        if (same) return applyAll(c, [{ t: 'segment', id: `seg-${[apex, same.id].sort().join('')}`, a: apex, b: same.id, src: f.src }, ...measured(same.id)]);
        return applyAll(c, [...toolFootFacts(f.role, apex, f.foot, u, v, f.src), ...measured(f.foot)]);
      }
      return applyAll(c, [...cevianFacts(f.role, apex, f.foot, u, v, f.src), ...measured(f.foot)]);
    }

    /**
     * A HEIGHT STATED AS A MAGNITUDE (#1737, ADR-AG-265) — 2-D's `shapeHeight` (ADR-575), measured at `403efe66`, with
     * the figure read here at M1 because this parser is context-free. Which polygon: the noun's, narrowed by the
     * letters, else the one polygon. A trapezoid's height is drawn; a parallelogram's or a triangle's is asked.
     */
    case 'height-of':
      return applyHeightOf(c, f);

    /** A side named by its role alone (#1807, ADR-AG-266) — resolved against the polygon's existing structure. */
    case 'role-side':
      return applyRoleSide(c, f);

    /**
     * «AD חוצה את הזווית BAC» (#1284, ADR-AG-209) — 2-D's verdict: a `p` the figure does not have yet is the
     * bisector's foot on the line through the angle's ray points; an existing `p` lies on the bisector's ray.
     */
    case 'bisects': {
      // #2115 (ADR-AG-299): the role-noun spellings say only "XY is a bisector" — answered when XY is a polygon's side.
      if (f.roleNoun && f.p !== undefined) {
        const kind = polygonSideKind(c, f.at.v, f.p, null);
        return { ok: false, error: kind ? bisectorIsSide(f, f.at.v, kind) : { code: 'not-handled', detail: f.src } };
      }
      // A three-letter angle whose arm is the segment's far end is decided on structure alone, before the figure is
      // asked for its points — the parser's old refusal moved here, unchanged where no declared polygon holds the pair.
      if (f.p !== undefined && isAngleRef(f.at) && (f.p === f.at.a || f.p === f.at.b)) return bisectorOnArm(c, f, f.at);
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
      if (f.p === at.ref.a || f.p === at.ref.b) return bisectorOnArm(c, f, at.ref);
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

    /**
     * A STATED DISTINCTNESS (#2395, ADR-AG-311) — what the names DENOTE is decided here, at the M1 boundary, because
     * the parser is pure over one line. A written noun decides the kind; with none, points are read first (so «N1 ≠
     * N2» about two centres keeps the centres apart), then curves. A name that is no object of that kind, or names of
     * mixed kinds, is `unknown-reference` naming the first one that fails.
     */
    case 'distinct-of': {
      if (new Set(f.names).size !== f.names.length) return { ok: false, error: { code: 'repeated-vertex', detail: f.src } };
      const pointOf = (n: string) => {
        const o = objectById(c, n);
        return o && isPositional(o) ? o : null;
      };
      const curveOf = (n: string, kind: 'circle' | 'line') => {
        const o = curveByName(c, n);
        return o && CURVE_BEARING.has(o.kind) && curveKindOf(o) === kind ? o : null;
      };
      const kindOf = (n: string): 'circle' | 'line' | null => (curveOf(n, 'circle') ? 'circle' : curveOf(n, 'line') ? 'line' : null);
      const missingRef = (n: string, kind: 'point' | 'circle' | 'line') =>
        unknownRef(c, kind === 'point' ? n : kind === 'line' ? lineIdOf(n) : numeralCurveId('circle', n));
      // With no noun, the names that resolve decide: a point among them reads them all as points (the missing one is then
      // named), else the first curve's kind; a set where nothing resolves is read as points, so the refusal names a letter.
      const asPoints = f.noun === 'point' || (f.noun === undefined && (f.names.some((n) => pointOf(n)) || f.names.every((n) => !kindOf(n))));
      if (asPoints) {
        const missing = f.names.find((n) => !pointOf(n));
        if (missing !== undefined) return { ok: false, error: missingRef(missing, 'point') };
        return applyFact(c, { t: 'selector', sel: { kind: 'distinct', ids: [...f.names] }, src: f.src });
      }
      const kind: 'circle' | 'line' = f.noun === 'circle' || f.noun === 'line' ? f.noun : (f.names.map(kindOf).find((k) => k !== null) ?? 'circle');
      const missing = f.names.find((n) => !curveOf(n, kind));
      if (missing !== undefined) return { ok: false, error: missingRef(missing, kind) };
      return applyFact(c, { t: 'selector', sel: { kind: 'distinct-curves', ids: f.names.map((n) => curveOf(n, kind)!.id) }, src: f.src });
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
          : sel.kind === 'distinct-curves' || sel.kind === 'major-axis'
          ? [] // #2395: names curves only, checked below (#2616: the major axis names its ellipse)
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
                : sel.kind === 'line-compare'
                ? // #2386 (ADR-AG-310): the subject and the line's two points; a named line is a curve ref, checked below.
                  [sel.id, ...dirRefs(sel.line)]
                : sel.kind === 'angle-side'
                  ? [sel.id, sel.v, sel.a, sel.b]
                  : sel.kind === 'segments-cross'
                    ? [sel.a, sel.b, sel.c, sel.d]
                    : // #1622 (ADR-AG-217): the subjects and the line; the point and its ring.
                      sel.kind === 'line-side'
                      ? [...sel.ids, sel.a, sel.b]
                      : sel.kind === 'in-polygon'
                        ? [sel.id, ...sel.ring]
                        : // #2392 (ADR-AG-313): the line's two points, when it is named by them.
                          sel.kind === 'axis-cut'
                          ? dirRefs(sel.line)
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
      // The major axis of an ellipse the figure holds (#2616, ADR-AG-353).
      if (f.sel.kind === 'major-axis') {
        const o = objectById(c, f.sel.curve);
        if (!o || curveKindOf(o) !== 'ellipse') return { ok: false, error: unknownRef(c, f.sel.curve) };
      }
      // Two curves stated different (#2395, ADR-AG-311) name curves the figure holds.
      if (f.sel.kind === 'distinct-curves') {
        for (const id of f.sel.ids) {
          const o = objectById(c, id);
          if (!o || !CURVE_BEARING.has(o.kind)) return { ok: false, error: unknownRef(c, id) };
        }
      }
      // A side of a NAMED line (#2386, ADR-AG-310) names a STRAIGHT line the figure holds — a circle has no «מעל הישר».
      if (f.sel.kind === 'line-compare' && f.sel.line.k === 'curve') {
        const o = objectById(c, f.sel.line.id);
        if (!o || !CURVE_BEARING.has(o.kind) || curveKindOf(o) !== 'line') return { ok: false, error: unknownRef(c, f.sel.line.id) };
      }
      // …and so does where a named line crosses an axis (#2392, ADR-AG-313) — a line, not another curve.
      if (f.sel.kind === 'axis-cut' && f.sel.line.k === 'curve') {
        const o = objectById(c, f.sel.line.id);
        if (!o || !CURVE_BEARING.has(o.kind)) return { ok: false, error: unknownRef(c, f.sel.line.id) };
        if (curveKindOf(o) !== 'line') return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
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
      // would have to be extended by hand for each new kind — the drift ADR-043 names. Compared by IDENTITY
      // (`selectorIdentity`), so a «distinct» set restated in another order is the same selector (#1953).
      const dup = c.selectors.some((s) => selectorIdentity(s) === selectorIdentity(f.sel));
      if (dup) return { ok: true, effect: 'known', next: c };
      /**
       * THE STUDENT CONSUMING A REGION CHOICE (#1864, ADR-AG-267) — the constraint `choice`'s collapse (#1049), for its
       * selector twin. «משולש קהה זווית ABC» opens a choice over the three vertices; «זווית BAC קהה» names one of
       * them. Added beside the choice it left the choice open, so «הציגו תצורה אחרת» still offered the other
       * vertices (each then failing the stated region) and the tool still called the obtuse vertex its own pick. The
       * statement REPLACES the choice it names, as a named seat replaces a right triangle's.
       */
      const named = c.selectors.findIndex(
        (s) => s.kind === 'choice' && s.options.some((o) => selectorIdentity(o) === selectorIdentity(f.sel)),
      );
      if (named >= 0) {
        const collapsed = [...c.selectors];
        collapsed[named] = f.sel;
        return { ok: true, effect: 'narrowed', next: { ...c, selectors: collapsed } };
      }
      // An order between parameters left with no free symbol, or with one, is read once, here and by the binding
      // seam alike (#2521, ADR-AG-332): judged now, or lowered to that symbol's domain beside the selector.
      const added: Construction = { ...c, selectors: [...c.selectors, f.sel] };
      const read = normalizeParamOrder(added, f.sel, f.src);
      return read.ok ? { ok: true, effect: 'created', next: read.next } : read;
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
      /*
       * A CIRCLE THROUGH A RING ITS NOUN FORBIDS, STATED IN TWO SENTENCES (#1918, ADR-AG-252). The one-sentence form
       * is refused at the parser (ADR-AG-198); here the same rule reads the ring's two structural declarations — the
       * noun some sentence gave it (its row's `notCyclic`) and an inscription some sentence made — whichever arrives
       * second. Derived from the registry column, never a listed pair; never from a measurement of one drawing.
       */
      const circleless =
        f.t === 'polygon' ? ((f.noun && shapeRow(f.noun)?.notCyclic ? f.noun : undefined) ?? (prior?.kind === 'polygon' ? prior.circleless : undefined)) : undefined;
      const cyclic = f.t === 'polygon' && (f.cyclic || (prior?.kind === 'polygon' && prior.cyclic));
      if (prior && circleless && cyclic) {
        return {
          ok: false,
          error: { code: 'inscribed-contradicts-declared', detail: f.src, shape: circleless, forced: shapeRow(circleless)!.notCyclic!, ring: f.id },
        };
      }
      /** The ring's circle facts, carried onto the object so a later sentence is held against them. */
      const circleFlags = { ...(cyclic ? { cyclic: true as const } : {}), ...(circleless ? { circleless } : {}) };
      /*
       * A NOUN THE RING'S NOUN EXCLUDES (#1926, ADR-AG-260). «מקבילית ABCD» · «טרפז ABCD»: the same ring, so M1 would
       * absorb it as `known` and keep the first noun — a parallelogram reported as "already" a trapezoid, or (the
       * reverse) a second noun's givens taken as forcing givens. No quadrilateral is both, so the second declaration is
       * refused, in either order and every spelling the polygon rule reads. Forcing GIVENS keep ADR-AG-189 Am. 1's
       * warning; only a second NOUN is refused here.
       */
      /*
       * #2169 (ADR-W-131, the 2026-10-16 rulings): the ring is what EVERY noun stated over it makes it together (`noun`
       * and `also`, their meet), judged by the one relation every builder reads (`kindRelation`, the shared lattice):
       * a kite against the trapezoid family and an isosceles against a right trapezoid exclude too, and the refusal names
       * what the ring is known to be — «ריבוע» after «מלבן» · «מעוין», as 2-D says.
       */
      const ringKind = prior?.kind === 'polygon' ? ringKindOf(prior) : null;
      const statedKind = f.t === 'polygon' ? quadKindOf(f.noun) : null;
      const relation = ringKind && statedKind ? kindRelation(ringKind, statedKind) : null;
      if (prior?.kind === 'polygon' && f.t === 'polygon' && prior.noun && f.noun && ringKind && nounsExclude(nounOfKind(ringKind) ?? prior.noun, f.noun)) {
        return { ok: false, error: { code: 'shape-excluded', detail: f.src, actual: normalizeShapeNoun(nounOfKind(ringKind) ?? prior.noun), stated: normalizeShapeNoun(f.noun) } };
      }
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
                objects: c.objects.map((o) => (o.id === f.id ? { ...prior, noun: f.noun, ...circleFlags } : o)),
              },
            };
          }
          /*
           * #2169 (ADR-W-131) — A NOUN THE RING'S NOUNS ALREADY IMPLY IS A RESTATEMENT, in the reading the student wrote:
           * «ריבוע ABCD» · «דלתון ABCD» (every square is a kite). Its definition constraints are not the same OBJECTS as
           * the square's, so the line recorded a second row where 2-D and 3-D answer «already there»; it is now absorbed
           * whole (`restates` — the fold takes the line's noun definition as held). A trapezoid read the other way round
           * names the other pair of sides, so only the declared spelling, or a noun no reading changes, restates.
           */
          if (f.t === 'polygon' && prior.kind === 'polygon' && relation === 'implies' && ringKind && statedKind) {
            const sameSpelling = prior.vertices.length === f.vertices.length && prior.vertices.every((v, i) => v === f.vertices[i]);
            if (sameSpelling || kindImpliesInEveryReading(ringKind, statedKind)) {
              const flaggedNow = !!circleFlags.cyclic !== !!prior.cyclic || circleFlags.circleless !== prior.circleless;
              const next = flaggedNow ? { ...c, objects: c.objects.map((o) => (o.id === f.id ? { ...prior, ...circleFlags } : o)) } : c;
              return { ok: true, effect: 'known', next, restates: true };
            }
          }
          /*
           * #2169 — a noun that NARROWS the ring, or meets it in a third kind («מלבן» · «מעוין» = «ריבוע»), is kept on the
           * ring: its constraints arrive as their own facts, and a later noun is judged against what both make it.
           */
          if (f.t === 'polygon' && prior.kind === 'polygon' && f.noun && (relation === 'narrows' || relation === 'siblings')) {
            const also = [...(prior.also ?? []), normalizeShapeNoun(f.noun)];
            return { ok: true, effect: 'known', next: { ...c, objects: c.objects.map((o) => (o.id === f.id ? { ...prior, ...circleFlags, also } : o)) } };
          }
          // Absorbed — but what it said about a circle through the ring is kept (#1918): a later sentence answers to it.
          const flagged = prior.kind === 'polygon' && (!!circleFlags.cyclic !== !!prior.cyclic || circleFlags.circleless !== prior.circleless);
          if (flagged) return { ok: true, effect: 'known', next: { ...c, objects: c.objects.map((o) => (o.id === f.id ? { ...prior, ...circleFlags } : o)) } };
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
      // #2018 (ADR-AG-298): a point bound to a role is not «the midpoint of BC» in every configuration — its letters
      // follow the drawn apex — so it never holds a lettered derivation's position, nor is held by one.
      if (f.t === 'derived' && !f.follows) {
        const holder = c.objects.find(
          (o) => o.kind === 'derived' && !o.follows && o.id !== f.id && sameDerivation(o.rule, f.rule),
        );
        /*
         * A HELPER IS NAMED BY THE FIRST LETTER THAT DERIVES IT (#2583, ADR-AG-345; operator ruling 2026-10-27, «B»). A
         * perpendicular bisector's midpoint has no name, so «P אמצע EK» after the line is not a second name: P becomes
         * that point — drawn, lettered — and what was built through it follows (`replaceId`, the `name-line` rename).
         * #1109's principle: naming gives a name only to what has none.
         */
        if (holder && holder.kind === 'derived' && holder.helper && !isHelperId(f.id)) {
          const named: GeoObject = { kind: 'derived', id: f.id, rule: holder.rule };
          return {
            ok: true,
            effect: 'narrowed',
            next: {
              ...c,
              objects: c.objects.map((o) => (o === holder ? named : replaceId(o, holder.id, f.id))),
              constraints: c.constraints.map((k) => replaceId(k, holder.id, f.id)),
              selectors: c.selectors.map((s) => replaceId(s, holder.id, f.id)),
            },
          };
        }
        if (holder) {
          return { ok: false, error: { code: 'already-named', detail: f.src, holder: statedName(holder.id) } };
        }
      }

      const made: GeoObject =
        f.t === 'derived'
          ? { kind: 'derived', id: f.id, rule: f.rule, ...(f.follows ? { follows: f.follows } : {}), ...(isHelperId(f.id) ? { helper: true as const } : {}) }
          : f.t === 'segment'
            ? { kind: 'segment', id: f.id, a: f.a, b: f.b, ...(f.follows ? { follows: f.follows } : {}) }
            : { kind: 'polygon', id: f.id, vertices: f.vertices, noun: f.noun, ...circleFlags };
      return { ok: true, effect: 'created', next: { ...c, objects: [...c.objects, made] } };
    }
  }
}

/**
 * A SIZE GIVEN WITH THE MAJOR AXIS'S DIRECTION UNSTATED (#2617, ADR-AG-353): on a parameterised ellipse whose direction no
 * sentence states, the direction is a region `choice` of the two — x first, «הציגו תצורה אחרת» reaches y (02c R14,
 * ADR-052). A stated direction (a `major-axis` selector, alone or as a choice) leaves it as it is; a fixed ellipse has
 * none to choose.
 */
function withOpenOrientation(out: Extract<ApplyOutcome, { ok: true }>, curve: Id): ApplyOutcome {
  const c = out.next;
  const o = objectById(c, curve);
  if (!o || o.kind !== 'curve') return out;
  const free = new Set(paramRegister(c).map((p) => p.sym));
  if (!symbolsOf(o.curve.eq).some((s) => free.has(s))) return out;
  const names = (s: Selector): boolean => (s.kind === 'choice' ? s.options.some(names) : s.kind === 'major-axis' && s.curve === curve);
  if (c.selectors.some(names)) return out;
  const choice: Selector = { kind: 'choice', options: [{ kind: 'major-axis', curve, axis: 'x' }, { kind: 'major-axis', curve, axis: 'y' }] };
  return { ...out, next: { ...c, selectors: [...c.selectors, choice] } };
}

/** The letters a fresh curve may take, in order — the plane's x, y and the constant e excluded. */
const FRESH_LETTERS = 'abcdghkmnpqrstuvw'.split('');

function freshLetters(c: Construction, f: Extract<Fact, { t: 'curve' }>): Extract<Fact, { t: 'curve' }> {
  const { fresh: _fresh, ...plain } = f;
  void _fresh;
  const used = usedSymbols(c);
  let out = plain;
  const taken = new Set(used);
  for (const sym of symbolsOf(f.curve.eq).filter((s) => !RESERVED_SYMBOLS.has(s))) {
    if (!used.has(sym)) {
      taken.add(sym);
      continue;
    }
    const next = FRESH_LETTERS.find((l) => !taken.has(l) && !symbolsOf(f.curve.eq).includes(l));
    if (!next) continue;
    taken.add(next);
    out = {
      ...out,
      curve: { ...out.curve, eq: renameSym(out.curve.eq, sym, next) },
      label: out.label.eqSrc ? { ...out.label, eqSrc: out.label.eqSrc.replace(new RegExp(`(?<![A-Za-z])${sym}(?![A-Za-z])`, 'g'), next) } : out.label,
    };
  }
  return out;
}

/** A letter RENAMED in an expression tree (#2619) — a fresh curve's own letter moved aside, never a value bound (`bindSymbol`). */
function renameSym(e: Expr, from: string, to: string): Expr {
  switch (e.kind) {
    case 'num':
      return e;
    case 'sym':
      return e.name === from ? { kind: 'sym', name: to } : e;
    case 'neg':
    case 'sqrt':
      return { ...e, a: renameSym(e.a, from, to) };
    default:
      return { ...e, a: renameSym(e.a, from, to), b: renameSym(e.b, from, to) };
  }
}

/** THE ellipse a contextual role sentence means — the figure's one ellipse, or the host refusal (#2616). */
function theEllipse(c: Construction, src: string): { ok: true; id: Id } | { ok: false; error: ApplyError } {
  const ellipses = c.objects.filter((o) => curveKindOf(o) === 'ellipse');
  return ellipses.length === 1 ? { ok: true, id: ellipses[0].id } : { ok: false, error: noHost(src, 'ellipse', ellipses) };
}

/**
 * NAME A ROLE POINT OF AN ELLIPSE (#2616, ADR-AG-353) — the one lowering every role sentence shares. One role: the derived
 * point (on a point that exists, M1's `derived-at`: a fixed ellipse judges it, a free one is pinned by it). Several (the
 * sentence did not say which): the point and a `choice` of the roles, each a `derived-at` (02c R14). `axis`: the major
 * axis's direction a side word asserted, recorded as its selector.
 */
function nameEllipseRole(c: Construction, id: Id, curve: Id, roles: readonly EllipseRole[], axis: 'x' | 'y' | undefined, src: string): ApplyOutcome {
  const sel: Fact[] = axis ? [{ t: 'selector', sel: { kind: 'major-axis', curve, axis }, src }] : [];
  const standing = objectById(c, id);
  // The same role restated about the point that holds it adds nothing (the derivation's own idempotence, #1045).
  if (standing && standing.kind === 'derived' && standing.rule.t === 'ellipse-point' && standing.rule.curve === curve) {
    const held = standing.rule.role;
    if (roles.some((r) => sameEllipseRole(r, held))) return sel.length ? applyAll(c, sel) : { ok: true, effect: 'known', next: c };
  }
  if (roles.length === 1) return applyAll(c, [{ t: 'derived', id, rule: { t: 'ellipse-point', curve, role: roles[0] }, src }, ...sel]);
  const options: Constraint[] = roles.map((role) => ({ t: 'derived-at', id, rule: { t: 'ellipse-point', curve, role } }));
  return applyAll(c, [{ t: 'declare', id, src }, { t: 'constraint', k: { t: 'choice', options }, src }, ...sel]);
}

/**
 * A selector's identity (#1953, [ADR-AG-259](../../docs/06c-decisions-analytic.md#adr-ag-259)). Structural, except
 * that a `distinct` selector is a SET of points: «מרובע ADCB» after «ריבוע ABCD» asks for the same four points
 * to be distinct, and its ids arrive in the ring's typed order. Compared by spelling, that restatement was a NEW
 * selector, the line read `created`, and it recorded a second row while the polygon itself (whose id is already
 * canonical over the ring's rotations and reversals) was absorbed.
 */
function selectorIdentity(sel: Selector): string {
  if (sel.kind === 'distinct' || sel.kind === 'distinct-curves') return JSON.stringify({ ...sel, ids: [...sel.ids].sort() });
  // The line through K and L is the line through L and K (#2386): «M מעל הישר LK» restates «M מעל הישר KL».
  if (sel.kind === 'line-compare' && sel.line.k === 'points') {
    return JSON.stringify({ ...sel, line: { k: 'points', a: [sel.line.a, sel.line.b].sort()[0], b: [sel.line.a, sel.line.b].sort()[1] } });
  }
  /*
   * An ORDER BETWEEN MEASURES names an angle by its vertex and two rays, and the rays are UNORDERED (#1864, ADR-AG-267):
   * «זווית BAC קהה» is «זווית CAB קהה» — canonicalConstraint's `ray` rule, for the region twin. Without it the
   * obtuse-vertex option «משולש קהה זווית ABC» builds at A (rays C, B) was not the statement «זווית BAC קהה» names.
   */
  if (sel.kind === 'sign' && sel.q.k === 'order') {
    const side = (o: typeof sel.q.left) => (o.t === 'angle' && o.at.a > o.at.b ? { ...o, at: { ...o.at, a: o.at.b, b: o.at.a } } : o);
    return JSON.stringify({ ...sel, q: { ...sel.q, left: side(sel.q.left), right: side(sel.q.right) } });
  }
  return JSON.stringify(sel);
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
/**
 * #2169 (ADR-W-131): what a declared ring IS — the meet of its noun and every later noun that narrowed it (`also`), as a
 * kind of the shared lattice — or null for a ring no quadrilateral noun names.
 */
function ringKindOf(p: Extract<GeoObject, { kind: 'polygon' }>): NarrowKind | null {
  const kinds = [p.noun, ...(p.also ?? [])].map(quadKindOf).filter((k): k is NarrowKind => k !== null);
  return kinds.length ? declaredKindOf(kinds, false) : null;
}

function sameReference(prior: GeoObject, f: Fact): boolean {
  if (prior.kind === 'derived' && f.t === 'derived') {
    return JSON.stringify(prior.rule) === JSON.stringify(f.rule);
  }
  return prior.kind === 'segment' || prior.kind === 'polygon';
}

/**
 * Replace every `{ kind: 'sym', name: sym }` inside `x` with `value` — a structural substitution. IDENTITY-PRESERVING
 * (#2521): a part the symbol does not occur in is returned as the same reference, so the fold's attribution
 * (`constraintFact` / `selectorFact`, compared by identity) keeps every untouched constraint and selector on the line
 * that stated it. Private to the binding seam: called only by `bindSymbol` and `readBound` (a guard test holds it).
 */
function substituteSym<T>(x: T, sym: string, value: Expr): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      let changed = false;
      const out = v.map((w) => {
        const n = walk(w);
        if (n !== w) changed = true;
        return n;
      });
      return changed ? out : v;
    }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.kind === 'sym' && o.name === sym && Object.keys(o).length === 2) return value;
      let changed = false;
      const entries = Object.entries(o).map(([k, w]) => {
        const n = walk(w);
        if (n !== w) changed = true;
        return [k, n] as const;
      });
      return changed ? Object.fromEntries(entries) : v;
    }
    return v;
  };
  return walk(x) as T;
}

/** Every symbol a `{ kind: 'sym' }` node names anywhere inside `x` — the structural scan (never a text search). */
function symbolNodes(x: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(x)) for (const w of x) symbolNodes(w, out);
  else if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (o.kind === 'sym' && typeof o.name === 'string' && Object.keys(o).length === 2) out.add(o.name);
    else for (const w of Object.values(o)) symbolNodes(w, out);
  }
  return out;
}

/** The construction's fields that are not expressions over the figure's symbols — never substituted into. */
const NOT_SUBSTITUTED = new Set<keyof Construction>(['params', 'seedNames', 'bound', 'objectLine']);

/**
 * THE ONE PLACE A STATED VALUE REPLACES A FREE SYMBOL (#2521, ADR-AG-332).
 *
 * «מעגל P שרדיוסו r» · «R > r» · «רדיוס מעגל P הוא 9»: the radius was free and the student just gave it, so `r`
 * BECOMES 9 — and a letter is one parameter (ADR-AG-307), so it becomes 9 everywhere, not only on the circle. The
 * substitution used to cover the objects and constraints alone and forget the letter afterwards: «R > r» went on
 * judging an orphaned `r` the canvas no longer showed (P drawn at 9, O at 3.46, green), a later «r < 5» narrowed a
 * ghost, and the parameter was retired by a TEXT search that a letter called `r` (the field name of a circle's radius)
 * always matched, so the ghost stayed in the DOF count.
 *
 * In order:
 * - **a. domain** — `admitStated` (`out-of-domain`), unless `admit: false`: the tool replacing its own symbol by its
 *   construction (`relateCircles`, `describeDrawnCircle`) states no value the student must be told about;
 * - **b. everywhere** — one structural walk over every expression-bearing field of the construction (all but
 *   `NOT_SUBSTITUTED`), so a field added later cannot be missed; the values already bound are substituted too;
 * - **c. retirement** — the parameter leaves the register when no `{kind:'sym'}` node of it remains (`symbolNodes`);
 * - **d. the record** — `bound[sym] = value`, which `readBound` substitutes into every later fact;
 * - **e. the orders it touched** — each `sign / params` selector the substitution changed is read again
 *   (`normalizeParamOrder`): one left with no symbol is judged now, one left with one symbol becomes that symbol's
 *   domain.
 */
function bindSymbol(
  c: Construction,
  sym: string,
  value: Expr,
  src: string,
  opts: { admit: boolean } = { admit: true },
): { ok: true; next: Construction } | { ok: false; error: ApplyError } {
  let base = c;
  if (opts.admit) {
    const admitted = admitStated(c, c.params.find((p) => p.sym === sym)?.domain, value, src);
    if (!admitted.ok) return admitted;
    base = admitted.next;
  }
  const next: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base) as Array<keyof Construction>) {
    if (!NOT_SUBSTITUTED.has(key)) next[key] = substituteSym(base[key], sym, value);
  }
  let out = next as unknown as Construction;
  const bound: Record<string, Expr> = {};
  for (const [s, v] of Object.entries(base.bound ?? {})) bound[s] = substituteSym(v, sym, value);
  bound[sym] = value;
  const stillRead = symbolNodes(Object.entries(out).filter(([k]) => !NOT_SUBSTITUTED.has(k as keyof Construction)).map(([, v]) => v));
  out = { ...out, bound, params: stillRead.has(sym) ? out.params : out.params.filter((p) => p.sym !== sym) };
  for (let i = 0; i < out.selectors.length; i++) {
    if (out.selectors[i] === base.selectors[i]) continue;
    const r = normalizeParamOrder(out, out.selectors[i], src);
    if (!r.ok) return r;
    out = r.next;
  }
  return { ok: true, next: out };
}

/**
 * `x` as the figure's BINDINGS read it (#2521, ADR-AG-332): every symbol a stated value bound (`Construction.bound`)
 * replaced by that value. Idempotent, and the identity when nothing is bound. Applied to every fact at the top of
 * `applyFact`, so a sentence naming a bound letter — before or after the value, in any family — reads the value.
 */
function readBound<T>(c: Construction, x: T): T {
  const bound = c.bound;
  if (!bound) return x;
  let out = x;
  for (const [sym, value] of Object.entries(bound)) out = substituteSym(out, sym, value);
  return out;
}

/**
 * «a = 6» · «2a = 12» · «c = √10» — the value a one-symbol relation LINEAR in its letter gives that letter (#2617,
 * ADR-AG-353), or null (two symbols, none, or not linear). A bare letter on one side keeps the other side as written, so
 * an exact value («√10») stays exact; otherwise the value is the root of the linear form, read at numeric probes.
 */
function onePinValue(left: Expr, right: Expr): { sym: string; value: Expr } | null {
  const syms = new Set([...symbolsOf(left), ...symbolsOf(right)]);
  if (syms.size !== 1) return null;
  const [sym] = syms;
  if (left.kind === 'sym' && symbolsOf(right).length === 0) return { sym, value: right };
  if (right.kind === 'sym' && symbolsOf(left).length === 0) return { sym, value: left };
  const diff: Expr = { kind: 'sub', a: left, b: right };
  const lin = linearIn(diff, sym);
  if (!lin || Math.abs(lin.a) < 1e-12) return null;
  return { sym, value: { kind: 'num', value: -lin.b / lin.a } };
}

/** `e` as `α·s + β` over its one symbol `s`, read at four numeric probes (no CAS), or null when it is not linear. */
function linearIn(e: Expr, s: string): { a: number; b: number } | null {
  const at = (t: number) => evalExpr(e, { [s]: t });
  const b = at(0);
  const a = at(1) - b;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  for (const t of [2, -3, 0.5, 7.25]) {
    const v = at(t);
    const want = a * t + b;
    if (!Number.isFinite(v) || Math.abs(v - want) > 1e-9 * Math.max(1, Math.abs(want), Math.abs(a), Math.abs(b))) return null;
  }
  return { a, b };
}

/**
 * ONE READING OF AN ORDER BETWEEN PARAMETERS (#2521, ADR-AG-332) — «R > r» as a `sign / params` selector, read by the
 * `selector` case when it is stated and by `bindSymbol` when a binding rewrites it:
 *
 * - **no free symbol left** (5 − 9 > 0): judged now — kept when it holds (dropping it would shift the positional
 *   `selectorLine`), refused `unsatisfiable`, naming the statement, when it cannot;
 * - **one symbol, linear** (R − 9 > 0): kept, and ALSO lowered to that symbol's domain through the ONE domain merge
 *   (the `param` fact «R > 9» parses to), so the sampler draws inside it rather than finding it by a walk; an empty
 *   merge cannot hold and is refused `unsatisfiable`;
 * - **otherwise**: unchanged — a region of the parameter space, judged after the solve (ADR-AG-005 D7 kind 2).
 */
function normalizeParamOrder(
  c: Construction,
  sel: Selector,
  src: string,
): { ok: true; next: Construction } | { ok: false; error: ApplyError } {
  if (sel.kind !== 'sign' || sel.q.k !== 'params') return { ok: true, next: c };
  const e = sel.q.e;
  const refuse = { ok: false as const, error: { code: 'unsatisfiable' as const, detail: src } };
  const holds = (v: number) => (sel.positive ? v > 0 : v < 0);
  const syms = symbolsOf(e).filter((s) => !RESERVED_SYMBOLS.has(s));
  if (syms.length === 0) {
    const v = evalExpr(e, {});
    return Number.isFinite(v) && holds(v) ? { ok: true, next: c } : refuse;
  }
  if (syms.length !== 1) return { ok: true, next: c };
  const lin = linearIn(e, syms[0]);
  if (!lin) return { ok: true, next: c };
  if (lin.a === 0) return holds(lin.b) ? { ok: true, next: c } : refuse;
  const k = -lin.b / lin.a;
  const greater = lin.a > 0 === sel.positive;
  const domain: Domain = greater ? { min: k, minOpen: true } : { max: k, maxOpen: true };
  const r = applyFact(c, { t: 'param', sym: syms[0], domain, src });
  if (!r.ok) return r;
  const merged = r.next.params.find((p) => p.sym === syms[0])?.domain;
  return merged && emptyDomain(merged) ? refuse : { ok: true, next: r.next };
}

/**
 * A DOMAIN STATED FOR A BOUND LETTER (#2521, ADR-AG-332) — «r < 5» after «רדיוס מעגל P הוא 9». The letter is no longer
 * free, so the sentence is a CLAIM about its value, never a narrowing of a ghost: a constant is judged exactly (`known`
 * when it holds, `unsatisfiable` naming the statement when not); a letter bound to another lone letter carries the
 * domain over to it (the `param` merge); any other expression cannot carry a domain without a CAS, and is refused by
 * name (`out-of-scope`) rather than dropped.
 */
function judgeBoundParam(c: Construction, f: Extract<Fact, { t: 'param' }>, value: Expr): ApplyOutcome {
  const syms = symbolsOf(value).filter((s) => !RESERVED_SYMBOLS.has(s));
  if (syms.length === 0) {
    return inDomain(f.domain, evalExpr(value, {})) ? { ok: true, effect: 'known', next: c } : { ok: false, error: { code: 'unsatisfiable', detail: f.src } };
  }
  if (value.kind === 'sym') return applyFact(c, { ...f, sym: value.name });
  return { ok: false, error: { code: 'out-of-scope', detail: f.src } };
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

/**
 * #1989 ([ADR-AG-262](../../docs/06c-decisions-analytic.md#adr-ag-262)) — A RING ALREADY DECLARED IS READ IN ITS
 * DECLARED SPELLING.
 *
 * «ריבוע ABCD» · «ריבוע BCDA» names the same square read from the next vertex. The POLYGON was already absorbed
 * (its id is canonical over the ring's rotations and reversals, the parser's `polygonId`), but the noun's own
 * defining constraints were not: the row seats «ריבוע»'s right angle at the FIRST vertex and its equal pair on the
 * first two sides, so the second reading stated `⊥ at B` and `|BC| = |CD|` where the first stated `⊥ at A` and
 * `|AB| = |BC|`. Structurally different, so nothing was `known`; and the entailment gate (#1063) then read the
 * redundant constraints as independent and saw the freedom drop 4 → 3, so the line RECORDED — the student's figure
 * grew a second «ריבוע ABCD» row for a sentence that added nothing. The generic word in any reading was already
 * absorbed by #1953 (ADR-AG-259), which compares the ring; this is the same class one noun over.
 *
 * Fixed where the facts become a figure, for every noun at once: a ring the list already declares in another
 * spelling is RE-SPELLED to the declared one — the fact's vertices, and its line's definition constraints
 * regenerated from the row over the declared ring — whenever `sameStatementUnder` says the noun says the same
 * thing in that reading. From there the line takes exactly the verdict its declared spelling takes: an identical
 * restatement is `known` («זה כבר קיים באיור»), a different specific noun stays ADR-AG-260's refusal, and a
 * crossing order («ACBD») is a different ring and is untouched. 2-D reached the same rule from the same report
 * (ADR-618) over its command model; the rulings are shared, the code is not.
 *
 * Pure over the fact list, and positional: the result has the same length and order, so every index `fold`
 * reports — errors, effects, `constraintFact` — still names the student's own fact.
 */
function declaredRingSpelling(facts: readonly Fact[], group: readonly number[]): readonly Fact[] {
  const declared = new Map<Id, Id[]>();
  let out: Fact[] | null = null;
  facts.forEach((f, i) => {
    if (f.t !== 'polygon' || f.vertices.length < 3) return;
    const key = ringId(f.vertices);
    const spelling = declared.get(key);
    if (!spelling) {
      declared.set(key, [...f.vertices]);
      return;
    }
    if (spelling.every((v, j) => v === f.vertices[j])) return; // already the declared spelling
    if (!sameStatementUnder(f.noun, spelling, f.vertices)) return;
    const row = shapeRow(f.noun!)!;
    const was = row.givens([...f.vertices]);
    const now = row.givens([...spelling]);
    out ??= [...facts];
    out[i] = { ...f, vertices: [...spelling] };
    facts.forEach((g, j) => {
      if (group[j] !== group[i] || g.t !== 'constraint' || !g.definition) return;
      const at = was.findIndex((k) => sameConstraint(k, g.k));
      if (at >= 0) out![j] = { ...g, k: now[at] };
    });
  });
  return out ?? facts;
}

/**
 * #2385 ([ADR-AG-312](../../docs/06c-decisions-analytic.md#adr-ag-312)), #2418 ([ADR-AG-321](../../docs/06c-decisions-analytic.md#adr-ag-321))
 * — WHAT THE STATED LINES PUT ON A COMMON TANGENT'S LINE. Each `common-tangent` is told here, as `onLine`, the points any
 * OTHER admitted line puts on its pair's line, so where it touches is decided by the whole list, never by the order
 * the lines were typed in. «T על AB» · «AB משיק משותף …»: the first line names A and B before anything defines them, so
 * the fold defers it and the tangent's lowering sees a figure without T on AB. «AB משיק משותף …» · «T על AB»: the later
 * line is the one that pins the line to the touch point (the operator's 2026-10-20 ruling on #2418: the same figure as
 * the other order). Two shapes put a point on the pair's line: the `on-line-2pt` incidence («T על AB», «הישר AB עובר
 * דרך T»), and a `tangent-of` over the points a, b at a touch («AB משיק למעגל M בנקודה T»), which gives its `at`.
 * A faulted line is excluded by `include`, so its contribution drops with it (the fold's fixpoint re-runs this).
 *
 * `from` records, per common-tangent fact index, the LINES (groups) that contributed — `fold` reads it to record a
 * later contributing line as `narrowed` (see `fold`). Positional, like `declaredRingSpelling`.
 */
function statedOnCommonTangents(
  facts: readonly Fact[],
  group: readonly number[],
  include: (i: number) => boolean,
): { facts: readonly Fact[]; from: Map<number, Map<Id, Set<number>>> } {
  const from = new Map<number, Map<Id, Set<number>>>();
  if (!facts.some((f) => f.t === 'circles-about' && f.about.some((g) => g.t === 'common-tangent'))) return { facts, from };
  const pair = (u: Id, v: Id, a: Id, b: Id) => (u === a && v === b) || (u === b && v === a);
  const out = facts.map((f, i) => {
    if (f.t !== 'circles-about' || !f.about.some((g) => g.t === 'common-tangent')) return f;
    const about = f.about.map((g) => {
      if (g.t !== 'common-tangent') return g;
      const on = new Map<Id, Set<number>>();
      const put = (id: Id, j: number) => {
        if (!on.has(id)) on.set(id, new Set());
        on.get(id)!.add(group[j]);
      };
      facts.forEach((h, j) => {
        if (group[j] === group[i] || !include(j)) return;
        for (const k of factsWithin(h)) {
          if (k.t === 'constraint' && k.k.t === 'on-line-2pt' && pair(k.k.a, k.k.b, g.a, g.b)) put(k.k.id, j);
          if (k.t === 'tangent-of' && k.at !== undefined && (k.lines ?? []).some((l) => l.kind === 'points' && pair(l.a, l.b, g.a, g.b))) put(k.at, j);
        }
      });
      if (on.size === 0) return g;
      const prior = from.get(i) ?? new Map<Id, Set<number>>();
      on.forEach((lines, id) => prior.set(id, new Set([...(prior.get(id) ?? []), ...lines])));
      from.set(i, prior);
      return { ...g, onLine: [...on.keys()] };
    });
    return { ...f, about };
  });
  return { facts: out, from };
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
  /**
   * #1467 (ADR-AG-342): per fact, the points the fold's mint pass CREATED for its line by reference — set on the
   * line's first landed fact, null elsewhere. What the «נוצרה נקודה חדשה …» notice names.
   */
  created: Array<Id[] | null>;
  /** #2552 D9 (ADR-AG-344): per fact, the centre letter of the NEW circle it stated (`createdCircle`), null elsewhere. */
  createdCircles: Array<Id | null>;
  /**
   * #1687 (ADR-AG-348): per object id, the index of the FACT that first put it in the construction — recorded where
   * `constraintFact` is, by comparing the construction before and after each commit. `fold` turns it into the
   * construction's `objectLine`.
   */
  objectFact?: Map<Id, number>;
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
  facts = declaredRingSpelling(facts, group);
  const excluded = new Map<number, ApplyError>(); // line → the error that faulted it
  for (;;) {
    const include = (i: number) => !excluded.has(group[i]);
    const stated = statedOnCommonTangents(facts, group, include);
    const r = foldPass(stated.facts, include, group);
    reDecidedBy(r, stated.from, group);
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
          r.created[i] = null;
          r.createdCircles[i] = null;
        }
      });
      return withObjectLines(r, group);
    }
  }
}

/**
 * LINE PROVENANCE (#1687, [ADR-AG-348](../../docs/06c-decisions-analytic.md#adr-ag-348)): which line introduced each
 * object, carried on the construction as `objectLine` so the solve can tell the figure as it stood from what a later
 * line added. Read off the fold's own per-fact record (`objectFact`) through the fact → line map — never re-derived.
 * The internal record is dropped from the result.
 */
function withObjectLines(r: FoldResult, group: readonly number[]): FoldResult {
  const byFact = r.objectFact;
  delete r.objectFact;
  if (!byFact || byFact.size === 0) return r;
  const objectLine: Record<Id, number> = {};
  for (const o of r.construction.objects) {
    const i = byFact.get(o.id);
    if (i !== undefined) objectLine[o.id] = group[i];
  }
  return { ...r, construction: { ...r.construction, objectLine } };
}

/** One fold over the facts `include` admits: the in-order pass, then the deferral fixpoint. */
function foldPass(facts: readonly Fact[], include: (i: number) => boolean, group?: readonly number[]): FoldResult & { touchByOnLine?: boolean[] } {
  let c = EMPTY_CONSTRUCTION;
  const errors: Array<ApplyError | null> = facts.map(() => null);
  const effects: Array<LineEffect | null> = facts.map(() => null);
  const notices: Array<ApplyNotice | null> = facts.map(() => null);
  const createdCircles: Array<Id | null> = facts.map(() => null);
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
  const touchByOnLine: boolean[] = facts.map(() => false);
  const objectFact = new Map<Id, number>();
  const commit = (i: number, next: Construction, effect: LineEffect, notice?: ApplyNotice, byOnLine?: true, circle?: Id) => {
    touchByOnLine[i] = byOnLine === true;
    // #1687 (ADR-AG-348): the first fact that brought each object in — the object's provenance.
    for (const o of next.objects) if (!objectFact.has(o.id)) objectFact.set(o.id, i);
    const before = c.constraints;
    const beforeSel = c.selectors;
    c = next;
    // Appended AND replaced: #1049’s choice collapse swaps a constraint in place, and the
    // replacement belongs to the line that named the seat, not to the line that opened it.
    // A choice NARROWED in place (#1864, ADR-AG-267) — what remains open is still the opener's: every option it keeps
    // is one of the old choice's own options, by identity.
    const narrowedFrom = (old: Constraint | undefined, k: Constraint): boolean =>
      old !== undefined && old.t === 'choice' && k.t === 'choice' && k.options.every((o) => old.options.includes(o));
    c.constraints.forEach((k, at) => {
      if ((before[at] === k || narrowedFrom(before[at], k)) && constraintFact[at] !== undefined) return;
      constraintFact[at] = i;
    });
    c.selectors.forEach((s, at) => {
      if (beforeSel[at] === s && selectorFact[at] !== undefined) return;
      selectorFact[at] = i;
    });
    errors[i] = null;
    effects[i] = effect;
    notices[i] = notice ?? null;
    createdCircles[i] = circle ?? null;
  };
  /*
   * #2169 (ADR-W-131): the lines whose shape noun the ring's nouns already imply (`restates`) — the rest of that line's
   * noun DEFINITION (its `definition` constraints, ADR-AG-225) is held by the ring already, so it is not applied again:
   * applying it would add constraints that are new OBJECTS though not new information, and record the line.
   */
  const restated = new Set<number>();
  const lineOfFact = (i: number) => (group ? group[i] : i);
  facts.forEach((f, i) => {
    if (!include(i)) return;
    if (restated.has(lineOfFact(i)) && f.t === 'constraint' && f.definition) {
      commit(i, c, 'known');
      return;
    }
    const out = applyFact(c, f);
    if (out.ok) {
      commit(i, out.next, out.effect, out.notice, out.touchByOnLine, out.createdCircle);
      if (out.restates) restated.add(lineOfFact(i));
    } else errors[i] = out.error;
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
          commit(i, out.next, out.effect, out.notice, out.touchByOnLine, out.createdCircle);
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
  const created: Array<Id[] | null> = facts.map(() => null);
  /*
   * ⚠ WIDENED by #1467 ([ADR-AG-342](../../docs/06c-decisions-analytic.md#adr-ag-342); operator ruling 2026-09-27,
   * "Create everywhere + notice", and #2048's card d5 "every builder that has these objects creates them the same way"):
   * EVERY line whose only failures are references to points it lacks has them created — not only the forms 2-D
   * minted for in 2026-10 (`mintedByReference`, now 2-D's history: 2-D creates every referenced point too, ADR-769).
   * Which points are missing is the fold's own answer — each still-failing fact's `unknown-reference` — minted one
   * round at a time until the line lands; a line that still fails keeps nothing (the line is the unit, ADR-AG-133).
   * A radius or measure capital is never a point here: the fact that names it reports it as a symbol, not a point.
   *
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
      const missingRef = (e: ApplyError | null | undefined): Id | null =>
        e && e.code === 'unknown-reference' && refKindOf(e.detail) === 'point' && isPointLabel(e.detail) ? e.detail : null;
      if (!failing.every(({ j }) => missingRef(errors[j]) !== null && !objectById(c, errors[j]!.detail))) continue;
      const missing: Id[] = [];
      let next: Construction = c;
      const mintMore = (ids: readonly (Id | null)[]): boolean => {
        const fresh = [...new Set(ids.filter((x): x is Id => x !== null && !objectById(next, x)))];
        missing.push(...fresh);
        next = { ...next, objects: [...next.objects, ...fresh.map((id): GeoObject => ({ kind: 'free', id }))] };
        return fresh.length > 0;
      };
      mintMore(failing.map(({ j }) => errors[j]!.detail));
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
      // the line, applied on the minted figure; a fact naming a FURTHER missing letter («AD תיכון לצלע BC»: C after B)
      // mints that one too and the line is tried again, bounded by the letters a line can name
      const minted0 = next;
      let landed: Array<{ j: number; out: Extract<ApplyOutcome, { ok: true }> }> = [];
      for (let round = 0; round < 24; round++) {
        landed = [];
        let at = next;
        let refused: ApplyError | null = null;
        for (const { f, j } of failing) {
          const out = applyFact(at, f);
          if (!out.ok) {
            refused = out.error;
            break;
          }
          landed.push({ j, out });
          at = out.next;
        }
        if (!refused || !mintMore([missingRef(refused)])) break;
      }
      if (landed.length !== failing.length) {
        next = minted0;
        continue;
      }
      for (const { j, out } of landed) commit(j, out.next, j === landed[0].j ? 'created' : out.effect, out.notice, out.touchByOnLine, out.createdCircle);
      created[landed[0].j] = missing;
      minted = true;
    }
    if (!minted) break;
    fixpoint();
  }
  return { construction: c, errors, effects, constraintFact, selectorFact, notices, created, createdCircles, touchByOnLine, objectFact };
}

/**
 * A LINE THAT RE-DECIDED AN EARLIER COMMON TANGENT IS NARROWED, NOT KNOWN (#2418, ADR-AG-321). «AB משיק משותף …» ·
 * «T על הישר AB»: the later line is the only reason the tangent is lowered at T (`touchByOnLine`), and once it is, the
 * tangent entails the line — so the line's own facts come out `known`, and `decideSubmit` would answer «already known»
 * and drop the one line that changed the figure. A contributing line AFTER the tangent's line, whose facts the tangent
 * absorbed, is therefore `narrowed` (it records). A line that genuinely follows — the tangent already at T for its
 * letters, the figure, or the pair's position — is not marked, and keeps `known` (ADR-AG-020).
 */
function reDecidedBy(r: FoldResult & { touchByOnLine?: boolean[] }, from: Map<number, Map<Id, Set<number>>>, group: readonly number[]): void {
  const by = r.touchByOnLine;
  delete r.touchByOnLine;
  if (!by || from.size === 0) return;
  const later = new Set<number>();
  from.forEach((points, i) => {
    if (!by[i] || r.errors[i]) return;
    points.forEach((lines) => lines.forEach((g) => g > group[i] && later.add(g)));
  });
  if (later.size === 0) return;
  r.effects.forEach((e, j) => {
    if (e === 'known' && later.has(group[j])) r.effects[j] = 'narrowed';
  });
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

/** #1467: a point LETTER as the parser canonicalises it — what the mint pass may create (never a curve or a symbol). */
const isPointLabel = (id: Id): boolean => /^[A-Z]d*'*$/.test(id);

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
