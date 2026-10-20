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
import { curveParentOf, curveParentsOf, parentsOf } from './derived';
import { evalExpr, exprText, symbolsOf, type Env, type Expr } from './expr';
import { constraintRefs, dirRefs, freeDirectionSymbol } from './solve';
import { UNBOUNDED, circleDefPoints, type Construction, type Domain, type GeoObject, type Id, type NumCurve, type ParamDecl } from './types';
import { INDEXED_NAME_RE } from '../../shell/indexedName';
import { resolveCurve } from './curves';

/**
 * The plane's own coordinates. A curve is the zero set of `f(x, y; params)`, so `x` and `y` occur
 * in every equation and are bound by the evaluator, never sampled. Registering them as parameters
 * would make every circle a 2-DOF family of nothing.
 */
export const RESERVED_SYMBOLS: ReadonlySet<string> = new Set(['x', 'y']);

/**
 * A VALUE NEVER MENTIONS THE PLANE (#1496, ADR-AG-163).
 *
 * `x` and `y` are the plane's variables, so an expression that uses one is an EQUATION, never a length, an
 * area, a slope, an angle or a coordinate's value. Juxtaposition (`2ab`) makes every letter a symbol, and a
 * value slot that accepted `y` read «side AB is y=x-4» as the length equation `|AB|·i·s·y = x−4` — satisfied
 * by the free i and s, the stated line dropped, faults `[]`. The word test (#1068, #1321) cannot see it: after
 * the noun is stripped, «is» is two letters. This is the semantic test every value slot shares.
 */
export const mentionsPlane = (e: Expr): boolean => symbolsOf(e).some((s) => RESERVED_SYMBOLS.has(s));

const NO_CAPITALS: ReadonlySet<string> = new Set();

/**
 * A MEASURE'S VALUE NEVER NAMES A POINT (#1701, ADR-AG-238).
 *
 * A capital Latin letter is a point's shape in this tree («נקודה A1», «A1(1,2)»), and a lengths-or-angle value is
 * where 2-D's reference draws the line (its `VAR` is lowercase or Greek: *"points stay uppercase, so the two never
 * collide"*, ADR-031). Juxtaposition hides the collision: «∠CAB = A1» lexes as `A·1`, so before #1701 it recorded a
 * free parameter named `A` — a sentence about a point turned into a sentence about an invented parameter, built green.
 * 2-D escalates the same line, so a value that names a point is declined (`not-handled`), never read.
 *
 * `allow` carries the one capital 2-D admits as a SIZE: the radius `R` beside a length («AC = 1.6R», ADR-034). The
 * test is semantic, like `mentionsPlane`: `A1`, `2A`, `A·B` all reach a capital symbol. It is applied only to a
 * length's or an angle's value: an AREA's label is a capital in 2-D's grammar too («שטח ABC = S», «נסמן את שטח ABCD ב-S»),
 * and coordinates, slopes and equations are analytic's own families with no 2-D reference, so they are left as they read.
 */
export const mentionsPointName = (e: Expr, allow: ReadonlySet<string> = NO_CAPITALS): boolean =>
  symbolsOf(e).some((s) => /^[A-Z]$/.test(s) && !allow.has(s));
/**
 * THE ONE CAPITAL THAT NAMES A SIZE — the radius `R` (2-D's radius symbol, `LVAR`, ADR-034; operator ruling 2026-10-20 on
 * #2388, option b: *"it is very common to use R and r for radiuses of different circles so R can be an exception"*).
 * Every reader that takes a value or an equation asks this one set (#2388, ADR-AG-307): a length («AC = 1.6R»), an
 * equation («(x−13)²+y²=R²»), a radius («ורדיוסו R», «רדיוס המעגל O הוא R», «שרדיוסו R») and a relation («R = 2r»).
 * Every other capital stays a point's name (ADR-AG-163). An angle admits none. A point R beside the parameter R is the
 * clash `radius-letter-taken` (`apply.ts`).
 */
export const RADIUS_CAPITALS: ReadonlySet<string> = new Set(['R']);
/**
 * The same test on text the expression layer cannot read — «A₁», «A_1»: a capital standing alone (no letter beside
 * it), with an optional index. A reader uses it to decline rather than answer `bad-equation` about a point's name.
 */
export const POINT_TOKEN = /(?<![A-Za-z])[A-Z](?:[0-9₀-₉]+|_\{?\d+\}?)?(?![A-Za-z])/;
/**
 * AN INDEXED NAME — «S1», «a2», «α1», «m1», «A1», «S_1», «S_{1}», «S₁» (#1785, ADR-AG-244): one letter (Latin or Greek)
 * with an index, standing alone. The expression tokenizer refuses it (`expr.ts`, the index boundary) because the tool
 * has no indexed-name symbol and juxtaposition would read it as letter × index; a value reader that finds its source
 * unreadable tests this to DECLINE (`not-handled`, the LLM fallback's seam) instead of answering `bad-equation` about a
 * name the student spelled correctly. 2-D carries the same class (#1814), so the test now lives ONCE in
 * `shell/indexedName` (ADR-600, the third-copy rule): the shared atom also admits a capital Greek letter («Α1»), and
 * a Greek neighbour bounds the name like a Latin one.
 */
export const INDEXED_TOKEN = INDEXED_NAME_RE;

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
    // A circle COMPUTED from points (#1464, #1324): a closed form of points counted where they live.
    case 'circle-thru':
      return null;
    // A DRAWN ARC (#1622 E4): which part of a circle is inked — its circle and ends are counted where they live.
    case 'arc':
      return null;
    // A COMMON TANGENT (#2390, ADR-AG-314): a closed form of two circles, whose freedom is counted where it lives.
    case 'common-tangent':
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
      // Defined by reference alone (#1464): no expression, nothing to register. So is a drawn arc (#1622 E4).
      case 'circle-thru':
      case 'arc':
      case 'common-tangent': // its two circles, by reference (#2390)
        return [];
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
    // Its defining points — all placed before the circle can be computed (#1464).
    case 'circle-thru':
      return circleDefPoints(o.def);
    // Its circle and its ends — and the point it bulges away from (#1622 E4) — all placed before it is drawn.
    case 'arc':
      return [o.def.circle, o.def.from, o.def.to, ...[o.def.away, o.def.toward].filter((x): x is Id => x !== undefined)];
    // Its two circles, both placed before it is drawn (#2390, ADR-AG-314).
    case 'common-tangent':
      return [...o.circles];
    default: {
      const undeclared: never = o;
      throw new Error(`object kind declares no dependencies: ${JSON.stringify(undeclared)}`);
    }
  }
}

/**
 * NO FREEDOM REACHES THIS OBJECT (#1893, ADR-AG-271) — it is the same in every configuration, by its statement alone: no
 * carrier of its own ({@link carrierOf}), no parameter symbol ({@link symbolDeps}), and every object it is defined from
 * ({@link objectDeps}, a derived point's curve parents included) the same. «A(3,4)» and «x^2+y^2=25» are; a free
 * point, a circle with a free radius, a coordinate written with a parameter are not. Conservative by construction —
 * a free point the constraints happen to pin, or a parameter a later line fixes, answers `false`: the callers use it
 * to PROVE a coincidence, and a missed proof leaves today's verdict, never a false refusal.
 */
export function noFreedomReaches(c: Construction, id: Id, seen: Set<Id> = new Set()): boolean {
  if (seen.has(id)) return true;
  seen.add(id);
  const o = c.objects.find((q) => q.id === id);
  if (!o || carrierOf(o) !== null || symbolDeps(o).length > 0) return false;
  const deps = o.kind === 'derived' ? [...objectDeps(o), ...curveParentsOf(o.rule)] : objectDeps(o);
  return deps.every((d) => noFreedomReaches(c, d, seen));
}

/**
 * WHAT AN OBJECT IS BUILT FROM (#1963, ADR-AG-296) — every POINT it is transitively defined from (its {@link objectDeps},
 * a derived point's curve parents included, walked as {@link noFreedomReaches} walks them) and every parameter symbol
 * on that walk ({@link symbolDeps}, its own included). The object itself is not among `points`: a vacant one has no
 * position to read. The vacancy arm reads these at the solved configuration and asks their freedom
 * (`Figure.freedomOfRead`): `0` means nothing the object is made of can move, whatever moves elsewhere.
 */
export function inputsOf(c: Construction, id: Id): { points: Id[]; syms: string[] } {
  const points: Id[] = [];
  const syms = new Set<string>();
  const seen = new Set<Id>();
  const walk = (at: Id, root: boolean) => {
    if (seen.has(at)) return;
    seen.add(at);
    const o = c.objects.find((q) => q.id === at);
    if (!o) return;
    if (!root && (o.kind === 'point' || o.kind === 'free' || o.kind === 'derived')) points.push(at);
    for (const s of symbolDeps(o)) syms.add(s);
    for (const d of o.kind === 'derived' ? [...objectDeps(o), ...curveParentsOf(o.rule)] : objectDeps(o)) walk(d, false);
  };
  walk(id, true);
  return { points, syms: [...syms] };
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
  // A LETTER THAT STANDS FOR A SIZE IS POSITIVE (#2419, ADR-AG-323): the domain its role implies, read here, so the
  // sampler, the pin-root filter and the panel see one domain. In place, so the register's order (the sampler's salt)
  // is the one it always had.
  const roles = sizeLetters(c);
  if (roles.size === 0) return out;
  return out.map((p) => {
    const role = roles.get(p.sym);
    const domain = role ? sizeDomain(p.domain, role) : p.domain;
    return domain === p.domain ? p : { sym: p.sym, domain };
  });
}

/**
 * HOW A LETTER STANDS FOR A SIZE (#2419, ADR-AG-323; operator ruling 2026-10-20: *"r for radius like any letter
 * represending size needs to be positive"*).
 *
 * - `linear` — the letter, or a positive multiple of it, IS a size: a circle's radius given by its centre
 *   («שרדיוסו r», «שרדיוסו 2r»), a length, a distance, a perimeter or an area valued by it («AB = k», «AB = 2k»,
 *   «שטח המשולש ABC הוא k»). The size is positive, so the letter is; a declared domain with no positive value
 *   («a < 0» · «AB = a») is a contradiction the apply boundary refuses.
 * - `even` — the letter is a circle's radius written SQUARED in its equation («(x−a)²+y²=r²», «x²+y²=4r²»): the
 *   radius is a positive multiple of |t| and the centre does not move with t. The equation reads r² only, so a
 *   declared negative letter («a < 0» · «x²+y²=a²») contradicts nothing and keeps its stated domain.
 *
 * Not a size: a letter that also places the centre in the same equation («(x−a)²+y²=a²» — the centre moves with a),
 * a coordinate, a slope, an intercept, a ratio, an angle. Roles only ever grow as facts are added (a statement never
 * takes one away), so a domain this reads never reverts behind a student's back.
 *
 * Numeric, never symbolic (no CAS, ADR-AG-001 D1): a multiple is tested by evaluating the expression at three
 * values of the letter, the `impliedRange` device; an equation circle by resolving it at three values. Memoized on
 * the construction, which is immutable: the register is read many times per evaluation.
 */
export type SizeRole = 'linear' | 'even';
const sizeCache = new WeakMap<Construction, ReadonlyMap<string, SizeRole>>();

/** A probe value per symbol for the letters an equation holds besides the one under test. */
const SIZE_PROBES = [1.7, 2.3, 1.3, 0.7, 2.1, 1.9, 1.1, 2.7, 3.1, 0.9];

/** `e` is `m·sym` with m > 0, and mentions no other symbol. */
function positiveMultipleOf(e: Expr): string | null {
  const syms = symbolsOf(e).filter((s) => !RESERVED_SYMBOLS.has(s));
  if (syms.length !== 1 || isTermPlaceholder(syms[0])) return null;
  const sym = syms[0];
  const f = (t: number) => evalExpr(e, { [sym]: t });
  const m = f(1);
  if (!Number.isFinite(m) || m <= 1e-12 || Math.abs(f(0)) > 1e-12) return null;
  return Math.abs(f(2) - 2 * m) <= 1e-9 * Math.max(1, m) && Math.abs(f(-1.5) + 1.5 * m) <= 1e-9 * Math.max(1, m) ? sym : null;
}

const isTermPlaceholder = (s: string): boolean => s.length === 1 && s.charCodeAt(0) >= 0xe000 && s.charCodeAt(0) <= 0xf8ff;

/** A side of a length equation that is a positive MEASURE: a combination of measure terms, positive however long they are, and no parameter. */
function positiveMeasure(side: { expr: Expr; terms: readonly unknown[] }): boolean {
  if (side.terms.length === 0) return false;
  const syms = symbolsOf(side.expr);
  if (syms.some((s) => !isTermPlaceholder(s))) return false;
  return [
    [1, 1, 1, 1, 1, 1],
    [1, 2, 3, 0.5, 1.5, 2.5],
    [3, 0.5, 1, 2, 0.7, 1.1],
  ].every((lens) => {
    const env: Record<string, number> = {};
    for (const s of syms) env[s] = lens[(s.charCodeAt(0) - 0xe000) % lens.length];
    const v = evalExpr(side.expr, env);
    return Number.isFinite(v) && v > 0;
  });
}

/** The letter a circle EQUATION holds as its (squared) radius, with the centre independent of it — or none. */
function evenRadiusLetters(eq: Expr): string[] {
  const syms = symbolsOf(eq).filter((s) => !RESERVED_SYMBOLS.has(s));
  const out: string[] = [];
  for (const sym of syms) {
    const base: Record<string, number> = {};
    syms.forEach((s, i) => (base[s] = SIZE_PROBES[i % SIZE_PROBES.length]));
    const at = [1, 2, -1.5].map((t) => {
      const r = resolveCurve({ eq }, { ...base, [sym]: t });
      return r.ok && r.curve.kind === 'circle' ? { ...r.curve, t } : null;
    });
    if (at.some((q) => q === null)) continue;
    const [p, ...rest] = at as Array<{ cx: number; cy: number; r: number; t: number }>;
    const k = p.r / Math.abs(p.t);
    const close = (u: number, v: number) => Math.abs(u - v) <= 1e-9 * Math.max(1, Math.abs(u), Math.abs(v));
    if (k > 1e-12 && rest.every((q) => close(q.cx, p.cx) && close(q.cy, p.cy) && close(q.r, k * Math.abs(q.t)))) out.push(sym);
  }
  return out;
}

export function sizeLetters(c: Construction): ReadonlyMap<string, SizeRole> {
  const hit = sizeCache.get(c);
  if (hit) return hit;
  const out = new Map<string, SizeRole>();
  const linear = (sym: string | null) => {
    if (sym !== null) out.set(sym, 'linear');
  };
  for (const o of c.objects) {
    if (o.kind === 'circle-at') linear(positiveMultipleOf(o.r));
    else if (o.kind === 'curve' && symbolsOf(o.curve.eq).some((s) => !RESERVED_SYMBOLS.has(s)) && curveIsCircle(o.curve)) {
      for (const sym of evenRadiusLetters(o.curve.eq)) if (!out.has(sym)) out.set(sym, 'even');
    }
  }
  // A size valued by a letter — only a constraint that HOLDS (top level, or inside `all`); a `choice` option may not.
  const visit = (k: Construction['constraints'][number]): void => {
    if (k.t === 'all') k.of.forEach(visit);
    else if (k.t === 'area') linear(positiveMultipleOf(k.value));
    else if (k.t === 'length-eq') {
      for (const [m, v] of [
        [k.left, k.right],
        [k.right, k.left],
      ] as const) {
        if (v.terms.length === 0 && positiveMeasure(m)) linear(positiveMultipleOf(v.expr));
      }
    }
  };
  c.constraints.forEach(visit);
  for (const [sym] of out) if (sym.startsWith(RADIUS_PREFIX) || isDirectionSymbol(sym)) out.delete(sym); // the tool's own symbols carry their own domains
  sizeCache.set(c, out);
  return out;
}

/** Is the curve a circle at a probe environment (the kind does not turn on its parameters' values in any corpus form)? */
function curveIsCircle(curve: { eq: Expr; kind?: string }): boolean {
  if (curve.kind) return curve.kind === 'circle';
  const env: Record<string, number> = {};
  symbolsOf(curve.eq).forEach((s, i) => (env[s] = SIZE_PROBES[i % SIZE_PROBES.length]));
  const r = resolveCurve({ eq: curve.eq }, env);
  return r.ok && r.curve.kind === 'circle';
}

/** Every value of `d` is positive. */
export const impliesPositive = (d: Domain): boolean => d.min !== undefined && (d.min > 0 || (d.min === 0 && !!d.minOpen));

/** Does the domain hold no value at all? (An excluded point never empties an interval wider than a point.) */
export function emptyDomain(d: Domain): boolean {
  return d.min !== undefined && d.max !== undefined && (d.min > d.max || (d.min === d.max && (!!d.minOpen || !!d.maxOpen)));
}

/** `d ∩ (0, ∞)`. */
export function positivePart(d: Domain): Domain {
  if (impliesPositive(d)) return d;
  const above = d.min !== undefined && d.min > 0;
  return { ...d, min: above ? d.min : 0, minOpen: above ? d.minOpen : true };
}

/**
 * THE DOMAIN A SIZE ROLE GIVES A LETTER (#2419, ADR-AG-323) — its stated domain, intersected with (0, ∞).
 * An empty intersection keeps the stated domain: for `linear` the apply boundary has refused that statement already
 * ({@link sizeContradiction}); for `even` the squared radius contradicts nothing (a < 0 · x²+y²=a² is a circle of |a|).
 */
export function sizeDomain(stated: Domain, role: SizeRole | undefined): Domain {
  if (!role || impliesPositive(stated)) return stated;
  const d = positivePart(stated);
  return emptyDomain(d) ? stated : d;
}

/** The first letter whose SIZE role the stated domains contradict (`a < 0` beside `AB = a`), or null. */
export function sizeContradiction(c: Construction): string | null {
  const negative = c.params.filter((p) => !impliesPositive(p.domain) && emptyDomain(positivePart(p.domain)));
  if (negative.length === 0) return null; // the cheap test first: almost no figure declares a letter with no positive value
  const roles = sizeLetters(c);
  return negative.find((p) => roles.get(p.sym) === 'linear')?.sym ?? null;
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

/**
 * THE RANGE A SYMBOL'S USE IMPLIES, for SAMPLING only (#1621, ADR-AG-215).
 *
 * «∢ABC = α» names an angle by a symbol, and the angle it names is unsigned — 0° to 180° — so α can only ever
 * take a value inside that range. Sampled as an unbounded parameter it drew 1°–4° (`sampleParam`'s magnitude),
 * a sliver no student would recognise as their triangle, and «הציגו תצורה אחרת» could draw a negative angle
 * the solve then had to repair. A symbol that a stated angle holds LINEARLY (`α`, `2α`, `α + 10`) is sampled
 * inside the range that angle allows — in degrees 0°–180°, as a cosine −1 to 1 — so the free alias moves
 * across real triangles (ADR-052: free, and resampled with the seed).
 *
 * It is NOT a declaration and never reaches `paramRegister`: the register's domains filter a pin's roots and
 * print in the panel, and this range states nothing the student did not — every root of the angle given lies
 * inside it already. A tan value implies no range (every real is a tangent). Read off the constraints'
 * own expressions numerically (three evaluations test linearity), never by matching their shape — no CAS.
 */
export function impliedRange(c: Construction, sym: string): Domain {
  const out: Domain = {};
  for (const k of c.constraints) {
    if (k.t !== 'angle' || k.measure === 'tan') continue;
    const syms = symbolsOf(k.value);
    if (syms.length !== 1 || syms[0] !== sym) continue;
    const f = (t: number) => evalExpr(k.value, { [sym]: t });
    const b = f(0);
    const m = f(1) - b;
    if (!Number.isFinite(b) || !Number.isFinite(m) || Math.abs(m) < 1e-12 || Math.abs(f(2) - (b + 2 * m)) > 1e-9) continue;
    const [lo, hi] = k.measure === 'cos' ? [-1, 1] : [0, 180];
    const ends = [(lo - b) / m, (hi - b) / m].sort((p, q) => p - q);
    if (out.min === undefined || ends[0] > out.min) out.min = ends[0];
    if (out.max === undefined || ends[1] < out.max) out.max = ends[1];
  }
  if (out.min !== undefined) out.minOpen = true;
  if (out.max !== undefined) out.maxOpen = true;
  return out;
}

/** A stated domain narrowed by an implied range — the stated one alone when the two do not meet. */
export function narrowedDomain(stated: Domain, implied: Domain): Domain {
  const d: Domain = { ...stated };
  if (implied.min !== undefined && (d.min === undefined || implied.min > d.min)) {
    d.min = implied.min;
    d.minOpen = implied.minOpen;
  }
  if (implied.max !== undefined && (d.max === undefined || implied.max < d.max)) {
    d.max = implied.max;
    d.maxOpen = implied.maxOpen;
  }
  return d.min !== undefined && d.max !== undefined && d.min >= d.max ? stated : d;
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
/**
 * THE TOOL'S OWN FREE SYMBOLS (#1619 ruling b, ADR-AG-198) — the `θ_` family, of which the free line's direction
 * is one member. A circle a tangency sentence creates with its centre UNNAMED («AB ו-BC משיקים למעגל …» before
 * any circle) is an equation circle whose centre coordinates and radius are free symbols the student never wrote:
 * free DOF like a free vertex's coordinates, never a parameter row, and signed through the curve they shape.
 * Spelled under the same prefix so every surface that already keeps the free direction out of the givens' rows
 * keeps these out by the same test.
 */
export const toolSymbol = (objectId: Id, part: string): string => `θ_${objectId}.${part}`;
export const isDirectionSymbol = (sym: string): boolean => sym.startsWith('θ_');
/**
 * The object a SHAPE symbol shapes — `θ_<object>.<part>`, made by {@link toolSymbol} — or `null` for any other
 * symbol, a free line's direction (`θ_<line>`, no part) included. Used by the solve's created-shape fit (#1647).
 */
export const shapedObjectOf = (sym: string): Id | null => {
  if (!sym.startsWith('θ_')) return null;
  const dot = sym.lastIndexOf('.');
  return dot > 2 ? sym.slice(2, dot) : null;
};

/**
 * A CIRCLE'S FREE RADIUS, SPELLED FROM ITS CENTRE (#1059, #1667) — `r_O` for the circle a sentence creates on
 * the centre O («נתון מעגל שמרכזו O», «O מרכז המעגל», «מעגל O משיק לציר ה-x»). Named after the centre so it
 * needs no resolution against the figure and cannot collide with a student's own one-letter parameter.
 */
export const radiusSymbol = (centre: Id): string => `r_${centre}`;
const RADIUS_PREFIX = radiusSymbol('');

/**
 * EVERY MINTED RADIUS IS READ (#2382, ADR-AG-305) — the structural guard for "a circle's radius is created in one place
 * only". A {@link radiusSymbol} stands in the register only because a circle was created with it, so a declared `r_X`
 * that no object or constraint reads is a radius some lowering minted for a circle that already had one: the phantom
 * free DOF that blanked a fully stated figure (#1642's starved-sample rule) and let a tangency hold for a radius the
 * circle does not have. Lock-facing: asserted over the corpus, never consulted by production code.
 */
export function radiusSymbolsRead(c: Construction): boolean {
  const used = usedSymbols(c);
  return c.params.every((p) => !p.sym.startsWith(RADIUS_PREFIX) || used.has(p.sym));
}

/**
 * THE ONE OWNER OF EVERY SYMBOL SPELLED FROM AN ID (#1667, ADR-AG-205) — map the id a symbol is spelled from,
 * and leave every other symbol alone.
 *
 * Three families carry an id inside their name: a circle's radius {@link radiusSymbol} (`r_<centre>`), a free
 * line's direction {@link directionSymbol} (`θ_<line>`), and a created shape's parts {@link toolSymbol}
 * (`θ_<object>.<part>`). A letter change rewrites ids; a symbol that carries one must follow it in EVERY place
 * it occurs — a parameter declaration and an expression node alike — or the same figure reads as two (#1667:
 * `param r_P` was mapped and `{ sym r_P }` was not, so a centre could never be renamed). A symbol the student
 * wrote (`a`, `R`, `k`) is not an id, whatever letter it is, and is returned unchanged.
 */
export function relabelSymbol(sym: string, relabelId: (id: Id) => Id): string {
  if (sym.startsWith(RADIUS_PREFIX) && sym.length > RADIUS_PREFIX.length) return radiusSymbol(relabelId(sym.slice(RADIUS_PREFIX.length)));
  if (!isDirectionSymbol(sym)) return sym;
  const shaped = shapedObjectOf(sym);
  if (shaped !== null) return toolSymbol(relabelId(shaped), sym.slice(sym.lastIndexOf('.') + 1));
  return directionSymbol(relabelId(sym.slice(directionSymbol('').length)));
}

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
