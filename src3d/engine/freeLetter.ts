/**
 * THE BUILDER'S FREE-LETTER CONVENTION — one pool, one rule.
 *
 * #225 (ADR-3D-048) introduced it for the un-named «אמצע BB'»: the first letter of this pool that no
 * point of the figure already uses (the 2-D `freeLabel` pattern, copied per docs/20 §12 — M first, the
 * letter students use for midpoints and feet). #1476 (ADR-3D-265) is its second reader — the meeting
 * point of a dihedral construction on the seam — so the pool moved here from its inline copy in
 * `apply.ts`: two copies of a naming convention drift, and a student would see two tools that disagree
 * about which letter comes next.
 */

/** The order letters are offered in. */
export const FREE_LETTER_POOL: readonly string[] = [...'MNKLPQRSTUVWXYZGHIJ'];

/** The first pool letter `taken` does not claim, or null when all are taken (practically unreachable). */
export function firstFreeLetter(taken: (id: string) => boolean): string | null {
  return FREE_LETTER_POOL.find((l) => !taken(l)) ?? null;
}
