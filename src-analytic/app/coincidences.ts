/**
 * #1595 ([ADR-AG-366](../../docs/06c-decisions-analytic.md#adr-ag-366), [ADR-W-176](../../docs/06w-decisions-workspace.md#adr-w-176))
 * — TWO LETTERS ON ONE DOT ARE ACCEPTED, AND THE PAGE SAYS SO.
 *
 * Operator, 2026-09-30, playing round #1571 T23 in this tree («V(0,0) · X(4,0) · Y נמצאת על הישר y=x · שיעור ה-x של
 * Y הוא 0» put Y on V, silently): *"when 2 dots are on top of each other we should accept but always give a message
 * about it. this is correct for all tools"*. 2-D's ADR-123 notice is the reference (ADR-W-118 B1); its sentence is the
 * suite key `suite.notice.converge`.
 *
 * Read off the DRAWN figure on every render, like 2-D's: the pairs of points the canvas labels that sit at one place,
 * at the identity tolerance this tree already uses for "this is the same point" (`crossings.apart`, ADR-AG-021's
 * relative rule) — not the display's 1% "reads as stacked" ruler (`stackedPairs`), because the sentence says the two
 * ARE one point. A pair the givens do not force is the separation preference's business (#1526, ADR-AG-181): by the
 * time a figure is drawn it has already looked for a configuration that keeps them apart. So the notice shows for as
 * long as the drawing has the pair, and a mute, an edit or another configuration that separates it clears it.
 */
import { coincidentPairs } from '../../shell/converge';
import { apart } from '../engine/crossings';
import { SOLVE_TOL } from '../engine/solve';
import type { Derivation } from '../engine/derive';

/*
 * The floor (#1595, ADR-AG-372): `apart` is relative to the figure's span, and a figure whose points ALL sit on the one
 * dot («A(0,0)» · two equation lines through it · their crossing P) has no span, while the solver leaves the crossing up
 * to ~1e-9 away. So "the same point" is floored at ten times the solve's own tolerance — the rule the retired
 * `crossing-already-named` arm used for this same question (#1276: a threshold below the residual decides nothing).
 */
export function coincidencesOf(d: Pick<Derivation, 'figure'>): [string, string][] {
  const near = Math.max(apart(d.figure), SOLVE_TOL * 10);
  return coincidentPairs(
    d.figure.points.map((p) => [p.id, p] as const),
    (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < near,
  );
}
