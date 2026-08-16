/**
 * REPLAY (v2) — the ordered fact list folded into a figure, through the tier-1 solver.
 *
 * Same discipline as every sibling: **the fact list is the source of truth and the figure is derived**,
 * so positions are never stored and undo cannot desync. What is new is what sits in the middle — the
 * exact linear solve ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006)) instead of per-fact
 * iteration, which is why the systems in #607's family reach a figure at all.
 *
 * ## The bridge, and why it is deliberately throwaway
 *
 * The v2 engine has no parser yet — that is S4 (#621), and it must be built with span accounting and
 * the lexicon from its first rule ([ADR-CX-009](../../docs/06d-decisions-complex.md#adr-cx-009)).
 * Writing a second parser here to get something on screen sooner would be exactly the shortcut that
 * plan forbids. So this module instead **reads the prototype parser's own facts** and translates them,
 * which lets the new engine be played through the existing input box today and leaves nothing to
 * un-learn later: `bridgeFacts` is deleted whole when S4 lands, and the solver below is untouched.
 *
 * A form the bridge cannot translate is REPORTED, never silently skipped — an untranslated fact would
 * otherwise vanish from a figure that still looked plausible, which is the silent-drop class the
 * siblings paid for 33 times over.
 */

import type { Cx } from '../value/value';
import { cPolar, evaluate, exact, formatPolar, fromCartesian } from '../value/value';
import { type Rat, fromNumber, rat, toNumber } from '../value/rational';
import { type ExpVec, evaluate as evalMod, format as fmtMod } from '../value/modulus';
import { type Angle, toDegrees } from '../value/angle';
import { type Expr, abs, conj, div, mul, neg, num, param, pow, ref, val } from '../model/expr';
import { type Branch, isTurnUnknown, solveTier1 } from '../solve/tier1';
import { filterBranches, quadrant } from '../solve/filter';
import type { BranchFilter, Constraint } from '../model/constraint';

// The prototype's fact/expression types — the ONLY import from the retiring engine, and the whole
// surface the deletion in S4 has to touch.
import type { Expr as ProtoExpr, Fact as ProtoFact } from '../engine/model';

/** A fact the bridge could not translate, with the reason — surfaced, never swallowed. */
export interface Untranslated {
  readonly factId: string;
  readonly src: string;
  readonly why: string;
}

export interface BridgeResult {
  readonly constraints: Constraint[];
  readonly filters: BranchFilter[];
  /** free numbers: named, unconstrained, two degrees of freedom each */
  readonly freeNames: string[];
  /** angle atoms a cartesian literal introduced, with the degrees they stand for */
  readonly sample: Map<string, number>;
  readonly untranslated: Untranslated[];
}

const asRat = (x: number): Rat | null => fromNumber(x, 10_000, 1e-9);

/**
 * The numeric value of a REF-FREE subtree, or null if it mentions a number the student named.
 *
 * This exists because `3+4i` reaches the bridge as an ADDITION — the prototype parses the cartesian
 * form structurally — and a naive "no addition ⇒ monomial" test would push every cartesian literal to
 * the numeric tier. But a constant expression is a *literal* whatever its syntax: `3+4i` is one number
 * with modulus exactly 5. Folding constants before classifying is what keeps the syntax of a literal
 * from deciding whether the engine can be exact about it.
 */
function literalValue(e: ProtoExpr): Cx | null {
  switch (e.t) {
    case 'lit':
      return e.v;
    case 'bin': {
      const l = literalValue(e.l);
      const r = literalValue(e.r);
      if (!l || !r) return null;
      switch (e.op) {
        case '+':
          return { re: l.re + r.re, im: l.im + r.im };
        case '-':
          return { re: l.re - r.re, im: l.im - r.im };
        case '*':
          return { re: l.re * r.re - l.im * r.im, im: l.re * r.im + l.im * r.re };
        case '/': {
          const d = r.re * r.re + r.im * r.im;
          if (d === 0) return null;
          return { re: (l.re * r.re + l.im * r.im) / d, im: (l.im * r.re - l.re * r.im) / d };
        }
      }
      return null;
    }
    case 'neg': {
      const x = literalValue(e.e);
      return x ? { re: -x.re, im: -x.im } : null;
    }
    case 'conj': {
      const x = literalValue(e.e);
      return x ? { re: x.re, im: -x.im } : null;
    }
    case 'abs': {
      const x = literalValue(e.e);
      return x ? { re: Math.hypot(x.re, x.im), im: 0 } : null;
    }
    case 'pow': {
      const x = literalValue(e.base);
      if (!x || !Number.isInteger(e.exp) || e.exp < 0) return null;
      let acc = { re: 1, im: 0 };
      for (let i = 0; i < e.exp; i++) acc = { re: acc.re * x.re - acc.im * x.im, im: acc.re * x.im + acc.im * x.re };
      return acc;
    }
    default:
      return null;
  }
}

/** A prototype expression → a v2 expression, or null when it has no exact reading. */
function bridgeExpr(e: ProtoExpr, sample: Map<string, number>, label: string): Expr | null {
  // constants first, whatever their syntax — see literalValue
  const konst = literalValue(e);
  if (konst) {
    const re = asRat(konst.re);
    const im = asRat(konst.im);
    if (re === null || im === null) return null;
    const lit = fromCartesian(re, im, label);
    if (lit.atomBinding) sample.set(lit.atomBinding.atom, lit.atomBinding.degrees);
    return val(lit.value);
  }

  switch (e.t) {
    case 'lit':
      return null; // unreachable: a literal is always constant, and was folded above
    case 'ref':
      return ref(e.name);
    case 'bin': {
      const l = bridgeExpr(e.l, sample, label);
      const r = bridgeExpr(e.r, sample, label);
      if (!l || !r) return null;
      return e.op === '*' ? mul(l, r) : e.op === '/' ? div(l, r) : null; // + and − are not monomial
    }
    case 'pow': {
      const b = bridgeExpr(e.base, sample, label);
      return b ? pow(b, rat(e.exp)) : null;
    }
    case 'neg': {
      const x = bridgeExpr(e.e, sample, label);
      return x ? neg(x) : null;
    }
    case 'conj': {
      const x = bridgeExpr(e.e, sample, label);
      return x ? conj(x) : null;
    }
    case 'abs': {
      const x = bridgeExpr(e.e, sample, label);
      return x ? abs(x) : null;
    }
    default:
      return null; // re/im are additive projections — the numeric tier's business
  }
}

/** Prototype facts → the tier-1 inputs. Anything untranslatable is listed, not dropped. */
export function bridgeFacts(facts: readonly ProtoFact[]): BridgeResult {
  const constraints: Constraint[] = [];
  const filters: BranchFilter[] = [];
  const freeNames: string[] = [];
  const sample = new Map<string, number>();
  const untranslated: Untranslated[] = [];

  const give = (f: ProtoFact, why: string): void => {
    untranslated.push({ factId: f.id, src: f.src, why });
  };

  for (const f of facts) {
    switch (f.kind) {
      case 'free':
        freeNames.push(f.name);
        break;
      case 'def': {
        const rhs = bridgeExpr(f.expr, sample, f.name);
        if (!rhs) give(f, 'the definition is not multiplicative — it belongs to the numeric tier');
        else constraints.push({ lhs: ref(f.name), rhs, src: f.src });
        break;
      }
      case 'roots': {
        const rhs = bridgeExpr(f.rhs, sample, f.varName);
        if (!rhs) give(f, 'the equation’s right-hand side is not multiplicative');
        else constraints.push({ lhs: pow(ref(f.varName), rat(f.n)), rhs, src: f.src });
        break;
      }
      case 'eq': {
        const lhs = bridgeExpr(f.lhs, sample, 'eq');
        const rhs = bridgeExpr(f.rhs, sample, 'eq');
        if (!lhs || !rhs) give(f, 'the equation is not multiplicative on both sides');
        else constraints.push({ lhs, rhs, src: f.src });
        break;
      }
      case 'rel': {
        const r = f.rel;
        if (r.type === 'quad') {
          filters.push(quadrant(r.name, r.q));
        } else if (r.type === 'mod') {
          const k = asRat(r.k);
          if (k === null) {
            give(f, 'the magnitude factor has no exact reading');
            break;
          }
          const rhs = r.other
            ? mul(num(k), abs(ref(r.other)))
            : r.param
              ? mul(num(k), param(r.param))
              : num(k);
          if (r.cmp && r.cmp !== '=') give(f, 'a modulus INEQUALITY is a numeric-tier bound, not a linear row');
          else constraints.push({ kind: 'mod', lhs: abs(ref(r.name)), rhs, src: f.src });
        } else {
          // Σ sign·arg(name) = rhsDeg. Two signed terms is the corpus form (F4).
          const plus = r.terms.filter((t) => t.sign === 1);
          const minus = r.terms.filter((t) => t.sign === -1);
          const delta = asRat(r.rhsDeg / 360);
          if (r.cmp && r.cmp !== '=') {
            filters.push(
              r.cmp === '<' || r.cmp === '<='
                ? { kind: 'range', name: r.terms[0]?.name ?? '', maxDeg: rat(Math.round(r.rhsDeg)) }
                : { kind: 'range', name: r.terms[0]?.name ?? '', minDeg: rat(Math.round(r.rhsDeg)) },
            );
          } else if (delta === null || plus.length !== 1 || minus.length > 1) {
            give(f, 'only one-or-two-term argument equations are linearised so far');
          } else {
            constraints.push({
              kind: 'arg',
              lhs: ref(plus[0].name),
              rhs: minus.length ? ref(minus[0].name) : num(rat(1)),
              deltaTurns: delta,
              src: f.src,
            });
          }
        }
        break;
      }
      default:
        give(f, `“${f.kind}” has no v2 form yet`);
    }
  }

  return { constraints, filters, freeNames, sample, untranslated };
}

// ---------------------------------------------------------------------------

export interface DerivedPoint {
  readonly name: string;
  readonly z: Cx;
  readonly modulus: string;
  readonly argumentDeg: number;
  /** the exact polar text, when the whole value is carried exactly */
  readonly exactLabel: string | null;
  /** the givens FORCE this magnitude — otherwise it is one sample of many (ADR-052) */
  readonly modulusKnown: boolean;
  /** the givens FORCE this direction */
  readonly argumentKnown: boolean;
}

export interface Derived2 {
  /** null when the givens contradict each other, with which system found it */
  readonly contradiction: null | 'modulus' | 'argument';
  readonly points: DerivedPoint[];
  /** how many valid configurations the givens leave — what "show another" cycles */
  readonly configCount: number;
  readonly configIndex: number;
  /** the still-open degrees of freedom, named the way the cue shows them */
  readonly freeDof: readonly string[];
  readonly untranslated: readonly Untranslated[];
  /** constraints routed to the numeric tier, which does not exist yet — listed, never hidden */
  readonly deferred: readonly Constraint[];
  /** the filter that emptied the configuration set, when one did */
  readonly emptiedBy: BranchFilter | null;
}

/** A deterministic positive sample for a parameter the student never valued (ADR-052: a START, not a fixed value). */
const paramSample = (name: string, seed: number): number => {
  let h = 2166136261;
  for (const ch of `${name}@${seed}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return 0.6 + ((h >>> 0) % 181) / 100;
};

/**
 * Fold the facts into a figure.
 *
 * `configIndex` selects among the enumerated branches — this is what "show another configuration"
 * advances, and because the branches come out of the integer turn-unknowns it is the exam's
 * «כל האפשרויות» rather than a separate feature.
 */
export function derive2(facts: readonly ProtoFact[], configIndex = 0, seed = 0): Derived2 {
  const bridged = bridgeFacts(facts);
  return foldConstraints(
    bridged.constraints,
    bridged.filters,
    bridged.freeNames,
    bridged.sample,
    bridged.untranslated,
    configIndex,
    seed,
  );
}

/**
 * The one derivation both entry points share.
 *
 * Extracted rather than duplicated: two folds that must agree are two folds that will drift, and the
 * sibling trees paid for that repeatedly (ADR-346's mirror class). The bridge and the v2 parser differ only
 * in how they PRODUCE constraints; what happens to them afterwards is identical.
 */
export function foldConstraints(
  constraints: readonly Constraint[],
  filterList: readonly BranchFilter[],
  declaredNames: readonly string[],
  literalSample: ReadonlyMap<string, number>,
  untranslated: readonly Untranslated[],
  configIndex: number,
  seed: number,
): Derived2 {
  const t1 = solveTier1(constraints);

  const sample = new Map(literalSample);
  for (const c of constraints) {
    for (const p of collectParams(c)) if (!sample.has(p)) sample.set(p, paramSample(p, seed));
  }

  const { kept, emptiedBy } = filterBranches(t1.branches, filterList, sample);
  const configCount = kept.length;
  const index = configCount ? ((configIndex % configCount) + configCount) % configCount : 0;
  const branch: Branch | undefined = kept[index];

  /**
   * SAMPLE THE FREE DEGREES OF FREEDOM, then draw everything.
   *
   * The first version plotted only numbers whose magnitude the givens forced, and so drew NOTHING for
   * any partially-specified figure — which is every figure while the student is still typing. That
   * conflated two different rules. «Do not print an unknown value as knowledge» is right and is kept,
   * at the LABEL. «Do not draw it» is wrong: the standing product rule is *always visualise*
   * ([ADR-CX-001](../../docs/06d-decisions-complex.md#adr-cx-001) D3), and
   * [ADR-052](../../docs/06-decisions.md#adr-052) permits a default as a **starting** value precisely
   * so the figure can exist — provided it moves when the configuration changes, which it does, because
   * the sample is keyed on the seed that "show another configuration" advances.
   */
  /**
   * THE ANGULAR WINDOW a filter leaves open for a FREE direction.
   *
   * An inequality prunes enumerated branches — but a direction the givens never pin is not a branch,
   * it is a sampled degree of freedom, and pruning cannot reach it. «z1 ברביע הראשון» on its own is
   * exactly that case, and it drew z1 on the +Re axis: a point on an axis is in NO quadrant, so the
   * figure contradicted its own given while every check passed, because nothing had asked the sample
   * to respect the filter.
   *
   * So a filter does two jobs, not one: it PRUNES the configurations the equations produced, and it
   * BOUNDS the sampling of what they left free. Both are the same statement about the same direction.
   */
  const windows = new Map<string, { min: number; max: number }>();
  const narrow = (name: string, min: number, max: number): void => {
    const prev = windows.get(name);
    windows.set(name, { min: Math.max(prev?.min ?? -Infinity, min), max: Math.min(prev?.max ?? Infinity, max) });
  };
  for (const f of filterList) {
    if (f.kind === 'quadrant') narrow(f.name, (f.q - 1) * 90, f.q * 90);
    else if (f.kind === 'range') {
      if (f.minDeg) narrow(f.name, Number(f.minDeg.n) / Number(f.minDeg.d), Infinity);
      if (f.maxDeg) narrow(f.name, -Infinity, Number(f.maxDeg.n) / Number(f.maxDeg.d));
    } else narrow(f.name, Number(f.deg.n) / Number(f.deg.d), Number(f.deg.n) / Number(f.deg.d));
  }

  /**
   * Sample a free direction, STRICTLY inside its window when it has one.
   *
   * Strictly, because a quadrant is an open region: 0° and 90° are on the axes and belong to neither
   * neighbour. The 0.12–0.88 inset also keeps the drawn point clear of the boundary, so a student can
   * see which quadrant it is in rather than having to judge a point sitting on a ray.
   */
  const sampleArgDeg = (name: string): number => {
    const t = (paramSample(`arg ${name}`, seed) - 0.6) / 1.8; // 0 .. 1, deterministic per seed
    const w = windows.get(name);
    if (!w || !Number.isFinite(w.min) || !Number.isFinite(w.max)) {
      const lo = Number.isFinite(w?.min ?? NaN) ? w!.min : 0;
      const hi = Number.isFinite(w?.max ?? NaN) ? w!.max : 360;
      return lo + (0.12 + 0.76 * t) * (hi - lo);
    }
    return w.min + (0.12 + 0.76 * t) * (w.max - w.min);
  };

  const sampleModulus = (name: string): number => 0.8 + paramSample(`|${name}|`, seed);

  const freeMod = new Map<string, number>();
  for (const n of t1.modulus.free) freeMod.set(n, sampleModulus(n));
  const freeArg = new Map<string, number>();
  for (const n of t1.argument.free) if (!isTurnUnknown(n)) freeArg.set(n, sampleArgDeg(n));

  const modulusOf = (name: string): { value: number; exact: ExpVec | null } => {
    const d = t1.modulus.determined.get(name);
    if (!d) return { value: freeMod.get(name) ?? sampleModulus(name), exact: null };
    const base = evalMod(d.konst, sample);
    if (base === null) return { value: sampleModulus(name), exact: null };
    let v = base;
    for (const [fn, c] of d.coefs) v *= Math.pow(freeMod.get(fn) ?? 1, toNumber(c));
    return { value: v, exact: d.coefs.size === 0 ? d.konst : null };
  };

  const argumentOf = (name: string): { deg: number; exact: Angle | null } => {
    const fixed = branch?.angles.get(name);
    if (fixed) {
      const deg = toDegrees(fixed, sample);
      if (deg !== null) return { deg, exact: fixed };
    }
    const d = t1.argument.determined.get(name);
    if (!d) return { deg: freeArg.get(name) ?? sampleArgDeg(name), exact: null };
    let deg = toDegrees(d.konst, sample);
    if (deg === null) return { deg: sampleArgDeg(name), exact: null };
    for (const [fn, c] of d.coefs) {
      const turn = branch?.k.get(fn);
      deg += toNumber(c) * (isTurnUnknown(fn) ? Number(turn ?? 0n) * 360 : (freeArg.get(fn) ?? 0));
    }
    return { deg, exact: null };
  };

  const points: DerivedPoint[] = [];
  if (!t1.inconsistent) {
    // the union: names the constraints mention PLUS bare declarations, so a number the student merely
    // named is still on the canvas (always-visualise) rather than waiting for a constraint to earn it
    for (const name of [...new Set([...t1.names, ...declaredNames])]) {
      const m = modulusOf(name);
      const a = argumentOf(name);
      if (!Number.isFinite(m.value) || !Number.isFinite(a.deg)) continue;
      points.push({
        name,
        z: cPolar(m.value, a.deg),
        modulus: m.exact ? fmtMod(m.exact) : round2(m.value),
        argumentDeg: a.deg,
        exactLabel: m.exact && a.exact ? exactLabelOf(m.exact, a.exact) : null,
        modulusKnown: m.exact !== null,
        argumentKnown: a.exact !== null,
      });
    }
  }
  points.sort((a, b) => a.name.localeCompare(b.name));

  return {
    contradiction: t1.inconsistent,
    points,
    configCount,
    configIndex: index,
    freeDof: t1.freeDof,
    untranslated,
    deferred: t1.deferred,
    emptiedBy,
  };
}

const round2 = (x: number): string => `${Math.round(x * 100) / 100}`;

const exactLabelOf = (mod: ExpVec, arg: Angle): string | null => {
  const v = exact(mod, arg);
  return evaluate(v) ? formatPolar(v) : null;
};

function collectParams(c: Constraint): string[] {
  const out: string[] = [];
  const walk = (e: Expr): void => {
    switch (e.t) {
      case 'param':
        out.push(e.name);
        return;
      case 'mul':
      case 'div':
      case 'add':
      case 'sub':
        walk(e.l);
        walk(e.r);
        return;
      case 'pow':
        walk(e.base);
        return;
      case 'conj':
      case 'neg':
      case 'abs':
        walk(e.e);
        return;
      default:
        return;
    }
  };
  walk(c.lhs);
  walk(c.rhs);
  return out;
}


