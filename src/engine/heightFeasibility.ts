/**
 * #2117 ([ADR-718](../../docs/06-decisions.md#adr-718)) — A DIAGONAL CALLED A HEIGHT OF A SHAPE WHOSE DIAGONALS ARE
 * PERPENDICULAR TO NO SIDE. A stage-0 prover beside ADR-607's `notCyclicImpossibility`, with the same one-way
 * soundness: a hit PROVES impossibility, passing proves nothing.
 *
 * Class: «ריבוע ABCD» · «AC גובה» is an `altitude-choice` (ADR-644) — four options, AC ⟂ CB / CD / AD / AB — none
 * of which can hold, so the fold refused it with the failure of the FIRST option it tried («הסיבה: AC ⟂ CB»), a
 * reason true of that option and false as a reason for a sentence that named no side. For the square, the rectangle
 * and the rhombus it is a theorem (`DIAGONAL_NEVER_PERPENDICULAR`), read from the ring's DECLARED kind — never from
 * the drawing — so the refusal is the statement's own: the diagonal is perpendicular to no side of the shape.
 *
 * Every option must be refuted by the theorem: each option's side an edge of a ring declared a table kind, and the
 * pair a diagonal of that ring. One option the theorem does not cover (a side of another polygon the pair also
 * spans) and the prover proves nothing — the choice is the fold's to try.
 */
import { DIAGONAL_NEVER_PERPENDICULAR } from './shapeKinds';
import type { Construction, Id } from './types';

export interface DiagonalHeightImpossibility {
  /** the pair, as the statement names it ('AC') */
  diagonal: [Id, Id];
  /** the declared ring the theorem is read on */
  ring: Id[];
  /** its declared kind ('square') */
  shape: string;
}

type AltitudeChoice = { type: 'altitude-choice'; options: { apex: Id; foot: Id; side: [Id, Id] }[] };

const NEVER = new Set<string>(DIAGONAL_NEVER_PERPENDICULAR);

/** Are `a`, `b` consecutive in `ring` (an edge)? */
const isEdge = (ring: readonly Id[], a: Id, b: Id): boolean => {
  const n = ring.length, i = ring.indexOf(a), j = ring.indexOf(b);
  return i >= 0 && j >= 0 && i !== j && ((i + 1) % n === j || (j + 1) % n === i);
};

/** The ring declared a never-perpendicular kind on which every option of `cmd` is a diagonal against a side, or null. */
export function diagonalHeightImpossibility(c: Construction, cmd: { type: string }): DiagonalHeightImpossibility | null {
  if (cmd.type !== 'altitude-choice') return null;
  const { options } = cmd as AltitudeChoice;
  if (!options.length) return null;
  const rings = c.objects.flatMap((o) => (o.kind === 'polygon' && o.declaredAs && NEVER.has(o.declaredAs) ? [{ ring: o.vertices, shape: o.declaredAs }] : []));
  if (!rings.length) return null;
  const refutes = (r: { ring: Id[] }, o: AltitudeChoice['options'][number]) =>
    r.ring.includes(o.apex) && r.ring.includes(o.foot) && !isEdge(r.ring, o.apex, o.foot) && isEdge(r.ring, o.side[0], o.side[1]) && o.side.includes(o.foot);
  if (!options.every((o) => rings.some((r) => refutes(r, o)))) return null;
  const r = rings.find((x) => refutes(x, options[0]))!;
  return { diagonal: [options[0].apex, options[0].foot], ring: [...r.ring], shape: r.shape };
}

/** The wire message — the over-constrained family's shape, so the fold tags the declaring statement (`[vs #i]`). */
export function diagonalHeightError(m: DiagonalHeightImpossibility): string {
  return `over-constrained: diagonal ${m.diagonal.join('')} of ${m.shape} ${m.ring.join('')} is perpendicular to no side cannot hold`;
}

/** The wire shape above, with the fold's optional `[vs #<fact index>]` tail: 1 the diagonal, 2 the kind, 3 the ring, 4 the index. */
export const DIAGONAL_HEIGHT_VS = /^over-constrained: diagonal (\S+) of (\S+) (\S+) is perpendicular to no side cannot hold(?: \[vs #(\d+)\])?$/;
