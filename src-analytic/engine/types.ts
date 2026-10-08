/**
 * The analytic engine's data model.
 *
 * The ordered FACT LIST is the source of truth and the figure is derived from it (the 2-D
 * invariant, carried over): positions are never stored, so undo cannot desync. What is different
 * here — and it is the deepest difference from the synthetic tool — is that **the gauge is
 * pinned**. There is an absolute coordinate frame, so a coordinate is KNOWLEDGE rather than one
 * sample's accident ([docs/19 §6](../../docs/archive/19-analytic-geometry-tool.md)). The honesty gate
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
import type { DerivedRule, FootLine } from './derived';
import type { AngleName, AngleRef, Constraint, Direction, TangentLineRef } from './solve';
import type { Expr } from './expr';
import type { LengthExpr } from './lengths';
import { lineIdOf, numeralCurveId } from './names';

export type Id = string;

/** A perpendicular named by its DESCRIPTION — the point it is dropped from and, when said, the line it is dropped onto (#1620). */
export interface PerpRef {
  from: Id;
  onto?: FootLine;
  /**
   * The tool letter of the foot, when the perpendicular is named IN FULL (its point and its line): the figure has no
   * such perpendicular yet, so the reference BUILDS it with this foot (#1727, ADR-AG-229). One already drawn is still
   * the one referred to, and the letter then names nothing (`derive` drops a tool letter the fold did not create).
   */
  mint?: Id;
}

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

/**
 * Is `v` inside the domain?
 *
 * `floor` is how close to an OPEN bound (or an excluded value) a value may sit and still count as
 * the bound itself (#1504, ADR-AG-167 amendment 1). A strict inequality judged EXACTLY is judged at
 * a precision the solver does not have: «מעגל M משיק למעגל K מבחוץ» then «…מבפנים» forces r = 0,
 * and a descent converging toward that contradiction parks at r ≈ 8.6e-11 — which `v <= 0` calls
 * positive, so a circle of radius zero was drawn green. The solve's judge passes the figure's
 * SOLVER RESOLUTION (relative to its span, `openBoundFloor` in evaluate.ts); a value inside it is
 * the bound, as far as this solver can tell. `0` keeps the exact judgement for callers that are not
 * judging a solved value (sampling, the panel).
 */
export function inDomain(d: Domain, v: number, floor = 0): boolean {
  if (!Number.isFinite(v)) return false;
  if (d.min !== undefined && (d.minOpen ? v <= d.min + floor : v < d.min)) return false;
  if (d.max !== undefined && (d.maxOpen ? v >= d.max - floor : v > d.max)) return false;
  if (d.exclude?.some((e) => Math.abs(v - e) < Math.max(1e-9, floor))) return false;
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
  /**
   * `inheritExtent` (#1234) — the student named the object and gave its equation but wrote NO noun
   * («משוואת CE היא x-3y=0»), so whether this is a drawn line or a condition on an existing segment
   * cannot be decided at parse time: `parseLine` takes no figure context. The fold decides it, which
   * is the only layer that can see whether `seg-CE` is already there.
   */
  | (FactBase & { t: 'curve'; id: Id; label: CurveLabel; curve: Curve; stated: boolean; inheritExtent?: true })
  /**
   * `auto` (#1270, ADR-AG-184) — a name the TOOL gave, never the student: a canonical circle's centre
   * called `O` by default. It yields to anything already holding the id (the fold absorbs it as
   * `known`), where a student's own derivation of an existing point is a CONDITION on it (#1320).
   */
  | (FactBase & { t: 'derived'; id: Id; rule: DerivedRule; auto?: true })
  /**
   * `ref` (#1639, ADR-AG-198) — the segment is drawn by a sentence that REFERS to its ends («AC קוטר במעגל»), so
   * the ends must already exist: it never introduces them, as the bare «AC» line (which NAMES the segment) does.
   */
  | (FactBase & { t: 'segment'; id: Id; a: Id; b: Id; ref?: true })
  /**
   * «הישר BC» — THE LINE through two named points, DRAWN (#1639, ADR-AG-198): the line-noun twin of the
   * segment a bare «BC» declares. A sentence that names a line draws it, whichever relation it states, and
   * the line is the `line-at` through `a` along `a→b` (0 DOF, closed form). M1 decides what it adds: nothing
   * when the figure already has that line (stated by its equation, or drawn) or draws a piece over the pair
   * (ADR-AG-135's ruling (a): the figure is the authority), the line otherwise. A later «משוואת הישר BC היא
   * …» states THIS line's equation — the curve takes the line's place, never a second object beside it.
   */
  | (FactBase & { t: 'line-2pt'; a: Id; b: Id })
  | (FactBase & { t: 'polygon'; id: Id; vertices: Id[]; noun?: string })
  /**
   * A statement that must HOLD rather than an object that exists (#1016) — «שטח המשולש ABC הוא 20».
   *
   * It carries no id because it creates nothing: it consumes the freedom of points that already do.
   */
  /*
   * `definition` (#1714, ADR-AG-225) — the constraint is the DEFINITION of a named shape («מלבן ABCD»'s right angle)
   * or of a stated correspondence («△ABC ≅ △DEF»'s equal sides), not a measure the sentence states. The parser,
   * which built it from the noun, says so once; the stated-measure layer leaves it off the figure, as 2-D does.
   */
  | (FactBase & { t: 'constraint'; k: Constraint; definition?: true })
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
   * «זווית C = 60» · «∠B = ∠C» — an angle given a VALUE, or set in ratio to another, where at least one
   * side names its angle by the VERTEX ALONE (#1407, ADR-AG-158).
   *
   * The `right-angle` fact with a value: the lone vertex is resolved at M1 by the SAME resolver, so its
   * rays are the one shape's sides at the vertex, and the line then lowers to exactly the `angle` /
   * `angle-ratio` constraint its three-letter twin («זווית ACB = 60») lowers to in the parser. Where the
   * vertex is in no shape, or in several, it is refused with the three-letter form it needs.
   */
  | (FactBase & {
      t: 'vertex-angle';
      left: AngleName;
      /** `measure` (#1621, ADR-AG-215): «tan∢A = 2» — the `angle` constraint's measure, carried to it unchanged. */
      rhs: { t: 'value'; value: Expr; measure?: 'tan' | 'cos' | 'sin' } | { t: 'angle'; of: AngleName; k: Expr };
      /** «A = 40» — no angle noun (#1622, ADR-AG-218): a letter that is no point of the figure is not understood, not refused. */
      bare?: true;
    })
  /**
   * A CEVIAN WHOSE TARGET ONLY THE FIGURE KNOWS (#1240, #1222; ADR-AG-209) — «AD גובה», «תיכון מנקודה A»,
   * «גובה לצלע BC». The sentence names the apex, or the side, and not both: given «משולש ABC», apex `A`
   * determines side `BC` and side `BC` determines apex `A`. Which triangle holds them is a question about the
   * construction, so it is resolved at M1 (the `right-angle` seam): exactly one triangle builds through
   * `cevianFacts`; several ask (`ambiguous-cevian`); none is refused (`cevian-no-triangle`). `foot` may be a
   * mint placeholder — the tool names an unnamed foot (#1263's ruling), resolved by `derive` before M1.
   */
  | (FactBase & {
      t: 'cevian-of';
      role: 'median' | 'altitude';
      apex?: Id;
      foot: Id;
      side?: [Id, Id];
      /**
       * «תיכון ליתר» (#1222, operator ruling 2026-10-02 on #1620): the side is the HYPOTENUSE of the one triangle whose
       * right angle the figure states; a right triangle whose right angle is still a choice asks which side it is.
       */
      hypotenuse?: true;
      /** The TOOL named the foot (ADR-AG-211): it is lowered as a derived point (`toolFootFacts`), never a free one. */
      toolFoot?: true;
    })
  /**
   * «AD חוצה את הזווית BAC» · «האלכסון DB חוצה את הזווית ADC» · «AM הוא חוצה זווית CMD» — a segment from the
   * angle's vertex that bisects it (#1284; ADR-AG-209). `p` is the segment's other end. What the sentence
   * adds depends on the figure, exactly as in 2-D: a `p` the figure does not have yet is the bisector's FOOT
   * on the line through the angle's two ray points (`cevianFacts`), and an existing `p` lies on the bisector's
   * ray (`onBisectorFacts`). A lone vertex («זווית A») is resolved by the one angle resolver. With NO `p` —
   * «חוצה זווית ABC» on its own — the bisector is drawn as a line through the vertex (2-D's visible `bisector`).
   */
  | (FactBase & { t: 'bisects'; at: AngleName; p?: Id })
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
  | (FactBase & { t: 'meet-of'; role: DerivedRule['t']; arity: number; id: Id; noun?: string; named?: [Id, Id, Id, Id]; draw?: true })
  /*
   * `draw` (#1751, ADR-AG-241) — the VERB frame («האלכסונים נפגשים בנקודה M») is about the diagonals, so the resolved
   * ring's two diagonals are drawn with the point; the NOUN frame («M מפגש האלכסונים») leaves it off and draws M only.
   *
   * `noun` (#1620, ADR-AG-208) — the shape noun the sentence wrote («אלכסוני הטרפז»): the rings it names are
   * `ringsNamed`'s (a specific noun its own rings and their refinements, a generic noun every ring of its
   * arity), so «הטרפז» resolves to the one trapezoid beside a plain quadrilateral and is refused where the
   * figure has none — 2-D's verdict. Absent: every ring of the arity, as before.
   *
   * `named` (#1620, ADR-AG-208) — the diagonals NAMED by their letters («האלכסונים AC ו-BD»), as the ring order
   * the `diagonals` rule reads (v0v2, v1v3). A ring of those four vertices whose diagonals they are NOT («AB ו-CD»
   * in «מרובע ABCD», two of its sides) refuses the sentence; with no such ring the named segments stand alone.
   */
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
  /** `hidden` (#1622 E4, ADR-AG-220): the circle a SECTOR is cut from — it carries the arc's ends, and only the arc is drawn. */
  | (FactBase & { t: 'circle-at'; id: Id; centre: Id; r: Expr; hidden?: true })
  /**
   * «דרך P עובר ישר מקביל ל AB» — a line through a point, with a copied direction (#1093).
   *
   * `dir` may also be FREE (#1319, ADR-AG-144): «דרך N עובר ישר» creates a line whose direction is the
   * unknown the rest of the question determines. `name` is the student's own name for it («ישר l3»),
   * absent for an anonymous one.
   */
  /**
   * `drawn: false` (#1620, ADR-AG-207) — the line is a CARRIER, not a drawing: «הישר העובר דרך E מקביל לציר ה-y
   * וחותך את הצלע AB בנקודה F» draws the piece EF and keeps the line only to hold F (2-D's `visible: false`).
   * A later sentence that states the line itself draws it (M1's upgrade).
   */
  | (FactBase & { t: 'line-at'; id: Id; through: Id; dir: Direction; perp: boolean; name?: string; drawn?: false })
  /**
   * «מעגל ABD» · «המעגל העובר דרך A, B ו-D» · «נתון מעגל שקוטרו BD» — a circle COMPUTED from points
   * (#1464, #1324, ADR-AG-160). `name` is the student's own name for it, absent for an anonymous one.
   */
  /** `hidden` (#1622 E4, ADR-AG-220): the circle a SEMICIRCLE is half of — it carries its points, only the half is drawn. */
  | (FactBase & { t: 'circle-thru'; id: Id; def: CircleDef; name?: string; hidden?: true })
  /**
   * A DRAWN ARC of a circle the figure holds (#1622 E4, ADR-AG-220) — a semicircle, a quarter circle, a sector's
   * arc. Decoration over objects that exist: the circle carries the points, this says which part of it is drawn.
   */
  | (FactBase & { t: 'arc'; id: Id; def: ArcDef })
  /**
   * «קשת AB = 40 במעגל O» · «⌢{AC} = 60°» · «קשת DE = 2 קשת CE» · «קשת AC + קשת BE = קשת AD + קשת BC» — an
   * ARC-MEASURE given (#1622 E4, ADR-AG-220; 2-D's `arcValue` / `arcEquality` / `measureSum`, ADR-116). An arc's
   * measure IS its central angle, so this is Σ kᵢ·⌢(aᵢbᵢ) = value. WHICH circle is M1's question (the named one —
   * stated when the figure lacks it, ADR-AG-210 — or the one circle); the arc's ends are ON it.
   */
  | (FactBase & { t: 'arc-of'; circle?: string; terms: Array<{ k: Expr; a: Id; b: Id }>; value: Expr })
  /** «M אמצע הקשת BC במעגל O» (#1622 E4) — the midpoint of the arc BC (the minor one unless «הגדולה»). */
  | (FactBase & { t: 'arc-mid'; id: Id; a: Id; b: Id; circle?: string; major?: true })
  /**
   * «גזרה AOB בזווית 80» · «רבע מעגל» (#1622 E4, ADR-AG-220) — a SECTOR: two radii and the arc between them. With a
   * centre letter (`v`), the circle on that centre (bound when the figure has it, else stated hidden); with none
   * (the bare quarter circle), a circle of its own with its centre unnamed. `value` is the central angle.
   */
  | (FactBase & { t: 'sector'; v?: Id; a: Id; b: Id; value?: Expr })
  /**
   * «BD קוטר במעגל» — a diameter, stated about a circle that may or may not exist yet (#1324).
   *
   * Which circle it means is a question about the construction, so M1 answers it (the 2-D
   * `circleOnDiameter` / `diameter` split, ported as a decision): with NO circle to attach to — or a
   * defining phrase («שקוטרו», «במעגל חדש», "with diameter") — it CREATES the circle on the diameter;
   * with one circle it attaches to, it is a statement ABOUT that circle. `circle` is the id of a circle
   * the sentence named, absent for «במעגל».
   */
  | (FactBase & { t: 'diameter-of'; a: Id; b: Id; define: boolean; circle?: Id })
  /**
   * «המעגל משיק לציר ה-x» — tangency stated about the ONE circle in the figure (#1060).
   *
   * The contextual sibling of `area-of` and `meet-of`, and the third of its shape: which circle
   * it means is a question about the construction, so M1 answers it and refuses when the answer
   * is not exactly one.
   *
   * #1501 widened WHAT is touched and WHO is named: `lines` carries line targets beside the axes
   * («המעגל משיק לישר l1»), and `circle` carries the subject of the line-first order — «הישר l1
   * משיק למעגל M» names its circle, so M1 resolves that name instead of demanding the figure hold
   * exactly one.
   */
  /*
   * `at` (#1619 B3, ADR-AG-195) — the sentence NAMED the touch point («…משיק לציר ה-x בנקודה A», «הישר BC
   * משיק למעגל בנקודה B»). Then the fact carries exactly ONE target, and it lowers to the point on the
   * circle, the point on the target, and the target ⊥ the radius there — for ANY circle, because the
   * radius direction reads the resolved circle. `circleId` is the host by id, for a fact M1 itself built.
   */
  /*
   * `ring` (ADR-AG-198 Am. 1) — the touch list named EVERY side of one ring as a SIDE («הצלעות AO, BO ו-AB …»), so
   * a circle the sentence must create is that ring's incircle (the only circle tangent to every side at a point ON
   * it — an excircle touches extensions): created closed form, never as a free circle the solve must fit.
   */
  | (FactBase & { t: 'tangent-of'; axes: Array<'x' | 'y'>; lines?: TangentLineRef[]; circle?: string; circleId?: Id; at?: Id; ring?: Id[] })
  /**
   * «המשיק למעגל בנקודה A» — THE TANGENT AS AN OBJECT (#1619 B3, ADR-AG-195): the line through A
   * perpendicular to the radius to A, on the circle `circle` names (contextual when absent). M1 resolves
   * the circle and lowers it to A on the circle plus a `line-at` whose direction is that radius turned a
   * quarter — a derived line, 0 DOF, id {@link tangentLineId}.
   */
  | (FactBase & { t: 'tangent-line-at'; at: Id; circle?: string })
  /**
   * «משוואת המשיק היא 4x+3y=40» — the equation of «THE tangent», with no touch point named (#1619 B3).
   * WHICH tangent is M1's question: the one tangent object the figure holds (the equation is then a
   * given about it), none (the stated line is tangent to the circle), several (refused, never a pick).
   */
  | (FactBase & { t: 'tangent-eq'; id: Id; eq: Expr; eqSrc: string; circle?: string })
  /**
   * «רדיוס המעגל (I|O)? הוא 5» — the radius stated as its own given (#1432). WHICH circle is M1's
   * question (`circle` as the sentence named it, or the contextual one); what it does depends on
   * the host: a free `circle-at` radius is PINNED (the sym substituted, its param retired), a
   * determined radius is a restatement checked at the probe environments.
   */
  | (FactBase & { t: 'radius-of'; circle?: string; circleId?: Id; value: Expr })
  /**
   * «היקף המשולש הוא 12» — a perimeter whose polygon is named by its NOUN alone, or not at all
   * («ההיקף הוא 12»), #1432 amendment 1. Which polygon is M1's question — the `area-of` rule: one
   * matching ring lowers to the side-sum `length-eq` «AB+BC+CA=12» would carry, anything else refuses.
   * `noun` absent or «מצולע» matches any ring. With the vertices spelled out the parser lowers straight
   * to the side sum and never mints this fact.
   */
  | (FactBase & { t: 'perimeter-of'; noun?: string; value: Expr })
  /** «F מוקד הפרבולה» (#1432) — names the focus; M1 resolves THE parabola, the centre's pattern. */
  | (FactBase & { t: 'focus-of'; id: Id })
  /** «משוואת המדריך היא x=-2» (#1432) — a claim checked against the parabola's own directrix. */
  | (FactBase & { t: 'directrix-eq'; eq: Expr; eqSrc: string })
  /**
   * Two CIRCLES touch — «מעגל M משיק למעגל K», «המעגלים משיקים» (#1504).
   *
   * `a`/`b` are the circles as the sentence NAMED them (a centre letter, a numeral, the
   * student's own name) — which circle each name means is a question about the construction,
   * so M1 resolves both through the `tangent-of` lookup chain; an absent name is the
   * contextual reading (with one name: "the one other circle"; with none: "the exactly two").
   * `branch` is present only when the student said which touch («מבחוץ»/«מבפנים») — absent,
   * the apply boundary lowers to a `choice` over both (#1049, ADR-052). `at` names the touch
   * point when the sentence did («…בנקודה T») — a `touch-point` derived point (amendment 1).
   */
  | (FactBase & { t: 'tangent-circles'; a?: string; b?: string; branch?: 'external' | 'internal'; at?: Id })
  /**
   * «E נקודת החיתוך של הישרים» — a crossing whose operands are named only by their KIND (#1429).
   *
   * WHICH two objects is a question about the construction, so M1 answers it: exactly two of the
   * kind lower to the two incidences the spelled-out sentence would carry, anything else refuses
   * `ambiguous-shape` — the `on-kind` rule, one arity up.
   *
   * `tangent` (#1620 S7, ADR-AG-213): «המשיקים נפגשים בנקודה D» — the two TANGENT objects; `pieces` also draws
   * each touch point's piece to the crossing, as 2-D draws it.
   */
  | (FactBase & { t: 'crossing-kind'; id: Id; kind: 'line' | 'circle' | 'tangent'; pieces?: true })
  /**
   * «הנקודה A נמצאת על האליפסה» — a point on a curve named only by its KIND (#1057).
   *
   * F2 corpus vocabulary (docs/19 §4a), and the fourth contextual reference: which curve it
   * means is a question about the construction, so M1 answers it, and refuses where the figure
   * holds none or several of that kind.
   */
  | (FactBase & { t: 'on-kind'; id: Id; kind: CurveKind | 'tangent' | 'perpendicular'; circle?: string; foot?: PerpRef })
  /*
   * `kind: 'perpendicular'` (#1620, ADR-AG-207) — «E על האנך», «המשיק והאנך נחתכים בנקודה D»: the one perpendicular
   * the figure DREW (a `foot` derived point and the line from its point to it). `foot` narrows it by its description
   * («האנך שהורידו מנקודה B לציר ה-x»); a reference, never a construction — none or several is refused by name.
   */
  /*
   * With no circle in the figure, `on-kind` circle STATES one (#1669 for a chord's end, ADR-AG-204; #1670 for every
   * incidence, ADR-AG-210 — 2-D's «A על המעגל» creates its circle): centre unnamed, ADR-AG-196's none → create. A
   * NAMED circle the figure lacks is stated on that centre (`statingNamedCircle`). One binds, several are ambiguous.
   */
  /*
   * `kind: 'tangent'` (#1619 B3) — «המשיק» with no point: the one tangent OBJECT in the figure.
   */
  /*
   * `circle` on `on-kind` (#1619 B1): «A על מעגל M» — the circle named by its CENTRE LETTER (or numeral),
   * resolved at M1 through the one name chain (`circleByName`), where the bare kind means the one circle.
   */
  /**
   * «O מרכז המעגל» · «P מרכז המעגל x^2+y^2=16» (#1598, #1619 B1) — NAMES the centre of the contextual
   * circle, or of the circle with this equation. Which circle is M1's question; what the name lowers to
   * depends on how that circle was stated (a derived centre of an equation circle, the circumcentre of a
   * computed one, the centre point a centred circle already has), and with NO circle at all it creates one
   * on this centre — the `diameter-of` precedent (#1324): a sentence about «המעגל» that finds none states it.
   * `create` is that statement's facts, lowered by the parser from the canonical creation sentence («נתון
   * מעגל שמרכזו O», «נתון מעגל O שמשוואתו …»), so the creation has one lowering, not a second copy here.
   */
  /*
   * `circleId` (ADR-AG-198) — the circle by id, for a statement M1 itself bound (the incircle sentence naming the
   * centre of the circle it found already drawn).
   */
  /*
   * `circle` (#1663, ADR-AG-203) — the circle by NAME, through the one name chain (`circleByName`): a numeral, a
   * centre letter, or a described circle («⊙ABC», «○ABC» — «X מרכז המעגל החוסם את המשולש ABC»).
   */
  | (FactBase & { t: 'centre-of'; id: Id; eq?: Expr; create?: Fact[]; circleId?: Id; circle?: string })
  /**
   * A sentence that uses «מרכז המעגל» as a POINT (#1619 B1) — «CD עובר דרך מרכז המעגל». The parser lowers
   * the sentence with `CENTRE_SENTINEL` in the centre's place; M1 resolves which point the centre IS and
   * applies the facts with that name. One mechanism for every sentence that names the centre by its role.
   */
  | (FactBase & { t: 'via-centre'; facts: Fact[]; phrase: string })
  /**
   * «B נמצאת מחוץ למעגל» · «… בתוך המעגל» · «E נמצאת על הקשת הקטנה AC» (#1619 B1) — a REGION of the
   * contextual (or named) circle. M1 resolves the circle and lowers to the `sign` selector over its
   * `power` / `arc-side` quantity; an arc also puts its point and the chord's ends on the circle.
   */
  | (FactBase & { t: 'circle-region'; id: Id; region: 'outside' | 'inside' | 'minor-arc' | 'major-arc'; a?: Id; b?: Id; circle?: string })
  /**
   * «אורך הקטע AB שווה לרדיוס המעגל» (#1619 B1) — the radius equals a MEASURED length. The `radius-of`
   * resolution, with a length on the other side: M1 lowers it to the `length-eq` whose right side is the
   * circle's own radius expression.
   */
  | (FactBase & { t: 'radius-length'; circle?: string; length: LengthExpr })
  /**
   * A sentence whose subject is THE CIRCLE — «המעגל» with no name — or that describes its circle by a centre
   * or an equation (ADR-AG-196, #1633, the #1619 integration). It means the circle already in the figure, so
   * WHICH circle is M1's question, answered once for every such sentence (`theCircle`):
   *
   * - `match` absent (the contextual «המעגל»): exactly ONE circle in the figure → `about`, the statement
   *   about it; NONE → `create`, the sentence states its circle (B1's «M מרכז המעגל» precedent, #1324's
   *   `diameter-of`); SEVERAL → refused as ambiguous, never a pick.
   * - `match` present (the sentence describes its own circle — «חסום במעגל שמרכזו M / שמשוואתו …»): a circle
   *   with that centre or that equation already in the figure → `about`; otherwise `create`, whatever else
   *   the figure holds.
   *
   * `about` carries `CIRCLE_SENTINEL` in the circle's place; M1 writes the resolved circle's id in.
   */
  /*
   * `match: { inscribed }` (#1619 ruling b, ADR-AG-198) — «במשולש AOB חסום מעגל»: the circle the figure already
   * states TANGENT TO EVERY SIDE of that ring (the touch sentence typed first created it) is this circle; with
   * none, the sentence states the computed incircle as before.
   */
  | (FactBase & { t: 'the-circle'; create: Fact[]; about: Fact[]; match?: { centre: Id } | { eq: Expr } | { inscribed: Id[] } })
  /**
   * «משוואת המעגל היא …» about a circle the figure ALREADY HAS (#1633, ADR-AG-196) — a statement about it,
   * never a second circle: an equation circle must be this equation (else `conflicting-restatement`), a circle
   * on a centre has its centre pinned to the equation's centre (the centre letter takes those coordinates) and
   * its radius to the equation's radius, each through the seam that already owns it (a coordinate statement,
   * `radius-of`), so a conflict is refused naming the line.
   */
  | (FactBase & { t: 'circle-eq'; circleId: Id; eq: Expr })
  /**
   * WHAT A ROLE NOUN CLAIMS, where only the figure can say how (#1651, #1620 item 2; ADR-AG-200). «הרדיוס MB»
   * says one end is THE circle's centre — which end, only the figure knows; «השוק BC» / «הבסיס AB» / «היתר AC»
   * say which side of WHICH polygon. The parser's one claim lowering (`claimFacts`) emits this for those four;
   * the chord, diameter and tangent claims lower straight to the facts their own sentences carry. M1 resolves
   * it once (`applyRoleOf`): the right claim on the polygon or circle the figure holds, a conflict refused.
   */
  | (FactBase & { t: 'role-of'; role: PolygonOrRadiusRole; a: Id; b: Id })
  /**
   * «שכל קודקודיו מונחים על הצירים» · «כל קודקודי הטרפז נמצאים על הצירים» — EVERY VERTEX ON SOME AXIS (#1620 item 3,
   * ADR-AG-208). Not a frame: each vertex is on the x-axis OR the y-axis, and the sentence does not say which, so
   * it is a DISCRETE choice over the assignments (02c R14, «discrete ones cycle») — M1 builds it over the one ring
   * the sentence refers to (`ringsNamed`; none or several is refused, as every contextual shape reference is).
   */
  | (FactBase & { t: 'vertices-on-axes'; noun?: string })
  /**
   * A SENTENCE ABOUT ONE OR TWO CIRCLES IT MAY HAVE TO DRAW (#1622 slice E3, #1693; ADR-AG-219) — «שני מעגלים נחתכים
   * בנקודות A ו-B», «נתון מעגל», «מעגל בקוטר 10», «AB משיק משותף למעגלים O ו-P», «ישר חותך את שני המעגלים …». Each
   * {@link CircleSlot} is resolved at M1, in order, to a circle id, and `about` — the statement, written over
   * {@link CIRCLE_SLOT_SENTINELS} — is applied with those ids written in:
   *
   * - `new` draws a circle with its centre UNNAMED (ADR-AG-198's created circle; the radius free unless `r` states it).
   *   Two drawn by one sentence are a PAIR: interchangeable until a statement tells them apart, and then named by
   *   order on first mention (operator ruling 2026-10-02 on #1688).
   * - `named` is the circle a letter names — found through the one name chain, named by order on an interchangeable
   *   pair, else stated on that letter (ADR-AG-210's `statingNamedCircle`).
   * - `the` is «המעגל» / «שני המעגלים»: the figure's circles when it holds exactly that many, drawn when it holds
   *   none, refused as ambiguous otherwise (ADR-AG-196's none → create, one → bind, several → ask).
   */
  | (FactBase & { t: 'circles-about'; slots: CircleSlot[]; about: Fact[] });

/** One circle a `circles-about` sentence speaks of (ADR-AG-219). */
export type CircleSlot = { k: 'new'; r?: Expr } | { k: 'named'; name: string } | { k: 'the' };

/** The stand-ins a `circles-about` statement carries for its circles, by slot (ADR-AG-219) — names no student writes. */
export const CIRCLE_SLOT_SENTINELS = ['⟨circle-1⟩', '⟨circle-2⟩'] as const;

/** The role claims that need the FIGURE to lower (#1651, ADR-AG-200) — the rest lower in the parser. */
export type PolygonOrRadiusRole = 'radius' | 'leg' | 'base' | 'hypotenuse';

/** The stand-in a `via-centre` sentence carries for «מרכז המעגל» — a name no student writes (#1619 B1). */
export const CENTRE_SENTINEL = 'Z₁';

/** The stand-in a `the-circle` statement carries for the circle M1 resolves (ADR-AG-196). */
export const CIRCLE_SENTINEL = '⟨the-circle⟩';

/**
 * A fact and the creation it may apply in its place (ADR-AG-196) — the `create` of a `the-circle`. For the
 * passes that read the fact list before M1 (which line names an object): they must see a creation the
 * sentence may make, whichever branch M1 takes.
 */
export const factsWithin = (f: Fact): Fact[] =>
  f.t === 'the-circle' ? [f, ...f.create.flatMap(factsWithin)] : f.t === 'circles-about' ? [f, ...f.about.flatMap(factsWithin)] : [f];

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
  | { kind: 'circle-at'; id: Id; centre: Id; r: Expr; hidden?: true }
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
  /**
   * …and since #1319 (ADR-AG-144) the direction may be FREE: «דרך N עובר ישר» is the exam's own
   * sentence for a line whose direction the rest of the question determines. Its one degree of
   * freedom is a DIRECTION PARAMETER in the register — `symbolDeps` reports the symbol, so it is
   * sampled like any unstated magnitude (ADR-052) and SOLVED like any parameter once a later given
   * pins it (the #1317 seam). `carrierOf` still answers `null`: the freedom lives in the register.
   *
   * `name` is how the student refers to it («ישר l3»), so a crossing can name it; absent for an
   * anonymous line.
   */
  | { kind: 'line-at'; id: Id; through: Id; dir: Direction; perp: boolean; name?: string; drawn?: false }
  /**
   * A circle COMPUTED FROM POINTS (#1464, #1324, [ADR-AG-160](../../docs/06c-decisions-analytic.md#adr-ag-160))
   * — «מעגל ABD», the circle through three points, and «BD קוטר במעגל», the circle on a diameter.
   *
   * The third constructive curve, after `circle-at` and `line-at`, and like them it carries **no freedom
   * of its own**: the circumcircle of three placed points and the circle whose centre is a segment's
   * midpoint are closed forms, so `evaluate` computes it and nothing is solved. Operator ruling
   * 2026-09-27 (#1464): computed, not lowered to a free circle plus three incidences — that lowering is a
   * SOLVED circle (a free centre and radius the descent must find; ADR-AG-159 measured the cost), and it
   * needs a centre letter the student never wrote (#1167: no letter is invented). The centre is shown by
   * its coordinates; a student who wants a letter writes «O מרכז המעגל».
   *
   * Three collinear points, or a diameter whose ends coincide, have no circle: a VACANCY at that
   * configuration, never a circle drawn through a guess.
   */
  | { kind: 'circle-thru'; id: Id; def: CircleDef; name?: string; hidden?: true }
  /**
   * A DRAWN ARC (#1622 E4, ADR-AG-220) — which part of a circle the figure draws. No freedom and no expression: its
   * circle and its ends are objects counted where they live; it only says what is inked.
   */
  | { kind: 'arc'; id: Id; def: ArcDef };

/**
 * WHICH PART OF A CIRCLE AN ARC IS (#1622 E4, ADR-AG-220), from `from` to `to` on `circle`:
 * - `ccw` — counter-clockwise from `from` to `to` (2-D's semicircle, B → A); with `away`, the half on the far side
 *   of the chord from that point («מחוץ למשולש ABC»), 2-D's `bulgeRef`; with `toward`, the half on its side («בתוך»).
 * - `minor` / `major` — the shorter / longer arc between the two ends (a sector, by its angle).
 * `radii` draws the two bounding radii with it (a sector whose centre has no letter, so no segment can name them).
 */
export type ArcDef = { circle: Id; from: Id; to: Id; pick: 'ccw' | 'minor' | 'major'; away?: Id; toward?: Id; radii?: true };

/**
 * How a computed circle is determined (#1464, #1324).
 *
 * `incircle` (#1619 B2, #1554, ADR-AG-194) — the circle INSCRIBED in a ring of three or four vertices: centre
 * where the internal bisectors at the first two vertices meet (for a triangle, `derived.ts`'s `incentre`, so
 * the circle and «מפגש חוצי הזוויות» cannot disagree), radius its distance to the first side. Closed form, no
 * freedom, no invented centre letter — ADR-AG-160's discipline. A quadrilateral has an incircle only when its
 * Pitot condition holds; that condition is a GIVEN its sentence lowers beside this circle, never assumed here.
 */
export type CircleDef =
  | { t: 'through'; pts: [Id, Id, Id] }
  | { t: 'diameter'; a: Id; b: Id }
  | { t: 'incircle'; pts: Id[] };

/** The points a computed circle is defined from, in the student's order. */
export const circleDefPoints = (d: CircleDef): Id[] => (d.t === 'diameter' ? [d.a, d.b] : [...d.pts]);

/** The id of the circle inscribed in a ring (#1619 B2) — one formula for the parser and every reader. */
export const incircleId = (ringId: Id): Id => `circle-in-${ringId.replace(/^poly-/, '')}`;

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
export type NamingFact = Extract<Fact, { t: 'point' | 'curve' | 'derived' | 'segment' | 'polygon' | 'circle-thru' | 'arc' }>;
export const namesObject = (f: Fact): f is NamingFact =>
  f.t === 'point' ||
  f.t === 'curve' ||
  f.t === 'derived' ||
  f.t === 'segment' ||
  f.t === 'polygon' ||
  f.t === 'circle-thru' ||
  f.t === 'arc';

/**
 * The id of the circle «BD קוטר» CREATES (#1324) — one formula for M1, which mints it, and for `derive`, which
 * must blame a vacancy of it on the line that said it. Sorted, so «DB קוטר» is the same circle.
 */
/** The id of the tangent line AT a point (#1619 B3) — one formula for the parser and M1. */
export const tangentLineId = (at: Id): Id => `tangent-${at}`;

export const diameterCircleId = (a: Id, b: Id): Id => `circle-diam-${[a, b].sort().join('')}`;
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
  /**
   * WHICH NAME SEEDS A FREE VERTEX'S DEFAULT POSITION (#1631, ADR-AG-192) — `letter → seed name`,
   * absent or empty for every figure no letter change touched.
   *
   * A free vertex's default sample is hashed from a NAME (`evaluate.ts` `freeCoord`). That name used to
   * be the letter itself, so changing a letter moved the vertex. A rename or a swap is a TRANSPOSITION
   * of this map (`app/rename.ts` `transposeSeedNames`), so it stays a permutation: no two vertices can
   * share a seed name, and a letter the change freed seeds where the new letter would have. It is
   * session state, saved with the lines; it never changes what a figure IS, only where an unplaced
   * vertex starts.
   */
  seedNames?: Readonly<Record<Id, string>>;
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
   * «E על המשך הצלע BC» — the point lies on the line `ab` BEYOND `b`, on the far side from `a` (#1620,
   * ADR-AG-208). `between`'s complement on the same line, and a selector for the same reason: the
   * collinearity beside it consumes the degree of freedom, «המשך» only says WHICH part of the line, so the
   * point keeps its one DOF (how far past `b` is unstated, ADR-052). Open at `b` — a point AT the end is on
   * the side, not on its extension — judged at the figure's visible resolution, like `distinct`.
   *
   * The DIRECTION is the student's: «המשך BC» runs past C (the 2-D reading, ADR-054), and «… מעבר ל-B»
   * swaps the ends. «המשכי AD ו-BC נפגשים ב-E» is two of these on one point.
   */
  | { kind: 'beyond'; id: Id; a: Id; b: Id }
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
   * being stored behind the student's back, so «נקודת החיתוך הראשונה/השנייה» is the wording. Since #1268
   * the ordinal has its own selector (`crossing-nth`, below), which picks the root; this one serves the
   * sentences that name none, and makes them not their sibling. It names only its own subject: the
   * siblings are found from the construction by their incidence signature, because the parser is pure
   * over one line and cannot know what the figure already holds.
   *
   * A SELECTOR, for `distinct`'s reasons exactly — it consumes no freedom (the crossing is already
   * pinned by its two incidences) and "not the other root" is a region, not an equation a
   * least-squares solve can drive to zero.
   */
  | { kind: 'crossing-distinct'; id: Id }
  /**
   * «נקודת החיתוך הראשונה/השנייה» — THE SENTENCE NAMES ITS ROOT (#1268, ADR-AG-157).
   *
   * #1113's ruling, implemented: the ordinal picks the root on its own, with no second named point
   * needed. `nth` counts the pair's crossings in the canonical order `crossing-order.ts` states (the
   * straight walked in its own direction), and `pair` is the sentence's own two incidences — carried
   * here rather than looked up, because the point may later gain other incidences and the order is a
   * fact about THESE two.
   *
   * A selector for `crossing-distinct`'s reasons: it consumes no freedom (the two incidences already
   * pin the point to a root) and "this root, not that one" is a region, not an equation. It is also why
   * «הציגו תצורה אחרת» cannot swap the named crossing: a configuration on the other root is not valid.
   *
   * `both` (#1512, ADR-AG-185) — the sentence named BOTH crossings («…בנקודות A ו-B»), so it also states
   * that the pair HAS two: a tangency (one point), a pair with no canonical order (two straights meet
   * once; two conics have no order this tool defines), or two roots within the solver's resolution does
   * not hold. Without it a single ordinal keeps ADR-AG-157's reading, where a tangency satisfies both.
   */
  | { kind: 'crossing-nth'; id: Id; nth: 0 | 1; pair: [Constraint, Constraint]; both?: true }
  /**
   * THE SIGN OF A DERIVED QUANTITY — «שיפוע הישר l1 שלילי» (#1323, ADR-AG-144).
   *
   * The exam's part (ג): *«ישר זה חותך את ציר ה-x בנקודה C ושיפועו שלילי»* — the sign picks between the
   * two configurations the rest of the sentence leaves open. It is a stated given and may not vanish,
   * and it is D7's KIND 2: it consumes no freedom (the area given already pins the direction; the sign
   * says WHICH root), so it is a selector inside validity, never a residual and never a post-filter.
   * #818 (3-D) is the failure mode designed against — a stated sign violated at some seeds because a
   * filter fell back to a configuration contradicting it — and validity is what `drawableAt` walks.
   *
   * The QUANTITY is a discriminated union so the class — an inequality about a DERIVED quantity — has
   * one home. A slope is its first member; a length, an area or a coordinate would be further members
   * with their own reader, never a fourth value keyword in the slope rule (the #1201 shape).
   */
  | {
      kind: 'sign';
      q: Quantity;
      positive: boolean;
      /**
       * «AB ≤ 10» · «∢ABC ≥ 40°» — the BOUNDARY is admitted (#1621 D3, ADR-AG-216): the quantity may be zero.
       * Absent ⇒ strict, which is what every word form («גדול מ», «קהה») and every earlier sign meant.
       */
      closed?: true;
    }
  /**
   * «x_B > x_D» · «שיעור ה-x של B גדול משיעור ה-x של D» · «y_A < 0» — A COORDINATE COMPARED (#1462, ADR-AG-161).
   *
   * The exam's standard way of choosing a root: the kite's B and D are the two roots of one pair of
   * equations, and «שיעור ה-x של B גדול משיעור ה-x של D» says which is which. D7's kind 2 — it consumes no
   * freedom (the rest of the givens pin both points; this picks the ORDER), so it is a selector inside
   * validity, and `drawableAt` walks to a configuration where it holds.
   *
   * `axis-side` («B על החלק החיובי של ציר x», «ברביע») is this comparison against 0, and is judged and
   * seeded through the same function (`compareOf`, `evaluate.ts`) — one mechanism with two spellings in
   * the data, never a third sign rule. `rhs` is another point or a value; a value may carry a parameter.
   */
  | { kind: 'coord-compare'; id: Id; axis: 'x' | 'y'; greater: boolean; rhs: { point: Id } | { value: Expr } }
  /**
   * «משולש חד זוויות ABC» — EVERY ANGLE OF THE TRIANGLE IS ACUTE (#1619 B2, ADR-AG-194).
   *
   * The exam's adjective is a stated given (it may not vanish) and an INEQUALITY, so it is D7's kind 2: it
   * consumes no freedom and is no equation a least-squares solve can drive to zero — it is a region, the
   * triangles whose three angles are under 90°. Judged inside validity like every selector, so `drawableAt`
   * walks to an acute configuration, and a determined figure whose triangle is not acute is refused on the
   * sentence (the #1069 predicate). `ids` is the ring, three vertices.
   */
  | { kind: 'acute'; ids: Id[] }
  /**
   * «DB חוצה את הזווית ADC» about an EXISTING B — B IS ON THE BISECTOR'S OWN RAY, not its opposite (#1284, ADR-AG-209).
   *
   * The equal-angle row (`angle-ratio`, unsigned) holds on the whole bisector LINE: on the opposite ray both angles
   * are 180° − α/2. Which ray is a REGION, not an equation — D7's kind 2, like `between` — so it is a selector:
   * `id` lies in the open half-plane at `v` that holds the angle (a, v, b)'s interior, i.e. on the internal
   * bisector's side of the perpendicular to it at `v`. Consumes no freedom; judged inside validity; seeded.
   */
  | { kind: 'angle-side'; id: Id; v: Id; a: Id; b: Id }
  /**
   * «CD חותך את AB» · «AC ו-BD נחתכים» — TWO SEGMENTS CROSS, with no crossing point named (#1622, ADR-AG-218; 2-D's
   * `segments-cross`). A region, not an equation — the configurations whose segments AB and CD meet at a point inside
   * both — so D7's kind 2, judged inside validity and walked to by `drawableAt`; it consumes no freedom.
   */
  | { kind: 'segments-cross'; a: Id; b: Id; c: Id; d: Id }
  /**
   * «C ו-D בצדדים שונים של AB» · «… באותו צד של AB» — WHICH SIDE OF THE LINE `ab` (#1622, ADR-AG-217; 2-D's
   * `points-line-side`, ADR-389). `same`: every subject on one side; else the two on opposite sides. A region — D7's
   * kind 2, consuming no freedom; a subject ON the line is on neither side. Judged inside validity, and seeded.
   */
  | { kind: 'line-side'; ids: Id[]; a: Id; b: Id; same: boolean }
  /**
   * «E בתוך המשולש KAO» · «E מחוץ למרובע ABCD» — INSIDE OR OUTSIDE A RING (#1622, ADR-AG-217; 2-D's
   * `point-polygon-side`). `closed`: the boundary counts as inside — an inscribed shape's vertex riding a side
   * (on the side's line AND in the closed triangle is on the side). Open otherwise: a point on the boundary is
   * neither inside nor outside. A region, D7's kind 2. Judged inside validity, and seeded.
   */
  | { kind: 'in-polygon'; id: Id; ring: Id[]; inside: boolean; closed?: true }
  /**
   * ONE OF SEVERAL REGIONS, THE SENTENCE NOT SAYING WHICH — «משולש קהה זווית ABC»: the angle at A, at B or at C is
   * obtuse (#1708, operator ruling 2026-10-03: *"It means one of them must be"*; ADR-AG-222). The region twin of the
   * constraint `choice` (#1049, «משולש ישר זווית»): resolved per configuration at the CHOICE seed (`resolveSelectorChoices`,
   * `evaluate.ts`), so «הציגו תצורה אחרת» cycles the options and an option the other givens leave no figure for is
   * passed over (#1642). Never a fixed default (ADR-052). Each option is an ordinary selector, judged as itself.
   */
  | { kind: 'choice'; options: Selector[] };

/**
 * A quantity the figure DERIVES — never a symbol the student declared (that is a domain, kind 1).
 *
 * `power` and `arc-side` (#1619 B1, ADR-AG-193) are the circle's two REGIONS, each the sign of a derived
 * quantity and so members here rather than a fourth selector kind (the #1201 shape the slope member warned
 * against): «B נמצאת מחוץ למעגל» is the POWER of B with respect to the circle, |PC|² − r², positive; «E על
 * הקשת הקטנה AC» is E on the side of the chord AC away from the centre — `arc-side` is the product of the two
 * sides, positive on the MAJOR arc's side. Both consume no freedom (a region, `between`'s kind), and
 * `circle` is the id M1 resolved, never a name.
 */
export type Quantity =
  | { k: 'slope'; u: Direction }
  | { k: 'power'; p: Id; circle: Id }
  | { k: 'arc-side'; p: Id; a: Id; b: Id; circle: Id }
  /**
   * TWO CIRCLES' MUTUAL POSITION (#1622 E3, ADR-AG-219) — `apart`: the gap between them, |AB| − (rₐ + r_b), positive
   * when they are disjoint, each outside the other («שני מעגלים זרים»); `inside`: rₐ − r_b − |AB|, positive when `b`
   * lies strictly inside `a` («מעגל P מוכל בתוך מעגל O»); `larger`: rₐ − r_b («R > r» between two circles, the
   * concentric pair kept apart); `cross`: |AB| − |rₐ − r_b|, positive when neither lies inside the other and they are not
   * one circle («שני מעגלים נחתכים» — two crossings of two DIFFERENT circles). Regions, so selectors: they consume no freedom.
   */
  | { k: 'circles'; a: Id; b: Id; rel: 'apart' | 'inside' | 'larger' | 'cross' }
  /**
   * WHICH SIDE OF A COMMON TANGENT THE CENTRES ARE ON (#1622 E3, ADR-AG-219) — the product of the two centres' signed
   * sides of the line `p``q`: positive for an EXTERNAL common tangent (both on one side), negative for an internal one.
   */
  | { k: 'centres-side'; a: Id; b: Id; p: Id; q: Id }
  /**
   * A STATED ORDER BETWEEN PARAMETERS (#1622 E3, ADR-AG-219) — «R > r» between two radius letters: the value of `e`
   * (R − r) at the configuration's parameters. A region of the parameter space (D7 kind 2), never a domain: a domain
   * bounds ONE symbol by a number.
   */
  | { k: 'params'; e: Expr }
  /**
   * «AB < BC» · «DC > AB» · «AB ≤ 10» · «∢ABC < ∢BAC» · «זווית ABC קהה» — AN ORDER BETWEEN TWO MEASURES, or a
   * measure and a value (#1621 D3, ADR-AG-216): the quantity is `left − right`. 2-D reads it as a region the
   * figure must lie in (ADR-039 / ADR-390: it "removes no DOF"), which is D7's kind 2 here — a selector over the
   * derived difference, the member this union's docblock reserved for "a length, an area" rather than a fourth
   * selector kind. Both sides are the same KIND (the parser pairs a length with a length or a number, an angle
   * with an angle or a number of degrees).
   */
  | { k: 'order'; left: OrderSide; right: OrderSide };

/**
 * One side of a stated ORDER (#1621 D3, ADR-AG-216): a length expression (`lengths.ts`: segments and areas — the
 * measures `length-eq` already equates), a three-letter angle in DEGREES, or a plain value.
 */
export type OrderSide = { t: 'length'; le: LengthExpr } | { t: 'angle'; at: AngleRef } | { t: 'value'; value: Expr };

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

/**
 * THE CURVE A NAME DENOTES, in the construction — one lookup for every layer that asks (#1319,
 * ADR-AG-144; the ADR-AG-092 "naming paths and the shared check" rule).
 *
 * Three sites used to spell this inline over `kind === 'curve'` alone, and a line CONSTRUCTED through
 * a point («דרך N עובר ישר l3», a `line-at`) is a curve with a name too — `label.name` on the figure,
 * `name` on the object. Spelled once here so a `line-at` can be crossed, measured against and asked
 * about exactly as a stated line can.
 *
 * A name matches the student's own token (`l3`, `AB`, «ישר 1») or the id the naming rules mint from it
 * (`line-l3`, `circle-I`).
 */
export function curveByName(c: Construction, name: string): GeoObject | undefined {
  return c.objects.find(
    (o) =>
      // A NAMED circle, parabola or ellipse answers to its numeral in either spelling («1» is «I»),
      // through the one id function the naming clause mints with (#1271, #1514 pre-play).
      (o.kind === 'curve' &&
        (o.label.name === name ||
          o.id === lineIdOf(name) ||
          o.id === numeralCurveId('circle', name) ||
          o.id === numeralCurveId('parabola', name) ||
          o.id === numeralCurveId('ellipse', name))) ||
      (o.kind === 'line-at' && (o.name === name || o.id === lineIdOf(name))) ||
      // A computed circle by the name the student gave it (#1464), and a circle stated by its centre by
      // that centre's letter — «A על המעגל O» after «נתון מעגל O» (#1464 step 3).
      (o.kind === 'circle-thru' && (o.name === name || o.id === numeralCurveId('circle', name))) ||
      (o.kind === 'circle-at' && o.id === `circle-at-${name}`),
  );
}

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
