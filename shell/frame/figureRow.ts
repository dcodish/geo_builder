/**
 * #743 — the under-canvas row's ONE look, in every builder.
 *
 * #739 unified the row's MEMBERS and wording, #742 its disabled behaviour — and each product still
 * painted its own buttons (2-D: accent + subtle pills, spread; 3-D: uniform rounded-xl; complex:
 * plain rectangles). Same members, three implementations — the #734 class. These style objects are
 * the contract, seeded VERBATIM from the 2-D look the operator praised («הציגו תצורה אחרת» keeps
 * its prominence — "looks nice"):
 *
 *   [accent alternatives-button] … product extras … [spacer] … [subtle undo/redo/clear, clear in danger]
 *
 * Products render their own rows (extra members differ) but every shared member takes these styles.
 */
import type { CSSProperties } from 'react';

const btnBase: CSSProperties = {
  fontSize: 13,
  borderRadius: 8,
  cursor: 'pointer',
  lineHeight: 1.3,
};

/** The row container — flex, wrapping, actions spread by {@link rowSpacerStyle}. */
export const figureRowStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 };
/** The gap between the figure actions (inline-start) and the session ops (inline-end). */
export const rowSpacerStyle: CSSProperties = { flex: 1 };

/** The alternatives button — the row's one filled accent. */
export const rowAccentStyle: CSSProperties = {
  ...btnBase,
  padding: '9px 14px',
  border: '1px solid #7c3aed',
  background: '#7c3aed',
  color: '#fff',
};
export const rowAccentOffStyle: CSSProperties = { ...rowAccentStyle, opacity: 0.5, cursor: 'default' };

/** Compact text buttons — undo/redo/clear and quiet product extras. */
export const rowSubtleStyle: CSSProperties = {
  ...btnBase,
  padding: '3px 8px',
  fontSize: 12,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  color: '#334155',
};
export const rowSubtleOffStyle: CSSProperties = { ...rowSubtleStyle, opacity: 0.45, cursor: 'default' };

/** Clear-all wears the danger tone over the subtle shape. */
export const rowDangerInk = '#dc2626';
