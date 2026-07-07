/**
 * Design tokens — the single source of truth for the GUI's typography, palette,
 * and shared control shapes (2026-07 GUI overhaul).
 *
 * Rules the overhaul established:
 *  - ONE font stack (set globally in index.css; no per-element `fontFamily` — the
 *    old mix of `system-ui`, `-apple-system…`, and `ui-monospace` rendered Hebrew
 *    UI text in three different faces).
 *  - A FIXED type scale (`fs`) instead of ad-hoc 10/11/12/12.5/13/14 sizes.
 *  - A SMALL palette: blue = act/submit, violet = explore/insight, semantic
 *    green/amber/red for status. On-state colours that mirror a canvas layer
 *    (relations teal, shapes indigo) are deliberate exceptions and live with
 *    their buttons, not here.
 */
import type { CSSProperties } from 'react';

/** Type scale — caption < small < body < control < title < h1. */
export const fs = {
  caption: 11, // legends, fine print, badge text
  small: 12, // section labels, notes, step rows
  body: 13, // buttons, toggles, banner text
  control: 14, // text input, primary actions
  title: 16, // modal titles
  h1: 20, // the app title
} as const;

export const color = {
  ink: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  surface: '#ffffff',
  surfaceDim: '#f8fafc',
  primary: '#2563eb',
  primarySoft: '#eff6ff',
  primaryBorder: '#bfdbfe',
  primaryInk: '#1e40af',
  accent: '#7c3aed', // explore / insight family
  accentSoft: '#f5f3ff',
  accentBorder: '#ddd6fe',
  accentInk: '#6d28d9',
  ok: '#16a34a',
  warn: '#b45309',
  danger: '#dc2626',
} as const;

export const radius = { control: 8, card: 10, pill: 999 } as const;

/** A sidebar section card — the grouping the flat stack lacked. */
export const card: CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.card,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

/** A section heading inside a card. */
export const sectionTitle: CSSProperties = {
  fontSize: fs.small,
  fontWeight: 700,
  color: '#475569',
  letterSpacing: 0.2,
};

/** Base for every button — variants only override colour/padding. */
const btnBase: CSSProperties = {
  fontSize: fs.body,
  borderRadius: radius.control,
  cursor: 'pointer',
  lineHeight: 1.3,
};

export const btn = {
  /** Filled blue — the one "do it" action of a form (send). */
  primary: {
    ...btnBase,
    padding: '10px 16px',
    fontSize: fs.control,
    border: `1px solid ${color.primary}`,
    background: color.primary,
    color: '#fff',
  } as CSSProperties,
  /** Filled violet — the headline explore action. */
  accent: {
    ...btnBase,
    padding: '9px 14px',
    border: `1px solid ${color.accent}`,
    background: color.accent,
    color: '#fff',
  } as CSSProperties,
  /** Quiet violet outline — secondary explore toggles (off state). */
  accentOutline: {
    ...btnBase,
    padding: '8px 10px',
    border: `1px solid ${color.accentBorder}`,
    background: color.accentSoft,
    color: color.accentInk,
  } as CSSProperties,
  /** Neutral outline — header/utility actions. */
  ghost: {
    ...btnBase,
    padding: '6px 12px',
    border: `1px solid ${color.borderStrong}`,
    background: color.surface,
    color: '#334155',
  } as CSSProperties,
  /** Compact text button — in-card utilities (undo/redo/clear). */
  subtle: {
    ...btnBase,
    padding: '3px 8px',
    fontSize: fs.small,
    border: `1px solid ${color.borderStrong}`,
    background: color.surfaceDim,
    color: '#334155',
  } as CSSProperties,
  /** An example / suggestion chip. */
  chip: {
    ...btnBase,
    padding: '5px 10px',
    fontSize: fs.small,
    borderRadius: radius.pill,
    border: `1px solid ${color.primaryBorder}`,
    background: color.primarySoft,
    color: color.primaryInk,
  } as CSSProperties,
} as const;

/** A small status pill (e.g. the degrees-of-freedom cue). */
export const pill = (fg: string, bg: string, border: string): CSSProperties => ({
  fontSize: fs.caption,
  fontWeight: 600,
  color: fg,
  background: bg,
  border: `1px solid ${border}`,
  borderRadius: radius.pill,
  padding: '2px 8px',
  whiteSpace: 'nowrap',
});

/** A disclosure-fold row ("▸ תצוגה") — quiet, text-only. */
export const foldToggle: CSSProperties = {
  textAlign: 'start',
  fontSize: fs.small,
  color: color.muted,
  background: 'none',
  border: 'none',
  padding: '2px 0',
  cursor: 'pointer',
};
