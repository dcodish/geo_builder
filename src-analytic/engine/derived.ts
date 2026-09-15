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
 * A quadrilateral's diagonal meet — AC ∩ BD.
 *
 * `null` when the diagonals are parallel (they do not meet) — which for a genuine quadrilateral
 * means the vertices were not given in order, and that is worth refusing rather than drawing the
 * far-away almost-intersection.
 */
export function diagonalMeet(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = { x: c.x - a.x, y: c.y - a.y };
  const s = { x: d.x - b.x, y: d.y - b.y };
  const den = r.x * s.y - r.y * s.x;
  const scale = Math.max(Math.hypot(r.x, r.y), Math.hypot(s.x, s.y));
  if (scale < 1e-12 || Math.abs(den) <= 1e-12 * scale * scale) return null;
  const t = ((b.x - a.x) * s.y - (b.y - a.y) * s.x) / den;
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
