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
  | { id: string; kind: 'roots'; varName: string; n: number; rhs: Expr; src: string; norm: string; constrains?: boolean }
  /** an unnamed expression line — plotted, labeled by the expression itself, never referencable
   *  (ADR-447: anonymous ids never reach a rendered string; the label is the student's text) */
  | { id: string; kind: 'show'; expr: Expr; src: string; norm: string }
  /** a relation (F3 modulus / F4 argument): DRIVES a free number when one is available,
   *  VERIFIES (✓/✗) when everything is determined — driveOrCheck-lite */
  | { id: string; kind: 'rel'; rel: RelSpec; src: string; norm: string };

export interface ArgTerm {
  sign: 1 | -1;
  name: string;
}

export type RelSpec =
  /** Σ sign·arg(name) = rhsDeg */
  | { type: 'arg'; terms: ArgTerm[]; rhsDeg: number }
  /** |name| = k  or  |name| = k·|other| */
  | { type: 'mod'; name: string; k: number; other?: string };

const relNames = (r: RelSpec): string[] =>
  r.type === 'arg' ? r.terms.map((t) => t.name) : r.other ? [r.name, r.other] : [r.name];

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
  f.kind === 'roots' || f.kind === 'show' || f.kind === 'rel'
    ? `${f.kind}-${f.norm.replace(/ /g, '')}`
    : `${f.kind}-${f.name}`;

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
}

export interface SceneCircle {
  r: number;
  factId: string;
}

export type EvalError = { key: 'unknown-ref'; detail: string } | { key: 'roots-of-zero'; detail: string };

export interface Scene {
  points: ScenePoint[];
  circles: SceneCircle[];
  /** factId -> error; an erroring fact contributes nothing, later facts still evaluate */
  errors: Record<string, EvalError>;
  /** relation facts: did the relation hold in the final figure (✓/✗), and did it drive a DOF */
  checks: Record<string, { ok: boolean; driven: boolean }>;
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
): { adjusted: Record<string, Cx>; drove: Record<string, boolean> } => {
  const adjusted: Record<string, Cx> = {};
  const drove: Record<string, boolean> = {};
  const env = new Map<string, Cx>();
  const freeNames = new Set<string>();
  for (const f of facts) {
    try {
      if (f.kind === 'free') {
        env.set(f.name, freePos[f.name] ?? defaultFree(f.name, seed));
        freeNames.add(f.name);
      } else if (f.kind === 'def') {
        env.set(f.name, evalExpr(f.expr, env));
      } else if (f.kind === 'roots') {
        if (f.constrains && freeNames.has(f.varName)) {
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
        const r = f.rel;
        if (r.type === 'arg') {
          if (r.terms.some((t) => !env.has(t.name))) continue;
          const target = r.terms.find((t) => freeNames.has(t.name));
          if (!target) continue;
          const sumOther = r.terms
            .filter((t) => t !== target)
            .reduce((s, t) => s + t.sign * argDeg(env.get(t.name)!), 0);
          const v = env.get(target.name)!;
          const nv = cisDeg(absC(v), (r.rhsDeg - sumOther) * target.sign);
          env.set(target.name, nv);
          adjusted[target.name] = nv;
          drove[f.id] = true;
        } else {
          if (!env.has(r.name) || (r.other && !env.has(r.other))) continue;
          const targetMod = r.k * (r.other ? absC(env.get(r.other)!) : 1);
          if (freeNames.has(r.name)) {
            const nv = cisDeg(targetMod, argDeg(env.get(r.name)!));
            env.set(r.name, nv);
            adjusted[r.name] = nv;
            drove[f.id] = true;
          } else if (r.other && freeNames.has(r.other)) {
            const nv = cisDeg(absC(env.get(r.name)!) / r.k, argDeg(env.get(r.other)!));
            env.set(r.other, nv);
            adjusted[r.other] = nv;
            drove[f.id] = true;
          }
        }
      }
    } catch {
      // evaluation problems are reported by pass 2
    }
  }
  return { adjusted, drove };
};

export const derive = (facts: Fact[], freePos: Record<string, Cx>, seed = 0): Scene => {
  const { adjusted, drove } = projectConstraints(facts, freePos, seed);
  const effFreePos = { ...freePos, ...adjusted };
  const env = new Map<string, Cx>();
  const points: ScenePoint[] = [];
  const circles: SceneCircle[] = [];
  const errors: Record<string, EvalError> = {};
  const checks: Record<string, { ok: boolean; driven: boolean }> = {};

  for (const f of facts) {
    try {
      if (f.kind === 'free') {
        const z = effFreePos[f.name] ?? defaultFree(f.name, seed);
        env.set(f.name, z);
        points.push({ key: f.id, label: prettyName(f.name), z, kind: 'free', factId: f.id, freeName: f.name });
      } else if (f.kind === 'rel') {
        const r = f.rel;
        const missing = (r.type === 'arg' ? r.terms.map((t) => t.name) : r.other ? [r.name, r.other] : [r.name]).find(
          (n) => !env.has(n),
        );
        if (missing) {
          errors[f.id] = { key: 'unknown-ref', detail: missing };
          continue;
        }
        let ok: boolean;
        if (r.type === 'arg') {
          const lhs = r.terms.reduce((s, t) => s + t.sign * argDeg(env.get(t.name)!), 0);
          const d = wrapDeg(lhs - r.rhsDeg);
          ok = d < 1e-6 || d > 360 - 1e-6;
        } else {
          const target = r.k * (r.other ? absC(env.get(r.other)!) : 1);
          ok = Math.abs(absC(env.get(r.name)!) - target) <= 1e-9 * Math.max(1, target);
        }
        checks[f.id] = { ok, driven: !!drove[f.id] };
      } else if (f.kind === 'def') {
        const z = evalExpr(f.expr, env);
        env.set(f.name, z);
        points.push({ key: f.id, label: prettyName(f.name), z, kind: 'def', factId: f.id });
      } else if (f.kind === 'show') {
        const v = evalExpr(f.expr, env);
        // im(z) is a real scalar, but its PICTURE is the projection onto the imaginary axis —
        // a top-level im(...) show plots at (0, v); everywhere else the value stays the scalar.
        const z = f.expr.t === 'im' ? { re: 0, im: v.re } : v;
        points.push({
          key: f.id,
          label: prettyExpr(f.norm),
          z,
          kind: 'def',
          factId: f.id,
          valueOverride: f.expr.t === 'im' ? v : undefined,
        });
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
          if (drove[f.id] && absC(w) > 0) {
            // represent the solvable meaning: the full candidate set, X sitting on one of them
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
          env.set(`${f.varName}${k + 1}`, z); // solutions are named points; later facts may reference them
          points.push({
            key: `${f.id}-${k}`,
            label: prettyName(`${f.varName}${k + 1}`),
            z,
            kind: 'root',
            factId: f.id,
          });
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
  return { points, circles, errors, checks };
};

/** Names a fact introduces — used by the store's duplicate-name honesty check.
 * A solution-enumerating roots fact also RESERVES its bare letter: z is related to z1..zn,
 * so a later independent `z = …` (or implicit creation of z) must refuse, naming this fact. */
export const factNames = (f: Fact): string[] =>
  f.kind === 'roots'
    ? f.constrains
      ? [] // constraint/claim mode: the candidates are display-only, no names introduced
      : [f.varName, ...Array.from({ length: f.n }, (_, k) => `${f.varName}${k + 1}`)]
    : f.kind === 'show' || f.kind === 'rel'
      ? []
      : [f.name];

/** Names a fact CONSUMES — drives the store's implicit z/w auto-creation (ADR-CX-004). */
export const factRefs = (f: Fact): string[] =>
  f.kind === 'def' || f.kind === 'show'
    ? collectRefs(f.expr)
    : f.kind === 'roots'
      ? collectRefs(f.rhs)
      : f.kind === 'rel'
        ? relNames(f.rel)
        : [];
