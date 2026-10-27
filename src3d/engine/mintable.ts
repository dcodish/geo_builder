/**
 * #1467 ([ADR-3D-382](../../docs/06b-decisions-3d.md#adr-3d-382), ADR-W-162) — MINT ELIGIBILITY: which referenced
 * points the fold's mint pass (`deriveCore3`) may create. Registered in docs/17 §3 ("mint eligibility").
 *
 * The rule is the operator's ruling of 2026-09-27 ("Create everywhere + notice") widened by #2048 ruling A
 * ("whatever is missing is created" — points inside a vector line too): a line that refers to a POINT the figure
 * lacks creates it. Which ids are missing is the engine's own `unknown-point` / `two-unknowns` answer, so nothing
 * here lists command kinds that mint. Two guards remain:
 * - the id must be a point LABEL the figure does not hold: the degenerate-shape returns that report an id which
 *   EXISTS («קטע AA», a short face) are never "minted";
 * - a statement about a solid's own element is not a reference to free points: «אלכסון AB» says AB is a diagonal OF A
 *   SOLID (with no solid it stays refused, #978, ADR-3D-246); «XY גובה הפירמידה» says XY IS the pyramid's height.
 *   Minting would draw a free segment certified as that element (`solidElement3`).
 */
import type { Command3, Construction3 } from './types';

/** A 3-D point label as the parser canonicalises it: an uppercase letter, glued digits, primes. */
const POINT_LABEL3 = /^[A-Z]\d*'*$/;

/** May the mint pass create `id` on `c`? */
export const mintableId3 = (id: string, c: Construction3): boolean => POINT_LABEL3.test(id) && !c.points.has(id);

/**
 * Does a line made of `cmds` only DECLARE its points — a solid or polygon run, a quadrilateral noun, a coordinate, a
 * bare «קטע»? Such a line may still need the pass («קטע AB» · «דלתון ABCD»: the kite's other corners), but naming
 * introduces, so its notice announces nothing (ADR-W-162).
 */
export const declaresOnly3 = (cmds: readonly Command3[]): boolean =>
  cmds.every((k) => k.type === 'solid' || k.type === 'quad-shape' || k.type === 'point3' || (k.type === 'segment3' && !!k.bare && !k.diagonal));

/**
 * A command that states something IS AN ELEMENT OF A SOLID (#1467 plan §3.2, "solid-relative statements keep their
 * subject"): a diagonal («אלכסון AB»), the solid's height («XY גובה הפירמידה» — a perpendicular to the solid's own
 * base, `plane: []`), a height to a named base face («גובה מנקודה D לבסיס ABZ»), a tetrahedron's altitude. Free
 * points can never be that element, so a missing letter there stays refused. A relation TO a solid's face
 * («SQ מקביל לבסיס») is not one: Q is an ordinary referenced point.
 */
const solidElement3 = (k: Command3): boolean =>
  (k.type === 'segment3' && !!k.diagonal) ||
  (k.type === 'seg-plane-rel' && k.rel === 'perp' && k.plane.length === 0) ||
  k.type === 'perp-to-base' ||
  k.type === 'tetra-altitude';

/** May a line made of `cmds` have its missing points minted? False for a statement about a solid's own element. */
export const mintEligible3 = (cmds: readonly Command3[]): boolean => !cmds.some(solidElement3);
