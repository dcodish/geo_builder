/**
 * The expression AST, and the one structural question the whole engine turns on:
 * **is this expression MONOMIAL?**
 *
 * A monomial expression is built only from literals, references, multiplication, division, integer or
 * rational powers, conjugation, negation and `|·|` — **no addition**. That is not an arbitrary line: in
 * log-polar coordinates `(ln|z|, arg z)` every one of those operations is LINEAR, and addition is the
 * only one that is not, because there is no closed form for the modulus of a sum.
 *
 * So the classification decides which tier a constraint is solved in
 * ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006), and stages 1 and 3 of
 * [docs/LADDER-CX.md](../../docs/LADDER-CX.md)) — and it is a property of the syntax tree, computed
 * once, not a guess the solver makes per constraint. That is the whole difference from the prototype,
 * where every relation picked a target and iterated; #607 is what that costs.
 */

import type { Rat } from '../value/rational';

export type Expr =
  /** a real rational literal; the sign is carried here and becomes a half-turn in the log-polar form */
  | { readonly t: 'num'; readonly v: Rat }
  /** the imaginary unit */
  | { readonly t: 'i' }
  /** a named complex number — an unknown of the system */
  | { readonly t: 'ref'; readonly name: string }
  /** a named POSITIVE real parameter (`r`, `d`) — a modulus-only unknown */
  | { readonly t: 'param'; readonly name: string }
  | { readonly t: 'add'; readonly l: Expr; readonly r: Expr }
  | { readonly t: 'sub'; readonly l: Expr; readonly r: Expr }
  | { readonly t: 'mul'; readonly l: Expr; readonly r: Expr }
  | { readonly t: 'div'; readonly l: Expr; readonly r: Expr }
  /** `base^exp`; a rational exponent covers n-th roots as `1/n` */
  | { readonly t: 'pow'; readonly base: Expr; readonly exp: Rat }
  | { readonly t: 'conj'; readonly e: Expr }
  | { readonly t: 'neg'; readonly e: Expr }
  /** `|e|` — real and non-negative, so its argument is zero and its modulus is e's */
  | { readonly t: 'abs'; readonly e: Expr };

export const num = (v: Rat): Expr => ({ t: 'num', v });
export const I: Expr = { t: 'i' };
export const ref = (name: string): Expr => ({ t: 'ref', name });
export const param = (name: string): Expr => ({ t: 'param', name });
export const add = (l: Expr, r: Expr): Expr => ({ t: 'add', l, r });
export const sub = (l: Expr, r: Expr): Expr => ({ t: 'sub', l, r });
export const mul = (l: Expr, r: Expr): Expr => ({ t: 'mul', l, r });
export const div = (l: Expr, r: Expr): Expr => ({ t: 'div', l, r });
export const pow = (base: Expr, exp: Rat): Expr => ({ t: 'pow', base, exp });
export const conj = (e: Expr): Expr => ({ t: 'conj', e });
export const neg = (e: Expr): Expr => ({ t: 'neg', e });
export const abs = (e: Expr): Expr => ({ t: 'abs', e });

/**
 * Monomial ⇔ no `add` and no `sub` anywhere.
 *
 * `abs` is deliberately NOT disqualifying: `|z₁·z₂|` has modulus `|z₁||z₂|` and argument 0, both
 * linear. That is what makes the corpus's commonest given form — `|z₁| = 9r`, `2|z_A| = |z_M|` (F3) —
 * land in the exact tier rather than the numeric one. `|z₁ + z₂|` is excluded anyway, because the sum
 * inside it is not monomial.
 */
export function isMonomial(e: Expr): boolean {
  switch (e.t) {
    case 'num':
    case 'i':
    case 'ref':
    case 'param':
      return true;
    case 'add':
    case 'sub':
      return false;
    case 'mul':
    case 'div':
      return isMonomial(e.l) && isMonomial(e.r);
    case 'pow':
      return isMonomial(e.base);
    case 'conj':
    case 'neg':
    case 'abs':
      return isMonomial(e.e);
  }
}

/** Every `ref` name an expression mentions, in first-seen order. */
export function refsOf(e: Expr): string[] {
  const out: string[] = [];
  const walk = (x: Expr): void => {
    switch (x.t) {
      case 'ref':
        if (!out.includes(x.name)) out.push(x.name);
        return;
      case 'num':
      case 'i':
      case 'param':
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
    }
  };
  walk(e);
  return out;
}

/** Every real-parameter name an expression mentions, sorted. */
export function paramsOf(e: Expr): string[] {
  const out = new Set<string>();
  const walk = (x: Expr): void => {
    switch (x.t) {
      case 'param':
        out.add(x.name);
        return;
      case 'num':
      case 'i':
      case 'ref':
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
    }
  };
  walk(e);
  return [...out].sort();
}

/** Plain text, for refusal messages and traces. Not the student-facing formatter. */
export function format(e: Expr): string {
  switch (e.t) {
    case 'num':
      return e.v.d === 1n ? `${e.v.n}` : `${e.v.n}/${e.v.d}`;
    case 'i':
      return 'i';
    case 'ref':
    case 'param':
      return e.name;
    case 'add':
      return `(${format(e.l)} + ${format(e.r)})`;
    case 'sub':
      return `(${format(e.l)} - ${format(e.r)})`;
    case 'mul':
      return `${format(e.l)}·${format(e.r)}`;
    case 'div':
      return `${format(e.l)}/${format(e.r)}`;
    case 'pow':
      return `${format(e.base)}^${e.exp.d === 1n ? e.exp.n : `(${e.exp.n}/${e.exp.d})`}`;
    case 'conj':
      return `conj(${format(e.e)})`;
    case 'neg':
      return `-${format(e.e)}`;
    case 'abs':
      return `|${format(e.e)}|`;
  }
}
