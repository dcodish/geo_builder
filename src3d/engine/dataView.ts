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

import { DISPLAY_DECIMALS, fmtNum } from '../../shell/format';
import { resolve3, scaleKnown3, translationKnown3, vectorFramePinned3 } from './evaluate';
import { cross3, dot3, norm3, runNormal, sub3, type Vec3 } from './vec3';
import { figureSymbolsOf } from './types';
import { angleBetweenOperands, containmentDeviation, distanceBetween, figureExtent, mutualHolds, mutualSides, MUTUAL_VERIFY_TOL, operandLabel, planeCoincidenceDeviation, relDeviation, resolveOperand } from './operands';
import type { Construction3, Id, MutualRel3, Operand3, Positions3 } from './types';

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

/** S4 (#378): how two named objects lie relative to one another — STRUCTURED, because there is no
 *  standard symbol for skew lines (the textbook says «מצטלבים»), so the words are the App's to pick
 *  in the reader's language. `perpendicular` rides alongside a mutual position, not instead of it. */
export interface MutualRow {
  a: string;
  b: string;
  /** #577: `contained` is the linear×planar cell's own answer — a segment lying IN a plane is not
   *  'parallel' to it, and saying so would be a false statement. */
  rel: MutualRel3 | 'perpendicular' | 'contained';
  /** #577: a LINEAR×PLANAR pair, with `a` the linear side. The wording is asymmetric here — «FG
   *  מקביל למישור ABCD», never the symmetric «מקבילים», which misreads for a plane — so the row
   *  carries its own kind rather than the App re-deriving it from the labels. */
  mixed?: true;
}

export interface DataPanel {
  /** Derived equalities among declared vectors, e.g. `|u| = |v| = |w|` (+ stated value). */
  relations: string[];
  /** Mutual positions among the figure's NAMED objects — stated or merely holding. */
  mutual: MutualRow[];
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
  return p.relations.length === 0 && p.mutual.length === 0 && p.vectors.length === 0 && p.points.length === 0 && p.planes.length === 0 && p.params.length === 0;
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

/** Render a number cleanly: integers plain, small fractions as p/q, an opt-in SURD tier (#269), else
 *  `decimals` places (default 2 — the panel's house precision; #491 lets a roomier surface ask for more). */
export function cleanNum(x: number, tol = 1e-5, surd = false, decimals = DISPLAY_DECIMALS): string {
  // default tolerance sized for the pivot's numeric floor (~1e-7), far under display
  // grain; coefficients from a DOUBLE-ROOT solve carry the intrinsic √noise (~1e-4)
  // and pass tol = 2e-3 (cleanCoef) — claims still guard correctness at 2e-5
  if (Math.abs(x - Math.round(x)) < tol) return String(Math.round(x));
  for (let q = 2; q <= 24; q++) {
    const p = x * q;
    if (Math.abs(p - Math.round(p)) < tol && Math.abs(Math.round(p)) <= 400) return `${Math.round(p)}/${q}`;
  }
  if (surd) { const s = trySurd(x, tol); if (s) return s; }
  // #723: the decimal fallback is the SHARED formatter — the exact tiers above are 3-D's own and untouched
  return fmtNum(x, decimals);
}
/** A magnitude / coordinate value — the same tiers as `cleanNum` plus the surd tier (#269).
 *  `decimals` (#491) is the DECIMAL FALLBACK only: every exact tier above it is unaffected, so a caller
 *  asking for more places never trades away a surd — it only stops coarsening what has no exact form. */
export const cleanMag = (x: number, decimals = 2): string => cleanNum(x, 1e-5, true, decimals);

const cleanCoef = (x: number): string => cleanNum(x, 2e-3);

/**
 * #480 — how a figure parameter's value is written, for the data panel AND the query lane. Shared so a
 * panel row and a query answer can never disagree about the same symbol.
 *
 * The presentation is the SOLUTION SET, not the branch this drawing happens to show ([ADR-052](docs/06-decisions.md#adr-052),
 * and [ADR-3D-118](docs/06b-decisions-3d.md) for the canvas edition of the same rule): with two roots the
 * honest answer to «what is m?» is `±√2` — the student's own answer to that exam question — and printing
 * `-1.41` instead would state one of them as if the givens had forced it. Language-neutral by
 * construction (`±`, `{…}`), because it renders inside both locales.
 *
 * `null` means the figure does not determine the symbol at all — the caller decides whether that reads
 * as an open `?` row or an «undetermined» note.
 */
export function formatBranches(branches: number[]): string | null {
  if (branches.length === 0) return null;
  if (branches.length === 1) return cleanMag(branches[0]);
  const sorted = [...branches].sort((a, b) => a - b);
  // a symmetric pair is the common bagrut shape (±√2, ±2√15) and reads best in ± form
  if (sorted.length === 2 && Math.abs(sorted[0] + sorted[1]) <= 1e-6 * Math.max(1, Math.abs(sorted[1]))) {
    return `±${cleanMag(Math.abs(sorted[1]))}`;
  }
  return `{${sorted.map(cleanMag).join(', ')}}`;
}

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

/**
 * #317 — the CANONICAL equation of a plane sampled across configurations, or null when it is not
 * knowledge. THE shared derivation: the panel's planes block and the query lane both call this, so a
 * «מישור ABC» question and the panel row for the same plane can never disagree (the #481 lesson —
 * one formatting seam, never a private formatter).
 *
 * Canonical = unit normal with a POSITIVE leading coefficient, which is what makes cross-sample
 * comparison meaningful (the same plane resolves with an arbitrary normal sign and length per solve).
 * The agreement gate across the samples is the honesty half: an equation that varies with the seed is
 * a sampled drawing, not a forced consequence of the givens, and never prints (the #371/#481 rule).
 */
export function canonicalPlaneEq(
  per: ({ n: Vec3; d: number } | undefined)[],
): { x: number; y: number; z: number; d: number } | null {
  if (per.length === 0 || per.some((p) => !p)) return null;
  const canon = per.map((p) => {
    const n = Math.hypot(p!.n.x, p!.n.y, p!.n.z);
    if (n < EPS) return null;
    const u = { x: p!.n.x / n, y: p!.n.y / n, z: p!.n.z / n, d: p!.d / n };
    const lead = [u.x, u.y, u.z].find((v) => Math.abs(v) > 1e-6) ?? 1;
    return lead < 0 ? { x: -u.x, y: -u.y, z: -u.z, d: -u.d } : u;
  });
  if (canon.some((v) => !v)) return null;
  const keys = ['x', 'y', 'z', 'd'] as const;
  if (!canon.every((v) => keys.every((k) => Math.abs(v![k] - canon[0]![k]) < 1e-4))) return null;
  return canon[0]!;
}

/**
 * #317 — the PARAMETRIC form of a plane named by a point RUN, or null when it is not knowledge.
 *
 * The second half of the shared plane seam beside {@link canonicalPlaneEq}: a plane has two standard
 * representations and the panel has always printed both, so the query lane must give both too, from the
 * same derivation (operator, 2026-08-15: *"whenever giving a plane, always give both representations if
 * possible"*). Two callers, one definition — a plane's two forms can never describe different planes.
 *
 * Knowledge here means the ANCHOR and both spanning edges are identical in EVERY sampled configuration.
 * An anchor that slides or an edge that changes with the seed is a drawing, not a consequence of the
 * givens, and prints nothing (the #371/#481 rule) — which is what "if possible" resolves to.
 */
export function parametricPlaneForm(run: Id[] | undefined, positions: Positions3[], symbol = 'π'): string | null {
  if (!run || run.length < 3 || positions.length < 2) return null;
  const anchors = positions.map((pos) => pos.get(run[0]));
  if (!anchors.every((p): p is Vec3 => !!p)) return null;
  if (!anchors.every((p) => sameVec(p, anchors[0]))) return null;
  const stableEdge = (a: Id, b: Id): Vec3 | null => {
    const ds = positions.map((pos) => {
      const p = pos.get(a);
      const q = pos.get(b);
      return p && q ? sub3(q, p) : null;
    });
    if (!ds.every((d): d is Vec3 => !!d)) return null;
    return ds.every((d) => sameVec(d, ds[0])) ? ds[0] : null;
  };
  const e1 = stableEdge(run[0], run[1]);
  const e2 = stableEdge(run[0], run[run.length - 1]);
  if (!e1 || !e2) return null;
  return `${symbol} = ${coordStr(anchors[0])} + t·${coordStr(e1)} + s·${coordStr(e2)}`;
}

/**
 * #823 (ADR-3D-187) — THE SYMBOL EACH PLANE'S PARAMETRIC FORM IS WRITTEN AGAINST.
 *
 * The parametric row used to open with a bare `x =`, which reads as the coordinate x and says nothing
 * about WHICH plane is being described (operator, 2026-08-30). It is now the plane's own symbol: «π»
 * when the figure has one plane, «π1», «π2» … when it has several.
 *
 * Composed ONCE, here, and read by both surfaces that print a plane — the panel's planes block and the
 * query lane — so the two can never disagree about which plane is π1 (the #653 class: two surfaces
 * answering one question from two sources). The enumeration follows the panel's own iteration order,
 * which is the authority for "the figure's planes".
 *
 * A plane the student NAMED keeps its own name and is never renumbered, and its name is reserved so a
 * generated symbol can never collide with it.
 */
export function planeSymbols(c: Construction3): Map<string, string> {
  const named = new Set(c.planes.keys());
  const universe = [...c.pointPlanes.keys(), ...c.relPlanes.keys(), ...named];
  const out = new Map<string, string>();
  const single = universe.length === 1;
  let n = 0;
  for (const name of universe) {
    if (named.has(name)) {
      out.set(name, name); // the student's own name outranks any symbol we would mint
      continue;
    }
    if (single) {
      out.set(name, 'π');
      continue;
    }
    do n += 1;
    while (named.has(`π${n}`)); // never collide with a plane the student called π2
    out.set(name, `π${n}`);
  }
  return out;
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
  const n = runNormal(pts as Vec3[]);
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
  // #517: both anchors are the SHARED predicates in evaluate.ts — a fresh `C(2,1,0)` lands in
  // `c.points` as kind 'coord', never in `c.pins`, and the private `c.pins.length > 0` enumeration
  // here suppressed every knowledge family for a figure of bare injected points.
  const translationPinned = translationKnown3(c);
  // Vector coordinates (a difference — translation cancels) keep the FRAME + seed-stability gate:
  // the seeds VARY the rotation/dims gauge (operator-validated 2026-07-25: with only DE=(0,2,0)
  // pinned, u's coords correctly do NOT print while v = 3·DE — parallel to the pin, genuinely
  // derivable — correctly DOES). Only TRANSLATION is a deterministic gauge the seeds never vary,
  // which is why the point/plane families need the explicit translationPinned anchor.
  const vectorFrame = vectorFramePinned3(c);
  // ADR-3D-054 (#268) — a LENGTH needs less than a coordinate does. A coordinate without a frame is
  // pure gauge, but a length is gauge only when the SCALE is free, and an absolute size given ("|u| = 3")
  // pins the scale with no coordinate frame anywhere. Gating magnitudes on `hasFrame` therefore withheld
  // values the engine had already solved exactly: the operator's prism reported |u| and |v| (stated) but
  // never |w| = 2.5, though it is forced by the givens and identical in every sampled configuration.
  // The second gate is still needed — the first dim of every solid is the frozen similarity gauge, so a
  // bare cube reports |AB| = 1.000000 at every seed and dropping the check outright would print that as
  // data (the ADR-052 cardinal sin). #517: the KNOWLEDGE question is `scaleKnown3` — the solver's
  // narrower `scalePinned` (gauge-freeze safety) must not count bare coordinate points, but two of
  // them state a distance and so DO make magnitudes knowledge.
  const hasScale = scaleKnown3(c);

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
  // #811 (ADR-3D-182): the universe the DERIVED relations (|a| = |b|, a·b = 0) scan. `addEntry` below
  // presents a drawn SEGMENT as a vector — label, decomposition, coordinates, |BC|, BC² — while the
  // relation blocks iterated `c.vectors` alone, so the same object was a vector for display and not
  // for derivation (#558/#577's class: the object exists but is outside the universe the derivation
  // scans; a third loop would recommit it). One list: declared vectors first, then the student's
  // drawn segments and arrows, deduplicated by their point pair so «AB = u» + segment AB is one row
  // under `u`. Solid EDGES stay out (a cube's 12 edges are 66 mostly-noise pairs — the ADR-3D-104
  // flood-control ruling); a segment the student named is not flood.
  const relUniverse: [string, { from: Id; to: Id }][] = [];
  {
    const seen = new Set<string>();
    for (const [name, d] of vecNames) {
      seen.add(pairKey(d.from, d.to));
      relUniverse.push([name, d]);
    }
    for (const [a, b] of [...c.segments, ...c.arrows]) {
      const key = pairKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      relUniverse.push([`${a}${b}`, { from: a, to: b }]);
    }
  }
  const relLabel = (name: string) => (c.vectors.has(name) ? `|${name}|` : `|${name}|`);
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
  const mutual: MutualRow[] = [];
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
    const mags = relUniverse.map(([name, d]) => ({
      name,
      d,
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
        const stated = cls.map((n) => { const e = relUniverse.find(([nm]) => nm === n)![1]; return lengths.get(pairKey(e.from, e.to)); }).find((v) => v !== undefined);
        // no stated number? a frame can still DERIVE one — append it when the class
        // length is the same in every sampled configuration (scale is pinned)
        const per = mags[i].per as number[];
        const derived =
          stated === undefined && hasScale && per.every((m) => Math.abs(m - per[0]) < 1e-6 * Math.max(1, per[0])) ? per[0] : undefined;
        const val = stated ?? derived;
        relations.push(cls.map(relLabel).join(' = ') + (val !== undefined ? ` = ${cleanMag(val)}` : ''));
      }
    }
  }

  // derived PERPENDICULARITY among the declared vectors: u·v = 0 (operator, 2026-07-08).
  // The dot product's VALUE is gauge (scale varies per seed), but its being ZERO is a
  // shape property — invariant across every sampled configuration; so a pair reads as
  // perpendicular iff the normalised dot (the cosine) is ~0 in EVERY seed (the same
  // multi-sample discipline the magnitude equalities use). ⊥ from construction (cube /
  // pyramid-height edges) or from a stated ⟂ given both surface identically — for every object in
  // `relUniverse` (#811: a drawn segment included; before, a segment was presented as a vector but
  // never scanned here, and this comment claimed coverage that did not exist).
  {
    const dirs = relUniverse.map(([name, d]) => ({
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

  // S4 (#378, ADR-3D-104): how the figure's named objects LIE relative to one another.
  //
  // Operator, 2026-07-28: *"the data panel should say AB and CD מצטלבים. it is true that in this case
  // user entered it so its obvious but we still put those things in the data panel. we should also be
  // able to calc such cases and write them if figure holds them."* So this reports the relation
  // whether it was STATED or merely holds — the panel's job is to lay out what is true, and a student
  // organizing their data needs the forced relations they did not think to write down.
  //
  // Scope is the flood control: pairs are drawn from the objects the student NAMED (drawn segments +
  // named lines), never every solid edge — a cube's 12 edges would be 66 pairs of mostly noise. Pairs
  // SHARING an endpoint are skipped too: two segments from one vertex obviously meet there.
  //
  // Emitted STRUCTURED, not as a formatted string: there is no standard symbol for skew lines (the
  // textbook writes «מצטלבים» in words), so rendering is the App's job, in the reader's language.
  // #577 + #558 (ADR-3D-154): ONE universe, ONE loop.
  //
  // This used to be TWO hand-built loops — an S4 block over `c.segments` + named lines, and a #384
  // block over planes — and the shape of that is the defect: a pair whose two sides sat in different
  // loops could never be asked about. So «FG ∥ מישור ABCD» produced no row even though the STATEMENT
  // lane already verifies and drives it (`relDeviation`, ADR-3D-105 — the engine understood more than
  // the UI communicated, the ADR-3D-108 theme again), declared vectors were in no universe at all, and
  // a named line could not be compared against a solid's undrawn edge (#558).
  //
  // A third loop would have recommitted the class error. Instead the universe is built once and
  // PARTITIONED (linear / planar), and one double loop dispatches on the two sides' kinds. Adding a
  // future operand kind is then an entry in the universe, not a new loop.
  {
    type Side = {
      op: Operand3;
      label: string;
      /** Endpoints, when the object has them — the shared-endpoint and own-edge skips read these. */
      ids: Id[];
      planar: boolean;
      /** #558: a SOLID EDGE, admitted only against a named line (see the flood control below). */
      edge?: true;
    };
    const linear: Side[] = [];
    const planar: Side[] = [];
    const seenPair = new Set<string>();
    const addLinear = (s: Side, key?: string) => {
      if (key) {
        if (seenPair.has(key)) return; // the same physical object, named twice, is one row not three
        seenPair.add(key);
      }
      linear.push(s);
    };
    for (const [a, b] of c.segments) addLinear({ op: { kind: 'segment', a, b }, label: `${a}${b}`, ids: [a, b], planar: false }, pairKey(a, b));
    for (const n of [...c.lines.keys(), ...c.pointLines.keys()]) linear.push({ op: { kind: 'line', name: n }, label: n, ids: [], planar: false });
    // #577: declared vectors and ink arrows were outside the universe entirely — the reported figure's
    // FG is a declared vector, which is why it could not appear even against another linear object.
    for (const [n, d] of c.vectors) addLinear({ op: { kind: 'vector', name: n }, label: n, ids: [d.from, d.to], planar: false }, pairKey(d.from, d.to));
    for (const [a, b] of c.arrows) addLinear({ op: { kind: 'segment', a, b }, label: `${a}${b}`, ids: [a, b], planar: false }, pairKey(a, b));
    // #558: SOLID EDGES. The flood control that makes this affordable is the `edge` flag, enforced in
    // the loop: an edge pairs ONLY with a named line (one line × ~12 edges), never with another edge
    // (a cube's 12 edges would be 66 mostly-noise pairs — the ADR-3D-104 scope ruling).
    for (const s of c.solids) {
      for (const [a, b] of s.edges) addLinear({ op: { kind: 'segment', a, b }, label: `${a}${b}`, ids: [a, b], planar: false, edge: true }, pairKey(a, b));
    }
    for (const [n, ids] of c.pointPlanes) planar.push({ op: { kind: 'plane-run', ids: [...ids] }, label: n, ids: [...ids], planar: true });
    for (const n of c.planes.keys()) planar.push({ op: { kind: 'plane-named', name: n }, label: n, ids: [], planar: true });
    for (const n of c.relPlanes.keys()) planar.push({ op: { kind: 'plane-named', name: n }, label: n, ids: [], planar: true });

    const universe = [...linear, ...planar];
    const REL_ORDER: MutualRel3[] = ['coincident', 'parallel', 'intersecting', 'skew'];
    const TOL = 1e-4;
    for (let i = 0; i < universe.length; i++) {
      for (let j = i + 1; j < universe.length; j++) {
        const A = universe[i];
        const B = universe[j];
        // #558's gate: an undrawn solid edge earns a row only against a NAMED LINE — the book's
        // «ℓ ⟂ BCK ⇒ ℓ ⟂ B'C'» class, and nothing wider.
        if (A.edge || B.edge) {
          const other = A.edge ? B : A;
          const both = A.edge && B.edge;
          if (both || other.op.kind !== 'line') continue;
        }
        if (!A.planar && !B.planar) {
          // linear × linear — unchanged from the S4 block.
          // The shared-endpoint skip is a LINEAR notion and stays scoped to this branch: two segments
          // from one vertex obviously meet there. Two PLANES sharing two points do not meet trivially
          // at all — hoisting this test out of here silently dropped «ABC ⟂ ABD».
          // #811 (ADR-3D-182): the shared-endpoint test is about POSITION — two segments from one vertex
          // obviously meet there — so it suppresses the position row only. It used to `continue` out of
          // the whole branch, taking the ⟂ row 13 lines below with it, although that row's own comment
          // says ⟂ is position-independent. Adjacent edges of every box, cube and prism share a vertex,
          // so the most common perpendicularity in the corpus (the exam's AB·BC = 0) was unreachable.
          const adjacent = A.ids.some((id) => B.ids.includes(id));
          const sidesAt = resolved.map((res) =>
            mutualSides(A.op, B.op, c, { lines: res.lines, planes: res.planes }, (id) => res.positions.get(id) ?? null),
          );
          if (sidesAt.some((s) => !s)) continue;
          // the SAME relation must hold in every sampled configuration — one drawing is not knowledge
          const rel = REL_ORDER.find((r) => sidesAt.every((s) => mutualHolds(r, s![0], s![1], MUTUAL_VERIFY_TOL)));
          // an EDGE pair reports only the informative relations: a 'skew'/'intersecting' row on every
          // undrawn edge of a solid is exactly the noise the scope rule exists to keep out
          const informative = !(A.edge || B.edge) || rel === 'parallel' || rel === 'coincident';
          if (rel && informative && !adjacent) mutual.push({ a: A.label, b: B.label, rel });
          // ⟂ is a DIRECTION relation, independent of position: two skew lines can be perpendicular,
          // so it is reported alongside rather than instead of the mutual position.
          const perp = sidesAt.every((s) => {
            const d1 = s![0].geom.dir!;
            const d2 = s![1].geom.dir!;
            const den = Math.hypot(d1.x, d1.y, d1.z) * Math.hypot(d2.x, d2.y, d2.z);
            return den > EPS && Math.abs(dot3(d1, d2)) / den < 1e-4;
          });
          if (perp) mutual.push({ a: A.label, b: B.label, rel: 'perpendicular' });
          continue;
        }

        const geoms = resolved.map((res) => {
          const at = (id: Id) => res.positions.get(id) ?? null;
          const abs = { lines: res.lines, planes: res.planes };
          return [resolveOperand(A.op, c, abs)(at), resolveOperand(B.op, c, abs)(at)] as const;
        });

        if (A.planar && B.planar) {
          // plane × plane — unchanged from the #384 block. Only the INFORMATIVE relations: two generic
          // planes always intersect, so a plain 'intersecting' row would be noise.
          if (geoms.some(([a, b]) => !a?.normal || !b?.normal)) continue;
          const meas = geoms.map(([a, b]) => {
            const na = a!.normal!;
            const nb = b!.normal!;
            const den = Math.max(norm3(na) * norm3(nb), 1e-12);
            return { cos: dot3(na, nb) / den, cross: norm3(cross3(na, nb)) / den };
          });
          if (meas.every((x) => x.cross < TOL)) {
            const coin = geoms.every(([a, b], k) => {
              const dev = planeCoincidenceDeviation(a!, b!, figureExtent(positions[k]));
              return dev !== null && Math.abs(dev) < TOL;
            });
            mutual.push({ a: A.label, b: B.label, rel: coin ? 'coincident' : 'parallel' });
          } else if (meas.every((x) => Math.abs(x.cos) < TOL)) {
            mutual.push({ a: A.label, b: B.label, rel: 'perpendicular' });
          }
          continue;
        }

        // linear × planar (#577) — the cell that had no code path at all. The math is NOT re-derived:
        // `relDeviation` is the same reading the STATEMENT lane verifies and drives with (ADR-3D-105),
        // so a typed «FG מקביל למישור ABCD» and this passive row can never disagree.
        const [lin, pln] = A.planar ? [B, A] : [A, B];
        // flood control, the linear×planar twin of the shared-endpoint skip: a segment that is an edge
        // or a diagonal of the plane's OWN defining run is contained in it by construction — saying so
        // is noise, not knowledge.
        if (pln.ids.length > 0 && lin.ids.length > 0 && lin.ids.every((id) => pln.ids.includes(id))) continue;
        if (geoms.some(([a, b]) => !a || !b)) continue;
        const devs = geoms.map(([a, b]) => ({
          par: relDeviation('parallel', undefined, a!, b!),
          perp: relDeviation('perp', undefined, a!, b!),
        }));
        if (devs.some((d) => d.par === null || d.perp === null)) continue;
        if (devs.every((d) => d.par! < TOL)) {
          // a line with |cos(dir, normal)| = 0 AND no offset LIES IN the plane — reporting that as
          // plain 'parallel' would be a false statement, so it gets its own row (which also delivers
          // the `contains` cell ADR-3D-105 left planned). Operator-decided at arming.
          // #614: the SAME predicate the statement lane verifies and drives with, so the row the panel
          // prints and the sentence the student may type can never mean different things.
          const contained = geoms.every(([a, b], k) => {
            const dev = containmentDeviation(a!, b!, figureExtent(positions[k]));
            return dev !== null && dev < TOL;
          });
          mutual.push({ a: lin.label, b: pln.label, rel: contained ? 'contained' : 'parallel', mixed: true });
        } else if (devs.every((d) => d.perp! < TOL)) {
          mutual.push({ a: lin.label, b: pln.label, rel: 'perpendicular', mixed: true });
        }
        // a generic crossing is noise — the #384 precedent, applied to the mixed column too
      }
    }
  }

  // #384: stated DISTANCES — «המרחק בין AB לבין CD הוא 3» left the panel silent (operator play,
  // test 10). One row per stated distance (pin or claim, deduped), printed FROM THE FIGURE via the
  // same geometry the drive/claim read — so the row is confirmation, not an echo: it appears only
  // when the drawing realises the stated value in every sampled configuration. A distance carries
  // units, so a stated one pins the scale and the hasScale gate is naturally met.
  {
    const opLabel = operandLabel;
    const stated: { a: Operand3; b: Operand3 }[] = [
      ...c.scalarPins.flatMap((p) => (p.kind === 'distance' ? [{ a: p.a, b: p.b }] : [])),
      ...c.claims.flatMap((cl) => (cl.type === 'distance-rel' ? [{ a: cl.a, b: cl.b }] : [])),
    ];
    const seen = new Set<string>();
    for (const { a, b } of stated) {
      const key = JSON.stringify([a, b]);
      if (seen.has(key) || !hasScale) continue;
      seen.add(key);
      const ds = resolved.map((res) => {
        const at = (id: Id) => res.positions.get(id) ?? null;
        const abs = { lines: res.lines, planes: res.planes };
        const ga = resolveOperand(a, c, abs)(at);
        const gb = resolveOperand(b, c, abs)(at);
        return ga && gb ? distanceBetween(ga, gb) : null;
      });
      if (ds.some((d) => d === null)) continue;
      const [d0, d1, d2] = ds as number[];
      if (Math.abs(d0 - d1) > 1e-4 * Math.max(d0, 1) || Math.abs(d0 - d2) > 1e-4 * Math.max(d0, 1)) continue;
      relations.push(`d(${opLabel(a)}, ${opLabel(b)}) = ${cleanMag(d0)}`);
    }
  }

  // #523 — a NAMED angle between any two operands («הזווית בין המישור ABC למישור SBC היא α»): the
  // general twin of the `linePlaneMarks` loop above, printed under the SAME knowledge gate — the value
  // appears only when every sampled configuration agrees, so a named angle the givens do not determine
  // draws its name and no number. Measured by `angleBetweenOperands`, the function the claim verifier's
  // `relDeviation` reads, so the printed value and the tested one cannot disagree.
  for (const mk of c.relMarks) {
    const degs = resolved.map((res) => {
      const at = (id: Id) => res.positions.get(id) ?? null;
      const abs = { lines: res.lines, planes: res.planes };
      const ga = resolveOperand(mk.a, c, abs)(at);
      const gb = resolveOperand(mk.b, c, abs)(at);
      return ga && gb ? angleBetweenOperands(ga, gb) : null;
    });
    if (degs.every((d): d is number => d !== null) && degs.every((d) => Math.abs(d - degs[0]!) < 1e-4))
      relations.push(`${mk.label} = ${cleanNum(degs[0]!, 1e-3)}°`);
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
      /**
       * #827 (ADR-3D-194) — BRANCH COVERAGE, not just seed agreement.
       *
       * Agreeing across the three sampled configurations proves the coordinate does not move with
       * the GAUGE. It does not prove the givens determine it: the pivot picks a branch with
       * `pool[seed % pool.length]`, so a two-branch value can read stable at some seeds and open at
       * others — the operator saw `D(3, 4, 0)` at seed 17 where `p = ±4` and −4 holds equally.
       *
       * So an axis is knowledge only when it ALSO agrees across the admissible pool at every
       * sampled seed. This is #797 (ADR-3D-168 Am. 1) applied one lane over: that ADR established
       * for pin symbols that seed-stability alone is not determinedness; coordinates had no
       * equivalent guard. More seeds cannot substitute — they resample the gauge, and every sample
       * can still land in the same branch.
       */
      const branchAgrees = (ax: 'x' | 'y' | 'z'): boolean =>
        resolved.every((r) => {
          const roots = r.pivot?.pointRoots?.[id];
          if (!roots || roots.length <= 1) return true; // one solution ⇒ no branch to miss
          return roots.every((q) => near(q[ax], roots[0][ax]));
        });
      const stableAx = axes.map((ax) => near(ps[0]![ax], ps[1]![ax]) && near(ps[0]![ax], ps[2]![ax]) && branchAgrees(ax));
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
    // #487 (ADR-3D-124): a FREE plane joins the same multi-sample gate — while unpinned it RESAMPLES,
    // so the agreement check drops it (a sampled equation is not knowledge, the #371/#481 rule); once
    // pinned it is identical in every configuration and its forced equation surfaces, which is exactly
    // the exam's «מצאו את משוואת המישור» moment.
    const symbols = planeSymbols(c); // #823 — one enumeration, shared with the query lane
    const freeNames = [...c.planes.keys()].filter((n) => c.planes.get(n)!.free);
    for (const name of [...c.pointPlanes.keys(), ...c.relPlanes.keys(), ...freeNames]) {
      const per = resolved.map((r) => r.planes.get(name));
      if (per.some((p) => !p)) continue;
      const eq = canonicalPlaneEq(per);
      if (!eq) continue;
      planes.push(`${name}: ${planeEqStr(eq)}`);
      // the parametric form rides when the run's anchor point and spanning edges are stable. Shared
      // with the query lane (#317) so a plane's two representations are derived once, never twice.
      const par = parametricPlaneForm(c.pointPlanes.get(name), positions, symbols.get(name) ?? 'π');
      if (par) planes.push(`${name}: ${par}`);
    }
  }

  // #325 (ADR-3D-079 Am. 2): the pins' open symbols — determined values print, free ones read
  // open, so `B(2t, t, k)` visibly registers even while the coordinates still read `?`.
  const params: DataPanel['params'] = [];
  for (const sym of figureSymbolsOf(c)) {
    // #480: the ALGEBRAIC lane's parameter is not a pivot pin symbol — its value lives in
    // `resolved.param`, and its branch set is the answer whenever the givens leave more than one.
    if (sym === c.param) {
      const perSeed = resolved.map((r) => r.param?.branches ?? []);
      // the branch set is a property of the GIVENS, so it must agree across seeds; if it somehow
      // does not, the symbol is not knowledge and reads open rather than picking a seed's version
      const agree = perSeed.every((b) => b.length === perSeed[0].length && b.every((v, i) => Math.abs(v - perSeed[0][i]) <= 1e-6 * Math.max(1, Math.abs(v))));
      const text = agree ? formatBranches(perSeed[0]) : null;
      params.push(text ? { sym, text: `${sym} = ${text}`, open: false } : { sym, text: `${sym} = ?`, open: true });
      continue;
    }
    const vals = resolved.map((r) => r.pivot?.pinSymbols?.[sym]);
    const nums = vals.filter((v): v is number => v !== undefined && Number.isFinite(v));
    // #797 (ADR-3D-168 Am. 1): seed-stability alone is not determinedness — a symbol restricted to
    // DISCRETE roots (k ∈ {1,2} after two of Q2's three vectors) cannot be moved off a root by the
    // Am. 2 anchor, and a deterministic root pick reads seed-stable. The admissible pool's distinct
    // values must ALSO be a singleton at every sampled seed (operator ruling: only a fully
    // determined symbol shows a value; otherwise «? »).
    const singleRoot = resolved.every((r) => (r.pivot?.symRoots?.[sym]?.length ?? 1) <= 1);
    const stable =
      singleRoot &&
      nums.length === resolved.length && nums.every((v) => Math.abs(v - nums[0]) <= 1e-4 * Math.max(1, Math.abs(nums[0])));
    params.push(stable ? { sym, text: `${sym} = ${cleanNum(nums[0], 1e-4)}`, open: false } : { sym, text: `${sym} = ?`, open: true });
  }

  return { relations, mutual, vectors: entries, points, pointCoords, planes, params };
}
