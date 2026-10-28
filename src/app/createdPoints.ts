/**
 * #1467 ([ADR-769](../../docs/06-decisions.md#adr-769), [ADR-W-162](../../docs/06w-decisions-workspace.md#adr-w-162))
 * — WHICH POINTS A COMMITTED LINE CREATED BY REFERENCE: what the «נוצרה נקודה חדשה …» notice names.
 *
 * A 2-D line creates a point it refers to in two ways, both at parse time: a rule's `segment` carrier (A and B of
 * «M אמצע AB») and the implied-point pass (`parser/impliedPoints.ts`, the bare declaration of every other missing
 * operand). The notice names exactly those, and nothing else:
 * - only labels the student TYPED (a macro's auto-named point is the tool's, never a reference);
 * - never a point the line DEFINES — M in «M אמצע AB», the centre of «מעגל O», a tangent's touch point;
 * - nothing at all when the line only DECLARES (a shape noun, «קטע AB», «נקודה C», a coordinate): naming introduces.
 */
import { applyCommand, isGeoPoint, lower, type AnyCommand, type Command, type Construction, type Id } from '@/engine';
import { statedLabelTokens } from '@/parser/parse';

/** The commands that DECLARE their points: a line made only of these introduces what it names. */
const DECLARING: ReadonlySet<AnyCommand['type']> = new Set<AnyCommand['type']>([
  'square', 'quadrilateral', 'parallelogram', 'rectangle', 'rhombus', 'trapezoid', 'triangle', 'right-triangle', 'polygon',
  'segment', 'free-point', 'shape-variant',
]);

/** The carriers: what they bring in beside a non-declaring command is a REFERENCED point. */
const CARRIERS: ReadonlySet<AnyCommand['type']> = new Set<AnyCommand['type']>(['segment', 'free-point']);

/**
 * The points the line's carriers introduce, applied command by command onto `before` — the attribution the notice
 * reads. Every other command's new points are that command's own subject.
 */
function carriedPoints(before: Construction, cmds: readonly AnyCommand[]): Set<Id> {
  const out = new Set<Id>();
  let c = before;
  for (const cmd of cmds) {
    const had = new Set(c.objects.map((o) => o.id));
    let engine: Command[] = [];
    try {
      engine = lower([cmd]);
    } catch {
      /* a statement whose lowering needs the whole list introduces no point of its own */
    }
    for (const e of engine) {
      try {
        c = applyCommand(c, e);
      } catch {
        /* a command the structural pass cannot apply introduces nothing */
      }
    }
    if (CARRIERS.has(cmd.type)) for (const o of c.objects) if (isGeoPoint(o) && !had.has(o.id)) out.add(o.id);
  }
  return out;
}

/**
 * The point labels `after` has and `before` lacked that the line created by REFERENCE, in the order the student typed
 * them. Empty for a declaration-only line.
 */
export function createdByReference(before: Construction, after: Construction, cmds: readonly AnyCommand[], utterance: string): Id[] {
  if (cmds.every((c) => DECLARING.has(c.type))) return [];
  const had = new Set(before.objects.map((o) => o.id));
  const carried = carriedPoints(before, cmds);
  const gained = new Set(after.objects.filter(isGeoPoint).map((o) => o.id).filter((id) => !had.has(id) && carried.has(id)));
  return statedLabelTokens(utterance).filter((id) => gained.has(id));
}
