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

import type { AnyCommand, Command, Id, MeasureExpr, RoundOperand, SymbolicCommand } from './types';
import { formatMeasure } from '@/format';
import { expandShapeVariant } from './shapeVariants';
import { expandInscribe } from './inscribe';
import { expandAltitudeChoice } from './altitudeChoice';

/** `perim` (ADR-632): an arc's length — a length, but of a ROUND operand, so it couples only with its own kind
 *  (a ratio of two boundary lengths), never with a segment's `len`. `round` rides with the refs it qualifies. */
type Binding = { kind: 'len' | 'ang' | 'area' | 'perim'; refs: Id[]; coef: number; pow?: number; affine?: boolean; round?: RoundOperand };
export interface SymTab {
  /** `value` is a STATED value (an accepted `set-var` — the labels read it); `derived` is a value the letter system
   *  ({@link letterSystem}, #2165) solved from the other statements («AB = 2a» · «AB = a + 3» → a = 3). Lowering reads
   *  `value ?? derived`; the figure's labels read `value` only, so they stay as the student typed them. */
  vars: Map<string, { value?: number; derived?: number; bindings: Binding[] }>;
  /** #2165 ([ADR-681](docs/06-decisions.md#adr-681)) — the statements the letter system REFUSES, keyed by their index in
   *  the command list the table was built from: `at` is the index of the earlier statement they contradict, `status`
   *  the fold status (without the `[vs #i]` tail the fold adds). */
  refused: Map<number, { at: number; status: string }>;
  /** The FREE-radius circle the symbol R denotes, plus a point on it that witnesses the radius
   *  (|center→witness| = R). Set only when R has no fixed value — it lets an "AB = √2R" measure
   *  lower to a {@link LengthRadiusConstraint} that couples the length to the free radius DOF (ADR-071). */
  radiusCircle?: { id: Id; center: Id; witness: Id };
  /** PER-CIRCLE radius symbols (issue #54 — the ADR-034 auto-bind generalized): each explicitly-bound
   *  letter ("מעגל שרדיוסו r" / "רדיוס מעגל O הוא R" → `radius-symbol`) maps to ITS circle, with a
   *  witness point when one is known (a measure using the symbol couples to THAT circle's radius DOF;
   *  a missing witness is minted at lowering). Explicit bindings win over the legacy single-circle
   *  {@link radiusCircle} fallback, which stays for the unbound reserved R/r. */
  radiusOf: Map<string, { id: Id; center: Id; witness?: Id }>;
}

/** A point id known to lie on circle `circleId` (so its distance to the centre IS the radius), or null. */
function pointOnCircle(cmds: AnyCommand[], circleId: Id): Id | null {
  for (const c of cmds) {
    if (c.type === 'point-on-circle' && c.circle === circleId) return c.id;
    if (c.type === 'arc-midpoint' && c.circle === circleId) return c.id;
    if (c.type === 'line-circle-intersection' && c.circle === circleId) return c.id;
    if (c.type === 'circle-circle-intersection' && (c.circle1 === circleId || c.circle2 === circleId)) return c.id;
    if (c.type === 'diameter' && c.circle === circleId) return c.id1;
    if (c.type === 'extend-onto-circle' && c.circle === circleId) return c.id;
  }
  return null;
}

/**
 * #2083 ([ADR-646](docs/06-decisions.md#adr-646)) — the circle a command DEFINES, or null. A circle object is
 * made by exactly three command kinds: `circle` (a centre and a radius), `circle-through` (a centre and a
 * point on it — an incircle, a through-circle) and `circumcircle`.
 */
export function circleDefinedBy(cmd: AnyCommand): { id: Id; center: Id } | null {
  return cmd.type === 'circle' || cmd.type === 'circle-through' || cmd.type === 'circumcircle' ? { id: cmd.id, center: cmd.center } : null;
}

/**
 * #2083 ([ADR-646](docs/06-decisions.md#adr-646)) — a `circle` command that STATES NO SIZE: `freeRadius` (the
 * radius is a DOF seeded at a default, ADR-051) or `ifAbsent` (a parser-injected ensure-exists). When its
 * circle already exists such a command is a REFERENCE to that circle, never a resize: it says nothing the
 * circle's own definition (a stated radius, a through-point, an incircle, an inscribed polygon's circle)
 * does not already say. Only a stated radius re-states a circle's size (ADR-011's in-place resize).
 */
export function isSizelessCircle(cmd: AnyCommand): cmd is Extract<Command, { type: 'circle' }> {
  return cmd.type === 'circle' && (!!cmd.freeRadius || !!cmd.ifAbsent);
}

/**
 * #2083 ([ADR-646](docs/06-decisions.md#adr-646)) — is `cmd` a REFERENCE to the existing circle `existing`
 * (its id and centre)? A sizeless circle over that id, either an ensure-exists (`ifAbsent`: it never states
 * anything) or one naming the SAME centre. A sizeless circle naming ANOTHER centre still states something —
 * where the centre is (a context-free «C על מעגל O» naming an unnamed circle's anonymous centre) — and keeps
 * the old re-statement path. The one predicate behind the fold rule (`foldCommand` in `src/replay/core.ts`)
 * and `applyCommand`'s `circle` case.
 */
export function referencesCircle(cmd: AnyCommand, existing: { id: Id; center: Id }): boolean {
  return isSizelessCircle(cmd) && cmd.id === existing.id && (!!cmd.ifAbsent || cmd.center === existing.center);
}

const sameRefs = (a: Id[], b: Id[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
/** #2061 (ADR-661): the same SEGMENT (an unordered pair) or the same ANGLE (its vertex and an unordered ray pair) —
 *  «BA» is «AB», «∠CBA» is «∠ABC». A measure on its letter's own representative target lowers to nothing; read in
 *  one order only, «∠CBA = 3α» after «∠ABC = 2α» lowered to ∠CBA = 1.5·∠ABC, one angle a multiple of itself. */
const sameSegment = (a: Id[], b: Id[]): boolean => a.length === 2 && b.length === 2 && ((a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]));
const sameAngle = (a: Id[], b: Id[]): boolean => a.length === 3 && b.length === 3 && a[0] === b[0] && sameSegment([a[1], a[2]], [b[1], b[2]]);

/**
 * #2023 + #2061 ([ADR-661](../../docs/06-decisions.md#adr-661)) — what a SYMBOLIC measure says about an angle or a
 * segment that an EARLIER statement already measured with a letter.
 *
 * The lowering keys a symbolic measure by its letter: «∠ABC = α» binds α, and a measure whose letter's
 * representative is its own target lowers to nothing (the representative stays free). So a second letter on the
 * same target («זוית B=α» · «זוית ABC=β») and the same letter with another coefficient («∠ABC=2α» · «∠ABC=3α»)
 * both lowered to NOTHING, and the submit door read the empty step as «כבר קיים» while the stated value vanished
 * (with the rays reversed the second became ∠CBA = 1.5·∠ABC, one angle set to a multiple of itself, which only a
 * flat triangle satisfies). This is the one question both cases ask, read off the statements alone:
 *
 * - `same` — the same letter, coefficient, power and constant: a true restatement (the honest «כבר קיים»);
 * - `coef-conflict` — the same letter and form with another coefficient: k₁·α = k₂·α forces α = 0, which no figure
 *   has — a contradiction of the earlier line (operator ruling 2026-10-14, #2061);
 * - `name-taken` — a FRESH letter (bound to nothing else before, no value) on a target whose earlier letters are all
 *   different: a second name for one angle or segment (operator rulings 2026-10-13, #2023).
 *
 * The target is the angle as its vertex plus an UNORDERED ray pair, the segment as an unordered pair, so either
 * spelling order is one case. Left alone (null — today's lowering judges them): a letter or an earlier letter that
 * has a VALUE (a number is a pin or a residual), a radius letter (it names the circle's radius, so «AB = R» is a
 * relation), a new letter already bound to ANOTHER quantity (then «AB = c» is the relation AB = CD), the same
 * letter in another form (a constant or a power: an equation the solver judges, «AB = 2a» · «AB = a + 3»), and
 * areas and arc lengths (outside both rulings).
 *
 * #2191 ([ADR-720](../../docs/06-decisions.md#adr-720)) — an ALIAS is a name for the same one-name rule: «נסמן זוית
 * ABC כ-B2» on an angle an earlier ALIAS already named (A1) is `name-taken` at that first alias, and the identical
 * alias is `same` (null status, today's path). Only alias against alias is compared: a measure letter beside an
 * alias is not a second name (ruling #2113 B), so neither arm ever reads the other kind.
 *
 * `prior` is the statements BEFORE this one, in order; `at` is the index in `prior` of the earlier statement the
 * verdict is about (its first measure of that target, or for `coef-conflict` the first with that letter).
 */
export type RestatedNaming = Extract<SymbolicCommand, { type: 'measure-length' | 'measure-angle' }> | Extract<AnyCommand, { type: 'angle-alias' }>;
export type MeasureRestatement = { kind: 'same' | 'coef-conflict' | 'name-taken'; at: number; earlier: RestatedNaming };
export function measureRestatement(cmd: AnyCommand, prior: readonly AnyCommand[], tab: SymTab): MeasureRestatement | null {
  const pair = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  if (cmd.type === 'angle-alias') {
    const key = (c: { vertex: Id; ray1: Id; ray2: Id }) => `${c.vertex}:${pair(c.ray1, c.ray2)}`;
    const at = prior.findIndex((c) => c.type === 'angle-alias' && key(c) === key(cmd));
    if (at < 0) return null;
    const earlier = prior[at] as Extract<AnyCommand, { type: 'angle-alias' }>;
    const same = prior.findIndex((c) => c.type === 'angle-alias' && key(c) === key(cmd) && c.name === cmd.name);
    return same >= 0 ? { kind: 'same', at: same, earlier: prior[same] as RestatedNaming } : { kind: 'name-taken', at, earlier };
  }
  if (cmd.type !== 'measure-length' && cmd.type !== 'measure-angle') return null;
  const e = cmd.expr;
  if (!('var' in e)) return null;
  const valued = (name: string) => tab.vars.get(name)?.value !== undefined;
  const radiusLetter = (name: string) => tab.radiusOf.has(name) || /^[Rr]$/.test(name);
  if (valued(e.var) || radiusLetter(e.var)) return null;
  const targetOf = (c: AnyCommand): string | null =>
    c.type === 'measure-length' ? `len:${pair(c.a, c.b)}` : c.type === 'measure-angle' ? `ang:${c.vertex}:${pair(c.ray1, c.ray2)}` : null;
  const target = targetOf(cmd);
  type M = Extract<SymbolicCommand, { type: 'measure-length' | 'measure-angle' }>;
  const onTarget: { i: number; c: M }[] = [];
  let boundElsewhere = false;
  prior.forEach((c, i) => {
    if ((c.type !== 'measure-length' && c.type !== 'measure-angle') || !('var' in c.expr)) return;
    if (targetOf(c) === target) onTarget.push({ i, c });
    else if (c.expr.var === e.var) boundElsewhere = true;
  });
  if (onTarget.length === 0) return null;
  const form = (x: MeasureExpr) => ('var' in x ? `${x.pow ?? 1}|${x.const ?? 0}` : '');
  const sameLetter = onTarget.filter(({ c }) => 'var' in c.expr && c.expr.var === e.var);
  if (sameLetter.length > 0) {
    const exact = sameLetter.find(({ c }) => 'var' in c.expr && form(c.expr) === form(e) && c.expr.coef === e.coef);
    if (exact) return { kind: 'same', at: exact.i, earlier: exact.c };
    // #1851 (ADR-662): the same letter and coefficient with ANOTHER CONSTANT («∠ABC = α» · «∠ABC = α + 40») is the same
    // contradiction in another spelling — no α satisfies both
    const sameShape = (x: MeasureExpr) => 'var' in x && (x.pow ?? 1) === (e.pow ?? 1);
    const conflict = sameLetter.find(({ c }) => 'var' in c.expr && ((form(c.expr) === form(e) && c.expr.coef !== e.coef) || (sameShape(c.expr) && c.expr.coef === e.coef && (c.expr.const ?? 0) !== (e.const ?? 0))));
    return conflict ? { kind: 'coef-conflict', at: conflict.i, earlier: conflict.c } : null;
  }
  if (boundElsewhere) return null;
  const first = onTarget[0];
  if (!('var' in first.c.expr) || valued(first.c.expr.var) || radiusLetter(first.c.expr.var)) return null;
  return { kind: 'name-taken', at: first.i, earlier: first.c };
}

/**
 * The fold status a refused restatement carries (#2023 + #2061, ADR-661), without the `[vs #i]` tail the fold adds.
 * `coef-conflict` is the over-constrained frame («∠ABC = 3α cannot hold», «|AB| = 3a cannot hold» — the refused
 * measure, in the refused line's own letter order); `name-taken` names the target as the refused line spells it and
 * the earlier letter as the student wrote it. `same` refuses nothing (null). A second ALIAS (#2191, ADR-720) is the
 * same `name-taken` frame, naming the earlier alias's full bound name (A1).
 */
export function measureRestatementStatus(cmd: RestatedNaming, r: MeasureRestatement, tab: SymTab): string | null {
  if (cmd.type === 'angle-alias' || r.earlier.type === 'angle-alias') {
    if (r.kind !== 'name-taken' || cmd.type !== 'angle-alias' || r.earlier.type !== 'angle-alias') return null;
    return `name-taken: angle ${cmd.ray1}${cmd.vertex}${cmd.ray2} is already named ${r.earlier.name}`;
  }
  const angle = cmd.type === 'measure-angle';
  const name = cmd.type === 'measure-angle' ? `${cmd.ray1}${cmd.vertex}${cmd.ray2}` : `${cmd.a}${cmd.b}`;
  if (r.kind === 'coef-conflict') return `over-constrained: ${angle ? `∠${name}` : `|${name}|`} = ${measureLabelText(cmd, tab)} cannot hold`;
  if (r.kind === 'name-taken') return `name-taken: ${angle ? 'angle' : 'segment'} ${name} is already named ${measureLabelText(r.earlier, tab)}`;
  return null;
}

/** Build the symbol table from a command list: each variable's value (if given) and its bindings, in order. */
export function buildSymTab(cmds: AnyCommand[]): SymTab {
  const vars: SymTab['vars'] = new Map();
  const slot = (name: string) => {
    let v = vars.get(name);
    if (!v) vars.set(name, (v = { bindings: [] }));
    return v;
  };
  for (const c of cmds) {
    if (c.type === 'set-var') slot(c.name); // its value is the letter system's to accept (#2165, below) — never the last one written
    else if (c.type === 'measure-length' && 'var' in c.expr) slot(c.expr.var).bindings.push({ kind: 'len', refs: [c.a, c.b], coef: c.expr.coef, pow: c.expr.pow, affine: (c.expr.const ?? 0) !== 0 });
    else if (c.type === 'measure-angle' && 'var' in c.expr) slot(c.expr.var).bindings.push({ kind: 'ang', refs: [c.vertex, c.ray1, c.ray2], coef: c.expr.coef, affine: (c.expr.const ?? 0) !== 0 });
    else if (c.type === 'measure-area' && 'var' in c.expr) slot(c.expr.var).bindings.push({ kind: 'area', refs: c.ids, coef: c.expr.coef, pow: c.expr.pow, affine: (c.expr.const ?? 0) !== 0, ...(c.round ? { round: c.round } : {}) });
    else if (c.type === 'measure-perimeter' && 'var' in c.expr) slot(c.expr.var).bindings.push({ kind: 'perim', refs: c.ids, coef: c.expr.coef, pow: c.expr.pow, affine: (c.expr.const ?? 0) !== 0, ...(c.round ? { round: c.round } : {}) });
  }
  // The reserved radius symbol R always denotes the circle's radius (ADR-034): if a measure uses it
  // but no explicit value was given, bind R to the (first FIXED-radius) circle's radius — so
  // "OC = 0.5R" sizes against the radius without the student having to declare "radius R" separately.
  // A FREE-radius circle (bare "circle O", no stated size — ADR-051/052) is deliberately EXCLUDED: its
  // radius is a free DOF, so freezing R to its default would silently pin the size the question left
  // free and lower "AB = √2R" to a FIXED distance that fights the free radius (seed-fragile
  // over-constraint). Left unvalued, R-measures couple through the ratio machinery instead
  // (|BO| = (1/√2)|AB| for "AB=√2R" + "BO=R"), keeping the figure scalable.
  // PER-CIRCLE radius symbols (issue #54): every explicit `radius-symbol` binding maps its letter to
  // its circle (+ a witness point on it when the figure has one — the lowering mints one otherwise).
  // Explicit bindings WIN over the legacy reserved-R fallback below.
  const radiusOf: SymTab['radiusOf'] = new Map();
  for (const c of cmds) {
    if (c.type !== 'radius-symbol') continue;
    const circ = cmds.find((x) => (x.type === 'circle' || x.type === 'circle-through' || x.type === 'circumcircle') && x.id === c.circle) as
      | { id: Id; center: Id }
      | undefined;
    if (circ) radiusOf.set(c.name, { id: circ.id, center: circ.center, witness: pointOnCircle(cmds, circ.id) ?? undefined });
  }
  // #2165 (ADR-681): every source of a letter's value, judged in list order — the stated values, the derived ones,
  // and the statements that contradict an earlier one.
  const sys = letterSystem(cmds, radiusOf);
  for (const [name, v] of vars) {
    const s = sys.values.get(name);
    if (!s) continue;
    if (s.stated !== undefined) v.value = s.stated;
    else if (s.derived !== undefined) v.derived = s.derived;
  }
  // Legacy reserved-R fallback (ADR-034/071) — now per SPELLING (R and r are the same reserved symbol
  // only while UNBOUND; an explicit per-circle binding above removes the spelling from this fallback).
  // #2165 (ADR-681, ADR-034 Am. 2): with EXACTLY ONE stated-size circle the reserved letter is an equation of the
  // letter system (its value is derived from that radius, and a contradicting value is refused); the fallback
  // below keeps today's reading for two or more stated circles (which one r names is unruled).
  // #2111 (ADR-699, ADR-071 Am. 1): the FREE-radius branch below also runs for a letter with a STATED value. ADR-071's
  // "no value" gate was there so the fallback never froze a free radius to its DEFAULT — a value the student stated is
  // not a default: it is the radius (ADR-034 Am. 1), and the measure lowers it into the circle (`lowerOne`). The
  // fixed-radius branch keeps its gate (a valued letter there is the letter system's equation, #2165).
  let radiusCircle: SymTab['radiusCircle'];
  for (const name of ['R', 'r']) {
    const rad = vars.get(name);
    if (!rad || radiusOf.has(name)) continue;
    const circ = cmds.find(
      (c) => c.type === 'circle' && typeof (c as { radius?: unknown }).radius === 'number' && !(c as { freeRadius?: boolean }).freeRadius,
    ) as { radius: number } | undefined;
    if (circ) {
      if (rad.value === undefined) rad.value = circ.radius;
    } else if (!radiusCircle) {
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
  return { vars, radiusCircle, radiusOf, refused: sys.refused };
}

/** A letter's value as the lowering reads it: the stated value, else the one the letter system derived (#2165). */
const valueOf = (tab: SymTab, name: string): number | undefined => {
  const v = tab.vars.get(name);
  return v?.value ?? v?.derived;
};

/** The circles whose SIZE a statement states: a `circle` with a number radius (not a free or ensure-exists one), or a
 *  `set-radius` (every typed radius / circumference / area spelling). */
export function statedSizeCircles(cmds: readonly AnyCommand[]): Set<Id> {
  const out = new Set<Id>();
  for (const c of cmds) {
    if (c.type === 'circle' && !c.freeRadius && !c.ifAbsent) out.add(c.id); // not `isSizelessCircle` (ADR-646)
    else if (c.type === 'set-radius') out.add(c.circle);
  }
  return out;
}

/**
 * #2165 + #2135 + #2133 ([ADR-681](../../docs/06-decisions.md#adr-681)) — THE LETTER SYSTEM: every statement that gives
 * a letter a value, judged against the others in LIST ORDER.
 *
 * Letters used to be resolved by substitution alone: the last `set-var` won (#2135), a measure on its letter's own
 * target lowered to nothing whatever its form («AB = 2a» · «AB = a + 3» answered «כבר קיים», #2165), and the reserved
 * r stopped naming the radius once it had a value (#2133). This is the one place those sources meet. It collects the
 * LINEAR SINGLE-LETTER equations each statement states, keyed by TARGET — a segment (unordered pair), an angle (its
 * vertex and an unordered ray pair) or a circle's radius — and decides each row on arrival:
 *
 * - **consistent** — the row adds nothing new, or it DETERMINES a letter with an admissible value (every length and
 *   radius above 0, every angle in (0°, 360°)); the value is recorded as `derived`;
 * - **inconsistent** — `0 = c ≠ 0`, a second different value, or an inadmissible one: the row is REFUSED with the index
 *   of the statement that supplied the earlier value (a `set-var`, the number on the target, or the later of two
 *   expressions), else the earlier expression on the same target; its equations are dropped for the rows after it.
 *
 * Sources: `set-var x = v`; two expressions on one target, or an expression against a number (`measure-*`,
 * `set-distance`, `set-angle`, a stated radius); a `radius-symbol` on a circle; the reserved R/r when exactly one
 * circle has a stated size (ADR-034 Am. 1 — R/r always names the radius, now also when it has a value). Two NUMBERS
 * on one length or angle target are left to the solve (a residual, judged and attributed by the fold as before).
 * Multi-letter equations, powers of an unknown, and area / perimeter targets add nothing: today's ratio lowering keeps
 * them. Pure and deterministic; O(rows × statements on the row's target).
 */
export function letterSystem(
  cmds: readonly AnyCommand[],
  radiusOf: SymTab['radiusOf'],
): { values: Map<string, { stated?: number; derived?: number }>; refused: SymTab['refused'] } {
  type Lin = { coef: number; var: string; pow: number; konst: number };
  type Entry = { num: number; row: number } | { lin: Lin; row: number };
  type Target = { key: string; kind: 'len' | 'ang' | 'radius'; name: string; circle?: Id };
  /** `row` — the statement that supplied the value (the `[vs #i]` a later contradiction names) */
  const values = new Map<string, { stated?: number; derived?: number; row: number }>();
  const refused: SymTab['refused'] = new Map();
  const entries = new Map<string, Entry[]>();
  /** each letter's targets so far — for the admissibility test and the refusal's reason */
  const bindings = new Map<string, { t: Target; lin: Lin }[]>();
  const pair = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const known = (name: string): number | undefined => {
    const v = values.get(name);
    return v?.stated ?? v?.derived;
  };
  const at = (l: Lin, v: number) => l.coef * Math.pow(v, l.pow) + l.konst;
  const valueOfEntry = (x: Entry): number | undefined => {
    if ('num' in x) return x.num;
    const v = known(x.lin.var);
    return v === undefined ? undefined : at(x.lin, v);
  };
  /** the statement that supplied an entry's value: its own row for a number, else its letter's determining row */
  const provenance = (x: Entry): number => ('num' in x ? x.row : (values.get(x.lin.var)?.row ?? x.row));
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const admissible = (t: Target, v: number) => (t.kind === 'ang' ? v > 1e-9 && v < 360 - 1e-9 : v > 1e-9);
  const whatOf = (t: Target, v: number) =>
    t.kind === 'radius' ? `radius of ${t.circle} = ${formatMeasure(v)}` : t.kind === 'ang' ? `∠${t.name} = ${formatMeasure(v)}°` : `|${t.name}| = ${formatMeasure(v)}`;
  const overConstrained = (what: string) => `over-constrained: ${what} cannot hold`;
  /** the refused measure in its own letters — ADR-661's coef-conflict frame («|AB| = 3a cannot hold») */
  const ownText = (t: Target, row: number): string => {
    const c = cmds[row];
    if ((c.type !== 'measure-length' && c.type !== 'measure-angle') || !('var' in c.expr)) return whatOf(t, 0);
    const k = c.expr.const ?? 0;
    const txt = c.expr.text ?? `${c.expr.coef === 1 ? '' : formatMeasure(c.expr.coef)}${powVar(c.expr.var, c.expr.pow)}${k ? ` ${k > 0 ? '+' : '−'} ${formatMeasure(Math.abs(k))}` : ''}`;
    return c.type === 'measure-angle' ? `∠${c.ray1}${c.vertex}${c.ray2} = ${txt}` : `|${c.a}${c.b}| = ${txt}`;
  };
  /** a value refused for letter `name`: reported on its radius when it names one (R/r always does), else on its first
   *  length or angle — «|AB| = 4», what the value would have made of the figure */
  const reasonFor = (name: string, v: number): string => {
    const bs = bindings.get(name) ?? [];
    const b = bs.find((x) => x.t.kind === 'radius') ?? bs[0];
    return overConstrained(b ? whatOf(b.t, at(b.lin, v)) : `${name} = ${formatMeasure(v)}`);
  };
  const bind = (t: Target, lin: Lin) => {
    const bs = bindings.get(lin.var) ?? [];
    if (!bs.some((b) => b.t.key === t.key && b.lin.coef === lin.coef && b.lin.konst === lin.konst && b.lin.pow === lin.pow)) bs.push({ t, lin });
    bindings.set(lin.var, bs);
  };
  /** would `name = v` keep every target the letter measures (with the row's own) admissible? */
  const admissibleFor = (name: string, v: number, own: { t: Target; lin: Lin }[]): boolean =>
    [...(bindings.get(name) ?? []), ...own].every((b) => b.lin.var !== name || admissible(b.t, at(b.lin, v)));
  const determine = (name: string, v: number, row: number) => values.set(name, { ...values.get(name), derived: v, row });

  // The reserved R/r (ADR-034 Am. 1): with exactly one stated-size circle, an unbound R/r names that circle's radius —
  // an equation on the radius target from the row where both the circle's size and the letter exist.
  const stated = statedSizeCircles(cmds);
  const reservedCircle = stated.size === 1 ? [...stated][0] : undefined;
  const centreOf = (id: Id) => (cmds.find((c) => circleDefinedBy(c)?.id === id) as { center?: Id } | undefined)?.center ?? id;
  const radiusTarget = (circle: Id): Target => ({ key: `rad:${circle}`, kind: 'radius', name: centreOf(circle), circle });
  const lettersOf = (c: AnyCommand): string[] =>
    c.type === 'set-var' ? [c.name] : (c.type === 'measure-length' || c.type === 'measure-angle') && 'var' in c.expr ? [c.expr.var] : [];
  const reservedBound = new Set<string>();
  const lin1 = (name: string): Lin => ({ coef: 1, var: name, pow: 1, konst: 0 });

  /**
   * Judge entry `e` on target `t` at row `i`: record it and return null when consistent, else return the refusal
   * (`status`, and `at` — the earlier statement it contradicts).
   */
  const judge = (i: number, t: Target, e: Entry): { status: string; at: number } | null => {
    const prior = entries.get(t.key) ?? [];
    const record = () => {
      prior.push(e);
      entries.set(t.key, prior);
      if ('lin' in e) bind(t, e.lin);
      return null;
    };
    const mine = valueOfEntry(e);
    // A radius is judged against the LATEST statement that sized the circle (#2119's `statedSizeOwner`: after a
    // same-size restatement, that restatement is what the student last said); a length or angle against its first.
    const knownOnes = prior.filter((x) => valueOfEntry(x) !== undefined);
    const fixed = t.kind === 'radius' ? knownOnes[knownOnes.length - 1] : knownOnes[0];
    if (fixed) {
      const tv = valueOfEntry(fixed)!;
      if (mine !== undefined) {
        if (same(mine, tv)) return record();
        // Two NUMBERS on a length or angle are a residual the solve judges and the fold attributes, as before. A radius
        // is not: a stated radius is a SIZE, not a constraint, so no residual ever sees it — a second, different size for
        // a circle (a restated radius, circumference or area, a radius letter's value) is refused here (#2119, ADR-683).
        if (t.kind !== 'radius') return record();
        const other = 'lin' in e ? provenance(e) : provenance(fixed);
        return { status: overConstrained(whatOf(t, mine)), at: other === i ? provenance(fixed) : other };
      }
      // an unknown letter against a known target: solve it
      const l = (e as { lin: Lin }).lin;
      if (l.pow !== 1) return record();
      const v = (tv - l.konst) / l.coef;
      if (!admissibleFor(l.var, v, [{ t, lin: l }])) return { status: overConstrained(whatOf(t, tv)), at: provenance(fixed) };
      determine(l.var, v, 'num' in fixed ? fixed.row : i);
      return record();
    }
    const first = prior.find((x): x is { lin: Lin; row: number } => 'lin' in x);
    if (!first) return record();
    const f = first.lin;
    if (mine !== undefined) {
      // a number (or a known letter) against an unknown expression: solve the expression's letter
      if (f.pow !== 1) return record();
      const v = (mine - f.konst) / f.coef;
      if (!admissibleFor(f.var, v, [])) return { status: overConstrained(whatOf(t, mine)), at: first.row };
      determine(f.var, v, 'num' in e ? e.row : i);
      return record();
    }
    const l = (e as { lin: Lin }).lin;
    if (l.var !== f.var || l.pow !== 1 || f.pow !== 1) return record(); // two letters, or a power: no single-letter equation
    // the same letter twice on one target: (c₁ − c₂)·x = k₂ − k₁
    const dc = f.coef - l.coef;
    const dk = l.konst - f.konst;
    if (Math.abs(dc) <= 1e-12) return Math.abs(dk) <= 1e-12 ? record() : { status: overConstrained(ownText(t, i)), at: first.row };
    // the same constant with another coefficient forces x = 0 — ADR-661's ruled contradiction («∠ABC=2α» · «∠ABC=3α»,
    // operator 2026-10-14: «no α satisfies both»), the one verdict the `measureRestatement` coef-conflict arm also gives
    if (Math.abs(dk) <= 1e-12) return { status: overConstrained(ownText(t, i)), at: first.row };
    const v = dk / dc;
    if (!admissibleFor(l.var, v, [{ t, lin: l }])) return { status: overConstrained(ownText(t, i)), at: first.row };
    determine(l.var, v, i);
    return record();
  };
  const targetOf = (c: AnyCommand, i: number): { t: Target; e: Entry } | null => {
    const entry = (x: MeasureExpr): Entry => ('value' in x ? { num: x.value, row: i } : { lin: { coef: x.coef, var: x.var, pow: x.pow ?? 1, konst: x.const ?? 0 }, row: i });
    const len = (a: Id, b: Id): Target => ({ key: `len:${pair(a, b)}`, kind: 'len', name: `${a}${b}` });
    const ang = (v: Id, r1: Id, r2: Id): Target => ({ key: `ang:${v}:${pair(r1, r2)}`, kind: 'ang', name: `${r1}${v}${r2}` });
    switch (c.type) {
      case 'measure-length':
        return { t: len(c.a, c.b), e: entry(c.expr) };
      case 'measure-angle':
        return { t: ang(c.vertex, c.ray1, c.ray2), e: entry(c.expr) };
      case 'set-distance':
        return { t: len(c.a, c.b), e: { num: c.value, row: i } };
      case 'set-angle':
        return { t: ang(c.vertex, c.ray1, c.ray2), e: { num: c.value, row: i } };
      case 'circle':
        return c.freeRadius || c.ifAbsent ? null : { t: radiusTarget(c.id), e: { num: c.radius, row: i } }; // a sizeless circle states no size (ADR-646)
      case 'set-radius':
        return { t: radiusTarget(c.circle), e: { num: c.value, row: i } };
      case 'radius-symbol':
        return { t: radiusTarget(c.circle), e: { lin: lin1(c.name), row: i } };
      default:
        return null;
    }
  };
  /** a letter some statement binds (#926's question, asked of the whole list): a value for an unbound letter waits */
  const letterIsBound = (name: string): boolean =>
    radiusOf.has(name) || bindings.has(name) || cmds.some((c) => c.type !== 'set-var' && lettersOf(c).includes(name)) || (/^[Rr]$/.test(name) && reservedCircle !== undefined);
  const refuse = (i: number, r: { status: string; at: number } | null) => {
    if (r && !refused.has(i)) refused.set(i, r);
  };
  const bindReserved = (i: number, name: string) => {
    reservedBound.add(name);
    const r = judge(i, radiusTarget(reservedCircle!), { lin: lin1(name), row: i });
    // the row that brought the letter and the radius together carries the contradiction, in the frame of its own value
    if (r) refuse(i, cmds[i].type === 'set-var' ? { status: reasonFor(name, (cmds[i] as { value: number }).value), at: r.at } : r);
  };

  cmds.forEach((c, i) => {
    // #2177 (ADR-733, ADR-034 Am. 3): a row that values or uses the reserved letter when it cannot name one circle
    // is refused before anything is judged — nothing is picked for the student.
    const ambiguous = reservedAmbiguity(cmds, i, radiusOf);
    if (ambiguous) {
      refuse(i, { status: ambiguous, at: i });
      return;
    }
    if (reservedCircle !== undefined && cmds.slice(0, i).some((x) => statedSizeCircles([x]).has(reservedCircle))) {
      for (const name of lettersOf(c)) if (/^[Rr]$/.test(name) && !radiusOf.has(name) && !reservedBound.has(name)) bindReserved(i, name);
    }
    if (refused.has(i)) return;
    if (c.type === 'set-var') {
      const k = known(c.name);
      if (k === undefined) {
        values.set(c.name, { ...values.get(c.name), stated: c.value, row: i }); // its admissibility is the solve's, as before
        return;
      }
      if (same(k, c.value)) {
        const v = values.get(c.name)!;
        if (v.stated === undefined) values.set(c.name, { ...v, stated: c.value });
        return;
      }
      if (letterIsBound(c.name)) refuse(i, { status: reasonFor(c.name, c.value), at: values.get(c.name)!.row });
      return;
    }
    const t = targetOf(c, i);
    if (t) refuse(i, judge(i, t.t, t.e));
    // a size stated for the reserved circle makes the letter, already in use, an equation on it from here on
    if (!refused.has(i) && reservedCircle !== undefined && statedSizeCircles([c]).has(reservedCircle)) {
      for (const name of ['R', 'r']) {
        if (radiusOf.has(name) || reservedBound.has(name) || !cmds.slice(0, i).some((x) => lettersOf(x).includes(name))) continue;
        bindReserved(i, name);
      }
    }
  });

  const out = new Map<string, { stated?: number; derived?: number }>();
  for (const [k, v] of values) out.set(k, { ...(v.stated !== undefined ? { stated: v.stated } : {}), ...(v.derived !== undefined ? { derived: v.derived } : {}) });
  return { values: out, refused };
}

/**
 * #2177 ([ADR-733](../../docs/06-decisions.md#adr-733), ADR-034 Am. 3) — THE RESERVED R/r NAMES ONE CIRCLE OR NONE.
 *
 * Operator ruling 2026-10-16 (ballot card 3, fallback B; second pass: one sized circle beside an unsized one too):
 * with several circles, the reserved radius letter is not resolved by list order. «מעגל O ברדיוס 3» · «מעגל P ברדיוס 5»
 * · «r = 4» committed green and the 4 constrained nothing (the fallback took the first sized circle, and a valued letter
 * skipped it); «AB = r» silently used O's radius. **The class:** *the reserved letter is resolved by list order on a
 * figure with several circles, so a choice the student never made is taken.*
 *
 * Row `i` values or uses an unbound R/r (no `radius-symbol` binds that spelling) while the circles stated before it are
 * two or more with at least one stated size → the raw refusal
 * `reserved radius ambiguous: r names no one circle of O, P (stated sizes|circles)`: the circles with a stated size
 * when two or more have one, else every circle. Two or more circles with NO stated size are left as they were (not in
 * the ruling). A letter used while only one circle existed keeps the meaning it had when it was written. Null otherwise.
 */
export function reservedAmbiguity(cmds: readonly AnyCommand[], i: number, radiusOf: SymTab['radiusOf']): string | null {
  const c = cmds[i];
  const used = c.type === 'set-var' ? [c.name] : c.type === 'radius-symbol' ? [] : symbolsConsumedBy(c);
  const letter = used.find((n) => /^[Rr]$/.test(n) && !radiusOf.has(n));
  if (!letter) return null;
  const circles = new Map<Id, Id>(); // circle id → its centre letter, in the order the student stated them
  for (const x of cmds.slice(0, i)) {
    const d = circleDefinedBy(x);
    if (d && !circles.has(d.id)) circles.set(d.id, d.center);
  }
  if (circles.size < 2) return null;
  const sized = statedSizeCircles(cmds.slice(0, i));
  const sizedIds = [...circles.keys()].filter((id) => sized.has(id));
  if (sizedIds.length === 0) return null;
  const named = sizedIds.length >= 2 ? sizedIds : [...circles.keys()];
  return `reserved radius ambiguous: ${letter} names no one circle of ${named.map((id) => circles.get(id)).join(', ')} (${sizedIds.length >= 2 ? 'stated sizes' : 'circles'})`;
}

/**
 * #926 (ADR-483, ADR-W-044) — does ANY statement give `name` a meaning? A letter is bound when a measure
 * uses it («∠ABC = α», «AB = 3x»), when a circle carries it as its radius symbol («מעגל שרדיוסו r»), or
 * when it is the reserved radius R/r and the figure has a circle to denote (ADR-034/071). A `set-var`
 * on a letter nothing binds — «α = 70» after «∠ABC = α» was deleted or muted — is a value for a subject
 * the figure no longer has: it lowers to nothing, so without this question it would sit green in the
 * list while constraining nothing. Asked of the whole-list table, so the definition may sit ANYWHERE
 * in the list, including after the value row (a definition the student deleted and re-added).
 */
export function isSymbolBound(tab: SymTab, name: string, cmds: readonly AnyCommand[]): boolean {
  if ((tab.vars.get(name)?.bindings.length ?? 0) > 0) return true;
  if (tab.radiusOf.has(name)) return true;
  return /^[Rr]$/.test(name) && (tab.radiusCircle !== undefined || cmds.some((c) => c.type === 'circle' || c.type === 'circle-through' || c.type === 'circumcircle'));
}

/**
 * #1658 ([ADR-562](../../docs/06-decisions.md#adr-562)) — the VARIABLE statements: a value for a letter
 * (`set-var`, «α = 70») and a relation over letters (`measure-bound` «0 < k < 6», `measure-order`
 * «α < β»). Each is about a letter some OTHER statement must give a meaning, and each lowers to nothing
 * until one does.
 */
export const isVariableStatement = (cmd: AnyCommand): boolean =>
  cmd.type === 'set-var' || cmd.type === 'measure-bound' || cmd.type === 'measure-order';

/**
 * The first letter a variable statement is ABOUT that no statement binds, or null (#926 → #1658). #926
 * asked it of `set-var` only, so «0 < k < 6» on a figure with no k — a bound, the same kind of statement
 * about the same kind of letter — lowered to nothing with no mark, and the submit lane called it «already
 * drawn» while the bound vanished. One question for the whole family.
 */
export function unboundSubjectOf(cmd: AnyCommand, tab: SymTab, cmds: readonly AnyCommand[]): string | null {
  if (!isVariableStatement(cmd)) return null;
  const names = cmd.type === 'set-var' ? [cmd.name] : symbolsConsumedBy(cmd);
  return names.find((n) => !isSymbolBound(tab, n, cmds)) ?? null;
}

/**
 * A RELATION over letters that are all bound but that still lowers to nothing (#1658) — a bound on a
 * letter used as «k²» or «k + 2», an order between an angle letter and a length letter, a bound on an
 * area letter. Returns the letters, or null. The statement cannot be enforced, so it must not sit ✓.
 */
export function unenforceableRelation(cmd: AnyCommand, tab: SymTab, cmds: readonly AnyCommand[]): string[] | null {
  if (cmd.type !== 'measure-bound' && cmd.type !== 'measure-order') return null;
  if (unboundSubjectOf(cmd, tab, cmds)) return null; // waiting for a definition — the #926 register
  return lowerOne(cmd, tab).length === 0 ? symbolsConsumedBy(cmd) : null;
}

/**
 * The symbol names a command READS from the table ([ADR-492](../../docs/06-decisions.md#adr-492), #956).
 *
 * This is the whole class of "a magnitude arrives from a row other than the row that shaped it": every
 * command below lowers using `tab.vars`, so its constraint's VALUE can come from a `set-var` the student
 * wrote on a different line. Derived from {@link lowerOne}'s own `tab.vars.get` sites, so the two cannot
 * drift: if a future command starts reading the table, it belongs here and the blame rule covers it for
 * free. A command that reads nothing returns `[]` — the overwhelming majority, including every plain
 * numeric given, which is why the rule costs nothing on ordinary figures.
 */
export function symbolsConsumedBy(cmd: AnyCommand): string[] {
  switch (cmd.type) {
    case 'measure-length':
    case 'measure-angle':
    case 'measure-area':
    case 'measure-perimeter':
      return 'var' in cmd.expr ? [cmd.expr.var] : [];
    case 'measure-order':
      return [cmd.left, cmd.right];
    case 'measure-bound':
      return [cmd.name];
    case 'radius-symbol':
      return [cmd.name]; // #2101 (ADR-648): the binding row lowers the letter's value into its circle's size
    default:
      return [];
  }
}

/** Lower one command to the engine command(s) it produces (0+). Engine commands pass through unchanged. */
export function lowerOne(cmd: AnyCommand, tab: SymTab): Command[] {
  switch (cmd.type) {
    case 'set-var':
      return []; // pure data — only its referenced measures produce constraints
    case 'name-by-use':
      return []; // #1697: a naming, applied by `resolveBinds` before the fold — nothing for the engine
    case 'mark-angle':
      return []; // pure display (issue #106) — a valueless angle mark; the arms are their own `segment`s
    case 'radius-symbol': {
      // #2101 (ADR-648) — a letter BOUND as a circle's radius («מעגל O ברדיוס r», «שרדיוסו r», «רדיוס המעגל O
      // הוא r») is resolved by its binding exactly as «AB = x» is by its measure: once a `set-var` gives the
      // letter a value (on any row, before or after), the binding lowers to that circle's size — `set-radius`,
      // the stated-radius path (ADR-087/011) — beside the naming itself. Without a value it stays a name and
      // the radius stays a free DOF (ADR-052). A value whose letter names nothing is #926's register, not this.
      const value = valueOf(tab, cmd.name); // #2165: a value the letter system derived sizes the circle exactly as a stated one
      return value !== undefined ? [cmd, { type: 'set-radius', circle: cmd.circle, value }] : [cmd];
    }
    case 'measure-length': {
      const e = cmd.expr;
      if ('value' in e) return [{ type: 'set-distance', a: cmd.a, b: cmd.b, value: e.value }];
      const konst = e.const ?? 0;
      // |XY| = k·R against a FREE-radius circle (ADR-071): couple the length to the radius DOF. Only the
      // LINEAR case (pow 1) is a radius multiple; a √/² power of the radius falls through to the var path.
      // Resolution (issue #54): an EXPLICIT per-circle binding wins ("שרדיוסו r" → THAT circle); an
      // unbound reserved R/r falls back to the legacy single-circle bind. A bound circle with no known
      // on-circle witness gets a hidden pinned `~radw-*` rider minted here (idempotent at apply).
      // #2111 (ADR-699): the reserved fallback no longer lets go of a VALUED letter — «AB = r» · «r = 3» on a bare
      // circle: the measure row IS the letter's binding (as `radius-symbol` is for «מעגל O ברדיוס r», ADR-648), so it
      // also lowers the stated value into that circle's size. The circle is the one the unvalued r already names.
      const reserved = !tab.radiusOf.has(e.var) && /^[Rr]$/.test(e.var);
      const rc = tab.radiusOf.get(e.var) ?? (reserved ? tab.radiusCircle : undefined);
      if (rc && (e.pow ?? 1) === 1) {
        const witness = rc.witness ?? `~radw-${rc.id}`;
        const mint: Command[] = rc.witness ? [] : [{ type: 'point-on-circle', id: witness, circle: rc.id, theta: 0.9 }];
        const stated = reserved ? tab.vars.get(e.var)?.value : undefined;
        return [
          ...mint,
          { type: 'set-length-radius', a: cmd.a, b: cmd.b, circle: rc.id, center: rc.center, witness, k: e.coef, ...(konst ? { add: konst } : {}) },
          ...(stated !== undefined ? [{ type: 'set-radius', circle: rc.id, value: stated } as Command] : []),
        ];
      }
      const info = tab.vars.get(e.var);
      const known = valueOf(tab, e.var); // #2165 (ADR-681): stated, else derived by the letter system
      if (known !== undefined) {
        const len = e.coef * Math.pow(known, e.pow ?? 1) + konst; // 12√x with x=4 → 24; k+2 with k=4 → 6
        return [{ type: 'set-distance', a: cmd.a, b: cmd.b, value: len }];
      }
      // The representative must itself be pure (an affine binding can't anchor a ratio).
      const reps = info?.bindings.filter((b) => b.kind === 'len' && !b.affine) ?? [];
      const rep = reps[0];
      if (!rep || sameSegment(rep.refs, [cmd.a, cmd.b])) return []; // the representative (or sole binding) stays free
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
    case 'measure-area':
    case 'measure-perimeter': {
      // Mirrors `measure-length` but for an area (ADR-118) — or a round operand's boundary length (ADR-632): a value
      // → `set-area`/`set-perimeter`; a SHARED variable → the ratio against the representative binding of the SAME
      // kind; the representative / a lone label stays free. A round operand (a sector, an arc) travels with its side.
      const perim = cmd.type === 'measure-perimeter';
      const own = cmd.round ? { round: cmd.round } : {};
      const absolute = (value: number): Command[] =>
        perim ? [{ type: 'set-perimeter', ids: cmd.ids, value, ...own }] : [{ type: 'set-area', ids: cmd.ids, value, ...own }];
      const e = cmd.expr;
      if ('value' in e) return absolute(e.value);
      const konst = e.const ?? 0;
      const info = tab.vars.get(e.var);
      const known = valueOf(tab, e.var);
      if (known !== undefined) return absolute(e.coef * Math.pow(known, e.pow ?? 1) + konst);
      const reps = info?.bindings.filter((b) => b.kind === (perim ? 'perim' : 'area') && !b.affine) ?? [];
      const rep = reps[0];
      // the representative (or a lone "SABC = S" label) stays free. The SAME operand is the same letters AND the same
      // kind of operand: sector OAB and triangle OAB share letters and are two areas (ADR-632) — reading them as one
      // would drop the relation «S = area(OAB)» without a trace
      if (!rep || (sameRefs(rep.refs, cmd.ids) && JSON.stringify(rep.round ?? null) === JSON.stringify(cmd.round ?? null))) return [];
      if ((rep.pow ?? 1) !== (e.pow ?? 1) || konst !== 0) return []; // mixed exponent / affine → not a clean ratio
      const sides = { ids1: cmd.ids, ids2: rep.refs, k: e.coef / rep.coef, ...(cmd.round ? { round1: cmd.round } : {}), ...(rep.round ? { round2: rep.round } : {}) };
      return [perim ? { type: 'set-perimeter-ratio', ...sides } : { type: 'set-area-ratio', ...sides }];
    }
    case 'measure-angle': {
      const e = cmd.expr;
      const angle = (value: number): Command => ({ type: 'set-angle', vertex: cmd.vertex, ray1: cmd.ray1, ray2: cmd.ray2, value });
      if ('value' in e) return [angle(e.value)];
      // #1851 (ADR-662): a symbol plus a constant («α + 40») lowers as the length lane's affine measure does — the
      // constant joins the value once the letter has one, and rides an AFFINE ratio while it does not.
      const konst = e.const ?? 0;
      const info = tab.vars.get(e.var);
      const known = valueOf(tab, e.var);
      if (known !== undefined) return [angle(e.coef * known + konst)];
      // the representative must itself be pure (an affine binding cannot anchor a ratio — the length rule)
      const reps = info?.bindings.filter((b) => b.kind === 'ang' && !b.affine) ?? [];
      const rep = reps[0];
      if (!rep) return [];
      // ∠this = (coef/repCoef)·∠rep + const. On the representative's OWN angle the identical measure is the letter's
      // binding (nothing to add); another form there is the equation it states («∠ABC = 2α» · «∠ABC = α + 40» is
      // ∠ABC = ½∠ABC + 40, so α = 40). The same letter and coefficient with another constant never reaches here — it is
      // a contradiction, refused in the fold (`measureRestatement`, ADR-661).
      if (sameAngle(rep.refs, [cmd.vertex, cmd.ray1, cmd.ray2]) && e.coef === rep.coef && konst === 0) return [];
      return [
        { type: 'set-angle-ratio', v1: cmd.vertex, a1: cmd.ray1, b1: cmd.ray2, v2: rep.refs[0], a2: rep.refs[1], b2: rep.refs[2], k: e.coef / rep.coef, ...(konst ? { add: konst } : {}) },
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
    case 'measure-bound': {
      // "α > 40" / "60 < α < 90" (ADR-390) — the NUMERIC twin of `measure-order`, resolved through the
      // same first-binding lookup: whichever measure the variable names gets the bound. A variable that
      // names nothing yet, or a non-bare binding (2α, x², affine), is left alone — the same discipline
      // `measure-order` applies, since a coefficient makes the inequality mean something else.
      const B = tab.vars.get(cmd.name)?.bindings[0];
      if (!B) return [];
      // #1658 (ADR-562): a POSITIVE coefficient carries the window over exactly — «AB = 2k» with
      // «0 < k < 6» is 0 < |AB| < 12. It used to be left alone and the stated bound vanished with an
      // «already drawn» note. A power, a constant or a non-positive coefficient still lowers to nothing,
      // and `unenforceableRelation` marks that row instead of letting it sit green.
      if ((B.pow ?? 1) !== 1 || B.affine || !(B.coef > 0)) return [];
      const scale = (v: number | undefined) => (v === undefined ? undefined : v * B.coef);
      const min = scale(cmd.min);
      const max = scale(cmd.max);
      if (B.kind === 'ang') return [{ type: 'set-angle-bound', vertex: B.refs[0], ray1: B.refs[1], ray2: B.refs[2], min, max, minStrict: cmd.minStrict, maxStrict: cmd.maxStrict }];
      if (B.kind === 'len') return [{ type: 'set-length-bound', a: B.refs[0], b: B.refs[1], min, max, minStrict: cmd.minStrict, maxStrict: cmd.maxStrict }];
      return []; // an area binding has no bound constraint yet
    }
    case 'shape-variant':
      // The base shape + the variant-selected equal pairs (ADR-138). This fallback (no explicit equalities)
      // is the whole-list `lower()` / direct-caller path; `replay` calls `expandShapeVariant` itself with the
      // figure's explicit `set-equal`s so an explicit pair can PIN the variant.
      return expandShapeVariant(cmd, []);
    case 'inscribe':
      // Riders on the container's sides + the inscribed shape's defining constraints (ADR-262). Fallback path
      // (no explicit on-segment pin); `replay` calls `expandInscribe` with the figure's `point-on-segment`
      // givens so an explicit placement PINS the variant.
      return expandInscribe(cmd, []);
    case 'altitude-choice':
      // #2064 (ADR-644): the persisted option. This fallback (no stated right angles) is the whole-list path; `replay`
      // calls `expandAltitudeChoice` with the figure's stated right angles so a statement PINS the option.
      return expandAltitudeChoice(cmd, []);
    default:
      return [cmd as Command];
  }
}

/** Whole-list lowering: AnyCommand[] → Command[] the engine can apply (test/convenience helper). */
export function lower(cmds: AnyCommand[]): Command[] {
  const tab = buildSymTab(cmds);
  return cmds.flatMap((c) => lowerOne(c, tab));
}

const fmtNum = formatMeasure; // THE shared formatter (#164, ADR-393) — symbolic coefficients/values at 2dp

/** Render a variable with its exponent: ½ → √x, 2 → x², 3 → x³, n → x^n, else x. */
const powVar = (v: string, pow?: number): string => {
  if (pow === undefined || pow === 1) return v;
  if (pow === 0.5) return '√' + v;
  if (pow === 2) return v + '²';
  if (pow === 3) return v + '³';
  return v + '^' + fmtNum(pow);
};

/** Is this a symbolic measure fact (carries a display label)? */
export function isMeasure(cmd: AnyCommand): cmd is Extract<SymbolicCommand, { type: 'measure-length' | 'measure-angle' | 'measure-area' | 'measure-perimeter' }> {
  return cmd.type === 'measure-length' || cmd.type === 'measure-angle' || cmd.type === 'measure-area' || cmd.type === 'measure-perimeter';
}

/**
 * The two forms a measure label can take ([ADR-488](../../docs/06-decisions.md), issue #948 — the 2-D
 * adoption of [ADR-W-047](../../docs/06w-decisions-workspace.md#adr-w-047)).
 *
 * `text` is what prints today. `letter` is present **only when the student's own symbolic form differs
 * from it** — which is exactly the operator's *"only when displays compete"*: the same label can be
 * drawn two ways and the tool must not choose for them. So the competing predicate is not a list of
 * kinds to keep in sync; it is `letter !== undefined`, derived from the label builder itself. A measure
 * whose expression is a plain number, or one whose symbol stays symbolic anyway (a radius letter,
 * ADR-034), offers nothing to switch between and reports no `letter`.
 */
export interface MeasureLabelForms {
  /** What the figure prints by default — the resolved number once the variable has a value. */
  text: string;
  /** The SYMBOLIC form ("3x", "α"), present only when it differs from `text`. */
  letter?: string;
  /** The parameter whose VALUE made the forms differ — the letter whose chip governs this label. */
  sym?: string;
}

/**
 * Both forms of a symbolic measure's figure label. {@link measureLabelText} is the `text` half and
 * stays the one authority for it, so the printed string cannot drift from the switchable one.
 */
export function measureLabelForms(
  cmd: Extract<SymbolicCommand, { type: 'measure-length' | 'measure-angle' | 'measure-area' | 'measure-perimeter' }>,
  tab: SymTab,
): MeasureLabelForms {
  const e: MeasureExpr = cmd.expr;
  const isAngle = cmd.type === 'measure-angle';
  // A concrete value: show its faithful text ("12√2", "2π") if the parser kept one, else the number.
  if ('value' in e) return { text: e.text ?? fmtNum(e.value) + (isAngle ? '°' : '') };
  const symbolic = (): string => e.text ?? (e.coef === 1 ? '' : fmtNum(e.coef)) + powVar(e.var, e.pow);
  // The radius symbol stays symbolic on the figure ("1.6R") even when its value is known (ADR-034) —
  // it's a size relative to the radius, not a number the student picked. Applies to the reserved R/r
  // AND to any explicitly-bound per-circle radius symbol (issue #54). Already symbolic ⇒ nothing competes.
  if (/^[Rr]$/.test(e.var) || tab.radiusOf.has(e.var)) return { text: symbolic() };
  const info = tab.vars.get(e.var);
  // Resolved (the variable has a value): the computed number prints — and the symbolic form is the
  // alternative the student can switch back to. THIS is the competing case.
  if (info?.value !== undefined) {
    return {
      text: fmtNum(e.coef * Math.pow(info.value, e.pow ?? 1) + (e.const ?? 0)) + (isAngle ? '°' : ''),
      letter: symbolic(),
      sym: e.var,
    };
  }
  // Unresolved: the faithful original ("7k/5", "k+2") if kept, else derive from coef + exponent.
  return { text: symbolic() };
}

/**
 * The text to print on the figure for a symbolic measure: the resolved number once
 * its variable has a value (the user's choice — "3x" → "12"), else the expression
 * ("3x", "2α"). Angles get a trailing degree sign only when numeric/resolved.
 */
export function measureLabelText(cmd: Extract<SymbolicCommand, { type: 'measure-length' | 'measure-angle' | 'measure-area' | 'measure-perimeter' }>, tab: SymTab): string {
  return measureLabelForms(cmd, tab).text;
}
