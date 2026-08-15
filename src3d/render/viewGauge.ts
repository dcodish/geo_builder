/**
 * #533 (ADR-3D-155): the VIEW GAUGE's pure arithmetic — orbit, zoom and now PAN are three components
 * of one gauge, all local to `Figure3`, none of them ever reaching the figure (docs/20 §6.4).
 *
 * The two decisions worth getting right are extracted here rather than left inline in the event
 * handlers, for one practical reason: this tree tests React DOM-free (`renderToStaticMarkup` — there
 * is no jsdom and no testing-library anywhere in the repo), so logic that lives inside a handler is
 * logic no test can reach. As pure functions they are locked directly, and the handlers become the
 * thin wiring they should be.
 */

/** Which gesture a pointer-down begins. */
export type DragMode = 'orbit' | 'pan';

export interface DragIntent {
  /** PointerEvent.button — 0 left, 1 middle, 2 right. */
  button: number;
  shiftKey: boolean;
  /** How many pointers are down INCLUDING this one. */
  pointerCount: number;
}

/**
 * Operator ruling (2026-08-11): modifier + secondary drag, no new on-canvas UI.
 *
 * **Left-drag stays orbit and does not move** — it is the primary gesture, and a student who has
 * learned it must not find it repurposed. Pan is the secondary button, the modified drag, or — on
 * touch, where there are no buttons or modifiers — the two-pointer drag, so one finger still orbits.
 */
export function dragModeFor({ button, shiftKey, pointerCount }: DragIntent): DragMode {
  return button === 1 || button === 2 || shiftKey || pointerCount > 1 ? 'pan' : 'orbit';
}

export interface Pan {
  x: number;
  y: number;
}

/**
 * The pan that keeps the point under the cursor UNDER THE CURSOR across a zoom step.
 *
 * Without this, zoom is the gesture that loses the figure: `k` grows while the fit stays centred on
 * the content bounding box, so zooming in magnifies about a point that may be nowhere near the solid
 * and drives it further off-canvas. With it, zoom becomes a framing tool.
 *
 * A screen point `p` maps to `(p − pan)·r + pan'`. Demanding that `q` is fixed gives
 * `pan' = q − (q − pan)·r`. Pass the ACTUAL ratio `next/prev`, not the nominal step: at the zoom
 * clamp the ratio is 1, and then this correctly pans nothing at all.
 */
export function panForZoom(q: Pan, pan: Pan, ratio: number): Pan {
  return { x: q.x - (q.x - pan.x) * ratio, y: q.y - (q.y - pan.y) * ratio };
}
