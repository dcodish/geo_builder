/**
 * #1467 ([ADR-769](../../docs/06-decisions.md#adr-769), [ADR-W-162](../../docs/06w-decisions-workspace.md#adr-w-162);
 * operator ruling 2026-09-27, "Create everywhere + notice") — A STATEMENT THAT NAMES A POINT THE FIGURE LACKS CREATES
 * IT, exactly as the bare declaration «נקודה X» would, before the statement applies.
 *
 * Before this, 2-D created a referenced point only as a side effect: when the winning rule happened to emit a creating
 * command (the `segment` carrier of «M אמצע AB», a tangent's touch point). A constraint-only lowering — «AB = 2 AD»
 * (`set-ratio`), «AD:DB = 1:2», «שטח המשולש ABC הוא 13» (`measure-area`), «ישר ABE» (`set-line`), a cevian to a side
 * no shape has — created nothing, and the line was refused «… references an unknown point» on a blank page (#2048's
 * measurement; the operator's T36/T37 verdicts of 2026-10-24).
 *
 * WHICH operands are point references is not a hand-kept list here. The batch is applied STRUCTURALLY onto the
 * figure's points, and the result is read with the engine's own two total readers — {@link objectParents} (every
 * object's parents) and {@link constraintRefs} (every constraint's points) — the very readers `evaluate` uses to report
 * «undefined point» / «references an unknown point». A label-shaped id they reference that the result does not
 * contain is a missing point. A new command, object or constraint kind cannot be forgotten: the evaluator could not
 * run it without these readers. The store-level measures (`measure-length` and kin, ADR-031) are read by their own
 * operand fields, because their lowering needs the whole list's symbol table (a free «AB = k» lowers to a label only,
 * and must still create A and B).
 *
 * Nothing beyond the prerequisite is created: each missing point is a bare free point (ADR-052: a free DOF, placed in
 * general position by `free-point`'s ADR-378/ADR-660 probe), `ifAbsent` so a later replay never conflicts, and the
 * statement then means exactly what it means when those points already exist.
 *
 * Runs at the OUTERMOST `parse` only, so every path that lowers through `parse` against a figure (the deterministic
 * submit, the LLM fallback's canonical lines, the edit path, the load audit) is covered once. A context with no `points`
 * (a pure reading or an analysis probe) says nothing about what exists, so nothing is created there.
 */
import { applyCommand, constraintRefs, lower, objectParents, type AnyCommand, type Command, type Construction, type GeoObject, type Id } from '@/engine';

/** A point label as the student types it in 2-D: an uppercase letter and glued digits. Circles (`circle-O`), lines
 *  (`bis-…`), anonymous centres (`@ctr-O`) and symbols never match. */
const POINT_LABEL = /^[A-Z]\d*$/;

/** The point operands of a store-level measure, read by its own fields (its lowering is list-dependent). */
function measureOperands(cmd: AnyCommand): Id[] {
  switch (cmd.type) {
    case 'measure-length':
      return [cmd.a, cmd.b];
    case 'measure-angle':
    case 'mark-angle':
      return [cmd.ray1, cmd.vertex, cmd.ray2];
    case 'measure-area':
    case 'measure-perimeter':
      return [...cmd.ids];
    default:
      return [];
  }
}

/**
 * The label-shaped point ids `cmds` reference that neither `existing` nor the commands themselves define BEFORE they are
 * used, in first-reference order. Pure.
 *
 * Read command by command: «AD חוצה את הזווית BAC» lowers to the bisector at A and then the segment A–D, so A is used
 * before the segment's carrier would create it — it is created first (#2048's hoist). A point some later command
 * DEFINES (a midpoint, a foot, an intersection) is that rule's own forward reference and is never pre-created: a free
 * point there would collide with its definition.
 */
export function missingPointOperands(cmds: readonly AnyCommand[], existing: readonly Id[]): Id[] {
  let c: Construction = {
    objects: existing.map((id): GeoObject => ({ kind: 'free-point', id, x: 0, y: 0 })),
    constraints: [],
  };
  const out: Id[] = [];
  const usedEarly: Id[] = [];
  const defined = new Set<Id>(); // points a non-carrier command defines
  const has = (id: Id) => c.objects.some((o) => o.id === id);
  const note = (ids: readonly Id[], into: Id[]) => {
    for (const id of ids) if (POINT_LABEL.test(id) && !has(id) && !into.includes(id)) into.push(id);
  };
  for (const cmd of cmds) {
    note(measureOperands(cmd), usedEarly);
    let engine: Command[] = [];
    try {
      engine = lower([cmd]);
    } catch {
      /* a statement whose lowering needs the whole list adds no object here; its operands were read above */
    }
    const before = new Set(c.objects.map((o) => o.id));
    const consBefore = c.constraints.length;
    for (const e of engine) {
      try {
        c = applyCommand(c, e);
      } catch {
        /* a command the structural pass cannot apply defines nothing and is read by its own error later */
      }
    }
    const added = c.objects.filter((o) => !before.has(o.id));
    if (cmd.type !== 'segment' && cmd.type !== 'free-point') for (const o of added) defined.add(o.id);
    for (const o of added) note(objectParents(o), usedEarly);
    for (const con of c.constraints.slice(consBefore)) note(constraintRefs(con), usedEarly);
  }
  for (const id of usedEarly) if (!defined.has(id) && !out.includes(id)) out.push(id);
  return out;
}

/** The bare declaration a missing point is created as — «נקודה X»'s own command. */
const bareDeclaration = (id: Id): AnyCommand => ({ type: 'free-point', id, x: 3, y: 2, free: true, ifAbsent: true });

/**
 * Prepend the bare declaration of every point `cmds` reference that the figure (`points`) lacks. Identity when
 * nothing is missing, so every line that built before builds the same.
 */
export function withImpliedPoints(cmds: AnyCommand[], points: readonly Id[]): AnyCommand[] {
  const missing = missingPointOperands(cmds, points);
  return missing.length ? [...missing.map(bareDeclaration), ...cmds] : cmds;
}
