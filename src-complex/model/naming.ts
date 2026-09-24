/**
 * How a NAME is written for a reader — one definition, because a name is written on three surfaces.
 *
 * `z1` is `z₁` on the canvas, in the banner and in every panel row. That was three implementations
 * (the retiring prototype's, the scene's, and a local copy in the v2 adapter), and the copies had
 * already drifted: the adapter's subscripted only the FIRST trailing digit, so `z10` printed `z₁0`.
 * A second implementation of a display rule is the #653 class — two surfaces answering the same
 * question from different sources — and it is fixed here by there being one answer to ask.
 */

/**
 * What the n solutions of `X^n = …` are CALLED, when the equation enumerates
 * ([ADR-CX-005](../../docs/06d-decisions-complex.md#adr-cx-005) mode 1): **always `X₁..Xₙ`**, in
 * argument order from the principal solution.
 *
 * **Always — including when some of those names are already the student's** (#1367, operator ruling
 * 2026-09-22, reaffirmed 2026-09-24 against the stated cost). The solutions of `z³ = 8` ARE `z₁, z₂, z₃`,
 * the exam's own convention, so an existing `zₖ` is not a name to step around: it is a claim that the
 * student's number is solution k. The lowering pins `X₁` to the principal root and each `Xₖ` to
 * `(k−1)/n` of a turn from it, so an existing member that is not solution k contradicts the equation and
 * the line is REFUSED, naming the student's statement; one that is, is reused.
 *
 * This replaces an anonymous mode (`#s…` ids) that drew the solutions with no names whenever an indexed
 * name was taken. It hid exactly the check the ruling asks for — having given up the name, the solver
 * never compared the student's `z₁` with the root that would have claimed it — and it left the points
 * unreferable: a student could not name them in the next sentence. The letter itself is still reserved,
 * so nothing else can claim it while it means "the solutions of this equation".
 */
export const solutionNames = (varName: string, n: number): string[] =>
  Array.from({ length: n }, (_, k) => `${varName}${k + 1}`);

/** Which of [ADR-CX-005](../../docs/06d-decisions-complex.md#adr-cx-005)'s readings `X^n = …` has. */
export type RootsMode =
  /** the letter already exists: the equation constrains it, or verifies it when it is determined */
  | 'constrain'
  /** a fresh letter: the n solutions ARE X₁..Xₙ — existing members included — and the letter is reserved */
  | 'enumerate';

/**
 * Decide the reading from the names that exist BEFORE this equation, and from whether the equation is
 * CLOSED — the whole input, nothing remembered.
 *
 * This is a function rather than a flag on the fact because a stamp can be forgotten. It was: the mode
 * was stamped only by the store, so every other producer of facts — the v2 parser's own path, a
 * hand-built fact in a test, a fixture loaded from disk — silently got the FRESH reading, and
 * `z1^3 = 8` enumerated into `z11, z12, z13`. A default that is wrong when the caller forgets is the
 * kind of seam ADR-CX-009 exists to remove, so both the store's stamping and the v2 lowering now ask
 * this one question and cannot disagree about the answer.
 *
 * **`grounded` is what separates solving from relating**, and it is not the same as "has no unknowns
 * on the right". ADR-CX-005 mode 1 is the exam's «פתרו את המשוואה» idiom, which asks for the solutions
 * of an equation *in terms of numbers the question has already given*: `z³ = 8`, and equally §2b part
 * ד's `z⁴ = z₁·z₂`, where z₁ and z₂ were stated in earlier lines. What is NOT that idiom is `z₁³ = z₃`
 * typed cold — that states how two of the question's numbers stand to each other and brings z₃ into
 * being in the same breath, and its several solutions are the exam's «כל האפשרויות», the
 * configurations #607 exists to cycle.
 *
 * So the question is whether every name on the right was STATED before, not whether the right-hand side
 * is free of names. A number auto-created by this very statement cannot ground it. Reading `z₁³ = z₃`
 * as an enumeration would also print `z₁₁, z₁₂, z₁₃` — a doubled subscript that means a different
 * number in exam notation — so the distinction is an honesty one, not only a modelling one.
 *
 * **Existing indexed names no longer change the reading** (#1367): they are the solutions' own names, and
 * whether the student's `zₖ` agrees with solution k is decided by the solve, not avoided here.
 */
export const rootsMode = (varName: string, priorNames: ReadonlySet<string>, grounded: boolean): RootsMode =>
  priorNames.has(varName) || !grounded ? 'constrain' : 'enumerate';

/** Subscript the trailing digits, the way the exam prints them: `z1` → `z₁`, `z10` → `z₁₀`. */
export const prettyName = (name: string): string =>
  name.replace(/(\d+)$/, (d) => [...d].map((c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]).join(''));
