/**
 * Derived points — the objects whose position is a pure FUNCTION of points the student already
 * stated ([ADR-AG-009](../../docs/06c-decisions-analytic.md#adr-ag-009) B4, issue #1028).
 *
 * Every rule here is 0-DOF and solver-free: given its parents' coordinates there is exactly one
 * answer, computed in closed form. That is what makes this slice buildable before the joint solve
 * (#1016) even though midpoints and concurrency points are the most common constructs in the
 * «lines and points» corpus — ~11 and ~6 of forty exercises respectively.
 *
 * **Why these, and why in this shape.** The synthetic tool has owned this vocabulary for a long
 * time and has the scar tissue to prove it. Under [ADR-AG-012](../../docs/06c-decisions-analytic.md#adr-ag-012)
 * the capability is **copied, never imported**, and the corpus is the gate: a rule is here because an
 * exercise needs it, not because the sibling's catalog lists it.
 *
 * **A degenerate parent is `null`, never a guess.** Three collinear points have no circumcentre and
 * no incentre worth the name; two coincident points still have a midpoint. Returning `null` lets the
 * caller record an honest vacancy instead of drawing a point at `NaN` or, worse, at some default —
 * which would be [ADR-052](../../docs/06-decisions.md#adr-052)'s sin in derived clothing.
 */
import type { Id } from './types';

export interface Pt {
  x: number;
  y: number;
}

/**
 * How a derived point is defined. A discriminated union so `parentsOf` and the evaluator are
 * exhaustive over it — a rule added without a parent list would contribute an object whose
 * dependencies are invisible, which is the #1014 class one level up.
 */
export type DerivedRule =
  /** `M אמצע AB` — the corpus's single most common construct. */
  | { t: 'midpoint'; a: Id; b: Id }
  /** `M מפגש התיכונים במשולש ABC` — the medians' concurrency. */
  | { t: 'centroid'; v: [Id, Id, Id] }
  /** `O מפגש חוצי הזוויות במשולש ABC` — the incircle's centre. */
  | { t: 'incentre'; v: [Id, Id, Id] }
  /** `H מפגש הגבהים במשולש ABC` — the altitudes' concurrency. */
  | { t: 'orthocentre'; v: [Id, Id, Id] }
  /** `P מפגש האנכים האמצעיים במשולש ABC` — the circumcircle's centre. */
  | { t: 'circumcentre'; v: [Id, Id, Id] }
  /** `G מפגש האלכסונים במרובע ABCD` — AC ∩ BD. */
  | { t: 'diagonals'; v: [Id, Id, Id, Id] };

/** The ids a rule is defined in terms of. EXHAUSTIVE — see the union's docblock. */
export function parentsOf(r: DerivedRule): Id[] {
  switch (r.t) {
    case 'midpoint':
      return [r.a, r.b];
    case 'centroid':
    case 'incentre':
    case 'orthocentre':
    case 'circumcentre':
      return [...r.v];
    case 'diagonals':
      return [...r.v];
    default: {
      const unparented: never = r;
      throw new Error(`derived rule declares no parents: ${JSON.stringify(unparented)}`);
    }
  }
}

/** Human-readable, for a refusal or a panel row that needs to name the construct. */
export function ruleLabel(r: DerivedRule): string {
  switch (r.t) {
    case 'midpoint':
      return `אמצע ${r.a}${r.b}`;
    case 'centroid':
      return `מפגש התיכונים ${r.v.join('')}`;
    case 'incentre':
      return `מפגש חוצי הזוויות ${r.v.join('')}`;
    case 'orthocentre':
      return `מפגש הגבהים ${r.v.join('')}`;
    case 'circumcentre':
      return `מפגש האנכים האמצעיים ${r.v.join('')}`;
    case 'diagonals':
      return `מפגש האלכסונים ${r.v.join('')}`;
    default: {
      const unlabelled: never = r;
      throw new Error(`derived rule has no label: ${JSON.stringify(unlabelled)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// The closed forms
// ---------------------------------------------------------------------------

const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);

/** Twice the signed area of ABC. Zero exactly when the three are collinear — the degeneracy test
 *  every triangle centre below shares, so it is written once. */
const cross2 = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** Scale-relative collinearity: an absolute epsilon would call a large triangle degenerate and a
 *  tiny one fine. Compared against the longest side, so the test is about SHAPE, not size. */
function isDegenerate(a: Pt, b: Pt, c: Pt): boolean {
  const scale = Math.max(dist(a, b), dist(b, c), dist(c, a));
  if (scale < 1e-12) return true;
  return Math.abs(cross2(a, b, c)) <= 1e-9 * scale * scale;
}

export const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const centroid = (a: Pt, b: Pt, c: Pt): Pt => ({
  x: (a.x + b.x + c.x) / 3,
  y: (a.y + b.y + c.y) / 3,
});

/**
 * The incentre, as the side-length-weighted average of the vertices: `(a·A + b·B + c·C)/(a+b+c)`,
 * where each weight is the side OPPOSITE its vertex. Closed form — no bisector intersection, and so
 * no near-parallel blow-up.
 */
export function incentre(a: Pt, b: Pt, c: Pt): Pt | null {
  if (isDegenerate(a, b, c)) return null;
  const la = dist(b, c);
  const lb = dist(c, a);
  const lc = dist(a, b);
  const s = la + lb + lc;
  return { x: (la * a.x + lb * b.x + lc * c.x) / s, y: (la * a.y + lb * b.y + lc * c.y) / s };
}

/** The circumcentre — equidistant from all three, i.e. the perpendicular bisectors' meet. */
export function circumcentre(a: Pt, b: Pt, c: Pt): Pt | null {
  if (isDegenerate(a, b, c)) return null;
  const d = 2 * cross2(a, b, c);
  const aa = a.x * a.x + a.y * a.y;
  const bb = b.x * b.x + b.y * b.y;
  const cc = c.x * c.x + c.y * c.y;
  return {
    x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d,
    y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d,
  };
}

/**
 * The orthocentre, via Euler's line: `H = A + B + C − 2·O` with `O` the circumcentre.
 *
 * Deliberately NOT computed by intersecting two altitudes — that form divides by a slope difference
 * and loses precision exactly when a side is near-vertical, which in a coordinate-plane exercise is
 * the common case rather than the exotic one (the corpus is full of sides parallel to the axes).
 */
export function orthocentre(a: Pt, b: Pt, c: Pt): Pt | null {
  const o = circumcentre(a, b, c);
  if (!o) return null;
  return { x: a.x + b.x + c.x - 2 * o.x, y: a.y + b.y + c.y - 2 * o.y };
}

/**
 * A quadrilateral's diagonal meet — AC ∩ BD, **as segments**.
 *
 * `null` when the diagonals are parallel, and `null` when the supporting lines cross somewhere that
 * is not on both diagonals. The second half is the point (#1043): «מפגש האלכסונים» names the meet of
 * two *segments*, and answering it with the line–line formula invents a point for every concave
 * quadrilateral. Measured on `A(0,0) B(4,0) C(1,1) D(0,4)`: the old form returned `(2,2)`, which sits
 * at `t = 2` along a diagonal `AC` that ends at `(1,1)` — twice past its own endpoint, committed with
 * no fault, drawn, and printed in the panel as a coordinate the student can read off the figure.
 *
 * Both parameters come from the SAME determinant, so the two are consistent by construction rather
 * than by two separate solves that could disagree near-degenerately.
 *
 * The interval is CLOSED. `t = 0` or `t = 1` means the crossing lands exactly on a vertex — a
 * degenerate quadrilateral, but one whose diagonals genuinely do touch there, so it is a meet rather
 * than an absence. Stated explicitly and tested, rather than left to whichever way the tolerance
 * happened to fall.
 *
 * `null` here is VACANCY, not a fault: `evalRule` propagates it and the point is reported absent at
 * this configuration ([ADR-AG-008](../../docs/06c-decisions-analytic.md#adr-ag-008)) — never `NaN`,
 * never invented.
 */
export function diagonalMeet(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = { x: c.x - a.x, y: c.y - a.y };
  const s = { x: d.x - b.x, y: d.y - b.y };
  const den = r.x * s.y - r.y * s.x;
  const scale = Math.max(Math.hypot(r.x, r.y), Math.hypot(s.x, s.y));
  if (scale < 1e-12 || Math.abs(den) <= 1e-12 * scale * scale) return null;
  const qx = b.x - a.x;
  const qy = b.y - a.y;
  const t = (qx * s.y - qy * s.x) / den; // along AC
  const u = (qx * r.y - qy * r.x) / den; // along BD, from the same determinant
  /**
   * A RELATIVE tolerance, scaled the way the parallel test above already is. A bare absolute
   * epsilon would mean something different on a figure spanning 3 units than on one spanning 3000,
   * and the corpus contains both.
   */
  const eps = 1e-9;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

/**
 * Evaluate a rule against its parents' resolved positions.
 *
 * `null` when a parent is missing (it was vacant at this parameter value) or the configuration is
 * degenerate. EXHAUSTIVE over the rule union.
 */
export function evalRule(r: DerivedRule, at: (id: Id) => Pt | null): Pt | null {
  const ps = parentsOf(r).map(at);
  if (ps.some((p) => p === null)) return null;
  const p = ps as Pt[];
  switch (r.t) {
    case 'midpoint':
      return midpoint(p[0], p[1]);
    case 'centroid':
      return centroid(p[0], p[1], p[2]);
    case 'incentre':
      return incentre(p[0], p[1], p[2]);
    case 'orthocentre':
      return orthocentre(p[0], p[1], p[2]);
    case 'circumcentre':
      return circumcentre(p[0], p[1], p[2]);
    case 'diagonals':
      return diagonalMeet(p[0], p[1], p[2], p[3]);
    default: {
      const unevaluated: never = r;
      throw new Error(`derived rule has no evaluation: ${JSON.stringify(unevaluated)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// The CONSTRUCTION — what a student would have to draw (#1030)
// ---------------------------------------------------------------------------

/**
 * Why this exists, in the operator's words (2026-09-15): *"the tool can find easily the location of
 * that point **but what does the student learn from this**… something that will give a student an
 * understanding of what kind of builds he needs to do to get this solution."*
 *
 * A derived point drawn as a bare dot shows the ANSWER and hides the METHOD, and for this topic the
 * method is the lesson: to find the centroid you draw the medians, they meet at one point, and that
 * point divides each median 2:1 from the vertex. A teacher at a board draws the medians.
 *
 * This is [02c R21](../../docs/02c-requirements-analytic.md)'s own justification — *"for a student
 * the answer is meaningless without the way"* — supplied on the figure rather than assumed to come
 * from elsewhere. It is not the tool solving anything: the construction is what the student must
 * build, and the algebra is still theirs.
 *
 * **These are DECORATION, never objects.** They carry no id, take no letter, and never enter the
 * fact list — a construction line minted as a `GeoObject` would occupy a name the student is about
 * to use, which is the defect [ADR-297](../../docs/06-decisions.md#adr-297) fixed in the 2-D tree.
 */
export interface ConstructionLine {
  a: Pt;
  b: Pt;
/**
   * Labels written ALONG the line, each at a fraction `at` of the way from `a` to `b`.
   *
   * A median carries two — `2x` on the vertex→centroid part and `x` on the rest (operator ruling,
   * 2026-09-15). Labelling the PARTS rather than stamping `2:1` on the whole is the board
   * convention, and it is the difference between telling a student the ratio and **handing them the
   * variables to write the equation with**: `2x + x = ` the median, and the three medians take
   * different letters so a student can carry all three into one calculation.
   *
   * Empty where there is no crisp statement to make — an altitude's defining property is a right
   * angle at its foot, which wants a mark rather than text.
   */
  marks?: Array<{ text: string; at: number }>;
}

export interface Construction {
  lines: ConstructionLine[];
  /** The construction's own auxiliary points — a median's foot on the opposite side. Drawn as small
   *  dots (operator ruling). They become CLICKABLE when #1025 lands; this feature only shows them. */
  feet: Pt[];
}

/**
 * One letter per median (operator ruling, 2026-09-15: "2x, x and 2y, y and 2z, z").
 *
 * NOTE, and worth watching on play: `x` and `y` also name the AXES in this product, which they do
 * not on a synthetic geometry board. The operator chose these letters deliberately; if a student
 * reads `2x` as an x-coordinate, this is the line to change.
 */
const MEDIAN_SYMBOLS = ['x', 'y', 'z'] as const;

const lerp = (p: Pt, q: Pt, t: number): Pt => ({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });

/** The foot of the perpendicular from `p` to the line through `u` and `v`. */
function footOfPerpendicular(p: Pt, u: Pt, v: Pt): Pt | null {
  const dx = v.x - u.x;
  const dy = v.y - u.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-24) return null;
  const t = ((p.x - u.x) * dx + (p.y - u.y) * dy) / len2;
  return { x: u.x + t * dx, y: u.y + t * dy };
}

/**
 * Where the bisector of the angle at `a` meets the opposite side `bc`.
 *
 * The angle bisector divides the opposite side in the ratio of the ADJACENT sides — `BD:DC = AB:AC`
 * — so the foot is a weighted average and needs no trigonometry and no intersection solve.
 */
function bisectorFoot(a: Pt, b: Pt, c: Pt): Pt | null {
  const ab = dist(a, b);
  const ac = dist(a, c);
  const s = ab + ac;
  if (s < 1e-12) return null;
  return { x: (ac * b.x + ab * c.x) / s, y: (ac * b.y + ab * c.y) / s };
}

/**
 * The construction that defines a derived point, ready to draw.
 *
 * `null` when a parent is missing or the configuration is degenerate — the same honest vacancy the
 * point itself reports, so a figure never shows scaffolding for a point that is not there.
 */
export function constructionOf(
  r: DerivedRule,
  at: (id: Id) => Pt | null,
  self: Pt,
): Construction | null {
  const ps = parentsOf(r).map(at);
  if (ps.some((p) => p === null)) return null;
  const p = ps as Pt[];

  switch (r.t) {
    // The segment the midpoint is the midpoint OF. Worth drawing even when the student never stated
    // the segment, because otherwise the construction toggle shows nothing at all for this figure.
    case 'midpoint':
      return { lines: [{ a: p[0], b: p[1] }], feet: [] };

    case 'centroid': {
      // Each median runs from a vertex to the midpoint of the opposite side, and the centroid sits
      // two-thirds along it. The label goes at the MIDDLE of the vertex→centroid part (one third of
      // the way along the whole median), so `2:1` sits against the part it calls `2`.
      const lines: ConstructionLine[] = [];
      const feet: Pt[] = [];
      for (let i = 0; i < 3; i += 1) {
        const v = p[i];
        const foot = midpoint(p[(i + 1) % 3], p[(i + 2) % 3]);
        feet.push(foot);
        // The centroid sits TWO THIRDS along, so the long part runs [0, 2/3] and the short part
        // [2/3, 1]; each label is centred on its own part. A different letter per median, so the
        // three can appear in one calculation without colliding.
        const sym = MEDIAN_SYMBOLS[i];
        lines.push({
          a: v,
          b: foot,
          marks: [
            { text: `2${sym}`, at: 1 / 3 },
            { text: sym, at: 5 / 6 },
          ],
        });
      }
      return { lines, feet };
    }

    case 'orthocentre': {
      const lines: ConstructionLine[] = [];
      const feet: Pt[] = [];
      for (let i = 0; i < 3; i += 1) {
        const foot = footOfPerpendicular(p[i], p[(i + 1) % 3], p[(i + 2) % 3]);
        if (!foot) return null;
        feet.push(foot);
        lines.push({ a: p[i], b: foot });
      }
      return { lines, feet };
    }

    case 'incentre': {
      const lines: ConstructionLine[] = [];
      const feet: Pt[] = [];
      for (let i = 0; i < 3; i += 1) {
        const foot = bisectorFoot(p[i], p[(i + 1) % 3], p[(i + 2) % 3]);
        if (!foot) return null;
        feet.push(foot);
        lines.push({ a: p[i], b: foot });
      }
      return { lines, feet };
    }

    case 'circumcentre': {
      // Each perpendicular bisector is drawn from the side's midpoint to the centre — the part that
      // carries the meaning. Drawing the full infinite bisector would need clipping and would say
      // less.
      const lines: ConstructionLine[] = [];
      const feet: Pt[] = [];
      for (let i = 0; i < 3; i += 1) {
        const mid = midpoint(p[i], p[(i + 1) % 3]);
        feet.push(mid);
        lines.push({ a: mid, b: self });
      }
      return { lines, feet };
    }

    // The two diagonals whose crossing this is.
    case 'diagonals':
      return { lines: [{ a: p[0], b: p[2] }, { a: p[1], b: p[3] }], feet: [] };

    default: {
      const undrawn: never = r;
      throw new Error(`derived rule has no construction: ${JSON.stringify(undrawn)}`);
    }
  }
}

/** Exported for the renderer: where a mark sits on its line. */
export const markPoint = (l: ConstructionLine, at: number): Pt => lerp(l.a, l.b, at);
