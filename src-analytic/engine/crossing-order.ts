/**
 * WHICH CROSSING IS «הראשונה» AND WHICH IS «השנייה» (#1268, [ADR-AG-157](../../docs/06c-decisions-analytic.md#adr-ag-157)).
 *
 * #1113's ruling was that **the sentence names the root** — *"rather than a branch index being stored
 * behind the student's back"* — and the grammar has read the two ordinals since. Measured before this
 * module, they chose nothing: «P נקודת החיתוך השנייה של הישר CA עם המעגל …» landed on the same point as
 * «… הראשונה …» at every seed, because the only selector was `crossing-distinct`, which pushes two NAMED
 * crossings apart and says nothing about which is which. A click on the right-hand ring of a chord
 * committed «הראשונה» and put the point on the LEFT.
 *
 * ## The order, stated once
 *
 * A straight meeting a conic is walked in its OWN direction, and the crossings are numbered in the order
 * the walk meets them — the parameter `t` along the line, ascending:
 *
 *  - a straight named by two points («הישר CA», «הצלע CA», «הקטע AB») is walked FROM the first letter
 *    TOWARD the second, so the words carry the direction and «הישר AC» numbers the other way round;
 *  - a straight with no points of its own (an equation, an axis, a named line) is walked left to right,
 *    and bottom to top when it is vertical — the reading direction of the coordinate plane.
 *
 * The order is taken over EVERY root of the pair, before any extent is applied: a side that meets the
 * circle once on its drawn piece still has two crossings on its line, and the one on the piece keeps the
 * number the line gives it. That is what lets the ring on a segment say which root it is at all.
 *
 * Three readers share this module so they cannot disagree — the click-path rings (`crossings.ts`), the
 * `crossing-nth` selector that judges a configuration (`evaluate.ts`), and the seeding that starts the
 * solve on the root the sentence names (`evaluate.ts`).
 */
import type { Pt } from './derived';
import type { Constraint } from './solve';
import type { Id, NumCurve } from './types';

/** A straight line with a DIRECTION: the point `p0` on it nearest the origin, and the way it is walked. */
export interface Walk {
  p0: Pt;
  d: Pt;
}

/** The line `a·x + b·y + c = 0` walked along `d` (which must be parallel to it). */
function walkAlong(a: number, b: number, c: number, d: Pt): Walk | null {
  const n2 = a * a + b * b;
  if (!(n2 > 1e-18)) return null;
  return { p0: { x: (-a * c) / n2, y: (-b * c) / n2 }, d };
}

/** A straight through two points, walked FROM `from` TOWARD `to` — the order the letters were written in. */
export function walkThrough(from: Pt, to: Pt): Walk | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!(Math.hypot(dx, dy) > 1e-9)) return null;
  return walkAlong(dy, -dx, dx * from.y - dy * from.x, { x: dx, y: dy });
}

/**
 * A straight given by its coefficients, walked left to right (bottom to top when vertical).
 *
 * `d = (−b, a)` keeps the magnitude the coefficients carry, so the quadratic below sees exactly the numbers
 * it always saw; only its SIGN is normalised, which is what makes the order independent of how the
 * equation happened to be written (`y = 2x` and `2x − y = 0` are one line walked one way).
 */
export function walkOfCoefficients(a: number, b: number, c: number): Walk | null {
  let d = { x: -b, y: a };
  const len = Math.hypot(d.x, d.y);
  if (!(len > 0)) return null;
  const vertical = Math.abs(d.x) <= 1e-12 * len;
  if ((!vertical && d.x < 0) || (vertical && d.y < 0)) d = { x: -d.x, y: -d.y };
  return walkAlong(a, b, c, d);
}

/**
 * WHERE A WALKED STRAIGHT MEETS A CONIC — every root, in walking order (#1096, #1268).
 *
 * Substituting `p0 + t·d` into each canonical conic leaves a QUADRATIC in `t`, with no vertical or
 * horizontal special case. A near-zero leading coefficient is the genuinely linear case (a line parallel
 * to a parabola's axis meets it once) and is solved as such rather than divided through.
 *
 * `touching` is a double root: the line is tangent there, and the two crossings are one point.
 */
export function conicMeet(w: Walk, conic: NumCurve): { roots: Pt[]; touching: boolean } {
  const { p0, d } = w;
  let A = 0;
  let B = 0;
  let C = 0;
  if (conic.kind === 'circle') {
    const q = { x: p0.x - conic.cx, y: p0.y - conic.cy };
    A = d.x * d.x + d.y * d.y;
    B = 2 * (d.x * q.x + d.y * q.y);
    C = q.x * q.x + q.y * q.y - conic.r * conic.r;
  } else if (conic.kind === 'ellipse') {
    const ia = 1 / (conic.a * conic.a);
    const ib = 1 / (conic.b * conic.b);
    A = d.x * d.x * ia + d.y * d.y * ib;
    B = 2 * (p0.x * d.x * ia + p0.y * d.y * ib);
    C = p0.x * p0.x * ia + p0.y * p0.y * ib - 1;
  } else if (conic.kind === 'parabola') {
    // y² = 2p·x
    const two = 2 * conic.p;
    A = d.y * d.y;
    B = 2 * p0.y * d.y - two * d.x;
    C = p0.y * p0.y - two * p0.x;
  } else {
    return { roots: [], touching: false };
  }

  const ts: number[] = [];
  let touching = false;
  if (Math.abs(A) < 1e-12) {
    if (Math.abs(B) > 1e-12) ts.push(-C / B); // the honestly linear case
  } else {
    const disc = B * B - 4 * A * C;
    if (disc < -1e-9) return { roots: [], touching: false }; // misses it
    const root = Math.sqrt(Math.max(disc, 0));
    if (root <= 1e-6) {
      touching = true;
      ts.push(-B / (2 * A));
    } else {
      // ASCENDING in t — the walking order. `A > 0` for the circle and ellipse; the parabola's `A` can
      // only be ≥ 0 too (a square), so the smaller root is `(−B − root) / 2A`. Sorted anyway, so the
      // order never rests on that argument.
      ts.push((-B - root) / (2 * A), (-B + root) / (2 * A));
      ts.sort((u, v) => u - v);
    }
  }
  const roots = ts
    .map((t) => ({ x: p0.x + t * d.x, y: p0.y + t * d.y }))
    .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
  return { roots, touching };
}

/** One side of a crossing, as it stands in the configuration being judged. */
type Side = { k: 'straight'; w: Walk } | { k: 'conic'; curve: NumCurve };

/**
 * An incidence, read as a straight or a conic in this configuration — `null` when it cannot be judged
 * here (a point not placed yet, a curve vacant at this parameter value, or not an incidence at all).
 */
function sideOf(k: Constraint, at: (id: Id) => Pt | null, curveAt: (id: Id) => NumCurve | null): Side | null {
  if (k.t === 'on-line-2pt') {
    const a = at(k.a);
    const b = at(k.b);
    const w = a && b ? walkThrough(a, b) : null;
    return w ? { k: 'straight', w } : null;
  }
  if (k.t === 'on-line') {
    const w = walkOfCoefficients(k.a, k.b, k.c);
    return w ? { k: 'straight', w } : null;
  }
  if (k.t === 'on-curve') {
    const cu = curveAt(k.curve);
    if (!cu) return null;
    if (cu.kind === 'line') {
      const w = walkOfCoefficients(cu.a, cu.b, cu.c);
      return w ? { k: 'straight', w } : null;
    }
    return { k: 'conic', curve: cu };
  }
  return null;
}

/**
 * The crossings of a crossing sentence's two incidences, in the canonical order — or `null` when the
 * pair has no order this module defines (two conics; see ADR-AG-157's limits) or cannot be read here.
 */
export function orderedCrossings(
  pair: readonly [Constraint, Constraint],
  at: (id: Id) => Pt | null,
  curveAt: (id: Id) => NumCurve | null,
): { roots: Pt[]; touching: boolean } | null {
  const s = sideOf(pair[0], at, curveAt);
  const t = sideOf(pair[1], at, curveAt);
  if (!s || !t) return null;
  if (s.k === 'straight' && t.k === 'conic') return conicMeet(s.w, t.curve);
  if (s.k === 'conic' && t.k === 'straight') return conicMeet(t.w, s.curve);
  return null;
}

/**
 * DOES `p` SIT ON THE ROOT ITS SENTENCE NAMED? — the `crossing-nth` selector's judgement.
 *
 * `true` whenever it cannot be judged (nothing to order, or the pair misses at this configuration — the
 * incidences' own residuals report that, and blaming it twice would be wrong) and at a tangency, where
 * the two crossings are one point. A NAMED root that does not exist — «השנייה» of a pair that meets
 * once — is `false`: the student named a crossing this figure does not have.
 *
 * Otherwise `p` holds when the named root is the one it is NEAREST, so the verdict never rests on an
 * epsilon: the two roots are distinct points, and the solve's residual tolerance is far below the gap
 * between them.
 */
export function nthHolds(
  p: Pt,
  nth: number,
  pair: readonly [Constraint, Constraint],
  at: (id: Id) => Pt | null,
  curveAt: (id: Id) => NumCurve | null,
): boolean {
  const o = orderedCrossings(pair, at, curveAt);
  if (!o || o.roots.length === 0 || o.touching) return true;
  if (nth >= o.roots.length) return false;
  const dist = o.roots.map((r) => Math.hypot(r.x - p.x, r.y - p.y));
  return dist.every((v, i) => i === nth || dist[nth] <= v);
}
