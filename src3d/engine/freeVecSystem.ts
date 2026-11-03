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
import { leastSquares } from './solve3';
import { cross3, dot3, norm3, v3, type Vec3 } from './vec3';
import type { Construction3, FreeVec3, FreeVecMetric3, Id, SymComp, VecAtom, VecExpr } from './types';
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
  /** #1188 step 4 (ADR-3D-406): the METRIC givens, each operand as its form; `null` when a name does not resolve */
  metrics: MetricForm[] | null;
}

type MetricForm = { m: FreeVecMetric3; f1: [Aff, Aff, Aff]; f2: [Aff, Aff, Aff] | null };

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
  // #1188 step 4 (ADR-3D-406): the metric givens' operands, as forms over the same unknowns
  let metrics: MetricForm[] | null = [];
  for (const m of c.freeVecMetrics) {
    const f1 = exprForm(m.kind === 'mag' ? m.e : m.e1);
    const f2 = m.kind === 'mag' ? null : exprForm(m.e2);
    if (!f1 || (m.kind !== 'mag' && !f2)) {
      metrics = null;
      break;
    }
    metrics.push({ m, f1, f2 });
  }
  return { unknowns, forms, rows, nonLinear, metrics };
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
  if ([...sys.forms.values()].some((f) => f === null) || sys.metrics === null) return { ok: false, kind: 'unresolved' };
  const { leftover } = orthogonalise(sys);
  if (leftover) return { ok: false, kind: leftover.kind };
  if (sys.metrics.length === 0) return { ok: true };
  // #1188 step 4 (ADR-3D-406): a metric given is about the free vectors ALONE, or it is a joint solve (#2603); and the
  // metric givens together must be able to hold
  const mc = metricCheck3(c);
  if (!mc.pure) return { ok: false, kind: 'coupling' };
  return mc.solution ? { ok: true } : { ok: false, kind: 'conflict' };
}

/** How many of the system's unknowns the equations leave free — the DOF the cue counts (structural: rank only). */
export function freeVecDofCount3(c: Construction3): number {
  if (c.freeVectors.size === 0) return 0;
  const sys = freeVecSystem3(c);
  const { basis } = orthogonalise(sys);
  const linear = sys.unknowns.length - basis.length;
  if (!sys.metrics || sys.metrics.length === 0) return linear;
  // #1188 step 4 (ADR-3D-406): a metric given consumes what its gradient adds to the linear rows' span, measured at a
  // solution (a generic point: the seeded one the check found) — «|u| = 5» leaves 2 of u's 3, «u ∥ v» 4 of 6
  const mc = metricCheck3(c);
  if (!mc.solution) return linear;
  return Math.max(0, linear - metricRank(sys, mc.solution, basis.map((b) => b.u)));
}

// ---------------------------------------------------------------------------
// #1188 step 4 (ADR-3D-406) — METRIC givens: nonlinear rows over the free unknowns, solved after the linear system
// ---------------------------------------------------------------------------

/** The first phase's pull toward the seeded start: what the givens leave free stays the sample's (ADR-052). */
const METRIC_MU = 0.05;
/** How many seeded starts the apply-time check tries before it calls a set of metric givens unsatisfiable. */
const METRIC_STARTS = 8;
const METRIC_TOL = 1e-8;

const evalPure = (f: Aff, x: readonly number[]): number => {
  let v = f.c;
  for (const [j, a] of f.x) v += a * x[j];
  return v;
};
const vecOf = (f: [Aff, Aff, Aff], x: readonly number[]): Vec3 => v3(evalPure(f[0], x), evalPure(f[1], x), evalPure(f[2], x));

/** One metric given's residuals at `x` (all zero when it holds). A direction (∥, an angle) is scale-free, so it is
 *  measured on unit vectors; on a zero operand it is far from holding — a zero vector has no direction. */
function metricResiduals(e: MetricForm, x: readonly number[]): number[] {
  const a = vecOf(e.f1, x);
  const b = e.f2 ? vecOf(e.f2, x) : v3(0, 0, 0);
  const m = e.m;
  switch (m.kind) {
    case 'mag':
      return [norm3(a) - m.value];
    case 'mag-rel':
      return [norm3(a) - m.c * norm3(b)];
    case 'dot':
      return [dot3(a, b) - m.value];
    case 'cos': {
      const nn = norm3(a) * norm3(b);
      return nn < 1e-12 ? [1] : [dot3(a, b) / nn - m.cos];
    }
    case 'par': {
      const nn = norm3(a) * norm3(b);
      if (nn < 1e-12) return [1, 1, 1];
      const k = cross3(a, b);
      return [k.x / nn, k.y / nn, k.z / nn];
    }
  }
}

/** The unknowns the metric givens reach, closed under the linear rows that share an unknown with them. */
function metricVars(sys: FreeSystem3): { vars: number[]; rows: Aff[] } {
  const reach = new Set<number>();
  for (const e of sys.metrics ?? []) for (const f of [...e.f1, ...(e.f2 ?? [])]) for (const j of f.x.keys()) reach.add(j);
  const rows: Aff[] = [];
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of sys.rows) {
      if (rows.includes(row) || ![...row.x.keys()].some((j) => reach.has(j))) continue;
      rows.push(row);
      for (const j of row.x.keys()) {
        if (!reach.has(j)) {
          reach.add(j);
          grew = true;
        }
      }
    }
  }
  return { vars: [...reach].sort((p, q) => p - q), rows };
}

/**
 * Solve the metric givens from `start` (a seeded sample, already projected onto the linear rows): first near the
 * start (a small pull toward it), then exactly (the pull released) — so what the givens leave free stays close to the
 * sample and moves with the seed, and the givens hold. The linear rows those unknowns share ride along as residuals.
 */
function solveMetrics(sys: FreeSystem3, start: readonly number[]): { x: number[]; ok: boolean } {
  const { vars, rows } = metricVars(sys);
  const put = (y: readonly number[]): number[] => {
    const z = [...start];
    vars.forEach((j, i) => (z[j] = y[i]));
    return z;
  };
  if (vars.length === 0) return { x: [...start], ok: metricsHold(sys, start) };
  const res = (y: readonly number[]): number[] => {
    const z = put(y);
    const out: number[] = [];
    for (const e of sys.metrics ?? []) out.push(...metricResiduals(e, z));
    for (const row of rows) out.push(evalPure(row, z));
    return out;
  };
  const y0 = vars.map((j) => start[j]);
  const near = leastSquares((y) => [...res(y), ...y.map((v, i) => METRIC_MU * (v - y0[i]))], y0, 80).x;
  const z = put(leastSquares(res, near, 80).x);
  return { x: z, ok: metricsHold(sys, z) };
}

function metricsHold(sys: FreeSystem3, x: readonly number[]): boolean {
  for (const e of sys.metrics ?? []) {
    const scale = Math.max(1, Math.abs(e.m.kind === 'mag' || e.m.kind === 'dot' ? e.m.value : 0));
    if (metricResiduals(e, x).some((r) => !(Math.abs(r) <= METRIC_TOL * scale))) return false;
  }
  const { rows } = metricVars(sys);
  for (const row of rows) if (!(Math.abs(evalPure(row, x)) <= METRIC_TOL * Math.max(1, Math.abs(row.c)))) return false;
  return true;
}

/** The rank the metric givens add to the linear rows' span `lin` (orthonormal), at `x` — central differences. */
function metricRank(sys: FreeSystem3, x: readonly number[], lin: readonly number[][]): number {
  const n = x.length;
  const grads: number[][] = [];
  for (const e of sys.metrics ?? []) {
    const cols: number[][] = [];
    for (let j = 0; j < n; j++) {
      const h = 1e-6 * Math.max(1, Math.abs(x[j]));
      const xp = [...x];
      const xm = [...x];
      xp[j] += h;
      xm[j] -= h;
      const rp = metricResiduals(e, xp);
      const rm = metricResiduals(e, xm);
      cols.push(rp.map((v, i) => (v - rm[i]) / (2 * h)));
    }
    const m = cols[0]?.length ?? 0;
    for (let i = 0; i < m; i++) grads.push(cols.map((col) => col[i]));
  }
  const basis = lin.map((u) => [...u]);
  let rank = 0;
  for (const g0 of grads) {
    const g = [...g0];
    const scale = Math.hypot(...g);
    if (scale < 1e-9) continue;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of basis) {
        let d = 0;
        for (let j = 0; j < n; j++) d += g[j] * b[j];
        for (let j = 0; j < n; j++) g[j] -= d * b[j];
      }
    }
    const len = Math.hypot(...g);
    if (len <= 1e-6 * scale) continue;
    basis.push(g.map((v) => v / len));
    rank++;
  }
  return rank;
}

interface MetricCheck3 {
  /** every metric operand is a combination of free vectors that no anchored arrow reaches */
  pure: boolean;
  /** a point where every row holds, from the first seeded start that converges — null: none did (unsatisfiable) */
  solution: number[] | null;
}
const metricMemo = new WeakMap<object, MetricCheck3>();

/**
 * STRUCTURE for the metric givens (at apply): are they about the free vectors alone, and can they all hold together?
 * Decided over the free unknowns only — no figure, no drawing — from up to {@link METRIC_STARTS} seeded starts, so a
 * satisfiable given is never refuted against a sample of the figure (ADR-052).
 */
function metricCheck3(c: Construction3): MetricCheck3 {
  const hit = metricMemo.get(c);
  if (hit) return hit;
  const sys = freeVecSystem3(c);
  const tainted = anchoredUnknowns(sys);
  const pure = (sys.metrics ?? []).every((e) => [...e.f1, ...(e.f2 ?? [])].every((f) => f.g.size === 0 && ![...f.x.keys()].some((j) => tainted.has(j))));
  let solution: number[] | null = null;
  for (let s = 0; pure && s < METRIC_STARTS && !solution; s++) {
    const r = solveMetrics(sys, projectedSample(c, sys, s, tainted));
    if (r.ok) solution = r.x;
  }
  const out = { pure, solution };
  metricMemo.set(c, out);
  return out;
}

/** The seeded sample projected onto the PURE linear rows — where every metric solve starts. */
function projectedSample(c: Construction3, sys: FreeSystem3, seed: number, tainted: ReadonlySet<number>): number[] {
  const pureRow = (ri: number): boolean => sys.rows[ri].g.size === 0 && ![...sys.rows[ri].x.keys()].some((j) => tainted.has(j));
  const { basis } = orthogonalise(sys, pureRow);
  const x = sampleUnknowns(c, sys, seed);
  const corr = basis.map((b) => b.u.reduce((acc, u, j) => acc + u * x[j], 0) - b.beta);
  basis.forEach((b, k) => {
    for (let j = 0; j < x.length; j++) x[j] -= b.u[j] * corr[k];
  });
  return x;
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
  // #1188 step 4 (ADR-3D-406): the metric givens, solved from this seed's projected sample — so a branch («u ∥ v» with
  // |u| = |v|: v = ±u) and what the givens leave free both follow the seed. Their unknowns are pure (the apply check),
  // so the pre-pivot and post-pivot passes solve the same block from the same start. A start that does not converge
  // falls back to the check's solution: the givens hold at every seed.
  if (sys.metrics && sys.metrics.length > 0) {
    const mc = metricCheck3(c);
    if (mc.pure && mc.solution) {
      let r = solveMetrics(sys, x);
      if (!r.ok) r = { x: mc.solution, ok: true };
      for (const j of metricVars(sys).vars) x[j] = r.x[j];
    }
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

/**
 * #2603 b1 ([ADR-3D-407](../../docs/06b-decisions-3d.md#adr-3d-407)) — THE ONE INLINER. A combination with every
 * DEFINED free vector replaced by its definition, recursively (a definition only names earlier vectors, so this ends;
 * the depth guard is belt and braces). A free vector nothing defines stays as it is. A definition holds by
 * construction, so the result says exactly what the line says: «AB = p» then «AD = k·p» is «AD = k·AB». The three
 * readers that must see through a definition — a figure relation over a new point, one over existing points, and a span
 * point's basis — all ask here (docs/17 M3: one reader).
 */
export function inlineDefinedFreeVectors3(c: Pick<Construction3, 'freeVectors'>, e: VecExpr, depth = 0): VecExpr {
  if (depth > 32) return e;
  return e.flatMap((t) => {
    const fv = t.atom.kind === 'named' ? c.freeVectors.get(t.atom.name) : undefined;
    if (!fv?.def) return [t];
    return inlineDefinedFreeVectors3(c, fv.def, depth + 1).map((d) => ({ coeff: t.coeff * d.coeff, atom: d.atom }));
  });
}

/** #2603 b1 (ADR-3D-407): the free vector `name` is DEFINED by the figure alone — its inlined definition names only
 *  point pairs and anchored arrows. Such a vector IS that combination of the figure's arrows («וקטור u · KB = u»). */
export function figureDefinedFreeVector3(c: Construction3, name: string): VecExpr | null {
  const fv = c.freeVectors.get(name);
  if (!fv?.def || fv.symComps || fv.comps.some((x) => x !== null)) return null;
  const e = inlineDefinedFreeVectors3(c, fv.def);
  return e.every((t) => t.atom.kind === 'pair' || namedVector3(c, t.atom.name)?.kind === 'anchored') ? e : null;
}

/**
 * #2603 b1 (ADR-3D-407; operator 2026-11-02, ADR-W-175 sr-06): THE NAMED BASIS a span point decomposes over — the
 * anchored vectors, plus each free vector the span names that the figure DEFINES («וקטור u · KB = u»: u IS KB, exactly
 * as «נסמן: KB = u» says). An undefined free vector («וקטור p») never counts (FR-VC-1d). Each member is a combination
 * of figure atoms, evaluated at the positions by its reader.
 */
export function spanBasis3(c: Construction3, span: readonly string[]): { name: string; expr: VecExpr }[] {
  const out: { name: string; expr: VecExpr }[] = [...c.vectors].map(([name, d]) => ({ name, expr: [{ coeff: 1, atom: { kind: 'pair', from: d.from, to: d.to } }] }));
  for (const name of new Set(span)) {
    const e = figureDefinedFreeVector3(c, name);
    if (e) out.push({ name, expr: e });
  }
  return out;
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

// ---------------------------------------------------------------------------
// Elimination to the figure — ADR-3D-390 Am. 1 (operator ruling 2A, 2026-10-30)
// ---------------------------------------------------------------------------

/**
 * What a new vector equation says once its free vectors are ELIMINATED against what is already stated about them:
 *  - `free`: a free vector survives the elimination — the equation is about the free vectors (a row of the system);
 *  - `identity`: nothing survives — it holds on every figure («AB + BC = AC» once p is gone);
 *  - `figure`: only the figure's own vectors survive — the equation IS a relation on the figure («AB = p» then
 *    «AD = p» is «AD = AB»), to be decided by the figure's own vec-eq lane: contradiction, already known, or a drive.
 *  - `null`: the elimination cannot be done at the level of whole vectors — a vector involved carries a stated
 *    component, an affine letter or a named component, which only the component-wise system and a joint solve can
 *    weigh (#2603). The caller keeps its existing verdict.
 * Vector-level Gaussian elimination: the unknowns are the free vectors nothing defines and nothing has been stated
 * about (each a whole vector); a DEFINED vector is its definition; a pair or an anchored name is a figure term.
 */
export type FigureRelation3 = { kind: 'free' } | { kind: 'identity' } | { kind: 'figure'; lhs: VecExpr; rhs: VecExpr };

export function figureRelationOf3(c: Construction3, lhs: VecExpr, rhs: VecExpr): FigureRelation3 | null {
  type Lin = { v: Map<string, number>; a: Map<string, { atom: VecAtom; k: number }> };
  const named = new Set(c.partialNames.flatMap((b) => (b.target.kind === 'vector' ? [b.target.name] : [])));
  const pureUnknown = (fv: FreeVec3, name: string) => !fv.def && !fv.symComps && fv.comps.every((x) => x === null) && !named.has(name);
  const into = (out: Lin, e: VecExpr, k: number, depth: number): boolean => {
    if (depth > 32) return false;
    for (const t of e) {
      const kk = k * t.coeff;
      if (t.atom.kind === 'named' && c.freeVectors.has(t.atom.name)) {
        const fv = c.freeVectors.get(t.atom.name)!;
        if (fv.def) {
          // a defined vector carrying a stated component is also a row of the component system: not ours to weigh
          if (fv.symComps || fv.comps.some((x) => x !== null)) return false;
          if (!into(out, fv.def, kk, depth + 1)) return false;
        } else if (pureUnknown(fv, t.atom.name)) out.v.set(t.atom.name, (out.v.get(t.atom.name) ?? 0) + kk);
        else return false;
        continue;
      }
      if (t.atom.kind === 'named' && namedVector3(c, t.atom.name)?.kind !== 'anchored') return false;
      const key = t.atom.kind === 'pair' ? `p:${t.atom.from}>${t.atom.to}` : `n:${t.atom.name}`;
      const was = out.a.get(key);
      out.a.set(key, { atom: t.atom, k: (was?.k ?? 0) + kk });
    }
    return true;
  };
  const lin = (l: VecExpr, r: VecExpr): Lin | null => {
    const out: Lin = { v: new Map(), a: new Map() };
    return into(out, l, 1, 0) && into(out, r, -1, 0) ? out : null;
  };
  const scaleOf = (x: Lin) => Math.max(1, ...[...x.v.values()].map(Math.abs), ...[...x.a.values()].map((t) => Math.abs(t.k)));
  const axpy = (x: Lin, p: Lin, k: number) => {
    for (const [n, a] of p.v) x.v.set(n, (x.v.get(n) ?? 0) + k * a);
    for (const [key, t] of p.a) {
      const was = x.a.get(key);
      x.a.set(key, { atom: t.atom, k: (was?.k ?? 0) + k * t.k });
    }
  };
  const pivots: { name: string; row: Lin }[] = [];
  const reduce = (x: Lin) => {
    for (const p of pivots) {
      const k = x.v.get(p.name) ?? 0;
      if (k !== 0) axpy(x, p.row, -k);
      x.v.delete(p.name);
    }
  };
  for (const eq of c.freeVecEqs) {
    const row = lin(eq.lhs, eq.rhs);
    if (!row) return null;
    reduce(row);
    const tol = TOL * scaleOf(row) * 1e3;
    let best: string | null = null;
    for (const [n, a] of row.v) if (Math.abs(a) > tol && (best === null || Math.abs(a) > Math.abs(row.v.get(best)!))) best = n;
    if (best === null) continue; // an earlier relation the figure already carries
    const k = row.v.get(best)!;
    for (const [n, a] of row.v) row.v.set(n, a / k);
    for (const [key, t] of row.a) row.a.set(key, { atom: t.atom, k: t.k / k });
    for (const p of pivots) {
      const kp = p.row.v.get(best) ?? 0;
      if (kp !== 0) axpy(p.row, row, -kp);
      p.row.v.delete(best);
    }
    pivots.push({ name: best, row });
  }
  const x = lin(lhs, rhs);
  if (!x) return null;
  reduce(x);
  const tol = TOL * scaleOf(x) * 1e3;
  if ([...x.v.values()].some((a) => Math.abs(a) > tol)) return { kind: 'free' };
  const terms = [...x.a.values()].filter((t) => Math.abs(t.k) > tol);
  // a relation that holds on every figure — the points cancel («AB + BC − AC»)
  const atPoint = new Map<string, number>();
  for (const t of terms) {
    const ends = t.atom.kind === 'pair' ? t.atom : namedVector3(c, t.atom.name);
    if (!ends || !('from' in ends)) return null;
    atPoint.set(ends.to, (atPoint.get(ends.to) ?? 0) + t.k);
    atPoint.set(ends.from, (atPoint.get(ends.from) ?? 0) - t.k);
  }
  if ([...atPoint.values()].every((a) => Math.abs(a) <= tol)) return { kind: 'identity' };
  // the student's orientation: the first surviving term's sign is the left side
  const round = (k: number) => (Math.abs(k - Math.round(k)) < 1e-9 ? Math.round(k) : k);
  const s = Math.sign(terms[0].k);
  return {
    kind: 'figure',
    lhs: terms.filter((t) => Math.sign(t.k) === s).map((t) => ({ coeff: round(s * t.k), atom: t.atom })),
    rhs: terms.filter((t) => Math.sign(t.k) !== s).map((t) => ({ coeff: round(-s * t.k), atom: t.atom })),
  };
}
