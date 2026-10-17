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
 *   «tan∢BAO = 2»), an **area** («שטח המשולש ABC הוא 13», «שטח ABC = 12», «נסמן את שטח ABC ב-S» — #2031), an
 *   **arc** («⌢AC = 60°»);
 * - a **right angle** stated at a vertex («זווית ABC ישרה», «AB ⊥ BC», «∢ABC = 90») — a knee, never «90°»;
 * - an **altitude** or a **perpendicular** («AD גובה לצלע BC», «הגובה מ-A לצלע BC», «D רגל האנך מ-A ל-BC») — a knee
 *   at its FOOT (#1241, ADR-AG-237), on the side or on its extension;
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
import { angleLabelName, isTermPlaceholder, type LengthExpr } from './lengths';
import type { Constraint, Direction } from './solve';
import type { Construction, Id } from './types';
import type { FootLine } from './derived';

/** A stated value, as the renderer should write it: a NUMBER the givens fix, or the student's own TEXT. */
export type StatedValue = { num: number } | { text: string };

export interface StatedMeasures {
  /** «AB = 5», «AB = 3a» — written at the segment's midpoint. */
  lengths: Array<{ a: Id; b: Id; value: StatedValue }>;
  /** «∢ABC = 30» — an arc at `v` between the rays to `a` and `b`, with the value; `num` is in DEGREES. */
  angles: Array<{ v: Id; a: Id; b: Id; value: StatedValue }>;
  /**
   * A stated right angle at `v` — the knee. `alt` is a second named point on the `b` ray's LINE (an altitude's foot
   * lies on the side, between or beyond its ends): the renderer runs the knee toward whichever of `b`, `alt` is
   * farther from `v`, so a foot that lands on an endpoint still has a ray to draw along (#1241).
   */
  rights: Array<{ v: Id; a: Id; b: Id; alt?: Id }>;
  /**
   * «שטח המשולש ABC הוא 13», «שטח ABC = 12», «נסמן את שטח ABC ב-S» — written at the ring's centroid. `bare` marks a
   * value that is ONE letter the student wrote («S»), which is written alone, as 2-D writes it; every other value
   * keeps the ruled «S=…» form (ADR-W-118 B9). Read off the value's `Expr`, never off its printed text (#2031, ADR-AG-273).
   */
  areas: Array<{ ids: Id[]; value: StatedValue; bare?: true }>;
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

/**
 * A side that is ONE plain measure with coefficient 1 — the length «AB» or the area «שטח ABC» — or null.
 *
 * #2031 (ADR-AG-273): the measure equation is the second representation of a stated area. «שטח ABC = 12» and the
 * label form «נסמן את שטח ABC ב-S» (restated as «שטח ABC = S») reach the fold as `length-eq` with one area term, not
 * as the copula's `area` constraint; reading only lengths here dropped every one of them from the canvas.
 */
type PlainMeasure = { kind: 'length'; a: Id; b: Id } | { kind: 'area'; ids: Id[] };
function plainMeasure(e: LengthExpr): PlainMeasure | null {
  if (e.terms.length !== 1 || e.expr.kind !== 'sym' || !isTermPlaceholder(e.expr.name)) return null;
  const t = e.terms[0];
  if (t.kind === undefined || t.kind === 'length') return { kind: 'length', a: t.a, b: t.b };
  if (t.kind === 'area') return { kind: 'area', ids: t.ids };
  return null;
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
 * One key per POLYGON: the ring read from any vertex, in either direction, is the same region (ABC ≡ BCA ≡ CBA), while
 * a different boundary order over the same letters (ABCD vs ABDC) is a different polygon, as 2-D keys it.
 */
const ringKey = (ids: readonly Id[]): string => {
  const n = ids.length;
  const reads: string[] = [];
  for (let i = 0; i < n; i += 1) {
    reads.push(Array.from({ length: n }, (_, j) => ids[(i + j) % n]).join('|'));
    reads.push(Array.from({ length: n }, (_, j) => ids[(i - j + n) % n]).join('|'));
  }
  return reads.sort()[0];
};

/**
 * Read the stated measures off a construction. `origin(at)` is the source of constraint `at`; `resolve` answers which
 * option of a discrete `choice` THIS configuration took (read off the drawn figure, #1719), so a resolved choice — a
 * right triangle's seat, a sine's acute or obtuse angle — is shown where the figure actually built it.
 */
export function statedMeasures(
  c: Construction,
  origin: (at: number) => ConstraintOrigin | undefined,
  resolve: (k: Extract<Constraint, { t: 'choice' }>) => readonly Constraint[],
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
   * Since #2054 (ADR-AG-277) a second, disjoint letter is refused at apply (`measureRestatement`), so «letter against
   * letter» reaches here only as a shared-letter equation («AB = 2a» · «AB = a + 3»).
   */
  const lenAt = new Map<string, StatedMeasures['lengths'][number]>();
  const angAt = new Map<string, StatedMeasures['angles'][number]>();
  /** Areas too (#2031): «שטח ABC הוא S» · «שטח ABC הוא 12» is ONE label, «S=12» — 2-D's `areaByKey.set`. */
  const areaAt = new Map<string, StatedMeasures['areas'][number]>();
  /** A stated area's value: the bare letter when the value is ONE free letter, else the «S=…» value. */
  const area = (ids: Id[], e: Expr): void => {
    const value = valueOf(e);
    keep(areaAt, ringKey(ids), { ids, value, ...('text' in value && e.kind === 'sym' ? { bare: true as const } : {}) });
  };
  const keep = <T extends { value: StatedValue }>(at: Map<string, T>, key: string, next: T): void => {
    const prev = at.get(key);
    if (prev && 'num' in prev.value && !('num' in next.value)) return;
    at.set(key, next);
  };
  const seenRight = new Set<string>();

  const read = (k: Constraint): void => {
    switch (k.t) {
      case 'length-eq': {
        const l = plainMeasure(k.left);
        const r = plainMeasure(k.right);
        if (l && r) {
          // Two lengths are an equality (ticks); an area against an area, or against a length, is a relation — no value.
          if (l.kind === 'length' && r.kind === 'length') lengthPairs.push([{ a: l.a, b: l.b }, { a: r.a, b: r.b }]);
          return;
        }
        const m = l ?? r;
        const value = l ? k.right : k.left;
        if (!m || !isValueSide(value)) return;
        if (m.kind === 'area') area(m.ids, value.expr);
        else keep(lenAt, segKey(m.a, m.b), { a: m.a, b: m.b, value: valueOf(value.expr) });
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
              : k.measure === 'sin'
                ? // sin (ADR-AG-227): THIS configuration's option of the choice — asin, or 180° − asin when obtuse
                  valueOf(k.value, (x) => {
                    if (Math.abs(x) > 1) return NaN;
                    const d = (Math.asin(Math.abs(x)) * 180) / Math.PI;
                    return k.obtuse ? 180 - d : d;
                  })
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
      case 'perpendicular': {
        /**
         * AN ALTITUDE (#1241, ADR-AG-237) — the cevian lowers «AD גובה לצלע BC» to `AD ⊥ BC` with D on the line BC. The
         * knee belongs at the FOOT, which is not an endpoint of BC: it is read off the constraint and the incidence that
         * puts one pair's end on the other pair's line — never off the drawn figure. Pairs sharing a point knee there.
         */
        const u: Direction = { k: 'points', a: k.a, b: k.b };
        const w: Direction = { k: 'points', a: k.c, b: k.d };
        const knee = kneeOf(u, w);
        if (knee) {
          right(knee);
          return;
        }
        const foot = footOn(k.b, k.c, k.d) ? { v: k.b, a: k.a, on: [k.c, k.d] }
          : footOn(k.a, k.c, k.d) ? { v: k.a, a: k.b, on: [k.c, k.d] }
            : footOn(k.d, k.a, k.b) ? { v: k.d, a: k.c, on: [k.a, k.b] }
              : footOn(k.c, k.a, k.b) ? { v: k.c, a: k.d, on: [k.a, k.b] }
                : null;
        if (foot) right({ v: foot.v, a: foot.a, b: foot.on[0], alt: foot.on[1] });
        return;
      }
      case 'relation': {
        if (k.rel !== 'perpendicular' || k.assumed) return;
        const knee = kneeOf(k.u, k.v);
        if (knee) right(knee);
        return;
      }
      case 'area': {
        area(k.ids, k.value);
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
  /**
   * One knee per right angle. A foot's knee stands for the right angle between its ray and EITHER end of the line it
   * sits on, so «AD גובה לצלע BC» and «זווית ADB ישרה» (in either order) are one knee, not two.
   */
  const right = (r: { v: Id; a: Id; b: Id; alt?: Id }): void => {
    const keys = [angKey(r.v, r.a, r.b), ...(r.alt ? [angKey(r.v, r.a, r.alt)] : [])];
    if (keys.some((key) => seenRight.has(key))) return;
    keys.forEach((key) => seenRight.add(key));
    out.rights.push(r);
  };
  /** Is `p` put on the line `ab` by an incidence of the construction? — how an altitude's foot is said to be on its side. */
  const footOn = (p: Id, a: Id, b: Id): boolean =>
    p !== a && p !== b && c.constraints.some((q) => q.t === 'on-line-2pt' && q.id === p && ((q.a === a && q.b === b) || (q.a === b && q.b === a)));

  c.constraints.forEach((k, at) => {
    const from = origin(at);
    if (from === undefined) return;
    if (k.t === 'choice') {
      // The configuration's OWN option — what the figure drew — whoever opened the choice.
      resolve(k).forEach(read);
      return;
    }
    if (from === 'statement') read(k);
  });

  /**
   * THE STATED FOOT (#1241, ADR-AG-237) — «הגובה מ-A לצלע BC», «D רגל האנך מ-A ל-BC» build the foot as a derived point
   * (`foot` rule), with no constraint for the layer to read. Every producer of that rule is a sentence about a
   * perpendicular (the cevian's unnamed foot, «רגל האנך», «האנך מ-…»), so the rule IS the statement. Its knee needs two
   * named points to run along, which a foot on a line through two points has; a foot on an axis or a line object
   * has no named point on its line, and draws none (a known limit, ADR-AG-237).
   */
  for (const o of c.objects) {
    if (o.kind !== 'derived' || o.rule.t !== 'foot') continue;
    const onto: FootLine = o.rule.onto;
    if (onto.k !== 'points') continue;
    right({ v: o.id, a: o.rule.from, b: onto.a, alt: onto.b });
  }

  out.lengths = [...lenAt.values()];
  out.angles = [...angAt.values()];
  out.areas = [...areaAt.values()];
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

/**
 * #2054 + #2061 ([ADR-AG-277](../../docs/06c-decisions-analytic.md#adr-ag-277)) — what a statement about an angle's or a
 * segment's VALUE says against an EARLIER stated value of the same angle or segment: 2-D's `measureRestatement`
 * ([ADR-661](../../docs/06-decisions.md#adr-661)), the same rules over analytic's constraints.
 *
 * The target is the angle as its vertex plus an unordered ray pair (`angle`, no trig `measure`), or one plain segment
 * against a value side (`length-eq`, read by {@link plainMeasure} / {@link isValueSide} — the canvas's own definition
 * of a stated value). Over the student's letters (not a term placeholder, a tool symbol or an angle label):
 *
 * - `coef-conflict` — the same single letter with another coefficient (k₁·α against k₂·α forces α = 0), or the same
 *   coefficient with another constant («∠ABC = α» · «∠ABC = α + 40», #2105 — 2-D's ADR-662 member): refused as
 *   contradicting the earlier line (operator ruling 2026-10-14, #2061);
 * - `value-conflict` — two NUMBERS that differ («AB = 4» · «AB = 5», «∠ABC = 40» · «∠CBA = 50»): refused as
 *   contradicting the earlier line, 2-D's verdict for the same pair (#2105, ADR-AG-295; operator ruling 2026-10-15,
 *   ADR-W-118 B1). The solve could only say «לא נמצאה תצורה» and never named the line it fights;
 * - `name-taken` — a fresh letter set (no letter in it appears anywhere else in the figure — another quantity's
 *   letter, a radius, a valued letter) on a target whose earlier value's letters are all different and not valued:
 *   a second name (operator rulings 2026-10-13, #2023/#2054).
 *
 * Anything else — the same statement (the duplicate absorb), a number on either side, a shared letter in another
 * form (an equation the solve judges) — is null. `earlier` is the constraint the verdict is about (an object
 * reference, so the fold's attribution finds its line whatever was removed since).
 */
export type MeasureRestatement = { kind: 'coef-conflict' | 'value-conflict' | 'name-taken'; earlier: Constraint; holder: string; name: string; what: string };
type MeasureTarget = { key: string; name: string; value: Expr; angle: boolean };
function measureTargetOf(k: Constraint): MeasureTarget | null {
  if (k.t === 'angle' && !k.measure) return { key: `ang:${k.at.v}:${[k.at.a, k.at.b].sort().join('|')}`, name: `${k.at.a}${k.at.v}${k.at.b}`, value: k.value, angle: true };
  if (k.t !== 'length-eq') return null;
  const l = plainMeasure(k.left);
  const r = plainMeasure(k.right);
  const m = l && !r && isValueSide(k.right) ? { m: l, v: k.right } : r && !l && isValueSide(k.left) ? { m: r, v: k.left } : null;
  if (!m || m.m.kind !== 'length') return null;
  return { key: `len:${segKey(m.m.a, m.m.b)}`, name: `${m.m.a}${m.m.b}`, value: m.v.expr, angle: false };
}
const studentLetters = (e: Expr): string[] => [...new Set(symbolsOf(e))].filter((s) => !isTermPlaceholder(s) && !s.startsWith('θ_') && angleLabelName(s) === null);
/** Every expression symbol anywhere inside a constraint or an object (a circle's radius letter, a parameter's value). */
const symbolNamesIn = (x: unknown): string[] => [...JSON.stringify(x).matchAll(/"kind":"sym","name":"([^"]*)"/g)].map((m) => m[1]);
/**
 * `k·s + c` for ONE letter s — «3α», «α + 40», «2(a + 3)» — else null. Read by evaluation, not by the tree's shape, so
 * every spelling of the same affine value is one reading: the value at s = 0…3 must lie on one line (#2105, ADR-AG-295;
 * 2-D's affine tail, ADR-662).
 */
function affineIn(e: Expr): { s: string; k: number; c: number } | null {
  const syms = [...new Set(symbolsOf(e))];
  if (syms.length !== 1) return null;
  const [s] = syms;
  const f = [0, 1, 2, 3].map((x) => evalExpr(e, { [s]: x }));
  if (!f.every(Number.isFinite)) return null;
  const k = f[1] - f[0];
  const tol = 1e-9 * Math.max(1, ...f.map(Math.abs));
  if (Math.abs(f[2] - f[0] - 2 * k) > tol || Math.abs(f[3] - f[0] - 3 * k) > tol || Math.abs(k) <= tol) return null;
  return { s, k, c: f[0] };
}
const near = (x: number, y: number): boolean => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
/** The value as a plain number when it carries no symbol at all («5», «√2», «3/4»), else null. */
function numberOf(e: Expr): number | null {
  if (symbolsOf(e).length > 0) return null;
  const v = evalExpr(e);
  return Number.isFinite(v) ? v : null;
}
/** What 2-D's reason clause says about the refused measure: «|AB| = 5», «∠ABC = 50°», «∠ABC = 3α». */
const reasonText = (t: MeasureTarget): string =>
  t.angle ? `∠${t.name} = ${statedText(t.value)}${numberOf(t.value) !== null ? '°' : ''}` : `|${t.name}| = ${statedText(t.value)}`;
export function measureRestatement(c: Construction, k: Constraint): MeasureRestatement | null {
  const t = measureTargetOf(k);
  if (!t) return null;
  const n = numberOf(t.value);
  if (n !== null) {
    // Two numbers on one target: they agree (the absorb, or the solve for another spelling of the same value) or they
    // contradict. Same tolerance as the duplicate check's numeric reading — a relative 1e-9.
    for (const e of c.constraints) {
      const et = measureTargetOf(e);
      if (!et || et.key !== t.key) continue;
      const m = numberOf(et.value);
      if (m !== null && !near(m, n))
        return { kind: 'value-conflict', earlier: e, holder: statedText(et.value), name: t.name, what: reasonText(t) };
    }
    return null;
  }
  const letters = studentLetters(t.value);
  if (letters.length === 0) return null;
  const onTarget: { k: Constraint; t: MeasureTarget }[] = [];
  const elsewhere = new Set<string>();
  for (const e of c.constraints) {
    const et = measureTargetOf(e);
    if (et && et.key === t.key) onTarget.push({ k: e, t: et });
    else for (const s of symbolNamesIn(e)) elsewhere.add(s);
  }
  if (onTarget.length === 0) return null;
  const valued = new Set(c.constraints.flatMap((e) => (e.t === 'param-eq' ? [e.sym.name] : [])));
  const lin = affineIn(t.value);
  const what = reasonText(t);
  for (const o of onTarget) {
    const ol = affineIn(o.t.value);
    // The same letter, one of its coefficient or its constant changed (k₁·α + c against k₂·α + c, or k·α + c₁ against
    // k·α + c₂): no α satisfies both. Both changed is an equation that fixes α — the solve judges it (2-D's ADR-662 rule).
    const kSame = lin && ol ? near(lin.k, ol.k) : false;
    const cSame = lin && ol ? near(lin.c, ol.c) : false;
    if (lin && ol && lin.s === ol.s && kSame !== cSame && !valued.has(lin.s)) return { kind: 'coef-conflict', earlier: o.k, holder: statedText(o.t.value), name: t.name, what };
  }
  if (onTarget.some((o) => studentLetters(o.t.value).some((s) => letters.includes(s)))) return null; // a shared letter: an equation
  const first = onTarget[0];
  const firstLetters = studentLetters(first.t.value);
  if (firstLetters.length === 0) return null; // a number: a pin, the residual judges it
  const objectLetters = new Set(symbolNamesIn(c.objects));
  const used = (s: string) => elsewhere.has(s) || objectLetters.has(s) || s === 'x' || s === 'y';
  if (letters.some(used) || firstLetters.some((s) => valued.has(s))) return null;
  return { kind: 'name-taken', earlier: first.k, holder: statedText(first.t.value), name: t.name, what };
}
