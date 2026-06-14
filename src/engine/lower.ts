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

import type { AnyCommand, Command, Id, MeasureExpr, SymbolicCommand } from './types';

type Binding = { kind: 'len' | 'ang'; refs: Id[]; coef: number };
export interface SymTab {
  vars: Map<string, { value?: number; bindings: Binding[] }>;
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
    else if (c.type === 'measure-length' && 'var' in c.expr) slot(c.expr.var).bindings.push({ kind: 'len', refs: [c.a, c.b], coef: c.expr.coef });
    else if (c.type === 'measure-angle' && 'var' in c.expr) slot(c.expr.var).bindings.push({ kind: 'ang', refs: [c.vertex, c.ray1, c.ray2], coef: c.expr.coef });
  }
  return { vars };
}

/** Lower one command to the engine command(s) it produces (0+). Engine commands pass through unchanged. */
export function lowerOne(cmd: AnyCommand, tab: SymTab): Command[] {
  switch (cmd.type) {
    case 'set-var':
      return []; // pure data — only its referenced measures produce constraints
    case 'measure-length': {
      const e = cmd.expr;
      if ('value' in e) return [{ type: 'set-distance', a: cmd.a, b: cmd.b, value: e.value }];
      const info = tab.vars.get(e.var);
      if (info?.value !== undefined) return [{ type: 'set-distance', a: cmd.a, b: cmd.b, value: e.coef * info.value }];
      const reps = info?.bindings.filter((b) => b.kind === 'len') ?? [];
      const rep = reps[0];
      if (!rep || sameRefs(rep.refs, [cmd.a, cmd.b])) return []; // the representative (or sole binding) stays free
      return [{ type: 'set-ratio', a: cmd.a, b: cmd.b, c: rep.refs[0], d: rep.refs[1], k: e.coef / rep.coef }];
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

/** Is this a symbolic measure fact (carries a display label)? */
export function isMeasure(cmd: AnyCommand): cmd is Extract<SymbolicCommand, { type: 'measure-length' | 'measure-angle' }> {
  return cmd.type === 'measure-length' || cmd.type === 'measure-angle';
}

/**
 * The text to print on the figure for a symbolic measure: the resolved number once
 * its variable has a value (the user's choice — "3x" → "12"), else the expression
 * ("3x", "2α"). Angles get a trailing degree sign only when numeric/resolved.
 */
export function measureLabelText(cmd: Extract<SymbolicCommand, { type: 'measure-length' | 'measure-angle' }>, tab: SymTab): string {
  const e: MeasureExpr = cmd.expr;
  const isAngle = cmd.type === 'measure-angle';
  if ('value' in e) return fmtNum(e.value) + (isAngle ? '°' : '');
  const info = tab.vars.get(e.var);
  if (info?.value !== undefined) return fmtNum(e.coef * info.value) + (isAngle ? '°' : '');
  return (e.coef === 1 ? '' : fmtNum(e.coef)) + e.var;
}
