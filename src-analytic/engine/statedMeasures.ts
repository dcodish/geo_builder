/**
 * THE STATED-MEASURE LAYER (#1714, ADR-AG-225) — what the student SAID about a length, an angle, an area or
 * an arc, read off the construction so the canvas can write it on the figure.
 *
 * Operator, playing round #1709 T5: *"when an angle or segment are given, we need to put those values on the
 * segment or angle like the 2d tool does"*. Analytic's canvas carried one stated label — a segment pinned by a
 * NUMBER (#1065) — and nothing for an angle, a right angle, a symbolic length, an equality, an arc or an area.
 * 2-D has the whole layer (`src/replay/core.ts` `MeasureLabels` + `angleMarkFor`, ADR-031/ADR-118/ADR-335).
 *
 * **The canvas shows the QUESTION, the panel the ANSWER** ([ADR-AG-016](../../docs/06c-decisions-analytic.md#adr-ag-016),
 * [ADR-W-047](../../docs/06w-decisions-workspace.md#adr-w-047)). So this reads only what a STATEMENT asserted,
 * never a value the solve produced:
 *
 * - a **length** against a value («AB = 5», «AB = 3a»), an **angle** against a value («∢ABC = 30», «∢ABC = α»,
 *   «tan∢BAO = 2»), an **area** («שטח המשולש ABC הוא 13»), an **arc** («⌢AC = 60°»);
 * - a **right angle** stated at a vertex («זווית ABC ישרה», «AB ⊥ BC», «∢ABC = 90») — a knee, never «90°»;
 * - an **equality** of two lengths or two angles («AB = AC», «∢ABC = ∢ACB») — hatch ticks or arcs.
 *
 * **A noun's own givens are its DEFINITION, not a statement** (2-D's rule: «מלבן ABCD» draws no knees, «מעוין»
 * no ticks). The one exception is 2-D's too: a noun's unstated CHOICE — «משולש ישר-זווית ABC» does not say which
 * angle is right — is shown as the configuration resolved it, because the drawn seat is otherwise invisible and
 * «הציגו תצורה אחרת» moves it. `origin` tells the two apart: the parser marks what it built as a definition
 * (`Fact.definition`), and the fold says which fact added each constraint (`constraintFact`).
 *
 * **The value is the student's**: a number prints as a number, a letter as the letter. A letter the student later
 * VALUED («∢ABC = α» · «α = 30») prints the value, which is 2-D's default (ADR-W-047 — measured: 2-D shows «30°»).
 * A trig given prints the ANGLE it fixes, in degrees (operator ruling on #1718/#1719: «63.43°», never «tan=2»).
 * Formatting stays a DISPLAY concern: this hands the renderer a number or a text, never a rounded string.
 */
import { exprText, evalExpr, symbolsOf, type Env, type Expr } from './expr';
import { isTermPlaceholder, type LengthExpr } from './lengths';
import { resolveChoices, type Constraint, type Direction } from './solve';
import type { Construction, Id } from './types';

/** A stated value, as the renderer should write it: a NUMBER the givens fix, or the student's own TEXT. */
export type StatedValue = { num: number } | { text: string };

export interface StatedMeasures {
  /** «AB = 5», «AB = 3a» — written at the segment's midpoint. */
  lengths: Array<{ a: Id; b: Id; value: StatedValue }>;
  /** «∢ABC = 30» — an arc at `v` between the rays to `a` and `b`, with the value; `num` is in DEGREES. */
  angles: Array<{ v: Id; a: Id; b: Id; value: StatedValue }>;
  /** A stated right angle at `v` — the knee. */
  rights: Array<{ v: Id; a: Id; b: Id }>;
  /** «שטח המשולש ABC הוא 13» — written at the ring's centroid. */
  areas: Array<{ ids: Id[]; value: StatedValue }>;
  /** «⌢AC = 60°» — written ON the arc of `circle` between `a` and `b` (2-D's ADR-335: never a wedge at the centre). */
  arcs: Array<{ circle: Id; a: Id; b: Id; value: StatedValue }>;
  /** «AB = AC» — `count` ticks per member, one count per equality class (1, 2, …). */
  equalLengths: Array<{ a: Id; b: Id; count: number }>;
  /** «∢ABC = ∢ACB» — `count` arcs per member, one count per equality class. */
  equalAngles: Array<{ v: Id; a: Id; b: Id; count: number }>;
}

export const NO_STATED_MEASURES: StatedMeasures = {
  lengths: [],
  angles: [],
  rights: [],
  areas: [],
  arcs: [],
  equalLengths: [],
  equalAngles: [],
};

/** Where a constraint came from: a sentence that STATED it, or the DEFINITION of a noun or correspondence (`Fact.definition`). */
export type ConstraintOrigin = 'statement' | 'definition';

/**
 * The student's notation for a stated value: `3a`, not the printer's `3·a` — the exam multiplies by
 * JUXTAPOSITION (`2a`, `4√5`), and the label is their own text. Everything else is the shared printer.
 */
export function statedText(e: Expr): string {
  if (e.kind === 'mul' && e.a.kind === 'num' && (e.b.kind === 'sym' || e.b.kind === 'sqrt')) return `${exprText(e.a)}${statedText(e.b)}`;
  return exprText(e);
}

/**
 * The values the givens FIX for a symbol — «α = 30» — to a fixpoint, so «b = 2a» · «a = 3» fixes both. Only a
 * value with no free symbol left counts: a letter valued in terms of another free letter is still a letter.
 */
function valuedSymbols(ks: readonly Constraint[]): Env {
  const env: Record<string, number> = {};
  for (let pass = 0; pass < ks.length + 1; pass += 1) {
    let grew = false;
    for (const k of ks) {
      if (k.t !== 'param-eq' || k.sym.name in env) continue;
      if (!symbolsOf(k.value).every((s) => s in env)) continue;
      const v = evalExpr(k.value, env);
      if (!Number.isFinite(v)) continue;
      env[k.sym.name] = v;
      grew = true;
    }
    if (!grew) break;
  }
  return env;
}

/** A plain single length term with coefficient 1 — «AB» — or null. */
function plainLength(e: LengthExpr): { a: Id; b: Id } | null {
  if (e.terms.length !== 1 || e.expr.kind !== 'sym' || !isTermPlaceholder(e.expr.name)) return null;
  const t = e.terms[0];
  return t.kind === undefined || t.kind === 'length' ? { a: t.a, b: t.b } : null;
}

/** A side with NO length term — the value side of «AB = 5». */
const isValueSide = (e: LengthExpr): boolean => e.terms.length === 0 && !symbolsOf(e.expr).some(isTermPlaceholder);

/** The shared vertex and the two other ends of `ab ⊥ cd` when the two pairs meet at one point, else null. */
function kneeOf(u: Direction, v: Direction): { v: Id; a: Id; b: Id } | null {
  if (u.k !== 'points' || v.k !== 'points') return null;
  const shared = [u.a, u.b].filter((x) => x === v.a || x === v.b);
  if (shared.length !== 1) return null;
  const at = shared[0];
  return { v: at, a: u.a === at ? u.b : u.a, b: v.a === at ? v.b : v.a };
}

const segKey = (a: Id, b: Id): string => [a, b].sort().join('|');
const angKey = (v: Id, a: Id, b: Id): string => `${v}:${[a, b].sort().join('|')}`;

/**
 * Read the stated measures off a construction. `origin(at)` is the source of constraint `at`; `choiceSeed` is the
 * seed this configuration's discrete choices were resolved at (`Figure.choiceSeed`), so a resolved noun choice is
 * shown where the figure actually built it.
 */
export function statedMeasures(
  c: Construction,
  origin: (at: number) => ConstraintOrigin | undefined,
  choiceSeed: number,
): StatedMeasures {
  const env = valuedSymbols(c.constraints);
  /** The student's value: a number when nothing in it is free, else their own text. */
  const valueOf = (e: Expr, toNum: (v: number) => number = (v) => v): StatedValue => {
    if (symbolsOf(e).every((s) => s in env)) {
      const v = toNum(evalExpr(e, env));
      if (Number.isFinite(v)) return { num: v };
    }
    return { text: statedText(e) };
  };

  const out: StatedMeasures = { lengths: [], angles: [], rights: [], areas: [], arcs: [], equalLengths: [], equalAngles: [] };
  const lengthPairs: Array<[{ a: Id; b: Id }, { a: Id; b: Id }]> = [];
  const anglePairs: Array<[{ v: Id; a: Id; b: Id }, { v: Id; a: Id; b: Id }]> = [];
  /**
   * ONE value per measure. A length or angle stated twice («AB = 3a» · «AB = 6») is written once: a NUMBER beats a
   * letter (the later number is what the letter now is), otherwise the later statement wins — 2-D's `lenByKey.set`.
   */
  const lenAt = new Map<string, StatedMeasures['lengths'][number]>();
  const angAt = new Map<string, StatedMeasures['angles'][number]>();
  const keep = <T extends { value: StatedValue }>(at: Map<string, T>, key: string, next: T): void => {
    const prev = at.get(key);
    if (prev && 'num' in prev.value && !('num' in next.value)) return;
    at.set(key, next);
  };
  const seenRight = new Set<string>();

  const read = (k: Constraint): void => {
    switch (k.t) {
      case 'length-eq': {
        const l = plainLength(k.left);
        const r = plainLength(k.right);
        if (l && r) lengthPairs.push([l, r]);
        else {
          const seg = l ?? r;
          const value = l ? k.right : k.left;
          if (!seg || !isValueSide(value)) return;
          keep(lenAt, segKey(seg.a, seg.b), { ...seg, value: valueOf(value.expr) });
        }
        return;
      }
      case 'angle': {
        const { v, a, b } = k.at;
        const value =
          k.measure === 'tan'
            ? // tan is one-to-one on the unsigned angle (0°–180°) through its sign (ADR-AG-215): a negative tan is obtuse
              valueOf(k.value, (t) => { const d = (Math.atan(t) * 180) / Math.PI; return d < 0 ? d + 180 : d; })
            : k.measure === 'cos'
              ? valueOf(k.value, (x) => (Math.abs(x) <= 1 ? (Math.acos(x) * 180) / Math.PI : NaN))
              : valueOf(k.value);
        // A trig given whose value is still a letter is written as the student wrote it, measure and all.
        const shown: StatedValue = 'text' in value && k.measure ? { text: `${k.measure}=${value.text}` } : value;
        // A stated 90° is a right angle, drawn as the knee — never an arc labelled «90°» (2-D's rule).
        if ('num' in shown && Math.abs(shown.num - 90) < 1e-9) {
          right({ v, a, b });
          return;
        }
        keep(angAt, angKey(v, a, b), { v, a, b, value: shown });
        return;
      }
      case 'angle-ratio': {
        if (k.k.kind === 'num' && k.k.value === 1) anglePairs.push([k.left, k.right]);
        return;
      }
      case 'relation': {
        if (k.rel !== 'perpendicular' || k.assumed) return;
        const knee = kneeOf(k.u, k.v);
        if (knee) right(knee);
        return;
      }
      case 'area': {
        out.areas.push({ ids: k.ids, value: valueOf(k.value) });
        return;
      }
      case 'arc-sum': {
        if (k.terms.length !== 1) return;
        const [t] = k.terms;
        if (t.k.kind !== 'num' || t.k.value !== 1) return;
        out.arcs.push({ circle: t.circle, a: t.a, b: t.b, value: valueOf(k.value) });
        return;
      }
      case 'all':
        k.of.forEach(read);
        return;
      default:
        return;
    }
  };
  const right = (r: { v: Id; a: Id; b: Id }): void => {
    const key = angKey(r.v, r.a, r.b);
    if (seenRight.has(key)) return;
    seenRight.add(key);
    out.rights.push(r);
  };

  c.constraints.forEach((k, at) => {
    const from = origin(at);
    if (from === undefined) return;
    if (k.t === 'choice') {
      // The configuration's OWN option — what the figure drew — whoever opened the choice.
      resolveChoices([k], choiceSeed).forEach(read);
      return;
    }
    if (from === 'statement') read(k);
  });

  out.lengths = [...lenAt.values()];
  out.angles = [...angAt.values()];
  out.equalLengths = equalityClasses(lengthPairs, (s) => segKey(s.a, s.b)).flatMap((cls, i) =>
    cls.map((s) => ({ ...s, count: i + 1 })),
  );
  out.equalAngles = equalityClasses(anglePairs, (r) => angKey(r.v, r.a, r.b)).flatMap((cls, i) =>
    cls.map((r) => ({ ...r, count: i + 1 })),
  );
  return out;
}

/** Union the stated pairs into classes, in first-mention order — each class gets its own tick count. */
function equalityClasses<T>(pairs: ReadonlyArray<[T, T]>, key: (t: T) => string): T[][] {
  const parent = new Map<string, string>();
  const item = new Map<string, T>();
  const order: string[] = [];
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const add = (t: T): string => {
    const k = key(t);
    if (!parent.has(k)) {
      parent.set(k, k);
      item.set(k, t);
      order.push(k);
    }
    return k;
  };
  for (const [p, q] of pairs) {
    const a = find(add(p));
    const b = find(add(q));
    if (a !== b) parent.set(b, a);
  }
  const classes = new Map<string, T[]>();
  for (const k of order) {
    const root = find(k);
    if (!classes.has(root)) classes.set(root, []);
    classes.get(root)!.push(item.get(k)!);
  }
  return [...classes.values()].filter((cls) => cls.length >= 2);
}
