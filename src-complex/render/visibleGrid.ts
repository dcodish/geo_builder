/**
 * #1465 (ADR-W-094) — the Gauss plane's grid is sized to the VISIBLE window, not to the content.
 *
 * The grid used to run from the first step to the scene's content-fit `extent`, so zooming out left
 * it in the middle of an empty canvas, and even at zoom 1 it stopped short of the sides of a wide
 * canvas. The window is `(W/2)/k` by `(H/2)/k` either side of the origin; the step comes from the
 * shared nice-step rule (`shell/ticks`), so it grows as the view widens.
 */
import { tickStep, tickValues } from '../../shell/ticks';

export interface VisibleGrid {
  /** the cartesian step, shared by both axes so a grid square stays square */
  readonly step: number;
  /** vertical gridlines / Re ticks, and horizontal gridlines / Im ticks — zero (the axis) excluded */
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  /** constant-modulus rings out to the visible corner, at their own nice step */
  readonly rings: readonly number[];
  /** the visible corner's modulus — how far a ray must run to reach the canvas edge */
  readonly reach: number;
  /** where an angle label can sit and stay on the canvas */
  readonly labelRadius: number;
}

/** Cartesian intervals across the wider axis (≤ 12 lines); rings out to the corner (≤ 7). */
const CART_TARGET = 8;
const RING_TARGET = 5;

export function visibleGrid(W: number, H: number, k: number): VisibleGrid {
  const xMax = W / 2 / k;
  const yMax = H / 2 / k;
  const step = tickStep(2 * Math.max(xMax, yMax), CART_TARGET);
  const reach = Math.hypot(xMax, yMax);
  const ringStep = tickStep(reach, RING_TARGET);
  return {
    step,
    xs: tickValues(-xMax, xMax, step),
    ys: tickValues(-yMax, yMax, step),
    rings: tickValues(ringStep, reach, ringStep),
    reach,
    labelRadius: Math.min(xMax, yMax) * 0.9,
  };
}
