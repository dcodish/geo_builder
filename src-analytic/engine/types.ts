/**
 * The analytic engine's data model.
 *
 * The ordered FACT LIST is the source of truth and the figure is derived from it (the 2-D
 * invariant, carried over): positions are never stored, so undo cannot desync. What is different
 * here — and it is the deepest difference from the synthetic tool — is that **the gauge is
 * pinned**. There is an absolute coordinate frame, so a coordinate is KNOWLEDGE rather than one
 * sample's accident ([docs/19 §6](../../docs/19-analytic-geometry-tool.md)). The honesty gate
 * moves accordingly: what must be checked is no longer "is this position meaningful" but "is this
 * value invariant across every admissible parameter value".
 *
 * THE PRIMITIVE IS THE GEOMETRIC OBJECT ([ADR-AG-009](../../docs/06c-decisions-analytic.md#adr-ag-009),
 * ratifying [02c](../../docs/02c-requirements-analytic.md) R1): a construction is a dependency
 * graph of objects, and an equation, a shape noun or a coordinate pair are three ways a student can
 * *state* one. The measured reason is that the corpus cannot be expressed otherwise — run through
 * the real path, 02c §5c's triangle-by-side-equations refuses every line on an equation-first
 * model, and §5a's parallelogram produces two points and no figure.
 *
 * A CURVE IS ONE THING — **as a curve object**. An implicit equation `f(x, y; params) = 0`, carried
 * as an `Expr` and classified into the canonical family, is how a *curve* is represented and how an
 * equation identifies which object it names ([ADR-AG-006](../../docs/06c-decisions-analytic.md#adr-ag-006)
 * D1, superseded as a claim about the model and kept as a claim about curves). That uniformity is
 * deliberate — the corpus hands the tool equations in half a dozen spellings (`(x−3)²+(y−4)²=9`,
 * `x²+y²−2ax−2x=0`, `x²−6x+y²+t=0`), and normalizing them by *fitting* rather than by
 * pattern-matching means a spelling nobody anticipated still lands in the right family.
 * Constructive forms («מעגל שמרכזו M ורדיוסו 5») synthesize the same `Expr`, so there is one
 * representation, not two.
 */
import type { DerivedRule } from './derived';
import type { Constraint } from './solve';
import type { Expr } from './expr';

export type Id = string;

// ---------------------------------------------------------------------------
// Parameters and the THREE kinds of inequality (ADR-AG-005 D7)
// ---------------------------------------------------------------------------

/**
 * KIND 1 — a parameter's DOMAIN. Declaration-time, and a precondition rather than a given to be
 * satisfied: it FILTERS the roots of every later pin, silently, because a value outside it was
 * never a candidate. Conflating this with a branch selector is the bug D7 exists to prevent —
 * `a > 0` must never report "no valid configuration", it must simply never propose a negative `a`.
 */
export interface Domain {
  /** Inclusive unless the matching `*Open` flag is set. */
  min?: number;
  minOpen?: boolean;
  max?: number;
  maxOpen?: boolean;
  /** «שונה מאפס» — isolated excluded values. */
  exclude?: number[];
}

export const UNBOUNDED: Domain = {};

export function inDomain(d: Domain, v: number): boolean {
  if (!Number.isFinite(v)) return false;
  if (d.min !== undefined && (d.minOpen ? v <= d.min : v < d.min)) return false;
  if (d.max !== undefined && (d.maxOpen ? v >= d.max : v > d.max)) return false;
  if (d.exclude?.some((e) => Math.abs(v - e) < 1e-9)) return false;
  return true;
}

/** Human-readable, for the data panel. */
export function domainText(sym: string, d: Domain): string {
  const bits: string[] = [];
  if (d.min !== undefined) bits.push(`${d.min} ${d.minOpen ? '<' : '≤'} ${sym}`);
  if (d.max !== undefined) bits.push(`${sym} ${d.maxOpen ? '<' : '≤'} ${d.max}`);
  if (d.exclude?.length) bits.push(`${sym} ≠ ${d.exclude.join(', ')}`);
  return bits.length ? bits.join(',  ') : sym;
}

// ---------------------------------------------------------------------------
// Curves — the closed four-member family (docs/19 §2a)
// ---------------------------------------------------------------------------

/**
 * The whole curve vocabulary of twenty exams. No hyperbola, no rotated conic, no translated conic
 * — every parabola sits on the x-axis and every ellipse is centred at the origin. A student who
 * types one anyway gets an honest refusal naming what is out of scope, never a mis-drawn figure.
 */
export type CurveKind = 'line' | 'circle' | 'parabola' | 'ellipse';

export interface Curve {
  kind: CurveKind;
  /** `f(x, y; params)`; the curve is the zero set. `x` and `y` are reserved symbols. */
  eq: Expr;
}

/** A curve with every coefficient resolved to a number — what geometry and rendering consume. */
export type NumCurve =
  | { kind: 'line'; a: number; b: number; c: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  /** `y² = 2p·x`. Focus `(p/2, 0)`, directrix `x = −p/2`. */
  | { kind: 'parabola'; p: number }
  /** `x²/a² + y²/b² = 1`, semi-axes. */
  | { kind: 'ellipse'; a: number; b: number };

/**
 * How a curve is NAMED (ADR-AG-005 D6, taken from what the corpus does): circles are named because
 * they regularly arrive in twos (`מעגל I` / `מעגל II`); parabolas and ellipses are anonymous
 * because no exam in twenty carries two of either — so a second one is a REFUSAL, not a silently
 * shadowed object. Lines are `ℓ1`/`ℓ2` or named by two points.
 */
export interface CurveLabel {
  /** Display name — `ℓ1`, `מעגל I`, `AB`; '' for the anonymous conics. */
  name: string;
  kind: CurveKind;
}

// ---------------------------------------------------------------------------
// Facts — the ordered source of truth
// ---------------------------------------------------------------------------

export interface FactBase {
  /** The student's own line, kept verbatim for the fact list, the save file and the export. */
  src: string;
}

export type Fact =
  | (FactBase & { t: 'param'; sym: string; domain: Domain })
  | (FactBase & { t: 'point'; id: Id; x: Expr; y: Expr })
  | (FactBase & { t: 'curve'; id: Id; label: CurveLabel; curve: Curve })
  | (FactBase & { t: 'derived'; id: Id; rule: DerivedRule })
  | (FactBase & { t: 'segment'; id: Id; a: Id; b: Id })
  | (FactBase & { t: 'polygon'; id: Id; vertices: Id[] })
  /**
   * A statement that must HOLD rather than an object that exists (#1016) — «שטח המשולש ABC הוא 20».
   *
   * It carries no id because it creates nothing: it consumes the freedom of points that already do.
   */
  | (FactBase & { t: 'constraint'; k: Constraint })
  /**
   * D7 KIND 2 — a BRANCH SELECTOR, not a constraint ([ADR-AG-005](../../docs/06c-decisions-analytic.md#adr-ag-005)).
   *
   * «על החלק החיובי של ציר x» carries both: being *on* the axis is an incidence that consumes a
   * degree of freedom, while *which part* of it chooses among configurations that already satisfy
   * every given. A selector consumes NO freedom — treating it as an equation would report "no valid
   * configuration" on a perfectly good figure, which is the bug D7 exists to prevent.
   */
  | (FactBase & { t: 'selector'; id: Id; axis: 'x' | 'y'; positive: boolean })
  /**
   * INTRODUCE a point without placing it — the declaration half of the distinction #1017 draws.
   *
   * «AD תיכון לצלע BC» names `D` for the first time, so the sentence introduces it; the constraint
   * that follows then says where it is. Emitted by any rule whose sentence NAMES a new point, so
   * that the reference kinds can keep refusing to invent one.
   */
  | (FactBase & { t: 'declare'; id: Id });

// ---------------------------------------------------------------------------
// Construction — the fold of the fact list
// ---------------------------------------------------------------------------

/**
 * A parameter DECLARATION — a domain that narrows a symbol (D7 kind 1).
 *
 * It does not bring a parameter into existence: the register of free DOFs is derived from what the
 * objects actually use ([carriers.ts](carriers.ts) `paramRegister`). A symbol used but never
 * declared is free and unbounded; a symbol declared but not yet used is still reported, because the
 * student stated it.
 */
export interface ParamDecl {
  sym: string;
  domain: Domain;
}

/**
 * THE OBJECT — the construction's primitive.
 *
 * A discriminated union so that every consumer switches on `kind` rather than on which array an
 * object happened to live in, and so that adding a kind is a compile error at each place that must
 * decide something about it ([carriers.ts](carriers.ts): its freedom, its symbols, its
 * dependencies). The two members here are the *stated* forms V0 built; the shape nouns, derived
 * points and free points of [02c §5](../../docs/02c-requirements-analytic.md) join them as further
 * members rather than as a parallel model.
 */
export type GeoObject =
  /** Stated by coordinates — `A(2,6)`. Its expressions may carry parameters. */
  | { kind: 'point'; id: Id; x: Expr; y: Expr }
  /** Stated by equation — the four-member curve family. */
  | { kind: 'curve'; id: Id; label: CurveLabel; curve: Curve }
  /**
   * DERIVED from points already stated — a midpoint, a centroid, an incentre (#1028). 0-DOF and
   * solver-free: given its parents there is exactly one answer, in closed form. This is the kind
   * that makes the object→object dependency relation non-empty for the first time.
   */
  | { kind: 'derived'; id: Id; rule: DerivedRule }
  /**
   * A point the student NAMED but did not place — «משולש ABC» introduces three of them (#1017).
   *
   * 2 DOF, sampled like any other free magnitude, so the figure is drawable before the coordinates
   * arrive and the vertex MOVES under «הציגו תצורה אחרת» ([ADR-052](../../docs/06-decisions.md#adr-052)).
   * It is the counterpart of the `unknown-reference` refusal, not a contradiction of it: naming a
   * vertex in a DECLARATION introduces it, while naming one in a REFERENCE («M אמצע AB») may not
   * invent it.
   */
  | { kind: 'free'; id: Id }
  /** `הקטע AB` — drawn between two points, and what gives «אמצע הצלע BC» a referent. */
  | { kind: 'segment'; id: Id; a: Id; b: Id }
  /** `משולש ABC` over vertices that are ALREADY stated — its sides. Free vertices are B3's job. */
  | { kind: 'polygon'; id: Id; vertices: Id[] };

export type PointObject = Extract<GeoObject, { kind: 'point' }>;
export type CurveObject = Extract<GeoObject, { kind: 'curve' }>;
export type DerivedObject = Extract<GeoObject, { kind: 'derived' }>;
export type SegmentObject = Extract<GeoObject, { kind: 'segment' }>;
export type PolygonObject = Extract<GeoObject, { kind: 'polygon' }>;

export const isPoint = (o: GeoObject): o is PointObject => o.kind === 'point';
export const isCurve = (o: GeoObject): o is CurveObject => o.kind === 'curve';
export const isDerived = (o: GeoObject): o is DerivedObject => o.kind === 'derived';
export const isFree = (o: GeoObject): o is Extract<GeoObject, { kind: 'free' }> => o.kind === 'free';

/**
 * Anything that resolves to a single position — a stated point or a derived one.
 *
 * Callers that want "the points of the figure" must ask for this rather than for `kind === 'point'`,
 * or a derived point silently stops being a point: absent from the panel, absent from the view box,
 * and unavailable as another rule's parent.
 */
export const isPositional = (
  o: GeoObject,
): o is PointObject | DerivedObject | Extract<GeoObject, { kind: 'free' }> =>
  o.kind === 'point' || o.kind === 'derived' || o.kind === 'free';

/**
 * The fold of the fact list: the objects, in the order the student stated them, plus the parameter
 * declarations that narrow their symbols.
 */
export interface Construction {
  params: ParamDecl[];
  objects: GeoObject[];
  /** Statements that must hold — solved jointly over the free carriers ([solve.ts](solve.ts)). */
  constraints: Constraint[];
  /** Post-solve choices among valid configurations (D7 kind 2) — they consume no freedom. */
  selectors: Selector[];
}

export interface Selector {
  id: Id;
  axis: 'x' | 'y';
  positive: boolean;
}

export const EMPTY_CONSTRUCTION: Construction = {
  params: [],
  objects: [],
  constraints: [],
  selectors: [],
};

export const pointsOf = (c: Construction): PointObject[] => c.objects.filter(isPoint);
export const positionalOf = (c: Construction) => c.objects.filter(isPositional);
export const curvesOf = (c: Construction): CurveObject[] => c.objects.filter(isCurve);
export const objectById = (c: Construction, id: Id): GeoObject | undefined =>
  c.objects.find((o) => o.id === id);

/** The at-most-one rule for the anonymous conics (D6). */
export function conicSlotTaken(c: Construction, kind: CurveKind): boolean {
  return (
    (kind === 'parabola' || kind === 'ellipse') &&
    c.objects.some((o) => isCurve(o) && o.curve.kind === kind)
  );
}
