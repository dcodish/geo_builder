/**
 * #1188 step 2 ([ADR-3D-390](../../docs/06b-decisions-3d.md#adr-3d-390)) — THE FREE-VECTOR LINEAR SYSTEM.
 *
 * Every free vector's value is an AFFINE form over three kinds of number:
 *  - the system's UNKNOWNS — an unstated component of a vector nothing defines («וקטור u»: three of them), and a
 *    letter in an affine component («u = (k-1, 2, k)»: k);
 *  - CONSTANTS — a stated component, a valued letter («k = 2»);
 *  - the ANCHORED figure — a point pair or a «נסמן: AB = u» vector, entering through its endpoints' coordinates.
 * A DEFINED vector («w = u + v») is its combination of the others' forms (a definition introduces its name, so it
 * holds by construction). The EQUATIONS are what is left: a vec-eq among existing vectors (`c.freeVecEqs`), a
 * component stated on a defined vector, and a letter that names a component («u = (k, 1, 2)») where the same
 * letter is also an affine unknown — one letter, one number.
 *
 * Linear only, closed form (src3d/CLAUDE.md boundary 3: a linear solve, no CAS). Two questions are asked of it:
 *  1. STRUCTURE (at apply, `freeVecSystemVerdict3`): does a combination of the equations say something about the
 *     ANCHORED figure (a coupling the free system cannot absorb — refused `free-vector-coupling`), or about the
 *     stated numbers alone, falsely (a contradiction — `free-vector-conflict`)? Decided by eliminating the unknowns,
 *     never by a sample, so a satisfiable given is never refuted against a drawing (ADR-052).
 *  2. VALUE (at resolve, `solveFreeVectors3`): the MINIMUM-NORM PROJECTION of the seeded sample onto the solution
 *     set, x = s − Uᵀ(U s − β) over an orthonormal basis U of the equations' row space. What the givens leave free
 *     stays sampled and moves with «הציגו תצורה אחרת»; a new equation moves the drawing minimally, singling out no
 *     term to absorb it; and it is a pure function of (facts, seed). With no equations it is the sample itself, so
 *     every step-1 figure resolves bit-identically.
 *
 * Reads nothing positional except the anchored atoms' endpoints, which the caller passes (post-pivot). A vector whose
 * form needs no position is PURE and can be resolved before the pivot (a figure point defined by it, «AE = p»).
 */
import { sample } from './rng';
import { norm3, v3, type Vec3 } from './vec3';
import type { Construction3, FreeVec3, Id, SymComp, VecAtom, VecExpr } from './types';
import { freeVecSymsOf, symbolValueOf } from './types';
import { namedVector3 } from './vecExpr';

/** #1188 (ADR-3D-386): the range an unstated free-vector component is sampled in, ±FREE_VEC_RANGE. */
export const FREE_VEC_RANGE = 1.2;
/** #1188: the NORM FLOOR — a free vector is never drawn shorter than this fraction of the range (never a dot). */
export const FREE_VEC_FLOOR = 0.3;
const FREE_VEC_REDRAWS = 8;

const AXES = ['x', 'y', 'z'] as const;

export type FreeUnknown3 = { kind: 'comp'; name: string; axis: 0 | 1 | 2 } | { kind: 'sym'; sym: string };

/** An affine form: Σ x[j]·unknown_j + c + Σ g[key]·coordinate, `key` = `${pointId}|${axis}`. */
interface Aff {
  x: Map<number, number>;
  c: number;
  g: Map<string, number>;
}

const aff0 = (): Aff => ({ x: new Map(), c: 0, g: new Map() });
const addInto = (acc: Aff, f: Aff, k: number): void => {
  if (k === 0) return;
  for (const [j, a] of f.x) acc.x.set(j, (acc.x.get(j) ?? 0) + k * a);
  acc.c += k * f.c;
  for (const [key, a] of f.g) acc.g.set(key, (acc.g.get(key) ?? 0) + k * a);
};

export interface FreeSystem3 {
  unknowns: FreeUnknown3[];
  /** each free vector's value, per axis; `null` when a name it references does not resolve (refused at apply) */
  forms: Map<string, [Aff, Aff, Aff] | null>;
  /** the equations, each `form = 0`, in statement order */
  rows: Aff[];
  /** a letter that a free vector raises to a power — the linear system cannot carry it */
  nonLinear: string | null;
}

const memo = new WeakMap<object, FreeSystem3>();

/** The free-vector system of `c` (memoised per construction object — apply clones on every change). */
export function freeVecSystem3(c: Construction3): FreeSystem3 {
  const hit = memo.get(c);
  if (hit) return hit;
  const sys = buildSystem(c);
  memo.set(c, sys);
  return sys;
}

function buildSystem(c: Construction3): FreeSystem3 {
  const unknowns: FreeUnknown3[] = [];
  const index = new Map<string, number>();
  let nonLinear: string | null = null;
  const unknown = (key: string, u: FreeUnknown3): number => {
    let j = index.get(key);
    if (j === undefined) {
      j = unknowns.length;
      unknowns.push(u);
      index.set(key, j);
    }
    return j;
  };
  const symForm = (sym: string): Aff => {
    const f = aff0();
    const val = symbolValueOf(c, sym);
    if (val !== undefined) f.c = val;
    else f.x.set(unknown(`s:${sym}`, { kind: 'sym', sym }), 1);
    return f;
  };
  const affineForm = (e: SymComp): Aff => {
    const f = aff0();
    f.c = e.c;
    for (const t of e.terms) {
      if ((t.e ?? 1) !== 1) nonLinear ??= t.sym;
      addInto(f, symForm(t.sym), t.k);
    }
    return f;
  };
  const pairForm = (from: Id, to: Id, i: number): Aff => {
    const f = aff0();
    f.g.set(`${to}|${i}`, 1);
    f.g.set(`${from}|${i}`, (f.g.get(`${from}|${i}`) ?? 0) - 1);
    return f;
  };
  const forms = new Map<string, [Aff, Aff, Aff] | null>();
  const visiting = new Set<string>();
  const formOf = (name: string): [Aff, Aff, Aff] | null => {
    if (forms.has(name)) return forms.get(name)!;
    const fv = c.freeVectors.get(name);
    if (!fv || visiting.has(name)) return null;
    visiting.add(name);
    let out: [Aff, Aff, Aff] | null;
    if (fv.def) {
      out = exprForm(fv.def);
    } else {
      out = [0, 1, 2].map((i) => {
        const sc = fv.symComps?.[i];
        if (sc) return affineForm(sc);
        const n = fv.comps[i];
        const f = aff0();
        if (n !== null) f.c = n;
        else f.x.set(unknown(`c:${name}:${i}`, { kind: 'comp', name, axis: i as 0 | 1 | 2 }), 1);
        return f;
      }) as [Aff, Aff, Aff];
    }
    visiting.delete(name);
    forms.set(name, out);
    return out;
  };
  const atomForm = (atom: VecAtom): [Aff, Aff, Aff] | null => {
    if (atom.kind === 'pair') return [0, 1, 2].map((i) => pairForm(atom.from, atom.to, i)) as [Aff, Aff, Aff];
    const nv = namedVector3(c, atom.name);
    const anchored = nv?.kind === 'anchored' ? nv : undefined;
    if (anchored) return [0, 1, 2].map((i) => pairForm(anchored.from, anchored.to, i)) as [Aff, Aff, Aff];
    return formOf(atom.name);
  };
  const exprForm = (e: VecExpr): [Aff, Aff, Aff] | null => {
    const acc: [Aff, Aff, Aff] = [aff0(), aff0(), aff0()];
    for (const t of e) {
      const f = atomForm(t.atom);
      if (!f) return null;
      for (let i = 0; i < 3; i++) addInto(acc[i], f[i], t.coeff);
    }
    return acc;
  };

  // the vectors' own forms first, in declaration order — so unknown ids follow the statement order
  for (const name of c.freeVectors.keys()) formOf(name);

  const rows: Aff[] = [];
  const diff = (a: Aff, b: Aff): Aff => {
    const r = aff0();
    addInto(r, a, 1);
    addInto(r, b, -1);
    return r;
  };
  for (const [name, fv] of c.freeVectors) {
    if (!fv.def) continue;
    const f = forms.get(name);
    if (!f) continue;
    for (let i = 0; i < 3; i++) {
      const sc = fv.symComps?.[i];
      const n = fv.comps[i];
      if (sc) rows.push(diff(f[i], affineForm(sc)));
      else if (n !== null) {
        const k = aff0();
        k.c = n;
        rows.push(diff(f[i], k));
      }
    }
  }
  for (const eq of c.freeVecEqs) {
    const l = exprForm(eq.lhs);
    const r = exprForm(eq.rhs);
    if (!l || !r) continue;
    for (let i = 0; i < 3; i++) rows.push(diff(l[i], r[i]));
  }
  // one letter, one number: a letter naming a free component that is ALSO an affine unknown is that component
  for (const b of c.partialNames) {
    if (b.target.kind !== 'vector' || !index.has(`s:${b.sym}`)) continue;
    const f = forms.get(b.target.name);
    if (!f) continue;
    rows.push(diff(f[AXES.indexOf(b.axis)], symForm(b.sym)));
  }
  return { unknowns, forms, rows, nonLinear };
}

// ---------------------------------------------------------------------------
// Elimination — one modified Gram-Schmidt pass over the rows, carrying the constants and the anchored coefficients
// ---------------------------------------------------------------------------

interface Ortho {
  /** orthonormal rows of the equations' row space, with each one's carried constant (β = −c) and anchored part */
  basis: { u: number[]; beta: number; g: Map<string, number> }[];
  /** the first DEPENDENT row whose leftover is not zero: on the stated numbers (`conflict`) or on the figure (`coupling`) */
  leftover: { row: number; kind: 'conflict' | 'coupling' } | null;
}

const TOL = 1e-9;

function orthogonalise(sys: FreeSystem3, rowFilter?: (r: number) => boolean): Ortho {
  const n = sys.unknowns.length;
  const basis: Ortho['basis'] = [];
  let leftover: Ortho['leftover'] = null;
  sys.rows.forEach((row, ri) => {
    if (rowFilter && !rowFilter(ri)) return;
    const u = new Array<number>(n).fill(0);
    for (const [j, a] of row.x) u[j] = a;
    let beta = -row.c;
    const g = new Map(row.g);
    const scale = Math.max(1, Math.hypot(...u), Math.abs(beta), ...[...g.values()].map(Math.abs));
    for (let pass = 0; pass < 2; pass++) {
      for (const b of basis) {
        let d = 0;
        for (let j = 0; j < n; j++) d += u[j] * b.u[j];
        if (d === 0) continue;
        for (let j = 0; j < n; j++) u[j] -= d * b.u[j];
        beta -= d * b.beta;
        for (const [k, a] of b.g) g.set(k, (g.get(k) ?? 0) - d * a);
      }
    }
    const len = Math.hypot(...u);
    if (len <= TOL * scale) {
      if (leftover) return;
      const anchoredLeft = [...g.values()].some((a) => Math.abs(a) > TOL * scale);
      if (anchoredLeft) leftover = { row: ri, kind: 'coupling' };
      else if (Math.abs(beta) > TOL * scale) leftover = { row: ri, kind: 'conflict' };
      return;
    }
    for (let j = 0; j < n; j++) u[j] /= len;
    beta /= len;
    for (const [k, a] of g) g.set(k, a / len);
    basis.push({ u, beta, g });
  });
  return { basis, leftover };
}

export type FreeVecVerdict3 = { ok: true } | { ok: false; kind: 'conflict' | 'coupling' | 'non-linear' | 'unresolved' };

/**
 * STRUCTURE: can the free vectors absorb every equation for ANY drawing of the anchored figure? `coupling` — a
 * combination of the equations constrains the figure itself (the pivot would have to solve it jointly);
 * `conflict` — one constrains only stated numbers, and falsely. Position-free, so it is decided at apply.
 */
export function freeVecSystemVerdict3(c: Construction3): FreeVecVerdict3 {
  if (c.freeVectors.size === 0) return { ok: true };
  const sys = freeVecSystem3(c);
  if (sys.nonLinear) return { ok: false, kind: 'non-linear' };
  if ([...sys.forms.values()].some((f) => f === null)) return { ok: false, kind: 'unresolved' };
  const { leftover } = orthogonalise(sys);
  return leftover ? { ok: false, kind: leftover.kind } : { ok: true };
}

/** How many of the system's unknowns the equations leave free — the DOF the cue counts (structural: rank only). */
export function freeVecDofCount3(c: Construction3): number {
  if (c.freeVectors.size === 0) return 0;
  const sys = freeVecSystem3(c);
  return sys.unknowns.length - orthogonalise(sys).basis.length;
}

// ---------------------------------------------------------------------------
// Value
// ---------------------------------------------------------------------------

/** The seeded sample of every unknown — step 1's sampler for components (sign, norm floor), a letter in ±range. */
function sampleUnknowns(c: Construction3, sys: FreeSystem3, seed: number): number[] {
  const s = new Array<number>(sys.unknowns.length).fill(0);
  const compSign = (name: string, ax: 'x' | 'y' | 'z'): number | undefined => {
    const g = c.componentSigns.find((cs) => cs.target.kind === 'vector' && cs.target.name === name && cs.axis === ax);
    return g ? (g.positive ? 1 : -1) : undefined;
  };
  const symSign = (sym: string): number | undefined => {
    const g = [...c.paramSigns].reverse().find((p) => p.sym === sym);
    return g ? (g.positive ? 1 : -1) : undefined;
  };
  const draw = (key: string, sg: number | undefined): number =>
    sg === undefined ? sample(seed, key, -FREE_VEC_RANGE, FREE_VEC_RANGE) : sg * sample(seed, key, 0.15, 1) * FREE_VEC_RANGE;
  sys.unknowns.forEach((u, j) => {
    if (u.kind === 'sym') s[j] = draw(`fvsym-${u.sym}`, symSign(u.sym));
  });
  // components, per vector, exactly as ADR-3D-386 drew them — including the norm floor's re-draws
  for (const [name, fv] of c.freeVectors) {
    if (fv.def) continue;
    const own = sys.unknowns.map((u, j) => ({ u, j })).filter((e): e is { u: Extract<FreeUnknown3, { kind: 'comp' }>; j: number } => e.u.kind === 'comp' && e.u.name === name);
    if (own.length === 0) continue;
    const valueAt = (k: number): Vec3 => {
      const comp = (i: number): number => {
        const e = own.find((o) => o.u.axis === i);
        if (e) return draw(`fvec-${name}-${AXES[i]}${k === 0 ? '' : `#${k}`}`, compSign(name, AXES[i]));
        const n = fv.comps[i];
        if (n !== null) return n;
        const sc = fv.symComps?.[i];
        return sc ? sc.terms.reduce((acc, t) => acc + t.k * (s[sys.unknowns.findIndex((x) => x.kind === 'sym' && x.sym === t.sym)] ?? symbolValueOf(c, t.sym) ?? 0), sc.c) : 0;
      };
      return v3(comp(0), comp(1), comp(2));
    };
    let v = valueAt(0);
    for (let r = 1; r <= FREE_VEC_REDRAWS && norm3(v) < FREE_VEC_FLOOR * FREE_VEC_RANGE; r++) v = valueAt(r);
    for (const e of own) s[e.j] = [v.x, v.y, v.z][e.u.axis];
  }
  return s;
}

/** Union-find over the unknowns: which equations touch the anchored figure, transitively. */
function anchoredUnknowns(sys: FreeSystem3): Set<number> {
  const parent = sys.unknowns.map((_, j) => j);
  const find = (j: number): number => (parent[j] === j ? j : (parent[j] = find(parent[j])));
  const tainted = new Set<number>();
  for (const row of sys.rows) {
    const js = [...row.x.keys()];
    for (let i = 1; i < js.length; i++) parent[find(js[i])] = find(js[0]);
  }
  for (const row of sys.rows) if (row.g.size > 0) for (const j of row.x.keys()) tainted.add(find(j));
  const out = new Set<number>();
  sys.unknowns.forEach((_, j) => {
    if (tainted.has(find(j))) out.add(j);
  });
  return out;
}

export interface FreeVecSolution3 {
  values: Map<string, Vec3>;
  syms: Map<string, number>;
}

/**
 * VALUE: every free vector at `seed`. With `positions` (post-pivot) all of them; without (pre-pivot) only the PURE
 * ones — whose form and whose equations reach no anchored point — which is what a figure point defined by a free
 * vector reads. The pure part is the same numbers either way (the elimination is block-wise over disjoint supports).
 */
export function solveFreeVectors3(c: Construction3, seed: number, positions?: ReadonlyMap<Id, Vec3>): FreeVecSolution3 {
  const values = new Map<string, Vec3>();
  const syms = new Map<string, number>();
  if (c.freeVectors.size === 0) return { values, syms };
  const sys = freeVecSystem3(c);
  const tainted = positions ? new Set<number>() : anchoredUnknowns(sys);
  const pureRow = (ri: number): boolean => sys.rows[ri].g.size === 0 && ![...sys.rows[ri].x.keys()].some((j) => tainted.has(j));
  const { basis } = orthogonalise(sys, positions ? undefined : pureRow);
  const coord = (key: string): number | undefined => {
    const bar = key.lastIndexOf('|');
    const p = positions?.get(key.slice(0, bar));
    return p ? [p.x, p.y, p.z][Number(key.slice(bar + 1))] : undefined;
  };
  const x = sampleUnknowns(c, sys, seed);
  if (basis.length > 0) {
    // x ← s − Uᵀ(U s − β), with β's anchored part read at this drawing
    const corr = basis.map((b) => {
      let us = 0;
      for (let j = 0; j < x.length; j++) us += b.u[j] * x[j];
      let beta = b.beta;
      for (const [key, a] of b.g) beta -= a * (coord(key) ?? NaN);
      return us - beta;
    });
    basis.forEach((b, k) => {
      for (let j = 0; j < x.length; j++) x[j] -= b.u[j] * corr[k];
    });
  }
  const evalAff = (f: Aff): number => {
    let v = f.c;
    for (const [j, a] of f.x) {
      if (tainted.has(j)) return NaN;
      v += a * x[j];
    }
    for (const [key, a] of f.g) v += a * (coord(key) ?? NaN);
    return v;
  };
  for (const [name, f] of sys.forms) {
    if (!f) continue;
    const v = v3(evalAff(f[0]), evalAff(f[1]), evalAff(f[2]));
    if ([v.x, v.y, v.z].every(Number.isFinite)) values.set(name, v);
  }
  sys.unknowns.forEach((u, j) => {
    if (u.kind === 'sym' && !tainted.has(j) && Number.isFinite(x[j])) syms.set(u.sym, x[j]);
  });
  // a letter the student valued («k = 3») is a constant of the system, never an unknown — its value all the same
  for (const sym of freeVecSymsOf(c)) {
    const val = symbolValueOf(c, sym);
    if (val !== undefined) syms.set(sym, val);
  }
  return { values, syms };
}

/** Is the free vector `name` PURE — resolvable with no position (its form and its equations reach no anchored point)? */
export function isPureFreeVector3(c: Construction3, name: string): boolean {
  const sys = freeVecSystem3(c);
  const f = sys.forms.get(name);
  if (!f) return false;
  const tainted = anchoredUnknowns(sys);
  return f.every((a) => a.g.size === 0 && ![...a.x.keys()].some((j) => tainted.has(j)));
}

const pureMemo = new WeakMap<object, Map<number, Map<string, Vec3>>>();
/** The pure free vectors' values at `seed`, memoised — read inside the point pass, which the pivot calls many times. */
export function pureFreeVectors3(c: Construction3, seed: number): ReadonlyMap<string, Vec3> {
  let bySeed = pureMemo.get(c);
  if (!bySeed) pureMemo.set(c, (bySeed = new Map()));
  let hit = bySeed.get(seed);
  if (!hit) bySeed.set(seed, (hit = solveFreeVectors3(c, seed).values));
  return hit;
}

/** A combination's value when it is a CONSTANT — free vectors whose forms carry no unknown and no position — else null. */
export function constantVec3(c: Construction3, e: VecExpr): Vec3 | null {
  const sys = freeVecSystem3(c);
  const acc = [0, 0, 0];
  for (const t of e) {
    if (t.atom.kind !== 'named') return null;
    const f = sys.forms.get(t.atom.name);
    if (!f || f.some((a) => a.x.size > 0 || a.g.size > 0)) return null;
    for (let i = 0; i < 3; i++) acc[i] += t.coeff * f[i].c;
  }
  return v3(acc[0], acc[1], acc[2]);
}

/** The free vectors a combination names, transitively through definitions (for the render and the refusals). */
export function freeNamesIn3(c: Pick<Construction3, 'freeVectors'>, e: VecExpr): string[] {
  const out: string[] = [];
  const walk = (ex: VecExpr) => {
    for (const t of ex) {
      if (t.atom.kind !== 'named') continue;
      const fv: FreeVec3 | undefined = c.freeVectors.get(t.atom.name);
      if (!fv || out.includes(t.atom.name)) continue;
      out.push(t.atom.name);
      if (fv.def) walk(fv.def);
    }
  };
  walk(e);
  return out;
}
