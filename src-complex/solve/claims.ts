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
  type Zeroness,
  add as angAdd,
  fromTurns,
  isCertifiedAtom,
  isExactRational,
  scale as angScale,
  smallestPower,
  sub as angSub,
  zeroness,
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

/** «w^(4n+1)» — the power a forall claim is about, as the student wrote it. */
const powerText = (claim: Extract<Claim, { kind: 'forall-power' }>): string =>
  `${claim.name}^(${claim.k}n${claim.c === 0 ? '' : claim.c > 0 ? `+${claim.c}` : claim.c})`;

/**
 * Verify one claim against the solved figure.
 *
 * Every branch of this returns `unknown` rather than guessing when the relevant half is still free —
 * a claim about a direction the givens have not pinned is unanswered, not wrong, and the difference
 * matters to a student who is mid-way through entering a question.
 */
export function verifyClaim(claim: Claim, t1: Tier1Result, branch: Branch | undefined): CheckedClaim {
  const zeroOf = (a: Angle): Zeroness => zeroness(a, t1.atomDegrees);
  const certifiedOnly = (a: Angle): boolean => [...a.atoms.keys()].every(isCertifiedAtom);
  const forallRefuted = (): ClaimVerdict => {
    if (claim.kind !== 'forall-power') throw new Error('forallRefuted: not a forall claim');
    return { status: 'refuted', why: { code: 'forall-refuted', power: powerText(claim), prop: claim.prop } };
  };
  const verdict = ((): ClaimVerdict => {
    switch (claim.kind) {
      /**
       * #1481 (ADR-CX-057) — «w ממשי» is `2·arg w ≡ 0`, «w מדומה טהור» is `2·arg w ≡ ½`, decided by the
       * ONE three-valued `zeroness`. Over certified atoms (every rational literal's basis) the answer
       * is a theorem either way — so `(2+3i)(2−3i)` is real, exactly. Over an opaque atom it is decided
       * numerically at the atoms' fixed degrees or left unknown: an undecidable claim is never refuted,
       * because refuting a TRUE answer is the one direction of this error that costs the student.
       */
      case 'real':
      case 'imaginary': {
        const { arg } = known(t1, branch, claim.name);
        if (!arg) return undecided({ code: 'undecided-arg', name: claim.name });
        const target = claim.kind === 'real' ? rat(0) : rat(1, 2);
        const z = zeroOf(angSub(angScale(arg, rat(2)), fromTurns(target)));
        if (z === 'unknown') return undecided({ code: 'undecided-arg-irrational', name: claim.name });
        return z === 'zero'
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
         * An opaque base angle is not automatically an obstacle. The sum of the arguments cancels
         * symbolically, so when the two arguments carry the SAME atom with opposing coefficients — which
         * is exactly what «z2 = conj(z1)» produces, whatever z1 is — conjugacy is decided outright.
         * Testing for opacity before testing the claim reported that case as `unknown`, which is a true
         * answer withheld rather than a false one given, but still the wrong verdict.
         */
        // #1481 (ADR-CX-057) — `arg a + arg b ≡ 0`, by the one three-valued `zeroness`. `3+4i` and
        // `3−4i` are `±2·∠(2+i)` in the certified basis, so they cancel and conjugacy holds outright;
        // certified atoms that do not cancel refute it as a theorem. Only an OPAQUE atom that cancels
        // numerically is left unknown — undecidable must not be reported as refuted.
        const sum = zeroOf(angAdd(a.arg, b.arg));
        if (sum === 'zero') return { status: 'holds', why: { code: 'conjugates-hold', a: claim.a, b: claim.b } };
        if (sum === 'unknown') return undecided({ code: 'undecided-arg-pair-irrational', a: claim.a, b: claim.b });
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
        if (!isExactRational(arg)) {
          // #1481 — over certified atoms the n-dependent part `2k·θ` is a theorem of nonzero (k ≠ 0),
          // so «for every n» is refuted exactly; an opaque atom stays unknown
          if (claim.k !== 0 && certifiedOnly(arg)) return forallRefuted();
          return undecided({ code: 'undecided-arg-irrational', name: claim.name });
        }
        const twice = ratMul(arg.turns, rat(2));
        const varies = ratMul(twice, rat(claim.k)); // the n-dependent part
        const constant = ratMul(twice, rat(claim.c));
        const target = claim.prop === 'real' ? ZERO : rat(1, 2);
        const holds = isInt(varies) && isInt(ratSub(constant, target));
        return holds
          ? { status: 'holds', why: { code: 'forall-holds', power: powerText(claim), prop: claim.prop } }
          : forallRefuted();
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
        if (!isExactRational(arg)) {
          // #1481 — no power of a certified-atom direction is ever a rational turn: no n exists
          if (certifiedOnly(arg)) return { status: 'refuted', why: { code: 'minimal-none', name: claim.name, prop: claim.prop } };
          return undecided({ code: 'undecided-arg-irrational', name: claim.name });
        }
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
  /** #1894 (ADR-CX-061) — letters typed as REAL parameters: «a ממשי» about one holds by its type */
  realLetters: ReadonlySet<string> = new Set(),
): CheckedClaim[] =>
  claims.map((c) =>
    c.kind === 'real' && realLetters.has(c.name)
      ? { claim: c, verdict: { status: 'holds', why: { code: 'prop-holds', name: c.name, prop: 'real' } } }
      : verifyClaim(c, t1, branch),
  );
