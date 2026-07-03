/**
 * A small, dependency-free modal overlay (Phase-1 UX).
 *
 * Centered card over a dimmed backdrop; closes on backdrop click or Escape. It
 * inherits the document's `dir` (RTL Hebrew), so content lays out right-to-left.
 * Used for the "what is this?" intro and the help guide.
 *
 * A11y (F6): the dialog takes INITIAL FOCUS on open (the auto-opening intro used to leave focus in the
 * input behind it — a keyboard/screen-reader student was interacting with a page they couldn't see),
 * TRAPS Tab inside itself, is labelled by its title, and RESTORES focus to the opener on close.
 */
import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, footer, width = 540 }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    // remember the opener, take initial focus, and restore on close
    const opener = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && cardRef.current) {
        // keep Tab cycling INSIDE the dialog (a11y focus trap)
        const focusables = [...cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === cardRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div style={backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div ref={cardRef} tabIndex={-1} style={{ ...card, maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div style={head}>
          <div id={titleId} style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="close">
            ×
          </button>
        </div>
        <div style={body}>{children}</div>
        {footer && <div style={foot}>{footer}</div>}
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 100,
};
const card: React.CSSProperties = {
  width: '100%',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  background: '#fff',
  color: '#0f172a',
  borderRadius: 12,
  boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
  overflow: 'hidden',
  outline: 'none',
};
const head: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '14px 18px',
  borderBottom: '1px solid #e2e8f0',
};
const body: React.CSSProperties = { padding: 18, overflowY: 'auto', fontSize: 14, lineHeight: 1.6 };
const foot: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '12px 18px',
  borderTop: '1px solid #e2e8f0',
};
const closeBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 24,
  lineHeight: 1,
  color: '#64748b',
  cursor: 'pointer',
  padding: '0 4px',
};
