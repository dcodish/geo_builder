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
import { forcedFlatPolygon } from './metricFeasibility';
import { NOT_CYCLIC } from './shapeKinds';
import { assertedObjects } from './sideFeasibility';
import { ringOnOneCircle, threeOnOneLine } from './structure';
import type { Command, Constraint, Construction, GeoObject, Id } from './types';

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
  // the ONE structural reading of "this ring is on a circle" (ADR-628): shared with the apply boundary's cyclic-member lowering
  const asserted = assertedObjects(cmd);
  for (const r of declared) {
    if (ringOnOneCircle(probed, r.ring, asserted)) return { ring: [...r.ring], shape: r.shape, forced: NOT_CYCLIC[r.shape] };
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

/**
 * #2099 ([ADR-651](../../docs/06-decisions.md#adr-651)) — A CIRCLE THROUGH THREE POINTS THE GIVENS PUT ON ONE LINE.
 * The same stage-0 family and the same one-way soundness: a hit PROVES no circle exists, passing proves nothing.
 *
 * Class: a circle through three points («מעגל שעובר דרך A, D ו-B», «מעגל חוסם את המשולש ADB», the English
 * spellings — every reading lowers to one `circumcircle`, whose centre is a `circumcenter` object) whose three
 * points the stated incidences put on one line. On a solved rider («D על הישר AB») the numeric collinearity test
 * missed it and the figure committed green with a centre at ~10⁷ and no circle; on an exact rider («D על AB») it
 * reached the evaluator and was refused in an untranslated engine sentence. Judged here by the CONSTRUCTION
 * (`threeOnOneLine`), in either order: the circle after the incidence, or the incidence after the circle (the
 * incoming command's asserted objects and its M1-lowered constraint ride the probe), or by the LENGTH givens
 * (ADR-602's `forcedFlatPolygon`, asked about the three points as a ring). A centre already degenerate
 * in the prior figure is never blamed on an unrelated later line (ADR-602's doctrine).
 */
export interface CollinearCircle {
  /** the circle's three stated points, in the order the circle names them */
  points: [Id, Id, Id];
  /** the centre (a `circumcenter`) */
  centre: Id;
}

function collinearCircles(c: Construction, asserted: GeoObject[]): CollinearCircle[] {
  const out: CollinearCircle[] = [];
  let enforced: Constraint[] | null = null;
  for (const list of [c.objects, asserted])
    for (const o of list) {
      if (o.kind !== 'circumcenter') continue;
      const pts: [Id, Id, Id] = [o.a, o.b, o.c];
      if (threeOnOneLine(c, pts, asserted)) {
        out.push({ points: pts, centre: o.id });
        continue;
      }
      // the LENGTH givens can put them on one line too («AB = 5» · «AD = 2» · «DB = 3»): ADR-602's theorem prover,
      // asked about the circle's three points as a ring — |AB| = |AD| + |DB| is a straight angle at D
      enforced ??= [...c.constraints, ...drivenConstraintsOf(c)];
      if (forcedFlatPolygon([{ kind: 'polygon', id: `~through-${o.id}`, vertices: pts }], enforced)) out.push({ points: pts, centre: o.id });
    }
  return out;
}

/** The first circle through three points the probed figure structurally puts on one line, new with this step, or null. */
export function collinearCircleImpossibility(prev: Construction, probed: Construction, cmd?: Command): CollinearCircle | null {
  if (![...probed.objects, ...assertedObjects(cmd)].some((o) => o.kind === 'circumcenter')) return null; // an ordinary figure pays nothing
  const before = new Set(collinearCircles(prev, []).map((x) => x.centre));
  return collinearCircles(probed, assertedObjects(cmd)).find((x) => !before.has(x.centre)) ?? null;
}

/** The wire message — the over-constrained family's shape, so the fold names the OTHER statement (`[vs #i]`). */
export function collinearCircleError(m: CollinearCircle): string {
  return `over-constrained: a circle through ${m.points.join(', ')} on one line cannot hold`;
}

/** The wire shape above, with the fold's optional `[vs #<fact index>]` tail: 1–3 the points, 4 the index. */
export const COLLINEAR_CIRCLE_VS = /^over-constrained: a circle through ([^,\s]+), ([^,\s]+), ([^,\s]+) on one line cannot hold(?: \[vs #(\d+)\])?$/;
