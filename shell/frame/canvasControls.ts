/**
 * #742 / ADR-W-024 — the ONE canvas-controls contract: every builder's canvas carries the same
 * corner cluster — ↺ reset, − / + zoom — same glyphs, same look, same arithmetic.
 *
 * The cluster is RENDERED by each product (view state lives with each renderer, per docs/20 §6.4:
 * orbit/zoom never enter the store or undo), but its style objects and zoom numbers exist once,
 * here. A product that drew its own differently-shaped buttons is the drift class #739 closed for
 * the under-canvas row; this module closes it for the canvas corner.
 */
import type { CSSProperties } from 'react';

export const CANVAS_ZOOM_STEP = 1.25;
export const CANVAS_ZOOM_MIN = 0.2;
export const CANVAS_ZOOM_MAX = 8;
export const clampZoom = (z: number): number => Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, z));

/** The cluster container — the top inline-end corner of the canvas, above the drawing. */
export const canvasClusterStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  insetInlineEnd: 8,
  display: 'flex',
  gap: 4,
  zIndex: 5,
};

/** One control button — the 3-D reset's look, promoted to the contract for all three. */
export const canvasCtrlStyle: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.9)',
  color: '#475569',
  fontSize: 14,
  lineHeight: '20px',
  padding: '2px 8px',
  cursor: 'pointer',
};
