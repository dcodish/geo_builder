// Fact model + derive for the C0 prototype: the ordered fact list is the source of truth,
// the scene is derived (the sibling products' store/replay discipline in miniature).
import {
  type Cx,
  add,
  sub,
  mul,
  div,
  neg,
  conj,
  absC,
  argDeg,
  cisDeg,
  cx,
  fmtNum,
  ipow,
  nthRoots,
} from './complex';

export type Expr =
  | { t: 'lit'; v: Cx }
  | { t: 'ref'; name: string }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; l: Expr; r: Expr }
  | { t: 'pow'; base: Expr; exp: number }
  | { t: 'neg'; e: Expr }
  | { t: 'conj'; e: Expr }
  | { t: 'abs'; e: Expr }
  | { t: 're'; e: Expr }
  | { t: 'im'; e: Expr };

export type Fact =
  | { id: string; kind: 'free'; name: string; src: string; implicit?: boolean }
  | { id: string; kind: 'def'; name: string; expr: Expr; src: string }
  /** X^n = expr. Three modes (operator ruling 2026-08-15): X fresh → enumerate the solution
   *  set X1..Xn and RESERVE the bare letter (X is related to its indexed letters); X an
   *  existing free number → the equation CONSTRAINS it (snap to the nearest solution, show
   *  the candidates); X determined → the equation VERIFIES (✓/✗). `constrains` is stamped
   *  by the store from whether X already existed. */
  | {
      id: string;
      kind: 'roots';
      varName: string;
      n: number;
      rhs: Expr;
      src: string;
      norm: string;
      constrains?: boolean;
      /** enumeration whose indexed names are already taken (the §2b Z vs Z₁ case): the
       *  solutions are an ANONYMOUS SET — marked points, no names claimed (exam-faithful) */
      anon?: boolean;
    }
  /** an unnamed expression line — plotted, labeled by the expression itself, never referencable
   *  (ADR-447: anonymous ids never reach a rendered string; the label is the student's text) */
  | { id: string; kind: 'show'; expr: Expr; src: string; norm: string }
  /** a relation (F3 modulus / F4 argument): DRIVES a free number when one is available,
   *  VERIFIES (✓/✗) when everything is determined — driveOrCheck-lite */
  | { id: string; kind: 'rel'; rel: RelSpec; src: string; norm: string }
  /** F9 list form (ADR-CX-003; operator 2026-08-15 — "the list form is correct for now"):
   *  the named numbers are CONSECUTIVE terms of one sequence. driveOrCheck: all determined →
   *  verify; `defines` (stamped by the store: exactly one unknown name) → that term is DERIVED
   *  from the others; one FREE term among determined ones → driven. */
  | {
      id: string;
      kind: 'seq';
      stype: 'geo' | 'ari';
      names: string[];
      defines?: string;
      src: string;
      norm: string;
    }
  /** F6: a segment (2 pts) or polygon (3+ pts) over named points; 'o' is always the origin */
  | { id: string; kind: 'shape'; pts: string[]; src: string; norm: string }
  /** F7 measure: area/perimeter of a polygon, length of a segment — a calc-panel entry */
  | { id: string; kind: 'smeasure'; mtype: 'area' | 'perim' | 'len'; pts: string[]; src: string; norm: string }
  /** F7 given/claim: area/perimeter = k·param^pow — drives a free angular DOF (1-D root
   *  find over the constraint replay) or verifies when nothing is free */
  | {
      id: string;
      kind: 'srel';
      mtype: 'area' | 'perim';
      pts: string[];
      k: number;
      param?: string;
      pow?: 1 | 2;
      src: string;
      norm: string;
    };

export interface ArgTerm {
  sign: 1 | -1;
  name: string;
}

export type Cmp = '=' | '<' | '>' | '<=' | '>=';

export type RelSpec =
  /** Σ sign·arg(name) ⟨cmp⟩ rhsDeg — '=' drives; inequalities verify, folding a free number
   *  into range (the branch-selector reading of `arg z2 < 45`) */
  | { type: 'arg'; terms: ArgTerm[]; rhsDeg: number; cmp?: Cmp }
  /** |name| ⟨cmp⟩ k · (param | |other| | 1) — a PARAM is a shared real DOF sampled per seed:
   *  `|z1| = 9r` and `|z2| = 12r` share the same r (the exam's parameter convention) */
  | { type: 'mod'; name: string; k: number; other?: string; param?: string; cmp?: Cmp }
  /** quadrant membership (F5): strict interior of quadrant q — verifies when determined,
   *  folds a free number's argument into the quadrant when violated */
  | { type: 'quad'; name: string; q: 1 | 2 | 3 | 4 };

/** Deterministic positive sample for a real parameter, per (name, seed) — 0.6 .. 2.4. */
export const paramValue = (name: string, seed = 0): number => {
  let h = 0;
  for (const ch of `${name}@${seed}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 0.6 + (h % 181) / 100;
};

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
      return cisDeg(Math.sqrt(absC(prod)), argDeg(prod) / 2 + branch * 180);
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
      return setF(target.name, cisDeg(absC(v), (r.rhsDeg - sumOther) * target.sign));
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
    return setF(t0.name, cisDeg(absC(v), na));
  }
  if (r.type === 'quad') {
    if (!env.has(r.name) || !freeNames.has(r.name)) return null;
    const v = env.get(r.name)!;
    const a = argDeg(v);
    const lo = (r.q - 1) * 90;
    if (a > lo && a < lo + 90) return null;
    return setF(r.name, cisDeg(absC(v), interior(lo + (a % 90), lo, lo + 90)));
  }
  if ((r.cmp ?? '=') !== '=') return null;
  if (!env.has(r.name) || (r.other && !env.has(r.other))) return null;
  const targetMod = r.k * (r.param ? P(r.param) : r.other ? absC(env.get(r.other)!) : 1);
  if (freeNames.has(r.name)) {
    return setF(r.name, cisDeg(targetMod, argDeg(env.get(r.name)!)));
  }
  if (r.other && !r.param && freeNames.has(r.other)) {
    return setF(r.other, cisDeg(absC(env.get(r.name)!) / r.k, argDeg(env.get(r.other)!)));
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

/** The exam's naming convention (ADR-CX-004): z- and w-family names ARE complex numbers — first
 * reference auto-creates a free number. Other letters stay explicit (a,d,m,n,r are real params). */
export const IMPLICIT_COMPLEX_RE = /^[zw]\d*$/;

export const collectRefs = (e: Expr, out: string[] = []): string[] => {
  switch (e.t) {
    case 'ref':
      out.push(e.name);
      break;
    case 'bin':
      collectRefs(e.l, out);
      collectRefs(e.r, out);
      break;
    case 'pow':
      collectRefs(e.base, out);
      break;
    case 'neg':
    case 'conj':
    case 'abs':
    case 're':
    case 'im':
      collectRefs(e.e, out);
      break;
    case 'lit':
      break;
  }
  return out;
};

/** Distributive Omit — plain Omit collapses the union and loses the discriminant's payload. */
type FactBody = Fact extends infer F ? (F extends Fact ? Omit<F, 'id'> : never) : never;

/** Deterministic ids (the sibling convention): re-adding the same statement is idempotent. */
export const factId = (f: FactBody): string =>
  f.kind === 'free' || f.kind === 'def'
    ? `${f.kind}-${f.name}`
    : `${f.kind}-${f.norm.replace(/ /g, '')}`;

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

/** Static scalarness: is this expression a MEASURE (a real calc) rather than a point?
 * abs/re/im produce scalars; arithmetic containing a scalar stays scalar. */
export const isScalarExpr = (e: Expr): boolean => {
  switch (e.t) {
    case 'abs':
    case 're':
    case 'im':
      return true;
    case 'neg':
      return isScalarExpr(e.e);
    case 'pow':
      return isScalarExpr(e.base);
    case 'bin':
      return isScalarExpr(e.l) || isScalarExpr(e.r);
    default:
      return false;
  }
};

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

/** Deterministic default position for a free number, keyed by NAME + configuration seed
 * (never insertion order) — the stability discipline: adding another fact cannot move an
 * existing free point; "show another configuration" bumps the seed and resamples them all. */
export const defaultFree = (name: string, seed = 0): Cx => {
  let h = 0;
  for (const ch of `${name}#${seed}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const angle = 15 + (h % 8) * 45 + ((h >> 5) % 15); // spread, avoiding axis-hugging
  const r = 1.5 + ((h >> 3) % 20) / 10; // 1.5 .. 3.4
  return cisDeg(r, angle);
};

const SUB_DIGITS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
};

export const prettyName = (name: string): string =>
  name.replace(/(\d+)$/, (d) => d.split('').map((c) => SUB_DIGITS[c] ?? c).join(''));

/** Prettify digits inside an expression string: z1^5 → z₁^5 (label duty only). */
export const prettyExpr = (s: string): string =>
  s.replace(/([a-zA-Z])(\d+)/g, (_, a: string, d: string) =>
    a + d.split('').map((c) => SUB_DIGITS[c] ?? c).join(''),
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
                e2.set(g.name, g.name === fname ? cisDeg(absC(b), aDeg) : b);
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
              const nv = cisDeg(absC(bv), (a + b) / 2);
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
        points.push({ key: f.id, label: prettyName(f.name), z, kind: 'free', factId: f.id, freeName: f.name });
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

/** Names a fact introduces — used by the store's duplicate-name honesty check.
 * A solution-enumerating roots fact also RESERVES its bare letter: z is related to z1..zn,
 * so a later independent `z = …` (or implicit creation of z) must refuse, naming this fact. */
export const factNames = (f: Fact): string[] =>
  f.kind === 'roots'
    ? f.constrains
      ? [] // constraint/claim mode: the candidates are display-only, no names introduced
      : f.anon
        ? [f.varName] // anonymous set: the letter stays reserved, the indices stay everyone else's
        : [f.varName, ...Array.from({ length: f.n }, (_, k) => `${f.varName}${k + 1}`)]
    : f.kind === 'free' || f.kind === 'def'
      ? [f.name]
      : f.kind === 'seq' && f.defines
        ? [f.defines]
        : [];

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

/** Names a fact CONSUMES — drives the store's implicit z/w auto-creation (ADR-CX-004). */
export const factRefs = (f: Fact): string[] =>
  f.kind === 'def' || f.kind === 'show'
    ? collectRefs(f.expr)
    : f.kind === 'roots'
      ? collectRefs(f.rhs)
      : f.kind === 'rel'
        ? relNames(f.rel)
        : f.kind === 'shape' || f.kind === 'smeasure' || f.kind === 'srel'
          ? f.pts.filter((p) => p !== 'o') // O always exists; never implicit-created
          : f.kind === 'seq'
            ? f.names.filter((n) => n !== 'o' && n !== f.defines)
              : [];
