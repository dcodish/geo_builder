/**
 * The shared design tokens — the single palette every builder renders (ADR-W-016 seed,
 * ADR-W-018 decision 3 / docs/28 §4a D2+D3).
 *
 * The VALUES are `src/ui/theme.ts`'s — the one documented design system — copied here as the
 * workspace's declared token source. The 2-D module stays in place until Track B migrates that
 * app surface-by-surface (docs/28 §4a D2); this file is what `shell/` components and
 * `src-complex/` consume today, and what B1 (#666) turns into the Tailwind theme.
 *
 * Rules carried over from the 2-D overhaul:
 *  - ONE font stack, set by the consuming app's stylesheet — no per-element `fontFamily`.
 *  - A FIXED type scale (`fs`) instead of ad-hoc pixel sizes.
 *  - A SMALL palette: blue = act/submit, violet = explore/insight, semantic ok/warn/danger.
 *
 * `shell/` never branches on product identity (ADR-W-003, restated by ADR-W-016 rule 2) — a
 * builder's visual identity is carried by the switcher's active state, never by a theme fork.
 */

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
  okSoft: '#f0fdf4',
  okBorder: '#bbf7d0',
  warn: '#b45309',
  warnSoft: '#fffbeb',
  warnBorder: '#fde68a',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
  dangerBorder: '#fecaca',
} as const;

export const radius = { control: 8, card: 10, pill: 999 } as const;
