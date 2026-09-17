/**
 * The constraint layer and its solve ([ADR-AG-009](../../docs/06c-decisions-analytic.md#adr-ag-009)
 * B2, issue #1016).
 *
 * **What a constraint is.** Three things, and only these grow as new kinds land: which points it
 * references, a `residual` that is zero exactly when it holds, and how to name it. The solver below
 * never learns about a constraint kind — it minimises whatever residuals it is handed, over whatever
 * carriers the construction declares. That split is copied from `src/engine/solve.ts`
 * ([ADR-012](../../docs/06-decisions.md#adr-012)), never imported
 * ([ADR-AG-012](../../docs/06c-decisions-analytic.md#adr-ag-012)).
 *
 * **Why a joint solve rather than a root-find.** [02c R5](../../docs/02c-requirements-analytic.md)
 * tiers the cost, and the corpus lands in tier 3: image 7 #6 has four unknowns (`B` and `C` unplaced)
 * against four equations — the median's foot at `(0,3)` gives two, the area one, `B` on the x-axis
 * one. A 1-DOF root-find cannot reach it. Measured before building, which is why this exists.
 *
 * **NO CAS.** Residuals are evaluated numerically and the minimiser is numerical
 * ([ADR-AG-001](../../docs/06c-decisions-analytic.md#adr-ag-001) D1). Nothing here simplifies, solves
 * or rearranges symbolically; there is no expression in this module that is not immediately evaluated.
 *
 * **A failure is honest.** When no assignment satisfies the constraints the figure does NOT quietly
 * show the least-bad one: `solve` reports that it did not converge, and the caller says so. A drawn
 * figure that violates its own givens is the defect this whole product is built to avoid.
 */
import { evalExpr, type Env } from './expr';
import type { Id, NumCurve } from './types';
import { residual as curveResidual } from './curves';
import {
  describeLengthExpr,
  evalLengthExpr,
  lengthRefs,
  type LengthExpr,
} from './lengths';
import type { Pt } from './derived';
import type { Expr } from './expr';

/**
 * A statement that must hold, expressed as a residual.
 *
 * Each member carries the ids it constrains so the solver knows which carriers can move to satisfy
 * it, and so a constraint naming a point that vanished can be reported rather than silently skipped.
 */
/**
 * One of the four things in this grammar that HAS a direction (#1052).
 *
 * This is the whole design of the relation vocabulary. «DE מקביל ל-BF», «הצלע AB מקבילה לצלע DC»,
 * «AB מקביל לציר ה-x» and «הישר l1 מקביל לישר l2» are not four rules — they are one relation with a
 * RESOLVER in front of it. The relation never learns what kind of thing it was handed, so any of the
 * four operands against any of the four is sixteen sentences and one implementation.
 *
 * Getting this seam right is also why [#1049](https://github.com/dcodish/geo_builder/issues/1049)
 * and [#1051](https://github.com/dcodish/geo_builder/issues/1051) are built alongside: «מקבילית ABCD»
 * IS `AB ∥ DC, AD ∥ BC`, and a slope is the same direction algebra. Three features sharing one
 * definition cannot disagree with each other; three features each with their own can, and the tool
 * would be able to state a parallelism one way and measure it another.
 */
export type Direction =
  /** A segment or a polygon side — both are just two named points. */
  | { k: 'points'; a: Id; b: Id }
  /** An axis. Carries no point, and needs none: its direction is fixed. */
  | { k: 'axis'; axis: 'x' | 'y' }
  /** A named line — `ℓ1`, `AC`. Its direction comes from the resolved equation. */
  | { k: 'curve'; id: Id };

export type Constraint =
  /** `A(6,4)` on a point that is not free to be replaced — one or both coordinates pinned. */
  | { t: 'coord'; id: Id; x?: Expr; y?: Expr }
  /** `שטח המשולש ABC הוא 20` — unsigned, because a triangle's area does not depend on vertex order. */
  | { t: 'area'; ids: Id[]; value: Expr }
  /** `D` is the midpoint of `BC` — «AD תיכון לצלע BC». */
  | { t: 'midpoint'; id: Id; a: Id; b: Id }
  /** `B נמצא על ציר ה-x` — the point lies on the line `ax + by + c = 0`. */
  | { t: 'on-line'; id: Id; a: number; b: number; c: number }
  /** `AD ⊥ BC` — «AD גובה לצלע BC», with `D` on `BC` carried by a companion `on-line`-free form. */
  | { t: 'perpendicular'; a: Id; b: Id; c: Id; d: Id }
  /**
   * `DE ∥ BF` · `DE ⊥ BF`, over any two {@link Direction}s (#1052).
   *
   * One kind rather than two because the residual differs only in which product is driven to zero —
   * cross for parallel, dot for perpendicular — and every other property (normalisation, degeneracy,
   * which carriers may move) is identical. `perpendicular` above is kept for the cevian that already
   * ships; it is the point-pair special case this generalises.
   */
  | {
      t: 'relation';
      rel: 'parallel' | 'perpendicular';
      u: Direction;
      v: Direction;
      /**
       * THE TOOL PICKED THIS, THE STUDENT DID NOT (#1159).
       *
       * «טרפז ABCD» promises one pair of parallel sides and the lettering suggests which — but the
       * student stated a trapezoid, not a pair. So the pair the noun lowers to is the tool's
       * ASSUMPTION, and it must be distinguishable from an identical constraint the student typed:
       * an assumption yields when they name a pair, and it may never be quoted back at them as
       * something that "already follows from the givens".
       *
       * Carried on the constraint rather than beside it so it cannot be lost by the copies the fold
       * makes. Deliberately absent from {@link canonicalConstraint} — an assumed `AB ∥ DC` and a
       * stated one are the SAME statement, which is exactly what lets the stated one pin it.
       */
      assumed?: true;
    }
  /** `שיפוע AB הוא 2` — the same direction algebra as a relation, with a stated value (#1051). */
  | { t: 'slope'; u: Direction; value: Expr }
  /**
   * `AB + BC = DE` — an equation between two expressions over LENGTHS (#1050).
   *
   * The only member of this union whose operands are TREES rather than a fixed tuple, which is
   * the whole reason it exists: `AB = 10`, `AB = AC`, `AB + BC = 10` and `2·AB = 3·CD` are one
   * kind with different trees rather than four kinds with one form each.
   */
  | { t: 'length-eq'; left: LengthExpr; right: LengthExpr }
  /**
   * A point lies ON a named curve (#1066).
   *
   * `on-line` above carries NUMERIC coefficients and exists for the axes, whose direction is
   * known without a figure. This one names the curve instead, so the coefficients come from the
   * resolved equation and may carry parameters — and so «משוואת הישר AB היא y=2x» can say the
   * thing it actually means: `A` and `B` are ON that line.
   *
   * It is the first member of the `on-curve` carrier family `carriers.ts` named in slice A and
   * left empty.
   */
  | { t: 'on-curve'; id: Id; curve: Id }
  /**
   * `D` is collinear with `a` and `b` — «D על הישר BC», «D על הצלע BC» (#1069, #1073).
   *
   * The BOUNDED reading («צלע», «קטע») is this constraint **plus a `between` selector**: the
   * collinearity is what consumes the degree of freedom, and the bound is a region that consumes
   * none. Splitting them that way is what keeps the DOF cue honest — a point on a side has ONE
   * degree of freedom whether or not it is bounded.
   *
   * Its own residual rather than the `parallel` relation on `aD ∥ ab`, which is the same algebra:
   * the relation normalises both operands to unit vectors, so a `D` sitting exactly on `a` has no
   * direction and the relation answers "cannot be judged" — while an incidence must still HOLD
   * there. Same cross product, different degenerate behaviour, and the endpoint is a legitimate
   * position on a side.
   */
  | { t: 'on-line-2pt'; id: Id; a: Id; b: Id }
  /**
   * A DISCRETE degree of freedom — exactly one of these holds, and the student has not said which
   * (#1049).
   *
   * «משולש ישר-זווית ABC» does not say WHICH angle is the right one. [02c R14] is explicit that every
   * unstated choice is a degree of freedom — *"continuous ones sample and resample; discrete ones
   * cycle"* — so the honest answer is three configurations reached by «הציגו תצורה אחרת», never a
   * silently chosen seat. Picking one and drawing it would assert a given the question never gave,
   * which is [ADR-052](../../docs/06-decisions.md#adr-052)'s cardinal sin.
   *
   * It is resolved BEFORE the solve, by the seed ({@link resolveChoices}), so no residual, no rank
   * count and no message ever sees a choice — they see the option this configuration chose. That is
   * what keeps the whole layer below unaware that discrete freedom exists.
   *
   * «זווית B ישרה» then COLLAPSES it: the student naming one of the options replaces the choice with
   * that option, which is the discrete degree of freedom being consumed exactly as a coordinate
   * consumes a continuous one.
   */
  /**
   * A circle TOUCHES an axis — «מעגל O משיק לציר x» (#1060).
   *
   * Tangency to an axis is how the corpus pins a circle WITHOUT giving its radius: it says
   * r = |y_O| for the x-axis, which is exactly one equation and exactly the sentence a student is
   * handed instead of a number.
   *
   * It names the CENTRE and the radius rather than the circle, because that is what the residual
   * needs and it keeps this kind independent of how the circle was stated.
   */
  | { t: 'tangent-axis'; centre: Id; r: Expr; axis: 'x' | 'y' }
  | { t: 'choice'; options: Constraint[] };

/**
 * The constraints as THIS configuration sees them — every discrete choice resolved by the seed.
 *
 * Cycling rather than sampling is the point: successive seeds walk the options in order, so
 * «הציגו תצורה אחרת» reaches each one instead of landing on a favourite. A choice with no options
 * cannot happen (the registry never builds one) and is dropped rather than crashing the figure.
 */
export function resolveChoices(ks: readonly Constraint[], seed: number): Constraint[] {
  return ks.flatMap((k) => {
    if (k.t !== 'choice') return [k];
    if (k.options.length === 0) return [];
    return resolveChoices([k.options[((seed % k.options.length) + k.options.length) % k.options.length]], seed);
  });
}

/** Which points a constraint references — the solver's map from constraints to movable carriers. */
/**
 * THE IDENTITY OF A CONSTRAINT AS A STATEMENT — one key, used by every comparison site (#1159).
 *
 * Two sentences that say the same thing must compare equal, and the comparison used to be
 * `JSON.stringify`. That is honest for a constraint built by `shapes.ts`'s own helpers — its docblock
 * says so, and *"there is no second way to spell a right angle at B"* is true of a seat the table
 * builds. It is **false** for a constraint the PARSER built from a student's sentence, where the
 * spelling is theirs:
 *
 * | «AB מקביל ל-**CD**» | `already-follows` |
 * | «AB מקביל ל-**DC**» | `already-known`   |
 *
 * One statement, two answers, decided by which letter the student happened to write first. A segment
 * is UNDIRECTED and so is parallelism, so the key sorts each point pair and then the two operands.
 *
 * **Not a spelling-equivalence table.** This is the analytic mirror of #999's ruling: normalise the
 * one thing that is genuinely a spelling — operand order in a symmetric relation — and never
 * enumerate which kinds mean the same as which others. Everything else keeps its exact form, so a
 * constraint kind added later is compared strictly until someone decides otherwise.
 *
 * `assumed` is deliberately NOT part of the key — see its docblock.
 */
export function canonicalConstraint(k: Constraint): string {
  const dir = (d: Direction): string =>
    d.k === 'points' ? `p:${[d.a, d.b].sort().join(',')}` : d.k === 'axis' ? `a:${d.axis}` : `c:${d.id}`;
  if (k.t === 'relation') {
    // Both relations are symmetric in their operands: `u ∥ v` is `v ∥ u`, and likewise for ⊥.
    const [u, v] = [dir(k.u), dir(k.v)].sort();
    return `relation|${k.rel}|${u}|${v}`;
  }
  if (k.t === 'perpendicular') {
    const [p, q] = [[k.a, k.b].sort().join(','), [k.c, k.d].sort().join(',')].sort();
    return `perpendicular|${p}|${q}`;
  }
  return JSON.stringify(k);
}

/** Do these two constraints say the SAME thing? See {@link canonicalConstraint}. */
export const sameConstraint = (a: Constraint, b: Constraint): boolean =>
  canonicalConstraint(a) === canonicalConstraint(b);

export function constraintRefs(k: Constraint): Id[] {
  switch (k.t) {
    case 'coord':
      return [k.id];
    case 'area':
      return [...k.ids];
    case 'midpoint':
      return [k.id, k.a, k.b];
    case 'on-line':
      return [k.id];
    case 'perpendicular':
      return [k.a, k.b, k.c, k.d];
    case 'relation':
      return [...dirRefs(k.u), ...dirRefs(k.v)];
    case 'slope':
      return dirRefs(k.u);
    case 'length-eq':
      return [...lengthRefs(k.left), ...lengthRefs(k.right)];
    case 'on-curve':
      return [k.id];
    case 'on-line-2pt':
      return [k.id, k.a, k.b];
    // Every option's points: the choice is about which constraint holds, not about which points
    // are involved, and a carrier any option could move must be searched over.
    case 'tangent-axis':
      return [k.centre];
    case 'choice':
      return [...new Set(k.options.flatMap(constraintRefs))];
    default: {
      const unreferenced: never = k;
      throw new Error(`constraint declares no refs: ${JSON.stringify(unreferenced)}`);
    }
  }
}

/** Human-readable, so a refusal can name the STATEMENT rather than internal state. */
export function describeConstraint(k: Constraint): string {
  switch (k.t) {
    case 'coord':
      return `${k.id}`;
    case 'area':
      return `שטח ${k.ids.join('')}`;
    case 'midpoint':
      return `${k.id} = אמצע ${k.a}${k.b}`;
    case 'on-line':
      return `${k.id} על ישר`;
    case 'perpendicular':
      return `${k.a}${k.b} ⊥ ${k.c}${k.d}`;
    case 'relation':
      return `${describeDir(k.u)} ${k.rel === 'parallel' ? '∥' : '⊥'} ${describeDir(k.v)}`;
    case 'slope':
      return `שיפוע ${describeDir(k.u)}`;
    case 'length-eq':
      return `${describeLengthExpr(k.left)} = ${describeLengthExpr(k.right)}`;
    case 'on-curve':
      return `${k.id} על ${k.curve}`;
    case 'on-line-2pt':
      return `${k.id} על ${k.a}${k.b}`;
    case 'tangent-axis':
      return `${k.centre} משיק לציר ${k.axis}`;
    case 'choice':
      return k.options.map(describeConstraint).join(' או ');
    default: {
      const undescribed: never = k;
      throw new Error(`constraint has no description: ${JSON.stringify(undescribed)}`);
    }
  }
}

/** The points a direction depends on — an axis and a named line depend on none. */
/**
 * THE CURVES A CONSTRAINT NAMES — the other half of {@link constraintRefs} (#1150).
 *
 * `constraintRefs` answers *which POINTS does this touch*, and both of its callers want exactly that:
 * `carriers.ts` to find the carriers a constraint can move, and the apply boundary to refuse a
 * statement about a point the figure does not have. So `on-curve` returns only its point, and
 * `dirRefs` returns `[]` for a curve direction — correct for those questions, and it left a hole.
 *
 * **Nothing checked that the CURVE exists.** «נקודה D היא חיתוך של l7 ו- l8» on a figure with no `l7`
 * lowered to two `on-curve` constraints naming curves that were never there, passed the apply
 * boundary in silence, and then could not be measured at evaluation — so `D` was drawn as an ordinary
 * free point at a sampled position while the panel one column over read `D = –`. The defining clause
 * of a point vanished and the point was drawn anyway, which is CLAUDE.md's honesty invariant: *no
 * stated magnitude is ever silently dropped — a given parses to a constraint, escalates, or errors,
 * but never vanishes.*
 *
 * Kept SEPARATE from `constraintRefs` rather than merged into it, because the two answers have
 * different truth conditions: a point ref must resolve to something positional, and a curve ref must
 * resolve to something with a shape. Merging them would have made the apply check reject every curve
 * reference as "not a point", which is the opposite defect.
 */
export function constraintCurveRefs(k: Constraint): Id[] {
  const ofDir = (d: Direction): Id[] => (d.k === 'curve' ? [d.id] : []);
  switch (k.t) {
    case 'on-curve':
      return [k.curve];
    case 'relation':
      return [...ofDir(k.u), ...ofDir(k.v)];
    case 'slope':
      return ofDir(k.u);
    case 'choice':
      return [...new Set(k.options.flatMap(constraintCurveRefs))];
    default:
      // EXHAUSTIVE BY DEFAULT, deliberately — unlike `constraintRefs`, whose `never` arm forces every
      // new kind to declare its points. A constraint kind that names no curve is the common case, and
      // a kind that does will be caught by its own test rather than by a compile error here.
      return [];
  }
}

export function dirRefs(d: Direction): Id[] {
  switch (d.k) {
    case 'points':
      return [d.a, d.b];
    case 'axis':
    case 'curve':
      return [];
    default: {
      const unreferenced: never = d;
      throw new Error(`direction declares no refs: ${JSON.stringify(unreferenced)}`);
    }
  }
}

/** Named in the student's own terms, so a refusal can quote the statement. */
function describeDir(d: Direction): string {
  switch (d.k) {
    case 'points':
      return `${d.a}${d.b}`;
    case 'axis':
      return `ציר ה-${d.axis}`;
    case 'curve':
      return d.id;
    default: {
      const undescribed: never = d;
      throw new Error(`direction has no description: ${JSON.stringify(undescribed)}`);
    }
  }
}

/**
 * Resolve a direction to a UNIT vector, or `null` when it cannot be judged here.
 *
 * Unit rather than raw: a relation between a 3-unit segment and a 3000-unit one must converge the
 * same way, and an un-normalised cross product would make the long operand dominate the minimisation
 * for no geometric reason — the same trap the area residual already documents.
 *
 * `null` for a degenerate operand (a zero-length segment, a line that did not resolve). The caller
 * treats that as "cannot be judged" rather than "satisfied".
 */
export function dirVector(
  d: Direction,
  at: (id: Id) => Pt | null,
  curveAt?: (id: Id) => NumCurve | null,
): Pt | null {
  let v: Pt | null = null;
  switch (d.k) {
    case 'points': {
      const a = at(d.a);
      const b = at(d.b);
      if (!a || !b) return null;
      v = { x: b.x - a.x, y: b.y - a.y };
      break;
    }
    case 'axis':
      // The axes need no resolution and no figure — that is why they are cheap operands, and why
      // «AB מקביל לציר ה-x» works before anything else on the canvas is determined.
      return d.axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
    case 'curve': {
      // For `ax + by + c = 0` the direction is `(−b, a)`: the normal is `(a, b)`, and a line runs
      // perpendicular to its own normal. Only a LINE has a single direction — a circle or a conic
      // has a different tangent at every point, so relating one is not this constraint’s business.
      const c = curveAt?.(d.id) ?? null;
      if (!c || c.kind !== 'line') return null;
      v = { x: -c.b, y: c.a };
      break;
    }
    default: {
      const unresolved: never = d;
      throw new Error(`direction cannot be resolved: ${JSON.stringify(unresolved)}`);
    }
  }
  if (!v) return null;
  const n = Math.hypot(v.x, v.y);
  if (n < 1e-12) return null; // a zero-length operand has no direction to relate
  return { x: v.x / n, y: v.y / n };
}

/** Twice the signed area of a polygon — the shoelace sum. */
function shoelace(ps: Pt[]): number {
  let s = 0;
  for (let i = 0; i < ps.length; i += 1) {
    const q = ps[(i + 1) % ps.length];
    s += ps[i].x * q.y - q.x * ps[i].y;
  }
  return s;
}

/**
 * How far a constraint is from holding, **as a VECTOR with one entry per independent equation**.
 * Every entry is zero exactly when the constraint holds, and all are scale-normalised so a length
 * and an area are comparable — otherwise the area dominates the minimisation purely because its
 * numbers are bigger.
 *
 * **Per component, never a norm.** A midpoint condition is two equations; collapsing it to the
 * distance `|M − (A+B)/2|` gives one residual whose Jacobian has rank 1 at the solution, so the
 * figure reports a degree of freedom it does not have and the DOF cue lies at exactly the moment it
 * matters ([02c R22](../../docs/02c-requirements-analytic.md)). It also converges worse: a norm has
 * a kink at zero, which is where the solver spends its last iterations.
 *
 * Returns `null` when a referenced point is absent — the caller treats that as "cannot be judged"
 * rather than as "satisfied", which is the difference between an honest report and a false green.
 */
export function residual(
  k: Constraint,
  at: (id: Id) => Pt | null,
  env: Env,
  /**
   * The figure's resolved curves, when the caller has them (#1052, #1066).
   *
   * Optional because most constraints never ask: only a relation, a slope or an incidence naming a
   * CURVE needs them, and a caller that has none simply hands nothing — those operands then report
   * "cannot be judged", exactly as an absent point does.
   *
   * A resolver rather than a lookup so `solve.ts` never learns about the classifier: it knows
   * points by id, and everything else arrives already resolved.
   */
  curveAt?: (id: Id) => NumCurve | null,
): number[] | null {
  const pts = constraintRefs(k).map(at);
  if (pts.some((p) => p === null)) return null;
  const p = pts as Pt[];

  switch (k.t) {
    case 'coord': {
      // Either coordinate may be absent — «שיעור ה-x של M הוא 3» pins one and leaves the other free.
      const out: number[] = [];
      if (k.x !== undefined) out.push(p[0].x - evalExpr(k.x, env));
      if (k.y !== undefined) out.push(p[0].y - evalExpr(k.y, env));
      return out;
    }
    case 'area': {
      const target = evalExpr(k.value, env);
      const area = Math.abs(shoelace(p)) / 2;
      // Relative to the target, so a figure of area 20 and one of area 2000 converge alike.
      return [(area - target) / Math.max(1, Math.abs(target))];
    }
    case 'midpoint': {
      const [m, a, b] = p;
      const scale = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      return [(m.x - (a.x + b.x) / 2) / scale, (m.y - (a.y + b.y) / 2) / scale];
    }
    case 'on-line': {
      const n = Math.hypot(k.a, k.b);
      if (n < 1e-12) return null;
      return [(k.a * p[0].x + k.b * p[0].y + k.c) / n];
    }
    case 'perpendicular': {
      const [a, b, c, d] = p;
      const u = { x: b.x - a.x, y: b.y - a.y };
      const v = { x: d.x - c.x, y: d.y - c.y };
      const n = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
      if (n < 1e-12) return null;
      return [(u.x * v.x + u.y * v.y) / n];
    }
    case 'relation': {
      const u = dirVector(k.u, at, curveAt);
      const v = dirVector(k.v, at, curveAt);
      if (!u || !v) return null;
      // Both unit, so each product is already in [-1, 1] and needs no further scaling. Parallel
      // drives the CROSS product to zero, perpendicular the DOT — the only difference between them.
      return [k.rel === 'parallel' ? u.x * v.y - u.y * v.x : u.x * v.x + u.y * v.y];
    }
    case 'slope': {
      const u = dirVector(k.u, at, curveAt);
      if (!u) return null;
      const m = evalExpr(k.value, env);
      if (!Number.isFinite(m)) return null;
      /**
       * `dy = m·dx`, NOT `dy/dx = m`. The quotient form has a pole at a vertical segment, and a
       * residual that blows up is a residual the minimiser cannot cross: a figure whose solution
       * path passes near vertical would be unreachable. Written this way it is a smooth linear
       * condition everywhere, and a vertical operand simply fails it rather than exploding.
       *
       * Normalised by the unit direction, so a stated slope reads the same on any scale of figure.
       */
      return [u.y - m * u.x];
    }
    case 'length-eq': {
      const l = evalLengthExpr(k.left, at, env);
      const r = evalLengthExpr(k.right, at, env);
      if (l === null || r === null) return null;
      /**
       * Scale-normalised, like the area residual and for the same reason: a figure measured in
       * thousands and one measured in units must converge alike, and a raw difference would let
       * the larger figure dominate a joint solve purely because its numbers are bigger.
       */
      return [(l - r) / Math.max(1, Math.abs(l), Math.abs(r))];
    }
    case 'on-curve': {
      const c = curveAt?.(k.curve) ?? null;
      if (!c) return null;
      /**
       * `curves.ts` already owns the distance-like residual for every curve family, scale-
       * normalised and zero exactly on the curve. Reusing it is what keeps "is this point on this
       * line" and "does this line pass through this point" one answer rather than two.
       */
      return [curveResidual(c, p[0].x, p[0].y)];
    }
    case 'on-line-2pt': {
      const [d, a, b] = p;
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const n = Math.hypot(ux, uy);
      if (n < 1e-12) return null; // the two points coincide: they name no line to be on
      // The perpendicular distance from `d` to the line through `a` and `b` — the cross product over
      // the base length. Zero exactly on the line, and a true distance, so it is comparable with
      // every other residual here without further scaling.
      return [((d.x - a.x) * uy - (d.y - a.y) * ux) / n];
    }
    case 'tangent-axis': {
      const radius = evalExpr(k.r, env);
      if (!Number.isFinite(radius)) return null; // an unbound radius judges nothing
      // The DISTANCE from the centre to the axis IS the radius. Unsigned on purpose: a circle
      // below the x-axis touches it exactly as one above does, and demanding a sign would assert
      // a side the student never gave (ADR-052). Which side is a SELECTOR’s business, not this.
      const d = k.axis === 'x' ? Math.abs(p[0].y) : Math.abs(p[0].x);
      return [d - radius];
    }
    /**
     * A discrete choice HAS no residual, by construction (#1049).
     *
     * {@link resolveChoices} replaces it with the option this configuration chose before any of this
     * runs, so reaching here means a caller measured raw constraints instead of resolved ones. Saying
     * so loudly is the point: silently measuring `options[0]` would draw one seat and call it the
     * only one, which is the defect the kind exists to prevent.
     */
    case 'choice':
      throw new Error('a choice must be resolved by resolveChoices() before it is measured');
    default: {
      const unmeasured: never = k;
      throw new Error(`constraint has no residual: ${JSON.stringify(unmeasured)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// The solve
// ---------------------------------------------------------------------------

/** The tolerance at which a constraint counts as satisfied. Residuals are scale-normalised above. */
export const SOLVE_TOL = 1e-7;

export interface SolveResult {
  /** The carrier values that satisfy the constraints, in the order they were handed in. */
  values: number[];
  /** Did every constraint reach tolerance? `false` means the caller must REPORT, never draw as if. */
  ok: boolean;
  /** The worst residual at the returned values — what a refusal message can quote. */
  worst: number;
}

/**
 * Levenberg–Marquardt over the free carriers.
 *
 * Gauss–Newton alone diverges on the corpus's own figures — an area constraint is quadratic in the
 * vertices, so a step computed from a far-off start overshoots badly. The damping term is what makes
 * it behave like gradient descent when far away and like Newton when close, and it is the smallest
 * addition that makes the method survive a bad seed.
 *
 * The Jacobian is numerical. An analytic one would be faster and would have to be re-derived for
 * every constraint kind — which is exactly the per-kind growth the residual/solver split exists to
 * prevent.
 */
export function solveLM(
  x0: number[],
  residuals: (x: number[]) => number[],
  maxIter = 120,
): SolveResult {
  const n = x0.length;
  let x = [...x0];
  let lambda = 1e-3;

  const cost = (v: number[]) => residuals(v).reduce((s, r) => s + r * r, 0);
  let f = cost(x);

  for (let iter = 0; iter < maxIter && f > SOLVE_TOL * SOLVE_TOL; iter += 1) {
    const r = residuals(x);
    const m = r.length;
    if (m === 0) break;

    // Numerical Jacobian, central differences — one-sided loses too much precision near a solution.
    const J: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j += 1) {
      const h = Math.max(1e-6, Math.abs(x[j]) * 1e-6);
      const up = [...x];
      const dn = [...x];
      up[j] += h;
      dn[j] -= h;
      const ru = residuals(up);
      const rd = residuals(dn);
      for (let i = 0; i < m; i += 1) J[i][j] = (ru[i] - rd[i]) / (2 * h);
    }

    // Normal equations (JᵀJ + λ·diag) δ = −Jᵀr, solved by Gaussian elimination. n is small — the
    // corpus's figures have a handful of unknowns — so a dense solve is the honest simple choice.
    const A: number[][] = Array.from({ length: n }, () => new Array(n + 1).fill(0));
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        let s = 0;
        for (let k = 0; k < m; k += 1) s += J[k][i] * J[k][j];
        A[i][j] = s + (i === j ? lambda * (1 + s) : 0);
      }
      let b = 0;
      for (let k = 0; k < m; k += 1) b -= J[k][i] * r[k];
      A[i][n] = b;
    }

    const delta = gaussian(A, n);
    if (!delta) {
      lambda *= 10;
      if (lambda > 1e12) break;
      continue;
    }

    const next = x.map((v, i) => v + delta[i]);
    const fn = cost(next);
    if (fn < f) {
      x = next;
      f = fn;
      lambda = Math.max(lambda * 0.3, 1e-12);
    } else {
      lambda *= 10;
      if (lambda > 1e12) break;
    }
  }

  const worst = residuals(x).reduce((w, r) => Math.max(w, Math.abs(r)), 0);
  return { values: x, ok: worst <= 1e-6, worst };
}

/** Gaussian elimination with partial pivoting. `null` when the system is singular to working
 *  precision — which the caller answers by damping harder rather than by inventing a step. */
function gaussian(A: number[][], n: number): number[] | null {
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-14) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = col + 1; r < n; r += 1) {
      const factor = A[r][col] / A[col][col];
      for (let c = col; c <= n; c += 1) A[r][c] -= factor * A[col][c];
    }
  }
  const out = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = A[r][n];
    for (let c = r + 1; c < n; c += 1) s -= A[r][c] * out[c];
    out[r] = s / A[r][r];
  }
  return out.every((v) => Number.isFinite(v)) ? out : null;
}

/**
 * How many degrees of freedom SURVIVE the constraints — the number the DOF cue must report.
 *
 * Counting carriers alone says "4 free" on a figure whose four unknowns are pinned by four
 * equations, which inverts the one thing the cue is for: [02c R22](../../docs/02c-requirements-analytic.md)
 * makes the moment a figure becomes determined the moment the student learns their givens were
 * enough. A cue that never reaches zero teaches the opposite.
 *
 * Computed as `carriers − rank(J)` from the numerical Jacobian at the solution, so **dependent
 * constraints do not over-count**: stating the same area twice, or a constraint implied by others,
 * removes no additional freedom and the rank reflects that where a simple subtraction would not.
 */
export function freeRank(x: number[], residuals: (v: number[]) => number[]): number {
  const n = x.length;
  const m = residuals(x).length;
  if (n === 0 || m === 0) return n;

  const J: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j += 1) {
    const h = Math.max(1e-6, Math.abs(x[j]) * 1e-6);
    const up = [...x];
    const dn = [...x];
    up[j] += h;
    dn[j] -= h;
    const ru = residuals(up);
    const rd = residuals(dn);
    for (let i = 0; i < m; i += 1) J[i][j] = (ru[i] - rd[i]) / (2 * h);
  }

  // Gaussian elimination counting pivots. The tolerance is relative to the largest entry, so a
  // figure measured in thousands and one measured in units are judged the same way.
  const scale = Math.max(1e-12, ...J.flat().map(Math.abs));
  const tol = 1e-9 * scale;
  let rank = 0;
  const rows = J.map((r) => [...r]);
  for (let col = 0; col < n && rank < m; col += 1) {
    let piv = -1;
    for (let r = rank; r < m; r += 1) if (Math.abs(rows[r][col]) > tol) { piv = r; break; }
    if (piv < 0) continue;
    [rows[rank], rows[piv]] = [rows[piv], rows[rank]];
    for (let r = 0; r < m; r += 1) {
      if (r === rank) continue;
      const factor = rows[r][col] / rows[rank][col];
      for (let cc = col; cc < n; cc += 1) rows[r][cc] -= factor * rows[rank][cc];
    }
    rank += 1;
  }
  return Math.max(0, n - rank);
}
