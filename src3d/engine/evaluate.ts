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
import { defaultViewFrame } from './defaultView';
import {
  isAbsolute,
  lineDirCarriesParam,
  lineRelDeviation,
  mutualHolds,
  mutualSides,
  MUTUAL_VERIFY_TOL,
  planeNormalCarriesParam,
  resolveOperand,
} from './operands';
import { applyGauge, solvePivot, type MemberPin, type PivotResult } from './solve3';
import { decompose3 } from './vecExpr';
import { pinSymsOf } from './types';
import type { Construction3, Id, LinExpr, PointDef, Positions3, SolidKind } from './types';
import { add3, centroid3, cross3, dist3, dot3, lerp3, newellNormal, ringCircumcentre3, norm3, normalize3, scale3, sub3, v3, type Vec3 } from './vec3';
import { quadPyramidDims, quadPyramidLayout } from './baseShapes';

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

/**
 * #349 (ADR-3D-089): a prism's BASE dims — every dim EXCEPT the trailing lateral one. The lateral is a
 * single height (right) or the free vector w (oblique), which is exactly what makes obliqueness a
 * modifier rather than a per-base template: the base ring is sampled and built identically either way.
 * Returns null for a non-prism kind (cube/box/pyramids/flat polygons own their whole dim vector).
 *
 * Sample keys and ranges are preserved verbatim from the per-kind branches this replaces, so every
 * RIGHT prism's dims are bit-identical to before the refactor.
 */
function prismBaseDims(kind: SolidKind, key: string, seed: number): number[] | null {
  switch (kind) {
    case 'prism3': // general triangle base: the two base angles
      return [rad(sample(seed, `${key}-alpha`, 38, 72)), rad(sample(seed, `${key}-beta`, 38, 72))];
    // parallelogram base: 2nd edge AD=(dx,dy). #291: dx bounded away from 0 so ∠DAB reads visibly oblique at
    // EVERY seed (a `מקבילית` base must never render as a rectangle — ADR-052: a default must not look like a
    // special case). `parallelepiped` is the legacy spelling of prism4+oblique and shares its base exactly.
    case 'prism4': case 'parallelepiped':
      return [sample(seed, `${key}-dx`, 0.3, 0.6), sample(seed, `${key}-dy`, 0.6, 1.2)];
    case 'prism4g': // general quad base: C=(cx,cy), D=(dx,dy) free (A,B are the gauge)
      return [
        sample(seed, `${key}-cx`, 0.9, 1.5), sample(seed, `${key}-cy`, 0.6, 1.2),
        sample(seed, `${key}-dx`, -0.3, 0.4), sample(seed, `${key}-dy`, 0.6, 1.2),
      ];
    case 'prism4r': // rhombus base: the base angle at A (side 1 = gauge)
      return [rad(sample(seed, `${key}-angle`, 45, 75))];
    case 'prism3e': case 'prism4sq': case 'prismReg5': case 'prismReg6':
      return []; // the base shape IS the gauge — nothing free about it
    default:
      return null;
  }
}

/** A right prism's height range, per base kind (verbatim from the branches `prismBaseDims` replaces). */
const PRISM_HEIGHT: Partial<Record<SolidKind, [number, number]>> = {
  prism3: [0.65, 1.5], prism3e: [0.8, 1.6], prism4: [0.7, 1.5], prism4g: [0.7, 1.5],
  prism4r: [0.7, 1.5], prism4sq: [0.7, 1.5], prismReg5: [0.7, 1.5], prismReg6: [0.7, 1.5],
  parallelepiped: [0.7, 1.5], // unused (always oblique) — present so the lookup is total
};

/** The legacy `parallelepiped` kind IS oblique by definition; apply normalizes it to prism4+oblique, and
 *  this keeps it correct even if an un-normalized one ever reaches the evaluator (e.g. an old save file). */
const isObliqueSolid = (kind: SolidKind, oblique?: boolean): boolean => oblique === true || kind === 'parallelepiped';

/** An OBLIQUE prism's lateral vector w — a free tilt (wx,wy) plus a rise (wz). Ranges verbatim from the
 *  former `parallelepiped` branch, so a מקבילון keeps the same shape envelope it always had. */
const lateralDims = (key: string, seed: number): number[] => [
  sample(seed, `${key}-wx`, -0.35, 0.35), sample(seed, `${key}-wy`, -0.35, 0.35), sample(seed, `${key}-wz`, 0.7, 1.5),
];

/** The FREE dims a solid kind carries (sampled per seed; the pivot solves over them — ADR-3D-007).
 *  `oblique` (#349) swaps a prism's trailing height for the free lateral vector w. */
export function solidDims(kind: SolidKind, key: string, seed: number, oblique?: boolean): number[] {
  const base = prismBaseDims(kind, key, seed);
  if (base) {
    const [lo, hi] = PRISM_HEIGHT[kind]!;
    return [...base, ...(isObliqueSolid(kind, oblique) ? lateralDims(key, seed) : [sample(seed, `${key}-height`, lo, hi)])];
  }
  // #305 (ADR-3D-090): every quad-base pyramid — its base's dims then its top's — from the ONE
  // registry. This SUBSUMES the legacy pyramid4/4g/4r/4gr/pyramidPar branches below: the keys and
  // ranges are identical, so those figures are bit-identical (asserted in quad-pyramid-bases.test.ts).
  const qpd = quadPyramidDims(kind, key, seed);
  if (qpd) return qpd;
  if (kind === 'cube') return []; // edge = the similarity gauge
  if (kind === 'box') return [sample(seed, `${key}-depth`, 0.55, 1.7), sample(seed, `${key}-height`, 0.5, 1.4)];
  if (kind === 'pyramid4') return [sample(seed, `${key}-height`, 0.8, 1.6)]; // square base side = gauge
  if (kind === 'pyramid3')
    return [rad(sample(seed, `${key}-alpha`, 42, 68)), rad(sample(seed, `${key}-beta`, 42, 68)), sample(seed, `${key}-height`, 0.8, 1.6)];
  if (kind === 'tetra')
    return [
      rad(sample(seed, `${key}-alpha`, 42, 68)), rad(sample(seed, `${key}-beta`, 42, 68)),
      sample(seed, `${key}-ax`, 0.2, 0.8), sample(seed, `${key}-ay`, 0.15, 0.6), sample(seed, `${key}-az`, 0.8, 1.6),
    ];
  if (kind === 'pyramid4g')
    return [sample(seed, `${key}-ax`, 0.2, 0.8), sample(seed, `${key}-ay`, 0.2, 0.8), sample(seed, `${key}-az`, 0.8, 1.6)];
  if (kind === 'pyramid4r') return [sample(seed, `${key}-aspect`, 0.6, 1.6), sample(seed, `${key}-height`, 0.8, 1.6)];
  if (kind === 'pyramid4gr')
    return [
      sample(seed, `${key}-aspect`, 0.6, 1.6),
      sample(seed, `${key}-ax`, 0.2, 0.8), sample(seed, `${key}-ay`, 0.2, 0.8), sample(seed, `${key}-az`, 0.8, 1.6),
    ];
  // V8-d: equilateral-base pyramid — the base is the similarity gauge, only the height is free
  // (its prism twin `prism3e` rides the shared prism path above).
  if (kind === 'pyramid3e') return [sample(seed, `${key}-height`, 0.8, 1.6)];
  // V8-d: free-apex parallelogram-base pyramid — the 2nd base edge (dx,dy) + the free apex
  if (kind === 'pyramidPar')
    return [
      sample(seed, `${key}-dx`, 0.3, 0.6), sample(seed, `${key}-dy`, 0.5, 1.0), // #291: oblique parallelogram base at every seed
      sample(seed, `${key}-ax`, 0.2, 0.8), sample(seed, `${key}-ay`, 0.2, 0.8), sample(seed, `${key}-az`, 0.8, 1.6),
    ];
  // V8-g: a FLAT polygon (z=0) — v0=(0,0), v1=(1,0) fix the gauge, the rest are free 2-D
  // coords sampled in convex position (a general non-degenerate polygon that "show another" varies).
  if (kind === 'polygon3') return [sample(seed, `${key}-x2`, 0.2, 0.8), sample(seed, `${key}-y2`, 0.6, 1.1)];
  if (kind === 'polygon4')
    return [
      sample(seed, `${key}-x2`, 0.9, 1.35), sample(seed, `${key}-y2`, 0.5, 1.0),
      sample(seed, `${key}-x3`, -0.35, 0.4), sample(seed, `${key}-y3`, 0.5, 1.0),
    ];
  if (kind === 'polygon5')
    return [
      sample(seed, `${key}-x2`, 1.0, 1.35), sample(seed, `${key}-y2`, 0.35, 0.8),
      sample(seed, `${key}-x3`, 0.3, 0.7), sample(seed, `${key}-y3`, 0.95, 1.3),
      sample(seed, `${key}-x4`, -0.35, 0.2), sample(seed, `${key}-y4`, 0.35, 0.8),
    ];
  // Every prism kind (incl. prism3, whose branch this used to be) rides `prismBaseDims` above, and every
  // other kind is handled explicitly — nothing reaches here.
  return [];
}

/** A revolution solid's resolved size: stated dims pin; unstated ones are FREE sampled DOFs (ADR-052). */
export function revolutionDims(c: Construction3, i: number, seed: number): { r: number; h: number; origin: Vec3 } {
  const rev = c.revolutions[i];
  const key = `rev-${rev.kind}-${rev.center ?? i}`;
  const r = rev.radius ?? sample(seed, `${key}-radius`, 0.5, 1.2);
  const h = rev.kind === 'sphere' ? 0 : rev.height ?? sample(seed, `${key}-height`, 0.9, 1.9);
  const origin = v3(c.solids.length * 2.5 + i * 3.2, 0, 0);
  return { r, h, origin };
}

/** The circumcentre of base triangle A=(0,0), B=(1,0), C=(cx,cy) — a RIGHT pyramid's apex sits above it. */
function circumcenter2(cx: number, cy: number): { x: number; y: number } {
  return { x: 0.5, y: ((cx - 0.5) * (cx - 0.5) + cy * cy - 0.25) / (2 * cy) };
}

/**
 * #349 (ADR-3D-089): a prism's BASE ring in the z=origin plane, from its base dims (the twin of
 * {@link prismBaseDims} — same kinds, same order). Null for a non-prism kind.
 *
 * This is the whole reason obliqueness can be a modifier: EVERY prism, right or oblique, is this ring
 * plus one lateral translation — `(0,0,h)` when right, the free `w` when oblique. Geometry verbatim from
 * the per-kind branches it replaces, so right prisms are bit-identical.
 */
function prismBaseRing(kind: SolidKind, baseDims: number[], o: Vec3): Vec3[] | null {
  switch (kind) {
    case 'prism3': { // general triangle from its two base angles
      const c = apexFromBaseAngles(baseDims[0], baseDims[1]);
      return [v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + c.x, o.y + c.y, o.z)];
    }
    case 'prism3e': { // equilateral (side 1 = gauge)
      const cy = Math.sqrt(3) / 2;
      return [v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + 0.5, o.y + cy, o.z)];
    }
    case 'prism4': case 'parallelepiped': { // parallelogram AB=(1,0), AD=(dx,dy), C=B+AD
      const [dx, dy] = baseDims;
      return [v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + 1 + dx, o.y + dy, o.z), v3(o.x + dx, o.y + dy, o.z)];
    }
    case 'prism4g': { // general quad: A,B gauge; C,D free
      const [cx, cy, dx, dy] = baseDims;
      return [v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + cx, o.y + cy, o.z), v3(o.x + dx, o.y + dy, o.z)];
    }
    case 'prism4r': { // rhombus (side 1 = gauge; base angle at A)
      const [theta] = baseDims;
      const dx = Math.cos(theta), dy = Math.sin(theta);
      return [v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + 1 + dx, o.y + dy, o.z), v3(o.x + dx, o.y + dy, o.z)];
    }
    case 'prism4sq': // unit square (gauge)
      return [v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + 1, o.y + 1, o.z), v3(o.x, o.y + 1, o.z)];
    case 'prismReg5': case 'prismReg6': { // regular n-gon on a unit-circumradius circle (gauge)
      const n = kind === 'prismReg5' ? 5 : 6;
      return Array.from({ length: n }, (_, i) => {
        const a = (2 * Math.PI * i) / n;
        return v3(o.x + Math.cos(a), o.y + Math.sin(a), o.z);
      });
    }
    default:
      return null;
  }
}

/** World positions of one solid's vertices, in `ids` order, from its dim vector.
 *  `oblique` (#349): the top ring is the base translated by the free lateral vector w, not by a height. */
function solidPositions(kind: SolidKind, dims: number[], origin: Vec3, oblique?: boolean): Vec3[] {
  const o = origin;
  // Every prism: base ring + ONE lateral translation. Right → (0,0,h); oblique → w=(wx,wy,wz).
  const nBase = dims.length - (isObliqueSolid(kind, oblique) ? 3 : 1);
  const ring = nBase >= 0 ? prismBaseRing(kind, dims.slice(0, nBase), o) : null;
  if (ring) {
    const lat = isObliqueSolid(kind, oblique)
      ? { x: dims[nBase], y: dims[nBase + 1], z: dims[nBase + 2] }
      : { x: 0, y: 0, z: dims[nBase] };
    return [...ring, ...ring.map((p) => v3(p.x + lat.x, p.y + lat.y, p.z + lat.z))];
  }
  if (kind === 'cube') {
    const s = 1; // scale gauge — see file header
    return [
      v3(o.x, o.y, o.z), v3(o.x + s, o.y, o.z), v3(o.x + s, o.y + s, o.z), v3(o.x, o.y + s, o.z),
      v3(o.x, o.y, o.z + s), v3(o.x + s, o.y, o.z + s), v3(o.x + s, o.y + s, o.z + s), v3(o.x, o.y + s, o.z + s),
    ];
  }
  if (kind === 'box') {
    const a = 1; // scale gauge
    const [b, h] = dims;
    return [
      v3(o.x, o.y, o.z), v3(o.x + a, o.y, o.z), v3(o.x + a, o.y + b, o.z), v3(o.x, o.y + b, o.z),
      v3(o.x, o.y, o.z + h), v3(o.x + a, o.y, o.z + h), v3(o.x + a, o.y + b, o.z + h), v3(o.x, o.y + b, o.z + h),
    ];
  }
  // #305 (ADR-3D-090): the whole quad-pyramid family — base ring from the registry, apex either
  // free or over the base's CIRCUMCENTRE (equal lateral edges). Subsumes the five legacy branches
  // that follow, which are kept only as documentation of the pre-registry layout.
  const qpl = quadPyramidLayout(kind, dims);
  if (qpl) {
    return [
      ...qpl.ring.map((p) => v3(o.x + p.x, o.y + p.y, o.z)),
      v3(o.x + qpl.apex.x, o.y + qpl.apex.y, o.z + qpl.apex.z),
    ];
  }
  if (kind === 'pyramid4') {
    // right square pyramid: base side 1 (gauge), apex above the base centre
    const [h] = dims;
    return [
      v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + 1, o.y + 1, o.z), v3(o.x, o.y + 1, o.z),
      v3(o.x + 0.5, o.y + 0.5, o.z + h),
    ];
  }
  if (kind === 'pyramid3') {
    // right triangular pyramid: apex above the base's CIRCUMCENTRE (equal lateral edges)
    const [alpha, beta, h] = dims;
    const c = apexFromBaseAngles(alpha, beta);
    const cc = circumcenter2(c.x, c.y);
    return [
      v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + c.x, o.y + c.y, o.z),
      v3(o.x + cc.x, o.y + cc.y, o.z + h),
    ];
  }
  if (kind === 'tetra') {
    // a GENERAL pyramid: base ABC from its angles, apex D fully free (5 dims)
    const [alpha, beta, ax, ay, az] = dims;
    const cc = apexFromBaseAngles(alpha, beta);
    return [
      v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + cc.x, o.y + cc.y, o.z),
      v3(o.x + ax, o.y + ay, o.z + az),
    ];
  }
  if (kind === 'pyramid4g') {
    // a GENERAL square-base pyramid: unit base (gauge), apex fully free (3 dims)
    const [ax, ay, az] = dims;
    return [
      v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + 1, o.y + 1, o.z), v3(o.x, o.y + 1, o.z),
      v3(o.x + ax, o.y + ay, o.z + az),
    ];
  }
  if (kind === 'pyramid4r') {
    // right pyramid over a 1×b rectangle (aspect b a free DOF — square was NOT stated)
    const [b, h] = dims;
    return [
      v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + 1, o.y + b, o.z), v3(o.x, o.y + b, o.z),
      v3(o.x + 0.5, o.y + b / 2, o.z + h),
    ];
  }
  if (kind === 'pyramid4gr') {
    // general pyramid over a 1×b rectangle: aspect AND apex free
    const [b, ax, ay, az] = dims;
    return [
      v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + 1, o.y + b, o.z), v3(o.x, o.y + b, o.z),
      v3(o.x + ax, o.y + ay, o.z + az),
    ];
  }
  if (kind === 'pyramid3e') {
    // equilateral-base right pyramid: apex above the base centroid (= circumcentre)
    const [h] = dims;
    const cy = Math.sqrt(3) / 2;
    return [
      v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + 0.5, o.y + cy, o.z),
      v3(o.x + 0.5, o.y + cy / 3, o.z + h),
    ];
  }
  if (kind === 'pyramidPar') {
    // free-apex parallelogram-base pyramid: base AB=(1,0), AD=(dx,dy); C = B + AD; apex free
    const [dx, dy, ax, ay, az] = dims;
    return [
      v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + 1 + dx, o.y + dy, o.z), v3(o.x + dx, o.y + dy, o.z),
      v3(o.x + ax, o.y + ay, o.z + az),
    ];
  }
  if (kind === 'polygon3' || kind === 'polygon4' || kind === 'polygon5') {
    // a FLAT polygon (z=0): v0=(0,0), v1=(1,0) fix the gauge, the rest ride the free dims
    const pts = [v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z)];
    for (let i = 0; i < dims.length; i += 2) pts.push(v3(o.x + dims[i], o.y + dims[i + 1], o.z));
    return pts;
  }
  // Every prism kind rides the shared base-ring + lateral path at the top of this function.
  return [];
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
  /** The V4 pivot's outcome, when injections exist: how many placements converged and which was chosen.
   *  #325: `pinSymbols` carries the chosen solution's values for the pins' OPEN symbols (`B(2t,t,k)`). */
  pivot: { solutions: number; chosen: number; err: number; pinSymbols?: Record<string, number> } | null;
  /** V6 — resolved solids of revolution (world centre/apex + numeric radius/height) for the renderer. */
  revolutions: { kind: 'cylinder' | 'cone' | 'sphere'; center: Vec3; apex?: Vec3; r: number; h: number }[];
  /** V8-i — resolved circles in R³ (world centre + unit normal + radius + in-plane basis) for the renderer + on-circle checks. */
  circles3: { id: string; center: Vec3; normal: Vec3; radius: number; e1: Vec3; e2: Vec3 }[];
}

const linVal = (e: LinExpr, a: number): number => e.k + e.p * a;

function planeAt(c: Construction3, name: string, a: number): ResolvedPlane {
  const p = c.planes.get(name)!;
  return { n: v3(linVal(p.cx, a), linVal(p.cy, a), linVal(p.cz, a)), d: linVal(p.d, a) };
}

/** A plane's numeric form at a given parameter value (claims need to scan over the parameter). */
export const planeAtParam = planeAt;

/** A line's numeric form at a given parameter value: parametric evaluated; plane∩plane recomputed.
 *  A line between POINT-planes resolves later (they need final positions) — null here. */
export function lineAtParam(c: Construction3, name: string, a: number): ResolvedLine | null {
  const def = c.lines.get(name);
  if (!def) return null;
  if (def.kind === 'parametric') {
    return {
      anchor: v3(linVal(def.anchor[0], a), linVal(def.anchor[1], a), linVal(def.anchor[2], a)),
      dir: v3(linVal(def.dir[0], a), linVal(def.dir[1], a), linVal(def.dir[2], a)),
    };
  }
  // through / common-perp / line-projection all depend on other resolved lines/planes → resolved later
  if (def.kind === 'through' || def.kind === 'common-perp' || def.kind === 'line-projection') return null;
  if (!c.planes.has(def.p1) || !c.planes.has(def.p2)) return null;
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

/** S2 (#378): the ABSOLUTE-lane line relations that can actually PIN the parameter — both sides
 *  are absolute AND a referenced direction carries it. An absolute pair with no parameter
 *  dependence is a pure claim (its residual is constant in `a` — root-finding over it would
 *  either flood or fabricate a `no-roots` refusal for a parameter it cannot constrain). */
function paramPinningLineRels(c: Construction3): Construction3['lineRels'] {
  if (!c.param) return [];
  return c.lineRels.filter((r) => {
    if (!isAbsolute(r.op)) return false;
    const opCarries = r.op.kind === 'line' ? lineDirCarriesParam(c, r.op.name) : r.op.kind === 'plane-named' && planeNormalCarriesParam(c, r.op.name);
    return lineDirCarriesParam(c, r.line) || opCarries;
  });
}

/** S2 (#378): the SIGNED residual of an absolute-lane line relation at parameter value `a` —
 *  0 ⟺ the relation holds. Perp (line×line) and ∥ (line×plane) cross zero with a sign change;
 *  ∥ (line×line) is non-negative (touch-zero); the angle forms are |cos| − target. */
function lineRelParamResidual(c: Construction3, r: Construction3['lineRels'][number], a: number): number {
  const ln = lineAtParam(c, r.line, a);
  if (!ln) return NaN;
  let other: Vec3 | null = null;
  let planar = false;
  if (r.op.kind === 'line') {
    other = lineAtParam(c, r.op.name, a)?.dir ?? null;
  } else if (r.op.kind === 'plane-named') {
    other = planeAt(c, r.op.name, a).n;
    planar = true;
  }
  if (!other) return NaN;
  const den = norm3(other) * norm3(ln.dir);
  if (den < 1e-12) return NaN;
  const cos = dot3(other, ln.dir) / den;
  const sin = norm3(cross3(other, ln.dir)) / den;
  if (r.rel === 'perp') return planar ? sin : cos;
  if (r.rel === 'parallel') return planar ? cos : sin;
  const target = ((r.deg ?? 0) * Math.PI) / 180;
  return Math.abs(cos) - (planar ? Math.sin(target) : Math.cos(target));
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
  for (const r of paramPinningLineRels(c)) {
    const res = lineRelParamResidual(c, r, a);
    if (Number.isNaN(res) || Math.abs(res) > 1e-5) return false;
  }
  return true;
}

/** How many givens pin the parameter (none ⇒ it is a free sampled DOF). */
export const pinningGivens = (c: Construction3): number =>
  c.planeAngles.length + c.linePerps.length + paramPinningLineRels(c).length;

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
  for (const r of paramPinningLineRels(c)) {
    // sign-change catches crossings; touch-zero catches the non-negative forms (∥ of two lines)
    // and double roots — the paramGivens belt-and-braces pattern
    const f = (a: number) => lineRelParamResidual(c, r, a);
    candidates.push(...signChangeRoots(f), ...touchZeroRoots((a) => Math.abs(f(a))));
  }
  return snapAndDedupe(candidates.filter((a) => satisfiesAllPins(c, a)));
}

const onPlane = (p: Vec3, pl: ResolvedPlane): boolean => Math.abs(dot3(pl.n, p) + pl.d) <= 1e-7 * (1 + norm3(pl.n));

/** A stated membership's arbiter (ADR-3D-033): the point lies on the plane to within the
 *  DRIVE's numeric floor (the LM + regulariser equilibrium, ~1e-5 of the figure scale) —
 *  still orders of magnitude below any genuinely off-plane statement. Shared by the
 *  stage-4 unmet trigger and the store's verify pass so no drive/verify gap can exist. */
export const memberHolds3 = (p: Vec3, pl: ResolvedPlane): boolean =>
  Math.abs(dot3(pl.n, p) + pl.d) / Math.max(norm3(pl.n), 1e-12) <= 1e-4 * Math.max(1, norm3(p));

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
    // an UNPINNED parameter is a free sampled DOF — a stated sign (ADR-3D-032,
    // `k הוא פרמטר חיובי`) constrains the sample's half-line, never flags it
    const sign = c.paramSigns.find(() => true);
    const range: [number, number] = sign ? (sign.positive ? [0.3, 3] : [-3, -0.3]) : [-3, 3];
    return { value: sample(seed, `param-${c.param}`, range[0], range[1]), roots: [] };
  }
  if (roots.length === 0) return { value: NaN, roots }; // no-roots — surfaced as an honest error
  const explicit = [...c.planeAngles, ...c.linePerps].find((g) => g.branch !== undefined)?.branch;
  if (explicit !== undefined) return { value: roots[((explicit % roots.length) + roots.length) % roots.length], roots };
  for (const m of c.memberships) {
    if (m.side) continue; // a side given never selects the parameter (verified downstream)
    const p = coordPos.get(m.id);
    if (!p) continue;
    for (const root of roots) {
      // only EQUATION planes depend on the parameter — point-run plane names are skipped
      const names = (m.plane === 'any' ? [...c.planes.keys()] : [m.plane]).filter((name) => c.planes.has(name));
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

/**
 * The figure's FREE SHAPE degrees of freedom (the V5 cue, the 2-D ADR-101/112 idea):
 * sampled solid dims + unstated revolution sizes + free on-segment sliders + an
 * unpinned parameter, all reported modulo the place/rotate/scale similarity gauge.
 *
 * After a converged pivot the solve runs in the ABSOLUTE frame (dims + a 7-DOF gauge).
 * Absolute pins consume the gauge FIRST (freeGauge = max(0, 7 − pinCount)); similarity-
 * invariant scalar constraints (⊥ / angle / ratio DRIVES — the `scalarPins`) each remove
 * one SHAPE DOF. Subtracting the free gauge is what makes a ⊥ constraint DECREASE the cue
 * (#292) instead of spuriously adding the whole +7 gauge. Closed form (freeGauge folded in):
 *   shapeDof = max(0, dims − max(0, pinCount − 7) − scalarPins) + freeT + param.
 * An estimate by design — honest about what "show another configuration" can still vary.
 */
export function freeDofCount3(c: Construction3, resolved: Resolved3): number {
  let dims = 0;
  c.solids.forEach((solid) => {
    dims += solidDims(solid.kind, `solid-${solid.kind}-${solid.ids.join('')}`, 0, solid.oblique).length;
  });
  for (const rev of c.revolutions) {
    if (rev.radius === undefined) dims++;
    if (rev.kind !== 'sphere' && rev.height === undefined) dims++;
  }
  let freeT = 0;
  for (const def of c.points.values()) {
    if (def.kind === 'on-segment' && def.t === undefined) freeT++;
    if (def.kind === 'on-plane') freeT += def.side ? 3 : 2; // a plane rider slides in-plane; a side point also floats
    if (def.kind === 'on-line') freeT += 1; // a line rider slides along its line (ADR-3D-031)
    if (def.kind === 'partial') freeT += [def.x, def.y, def.z].filter((v) => v === null).length; // each unstated component is a free DOF (ADR-3D-094)
  }
  const param = c.param && pinningGivens(c) === 0 && c.paramGivens.length === 0 ? 1 : 0;
  if (resolved.pivot && resolved.pivot.solutions > 0) {
    let pinCount = c.vectorPins.length * 3;
    // #325: a symbolic component (`B(2t,t,k)`) constrains like a numeric one, and each distinct
    // OPEN symbol is an extra unknown — B(2t,t,k) nets ONE constraint (3 comps − 2 symbols).
    for (const p of c.pins) pinCount += (p.x !== null ? 1 : 0) + (p.y !== null ? 1 : 0) + (p.z !== null ? 1 : 0);
    dims += pinSymsOf(c).length;
    // #324: a coordinate-plane relation consumes DOF like pins (its residual count)
    for (const cp of c.coordPlanePins)
      pinCount += cp.mode === 'share' ? cp.ids.length - 1 : cp.mode === 'zero' ? cp.ids.length : cp.mode === 'perp' ? 1 : 2;
    // #375: aligning a figure-derived plane with an absolute direction removes TWO rotational DOFs
    // (the spin about that direction stays free)
    pinCount += 2 * c.planeLinePerps.length;
    // S2 (#378): a gauge operand related to an absolute line — full alignment (a direction made ∥,
    // a plane made ⟂) removes two rotational DOFs; a single ⟂ or a stated angle removes one.
    for (const r of c.lineRels) {
      if (isAbsolute(r.op)) continue; // absolute×absolute never touches the figure
      const directional = r.op.kind !== 'plane-run';
      pinCount += (directional ? r.rel === 'parallel' : r.rel === 'perp') ? 2 : 1;
    }
    // #292: report SHAPE DOF — subtract the free (unpinned) gauge so a similarity-invariant drive
    // (⊥/angle/ratio) lowers the cue rather than adding +7; scalarPins are those shape-reducing drives.
    return Math.max(0, dims - Math.max(0, pinCount - 7) - c.scalarPins.length) + freeT + param;
  }
  return dims + freeT + param;
}

// ---------------------------------------------------------------------------
// V7 — vector-defined points (ADR-3D-010): X⃗Y = Σ coeff(k)·atom is AFFINE in the
// one unknown point, so 4 residual evaluations determine the affine map and one
// 3×3 solve places it. A free symbol k makes it a 1-parameter family — pinned by
// a ∥/⟂-to-plane condition via the existing 1-DOF root finders, else SAMPLED
// (ADR-052). Two symbol-relations on one point = a line∩line closed form.
// ---------------------------------------------------------------------------

type VecDef = Construction3['vecDefs'][number];

/** Solve the relation for its unknown point at a fixed symbol value; null when degenerate. */
function solveVecDef(c: Construction3, vd: VecDef, pos: Positions3, kValue: number): Vec3 | null {
  const evalR = (P: Vec3): Vec3 | null => {
    const get = (id: Id): Vec3 | undefined => (id === vd.unknown ? P : pos.get(id));
    const from = get(vd.from);
    const to = get(vd.to);
    if (!from || !to) return null;
    let acc = sub3(to, from);
    for (const t of vd.terms) {
      let vvec: Vec3 | null = null;
      if (t.atom.kind === 'pair') {
        const a = get(t.atom.from);
        const b = get(t.atom.to);
        vvec = a && b ? sub3(b, a) : null;
      } else {
        const dv = c.vectors.get(t.atom.name);
        const a = dv && get(dv.from);
        const b = dv && get(dv.to);
        vvec = a && b ? sub3(b, a) : null;
      }
      if (!vvec) return null;
      acc = sub3(acc, scale3(vvec, t.coeff.k + t.coeff.p * kValue));
    }
    return acc;
  };
  const r0 = evalR(v3(0, 0, 0));
  if (!r0) return null;
  const rx = evalR(v3(1, 0, 0));
  const ry = evalR(v3(0, 1, 0));
  const rz = evalR(v3(0, 0, 1));
  if (!rx || !ry || !rz) return null;
  const sol = decompose3(scale3(r0, -1), sub3(rx, r0), sub3(ry, r0), sub3(rz, r0));
  return sol ? v3(sol[0], sol[1], sol[2]) : null;
}

/** The ∥/⟂-to-plane pin residual at a symbol value (normalised; NaN when unresolvable). */
function symbolPinResidual(
  c: Construction3,
  pin: Construction3['symbolPins'][number],
  vd: VecDef,
  pos: Positions3,
  kValue: number,
): number {
  const P = solveVecDef(c, vd, pos, kValue);
  if (!P) return NaN;
  const get = (id: Id): Vec3 | undefined => (id === vd.unknown ? P : pos.get(id));
  if (pin.rel === 'value') return kValue - pin.value;
  if (pin.rel === 'length-rel') {
    const a1 = get(pin.a);
    const b1 = get(pin.b);
    const a2 = get(pin.pair2[0]);
    const b2 = get(pin.pair2[1]);
    if (!a1 || !b1 || !a2 || !b2) return NaN;
    return norm3(sub3(b1, a1)) - pin.c * norm3(sub3(b2, a2));
  }
  if (pin.rel === 'seg-perp' || pin.rel === 'seg-par') {
    // ADR-3D-056: seg(a,b) ⊥/∥ seg(c,d) as a function of the symbol. `a` (or `b`) is the unknown
    // point, so its position varies with k; the reference seg(c,d) is fixed. Normalised, ∈ [−1,1]:
    // seg-perp is the (signed) cosine — it crosses zero, so signChangeRoots brackets it; seg-par is the
    // (non-negative) sine — it touches zero, so touchZeroRoots does.
    const pa = get(pin.a);
    const pb = get(pin.b);
    const pc = get(pin.c);
    const pd = get(pin.d);
    if (!pa || !pb || !pc || !pd) return NaN;
    const u = sub3(pb, pa);
    const v = sub3(pd, pc);
    const den = Math.max(norm3(u) * norm3(v), 1e-12);
    return pin.rel === 'seg-perp' ? dot3(u, v) / den : norm3(cross3(u, v)) / den;
  }
  // the remaining kinds are ⟂/∥ to a PLANE (through `pin.plane`)
  if (pin.rel !== 'parallel' && pin.rel !== 'perp') return NaN;
  const a = get(pin.a);
  const b = get(pin.b);
  const ring = pin.plane.map(get);
  if (!a || !b || ring.some((p) => !p)) return NaN;
  const n = cross3(sub3(ring[1]!, ring[0]!), sub3(ring[2]!, ring[0]!));
  const d = sub3(b, a);
  const den = Math.max(norm3(d) * norm3(n), 1e-12);
  return pin.rel === 'parallel' ? dot3(d, n) / den : norm3(cross3(d, n)) / den;
}

/** A characteristic size of the currently-placed figure (radius about its centroid); ≥1. */
function figureScale(pos: Positions3): number {
  const pts = [...pos.values()];
  if (pts.length === 0) return 1;
  const ctr = centroid3(pts);
  let s = 1;
  for (const p of pts) s = Math.max(s, dist3(p, ctr));
  return s;
}

/** Length of the pin's DRIVEN segment (the one carrying the symbol's unknown point) at value k. */
function pinDrivenSegLen(
  c: Construction3,
  pin: Construction3['symbolPins'][number],
  vd: VecDef,
  pos: Positions3,
  k: number,
): number {
  const P = solveVecDef(c, vd, pos, k);
  if (!P) return 0;
  const get = (id: Id): Vec3 | undefined => (id === vd.unknown ? P : pos.get(id));
  const seg = (a: Id, b: Id): number => {
    const pa = get(a);
    const pb = get(b);
    return pa && pb ? norm3(sub3(pb, pa)) : 0;
  };
  if (pin.rel === 'length-rel') return seg(pin.a, pin.b);
  if (pin.rel === 'seg-perp' || pin.rel === 'seg-par')
    return pin.a === vd.unknown || pin.b === vd.unknown ? seg(pin.a, pin.b) : seg(pin.c, pin.d);
  if (pin.rel === 'parallel' || pin.rel === 'perp') return seg(pin.a, pin.b);
  return Infinity; // a value pin has no driven segment to collapse
}

/**
 * ADR-3D-083 (#332): the first symbol root whose DRIVEN segment is non-degenerate, or undefined.
 * A ∥/⊥/length pin's residual is NORMALISED by the driven segment length, so the driven point
 * coinciding with its reference is a VACUOUS zero (a zero vector is trivially parallel/⊥ to
 * anything, a zero length trivially matches a zero target). Selecting such a root places the
 * defined point on top of its reference and commits a false-green figure. Skipping the collapse
 * root — and, when none remains, leaving the point unpositioned so the store refuses honestly
 * (no-solution, keep-prior) — is the 3-D analogue of the 2-D anti-collapse / general-position
 * principle (ADR-238 / ADR-253). Healthy figures are unaffected: a valid root has a segment of
 * order the figure scale, far above the tolerance, so the first root is chosen exactly as before.
 */
function firstNonDegenerateRoot(
  c: Construction3,
  pin: Construction3['symbolPins'][number],
  vd: VecDef,
  pos: Positions3,
  roots: number[],
): number | undefined {
  const tol = 1e-6 * figureScale(pos);
  for (const k of roots) if (pinDrivenSegLen(c, pin, vd, pos, k) > tol) return k;
  return undefined;
}

/** A point-run plane's numeric form from the CURRENT positions (Newell); null while
 *  its defining points are unplaced or degenerate (collinear). */
function planeFromPointRun(c: Construction3, name: string, pos: Positions3): ResolvedPlane | null {
  const ids = c.pointPlanes.get(name);
  if (!ids) return null;
  const pts = ids.map((id) => pos.get(id)).filter((p): p is Vec3 => p !== undefined);
  if (pts.length < 3) return null;
  const n = newellNormal(pts);
  if (norm3(n) < 1e-10) return null;
  return { n, d: -dot3(n, pts[0]) };
}

/** A rel-plane's numeric form from CURRENT positions (V8-b, G1); null while its points
 *  are unplaced or the relation is degenerate. */
function relPlaneFromPositions(c: Construction3, name: string, pos: Positions3): ResolvedPlane | null {
  const def = c.relPlanes.get(name);
  if (!def) return null;
  if (def.kind === 'perp') {
    const P = pos.get(def.through);
    const A = pos.get(def.a);
    const B = pos.get(def.b);
    if (!P || !A || !B) return null;
    const n = sub3(B, A); // normal = the edge's direction
    if (norm3(n) < 1e-10) return null;
    return { n, d: -dot3(n, P) };
  }
  const P1 = pos.get(def.through[0]);
  const P2 = pos.get(def.through[1]);
  const A = pos.get(def.a);
  const B = pos.get(def.b);
  if (!P1 || !P2 || !A || !B) return null;
  const n = cross3(sub3(P2, P1), sub3(B, A)); // ⟂ the through-chord AND the ∥-edge
  if (norm3(n) < 1e-10) return null;
  return { n, d: -dot3(n, P1) };
}

/** Resolve a plane by name from CURRENT positions: equation → point-run → rel. */
function resolvedPlaneAt(c: Construction3, name: string, pos: Positions3, planes: Map<string, ResolvedPlane>): ResolvedPlane | null {
  return planes.get(name) ?? planeFromPointRun(c, name, pos) ?? relPlaneFromPositions(c, name, pos);
}

/** Kinds the pivot's similarity applies to (gauge-frame points; Lane-A objects are already absolute). */
const GAUGE_KINDS = new Set(['solid-vertex', 'on-segment', 'centroid', 'in-span', 'vec-defined', 'vec-pair', 'plane-cut', 'foot-face', 'bisector-seg', 'foot-seg', 'right-pyramid-apex', 'right-apex']);

/**
 * #367: is anything in the figure stated in ABSOLUTE coordinates — a typed parametric line, a plane
 * given by its equation, a point given by its coordinates? While the answer is NO, the canonical
 * placement (first vertex at the origin, second along +x) is pure gauge and freezing it costs
 * nothing. The moment the answer is YES, that placement stops being a gauge and becomes a real,
 * UNSTATED degree of freedom: where the solid sits relative to the absolute object is something the
 * student never said, so it must be sampled (ADR-052 / M4), not frozen at a value that happens to
 * put the canonical origin exactly on a line through the origin.
 */
export function hasAbsoluteFrameObject(c: Construction3): boolean {
  if (c.planes.size > 0 || c.pins.length > 0) return true;
  for (const def of c.lines.values()) if (def.kind === 'parametric') return true;
  for (const def of c.points.values()) if (def.kind === 'coord' || def.kind === 'coord-sym') return true;
  return false;
}

/** Resolve the FULL figure: parameter → planes → lines → points → the V4 pivot → point-planes. */
export function resolve3(c: Construction3, seed: number): Resolved3 {
  const pos: Positions3 = new Map<Id, Vec3>();

  // coordinate points don't depend on anything — place them first (membership branch-selection reads them)
  for (const [id, def] of c.points) {
    if (def.kind === 'coord') pos.set(id, v3(def.x, def.y, def.z));
  }

  const param = c.param ? chooseParam(c, pos, seed) : null;
  const a = param && Number.isFinite(param.value) ? param.value : 0;

  // ADR-3D-032: coord-sym points (`M(k,1,3)`) are absolute like coord points, at the
  // (provisional) parameter value — re-placed post-pivot when a paramGiven pins k.
  for (const [id, def] of c.points) {
    if (def.kind === 'coord-sym') pos.set(id, v3(linVal(def.x, a), linVal(def.y, a), linVal(def.z, a)));
  }

  const planes = new Map<string, ResolvedPlane>();
  for (const name of c.planes.keys()) planes.set(name, planeAt(c, name, a));

  const lines = new Map<string, ResolvedLine>();
  for (const [name] of c.lines) {
    const line = lineAtParam(c, name, a);
    if (line) lines.set(name, line);
  }

  evaluateSolidsAndPoints(c, seed, pos, planes, lines);

  // ---- ADR-3D-032: a given referencing a coord-sym point pins the parameter — a
  // post-pivot 1-DOF root-find over FINAL positions (roots = branches, the ADR-3D-006
  // semantics: a param sign given selects, otherwise the seed cycles; no root = the
  // honest no-roots refusal). A closure (deterministic, so idempotent) because the
  // ADR-3D-033 membership drive re-runs it after moving the figure.
  let paramOut: { value: number; roots: number[] } | null = param;
  const pinParam = (): void => {
    if (!c.param || c.paramGivens.length === 0) return;
    const symAt = (id: Id, t: number): Vec3 | undefined => {
      const d = c.points.get(id);
      return d?.kind === 'coord-sym' ? v3(linVal(d.x, t), linVal(d.y, t), linVal(d.z, t)) : pos.get(id);
    };
    const residual = (cl: (typeof c.paramGivens)[number]) => (t: number): number => {
      if (cl.type === 'length-eq') {
        const p = symAt(cl.a, t);
        const q = symAt(cl.b, t);
        return p && q ? dist3(p, q) - cl.value : NaN;
      }
      if (cl.type === 'angle-seg-eq') {
        const p1 = symAt(cl.a1, t);
        const q1 = symAt(cl.b1, t);
        const p2 = symAt(cl.a2, t);
        const q2 = symAt(cl.b2, t);
        if (!p1 || !q1 || !p2 || !q2) return NaN;
        const u = sub3(q1, p1);
        const w = sub3(q2, p2);
        const den = norm3(u) * norm3(w);
        return den < 1e-12 ? NaN : Math.abs(dot3(u, w)) / den - Math.cos((cl.deg * Math.PI) / 180);
      }
      return NaN;
    };
    const fns = c.paramGivens.map(residual);
    // sign-change roots catch crossings; touch-zero catches double roots (deg-90 |cos|)
    const candidates = fns.flatMap((f) => [...signChangeRoots(f), ...touchZeroRoots((t) => Math.abs(f(t)))]);
    const roots = snapAndDedupe(candidates.filter((t) => fns.every((f) => Math.abs(f(t)) < 1e-5)));
    const pool0 = roots.filter((t) => c.paramSigns.every((g) => (g.positive ? t > 1e-9 : t < -1e-9)));
    const pool = pool0.length > 0 ? pool0 : roots;
    if (pool.length > 0) {
      const value = pool[seed % pool.length];
      for (const [id, d] of c.points) {
        if (d.kind === 'coord-sym') pos.set(id, v3(linVal(d.x, value), linVal(d.y, value), linVal(d.z, value)));
      }
      paramOut = { value, roots };
    } else {
      paramOut = { value: NaN, roots: [] };
    }
  };

  // ---- planes through points + rel-planes resolve only from final positions; a closure
  // because the ADR-3D-033 membership drive needs them mid-flight (before its unmet check
  // and again after moving the figure). Idempotent overwrites of the `planes` map.
  const resolveLatePlanes = (): void => {
    for (const [name] of c.pointPlanes) {
      const pl = planeFromPointRun(c, name, pos);
      if (pl) planes.set(name, pl);
    }
    for (const [name] of c.relPlanes) {
      const pl = relPlaneFromPositions(c, name, pos);
      if (pl) planes.set(name, pl);
    }
  };

  // ADR-3D-033 (M1): a side-less membership statement about a NAMED plane is a GIVEN the
  // figure's free DOFs must satisfy — drivable when the carrier is a point-run plane
  // (it rides the figure) or a numeric equation plane. `'any'` keeps its branch-SELECTION
  // semantics (chooseParam); a side statement is an inequality (sampled + verified).
  const drivableMemberships = c.memberships.filter(
    (m) => !m.side && m.plane !== 'any' && (c.pointPlanes.has(m.plane) || c.planes.has(m.plane)),
  );

  // S2 (#378, ADR-3D-103): the gauge-lane line relations (a figure operand against an absolute
  // named line) — they drive the pivot exactly like planeLinePerps. Absolute-lane entries never
  // involve the figure (parameter root-find / claim lanes).
  const gaugeLineRels = c.lineRels.filter((r) => !isAbsolute(r.op));

  // ---- the V4 pivot: injected coordinates pin the gauge (ADR-3D-007)
  let pivot: Resolved3['pivot'] = null;
  const warm: { x?: number[] } = {}; // the applied solution's vector — the drive's warm start (ADR-3D-033)
  if (
    (c.pins.length > 0 || c.vectorPins.length > 0 || c.pairPins.length > 0 || c.scalarPins.length > 0 ||
      c.planePins.length > 0 || c.coordPlanePins.length > 0 || c.planeLinePerps.length > 0 ||
      gaugeLineRels.length > 0 || drivableMemberships.length > 0) &&
    c.solids.length > 0
  ) {
    const dims0 = c.solids.flatMap((solid) => solidDims(solid.kind, `solid-${solid.kind}-${solid.ids.join('')}`, seed, solid.oblique));
    const evalCanonical = (dims: number[], cheap = true, override?: Map<number, number>): Positions3 => {
      const p2: Positions3 = new Map<Id, Vec3>();
      for (const [id, def] of c.points) {
        if (def.kind === 'coord') p2.set(id, v3(def.x, def.y, def.z));
      }
      evaluateSolidsAndPoints(c, seed, p2, planes, lines, dims, cheap, override);
      return p2;
    };

    // V8-c: a symbol pinned ⟂/∥ a plane is a candidate to co-solve with a free dim.
    const coupledPins = c.symbolPins.filter((p) => p.rel === 'perp' || p.rel === 'parallel');
    const coupledDefs = [...new Set(coupledPins.map((p) => p.def))];
    const overrideOf = (sol: PivotResult): Map<number, number> | undefined =>
      sol.symbols ? new Map(coupledDefs.map((d, i) => [d, sol.symbols![i]])) : undefined;
    const EC = (dims: number[], override?: Map<number, number>) => evalCanonical(dims, true, override);

    const applySolutions = (solutions: PivotResult[]): void => {
      const satisfiesSigns = (sol: PivotResult): boolean => {
        const p2 = evalCanonical(sol.dims, false, overrideOf(sol));
        // #325: a sign given on a PIN symbol (`t פרמטר חיובי` after `B(2t,t,k)`) selects
        // among pivot solutions, exactly like a coordinate sign given
        const symsOk = c.paramSigns.every((s) => {
          const v = sol.pinSymbols?.[s.sym];
          return v === undefined ? true : s.positive ? v > 1e-9 : v < -1e-9;
        });
        if (!symsOk) return false;
        return c.signGivens.every((g) => {
          // ADR-3D-094: a `partial` point's sign is honored at SAMPLE time and the point is
          // Lane-A absolute — the gauge transform below doesn't apply to it, so judging it
          // here would spuriously reject pivot branches. Skip; the sampler is the guarantee.
          if (c.points.get(g.id)?.kind === 'partial') return true;
          const q = p2.get(g.id);
          if (!q) return false;
          const val = sol.transform(q)[g.axis];
          return g.positive ? val > 1e-9 : val < -1e-9;
        });
      };
      const satisfying = solutions.filter(satisfiesSigns);
      const pool = satisfying.length > 0 ? satisfying : solutions;
      if (pool.length > 0) {
        const chosen = pool[seed % pool.length];
        warm.x = [...chosen.x];
        const finalCanonical = evalCanonical(chosen.dims, false, overrideOf(chosen));
        for (const [id, q] of finalCanonical) {
          const def = c.points.get(id);
          // an on-plane point rides the gauge iff its plane is a POINT-run plane (the run's
          // points are gauge-frame); an equation plane is Lane-A absolute — no transform
          const gauge = def && (GAUGE_KINDS.has(def.kind) || (def.kind === 'on-plane' && c.pointPlanes.has(def.plane)));
          if (gauge) pos.set(id, chosen.transform(q));
          else pos.set(id, q);
        }
        pivot = { solutions: pool.length, chosen: pool.indexOf(chosen), err: chosen.err, pinSymbols: chosen.pinSymbols };
      } else {
        pivot = { solutions: 0, chosen: -1, err: Infinity };
      }
    };

    // ADR-3D-030: the normal solve EXCLUDES plane-equation pins — on a figure the other
    // pins already place, an extra plane residual only spawns junk basins (one named
    // point dragged onto the plane, the rest of the figure off it); membership is
    // checked below, and the recorded claim is the final arbiter either way.
    const cNoPlanes = c.planePins.length > 0 ? { ...c, planePins: [] } : c;
    const hasOtherPins = c.pins.length > 0 || c.vectorPins.length > 0 || c.pairPins.length > 0 || c.scalarPins.length > 0;

    // 1) the normal solve — no symbol unknowns, so bit-identical to the pre-V8-c path.
    if (hasOtherPins) applySolutions(solvePivot(cNoPlanes, EC, dims0, seed, undefined, undefined, undefined, lines));

    // 2) failure-path retry (V8-c): a ⟂/∥-pinned symbol whose point could NOT be placed
    //    (no root-find value exists at the pivot's chosen dims) is COUPLED to a free dim —
    //    re-solve the symbol and the dim JOINTLY (the D3 numeric-only path, no CAS).
    const unplaced = coupledPins.some((p) => !pos.has(c.vecDefs[p.def].unknown));
    if (unplaced && coupledDefs.length > 0 && dims0.length > 0) {
      const retry = solvePivot(cNoPlanes, EC, dims0, seed, { defs: coupledDefs, pins: coupledPins }, undefined, undefined, lines);
      if (retry.length > 0) applySolutions(retry);
    }

    // 3) plane-equation DRIVE (ADR-3D-030, failure path): when nothing else pins the
    //    figure, or the pinned solve leaves a stated plane membership unmet, re-solve
    //    WITH the plane pins so the equation drives the free gauge/dims. If the joint
    //    solve finds nothing, the pinned figure stands and the recorded claim refutes
    //    the equation (the student-answer semantics, `claim-refuted`).
    if (c.planePins.length > 0) {
      const unmet = c.planePins.some((pin) => {
        const nn = Math.max(Math.hypot(pin.cx, pin.cy, pin.cz), 1e-12);
        return pin.ids.some((id) => {
          const p = pos.get(id);
          return p ? Math.abs(p.x * pin.cx + p.y * pin.cy + p.z * pin.cz + pin.d) / nn > 1e-4 * Math.max(norm3(p), 1) : false;
        });
      });
      if (!hasOtherPins || unmet) {
        const retry = solvePivot(c, EC, dims0, seed, undefined, undefined, undefined, lines);
        if (retry.length > 0) applySolutions(retry);
        else if (!hasOtherPins) pivot = { solutions: 0, chosen: -1, err: Infinity };
      }
    }

    // 3b) #375: the plane⟂LINE drive — the same failure-path shape as (3), for the same reason. The
    //     plane rides the figure and the line does not, so the relation is satisfied by ROTATING the
    //     figure; nothing else here can do that. It runs when no other pin places the figure (this
    //     relation is then the only thing orienting it) or when the pinned solve leaves it unmet. If
    //     the joint solve finds nothing, the prior figure stands and the recorded claim refuses
    //     honestly (`claim-refuted`) rather than a silently wrong drawing.
    if (c.planeLinePerps.length > 0 || gaugeLineRels.length > 0) {
      const unmet =
        c.planeLinePerps.some((pin) => {
          const ring = pin.ids.map((id) => pos.get(id));
          const ln = lines.get(pin.line);
          if (ring.some((p) => !p) || !ln) return true;
          const n = newellNormal(ring as Vec3[]);
          const den = norm3(n) * norm3(ln.dir);
          return den < 1e-12 || norm3(cross3(n, ln.dir)) / den > 1e-4;
        }) ||
        // S2 (#378): a gauge-lane line relation left unmet is the same trigger. A line that only
        // resolves post-pivot (a through-line) is not drivable here — the recorded claim is its
        // arbiter — so it never counts as unmet.
        gaugeLineRels.some((pin) => {
          const ln = lines.get(pin.line);
          if (!ln) return false;
          const geom = resolveOperand(pin.op, c, { lines, planes })((id) => pos.get(id) ?? null);
          if (!geom) return true;
          const dev = lineRelDeviation(pin.rel, pin.deg, geom, ln.dir);
          return dev === null || dev > 1e-4;
        });
      if (!hasOtherPins || unmet) {
        const retry = solvePivot(c, EC, dims0, seed, undefined, undefined, undefined, lines);
        if (retry.length > 0) applySolutions(retry);
        else if (!hasOtherPins) pivot = { solutions: 0, chosen: -1, err: Infinity };
      }
    }

    // 4) MEMBERSHIP drive (ADR-3D-033, M1 — the operator's "fit the diagram to match
    //    input"): a stated `X on plane Y` about an EXISTING point that the pinned
    //    figure leaves UNMET re-solves the free DOFs (gauge + dims) WITH a membership
    //    residual whose carrier is re-derived from the candidate positions each
    //    evaluation (a face plane rides the free dims — the exam's depth). Failure
    //    path only: a figure whose memberships already hold never enters, so it is
    //    bit-identical. Runs AFTER the parameter root-find so a coord-sym member
    //    drives at its PINNED value, never a provisional one (the ADR-3D-030 poison),
    //    and re-pins the parameter afterwards. If the joint solve finds nothing the
    //    pinned figure stands and the verify pass refuses honestly (`not-on-plane`).
    if (drivableMemberships.length > 0) {
      pinParam();
      resolveLatePlanes();
      const unmetMembership = drivableMemberships.some((m) => {
        const p = pos.get(m.id);
        const pl = planes.get(m.plane);
        return !p || !pl || !memberHolds3(p, pl);
      });
      if (unmetMembership) {
        const members: MemberPin[] = [];
        for (const m of drivableMemberships) {
          const def = c.points.get(m.id);
          // mirror applySolutions' lane rule: a gauge-frame member is evaluated inside
          // the solve; an absolute-lane member (typed coords / coord-sym at the pinned
          // parameter / an equation-plane rider) is FROZEN at its final position
          const gauge = def && (GAUGE_KINDS.has(def.kind) || (def.kind === 'on-plane' && c.pointPlanes.has(def.plane)));
          const fin = pos.get(m.id);
          if (!gauge && !(fin && Number.isFinite(fin.x) && Number.isFinite(fin.y) && Number.isFinite(fin.z))) continue;
          const frozen = gauge ? undefined : fin;
          if (c.pointPlanes.has(m.plane)) {
            members.push({ id: m.id, frozen, run: c.pointPlanes.get(m.plane)! });
          } else {
            const pd = c.planes.get(m.plane)!;
            // a symbolic-parameter equation plane stays selection/verify-only (chooseParam)
            if ([pd.cx, pd.cy, pd.cz, pd.d].every((e) => e.p === 0))
              members.push({ id: m.id, frozen, plane: { n: v3(pd.cx.k, pd.cy.k, pd.cz.k), d: pd.d.k } });
          }
        }
        if (members.length > 0) {
          // transactional (M2): the drive is an EXPERIMENT — snapshot what it may
          // mutate, and roll back if it broke anything that held before (a discrete
          // branch flip can kill a sibling given, e.g. the param root-find or a sign)
          const posBefore = new Map(pos);
          const paramBefore = paramOut;
          const pivotBefore = pivot;
          const signsHold = (): boolean =>
            c.signGivens.every((g) => {
              const q = pos.get(g.id);
              return !!q && (g.positive ? q[g.axis] > 1e-9 : q[g.axis] < -1e-9);
            });
          const signsBefore = signsHold();
          // warm-started from the pinned figure's own solution so the drive PERTURBS it
          // (branch choices preserved, minimal movement) instead of re-rolling the basins
          const retry = solvePivot(c, EC, dims0, seed, undefined, members, warm.x, lines);
          // several basins converge (mirrors, rotations) and not every one satisfies the
          // membership on FINAL positions — validate each candidate and keep the first
          // fully-good one (membership + signs + the param root-find), never seed-modulo
          let accepted = false;
          for (const sol of retry) {
            applySolutions([sol]);
            pinParam();
            resolveLatePlanes();
            const stillUnmet = drivableMemberships.some((m) => {
              const p = pos.get(m.id);
              const pl = planes.get(m.plane);
              return !p || !pl || !memberHolds3(p, pl);
            });
            const paramBroke =
              paramBefore !== null && Number.isFinite(paramBefore.value) && !(paramOut !== null && Number.isFinite(paramOut.value));
            if (!stillUnmet && !paramBroke && (!signsBefore || signsHold())) {
              accepted = true;
              break;
            }
          }
          if (!accepted && retry.length > 0) {
            pos.clear();
            for (const [id, q] of posBefore) pos.set(id, q);
            paramOut = paramBefore;
            pivot = pivotBefore;
            resolveLatePlanes();
          }
        }
      }
    }
  }

  // ---- #367: nothing pinned the placement, but the figure DOES carry an absolute-frame object.
  // The canonical placement is then an unstated choice, not a gauge — sample it, so the solid sits
  // somewhere different against the line/plane in every configuration instead of asserting the
  // coincidence that the canonical origin happens to produce.
  // #375: the same question, one step further. A ⟂-to-a-line relation constrains only which way the
  // figure FACES — where it sits is still unstated, and the pivot's least-squares has no reason to move
  // it, so a driven figure settles at the canonical origin and a line through the origin passes through
  // vertex A again (measured: dist(A, ℓ1) = 0.0000 at every seed). The guard below must therefore run on
  // the DRIVEN path too, restricted to the part the drive left free.
  //
  // #379 (ADR-3D-101) — the LANDING FUNNEL. This guard was bypassed four times in one day (#372,
  // #375 Am. 1, and the two #379 doors), every time for the same reason: a boolean per-path proxy
  // (`pivot === null`, `positionPinned`, `rotationSolved`) standing in for the semantic question —
  // which gauge components did the solve actually DETERMINE? The question is now asked per COMPONENT,
  // from the residual families present, conservatively: a component is sampled only when it is
  // PROVABLY free (unstated pinning is the lesser evil; sampling a constrained component would undo
  // what the solve established).
  //
  //  - TRANSLATION is pinned by: a point pin (even a partial one), a plane-equation pin, a driven
  //    membership, or a coordinate-plane relation that places coordinates (`zero`/`contains`).
  //    Vector/pair injections pin direction+scale and NEVER translation (door (a) — dataView documents
  //    the pivot rooting translation at a deterministic origin); similarity-invariant scalar pins pin
  //    SHAPE, not place (door (b)).
  //  - ROTATION is pinned by: any point pin (rotating about the gauge origin would drag a pinned point
  //    off its pin — rotation about the pinned point itself is a real remaining freedom, deferred and
  //    documented), vector/pair injections, a plane⟂line pin, a plane-equation pin, a membership, or an
  //    orientation-carrying coordinate-plane relation (`share`/`perp`/`contains`). An `invariantOnly`
  //    pivot FROZE the gauge rather than solving it, and a rigid motion preserves every similarity-
  //    invariant pin by definition — so nothing a frozen solve established can break here.
  //  - SCALE is never sampled (it is the similarity gauge; ADR-3D-054 owns when it is pinned).
  const translationFree =
    c.pins.length === 0 &&
    c.planePins.length === 0 &&
    c.memberships.length === 0 &&
    !c.coordPlanePins.some((cp) => cp.mode === 'zero' || cp.mode === 'contains');
  const rotationFree =
    c.pins.length === 0 &&
    c.vectorPins.length === 0 &&
    c.pairPins.length === 0 &&
    c.planeLinePerps.length === 0 &&
    gaugeLineRels.length === 0 && // S2 (#378): a driven line relation pinned the orientation
    c.planePins.length === 0 &&
    c.memberships.length === 0 &&
    !c.coordPlanePins.some((cp) => cp.mode === 'share' || cp.mode === 'perp' || cp.mode === 'contains');
  if ((translationFree || rotationFree) && c.solids.length > 0 && hasAbsoluteFrameObject(c)) {
    const gaugeIds: Id[] = [];
    for (const [id, def] of c.points) {
      if (GAUGE_KINDS.has(def.kind) || (def.kind === 'on-plane' && c.pointPlanes.has(def.plane))) gaugeIds.push(id);
    }
    if (gaugeIds.length > 0) {
      const pts = gaugeIds.map((id) => pos.get(id)).filter((p): p is Vec3 => !!p);
      const mid = pts.length ? centroid3(pts) : v3(0, 0, 0);
      let extent = 1;
      for (const p of pts) extent = Math.max(extent, dist3(p, mid));

      // The absolute objects the placement must stay CLEAR of. Sampling alone is not enough: a
      // seed that lands a vertex a hundredth of an edge from the line draws exactly the coincidence
      // this fix exists to remove (measured: seed 26 of the reported figure cleared by 0.066).
      // General position is the 2-D ADR-253 rule, placement edition.
      // #372: clearing in R³ is necessary and NOT sufficient — the student judges the DRAWING, and a
      // line can miss a vertex by a wide margin in space while projecting straight through it (measured
      // on the reported figure: 0.28 of an edge in world space, 4.9 px on screen). So a candidate is
      // scored on BOTH: its world clearance, and its clearance as seen from the DEFAULT view. Fixed
      // direction, never the live camera — scoring against that would re-place the figure as the student
      // orbits. A plane is excluded from the projected test on purpose: it projects to a region, so a
      // point drawn "inside" it is ordinary depth ambiguity, not a claimed coincidence.
      const view = defaultViewFrame();
      const flat = (p: Vec3) => ({ x: dot3(p, view.right), y: dot3(p, view.up) });
      const clearance = (): number => {
        let worst = Infinity;
        for (const id of gaugeIds) {
          const p = pos.get(id);
          if (!p) continue;
          const fp = flat(p);
          for (const L of lines.values()) {
            const dn = norm3(L.dir);
            if (dn < 1e-9) continue;
            const ap = sub3(p, L.anchor);
            worst = Math.min(worst, norm3(sub3(ap, scale3(L.dir, dot3(ap, L.dir) / (dn * dn)))));
            // …and the same separation in the projection
            const fa = flat(L.anchor);
            const fd = flat(add3(L.anchor, L.dir));
            const ex = fd.x - fa.x;
            const ey = fd.y - fa.y;
            const len = Math.hypot(ex, ey);
            worst = Math.min(
              worst,
              len < 1e-9
                ? Math.hypot(fp.x - fa.x, fp.y - fa.y) // the line points at the viewer: it draws as a dot
                : Math.abs((fp.x - fa.x) * ey - (fp.y - fa.y) * ex) / len,
            );
          }
          for (const pl of planes.values()) {
            const nn = norm3(pl.n);
            if (nn > 1e-9) worst = Math.min(worst, Math.abs(dot3(pl.n, p) + pl.d) / nn);
          }
          for (const [id2, def2] of c.points) {
            if (def2.kind !== 'coord' && def2.kind !== 'coord-sym') continue;
            const q = pos.get(id2);
            if (!q) continue;
            worst = Math.min(worst, dist3(p, q));
            const fq = flat(q);
            worst = Math.min(worst, Math.hypot(fp.x - fq.x, fp.y - fq.y));
          }
        }
        return worst;
      };

      const canonical = new Map(gaugeIds.map((id) => [id, pos.get(id)!] as const));
      const place = (g: Parameters<typeof applyGauge>[1]): void => {
        for (const id of gaugeIds) {
          const p = canonical.get(id);
          if (p) pos.set(id, applyGauge(p, g));
        }
      };
      const MARGIN = 0.25 * extent;
      let best: { g: Parameters<typeof applyGauge>[1]; clear: number } | null = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        const k = (n: string) => sample(seed, `placement-${attempt}-${n}`, -1, 1);
        const axis = normalize3(v3(k('ax'), k('ay'), k('az') + 0.3));
        // only PROVABLY free components are sampled — a constrained one keeps what the solve chose
        const g = {
          t: translationFree ? v3(k('tx') * extent * 1.5, k('ty') * extent * 1.5, k('tz') * extent * 1.5) : v3(0, 0, 0),
          w: rotationFree ? scale3(axis, sample(seed, `placement-${attempt}-angle`, 0, 2 * Math.PI)) : v3(0, 0, 0),
          s: 1,
          mirror: false,
        };
        place(g);
        const clear = clearance();
        if (!best || clear > best.clear) best = { g, clear };
        if (clear >= MARGIN) break;
      }
      if (best) place(best.g);
    }
  }

  // ---- ADR-3D-032: the parameter root-find (defined pre-pivot as `pinParam`) runs
  // after the pivot because the residuals read the pivot-placed points (A, B), never
  // before. Idempotent — a stage-4 membership drive may have run it already.
  pinParam();

  // ---- planes through points + rel-planes (resolved from FINAL positions, post-pivot)
  resolveLatePlanes();

  // ---- lines THROUGH points (V5) — resolvable only from final positions
  for (const [name, def] of c.pointLines) {
    const a = pos.get(def.a);
    const b = pos.get(def.b);
    if (a && b && dist3(a, b) > 1e-12) lines.set(name, { anchor: a, dir: sub3(b, a) });
  }

  // ---- a second line pass: lines between point-planes only became resolvable now
  for (const [name] of c.lines) {
    if (lines.has(name)) continue;
    const def = c.lines.get(name)!;
    if (def.kind === 'plane-plane' && planes.has(def.p1) && planes.has(def.p2)) {
      const line = planePlaneLine(planes.get(def.p1)!, planes.get(def.p2)!);
      if (line) lines.set(name, line);
    }
  }

  // ---- V8-h (G8): DERIVED lines from other lines/planes — the common perpendicular of two lines,
  // and the projection of a line onto a plane. Resolved after the base lines + planes are placed.
  for (const [name, def] of c.lines) {
    if (lines.has(name)) continue;
    if (def.kind === 'common-perp') {
      const l1 = lines.get(def.line1);
      const l2 = lines.get(def.line2);
      if (!l1 || !l2) continue;
      const d = cross3(l1.dir, l2.dir); // ⟂ both (cross is internal-only, never displayed)
      if (norm3(d) < 1e-9) continue; // parallel lines have no unique common perpendicular
      // anchor = the foot on l1 of the shortest connecting segment (closest points between two lines)
      const r = sub3(l1.anchor, l2.anchor);
      const a11 = dot3(l1.dir, l1.dir), a12 = -dot3(l1.dir, l2.dir), a22 = dot3(l2.dir, l2.dir);
      const b1 = -dot3(l1.dir, r), b2 = dot3(l2.dir, r);
      const detm = a11 * a22 - a12 * a12;
      const anchor = Math.abs(detm) < 1e-12 ? l1.anchor : add3(l1.anchor, scale3(l1.dir, (b1 * a22 - a12 * b2) / detm));
      lines.set(name, { anchor, dir: d });
    } else if (def.kind === 'line-projection') {
      const l = lines.get(def.line);
      const pl = planes.get(def.plane);
      if (!l || !pl) continue;
      const nn = normalize3(pl.n);
      const dir = sub3(l.dir, scale3(nn, dot3(l.dir, nn))); // in-plane component of the direction
      if (norm3(dir) < 1e-9) continue; // the line is ⟂ the plane → the projection is a single point
      lines.set(name, { anchor: footOnPlane(l.anchor, pl), dir });
    }
  }

  // ---- a FINAL fill for line∩plane points whose line/plane only just resolved
  for (const [id, def] of c.points) {
    if (def.kind !== 'line-plane' || pos.has(id)) continue;
    const line = lines.get(def.line);
    const pl = planes.get(def.plane);
    if (!line || !pl) continue;
    const denom = dot3(pl.n, line.dir);
    if (Math.abs(denom) > 1e-10 * Math.max(norm3(pl.n) * norm3(line.dir), 1e-12)) {
      const t = -(dot3(pl.n, line.anchor) + pl.d) / denom;
      pos.set(id, add3(line.anchor, scale3(line.dir, t)));
    }
  }

  const revolutions = c.revolutions.map((rev, i) => {
    const { r, h, origin } = revolutionDims(c, i, seed);
    return { kind: rev.kind, center: (rev.center && pos.get(rev.center)) || origin, apex: rev.apex ? pos.get(rev.apex) : undefined, r, h };
  });

  // ---- V8-i: circles in R³, resolved from the final positions/lines/planes. Also exposes each
  // circle's PLANE (under its id) so a line can intersect it.
  const circles3: Resolved3['circles3'] = [];
  for (const k of c.circles3) {
    const center = pos.get(k.def.center);
    if (!center) continue;
    let normal: Vec3, radius: number, e1: Vec3, e2: Vec3;
    if (k.def.kind === 'tangent-line') {
      const ln = lines.get(k.def.line);
      if (!ln) continue;
      const foot = footOnLine(center, ln); // the tangent point (radius ⟂ line)
      const radial = sub3(foot, center);
      radius = norm3(radial);
      if (radius < 1e-9 || norm3(ln.dir) < 1e-9) continue; // centre on the line → degenerate
      e1 = normalize3(radial);
      e2 = normalize3(sub3(ln.dir, scale3(e1, dot3(ln.dir, e1)))); // tangent dir, orthonormalised
      normal = normalize3(cross3(e1, e2));
    } else {
      const pl = planes.get(k.def.plane) ?? planeFromPointRun(c, k.def.plane, pos);
      if (!pl) continue;
      normal = normalize3(pl.n);
      const seed0 = Math.abs(normal.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
      e1 = normalize3(cross3(normal, seed0));
      e2 = cross3(normal, e1);
      radius = k.def.radius;
    }
    circles3.push({ id: k.id, center, normal, radius, e1, e2 });
    planes.set(k.id, { n: normal, d: -dot3(normal, center) }); // the circle's plane, for line∩plane
  }

  // ---- a FINAL fill for foot-line points whose named line only resolved late (a through-line
  // like a circle's tangent line) — the point loop ran before that line was in the `lines` map
  for (const [id, def] of c.points) {
    if (def.kind !== 'foot-line' || pos.has(id)) continue;
    const from = pos.get(def.from);
    const line = lines.get(def.line);
    if (from && line) pos.set(id, footOnLine(from, line));
  }

  return {
    positions: pos,
    planes,
    lines,
    param: c.param && paramOut ? { name: c.param, value: paramOut.value, roots: paramOut.roots } : null,
    pivot,
    revolutions,
    circles3,
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
  dimOverride?: number[],
  cheapSymbols?: boolean,
  symbolOverride?: Map<number, number>, // V8-c: def index → jointly-solved symbol value
): void {
  let dimCursor = 0;
  c.solids.forEach((solid, i) => {
    const key = `solid-${solid.kind}-${solid.ids.join('')}`;
    const origin = v3(i * 2.5, 0, 0); // side-by-side when a figure ever holds two solids
    const own = solidDims(solid.kind, key, seed, solid.oblique);
    const dims = dimOverride ? dimOverride.slice(dimCursor, dimCursor + own.length) : own;
    dimCursor += own.length;
    const ps = solidPositions(solid.kind, dims, origin, solid.oblique);
    solid.ids.forEach((id, j) => pos.set(id, ps[j]));
  });

  c.revolutions.forEach((rev, i) => {
    const { h, origin } = revolutionDims(c, i, seed);
    if (rev.center) pos.set(rev.center, origin);
    if (rev.apex) pos.set(rev.apex, v3(origin.x, origin.y, origin.z + h));
  });

  // ADR-3D-056 (#286): vec-defined points whose seg-perp/seg-par pin references a point placed LATER in
  // insertion order (the reference segment, or O) — deferred here, placed in a 2nd pass once it exists.
  const deferredSegPins: [Id, number][] = [];
  for (const [id, def] of c.points) {
    if (def.kind === 'solid-vertex' || def.kind === 'coord' || def.kind === 'rev-point') continue;
    if (def.kind === 'on-segment') {
      const a = pos.get(def.a);
      const b = pos.get(def.b);
      if (!a || !b) continue; // unreachable if apply enforced parents; stay total anyway
      const t = def.t ?? sample(seed, `t-${id}-${def.a}-${def.b}`, 0.22, 0.78);
      pos.set(id, lerp3(a, b, t));
    } else if (def.kind === 'on-plane') {
      // a free point riding a named plane (ADR-3D-015): sampled u,v in an in-plane frame
      // centred on the plane's own points (point-run) or the projected figure centroid
      // (equation plane); a stated side adds a sampled offset along the +z-oriented normal.
      // Only EARLIER points are read (insertion order), so adding later facts never moves it.
      const pl = planes.get(def.plane) ?? planeFromPointRun(c, def.plane, pos);
      if (!pl) continue; // degenerate/unplaced plane — flagged downstream (not-coplanar)
      const runIds = c.pointPlanes.get(def.plane);
      const anchors = runIds?.map((q) => pos.get(q)).filter((q): q is Vec3 => q !== undefined);
      const placed = [...pos.values()];
      const centre0 = anchors?.length ? centroid3(anchors) : placed.length ? centroid3(placed) : v3(0, 0, 0);
      const t0 = (dot3(pl.n, centre0) + pl.d) / dot3(pl.n, pl.n);
      const centre = sub3(centre0, scale3(pl.n, t0)); // ⟂ projection onto the plane
      let spread = 1.2;
      for (const q of placed) spread = Math.max(spread, dist3(q, centre));
      const nn = normalize3(pl.n);
      const axisSeed = Math.abs(nn.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
      const e1 = normalize3(cross3(nn, axisSeed));
      const e2 = cross3(nn, e1);
      const candidate = (k: number): Vec3 => {
        const suf = k === 0 ? '' : `-${k}`;
        const cu = sample(seed, `onplane-u-${id}${suf}`, -0.6, 0.6) * spread;
        const cv = sample(seed, `onplane-v-${id}${suf}`, -0.6, 0.6) * spread;
        return add3(centre, add3(scale3(e1, cu), scale3(e2, cv)));
      };
      // ADR-3D-080 (general position, the 2-D ADR-253 pattern): a rider parked next to an
      // existing point reads as "on" it (operator: S on the top plane landed "on A"). Step
      // deterministically to a clear spot; k = 0 keeps the legacy sample keys, so a figure
      // whose rider already sits clear is byte-identical.
      const sepOf = (q: Vec3): number => placed.reduce((m, r) => Math.min(m, dist3(q, r)), Infinity);
      const minSep = 0.22 * spread;
      let p = candidate(0);
      if (sepOf(p) < minSep) {
        let bestSep = sepOf(p);
        for (let k = 1; k <= 11 && bestSep < minSep; k++) {
          const q = candidate(k);
          const sq = sepOf(q);
          if (sq > bestSep) {
            p = q;
            bestSep = sq;
          }
        }
      }
      if (def.side) {
        // "above" = the +z side; a vertical plane keeps its own orientation here and the
        // derive-time check refuses the fact honestly (plane-side-undefined)
        const up = nn.z < -1e-9 ? scale3(nn, -1) : nn;
        p = add3(p, scale3(up, def.side * sample(seed, `onplane-h-${id}`, 0.45, 1.05) * spread));
      }
      pos.set(id, p);
    } else if (def.kind === 'partial') {
      // ADR-3D-094 (#276): a NEW point with PARTIALLY-known numeric coordinates — each null
      // component is a free sampled DOF (Lane-A absolute, like `coord`). A stated sign-given
      // on a null axis SELECTS the sample's sign, so the requirement holds in every seed by
      // construction (the on-plane `side` pattern); magnitudes are spread-scaled off zero for
      // general position, and an unsigned null axis varies its side across seeds.
      const placed = [...pos.values()];
      let spread = 1.2;
      for (const q of placed) spread = Math.max(spread, Math.abs(q.x), Math.abs(q.y), Math.abs(q.z));
      const comp = (ax: 'x' | 'y' | 'z'): number => {
        const fixed = def[ax];
        if (fixed !== null) return fixed;
        const sg = c.signGivens.find((g) => g.id === id && g.axis === ax);
        const mag = sample(seed, `partial-${ax}-${id}`, 0.3, 1.05) * spread;
        const sgn = sg ? (sg.positive ? 1 : -1) : sample(seed, `partialsgn-${ax}-${id}`, -1, 1) >= 0 ? 1 : -1;
        return sgn * mag;
      };
      pos.set(id, v3(comp('x'), comp('y'), comp('z')));
    } else if (def.kind === 'on-line') {
      // a free point riding a named line (ADR-3D-031, the on-plane rider's line edition):
      // sampled t along the unit direction around the figure centroid's ⟂ projection onto
      // the line, spread-scaled; distinct ids sample distinct t (general position).
      const ln = lines.get(def.line);
      if (!ln || norm3(ln.dir) < 1e-12) continue; // unresolved/degenerate line — flagged downstream
      const placed = [...pos.values()];
      const centre0 = placed.length ? centroid3(placed) : ln.anchor;
      const u = normalize3(ln.dir);
      const centre = add3(ln.anchor, scale3(u, dot3(sub3(centre0, ln.anchor), u)));
      let spread = 1.2;
      for (const q of placed) spread = Math.max(spread, dist3(q, centre));
      const t = sample(seed, `online-t-${id}`, -0.85, 0.85) * spread;
      pos.set(id, add3(centre, scale3(u, t)));
    } else if (def.kind === 'plane-cut') {
      // V8-b (G2): the point where a plane crosses segment a–b (the plane may be an
      // equation, a point-run, or a ⊥/∥ rel-plane — resolved from current positions)
      const pl = resolvedPlaneAt(c, def.plane, pos, planes);
      const A = pos.get(def.a);
      const B = pos.get(def.b);
      if (!pl || !A || !B) continue;
      const dir = sub3(B, A);
      const denom = dot3(pl.n, dir);
      if (Math.abs(denom) < 1e-12) continue; // segment ∥ plane — no crossing
      const t = -(dot3(pl.n, A) + pl.d) / denom;
      pos.set(id, add3(A, scale3(dir, t)));
    } else if (def.kind === 'centroid') {
      const ps = def.of.map((p) => pos.get(p));
      if (ps.some((p) => !p)) continue;
      pos.set(id, centroid3(ps as Vec3[]));
    } else if (def.kind === 'in-span') {
      pos.set(id, inSpanPosition(c, def, pos));
    } else if (def.kind === 'vec-defined') {
      const vd = c.vecDefs[def.def];
      // ADR-3D-056: a seg-perp/seg-par pin references points OUTSIDE the vecDef's terms (the fixed
      // reference segment + O), which may be inserted LATER; defer to the 2nd pass once they are placed.
      const segPin =
        vd.symbol && !symbolOverride?.has(def.def) && !cheapSymbols
          ? c.symbolPins.find(
              (p): p is Extract<Construction3['symbolPins'][number], { rel: 'seg-perp' | 'seg-par' }> =>
                (p.rel === 'seg-perp' || p.rel === 'seg-par') && p.def === def.def,
            )
          : undefined;
      if (segPin && [segPin.a, segPin.b, segPin.c, segPin.d].some((q) => q !== vd.unknown && !pos.has(q))) {
        deferredSegPins.push([id, def.def]);
        continue;
      }
      let k = 0;
      if (vd.symbol) {
        const pin = c.symbolPins.find((p) => p.def === def.def);
        if (symbolOverride?.has(def.def)) {
          k = symbolOverride.get(def.def)!; // V8-c: the pivot solved this symbol jointly with a dim
        } else if (pin && pin.rel === 'value') {
          k = pin.value; // direct assignment (k = ½) — free even during the cheap pass
        } else if (pin && cheapSymbols) {
          k = 0.35; // during the pivot's residual loop: pins never reference these points — skip the root-find
        } else if (pin) {
          const resid = (kk: number) => symbolPinResidual(c, pin, vd, pos, kk);
          const roots =
            pin.rel === 'parallel' || pin.rel === 'seg-perp' // signed residual (dot) — crosses zero
              ? signChangeRoots(resid)
              : pin.rel === 'perp' || pin.rel === 'seg-par' // non-negative residual (cross) — touches zero
                ? touchZeroRoots(resid)
                : (() => {
                    // length-rel: the residual can CROSS zero or only TOUCH it — the exam
                    // idiom |EN| = (√6/4)·|w| states the MINIMUM (a double root at the
                    // tangency). Numerically that minimum dips ~1e-7 below zero and shows
                    // as TWO crossings ~1e-3 apart whose exact split varies per seed; the
                    // TANGENCY point is the true root, so a near-zero minimum SWALLOWS its
                    // adjacent crossing pair and is ternary-refined to machine precision.
                    const refine = (k0: number): number => {
                      let lo = k0 - 0.005;
                      let hi = k0 + 0.005;
                      for (let it = 0; it < 90; it++) {
                        const m1 = lo + (hi - lo) / 3;
                        const m2 = hi - (hi - lo) / 3;
                        if (Math.abs(resid(m1)) < Math.abs(resid(m2))) hi = m2;
                        else lo = m1;
                      }
                      return (lo + hi) / 2;
                    };
                    const sc = signChangeRoots(resid);
                    const touch = touchZeroRoots((kk) => Math.abs(resid(kk)));
                    const out: number[] = [];
                    const swallowed = new Set<number>();
                    for (const t0 of touch) {
                      for (const r of sc) if (Math.abs(r - t0) < 5e-3) swallowed.add(r);
                      out.push(refine(t0));
                    }
                    for (const r of sc) if (!swallowed.has(r)) out.push(r);
                    return [...new Set(out.map((x) => +x.toFixed(9)))].sort((a, b) => a - b);
                  })();
          const chosen = firstNonDegenerateRoot(c, pin, vd, pos, roots);
          if (chosen === undefined) continue; // no non-degenerate root — unpositioned, store refuses (no-solution)
          k = chosen;
        } else {
          k = sample(seed, `sym-${vd.symbol}-${vd.unknown}`, 0.2, 0.8); // an unpinned symbol is a FREE DOF
        }
      }
      const P = solveVecDef(c, vd, pos, k);
      if (P) pos.set(id, P);
    } else if (def.kind === 'vec-pair') {
      // the cevian intersection: each relation traces an affine line in its own symbol
      const lineOf = (vd: VecDef): { b: Vec3; d: Vec3 } | null => {
        const P0 = solveVecDef(c, vd, pos, 0);
        const P1 = solveVecDef(c, vd, pos, 1);
        return P0 && P1 ? { b: P0, d: sub3(P1, P0) } : null;
      };
      const l1 = lineOf(c.vecDefs[def.def1]);
      const l2 = lineOf(c.vecDefs[def.def2]);
      if (!l1 || !l2) continue;
      const w = sub3(l2.b, l1.b);
      const a11 = dot3(l1.d, l1.d);
      const a12 = -dot3(l1.d, l2.d);
      const a22 = dot3(l2.d, l2.d);
      const det = a11 * a22 - a12 * a12;
      if (Math.abs(det) < 1e-14) continue;
      const k = (dot3(l1.d, w) * a22 - a12 * -dot3(l2.d, w)) / det;
      const t = (a11 * -dot3(l2.d, w) - a12 * dot3(l1.d, w)) / det;
      const P = add3(l1.b, scale3(l1.d, k));
      const Q = add3(l2.b, scale3(l2.d, t));
      if (dist3(P, Q) < 1e-7 * Math.max(norm3(sub3(P, l1.b)), 1)) pos.set(id, P); // must genuinely meet
    } else if (def.kind === 'foot-plane') {
      const from = pos.get(def.from);
      const pl = planes.get(def.plane);
      if (from && pl) pos.set(id, footOnPlane(from, pl));
    } else if (def.kind === 'foot-line') {
      const from = pos.get(def.from);
      const line = lines.get(def.line);
      if (from && line) pos.set(id, footOnLine(from, line));
    } else if (def.kind === 'bisector-seg') {
      // V8-f (G11): D on segment a–b, its t root-found so ray apex→D bisects ∠(a)(apex)(b).
      // f(t) = cos(apex→P(t), apex→a) − cos(apex→P(t), apex→b) is monotone on [0,1]
      // (f(0)>0 at P=a, f(1)<0 at P=b) — one internal-bisector root, found by bisection.
      const A = pos.get(def.a);
      const B = pos.get(def.b);
      const O = pos.get(def.apex);
      if (!A || !B || !O) continue;
      const d1 = normalize3(sub3(A, O));
      const d2 = normalize3(sub3(B, O));
      if (norm3(d1) < 1e-9 || norm3(d2) < 1e-9) continue; // apex coincides with a ray endpoint
      const f = (t: number): number => {
        const dp = sub3(lerp3(A, B, t), O);
        const n = Math.max(norm3(dp), 1e-12);
        return (dot3(dp, d1) - dot3(dp, d2)) / n;
      };
      let lo = 0;
      let hi = 1;
      if (f(lo) * f(hi) > 0) {
        pos.set(id, lerp3(A, B, 0.5)); // no sign change (degenerate ∠) — fall back to the midpoint
      } else {
        for (let it = 0; it < 80; it++) {
          const mid = (lo + hi) / 2;
          if (f(lo) * f(mid) <= 0) hi = mid;
          else lo = mid;
        }
        pos.set(id, lerp3(A, B, (lo + hi) / 2));
      }
    } else if (def.kind === 'foot-seg') {
      // V8-g: a triangle altitude's foot — ⟂ from `from` onto the line through a,b
      const from = pos.get(def.from);
      const A = pos.get(def.a);
      const B = pos.get(def.b);
      if (from && A && B) pos.set(id, footOnLine(from, { anchor: A, dir: sub3(B, A) }));
    } else if (def.kind === 'right-pyramid-apex') {
      // V8-j: the point on segment a–b whose in-plane offset from the base centroid is 0 (apex
      // directly above the centre ⇒ a right pyramid). Closed-form t*; unplaced if no such point.
      const A = pos.get(def.a);
      const B = pos.get(def.b);
      const bp = def.base.map((q) => pos.get(q)).filter((q): q is Vec3 => q !== undefined);
      if (A && B && bp.length === def.base.length) {
        const centroid = centroid3(bp);
        const nn = newellNormal(bp);
        if (norm3(nn) > 1e-10) {
          const n = normalize3(nn);
          const inplane = (v: Vec3) => sub3(v, scale3(n, dot3(v, n)));
          const a0 = inplane(sub3(A, centroid));
          const d0 = inplane(sub3(B, A));
          const dd = dot3(d0, d0);
          if (dd > 1e-12) {
            const t = -dot3(a0, d0) / dd;
            const resid = norm3(add3(a0, scale3(d0, t)));
            if (resid < 1e-6 * Math.max(norm3(sub3(B, A)), 1e-9)) pos.set(id, lerp3(A, B, t)); // else no right pyramid — left unplaced (honest)
          }
        }
      }
    } else if (def.kind === 'right-apex') {
      // ADR-3D-080: the right-pyramid apex SEATED on its carrier plane — the ⊥ line through the
      // base's centre (triangle: circumcentre, the solid-pyramid convention; quad: centroid) cut
      // with the point-run plane. Carrier ⊥ the base ⇒ no crossing ⇒ left unplaced (honest).
      const bp = def.base.map((q) => pos.get(q)).filter((q): q is Vec3 => q !== undefined);
      const pl = planes.get(def.plane) ?? planeFromPointRun(c, def.plane, pos);
      if (bp.length === def.base.length && bp.length >= 3 && pl) {
        // #305 (ADR-3D-090): the circumcentre for EVERY base, not just a triangle. A right pyramid
        // means equal lateral edges, so the apex's foot is equidistant from every base vertex; the
        // old quad `centroid3` was only correct where centroid = circumcentre (square/rectangle) and
        // would have gone live silently the moment an isosceles-trapezoid or right-kite base existed.
        const centre = ringCircumcentre3(bp);
        const nb = cross3(sub3(bp[1], bp[0]), sub3(bp[2], bp[0]));
        const denom = dot3(pl.n, nb);
        if (centre && Math.abs(denom) > 1e-10 * Math.max(norm3(pl.n) * norm3(nb), 1e-12)) {
          const s = -(dot3(pl.n, centre) + pl.d) / denom;
          pos.set(id, add3(centre, scale3(nb, s)));
        }
      }
    } else if (def.kind === 'foot-face') {
      // V8-e (G5): the height's foot — ⟂ from `from` onto the plane through the face pts
      const from = pos.get(def.from);
      const pts = def.face.map((q) => pos.get(q)).filter((q): q is Vec3 => q !== undefined);
      if (from && pts.length >= 3) {
        const nn = newellNormal(pts);
        if (norm3(nn) > 1e-10) pos.set(id, footOnPlane(from, { n: nn, d: -dot3(nn, pts[0]) }));
      }
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
  // ADR-3D-056 (#286) — 2nd pass: place the seg-pin vec-defined points deferred above. Their reference
  // points (O, the fixed segment) are now placed, so the symbol root-finds cleanly (E → the foot of the
  // perpendicular). This holds at EVERY seed, where before the ⊥ was pushed onto the free dims and held
  // only at lucky ones.
  for (const [id, defIdx] of deferredSegPins) {
    const vd = c.vecDefs[defIdx];
    const pin = c.symbolPins.find((p) => (p.rel === 'seg-perp' || p.rel === 'seg-par') && p.def === defIdx);
    if (!pin) continue;
    const resid = (kk: number) => symbolPinResidual(c, pin, vd, pos, kk);
    const roots = pin.rel === 'seg-perp' ? signChangeRoots(resid) : touchZeroRoots(resid);
    const chosen = firstNonDegenerateRoot(c, pin, vd, pos, roots);
    if (chosen === undefined) continue; // no non-degenerate root — unpositioned, flagged upstream
    const P = solveVecDef(c, vd, pos, chosen);
    if (P) pos.set(id, P);
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

/**
 * ADR-3D-053 (#273) — does a resolved configuration satisfy every stated REQUIREMENT?
 *
 * The 3-D sibling of the 2-D `meetsRequirements` (ADR-106/244/254). A requirement is an inequality:
 * it determines nothing, so no solver residual can reach it and no claim can verify it — instead it
 * gates WHICH sampled configuration may be shown. The measure keeps its DOF, and "show another
 * configuration" varies it inside the bound (see {@link firstSatisfyingSeed3}).
 */
export function meetsRequirements3(c: Construction3, seed: number): boolean {
  if (c.requirements.length === 0) return true;
  const r = resolve3(c, seed);
  return c.requirements.every((req) => {
    if (req.kind === 'mutual') {
      // S4 (#378): the drawn configuration must actually SHOW the stated position. For `skew` this
      // is the whole mechanism (an inequality has no residual); for the closed relations it is the
      // open half the drive cannot express — that the crossing really falls within both segments.
      const sides = mutualSides(req.a, req.b, c, { lines: r.lines, planes: r.planes }, (id) => r.positions.get(id) ?? null);
      return !!sides && mutualHolds(req.rel, sides[0], sides[1], MUTUAL_VERIFY_TOL);
    }
    const v = r.positions.get(req.vertex);
    const p = r.positions.get(req.p);
    const q = r.positions.get(req.q);
    if (!v || !p || !q) return false;
    const u1 = sub3(p, v);
    const u2 = sub3(q, v);
    const n1 = norm3(u1);
    const n2 = norm3(u2);
    if (n1 < 1e-12 || n2 < 1e-12) return false;
    const deg = (Math.acos(Math.max(-1, Math.min(1, dot3(u1, u2) / (n1 * n2)))) * 180) / Math.PI;
    return (req.min === undefined || deg > req.min) && (req.max === undefined || deg < req.max);
  });
}

/** The first seed from `from` whose configuration meets every requirement, or null within `budget`
 *  tries. Deterministic — the same figure always lands on the same drawing (ADR-3D-053). */
export function firstSatisfyingSeed3(c: Construction3, from = 0, budget = 200): number | null {
  for (let i = 0; i < budget; i++) {
    const seed = from + i;
    if (meetsRequirements3(c, seed)) return seed;
  }
  return null;
}
