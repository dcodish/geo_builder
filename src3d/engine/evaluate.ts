/**
 * Topological evaluation: Construction3 + seed → world coordinates (docs/20 §6.1).
 *
 * Free-DOF policy (ADR-052 transplanted):
 *  - A cube's edge is the figure's SCALE — pure similarity gauge (ADR-101), so it is
 *    fixed at 1 and "show another configuration" rightly does not vary it (a resample
 *    that only rescales is invisible after the renderer's fit).
 *  - A box's two aspect ratios and a prism's base-triangle shape + height ARE shape
 *    DOFs: sampled per (seed, stable key) and varied by resample.
 *  - An on-segment point with no stated t is a free 1-DOF slider, sampled likewise.
 *
 * Samples are keyed by object identity (ids), never insertion order — the stability rule.
 */

import { sample } from './rng';
import { decompose3 } from './vecExpr';
import type { Construction3, Id, LinExpr, PointDef, Positions3 } from './types';
import { add3, centroid3, cross3, dot3, lerp3, norm3, normalize3, scale3, sub3, v3, type Vec3 } from './vec3';

/** Deg → rad. */
const rad = (d: number) => (d * Math.PI) / 180;

/** Base-triangle apex from base A=(0,0), B=(1,0) and the two base angles (both < 90°). */
function apexFromBaseAngles(alpha: number, beta: number): { x: number; y: number } {
  const ta = Math.tan(alpha);
  const tb = Math.tan(beta);
  const x = tb / (ta + tb);
  const y = (ta * tb) / (ta + tb);
  return { x, y };
}

/** World positions of one solid's vertices, in `ids` order. `origin` separates multiple solids. */
function solidPositions(kind: 'cube' | 'box' | 'prism3', key: string, seed: number, origin: Vec3): Vec3[] {
  const o = origin;
  if (kind === 'cube') {
    const s = 1; // scale gauge — see file header
    return [
      v3(o.x, o.y, o.z), v3(o.x + s, o.y, o.z), v3(o.x + s, o.y + s, o.z), v3(o.x, o.y + s, o.z),
      v3(o.x, o.y, o.z + s), v3(o.x + s, o.y, o.z + s), v3(o.x + s, o.y + s, o.z + s), v3(o.x, o.y + s, o.z + s),
    ];
  }
  if (kind === 'box') {
    const a = 1; // scale gauge
    const b = sample(seed, `${key}-depth`, 0.55, 1.7);
    const h = sample(seed, `${key}-height`, 0.5, 1.4);
    return [
      v3(o.x, o.y, o.z), v3(o.x + a, o.y, o.z), v3(o.x + a, o.y + b, o.z), v3(o.x, o.y + b, o.z),
      v3(o.x, o.y, o.z + h), v3(o.x + a, o.y, o.z + h), v3(o.x + a, o.y + b, o.z + h), v3(o.x, o.y + b, o.z + h),
    ];
  }
  // prism3 — right triangular prism: base ABC in the z=origin plane, tops straight up.
  const alpha = rad(sample(seed, `${key}-alpha`, 38, 72));
  const beta = rad(sample(seed, `${key}-beta`, 38, 72));
  const h = sample(seed, `${key}-height`, 0.65, 1.5);
  const c = apexFromBaseAngles(alpha, beta);
  const base = [v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + c.x, o.y + c.y, o.z)];
  return [...base, ...base.map((p) => v3(p.x, p.y, p.z + h))];
}

// ---------------------------------------------------------------------------
// V2 — the algebraic lane's resolver (docs/20 §6.3, ADR-3D-004)
// ---------------------------------------------------------------------------

/** A numerically resolved plane: n·p + d = 0. */
export interface ResolvedPlane {
  n: Vec3;
  d: number;
}

/** A numerically resolved line: anchor + t·dir. */
export interface ResolvedLine {
  anchor: Vec3;
  dir: Vec3;
}

/** The full resolved figure — positions plus the algebraic objects and the parameter's fate. */
export interface Resolved3 {
  positions: Positions3;
  planes: Map<string, ResolvedPlane>;
  lines: Map<string, ResolvedLine>;
  /** The parameter's chosen value + every root of the pinning relation (branches), when one exists. */
  param: { name: string; value: number; roots: number[] } | null;
}

const linVal = (e: LinExpr, a: number): number => e.k + e.p * a;

function planeAt(c: Construction3, name: string, a: number): ResolvedPlane {
  const p = c.planes.get(name)!;
  return { n: v3(linVal(p.cx, a), linVal(p.cy, a), linVal(p.cz, a)), d: linVal(p.d, a) };
}

/** A plane's numeric form at a given parameter value (claims need to scan over the parameter). */
export const planeAtParam = planeAt;

/** A line's numeric form at a given parameter value: parametric evaluated; plane∩plane recomputed. */
export function lineAtParam(c: Construction3, name: string, a: number): ResolvedLine | null {
  const def = c.lines.get(name);
  if (!def) return null;
  if (def.kind === 'parametric') {
    return {
      anchor: v3(linVal(def.anchor[0], a), linVal(def.anchor[1], a), linVal(def.anchor[2], a)),
      dir: v3(linVal(def.dir[0], a), linVal(def.dir[1], a), linVal(def.dir[2], a)),
    };
  }
  return planePlaneLine(planeAt(c, def.p1, a), planeAt(c, def.p2, a));
}

/** cos of the angle between two planes (formula-sheet form: |n1·n2|/(|n1||n2|)); NaN when degenerate. */
function planesCos(c: Construction3, p1: string, p2: string, a: number): number {
  const r1 = planeAt(c, p1, a);
  const r2 = planeAt(c, p2, a);
  const denom = norm3(r1.n) * norm3(r2.n);
  return denom < 1e-12 ? NaN : Math.abs(dot3(r1.n, r2.n)) / denom;
}

const SCAN_LO = -25;
const SCAN_HI = 25;
const SCAN_STEP = 0.02;

/** Sign-change roots of f over the scan range (bisection-refined). */
function signChangeRoots(f: (a: number) => number): number[] {
  const roots: number[] = [];
  let prevA = SCAN_LO;
  let prevF = f(SCAN_LO);
  for (let a = SCAN_LO + SCAN_STEP; a <= SCAN_HI + 1e-9; a += SCAN_STEP) {
    const fa = f(a);
    if (!Number.isNaN(prevF) && !Number.isNaN(fa)) {
      if (prevF === 0) roots.push(prevA);
      else if (prevF * fa < 0) {
        let lo = prevA;
        let hi = a;
        let flo = prevF;
        for (let i = 0; i < 80; i++) {
          const mid = (lo + hi) / 2;
          const fm = f(mid);
          if (flo * fm <= 0) hi = mid;
          else {
            lo = mid;
            flo = fm;
          }
        }
        roots.push((lo + hi) / 2);
      }
    }
    prevA = a;
    prevF = fa;
  }
  return roots;
}

/**
 * Zeros of a NON-NEGATIVE residual (e.g. |dir × n| for a ⟂ given — it touches zero
 * without a sign change): local-minima scan + ternary refinement, accepted when the
 * refined minimum is numerically zero.
 */
function touchZeroRoots(g: (a: number) => number): number[] {
  const roots: number[] = [];
  const N = Math.round((SCAN_HI - SCAN_LO) / SCAN_STEP);
  const vals: number[] = [];
  for (let i = 0; i <= N; i++) vals.push(g(SCAN_LO + i * SCAN_STEP));
  for (let i = 1; i < N; i++) {
    if (Number.isNaN(vals[i]) || vals[i] > vals[i - 1] || vals[i] > vals[i + 1]) continue;
    let lo = SCAN_LO + (i - 1) * SCAN_STEP;
    let hi = SCAN_LO + (i + 1) * SCAN_STEP;
    for (let k = 0; k < 200; k++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (g(m1) <= g(m2)) hi = m2;
      else lo = m1;
    }
    const at = (lo + hi) / 2;
    if (g(at) < 1e-6) roots.push(at);
  }
  return roots;
}

const snapAndDedupe = (roots: number[]): number[] => {
  const out: number[] = [];
  for (const r of roots) {
    const snapped = Math.abs(r - Math.round(r)) < 1e-6 ? Math.round(r) : r;
    if (!out.some((x) => Math.abs(x - snapped) < 1e-5)) out.push(snapped);
  }
  return out.sort((a, b) => a - b);
};

/** The perpendicularity residual |dir(m) × n(m)| (0 ⟺ the line is ⟂ to the plane). */
function perpResidual(c: Construction3, line: string, plane: string, a: number): number {
  const ln = lineAtParam(c, line, a);
  if (!ln) return NaN;
  const pl = planeAt(c, plane, a);
  return norm3(cross3(ln.dir, pl.n));
}

/** Does the parameter value satisfy EVERY pinning given (angles + ⟂s)? */
function satisfiesAllPins(c: Construction3, a: number): boolean {
  for (const g of c.planeAngles) {
    const cos = planesCos(c, g.p1, g.p2, a);
    if (Number.isNaN(cos) || Math.abs(cos - Math.cos((g.deg * Math.PI) / 180)) > 1e-6) return false;
  }
  for (const g of c.linePerps) {
    const r = perpResidual(c, g.line, g.plane, a);
    if (Number.isNaN(r) || r > 1e-5) return false;
  }
  return true;
}

/** How many givens pin the parameter (none ⇒ it is a free sampled DOF). */
export const pinningGivens = (c: Construction3): number => c.planeAngles.length + c.linePerps.length;

/**
 * All parameter values satisfying EVERY pinning given — 1-DOF numeric root-finding
 * only (the docs/20 D3 boundary): sign-change bisection for angle givens, minima
 * scan for ⟂ givens (a non-negative residual), then cross-filtered so a root must
 * satisfy the whole set.
 */
export function paramRoots(c: Construction3): number[] {
  if (pinningGivens(c) === 0) return [];
  const candidates: number[] = [];
  for (const g of c.planeAngles) {
    const target = Math.cos((g.deg * Math.PI) / 180);
    candidates.push(...signChangeRoots((a) => planesCos(c, g.p1, g.p2, a) - target));
  }
  for (const g of c.linePerps) {
    candidates.push(...touchZeroRoots((a) => perpResidual(c, g.line, g.plane, a)));
  }
  return snapAndDedupe(candidates.filter((a) => satisfiesAllPins(c, a)));
}

const onPlane = (p: Vec3, pl: ResolvedPlane): boolean => Math.abs(dot3(pl.n, p) + pl.d) <= 1e-7 * (1 + norm3(pl.n));

/**
 * Pick the parameter's value for this seed: an explicit `branch` on a plane-angle
 * wins; otherwise a membership given (`on one of the planes`) SELECTS the root
 * where it holds (the 2022-Q2 flow); otherwise the seed cycles the roots ("show
 * another configuration" = the other branch); an unpinned parameter is a FREE
 * DOF, sampled (ADR-052 — never a silent fixed default).
 */
function chooseParam(c: Construction3, coordPos: Positions3, seed: number): { value: number; roots: number[] } | null {
  if (!c.param) return null;
  const roots = paramRoots(c);
  if (pinningGivens(c) === 0) {
    return { value: sample(seed, `param-${c.param}`, -3, 3), roots: [] };
  }
  if (roots.length === 0) return { value: NaN, roots }; // no-roots — surfaced as an honest error
  const explicit = [...c.planeAngles, ...c.linePerps].find((g) => g.branch !== undefined)?.branch;
  if (explicit !== undefined) return { value: roots[((explicit % roots.length) + roots.length) % roots.length], roots };
  for (const m of c.memberships) {
    const p = coordPos.get(m.id);
    if (!p) continue;
    for (const root of roots) {
      const names = m.plane === 'any' ? [...c.planes.keys()] : [m.plane];
      if (names.some((name) => onPlane(p, planeAt(c, name, root)))) return { value: root, roots };
    }
  }
  return { value: roots[seed % roots.length], roots };
}

function footOnPlane(from: Vec3, pl: ResolvedPlane): Vec3 {
  const t = (dot3(pl.n, from) + pl.d) / dot3(pl.n, pl.n);
  return sub3(from, scale3(pl.n, t));
}

function footOnLine(from: Vec3, line: ResolvedLine): Vec3 {
  const t = dot3(sub3(from, line.anchor), line.dir) / Math.max(dot3(line.dir, line.dir), 1e-12);
  return add3(line.anchor, scale3(line.dir, t));
}

/** The intersection line of two planes: dir = n1×n2, anchor = the closest-to-origin solution. */
export function intersectPlanes(a: ResolvedPlane, b: ResolvedPlane): ResolvedLine | null {
  return planePlaneLine(a, b);
}

function planePlaneLine(a: ResolvedPlane, b: ResolvedPlane): ResolvedLine | null {
  const dir = cross3(a.n, b.n);
  if (norm3(dir) < 1e-10) return null; // parallel planes
  // anchor solves n1·p+d1=0, n2·p+d2=0, dir·p=0 (the minimal-norm point)
  const anchor = solve3x3(a.n, b.n, dir, v3(-a.d, -b.d, 0));
  return anchor ? { anchor, dir: normalize3(dir) } : null;
}

/** Solve [r1;r2;r3]·p = rhs by Cramer (rows r1..r3). */
function solve3x3(r1: Vec3, r2: Vec3, r3: Vec3, rhs: Vec3): Vec3 | null {
  const det = dot3(r1, cross3(r2, r3));
  if (Math.abs(det) < 1e-12) return null;
  const dx = dot3(v3(rhs.x, r1.y, r1.z), cross3(v3(rhs.y, r2.y, r2.z), v3(rhs.z, r3.y, r3.z)));
  const dy = dot3(v3(r1.x, rhs.x, r1.z), cross3(v3(r2.x, rhs.y, r2.z), v3(r3.x, rhs.z, r3.z)));
  const dz = dot3(v3(r1.x, r1.y, rhs.x), cross3(v3(r2.x, r2.y, rhs.y), v3(r3.x, r3.y, rhs.z)));
  return v3(dx / det, dy / det, dz / det);
}

/** Resolve the FULL figure: parameter → planes → lines → every point in insertion order. */
export function resolve3(c: Construction3, seed: number): Resolved3 {
  const pos: Positions3 = new Map<Id, Vec3>();

  // coordinate points don't depend on anything — place them first (membership branch-selection reads them)
  for (const [id, def] of c.points) {
    if (def.kind === 'coord') pos.set(id, v3(def.x, def.y, def.z));
  }

  const param = c.param ? chooseParam(c, pos, seed) : null;
  const a = param && Number.isFinite(param.value) ? param.value : 0;

  const planes = new Map<string, ResolvedPlane>();
  for (const name of c.planes.keys()) planes.set(name, planeAt(c, name, a));

  const lines = new Map<string, ResolvedLine>();
  for (const [name] of c.lines) {
    const line = lineAtParam(c, name, a);
    if (line) lines.set(name, line);
  }

  evaluateSolidsAndPoints(c, seed, pos, planes, lines);

  return {
    positions: pos,
    planes,
    lines,
    param: c.param && param ? { name: c.param, value: param.value, roots: param.roots } : null,
  };
}

/** Evaluate every point's world position. Parents always precede children (apply enforces it). */
export function evaluate3(c: Construction3, seed: number): Positions3 {
  return resolve3(c, seed).positions;
}

function evaluateSolidsAndPoints(
  c: Construction3,
  seed: number,
  pos: Positions3,
  planes: Map<string, ResolvedPlane>,
  lines: Map<string, ResolvedLine>,
): void {
  c.solids.forEach((solid, i) => {
    const key = `solid-${solid.kind}-${solid.ids.join('')}`;
    const origin = v3(i * 2.5, 0, 0); // side-by-side when a figure ever holds two solids
    const ps = solidPositions(solid.kind, key, seed, origin);
    solid.ids.forEach((id, j) => pos.set(id, ps[j]));
  });

  for (const [id, def] of c.points) {
    if (def.kind === 'solid-vertex' || def.kind === 'coord') continue;
    if (def.kind === 'on-segment') {
      const a = pos.get(def.a);
      const b = pos.get(def.b);
      if (!a || !b) continue; // unreachable if apply enforced parents; stay total anyway
      const t = def.t ?? sample(seed, `t-${id}-${def.a}-${def.b}`, 0.22, 0.78);
      pos.set(id, lerp3(a, b, t));
    } else if (def.kind === 'centroid') {
      const ps = def.of.map((p) => pos.get(p));
      if (ps.some((p) => !p)) continue;
      pos.set(id, centroid3(ps as Vec3[]));
    } else if (def.kind === 'in-span') {
      pos.set(id, inSpanPosition(c, def, pos));
    } else if (def.kind === 'foot-plane') {
      const from = pos.get(def.from);
      const pl = planes.get(def.plane);
      if (from && pl) pos.set(id, footOnPlane(from, pl));
    } else if (def.kind === 'foot-line') {
      const from = pos.get(def.from);
      const line = lines.get(def.line);
      if (from && line) pos.set(id, footOnLine(from, line));
    } else if (def.kind === 'line-plane') {
      const line = lines.get(def.line);
      const pl = planes.get(def.plane);
      if (line && pl) {
        const denom = dot3(pl.n, line.dir);
        if (Math.abs(denom) > 1e-10 * Math.max(norm3(pl.n) * norm3(line.dir), 1e-12)) {
          const t = -(dot3(pl.n, line.anchor) + pl.d) / denom;
          pos.set(id, add3(line.anchor, scale3(line.dir, t)));
        }
        // parallel ⇒ no position — derive3 flags `line-misses-plane` honestly
      }
    }
  }
}

/** The declared basis in a stable order, or null if not exactly 3 / endpoints unplaced. */
function basisVectors(c: Construction3, pos: Positions3): { names: string[]; vecs: Vec3[] } | null {
  if (c.vectors.size !== 3) return null;
  const names: string[] = [];
  const vecs: Vec3[] = [];
  for (const [name, def] of c.vectors) {
    const a = pos.get(def.from);
    const b = pos.get(def.to);
    if (!a || !b) return null;
    names.push(name);
    vecs.push(sub3(b, a));
  }
  return { names, vecs };
}

/**
 * The closed-form in-span drive (docs/20 §6.2 — affine, no iteration): the
 * complement coefficient of decompose(vecFrom→P(t)) is affine in t, so its zero
 * is one division. Degenerate cases fall back to the midpoint; the STORE's
 * post-check flags them honestly (`no-solution`) so a silent wrong figure is
 * impossible (the fact is refused, keep-prior).
 */
function inSpanPosition(c: Construction3, def: Extract<PointDef, { kind: 'in-span' }>, pos: Positions3): Vec3 {
  const a = pos.get(def.a)!;
  const b = pos.get(def.b)!;
  const k = pos.get(def.vecFrom)!;
  const fallback = lerp3(a, b, 0.5);
  const basis = basisVectors(c, pos);
  if (!basis) return fallback;
  const compIndex = basis.names.findIndex((n) => !def.span.includes(n));
  if (compIndex < 0) return fallback;
  const d0 = decompose3(sub3(a, k), basis.vecs[0], basis.vecs[1], basis.vecs[2]);
  const d1 = decompose3(sub3(b, k), basis.vecs[0], basis.vecs[1], basis.vecs[2]);
  if (!d0 || !d1) return fallback;
  const c0 = d0[compIndex];
  const c1 = d1[compIndex];
  if (Math.abs(c0 - c1) < 1e-12) return fallback;
  const t = c0 / (c0 - c1);
  return Number.isFinite(t) ? lerp3(a, b, t) : fallback;
}

/**
 * Post-check for an in-span point at the DISPLAY seed (the store surfaces the
 * verdict): does vecFrom→P really lie in the span, and does P sit ON the stated
 * segment (`על` means the segment, not the line — the 2-D ADR-077 principle)?
 */
export function checkInSpan(
  c: Construction3,
  id: Id,
  def: Extract<PointDef, { kind: 'in-span' }>,
  pos: Positions3,
): 'ok' | 'no-solution' | 'not-on-segment' {
  const p = pos.get(id);
  const a = pos.get(def.a);
  const b = pos.get(def.b);
  const k = pos.get(def.vecFrom);
  const basis = basisVectors(c, pos);
  if (!p || !a || !b || !k || !basis) return 'no-solution';
  const compIndex = basis.names.findIndex((n) => !def.span.includes(n));
  const d = decompose3(sub3(p, k), basis.vecs[0], basis.vecs[1], basis.vecs[2]);
  if (compIndex < 0 || !d) return 'no-solution';
  if (Math.abs(d[compIndex]) > 1e-7 * (1 + Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]))) return 'no-solution';
  const ab = sub3(b, a);
  const t = dot3(sub3(p, a), ab) / Math.max(dot3(ab, ab), 1e-12);
  if (norm3(ab) < 1e-12 || t < -1e-9 || t > 1 + 1e-9) return 'not-on-segment';
  return 'ok';
}
