/**
 * How a NAME is written for a reader — one definition, because a name is written on three surfaces.
 *
 * `z1` is `z₁` on the canvas, in the banner and in every panel row. That was three implementations
 * (the retiring prototype's, the scene's, and a local copy in the v2 adapter), and the copies had
 * already drifted: the adapter's subscripted only the FIRST trailing digit, so `z10` printed `z₁0`.
 * A second implementation of a display rule is the #653 class — two surfaces answering the same
 * question from different sources — and it is fixed here by there being one answer to ask.
 */

/** Subscript the trailing digits, the way the exam prints them: `z1` → `z₁`, `z10` → `z₁₀`. */
export const prettyName = (name: string): string =>
  name.replace(/(\d+)$/, (d) => [...d].map((c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]).join(''));
