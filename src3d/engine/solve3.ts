/**
 * The V4 coordinate-injection PIVOT (docs/20 §4, §6.1; ADR-3D-007): a gauge-free
 * Lane-G figure receives absolute givens mid-session — point coordinates
 * (`P(0,4,6)`, partial `A(3,n,p)`) and vector values (`נתון: v = (10,-5,0)`) —
 * and the engine solves for the SIMILARITY (translate + rotate + scale) plus the
 * figure's free shape dims that realises them.
 *
 * Numeric least-squares (Levenberg–Marquardt with a numeric Jacobian) — the same
 * numeric-solving category the 2-D engine lives on; NOT symbolic (D3 holds).
 * Under-determination is welcome, not fought: an uninjected dimension (2020's
 * prism height) stays free — LM's damping converges to a nearby manifold point,
 * and different seeds start elsewhere, so "show another configuration" still
 * varies what the givens never fixed (ADR-052).
 *
 * REFLECTION is a discrete branch: both orientations are solved; sign givens
 * (`שיעור ה-z של C' חיובי`) select among the surviving solutions, else the seed.
 */

import { offsetSampleK, riderSampleT } from './onSegmentRatio';
import { resolveSolidSubject, subjectVolume } from './solidSubject';
import { carrierParams3 } from './carriers';
import { evalAffine, gaugeFramePoint3, openPinSymsOf, pinSymsOf, symbolValueOf, type Construction3, type Id, type LinExpr, type Positions3, type ScalarPin, type SolidKind, type SolidObj } from './types';
import { componentValue, distanceBetween, isAbsolute, mutualSides, resolveOperand } from './operands';
import { figureLineRels, figurePlaneLinePerps } from './freeLine';
import { add3, bisectorDir3, cross3, dist3, dot3, ringCollapsed3, ringOpenness3, runNormal, norm3, normalize3, scale3, sub3, v3, type Vec3 } from './vec3';

export interface GaugeParams {
  /** [tx, ty, tz, rx, ry, rz (axis-angle), logScale, ...dims] */
  x: number[];
  dimCount: number;
  mirror: boolean;
}

/** Rodrigues rotation of p by axis-angle w. */
function rotate(p: Vec3, w: Vec3): Vec3 {
  const th = norm3(w);
  if (th < 1e-12) return p;
  const k = scale3(w, 1 / th);
  const c = Math.cos(th);
  const s = Math.sin(th);
  return add3(add3(scale3(p, c), scale3(cross3(k, p), s)), scale3(k, dot3(k, p) * (1 - c)));
}

/** Apply mirror (y → −y, pre-transform) + similarity to a canonical point. */
export function applyGauge(p: Vec3, g: { t: Vec3; w: Vec3; s: number; mirror: boolean }): Vec3 {
  const q = g.mirror ? v3(p.x, -p.y, p.z) : p;
  return add3(scale3(rotate(q, g.w), g.s), g.t);
}

const unpack = (x: number[]) => ({ t: v3(x[0], x[1], x[2]), w: v3(x[3], x[4], x[5]), s: Math.exp(x[6]) });

/**
 * Solve min ‖r(x)‖² by Levenberg–Marquardt with a central-difference Jacobian.
 * Small n (≤ ~10), tiny residual functions — exactness comes from the quadratic
 * convergence near the solution, polished to ~1e-12.
 */
/** #863 (ADR-3D-304): the solver-volume counter — the perf canary for the anchored lanes. `solves` counts
 *  {@link leastSquares} calls, `evals` every residual evaluation they make (the Jacobian's included) and every
 *  one the anchored projected walk makes. Locks assert these by COUNT, never by clock. */
export const leastSquaresStats = { solves: 0, evals: 0 };

export function leastSquares(residuals0: (x: number[]) => number[], x0: number[], iterations = 120): { x: number[]; err: number } {
  leastSquaresStats.solves++;
  const residuals = (y: number[]): number[] => {
    leastSquaresStats.evals++;
    return residuals0(y);
  };
  let x = [...x0];
  let r = residuals(x);
  let err = r.reduce((s, v) => s + v * v, 0);
  let lambda = 1e-3;
  const n = x.length;
  // #520 (ADR-3D-210): the Jacobian and the normal equations are a function of x ALONE — λ enters only
  // through the damping added to the diagonal below. A REJECTED step leaves x untouched, so recomputing
  // them costs 2n residual evaluations to reproduce the same numbers. Any solve whose error floors above
  // the 1e-24 early exit — every anchored lane — ends by walking λ from ~1e-12 to the 1e12 bail, ten per
  // failure, and paid a full central-difference Jacobian for each rung. Cached here and invalidated only
  // where x actually moves, so the trajectory is identical and the tail costs one residual call a rung.
  let jac: { J: number[][]; JtJ: number[][]; Jtr: number[] } | null = null;

  for (let iter = 0; iter < iterations; iter++) {
    if (!jac) {
      // numeric Jacobian (central differences)
      const m = r.length;
      const J: number[][] = [];
      for (let j = 0; j < n; j++) {
        const h = 1e-6 * Math.max(1, Math.abs(x[j]));
        const xp = [...x];
        const xm = [...x];
        xp[j] += h;
        xm[j] -= h;
        const rp = residuals(xp);
        const rm = residuals(xm);
        J.push(rp.map((v, i) => (v - rm[i]) / (2 * h)));
      }
      // normal equations (JᵀJ + λ·diag) δ = −Jᵀr — the λ-free halves
      const JtJ: number[][] = [];
      const Jtr: number[] = [];
      for (let i = 0; i < n; i++) {
        JtJ.push([]);
        let bi = 0;
        for (let j = 0; j < n; j++) {
          let s = 0;
          for (let k = 0; k < m; k++) s += J[i][k] * J[j][k];
          JtJ[i].push(s);
        }
        for (let k = 0; k < m; k++) bi -= J[i][k] * r[k];
        Jtr.push(bi);
      }
      jac = { J, JtJ, Jtr };
    }
    // damping floor is ABSOLUTE: a noise-tiny diagonal (an invariant direction’s
    // cancellation residue, ~1e-20) must not be its own damping scale — λ·1e-20
    // admits ~1e10 steps along pure noise, blowing coordinates into catastrophic-
    // cancellation territory (the "numeric-Jacobian floor" class). Unknowns here
    // are O(1) (world units, radians, logScale), so a unit floor is sound.
    const A = jac.JtJ.map((row) => [...row]);
    for (let i = 0; i < n; i++) A[i][i] += lambda * Math.max(A[i][i], 1);
    const delta = solveLinear(A, [...jac.Jtr]);
    if (!delta) {
      lambda *= 10;
      if (lambda > 1e12) break; // singular at every damping — the same exhaustion, without the burn
      continue; // x is unchanged, so the cached Jacobian is still the Jacobian AT x
    }
    const xNew = x.map((v, i) => v + delta[i]);
    const rNew = residuals(xNew);
    const errNew = rNew.reduce((s, v) => s + v * v, 0);
    if (errNew < err) {
      x = xNew;
      r = rNew;
      err = errNew;
      jac = null; // x moved — the Jacobian must be recomputed there
      lambda = Math.max(lambda / 3, 1e-12);
      if (err < 1e-24) break;
    } else {
      lambda *= 10;
      if (lambda > 1e12) break;
    }
  }
  return { x, err };
}

/** Gaussian elimination with partial pivoting; null when singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(M[row][col]) > Math.abs(M[piv][col])) piv = row;
    if (Math.abs(M[piv][col]) < 1e-14) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k];
    x[i] = s / M[i][i];
  }
  return x;
}

/**
 * A stated MEMBERSHIP given (ADR-3D-033, M1): `X על מישור Y` about an EXISTING point
 * is a residual the pivot can DRIVE, not only a post-hoc check. The carrier is either
 * a fixed numeric equation plane (`plane`) or a POINT-RUN re-derived from the candidate
 * positions each evaluation (`run`) — a face plane rides the figure's free dims.
 * `frozen` carries the member's FINAL absolute position when it does not ride the
 * gauge (typed coords / a coord-sym point at its PINNED parameter value), so the
 * drive never reads a provisional symbol placement (the ADR-3D-030 poison).
 */
export interface MemberPin {
  id: Id;
  frozen?: Vec3;
  plane?: { n: Vec3; d: number };
  run?: Id[];
  /**
   * #801 (ADR-3D-174) — a carrier whose OWN NUMBERS are a function of a PIN SYMBOL this very solve is
   * choosing («x = (8,-1,-1) + t(k+1, 0, k-3)» while the pivot solves k). It cannot be lowered to fixed
   * coefficients beforehand: at every candidate k it is a different line, so the equation is evaluated
   * INSIDE the residual and the gauge, the dims and k are solved jointly — which is also the physics,
   * since an absolute line is exactly what pins a gauge the injections left free.
   */
  symLine?: { anchor: [LinExpr, LinExpr, LinExpr]; dir: [LinExpr, LinExpr, LinExpr]; sym: string };
  /** #801: the plane edition of `symLine` — the same equation-at-the-trial-value rule. */
  symPlane?: { cx: LinExpr; cy: LinExpr; cz: LinExpr; d: LinExpr; sym: string };
}

/** A LinExpr's value at a symbol value — solve3's copy of the evaluator's `linVal` (evaluate imports
 *  solve3, never the reverse, so the one-line formula is duplicated rather than the direction inverted). */
const linAt = (e: LinExpr, t: number): number => e.k + e.p * t;

export interface PivotResult {
  /** Canonical → absolute transform to apply to every position. */
  transform: (p: Vec3) => Vec3;
  mirror: boolean;
  dims: number[];
  /** V8-c — the jointly-solved values of the coupled symbols (in `coupled.syms` order). */
  symbols?: number[];
  /** #325 (ADR-3D-079) — the solved values of the pins' OPEN symbols (`B(2t,t,k)` → t, k). #902: plus
   *  every value-pinned one at its stated value, so the record is the whole namespace a reader asks. */
  pinSymbols?: Record<string, number>;
  /** #820 (ADR-3D-204) — the solved parameters of the free on-segment RIDERS a given drives. */
  riderTs?: Record<Id, number>;
  /** #990 (ADR-3D-248) — how many SHAPE dims the scalar pins jointly CONSUME at this solution: the numeric
   *  rank of the scalar residuals' response to a perturbation of each dim. Lazy and memoised — the cue is
   *  the only reader, so the residual evaluations happen on the display path, never on a submit. */
  scalarConsumed?: () => { dims: number; block: number };
  err: number;
  /** The solved parameter vector [t, w, logScale, dims…] — the warm-start vehicle: a
   *  later DRIVE (ADR-3D-033) perturbs the pinned figure from here, so it lands in the
   *  same basin (branch choices preserved) instead of gambling on the rotation starts. */
  x: number[];
}

/**
 * #1815 (ADR-3D-309) / #1849 (ADR-3D-310) — why a pool came back EMPTY when the empty answer is a
 * collapsed declared polygon: the flat ring every solution flattened, the carrier keys of the enrolled
 * riders, and WHICH givens forced it. `forced: false` — an incidence on a rider invented the flatness
 * (the givens without those incidences leave the ring open), so the rider statements are named.
 * `forced: true` — the other givens force it on their own («AB = 5 · BC = 3 · AC = 8», a stated
 * coincidence), so those are named. Either way it is refused: a flat figure is not a triangle (operator
 * ruling 2026-10-07, ADR-W-115). The store names the statements (never internal state); a plain
 * contradiction carries no record.
 */
export interface InventedCollapse3 {
  ring: Id[];
  riderKeys: string[];
  forced: boolean;
}
/** A solve's pool — the solutions, plus the #1815/#1849 record when it is empty because of a collapse. */
export type PivotPool = PivotResult[] & { readonly collapse?: InventedCollapse3 };

/**
 * Solve the pivot: find gauge (+ dims) such that every pin lands on its target.
 * `evalCanonical(dims)` re-derives the canonical positions for a dim vector.
 * Returns every converged solution (both mirrors when both converge).
 */
/**
 * Is the figure's SCALE pinned — does ANY given carry absolute units?
 *
 * The gauge (place/rotate/scale) is pure null-space unless something fixes it. This predicate answers
 * the SOLVER's question: {@link solvePivot} freezes the gauge when nothing pins it, or the solve falls
 * into the scale→0 collapse basin (every normalized residual vanishes as the figure shrinks onto a
 * point). #517: the KNOWLEDGE question — "may the data panel / query lane print a derived magnitude?"
 * — is `scaleKnown3` in evaluate.ts, which composes this predicate with the absolute-point count
 * (bare coordinate points state distances but never enter the pivot's residuals, so they must count
 * there and must NOT unfreeze the gauge here). With a free scale a length is gauge, not knowledge —
 * the first dim of every solid is frozen at 1, so a bare cube would otherwise report |AB| = 1 as data
 * (ADR-3D-054, issue #268; the ADR-052 cardinal sin).
 *
 * Absolute ⇒ pins the gauge: coordinate/vector/pair injections, a plane EQUATION, a `length` or `dot`
 * scalar pin. Everything else (angles, cos/dot EQUALITIES, ratios, ⟂/∥-to-plane, line-plane angle) is
 * similarity-INVARIANT and leaves the scale free. Keeping ONE list is the point: a new pin kind that
 * carries units must be added here, or the two consumers would drift apart.
 */
/**
 * Does this scalar pin fix the figure's SCALE, or is it similarity-INVARIANT (true of the figure and
 * of every rescaling of it)?
 *
 * A `Record` over the union, so TypeScript requires an entry for every kind: adding a `ScalarPin`
 * without classifying it here is a COMPILE ERROR. It used to be an exclusion list — `every(p => p.kind
 * === 'vangle' || …)` — which meant an unlisted kind silently defaulted to "pins the scale". S4's
 * scale-free `mutual` pin fell straight into it: `AB מקביל ל-DC` on a free quad made `scalePinned`
 * true, and the data panel began printing `AB = 1`, a number that is pure gauge (a figure's first dim
 * is the frozen unit) and that the student was never given. The COMMAND_SAVEABLE lesson (#288): a
 * hand-maintained list drifts; a total function over the union cannot.
 */
const PIN_FIXES_SCALE: Record<ScalarPin['kind'], boolean> = {
  length: true, // |DC| = 4 — an absolute size
  dot: true, // u·v = 24 scales as s², so it fixes s
  'length-rel': false, // a RATIO of lengths
  'vec-eq': false, // #1183: both sides scale together — a vector equation pins no size
  vangle: false,
  'seg-angle': false, // #909: an angle is similarity-INVARIANT — it must not fix the scale
  'seg-perp-plane': false,
  'seg-par-plane': false,
  'cos-angle': false, // V8-f: cosines and equal dot products are similarity-invariant
  'dot-eq': false,
  'cos-eq': false,
  'bisector-dir': false, // #872: a pure DIRECTION — similarity-invariant, pins no size
  concyclic: false, // #305
  'line-plane-angle': false, // sin β is length-normalized
  mutual: false, // S4 (#378): every residual is normalized by the operand magnitudes
  'plane-rel': false, // S3 (#378): angles between characteristic vectors; the offset is size-normalized
  distance: true, // S5 (#378): a distance is an absolute size — it fixes the scale
  'mag-rel': false, // #393/#335: a RATIO of expression magnitudes — both sides scale together
  'mag-val': true, // #393/#335: |expr| = value is an absolute size, like `length`/`distance`
  volume3: true, // #1447: an absolute size (scales as s³)
  area3: true, // #1447: an absolute size (scales as s²)
};

export function scalePinned(c: Construction3): boolean {
  if (c.pins.length > 0 || c.vectorPins.length > 0 || c.pairPins.length > 0 || c.planePins.length > 0) return true;
  return c.scalarPins.some((p) => PIN_FIXES_SCALE[p.kind]);
}

/**
 * #872 — the FLAT kinds: coplanar by definition, so the volume gate must never judge them.
 * `polygon3/4/5` are V8-g's 2-D vector lane, modelled as "solids" to reuse the dims sampler.
 */
const FLAT_SOLID_KINDS: ReadonlySet<SolidKind> = new Set<SolidKind>(['polygon3', 'polygon4', 'polygon5']);

/**
 * #872 — how far the vertices stray from ONE plane, in absolute units.
 *
 * The plane is built from the widest vertex pair and the vertex furthest off that line — the most
 * numerically stable triple the point set offers. Returns 0 when no such triple exists (all points
 * collinear), which the caller reads as flat; the coincident-vertex arm above has already claimed
 * the all-points-equal case.
 */
function offPlaneSpread(pts: Vec3[]): number {
  let ai = 0, bi = 1, span = -1;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const d = norm3(sub3(pts[j], pts[i]));
      if (d > span) { span = d; ai = i; bi = j; }
    }
  if (span <= 1e-12) return 0;
  const A = pts[ai];
  const u = scale3(sub3(pts[bi], A), 1 / span);
  // the vertex furthest from line A+u completes the plane
  let ci = -1, far = -1;
  for (let k = 0; k < pts.length; k++) {
    const w = sub3(pts[k], A);
    const off = norm3(sub3(w, scale3(u, dot3(w, u))));
    if (off > far) { far = off; ci = k; }
  }
  if (ci < 0 || far <= 1e-12) return 0; // collinear — no plane, and flatter than flat
  const n = cross3(u, sub3(pts[ci], A));
  const nn = norm3(n);
  if (nn <= 1e-12) return 0;
  let worst = 0;
  for (const p of pts) worst = Math.max(worst, Math.abs(dot3(sub3(p, A), n)) / nn);
  return worst;
}

/**
 * #990 — the numeric RANK of a matrix given as columns (each column one shape dim's response, each row one
 * scalar residual): Gaussian elimination with partial pivoting, pivots judged against a RELATIVE threshold
 * (1e-7 of the largest entry) so the answer is scale-free — a residual that is zero for every dim contributes
 * no rank, two residuals that move together contribute one. Exported for the unit lock.
 */
export function numericRank(cols: number[][], floor = 1e-6): number {
  const nCols = cols.length;
  const nRows = nCols > 0 ? cols[0].length : 0;
  if (nRows === 0 || nCols === 0) return 0;
  const m: number[][] = Array.from({ length: nRows }, (_, i) => cols.map((col) => col[i]));
  let scale = 0;
  for (const row of m) for (const v of row) scale = Math.max(scale, Math.abs(v));
  if (!(scale > floor) || !Number.isFinite(scale)) return 0;
  // `floor`: a response below it is round-off, not a constraint — a residual that holds BY CONSTRUCTION
  // (a kite corner's reflection, a parallelogram point's ∥) differs from zero by ~1e-16 and, divided by
  // the step, would otherwise pass a purely relative test when EVERY entry is noise (the kite read a
  // different rank at every seed). Residuals are O(1) quantities (cosines, length differences in figure
  // units), so a genuine derivative is O(1) and 1e-6 sits five decades under it and five above the noise.
  const tol = Math.max(1e-7 * scale, floor);
  let rank = 0;
  const used = new Array<boolean>(nRows).fill(false);
  for (let col = 0; col < nCols; col++) {
    let piv = -1;
    let best = tol;
    for (let r = 0; r < nRows; r++) if (!used[r] && Math.abs(m[r][col]) > best) { best = Math.abs(m[r][col]); piv = r; }
    if (piv < 0) continue;
    used[piv] = true;
    rank++;
    for (let r = 0; r < nRows; r++) {
      if (r === piv || Math.abs(m[r][col]) <= tol) continue;
      const k = m[r][col] / m[piv][col];
      for (let cc = col; cc < nCols; cc++) m[r][cc] -= k * m[piv][cc];
    }
  }
  return rank;
}

export function solvePivot(
  c: Construction3,
  evalCanonical: (dims: number[], symbolOverride?: Map<string, number>, riderTs?: ReadonlyMap<Id, number>) => Positions3,
  dims0: number[],
  seed: number,
  coupled?: { syms: string[]; pins: Construction3['symbolPins'] },
  members?: MemberPin[],
  warmStart?: number[],
  /** #375: the figure's resolved lines. An absolute line is not a gauge object, so a residual that
   *  relates it to a figure-derived plane needs it verbatim; passing it in keeps solve3 free of any
   *  import from evaluate (which imports solve3). */
  lines?: Map<string, { anchor: Vec3; dir: Vec3 }>,
  /**
   * #803 (ADR-3D-180) — the TRANSLATION-SLIDE probe. Instead of solving, take an already-exact
   * solution `x` (under THIS call's full residual set) and try to move its translation by a seeded
   * step along a seeded direction while every residual stays exact — the #518 park / #797 walk
   * pattern on the gauge's translation. Returns the slid solution when the placement had that
   * freedom, `[]` when translation is pinned (the walk snaps back) or `x` is not exact.
   */
  probe?: { x: number[]; mirror: boolean; flip?: boolean },
): PivotPool {
  const pointPins = c.pins;
  const vecPins = c.vectorPins;
  const memberPins = members ?? [];
  // S2 (#378, ADR-3D-103): the GAUGE-lane line relations — a segment/vector/point-run-plane operand
  // against an absolute named line. Absolute-lane entries (line×line, line×π) never involve the
  // figure, so they contribute nothing here (they live in the parameter root-find / claim lanes).
  // #552: an entry whose LINE is FREE pins the line (`resolveFreeLine`), never the figure — the
  // figure-side sets are the filtered ones, here and in every gate below.
  const gaugeLineRels = figureLineRels(c).filter((r) => !isAbsolute(r.op));
  const figPlanePerps = figurePlaneLinePerps(c);
  if (
    pointPins.length === 0 && vecPins.length === 0 && c.pairPins.length === 0 && c.scalarPins.length === 0 &&
    c.planePins.length === 0 && memberPins.length === 0 && c.coordPlanePins.length === 0 &&
    figPlanePerps.length === 0 && gaugeLineRels.length === 0
  )
    return [];

  // V8-c: a symbol coupled to a solid dim (`DF = t·… ⟂ plane` where the plane's height
  // is a free dim) becomes an EXTRA pivot unknown, appended after the dims; its ⟂/∥
  // condition is a residual — so t and the dim are solved JOINTLY (the D3 numeric-only
  // path, no CAS). nSym = 0 ⇒ every code path below is bit-identical to before.
  const nDims = dims0.length;
  const nSym = coupled?.syms.length ?? 0;

  // #325 (ADR-3D-079): the pins' OPEN symbols (`B(2t,t,k)` → t, k) are pivot unknowns too,
  // appended AFTER the coupled symbols. Unknown layout: [gauge 7 | dims | coupled | pinSyms].
  // #794 (ADR-3D-168): vector and pair pins carry the same component grammar as point pins, so their
  // open symbols are pivot unknowns by the same collection. #815: and so is a letter carried only by an
  // EQUATION under a stated membership — ONE derivation (`pinSymsOf`), so the unknown layout can never
  // be one symbol short of the namespace the rest of the engine reasons about.
  // #902 (ADR-3D-219): a value-pinned symbol («p = 3») is a NUMBER, not an unknown — substituted at
  // every read (`symAt`) and reported in `pinSymbols` at its stated value, but it holds no slot: the
  // unknown layout, the start spread, the seed anchors and the continuation walk range over the OPEN
  // symbols only, from the one derivation the DOF count uses (`openPinSymsOf`).
  const pinSymsAll: string[] = pinSymsOf(c);
  const pinnedSyms = new Map<string, number>();
  for (const sym of pinSymsAll) {
    const v = symbolValueOf(c, sym);
    if (v !== undefined) pinnedSyms.set(sym, v);
  }
  const pinSyms: string[] = openPinSymsOf(c);
  const nPinSym = pinSyms.length;
  /** A pin symbol's value at the trial unknowns: its stated value, or its slot; null for a stranger. */
  const symAt = (x: number[], sym: string): number | null => {
    const pinned = pinnedSyms.get(sym);
    if (pinned !== undefined) return pinned;
    const i = pinSyms.indexOf(sym);
    return i < 0 ? null : x[7 + nDims + nSym + i];
  };
  /** The solved symbol record: every pin symbol, the open ones at their slot, the pinned at their value. */
  const pinSymbolsAt = (x: number[]): Record<string, number> | undefined =>
    pinSymsAll.length > 0 ? Object.fromEntries(pinSymsAll.map((sym) => [sym, symAt(x, sym) ?? NaN])) : undefined;
  /**
   * #820 (ADR-3D-204) — A FREE RIDER'S PARAMETER IS A PIVOT UNKNOWN, NOT A SAMPLE.
   *
   * «K על SB» gives K one free DOF. Every stated given that names K was VERIFIED against whatever `t`
   * the sampler happened to pick, so «SD מקביל למישור ACK» — satisfiable at t = ½, and reachable by
   * the plane-first spelling the engine already had — came back `givens-contradict`, accusing the
   * student's own statements. The answer must not depend on WHICH side of a relation holds the free
   * DOF (docs/17 M2: a given re-homes the obligations of the DOF it constrains); the free plane got
   * this in #487 and the rider never did.
   *
   * So the lane: unknowns are `[gauge 7 | dims | coupled | pinSyms | riderTs]`. Membership is
   * MEASURED, not enumerated — a rider joins only when moving it actually changes a residual (the
   * probe below), so a figure whose riders no constraint mentions solves bit-identically to before.
   * Each included rider keeps a soft anchor at its seed sample, so an UNDER-determined rider still
   * varies with the seed instead of parking on a default (ADR-052), and a solution that slid the
   * rider off its host segment is not a figure at all (`degenerate`).
   */
  const riderBase = 7 + nDims + nSym + nPinSym;
  // #985 (ADR-3D-244): a `scaled-offset` corner's FREE ratio rides the same lane — the trapezoid's
  // unstated ratio is a DOF a later given can drive. Each rider carries its own HOST bounds: a segment
  // rider lives in [0, 1]; a ratio is any positive number (k > 1 is a trapezoid whose far side is the
  // longer one, a legitimate figure), and only k ≤ 0 — the corner collapsed onto its anchor or dragged
  // across the ring — is not a figure at all.
  //
  // #1311 (ADR-3D-260): a never-positioned (`free3`) point's three COORDINATES ride the same lane — the
  // student never stated where the point is, so a given that names it («אורך AB = 5» on a free vector)
  // must move it, not be judged against the sampler's guess (the #820 argument, one carrier over). Each
  // coordinate is an unbounded lane entry keyed by `freeCoordKey`, anchored at its canonical SAMPLE (so
  // what the given leaves free still varies with the seed, ADR-052) and started there — `spread: false`:
  // a rider's root sits anywhere on its host, but a coordinate has no host to spread across. Membership
  // is the same measured probe below, so a free point no residual reads solves exactly as before.
  //
  // #1498: the candidates come from the ONE carrier table (`carrierParams3`) — the same enumeration
  // `freeDofCount3` counts, so a sampled carrier the count knows can no longer be missing from the
  // lane (the drift that left «נקודה E במישור ABC»'s two in-plane parameters unknowable). A `zero`-
  // anchored parameter is an OFFSET from the sampled seat (placement adds it there), so an undriven
  // figure stays byte-identical; `bis-dist` is the rider's sampled distance from its ray's apex.
  let riders: { id: string; t0: number; lo: number; hi: number; spread: boolean }[] = [];
  /** #1415 — the rider indices that belong to a BLOCK-ENROLLED point (`free3`/`partial`): their
   *  coordinates are counted as free by the cue whether or not a residual drove them, so the
   *  scalar-consumption rank probe must measure over them too (the refinement ADR-3D-204's note
   *  reserved for this issue). Riders of other kinds are riderTs-subtracted by the cue already —
   *  probing them here would double-subtract. */
  const blockRiderIdx = new Set<number>();
  {
    let sampledPos: Positions3 | null = null;
    const sampledAt = (): Positions3 => (sampledPos ??= evalCanonical(dims0));
    for (const [id, def] of c.points) {
      const blockEnrolled = def.kind === 'free3' || def.kind === 'partial';
      for (const cp of carrierParams3(c, id, def)) {
        if (!cp.drivable) continue;
        let t0: number | null = null;
        if (cp.t0 === 'seg' && def.kind === 'on-segment') t0 = riderSampleT(seed, id, def.a, def.b);
        else if (cp.t0 === 'offset') t0 = offsetSampleK(seed, id);
        else if (cp.t0 === 'zero') t0 = 0;
        else if (cp.t0 === 'bis-dist' && def.kind === 'bisector-ray') {
          const p = sampledAt().get(id);
          const o = sampledAt().get(def.apex);
          t0 = p && o ? dist3(p, o) : null;
        } else if (cp.t0 === 'coord-x' || cp.t0 === 'coord-y' || cp.t0 === 'coord-z') {
          const p = sampledAt().get(id);
          t0 = p ? p[cp.t0.slice(-1) as 'x' | 'y' | 'z'] : null;
        }
        if (t0 !== null) {
          riders.push({ id: cp.key, t0, lo: cp.lo, hi: cp.hi, spread: cp.spread });
          if (blockEnrolled) blockRiderIdx.add(riders.length - 1); // #1415
        }
      }
    }
  }
  /** The trial rider parameters at `x` — `undefined` when the lane is empty (every path stays bit-identical). */
  const riderMap = (x: number[]): ReadonlyMap<Id, number> | undefined =>
    riders.length === 0 ? undefined : new Map(riders.map((r, i) => [r.id, x[riderBase + i]]));
  /** A pin component's target value at the trial unknowns (null = unconstrained). */
  const compTarget = (comp: number | null | import('./types').SymComp, x: number[]): number | null => {
    if (comp === null) return null;
    if (typeof comp === 'number') return comp;
    // #509: Σ kᵢ·symᵢ + c — the affine form's ONE evaluation, so a component naming several symbols
    // («C(p+q,1,0)») targets the same residual a single-symbol one does.
    return evalAffine(comp, (sym) => symAt(x, sym) ?? NaN);
  };
  // #325 (ADR-3D-079 Am. 2): an UNDETERMINED pin symbol must VARY with the seed (ADR-052 —
  // a value the sampler never explores is a default masquerading as determined; the params
  // panel would print an invented `t = 6/5`). Each open symbol gets a SEED-DEPENDENT soft
  // anchor (the dims0 mechanism), sign-aware so a stated «t חיובי» parks on the stated side;
  // a genuinely determining given overrides the 1e-4 pull exactly like it overrides dims0.
  const symAnchorTargets = pinSyms.map((sym, i) => {
    const frac = (Math.abs(Math.sin((seed + 1) * 12.9898 + (i + 1) * 78.233)) * 43758.5453) % 1;
    const raw = -1.6 + 3.2 * frac;
    const sgn = c.paramSigns.find((ps) => ps.sym === sym);
    if (!sgn) return raw;
    return sgn.positive ? 0.4 + Math.abs(raw) : -(0.4 + Math.abs(raw));
  });

  // When EVERY pin is similarity-INVARIANT (angles, ⟂/∥-to-plane — no coordinate,
  // length or dot given anywhere), the gauge is pure null-space: solving it invites
  // the scale→0 collapse basin (all normalized residuals vanish as the figure shrinks
  // onto a point). Freeze the gauge to identity and solve the shape dims ONLY.
  const invariantOnly =
    nSym === 0 &&
    nPinSym === 0 &&
    // #324: a coordinate-plane relation is ABSOLUTE-frame (it must be able to rotate the
    // figure) — never solvable with the gauge frozen
    c.coordPlanePins.length === 0 &&
    // #375: same reason — one operand is figure-derived and the other is an absolute line, so
    // satisfying it ROTATES the figure. Frozen to identity, the residual could never reach zero.
    figPlanePerps.length === 0 &&
    // S2 (#378): a gauge-lane line relation is the same absolute-frame class
    gaugeLineRels.length === 0 &&
    // an all-gauge run-carrier membership is similarity-invariant (extent-normalized);
    // a frozen member or a fixed equation plane pins the gauge instead
    memberPins.every((m) => !m.frozen && !m.plane && !m.symLine && !m.symPlane) && // #801: a pin-symbol carrier is absolute
    !scalePinned(c);

  // ADR-3D-030: ids whose in-solve placement is provisional (symbol-defined points —
  // their symbol is root-found post-pivot); plane-pin residuals skip them.
  const symbolTainted = new Set(c.vecDefs.filter((vd) => vd.symbol).map((vd) => vd.unknown));

  /** #990: the index range the scalar pins' rows occupy in the residual vector — recorded by every
   *  evaluation, so the rank probe below reads exactly the rows those pins wrote. */
  let scalarRows: [number, number] = [0, 0];
  /**
   * #990 ([ADR-3D-248](../../docs/06b-decisions-3d.md#adr-3d-247)) — MEASURE what the scalar pins consume.
   * `− scalarPins.length` subtracted one shape dim per pin unconditionally — a count that infers what the
   * solver did instead of reading it (the #820 / ADR-3D-204 shape). In `quad-shape`'s one-unknown arm the
   * corner's construction already encodes the family relation, so some lowered pins hold BY CONSTRUCTION and
   * consume nothing; the declaration arm's pins genuinely consume dims. Arithmetic cannot know which. The
   * probe can: at the solution, nudge each shape dim by a relative ε (central difference), collect every
   * scalar residual's response, and take the numeric RANK of that matrix — the number of independent
   * constraints the pins place on the dims. A pin whose residual is zero for every dim (held by
   * construction) contributes no row; two pins that move together (a rectangle's second and third right
   * angles) contribute one. Lazy + memoised: display-path only.
   */
  const scalarConsumedAt = (x: number[], mirror: boolean): (() => { dims: number; block: number }) => {
    let memo: { dims: number; block: number } | null = null;
    return () => {
      if (memo !== null) return memo;
      // #1415: the probe measures over the shape dims AND the block-enrolled free-point
      // coordinates («אורך AB = 5» on a free vector consumes ONE of the six) — but the two are
      // REPORTED APART: `dims` is the rank over the shape dims alone (the #990 number, unchanged),
      // and `block` is the MARGINAL rank the block coordinates add. The cue subtracts each from
      // the term that counts it; folding them into one number let an over-pinned deficit eat an
      // unrelated rider's genuine freedom (the #820 lock caught it).
      const dimIdx = Array.from({ length: nDims }, (_, j) => 7 + j);
      const blockIdx = [...blockRiderIdx].map((i) => riderBase + i);
      if (c.scalarPins.length === 0 || dimIdx.length + blockIdx.length === 0) return (memo = { dims: 0, block: 0 });
      const f = residualsFor(mirror);
      f(x); // records the scalar row range for THIS residual layout
      const [s, e] = scalarRows;
      if (e <= s) return (memo = { dims: 0, block: 0 });
      const colAt = (at: number): number[] => {
        const h = 1e-4 * Math.max(1, Math.abs(x[at])); // central difference: O(h²) error, round-off/h ≈ 1e-12
        const xp = [...x];
        xp[at] += h;
        const xm = [...x];
        xm[at] -= h;
        const rp = f(xp).slice(s, e);
        const rm = f(xm).slice(s, e);
        return rp.map((v, i) => (v - rm[i]) / (2 * h));
      };
      const dimCols = dimIdx.map(colAt);
      const rankDims = dimCols.length ? numericRank(dimCols) : 0;
      const allCols = [...dimCols, ...blockIdx.map(colAt)];
      const rankAll = blockIdx.length ? numericRank(allCols) : rankDims;
      return (memo = { dims: rankDims, block: Math.max(0, rankAll - rankDims) });
    };
  };
  const residualsFor = (mirror: boolean) => (x: number[]): number[] => {
    const g = { ...unpack(x), mirror };
    const dims = x.slice(7, 7 + nDims);
    const override = coupled ? new Map(coupled.syms.map((s, i) => [s, x[7 + nDims + i]])) : undefined;
    const pos = evalCanonical(dims, override, riderMap(x));
    /**
     * #1498 — THE frame accessor for every residual: a point is read in the frame the DRAWN figure
     * will put it in (`gaugeFramePoint3`, the final placement's own rule). Every residual family
     * below used `applyGauge` unconditionally, so any pin relating a gauge-frame point to a Lane-A
     * absolute one (a typed coordinate, an equation-plane rider) compared two different frames — the
     * residual could never reach zero, and the pivot refused the student's true given.
     */
    const laneAt = (id: Id): Vec3 | null => {
      const p = pos.get(id);
      if (!p) return null;
      return gaugeFramePoint3(c, c.points.get(id)) ? applyGauge(p, g) : p;
    };
    const out: number[] = [];
    for (const pin of pointPins) {
      const q = laneAt(pin.id);
      if (!q) {
        out.push(10, 10, 10);
        continue;
      }
      // #325: a symbolic component's target is evaluated at the trial pin-symbol values
      const tx = compTarget(pin.x, x);
      const ty = compTarget(pin.y, x);
      const tz = compTarget(pin.z, x);
      if (tx !== null) out.push(q.x - tx);
      if (ty !== null) out.push(q.y - ty);
      if (tz !== null) out.push(q.z - tz);
    }
    for (const pin of vecPins) {
      const def = c.vectors.get(pin.name);
      const a = def && laneAt(def.from);
      const b = def && laneAt(def.to);
      if (!a || !b) {
        out.push(10, 10, 10);
        continue;
      }
      // a vector transforms without the translation; each endpoint in its own lane's frame (#1498)
      const w = sub3(b, a);
      // #794: a component's target may be symbolic (evaluated at the trial pin-symbol
      // values) or null (a placeholder letter — unconstrained), exactly as point pins.
      const tx = compTarget(pin.x, x);
      const ty = compTarget(pin.y, x);
      const tz = compTarget(pin.z, x);
      if (tx !== null) out.push(w.x - tx);
      if (ty !== null) out.push(w.y - ty);
      if (tz !== null) out.push(w.z - tz);
    }
    for (const pin of c.pairPins) {
      const a = laneAt(pin.a);
      const b = laneAt(pin.b);
      if (!a || !b) {
        out.push(10, 10, 10);
        continue;
      }
      const w = sub3(b, a);
      const tx = compTarget(pin.x, x);
      const ty = compTarget(pin.y, x);
      const tz = compTarget(pin.z, x);
      if (tx !== null) out.push(w.x - tx);
      if (ty !== null) out.push(w.y - ty);
      if (tz !== null) out.push(w.z - tz);
    }
    // plane-equation givens (ADR-3D-030): each named point lies on cx·x+cy·y+cz·z+d = 0,
    // normalized by |n| so the residual is O(1) in coordinate units. A point the pivot
    // cannot TRUST is SKIPPED: unplaced ids, and symbol-defined points — they sit at a
    // PROVISIONAL symbol value during the solve (the root-find runs post-pivot), so
    // their residual would poison it. The recorded claim verifies every named point on
    // the final figure, so nothing escapes checking (worst case is a failed drive,
    // never a silently wrong figure). A point that is ABSOLUTE (typed coords / an
    // equation-plane rider) does not ride the gauge — the final placement pass's rule.
    for (const pin of c.planePins) {
      const nn = Math.max(Math.hypot(pin.cx, pin.cy, pin.cz), 1e-12);
      for (const id of pin.ids) {
        if (symbolTainted.has(id)) continue;
        // #1498: the ONE lane rule (`laneAt`) — this site's inline `coord || on-plane-off-run`
        // approximation treated every other Lane-A kind as gauge-frame.
        const q = laneAt(id);
        if (!q) continue;
        out.push((q.x * pin.cx + q.y * pin.cy + q.z * pin.cz + pin.d) / nn);
      }
    }
    // scalar givens (V7 T2): lengths / vertex angles / dot products / seg-⟂/∥-plane — all through
    // the one frame accessor (#1498).
    const at = laneAt;
    // #324 (ADR-3D-079): a ring's relation to a COORDINATE plane/axis. Absolute-frame
    // residuals (like injections). `share`/`perp` are normalized by the ring's extent /
    // the normal's length so shrinking the figure can never zero them "for free" (the
    // collapse-basin class); `zero` is a genuine absolute placement of a coordinate.
    for (const pin of c.coordPlanePins) {
      const pts = pin.ids.map(at);
      if (pts.some((p) => !p)) {
        out.push(10);
        continue;
      }
      const ring = pts as Vec3[];
      let extent = 0;
      for (let i = 1; i < ring.length; i++) extent = Math.max(extent, dist3(ring[i], ring[0]));
      const ext = Math.max(extent, 1e-9);
      if (pin.mode === 'share') {
        for (let i = 1; i < ring.length; i++) out.push((ring[i][pin.axis] - ring[0][pin.axis]) / ext);
      } else if (pin.mode === 'zero') {
        for (const p of ring) out.push(p[pin.axis] / ext);
      } else {
        const n = runNormal(ring);
        const nn = Math.max(norm3(n), 1e-12);
        out.push(n[pin.axis] / nn);
        if (pin.mode === 'contains') out.push(dot3(n, ring[0]) / (nn * ext));
      }
    }
    // #375: a POINT-RUN plane stated ⟂ a named LINE. The plane rides the figure (its normal is
    // recomputed from the candidate positions) while the line does NOT — it is absolute — so the
    // residual is what rotates the figure into place. Normalized by both magnitudes: a direction
    // vector's scale is arbitrary and a shrinking figure must not zero it for free (the
    // collapse-basin class, ADR-3D-079).
    for (const pin of figPlanePerps) {
      const pts = pin.ids.map(at);
      const ln = lines?.get(pin.line);
      if (pts.some((p) => !p) || !ln) {
        out.push(10);
        continue;
      }
      const n = runNormal(pts as Vec3[]);
      const nn = norm3(n);
      const dn = norm3(ln.dir);
      if (nn < 1e-12 || dn < 1e-12) {
        out.push(10);
        continue;
      }
      // plane ⟂ line ⟺ the plane's normal is PARALLEL to the direction ⟺ their cross vanishes
      const x = cross3(n, ln.dir);
      out.push(x.x / (nn * dn), x.y / (nn * dn), x.z / (nn * dn));
    }
    // S2 (#378, ADR-3D-103): a GAUGE operand related to an absolute named LINE — ∥ / ⟂ / angle.
    // The operand re-resolves from the CANDIDATE positions through the one operand seam
    // (engine/operands.ts) while the line is fixed, so satisfying the relation rotates the
    // figure (the planeLinePerps pattern). Every residual is normalized by both magnitudes —
    // scale-free, so a shrinking figure can never zero it (the collapse-basin class). A line
    // that only resolves post-pivot (a through-line) contributes nothing: the recorded claim
    // still verifies it on the final figure, so nothing escapes checking.
    for (const pin of gaugeLineRels) {
      const ln = lines?.get(pin.line);
      if (!ln) continue;
      const directional = pin.op.kind !== 'plane-run';
      const wide = directional ? pin.rel === 'parallel' : pin.rel === 'perp'; // full alignment: 3 cross components
      const geom = resolveOperand(pin.op, c, { lines: lines ?? new Map(), planes: new Map() })(at);
      const d = geom ? (directional ? geom.dir : geom.normal) : undefined;
      const dn2 = norm3(ln.dir);
      if (!d || norm3(d) < 1e-12 || dn2 < 1e-12) {
        for (let i = 0; i < (wide ? 3 : 1); i++) out.push(10);
        continue;
      }
      const den = norm3(d) * dn2;
      if (wide) {
        // seg/vec ∥ line (dirs aligned) · plane-run ⟂ line (normal aligned): the cross vanishes
        const x = cross3(d, ln.dir);
        out.push(x.x / den, x.y / den, x.z / den);
      } else if (pin.rel === 'perp') {
        out.push(dot3(d, ln.dir) / den); // seg/vec ⟂ line
      } else if (pin.rel === 'parallel') {
        out.push(dot3(d, ln.dir) / den); // line ∥ plane ⟺ the line's dir ⟂ the plane's normal
      } else {
        // a stated angle: between lines |cos| = cos(deg); between a line and a plane sin β = |cos(n,dir)|
        const target = ((pin.deg ?? 0) * Math.PI) / 180;
        out.push(Math.abs(dot3(d, ln.dir)) / den - (directional ? Math.cos(target) : Math.sin(target)));
      }
    }

    // V8-f: a VecAtom operand → its (gauge-transformed) direction
    const dirOf = (atom: import('./types').VecAtom): Vec3 | null => {
      if (atom.kind === 'named') {
        const d = c.vectors.get(atom.name);
        if (!d) return null;
        const a = at(d.from);
        const b = at(d.to);
        return a && b ? sub3(b, a) : null;
      }
      const a = at(atom.from);
      const b = at(atom.to);
      return a && b ? sub3(b, a) : null;
    };
    const cosOf = (u: Vec3, v: Vec3) => dot3(u, v) / Math.max(norm3(u) * norm3(v), 1e-12);
    // #393/#335 (ADR-3D-107): Σ coeff·atom at the trial positions — evalExpr's in-solve twin
    const exprAt = (expr: import('./types').VecExpr): Vec3 | null => {
      let acc: Vec3 = { x: 0, y: 0, z: 0 };
      for (const { coeff, atom } of expr) {
        const w = dirOf(atom);
        if (!w) return null;
        acc = { x: acc.x + coeff * w.x, y: acc.y + coeff * w.y, z: acc.z + coeff * w.z };
      }
      return acc;
    };
    const scalarStart = out.length; // #990: the scalar pins' rows begin here
    for (const pin of c.scalarPins) {
      if (pin.kind === 'length') {
        const a = at(pin.a);
        const b = at(pin.b);
        out.push(a && b ? norm3(sub3(b, a)) - pin.value : 10);
      } else if (pin.kind === 'vangle') {
        const vtx = at(pin.vertex);
        const p = at(pin.p);
        const q = at(pin.q);
        if (!vtx || !p || !q) {
          out.push(10);
          continue;
        }
        const d1 = sub3(p, vtx);
        const d2 = sub3(q, vtx);
        const den = Math.max(norm3(d1) * norm3(d2), 1e-12);
        out.push(dot3(d1, d2) / den - Math.cos((pin.deg * Math.PI) / 180));
      } else if (pin.kind === 'seg-angle') {
        // #909 — the two-segment angle. |cos| (not the signed cos `vangle` uses above): the two
        // segments are independent, so which endpoint each was written from is arbitrary, and a
        // signed target would make «BC'» and «C'B» state different things. |cos| is exactly what
        // `verifyClaim`/`angle-seg-eq` measures. The kink at |cos| = 0 is harmless: LM minimises the
        // SQUARE of this residual, and cos(deg) = 0 (a 90° given) sits at that square's smooth floor.
        const a1 = at(pin.a1);
        const b1 = at(pin.b1);
        const a2 = at(pin.a2);
        const b2 = at(pin.b2);
        if (!a1 || !b1 || !a2 || !b2) {
          out.push(10);
          continue;
        }
        const u = sub3(b1, a1);
        const w = sub3(b2, a2);
        const den = Math.max(norm3(u) * norm3(w), 1e-12);
        out.push(Math.abs(dot3(u, w)) / den - Math.cos((pin.deg * Math.PI) / 180));
      } else if (pin.kind === 'dot') {
        const d1v = c.vectors.get(pin.v1);
        const d2v = c.vectors.get(pin.v2);
        const a1 = d1v && at(d1v.from);
        const b1 = d1v && at(d1v.to);
        const a2 = d2v && at(d2v.from);
        const b2 = d2v && at(d2v.to);
        out.push(a1 && b1 && a2 && b2 ? dot3(sub3(b1, a1), sub3(b2, a2)) - pin.value : 10);
      } else if (pin.kind === 'length-rel') {
        const a1 = at(pin.a1);
        const b1 = at(pin.b1);
        const a2 = at(pin.a2);
        const b2 = at(pin.b2);
        out.push(a1 && b1 && a2 && b2 ? norm3(sub3(b1, a1)) - pin.c * norm3(sub3(b2, a2)) : 10);
      } else if (pin.kind === 'vec-eq') {
        // #1183: a VECTOR equation drives — three SIGNED component residuals, so the descent crosses
        // zero instead of touching it (the ADR-3D-006 lesson `concyclic` records below). `exprAt`
        // already evaluates a `VecExpr`, so a named vector and a point pair reach this by one path.
        const l = exprAt(pin.lhs);
        const r = exprAt(pin.rhs);
        if (!l || !r) {
          out.push(10, 10, 10);
          continue;
        }
        out.push(l.x - r.x, l.y - r.y, l.z - r.z);
      } else if (pin.kind === 'volume3') {
        // #1447 — the volume DRIVES the free dims. Measured in the same lane frame as `length`
        // (laneAt), through the SAME resolver the claim verifier uses (`subjectVolume`), so the
        // drive targets exactly what the arbiter checks. Signed difference — crosses zero.
        const subject = resolveSolidSubject(c, pin.noun, pin.ids);
        const v = subjectVolume(subject, { get: (id: Id) => laneAt(id) ?? undefined } as unknown as Map<Id, Vec3>);
        out.push(v === null ? 10 : v - pin.value);
      } else if (pin.kind === 'area3') {
        // #1447 — the triangle area drives: |cross|/2 − value.
        const a = laneAt(pin.ids[0]);
        const b = laneAt(pin.ids[1]);
        const d3 = laneAt(pin.ids[2]);
        out.push(a && b && d3 ? norm3(cross3(sub3(b, a), sub3(d3, a))) / 2 - pin.value : 10);
      } else if (pin.kind === 'mag-rel') {
        // #393/#335 (ADR-3D-107): |e1| − c·|e2| over vector EXPRESSIONS — the expression twin of
        // length-rel, same signed-difference form (a difference of magnitudes crosses zero).
        const e1 = exprAt(pin.e1);
        const e2 = exprAt(pin.e2);
        out.push(e1 && e2 ? norm3(e1) - pin.c * norm3(e2) : 10);
      } else if (pin.kind === 'mag-val') {
        // #393/#335: |e| − value — the absolute-size twin of `length`.
        const e = exprAt(pin.e);
        out.push(e ? norm3(e) - pin.value : 10);
      } else if (pin.kind === 'concyclic') {
        // #305: a convex quad is CYCLIC iff its opposite angles are supplementary, i.e.
        // cos(A) + cos(C) = 0. Deliberately NOT Ptolemy (|AC|.|BD| - |AB|.|CD| - |BC|.|AD|):
        // that expression is non-negative, so it TOUCHES zero instead of crossing it and the
        // least-squares descent stalls a visible ~1e-3 short (the ADR-3D-006 touch-zero lesson).
        // This form changes SIGN through the cyclic configuration and is scale-free (cosines).
        const q = pin.ids.map((id) => at(id));
        if (q.length === 4 && q.every((v): v is Vec3 => v !== undefined)) {
          const [A, B, C, D] = q as Vec3[];
          const cosAt = (v: Vec3, p1: Vec3, p2: Vec3) => {
            const u1 = sub3(p1, v);
            const u2 = sub3(p2, v);
            const den = Math.max(norm3(u1) * norm3(u2), 1e-12);
            return dot3(u1, u2) / den;
          };
          out.push(cosAt(A, B, D) + cosAt(C, B, D));
        } else out.push(10);
      } else if (pin.kind === 'mutual') {
        // S4 (#378): a CLOSED mutual position between two gauge operands.
        //
        // Every residual here is a SIGNED COMPONENT, never a magnitude. The natural scalars —
        // |d1×d2| for parallel, |w·(d1×d2)| for meeting — are non-negative, so they TOUCH zero
        // instead of crossing it and the least-squares descent stalls short of the solution (the
        // ADR-3D-006 lesson, restated in the `concyclic` branch above and measured again here).
        // The component forms change sign through the configuration, so the descent runs into it.
        // All are normalized by the operand magnitudes ⇒ scale-free ⇒ similarity-invariant, so a
        // shrinking figure can never zero them (the collapse-basin class).
        const sides = mutualSides(pin.a, pin.b, c, { lines: lines ?? new Map(), planes: new Map() }, (id) => at(id) ?? null);
        const wide = pin.rel !== 'intersecting'; // parallel/coincident align directions: 3 components
        if (!sides) {
          for (let i = 0; i < (pin.rel === 'coincident' ? 6 : wide ? 3 : 1); i++) out.push(10);
          continue;
        }
        const [s1, s2] = sides;
        const d1 = s1.geom.dir!;
        const d2 = s2.geom.dir!;
        const w = sub3(s2.geom.point!, s1.geom.point!);
        const n1 = norm3(d1);
        const n2 = norm3(d2);
        const cxd = cross3(d1, d2);
        if (pin.rel === 'intersecting') {
          // coplanarity, SIGNED: the triple product crosses zero as the lines pass through meeting
          const den = Math.max(n1 * n2 * norm3(w), 1e-12);
          out.push(dot3(w, cxd) / den);
        } else {
          const den = Math.max(n1 * n2, 1e-12);
          out.push(cxd.x / den, cxd.y / den, cxd.z / den); // directions aligned
          if (pin.rel === 'coincident') {
            // …and side 2's anchor lies ON side 1: w × d1 vanishes (again componentwise)
            const wx = cross3(w, d1);
            const den2 = Math.max(n1 * norm3(w), 1e-12);
            out.push(wx.x / den2, wx.y / den2, wx.z / den2);
          }
        }
      } else if (pin.kind === 'cos-angle') {
        const u = dirOf(pin.u);
        const v = dirOf(pin.v);
        out.push(u && v ? cosOf(u, v) - pin.cos : 10); // G6: cos(u,v) = value (normalized ⇒ invariant)
      } else if (pin.kind === 'dot-eq') {
        const a = dirOf(pin.a);
        const b = dirOf(pin.b);
        const cc = dirOf(pin.c);
        const d = dirOf(pin.d);
        // G9: u·v = c·d, normalized by the operand norms so the residual is O(1) & scale-free
        const scale = a && b && cc && d ? Math.max(norm3(a) * norm3(b), norm3(cc) * norm3(d), 1e-12) : 1;
        out.push(a && b && cc && d ? (dot3(a, b) - dot3(cc, d)) / scale : 10);
      } else if (pin.kind === 'cos-eq') {
        const a = dirOf(pin.a);
        const b = dirOf(pin.b);
        const cc = dirOf(pin.c);
        const d = dirOf(pin.d);
        out.push(a && b && cc && d ? cosOf(a, b) - cosOf(cc, d) : 10); // G10: ∠(a,b) = ∠(c,d)
      } else if (pin.kind === 'bisector-dir') {
        /**
         * #872 — apex→tip IS the internal bisector ray of ∠(a·apex·b).
         *
         * SIGNED COMPONENTS of the unit-direction difference (the ADR-3D-006 touch-zero lesson): a
         * magnitude like |u−v| touches zero instead of crossing it and the descent stalls short of the
         * solution. Three residuals for a two-parameter condition is the same deliberate redundancy the
         * `mutual` cross-product residual carries, and it is scale-free — both sides are unit vectors.
         *
         * This single expression also fixes the SIGN for free: an equal-angle residual is satisfied by
         * the EXTERNAL bisector too, a direction difference is not.
         */
        const O = at(pin.apex);
        const A = at(pin.a);
        const B = at(pin.b);
        const T = at(pin.tip);
        const u = O && A && B ? bisectorDir3(O, A, B) : null;
        const ray = O && T ? sub3(T, O) : null;
        if (!u || !ray || norm3(ray) < 1e-12) {
          out.push(10, 10, 10);
        } else {
          const w = normalize3(ray);
          out.push(w.x - u.x, w.y - u.y, w.z - u.z);
        }
      } else if (pin.kind === 'line-plane-angle') {
        const a = at(pin.a);
        const b = at(pin.b);
        const ring = pin.plane.map(at);
        if (!a || !b || ring.some((p) => !p)) {
          out.push(10);
        } else {
          const u = sub3(b, a);
          const n = cross3(sub3(ring[1]!, ring[0]!), sub3(ring[ring.length - 1]!, ring[0]!));
          const den = Math.max(norm3(n) * norm3(u), 1e-12);
          out.push(Math.abs(dot3(n, u)) / den - Math.sin((pin.deg * Math.PI) / 180)); // sin β − sin(given)
        }
      } else if (pin.kind === 'distance') {
        // S5 (#378): |a b| = value, through the same geometry the claim and the query lane read.
        const abs = { lines: lines ?? new Map(), planes: new Map() };
        const ga = resolveOperand(pin.a, c, abs)(at);
        const gb = resolveOperand(pin.b, c, abs)(at);
        const d = ga && gb ? distanceBetween(ga, gb) : null;
        out.push(d === null ? 10 : d - pin.value); // signed: crosses zero through the solution
      } else if (pin.kind === 'plane-rel') {
        // S3 (#378): a plane-bearing direction relation between two GAUGE operands. Residuals are
        // SIGNED COMPONENTS (the ADR-3D-006 touch-zero lesson): a magnitude like |n1×n2| touches
        // zero instead of crossing it and the descent stalls short. Which form applies follows the
        // one rule in `relDeviation` — same-type sides read one way, a mixed pair inverts.
        const abs = { lines: lines ?? new Map(), planes: new Map() };
        const ga = resolveOperand(pin.a, c, abs)(at);
        const gb = resolveOperand(pin.b, c, abs)(at);
        const va = ga?.dir ?? ga?.normal;
        const vb = gb?.dir ?? gb?.normal;
        const mixed = !!ga && !!gb && !ga.dir !== !gb.dir; // exactly one side is planar
        // #614: containment between two PLANAR sides is coincidence — same statement, so the same
        // residual, rather than a second spelling that could drift from it.
        const rel = pin.rel === 'contained' && !mixed ? 'coincident' : pin.rel;
        const wide = rel === 'parallel' || rel === 'coincident' || rel === 'contained' ? !mixed : mixed; // 3 components vs 1
        // #614: CONTAINED is direction AND position — the parallel component plus one offset row, the
        // same shape `coincident` already uses one operand-kind up (two planes rather than a line and
        // a plane). A mixed pair reads its direction in ONE component, so the count is 2.
        const count = rel === 'coincident' ? 4 : rel === 'contained' ? 2 : rel === 'angle' ? 1 : wide ? 3 : 1;
        if (!va || !vb || norm3(va) < 1e-12 || norm3(vb) < 1e-12) {
          for (let i = 0; i < count; i++) out.push(10);
          continue;
        }
        const den = Math.max(norm3(va) * norm3(vb), 1e-12);
        if (rel === 'angle') {
          const t = ((pin.deg ?? 0) * Math.PI) / 180;
          out.push(Math.abs(dot3(va, vb)) / den - (mixed ? Math.sin(t) : Math.cos(t)));
        } else if (wide || rel === 'coincident') {
          const x = cross3(va, vb);
          out.push(x.x / den, x.y / den, x.z / den);
        } else {
          out.push(dot3(va, vb) / den);
        }
        if (rel === 'contained') {
          /**
           * #614 — …and the linear operand must SIT ON the plane, not merely run parallel to it.
           *
           * One offset row: the signed distance from the linear side's own point to the plane,
           * size-normalized exactly as `coincident`'s is, so the residual is scale-free and CROSSES
           * zero through the solution (the ADR-3D-006 touch-zero lesson) rather than touching it.
           */
          const lin = ga!.dir ? ga! : gb!;
          const pln = ga!.dir ? gb! : ga!;
          if (pln.normal === undefined || pln.d === undefined || lin.point === undefined) out.push(10);
          else {
            let extent = 1;
            for (const id of c.points.keys()) {
              const q = at(id);
              if (q) extent = Math.max(extent, norm3(q));
            }
            out.push((dot3(pln.normal, lin.point) + pln.d) / (Math.max(norm3(pln.normal), 1e-12) * extent));
          }
        }
        if (rel === 'coincident') {
          // …and the planes must share an offset. Size-normalized so the residual is scale-free.
          const na = norm3(va);
          const nb = norm3(vb);
          const da = ga!.d;
          const db = gb!.d;
          if (da === undefined || db === undefined) out.push(10);
          else {
            const flip = dot3(va, vb) < 0 ? -1 : 1;
            let extent = 1;
            for (const id of c.points.keys()) {
              const q = at(id);
              if (q) extent = Math.max(extent, norm3(q));
            }
            out.push((da / na - (flip * db) / nb) / extent);
          }
        }
      } else {
        const a = at(pin.a);
        const b = at(pin.b);
        const ring = pin.plane.map(at);
        if (!a || !b || ring.some((p) => !p)) {
          out.push(10, 10);
          continue;
        }
        const d = sub3(b, a);
        const e1 = sub3(ring[1]!, ring[0]!);
        const e2 = sub3(ring[2]!, ring[0]!);
        if (pin.kind === 'seg-perp-plane') {
          const s1 = Math.max(norm3(d) * norm3(e1), 1e-12);
          const s2 = Math.max(norm3(d) * norm3(e2), 1e-12);
          out.push(dot3(d, e1) / s1, dot3(d, e2) / s2);
        } else {
          const n = cross3(e1, e2);
          out.push(dot3(d, n) / Math.max(norm3(d) * norm3(n), 1e-12), 0);
        }
      }
    }
    scalarRows = [scalarStart, out.length]; // #990: …and end here
    // V8-c coupled symbol conditions: the vec-defined endpoint is baked into `pos` at the
    // trial symbol value (via `override`), so its ⟂/∥-to-plane residual drives the symbol
    // AND the free dim jointly (a perp adds 2 residuals, a parallel 1).
    if (coupled) {
      for (const pin of coupled.pins) {
        if (pin.rel !== 'perp' && pin.rel !== 'parallel') continue; // only ⟂/∥-plane pins couple
        const a = at(pin.a);
        const b = at(pin.b);
        const ring = pin.plane.map(at);
        if (!a || !b || ring.some((p) => !p)) {
          out.push(10);
          if (pin.rel === 'perp') out.push(10);
          continue;
        }
        const d = sub3(b, a);
        const e1 = sub3(ring[1]!, ring[0]!);
        const e2 = sub3(ring[2]!, ring[0]!);
        if (pin.rel === 'perp') {
          out.push(dot3(d, e1) / Math.max(norm3(d) * norm3(e1), 1e-12), dot3(d, e2) / Math.max(norm3(d) * norm3(e2), 1e-12));
        } else {
          const n = cross3(e1, e2);
          out.push(dot3(d, n) / Math.max(norm3(d) * norm3(n), 1e-12));
        }
      }
    }
    // membership givens (ADR-3D-033): distance of the member from its carrier plane.
    // A run carrier is re-derived from the CANDIDATE positions (Newell) and the
    // residual is normalized by the run's own extent, so it is similarity-invariant —
    // shrinking the solid (scale OR a dim) can never zero it "for free" (the
    // collapse-basin class the planePins guards exist for). A fixed equation plane
    // keeps the raw planePins scale (it legitimately pins absolute placement).
    for (const m of memberPins) {
      const q = m.frozen ?? at(m.id);
      if (!q) {
        out.push(10); // the residual COUNT is fixed per member (a line carrier contributes three)
        if (m.symLine) out.push(10, 10);
        continue;
      }
      // #801: a carrier stated in a PIN SYMBOL — evaluate its equation at the trial value of that
      // symbol, so the member's distance to it and the symbol itself are one joint problem.
      if (m.symLine || m.symPlane) {
        const sym = (m.symLine ?? m.symPlane)!.sym;
        const t = symAt(x, sym);
        if (t === null) {
          out.push(10);
          if (m.symLine) out.push(10, 10);
          continue;
        }
        if (m.symLine) {
          const anchor = v3(linAt(m.symLine.anchor[0], t), linAt(m.symLine.anchor[1], t), linAt(m.symLine.anchor[2], t));
          const dir = v3(linAt(m.symLine.dir[0], t), linAt(m.symLine.dir[1], t), linAt(m.symLine.dir[2], t));
          const dn = norm3(dir);
          // ON the line ⟺ the offset from its anchor is PARALLEL to its direction ⟺ the cross vanishes.
          // |cross|/|dir| IS the distance, so the three components carry length units exactly like the
          // plane-pin residual — and a direction vector's arbitrary scale never weights the drive.
          const w = dn < 1e-12 ? v3(10, 10, 10) : scale3(cross3(sub3(q, anchor), dir), 1 / dn);
          out.push(w.x, w.y, w.z);
        } else {
          const pl = m.symPlane!;
          const n = v3(linAt(pl.cx, t), linAt(pl.cy, t), linAt(pl.cz, t));
          out.push((dot3(n, q) + linAt(pl.d, t)) / Math.max(norm3(n), 1e-12));
        }
        continue;
      }
      if (m.plane) {
        out.push((dot3(m.plane.n, q) + m.plane.d) / Math.max(norm3(m.plane.n), 1e-12));
        continue;
      }
      const pts = (m.run ?? []).map(at);
      if (pts.length < 3 || pts.some((p) => !p)) {
        out.push(10);
        continue;
      }
      const ring = pts as Vec3[];
      const n = runNormal(ring);
      let extent = 0;
      for (let i = 1; i < ring.length; i++) extent = Math.max(extent, dist3(ring[i], ring[0]));
      out.push((dot3(n, q) - dot3(n, ring[0])) / (Math.max(norm3(n), 1e-12) * Math.max(extent, 1e-9)));
    }
    return out;
  };

  /** The SOLID half of `degenerate` (#1735 split it out): a collapsed solid is not a figure. */
  const collapsed = (x: number[]): boolean => {
    // S3 (#378): NOT gated on `planeDrive` any more. A collapsed solid is not a figure whatever
    // given caused the collapse — the gate was a per-path proxy for the semantic question (the
    // ADR-3D-101 class, and the same shape as `scalePinned`'s exclusion list). It let a plane
    // COINCIDENCE between a box's base and its top flatten the box to zero height and report
    // success: the claim then verified, because in the collapsed figure the planes really do
    // coincide. The threshold is a hard collapse (1e-4 of the solid's own span), so a figure with
    // legitimately close vertices is untouched.
    const dims = x.slice(7, 7 + nDims);
    const override = coupled ? new Map(coupled.syms.map((s, i) => [s, x[7 + nDims + i]])) : undefined;
    const pos = evalCanonical(dims, override, riderMap(x));
    for (const solid of c.solids) {
      const pts = solid.ids.map((id) => pos.get(id)).filter((p): p is Vec3 => !!p);
      let maxD = 0;
      let minD = Infinity;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = norm3(sub3(pts[j], pts[i]));
          if (d > maxD) maxD = d;
          if (d < minD) minD = d;
        }
      }
      if (pts.length >= 2 && minD <= 1e-4 * Math.max(maxD, 1e-12)) return true;
      // #872 (ADR-3D-212): the FLAT collapse the pairwise test cannot see. Vertices stay well
      // separated while the solid loses its VOLUME — a פירמידה whose apex is driven into its own
      // base plane is not a pyramid, and the sentence that flattened it has not been satisfied, it
      // has been evaded. The 2-D engine has had exactly this gate since ADR-413 (`collapsedPolygon`,
      // a declared polygon driven to zero AREA); this is its R³ twin, same 1e-4-of-span threshold,
      // and the sibling-product audit docs/17 §6 asks for is what found it.
      // FLAT kinds are excluded by construction — `polygon3/4/5` are the 2-D vector lane and are
      // coplanar on purpose.
      if (!FLAT_SOLID_KINDS.has(solid.kind) && pts.length >= 4 && maxD > 1e-12 && offPlaneSpread(pts) <= 1e-4 * maxD) return true;
      // #1499 — the #872 gate's zero-AREA face, for the NON-flat kinds only. A 3-D solid's ring
      // driven collinear is never a figure. A declared polygon (a FLAT kind) collapsed is not a figure
      // either (#1849, ADR-3D-310) — but it is judged after the solve (`settleFlatRings` below), not
      // here, because the refusal must say WHICH givens forced the flatness: a pool whose every solution
      // collapsed retries with the dims frozen and prefers a non-collapsed figure, and otherwise comes
      // back empty with the record naming the ring and whether an incidence on a rider (#1815) or the
      // other givens forced it.
      if (!FLAT_SOLID_KINDS.has(solid.kind) && pts.length >= 3 && maxD > 1e-12 && norm3(runNormal(pts)) <= 1e-4 * maxD * maxD) return true;
    }
    return false;
  };
  /**
   * #820: a candidate that slid a rider OFF its host segment is not a figure either — «K על SB»
   * is a given like any other, so a solution reaching the relation at t = 1.4 has not satisfied
   * the student's statements. #1735 (ADR-3D-306): returns WHICH riders left their host (indices into
   * `riders`, bounds from each rider's own carrier `lo`/`hi` — the one table, no kind list), so an
   * acceptance site can RE-SEAT them (`reseatOffHost` below) instead of only discarding the candidate.
   */
  const offHost = (x: number[]): number[] =>
    riders.flatMap((r, i) => (x[riderBase + i] >= r.lo - 1e-9 && x[riderBase + i] <= r.hi + 1e-9 ? [] : [i]));
  /** Not a figure: a collapsed solid, or a rider off its host. Every acceptance site asks this. */
  const degenerate = (x: number[]): boolean => collapsed(x) || offHost(x).length > 0;

  /**
   * #820 — WHICH riders are unknowns: the ones a residual actually reads. Measured by moving each
   * rider a long way along its host and asking whether any residual changed — a structural walk over
   * the constraint families would be an enumeration to keep in sync (`src3d/CLAUDE.md`: "an
   * enumeration is not a rule"), and this cannot drift from the residual set because it IS the
   * residual set. A rider nothing reads leaves the lane, so its figure solves exactly as before.
   */
  /**
   * #1815 (ADR-3D-309): the probe also records WHICH residual rows the riders read — the rows an
   * incidence on a rider writes. `collapseIsStated` re-solves the figure without them. `null` when the
   * row layout moved under the probe, so rows cannot be attributed (the judgement then keeps today's
   * answer rather than guessing).
   */
  let riderRowMask: boolean[] | null = null;
  if (riders.length > 0) {
    const base = [0, 0, 0, 0, 0, 0, 0, ...dims0, ...Array(nSym).fill(0.2), ...Array(nPinSym).fill(0.3), ...riders.map((r) => r.t0)];
    const at = residualsFor(false);
    const r0 = at(base);
    const mask = r0.map(() => false);
    let attributable = true;
    const reads = riders.map((r, i) => {
      const probeX = [...base];
      probeX[riderBase + i] = r.t0 > 0.5 ? r.t0 - 0.3 : r.t0 + 0.3;
      const r1 = at(probeX);
      if (r1.length !== r0.length) attributable = false;
      else r1.forEach((v, k) => { if (Math.abs(v - r0[k]) > 1e-9) mask[k] = true; });
      return r1.some((v, k) => Math.abs(v - (r0[k] ?? 0)) > 1e-9) || r1.length !== r0.length;
    });
    riders = riders.filter((_, i) => reads[i]);
    riderRowMask = attributable ? mask : null;
  }
  const nRider = riders.length;

  /**
   * #1735 (ADR-3D-306) — A HOST BOUND IS RESTORED, NOT ONLY ENFORCED.
   *
   * The host interval [lo, hi] of a bounded carrier was never inside the solve: it was a post-hoc
   * rejection (`offHost`). So a given the figure can satisfy by sliding the rider OR by growing / reshaping
   * its host — «משולש ABC · D על AB · AD = 3» on a triangle of unstated size — was reached the cheap way
   * (LM's minimum-norm step spends the deficit on `t`, landing D at t = 1.2–1.6 past B) at EVERY start,
   * every exact candidate was discarded, and the empty pool reached the student as `givens-contradict`.
   *
   * The re-seat: HARD-pin each off-host rider back at its seed sample `t0` (on the host by construction)
   * while the gauge, dims and the other riders adapt on the primary residuals, then RELEASE on the site's
   * own residuals from there — the #797 / #518 pin-then-release pattern. Nothing is admitted here: the
   * caller judges the result with its ordinary acceptance (exact AND `!degenerate`), so a re-seat cannot
   * invent a solution — a true contradiction («AB = 5 · D על AB · AD = 7») stays refused.
   *
   * `y` is the site's own unknown vector and `at` the index of its first rider slot (riderBase on the
   * gauge-solving path, nDims on the dims-only `invariantOnly` path).
   */
  const reseatOffHost = (
    y: readonly number[],
    off: readonly number[],
    at: number,
    fPin0: (v: number[]) => number[],
    fRelease: (v: number[]) => number[],
  ): { x: number[]; err: number } => {
    const y0 = [...y];
    for (const i of off) y0[at + i] = riders[i].t0;
    const fPin = (v: number[]) => [...fPin0(v), ...off.map((i) => 1e3 * (v[at + i] - riders[i].t0))];
    const rp = leastSquares(fPin, y0, 60); // the pinned stage only steers into the on-host basin
    return leastSquares(fRelease, rp.x);
  };
  /** At most this many off-host candidates are kept for a re-seat (per mirror / per site). */
  const RESEAT_CAP = 8;
  /** An EXACT candidate rejected only because a rider left its host — what a re-seat can repair. */
  const offHostOnly = (x: number[], primary: number): boolean =>
    nRider > 0 && primary < 1e-6 && !collapsed(x) && offHost(x).length > 0;

  /**
   * #1499 — THE FROZEN-DIMS FAILURE-PATH RETRY (the V8-c / ADR-3D-030 retry shape, one lane over).
   *
   * A statement whose own free carriers can absorb it — «SM ⊥ ABC» with S free — is satisfiable by
   * moving the carriers alone, for ANY shape of the solid. But the joint [gauge | dims | riders]
   * solve owns a collapse attractor the carriers-only problem does not have: LM flattened the
   * sampled triangle (both angular residuals vanish on a collinear ring — ADR-3D-212), and at seeds
   * where that basin captured EVERY start the degeneracy gate left 0 solutions, which `store3`
   * reports as the student's contradiction. So when the joint solve finds nothing and the figure
   * carries enrolled riders, re-solve with the dims FROZEN at the seed's sample — the same
   * solvePivot, with dims0 baked into the evaluation and an empty dims vector, so the unknowns are
   * [gauge | riders] and the collapse basin does not exist. Success keeps the sampled shape
   * untouched (M2: the statement's own carriers absorb it; existing points stay put). A recursion
   * cannot recurse: the inner call has no dims to freeze.
   */
  const retryFrozenDims = (): PivotResult[] =>
    nRider > 0 && nDims > 0 && !probe && !coupled
      ? solvePivot(c, (_d, ov, rt) => evalCanonical(dims0, ov, rt), [], seed, undefined, undefined, undefined, lines).map((r) => ({ ...r, dims: [...dims0] }))
      : [];

  /**
   * #1499 — did this solution COLLAPSE a flat solid's ring to zero area? A flat kind's collapse
   * cannot be rejected inside `degenerate` (a stated coincidence may FORCE it, and FR-RD-7 says a
   * forced-flat figure is drawn) — so it is judged on the accepted pool instead: when EVERY solution
   * flattened a ring and the figure carries enrolled riders, the frozen-dims retry is offered the
   * problem the collapse basin cannot reach, and its non-collapsed figure is preferred. Evaluated
   * from the result's own record (dims + riderTs), so the joint solve's and the retry's solutions
   * are judged by one predicate despite their different unknown vectors.
   */
  /** The first flat solid whose ring this solution collapsed (#1815: the refusal names it), or null. */
  const collapsedRingOf = (r: Pick<PivotResult, 'dims' | 'riderTs' | 'symbols'>): SolidObj | null => {
    // #1849: a V8-c solution is judged where it stands — its coupled symbols placed, as evaluate places them
    const override = coupled && r.symbols ? new Map(coupled.syms.map((s, i) => [s, r.symbols![i]])) : undefined;
    const pos = evalCanonical(r.dims, override, r.riderTs ? new Map(Object.entries(r.riderTs)) : undefined);
    for (const solid of c.solids) {
      if (!FLAT_SOLID_KINDS.has(solid.kind)) continue;
      if (ringCollapsed3(solid.ids.map((id) => pos.get(id)).filter((p): p is Vec3 => !!p))) return solid;
    }
    return null;
  };
  const collapsedRing = (r: Pick<PivotResult, 'dims' | 'riderTs' | 'symbols'>): boolean => collapsedRingOf(r) !== null;
  /** #1849: the declared polygon whose ring is least open in this solution (the released-sliver refusal names it). */
  const thinnestRingOf = (r: Pick<PivotResult, 'dims' | 'riderTs' | 'symbols'>): SolidObj => {
    const override = coupled && r.symbols ? new Map(coupled.syms.map((s, i) => [s, r.symbols![i]])) : undefined;
    const pos = evalCanonical(r.dims, override, r.riderTs ? new Map(Object.entries(r.riderTs)) : undefined);
    const flat = c.solids.filter((s) => FLAT_SOLID_KINDS.has(s.kind));
    const openness = (s: SolidObj) => ringOpenness3(s.ids.map((id) => pos.get(id)).filter((p): p is Vec3 => !!p));
    return flat.reduce((a, b) => (openness(b) < openness(a) ? b : a));
  };
  /**
   * #1815 (ADR-3D-309, amends ADR-3D-268 part 2) — WHICH GIVENS FORCED THE COLLAPSE.
   *
   * A pool whose every solution flattens a flat ring, with the frozen-dims retry finding nothing better,
   * was kept on the inference "nothing else satisfies the givens, so the collapse was stated". That
   * inference is false: "nothing else satisfies" means the givens FORCE the flatness, not that the
   * student STATED it. «משולש ABC · M על AB · M אמצע BC» forces it — M on line AB and on line BC at
   * once — and nobody said the triangle is flat. 2-D refuses that family (ADR-413); 3-D drew it green.
   *
   * So the collapse is ATTRIBUTED, structurally: re-solve the figure on the residual rows NO enrolled
   * rider reads (the #820 probe's row mask) — the givens with every incidence on a rider removed. If
   * that reduced system can hold with the ring NOT collapsed, the flatness was invented to satisfy an
   * incidence: not a figure, refused (an empty pool marked `collapse`, so the step keeps its prior figure
   * and the store names the statements). If
   * every reduced solution is still collapsed (or none is found), the non-incidence givens force it —
   * «AB = 5 · BC = 3 · AC = 8». One bounded solve on the failure path only; it never recurses (no rider
   * rows remain to remove). #1849 (ADR-3D-310): both answers are now refused — this decides only WHICH
   * statements the refusal names (the rider incidences, or the givens that force the flatness).
   */
  const collapseIsStated = (): boolean => {
    const mask = riderRowMask;
    if (!mask || !mask.some(Boolean)) return true;
    return openSolveOn(mask) === null;
  };
  /**
   * The anchored open search behind both questions below: from four dim starts, anchor the dims to the
   * seed's sample (the anchor steers away from the collapse basin), then RELEASE on the chosen rows and
   * accept only an exact solution whose declared rings are all open. `mask` drops the rows it marks (the
   * rider incidences, for the attribution); `null` keeps every row (#1849: the open-figure retry).
   */
  const openSolveOn = (mask: boolean[] | null): { x: number[]; mirror: boolean } | null => {
    const ringCollapsedAt = (x: number[]): boolean =>
      collapsedRing({
        dims: x.slice(7, 7 + nDims),
        ...(nRider > 0 ? { riderTs: Object.fromEntries(riders.map((r, i) => [r.id, x[riderBase + i]])) } : {}),
      });
    const REG_C = 1e-4;
    const EXACT = 1e-20;
    const dimStarts = [dims0, dims0.map((v) => v * 0.75), dims0.map((v) => v * 1.3), dims0.map((v, i) => (i % 2 ? v * 0.6 : v * 1.2))];
    const tail = [...Array(nSym).fill(0.2), ...Array(nPinSym).fill(0.3), ...riders.map((r) => r.t0)];
    const reduced = (mirror: boolean) => {
      const f = residualsFor(mirror);
      // a layout that moved since the probe cannot be attributed: judge it on every row (today's answer)
      return (x: number[]): number[] => {
        const r = f(x);
        return mask && r.length === mask.length ? r.filter((_, k) => !mask[k]) : r;
      };
    };
    // the mirrored placement is a second problem only when some reduced row is chiral — measured at two
    // starts rather than enumerated by pin kind (a kind list drifts); an achiral system is solved once
    const x0s = dimStarts.slice(0, 2).map((d) => [0, 0, 0, 0, 0, 0, 0, ...d, ...tail]);
    const [plain, mirrored] = [reduced(false), reduced(true)];
    const chiral = x0s.some((x) => {
      const [a, b] = [plain(x), mirrored(x)];
      return a.length !== b.length || a.some((v, k) => Math.abs(v - b[k]) > 1e-12);
    });
    for (const mirror of chiral ? [false, true] : [false]) {
      const fm = mirror ? mirrored : plain;
      const pm = (x: number[]): number => fm(x).reduce((sum, v) => sum + v * v, 0);
      const anchored = (x: number[]): number[] => [...fm(x), ...x.slice(7, 7 + nDims).map((v, j) => REG_C * (v - dims0[j]))];
      for (const d of dimStarts) {
        const x0 = [0, 0, 0, 0, 0, 0, 0, ...d, ...tail];
        // the anchor steers away from the collapse basin; the release then demands the reduced givens
        // EXACTLY. A metric-forced flatness («5 · 3 · 8») admits a sliver only to second order — its
        // residual floors where the anchor's pull balances it — so a loose acceptance would read that
        // sliver as "an open figure exists" (measured: it did, at 1e-10). An honest open figure
        // converges quadratically far below `EXACT`; a sliver cannot reach it.
        // #1849: the full-row retry on an `invariantOnly` figure keeps that path's gauge FROZEN at identity —
        // freed, the release falls into the scale→0 basin (every incidence holds on a figure shrunk onto a
        // point; measured: «משולש ABC · D על AB · D אמצע AC» at seed 15 "solved" with every vertex at the origin)
        const frozenGauge = mask === null && invariantOnly;
        const lift = (y: number[]): number[] => (frozenGauge ? [0, 0, 0, 0, 0, 0, 0, ...y] : y);
        const drop = (x: number[]): number[] => (frozenGauge ? x.slice(7) : x);
        const x = pm(x0) < EXACT ? x0 : lift(leastSquares((y) => fm(lift(y)), leastSquares((y) => anchored(lift(y)), drop(x0)).x).x);
        // the full-row retry admits a FIGURE, so it passes every gate a figure passes (a rider on its host,
        // no collapsed solid); the attribution's reduced system only asks whether the ring can be open
        if (pm(x) < EXACT && !ringCollapsedAt(x) && (mask !== null || !degenerate(x))) return { x, mirror };
      }
    }
    return null;
  };
  /**
   * #1849 (ADR-3D-310) — THE OPEN-FIGURE RETRY. The unanchored joint solve lets a dim the givens leave free
   * drift to wherever LM's null-space puts it, and for a declared polygon that can be the collapse:
   * «משולש ABC · AC = 8 · BC = 3» came back FLAT at seeds 5 and 7 of 0–7 (AB = 5 exactly, though any AB
   * in (5, 11) satisfies both lengths) — drawn flat before this, and a false refusal once a flat ring is
   * refused. So when every solution collapsed a declared ring, the anchored open search runs on EVERY row:
   * an open exact figure near the seed's sample is a solution like any other. Failure path only.
   */
  const openFigureRetry = (): PivotResult[] => {
    if (coupled) return []; // the V8-c symbol slots are not in this search's layout
    const found = openSolveOn(null);
    if (!found) return [];
    const { x, mirror } = found;
    const g = { ...unpack(x), mirror };
    return [{
      transform: (p) => applyGauge(p, g), mirror, dims: x.slice(7, 7 + nDims),
      ...(nPinSym > 0 ? { pinSymbols: pinSymbolsAt(x) } : {}),
      ...(nRider > 0 ? { riderTs: Object.fromEntries(riders.map((r, i) => [r.id, x[riderBase + i]])) } : {}),
      scalarConsumed: scalarConsumedAt(x, mirror),
      err: residualsFor(mirror)(x).reduce((sum, v) => sum + v * v, 0),
      x: [...x],
    }];
  };
  /**
   * #1849 (ADR-3D-310, operator ruling 2026-10-07, ADR-W-115; amends ADR-3D-309 / ADR-3D-268 part 2) —
   * A DECLARED POLYGON COLLAPSED FLAT IS NOT A FIGURE, whatever forced it. Applied to a candidate pool:
   * [] means "keep what you have" (no solution collapsed a declared polygon); a non-empty pool is the
   * admissible part — the solutions with every declared ring open, from this pool or from the
   * frozen-dims retry (#1499); a marked empty pool (`collapse` set) means no admissible solution exists,
   * and the caller returns it so the step is refused naming the statements.
   *
   * Before this, a pool whose every solution collapsed was KEPT unless an incidence on a rider had
   * invented the collapse (#1815): «AB = 5 · BC = 3 · AC = 8» and «מרובע ABCD · AB מתלכד עם CD» were
   * drawn flat — ADR-W-048's "a notice, not a refusal", and 3-D did not even give the notice. The
   * attribution (`collapseIsStated`) now chooses only WHICH statements the refusal names, never
   * whether it refuses; with no enrolled rider there is nothing to attribute and it costs nothing.
   */
  /**
   * #1849 (ADR-3D-310 Am.) — A SLIVER THE ANCHOR HELD OPEN IS NOT AN OPEN FIGURE. An accepted solution is
   * exact only to the acceptance floor (1e-10 / 1e-12), and the anchored solves (the `invariantOnly` REG
   * pull, the rider lane) balance their pull against the residuals there. A metric-forced flatness admits a
   * height only to SECOND order, so that equilibrium is a sliver: «AB : BC = 5 : 3 · AB : AC = 5 : 8» was
   * accepted with C 0.004 off line AB (openness 1.5e-3, above the 1e-4 collapse line) and drawn as a
   * "triangle". ADR-3D-309 met the same sliver in the attribution and answered it with a strict release; this
   * is that answer applied to the pool. A solution whose declared ring is THIN (openness under the #936
   * notice's 1e-2 band) is released on its own residuals alone (the gauge stays frozen where its path froze
   * it); if the released figure is exact and collapsed, the open one was the anchor's, and it is judged
   * collapsed. A genuinely thin triangle (3°, 5·3·7.99) is exact where it stands and stays open.
   */
  const SLIVER_BAND = 1e-2;
  const EXACT_RELEASE = 1e-20;
  const fullLen = 7 + nDims + nSym + nPinSym + nRider;
  const anchorSliver = (r: PivotResult): boolean => {
    if (coupled || r.x.length !== fullLen) return false;
    const pos = evalCanonical(r.dims, undefined, r.riderTs ? new Map(Object.entries(r.riderTs)) : undefined);
    const thin = c.solids.some(
      (s) => FLAT_SOLID_KINDS.has(s.kind) && ringOpenness3(s.ids.map((id) => pos.get(id)).filter((p): p is Vec3 => !!p)) < SLIVER_BAND,
    );
    if (!thin) return false;
    const f = residualsFor(r.mirror);
    const lift = (y: number[]): number[] => (invariantOnly ? [0, 0, 0, 0, 0, 0, 0, ...y] : y);
    const x = lift(leastSquares((y) => f(lift(y)), invariantOnly ? r.x.slice(7) : [...r.x]).x);
    const err = f(x).reduce((sum, v) => sum + v * v, 0);
    return err < EXACT_RELEASE && collapsedRing({
      dims: x.slice(7, 7 + nDims),
      ...(nRider > 0 ? { riderTs: Object.fromEntries(riders.map((rd, i) => [rd.id, x[riderBase + i]])) } : {}),
    });
  };
  const settleFlatRings = (rs: PivotResult[]): PivotPool => {
    if (rs.length === 0 || probe) return [];
    if (!c.solids.some((s) => FLAT_SOLID_KINDS.has(s.kind))) return [];
    const open = rs.filter((r) => !collapsedRing(r) && !anchorSliver(r));
    if (open.length === rs.length) return [];
    if (open.length > 0) return open; // a collapsed member is not a configuration to cycle to
    const frozenOpen = retryFrozenDims().filter((r) => !collapsedRing(r) && !anchorSliver(r));
    if (frozenOpen.length > 0) return frozenOpen;
    const reopened = openFigureRetry();
    if (reopened.length > 0) return reopened;
    // the attribution's reduced re-solve reads the rider rows; with none (or a V8-c layout) the
    // non-incidence givens are all there is, so they forced it
    const forced = nRider === 0 || coupled !== undefined || collapseIsStated();
    // the ring the refusal names: the one collapsed, or (a released sliver) the thinnest declared one
    const ring = (collapsedRingOf(rs[0]) ?? thinnestRingOf(rs[0])).ids;
    return Object.assign([] as PivotResult[], { collapse: { ring: [...ring], riderKeys: riders.map((r) => r.id), forced } });
  };
  const isCollapse = (pool: PivotPool): boolean => pool.collapse !== undefined;

  if (invariantOnly) {
    // #820: with a rider in the lane there IS something to flex, so the immediate answer below does
    // not apply — the [dims | riderTs] solve underneath handles an empty dims vector unchanged.
    if (dims0.length === 0 && nRider === 0) {
      /**
       * #614 (ADR-3D-189) — "NOTHING TO FLEX" IS NOT THE SAME ANSWER AS "NO SOLUTION".
       *
       * This returned `[]` on the stated intent that the condition would be "refused downstream". It
       * is not: `store3` reads `pivot.solutions === 0` as unsatisfiable and blames the newest pin, so
       * a similarity-invariant relation that is TRUE BY CONSTRUCTION on a shape with no free dims —
       * «AB מוכל במישור ABCD» on a cube, and «AB מקביל למישור A'B'C'D'» before it — came back as a
       * contradiction. Two states shared one empty answer, the #698 class in the solver.
       *
       * With nothing to flex the question is decidable immediately: evaluate the residual at the
       * identity. If it already holds, the identity IS the solution; if it does not, the relation is
       * genuinely unsatisfiable and stays refused, exactly as before.
       */
      const x0 = [0, 0, 0, 0, 0, 0, 0, ...riders.map((r) => r.t0)];
      const primary = residualsFor(false)(x0).reduce((sum, v) => sum + v * v, 0);
      return primary < 1e-10
        ? [{
            transform: (p) => p, mirror: false, dims: [], err: primary,
            ...(nRider > 0 ? { riderTs: Object.fromEntries(riders.map((r, i) => [r.id, x0[7 + i]])) } : {}),
            scalarConsumed: scalarConsumedAt(x0, false), // #990 (no dims ⇒ 0)
            x: x0,
          }]
        : [];
    }
    const f = residualsFor(false); // mirror is also invariant here
    // #820: `invariantOnly` implies nSym = nPinSym = 0, so the unknown vector here is exactly
    // [dims | riderTs] — the rider tail rides the same anchored dims-only solve.
    const fd = (d: number[]) => f([0, 0, 0, 0, 0, 0, 0, ...d]);
    const warmDims = warmStart && warmStart.length >= 7 + nDims + nRider ? warmStart.slice(7, 7 + nDims + nRider) : null;
    // regularised-nearest: the invariant residuals are ANGLE-like (length-normalized),
    // so an unconstrained dim can drift to extremes that also shrink them (a ⟂ apex
    // ran its free height to ~55× the base — a needle). A tiny pull toward the seed's
    // sampled dims anchors the null-space; acceptance stays on the PRIMARY residuals.
    const REG = 1e-4;
    const anchors = [...dims0, ...riders.map((r) => r.t0)];
    const fr = (d: number[]) => [...fd(d), ...d.map((v, i) => REG * (v - anchors[i]))];
    // dims-only multi-start: deterministic jitters around the seed's sample. #820: a rider start is
    // SPREAD across its host rather than jittered off the sample — the roots of a relation in `t` sit
    // anywhere in [0,1] and the near-sample basin is not privileged.
    const riderStarts = [riders.map((r) => r.t0), ...[0.3, 0.7, 0.5].map((v) => riders.map((r) => (r.spread ? v : r.t0)))];
    const dimStarts = [dims0, dims0.map((v) => v * 0.75), dims0.map((v) => v * 1.3), dims0.map((v, i) => (i % 2 ? v * 0.6 : v * 1.2))]
      .map((d, i) => [...d, ...riderStarts[i]]);
    if (warmDims) dimStarts.unshift(warmDims);
    let best: { x: number[]; err: number } | null = null;
    const pd = (d: number[]): number => fd(d).reduce((s, v) => s + v * v, 0);
    const invOffHost: number[][] = []; // #1735: exact candidates discarded only for a rider off its host
    for (const d0 of dimStarts) {
      let r = leastSquares(fr, d0);
      for (let polish = 0; polish < 3 && r.err > 1e-24 && r.err < 1e-4; polish++) {
        const r2 = leastSquares(fr, r.x);
        if (r2.err >= r.err * 0.99) break;
        r = r2;
      }
      // S3 (#378): the general-position guard applies HERE too. It used to live only on the
      // gauge-solving path below, so a similarity-invariant given could flatten the figure
      // unchecked — «המישור ABC מתלכד עם המישור A'B'C'» drove a box's height to 0 and reported
      // success, because in the collapsed figure the two planes genuinely do coincide. A
      // collapsed solid is not a figure, whichever solver produced it.
      const full = [0, 0, 0, 0, 0, 0, 0, ...r.x];
      if (degenerate(full)) {
        if (invOffHost.length < RESEAT_CAP && offHostOnly(full, pd(r.x))) invOffHost.push(r.x);
        continue;
      }
      if (!best || r.err < best.err) best = r;
      if (best.err < 1e-22) break;
    }
    const invResult = (bx: number[], primary: number): PivotPool => {
      const invSol: PivotResult[] = [{
        transform: (p) => p, mirror: false, dims: bx.slice(0, nDims), err: primary,
        ...(nRider > 0 ? { riderTs: Object.fromEntries(riders.map((r, i) => [r.id, bx[nDims + i]])) } : {}),
        scalarConsumed: scalarConsumedAt([0, 0, 0, 0, 0, 0, 0, ...bx], false), // #990
        x: [0, 0, 0, 0, 0, 0, 0, ...bx],
      }];
      const uncollapsed = settleFlatRings(invSol); // #1499 / #1849: a declared ring the solve collapsed — retried, else refused
      if (isCollapse(uncollapsed)) return uncollapsed; // #1815 / #1849 (ADR-3D-310): no open figure — refused
      return uncollapsed.length > 0 ? uncollapsed : invSol;
    };
    /**
     * #1735 (ADR-3D-306): the failure path, AFTER the #1499 frozen-dims retry — so a figure that builds
     * today is untouched. Each exact candidate discarded only because a rider left its host is re-seated
     * (pinned back at its sample while the dims adapt, then released on the anchored dims-only residuals)
     * and judged by this site's own acceptance. «זווית ACD = 100» after «D על AB» on a triangle whose
     * sampled angle ACB is under 100° is reached by opening the triangle, not by sliding D past B.
     */
    const failed = (): PivotPool => {
      const frozen = retryFrozenDims();
      if (frozen.length > 0) return frozen;
      let found: { x: number[]; primary: number } | null = null;
      for (const d of invOffHost) {
        const r = reseatOffHost(d, offHost([0, 0, 0, 0, 0, 0, 0, ...d]), nDims, fd, fr);
        const primary = pd(r.x);
        if (primary >= 1e-10 || degenerate([0, 0, 0, 0, 0, 0, 0, ...r.x])) continue;
        if (!found || primary < found.primary) found = { x: r.x, primary };
      }
      return found ? invResult(found.x, found.primary) : [];
    };
    if (!best) return failed();
    const primary = pd(best.x);
    // acceptance: the regulariser's pull stops LM at a primary floor of ~(REG·dims)² —
    // 1e-10 sits above that equilibrium and far under the 2e-5 claim tolerance
    if (primary >= 1e-10) return failed();
    return invResult(best.x, primary);
  }

  // #518 (ADR-3D-133): the gauge's SCALE gets a seed-dependent SOFT ANCHOR, like every other DOF the
  // pivot solves (rotation is seed-rotated, dims pull to the seed's dims0, open symbols to
  // symAnchorTargets). It was the one solved DOF with a fixed default — anchor target 0 — so when no
  // residual determined the scale (a cube with one pinned vertex), every seed converged to |AB| = 1 and
  // the multi-sample stability gate read the frozen default as knowledge. The anchor is the TARGET
  // only: the starts keep logScale 0, because shifting the whole start set moved convergence basins and
  // cost hard figures real solution branches (a mirror gone, a sign branch gone — the first attempt's
  // full-suite failures). A genuinely determining given overrides the 1e-4 pull, exactly as it
  // overrides dims0 and the symbol anchors.
  const logScale0 = -0.3 + 0.7 * ((Math.abs(Math.sin((seed + 1) * 12.9898 + 39.425)) * 43758.5453) % 1);
  // deterministic multi-start: several initial rotations, seed-rotated so "show
  // another configuration" explores different manifold points when under-determined
  const starts: number[][] = [];
  const angles = [0, 1.1, 2.3, 4.1, 0.6, 3.1, 5.2, 1.9];
  const axes = [
    v3(0, 0, 1), v3(1, 0, 0), v3(0, 1, 0), v3(0.6, 0.6, 0.5),
    v3(0.7, -0.7, 0), v3(0, 0.7, -0.7), v3(-0.5, 0.5, 0.7), v3(0.9, 0.3, -0.3),
  ];
  for (let i = 0; i < 8; i++) {
    const k = (i + seed) % 8;
    const symStart = Array.from({ length: nSym }, () => 0.2 + 0.2 * (k % 3)); // 0.2/0.4/0.6 spread
    // #325: pin symbols start on a ± spread so a sign given can find its branch
    const pinSymStart = Array.from({ length: nPinSym }, () => (k < 4 ? 1 : -1) * (0.3 + 0.3 * (k % 3)));
    // #820: rider starts SPREAD across the host (0.2/0.35/…/0.8), never all at the seed's sample —
    // a relation's root in `t` sits anywhere in [0,1] and the sample's basin is not privileged.
    const riderStart = riders.map((r) => (k === 0 || !r.spread ? r.t0 : 0.1 + 0.1 * ((k * 3) % 8)));
    starts.push([0, 0, 0, axes[k].x * angles[k], axes[k].y * angles[k], axes[k].z * angles[k], 0, ...dims0, ...symStart, ...pinSymStart, ...riderStart]);
  }
  // #797 (ADR-3D-168 Am. 1): the ±0.3–0.9 pin-symbol spread explores only the near-origin
  // basins — a discrete root beyond it (Q2's k ∈ {1,2}) was structurally unreachable, so the
  // pool undercounted the admissible set and a picked branch printed as knowledge. EXTRA
  // starts widen the symbol axis (never shifted ones — the #518 lesson: moving existing
  // starts costs hard figures real solution branches). Only when pin symbols exist.
  // the warm start (a prior solve's exact solution) goes FIRST so a drive perturbs the
  // pinned figure's own basin before gambling on the rotation spread (ADR-3D-033)
  if (warmStart && warmStart.length === 7 + nDims + nSym + nPinSym + nRider) starts.unshift([...warmStart]);

  const results: PivotResult[] = [];
  // ADR-3D-030: plane-equation pins reach solvePivot ONLY on the drive path (the normal
  // solve strips them). Plane residuals have a DEGENERATE attractor — collapsing the
  // solid (whole-scale, or a single dim, e.g. B'≡C') zeroes them "for free" — so a
  // plane-carrying solve is (a) anchored (dims + log-scale pulled gently to the seed's
  // sample, the invariantOnly REG pattern), (b) judged on its PRIMARY residuals so
  // exact solutions are never rejected for carrying the anchor's pull, and (c) filtered:
  // a candidate whose solid has two coincident vertices is not a figure at all.
  const planeDrive =
    c.planePins.length > 0 || memberPins.length > 0 || c.coordPlanePins.length > 0 || figPlanePerps.length > 0 ||
    gaugeLineRels.length > 0; // S2: same absolute-frame drive class (anchored, degeneracy-filtered, Stage A)
  // ...and when NOTHING pins an absolute length (no point/vector/pair injection, no
  // length/dot scalar), placement alone can satisfy the equations — Stage A below.
  const scaleFree =
    nSym === 0 && planeDrive && pointPins.length === 0 && vecPins.length === 0 && c.pairPins.length === 0 &&
    c.scalarPins.every((p) => p.kind !== 'length' && p.kind !== 'dot');
  const REG_SF = 1e-4;
  const ACCEPT = planeDrive || nPinSym > 0 || nRider > 0 ? 1e-10 : 1e-12; // reg equilibrium floors primary at ~(REG·pull)²
  /** A candidate whose solid carries two coincident vertices is DEGENERATE — never a figure. */
  // Sign givens select among DISCRETE placement branches — and those are not only the
  // two mirrors: within one mirror, different rotation BASINS are exact solutions too
  // (D on +x with S on −z vs D on −x with S on +z). With sign givens present, keep
  // every distinct converged solution so the selector sees the full pool; without
  // them, the fast best-per-mirror path stands.
  // #325 (ADR-3D-079 Am. 3): a sign given on a PIN SYMBOL selects the same way — `AB=7`
  // with `B(2t,t,k)` roots t at 4 OR −1.6 (discrete), and best-per-mirror may keep only
  // the wrong-signed root, refusing `t > 0` although a positive root exists.
  // #797 (ADR-3D-168 Am. 1): ANY open pin symbol keeps the full pool, sign given or not —
  // a discrete root the pool does not carry is invisible to every honesty gate downstream:
  // the params panel printed «k = 1» as determined while k ∈ {1,2} (two of Q2's three
  // vectors), and «show another configuration» could never reach the other root.
  // #814 (ADR-3D-175): a sign on a NAMED free component («p חיובי» after «D(3,p,0)») selects a branch
  // exactly as a coordinate sign given does, so it must widen the pool the same way. Enforced in the
  // same filter; a statement collected in one place and honoured in another is honoured by luck.
  // #820: a rider lane keeps the full pool for the same reason an open pin symbol does (#797) — two
  // admissible `t` are two configurations, and a pool that carries one of them hides the other from
  // every honesty gate downstream.
  const collectAll = c.signGivens.length > 0 || c.componentSigns.length > 0 || nPinSym > 0 || nRider > 0;
  // #818: the stated SIGNS, as conditions over a candidate — a coordinate sign given on a point and a
  // sign on a named free component (#814) are one kind here, exactly as `applySolutions`' filter treats
  // them. A `partial` point is absolute and sign-honoured at sample time (ADR-3D-094): not a condition.
  const signConds: { positive: boolean; value: (at: (id: Id) => Vec3 | undefined) => number | undefined }[] = [
    ...c.signGivens
      .filter((g) => c.points.get(g.id)?.kind !== 'partial')
      .map((g) => ({ positive: g.positive, value: (at: (id: Id) => Vec3 | undefined) => at(g.id)?.[g.axis] })),
    ...c.componentSigns.map((g) => ({ positive: g.positive, value: (at: (id: Id) => Vec3 | undefined) => componentValue(c, g.target, g.axis, at) })),
  ];
  /** A candidate's FINAL positions (gauge applied to gauge points; absolute points verbatim). */
  const atFor = (mirror: boolean, x: number[]): ((id: Id) => Vec3 | undefined) => {
    const g = { ...unpack(x), mirror };
    const override = coupled ? new Map(coupled.syms.map((s, i) => [s, x[7 + nDims + i]])) : undefined;
    const pos = evalCanonical(x.slice(7, 7 + nDims), override, riderMap(x));
    return (id) => {
      const p = pos.get(id);
      if (!p) return undefined;
      // #1498: the one lane rule — see `gaugeFramePoint3`
      return gaugeFramePoint3(c, c.points.get(id)) ? applyGauge(p, g) : p;
    };
  };
  if (probe) {
    // #803 (ADR-3D-180): a driven placement's LEFTOVER translation freedom (the slide along a line a
    // vertex was put on, the slide within a plane) is sampled by walking the exact solution — hard-pin
    // the translation's PROJECTION on a seeded direction at a seeded step (40 iterations, the pinned
    // stage only steers), release on the primary residuals, keep only if still exact AND actually
    // moved. Pinned translation cannot satisfy the projection and snaps back on release (|proj| ≈ 0);
    // free translation keeps the displacement. One projection residual, so a 1-D slide with any
    // component along the direction is found (a direction orthogonal to it is measure-zero).
    if (probe.x.length !== 7 + nDims + nSym + nPinSym + nRider) return [];
    const fP = residualsFor(probe.mirror);
    const pErr = (x: number[]): number => fP(x).reduce((a, v) => a + v * v, 0);
    if (degenerate(probe.x) || pErr(probe.x) >= ACCEPT) return [];
    const h = (k: number) => (Math.abs(Math.sin((seed + 1) * 12.9898 + k * 78.233)) * 43758.5453) % 1;
    const raw = v3(h(1) - 0.5, h(2) - 0.5, h(3) - 0.5);
    const dir = scale3(norm3(raw) < 1e-6 ? v3(1, 0, 0) : scale3(raw, 1 / norm3(raw)), probe.flip ? -1 : 1);
    const step = Math.exp(probe.x[6]) * (0.4 + 0.8 * h(4)); // in figure units, so the move is visible at any scale
    const t0 = v3(probe.x[0], probe.x[1], probe.x[2]);
    // The slide is a PLACEMENT question: only translation + rotation move (the Stage-A shape); scale,
    // dims and symbols stay frozen at the solution's values. Opening them invited the explode basin —
    // extent-normalised residuals (a coordinate-plane «zero», a run membership) vanish "for free" as the
    // figure grows, so the walk drove the scale to 1e6 while every primary residual stayed exact.
    const rest = probe.x.slice(6);
    const full = (y6: number[]): number[] => [...y6.slice(0, 6), ...rest];
    const proj = (y6: number[]): number => dot3(sub3(v3(y6[0], y6[1], y6[2]), t0), dir);
    const fP6 = (y6: number[]) => fP(full(y6));
    const fPin = (y6: number[]) => [...fP6(y6), 1e3 * (proj(y6) - step)];
    const rp = leastSquares(fPin, probe.x.slice(0, 6), 40);
    const rr = leastSquares(fP6, rp.x);
    const xr = full(rr.x);
    if (degenerate(xr) || pErr(xr) >= ACCEPT || Math.abs(proj(rr.x)) < 1e-6 * Math.max(1, step)) return [];
    const g = { ...unpack(xr), mirror: probe.mirror };
    const dims = xr.slice(7, 7 + nDims);
    const symbols = coupled ? xr.slice(7 + nDims, 7 + nDims + nSym) : undefined;
    const pinSymbols = pinSymbolsAt(xr);
    const riderTs = nRider > 0 ? Object.fromEntries(riders.map((r, i) => [r.id, xr[riderBase + i]])) : undefined;
    return [{ transform: (q) => applyGauge(q, g), mirror: probe.mirror, dims, symbols, pinSymbols, riderTs, scalarConsumed: scalarConsumedAt(xr, probe.mirror), err: pErr(xr), x: [...xr] }];
  }
  /** #1735: per mirror, the deferred re-seat of its off-host candidates — run only when the pool is empty. */
  const reseatStages: (() => void)[] = [];
  for (const mirror of [false, true]) {
    const fPrimary = residualsFor(mirror);
    if (scaleFree) {
      // Stage A (ADR-3D-030): a plane equation is a PLACEMENT statement — try pure
      // gauge placement first (translate + rotate ONLY; scale frozen, dims at the
      // seed's sample), so the degenerate shrink-onto-the-plane basin does not exist
      // at all. Only when placement alone cannot satisfy the pins (e.g. two plane
      // equations jointly pinning a dim) does the anchored full solve below open
      // scale + dims.
      // #820: placement-only, so the riders stay at their samples here (this stage moves nothing but
      // the gauge); a rider that must MOVE is solved by the anchored full solve below. The
      // coupled/pin-symbol window is padded with NaN rather than skipped, so the rider slots keep
      // their true indices while those slots behave EXACTLY as they did when this vector simply ended
      // early (an absent entry and a NaN entry are the same number downstream) — this stage never had
      // symbol values to offer, and inventing zeros for them would turn a NaN-poisoned solve into a
      // plausible-looking wrong one.
      const symPad = Array<number>(nSym + nPinSym).fill(NaN);
      const fA = (y: number[]) => fPrimary([y[0], y[1], y[2], y[3], y[4], y[5], 0, ...dims0, ...symPad, ...riders.map((r) => r.t0)]);
      let bestA: { x: number[]; err: number } | null = null;
      for (const x0 of starts) {
        let r = leastSquares(fA, x0.slice(0, 6));
        for (let polish = 0; polish < 3 && r.err > 1e-24 && r.err < 1e-4; polish++) {
          const r2 = leastSquares(fA, r.x);
          if (r2.err >= r.err * 0.99) break;
          r = r2;
        }
        if (!bestA || r.err < bestA.err) bestA = r;
        if (bestA.err < 1e-22) break;
      }
      if (bestA && bestA.err < ACCEPT) {
        const g = { ...unpack([...bestA.x, 0]), mirror };
        results.push({
          transform: (p) => applyGauge(p, g), mirror, dims: dims0, err: bestA.err,
          ...(nRider > 0 ? { riderTs: Object.fromEntries(riders.map((r) => [r.id, r.t0])) } : {}),
          scalarConsumed: scalarConsumedAt([...bestA.x, 0, ...dims0, ...symPad, ...riders.map((r) => r.t0)], mirror),
          x: [...bestA.x, 0, ...dims0, ...symPad, ...riders.map((r) => r.t0)],
        });
        continue; // this mirror solved by placement alone
      }
    }
    // #325: pin-symbol seed-anchors ride whether or not this is a plane drive — any solve
    // with open symbols is `anchored`, and its acceptance moves to the PRIMARY residuals
    // (the anchor equilibrium floors the full error above the raw thresholds).
    const anchored = planeDrive || nPinSym > 0 || nRider > 0;
    const symAnchorTerms = (x: number[], targets: number[]): number[] =>
      targets.map((tgt, i) => REG_SF * (x[7 + nDims + nSym + i] - tgt));
    // #820: the rider twin — an UNDER-determined rider keeps varying with the seed (ADR-052) instead
    // of parking wherever LM's null-space left it; a determining given overrides the 1e-4 pull exactly
    // as it overrides `dims0` and the symbol anchors.
    const riderAnchorTerms = (x: number[]): number[] =>
      riders.map((r, i) => REG_SF * (x[riderBase + i] - r.t0));
    // #797 (ADR-3D-168 Am. 1): the residual function is parameterized by its symbol-anchor
    // targets — the cold starts use the Am. 2 seed targets, while the symbol-axis continuation
    // below anchors each warm restart at its own displaced value, so which discrete root it
    // converges to is decided by the primary landscape near it, never by one shared target.
    const fFor = (targets: number[]) => anchored
      ? (x: number[]) => [
          ...fPrimary(x),
          ...(planeDrive ? [REG_SF * x[6], ...x.slice(7, 7 + nDims).map((v, i) => REG_SF * (v - dims0[i]))] : []),
          ...symAnchorTerms(x, targets),
          ...riderAnchorTerms(x),
        ]
      : fPrimary;
    // best-selection stays on the FULL error (the anchor's pull punishes the collapse
    // basin); ACCEPTANCE is on the primary residuals so exact solutions always pass.
    const primaryErr = (x: number[]): number => fPrimary(x).reduce((s, v) => s + v * v, 0);
    /**
     * #518 (ADR-3D-133) — park an UNDRIVEN scale at the seed's target, POST-HOC. In-solve anchors were
     * tried at two weights and both failed a full-suite calibration: 1e-4 measurably displaced
     * determined coordinates, and even 1e-6 stalls LM on TANGENTIAL constraint directions (a quadratic
     * root like A.z² = 0 progresses at the same error magnitude as the anchor's floor, so LM reads
     * "no improvement" and stops at z ≈ 1e-3). So the base solve stays EXACTLY rev-ADR-3D-079 —
     * machine-exact, every basin untouched — and only an accepted solution whose scale never left its
     * start (|logScale| < 1e-9: the zero-gradient signature of an undriven scale; a driven scale was
     * MOVED by its residuals) is re-solved from that warm point with the scale HARD-pinned (weight 1e3)
     * to the seed target. The park is kept only if the PRIMARY residuals stay exact — a secretly-driven
     * scale makes the park fail and be discarded, so a determined figure is structurally unreachable.
     */
    const parkScale = (x: number[]): number[] | null => {
      if (Math.abs(x[6]) > 1e-9) return null;
      const fPark = (y: number[]) => [...fPrimary(y), 1e3 * (y[6] - logScale0)];
      const x0 = [...x];
      x0[6] = logScale0;
      const r = leastSquares(fPark, x0);
      if (degenerate(r.x)) return null;
      return primaryErr(r.x) < ACCEPT ? r.x : null;
    };
    let best: { x: number[]; err: number } | null = null;
    const seen = new Set<string>();
    /** #1735: exact candidates of this mirror discarded ONLY because a rider left its host. */
    const offHostRejects: number[][] = [];
    const noteOffHost = (x: number[]): void => {
      if (offHostRejects.length < RESEAT_CAP && offHostOnly(x, primaryErr(x))) offHostRejects.push([...x]);
    };
    /** Accept/dedup/push one converged candidate into the pool (collectAll only). */
    const collect = (cand0: { x: number[]; err: number }): void => {
      if (degenerate(cand0.x)) {
        noteOffHost(cand0.x); // #1735: kept for the re-seat, never admitted as it stands
        return; // a collapsed solid is not a figure (general position)
      }
      /**
       * #1311 (ADR-3D-260) — RELEASE a candidate the anchors held just short of exact.
       *
       * The soft anchors pick the basin (what the givens leave free stays near the seed's sample); they
       * must never decide whether the givens HOLD. Their pull floors the primary error at an equilibrium
       * that grows with how far the drive had to move the anchored unknowns — negligible for a rider's
       * `t ∈ [0, 1]`, but a free point's coordinates can travel a whole figure-width («אורך AB = 5,
       * אורך AC = 3» on three free points floored at 1.1e-10, a hair over `ACCEPT`, at one seed in 24).
       * So a candidate within reach of exact is polished on the PRIMARY residuals alone, from where it
       * stands — the parkScale / #797 hard-pin-then-release pattern: the anchored solve chose the basin,
       * the release only closes the last gap inside it. A candidate the release cannot make exact, or that
       * it collapses, is judged exactly as before.
       */
      let cand = cand0;
      if (anchored) {
        const pe = primaryErr(cand0.x);
        if (pe >= ACCEPT && pe < 1e-6) {
          const rel = leastSquares(fPrimary, cand0.x);
          if (!degenerate(rel.x) && primaryErr(rel.x) < pe) cand = rel;
        }
      }
      const rAccept = anchored ? primaryErr(cand.x) : cand.err;
      if (!collectAll || rAccept >= ACCEPT) return;
      const parked = parkScale(cand.x); // #518: an undriven scale parks at the seed target, exactly
      const cx = parked ?? cand.x;
      const g = { ...unpack(cx), mirror };
      // dedupe by the transform's ACTION (probe frame), not its parameters (axis-angle wraps).
      // Am. 3: two pin-symbol ROOTS can share one gauge (t = 4 vs −1.6 moves only B) — the
      // symbol values join the signature so the sign selector sees both (nPinSym = 0 ⇒ the
      // signature is byte-identical to before).
      const sig =
        [v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)]
          .map((p) => applyGauge(p, g))
          .map((q) => `${q.x.toFixed(5)},${q.y.toFixed(5)},${q.z.toFixed(5)}`)
          .join('|') +
        (nPinSym + nRider > 0 ? '#' + cx.slice(7 + nDims + nSym).map((v) => v.toFixed(4)).join(',') : '');
      if (seen.has(sig)) return;
      seen.add(sig);
      const dims = cx.slice(7, 7 + nDims);
      const symbols = coupled ? cx.slice(7 + nDims, 7 + nDims + nSym) : undefined;
      const pinSymbols = pinSymbolsAt(cx);
      const riderTs = nRider > 0 ? Object.fromEntries(riders.map((r, i) => [r.id, cx[riderBase + i]])) : undefined;
      results.push({ transform: (p) => applyGauge(p, g), mirror, dims, symbols, pinSymbols, riderTs, scalarConsumed: scalarConsumedAt([...cx], mirror), err: rAccept, x: [...cx] });
    };
    const fSeed = fFor(symAnchorTargets);
    for (const x0 of starts) {
      let r0 = leastSquares(fSeed, x0);
      // polish: restart LM (fresh damping) from the found point until it stops improving
      for (let polish = 0; polish < 3 && r0.err > 1e-24 && r0.err < 1e-4; polish++) {
        const r2 = leastSquares(fSeed, r0.x);
        if (r2.err >= r0.err * 0.99) break;
        r0 = r2;
      }
      if (degenerate(r0.x)) {
        noteOffHost(r0.x); // #1735
        continue;
      }
      collect(r0);
      if (!best || r0.err < best.err) best = r0; // FULL err — the anchor punishes collapse
      if (!collectAll && best.err < 1e-22) break;
    }
    // #797 (ADR-3D-168 Am. 1): symbol-axis CONTINUATION — a discrete root the cold starts miss
    // is reached WARM: restart from each found solution with one symbol displaced (gauge and
    // dims kept) and anchored AT the displaced value, so LM walks into the neighboring basin.
    // Cold wide symbol starts cannot do this (the gauge-basin skew dominates: at seed 0 all 14
    // cold solutions landed k ≈ 1 while k = 2 was equally admissible — a root the pool does not
    // carry is invisible to every honesty gate downstream). One round, from one base per
    // distinct symbol vector; roots within ±3 of a found one join the pool.
    if (collectAll && nPinSym > 0) {
      const seenSym = new Set<string>();
      const bases = results.filter((r) => {
        if (r.mirror !== mirror || !r.pinSymbols) return false;
        const key = pinSyms.map((s) => r.pinSymbols![s].toFixed(3)).join(',');
        if (seenSym.has(key)) return false;
        seenSym.add(key);
        return true;
      });
      for (const sol of bases) {
        for (let i = 0; i < nPinSym; i++) {
          const idx = 7 + nDims + nSym + i;
          // two-step walk (the parkScale pattern): a 1e-4 anchor cannot hold the displaced
          // symbol against the primary gradients (one DOF snaps back long before the gauge
          // rotates), so first HARD-pin the symbol at the displaced value while gauge and
          // dims adapt, then RELEASE anchored at wherever the pinned solve settled.
          // Returns whether the DISPLACED value itself was admissible.
          const explore = (d: number): boolean => {
            const target = sol.x[idx] + d;
            const x0 = [...sol.x];
            x0[idx] = target;
            const fPin = (y: number[]) => [...fPrimary(y), 1e3 * (y[idx] - target)];
            // the pinned stage only steers the gauge into the target's basin — 40 iterations
            // suffice (warm start, and the RELEASE solve carries the precision)
            const rp = leastSquares(fPin, x0, 40);
            collect(leastSquares(fFor(rp.x.slice(7 + nDims + nSym, 7 + nDims + nSym + nPinSym)), rp.x));
            return primaryErr(rp.x) < ACCEPT;
          };
          // Probe first: a symbol admissible OFF its converged value is CONTINUOUS — its
          // openness is already honest (the Am. 2 seed anchor varies it), so the fan is
          // skipped and the walk costs 2 LM solves instead of 12. Only a symbol the probe
          // shows DISCRETE pays the full fan. (A second root exactly at the probe offset is
          // still collected by the probe's own release, so no root is lost to this exit.)
          if (explore(0.75)) continue;
          for (const d of [-3, -1.5, -0.75, 1.5, 3]) explore(d);
        }
      }
    }
    // #818 (ADR-3D-179): SIGN-AXIS CONTINUATION — the #797 walk, for a stated coordinate sign. The
    // cold starts spread the GAUGE (eight rotations) and the symbol walk spreads the pin symbols; the
    // shape DIMS start at the seed's one sample in every start, so a branch that differs only in a dim
    // (D = (3, ±4, 0): the parallelogram's angle, acute or obtuse) is reached at some seeds and not at
    // others — at seed 1017 all nine solutions carried D.y = +4 against «שיעור ה-y של D הוא שלילי»,
    // and the sign filter fell through to a drawing that contradicted the given. Failure path only:
    // when no solution of this mirror honours every stated sign, restart from each found one with the
    // violated coordinate HARD-pinned at its negation while gauge and dims adapt, then release — the
    // two-step walk above, along the axis the student named instead of a symbol's.
    if (collectAll && signConds.length > 0) {
      const holds = (x: number[]): boolean => {
        const at = atFor(mirror, x);
        return signConds.every((cd) => {
          const v = cd.value(at);
          return v === undefined ? true : cd.positive ? v > 1e-9 : v < -1e-9;
        });
      };
      const mine = results.filter((r) => r.mirror === mirror);
      if (mine.length > 0 && !mine.some((r) => holds(r.x))) {
        for (const sol of mine.slice(0, 4)) {
          const at = atFor(mirror, sol.x);
          for (const cd of signConds) {
            const v = cd.value(at);
            if (v === undefined || (cd.positive ? v > 1e-9 : v < -1e-9)) continue; // this sign already holds
            const target = -v;
            const fPin = (y: number[]) => [...fPrimary(y), 1e3 * ((cd.value(atFor(mirror, y)) ?? 0) - target)];
            const rp = leastSquares(fPin, [...sol.x], 40);
            collect(leastSquares(fFor(symAnchorTargets), rp.x));
          }
        }
      }
    }
    /**
     * #816 (ADR-3D-186) — DIMS WIDENING, on the FAILURE PATH ONLY.
     *
     * The cold starts spread the GAUGE (eight seed-rotated starts) and the #797 walk spreads the pin
     * symbols, but **the shape DIMS start at the seed's one sample in every start** — the gap this
     * file already names at the #818 continuation below. When the solution needs a different dims
     * basin, no start reaches it, the pivot returns nothing, and `store3` faithfully reports that as
     * `injection-unsatisfiable`: a SEARCH failure presented to the student as an impossibility. The
     * operator's exam pyramid did exactly that when «|u| = |v|» was typed before the coordinates —
     * satisfiable at every seed, found at 9 of 12.
     *
     * The spread itself is not new: `dimStarts` in the `invariantOnly` branch above has used these
     * same variants since it was written. It simply never reached the gauge-solving path. So this is
     * that spread, applied here, and:
     *
     *  - **only when this mirror found nothing** — a figure that already has a solution is untouched,
     *    so the success path is bit-identical and costs nothing;
     *  - as **EXTRA** starts. The existing eight are never moved: the #518 lesson is recorded twice in
     *    this file (`solve3.ts:878`, `:901`) — shifting the start set costs hard figures real solution
     *    branches. Widening on a path that was about to refuse cannot take a branch away.
     */
    if (nDims > 0) {
      /**
       * Gated on failure in BOTH modes. Widening the pool unconditionally was measured on this
       * figure and changed nothing — the panel's `?` comes from its own seed-invariance sampling,
       * not from the pool's size — so it would have cost every pooled solve three extra start
       * sweeps to buy nothing, which is the #518 trade in the wrong direction.
       */
      const foundNothing = collectAll
        ? !results.some((r) => r.mirror === mirror)
        : !(best && (anchored ? primaryErr(best.x) : best.err) < ACCEPT);
      if (foundNothing) {
        const variants: ((v: number, i: number) => number)[] = [
          (v) => v * 0.75,
          (v) => v * 1.3,
          (v, i) => (i % 2 ? v * 0.6 : v * 1.2),
        ];
        for (const f of variants) {
          const widened = dims0.map(f);
          for (const x0 of starts) {
            let r = leastSquares(fSeed, [...x0.slice(0, 7), ...widened, ...x0.slice(7 + nDims)]);
            for (let polish = 0; polish < 3 && r.err > 1e-24 && r.err < 1e-4; polish++) {
              const r2 = leastSquares(fSeed, r.x);
              if (r2.err >= r.err * 0.99) break;
              r = r2;
            }
            if (degenerate(r.x)) {
              noteOffHost(r.x); // #1735
              continue;
            }
            collect(r);
            if (!best || r.err < best.err) best = r;
          }
          // one accepted solution is enough when we are not building the configuration pool
          if (!collectAll && best && (anchored ? primaryErr(best.x) : best.err) < ACCEPT) break;
        }
      }
    }
    // #1735 (ADR-3D-306): deferred — fired below only when the WHOLE pool is empty after the #1499
    // frozen-dims retry, so every figure that builds today is bit-identical. Each kept candidate is
    // re-seated (its off-host riders pinned back at their samples, then released on the anchored
    // residuals) and offered to `collect`, whose ordinary acceptance (exact, `!degenerate`) judges it.
    if (collectAll) {
      reseatStages.push(() => {
        for (const x of offHostRejects.splice(0)) collect(reseatOffHost(x, offHost(x), riderBase, fPrimary, fSeed));
      });
    }
    // acceptance: per-residual ~1e-6 — far under the 2e-5 claim tolerance (the numeric-
    // Jacobian floor rises with mixed scalar residuals; 1e-16 was V4-era point-pins-only)
    const bestAccept = best ? (anchored ? primaryErr(best.x) : best.err) : Infinity;
    if (!collectAll && best && bestAccept < ACCEPT) {
      // #518: an undriven scale parks at the seed target, exactly
      const bx = parkScale(best.x) ?? best.x;
      const g = { ...unpack(bx), mirror };
      const dims = bx.slice(7, 7 + nDims);
      const symbols = coupled ? bx.slice(7 + nDims, 7 + nDims + nSym) : undefined;
      const pinSymbols = pinSymbolsAt(bx);
      const riderTs = nRider > 0 ? Object.fromEntries(riders.map((r, i) => [r.id, bx[riderBase + i]])) : undefined;
      results.push({ transform: (p) => applyGauge(p, g), mirror, dims, symbols, pinSymbols, riderTs, scalarConsumed: scalarConsumedAt([...bx], mirror), err: bestAccept, x: [...bx] });
    }
  }
  // #797 (ADR-3D-168 Am. 1): interleave the pool round-robin across DISTINCT symbol vectors —
  // the cold starts fill the pool with one root's gauge/dims variants first, so configuration
  // cycling (pool[seed % n] downstream) would exhaust those before ever showing another root.
  // Interleaved, consecutive configurations alternate the discrete roots.
  if (nPinSym > 0 && results.length > 1) {
    const groups = new Map<string, PivotResult[]>();
    for (const r of results) {
      const key = r.pinSymbols ? pinSyms.map((s) => r.pinSymbols![s].toFixed(3)).join(',') : '';
      const list = groups.get(key) ?? [];
      if (list.length === 0) groups.set(key, list);
      list.push(r);
    }
    if (groups.size > 1) {
      const lists = [...groups.values()];
      const out: PivotResult[] = [];
      for (let i = 0; out.length < results.length; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
      results.length = 0;
      results.push(...out);
    }
  }
  // #1499: the joint solve found nothing — try the statement's own carriers with the shape frozen.
  if (results.length === 0) {
    const frozen = retryFrozenDims();
    if (frozen.length > 0) return frozen;
    // #1735 (ADR-3D-306): …and only then, the off-host candidates the acceptance sites discarded are
    // re-seated onto their hosts (the frozen retry's own recursive solve has already had this chance).
    for (const stage of reseatStages) stage();
  }
  // #1499: …or it found figures that collapse a declared polygon's ring — keep only the open ones, or a
  // figure the frozen-dims retry finds open; with none, the pool is empty and marked (#1849, ADR-3D-310:
  // a flat figure is refused whatever forced it; #1815's attribution picks the statements it names).
  {
    const uncollapsed = settleFlatRings(results);
    if (isCollapse(uncollapsed) || uncollapsed.length > 0) return uncollapsed;
  }
  return results;
}
