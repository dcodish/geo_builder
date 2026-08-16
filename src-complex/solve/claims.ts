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
import { type Angle, isExactRational, isImaginary, isReal, sameDirection, neg as angNeg } from '../value/angle';
import { type ExpVec, eq as modEq } from '../value/modulus';
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

const undecided = (what: string): ClaimVerdict => ({
  status: 'unknown',
  why: `${what} עדיין לא נקבע מהנתונים`,
});

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
        if (!arg) return undecided(`הארגומנט של ${claim.name}`);
        const wanted = claim.kind === 'real' ? isReal(arg) : isImaginary(arg);
        const noun = claim.kind === 'real' ? 'ממשי' : 'מדומה טהור';
        return wanted
          ? { status: 'holds', why: `${claim.name} ${noun} — נובע מהנתונים` }
          : { status: 'refuted', why: `${claim.name} אינו ${noun}` };
      }
      case 'conjugates': {
        const a = known(t1, branch, claim.a);
        const b = known(t1, branch, claim.b);
        // conjugates: equal moduli AND opposite arguments. BOTH halves must be forced, or the answer
        // is unknown — equal moduli alone is not conjugacy, and saying so would be a guess.
        if (!a.mod || !b.mod) return undecided(`הערך המוחלט של ${claim.a} או של ${claim.b}`);
        if (!a.arg || !b.arg) return undecided(`הארגומנט של ${claim.a} או של ${claim.b}`);
        if (!modEq(a.mod, b.mod)) return { status: 'refuted', why: `הערכים המוחלטים שונים` };
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
          return { status: 'holds', why: `${claim.a} ו-${claim.b} צמודים — נובע מהנתונים` };
        }
        // Now opacity does matter. Two INDEPENDENT opaque angles — `3+4i` and `3-4i`, each carrying its
        // own atom — cannot be proved opposite, and undecidable must not be reported as refuted:
        // refuting a TRUE claim tells a student their correct answer is wrong, which is the one
        // direction of this error that actually costs something.
        if (!isExactRational(a.arg) || !isExactRational(b.arg)) {
          return undecided(`הארגומנטים של ${claim.a} ו-${claim.b} (זווית לא־רציונלית)`);
        }
        return { status: 'refuted', why: `הארגומנטים אינם הפוכים` };
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
