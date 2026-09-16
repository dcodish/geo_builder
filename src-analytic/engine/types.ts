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
import type { Constraint, Direction } from './solve';
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
  /**
   * The kind the STATEMENT claimed, when it named one — an EXPECTATION, not the answer.
   *
   * `classify` is the authority and derives the family from the six fitted coefficients; this is
   * passed to it so a refusal can be specific ("you wrote «אליפסה» and this is a hyperbola") rather
   * than generic. It is **optional** because [02c R6](../../docs/02c-requirements-analytic.md) makes
   * the shape noun optional for an equation: a bare `y^2=54x` claims nothing, and the fit already
   * knows the kind (#1037). Absent means "the student named no family", never "unknown kind".
   */
  kind?: CurveKind;
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
  /** The family the statement named, if it named one — see {@link Curve.kind}. */
  kind?: CurveKind;
  /**
   * The equation AS THE STUDENT WROTE IT, for a curve they gave no other name (#1092).
   *
   * It lives on the LABEL because for such a curve the equation *is* its name: «הישר y=9» is how
   * a student refers to it, and `anonIndex` derives the object's id from this same string. That is
   * what lets a generated sentence round-trip — it re-parses to the SAME content-derived id rather
   * than minting a second object for one curve (the ADR-AG-023 defect).
   *
   * Absent on a curve that HAS a name, where the name is the way to refer to it.
   */
  eqSrc?: string;
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
  | (FactBase & { t: 'curve'; id: Id; label: CurveLabel; curve: Curve; stated: boolean })
  | (FactBase & { t: 'derived'; id: Id; rule: DerivedRule })
  | (FactBase & { t: 'segment'; id: Id; a: Id; b: Id })
  | (FactBase & { t: 'polygon'; id: Id; vertices: Id[]; noun?: string })
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
  | (FactBase & { t: 'selector'; sel: Selector })
  /**
   * INTRODUCE a point without placing it — the declaration half of the distinction #1017 draws.
   *
   * «AD תיכון לצלע BC» names `D` for the first time, so the sentence introduces it; the constraint
   * that follows then says where it is. Emitted by any rule whose sentence NAMES a new point, so
   * that the reference kinds can keep refusing to invent one.
   */
  | (FactBase & { t: 'declare'; id: Id })
  /**
   * «זווית B ישרה» — a right angle named by its VERTEX ALONE (#1049).
   *
   * It cannot be lowered in the parser, because `B` names an angle only once the figure says which
   * two rays meet there. The M1 boundary is where that is known, so this is the one fact whose
   * constraint is built by `applyFact` rather than handed to it — and where the figure has no single
   * shape through `B`, it is a refusal that names the format rather than a guess (the R32 discipline).
   *
   * «זווית ABC ישרה» needs none of this and lowers to a constraint in the parser, as it should.
   */
  | (FactBase & { t: 'right-angle'; id: Id })
  /**
   * «שטח הדלתון הוא 24» — a shape named by its NOUN, with no vertices (#1049).
   *
   * A CONTEXTUAL reference: "the kite" means the one the student already drew. Which ring that is
   * is a question about the construction, so like `right-angle` it is resolved at M1 — and where
   * the figure has no such shape, or more than one, it is refused rather than guessed.
   *
   * The corpus is full of these («שיפוע הישר הוא 2», «האלכסונים נפגשים בנקודה O»), and this is the
   * first of them. Each one still needs its own rule; what they share is this resolution step.
   */
  | (FactBase & { t: 'area-of'; noun: string; value: Expr })
  /**
   * «אלכסוני המרובע נפגשים בנקודה O» — a concurrency point whose SHAPE was not named (#1070).
   *
   * The contextual sibling of `area-of`: the shape is whichever one in the figure has the right
   * number of vertices, resolved at M1 and refused when that is not exactly one.
   */
  | (FactBase & { t: 'meet-of'; role: DerivedRule['t']; arity: number; id: Id })
  /**
   * «משוואת האלכסון הראשי היא y=2x» — a diagonal named by its ROLE rather than its endpoints.
   *
   * In a kite the principal diagonal is the axis of symmetry — the one joining the two vertices
   * where the equal sides meet. That is a geometric FACT about the figure, not a naming
   * convention, so it is meaningful only for a noun whose row distinguishes the two, and must be
   * refused by name for one that does not. Guessing would assert a distinction the question never
   * made.
   */
  | (FactBase & { t: 'diagonal-eq'; principal: boolean; eq: Expr })
  /** «נתון מעגל O» — a circle on a centre point, with a radius parameter (#1060). */
  | (FactBase & { t: 'circle-at'; id: Id; centre: Id; r: Expr })
  /** «דרך P עובר ישר מקביל ל AB» — a line through a point, with a copied direction (#1093). */
  | (FactBase & { t: 'line-at'; id: Id; through: Id; dir: Direction; perp: boolean })
  /**
   * «המעגל משיק לציר ה-x» — tangency stated about the ONE circle in the figure (#1060).
   *
   * The contextual sibling of `area-of` and `meet-of`, and the third of its shape: which circle
   * it means is a question about the construction, so M1 answers it and refuses when the answer
   * is not exactly one.
   */
  | (FactBase & { t: 'tangent-of'; axes: Array<'x' | 'y'> })
  /**
   * «הנקודה A נמצאת על האליפסה» — a point on a curve named only by its KIND (#1057).
   *
   * F2 corpus vocabulary (docs/19 §4a), and the fourth contextual reference: which curve it
   * means is a question about the construction, so M1 answers it, and refuses where the figure
   * holds none or several of that kind.
   */
  | (FactBase & { t: 'on-kind'; id: Id; kind: CurveKind });

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
  /** Stated by equation — the four-member curve family. `stated` is #1076's carrier flag. */
  | { kind: 'curve'; id: Id; label: CurveLabel; curve: Curve; stated: boolean }
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
  /**
   * The NOUN the student used, in its registry spelling (#1049).
   *
   * Not decoration: «האלכסון הראשי» is meaningless until the figure knows it is a kite, and
   * «שטח הדלתון הוא 24» names a shape without naming its vertices. Both are questions about what
   * this ring IS, which the vertex list alone cannot answer. Absent for a polygon that arrived
   * some other way.
   */
  | { kind: 'polygon'; id: Id; vertices: Id[]; noun?: string }
  /**
   * A circle given by its CENTRE POINT and a radius — «נתון מעגל O» (#1060).
   *
   * Every curve until now was an equation over the plane’s variables, with parameters for
   * coefficients. That cannot express *"the circle centred at the point O"*, because `O` is an
   * object and not a number — and the corpus pins a circle that way constantly: «מעגל שמרכזו M»,
   * and «מעגל המשיק לציר ה-x», which says r = |y_O| about a circle whose centre is free.
   *
   * So this is the first curve whose SHAPE depends on a point, which is why it is an object kind
   * rather than another `Curve` member: `Curve` is resolved from the environment alone, and this
   * needs the placed figure. `evaluate` turns it into an ordinary `NumCurve` once the centre has
   * a position, and everything downstream — drawing, the centre mark, the panel — is unchanged.
   *
   * It carries NO freedom itself: the centre is a `free` point with its own two degrees, and the
   * radius is an ordinary parameter in the register. Counting it here would count both twice.
   */
  | { kind: 'circle-at'; id: Id; centre: Id; r: Expr }
  /**
   * «דרך P עובר ישר מקביל ל AB» — a line CONSTRUCTED through a point, copying a direction (#1093).
   *
   * The exact parallel of `circle-at` one dimension over, and it carries freedom for the same
   * reason: **none of its own.** `through` is a point object whose DOF are counted where the point
   * lives, and `dir` names an object whose direction is already determined by the figure. So the
   * line needs no free coefficients and no new residual — `evaluate` reads the placed point and the
   * resolved direction and emits a concrete line.
   *
   * `perp` carries the other half of the corpus phrase («מאונך ל»), which is the same construction
   * with the direction turned a quarter turn — a flag rather than a second object kind, because
   * nothing else about it differs.
   */
  | { kind: 'line-at'; id: Id; through: Id; dir: Direction; perp: boolean };

export type PointObject = Extract<GeoObject, { kind: 'point' }>;
export type CurveObject = Extract<GeoObject, { kind: 'curve' }>;
export type DerivedObject = Extract<GeoObject, { kind: 'derived' }>;
export type SegmentObject = Extract<GeoObject, { kind: 'segment' }>;
export type PolygonObject = Extract<GeoObject, { kind: 'polygon' }>;

export const isPoint = (o: GeoObject): o is PointObject => o.kind === 'point';
export const isCurve = (o: GeoObject): o is CurveObject => o.kind === 'curve';

/**
 * Does this fact NAME AN OBJECT — an id whose collision is a name clash?
 *
 * Stated POSITIVELY on purpose (#1049). Two places used to answer it by listing the kinds that do
 * NOT («param, constraint, selector, declare»), so every new id-less fact had to be remembered in
 * both — and a new fact that happens to carry an `id` for some other reason, like «זווית B ישרה»,
 * was silently treated as naming an object and collided with the point it merely mentions. A
 * positive list gets the new kind wrong in the safe direction: excluded until it says otherwise.
 */
export type NamingFact = Extract<Fact, { t: 'point' | 'curve' | 'derived' | 'segment' | 'polygon' }>;
export const namesObject = (f: Fact): f is NamingFact =>
  f.t === 'point' || f.t === 'curve' || f.t === 'derived' || f.t === 'segment' || f.t === 'polygon';
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

/**
 * A post-solve FILTER over configurations — D7 kind 2.
 *
 * A selector consumes no freedom: it does not pin a point, it rules out draws the student did not
 * mean. That is why it is not a constraint — treating one as a constraint would drop the DOF cue by
 * one and report a figure as more determined than it is.
 *
 * Two members, and both are REGIONS: a half-plane, and the span between two points (#1073).
 */
export type Selector =
  /** `B על החלק החיובי של ציר x` — the point is on one side of an axis. */
  | { kind: 'axis-side'; id: Id; axis: 'x' | 'y'; positive: boolean }
  /**
   * `D על הצלע BC` — the point lies BETWEEN `a` and `b`, not merely on their line.
   *
   * Operator ruling, 2026-09-15: «צלע» and «קטע» carry this bound and «ישר» does not. **The noun
   * decides**, and the DOF is 1 either way — only the range differs, which is why this is a selector
   * and the collinearity beside it is the constraint.
   */
  | { kind: 'between'; id: Id; a: Id; b: Id }
  /**
   * The vertices of a shape are DISTINCT POINTS (#1077).
   *
   * Every shape noun asserts this and none of them encoded it, so the solve was free to satisfy
   * «דלתון ABCD» by putting `B` and `D` in the same place — |AB|=|AD| and |CB|=|CD| hold trivially
   * there. Measured: the kite collapsed in 25 of 60 configurations on its own, and in 51 of 60
   * once a diagonal was given. A figure drawn that way contradicts the noun the student wrote.
   *
   * It is a SELECTOR and not a constraint because it consumes no freedom — a quadrilateral has
   * eight degrees either way — and because "not equal" is not an equation a least-squares solve
   * can drive to zero. It is a region: the configurations minus the degenerate ones.
   *
   * The test is RELATIVE to the figure`s own size, so it states no magnitude (ADR-052): two points
   * a thousandth of the figure`s span apart are the same point for every purpose a student has.
   */
  | { kind: 'distinct'; ids: Id[] }
  /**
   * TWO CROSSINGS OF THE SAME PAIR ARE TWO POINTS (#1113).
   *
   * An intersection is not a derived point — it is a `declare` plus two incidences, and the joint
   * solve finds *a* crossing. A line meets a conic twice, so two sentences naming the crossings of
   * the SAME pair have identical constraints, and the solve settled both on the same root: four ring
   * clicks put four letters on one location while the far crossing was never reachable at all. The
   * operator, 2026-09-16: *"2 points with different names on the same location which should never
   * happen"*.
   *
   * The ruling (his, 2026-09-16) was that **the sentence names the root** rather than a branch index
   * being stored behind the student's back, so «נקודת החיתוך הראשונה/השנייה» is the wording and this
   * selector is what makes the two words mean different points. It names only its own subject: the
   * siblings are found from the construction by their incidence signature, because the parser is pure
   * over one line and cannot know what the figure already holds.
   *
   * A SELECTOR, for `distinct`'s reasons exactly — it consumes no freedom (the crossing is already
   * pinned by its two incidences) and "not the other root" is a region, not an equation a
   * least-squares solve can drive to zero.
   */
  | { kind: 'crossing-distinct'; id: Id };

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

/*
 * `conicSlotTaken` lived here — the at-most-one rule for the anonymous conics (D6), deleted by
 * #1026 ([ADR-AG-018](../../docs/06c-decisions-analytic.md#adr-ag-018)).
 *
 * It was never a policy. Anonymous conics shared the fixed ids `parabola` / `ellipse`, so a second
 * parabola collided with the first on its NAME, and this function turned that collision into a
 * sentence claiming a figure may hold only one. A content-derived id (`parabola-<hash>`, the same
 * mechanism unnamed lines and circles already used) removes the collision, and with it the reason
 * to refuse. A refusal that can no longer happen is deleted rather than left wired, or it becomes
 * the next reader's false constraint.
 */
