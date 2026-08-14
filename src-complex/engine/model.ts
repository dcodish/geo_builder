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
  | { t: 'conj'; e: Expr };

export type Fact =
  | { id: string; kind: 'free'; name: string; src: string }
  | { id: string; kind: 'def'; name: string; expr: Expr; src: string }
  | { id: string; kind: 'roots'; varName: string; n: number; rhs: Expr; src: string };

/** Distributive Omit — plain Omit collapses the union and loses the discriminant's payload. */
type FactBody = Fact extends infer F ? (F extends Fact ? Omit<F, 'id'> : never) : never;

/** Deterministic ids (the sibling convention): re-adding the same statement is idempotent. */
export const factId = (f: FactBody): string =>
  f.kind === 'roots' ? `roots-${f.varName}-${f.n}` : `${f.kind}-${f.name}`;

export interface ScenePoint {
  key: string;
  /** display name, subscripts prettified */
  label: string;
  z: Cx;
  kind: 'free' | 'def' | 'root';
  factId: string;
  /** free points are draggable by their fact name */
  freeName?: string;
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
  }
};

/** Deterministic default position for a free number, keyed by NAME (never insertion order) —
 * the stability discipline: adding another fact cannot move an existing free point. */
export const defaultFree = (name: string): Cx => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
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

export const derive = (facts: Fact[], freePos: Record<string, Cx>): Scene => {
  const env = new Map<string, Cx>();
  const points: ScenePoint[] = [];
  const circles: SceneCircle[] = [];
  const errors: Record<string, EvalError> = {};

  for (const f of facts) {
    try {
      if (f.kind === 'free') {
        const z = freePos[f.name] ?? defaultFree(f.name);
        env.set(f.name, z);
        points.push({ key: f.id, label: prettyName(f.name), z, kind: 'free', factId: f.id, freeName: f.name });
      } else if (f.kind === 'def') {
        const z = evalExpr(f.expr, env);
        env.set(f.name, z);
        points.push({ key: f.id, label: prettyName(f.name), z, kind: 'def', factId: f.id });
      } else {
        const w = evalExpr(f.rhs, env);
        if (absC(w) === 0) {
          errors[f.id] = { key: 'roots-of-zero', detail: f.src };
          continue;
        }
        const roots = nthRoots(w, f.n);
        circles.push({ r: absC(roots[0]), factId: f.id });
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
    } catch (err) {
      if (err instanceof UnknownRef) {
        errors[f.id] = { key: 'unknown-ref', detail: err.ref };
      } else {
        throw err;
      }
    }
  }
  return { points, circles, errors };
};

/** Names a fact introduces — used by the store's duplicate-name honesty check. */
export const factNames = (f: Fact): string[] =>
  f.kind === 'roots' ? Array.from({ length: f.n }, (_, k) => `${f.varName}${k + 1}`) : [f.name];
