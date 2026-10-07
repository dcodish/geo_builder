/**
 * THE LOCUS TRACER — a point the givens leave ONE degree of freedom draws its מקום גיאומטרי (#1137).
 *
 * Locus is **13 of 20** sampled 572 Q1s, the most-asked construct in the corpus, and the shape is
 * always one of four: ישר · פרבולה · מעגל · אליפסה. Scoped with the operator 2026-09-16, ruled
 * [ADR-AG-072](../../docs/06c-decisions-analytic.md).
 *
 * ## The engine already solved it; this is the button shown all at once
 *
 * > A locus is a named point whose residual `carrierDof` is 1. «הציגו תצורה אחרת» is already walking
 * > it, one point at a time.
 *
 * Measured through the real `parse → fold → evaluate` path: `A(0,0)` `B(8,0)` `נקודה M` `MA = MB`
 * puts M at **x = 4.00 at every seed** with a different `y` each time, `carrierDof = 1`; and
 * `A(-9,0)` `B(41,0)` `נקודה P` `PA מאונך ל-PB` puts P at distance **25.00 from (16,0)** every time —
 * the circle on diameter AB, which is חורף 25's locus. docs/19 §6 called this "new core #3"; it is
 * not a new core. Nothing here adds a constraint kind.
 *
 * ## Why CONTINUATION, and not seed scatter or marching squares
 *
 * **Seeds give scatter, not a trace.** Measured on the bisector: seed 2 puts M at `y = 317.54` while
 * seed 3 puts it at `y = 1.23`. Joined in seed order that paints confetti, and sorting has no honest
 * key in two dimensions — angle works for the circle and fails for the bisector and the parabola.
 *
 * **Marching squares cannot reach V1b.** In the construction locus (#1138) the traced point is
 * DOWNSTREAM of the free one — G is the midpoint of EK while E is what sweeps — so it has no scalar
 * residual in its own `(x, y)` and a contour method has nothing to contour. Continuation walks the
 * figure's freedom rather than the traced point's, so it covers both halves with one mechanism. That
 * is why V1a is built this way, and #1138 is where it pays.
 *
 * So: solve once, step along the null space of the Jacobian by a fixed arclength, re-solve, repeat —
 * outward in both directions, to the view box or to closure.
 */
import { admissibleAt, carrierSystem, choiceSeedOf, drawableAt, resolvedAt, viewBox, type CarrierSystem } from './evaluate';
import { agreeingUnion, shapeOfTrace, type LocusShape } from './locusFit';
import { solveLM, SOLVE_TOL } from './solve';
import type { Env } from './expr';
import type { Pt } from './derived';
import { isFree, type Construction, type Id } from './types';

/** One drawable stretch of a locus — a polyline, closed only when the whole closed curve is allowed. */
export interface LocusPiece {
  points: Pt[];
  closed: boolean;
}

/**
 * One traced curve: the WALK (every position the freedom reaches, in walk order) and the PIECES of it the givens
 * allow (#1817, ADR-AG-245).
 *
 * The two are different things with different consumers. The walk is the CARRIER curve: the fit, the determinacy
 * gate and discovery's duplicate test read it, because the equation belongs to the whole curve — the exam asks
 * «משוואת המקום הגיאומטרי שעליו נמצאות הנקודות», and a short allowed arc may be too little of a curve to identify.
 * The pieces are what may be DRAWN: a stated region («x_B > 1», «A ברביע הראשון», «D על הצלע AB», «MA > 5») holds on
 * the configuration `evaluate` shows, so it must hold on every position the trace paints.
 */
export interface LocusTrace {
  /** The walk: the traced point's positions, ordered along the curve, whatever the selectors say. */
  points: Pt[];
  /** Did the walk return to its start? A circle and an ellipse close; a line and a parabola do not. */
  closed: boolean;
  /** The stretches of the walk at which the figure is ADMISSIBLE (`admissibleAt`) — the only thing drawn. */
  pieces: LocusPiece[];
}

export interface TraceOptions {
  /** How far to walk per step, in world units. */
  step?: number;
  /** How many steps in EACH direction. */
  maxSteps?: number;
  /** Stop when the traced point leaves this box — the trace paints to the VIEW, never beyond it. */
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  /** The configuration being traced — resolves discrete choices exactly as `evaluate` does. */
  seed?: number;
}

const DEFAULTS = { step: 0.35, maxSteps: 220 };

/**
 * How many corrected bisections refine one boundary of an admissible piece (#1817). Six halve a step to a 64th:
 * with the step a 160th of the walk room (four views wide), the end lands within ~4e-4 of the view's diagonal.
 */
const BISECT_STEPS = 6;

/** One walked position: the carrier vector, the traced point, and whether the figure there is admissible. */
interface Sample {
  x: number[];
  p: Pt;
  ok: boolean;
}

/**
 * How much wider than the view the walk is allowed to go — see `locusOf`.
 *
 * Four, because the view box is driven by the STATED objects and a locus is routinely several times
 * their extent: «A(0,0)» + «MA = 5» gives a box about five across for a curve ten across. The step
 * scales with the box, so widening it costs no extra steps — only reach.
 */
const WALK_ROOM = 4;

/**
 * How many configurations the determinacy gate may skip past looking for a measurable neighbour.
 *
 * Small on purpose. The gate needs ONE other configuration, not a survey, and a figure whose
 * neighbours are all unmeasurable is one the tool should be quiet about — that is the self-check
 * doing its job rather than a budget to raise.
 */
const COMPARE_TRIES = 3;

function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

/**
 * A unit vector in the null space of the Jacobian at `x` — the direction the figure is still free to
 * move in.
 *
 * This is `freeRank`'s Jacobian and its elimination, carried one step further: that function counts
 * the free directions and throws them away, and a tracer needs one of them. Written here rather than
 * widening `freeRank` because the DOF cue wants a number and must keep wanting only a number.
 *
 * Returns `null` unless the null space is exactly ONE-dimensional. Zero means the figure is
 * determined and there is no locus; two or more means the freedom is not a curve, and drawing a
 * one-dimensional trace through a two-dimensional family would assert a locus the givens do not
 * describe.
 */
export function nullDirection(x: number[], residuals: (v: number[]) => number[]): number[] | null {
  const n = x.length;
  const r0 = residuals(x);
  const m = r0.length;
  if (n === 0) return null;
  if (m === 0) return null; // no constraints ⇒ the freedom is the whole plane, not a curve

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

  // Row-reduce to RREF, tracking which columns are pivots. The tolerance is relative to the largest
  // entry so a figure measured in thousands and one measured in units are judged the same way —
  // `freeRank`'s rule, for `freeRank`'s reason.
  const scale = Math.max(1e-12, ...J.flat().map(Math.abs));
  const tol = 1e-9 * scale;
  const rows = J.map((r) => [...r]);
  const pivotCol: number[] = [];
  let rank = 0;
  for (let col = 0; col < n && rank < m; col += 1) {
    let piv = -1;
    for (let r = rank; r < m; r += 1) if (Math.abs(rows[r][col]) > tol) { piv = r; break; }
    if (piv < 0) continue;
    [rows[rank], rows[piv]] = [rows[piv], rows[rank]];
    const lead = rows[rank][col];
    for (let cc = 0; cc < n; cc += 1) rows[rank][cc] /= lead;
    for (let r = 0; r < m; r += 1) {
      if (r === rank) continue;
      const factor = rows[r][col];
      if (Math.abs(factor) < 1e-300) continue;
      for (let cc = 0; cc < n; cc += 1) rows[r][cc] -= factor * rows[rank][cc];
    }
    pivotCol.push(col);
    rank += 1;
  }

  if (n - rank !== 1) return null;

  // The single free column is the one no pivot claimed. Set it to 1; every pivot variable then reads
  // off its own row as the negative of that column's coefficient.
  const free = [...Array(n).keys()].find((col) => !pivotCol.includes(col));
  if (free === undefined) return null;
  const d = new Array(n).fill(0);
  d[free] = 1;
  pivotCol.forEach((col, r) => {
    d[col] = -rows[r][free];
  });
  const norm = Math.hypot(...d);
  return norm > 1e-12 ? d.map((v) => v / norm) : null;
}

/**
 * Walk the figure's one remaining freedom and record where `id` goes.
 *
 * Returns `null` when there is no locus to draw — the figure is determined, its freedom is not
 * one-dimensional, or the point named is not in the figure. Saying nothing is the honest answer
 * there; drawing something would be inventing one.
 *
 * The traced point need NOT be the free one. `positionsAt` re-evaluates the whole dependent chain at
 * every step, so a derived point downstream of the freedom traces exactly as a free one does — which
 * is #1138's half, arriving for free because the walk is over the FIGURE's freedom.
 */
export function traceLocus(
  raw: Construction,
  env: Env,
  id: Id,
  start: Map<Id, Pt>,
  opts: TraceOptions = {},
): LocusTrace | null {
  /**
   * DISCRETE freedom is resolved first, exactly as `evaluate` resolves it (#1049) — «משולש ישר-זווית
   * ABC» carries a `choice` over its three possible right angles, and a walk measured against the
   * unresolved choice would be walking a different figure from the one on the canvas.
   *
   * The seed is the one the caller traced at, so the option walked here is the option drawn there.
   */
  /*
   * …and the SELECTORS with them (#1817, ADR-AG-245): `resolvedAt` is `evaluate`'s own resolution, so every step of
   * the walk is judged against the region givens the canvas was judged with.
   */
  const seed = opts.seed ?? 0;
  const c: Construction = resolvedAt(raw, seed, choiceSeedOf(raw, seed));
  /**
   * THE STEP IS A FRACTION OF THE VIEW, not a fixed number of units.
   *
   * A fixed arclength cannot serve both `MA = 5` and the חורף 25 circle of radius 25 — measured, the
   * same 0.35 that walks the small circle twice over leaves the large one open, because the budget is
   * spent on a curve five times longer. Scaling to the view's diagonal makes the trace cost the same
   * on every figure, which is what a fixed budget actually needs.
   */
  const spanOf = opts.bounds
    ? Math.hypot(opts.bounds.maxX - opts.bounds.minX, opts.bounds.maxY - opts.bounds.minY)
    : 0;
  const step = opts.step ?? (spanOf > 0 ? Math.max(spanOf / 160, 1e-3) : DEFAULTS.step);
  const maxSteps = opts.maxSteps ?? DEFAULTS.maxSteps;
  // Parameters FIXED (#1317, ADR-AG-144): the walk is a named point's freedom at THIS configuration of
  // the figure's parameters. Whether a parameterised locus sweeps its parameter is #1186's question.
  const sys = carrierSystem(c, env, { params: 'fixed' });
  if (sys.ids.length === 0) return null;

  const x0 = sys.toVec(start);
  if (x0.some((v) => !Number.isFinite(v))) return null;
  if (nullDirection(x0, sys.residualsAt) === null) return null;

  /**
   * One position of the walk, JUDGED (#1817, ADR-AG-245): the traced point, and whether the figure there is one the
   * student described — `admissibleAt`, the configuration's own validity predicate, called on the positions the step
   * already computed. Never a second reading of the selectors.
   */
  const judge = (x: number[]): { p: Pt | null; ok: boolean } => {
    const pos = sys.positionsAt(x);
    const q = pos.get(id);
    const p = q && Number.isFinite(q.x) && Number.isFinite(q.y) ? q : null;
    return { p, ok: p !== null && admissibleAt(c, pos, sys.envAt(x)) };
  };
  const o0 = judge(x0);
  const origin = o0.p;
  if (!origin) return null;

  const inBounds = (p: Pt) =>
    !opts.bounds ||
    (p.x >= opts.bounds.minX && p.x <= opts.bounds.maxX && p.y >= opts.bounds.minY && p.y <= opts.bounds.maxY);

  /** One direction of the walk, outward from the start. */
  const walk = (sign: 1 | -1): { pts: Sample[]; closed: boolean } => {
    const pts: Sample[] = [];
    let x = [...x0];
    // The previous direction, so the walk keeps going the way it was going. Without it the null
    // vector's SIGN is arbitrary at every step — RREF has no memory — and the trace would reverse
    // into itself and stall after one step.
    let prev: number[] | null = null;
    for (let i = 0; i < maxSteps; i += 1) {
      const dRaw = nullDirection(x, sys.residualsAt);
      if (!dRaw) break;
      const d: number[] = prev && dot(dRaw, prev) < 0 ? dRaw.map((v) => -v) : dRaw;
      prev = d;

      // PREDICT along the tangent, then CORRECT back onto the constraint set. The correction is the
      // same `solveLM` the figure itself is solved with, started from the predicted point, so a step
      // never drifts off the curve it is tracing.
      const predicted = x.map((v, k) => v + sign * step * d[k]);
      const res = solveLM(predicted, sys.residualsAt, 40);
      if (!res.ok) {
        // The corrector could not get back. A smaller step is the honest retry — the curve may be
        // turning sharply — and giving up after one is what would leave a trace ending in mid-air.
        const half = x.map((v, k) => v + sign * step * 0.25 * d[k]);
        const res2 = solveLM(half, sys.residualsAt, 40);
        if (!res2.ok) break;
        x = res2.values;
      } else {
        x = res.values;
      }

      const { p, ok } = judge(x);
      if (!p) break;
      // CLOSURE: the walk came back to where it started. Checked against the ORIGIN only, and only
      // after enough steps that the first few cannot trigger it.
      if (i > 3 && Math.hypot(p.x - origin.x, p.y - origin.y) < step * 0.75) {
        return { pts, closed: true };
      }
      /**
       * OUT OF VIEW IS NOT THE END OF THE WALK — not until the walk has been IN view.
       *
       * The solved figure is where the seed put it, and that can be a long way outside the box the
       * student is looking at: measured, `A(0,0)` `B(8a,0)` at seed 2 solves with `M` at `y ≈ 1930`,
       * so a walk that stopped at the first out-of-bounds point recorded exactly ONE position and
       * the locus was empty. The curve is perfectly visible; the starting point was not on the part
       * of it that is.
       *
       * So an out-of-view step is skipped rather than fatal until something has been drawn, and only
       * then does leaving the box end the walk. The budget still bounds the whole thing.
       */
      if (!inBounds(p)) {
        if (pts.length > 0) break;
        continue;
      }
      // An INADMISSIBLE step does not end the walk (#1817): the allowed set can be two rays («MA > 5»), and the
      // walk must cross the gap to reach the second. It is recorded, judged, and left out of the pieces.
      pts.push({ x, p, ok });
    }
    return { pts, closed: false };
  };

  /**
   * THE BOUNDARY, REFINED (#1817). Between the last admissible step and the first inadmissible one the edge of the
   * allowed set lies somewhere inside one step — up to a 160th of the walk room, visible at «x_B > 1». Bisect the
   * carrier vector, re-correcting onto the constraint set with the same `solveLM` each time, and keep the last
   * admissible position. At most `BISECT_STEPS` solves per crossing; a corrector that fails keeps what it has.
   */
  const boundary = (inside: number[], outside: number[]): Pt | null => {
    let a = inside;
    let b = outside;
    let best: Pt | null = null;
    for (let k = 0; k < BISECT_STEPS; k += 1) {
      const mid = a.map((v, i) => (v + b[i]) / 2);
      const r = solveLM(mid, sys.residualsAt, 40);
      if (!r.ok) break;
      const j = judge(r.values);
      if (!j.p) break;
      if (j.ok) {
        a = r.values;
        best = j.p;
      } else {
        b = r.values;
      }
    }
    return best;
  };

  /**
   * THE WALK, SPLIT INTO ITS ADMISSIBLE PIECES (#1817). An inadmissible step closes the current piece and the next
   * admissible one opens a new piece, each end refined by `boundary`. On a CLOSED walk the last sample neighbours the
   * first, so an allowed arc running across the start is one piece, not two.
   */
  const piecesOf = (ss: Sample[], closed: boolean): LocusPiece[] => {
    if (ss.length === 0) return [];
    if (ss.every((q) => q.ok)) return [{ points: ss.map((q) => q.p), closed }];
    const out: Pt[][] = [];
    let cur: Pt[] | null = null;
    for (let i = 0; i < ss.length; i += 1) {
      const q = ss[i];
      const prev = i > 0 ? ss[i - 1] : null;
      if (q.ok) {
        if (!cur) {
          cur = [];
          if (prev) {
            const b = boundary(q.x, prev.x);
            if (b) cur.push(b);
          }
        }
        cur.push(q.p);
      } else if (cur) {
        const b = boundary(prev!.x, q.x);
        if (b) cur.push(b);
        out.push(cur);
        cur = null;
      }
    }
    if (cur) out.push(cur);
    if (closed && ss.length > 1) {
      const first = ss[0];
      const last = ss[ss.length - 1];
      if (first.ok && last.ok && out.length > 1) {
        const tail = out.pop()!;
        out[0] = [...tail, ...out[0]];
      } else if (first.ok && !last.ok) {
        const b = boundary(first.x, last.x);
        if (b) out[0].unshift(b);
      } else if (!first.ok && last.ok) {
        const b = boundary(last.x, first.x);
        if (b) out[out.length - 1].push(b);
      }
    }
    return out.filter((pp) => pp.length >= 2).map((points) => ({ points, closed: false }));
  };

  // The START ITSELF may be out of view (see the walk's bounds note) — it is a position of the point,
  // not a privileged one, and including it would draw a line from off-screen into the trace.
  const head: Sample[] = inBounds(origin) ? [{ x: x0, p: origin, ok: o0.ok }] : [];
  const fwd = walk(1);
  if (fwd.closed) {
    const ring = [...head, ...fwd.pts];
    return { points: ring.map((q) => q.p), closed: true, pieces: piecesOf(ring, true) };
  }
  const back = walk(-1);
  // Backward run reversed, then the start, then forward — one polyline in curve order.
  const line = [...back.pts.slice().reverse(), ...head, ...fwd.pts];
  return line.length > 0 ? { points: line.map((q) => q.p), closed: false, pieces: piecesOf(line, false) } : null;
}


/**
 * Is the figure's remaining freedom exactly one-dimensional, with `id` moving in it?
 *
 * The cheap question the ask lane asks before tracing anything: a point that does not move has no
 * locus, and «המקום הגיאומטרי של A» about a pinned `A` should say so rather than draw a dot.
 */
export function hasLocus(raw: Construction, env: Env, id: Id, start: Map<Id, Pt>, seed = 0): boolean {
  const c: Construction = resolvedAt(raw, seed, choiceSeedOf(raw, seed));
  const sys = carrierSystem(c, env, { params: 'fixed' });
  if (sys.ids.length === 0) return false;
  const x0 = sys.toVec(start);
  const d = nullDirection(x0, sys.residualsAt);
  if (!d) return false;
  // Does THIS point actually move along that direction? A figure can be free in a way that leaves a
  // particular point where it is, and tracing that would draw a locus of one position.
  const p0 = sys.positionsAt(x0).get(id);
  const p1 = sys.positionsAt(x0.map((v, k) => v + 1e-4 * d[k])).get(id);
  if (!p0 || !p1) return false;
  return Math.hypot(p1.x - p0.x, p1.y - p0.y) > 1e-9;
}

/**
 * THE LANE'S ONE ENTRY POINT — trace `id`'s locus and say what it is, honestly.
 *
 * Traces at TWO configurations and compares the SETS, which is ADR-AG-072 §4's determinacy gate and
 * the honesty boundary of this whole feature:
 *
 * > *"only if we are positive about the equation we show it. otherwise, we stick to showing the
 * > shape."* — operator, 2026-09-16
 *
 * What comes back is the trace to DRAW (the first configuration's, so the curve on the canvas is the
 * one belonging to the figure on the canvas) together with the verdict about what it IS — which may
 * be a kind with an equation, a kind alone, or nothing.
 *
 * `null` means there is no locus here and nothing should be shown: the figure is determined, its
 * freedom is not one-dimensional, or the point named does not move. Each of those is a true answer
 * and none of them is a curve.
 */
export interface LocusComponent {
  /** The polyline to draw — one connected component, at the configuration the student is looking at. */
  trace: LocusTrace;
  /**
   * What this component is, GATED (ADR-AG-072 §4 across the union since #1500). `null` on every
   * component when the configurations do not even agree on the families — nothing honest to say.
   */
  shape: LocusShape | null;
}

/**
 * THE LOCUS IS THE FULL SOLUTION SET (#1500) — a list of connected components, not one curve.
 *
 * Continuation can only ever cover the component its start is on: the two lines through O tangent
 * to a circle meet only at the degenerate G=O, so no walk crosses over — and the previous single-
 * polyline result drew, named and equated the component the seed landed on as the whole answer.
 * Any construction whose 1-DOF solution set is a union hits that class: tangent-line pairs,
 * distance-d-from-a-line (two parallels), |dist| equalities with sign branches.
 *
 * `components[0]` is the component the SHOWN point lies on; the rest were discovered from the other
 * sampled configurations (see `locusOf`).
 */
export interface LocusResult {
  components: LocusComponent[];
}

/** How much of a candidate trace may overlap the components already held before it is a duplicate. */
const DISCOVERY_OVERLAP = 0.5;

/** The distance from `p` to the nearest point of the polyline `pts` (segment-wise). */
function distToPolyline(p: Pt, pts: readonly Pt[]): number {
  if (pts.length === 0) return Infinity;
  let best = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    if (i + 1 < pts.length) {
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 1e-24 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
    } else {
      best = Math.min(best, Math.hypot(p.x - a.x, p.y - a.y));
    }
  }
  return best;
}

/**
 * WHAT MAY BE DRAWN of the locus (#1817, ADR-AG-245) — the walked union, with every component the givens exclude
 * entirely removed.
 *
 * The fit, the determinacy gate and discovery all ran on the WALKS (`walkedLocusOf`), because the equation belongs to
 * the carrier curve and a short allowed arc can be too little of it to identify. What leaves this function is what
 * the row names and the canvas draws, so a component with no admissible piece leaves both: a union whose second
 * line the selectors rule out reads «ישר», not «שני ישרים». Nothing admissible anywhere is no locus at all.
 */
export function locusOf(
  c: Construction,
  id: Id,
  seeds: readonly [number, number] = [0, 1],
  bounds?: TraceOptions['bounds'],
): LocusResult | null {
  const walked = walkedLocusOf(c, id, seeds, bounds);
  if (!walked) return null;
  const components = walked.components.filter((cp) => cp.trace.pieces.length > 0);
  return components.length > 0 ? { components } : null;
}

function walkedLocusOf(
  c: Construction,
  id: Id,
  seeds: readonly [number, number],
  bounds: TraceOptions['bounds'] | undefined,
): LocusResult | null {
  // One drawable figure per configuration — discovery and the gate visit the same seeds, so the
  // solves are shared rather than repeated.
  const figures = new Map<number, ReturnType<typeof drawableAt>>();
  const figAt = (seed: number) => {
    let f = figures.get(seed);
    if (!f) {
      f = drawableAt(c, seed);
      figures.set(seed, f);
    }
    return f;
  };
  const freeStart = (f: ReturnType<typeof drawableAt>): Map<Id, Pt> | null => {
    const start = new Map<Id, Pt>();
    for (const o of c.objects) {
      if (!isFree(o)) continue;
      const p = f.points.find((q) => q.id === o.id);
      if (!p) return null; // a carrier with no position — nothing to walk from
      start.set(o.id, { x: p.x, y: p.y });
    }
    return start;
  };
  /**
   * THE WALK GOES WIDER THAN THE FRAME — the frame itself is untouched.
   *
   * ADR-AG-072 §9 keeps the view box driven by the stated objects so that *an infinite locus never
   * inflates the frame*, and that stands. But tracing only INSIDE the frame turned out to break two
   * things at once, measured on «A(0,0)» «נקודה M» «MA = 5»: the box is about five units across, so
   * the circle of radius 5 was traced as a **23° arc** — too little of a curve to identify (one
   * seed's arc snapped to `x² + y² = 25` and the other's would not, so the determinacy gate reported
   * «shape only» about a locus that is perfectly determinate), and too little to show the student
   * the answer they asked for.
   *
   * So the walk is given room and the RENDERER clips, which is what it does with every other object.
   * A closed locus is then traced whole — it is a finite curve and closure ends the walk anyway — and
   * an unbounded one still stops at a bound rather than running away.
   */
  const roomOf = (f: ReturnType<typeof drawableAt>) => {
    const box = bounds ?? viewBox(f);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const halfW = Math.max((box.maxX - box.minX) / 2, 1e-6) * WALK_ROOM;
    const halfH = Math.max((box.maxY - box.minY) / 2, 1e-6) * WALK_ROOM;
    return { minX: cx - halfW, minY: cy - halfH, maxX: cx + halfW, maxY: cy + halfH };
  };

  // The configurations the gate visits.
  const sampleSeeds = Array.from({ length: COMPARE_TRIES }, (_, i) => seeds[1] + i);
  /**
   * The configurations DISCOVERY probes (#1500) — a solve each, never a walk unless a probe lands
   * off every held component, and never an open sweep (docs/17 §7). Wider than the gate's list
   * because a probe is ~100× cheaper than a full trace, and MEASURED necessary: on the operator's
   * own figure the branch split is ~7:3, so three probes miss the second line at 1 of 10 seeds —
   * which is the reported nondeterminism surviving in miniature. Six probes cover every seed
   * measured.
   */
  const discoverySeeds = Array.from({ length: 2 * COMPARE_TRIES }, (_, i) => seeds[1] + i);

  /**
   * EVERY component of the solution set at `seed`'s configuration (#1500).
   *
   * The walk from the shown position covers its own component; the other sampled configurations
   * say where else the same constraints can put the point. Each sample's free positions are
   * CORRECTED ONTO THIS CONFIGURATION's system first (`solveLM` under this seed's env and resolved
   * choices), so every polyline returned belongs to the figure being shown — a parameterised
   * figure's other sample lands back on THIS configuration's set, never its own (#1176's rule:
   * the canvas may not draw a curve belonging to a figure nobody is looking at). A corrected
   * sample landing off every component held so far seeds one more walk; a trace that mostly
   * overlaps what is already held is the same component reached again, and is dropped.
   */
  const componentsAt = (seed: number): LocusTrace[] | null => {
    const f = figAt(seed);
    const start = freeStart(f);
    if (!start) return null;
    const room = roomOf(f);
    const first = traceLocus(c, f.env, id, start, { bounds: room, seed });
    if (!first || first.points.length < 2) return null;
    const comps = [first];
    const resolved: Construction = resolvedAt(c, seed, choiceSeedOf(c, seed));
    const sys = carrierSystem(resolved, f.env, { params: 'fixed' });
    if (sys.ids.length === 0) return comps;
    const near = Math.hypot(room.maxX - room.minX, room.maxY - room.minY) / 100;
    for (const s of discoverySeeds) {
      if (s === seed) continue;
      const st = freeStart(figAt(s));
      if (!st) continue;
      const x = sys.toVec(st);
      if (x.some((v) => !Number.isFinite(v))) continue;
      const sol = solveLM(x, sys.residualsAt, 40);
      if (!sol.ok) continue;
      const pos = sys.positionsAt(sol.values);
      const p = pos.get(id);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (comps.some((t) => distToPolyline(p, t.points) < near)) continue;
      const start2 = new Map<Id, Pt>();
      let complete = true;
      for (const key of start.keys()) {
        const q = pos.get(key);
        if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) {
          complete = false;
          break;
        }
        start2.set(key, { x: q.x, y: q.y });
      }
      if (!complete) continue;
      const extra = traceLocus(c, f.env, id, start2, { bounds: room, seed });
      if (!extra || extra.points.length < 2) continue;
      // The same component reached from farther out walks back into view and re-traces it — drop it.
      const overlapping = extra.points.filter((q) => comps.some((t) => distToPolyline(q, t.points) < near)).length;
      if (overlapping > extra.points.length * DISCOVERY_OVERLAP) continue;
      comps.push(extra);
    }
    return comps;
  };

  const primary = componentsAt(seeds[0]);
  if (!primary) return null;

  // The shown point's own component must measure or there is nothing honest to say (the pre-#1500
  // rule, unchanged); an EXTRA component that will not measure is dropped rather than poisoning the
  // whole answer — the result degrades to what the tracer answered before discovery existed.
  const primaryShape = shapeOfTrace(primary[0].points);
  if (!primaryShape) return { components: [{ trace: primary[0], shape: null }] };
  const held: Array<{ trace: LocusTrace; shape: LocusShape }> = [{ trace: primary[0], shape: primaryShape }];
  for (const t of primary.slice(1)) {
    const s = shapeOfTrace(t.points);
    if (s) held.push({ trace: t, shape: s });
  }

  /**
   * THE COMPARISON SAMPLE MUST BE MEASURABLE, not merely different (#1176).
   *
   * The gate asks *is the SET the same in another configuration* and answers "kind only" when it is
   * not. That conflates two different things, and the distinction only became reachable once the
   * primary seed stopped being hardcoded: **"the two sets differ"** (the parameterised case — correct,
   * and what the gate exists for) and **"I could not measure one of them"**, which is not evidence
   * about the set at all.
   *
   * Measured: the plain bisector «A(0,0)» «B(8,0)» «MA = MB» traces `x = 4` exactly at almost every
   * configuration, but at seed 2 the free point solves out at `y ≈ 317`, so the figure is drawn fifty
   * times larger than the points defining it and `MA = MB` pins `x` to only ~1e−4 out there. That
   * trace legitimately fails the self-check — and as the NEIGHBOUR of seed 1 it was suppressing the
   * equation on a configuration that measured perfectly well.
   *
   * So the comparison advances past a configuration it cannot measure, bounded. It never widens what
   * counts as agreement: two unions that both measure and DISAGREE still print the kinds alone —
   * `agreeingUnion` (#1500) is where the verdict lives.
   */
  for (const s of sampleSeeds) {
    const other = componentsAt(s);
    if (!other) continue;
    const otherShapes = other.map((t) => shapeOfTrace(t.points)).filter((x): x is LocusShape => x !== null);
    if (otherShapes.length === 0) continue;
    const verdict = agreeingUnion(
      held.map((h) => h.shape),
      otherShapes,
    );
    if (verdict === null) return { components: held.map((h) => ({ trace: h.trace, shape: null })) };
    return { components: held.map((h, i) => ({ trace: h.trace, shape: verdict[i] })) };
  }
  // No measurable comparison at all: the fitted shapes stand ungated — the pre-existing behaviour.
  return { components: held };
}

export { SOLVE_TOL as LOCUS_SOLVE_TOL };
export type { CarrierSystem };
