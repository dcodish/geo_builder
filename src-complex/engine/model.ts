// The C0 prototype's EVALUATOR — `derive`: the per-fact constraint sweeps, the numeric solves and the
// prototype `Scene`. The fact VOCABULARY it used to carry alongside has moved down to `model/fact.ts`
// and `value/value.ts`, because `parser/parse.ts` outlives this file as ADR-CX-019's parity oracle
// while nothing outside this directory needs the evaluator. What remains here is what #624 deletes.
import {
  add,
  sub,
  mul,
  div,
  neg,
  conj,
  absC,
  argDeg,
  ipow,
  nthRoots,
} from './complex';
import { type Cx, cPolar, cx, fmtNum } from '../value/value';
import {
  type Cmp,
  type Expr,
  type Fact,
  type RelSpec,
  collectRefs,
  defaultFree,
  isScalarExpr,
  paramValue,
} from '../model/fact';
import { prettyName } from '../model/naming';

/** area (shoelace), perimeter (closed), or segment length over named vertices; 'o' is O. */
const shapeMeasure = (mtype: 'area' | 'perim' | 'len', pts: string[], env: Map<string, Cx>): number => {
  const vs = pts.map((p) => {
    const v = env.get(p);
    if (v === undefined) throw new UnknownRef(p);
    return v;
  });
  if (mtype === 'len') return absC(sub(vs[0], vs[1]));
  if (mtype === 'perim') return vs.reduce((s, v, i) => s + absC(sub(v, vs[(i + 1) % vs.length])), 0);
  let a = 0;
  for (let i = 0; i < vs.length; i++) {
    const b = vs[(i + 1) % vs.length];
    a += vs[i].re * b.im - b.re * vs[i].im;
  }
  return Math.abs(a) / 2;
};

/** solve ONE sequence term (at `target`) from the other, determined terms. Geometric
 * middle-term has two square roots — `seed` parity picks the branch (configuration cycling). */
const seqSolve = (
  f: Extract<Fact, { kind: 'seq' }>,
  target: string,
  env: Map<string, Cx>,
  seed: number,
): Cx | null => {
  const p = f.names.indexOf(target);
  const vals = f.names.map((n) => (n === target ? null : (env.get(n) ?? null)));
  if (vals.some((v, i) => v === null && i !== p)) return null;
  const at = (i: number): Cx => vals[i]!;
  const last = f.names.length - 1;
  if (f.stype === 'geo') {
    if (p > 0 && p < last) {
      const prod = mul(at(p - 1), at(p + 1));
      const branch = seed % 2;
      return cPolar(Math.sqrt(absC(prod)), argDeg(prod) / 2 + branch * 180);
    }
    if (p === last) return mul(at(last - 1), div(at(1), at(0)));
    return div(at(1), div(at(2), at(1)));
  }
  if (p > 0 && p < last) return { re: (at(p - 1).re + at(p + 1).re) / 2, im: (at(p - 1).im + at(p + 1).im) / 2 };
  if (p === last) return add(at(last - 1), sub(at(1), at(0)));
  return sub(at(1), sub(at(2), at(1)));
};

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫';

/** consecutive-terms consistency: equal adjacent ratios (geo) / differences (ari) */
const seqHolds = (f: Extract<Fact, { kind: 'seq' }>, env: Map<string, Cx>): boolean => {
  const vs = f.names.map((n) => env.get(n));
  if (vs.some((v) => v === undefined)) return false;
  const steps: Cx[] = [];
  for (let i = 0; i + 1 < vs.length; i++) {
    if (f.stype === 'geo') {
      if (absC(vs[i]!) === 0) return false;
      steps.push(div(vs[i + 1]!, vs[i]!));
    } else {
      steps.push(sub(vs[i + 1]!, vs[i]!));
    }
  }
  const scale = Math.max(1, ...steps.map(absC));
  return steps.every((s) => absC(sub(s, steps[0])) <= 1e-6 * scale);
};

/** 2-D Newton with numeric Jacobian for F(X) = lhs(X) − rhs(X) over one unknown — real
 * Jacobian, so non-holomorphic pieces (conj, re, im, |·|) are handled. Returns a solution
 * with a VERIFIED residual, or null (never an unverified guess). */
const solveEq = (
  lhs: Expr,
  rhs: Expr,
  unknown: string,
  env: Map<string, Cx>,
  start: Cx,
): Cx | null => {
  const F = (X: Cx): Cx | null => {
    try {
      const e2 = new Map(env);
      e2.set(unknown, X);
      return sub(evalExpr(lhs, e2), evalExpr(rhs, e2));
    } catch {
      return null;
    }
  };
  const scale0 = Math.max(1, absC(start));
  const starts: Cx[] = [start];
  for (let k = 0; k < 4; k++) starts.push(cPolar(scale0, 37 + 83 * k)); // deterministic multi-start
  for (const s0 of starts) {
    let X = s0;
    for (let it = 0; it < 60; it++) {
      const f0 = F(X);
      if (!f0) break;
      const fs = Math.max(1, absC(X));
      if (absC(f0) <= 1e-9 * fs) return X;
      const h = 1e-6 * fs;
      const fx = F({ re: X.re + h, im: X.im });
      const fy = F({ re: X.re, im: X.im + h });
      if (!fx || !fy) break;
      const a = (fx.re - f0.re) / h;
      const c = (fx.im - f0.im) / h;
      const b = (fy.re - f0.re) / h;
      const d = (fy.im - f0.im) / h;
      const det = a * d - b * c;
      if (Math.abs(det) < 1e-14) break;
      X = { re: X.re - (d * f0.re - b * f0.im) / det, im: X.im - (a * f0.im - c * f0.re) / det };
    }
    const fEnd = F(X);
    if (fEnd && absC(fEnd) <= 1e-9 * Math.max(1, absC(X))) return X;
  }
  return null;
};

/** clamp a fold target strictly INSIDE (lo, hi) with a margin — a fold that parks on a
 * boundary (quad midpoint vs `< 45`) turns later comparisons into float coin-flips */
const interior = (v: number, lo: number, hi: number): number => {
  const m = Math.max((hi - lo) * 0.02, 1e-6);
  return Math.min(Math.max(v, lo + m), hi - m);
};

/** apply one relation against an env (shared by the pass-1 sweep and the srel replay);
 * returns the changed free number, or null. */
const applyRel = (
  r: RelSpec,
  env: Map<string, Cx>,
  freeNames: Set<string>,
  P: (n: string) => number,
): { name: string; nv: Cx } | null => {
  const setF = (name: string, nv: Cx): { name: string; nv: Cx } => {
    env.set(name, nv);
    return { name, nv };
  };
  if (r.type === 'arg') {
    if (r.terms.some((t) => !env.has(t.name))) return null;
    const cmp = r.cmp ?? '=';
    if (cmp === '=') {
      const target = r.terms.find((t) => freeNames.has(t.name));
      if (!target) return null;
      const sumOther = r.terms
        .filter((t) => t !== target)
        .reduce((s, t) => s + t.sign * argDeg(env.get(t.name)!), 0);
      const v = env.get(target.name)!;
      return setF(target.name, cPolar(absC(v), (r.rhsDeg - sumOther) * target.sign));
    }
    const t0 = r.terms[0];
    if (r.terms.length !== 1 || t0.sign !== 1 || !freeNames.has(t0.name)) return null;
    const v = env.get(t0.name)!;
    const a = argDeg(v);
    if (cmpHolds(cmp, a, r.rhsDeg, 0)) return null;
    const na =
      cmp === '<' || cmp === '<='
        ? r.rhsDeg > 0
          ? interior(a % r.rhsDeg, 0, r.rhsDeg)
          : 0
        : interior(r.rhsDeg + (a % Math.max(1, 360 - r.rhsDeg)), r.rhsDeg, 360);
    return setF(t0.name, cPolar(absC(v), na));
  }
  if (r.type === 'quad') {
    if (!env.has(r.name) || !freeNames.has(r.name)) return null;
    const v = env.get(r.name)!;
    const a = argDeg(v);
    const lo = (r.q - 1) * 90;
    if (a > lo && a < lo + 90) return null;
    return setF(r.name, cPolar(absC(v), interior(lo + (a % 90), lo, lo + 90)));
  }
  if ((r.cmp ?? '=') !== '=') return null;
  if (!env.has(r.name) || (r.other && !env.has(r.other))) return null;
  const targetMod = r.k * (r.param ? P(r.param) : r.other ? absC(env.get(r.other)!) : 1);
  if (freeNames.has(r.name)) {
    return setF(r.name, cPolar(targetMod, argDeg(env.get(r.name)!)));
  }
  if (r.other && !r.param && freeNames.has(r.other)) {
    return setF(r.other, cPolar(absC(env.get(r.name)!) / r.k, argDeg(env.get(r.other)!)));
  }
  return null;
};

const cmpHolds = (cmp: Cmp, lhs: number, rhs: number, tol: number): boolean =>
  cmp === '<' ? lhs < rhs : cmp === '>' ? lhs > rhs : cmp === '<=' ? lhs <= rhs : cmp === '>=' ? lhs >= rhs : Math.abs(lhs - rhs) <= tol;

const relNames = (r: RelSpec): string[] =>
  r.type === 'arg'
    ? r.terms.map((t) => t.name)
    : r.type === 'mod' && r.other
      ? [r.name, r.other]
      : [r.name];

export interface ScenePoint {
  key: string;
  /** display name, subscripts prettified */
  label: string;
  z: Cx;
  kind: 'free' | 'def' | 'root';
  factId: string;
  /** free points are draggable by their fact name */
  freeName?: string;
  /** label prints this value when it differs from the plotted position (im-axis projection) */
  valueOverride?: Cx;
  /** marker-only label (anonymous solution set): no "= value" suffix */
  bare?: boolean;
}

export interface SceneCircle {
  r: number;
  factId: string;
}

export interface SceneSegment {
  key: string;
  a: Cx;
  b: Cx;
  factId: string;
}

export type EvalError = { key: 'unknown-ref'; detail: string } | { key: 'roots-of-zero'; detail: string };

export interface SceneMeasure {
  key: string;
  label: string;
  value: number;
  factId: string;
  /** symbolic display when the value depends on an UNDETERMINED parameter: "15r", "2r²" —
   * the honest answer while r cannot be calculated (the exam's הביעו-באמצעות-r ask) */
  form?: string;
}

export interface Scene {
  points: ScenePoint[];
  circles: SceneCircle[];
  /** drawn edges: segments and polygon boundaries (F6) */
  segments: SceneSegment[];
  /** scalar calcs (|z1−z2|, |z1|·2, …) — the DATA PANEL, not the plane (operator ruling) */
  measures: SceneMeasure[];
  /** factId -> error; an erroring fact contributes nothing, later facts still evaluate */
  errors: Record<string, EvalError>;
  /** relation facts: did the relation hold in the final figure (✓/✗), and did it drive a DOF */
  checks: Record<string, { ok: boolean; driven: boolean }>;
  /** shared real parameters in play (r, d, …) and their current sampled values */
  params: Record<string, number>;
}

class UnknownRef extends Error {
  constructor(public ref: string) {
    super(`unknown ref ${ref}`);
  }
}

const evalExpr = (e: Expr, env: Map<string, Cx>): Cx => {
  switch (e.t) {
    case 'lit':
      return e.v;
    case 'ref': {
      const v = env.get(e.name);
      if (v === undefined) throw new UnknownRef(e.name);
      return v;
    }
    case 'bin': {
      const l = evalExpr(e.l, env);
      const r = evalExpr(e.r, env);
      return e.op === '+' ? add(l, r) : e.op === '-' ? sub(l, r) : e.op === '*' ? mul(l, r) : div(l, r);
    }
    case 'pow':
      return ipow(evalExpr(e.base, env), e.exp);
    case 'neg':
      return neg(evalExpr(e.e, env));
    case 'conj':
      return conj(evalExpr(e.e, env));
    case 'abs':
      return { re: absC(evalExpr(e.e, env)), im: 0 };
    case 're':
      return { re: evalExpr(e.e, env).re, im: 0 };
    case 'im':
      return { re: evalExpr(e.e, env).im, im: 0 };
  }
};

/** Prettify digits inside an expression string: z1^5 → z₁^5 (label duty only). The single-NAME case
 * is `model/naming.ts`'s `prettyName`, imported above — a local fourth copy of it lived here and was
 * deleted with the extraction (#624); this one is about a whole expression string, not a name. */
export const prettyExpr = (s: string): string =>
  s.replace(/([a-zA-Z])(\d+)/g, (_, a: string, d: string) =>
    a + d.split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)] ?? c).join(''),
  );

const wrapDeg = (d: number): number => ((d % 360) + 360) % 360;

/** Pass 1 — driveOrCheck-lite: each relation, in fact order, projects ONE free number
 * (argument relations pin an argument, modulus relations pin a modulus). Returns the
 * adjusted free positions and which relation facts actually drove. */
const projectConstraints = (
  facts: Fact[],
  freePos: Record<string, Cx>,
  seed: number,
  paramScale?: Record<string, number>,
): { adjusted: Record<string, Cx>; drove: Record<string, boolean>; fwd: Record<string, boolean> } => {
  const P = (name: string): number => paramValue(name, seed) * (paramScale?.[name] ?? 1);
  const adjusted: Record<string, Cx> = {};
  const drove: Record<string, boolean> = {};
  const fwd: Record<string, boolean> = {}; // equations that drove their RHS forward (#602)
  // three sweeps: a later constraint that moves a number re-feeds the earlier ones
  // (arg(z1)-arg(z2)=90 stays true after arg(z2)<45 folds z2)
  for (let sweep = 0; sweep < 3; sweep++) {
  const env = new Map<string, Cx>([['o', cx(0)]]);
  const freeNames = new Set<string>();
  for (const f of facts) {
    try {
      if (f.kind === 'free') {
        env.set(f.name, adjusted[f.name] ?? freePos[f.name] ?? defaultFree(f.name, seed));
        freeNames.add(f.name);
      } else if (f.kind === 'def') {
        env.set(f.name, evalExpr(f.expr, env));
      } else if (f.kind === 'roots') {
        if (f.constrains && freeNames.has(f.varName)) {
          // fairness, equation edition (#600): if the LETTER is hard-claimed by another
          // constraint and the rhs is a bare FREE unclaimed ref, drive the rhs FORWARD
          // (z3 = z1³) instead of fighting over the letter
          const hard = new Set<string>();
          for (const g of facts) {
            if (g === f) continue;
            if (g.kind === 'rel') for (const n of relNames(g.rel)) hard.add(n);
            else if (g.kind === 'roots' && g.constrains) hard.add(g.varName);
          }
          if (
            hard.has(f.varName) &&
            f.rhs.t === 'ref' &&
            freeNames.has(f.rhs.name) &&
            !hard.has(f.rhs.name) &&
            env.has(f.varName)
          ) {
            const v = ipow(env.get(f.varName)!, f.n);
            env.set(f.rhs.name, v);
            adjusted[f.rhs.name] = v;
            drove[f.id] = true;
            fwd[f.id] = true;
            continue;
          }
          // the equation CONSTRAINS the existing free X — fixed-point on the nearest nth root,
          // replaying the prefix each iteration so a self-referential rhs (z^3 = w, w = z·z)
          // sees the candidate X
          const idx = facts.indexOf(f);
          const rhsAt = (X: Cx): Cx | null => {
            const e2 = new Map<string, Cx>();
            try {
              for (const g of facts.slice(0, idx)) {
                if (g.kind === 'free')
                  e2.set(
                    g.name,
                    g.name === f.varName
                      ? X
                      : (adjusted[g.name] ?? freePos[g.name] ?? defaultFree(g.name, seed)),
                  );
                else if (g.kind === 'def') e2.set(g.name, evalExpr(g.expr, e2));
                else if (g.kind === 'roots' && !g.constrains) {
                  const w = evalExpr(g.rhs, e2);
                  if (absC(w) > 0)
                    nthRoots(w, g.n).forEach((z, k) => e2.set(`${g.varName}${k + 1}`, z));
                }
              }
              return evalExpr(f.rhs, e2);
            } catch {
              return null;
            }
          };
          // step-size convergence: the projected X is ALWAYS an exact root of c(X_old), so a
          // residual against the old c is vacuous — the fixpoint is where X stops moving,
          // and acceptance is the SELF-consistent residual |X^n − rhs(X)|
          let X = env.get(f.varName)!;
          for (let it = 0; it < 200; it++) {
            const c = rhsAt(X);
            if (!c || absC(c) === 0) break;
            const next = nthRoots(c, f.n).reduce((best, cand) =>
              absC(sub(cand, X)) < absC(sub(best, X)) ? cand : best,
            );
            const step = absC(sub(next, X));
            X = next;
            if (step <= 1e-10 * Math.max(1, absC(X))) break;
          }
          const cFinal = rhsAt(X);
          if (
            cFinal &&
            absC(cFinal) > 0 &&
            absC(sub(ipow(X, f.n), cFinal)) <= 1e-6 * Math.max(1, absC(cFinal))
          ) {
            env.set(f.varName, X);
            adjusted[f.varName] = X;
            drove[f.id] = true;
          }
        } else if (!f.constrains) {
          const w = evalExpr(f.rhs, env);
          if (absC(w) > 0) nthRoots(w, f.n).forEach((z, k) => env.set(`${f.varName}${k + 1}`, z));
        }
      } else if (f.kind === 'rel') {
        const changed = applyRel(f.rel, env, freeNames, P);
        if (changed) {
          adjusted[changed.name] = changed.nv;
          drove[f.id] = true;
        }
      } else if (f.kind === 'eq') {
        const refs = [...new Set([...collectRefs(f.lhs), ...collectRefs(f.rhs)])];
        if (refs.some((n) => !env.has(n))) continue; // pass 2 reports
        const frees = refs.filter((n) => freeNames.has(n));
        if (frees.length === 0) continue; // determined → pass-2 check
        const hard = new Set<string>();
        for (const g of facts) {
          if (g === f) continue;
          if (g.kind === 'rel') for (const n of relNames(g.rel)) hard.add(n);
          else if (g.kind === 'roots' && g.constrains) hard.add(g.varName);
          else if (g.kind === 'eq')
            for (const n of [...collectRefs(g.lhs), ...collectRefs(g.rhs)]) hard.add(n);
        }
        const target = frees.find((n) => !hard.has(n)) ?? frees[0];
        const sol = solveEq(f.lhs, f.rhs, target, env, env.get(target)!);
        if (sol) {
          env.set(target, sol);
          adjusted[target] = sol;
          drove[f.id] = true;
        }
      } else if (f.kind === 'seq') {
        if (f.defines) {
          const v = seqSolve(f, f.defines, env, seed);
          if (v) env.set(f.defines, v); // derived term — later facts may use it
        } else {
          // drive-target fairness (#599): prefer a free term NO OTHER constraint claims —
          // driving a term that a quadrant/relation also targets makes the two facts fight
          // over one number while a term nobody else wants could satisfy both
          const claimed = new Set<string>();
          for (const g of facts) {
            if (g === f) continue;
            if (g.kind === 'rel') for (const n of relNames(g.rel)) claimed.add(n);
            else if (g.kind === 'roots' && g.constrains) claimed.add(g.varName);
            else if (g.kind === 'seq') for (const n of g.names) claimed.add(n);
          }
          const candidates = f.names.filter((n) => freeNames.has(n));
          const freeTarget = candidates.find((n) => !claimed.has(n)) ?? candidates[0];
          if (freeTarget) {
            const v = seqSolve(f, freeTarget, env, seed);
            if (v) {
              env.set(freeTarget, v);
              adjusted[freeTarget] = v;
              drove[f.id] = true;
            }
          }
        }
      } else if (f.kind === 'srel') {
        // area/perimeter GIVEN: 1-D root find over one free number's argument, replaying the
        // whole prefix (rels included) per candidate — so equality rels track the candidate
        // and inequality/quadrant folds alias out-of-range angles (branch pruning for free)
        const idx = facts.indexOf(f);
        const target = f.k * (f.param ? P(f.param) ** (f.pow ?? 1) : 1);
        const baseOf = (name: string): Cx =>
          adjusted[name] ?? freePos[name] ?? defaultFree(name, seed);
        const measureAt = (fname: string, aDeg: number): number | null => {
          const e2 = new Map<string, Cx>([['o', cx(0)]]);
          const fn2 = new Set<string>();
          try {
            for (const g of facts.slice(0, idx)) {
              if (g.kind === 'free') {
                const b = baseOf(g.name);
                e2.set(g.name, g.name === fname ? cPolar(absC(b), aDeg) : b);
                fn2.add(g.name);
              } else if (g.kind === 'def') e2.set(g.name, evalExpr(g.expr, e2));
              else if (g.kind === 'roots' && !g.constrains) {
                const w = evalExpr(g.rhs, e2);
                if (absC(w) > 0)
                  nthRoots(w, g.n).forEach((z, k) => e2.set(`${g.varName}${k + 1}`, z));
              } else if (g.kind === 'rel') applyRel(g.rel, e2, fn2, P);
            }
            return shapeMeasure(f.mtype, f.pts, e2);
          } catch {
            return null;
          }
        };
        const freeDecls = facts
          .slice(0, idx)
          .filter((g): g is Extract<Fact, { kind: 'free' }> => g.kind === 'free');
        outer: for (const fd of freeDecls) {
          // half-offset samples: never probe exact fold boundaries (0°, 45°, 90°…) where
          // float coin-flips make the measure discontinuous
          const N = 72;
          const at = (i: number): number => ((i + 0.5) * 360) / N;
          const vals: number[] = [];
          for (let i = 0; i < N; i++) {
            const v = measureAt(fd.name, at(i));
            if (v === null) continue outer;
            vals.push(v);
          }
          const span = Math.max(...vals) - Math.min(...vals);
          if (span <= 1e-9 * Math.max(1, Math.abs(target))) continue; // DOF doesn't move it
          for (let i = 0; i < N - 1; i++) {
            const r0 = vals[i] - target;
            const r1 = vals[i + 1] - target;
            if (r0 === 0 || r0 * r1 < 0) {
              let a = at(i);
              let b = at(i + 1);
              for (let it = 0; it < 60; it++) {
                const mid = (a + b) / 2;
                const rm = (measureAt(fd.name, mid) ?? target) - target;
                if (r0 * rm <= 0) b = mid;
                else a = mid;
              }
              const bv = baseOf(fd.name);
              const nv = cPolar(absC(bv), (a + b) / 2);
              env.set(fd.name, nv);
              adjusted[fd.name] = nv;
              drove[f.id] = true;
              break outer;
            }
          }
        }
      }
    } catch {
      // evaluation problems are reported by pass 2
    }
  }
  }
  return { adjusted, drove, fwd };
};

export const derive = (
  facts: Fact[],
  freePos: Record<string, Cx>,
  seed = 0,
  paramScale?: Record<string, number>,
): Scene => {
  const { adjusted, drove, fwd } = projectConstraints(facts, freePos, seed, paramScale);
  const effFreePos = { ...freePos, ...adjusted };
  const env = new Map<string, Cx>([['o', cx(0)]]);
  const segments: SceneSegment[] = [];
  const points: ScenePoint[] = [];
  const circles: SceneCircle[] = [];
  const errors: Record<string, EvalError> = {};
  const checks: Record<string, { ok: boolean; driven: boolean }> = {};
  const params: Record<string, number> = {};
  const measures: SceneMeasure[] = [];

  for (const f of facts) {
    try {
      if (f.kind === 'free') {
        const z = effFreePos[f.name] ?? defaultFree(f.name, seed);
        env.set(f.name, z);
        points.push({
          key: f.id,
          label: prettyName(f.name),
          z,
          kind: 'free',
          factId: f.id,
          // #603 (operator ruling): a constraint-ADJUSTED number is not draggable — a drag
          // would fight the drive; its remaining freedom belongs to "another configuration"
          freeName: adjusted[f.name] ? undefined : f.name,
        });
      } else if (f.kind === 'rel') {
        const r = f.rel;
        const missing = relNames(r).find((n) => !env.has(n));
        if (missing) {
          errors[f.id] = { key: 'unknown-ref', detail: missing };
          continue;
        }
        let ok: boolean;
        if (r.type === 'arg') {
          const cmp = r.cmp ?? '=';
          const lhs = wrapDeg(r.terms.reduce((s, t) => s + t.sign * argDeg(env.get(t.name)!), 0));
          if (cmp === '=') {
            const d = wrapDeg(lhs - r.rhsDeg);
            ok = d < 1e-6 || d > 360 - 1e-6;
          } else {
            ok = cmpHolds(cmp, lhs, r.rhsDeg, 0);
          }
        } else if (r.type === 'quad') {
          const a = argDeg(env.get(r.name)!);
          const lo = (r.q - 1) * 90;
          ok = a > lo && a < lo + 90;
        } else {
          const P = (n: string): number => paramValue(n, seed) * (paramScale?.[n] ?? 1);
          if (r.param) params[r.param] = P(r.param);
          const target = r.k * (r.param ? P(r.param) : r.other ? absC(env.get(r.other)!) : 1);
          ok = cmpHolds(r.cmp ?? '=', absC(env.get(r.name)!), target, 1e-9 * Math.max(1, target));
        }
        checks[f.id] = { ok, driven: !!drove[f.id] };
      } else if (f.kind === 'def') {
        const z = evalExpr(f.expr, env);
        env.set(f.name, z);
        points.push({ key: f.id, label: prettyName(f.name), z, kind: 'def', factId: f.id });
      } else if (f.kind === 'eq') {
        const miss = [...new Set([...collectRefs(f.lhs), ...collectRefs(f.rhs)])].find(
          (n) => !env.has(n),
        );
        if (miss) {
          errors[f.id] = { key: 'unknown-ref', detail: miss };
          continue;
        }
        const l = evalExpr(f.lhs, env);
        const r2 = evalExpr(f.rhs, env);
        const scale = Math.max(1, absC(l), absC(r2));
        checks[f.id] = { ok: absC(sub(l, r2)) <= 1e-6 * scale, driven: !!drove[f.id] };
      } else if (f.kind === 'seq') {
        if (f.defines) {
          const v = seqSolve(f, f.defines, env, seed);
          if (!v) {
            const miss = f.names.find((n) => n !== f.defines && !env.has(n));
            errors[f.id] = { key: 'unknown-ref', detail: miss ?? f.defines };
            continue;
          }
          env.set(f.defines, v);
          points.push({ key: f.id, label: prettyName(f.defines), z: v, kind: 'def', factId: f.id });
        }
        const miss = f.names.find((n) => !env.has(n));
        if (miss) {
          errors[f.id] = { key: 'unknown-ref', detail: miss };
          continue;
        }
        // the progression chain, drawn — arithmetic reads as a line, geometric as a spiral
        for (let i = 0; i + 1 < f.names.length; i++) {
          segments.push({
            key: `${f.id}-${i}`,
            a: env.get(f.names[i])!,
            b: env.get(f.names[i + 1])!,
            factId: f.id,
          });
        }
        checks[f.id] = { ok: seqHolds(f, env), driven: !!drove[f.id] || !!f.defines };
      } else if (f.kind === 'shape') {
        const miss = f.pts.find((p) => !env.has(p));
        if (miss) {
          errors[f.id] = { key: 'unknown-ref', detail: miss };
          continue;
        }
        const vs = f.pts.map((p) => env.get(p)!);
        const closed = vs.length > 2;
        for (let i = 0; i < (closed ? vs.length : vs.length - 1); i++) {
          segments.push({ key: `${f.id}-${i}`, a: vs[i], b: vs[(i + 1) % vs.length], factId: f.id });
        }
      } else if (f.kind === 'smeasure') {
        measures.push({
          key: f.id,
          label: prettyExpr(f.norm),
          value: shapeMeasure(f.mtype, f.pts, env),
          factId: f.id,
        });
      } else if (f.kind === 'srel') {
        const P2 = (n: string): number => paramValue(n, seed) * (paramScale?.[n] ?? 1);
        if (f.param) params[f.param] = P2(f.param);
        const target = f.k * (f.param ? P2(f.param) ** (f.pow ?? 1) : 1);
        const v = shapeMeasure(f.mtype, f.pts, env);
        checks[f.id] = {
          ok: Math.abs(v - target) <= 1e-6 * Math.max(1, Math.abs(target)),
          driven: !!drove[f.id],
        };
      } else if (f.kind === 'show') {
        const v = evalExpr(f.expr, env);
        if (isScalarExpr(f.expr)) {
          // a scalar calc lives in the data panel, not on the plane (operator ruling) —
          // except re/im, whose axis PROJECTIONS were explicitly requested and stay drawn
          measures.push({ key: f.id, label: prettyExpr(f.norm), value: v.re, factId: f.id });
          if (f.expr.t === 're' || f.expr.t === 'im') {
            const z = f.expr.t === 'im' ? { re: 0, im: v.re } : v;
            points.push({
              key: f.id,
              label: prettyExpr(f.norm),
              z,
              kind: 'def',
              factId: f.id,
              valueOverride: f.expr.t === 'im' ? v : undefined,
            });
          }
        } else {
          points.push({ key: f.id, label: prettyExpr(f.norm), z: v, kind: 'def', factId: f.id });
        }
      } else {
        const w = evalExpr(f.rhs, env);
        if (f.constrains) {
          // the equation is ABOUT the existing X: driven → verified snap; determined → claim
          const X = env.get(f.varName);
          if (X === undefined) {
            errors[f.id] = { key: 'unknown-ref', detail: f.varName };
            continue;
          }
          const ok = absC(sub(ipow(X, f.n), w)) <= 1e-6 * Math.max(1, absC(w));
          checks[f.id] = { ok, driven: !!drove[f.id] };
          if (drove[f.id] && !fwd[f.id] && absC(w) > 0) {
            // the LETTER was snapped to one of n roots — show the alternatives it was chosen
            // from; a FORWARD drive (rhs positioned from the letter) has no choice to show (#602)
            const roots = nthRoots(w, f.n);
            circles.push({ r: absC(roots[0]), factId: f.id });
            // display-only candidates — no env registration (factNames introduces nothing here)
            roots.forEach((z, k) => {
              points.push({
                key: `${f.id}-${k}`,
                label: prettyName(`${f.varName}${k + 1}`),
                z,
                kind: 'root',
                factId: f.id,
              });
            });
          }
          continue;
        }
        if (absC(w) === 0) {
          errors[f.id] = { key: 'roots-of-zero', detail: f.src };
          continue;
        }
        const roots = nthRoots(w, f.n);
        circles.push({ r: absC(roots[0]), factId: f.id });
        roots.forEach((z, k) => {
          if (f.anon) {
            // anonymous set: marked, unnamed — the indices belong to other numbers
            points.push({ key: `${f.id}-${k}`, label: CIRCLED[k] ?? `#${k + 1}`, z, kind: 'root', factId: f.id, bare: true });
          } else {
            env.set(`${f.varName}${k + 1}`, z); // solutions are named points; later facts may reference them
            points.push({
              key: `${f.id}-${k}`,
              label: prettyName(`${f.varName}${k + 1}`),
              z,
              kind: 'root',
              factId: f.id,
            });
          }
        });
      }
    } catch (err) {
      if (err instanceof UnknownRef) {
        errors[f.id] = { key: 'unknown-ref', detail: err.ref };
      } else {
        throw err;
      }
    }
  }
  return { points, circles, segments, errors, checks, params, measures };
};

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

/** derive + symbolic parameter forms for measures: re-derives with each parameter scaled
 * ×2 and ×3 and reads off the power — constant, k·p (linear), or k·p² (quadratic). A measure
 * that is none of these stays numeric. Multi-parameter scenes stay numeric (v1 boundary). */
export const deriveScene = (facts: Fact[], freePos: Record<string, Cx>, seed = 0): Scene => {
  const base = derive(facts, freePos, seed);
  const pnames = Object.keys(base.params);
  if (pnames.length !== 1 || base.measures.length === 0) return base;
  const p = pnames[0];
  const s2 = derive(facts, freePos, seed, { [p]: 2 });
  const s3 = derive(facts, freePos, seed, { [p]: 3 });
  const pv = base.params[p];
  base.measures = base.measures.map((m) => {
    if (Math.abs(m.value) < 1e-12) return m;
    const v2 = s2.measures.find((x) => x.key === m.key)?.value;
    const v3 = s3.measures.find((x) => x.key === m.key)?.value;
    if (v2 === undefined || v3 === undefined) return m;
    for (const pow of [0, 1, 2] as const) {
      if (near(v2, m.value * 2 ** pow) && near(v3, m.value * 3 ** pow)) {
        if (pow === 0) return m; // parameter-independent → plain numeric
        const k = m.value / pv ** pow;
        const coeff = Math.abs(k - 1) < 1e-9 ? '' : fmtNum(k);
        return { ...m, form: `${coeff}${p}${pow === 2 ? '²' : ''}` };
      }
    }
    return m; // not a clean power of the parameter → numeric (never fake a form)
  });
  return base;
};
