/**
 * Claim verification — stage 4 of [docs/LADDER-CX.md](../../docs/LADDER-CX.md).
 *
 * Decided over the exact carriers rather than sampled, which is the whole reason the value layer
 * carries turns instead of degrees. «w מדומה טהור» is `2·arg w ≡ ½ (mod 1)` — an integer question with
 * an integer answer, true for every configuration or for none. A float check can only ever say
 * "true in the drawing I happened to look at", and the exam is not asking that.
 *
 * Claims never drive. They read the solved figure and report; nothing here returns a constraint.
 */

import type { CheckedClaim, Claim, ClaimVerdict } from '../model/claim';
import type { Why } from '../model/why';
import {
  type Angle,
  isExactRational,
  isImaginary,
  isReal,
  sameDirection,
  neg as angNeg,
  scale as angScale,
  smallestPower,
} from '../value/angle';
import { type ExpVec, eq as modEq } from '../value/modulus';
import { ZERO, isInt, mul as ratMul, rat, sub as ratSub } from '../value/rational';
import type { Branch, Tier1Result } from './tier1';

/** What the solved figure knows about one name: its exact modulus and its exact direction, if forced. */
export interface KnownValue {
  readonly mod: ExpVec | null;
  readonly arg: Angle | null;
}

const known = (t1: Tier1Result, branch: Branch | undefined, name: string): KnownValue => ({
  mod: t1.knownModulus.get(name) ?? null,
  arg: branch?.angles.get(name) ?? null,
});

const undecided = (why: Why): ClaimVerdict => ({ status: 'unknown', why });

/**
 * Verify one claim against the solved figure.
 *
 * Every branch of this returns `unknown` rather than guessing when the relevant half is still free —
 * a claim about a direction the givens have not pinned is unanswered, not wrong, and the difference
 * matters to a student who is mid-way through entering a question.
 */
export function verifyClaim(claim: Claim, t1: Tier1Result, branch: Branch | undefined): CheckedClaim {
  const verdict = ((): ClaimVerdict => {
    switch (claim.kind) {
      case 'real':
      case 'imaginary': {
        const { arg } = known(t1, branch, claim.name);
        if (!arg) return undecided({ code: 'undecided-arg', name: claim.name });
        const wanted = claim.kind === 'real' ? isReal(arg) : isImaginary(arg);
        return wanted
          ? { status: 'holds', why: { code: 'prop-holds', name: claim.name, prop: claim.kind } }
          : { status: 'refuted', why: { code: 'prop-refuted', name: claim.name, prop: claim.kind } };
      }
      case 'conjugates': {
        const a = known(t1, branch, claim.a);
        const b = known(t1, branch, claim.b);
        // conjugates: equal moduli AND opposite arguments. BOTH halves must be forced, or the answer
        // is unknown — equal moduli alone is not conjugacy, and saying so would be a guess.
        if (!a.mod || !b.mod) return undecided({ code: 'undecided-mod-pair', a: claim.a, b: claim.b });
        if (!a.arg || !b.arg) return undecided({ code: 'undecided-arg-pair', a: claim.a, b: claim.b });
        if (!modEq(a.mod, b.mod)) return { status: 'refuted', why: { code: 'moduli-differ' } };
        /**
         * PROVE IT FIRST, and only then ask whether the angles were decidable at all.
         *
         * An opaque base angle is not automatically an obstacle. `sameDirection` compares atoms
         * symbolically, so when the two arguments carry the SAME atom with opposing coefficients — which
         * is exactly what «z2 = conj(z1)» produces, whatever z1 is — conjugacy is decided outright.
         * Testing for opacity before testing the claim reported that case as `unknown`, which is a true
         * answer withheld rather than a false one given, but still the wrong verdict.
         */
        if (sameDirection(a.arg, angNeg(b.arg))) {
          return { status: 'holds', why: { code: 'conjugates-hold', a: claim.a, b: claim.b } };
        }
        // Now opacity does matter. Two INDEPENDENT opaque angles — `3+4i` and `3-4i`, each carrying its
        // own atom — cannot be proved opposite, and undecidable must not be reported as refuted:
        // refuting a TRUE claim tells a student their correct answer is wrong, which is the one
        // direction of this error that actually costs something.
        if (!isExactRational(a.arg) || !isExactRational(b.arg)) {
          return undecided({ code: 'undecided-arg-pair-irrational', a: claim.a, b: claim.b });
        }
        return { status: 'refuted', why: { code: 'args-not-opposite' } };
      }
      /**
       * F12 — «לכל n טבעי, w^(kn+c) ממשי», decided by CONGRUENCE and never by trying values of n.
       *
       * `w^m` is real iff `2m·θ ≡ 0 (mod 1)` and pure imaginary iff `2m·θ ≡ ½`. Substituting
       * `m = kn + c` and requiring it for every natural n splits into two integer conditions: the part
       * that varies with n must vanish (`2kθ ≡ 0`), and the constant part must hit the target. Three of
       * the eleven re-read exams ask exactly this, and no amount of sampling could answer it — «for
       * every n» is not a property any finite set of drawings has.
       */
      case 'forall-power': {
        const { arg } = known(t1, branch, claim.name);
        if (!arg) return undecided({ code: 'undecided-arg', name: claim.name });
        if (!isExactRational(arg)) return undecided({ code: 'undecided-arg-irrational', name: claim.name });
        const twice = ratMul(arg.turns, rat(2));
        const varies = ratMul(twice, rat(claim.k)); // the n-dependent part
        const constant = ratMul(twice, rat(claim.c));
        const target = claim.prop === 'real' ? ZERO : rat(1, 2);
        const holds = isInt(varies) && isInt(ratSub(constant, target));
        const power = `${claim.name}^(${claim.k}n${claim.c === 0 ? '' : claim.c > 0 ? `+${claim.c}` : claim.c})`;
        return holds
          ? { status: 'holds', why: { code: 'forall-holds', power, prop: claim.prop } }
          : { status: 'refuted', why: { code: 'forall-refuted', power, prop: claim.prop } };
      }
      /**
       * F12 — «ה-n המינימלי שעבורו wⁿ מדומה טהור הוא 5».
       *
       * The engine solves `n·2θ ≡ target (mod 1)` for its least positive solution — an integer answer to
       * an integer question — and compares it with the student's. A claim of a value that *works* but is
       * not the least is refuted with the least one named, because that is the question that was asked.
       */
      case 'minimal-power': {
        const { arg } = known(t1, branch, claim.name);
        if (!arg) return undecided({ code: 'undecided-arg', name: claim.name });
        if (!isExactRational(arg)) return undecided({ code: 'undecided-arg-irrational', name: claim.name });
        const least = smallestPower(angScale(arg, rat(2)), claim.prop === 'real' ? ZERO : rat(1, 2));
        if (least === null) {
          return { status: 'refuted', why: { code: 'minimal-none', name: claim.name, prop: claim.prop } };
        }
        return Number(least) === claim.stated
          ? { status: 'holds', why: { code: 'minimal-holds', name: claim.name, prop: claim.prop, n: claim.stated } }
          : {
              status: 'refuted',
              why: { code: 'minimal-refuted', name: claim.name, prop: claim.prop, least: Number(least) },
            };
      }
    }
  })();
  return { claim, verdict };
}

export const verifyClaims = (
  claims: readonly Claim[],
  t1: Tier1Result,
  branch: Branch | undefined,
): CheckedClaim[] => claims.map((c) => verifyClaim(c, t1, branch));
