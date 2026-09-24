/**
 * A real parameter's SIGN follows its USE — the one decision, taken in one place (#1387/#1406,
 * [ADR-CX-045](../../docs/06d-decisions-complex.md#adr-cx-045)).
 *
 * The operator's ruling (2026-09-24): *"param as a size if positive. this is not the case for
 * u^5=-32"*. So a real parameter is one of two things, and which one is read off how the student USES it:
 *
 *   - a **SIZE** — a positive real, as every parameter was before: a modulus (`|z1| = 9r`), anything
 *     inside `|…|`, a circle's radius, a measure's value (`אורך z1z2 = 15r`, `שטח … = 54r²`), or a
 *     scale factor multiplying a complex number in one product (`z2 = r·z1`);
 *   - **SIGN-FREE** — any real — in every other use: an additive term (`z1 = a + b·i`, `2 + r·i`), a
 *     power equated to a number (`u^5 = -32`), a number equal to it (`z1 = u`).
 *
 * **Mixed use is a size.** A parameter that stands as a size anywhere is positive everywhere: `|z1| = 9r`
 * beside `z2 = 2 + r·i` keeps `r > 0`, because the student's `9r` is a length and a negative length is not
 * a reading of it.
 *
 * The predicate is SEMANTIC and syntax-local: it reads each parameter occurrence's own context (inside
 * a magnitude? in one product with a complex number?), never solver state, so one statement means one
 * thing whatever else the figure holds (docs/17 §2.3). A ratio written the other way round,
 * `z2/z1 = r`, has no complex number in the parameter's own product and so reads sign-free: «the
 * quotient is real», which is what it says.
 */

import { type Expr } from './expr';
import type { Constraint } from './constraint';
import type { FigureObject } from './figure';
import type { MeasureRelation } from './measure';

/** Every parameter name, split by use. `signed` is what may be negative; `size` stays positive. */
export interface ParamSigns {
  readonly signed: ReadonlySet<string>;
  readonly size: ReadonlySet<string>;
}

/** The factors of one PRODUCT term, through `·`, `/`, powers, conjugation and negation. */
function factorsOf(e: Expr, out: Expr[]): void {
  switch (e.t) {
    case 'mul':
    case 'div':
      factorsOf(e.l, out);
      factorsOf(e.r, out);
      return;
    case 'pow':
      factorsOf(e.base, out);
      return;
    case 'conj':
    case 'neg':
      factorsOf(e.e, out);
      return;
    default:
      out.push(e);
  }
}

/**
 * Walk one expression, recording each parameter as a size or a sign-free use.
 *
 * `inSize` is true under a magnitude (`|…|`, a mod-kind row, a measure, a radius). Otherwise a product
 * term is examined as a whole: a parameter sharing a product with a complex REFERENCE is a scale factor
 * (a size); a parameter in a product with only numbers is sign-free.
 */
function walk(e: Expr, inSize: boolean, size: Set<string>, all: Set<string>): void {
  switch (e.t) {
    case 'param':
      all.add(e.name);
      if (inSize) size.add(e.name);
      return;
    case 'num':
    case 'val':
    case 'i':
    case 'ref':
      return;
    case 'abs':
      walk(e.e, true, size, all);
      return;
    case 'add':
    case 'sub':
      walk(e.l, inSize, size, all);
      walk(e.r, inSize, size, all);
      return;
    case 'mul':
    case 'div':
    case 'pow':
    case 'conj':
    case 'neg': {
      const factors: Expr[] = [];
      factorsOf(e, factors);
      const scalesANumber = factors.some((f) => f.t === 'ref');
      for (const f of factors) walk(f, inSize || (scalesANumber && f.t === 'param'), size, all);
      return;
    }
  }
}

/** Which parameters are sizes and which are sign-free, over everything the figure states. */
export function paramSigns(input: {
  readonly constraints: readonly Constraint[];
  readonly objects?: readonly FigureObject[];
  readonly measures?: readonly MeasureRelation[];
}): ParamSigns {
  const size = new Set<string>();
  const all = new Set<string>();
  for (const c of input.constraints) {
    // a magnitude row (`|z1| = 9r`) is a statement about sizes on both sides
    const sized = (c.kind ?? 'eq') === 'mod';
    walk(c.lhs, sized, size, all);
    walk(c.rhs, sized, size, all);
  }
  for (const o of input.objects ?? []) if (o.kind === 'circle') walk(o.radius, true, size, all);
  for (const m of input.measures ?? []) walk(m.rhs, true, size, all);
  const signed = new Set([...all].filter((p) => !size.has(p)));
  return { signed, size };
}
