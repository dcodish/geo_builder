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
 * **On the topological sort, updated by #1028.** B1 deferred one because every object was *stated*
 * and the object→object relation was empty. Derived points made it non-empty — and it turned out a
 * sort is still the wrong shape. `apply` refuses a statement referencing an object that does not
 * exist yet, so a parent is always already in the list when its dependent is appended: **declaration
 * order is provably a valid evaluation order and a cycle is unreachable.** The invariant is therefore
 * *asserted* ({@link depsPrecedeDependents}) rather than re-established by a sort that could never
 * find anything out of place. If a future kind can forward-reference, that is the moment a real sort
 * is earned — and this function is what will fail first and say so.
 */
import { curveParentOf, parentsOf } from './derived';
import { evalExpr, exprText, symbolsOf, type Env } from './expr';
import { constraintRefs, dirRefs, freeDirectionSymbol } from './solve';
import { UNBOUNDED, type Construction, type GeoObject, type Id, type NumCurve, type ParamDecl } from './types';

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
    // A DERIVED point is 0-DOF by construction: given its parents there is exactly one answer. Its
    // freedom is entirely inherited — a midpoint of two parametric points moves because THEY move,
    // and that freedom is already counted once, at the parents.
    case 'derived':
      return null;
    // THE kind this family was declared for (#1017): a named but unplaced point. Two degrees of
    // freedom, its own — not inherited from a parameter, which is what distinguishes it from the
    // hand-written `C(t, 4t-9)` workaround where the unknown is figure-wide.
    case 'free':
      return { family: 'free', dof: 2 };
    // Segments and polygons carry no freedom of their own: they are drawn FROM their endpoints, and
    // a polygon's unplaced vertices are `free` objects in their own right, counted once, there.
    case 'segment':
    case 'polygon':
      return null;
    // A circle ON a point (#1060): its freedom is its centre’s and its radius parameter’s, both
    // already counted where they live. The object itself adds none.
    case 'circle-at':
    // A line through a point with a COPIED direction (#1093), for the same reason and more simply:
    // the point's freedom is the point's, and the direction is read off an object the figure already
    // determines. A construction that adds freedom would be asserting something nobody stated.
    case 'line-at':
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
      // These three carry no expressions at all — they are defined by REFERENCE to other objects,
      // so their dependency on the environment is whatever their parents' is, and registering it
      // again here would double-count the one unknown.
      case 'derived':
      case 'segment':
      case 'polygon':
      case 'free':
        return [];
      // Its RADIUS is an expression, and that is the one thing it contributes to the register.
      case 'circle-at':
        return symbolsOf(o.r);
      // A copied direction carries no expression at all — nothing to register (#1093). A FREE one
      // (#1319) is a direction parameter, and registering it here is exactly what makes it a free DOF
      // the sampler moves and the solve can pin — the #1014 rule, applied to a symbol no equation holds.
      case 'line-at': {
        const sym = freeDirectionSymbol(o.dir);
        return sym === null ? [] : [sym];
      }
      default: {
        const unwalked: never = o;
        throw new Error(`object kind declares no symbol dependencies: ${JSON.stringify(unwalked)}`);
      }
    }
  })();
  return raw.filter((s) => !RESERVED_SYMBOLS.has(s));
}

/**
 * The ids an object is defined in terms of — the object→object edges of the dependency graph.
 *
 * **Non-empty since #1028**, which is what turned this from a declaration into a working relation.
 * A stated point or curve depends on nothing; a derived point depends on its rule's parents, and a
 * segment or polygon on its endpoints.
 *
 * The invariant that makes evaluation correct is asserted rather than sorted for — see
 * {@link depsPrecedeDependents} and the module docblock.
 */
export function objectDeps(o: GeoObject): Id[] {
  switch (o.kind) {
    case 'point':
      return [];
    case 'curve':
      return [];
    case 'free':
      return [];
    case 'derived':
      return parentsOf(o.rule);
    case 'segment':
      return [o.a, o.b];
    case 'polygon':
      return [...o.vertices];
    case 'circle-at':
      return [o.centre];
    // The point it passes through, AND whatever its direction is read from — both must be placed
    // before this line can be drawn (#1093).
    case 'line-at':
      return [o.through, ...dirRefs(o.dir)];
    default: {
      const undeclared: never = o;
      throw new Error(`object kind declares no dependencies: ${JSON.stringify(undeclared)}`);
    }
  }
}

/**
 * Does every object's dependencies precede it in the list?
 *
 * This is the property a topological sort would otherwise have to establish, and it holds **by
 * construction**: `apply` refuses a statement that references an object which does not exist yet, so
 * a parent is always already in the list when its dependent is appended, and a cycle is
 * unreachable. Declaration order is therefore provably a valid evaluation order.
 *
 * Exported so the suite can assert it rather than trust it. The honest alternative — building a sort
 * over a relation that cannot be out of order — would be code no test could exercise, which is the
 * same "passes by checking nothing" failure the B1 slice avoided by not building one at all.
 */
export function depsPrecedeDependents(c: Construction): boolean {
  const seen = new Set<Id>();
  for (const o of c.objects) {
    if (objectDeps(o).some((d) => !seen.has(d))) return false;
    seen.add(o.id);
  }
  return true;
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
  /**
   * …AND EVERY SYMBOL A CONSTRAINT HOLDS (#1343, found by its lock). «שטח המשולש ABC הוא k» carries `k` in
   * a constraint's value and nowhere else; read from the objects alone, `k` was never registered, never
   * sampled, evaluated to NaN, and the area given was silently unjudged — #1014's defect, one layer over.
   * Registered, it is a free DOF the solve vector can pin (ADR-AG-144): the area gives k = 9.
   */
  for (const sym of constraintSymbols(c.constraints)) {
    if (seen.has(sym)) continue;
    seen.add(sym);
    out.push({ sym, domain: UNBOUNDED });
  }
  return out;
}

/**
 * THE SYMBOLS THE FIGURE USES — by an object's expressions OR by a constraint's (#1343, amending ADR-AG-144).
 *
 * `symbolDeps` walks objects, and that is the right register for SAMPLING: a symbol an equation holds is
 * a free DOF. It is the wrong test for "does anything in this figure depend on this symbol": «שטח המשולש
 * ABC הוא k» holds `k` in a CONSTRAINT's value, and a `k` the area pins must not read as unused. The
 * constraint walk is structural — every `{ kind: 'sym' }` node anywhere in the constraint, the shape
 * `mentionsAny` uses — so a constraint kind added later is covered without a per-kind list.
 *
 * A symbol NOTHING uses («m<0» typed for a slope) is a declaration the figure never reads: never sampled
 * into anything drawn, never pinned, and therefore never KNOWLEDGE — a value the panel may not print.
 */
/** Every symbol a constraint's expressions mention — a structural walk over `{ kind: 'sym' }` nodes. */
export function constraintSymbols(constraints: Construction['constraints']): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    const node = v as Record<string, unknown>;
    if (node.kind === 'sym' && typeof node.name === 'string') {
      // A length expression binds its TERMS to private-use placeholder symbols (lengths.ts
      // `PLACEHOLDER_BASE`, U+E000…); they are positions in a term list, not parameters.
      const placeholder = node.name.length === 1 && node.name.charCodeAt(0) >= 0xe000 && node.name.charCodeAt(0) <= 0xf8ff;
      if (!placeholder && !RESERVED_SYMBOLS.has(node.name) && !out.includes(node.name)) out.push(node.name);
      return;
    }
    Object.values(node).forEach(walk);
  };
  walk(constraints);
  return out;
}

export function usedSymbols(c: Construction): Set<string> {
  const out = new Set<string>();
  for (const o of c.objects) for (const s of symbolDeps(o)) out.add(s);
  for (const s of constraintSymbols(c.constraints)) out.add(s);
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

/**
 * The freedom the STUDENT should be told about — carriers after the constraints have consumed what
 * they consume, plus the symbolic parameters.
 *
 * `dofCount` is the raw count and stays, because the sampler and the tests want it. This is the one
 * the cue reads: a figure whose four unknowns are pinned by four givens must report **0**, or the
 * determinacy signal ([02c R22](../../docs/02c-requirements-analytic.md)) says the opposite of the
 * truth at exactly the moment it matters most.
 */
export function reportedDof(_c: Construction, carrierDof: number): number {
  /**
   * PARAMETERS ARE INSIDE `carrierDof` NOW (#1317, ADR-AG-144).
   *
   * This used to add the register's length to the carriers' residual freedom, because the solve never
   * moved a parameter: a pinned `k` still counted as one degree of freedom, and the cue said «1» about a
   * figure the givens had fully determined. The solve vector holds every unknown — free vertices AND
   * parameters — so `evaluate` reports the freedom left over ALL of them, rank-aware, and a parameter
   * that a given pins is subtracted exactly as a coordinate is. Kept as the one call every surface
   * makes, so the definition of "how free is this figure" has one home.
   */
  return carrierDof;
}

/**
 * THE DIRECTION PARAMETER OF A FREE LINE (#1319, ADR-AG-144) — how its symbol is spelled, and how the
 * panel tells one from a symbol the student wrote.
 *
 * It is a free DOF like a free vertex's coordinates: counted in the cue, moved by «הציגו תצורה אחרת»,
 * solved when a given pins it. Like those coordinates it is NOT a parameter row — the student never
 * wrote `θ`, and listing a symbol the tool made up would be an invented name in the givens' own
 * neighbourhood (#1263's concern). The line's own row shows its equation once the direction is
 * knowledge, and an open row until then.
 */
export const directionSymbol = (lineId: Id): string => `θ_${lineId}`;
export const isDirectionSymbol = (sym: string): boolean => sym.startsWith('θ_');

// ---------------------------------------------------------------------------
// PROVENANCE — what the student's own givens say about one point (#1032)
// ---------------------------------------------------------------------------

/**
 * What a single coordinate of a point is, **according to the givens that name that point alone**.
 *
 * Deliberately NOT the honesty gate. In image 7 #6 the joint solve determines `B = (2,0)` exactly, so
 * `isKnowledge` calls both coordinates knowledge — and the operator's ruling (2026-09-15) is that
 * `B(2,0)` is the **answer**, which belongs in the data panel, while the **canvas** shows the
 * question: `B(x_B, 0)`, because «על ציר ה-x» pins the `y` and nothing pins the `x`.
 *
 * So this asks a different question from `isKnowledge`, and the difference is provenance versus
 * determinacy. A constraint naming several points — «שטח המשולש ABC הוא 20» — pins nothing about any
 * one of them on its own, which is why `C` shows only its name even though the figure fixes it.
 */
export type Component =
  /** The givens fix it to a number. */
  | { known: true; value: number }
  /**
   * The givens leave it open — shown as `x_B`, unless the student WROTE an expression for it.
   *
   * `expr` carries that expression's text (#1230). «A(-9a,0)» is not known — `a` is free, and printing
   * a sampled number would invent a given — but `-9·a` is what the student stated, and the canvas may
   * not replace it with `x_A`, a symbol the tool made up. #1226 fixed this for the data panel and
   * scoped the canvas out on the mistaken belief that the canvas showed the name alone; it does not.
   *
   * It states no VALUE, so the honesty invariant is untouched: it names the dependency, which is more
   * than `x_A` said and less than a number (#1023's wording, for the third surface now).
   */
  | { known: false; expr?: string };

export interface PointProvenance {
  x: Component;
  y: Component;
}

/**
 * Read one point's own givens. `null` when the point is not a positional object at all.
 *
 * `env` is needed because a stated coordinate may carry a parameter (`A(-9a, 0)`); such a coordinate
 * is NOT known here, which keeps the canvas from printing a sampled number — the honesty invariant
 * still binds, separately from provenance.
 */
export function provenanceOf(
  c: Construction,
  id: Id,
  env: Env,
  /**
   * The curves as this configuration DREW them — needed only for the one derived rule whose parent
   * is a curve (see below). Absent = that rule reports its coordinates open, which is what every
   * caller without a figure in hand should see.
   */
  curves: ReadonlyArray<{ id: Id; curve: NumCurve }> = [],
): PointProvenance | null {
  const o = c.objects.find((q) => q.id === id);
  if (!o) return null;

  if (o.kind === 'point') {
    // Its own expressions ARE its givens. A parametric one stays open.
    const read = (e: Parameters<typeof evalExpr>[0]): Component => {
      const v = evalExpr(e, env);
      return Number.isFinite(v) && symbolsOf(e).every((s) => RESERVED_SYMBOLS.has(s))
        ? { known: true, value: v }
        // Open, but the student wrote it — carry the text so the canvas need not invent `x_A` (#1230).
        : { known: false, expr: exprText(e) };
    };
    return { x: read(o.x), y: read(o.y) };
  }

  if (o.kind !== 'free' && o.kind !== 'derived') return null;

  /**
   * A derived point's provenance is its PARENTS' provenance (#1089).
   *
   * For every rule with POINT parents that means open: a centroid over three free vertices gets its
   * position from the solve, and printing a number there would assert a given the question never
   * gave (ADR-052). `circle-centre` is the one rule whose parent is a CURVE — `derived.ts` keeps
   * that apart already (`parentsOf` reports none for it, {@link curveParentOf} answers instead) —
   * and a curve the student wrote out in full is READ, not solved: «נתון מעגל O שמשוואתו
   * (x-3)^2+(y-5)^2=25» fixes O as plainly as «O(3,5)» does.
   *
   * Operator, 2026-09-16 (T36): *"the O should show the values"*. Before this, `provenanceOf` said
   * O was unknown while `knownCurve` printed the same circle's centre — two honesty gates
   * contradicting each other about one fact, which #1086 exposed by removing the centre mark's
   * label.
   *
   * The test is the same one a stated point's own coordinates take, and it is deliberately
   * SYNTACTIC: `knownCurve` runs `evaluate` over three seeds, and this function is called FROM
   * `evaluate`. A parametric circle stays open, so no sampled number reaches the canvas.
   */
  if (o.kind === 'derived') {
    const open: PointProvenance = { x: { known: false }, y: { known: false } };
    const parent = curveParentOf(o.rule);
    if (parent === null) return open;
    const def = c.objects.find((q) => q.id === parent);
    if (!def || def.kind !== 'curve') return open;
    if (!symbolsOf(def.curve.eq).every((sym) => RESERVED_SYMBOLS.has(sym))) return open;
    const drawn = curves.find((q) => q.id === parent)?.curve;
    if (!drawn || drawn.kind !== 'circle') return open;
    return { x: { known: true, value: drawn.cx }, y: { known: true, value: drawn.cy } };
  }

  const out: PointProvenance = { x: { known: false }, y: { known: false } };
  for (const k of c.constraints) {
    // LOCAL only: a constraint that also names other points says nothing about this one alone.
    const refs = constraintRefs(k);
    if (refs.length !== 1 || refs[0] !== id) continue;

    if (k.t === 'coord') {
      if (k.x !== undefined) out.x = { known: true, value: evalExpr(k.x, env) };
      if (k.y !== undefined) out.y = { known: true, value: evalExpr(k.y, env) };
    } else if (k.t === 'on-line') {
      // An axis-parallel line pins exactly one coordinate; a slanted one pins neither on its own.
      // `-c/b` yields -0 for the axes themselves; -0 is not a different number and must not
      // enter the model, where a deep comparison would call it one.
      const norm = (v: number) => (Object.is(v, -0) ? 0 : v);
      if (Math.abs(k.a) < 1e-12 && Math.abs(k.b) > 1e-12) out.y = { known: true, value: norm(-k.c / k.b) };
      else if (Math.abs(k.b) < 1e-12 && Math.abs(k.a) > 1e-12) out.x = { known: true, value: norm(-k.c / k.a) };
    }
  }
  return out;
}
