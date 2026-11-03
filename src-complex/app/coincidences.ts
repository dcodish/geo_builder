/**
 * #1595 ([ADR-CX-086](../../docs/06d-decisions-complex.md#adr-cx-086), [ADR-W-176](../../docs/06w-decisions-workspace.md#adr-w-176))
 * — TWO NAMED NUMBERS ON ONE DOT ARE ACCEPTED, AND THE PAGE SAYS SO.
 *
 * Operator, 2026-09-30: *"when 2 dots are on top of each other we should accept but always give a message about it.
 * this is correct for all tools"*. In this tree the dots are the named numbers' plotted positions, so «z1 = 2+3i» ·
 * «z2 = 2+3i» (or «z2 = z1») draws one dot carrying two names. 2-D's ADR-123 sentence is the reference (ADR-W-118
 * B1), through the suite key `suite.notice.converge`.
 *
 * Every point of `Derived2.points` is plotted and labelled (`buildScene`), so every one counts. A letter BOUND to a
 * number («A = z1») is already ONE point with the dual label «A (z₁)» (#791) and never forms a pair here. The identity
 * test is the solver's own resolution (`tier2.TOL`) relative to the numbers' size, so a value computed two ways
 * (2.9999999999999996 against 3) is the same point and a stated 2+3i against 2+3.001i is not.
 *
 * Read from the derivation the canvas draws, on every render: the notice holds while the drawing has the pair.
 */
import { coincidentPairs } from '../../shell/converge';
import type { Derived2 } from '../replay/derive2';
import { TOL } from '../solve/tier2';

export function coincidencesCx(d: Pick<Derived2, 'points'>): [string, string][] {
  return coincidentPairs(
    d.points.map((p) => [p.display, p.z] as const),
    (a, b) => Math.hypot(a.re - b.re, a.im - b.im) <= TOL * Math.max(1, Math.hypot(a.re, a.im), Math.hypot(b.re, b.im)),
  );
}
