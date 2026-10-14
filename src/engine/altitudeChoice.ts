/**
 * #2064 Stage 2 ([ADR-644](../../docs/06-decisions.md#adr-644)) — A HEIGHT NAMED BY TWO EXISTING VERTICES WHOSE SIDE
 * THE SENTENCE DID NOT STATE: the side is an unstated choice, so it is a VARIANT COMMAND.
 *
 * «מרובע ABCD» · «AC גובה» says that AC is a height of the figure. A segment between two vertices is a height
 * exactly when it is perpendicular to a side at one of its ends (ADR-527), and the quadrilateral has four such
 * sides: AC ⟂ BC, AC ⟂ CD, CA ⟂ AB, CA ⟂ AD. The operator's ruling of 2026-10-14 (option D): *"we just draw AC
 * perpendicular to BC"*, and «הציגו תצורה אחרת» cycles the rest. So `altitude-choice` carries the options in the
 * order the parser lists them (`cevianPairReadings`: the second letter's sides first) and a persisted `variant`
 * — one more member of the ADR-138 / ADR-573 family (`variants.ts`), with no per-type branch in the store.
 *
 * It LOWERS to exactly what the long form «AC גובה לצלע BC» lowers to (`rightAngleAtFoot`, which the parser's
 * `altitudeAtVertex` also calls, so the two can never drift). M4 (defaults yield to statements): a right angle
 * the student states elsewhere at one option's foot, between that option's apex and side, PINS that option —
 * «AC גובה» · «AC ⟂ CD» moves the choice to CD instead of stacking two right angles (the ADR-412 shape).
 */
import type { Command, Id } from './types';

/** One way a two-vertex height can hold: the right angle at `foot` between `apex` and `side`'s other end. */
export interface AltitudeOption {
  apex: Id;
  foot: Id;
  side: [Id, Id];
}

/** A right angle a statement asserts: at `vertex`, between rays to `a` and `b` (unordered). */
export interface StatedRightAngle {
  vertex: Id;
  a: Id;
  b: Id;
}

/** The commands the long form «XF גובה לצלע FZ» lowers to: the two segments and XF ⟂ FZ at F (ADR-527). */
export function rightAngleAtFoot(apex: Id, foot: Id, side: readonly [Id, Id]): Command[] {
  const other = side[0] === foot ? side[1] : side[0];
  return [
    { type: 'segment', a: apex, b: foot },
    { type: 'segment', a: foot, b: other },
    { type: 'set-perpendicular', a: apex, b: foot, c: foot, d: other },
  ];
}

const otherEnd = (o: AltitudeOption): Id => (o.side[0] === o.foot ? o.side[1] : o.side[0]);
/** Does a stated right angle say exactly what option `o` says? */
export function rightAngleIs(o: AltitudeOption, r: StatedRightAngle): boolean {
  const z = otherEnd(o);
  return r.vertex === o.foot && ((r.a === o.apex && r.b === z) || (r.a === z && r.b === o.apex));
}

/**
 * The right angles a list of engine commands states — `set-perpendicular` between two segments that share an
 * end, and a 90° `set-angle`. Read off the commands, never coordinates.
 */
export function statedRightAngles(cmds: readonly Command[]): StatedRightAngle[] {
  const out: StatedRightAngle[] = [];
  for (const c of cmds) {
    if (c.type === 'set-perpendicular') {
      const ends1 = [c.a, c.b], ends2 = [c.c, c.d];
      const v = ends1.find((x) => ends2.includes(x));
      if (v === undefined) continue;
      const a = ends1.find((x) => x !== v), b = ends2.find((x) => x !== v);
      if (a !== undefined && b !== undefined) out.push({ vertex: v, a, b });
    } else if (c.type === 'set-angle' && Math.abs(c.value - 90) < 1e-9) out.push({ vertex: c.vertex, a: c.ray1, b: c.ray2 });
  }
  return out;
}

/** The option a stated right angle pins, or null (the student chose none of them). */
export function pinnedAltitudeOption(options: readonly AltitudeOption[], stated: readonly StatedRightAngle[]): number | null {
  const i = options.findIndex((o) => stated.some((r) => rightAngleIs(o, r)));
  return i < 0 ? null : i;
}

/**
 * The commands an `altitude-choice` lowers to: the pinned option when a statement names one (its ⟂ then comes
 * from that statement, so it is not re-emitted — the ADR-138 duplicate rule), else the persisted `variant`.
 */
export function expandAltitudeChoice(cmd: { options: AltitudeOption[]; variant: number }, stated: readonly StatedRightAngle[] = []): Command[] {
  const n = cmd.options.length;
  if (n === 0) return [];
  const pinned = pinnedAltitudeOption(cmd.options, stated);
  const o = cmd.options[pinned ?? ((cmd.variant % n) + n) % n];
  const cmds = rightAngleAtFoot(o.apex, o.foot, o.side);
  return pinned === null ? cmds : cmds.filter((c) => c.type !== 'set-perpendicular');
}
