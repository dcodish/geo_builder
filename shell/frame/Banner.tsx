/**
 * The error/notice banner — one voice for refusals and warnings across builders (ADR-W-016 seed:
 * "error/notice banners"). `error` is a refusal (red, `role="alert"`); `notice` is a warning that
 * does not block — the load audit's home (ADR-242: the load reports what it could not restore);
 * `info` is a statement about the figure with nothing wrong and nothing to do (blue, `role="note"`,
 * 2-D's strip measured, ADR-W-180).
 *
 * The banner carries no strings of its own — content and the dismiss label are the caller's,
 * through its own i18n instance, so the product's error voice stays its own (ADR-276: a message
 * names the conflicting statement, never internal state — that discipline lives in the MESSAGE,
 * which is the product's).
 */
import type { CSSProperties, ReactNode } from 'react';
import { color, fs, radius } from '../theme';

interface BannerProps {
  kind: 'error' | 'notice' | 'info';
  children: ReactNode;
  /** Present = dismissable; the label is the caller's translated text. */
  onDismiss?: () => void;
  dismissLabel?: string;
  /** The dismiss button's accessible name when its visible label is a glyph (✕) — the caller's translated text. */
  dismissAriaLabel?: string;
}

export function Banner({ kind, children, onDismiss, dismissLabel, dismissAriaLabel }: BannerProps) {
  const pal = PALETTE[kind];
  return (
    <div role={ROLE[kind]} style={{ ...box, ...(kind === 'info' ? infoPadding : null), color: pal.fg, background: pal.bg, borderColor: pal.border }}>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label={dismissAriaLabel} style={{ ...dismissBtn, color: pal.fg }}>
          {dismissLabel ?? '×'}
        </button>
      )}
    </div>
  );
}

/**
 * The information strip opened by the ⓘ, 2-D's face for a note about the figure: the forced narrowing (ADR-W-180) and
 * two letters on one dot. The sentence is the caller's. A note on this face cannot lose the mark or the colour by builder.
 */
export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <Banner kind="info">
      <span aria-hidden="true">ⓘ </span>
      {children}
    </Banner>
  );
}

const PALETTE = {
  error: { fg: color.danger, bg: color.dangerSoft, border: color.dangerBorder },
  notice: { fg: color.warn, bg: color.warnSoft, border: color.warnBorder },
  info: { fg: color.info, bg: color.infoSoft, border: color.infoBorder },
} as const;
const ROLE = { error: 'alert', notice: 'status', info: 'note' } as const;

const box: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  border: '1px solid',
  borderRadius: radius.control,
  padding: '6px 10px',
  fontSize: fs.body,
  lineHeight: 1.5,
};
/** 2-D's information strip is the reference for this kind, its padding included (ADR-W-118 B1, ADR-W-180). */
const infoPadding: CSSProperties = { padding: '8px 12px' };
const dismissBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: fs.body,
  fontWeight: 600,
  padding: '0 2px',
  flexShrink: 0,
};
