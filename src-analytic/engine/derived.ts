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
  | { t: 'diagonals'; v: [Id, Id, Id, Id] }
  /**
   * «מעגל M חסום במרובע ABCD» — the centre of a QUADRILATERAL's incircle (#1554, ADR-AG-242): where the internal
   * bisectors meet, through `incircleCentre`, the one closed form the computed incircle itself is drawn with — so the
   * named centre and the circle cannot disagree. It exists because the sentence states the Pitot condition that makes
   * the incircle exist; a triangle's centre is `incentre`, unchanged.
   */
  | { t: 'incircle-centre'; v: [Id, Id, Id, Id] }
  /**
   * `מעגל O שמשוואתו …` — the point the student named as the circle`s CENTRE (#1059).
   *
   * Operator ruling, 2026-09-15: *"«מעגל O» means the center letter is O"*. So this is the one
   * derived point whose parent is a CURVE rather than a set of points, which is why `parentsOf`
   * reports none for it and {@link curveParentOf} reports the curve instead — two questions kept
   * apart rather than one list that means two things.
   *
   * It exists only because the STUDENT named it. #1024 draws every circle`s centre without minting
   * an object, precisely so an unnamed centre spends no letter; here the letter is the student`s
   * own and belongs in the id space like any other point they introduced.
   */
  | { t: 'circle-centre'; curve: Id }
  /** «F מוקד הפרבולה» (#1432) — the focus read off the resolved parabola, the circle-centre
   *  pattern one conic over: a closed form over a CURVE parent, existing only because the student
   *  named it (the unnamed focus is #1218's chip, no letter spent). */
  | { t: 'parabola-focus'; curve: Id }
  /**
   * «מעגל M משיק למעגל K בנקודה T» — the point where two TANGENT circles touch (#1504, ADR-AG-167
   * amendment 1). Its parents are the two CIRCLES (like `circle-centre`, curves, not points).
   *
   * Determined, not solved: tangent circles share exactly one point, on the line of centres at
   * distance r from either centre. Which SIDE of K it sits on is read off the figure — the candidate
   * `K ± r_K·û` whose distance to M is r_M — so the rule follows whichever touch (external or
   * internal) the configuration chose, including an unstated one cycled by «הציגו תצורה אחרת».
   */
  | { t: 'touch-point'; a: Id; b: Id }
  /**
   * «הצלעות AO, BO ו-AB משיקות למעגל בנקודות D, E ו-F בהתאמה» — where a SIDE touches a circle (#1619 B2,
   * ADR-AG-194): the foot of the circle's centre on the line `ab`. Its parents are the two points AND the
   * circle (a curve parent, like `touch-point`). Determined, not solved: a line tangent to a circle meets
   * it exactly at that foot. The tangency itself is the host's business (by construction for an incircle,
   * a stated `tangent-line` for a circle on a centre) — this rule only names where it happens.
   */
  | { t: 'side-touch'; circle: Id; a: Id; b: Id }
  /**
   * «D רגל האנך מ-C לציר ה-x» · «האנך מהנקודה B לצלע AC» — THE FOOT OF THE PERPENDICULAR from `from` onto a
   * LINE (#1620 slice C, ADR-AG-207): an axis, the line through two points, or a line OBJECT (named, stated by
   * its equation, constructed through a point, a tangent). 2-D's `foot` object, copied. Determined, not
   * solved: the projection of one point on one line. The line through `from` and the foot is «האנך», which a
   * later sentence may refer to («E על האנך», «המשיק והאנך נחתכים …») — M1 resolves it by this rule.
   */
  | { t: 'foot'; from: Id; onto: FootLine }
  /**
   * «מחומש משוכלל ABCDE» — the `k`-th vertex of the REGULAR `n`-gon whose first side is `a`→`b` (#1622, ADR-AG-217).
   * 2-D's ADR-111 places a regular polygon's vertices on a hidden circle at pinned angles (rigid up to similarity);
   * this is the same figure as a closed form over its first side: walk the ring turning 360°/n left at each vertex.
   * Determined, not solved — measured, the constraint form (equal sides and (n−2)·180°/n angles) left a hexagon
   * unsatisfiable from a sampled start. The ring runs counter-clockwise, as 2-D's increasing angles do.
   */
  | { t: 'regular-vertex'; a: Id; b: Id; n: number; k: number };

/** The line a foot is dropped onto — the three `Direction` members that are a LINE, not only a direction. */
export type FootLine = { k: 'axis'; axis: 'x' | 'y' } | { k: 'points'; a: Id; b: Id } | { k: 'curve'; id: Id };

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
    case 'incircle-centre':
      return [...r.v];
    // The side's two ends; the circle is its CURVE parent (`curveParentsOf`).
    case 'side-touch':
      return [r.a, r.b];
    // The point the perpendicular is dropped FROM, and a two-point line's two points; a line object is a CURVE parent.
    case 'foot':
      return r.onto.k === 'points' ? [r.from, r.onto.a, r.onto.b] : [r.from];
    case 'regular-vertex':
      return [r.a, r.b];
    // Its parent is a CURVE, not a point — see `curveParentOf`. Returning the curve id here would
    // send it through every check that assumes a parent is positional.
    case 'circle-centre':
    case 'parabola-focus':
    case 'touch-point':
      return [];
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
    case 'incircle-centre':
      return `מרכז המעגל החסום ב-${r.v.join('')}`;
    case 'circle-centre':
      return 'מרכז המעגל';
    case 'parabola-focus':
      return 'מוקד הפרבולה';
    case 'touch-point':
      return 'נקודת ההשקה';
    case 'side-touch':
      return `נקודת ההשקה על ${r.a}${r.b}`;
    case 'foot':
      return `רגל האנך מ-${r.from}`;
    case 'regular-vertex':
      return `קודקוד ${r.k + 1} של המצולע המשוכלל על ${r.a}${r.b}`;
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

/** Vertex `k` of the regular `n`-gon on the side `a`→`b`, counter-clockwise — `null` when the side has no length. */
export function regularVertex(a: Pt, b: Pt, n: number, k: number): Pt | null {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  if (!(Math.hypot(ex, ey) > 1e-12) || !(n >= 3) || k < 0 || k >= n) return null;
  const turn = (2 * Math.PI) / n;
  let x = a.x;
  let y = a.y;
  for (let i = 0; i < k; i += 1) {
    const c = Math.cos(i * turn);
    const s = Math.sin(i * turn);
    x += ex * c - ey * s;
    y += ex * s + ey * c;
  }
  return { x, y };
}

/** The foot of `p` on the line through `a` and `b` — `null` when the two coincide (no line). */
export function footOn(p: Pt, a: Pt, b: Pt): Pt | null {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const nn = ux * ux + uy * uy;
  if (!(nn > 1e-24)) return null;
  const t = ((p.x - a.x) * ux + (p.y - a.y) * uy) / nn;
  return { x: a.x + t * ux, y: a.y + t * uy };
}

/**
 * The centre of the circle INSCRIBED in a ring of three or four vertices (#1619 B2, ADR-AG-194) — `null`
 * for a degenerate or non-convex ring, which has none (a vacancy, never a guessed circle).
 *
 * A triangle's is the incentre, through the one closed form above. A quadrilateral's is the meet of the
 * internal bisectors at its first two vertices: the point equidistant from the sides `DA`, `AB` and `BC`.
 * It is tangent to the fourth side exactly when the Pitot condition holds, which the sentence states as its
 * own given — so this function never pretends a non-tangential ring has an incircle, it only says where the
 * one the givens promise sits.
 */
export function incircleCentre(v: readonly Pt[]): Pt | null {
  if (v.length === 3) return incentre(v[0], v[1], v[2]);
  if (v.length !== 4) return null;
  // Convex, with a consistent turn: every consecutive triple turns the same way, and none is straight.
  const turns = v.map((_, i) => cross2(v[i], v[(i + 1) % 4], v[(i + 2) % 4]));
  const scale = Math.max(...v.map((p, i) => dist(p, v[(i + 1) % 4])));
  if (!(scale > 1e-12)) return null;
  if (!(turns.every((t) => t > 1e-9 * scale * scale) || turns.every((t) => t < -1e-9 * scale * scale))) return null;
  const unit = (p: Pt, q: Pt): Pt => {
    const d = dist(p, q);
    return { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
  };
  const [a, b, c, d] = v;
  const ua = unit(a, b);
  const wa = unit(a, d);
  const ub = unit(b, c);
  const wb = unit(b, a);
  const da = { x: ua.x + wa.x, y: ua.y + wa.y };
  const db = { x: ub.x + wb.x, y: ub.y + wb.y };
  // a + s·da = b + t·db
  const det = da.x * -db.y - da.y * -db.x;
  if (Math.abs(det) < 1e-12) return null;
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const s = (rx * -db.y - ry * -db.x) / det;
  return { x: a.x + s * da.x, y: a.y + s * da.y };
}

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
 * A quadrilateral's diagonal meet — where the LINES AC and BD cross.
 *
 * **Operator ruling 2026-10-09 (#1937, ADR-AG-255, superseding ADR-AG-021's segment reading):** *"Lines, and show
 * why. Follow 2-D: the diagonals are lines. Draw O at (2,2) and extend both diagonals, dashed, out to it."* So on
 * the concave `A(0,0) B(4,0) C(1,1) D(0,4)` the meet is `(2,2)` — at `t = 2` along AC — and the figure shows WHY it
 * sits outside the shape: the diagonal is extended, dashed, out to it (`carryingLines` + `shell/offInk`). ADR-AG-021
 * refused that point as invented; the ruling reads «נפגשים» as the lines meeting, as 2-D does, and the honesty the
 * old reading protected is kept by drawing the extension rather than by withholding the point.
 *
 * `null` only when the diagonals are PARALLEL — then no line meets the other, at any configuration, and the point
 * is vacant ([ADR-AG-008](../../docs/06c-decisions-analytic.md#adr-ag-008)), never `NaN`, never invented. The
 * parallel test is RELATIVE, scaled by the diagonals' own length, so a figure spanning 3 units is judged as one
 * spanning 3000.
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
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

/**
 * Evaluate a rule against its parents' resolved positions.
 *
 * `null` when a parent is missing (it was vacant at this parameter value) or the configuration is
 * degenerate. EXHAUSTIVE over the rule union.
 */
/**
 * The CURVE a rule is defined in terms of, where it has one (#1059).
 *
 * Separate from {@link parentsOf} because the two answers are used for different things: the
 * points must exist and be positional, the curve must exist and be a curve. One list carrying both
 * would have to be re-split by every caller, and the first caller to forget would refuse a valid
 * sentence or admit an invalid one.
 */
export function curveParentOf(r: DerivedRule): Id | null {
  return r.t === 'circle-centre' || r.t === 'parabola-focus' ? r.curve : null;
}

/** EVERY curve a rule is defined in terms of — one for a centre, two for a touch point (#1504).
 *  The existence check and the reference walk use this; provenance keeps the single-curve reading. */
export function curveParentsOf(r: DerivedRule): Id[] {
  if (r.t === 'circle-centre' || r.t === 'parabola-focus') return [r.curve];
  if (r.t === 'touch-point') return [r.a, r.b];
  if (r.t === 'side-touch') return [r.circle];
  if (r.t === 'foot' && r.onto.k === 'curve') return [r.onto.id];
  return [];
}

/**
 * Where two tangent circles touch — `null` when they are concentric (no line of centres) or one
 * is not resolvable here. See the `touch-point` rule.
 */
export function touchPoint(
  k: { cx: number; cy: number; r: number },
  m: { cx: number; cy: number; r: number },
): Pt | null {
  const d = Math.hypot(m.cx - k.cx, m.cy - k.cy);
  if (!(d > 0) || !(k.r > 0) || !(m.r > 0)) return null;
  const ux = (m.cx - k.cx) / d;
  const uy = (m.cy - k.cy) / d;
  const near = { x: k.cx + k.r * ux, y: k.cy + k.r * uy };
  const far = { x: k.cx - k.r * ux, y: k.cy - k.r * uy };
  const miss = (p: Pt) => Math.abs(Math.hypot(p.x - m.cx, p.y - m.cy) - m.r);
  return miss(near) <= miss(far) ? near : far;
}

export function evalRule(
  r: DerivedRule,
  at: (id: Id) => Pt | null,
  /** The resolved curves, for the rules that need them. Absent means "no curve is available". */
  curveAt?: (id: Id) => { kind?: string; cx?: number; cy?: number; r?: number; a?: number; b?: number; c?: number } | null,
): Pt | null {
  const ps = parentsOf(r).map(at);
  if (ps.some((p) => p === null)) return null;
  const p = ps as Pt[];
  switch (r.t) {
    case 'circle-centre': {
      const c = curveAt?.(r.curve);
      // Not a circle, or not resolvable at this parameter value: the point is VACANT, which is a
      // state the figure already knows how to report. Never a fallback position.
      if (!c || c.kind !== 'circle' || c.cx === undefined || c.cy === undefined) return null;
      return { x: c.cx, y: c.cy };
    }
    case 'parabola-focus': {
      // The same vacancy discipline as the centre: not a parabola here, no focus here (#1432).
      // y² = 2px → focus (p/2, 0) — `curves.ts`'s own closed form, INLINED because curves.ts
      // (via evaluate) already depends on this module and an import back would be a cycle.
      const c = curveAt?.(r.curve) as { kind?: string; p?: number } | null;
      if (!c || c.kind !== 'parabola' || typeof c.p !== 'number') return null;
      return { x: c.p / 2, y: 0 };
    }
    case 'touch-point': {
      const circle = (id: Id) => {
        const c = curveAt?.(id);
        return c && c.kind === 'circle' && c.cx !== undefined && c.cy !== undefined && c.r !== undefined
          ? { cx: c.cx, cy: c.cy, r: c.r }
          : null;
      };
      const k = circle(r.a);
      const m = circle(r.b);
      return k && m ? touchPoint(k, m) : null;
    }
    case 'side-touch': {
      const c = curveAt?.(r.circle);
      if (!c || c.kind !== 'circle' || c.cx === undefined || c.cy === undefined) return null;
      return footOn({ x: c.cx, y: c.cy }, p[0], p[1]);
    }
    case 'foot': {
      const from = p[0];
      if (r.onto.k === 'axis') return r.onto.axis === 'x' ? { x: from.x, y: 0 } : { x: 0, y: from.y };
      if (r.onto.k === 'points') return footOn(from, p[1], p[2]);
      // A line OBJECT, read off its resolved equation ax + by + c = 0 — vacant when it is not a line here.
      const l = curveAt?.(r.onto.id);
      if (!l || l.kind !== 'line' || l.a === undefined || l.b === undefined || l.c === undefined) return null;
      const nn = l.a * l.a + l.b * l.b;
      if (!(nn > 1e-24)) return null;
      const k = (l.a * from.x + l.b * from.y + l.c) / nn;
      return { x: from.x - k * l.a, y: from.y - k * l.b };
    }
    case 'regular-vertex':
      return regularVertex(p[0], p[1], r.n, r.k);
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
    case 'incircle-centre':
      return incircleCentre(p);
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
    // The four angle bisectors, each from its vertex to the centre where they meet.
    case 'incircle-centre':
      return { lines: p.map((v) => ({ a: v, b: self })), feet: [] };

    // A centre has no SCAFFOLDING: there are no auxiliary lines a student would draw to find it,
    // because reading it off the equation is the whole method. Its own mark is the answer.
    // The focus likewise: read off the equation, no auxiliary lines.
    case 'circle-centre':
    case 'parabola-focus':
      return null;

    // Its scaffolding would be the line of centres; the parents are curves, so none is drawn here.
    case 'touch-point':
      return null;
    // The radius to the touch is the whole construction, and the centre is a curve parent this walk
    // does not resolve — the point's own mark is the answer, as for the centre.
    case 'side-touch':
      return null;
    // The perpendicular itself, from the point to its foot — what a student draws to find it.
    case 'foot':
      return { lines: [{ a: p[0], b: self }], feet: [] };
    // A vertex of the regular ring: the ring is the figure; there is no auxiliary line to draw.
    case 'regular-vertex':
      return null;

    default: {
      const undrawn: never = r;
      throw new Error(`derived rule has no construction: ${JSON.stringify(undrawn)}`);
    }
  }
}

/** Exported for the renderer: where a mark sits on its line. */
export const markPoint = (l: ConstructionLine, at: number): Pt => lerp(l.a, l.b, at);
