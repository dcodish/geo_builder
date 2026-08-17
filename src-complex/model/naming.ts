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
 * The ANONYMOUS-solution namespace.
 *
 * When an equation enumerates but its indexed names are already the student's (the §2b `Z` vs `Z₁`
 * case), the solutions are still drawn — they are what the exam asks about — but they claim no names.
 * `#` cannot occur in anything a student can type, so these ids cannot collide with a real name, by the
 * same argument that protects tier 1's `#k` turn unknowns.
 */
export const ANON_PREFIX = '#s';

/** A point that exists on the canvas but carries no name the student may refer to. */
export const isAnonymous = (name: string): boolean => name.startsWith(ANON_PREFIX);

/**
 * What the n solutions of `X^n = …` are CALLED, when the equation enumerates
 * ([ADR-CX-005](../../docs/06d-decisions-complex.md#adr-cx-005) mode 1).
 *
 * Ordinarily `X₁..Xₙ`, in argument order from the principal solution. When those indexed names are
 * already the student's, the set goes anonymous rather than refusing: the exam's §2b part ד asks about
 * the solutions of an equation in a question that has already named `Z₁`, and refusing the line would
 * lose a statement the student legitimately made. The letter itself is reserved either way, so nothing
 * else can claim it while it means "the solutions of this equation".
 */
export const solutionNames = (varName: string, n: number, anon = false): string[] =>
  Array.from({ length: n }, (_, k) =>
    anon ? `${ANON_PREFIX}${varName}${n}_${k + 1}` : `${varName}${k + 1}`,
  );

/** Which of [ADR-CX-005](../../docs/06d-decisions-complex.md#adr-cx-005)'s three readings `X^n = …` has. */
export type RootsMode =
  /** the letter already exists: the equation constrains it, or verifies it when it is determined */
  | 'constrain'
  /** a fresh letter: the n solutions plot as X₁..Xₙ and the bare letter is reserved */
  | 'enumerate'
  /** fresh letter, taken indices: the solutions plot as an unnamed set */
  | 'anonymous';

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
 */
export const rootsMode = (
  varName: string,
  n: number,
  priorNames: ReadonlySet<string>,
  grounded: boolean,
): RootsMode =>
  priorNames.has(varName) || !grounded
    ? 'constrain'
    : solutionNames(varName, n).some((s) => priorNames.has(s))
      ? 'anonymous'
      : 'enumerate';

/**
 * Subscript the trailing digits, the way the exam prints them: `z1` → `z₁`, `z10` → `z₁₀`.
 *
 * An anonymous solution writes as nothing at all. ADR-447's rule is that an internal id must never
 * reach a rendered string, and returning the raw `#s…` here would print engine bookkeeping on the
 * canvas — so the one place that turns a name into text is the one place that enforces it.
 */
export const prettyName = (name: string): string =>
  isAnonymous(name)
    ? ''
    : name.replace(/(\d+)$/, (d) => [...d].map((c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]).join(''));
