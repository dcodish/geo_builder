/**
 * THE DATA PANEL — one skeleton for "what the figure knows" (B6 #670-track, docs/28 §4a D8, built
 * under the shared-components ruling): the SAME sections in the SAME order in every builder —
 * points · measures · relations · parameters · ask — each product filling only the sections that
 * apply to it (an empty section is simply absent, never a hollow heading).
 *
 * The head-line is the freedom cue's generic home (operator ruling, 2026-08-18): a compact status
 * line at the top of the panel — a DOF count and the sampled-value legend, never a configuration
 * count and never a per-DOF resolution of what can move. The product composes the line; the chrome
 * only gives it the one place.
 *
 * Binding regardless of chrome (D8): a value row may print a VALUE only when it is knowledge —
 * invariant across every valid configuration — never "in the current sample" dressed as a result.
 * That gate lives in the product's derivation; this component renders what it is given.
 */
import type { CSSProperties, ReactNode } from 'react';
import { color } from '../theme';

export interface DataSection {
  key: string;
  title: string;
  /** Rendered top to bottom; an empty list drops the whole section, heading included. */
  rows: ReactNode[];
  /** Value rows are LTR monospace math by default. 'app' rows follow the app's own direction and
   *  font — for prose rows (worded relations, query answers) whose nodes carry their own per-row
   *  bidi handling (the 3-D #559 lesson: a list-wide dir turns one panel into two edges). */
  dir?: 'ltr' | 'app';
}

export interface DataPanelProps {
  /** The shared column head — ONE title, ONE toggle, the same in every builder (operator ruling,
   *  2026-08-18: "the same way we trigger the ability to see this side panel"). Omit `title` for a
   *  headless panel (always-open embeds). */
  title?: string;
  open?: boolean;
  onToggle?: () => void;
  showLabel?: string;
  hideLabel?: string;
  /** The compact status head-line (the freedom cue's generic home). Omitted = no status row. */
  status?: ReactNode;
  sections: DataSection[];
  /** Extra product blocks below the skeleton (e.g. the complex formula sheet, an ask form). */
  children?: ReactNode;
}

export function DataPanel({ title, open, onToggle, showLabel, hideLabel, status, sections, children }: DataPanelProps) {
  const filled = sections.filter((s) => s.rows.length > 0);
  const expanded = open !== false;
  return (
    <div style={wrap}>
      {title != null && (
        <div style={headStyle}>
          <span style={headTitle}>{title}</span>
          {onToggle && (
            <button type="button" onClick={onToggle} aria-expanded={expanded} style={headToggle}>
              {expanded ? hideLabel : showLabel}
            </button>
          )}
        </div>
      )}
      {!expanded ? null : (
        <>
      {status != null && <div style={statusStyle}>{status}</div>}
      {filled.map((s) => (
        <section key={s.key} style={sectionStyle}>
          <div style={titleStyle}>{s.title}</div>
          {s.rows.map((r, i) =>
            s.dir === 'app' ? (
              <div key={i} style={rowApp}>
                {r}
              </div>
            ) : (
              <div key={i} dir="ltr" style={rowLtr}>
                {r}
              </div>
            ),
          )}
        </section>
      ))}
      {children}
        </>
      )}
    </div>
  );
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const headStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const headTitle: CSSProperties = { fontSize: '0.95rem', fontWeight: 700, color: color.ink };
const headToggle: CSSProperties = {
  border: `1px solid ${color.border}`,
  background: color.surface,
  color: color.muted,
  borderRadius: 999,
  padding: '3px 12px',
  fontSize: '0.8rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
};
const statusStyle: CSSProperties = {
  fontSize: '0.8rem',
  color: color.muted,
  background: color.surfaceDim,
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  padding: '6px 10px',
  lineHeight: 1.45,
};
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const titleStyle: CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  color: color.muted,
  letterSpacing: '0.04em',
  borderBottom: `1px solid ${color.surfaceDim}`,
  paddingBottom: 2,
  marginBottom: 3,
};
const rowLtr: CSSProperties = {
  direction: 'ltr',
  textAlign: 'left',
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: '0.85rem',
  color: color.ink,
};
const rowApp: CSSProperties = { fontSize: '0.85rem', color: color.ink };
