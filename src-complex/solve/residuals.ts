/**
 * Residual construction — how a stated relation becomes a signed scalar the numeric tier can drive to
 * zero (stage 3a of [docs/LADDER-CX.md](../../docs/LADDER-CX.md)).
 *
 * This file is the whole of what tier 2 knows about the *meaning* of a constraint. The solver in
 * `tier2.ts` sees numbers and nothing else, which is
 * [ADR-CX-009](../../docs/06d-decisions-complex.md#adr-cx-009) §3's requirement: a constraint may
 * report, never teach the solver a new trick. Every case added here is a `residual`, never a branch in
 * the minimiser.
 */

import type { Cx } from '../value/value';
import type { Expr } from '../model/expr';
import type { Constraint } from '../model/constraint';
import { type MeasureRelation, measureOf } from '../model/measure';
import { toNumber } from '../value/rational';
import { evaluate } from '../value/value';
import type { Strength } from './tier2';

/** Where a residual reads its values from. `undefined` means "not placed yet", never "zero". */
export interface Env {
  readonly at: (name: string) => Cx | undefined;
  readonly param: (name: string) => number | undefined;
}

/**
 * One stated relation, as the numeric tier sees it.
 *
 * `values` returns one scalar per real equation the relation implies — a complex equation is TWO, and
 * collapsing it to a single magnitude would let a solution sit at the wrong argument with a residual
 * of zero.
 */
export interface ResidualSpec {
  readonly key: string;
  readonly describe: string;
  readonly strength: Strength;
  readonly refs: readonly string[];
  /** null when the relation cannot be evaluated at all — undecided, which is not the same as unsatisfied */
  readonly values: (env: Env) => number[] | null;
}

const C = (re: number, im: number): Cx => ({ re, im });

/** Numeric complex evaluation of an expression. Null when a name it reads has no value yet. */
export function evalComplex(e: Expr, env: Env): Cx | null {
  switch (e.t) {
    case 'num':
      return C(toNumber(e.v), 0);
    case 'i':
      return C(0, 1);
    case 'val': {
      const v = evaluate(e.v);
      return v ? C(v.re, v.im) : null;
    }
    case 'ref':
      return env.at(e.name) ?? null;
    case 'param': {
      const p = env.param(e.name);
      return p === undefined ? null : C(p, 0);
    }
    case 'add':
    case 'sub':
    case 'mul':
    case 'div': {
      const l = evalComplex(e.l, env);
      const r = evalComplex(e.r, env);
      if (!l || !r) return null;
      if (e.t === 'add') return C(l.re + r.re, l.im + r.im);
      if (e.t === 'sub') return C(l.re - r.re, l.im - r.im);
      if (e.t === 'mul') return C(l.re * r.re - l.im * r.im, l.re * r.im + l.im * r.re);
      const d = r.re * r.re + r.im * r.im;
      return d === 0 ? null : C((l.re * r.re + l.im * r.im) / d, (l.im * r.re - l.re * r.im) / d);
    }
    case 'pow': {
      const b = evalComplex(e.base, env);
      if (!b) return null;
      // the principal branch, in polar form — an integer exponent is the common case and exact enough,
      // a rational one is the n-th root the exact tier could not carry
      const k = toNumber(e.exp);
      const mod = Math.hypot(b.re, b.im);
      if (mod === 0) return k > 0 ? C(0, 0) : null;
      const ang = Math.atan2(b.im, b.re);
      return C(mod ** k * Math.cos(k * ang), mod ** k * Math.sin(k * ang));
    }
    case 'conj': {
      const x = evalComplex(e.e, env);
      return x ? C(x.re, -x.im) : null;
    }
    case 'neg': {
      const x = evalComplex(e.e, env);
      return x ? C(-x.re, -x.im) : null;
    }
    case 'abs': {
      const x = evalComplex(e.e, env);
      return x ? C(Math.hypot(x.re, x.im), 0) : null;
    }
  }
}

/** A real-valued expression — a measure's right-hand side is a length, never a direction. */
export function evalReal(e: Expr, env: Env): number | null {
  const v = evalComplex(e, env);
  if (!v) return null;
  // an imaginary part here means the student wrote a complex expression where a magnitude belongs;
  // refusing to read it as a length is more honest than silently taking its modulus
  return Math.abs(v.im) < 1e-9 ? v.re : null;
}

const refsOfExpr = (e: Expr): string[] => {
  const out: string[] = [];
  const walk = (x: Expr): void => {
    switch (x.t) {
      case 'ref':
        out.push(x.name);
        return;
      case 'add':
      case 'sub':
      case 'mul':
      case 'div':
        walk(x.l);
        walk(x.r);
        return;
      case 'pow':
        walk(x.base);
        return;
      case 'conj':
      case 'neg':
      case 'abs':
        walk(x.e);
        return;
      default:
        return;
    }
  };
  walk(e);
  return out;
};

/**
 * A constraint tier 1 deferred, as residuals.
 *
 * An `eq` gives two — real and imaginary. A `mod` gives one, and says nothing about direction; an
 * `arg` gives one, and says nothing about magnitude. That asymmetry is the same one the model records
 * (`constraint.ts`): writing either as a full equation would invent the half the student did not
 * state, and it would be just as wrong numerically as it is exactly.
 */
export function deferredResidual(c: Constraint, i: number): ResidualSpec {
  const kind = c.kind ?? 'eq';
  return {
    key: `deferred-${i}`,
    describe: c.src ?? 'משוואה',
    strength: 'required',
    refs: [...refsOfExpr(c.lhs), ...refsOfExpr(c.rhs)],
    values: (env) => {
      const l = evalComplex(c.lhs, env);
      const r = evalComplex(c.rhs, env);
      if (!l || !r) return null;
      if (kind === 'mod') return [Math.hypot(l.re, l.im) - Math.hypot(r.re, r.im)];
      if (kind === 'arg') {
        const want = c.deltaTurns ? toNumber(c.deltaTurns) * 2 * Math.PI : 0;
        const got = Math.atan2(l.im, l.re) - Math.atan2(r.im, r.re);
        // wrapped to (−π, π]: two directions a whole turn apart are the same direction
        return [Math.atan2(Math.sin(got - want), Math.cos(got - want))];
      }
      return [l.re - r.re, l.im - r.im];
    },
  };
}

/** A stated measure, as one residual: what the figure measures, minus what the student said. */
export function measureResidual(m: MeasureRelation, i: number): ResidualSpec {
  return {
    key: `measure-${i}`,
    describe: m.src,
    strength: 'required',
    refs: [...m.points, ...refsOfExpr(m.rhs)],
    values: (env) => {
      const pts = m.points.map((n) => env.at(n));
      if (pts.some((p) => p === undefined)) return null;
      const got = measureOf(m.kind, pts as Cx[]);
      const want = evalReal(m.rhs, env);
      if (got === null || want === null) return null;
      return [got - want];
    },
  };
}
