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

import { pinSymsOf, type Construction3, type Id, type LinExpr, type Positions3, type ScalarPin } from './types';
import { componentValue, distanceBetween, isAbsolute, mutualSides, resolveOperand } from './operands';
import { figureLineRels, figurePlaneLinePerps } from './freeLine';
import { add3, cross3, dist3, dot3, runNormal, norm3, scale3, sub3, v3, type Vec3 } from './vec3';

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
export function leastSquares(residuals: (x: number[]) => number[], x0: number[], iterations = 120): { x: number[]; err: number } {
  let x = [...x0];
  let r = residuals(x);
  let err = r.reduce((s, v) => s + v * v, 0);
  let lambda = 1e-3;
  const n = x.length;

  for (let iter = 0; iter < iterations; iter++) {
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
    // normal equations (JᵀJ + λ·diag) δ = −Jᵀr
    const A: number[][] = [];
    const b: number[] = [];
    for (let i = 0; i < n; i++) {
      A.push([]);
      let bi = 0;
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < m; k++) s += J[i][k] * J[j][k];
        A[i].push(s);
      }
      for (let k = 0; k < m; k++) bi -= J[i][k] * r[k];
      b.push(bi);
    }
    // damping floor is ABSOLUTE: a noise-tiny diagonal (an invariant direction's
    // cancellation residue, ~1e-20) must not be its own damping scale — λ·1e-20
    // admits ~1e10 steps along pure noise, blowing coordinates into catastrophic-
    // cancellation territory (the "numeric-Jacobian floor" class). Unknowns here
    // are O(1) (world units, radians, logScale), so a unit floor is sound.
    for (let i = 0; i < n; i++) A[i][i] += lambda * Math.max(A[i][i], 1);
    const delta = solveLinear(A, b);
    if (!delta) {
      lambda *= 10;
      continue;
    }
    const xNew = x.map((v, i) => v + delta[i]);
    const rNew = residuals(xNew);
    const errNew = rNew.reduce((s, v) => s + v * v, 0);
    if (errNew < err) {
      x = xNew;
      r = rNew;
      err = errNew;
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
  /** V8-c — the jointly-solved values of the coupled symbols (in `coupled.defs` order). */
  symbols?: number[];
  /** #325 (ADR-3D-079) — the solved values of the pins' OPEN symbols (`B(2t,t,k)` → t, k). */
  pinSymbols?: Record<string, number>;
  err: number;
  /** The solved parameter vector [t, w, logScale, dims…] — the warm-start vehicle: a
   *  later DRIVE (ADR-3D-033) perturbs the pinned figure from here, so it lands in the
   *  same basin (branch choices preserved) instead of gambling on the rotation starts. */
  x: number[];
}

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
  vangle: false,
  'seg-perp-plane': false,
  'seg-par-plane': false,
  'cos-angle': false, // V8-f: cosines and equal dot products are similarity-invariant
  'dot-eq': false,
  'cos-eq': false,
  concyclic: false, // #305
  'line-plane-angle': false, // sin β is length-normalized
  mutual: false, // S4 (#378): every residual is normalized by the operand magnitudes
  'plane-rel': false, // S3 (#378): angles between characteristic vectors; the offset is size-normalized
  distance: true, // S5 (#378): a distance is an absolute size — it fixes the scale
  'mag-rel': false, // #393/#335: a RATIO of expression magnitudes — both sides scale together
  'mag-val': true, // #393/#335: |expr| = value is an absolute size, like `length`/`distance`
};

export function scalePinned(c: Construction3): boolean {
  if (c.pins.length > 0 || c.vectorPins.length > 0 || c.pairPins.length > 0 || c.planePins.length > 0) return true;
  return c.scalarPins.some((p) => PIN_FIXES_SCALE[p.kind]);
}

export function solvePivot(
  c: Construction3,
  evalCanonical: (dims: number[], symbolOverride?: Map<number, number>) => Positions3,
  dims0: number[],
  seed: number,
  coupled?: { defs: number[]; pins: Construction3['symbolPins'] },
  members?: MemberPin[],
  warmStart?: number[],
  /** #375: the figure's resolved lines. An absolute line is not a gauge object, so a residual that
   *  relates it to a figure-derived plane needs it verbatim; passing it in keeps solve3 free of any
   *  import from evaluate (which imports solve3). */
  lines?: Map<string, { anchor: Vec3; dir: Vec3 }>,
): PivotResult[] {
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
  const nSym = coupled?.defs.length ?? 0;

  // #325 (ADR-3D-079): the pins' OPEN symbols (`B(2t,t,k)` → t, k) are pivot unknowns too,
  // appended AFTER the coupled symbols. Unknown layout: [gauge 7 | dims | coupled | pinSyms].
  // #794 (ADR-3D-168): vector and pair pins carry the same component grammar as point pins, so their
  // open symbols are pivot unknowns by the same collection. #815: and so is a letter carried only by an
  // EQUATION under a stated membership — ONE derivation (`pinSymsOf`), so the unknown layout can never
  // be one symbol short of the namespace the rest of the engine reasons about.
  const pinSyms: string[] = pinSymsOf(c);
  const nPinSym = pinSyms.length;
  /** A pin component's target value at the trial unknowns (null = unconstrained). */
  const compTarget = (comp: number | null | import('./types').SymComp, x: number[]): number | null => {
    if (comp === null) return null;
    if (typeof comp === 'number') return comp;
    return comp.c + comp.k * x[7 + nDims + nSym + pinSyms.indexOf(comp.sym)];
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

  const residualsFor = (mirror: boolean) => (x: number[]): number[] => {
    const g = { ...unpack(x), mirror };
    const dims = x.slice(7, 7 + nDims);
    const override = coupled ? new Map(coupled.defs.map((d, i) => [d, x[7 + nDims + i]])) : undefined;
    const pos = evalCanonical(dims, override);
    const out: number[] = [];
    for (const pin of pointPins) {
      const p = pos.get(pin.id);
      if (!p) {
        out.push(10, 10, 10);
        continue;
      }
      const q = applyGauge(p, g);
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
      const a = def && pos.get(def.from);
      const b = def && pos.get(def.to);
      if (!a || !b) {
        out.push(10, 10, 10);
        continue;
      }
      // a vector transforms without the translation
      const w = sub3(applyGauge(b, g), applyGauge(a, g));
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
      const a = pos.get(pin.a);
      const b = pos.get(pin.b);
      if (!a || !b) {
        out.push(10, 10, 10);
        continue;
      }
      const w = sub3(applyGauge(b, g), applyGauge(a, g));
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
        const p = pos.get(id);
        if (!p || symbolTainted.has(id)) continue;
        const def = c.points.get(id);
        const absolute = def?.kind === 'coord' || (def?.kind === 'on-plane' && !c.pointPlanes.has(def.plane));
        const q = absolute ? p : applyGauge(p, g);
        out.push((q.x * pin.cx + q.y * pin.cy + q.z * pin.cz + pin.d) / nn);
      }
    }
    // scalar givens (V7 T2): lengths / vertex angles / dot products / seg-⟂/∥-plane
    const at = (id: string): Vec3 | null => {
      const p = pos.get(id);
      return p ? applyGauge(p, g) : null;
    };
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
        const wide = pin.rel === 'parallel' || pin.rel === 'coincident' ? !mixed : mixed; // 3 components vs 1
        const count = pin.rel === 'coincident' ? 4 : pin.rel === 'angle' ? 1 : wide ? 3 : 1;
        if (!va || !vb || norm3(va) < 1e-12 || norm3(vb) < 1e-12) {
          for (let i = 0; i < count; i++) out.push(10);
          continue;
        }
        const den = Math.max(norm3(va) * norm3(vb), 1e-12);
        if (pin.rel === 'angle') {
          const t = ((pin.deg ?? 0) * Math.PI) / 180;
          out.push(Math.abs(dot3(va, vb)) / den - (mixed ? Math.sin(t) : Math.cos(t)));
        } else if (wide || pin.rel === 'coincident') {
          const x = cross3(va, vb);
          out.push(x.x / den, x.y / den, x.z / den);
        } else {
          out.push(dot3(va, vb) / den);
        }
        if (pin.rel === 'coincident') {
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
        const i = pinSyms.indexOf(sym);
        const t = i < 0 ? null : x[7 + nDims + nSym + i];
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

  const degenerate = (x: number[]): boolean => {
    // S3 (#378): NOT gated on `planeDrive` any more. A collapsed solid is not a figure whatever
    // given caused the collapse — the gate was a per-path proxy for the semantic question (the
    // ADR-3D-101 class, and the same shape as `scalePinned`'s exclusion list). It let a plane
    // COINCIDENCE between a box's base and its top flatten the box to zero height and report
    // success: the claim then verified, because in the collapsed figure the planes really do
    // coincide. The threshold is a hard collapse (1e-4 of the solid's own span), so a figure with
    // legitimately close vertices is untouched.
    const dims = x.slice(7, 7 + nDims);
    const override = coupled ? new Map(coupled.defs.map((d, i) => [d, x[7 + nDims + i]])) : undefined;
    const pos = evalCanonical(dims, override);
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
    }
    return false;
  };

  if (invariantOnly) {
    if (dims0.length === 0) return []; // nothing to flex — the condition either holds or is refused downstream
    const f = residualsFor(false); // mirror is also invariant here
    const fd = (d: number[]) => f([0, 0, 0, 0, 0, 0, 0, ...d]);
    const warmDims = warmStart && warmStart.length >= 7 + nDims ? warmStart.slice(7, 7 + nDims) : null;
    // regularised-nearest: the invariant residuals are ANGLE-like (length-normalized),
    // so an unconstrained dim can drift to extremes that also shrink them (a ⟂ apex
    // ran its free height to ~55× the base — a needle). A tiny pull toward the seed's
    // sampled dims anchors the null-space; acceptance stays on the PRIMARY residuals.
    const REG = 1e-4;
    const fr = (d: number[]) => [...fd(d), ...d.map((v, i) => REG * (v - dims0[i]))];
    // dims-only multi-start: deterministic jitters around the seed's sample
    const dimStarts = [dims0, dims0.map((v) => v * 0.75), dims0.map((v) => v * 1.3), dims0.map((v, i) => (i % 2 ? v * 0.6 : v * 1.2))];
    if (warmDims) dimStarts.unshift(warmDims);
    let best: { x: number[]; err: number } | null = null;
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
      if (degenerate([0, 0, 0, 0, 0, 0, 0, ...r.x])) continue;
      if (!best || r.err < best.err) best = r;
      if (best.err < 1e-22) break;
    }
    if (!best) return [];
    const primary = fd(best.x).reduce((s, v) => s + v * v, 0);
    // acceptance: the regulariser's pull stops LM at a primary floor of ~(REG·dims)² —
    // 1e-10 sits above that equilibrium and far under the 2e-5 claim tolerance
    if (primary >= 1e-10) return [];
    return [{ transform: (p) => p, mirror: false, dims: best.x, err: primary, x: [0, 0, 0, 0, 0, 0, 0, ...best.x] }];
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
    starts.push([0, 0, 0, axes[k].x * angles[k], axes[k].y * angles[k], axes[k].z * angles[k], 0, ...dims0, ...symStart, ...pinSymStart]);
  }
  // #797 (ADR-3D-168 Am. 1): the ±0.3–0.9 pin-symbol spread explores only the near-origin
  // basins — a discrete root beyond it (Q2's k ∈ {1,2}) was structurally unreachable, so the
  // pool undercounted the admissible set and a picked branch printed as knowledge. EXTRA
  // starts widen the symbol axis (never shifted ones — the #518 lesson: moving existing
  // starts costs hard figures real solution branches). Only when pin symbols exist.
  // the warm start (a prior solve's exact solution) goes FIRST so a drive perturbs the
  // pinned figure's own basin before gambling on the rotation spread (ADR-3D-033)
  if (warmStart && warmStart.length === 7 + nDims + nSym + nPinSym) starts.unshift([...warmStart]);

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
  const ACCEPT = planeDrive || nPinSym > 0 ? 1e-10 : 1e-12; // reg equilibrium floors primary at ~(REG·pull)²
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
  const collectAll = c.signGivens.length > 0 || c.componentSigns.length > 0 || nPinSym > 0;
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
    const override = coupled ? new Map(coupled.defs.map((d, i) => [d, x[7 + nDims + i]])) : undefined;
    const pos = evalCanonical(x.slice(7, 7 + nDims), override);
    return (id) => {
      const p = pos.get(id);
      if (!p) return undefined;
      const def = c.points.get(id);
      const absolute = def?.kind === 'coord' || (def?.kind === 'on-plane' && !c.pointPlanes.has(def.plane));
      return absolute ? p : applyGauge(p, g);
    };
  };
  for (const mirror of [false, true]) {
    const fPrimary = residualsFor(mirror);
    if (scaleFree) {
      // Stage A (ADR-3D-030): a plane equation is a PLACEMENT statement — try pure
      // gauge placement first (translate + rotate ONLY; scale frozen, dims at the
      // seed's sample), so the degenerate shrink-onto-the-plane basin does not exist
      // at all. Only when placement alone cannot satisfy the pins (e.g. two plane
      // equations jointly pinning a dim) does the anchored full solve below open
      // scale + dims.
      const fA = (y: number[]) => fPrimary([y[0], y[1], y[2], y[3], y[4], y[5], 0, ...dims0]);
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
        results.push({ transform: (p) => applyGauge(p, g), mirror, dims: dims0, err: bestA.err, x: [...bestA.x, 0, ...dims0] });
        continue; // this mirror solved by placement alone
      }
    }
    // #325: pin-symbol seed-anchors ride whether or not this is a plane drive — any solve
    // with open symbols is `anchored`, and its acceptance moves to the PRIMARY residuals
    // (the anchor equilibrium floors the full error above the raw thresholds).
    const anchored = planeDrive || nPinSym > 0;
    const symAnchorTerms = (x: number[], targets: number[]): number[] =>
      targets.map((tgt, i) => REG_SF * (x[7 + nDims + nSym + i] - tgt));
    // #797 (ADR-3D-168 Am. 1): the residual function is parameterized by its symbol-anchor
    // targets — the cold starts use the Am. 2 seed targets, while the symbol-axis continuation
    // below anchors each warm restart at its own displaced value, so which discrete root it
    // converges to is decided by the primary landscape near it, never by one shared target.
    const fFor = (targets: number[]) => anchored
      ? (x: number[]) => [
          ...fPrimary(x),
          ...(planeDrive ? [REG_SF * x[6], ...x.slice(7, 7 + nDims).map((v, i) => REG_SF * (v - dims0[i]))] : []),
          ...symAnchorTerms(x, targets),
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
    /** Accept/dedup/push one converged candidate into the pool (collectAll only). */
    const collect = (cand: { x: number[]; err: number }): void => {
      if (degenerate(cand.x)) return; // a collapsed solid is not a figure (general position)
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
        (nPinSym > 0 ? '#' + cx.slice(7 + nDims + nSym).map((v) => v.toFixed(4)).join(',') : '');
      if (seen.has(sig)) return;
      seen.add(sig);
      const dims = cx.slice(7, 7 + nDims);
      const symbols = coupled ? cx.slice(7 + nDims, 7 + nDims + nSym) : undefined;
      const pinSymbols = nPinSym > 0 ? Object.fromEntries(pinSyms.map((s, i) => [s, cx[7 + nDims + nSym + i]])) : undefined;
      results.push({ transform: (p) => applyGauge(p, g), mirror, dims, symbols, pinSymbols, err: rAccept, x: [...cx] });
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
      if (degenerate(r0.x)) continue;
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
            collect(leastSquares(fFor(rp.x.slice(7 + nDims + nSym)), rp.x));
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
    // acceptance: per-residual ~1e-6 — far under the 2e-5 claim tolerance (the numeric-
    // Jacobian floor rises with mixed scalar residuals; 1e-16 was V4-era point-pins-only)
    const bestAccept = best ? (anchored ? primaryErr(best.x) : best.err) : Infinity;
    if (!collectAll && best && bestAccept < ACCEPT) {
      // #518: an undriven scale parks at the seed target, exactly
      const bx = parkScale(best.x) ?? best.x;
      const g = { ...unpack(bx), mirror };
      const dims = bx.slice(7, 7 + nDims);
      const symbols = coupled ? bx.slice(7 + nDims, 7 + nDims + nSym) : undefined;
      const pinSymbols = nPinSym > 0 ? Object.fromEntries(pinSyms.map((s, i) => [s, bx[7 + nDims + nSym + i]])) : undefined;
      results.push({ transform: (p) => applyGauge(p, g), mirror, dims, symbols, pinSymbols, err: bestAccept, x: [...bx] });
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
  return results;
}
