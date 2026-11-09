/**
 * #754 (ADR-3D-171): a stated MAGNITUDE on a gauge-frozen figure is a GIVEN that pins the
 * figure's SCALE — never a claim to refute, and never a refusal.
 *
 * ADR-3D-054 makes a solid's first dimension the similarity gauge — frozen rather than solved —
 * so «קובייה ABCD…» + «|AB| = 4» had nothing to constrain and refused `size-on-solid`, while
 * «נפח הפירמידה ABCD = 11» fell through to the claim lane and told the student to check their
 * arithmetic about a figure whose size the TOOL had invented. The operator's ruling (2026-08-26,
 * on the issue): *"I dont see any reason to refuse this case… the shape might not change at all
 * since the proportion of 1 or 4 are the same."*
 *
 * The mechanism, read as binding on HOW, not just the outcome: the magnitude acts on the scale
 * UNIFORMLY — one factor k applied to every length — and never on the shape DOFs. A length scales
 * by k, an area by k², a volume by k³. The shape DOFs stay free, sampled and cycled exactly as
 * before; k is recomputed per configuration so the stated magnitude holds EXACTLY in every drawing
 * while the proportions keep varying (the acceptance property a naive scalar-pin implementation
 * silently fails — the solver would grow the free height into a needle to reach a stated volume,
 * silently asserting a proportion the student never gave, ADR-052's cardinal sin).
 *
 * One predicate ({@link scaleGivenActive}) is shared by the apply-time routing, the resolver's
 * rescale, and the store's refusal ladder, so the three seams can never disagree about whether the
 * scale given is in force (the "guard bound to the event, not the code path" discipline).
 */

import { scalePinned } from './solve3';
import { resolveSolidSubject, subjectVolume } from './solidSubject';
import { cross3, norm3, sub3, type Vec3 } from './vec3';
import { reachesFreeCarrier3 } from './carriers';
import { claimPointIds, hasAbsoluteFrameObject, type Claim3, type Construction3, type Id } from './types';

/** The magnitude claim kinds that pin the scale, with the POWER the factor enters at. */
export function scaleGivenPower(claim: Claim3): 1 | 2 | 3 | null {
  switch (claim.type) {
    case 'length-eq':
    case 'length-sum': // #1680 (ADR-3D-392): a sum of lengths scales by k, like one length
      return 1;
    case 'area-eq':
      return 2;
    case 'volume-poly':
      return 3;
    default:
      return null;
  }
}

/** The stated value of a magnitude claim, or null for every other claim kind. */
export function scaleGivenValue(claim: Claim3): number | null {
  switch (claim.type) {
    case 'length-eq':
    case 'length-sum':
    case 'area-eq':
    case 'volume-poly':
      return claim.value;
    default:
      return null;
  }
}

/** Is this claim a magnitude statement a scale given can be minted from? (value must be a real size) */
export function isScaleGivenClaim(claim: Claim3): boolean {
  const v = scaleGivenValue(claim);
  // #1680: a SIGNED sum («AB − BC = 2») has no uniform factor that is sure to be positive — only an all-positive one
  if (claim.type === 'length-sum' && claim.terms.some((t) => !(t.c > 0))) return false;
  return v !== null && Number.isFinite(v) && v > 0;
}

/**
 * May the figure's scale be taken from a stated magnitude — i.e. is a uniform rescale of every
 * position both MEANINGFUL (the scale is a frozen gauge nothing else owns) and SAFE (no absolute
 * object would be detached by it)? Deliberately conservative: any absolute-frame object
 * ({@link hasAbsoluteFrameObject}), a revolution solid with its own stated dims, or any pin that fixes
 * the scale keeps today's behaviour — that corner is the placement design's (#551), and refusing
 * it honestly beats half-solving it.
 *
 * Asked WITHOUT reference to `scaleGivens` itself so it serves both roles: at APPLY time (may a
 * new magnitude become the scale given?) and at RESOLVE/report time (is the recorded scale given
 * still in force, or did a later fact bring an absolute object that supersedes it?).
 */
export function scaleGivenSafe(c: Construction3): boolean {
  if (c.solids.length === 0) return false;
  if (c.revolutions.length > 0 || c.circles3.length > 0) return false;
  // #2746 (ADR-3D-453): "would a uniform rescale detach an absolute object?" is the placement funnel's own question,
  // so it is asked of the ONE predicate (an equation plane, a parametric line, a coordinate point, a coordinate-plane
  // or axis relation). This used to be a second, hand-kept list counting EVERY plane and line, and it drifted when
  // ADR-3D-435 stopped counting a free plane there: a bare «מישור π3» or «ישר l» detached «אורך AB = 4». A free or
  // figure-derived plane/line is resolved from the figure, so the rescale below carries it along (evaluate.ts).
  if (hasAbsoluteFrameObject(c)) return false;
  // A `partial` point («P על החלק החיובי של ציר ה-x», ADR-3D-094) is the one category the two lists still read
  // differently: Lane-A absolute here, not counted by `absolutePointCount` there. Kept refused (today's behaviour)
  // pending the operator's ruling on whether it frames the figure — see ADR-3D-453 and #2746.
  for (const def of c.points.values()) if (def.kind === 'partial') return false;
  if (scalePinned(c)) return false; // pins of any kind, or a scale-fixing scalar pin — the pivot owns scale
  return true;
}

/** Is a recorded scale given in force for THIS construction? (the one predicate all seams share) */
export function scaleGivenActive(c: Construction3): boolean {
  return c.scaleGivens.length > 0 && scaleGivenSafe(c);
}

/**
 * #1782 (ADR-3D-393) — IS THE FIGURE'S SIZE STATED by a magnitude the student gave? Either the scale given is in
 * force, or a magnitude was DEMOTED from it to a pivot pin (a later given read a free carrier, so the rescale and
 * the pivot could not both own the size) and that pin reads only points without a free carrier — «AB = 2» on a
 * cube's edge, which fixes the size whatever the rider does. A pin like «AP = 3» to a free P fixes nothing: P
 * moves instead. The store's later-magnitude check asks this, so a rigid figure sized by a demoted given checks
 * «AC = 10» exactly, as it did while the same «AB = 2» was the scale given.
 */
export function magnitudeSizeStated3(c: Construction3): boolean {
  if (scaleGivenActive(c)) return true;
  return c.scalarPins.some(
    (p) => (p.kind === 'length' || p.kind === 'area3' || p.kind === 'volume3') && !reachesFreeCarrier3(c, claimPointIds(c, p)),
  );
}

/**
 * The claim's measured magnitude on resolved positions — computed EXACTLY the way the claim
 * verifier measures it, so the rescaled figure verifies the scale given to machine precision.
 */
export function scaleGivenMagnitude(claim: Claim3, c: Construction3, pos: Map<Id, Vec3>): number | null {
  switch (claim.type) {
    case 'length-eq': {
      const a = pos.get(claim.a);
      const b = pos.get(claim.b);
      return a && b ? norm3(sub3(b, a)) : null;
    }
    case 'length-sum': {
      let sum = 0;
      for (const t of claim.terms) {
        const a = pos.get(t.a);
        const b = pos.get(t.b);
        if (!a || !b) return null;
        sum += t.c * norm3(sub3(b, a));
      }
      return sum;
    }
    case 'area-eq': {
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.some((p) => !p)) return null;
      return 0.5 * norm3(cross3(sub3(ps[1]!, ps[0]!), sub3(ps[2]!, ps[0]!)));
    }
    case 'volume-poly':
      return subjectVolume(resolveSolidSubject(c, claim.noun, claim.ids), pos);
    default:
      return null;
  }
}
