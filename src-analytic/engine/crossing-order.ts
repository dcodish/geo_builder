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
import { SOLVE_RESOLUTION, type Constraint } from './solve';
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

/**
 * WHERE TWO CONICS MEET — every crossing, in the READING ORDER of the plane (#1416, ADR-AG-236).
 *
 * A pair of conics has no walk of its own: neither operand is a straight the words give a direction to.
 * So the pair takes the order a straight with no points of its own already takes (`walkOfCoefficients`):
 * **left to right, and bottom to top where two crossings stand one above the other** — the reading
 * direction of the coordinate plane, one rule for both kinds of pair. For two circles that is literally the
 * same rule: their crossings lie on the RADICAL LINE, and walking it as a coefficient line numbers them left
 * to right (bottom to top when it is vertical), with the tangency and the miss read off the same quadratic.
 *
 * Any other pair (a circle or ellipse with a parabola or an ellipse) can meet in up to four points and has no
 * closed form worth the code: the closed conic is walked once round, the other's implicit function is
 * sampled along it, and each sign change is bisected to the crossing. Two parabolas `y² = 2p·x` share their
 * vertex and their tangent there, so they touch at the origin or coincide. The order is the same
 * left-to-right rule whichever route found the points, so «הראשונה» means one thing for every pair of conics.
 */
export function conicsMeet(c1: NumCurve, c2: NumCurve): { roots: Pt[]; touching: boolean } {
  if (c1.kind === 'circle' && c2.kind === 'circle') {
    // c1 − c2: the radical line `2(cx2−cx1)·x + 2(cy2−cy1)·y + (k1 − k2) = 0`, with k = cx² + cy² − r².
    const k1 = c1.cx * c1.cx + c1.cy * c1.cy - c1.r * c1.r;
    const k2 = c2.cx * c2.cx + c2.cy * c2.cy - c2.r * c2.r;
    const w = walkOfCoefficients(2 * (c2.cx - c1.cx), 2 * (c2.cy - c1.cy), k1 - k2);
    return w ? conicMeet(w, c1) : { roots: [], touching: false }; // concentric: no crossing, or the same circle
  }
  if (c1.kind === 'parabola' && c2.kind === 'parabola') {
    return c1.p === c2.p ? { roots: [], touching: false } : { roots: [{ x: 0, y: 0 }], touching: true };
  }
  const loopFirst = loopOf(c1) !== null;
  const loop = loopOf(loopFirst ? c1 : c2);
  const f = implicitOf(loopFirst ? c2 : c1);
  if (!loop || !f) return { roots: [], touching: false };

  const scale = Math.max(extentOf(c1), extentOf(c2), 1e-9);
  const N = 1440;
  const step = (2 * Math.PI) / N;
  const val = (th: number) => f(loop(th));
  const found: Pt[] = [];
  let touching = false;
  const vs: number[] = [];
  for (let i = 0; i < N; i += 1) vs.push(val(i * step));
  const vmax = Math.max(...vs.map((v) => Math.abs(v)), 1e-300);
  for (let i = 0; i < N; i += 1) {
    const j = (i + 1) % N;
    const lo = i * step;
    const v0 = vs[i];
    const v1 = vs[j];
    if (v0 === 0) {
      found.push(loop(lo));
      continue;
    }
    if (v0 * v1 < 0) {
      // A sign change: bisect it down to the crossing.
      let a = lo;
      let b = lo + step;
      let fa = v0;
      for (let k = 0; k < 60; k += 1) {
        const m = (a + b) / 2;
        const fm = val(m);
        if (fa * fm <= 0) b = m;
        else {
          a = m;
          fa = fm;
        }
      }
      found.push(loop((a + b) / 2));
      continue;
    }
    // A touch: |f| at a local minimum that reaches zero without changing sign.
    const prev = vs[(i - 1 + N) % N];
    if (Math.abs(v0) <= Math.abs(prev) && Math.abs(v0) <= Math.abs(v1) && Math.sign(prev) === Math.sign(v0) && Math.abs(v0) < 1e-9 * vmax) {
      found.push(loop(lo));
      touching = true;
    }
  }
  const tie = 1e-9 * scale;
  const roots: Pt[] = [];
  for (const q of found) if (!roots.some((r) => Math.hypot(r.x - q.x, r.y - q.y) < 1e3 * tie)) roots.push(q);
  roots.sort((p, q) => (Math.abs(p.x - q.x) > tie ? p.x - q.x : p.y - q.y));
  return { roots, touching };
}

/** A CLOSED conic walked once round by an angle — the circle and the ellipse; `null` for an open one. */
function loopOf(cu: NumCurve): ((th: number) => Pt) | null {
  if (cu.kind === 'circle') return (th) => ({ x: cu.cx + cu.r * Math.cos(th), y: cu.cy + cu.r * Math.sin(th) });
  if (cu.kind === 'ellipse') return (th) => ({ x: cu.a * Math.cos(th), y: cu.b * Math.sin(th) });
  return null;
}

/** A conic's implicit function: zero on it, and of opposite signs on its two sides. */
function implicitOf(cu: NumCurve): ((q: Pt) => number) | null {
  if (cu.kind === 'circle') return (q) => (q.x - cu.cx) ** 2 + (q.y - cu.cy) ** 2 - cu.r * cu.r;
  if (cu.kind === 'ellipse') return (q) => (q.x * q.x) / (cu.a * cu.a) + (q.y * q.y) / (cu.b * cu.b) - 1;
  if (cu.kind === 'parabola') return (q) => q.y * q.y - 2 * cu.p * q.x;
  return null;
}

/** How far a conic reaches — the scale its crossings are told apart at. */
function extentOf(cu: NumCurve): number {
  if (cu.kind === 'circle') return Math.abs(cu.r) + Math.abs(cu.cx) + Math.abs(cu.cy);
  if (cu.kind === 'ellipse') return Math.max(Math.abs(cu.a), Math.abs(cu.b));
  if (cu.kind === 'parabola') return Math.abs(cu.p);
  return 0;
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
 * pair has no order this module defines (two straights meet once; ADR-AG-157) or cannot be read here.
 * Two conics are ordered by the reading direction ({@link conicsMeet}, #1416).
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
  if (s.k === 'conic' && t.k === 'conic') return conicsMeet(s.curve, t.curve);
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
  both = false,
): boolean {
  if (both && !meetsTwice(pair, at, curveAt)) return false;
  const o = orderedCrossings(pair, at, curveAt);
  if (!o || o.roots.length === 0 || o.touching) return true;
  if (nth >= o.roots.length) return false;
  const dist = o.roots.map((r) => Math.hypot(r.x - p.x, r.y - p.y));
  return dist.every((v, i) => i === nth || dist[nth] <= v);
}

/** A conic's own size — the scale its crossings are told apart at (a circle's radius, a conic's larger axis). */
function conicSize(cu: NumCurve): number {
  if (cu.kind === 'circle') return Math.abs(cu.r);
  if (cu.kind === 'ellipse') return Math.max(Math.abs(cu.a), Math.abs(cu.b));
  if (cu.kind === 'parabola') return Math.abs(cu.p);
  return 0;
}

/**
 * DOES THE PAIR MEET IN TWO POINTS? — what «…בנקודות A ו-B» states beyond its two ordinals (#1512,
 * [ADR-AG-185](../../docs/06c-decisions-analytic.md#adr-ag-185)).
 *
 * `true` when it cannot be judged here (an anchor not placed yet, a curve vacant at this parameter value)
 * — the incidences' own residuals report a pair that misses, and blaming it twice would be wrong.
 * Otherwise the pair must be a straight and a conic, or two conics (#1416 gave them their order — before it
 * this answered false for every conic pair, so «המעגל I חותך את המעגל II בנקודות A ו-B» refused at every
 * seed); two straights meet once. Its first two roots must be TWO POINTS: not a tangency, and apart by
 * more than the solver's resolution relative to the conic's size and the anchors' spread. That floor is
 * the `openBoundFloor` rule (ADR-AG-167 am. 1): a descent that approached a double root stops within
 * √SOLVE_TOL of it, so an exact test would let a solve that merely drifted near tangency through as two
 * crossings — measured, a free radius driven onto the line gave two letters 1e-3 apart on a radius-2
 * circle. It states no magnitude (ADR-052): the scale is the figure's own.
 */
export function meetsTwice(
  pair: readonly [Constraint, Constraint],
  at: (id: Id) => Pt | null,
  curveAt: (id: Id) => NumCurve | null,
): boolean {
  const s = sideOf(pair[0], at, curveAt);
  const t = sideOf(pair[1], at, curveAt);
  if (!s || !t) return true;
  // Two straights meet once. A straight and a conic, or two conics (#1416), have their order.
  if (s.k === 'straight' && t.k === 'straight') return false;
  const o = orderedCrossings(pair, at, curveAt);
  if (!o) return false;
  const { roots, touching } = o;
  const conic = s.k === 'conic' ? s.curve : (t as { k: 'conic'; curve: NumCurve }).curve;
  const other = s.k === 'conic' && t.k === 'conic' ? conicSize(t.curve) : 0;
  if (touching || roots.length < 2) return false;
  const anchors = pair
    .flatMap((k) => (k.t === 'on-line-2pt' ? [at(k.a), at(k.b)] : []))
    .filter((q): q is Pt => q !== null);
  const spread = anchors.length > 1
    ? Math.max(...anchors.map((q) => q.x)) - Math.min(...anchors.map((q) => q.x)) +
      Math.max(...anchors.map((q) => q.y)) - Math.min(...anchors.map((q) => q.y))
    : 0;
  const scale = Math.max(conicSize(conic), other, spread, 1e-9);
  return Math.hypot(roots[0].x - roots[1].x, roots[0].y - roots[1].y) > SOLVE_RESOLUTION * scale;
}
