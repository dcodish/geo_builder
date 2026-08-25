/**
 * #688 — a CLAIM over an undetermined number DRIVES; over a determined one it still only CHECKS.
 *
 * The defect: «z1 מדומה טהור» on its own drew z₁ at 189.12°, nowhere near the imaginary axis, while the
 * panel honestly read `unknown` ("the argument of z1 is not yet determined by the givens"). `verifyClaim`
 * was not at fault — with `arg z1` free there is genuinely nothing to verify, and `unknown` is a
 * first-class answer. The defect is that the tool had no reading for *"the student stated a property of
 * a number that nothing else determines"*, and both readings it did have are wrong:
 *
 *  - as a CLAIM → verdict `unknown`, and the sampler then places z₁ at 189° anyway. That sampled
 *    direction is not neutral: it ASSERTS `arg z1 ≈ 189°`, contradicting what the student just typed.
 *    [ADR-052](../../docs/06-decisions.md#adr-052)'s conformance smell in its worst form — not a default
 *    masquerading as fixed, but a default CONTRADICTING something stated.
 *  - ignoring it → a silently dropped statement.
 *
 * The mechanism already exists in this tree and the claim families never got half of it: `driveOrCheck`.
 * F3/F4 relations do it; ADR-CX-005's roots modes do it (fresh → enumerate, existing free → constrain,
 * determined → verify). The claim families were built check-only. See ADR-CX-029.
 *
 * WHY THE ROWS LOOK LIKE THIS. An argument row carries an integer turn unknown, and that freedom IS the
 * branch set (ADR-CX-006). Squaring the subject is what turns a modular claim into an ordinary row:
 *
 *     imaginary z  ⇒  arg(z²) = arg(−1)  ⇒  2·arg z = ½ + k  ⇒  arg z ∈ {90°, 270°}
 *     real z       ⇒  arg(z²) = arg(1)   ⇒  2·arg z = 0 + k  ⇒  arg z ∈ {0°, 180°}
 *
 * so the two configurations arrive for free and «show another configuration» walks 90° ↔ 270° exactly as
 * it should — no new solver concept, no enumeration of claim kinds inside the solver.
 *
 * THE GUARD IS THE WHOLE SAFETY ARGUMENT: a row is added ONLY where the relevant degree of freedom is
 * free, measured by the tool's own published `freeDof`. If the givens determine the subject, nothing is
 * driven and the claim is verified as before — «z1 = 3+4i» then «z1 מדומה טהור» stays `refuted` and still
 * lands with a ✗. A claim can only move a figure the givens left open, i.e. where there was no answer to
 * get wrong, so *"a claim that could move the figure would make every answer correct"* survives intact.
 */
import type { Claim } from '../model/claim';
import type { Constraint } from '../model/constraint';
import { abs, div, num, pow, ref, refsOf } from '../model/expr';
import { rat } from '../value/rational';
import { isTurnUnknown, type Tier1Result } from './tier1';

/**
 * Is the subject's direction PINNED by the other lines?
 *
 * Deliberately not `freeDof.includes('arg z1')`: that list is built from the solver's `free` basis, and a
 * name no constraint mentions at all never enters the system, so a LONE claim — «z1 מדומה טהור» with
 * nothing else typed, which is the reported case — would read as "not free" and never drive. Absent is
 * maximally free, not determined.
 *
 * Pinned means: determined, and determined by CONSTANTS — a residual coefficient on some other free
 * argument is not a value. Turn unknowns are exempt because the branch has already chosen them; this
 * mirrors how `knownModulus` is built from the modulus half (`coefs.size === 0`).
 */
const argPinned = (t1: Tier1Result, name: string): boolean => {
  const d = t1.argument.determined.get(name);
  return d !== undefined && [...d.coefs.keys()].every(isTurnUnknown);
};
const argFree = (t1: Tier1Result, name: string): boolean => !argPinned(t1, name);
/** The modulus half's own published notion of "this is a value, not a relation". */
const modFree = (t1: Tier1Result, name: string): boolean => !t1.knownModulus.has(name);

/**
 * The constraint rows the claims may contribute, given what the other lines already established.
 *
 * Returns `[]` when every subject is determined — which is the ordinary case, and the reason this is
 * cheap: `foldConstraints` re-solves tier 1 only when this is non-empty.
 */
export function claimDriveRows(assertions: readonly Claim[], t1: Tier1Result): Constraint[] {
  /**
   * A subject some OTHER lane can pin is not open, whatever tier 1 thinks.
   *
   * Tier 1 only sees MONOMIAL rows: «z1 = 1+i» is an `add` on the right, so it is DEFERRED to the
   * residual tier and tier 1 never learns that z1 is fixed. Gating on tier 1 alone therefore read a
   * fully-stated number as free and let the claim drive it onto the imaginary axis — a claim
   * overriding a given, which is the one thing this must never do. (Caught by
   * `acceptance-gate.test.ts`, which noticed the refusal reason change from `incompatible` to
   * `impossible` — the system had become contradictory rather than merely disagreeing with a claim.)
   *
   * So: a name mentioned anywhere in a deferred constraint is treated as determined. Conservative on
   * purpose — the cost of a false "determined" is the old behaviour (a claim that checks instead of
   * driving, verdict `unknown`), while the cost of a false "free" is a figure that contradicts a
   * stated given.
   */
  const deferredNames = new Set(t1.deferred.flatMap((c) => [...refsOf(c.lhs), ...refsOf(c.rhs)]));
  const open = (name: string): boolean => !deferredNames.has(name);
  const out: Constraint[] = [];
  for (const a of assertions) {
    switch (a.kind) {
      case 'real':
      case 'imaginary': {
        // `forall-power` / `minimal-power` are deliberately absent: they answer «prove/find n», and
        // driving them would let a guess reshape the figure.
        if (!argFree(t1, a.name) || !open(a.name)) break;
        out.push({
          kind: 'arg',
          lhs: pow(ref(a.name), rat(2)),
          rhs: num(rat(a.kind === 'real' ? 1 : -1)),
          src: a.src,
        });
        break;
      }
      case 'conjugates': {
        // equal moduli AND opposite arguments — the two halves are gated independently, because the
        // givens may have pinned one and left the other open.
        if (!open(a.a) || !open(a.b)) break;
        if (modFree(t1, a.a) || modFree(t1, a.b)) {
          out.push({ kind: 'mod', lhs: abs(ref(a.b)), rhs: abs(ref(a.a)), src: a.src });
        }
        if (argFree(t1, a.a) || argFree(t1, a.b)) {
          // arg b = −arg a, written as the direction of 1/a (a reciprocal has the opposite argument)
          out.push({ kind: 'arg', lhs: ref(a.b), rhs: div(num(rat(1)), ref(a.a)), src: a.src });
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}
