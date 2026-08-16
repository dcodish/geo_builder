/**
 * F9 — SEQUENCES over ℂ, lowered to constraints.
 *
 * The maths lives here rather than in the parser rule, so the rule stays about *words* and this file
 * stays about *relations* — the same split `constraint.ts` makes for the same reason.
 *
 * ## Why a geometric sequence is exact and an arithmetic one is not
 *
 * A geometric sequence is pure multiplication, and multiplication is linear in log-polar coordinates.
 * So «Z₁ and Z₂ are the first two terms of a geometric sequence whose third term is Z₄» lands in the
 * exact tier as an ordinary ℚ-linear row, and — this is the part that matters pedagogically — the
 * integer turn-unknown it carries **is** the exam's «מנת הסדרה — כל האפשרויות». The alternative
 * ratios are the branch set, not a separate feature ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006)).
 *
 * An arithmetic sequence is addition, which has no closed form in log-polar coordinates, so it routes
 * to the numeric tier. Both are stated in the same sentence shape and the *engine* decides which tier
 * reads them — docs/27 §10's P1, one form and the engine decides, applied to a family rather than to a
 * single relation.
 *
 * ## Positions, not adjacency
 *
 * The exam does not only give consecutive terms: «the first two terms … and the FIFTH term is» is the
 * same family. So a term carries its POSITION and the relations are written between positions, which
 * makes «בהתאמה» (term-position givens in any positions) the general case rather than an extra rule.
 * With terms at `p₁ < p₂ < pᵢ`, eliminating the ratio `q` from `t_p = t_{p₁}·q^(p − p₁)` gives
 *
 *     (tᵢ / t₁)^(p₂ − p₁)  =  (t₂ / t₁)^(pᵢ − p₁)
 *
 * which is monomial for every choice of positions — no division into cases, and no `q` introduced as
 * an unknown the student never named.
 */

import { type Expr, div, mul, num, pow, ref, sub } from './expr';
import type { Constraint } from './constraint';
import { rat } from '../value/rational';

export type SequenceKind = 'geometric' | 'arithmetic';

/** One stated term: the number's name, and which term of the sequence it is (1-based). */
export interface SequenceTerm {
  readonly name: string;
  readonly position: number;
}

/**
 * The constraints a stated sequence imposes.
 *
 * **Two terms impose nothing**, and that is deliberate: any two numbers are the first two terms of
 * *some* geometric sequence, so emitting a relation there would invent a given the student never made
 * ([ADR-052](../../docs/06-decisions.md#adr-052)). The sequence still DECLARES both names, so they are
 * drawn — the figure exists, it is simply not over-determined.
 *
 * Returns null when the positions are not strictly increasing and distinct, which is not a relation
 * the sentence can mean.
 */
export function sequenceConstraints(
  kind: SequenceKind,
  terms: readonly SequenceTerm[],
  src: string,
): Constraint[] | null {
  for (let i = 1; i < terms.length; i++) {
    if (terms[i].position <= terms[i - 1].position) return null;
  }
  if (terms.length < 3) return [];

  const [t1, t2] = terms;
  const d12 = t2.position - t1.position;
  const out: Constraint[] = [];

  for (const ti of terms.slice(2)) {
    const di = ti.position - t1.position;
    out.push(
      kind === 'geometric'
        ? { lhs: ratioPow(ti.name, t1.name, d12), rhs: ratioPow(t2.name, t1.name, di), src }
        : { lhs: scaledGap(ti.name, t1.name, d12), rhs: scaledGap(t2.name, t1.name, di), src },
    );
  }
  return out;
}

/** `(a / b)^k` — monomial by construction, whatever `k` is. */
const ratioPow = (a: string, b: string, k: number): Expr => pow(div(ref(a), ref(b)), rat(k));

/** `(a − b)·k` — the additive twin, which is exactly why it is not monomial. */
const scaledGap = (a: string, b: string, k: number): Expr =>
  mul(sub(ref(a), ref(b)), num(rat(k)));
