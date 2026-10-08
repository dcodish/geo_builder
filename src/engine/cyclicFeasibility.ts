/**
 * A CIRCLE THROUGH A RING DECLARED AS A SHAPE NO CIRCLE CAN PASS AROUND (#1918,
 * [ADR-607](../../docs/06-decisions.md#adr-607)) — a stage-0 prover beside ADR-549's side prover, with the same
 * one-way soundness: a hit PROVES impossibility, passing proves nothing.
 *
 * Class: «טרפז ישר זווית ABCD חסום במעגל» was refused when the noun and the circle arrived in ONE sentence
 * (ADR-595, the parser's shape-phrase reader), but stated in two sentences nothing asked — «טרפז ישר זווית ABCD»
 * then «ABCD חסום במעגל» drew a rectangle with an amber warning, and the reverse order refused with an
 * internal «'C' is already defined». A circle through the four vertices makes a right trapezoid a rectangle,
 * and a rectangle is not a trapezoid: the operator's ruling of 2026-10-08 is "Refuse in both".
 *
 * STRUCTURAL only, read from what the construction IS:
 *  - the DECLARATION is the `declared-shape` record the noun line's command leaves (requirements.ts) — the
 *    phrase the student typed, never a measurement of the drawing (a ring that merely LOOKS right-angled at one
 *    seed is never refused). Which phrases count is the ONE table `NOT_CYCLIC` (shapeKinds.ts).
 *  - the CIRCLE is a stated concyclicity over the ring's four vertices (a `concyclic` constraint, checked or
 *    driven), or every vertex structurally on one circle (a rider, the circumcircle's own points, a membership
 *    lowered to a constraint — the side prover's `onCircle` reader).
 * The ring is a vertex SET: «מעגל חוסם את BCDA» is the same circle through the same four points. The incoming
 * command's own claim rides the probe (its record and its asserted objects), so both orders are one case.
 */
import { drivenConstraintsOf } from './evaluate';
import { NOT_CYCLIC } from './shapeKinds';
import { onCircleReader } from './sideFeasibility';
import type { Command, Construction, Id } from './types';

export interface NotCyclicImpossibility {
  /** the declared ring, as declared */
  ring: Id[];
  /** the declared shape phrase — 'right-trapezoid' */
  shape: string;
  /** what a circle through every vertex would force it to be — 'rectangle' */
  forced: string;
}

/** The first ring declared as a not-cyclic phrase that the probed figure puts on one circle, or null. */
export function notCyclicImpossibility(probed: Construction, cmd?: Command): NotCyclicImpossibility | null {
  const declared = (probed.requirements ?? []).flatMap((r) => (r.kind === 'declared-shape' && NOT_CYCLIC[r.shape] ? [r] : []));
  if (!declared.length) return null;
  const concyclicSets = [...probed.constraints, ...drivenConstraintsOf(probed)].flatMap((c) => (c.type === 'concyclic' ? [new Set(c.points)] : []));
  const circles = probed.objects.flatMap((o) => (o.kind === 'circle' ? [o.id] : []));
  const on = onCircleReader(probed, cmd);
  for (const r of declared) {
    const ring = new Set(r.ring);
    const stated = concyclicSets.some((s) => [...ring].every((v) => s.has(v))) || circles.some((c) => r.ring.every((v) => on(v, c)));
    if (stated) return { ring: [...r.ring], shape: r.shape, forced: NOT_CYCLIC[r.shape] };
  }
  return null;
}

/**
 * The wire message — the over-constrained family's shape, so the fold's drop-one search names the OTHER
 * statement (`[vs #i]`, ADR-508) and the display renders 2-D's «X» סותר את «Y» frame with the reason clause
 * (humanizeError, `errors.overConstrained_said_vs` + `errors.notCyclicReason`).
 */
export function notCyclicImpossibilityError(m: NotCyclicImpossibility): string {
  return `over-constrained: a circle through the vertices of ${m.shape} ${m.ring.join('')} forces a ${m.forced} cannot hold`;
}

/** The wire shape above, with the fold's optional `[vs #<fact index>]` tail: 1 the phrase, 2 the ring, 3 the forced noun, 4 the index. */
export const NOT_CYCLIC_VS = /^over-constrained: a circle through the vertices of (\S+) (\S+) forces a (\S+) cannot hold(?: \[vs #(\d+)\])?$/;

/** Does `ids`, read as a ring from any vertex in either direction, spell `ring`? */
export function spellsRing(ids: readonly Id[], ring: string): boolean {
  const n = ids.length;
  for (const r of [ids, [...ids].reverse()]) for (let k = 0; k < n; k++) if ([...r.slice(k), ...r.slice(0, k)].join('') === ring) return true;
  return false;
}
