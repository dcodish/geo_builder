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
        if (!arg) return undecided(`הארגומנט של ${claim.name}`);
        if (!isExactRational(arg)) return undecided(`הארגומנט של ${claim.name} (זווית לא־רציונלית)`);
        const noun = claim.prop === 'real' ? 'ממשי' : 'מדומה טהור';
        const twice = ratMul(arg.turns, rat(2));
        const varies = ratMul(twice, rat(claim.k)); // the n-dependent part
        const constant = ratMul(twice, rat(claim.c));
        const target = claim.prop === 'real' ? ZERO : rat(1, 2);
        const holds = isInt(varies) && isInt(ratSub(constant, target));
        const power = `${claim.name}^(${claim.k}n${claim.c === 0 ? '' : claim.c > 0 ? `+${claim.c}` : claim.c})`;
        return holds
          ? { status: 'holds', why: `${power} ${noun} לכל n — נובע מהנתונים` }
          : { status: 'refuted', why: `${power} אינו ${noun} לכל n` };
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
        if (!arg) return undecided(`הארגומנט של ${claim.name}`);
        if (!isExactRational(arg)) return undecided(`הארגומנט של ${claim.name} (זווית לא־רציונלית)`);
        const noun = claim.prop === 'real' ? 'ממשי' : 'מדומה טהור';
        const least = smallestPower(angScale(arg, rat(2)), claim.prop === 'real' ? ZERO : rat(1, 2));
        if (least === null) {
          return { status: 'refuted', why: `אין n שעבורו ${claim.name}^n ${noun}` };
        }
        return Number(least) === claim.stated
          ? { status: 'holds', why: `n = ${claim.stated} הוא אכן המינימלי שעבורו ${claim.name}^n ${noun}` }
          : { status: 'refuted', why: `ה-n המינימלי שעבורו ${claim.name}^n ${noun} הוא ${least}` };
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
