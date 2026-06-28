/**
 * Symbolic-measure lowering (the compiler middle-end) — [ADR-031](docs/06-decisions.md#adr-031).
 *
 * The parser may emit a few *store-level* `SymbolicCommand`s (`measure-length`,
 * `measure-angle`, `set-var`) that the geometric engine doesn't understand. This
 * module lowers them into ordinary engine `Command`s using a **symbol table** built
 * from the whole command list, so a named unknown shared across statements becomes a
 * proportion, and a value given for it resolves every measure that uses it:
 *
 *   AB = 3x ; DF = x            →  (AB free) ; |DF| = (1/3)|AB|     (a ratio relation)
 *   AB = 3x ; DF = x ; x = 4    →  |AB| = 12 ; |DF| = 4            (resolved to numbers)
 *   ∠ABC = 2α ; ∠DEF = α        →  (∠ABC free) ; ∠DEF·2 = ∠ABC     (an angle-ratio)
 *
 * Pure and deterministic. `lower` is the whole-list transform; `replay` uses the
 * finer-grained pieces so it can attach a status/label to each originating fact.
 */

import { RADIUS_VAR, type AnyCommand, type Command, type Id, type MeasureExpr, type SymbolicCommand } from './types';
import { expandShapeVariant } from './shapeVariants';

type Binding = { kind: 'len' | 'ang' | 'area'; refs: Id[]; coef: number; pow?: number; affine?: boolean };
export interface SymTab {
  vars: Map<string, { value?: number; bindings: Binding[] }>;
  /** The FREE-radius circle the symbol R denotes, plus a point on it that witnesses the radius
   *  (|center→witness| = R). Set only when R has no fixed value — it lets an "AB = √2R" measure
   *  lower to a {@link LengthRadiusConstraint} that couples the length to the free radius DOF (ADR-071). */
  radiusCircle?: { id: Id; center: Id; witness: Id };
}

/** A point id known to lie on circle `circleId` (so its distance to the centre IS the radius), or null. */
function pointOnCircle(cmds: AnyCommand[], circleId: Id): Id | null {
  for (const c of cmds) {
    if (c.type === 'point-on-circle' && c.circle === circleId) return c.id;
    if (c.type === 'arc-midpoint' && c.circle === circleId) return c.id;
    if (c.type === 'line-circle-intersection' && c.circle === circleId) return c.id;
  }
  return null;
}

const sameRefs = (a: Id[], b: Id[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** Build the symbol table from a command list: each variable's value (if given) and its bindings, in order. */
export function buildSymTab(cmds: AnyCommand[]): SymTab {
  const vars = new Map<string, { value?: number; bindings: Binding[] }>();
  const slot = (name: string) => {
    let v = vars.get(name);
    if (!v) vars.set(name, (v = { bindings: [] }));
    return v;
  };
  for (const c of cmds) {
    if (c.type === 'set-var') slot(c.name).value = c.value;
    else if (c.type === 'measure-length' && 'var' in c.expr) slot(c.expr.var).bindings.push({ kind: 'len', refs: [c.a, c.b], coef: c.expr.coef, pow: c.expr.pow, affine: (c.expr.const ?? 0) !== 0 });
    else if (c.type === 'measure-angle' && 'var' in c.expr) slot(c.expr.var).bindings.push({ kind: 'ang', refs: [c.vertex, c.ray1, c.ray2], coef: c.expr.coef });
    else if (c.type === 'measure-area' && 'var' in c.expr) slot(c.expr.var).bindings.push({ kind: 'area', refs: c.ids, coef: c.expr.coef, pow: c.expr.pow, affine: (c.expr.const ?? 0) !== 0 });
  }
  // The reserved radius symbol R always denotes the circle's radius (ADR-034): if a measure uses it
  // but no explicit value was given, bind R to the (first FIXED-radius) circle's radius — so
  // "OC = 0.5R" sizes against the radius without the student having to declare "radius R" separately.
  // A FREE-radius circle (bare "circle O", no stated size — ADR-051/052) is deliberately EXCLUDED: its
  // radius is a free DOF, so freezing R to its default would silently pin the size the question left
  // free and lower "AB = √2R" to a FIXED distance that fights the free radius (seed-fragile
  // over-constraint). Left unvalued, R-measures couple through the ratio machinery instead
  // (|BO| = (1/√2)|AB| for "AB=√2R" + "BO=R"), keeping the figure scalable.
  const rad = vars.get(RADIUS_VAR);
  let radiusCircle: SymTab['radiusCircle'];
  if (rad && rad.value === undefined) {
    const circ = cmds.find(
      (c) => c.type === 'circle' && typeof (c as { radius?: unknown }).radius === 'number' && !(c as { freeRadius?: boolean }).freeRadius,
    ) as { radius: number } | undefined;
    if (circ) rad.value = circ.radius;
    else {
      // No fixed-radius circle, but R is used → it denotes a FREE-radius circle. Record it (+ a point on
      // it that witnesses the radius) so R-measures couple to the radius DOF rather than freezing it (ADR-071).
      const free = cmds.find((c) => c.type === 'circle' && (c as { freeRadius?: boolean }).freeRadius) as
        | { id: Id; center: Id }
        | undefined;
      if (free) {
        const witness = pointOnCircle(cmds, free.id);
        if (witness) radiusCircle = { id: free.id, center: free.center, witness };
      }
    }
  }
  return { vars, radiusCircle };
}

/** Lower one command to the engine command(s) it produces (0+). Engine commands pass through unchanged. */
export function lowerOne(cmd: AnyCommand, tab: SymTab): Command[] {
  switch (cmd.type) {
    case 'set-var':
      return []; // pure data — only its referenced measures produce constraints
    case 'measure-length': {
      const e = cmd.expr;
      if ('value' in e) return [{ type: 'set-distance', a: cmd.a, b: cmd.b, value: e.value }];
      const konst = e.const ?? 0;
      // |XY| = k·R against a FREE-radius circle (ADR-071): couple the length to the radius DOF. Only the
      // LINEAR case (pow 1) is a radius multiple; a √/² power of the radius falls through to the var path.
      if (e.var === RADIUS_VAR && tab.radiusCircle && (e.pow ?? 1) === 1) {
        const { id, center, witness } = tab.radiusCircle;
        return [{ type: 'set-length-radius', a: cmd.a, b: cmd.b, circle: id, center, witness, k: e.coef, ...(konst ? { add: konst } : {}) }];
      }
      const info = tab.vars.get(e.var);
      if (info?.value !== undefined) {
        const len = e.coef * Math.pow(info.value, e.pow ?? 1) + konst; // 12√x with x=4 → 24; k+2 with k=4 → 6
        return [{ type: 'set-distance', a: cmd.a, b: cmd.b, value: len }];
      }
      // The representative must itself be pure (an affine binding can't anchor a ratio).
      const reps = info?.bindings.filter((b) => b.kind === 'len' && !b.affine) ?? [];
      const rep = reps[0];
      if (!rep || sameRefs(rep.refs, [cmd.a, cmd.b])) return []; // the representative (or sole binding) stays free
      // A ratio is linear only when both share the same exponent: the varⁿ cancels (12√x : 3√x = 4:1;
      // 4x² : x² = 4:1). Mixed exponents (12√x vs 3x) are nonlinear — leave a free label, not a wrong ratio.
      if ((rep.pow ?? 1) !== (e.pow ?? 1)) return [];
      // With a constant the relation is AFFINE (|this| = (coef/repCoef)·|rep| + const). Only the LINEAR
      // case (pow 1) is an affine length relation; a const with √/² would be nonlinear → leave free.
      if (konst !== 0 && (e.pow ?? 1) !== 1) return [];
      return [
        {
          type: 'set-ratio',
          a: cmd.a,
          b: cmd.b,
          c: rep.refs[0],
          d: rep.refs[1],
          k: e.coef / rep.coef,
          ...(konst ? { add: konst } : {}),
        },
      ];
    }
    case 'measure-area': {
      // Mirrors `measure-length` but for a polygon's area (ADR-118): a value → `set-area`; a SHARED variable
      // → `set-area-ratio` against the representative area binding; the representative / a lone label stays free.
      const e = cmd.expr;
      if ('value' in e) return [{ type: 'set-area', ids: cmd.ids, value: e.value }];
      const konst = e.const ?? 0;
      const info = tab.vars.get(e.var);
      if (info?.value !== undefined) {
        return [{ type: 'set-area', ids: cmd.ids, value: e.coef * Math.pow(info.value, e.pow ?? 1) + konst }];
      }
      const reps = info?.bindings.filter((b) => b.kind === 'area' && !b.affine) ?? [];
      const rep = reps[0];
      if (!rep || sameRefs(rep.refs, cmd.ids)) return []; // the representative (or a lone "SABC = S" label) stays free
      if ((rep.pow ?? 1) !== (e.pow ?? 1) || konst !== 0) return []; // mixed exponent / affine → not a clean ratio
      return [{ type: 'set-area-ratio', ids1: cmd.ids, ids2: rep.refs, k: e.coef / rep.coef }];
    }
    case 'measure-angle': {
      const e = cmd.expr;
      const angle = (value: number): Command => ({ type: 'set-angle', vertex: cmd.vertex, ray1: cmd.ray1, ray2: cmd.ray2, value });
      if ('value' in e) return [angle(e.value)];
      const info = tab.vars.get(e.var);
      if (info?.value !== undefined) return [angle(e.coef * info.value)];
      const reps = info?.bindings.filter((b) => b.kind === 'ang') ?? [];
      const rep = reps[0];
      if (!rep || sameRefs(rep.refs, [cmd.vertex, cmd.ray1, cmd.ray2])) return [];
      // ∠this = (coef/repCoef)·∠rep
      return [
        { type: 'set-angle-ratio', v1: cmd.vertex, a1: cmd.ray1, b1: cmd.ray2, v2: rep.refs[0], a2: rep.refs[1], b2: rep.refs[2], k: e.coef / rep.coef },
      ];
    }
    case 'measure-order': {
      // "α < β" / "x > y" — order the two measures the variables name. Resolve each variable to its
      // first binding (the measure it was attached to) and emit a set-angle-order / set-length-order.
      const L = tab.vars.get(cmd.left)?.bindings[0];
      const R = tab.vars.get(cmd.right)?.bindings[0];
      if (!L || !R || L.kind !== R.kind) return []; // undefined, or comparing an angle to a length → no-op
      // Only a bare variable (coef 1, linear, no constant) maps an inequality cleanly to its measure.
      const simple = (b: Binding) => b.coef === 1 && (b.pow ?? 1) === 1 && !b.affine;
      if (!simple(L) || !simple(R)) return [];
      const leftSmaller = cmd.op === '<' || cmd.op === '<=';
      const small = leftSmaller ? L : R;
      const large = leftSmaller ? R : L;
      if (L.kind === 'ang')
        return [{ type: 'set-angle-order', v1: small.refs[0], a1: small.refs[1], b1: small.refs[2], v2: large.refs[0], a2: large.refs[1], b2: large.refs[2] }];
      return [{ type: 'set-length-order', a: small.refs[0], b: small.refs[1], c: large.refs[0], d: large.refs[1] }];
    }
    case 'shape-variant':
      // The base shape + the variant-selected equal pairs (ADR-138). This fallback (no explicit equalities)
      // is the whole-list `lower()` / direct-caller path; `replay` calls `expandShapeVariant` itself with the
      // figure's explicit `set-equal`s so an explicit pair can PIN the variant.
      return expandShapeVariant(cmd, []);
    default:
      return [cmd as Command];
  }
}

/** Whole-list lowering: AnyCommand[] → Command[] the engine can apply (test/convenience helper). */
export function lower(cmds: AnyCommand[]): Command[] {
  const tab = buildSymTab(cmds);
  return cmds.flatMap((c) => lowerOne(c, tab));
}

const fmtNum = (n: number): string => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));

/** Render a variable with its exponent: ½ → √x, 2 → x², 3 → x³, n → x^n, else x. */
const powVar = (v: string, pow?: number): string => {
  if (pow === undefined || pow === 1) return v;
  if (pow === 0.5) return '√' + v;
  if (pow === 2) return v + '²';
  if (pow === 3) return v + '³';
  return v + '^' + fmtNum(pow);
};

/** Is this a symbolic measure fact (carries a display label)? */
export function isMeasure(cmd: AnyCommand): cmd is Extract<SymbolicCommand, { type: 'measure-length' | 'measure-angle' | 'measure-area' }> {
  return cmd.type === 'measure-length' || cmd.type === 'measure-angle' || cmd.type === 'measure-area';
}

/**
 * The text to print on the figure for a symbolic measure: the resolved number once
 * its variable has a value (the user's choice — "3x" → "12"), else the expression
 * ("3x", "2α"). Angles get a trailing degree sign only when numeric/resolved.
 */
export function measureLabelText(cmd: Extract<SymbolicCommand, { type: 'measure-length' | 'measure-angle' | 'measure-area' }>, tab: SymTab): string {
  const e: MeasureExpr = cmd.expr;
  const isAngle = cmd.type === 'measure-angle';
  // A concrete value: show its faithful text ("12√2", "2π") if the parser kept one, else the number.
  if ('value' in e) return e.text ?? fmtNum(e.value) + (isAngle ? '°' : '');
  // The radius symbol stays symbolic on the figure ("1.6R") even when its value is known (ADR-034) —
  // it's a size relative to the radius, not a number the student picked.
  if (e.var === RADIUS_VAR) return e.text ?? (e.coef === 1 ? '' : fmtNum(e.coef)) + powVar(e.var, e.pow);
  const info = tab.vars.get(e.var);
  // Resolved (the variable has a value): always the computed number — the symbolic text no longer applies.
  if (info?.value !== undefined) return fmtNum(e.coef * Math.pow(info.value, e.pow ?? 1) + (e.const ?? 0)) + (isAngle ? '°' : '');
  // Unresolved: the faithful original ("7k/5", "k+2") if kept, else derive from coef + exponent.
  return e.text ?? (e.coef === 1 ? '' : fmtNum(e.coef)) + powVar(e.var, e.pow);
}
