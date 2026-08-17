/**
 * The error/notice banner — one voice for refusals and warnings across builders (ADR-W-016 seed:
 * "error/notice banners"). `error` is a refusal (red, `role="alert"`); `notice` is a warning that
 * does not block — the load audit's home (ADR-242: the load reports what it could not restore).
 *
 * The banner carries no strings of its own — content and the dismiss label are the caller's,
 * through its own i18n instance, so the product's error voice stays its own (ADR-276: a message
 * names the conflicting statement, never internal state — that discipline lives in the MESSAGE,
 * which is the product's).
 */
import type { CSSProperties, ReactNode } from 'react';
import { color, fs, radius } from '../theme';

interface BannerProps {
  kind: 'error' | 'notice';
  children: ReactNode;
  /** Present = dismissable; the label is the caller's translated text. */
  onDismiss?: () => void;
  dismissLabel?: string;
}

export function Banner({ kind, children, onDismiss, dismissLabel }: BannerProps) {
  const pal =
    kind === 'error'
      ? { fg: color.danger, bg: color.dangerSoft, border: color.dangerBorder }
      : { fg: color.warn, bg: color.warnSoft, border: color.warnBorder };
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} style={{ ...box, color: pal.fg, background: pal.bg, borderColor: pal.border }}>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} style={{ ...dismissBtn, color: pal.fg }}>
          {dismissLabel ?? '×'}
        </button>
      )}
    </div>
  );
}

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
const dismissBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: fs.body,
  fontWeight: 600,
  padding: '0 2px',
  flexShrink: 0,
};
