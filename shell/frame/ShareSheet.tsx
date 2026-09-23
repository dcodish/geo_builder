/**
 * The share sheet (#1374) — what a teacher sees after pressing «העתק קישור».
 *
 * It exists because the short link is made by an UPLOAD, and an upload is asynchronous. Safari
 * rejects a clipboard write issued after an `await`, so "click → it is on your clipboard" cannot be
 * guaranteed any more. Rather than pretend, the link is SHOWN with a copy button of its own: the
 * copy then happens on a fresh gesture, which works everywhere, and the teacher can see the URL —
 * which is what he wanted in the first place («too long and ugly» was a complaint about looking at
 * it, not only about sending it).
 *
 * Strings are the caller's, through its own i18n instance — `shell/` holds none (ADR-W-016 rule 2).
 */
import type { CSSProperties } from 'react';
import { Banner } from './Banner';
import { color, fs, radius } from '../theme';

export interface ShareSheetProps {
  url: string;
  /** e.g. «הקישור מוכן — העתיקו ושלחו» */
  message: string;
  copyLabel: string;
  copiedLabel: string;
  dismissLabel: string;
  /** Present when the SHORT link could not be made and this is the long fallback — the caller says why. */
  fallbackNote?: string;
  copied: boolean;
  onCopy: () => void;
  onDismiss: () => void;
}

export function ShareSheet({
  url,
  message,
  copyLabel,
  copiedLabel,
  dismissLabel,
  fallbackNote,
  copied,
  onCopy,
  onDismiss,
}: ShareSheetProps) {
  return (
    <Banner kind="notice" onDismiss={onDismiss} dismissLabel={dismissLabel}>
      <div style={wrap}>
        <span>{message}</span>
        {fallbackNote && <span style={{ color: color.warn }}>{fallbackNote}</span>}
        <div style={row}>
          {/* readOnly + select-on-focus: the URL is for copying, not for editing, and a teacher on a
              desktop will reach for ctrl-C before finding the button. */}
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            style={field}
            dir="ltr"
            aria-label={message}
          />
          <button type="button" onClick={onCopy} style={{ ...btn, ...(copied ? okBtn : primaryBtn) }}>
            {copied ? `✓ ${copiedLabel}` : copyLabel}
          </button>
        </div>
      </div>
    </Banner>
  );
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 };
const row: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const field: CSSProperties = {
  flex: '1 1 18rem',
  minWidth: 0,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: fs.small,
  padding: '5px 8px',
  border: `1px solid ${color.borderStrong}`,
  borderRadius: radius.control,
  background: color.surface,
  color: color.ink,
};
const btn: CSSProperties = {
  fontFamily: "system-ui, 'Segoe UI', sans-serif",
  lineHeight: 1.4,
  fontSize: fs.body,
  padding: '5px 12px',
  border: '1px solid',
  borderRadius: radius.control,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontWeight: 600,
};
const primaryBtn: CSSProperties = { background: color.primary, borderColor: color.primary, color: '#fff' };
const okBtn: CSSProperties = { background: color.okSoft, borderColor: color.okBorder, color: color.ok };
