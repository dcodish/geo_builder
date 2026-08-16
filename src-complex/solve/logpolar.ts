/**
 * LINEARISATION — a monomial expression becomes a linear form in `(ln|z|, arg z)`.
 *
 * This is the step that makes the whole engine work
 * ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006)). Write `u_z = ln|z|` and
 * `t_z = arg z`; then
 *
 *     z·w      -> (u_z + u_w,  t_z + t_w)          product becomes a SUM
 *     z^k      -> (k·u_z,      k·t_z)              power becomes a SCALE
 *     conj z   -> (u_z,       -t_z)                conjugation becomes a reflection
 *     |z|      -> (u_z,        0)                  modulus drops the angle
 *     -z       -> (u_z,        t_z + ½ turn)       the sign is half a turn
 *
 * so every monomial equation is two LINEAR equations: one over the moduli with an exponent-vector
 * constant, one over the arguments with an angle constant and an integer `2π` unknown. The corpus's
 * chained systems — the ones the prototype's per-fact sweeps could not reach (#607) — are then solved
 * by elimination rather than iteration.
 *
 * The form is deliberately SEPARATE from `Value`: a `Value` is a known number, this is a linear
 * expression over unknowns. Conflating them is how a solver ends up evaluating when it should be
 * eliminating.
 */

import type { Expr } from '../model/expr';
import { type Rat, ZERO, add as ratAdd, isZero as ratIsZero, mul as ratMul, neg as ratNeg, rat, cmp } from '../value/rational';
import {
  type ExpVec,
  div as modDiv,
  fromParam,
  fromRational,
  mul as modMul,
  one as modOne,
  pow as modPow,
} from '../value/modulus';
import {
  type Angle,
  add as angAdd,
  fromTurns,
  neg as angNeg,
  scale as angScale,
  sub as angSub,
  zero as angZero,
} from '../value/angle';

/**
 * `ln|expr| = Σ uCoef[n]·u_n + ln(uConst)` and `arg expr = Σ tCoef[n]·t_n + tConst`.
 * The unknowns are the `ref` names; parameters and literals live in the constants.
 */
export interface LogPolarForm {
  readonly uCoef: ReadonlyMap<string, Rat>;
  readonly uConst: ExpVec;
  readonly tCoef: ReadonlyMap<string, Rat>;
  readonly tConst: Angle;
}

const EMPTY: LogPolarForm = { uCoef: new Map(), uConst: modOne(), tCoef: new Map(), tConst: angZero() };

const combine = (a: ReadonlyMap<string, Rat>, b: ReadonlyMap<string, Rat>, k: Rat): Map<string, Rat> => {
  const out = new Map(a);
  for (const [n, v] of b) {
    const next = ratAdd(out.get(n) ?? ZERO, ratMul(v, k));
    if (ratIsZero(next)) out.delete(n);
    else out.set(n, next);
  }
  return out;
};

const scaleCoef = (a: ReadonlyMap<string, Rat>, k: Rat): Map<string, Rat> => {
  const out = new Map<string, Rat>();
  for (const [n, v] of a) {
    const next = ratMul(v, k);
    if (!ratIsZero(next)) out.set(n, next);
  }
  return out;
};

/**
 * The linear form of a monomial expression, or null when it is not monomial (an addition anywhere) or
 * cannot be carried at all (a literal zero, which has no logarithm).
 *
 * Returning null rather than throwing is the point: "this constraint belongs to the numeric tier" is a
 * routing answer, not an error, and the caller at stage 1 of the ladder is the one that knows which.
 */
export function linearize(e: Expr): LogPolarForm | null {
  switch (e.t) {
    case 'num': {
      if (ratIsZero(e.v)) return null; // ln 0 is undefined — zero is stage 3's problem
      const negative = cmp(e.v, ZERO) < 0;
      return {
        ...EMPTY,
        uConst: fromRational(negative ? ratNeg(e.v) : e.v),
        tConst: negative ? fromTurns(rat(1, 2)) : angZero(),
      };
    }
    case 'i':
      return { ...EMPTY, tConst: fromTurns(rat(1, 4)) };
    case 'ref':
      return {
        uCoef: new Map([[e.name, rat(1)]]),
        uConst: modOne(),
        tCoef: new Map([[e.name, rat(1)]]),
        tConst: angZero(),
      };
    case 'param':
      // A real parameter in monomial position is POSITIVE: it reaches here through a modulus or a
      // scale factor, both of which the exam states as magnitudes (`|z1| = 9r`, `d > 0`). A parameter
      // that could be negative appears inside an additive expression, which is not monomial anyway.
      return { ...EMPTY, uConst: fromParam(e.name) };
    case 'mul': {
      const l = linearize(e.l);
      const r = linearize(e.r);
      if (!l || !r) return null;
      return {
        uCoef: combine(l.uCoef, r.uCoef, rat(1)),
        uConst: modMul(l.uConst, r.uConst),
        tCoef: combine(l.tCoef, r.tCoef, rat(1)),
        tConst: angAdd(l.tConst, r.tConst),
      };
    }
    case 'div': {
      const l = linearize(e.l);
      const r = linearize(e.r);
      if (!l || !r) return null;
      return {
        uCoef: combine(l.uCoef, r.uCoef, rat(-1)),
        uConst: modDiv(l.uConst, r.uConst),
        tCoef: combine(l.tCoef, r.tCoef, rat(-1)),
        tConst: angSub(l.tConst, r.tConst),
      };
    }
    case 'pow': {
      const b = linearize(e.base);
      if (!b) return null;
      return {
        uCoef: scaleCoef(b.uCoef, e.exp),
        uConst: modPow(b.uConst, e.exp),
        tCoef: scaleCoef(b.tCoef, e.exp),
        tConst: angScale(b.tConst, e.exp),
      };
    }
    case 'conj': {
      const x = linearize(e.e);
      if (!x) return null;
      return { ...x, tCoef: scaleCoef(x.tCoef, rat(-1)), tConst: angNeg(x.tConst) };
    }
    case 'neg': {
      const x = linearize(e.e);
      if (!x) return null;
      return { ...x, tConst: angAdd(x.tConst, fromTurns(rat(1, 2))) };
    }
    case 'abs': {
      const x = linearize(e.e);
      if (!x) return null;
      return { uCoef: x.uCoef, uConst: x.uConst, tCoef: new Map(), tConst: angZero() };
    }
    case 'add':
    case 'sub':
      return null; // the one genuinely non-linear case, and the reason tier 3 exists
  }
}

/** `lhs − rhs` on the modulus side: coefficients over the unknowns, constant on the right. */
export const modulusRow = (lhs: LogPolarForm, rhs: LogPolarForm): { coef: Map<string, Rat>; rhs: ExpVec } => ({
  coef: combine(lhs.uCoef, rhs.uCoef, rat(-1)),
  rhs: modDiv(rhs.uConst, lhs.uConst),
});

/** `lhs − rhs` on the argument side; the caller adds the integer turn unknown. */
export const argumentRow = (lhs: LogPolarForm, rhs: LogPolarForm): { coef: Map<string, Rat>; rhs: Angle } => ({
  coef: combine(lhs.tCoef, rhs.tCoef, rat(-1)),
  rhs: angSub(rhs.tConst, lhs.tConst),
});
