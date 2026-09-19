/**
 * THE FRAME IS FITTED TO EVERYTHING THAT WILL BE DRAWN — not to the figure alone (#1198).
 *
 * Operator, playing round #1193 T11: *"pressing on show another config causes the image to jump
 * right and left and the entire shape is not shown."*
 *
 * `derive`'s box frames the FIGURE. A traced locus is not in the figure: it is caller-owned
 * decoration handed to the renderer afterwards, the same seam as `marks` and `crossings`. So the
 * trace was projected into a frame that had been decided without it, and measured on the operator's
 * own figure it fell outside in **4 of 6 configurations** — the tool clipped the one object he had
 * asked to see.
 *
 * ## Why this lives in `app/` and not in `derive`
 *
 * This is the only layer that holds both the derivation and the answers asked about it. Feeding a
 * question's trace back into `derive` would make the figure depend on the questions asked about it,
 * which 02c R24 forbids in as many words — *an ask is a dry-run construction, built internally,
 * evaluated, discarded; it must never change the figure*. So the composition happens here and the
 * engine stays ignorant of the ask lane.
 *
 * It is a FUNCTION rather than three lines inside the component for the usual reason: the decision
 * "what is on the canvas" is testable only if something can call it
 * ([ADR-W-053](../../docs/06w-decisions-workspace.md) — a lock must call the decision, never
 * reproduce it).
 *
 * ## ⚠ This is HALF of #1198
 *
 * The frame still LURCHES between configurations — measured on the same figure, its width varies by
 * a factor of 2.6 and its centre swings from +55 to −63 — because it is re-fitted from nothing on
 * every press. That half is a product ruling about what «הציגו תצורה אחרת» should feel like (fit
 * once and keep it · normalise the scale by the parameter · clamp how far the frame may move), and
 * the issue says so. Containment does not depend on it, and lands first.
 */
import { viewBox, type Figure } from '../engine/evaluate';
import type { Box } from '../engine/curves';

/** What the app knows about one answered question, for framing purposes only. */
export interface DrawnAnswer {
  /** A collapsed answer is not on the canvas — framing for it would zoom out for something invisible. */
  shown?: boolean;
  locus?: { points: Array<{ x: number; y: number }> };
}

/**
 * The box to look through: the figure's own, widened to contain every trace that is actually shown.
 *
 * Returns the figure's box UNCHANGED when nothing extra is drawn — not an equal box built a second
 * way. The auto-refit effect keys on the box's numbers, so a recomputation that differed in the last
 * bit would re-frame the canvas under a student who had deliberately zoomed.
 */
export function drawnBox(figure: Figure, figureOwn: Box, answers: readonly DrawnAnswer[]): Box {
  const trace = answers.flatMap((a) => (a.shown && a.locus ? a.locus.points : []));
  return trace.length === 0 ? figureOwn : viewBox(figure, 0.15, trace);
}
