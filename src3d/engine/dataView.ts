/**
 * The "organize your data" panel (operator, 2026-07-07): derived presentations of
 * the figure's vectors and points, the way a student should lay them out on paper —
 * a basis decomposition (EN⃗ = 1/4·u − 3/4·w), coordinates when a frame exists
 * (EN⃗ = (−3, 6, 3)), stated magnitudes with their squares (|v| = 2, v² = 4). When
 * more than one presentation exists, ALL are shown.
 *
 * Honesty gate (the multi-sample discipline): every displayed value is computed at
 * THREE seeds and shown only when it agrees across them — an under-determined
 * quantity (which varies with the sample) never masquerades as data (ADR-052).
 *
 * This deliberately leans toward showing DERIVED results (the operator's call,
 * overriding the reproduce-don't-solve default for data-organization pedagogy) —
 * which is why the App gates it behind an explicit student checkbox.
 */

import { resolve3 } from './evaluate';
import { scalePinned } from './solve3';
import { dot3, sub3, type Vec3 } from './vec3';
import { pinSymsOf } from './types';
import type { Construction3, Id, Positions3 } from './types';

/** Same local derivation as `evaluate.ts` — `vecDefs`' element type is not exported separately. */
type VecDef = Construction3['vecDefs'][number];

export interface VecEntry {
  /** Display label, e.g. `EN` or a declared name like `w`. */
  label: string;
  /** `1/4·u − 3/4·w` — decomposition in the declared basis (needs 3 named vectors). */
  decomp: string | null;
  /** `(−3, 6, 3)` — the coordinate form, when the figure carries an absolute frame. */
  coords: string | null;
  /** `|w| = 2` — a STATED magnitude (never a sampled one). */
  mag: string | null;
  /** `w² = 4` — the square that rides every stated magnitude. */
  sq: string | null;
}

export interface DataPanel {
  /** Derived equalities among declared vectors, e.g. `|u| = |v| = |w|` (+ stated value). */
  relations: string[];
  vectors: VecEntry[];
  points: string[]; // `N(6, 6, 6)` — stable coordinates only
  /** Named planes whose equation is FORCED (identical up to scale in every sampled
   *  configuration): the standard form `ABB'A': 20x - y + 2z - 5 = 0` the exam asks
   *  for, plus a parametric form when the run's anchor/edges are stable (ADR-3D-032). */
  planes: string[];
  /** id → canvas coordinate label (when a frame exists), judged PER COMPONENT across
   *  every sampled configuration: 'fact' = fully determined; 'partial' = the known
   *  components print and the free ones read '?' (S(?, 0, ?) — its y IS knowledge
   *  while the base still tilts about AB). A point with NO stable component gets no
   *  label — a sample coordinate is not knowledge (operator rule, 2026-07-09). */
  pointCoords: Record<string, { text: string; kind: 'fact' | 'partial' }>;
  /** #325 (ADR-3D-079 Am. 2): the pins' OPEN symbols (`B(2t,t,k)` → t, k) — a determined
   *  symbol (identical across every sampled configuration) prints its value (`k = -3`); a
   *  still-free one prints open (`t = ?`), so the stated given visibly took effect. */
  params: { sym: string; text: string; open: boolean }[];
}

/**
 * Is there NOTHING to show? (#296) The panel renders `relations ∪ vectors ∪ points ∪ planes`, so
 * "empty" must mean ALL FOUR are empty — `relations` included. It was omitted from the App's guard,
 * so a figure whose only derived knowledge is relations (e.g. a free-scale square base yielding
 * `|u|=|v|`, `u·v=0` with no scale-pinned magnitude/coord) rendered a false "empty", hiding real
 * knowledge. The guard and the render must read emptiness the same way — hence one predicate.
 */
export function panelIsEmpty(p: DataPanel): boolean {
  return p.relations.length === 0 && p.vectors.length === 0 && p.points.length === 0 && p.planes.length === 0 && p.params.length === 0;
}

const EPS = 1e-6;

/** A SURD tier for `cleanNum` (#269): x = (p/q)·√n for a small non-square n (bagrut magnitudes are routinely
 *  surds — √5, 2√5, √5/2). Ascending n returns the SIMPLIFIED form (√12 → "2√3"). OPT-IN and tight-tolerance
 *  only: enabled where a magnitude / coordinate is expected, NEVER for angles (∠SDB = 35.26° stays decimal),
 *  plane-equation coefficients (integerized upstream), or the loose `cleanCoef` (2e-3 √noise) — so a
 *  genuinely irrational value falls through to 2 decimals instead of being dressed up as a surd it isn't. */
function trySurd(x: number, tol: number): string | null {
  const ax = Math.abs(x);
  if (ax < tol) return null;
  const sign = x < 0 ? '−' : '';
  for (let n = 2; n <= 50; n++) {
    const r = Math.round(Math.sqrt(n));
    if (r * r === n) continue; // n must be NON-square (n=4/9/16… are the integer/rational tiers' job)
    const c = ax / Math.sqrt(n); // the rational coefficient of √n
    const ci = Math.round(c);
    if (Math.abs(c - ci) < tol && ci >= 1 && ci <= 20) return `${sign}${ci === 1 ? '' : ci}√${n}`;
    for (let q = 2; q <= 12; q++) {
      const p = c * q;
      const pi = Math.round(p);
      if (Math.abs(p - pi) < tol && pi >= 1 && pi <= 60) return `${sign}${pi === 1 ? '' : pi}√${n}/${q}`;
    }
  }
  return null;
}

/** Render a number cleanly: integers plain, small fractions as p/q, an opt-in SURD tier (#269), else 2 decimals. */
export function cleanNum(x: number, tol = 1e-5, surd = false): string {
  // default tolerance sized for the pivot's numeric floor (~1e-7), far under display
  // grain; coefficients from a DOUBLE-ROOT solve carry the intrinsic √noise (~1e-4)
  // and pass tol = 2e-3 (cleanCoef) — claims still guard correctness at 2e-5
  if (Math.abs(x - Math.round(x)) < tol) return String(Math.round(x));
  for (let q = 2; q <= 24; q++) {
    const p = x * q;
    if (Math.abs(p - Math.round(p)) < tol && Math.abs(Math.round(p)) <= 400) return `${Math.round(p)}/${q}`;
  }
  if (surd) { const s = trySurd(x, tol); if (s) return s; }
  return x.toFixed(2);
}
/** A magnitude / coordinate value — the same tiers as `cleanNum` plus the surd tier (#269). */
export const cleanMag = (x: number): string => cleanNum(x, 1e-5, true);

const cleanCoef = (x: number): string => cleanNum(x, 2e-3);

export const coordStr = (v: Vec3): string => `(${cleanMag(v.x)}, ${cleanMag(v.y)}, ${cleanMag(v.z)})`;

/** Render a UNIT-normalized plane (lead coefficient positive) as `20x - y + 2z - 5 = 0`:
 *  find the smallest integer scaling (the book form); fall back to the 2-decimal unit form. */
export function planeEqStr(u: { x: number; y: number; z: number; d: number }): string {
  const vals = [u.x, u.y, u.z, u.d];
  const minAbs = Math.min(...vals.filter((v) => Math.abs(v) > 1e-6).map(Math.abs));
  let ints: number[] | null = null;
  for (let m = 1; m <= 60 && !ints; m++) {
    const scaled = vals.map((v) => (v * m) / minAbs);
    // tolerance sized for the pivot's numeric floor propagated through the normal
    if (scaled.every((v) => Math.abs(v - Math.round(v)) < 2e-3 * Math.max(1, Math.abs(v))) && scaled.every((v) => Math.abs(v) < 1000)) {
      ints = scaled.map(Math.round);
    }
  }
  const co = ints ?? vals;
  const num = (v: number) => (ints ? String(Math.abs(v)) : cleanNum(Math.abs(v)));
  const parts: string[] = [];
  (['x', 'y', 'z'] as const).forEach((ax, i) => {
    const v = co[i];
    if (Math.abs(v) < 1e-9) return;
    const coef = Math.abs(Math.abs(v) - 1) < 1e-9 ? '' : num(v);
    const term = `${coef}${ax}`;
    parts.push(parts.length === 0 ? (v < 0 ? `-${term}` : term) : `${v < 0 ? '-' : '+'} ${term}`);
  });
  if (Math.abs(co[3]) > 1e-9) parts.push(`${co[3] < 0 ? '-' : '+'} ${num(co[3])}`);
  return `${parts.join(' ')} = 0`;
}

/** Solve M·x = t for 3×3 M given by columns u,v,w; null when singular. */
/** Newell normal of a point ring (3–4 points) — THE shared plane-normal for display derivations
 *  (#319: the panel's labeled line↔plane angles and the query lane share it, so they can't diverge). */
export function newellNormal(pts: Vec3[]): Vec3 {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    nx += (p1.y - p2.y) * (p1.z + p2.z);
    ny += (p1.z - p2.z) * (p1.x + p2.x);
    nz += (p1.x - p2.x) * (p1.y + p2.y);
  }
  return { x: nx, y: ny, z: nz };
}

/** The line↔plane angle in DEGREES at one configuration (sin β = |n·u|/(|n||u|)), or null. */
export function linePlaneAngleAt(pos: Positions3, a: Id, b: Id, plane: Id[]): number | null {
  const p = pos.get(a);
  const q = pos.get(b);
  const pts = plane.map((id) => pos.get(id));
  if (!p || !q || pts.some((x) => !x)) return null;
  const u = { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z };
  const n = newellNormal(pts as Vec3[]);
  const den = Math.hypot(n.x, n.y, n.z) * Math.hypot(u.x, u.y, u.z);
  if (den < 1e-12) return null;
  return (Math.asin(Math.min(1, Math.abs(n.x * u.x + n.y * u.y + n.z * u.z) / den)) * 180) / Math.PI;
}

export function solve3x3(u: Vec3, v: Vec3, w: Vec3, t: Vec3): [number, number, number] | null {
  const M = [
    [u.x, v.x, w.x, t.x],
    [u.y, v.y, w.y, t.y],
    [u.z, v.z, w.z, t.z],
  ];
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-10) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = col + 1; r < 3; r++) {
      const f = M[r][col] / M[col][col];
      for (let k = col; k < 4; k++) M[r][k] -= f * M[col][k];
    }
  }
  const x: number[] = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = M[i][3];
    for (let k = i + 1; k < 3; k++) s -= M[i][k] * x[k];
    x[i] = s / M[i][i];
  }
  return x as [number, number, number];
}

export function decompStr(coefs: [number, number, number], names: string[]): string {
  const parts: string[] = [];
  coefs.forEach((cf, i) => {
    if (Math.abs(cf) < 1e-3) return;
    const mag = Math.abs(cf);
    const term = Math.abs(mag - 1) < 2e-3 ? names[i] : `${cleanCoef(mag)}·${names[i]}`;
    parts.push(parts.length === 0 ? (cf < 0 ? `−${term}` : term) : cf < 0 ? `− ${term}` : `+ ${term}`);
  });
  return parts.length ? parts.join(' ') : '0';
}

/** Render Σ(aᵢ + bᵢ·k)·nameᵢ — the exam's symbolic answer shape. */
function decompSymStr(a: [number, number, number], b: [number, number, number], names: string[], sym: string): string {
  const parts: string[] = [];
  for (let i = 0; i < 3; i++) {
    const ai = Math.abs(a[i]) < 1e-3 ? 0 : a[i];
    const bi = Math.abs(b[i]) < 1e-3 ? 0 : b[i];
    if (ai === 0 && bi === 0) continue;
    let coef: string;
    let neg = false;
    if (bi === 0) {
      neg = ai < 0;
      const m = Math.abs(ai);
      coef = Math.abs(m - 1) < 2e-3 ? '' : `${cleanCoef(m)}·`;
    } else if (ai === 0) {
      neg = bi < 0;
      const m = Math.abs(bi);
      coef = `${Math.abs(m - 1) < 2e-3 ? '' : cleanCoef(m) + '·'}${sym}·`;
    } else if (bi > 0) {
      const kPart = Math.abs(bi - 1) < 2e-3 ? sym : `${cleanCoef(bi)}·${sym}`;
      coef = `(${kPart} ${ai < 0 ? '−' : '+'} ${cleanCoef(Math.abs(ai))})·`;
    } else {
      const kPart = Math.abs(bi + 1) < 2e-3 ? sym : `${cleanCoef(-bi)}·${sym}`;
      coef = `(${cleanCoef(ai)} − ${kPart})·`;
    }
    const term = `${coef}${names[i]}`;
    parts.push(parts.length === 0 ? (neg ? `−${term}` : term) : neg ? `− ${term}` : `+ ${term}`);
  }
  return parts.length ? parts.join(' ') : '0';
}

/**
 * Solve target = Σcᵢ·dirᵢ over 1–3 basis directions (issue #311 / [ADR-3D-072]). Three independent
 * vectors span R³, so n=3 keeps the exact `solve3x3` (null on singular). With FEWER declared basis
 * vectors — the planar/collinear sub-figures common in bagrut questions («SB=u, BC=v» and everything
 * happens in plane SBC) — the system is solved by the n×n Gram normal equations, and the answer is
 * accepted only when the RESIDUAL vanishes: an in-span target decomposes over the declared names, an
 * out-of-span one stays honestly null (never a least-squares approximation printed as knowledge).
 * Coefficients are padded with 0 to the fixed triple shape every consumer already uses.
 */
function nBasisSolve(dirs: Vec3[], target: Vec3): [number, number, number] | null {
  const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
  const len = (a: Vec3) => Math.sqrt(dot(a, a));
  const scale = Math.max(1, len(target), ...dirs.map(len));
  const RESID_TOL = 2e-4; // far above solver noise, far below any genuine out-of-span component
  if (dirs.length === 3) return solve3x3(dirs[0], dirs[1], dirs[2], target);
  let c: [number, number, number];
  if (dirs.length === 2) {
    const [d1, d2] = dirs;
    const g11 = dot(d1, d1), g12 = dot(d1, d2), g22 = dot(d2, d2);
    const det = g11 * g22 - g12 * g12;
    if (Math.abs(det) < 1e-10 * scale * scale * scale * scale) return null; // parallel/degenerate pair
    const r1 = dot(d1, target), r2 = dot(d2, target);
    c = [(r1 * g22 - r2 * g12) / det, (r2 * g11 - r1 * g12) / det, 0];
  } else if (dirs.length === 1) {
    const d = dirs[0];
    const g = dot(d, d);
    if (g < 1e-12) return null;
    c = [dot(d, target) / g, 0, 0];
  } else return null;
  const rx = target.x - c[0] * dirs[0].x - (dirs[1] ? c[1] * dirs[1].x : 0);
  const ry = target.y - c[0] * dirs[0].y - (dirs[1] ? c[1] * dirs[1].y : 0);
  const rz = target.z - c[0] * dirs[0].z - (dirs[1] ? c[1] * dirs[1].z : 0);
  if (Math.hypot(rx, ry, rz) > RESID_TOL * scale) return null; // out of the declared span — honest null
  return c;
}

/**
 * Decompose the vector (from→to) in the declared 1–3-vector `basis` across the resolved `posArr`,
 * requiring the per-seed coefficients to AGREE — affine relations are frame-invariant, so the basis is
 * usable per seed even when not world-stable. Returns the averaged coefficients (padded to a triple),
 * or null when a point is unplaced, the coefficients disagree (agreement tolerance sized for the
 * double-root √noise class, ~1e-4), or the target is outside the declared span. Before #311 this
 * hard-required THREE basis vectors, so a planar figure («SB=u, BC=v») refused every decomposition.
 */
export function basisDecompose(basis: { from: Id; to: Id }[], posArr: Positions3[], from: Id, to: Id): [number, number, number] | null {
  if (basis.length < 1 || basis.length > 3) return null;
  const per = posArr.map((pos) => {
    const p = pos.get(from);
    const q = pos.get(to);
    const dirs = basis.map((d) => {
      const f = pos.get(d.from);
      const t = pos.get(d.to);
      return f && t ? sub3(t, f) : null;
    });
    if (!p || !q || dirs.some((x) => !x)) return null;
    return nBasisSolve(dirs as Vec3[], sub3(q, p));
  });
  if (per.some((x) => !x)) return null;
  const [c0, c1, c2] = per as [number, number, number][];
  const agree = (u: number[], v: number[]) => u.every((x, i) => Math.abs(x - v[i]) < 2e-3);
  if (!agree(c0, c1) || !agree(c0, c2)) return null;
  return c0.map((x, i) => (x + c1[i] + c2[i]) / 3) as [number, number, number];
}

/**
 * The PARAMETRIC decomposition of (from→to) in the first-3 declared-vector basis — the affine-in-parameter
 * form `1/2·u + 1/2·v − t·w` — when the construction has exactly one parameter symbol (FREE like `k` in
 * `SN=k·SC`, OR CONSTRAINT-DRIVEN like `t` in `AE=t·AS` with `EO⊥AS` pinning it). Evaluated at symbol=0
 * and symbol=1 (REPLACING any existing pin on that symbol so the probes aren't fought by the driving
 * constraint) and linearised. Null when there is no single such symbol, or the vector is not actually
 * symbol-dependent. Shared by the data panel and the query lane (#297) so they can never diverge.
 *
 * A symbol counts as a PARAMETER only if it actually VARIES across configurations
 * ([ADR-3D-070](../../docs/06b-decisions-3d.md), issue #302). A symbol the constraints have nailed to a
 * constant is a number — whether it was pinned by value or, like `t` under `SO⊥ABCD` on a box, determined
 * at exactly ½ by its driving constraint. Testing the PIN KIND instead of the symbol's behaviour let one
 * determined symbol elsewhere in the figure suppress every parametric row.
 */
export function parametricDecomp(c: Construction3, from: Id, to: Id, seeds: number[]): string | null {
  const basisEntries = [...c.vectors.entries()].slice(0, 3);
  if (basisEntries.length < 1) return null; // 1–2 declared vectors are a real basis for a planar/collinear figure (#311)
  const basis = basisEntries.map(([, d]) => d);
  const names = basisEntries.map(([n]) => n);
  const posArr = seeds.map((s) => resolve3(c, s).positions);
  // a def whose OWN vector decomposes to stable coefficients is determined — its symbol does not vary.
  // `basisDecompose` already answers exactly this (it is why a pinned `AS` prints numerically), so the
  // predicate is a reuse of the shared sample set, never a second sampler (M3).
  const varies = ({ vd, i }: { vd: VecDef; i: number }) =>
    !c.symbolPins.some((p) => p.def === i && p.rel === 'value') &&
    basisDecompose(basis, posArr, vd.from, vd.unknown) === null;
  const syms = c.vecDefs.map((vd, i) => ({ vd, i })).filter(({ vd, i }) => vd.symbol && varies({ vd, i }));
  if (syms.length !== 1) return null; // 0 → nothing parametric; ≥2 → genuinely two-parameter (#301), never faked
  const sym = syms[0];
  const at = (kv: number): [number, number, number] | null => {
    const posArr = seeds.map((s) => resolve3({ ...c, symbolPins: [...c.symbolPins.filter((p) => p.def !== sym.i), { rel: 'value', value: kv, def: sym.i }] }, s).positions);
    return basisDecompose(basis, posArr, from, to);
  };
  const c0 = at(0);
  const c1 = at(1);
  if (!c0 || !c1) return null;
  const slope = c1.map((x, i) => x - c0[i]) as [number, number, number];
  if (slope.every((x) => Math.abs(x) < 1e-9)) return null; // not actually symbol-dependent
  return decompSymStr(c0, slope, names, sym.vd.symbol!);
}

const near = (a: number, b: number) => Math.abs(a - b) < EPS;
const sameVec = (a: Vec3, b: Vec3) => near(a.x, b.x) && near(a.y, b.y) && near(a.z, b.z);

/** Stated magnitudes: |pair| = value, from driving pins and recorded claims. */
function statedLengths(c: Construction3): Map<string, number> {
  const out = new Map<string, number>();
  const key = (a: Id, b: Id) => [a, b].sort().join('|');
  for (const pin of c.scalarPins) if (pin.kind === 'length') out.set(key(pin.a, pin.b), pin.value);
  for (const cl of c.claims) if (cl.type === 'length-eq') out.set(key(cl.a, cl.b), cl.value);
  return out;
}

export function dataView(c: Construction3, seed: number): DataPanel {
  const seeds = [seed, seed + 1013, seed + 2027];
  const resolved = seeds.map((s) => resolve3(c, s));
  const positions = resolved.map((r) => r.positions);
  const stablePair = (a: Id, b: Id): Vec3 | null => {
    const ds = positions.map((pos) => {
      const p = pos.get(a);
      const q = pos.get(b);
      return p && q ? sub3(q, p) : null;
    });
    if (ds.some((d) => !d)) return null;
    return sameVec(ds[0]!, ds[1]!) && sameVec(ds[0]!, ds[2]!) ? ds[0]! : null;
  };

  // an absolute frame exists only when something was injected — otherwise every
  // coordinate is gauge, and gauge must never print as data
  // #315 (ADR-3D-074, the ADR-3D-054 class — coordinate edition): WHICH coordinate family a pin
  // determines is semantic, not "was anything injected". A pure pair/vector injection fixes
  // direction+scale but NEVER translation — the pivot roots the figure at a deterministic gauge
  // origin, which defeats the seed-invariance knowledge gate (A read (0,0,0) at every seed and
  // printed as a derived fact the givens don't determine). POINT coordinates and plane equations
  // need TRANSLATION pinned (a real point injection); a VECTOR's coordinates (a difference —
  // translation cancels) need the ORIENTATION pinned: two independent pinned directions, or the
  // pair itself being the injected one (its coords are literally the given).
  const translationPinned = c.pins.length > 0;
  // Vector coordinates (a difference — translation cancels) keep the FRAME + seed-stability gate:
  // the seeds VARY the rotation/dims gauge (operator-validated 2026-07-25: with only DE=(0,2,0)
  // pinned, u's coords correctly do NOT print while v = 3·DE — parallel to the pin, genuinely
  // derivable — correctly DOES). Only TRANSLATION is a deterministic gauge the seeds never vary,
  // which is why the point/plane families need the explicit translationPinned anchor.
  const vectorFrame = translationPinned || c.vectorPins.length > 0 || c.pairPins.length > 0 || c.planePins.length > 0;
  // ADR-3D-054 (#268) — a LENGTH needs less than a coordinate does. A coordinate without a frame is
  // pure gauge, but a length is gauge only when the SCALE is free, and an absolute size given ("|u| = 3")
  // pins the scale with no coordinate frame anywhere. Gating magnitudes on `hasFrame` therefore withheld
  // values the engine had already solved exactly: the operator's prism reported |u| and |v| (stated) but
  // never |w| = 2.5, though it is forced by the givens and identical in every sampled configuration.
  // The second gate is still needed — the first dim of every solid is the frozen similarity gauge, so a
  // bare cube reports |AB| = 1.000000 at every seed and dropping the check outright would print that as
  // data (the ADR-052 cardinal sin). `scalePinned` is the right question, and lives with the solver that
  // asks it too, so the two can't drift.
  const hasScale = scalePinned(c);

  const vecNames = [...c.vectors.entries()];
  const basis = vecNames.slice(0, 3);

  // Plain decomposition (numeric coefficients agreeing across seeds) and the PARAMETRIC form
  // (affine in the construction's single free/driven parameter — #297) share their engine with
  // the QUERY lane via `basisDecompose`/`parametricDecomp`, so a panel row and its query answer
  // can never diverge (the operator's «AE» query used to fall through to «depends on α» while the
  // panel showed `AE = t·w`). `decomposeSym` runs only when the plain `decompose` is null, so a
  // determined figure (the `|EN|=√6/4·|w|` path) still shows its numeric decomposition.
  const basisDefs = basis.map(([, d]) => d);
  const decompose = (a: Id, b: Id) => basisDecompose(basisDefs, positions, a, b);
  const decomposeSym = (a: Id, b: Id) => parametricDecomp(c, a, b, seeds);

  const lengths = statedLengths(c);
  const pairKey = (a: Id, b: Id) => [a, b].sort().join('|');
  const entries: VecEntry[] = [];
  const seen = new Set<string>();
  const basisNames = basis.map(([n]) => n);

  const addEntry = (label: string, a: Id, b: Id, isBasisVec: boolean) => {
    const k = pairKey(a, b);
    if (seen.has(k)) return;
    seen.add(k);
    const coefs = isBasisVec ? null : decompose(a, b);
    const symDecomp = !isBasisVec && !coefs ? decomposeSym(a, b) : null;
    const d = stablePair(a, b);
    // a magnitude is knowledge when STATED — or when the frame DERIVES it: identical
    // in every sampled configuration (the |u|=|v| class-value gate; operator 2026-07-09:
    // |BB'| = 18 is forced by the plane given + B, the student never has to type it)
    let mag = lengths.get(k);
    if (mag === undefined && hasScale) {
      const per = positions.map((pos) => {
        const p = pos.get(a);
        const q = pos.get(b);
        return p && q ? Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) : null;
      });
      if (per.every((m): m is number => m !== null) && per.every((m) => Math.abs(m! - per[0]!) < 1e-6 * Math.max(1, per[0]!))) {
        mag = per[0]!;
      }
    }
    const entry: VecEntry = {
      label,
      decomp: coefs ? decompStr(coefs, basisNames) : symDecomp,
      coords: vectorFrame && d ? coordStr(d) : null, // #315: seed-stability distinguishes derivable from gauge for vectors; translation alone needs the explicit anchor
      mag: mag !== undefined ? `|${label}| = ${cleanMag(mag)}` : null,
      sq: mag !== undefined ? `${label}² = ${cleanNum(mag * mag)}` : null,
    };
    if (entry.decomp || entry.coords || entry.mag) entries.push(entry);
  };

  // declared vectors first (coords + stated magnitude), then auxiliary segments (decomp + coords)
  for (const [name, d] of vecNames) addEntry(name, d.from, d.to, true);
  for (const [a, b] of c.segments) addEntry(`${a}${b}`, a, b, false);

  // derived magnitude equalities among the declared vectors: |u| = |v| = |w| — equal in
  // EVERY sampled configuration (each seed has its own scale; the EQUALITY is the fact)
  const relations: string[] = [];
  // #319 — LABELED line↔plane angles («זוית בין SB ומישור ABC היא α»): derive `α = X°` when the
  // angle is identical in every sampled configuration (angles are scale-free — no scale gate;
  // the same knowledge discipline as every derived value). sin β = |n·u|/(|n||u|), n = Newell
  // normal of the plane's point-run.
  for (const mk of c.linePlaneMarks) {
    const per = positions.map((pos) => linePlaneAngleAt(pos, mk.a, mk.b, mk.plane));
    if (per.every((v): v is number => v !== null) && per.every((v) => Math.abs(v - per[0]!) < 1e-4)) {
      relations.push(`${mk.label} = ${cleanNum(per[0]!, 1e-3)}°`);
    }
  }
  {
    const mags = vecNames.map(([name, d]) => ({
      name,
      per: positions.map((pos) => {
        const p = pos.get(d.from);
        const q = pos.get(d.to);
        return p && q ? Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) : null;
      }),
    }));
    const used = new Set<string>();
    for (let i = 0; i < mags.length; i++) {
      if (used.has(mags[i].name) || mags[i].per.some((m) => m === null)) continue;
      const cls = [mags[i].name];
      for (let j = i + 1; j < mags.length; j++) {
        if (used.has(mags[j].name) || mags[j].per.some((m) => m === null)) continue;
        const equalEverywhere = mags[i].per.every((m, s) => Math.abs(m! - mags[j].per[s]!) <= 1e-6 * Math.max(1, m!));
        if (equalEverywhere) {
          cls.push(mags[j].name);
          used.add(mags[j].name);
        }
      }
      if (cls.length > 1) {
        const stated = cls.map((n) => lengths.get(pairKey(c.vectors.get(n)!.from, c.vectors.get(n)!.to))).find((v) => v !== undefined);
        // no stated number? a frame can still DERIVE one — append it when the class
        // length is the same in every sampled configuration (scale is pinned)
        const per = mags[i].per as number[];
        const derived =
          stated === undefined && hasScale && per.every((m) => Math.abs(m - per[0]) < 1e-6 * Math.max(1, per[0])) ? per[0] : undefined;
        const val = stated ?? derived;
        relations.push(cls.map((n) => `|${n}|`).join(' = ') + (val !== undefined ? ` = ${cleanMag(val)}` : ''));
      }
    }
  }

  // derived PERPENDICULARITY among the declared vectors: u·v = 0 (operator, 2026-07-08).
  // The dot product's VALUE is gauge (scale varies per seed), but its being ZERO is a
  // shape property — invariant across every sampled configuration; so a pair reads as
  // perpendicular iff the normalised dot (the cosine) is ~0 in EVERY seed (the same
  // multi-sample discipline the magnitude equalities use). ⊥ from construction (cube /
  // pyramid-height edges) or from a stated ⟂ given both surface identically.
  {
    const dirs = vecNames.map(([name, d]) => ({
      name,
      per: positions.map((pos) => {
        const p = pos.get(d.from);
        const q = pos.get(d.to);
        return p && q ? sub3(q, p) : null;
      }),
    }));
    for (let i = 0; i < dirs.length; i++) {
      for (let j = i + 1; j < dirs.length; j++) {
        const a = dirs[i].per;
        const b = dirs[j].per;
        if (a.some((x) => !x) || b.some((x) => !x)) continue;
        const perp = a.every((x, s) => {
          const va = x!;
          const vb = b[s]!;
          const na = Math.hypot(va.x, va.y, va.z);
          const nb = Math.hypot(vb.x, vb.y, vb.z);
          if (na < EPS || nb < EPS) return false; // a degenerate (zero-length) vector isn't "perpendicular"
          return Math.abs(dot3(va, vb)) / (na * nb) < 1e-4; // |cos θ| ≈ 0
        });
        if (perp) relations.push(`${dirs[i].name}·${dirs[j].name} = 0`);
      }
    }
  }

  // #94 — named-angle MARKERS (`∠SDB` / `∠SDB = α`): the measure, printed ONLY when it agrees across every
  // sampled seed (a determined angle — the same knowledge gate as |u|=|v| and forced plane equations). An
  // under-determined marker draws its arc but shows no value. Labelled `α = 35.26°` when named, else `∠SDB`.
  for (const mk of c.angleMarks) {
    const degs = positions.map((pos) => {
      const v = pos.get(mk.vertex), p = pos.get(mk.p), q = pos.get(mk.q);
      if (!v || !p || !q) return null;
      const u1 = sub3(p, v), u2 = sub3(q, v);
      const n1 = Math.sqrt(dot3(u1, u1)), n2 = Math.sqrt(dot3(u2, u2));
      if (n1 < EPS || n2 < EPS) return null;
      return (Math.acos(Math.max(-1, Math.min(1, dot3(u1, u2) / (n1 * n2)))) * 180) / Math.PI;
    });
    if (degs.some((d) => d === null)) continue;
    const [g0, g1, g2] = degs as number[];
    if (Math.abs(g0 - g1) > 0.05 || Math.abs(g0 - g2) > 0.05) continue; // seed-varying → not knowledge, no value
    relations.push(`${mk.label ?? `∠${mk.p}${mk.vertex}${mk.q}`} = ${cleanNum(g0)}°`);
  }

  // #297 — forced/stated ANGLE EQUALITIES (∠SAD = ∠SAB): when two+ markers are equal in EVERY sampled
  // seed but their shared value is FREE (so the value loop above printed nothing), surface the equality
  // itself — the same scale-free knowledge as |u| = |v| (∠SAD=∠SAB=α lowers to a cos-eq constraint, so the
  // pair IS forced). A determined group is already printed per-marker by the value loop; an under-determined
  // SINGLE marker (the #94 case) still prints nothing.
  {
    const marks = c.angleMarks
      .map((mk) => ({
        mk,
        per: positions.map((pos) => {
          const v = pos.get(mk.vertex), p = pos.get(mk.p), q = pos.get(mk.q);
          if (!v || !p || !q) return null;
          const u1 = sub3(p, v), u2 = sub3(q, v);
          const n1 = Math.sqrt(dot3(u1, u1)), n2 = Math.sqrt(dot3(u2, u2));
          if (n1 < EPS || n2 < EPS) return null;
          return (Math.acos(Math.max(-1, Math.min(1, dot3(u1, u2) / (n1 * n2)))) * 180) / Math.PI;
        }),
      }))
      .filter((m) => m.per.every((d) => d !== null));
    const used = new Set<number>();
    for (let i = 0; i < marks.length; i++) {
      if (used.has(i)) continue;
      const cls = [marks[i]];
      for (let j = i + 1; j < marks.length; j++) {
        if (!used.has(j) && marks[i].per.every((d, s) => Math.abs(d! - marks[j].per[s]!) < 0.05)) {
          cls.push(marks[j]);
          used.add(j);
        }
      }
      if (cls.length < 2) continue; // a lone marker is handled by the value loop above
      if (cls[0].per.every((d) => Math.abs(d! - cls[0].per[0]!) < 0.05)) continue; // determined → value loop printed it
      relations.push(cls.map((m) => `∠${m.mk.p}${m.mk.vertex}${m.mk.q}`).join(' = '));
    }
  }

  // points with STABLE coordinates (needs a frame; a pinned-only figure prints nothing sampled).
  // A coordinate is KNOWLEDGE only when it is identical in EVERY sampled configuration —
  // an unstable (seed-varying) coordinate never prints at all (operator rule, 2026-07-09:
  // a number on a node is read as known; one drawing's sample is not knowledge).
  const points: string[] = [];
  const pointCoords: Record<string, { text: string; kind: 'fact' | 'partial' }> = {};
  if (translationPinned) { // #315: a point coordinate is gauge until a real point injection anchors translation
    const axes = ['x', 'y', 'z'] as const;
    for (const id of positions[0].keys()) {
      const ps = positions.map((pos) => pos.get(id));
      if (ps.some((p) => !p)) continue;
      const stableAx = axes.map((ax) => near(ps[0]![ax], ps[1]![ax]) && near(ps[0]![ax], ps[2]![ax]));
      const nStable = stableAx.filter(Boolean).length;
      if (nStable === 3) {
        const cs = coordStr(ps[0]!);
        pointCoords[id] = { text: cs, kind: 'fact' };
        points.push(`${id}${cs}`);
      } else if (nStable > 0) {
        // PARTIALLY determined (S with only A,B injected: y = 0 is a fact while the
        // base tilts about AB): known components print, free ones read '?' — and a
        // STATED sign given upgrades the '?' to '+?'/'−?' (the sign is knowledge too;
        // never inferred from sample coincidence)
        const free = (ax: 'x' | 'y' | 'z'): string => {
          const sg = c.signGivens.find((g) => g.id === id && g.axis === ax);
          return sg ? (sg.positive ? '+?' : '−?') : '?';
        };
        const cs = `(${axes.map((ax, i) => (stableAx[i] ? cleanMag(ps[0]![ax]) : free(ax))).join(', ')})`;
        pointCoords[id] = { text: cs, kind: 'partial' };
        points.push(`${id}${cs}`);
      }
      // no stable axis at all → no label (a sample coordinate is not knowledge)
    }
  }

  // named planes (point-run / rel-plane) whose EQUATION is forced — identical up to
  // scale in EVERY sampled configuration (the same multi-sample gate; operator request
  // 2026-07-09: `מישור ABB'A'` should surface its equation, the exam's מצאו את משוואת
  // המישור). An equation-plane was GIVEN by equation — nothing to derive.
  const planes: string[] = [];
  if (translationPinned) { // #315: a plane equation's d-term is translation-dependent — same anchor requirement
    for (const name of [...c.pointPlanes.keys(), ...c.relPlanes.keys()]) {
      const per = resolved.map((r) => r.planes.get(name));
      if (per.some((p) => !p)) continue;
      const canon = per.map((p) => {
        const n = Math.hypot(p!.n.x, p!.n.y, p!.n.z);
        if (n < EPS) return null;
        const u = { x: p!.n.x / n, y: p!.n.y / n, z: p!.n.z / n, d: p!.d / n };
        const lead = [u.x, u.y, u.z].find((v) => Math.abs(v) > 1e-6) ?? 1;
        return lead < 0 ? { x: -u.x, y: -u.y, z: -u.z, d: -u.d } : u;
      });
      if (canon.some((v) => !v)) continue;
      const keys = ['x', 'y', 'z', 'd'] as const;
      if (!canon.every((v) => keys.every((k) => Math.abs(v![k] - canon[0]![k]) < 1e-4))) continue;
      planes.push(`${name}: ${planeEqStr(canon[0]!)}`);
      // the parametric form rides when the run's anchor point and spanning edges are stable
      const run = c.pointPlanes.get(name);
      if (run && run.length >= 3) {
        const p0s = positions.map((pos) => pos.get(run[0]));
        const anchorStable = p0s.every((p): p is Vec3 => !!p) && sameVec(p0s[0]!, p0s[1]!) && sameVec(p0s[0]!, p0s[2]!);
        const e1 = stablePair(run[0], run[1]);
        const e2 = stablePair(run[0], run[run.length - 1]);
        if (anchorStable && e1 && e2) {
          planes.push(`${name}: x = ${coordStr(p0s[0]!)} + t·${coordStr(e1)} + s·${coordStr(e2)}`);
        }
      }
    }
  }

  // #325 (ADR-3D-079 Am. 2): the pins' open symbols — determined values print, free ones read
  // open, so `B(2t, t, k)` visibly registers even while the coordinates still read `?`.
  const params: DataPanel['params'] = [];
  for (const sym of pinSymsOf(c)) {
    const vals = resolved.map((r) => r.pivot?.pinSymbols?.[sym]);
    const nums = vals.filter((v): v is number => v !== undefined && Number.isFinite(v));
    const stable =
      nums.length === resolved.length && nums.every((v) => Math.abs(v - nums[0]) <= 1e-4 * Math.max(1, Math.abs(nums[0])));
    params.push(stable ? { sym, text: `${sym} = ${cleanNum(nums[0], 1e-4)}`, open: false } : { sym, text: `${sym} = ?`, open: true });
  }

  return { relations, vectors: entries, points, pointCoords, planes, params };
}
