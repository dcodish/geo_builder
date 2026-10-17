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

/**
 * #2235 ([ADR-3D-351](../../docs/06b-decisions-3d.md#adr-3d-351)) — the letters a NEW unnamed polygon gets: the first
 * `n` letters A–Z that no point of the figure uses, then A1…Z1, A2…, so it is total by construction. A copy of 2-D's
 * `autoVertexLabels` rule (never an import: BOUNDARIES.json), so «משולש ABC» · «משולש ישר זווית» names the new
 * triangle DEF in both builders. Vertex letters run alphabetically; the pool above is for one derived point.
 */
export function freeVertexRun3(n: number, taken: (id: string) => boolean): string[] {
  const out: string[] = [];
  for (let cycle = 0; out.length < n; cycle++) {
    const suffix = cycle === 0 ? '' : String(cycle);
    for (let k = 0; k < 26 && out.length < n; k++) {
      const id = String.fromCharCode(65 + k) + suffix;
      if (!taken(id)) out.push(id);
    }
  }
  return out;
}
