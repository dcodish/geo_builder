/**
 * The degree-of-freedom contract — the single source of truth for "what in this construction is
 * still free, and how free" ([ADR-AG-009](../../docs/06c-decisions-analytic.md#adr-ag-009) B1).
 *
 * It exists for two reasons, and the second is the one that will matter later.
 *
 * **1 — The register of free DOFs is DERIVED FROM THE CONSTRUCTION, never from declarations.**
 * Before this module, `sampleEnv` built the environment from the F11 parameter *declarations*
 * alone, so a symbol that occurred only inside an equation — `y²=2ax` with no «a הוא פרמטר», which
 * is a catalog entry and a corpus phrasing — was never registered, never sampled, evaluated to
 * `NaN`, and the curve reached the honest "not at this parameter value" path by accident: it drew
 * nothing and **said nothing** (#1014). That inverted the rule the product is built on: an
 * unstated magnitude is a **free DOF**, never a fixed default and never a silent absence
 * ([ADR-052](../../docs/06-decisions.md#adr-052)), and a stated given may never vanish. So a
 * declaration **narrows** a parameter here; it does not create one.
 *
 * **2 — A new object kind must DECLARE ITS FREEDOM, or it will not compile.** `carrierOf` and
 * `symbolDeps` are exhaustive switches over {@link GeoObject}. The 2-D tree learned this the
 * expensive way: the same kind-sets were hand-listed across ~7 sites, and a kind added to the
 * union but forgotten in one of them was a *silent dropped DOF* rather than a type error
 * ([src/engine/carriers.ts](../../src/engine/carriers.ts), ADR-043). The pattern is copied — never
 * imported ([BOUNDARIES.json](../../BOUNDARIES.json)) — before the vocabulary grows, which is the
 * only moment it is cheap.
 *
 * **What is deliberately NOT here: a topological sort.** Every object in this slice is *stated*,
 * so the object→object dependency relation is empty, and a sort over an empty relation is
 * structure that no test can exercise — it would pass by checking nothing. What IS real today is
 * the object→parameter layer below: every parameter is assigned before any object evaluates, and
 * every figure exercises it. {@link symbolDeps} is that relation, and it is the seam the ordering
 * grows from when B3 lands the first *derived* object.
 */
import { symbolsOf } from './expr';
import { UNBOUNDED, type Construction, type GeoObject, type Id, type ParamDecl } from './types';

/**
 * The plane's own coordinates. A curve is the zero set of `f(x, y; params)`, so `x` and `y` occur
 * in every equation and are bound by the evaluator, never sampled. Registering them as parameters
 * would make every circle a 2-DOF family of nothing.
 */
export const RESERVED_SYMBOLS: ReadonlySet<string> = new Set(['x', 'y']);

/**
 * The kind of freedom an object carries *itself* — as opposed to the freedom it inherits from the
 * parameters in its expressions.
 *
 * Empty of members that any object claims today, and that is the honest state: in this slice every
 * object is fully stated, so all figure freedom lives in the parameter register. The families are
 * named now because they are what the next slices add — a point free on a curve (1), an unanchored
 * vertex (2) — and because naming them is what makes `carrierOf` a decision rather than a stub.
 */
export type CarrierFamily = 'free' | 'on-curve';

export interface Carrier {
  family: CarrierFamily;
  /** Raw movable DOF before any constraint consumes it: an unanchored point 2, on-a-curve 1. */
  dof: 1 | 2;
}

/**
 * The carrier classification of an object, or `null` when it carries no freedom of its own.
 *
 * EXHAUSTIVE over {@link GeoObject}: a new kind without a case here is a compile error, which is
 * the whole point of the module. Answer `null` only when the kind is genuinely determined by its
 * own definition — never because the freedom has not been thought about yet.
 */
export function carrierOf(o: GeoObject): Carrier | null {
  switch (o.kind) {
    // A STATED point: its coordinates are expressions. Any freedom it has is the freedom of the
    // parameters inside them, which the register already counts — counting it twice would report
    // two DOFs for the one unknown in `A(-9a, 0)`.
    case 'point':
      return null;
    // A STATED curve: likewise, an equation whose coefficients may carry parameters.
    case 'curve':
      return null;
    default: {
      const unclassified: never = o;
      throw new Error(`object kind carries no DOF classification: ${JSON.stringify(unclassified)}`);
    }
  }
}

/**
 * Every parameter symbol an object's definition mentions — its dependency on the environment.
 *
 * EXHAUSTIVE for the same reason as {@link carrierOf}: an object kind whose expressions are not
 * walked here contributes symbols that are never registered, which is exactly the #1014 defect
 * coming back under a new name.
 */
export function symbolDeps(o: GeoObject): string[] {
  const raw = ((): string[] => {
    switch (o.kind) {
      case 'point':
        return [...symbolsOf(o.x), ...symbolsOf(o.y)];
      case 'curve':
        return symbolsOf(o.curve.eq);
      default: {
        const unwalked: never = o;
        throw new Error(`object kind declares no symbol dependencies: ${JSON.stringify(unwalked)}`);
      }
    }
  })();
  return raw.filter((s) => !RESERVED_SYMBOLS.has(s));
}

/**
 * The ids an object is defined in terms of — the object→object edges a topological evaluation
 * would order.
 *
 * Empty for every kind in this slice, because every object is stated rather than derived, and that
 * is precisely why no sort is built on it yet (see the module docblock). It is exhaustive so that
 * the first derived kind must say what it depends on.
 */
export function objectDeps(o: GeoObject): Id[] {
  switch (o.kind) {
    case 'point':
      return [];
    case 'curve':
      return [];
    default: {
      const undeclared: never = o;
      throw new Error(`object kind declares no dependencies: ${JSON.stringify(undeclared)}`);
    }
  }
}

/**
 * THE REGISTER — every free parameter of the figure, with the domain that applies to it.
 *
 * Union of two sources, and the order of precedence is the ruling:
 *  - every symbol **used** by any object (`symbolDeps`) — this is what makes an unstated magnitude
 *    a free DOF rather than a silent absence;
 *  - every symbol **declared** by an F11 line, whose domain NARROWS it, and which is kept even when
 *    nothing uses it yet, so «k הוא פרמטר» on its own still reports the freedom the student stated.
 *
 * Declaration order first (the student's own order), then first use — so the panel reads the way
 * the question was typed, and the sampler's salt is stable for a given construction.
 */
export function paramRegister(c: Construction): ParamDecl[] {
  const out: ParamDecl[] = [];
  const seen = new Set<string>();
  for (const p of c.params) {
    if (seen.has(p.sym)) continue;
    seen.add(p.sym);
    out.push(p);
  }
  for (const o of c.objects) {
    for (const sym of symbolDeps(o)) {
      if (seen.has(sym)) continue;
      seen.add(sym);
      // Used but never declared: free, and unbounded until the student says otherwise.
      out.push({ sym, domain: UNBOUNDED });
    }
  }
  return out;
}

/**
 * How free the figure still is, for the DOF cue (02c P4 — "an under-determined figure is drawn,
 * and its openness is visible"). Parameters plus whatever the objects carry themselves.
 */
export function dofCount(c: Construction): number {
  let n = paramRegister(c).length;
  for (const o of c.objects) n += carrierOf(o)?.dof ?? 0;
  return n;
}
