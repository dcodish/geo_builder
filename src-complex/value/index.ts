/**
 * The exact value layer — slice S1 (#618) of the foundation rebuild (#616).
 *
 * Imports nothing outside this directory, by design: it is the bottom of `value ← model ← solve ←
 * replay ← store`, and the layer everything else is expressed in. See
 * [ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006) for why the carriers are what they are,
 * and [docs/LADDER-CX.md](../../docs/LADDER-CX.md) for where they are consumed.
 */

export * as Rational from './rational';
export * as Modulus from './modulus';
export * as Angle from './angle';

export type { Rat } from './rational';
export type { ExpVec } from './modulus';
export type { Angle as AngleValue } from './angle';
export type { Cx, Exact, Value, CartesianLiteral } from './value';

export {
  ZERO_VALUE,
  ONE_VALUE,
  abs,
  cAbs,
  cAdd,
  cArgDeg,
  cConj,
  cDiv,
  cMul,
  cNeg,
  cPolar,
  cSub,
  conj,
  cx,
  div,
  evaluate,
  exact,
  fmtNum,
  formatCartesian,
  formatPolar,
  fromCartesian,
  isDetermined,
  isExact,
  isZeroValue,
  mul,
  neg,
  nthRoot,
  nthRoots,
  numeric,
  pow,
  provablyEqual,
  symbolsOf,
} from './value';
