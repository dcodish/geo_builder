/**
 * WHICH CURVES THE DATA PANEL LISTS (#1250) — one decision, in one place, so a lock can CALL it.
 *
 * This lived inline in `App.tsx` as `curves.filter((c) => c.stated)`. It is extracted rather than
 * widened in place because a test written against an inline filter has to re-implement it, and a
 * test that reproduces the decision it guards stays green through the change that kills the feature
 * ([ADR-W-053](../../docs/06w-decisions-workspace.md)).
 *
 * ## The rule, and why it is not `stated`
 *
 * Operator ruling, 2026-09-19: *"if we say that a point is on a line, we dont draw the line but if we
 * specifically mention a line, we should have its equation."*
 *
 * So there are two different questions, and they now have different answers:
 *
 * - **the canvas** asks `stated` — is this line DRAWN? («משוואת הצלע CE» draws only the segment)
 * - **the panel** asks this — was this line MENTIONED?
 *
 * They coincided until [ADR-AG-111](../../docs/06c-decisions-analytic.md) made a mentioned line
 * undrawn for the first time, and the equation a student had just written vanished from the one place
 * they check what the tool understood.
 *
 * ## `label.name` IS "mentioned", and not by coincidence
 *
 * A line the student made the SUBJECT of a sentence is one they referred to by name. A line minted
 * only to hold a point — #1078's «B על הישר y=x» — has nothing to call it, and #1078's objection was
 * exactly that: *"there is no way to know what it belongs to"*. That ruling is preserved here, not
 * reversed: an anonymous carrier still gets no row.
 *
 * A second flag (`drawn` beside `listed`) was considered and rejected: it would have to be set
 * correctly at every mint site, while the name already answers truthfully at all of them.
 */

/** The shape both the panel and its locks need — deliberately narrower than `CurveObject`. */
export interface PanelCurve {
  stated: boolean;
  label: { name: string };
}

/** Does this curve get an equation row? */
export const panelListsCurve = (c: PanelCurve): boolean => c.stated || c.label.name !== '';
